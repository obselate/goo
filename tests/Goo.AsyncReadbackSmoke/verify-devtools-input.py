#!/usr/bin/env python3
"""Exercise a native smoke window exclusively through the public DevTools CLI."""
import argparse
import json
import os
from pathlib import Path
import subprocess
import tempfile

parser = argparse.ArgumentParser()
parser.add_argument("--output", type=Path, required=True)
args = parser.parse_args()
root = Path(__file__).resolve().parents[2]
output = args.output.resolve()
output.mkdir(parents=True, exist_ok=True)
cli = root / "tools/Goo.DevTools.Cli/bin/Release/net10.0/Goo.DevTools.Cli.dll"
app = root / "tests/Goo.AsyncReadbackSmoke/bin/Release/net10.0/Goo.AsyncReadbackSmoke.dll"
transcript = []
with tempfile.TemporaryDirectory(prefix="goo-input-") as temporary:
    done = Path(temporary) / "done"
    env = dict(os.environ, GOO_DEVTOOLS="1", GOO_DEVTOOLS_INPUT="1", GOO_DEVTOOLS_INPUT_SMOKE="1",
               GOO_DEVTOOLS_INPUT_DONE=str(done), GOO_DEVTOOLS_DIR=temporary)
    with (output / "native.log").open("w") as log:
        app_process = subprocess.Popen(["dotnet", str(app)], cwd=app.parent, env=env, stdout=log, stderr=subprocess.STDOUT)
        try:
            def run(*arguments, expected=0):
                command = ["dotnet", str(cli), *map(str, arguments), "--pid", str(app_process.pid), "--wait", "10"]
                result = subprocess.run(command, env=env, cwd=root, capture_output=True, text=True, timeout=15)
                transcript.append(dict(arguments=arguments, exitCode=result.returncode, stdout=result.stdout, stderr=result.stderr))
                assert result.returncode == expected, transcript[-1]
                return result.stdout

            def snapshot():
                lines = run("attach", "--once", "--json", "--payload", '{"full":true}').splitlines()
                response = next(json.loads(line) for line in lines if json.loads(line).get("type") == "response")
                payload = response["payload"]
                assert response["ok"] and payload["full"], response
                return {node["key"]: node for node in payload["added"] if node["key"]}, payload

            def send(event, *arguments):
                forwarded = (*arguments, *(["--gesture", gesture[0]] if gesture[0] else []))
                response = json.loads(run("input", event, *forwarded, "--json").strip())
                assert response["ok"] and response["payload"]["applied"], response
                payload = response["payload"]
                gesture[0] = payload.get("gestureId") if payload.get("gestureActive") else None

            gesture = [None]
            nodes, initial = snapshot()
            (output / "before.json").write_text(json.dumps(initial, indent=2))
            run("capture", "--output", str(output / "before.png"))
            send("click", "--node", nodes["button"]["id"])
            after, payload = snapshot()
            assert any(node["content"] == "Activated 1" for node in payload["added"]), payload
            send("click", "--node", nodes["entry"]["id"])
            send("text", "--text", "hello")
            send("key.down", "--key", "Backspace")
            send("key.up", "--key", "Backspace")
            after, _ = snapshot()
            assert after["value"]["content"] == "Committed: hell", after["value"]
            handle = nodes["resize"]["borderBox"]
            x, y = handle["x"] + handle["width"] / 2, handle["y"] + 20
            send("pointer.down", "--node", nodes["resize"]["id"])
            send("pointer.move", "--x", x + 80, "--y", y)
            send("pointer.up", "--x", x + 80, "--y", y)
            after, _ = snapshot()
            assert after["column"]["borderBox"]["width"] == 240, after["column"]
            send("pointer.down", "--node", after["resize"]["id"])
            send("pointer.cancel")
            send("pointer.move", "--x", x + 150, "--y", y)
            after, _ = snapshot()
            assert after["column"]["borderBox"]["width"] == 240, after["column"]
            send("wheel", "--node", nodes["scroll"]["id"], "--delta-y", "-80")
            after, _ = snapshot()
            assert after["scroll"]["scrollOffset"]["y"] > 0, after["scroll"]
            # Drag the actual native Goo scrollbar thumb after restoring the top.
            send("wheel", "--node", nodes["scroll"]["id"], "--delta-y", "10000")
            after, _ = snapshot()
            scroll = after["scroll"]["borderBox"]
            sx, sy = scroll["x"] + scroll["width"] - 5, scroll["y"] + 8
            send("pointer.down", "--x", sx, "--y", sy)
            send("pointer.move", "--x", sx, "--y", sy + 65)
            send("pointer.up", "--x", sx, "--y", sy + 65)
            after, final = snapshot()
            assert after["scroll"]["scrollOffset"]["y"] > 0, after["scroll"]
            (output / "after.json").write_text(json.dumps(final, indent=2))
            run("capture", "--output", str(output / "after.png"))
            print("devtools-input: button/text/key/column-drag/cancel/wheel/scrollbar/snapshot/capture=pass")
        finally:
            (output / "commands.json").write_text(json.dumps(transcript, indent=2))
            done.touch()
            try:
                app_process.wait(timeout=10)
            except subprocess.TimeoutExpired:
                app_process.terminate()
                app_process.wait(timeout=5)
        assert app_process.returncode == 0, f"Native smoke exited {app_process.returncode}"
