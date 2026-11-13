#!/usr/bin/env python3
import os
from pathlib import Path
import subprocess
import sys
import tempfile
import time


def wait_for(predicate, process, message):
    deadline = time.monotonic() + 15
    while not predicate():
        if process.poll() is not None:
            raise RuntimeError(f"{message}: process exited with {process.returncode}")
        if time.monotonic() >= deadline:
            raise RuntimeError(message)
        time.sleep(0.02)


def close_window(root, title):
    script = root / (title.replace(" ", "-") + ".js")
    script.write_text("function close(window) { "
                      f"if (window.caption.indexOf('{title}') === 0) window.closeWindow() "
                      "} (workspace.windowAdded || workspace.clientAdded).connect(close); "
                      "const windows = workspace.windowList ? workspace.windowList() : workspace.clientList(); "
                      "for (const window of windows) close(window)")
    subprocess.run([
        "gdbus", "call", "--session", "--dest", "org.kde.KWin", "--object-path", "/Scripting",
        "--method", "org.kde.kwin.Scripting.loadScript", str(script),
    ], check=True)
    subprocess.run(["gdbus", "call", "--session", "--dest", "org.kde.KWin",
                    "--object-path", "/Scripting",
                    "--method", "org.kde.kwin.Scripting.start"], check=True)


def check(program, root, mode):
    directory = root / mode
    directory.mkdir()
    environment = dict(os.environ, SDL_VIDEODRIVER="wayland")
    with (directory / "process.log").open("w+") as log:
        process = subprocess.Popen(["dotnet", program, "native-close", "org.goo.native-close",
                                    f"--output={directory}", mode], env=environment,
                                   stdout=log, stderr=log)
        try:
            wait_for(lambda: (directory / "ready").exists(), process, f"{mode}: not ready")
            close_window(directory, f"Goo close {mode} child")
            if mode in ("visible", "tray"):
                wait_for(lambda: (directory / "child.closed").exists(), process,
                         f"{mode}: owned close did not leave main open")
                time.sleep(0.5)
                if process.poll() is not None or (directory / "exited").exists():
                    raise RuntimeError(f"{mode}: owned close ended Run")
                if mode == "visible":
                    print("native-close owned: passed", flush=True)
                    close_window(directory, f"Goo close {mode} main")
                else:
                    (directory / "stop").touch()
            process.wait(timeout=15)
            if process.returncode != 0:
                raise RuntimeError(f"{mode}: exit {process.returncode}")
            state = (directory / "exited").read_text()
            expected = "False,False,1"
            if state != expected:
                raise RuntimeError(f"{mode}: expected {expected}, got {state}")
            print(f"native-close {'all-windows' if mode == 'visible' else mode}: passed", flush=True)
        except Exception:
            log.seek(0)
            print(log.read(), file=sys.stderr)
            raise
        finally:
            if process.poll() is None:
                process.kill()
            process.wait()


with tempfile.TemporaryDirectory(prefix="native-close-", dir=os.environ["XDG_RUNTIME_DIR"]) as work:
    failures = []
    subprocess.run(["dotnet", str(Path(sys.argv[1]).resolve()), "async-close",
                    "org.goo.async-close", f"--output={work}"], check=True, timeout=30)
    for case in ("visible", "tray", "hidden"):
        try:
            check(str(Path(sys.argv[1]).resolve()), Path(work), case)
        except Exception as error:
            failures.append(str(error))
    if failures:
        raise RuntimeError("\n".join(failures))
