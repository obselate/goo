import asyncio
import base64
import json
import os
import signal
import subprocess
import tempfile
import time
from pathlib import Path

from mcp import ClientSession, StdioServerParameters
from mcp.client.stdio import stdio_client

ROOT = Path(__file__).resolve().parents[1]


async def main():
    output = Path(tempfile.mkdtemp(prefix="goo-agent-e2e-"))
    print(f"Evidence: {output}", flush=True)
    runtime = output / "runtime"
    runtime.mkdir()
    env = dict(os.environ, GOO_DEVTOOLS_DIR=str(runtime), GOO_DEVTOOLS="1")
    parameters = StdioServerParameters(command="uv", args=["run", "--project", str(ROOT), "--locked", "python", str(ROOT / "scripts/server.py")], env=env)
    async with stdio_client(parameters) as streams:
        async with ClientSession(*streams) as session:
            await session.initialize()
            names = {tool.name for tool in (await session.list_tools()).tools}
            assert names == {"goo_context", "goo_search", "goo_read", "goo_starter", "goo_snapshot", "goo_capture"}, names

            async def call(name, args):
                response = await session.call_tool(name, args)
                assert not response.isError, response
                return response

            context = await call("goo_context", {})
            (output / "context.json").write_text(context.model_dump_json(indent=2))
            search = await call("goo_search", {"query": "Cell Rebuild"})
            assert "cell.md" in search.model_dump_json(), search
            await call("goo_read", {"path": "docs/api/cell.md", "count": 25})
            rejected = await session.call_tool("goo_read", {"path": "../../.ssh/id_rsa"})
            assert rejected.isError
            starter = await call("goo_starter", {"name": "AgentProbe"})
            data = starter.structuredContent
            if data is None:
                data = json.loads(starter.content[0].text)
            app = output / "app"
            app.mkdir()
            for name, text in data["files"].items():
                (app / name).write_text(text)
            build = subprocess.run(["dotnet", "build", str(app / "AgentProbe.gsproj"), "--nologo"], capture_output=True, text=True, timeout=180)
            (output / "build.log").write_text(build.stdout + build.stderr)
            assert build.returncode == 0, build.stdout + build.stderr
            print("MCP initialization, API lookup, path rejection and starter build passed", flush=True)
            with (output / "watch.log").open("w") as log:
                process = subprocess.Popen(["dotnet", "watch", "--project", str(app / "AgentProbe.gsproj"), "--non-interactive"], stdout=log, stderr=subprocess.STDOUT, env=env, start_new_session=True)
                try:
                    deadline = time.monotonic() + 90
                    descriptor = None
                    while time.monotonic() < deadline:
                        assert process.poll() is None, (output / "watch.log").read_text()
                        for path in runtime.glob("*.json"):
                            try:
                                descriptor = json.loads(path.read_text(encoding="utf-8-sig"))
                            except json.JSONDecodeError:
                                continue
                        if descriptor:
                            break
                        await asyncio.sleep(0.25)
                    assert descriptor, (output / "watch.log").read_text()
                    pid = descriptor["pid"]
                    snapshot = await call("goo_snapshot", {"pid": pid})
                    before = snapshot.model_dump_json(indent=2)
                    (output / "before.json").write_text(before)
                    assert "Count" in before, before[:3000]
                    capture = await call("goo_capture", {"pid": pid})
                    png = next(item for item in capture.content if item.type == "image")
                    (output / "before.png").write_bytes(base64.b64decode(png.data))
                    program = app / "Program.gs"
                    program.write_text(program.read_text().replace('Title: "Count"', 'Title: "Total"'))
                    deadline = time.monotonic() + 8
                    while time.monotonic() < deadline:
                        await asyncio.sleep(1)
                        after = (await call("goo_snapshot", {"pid": pid})).model_dump_json(indent=2)
                        if "Total" in after:
                            break
                    automatic = "Total" in after
                    assert "applied 1 method update(s)" in (output / "watch.log").read_text()
                    (output / "after.json").write_text(after)
                    capture = await call("goo_capture", {"pid": pid})
                    png = next(item for item in capture.content if item.type == "image")
                    (output / "after.png").write_bytes(base64.b64decode(png.data))
                    program.write_text(program.read_text() + '\nfunc AddedMember() int32 -> 7\n')
                    deadline = time.monotonic() + 20
                    while time.monotonic() < deadline and "GSHR1001" not in (output / "watch.log").read_text():
                        await asyncio.sleep(0.5)
                    assert "GSHR1001" in (output / "watch.log").read_text()
                    result = {"pid": pid, "methodDeltaApplied": True, "automaticUiRefresh": automatic, "structuralEdit": "GSHR1001", "tools": sorted(names)}
                    (output / "result.json").write_text(json.dumps(result, indent=2))
                    print(json.dumps(result), flush=True)
                finally:
                    if process.poll() is None:
                        os.killpg(process.pid, signal.SIGTERM)
                        try:
                            process.wait(timeout=8)
                        except subprocess.TimeoutExpired:
                            os.killpg(process.pid, signal.SIGKILL)
                            process.wait()

            clean = subprocess.run(["dotnet", "clean", str(app / "AgentProbe.gsproj"), "--nologo"], capture_output=True, text=True, timeout=60)
            assert clean.returncode == 0, clean.stdout + clean.stderr
            for path in runtime.glob("*.json"):
                path.unlink()
            with (output / "restart-watch.log").open("w") as log:
                process = subprocess.Popen(["dotnet", "watch", "--no-hot-reload", "--project", str(app / "AgentProbe.gsproj"), "--non-interactive"], stdout=log, stderr=subprocess.STDOUT, env=env, start_new_session=True)
                try:
                    async def wait_pid(previous=0):
                        deadline = time.monotonic() + 60
                        while time.monotonic() < deadline:
                            for path in runtime.glob("*.json"):
                                try:
                                    found = json.loads(path.read_text(encoding="utf-8-sig"))["pid"]
                                    os.kill(found, 0)
                                    if found != previous:
                                        return found
                                except (OSError, ValueError):
                                    pass
                            await asyncio.sleep(0.25)
                        raise AssertionError((output / "restart-watch.log").read_text())
                    first_pid = await wait_pid()
                    program.write_text(program.read_text().replace('Title: "Total"', 'Title: "Restarted"'))
                    restarted_pid = await wait_pid(first_pid)
                    after = (await call("goo_snapshot", {"pid": restarted_pid})).model_dump_json(indent=2)
                    assert "Restarted" in after, after[:1000]
                    (output / "restarted.json").write_text(after)
                    capture = await call("goo_capture", {"pid": restarted_pid})
                    png = next(item for item in capture.content if item.type == "image")
                    (output / "restarted.png").write_bytes(base64.b64decode(png.data))
                    result.update(restartOnEdit=True, restartPids=[first_pid, restarted_pid], passed=True)
                    (output / "result.json").write_text(json.dumps(result, indent=2))
                    print(json.dumps(result), flush=True)
                finally:
                    if process.poll() is None:
                        os.killpg(process.pid, signal.SIGTERM)
                        try:
                            process.wait(timeout=8)
                        except subprocess.TimeoutExpired:
                            os.killpg(process.pid, signal.SIGKILL)
                            process.wait()


if __name__ == "__main__":
    asyncio.run(main())
