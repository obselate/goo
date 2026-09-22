import asyncio
import base64
import json
import os
import subprocess
import tempfile
import time
from pathlib import Path

from mcp import ClientSession, StdioServerParameters
from mcp.client.stdio import stdio_client

ROOT = Path(__file__).resolve().parents[1]


def data(result):
    return result.structuredContent or json.loads(result.content[0].text)


async def main():
    output = Path(tempfile.mkdtemp(prefix="goo-agent-e2e-"))
    print(f"Evidence: {output}", flush=True)
    app = output / "app"
    runtime = app / ".goo/devtools"
    runtime.mkdir(parents=True)
    env = dict(os.environ, GOO_DEVTOOLS_DIR=str(output / "unused-runtime"),
               UV_PROJECT_ENVIRONMENT=str(output / "runtime-venv"))
    parameters = StdioServerParameters(command="uv", args=["run", "--project", str(ROOT), "--locked", "python", str(ROOT / "scripts/server.py")], env=env)
    async with stdio_client(parameters) as streams:
        async with ClientSession(*streams) as session:
            await session.initialize()
            tools = {tool.name: tool for tool in (await session.list_tools()).tools}
            mutations = {"goo_input", "goo_inspect", "goo_style_override", "goo_style_reset"}
            assert set(tools) == {"goo_context", "goo_search", "goo_read", "goo_starter", "goo_targets", "goo_capabilities",
                                  "goo_snapshot", "goo_capture", *mutations}, tools
            assert all(not tools[name].annotations.readOnlyHint and not tools[name].annotations.idempotentHint for name in mutations)
            assert all(tool.annotations.readOnlyHint for name, tool in tools.items() if name not in mutations)

            async def call(tool_name, **args):
                result = await session.call_tool(tool_name, args)
                assert not result.isError, result
                return result

            async def rejected(name, **args):
                result = await session.call_tool(name, args)
                assert result.isError, result
                return result

            context = await call("goo_context")
            (output / "context.json").write_text(context.model_dump_json(indent=2))
            bundled = data(context)
            assert bundled["provenance"]["kind"] == "bundle"
            assert bundled["preflight"]["configuration"]["configured"], bundled["preflight"]["configuration"]
            assert bundled["provenance"]["revision"] == bundled["bundleCommit"]
            assert len(bundled["provenance"]["compilerCommit"]) == 40
            search = data(await call("goo_search", query="how do I rebuild a cell"))
            assert search["mode"] == "exact" and search["queryTerms"] == ["rebuild", "cell"], search
            assert search["results"][0]["path"] == "docs/api/cell.md" and len(search["results"][0]["sha256"]) == 64, search
            missing = data(await call("goo_search", query="QuantumBananaTeleportation"))
            assert missing["mode"] == "none" and missing["total"] == 0 and missing["results"] == []
            await call("goo_read", path="docs/api/cell.md", count=25)
            await rejected("goo_read", path="../../.ssh/id_rsa")

            checkout = output / "checkout"
            (checkout / "Goo").mkdir(parents=True)
            (checkout / "Goo/Goo.gsproj").touch()
            (checkout / "docs/api").mkdir(parents=True)
            fresh = checkout / "docs/api/new-api.md"
            fresh.write_text("# Newly added API\n\n## Probe\n\nAgentFreshDocument\n")
            repository = str(checkout)
            assert data(await call("goo_context", repository=repository))["documents"] == ["docs/api/new-api.md"]
            current = data(await call("goo_context", repository=repository))
            assert current["provenance"]["kind"] == "checkout"
            assert data(await call("goo_search", query="how do I find AgentFreshDocument", repository=repository))["total"] == 1
            assert "AgentFreshDocument" in data(await call("goo_read", path="docs/api/new-api.md", repository=repository))["text"]
            fresh.unlink()
            assert data(await call("goo_search", query="AgentFreshDocument", repository=repository))["total"] == 0

            starter = data(await call("goo_starter", name="AgentProbe"))
            assert "--no-watch" in starter["run"]
            assert starter["build"] == "dotnet build AgentProbe.gsproj -c Release --nologo -warnaserror"
            assert starter["lint"] == "unavailable"
            assert set(starter["provenance"]["sourceFiles"]) == {
                "templates/Goo.Templates/content/Program.gs",
                "templates/Goo.Templates/content/GooStarter.gsproj",
            }
            assert set(starter["provenance"]["generatedFiles"]) == {"Program.gs", "AgentProbe.gsproj"}
            for name, content in starter["files"].items():
                (app / name).write_text(content)
            build = subprocess.run(["dotnet", "build", str(app / "AgentProbe.gsproj"), "-c", "Release", "--nologo", "-warnaserror"], capture_output=True, text=True, timeout=180)
            (output / "build.log").write_text(build.stdout + build.stderr)
            assert build.returncode == 0, build.stdout + build.stderr
            print("MCP tools, current-checkout discovery, path rejection and starter build passed", flush=True)

            for enabled in (False, True):
                label = "input-enabled" if enabled else "inspection-only"
                app_env = dict(env, GOO_DEVTOOLS="1", GOO_DEVTOOLS_INPUT="1" if enabled else "0", GOO_DEVTOOLS_DIR=str(runtime))
                with (output / f"{label}.log").open("w") as log:
                    process = subprocess.Popen(["dotnet", str(app / "bin/Release/net10.0/AgentProbe.dll")], stdout=log, stderr=subprocess.STDOUT, env=app_env)
                    try:
                        deadline = time.monotonic() + 30
                        while time.monotonic() < deadline:
                            assert process.poll() is None, (output / f"{label}.log").read_text()
                            targets = data(await call("goo_targets", pid=process.pid, project=str(app)))["targets"]
                            if targets:
                                break
                            await asyncio.sleep(0.25)
                        assert len(targets) == 1, targets
                        target = dict(pid=process.pid, window=targets[0]["window"], project=str(app))
                        assert target["window"]

                        async def snapshot():
                            result = data(await call("goo_snapshot", **target))
                            assert result["ok"] and result["payload"]["full"], result
                            return result["payload"]

                        before = await snapshot()
                        again = await snapshot()
                        assert before["added"] and {node["id"] for node in before["added"]} == {node["id"] for node in again["added"]}
                        assert any(node["content"] == "Count: 0" for node in before["added"]), before
                        button = next(node["id"] for node in before["added"] if node["kind"] == "Button")
                        (output / f"{label}-before.json").write_text(json.dumps(before, indent=2))
                        if not enabled:
                            error = await rejected("goo_input", **target, event="click", node_id=button)
                            assert "does not permit input" in error.model_dump_json(), error
                            assert any(node["content"] == "Count: 0" for node in (await snapshot())["added"])
                        else:
                            await rejected("goo_input", **dict(target, pid=0), event="click", node_id=button)
                            error = await rejected("goo_input", **target, event="click", node_id=9223372036854775807)
                            assert "stale-target" in error.model_dump_json(), error
                            await rejected("goo_input", **target, event="not-an-event")
                            captured = await call("goo_capture", **target)
                            png = next(item for item in captured.content if item.type == "image")
                            (output / "before.png").write_bytes(base64.b64decode(png.data))

                            for event in ("click", "pointer.down", "pointer.up", "key.down", "key.up"):
                                args = {"key": "Space"} if event.startswith("key.") else {"node_id": button}
                                applied = data(await call("goo_input", **target, event=event, **args))
                                assert applied["ok"] and applied["payload"]["applied"], applied
                            after = await snapshot()
                            assert any(node["content"] == "Count: 3" for node in after["added"]), after
                            assert any(node["id"] == button and node["kind"] == "Button" for node in after["added"]), after
                            await call("goo_input", **target, event="pointer.cancel")
                            await call("goo_input", **target, event="reset")
                            after = await snapshot()
                            assert not any(node["focused"] or node["pressed"] for node in after["added"]), after
                            (output / "after.json").write_text(json.dumps(after, indent=2))
                            captured = await call("goo_capture", **target)
                            png = next(item for item in captured.content if item.type == "image")
                            pixels = base64.b64decode(png.data)
                            assert pixels.startswith(b"\x89PNG\r\n\x1a\n")
                            assert pixels != (output / "before.png").read_bytes()
                            (output / "after.png").write_bytes(pixels)
                    finally:
                        if process.poll() is None:
                            process.terminate()
                            try:
                                process.wait(timeout=8)
                            except subprocess.TimeoutExpired:
                                process.kill()
                                process.wait()
                    assert data(await call("goo_targets", pid=process.pid, project=str(app)))["targets"] == []
                    print(f"{label} passed", flush=True)
            result = dict(passed=True, tools=sorted(tools), fullSnapshots=True, stableNodeIds=True,
                          projectLocalDiscovery=True, inputPermission=True, clickPointerKeyboard=True, capture=True)
            (output / "result.json").write_text(json.dumps(result, indent=2))
            print(json.dumps(result), flush=True)


if __name__ == "__main__":
    asyncio.run(main())
