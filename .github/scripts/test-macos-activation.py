import os
from pathlib import Path
import signal
import subprocess
import sys
import time

app = Path(sys.argv[1]).resolve()
results = Path(sys.argv[2]).resolve()
results.mkdir(parents=True)
one = results / "one document.gooactivation"
two = results / "two document.gooactivation"
one.write_text("one", encoding="utf-8")
two.write_text("two", encoding="utf-8")


def wait_for(name):
    deadline = time.monotonic() + 45
    while time.monotonic() < deadline:
        error = results / "error.txt"
        if error.exists():
            raise RuntimeError(error.read_text(encoding="utf-8"))
        marker = results / name
        if marker.exists():
            if marker.read_text(encoding="utf-8") != "passed":
                raise RuntimeError(f"Unexpected activation result: {name}")
            return
        time.sleep(0.05)
    raise TimeoutError(f"Native activation did not complete: {name}")


try:
    subprocess.run(
        ["open", "-n", "-a", str(app), "goo-activation-smoke://cold", "--args",
         "--application-activation-smoke", str(results)],
        check=True, timeout=15,
    )
    wait_for("cold.txt")
    subprocess.run(["open", "-a", str(app), "goo-activation-smoke://warm"], check=True, timeout=15)
    wait_for("warm.txt")
    subprocess.run(["open", "-a", str(app), str(one), str(two)], check=True, timeout=15)
    wait_for("documents.txt")
    wait_for("passed.txt")
    print("macOS activation: cold URI, warm URI and document batch passed")
finally:
    pid_file = results / "pid.txt"
    if not (results / "passed.txt").exists() and pid_file.exists():
        pid = int(pid_file.read_text(encoding="utf-8"))
        command = subprocess.run(
            ["ps", "-p", str(pid), "-o", "command="], capture_output=True, text=True, check=False,
        ).stdout
        if str(app / "Contents/MacOS/Goo.PackageSmoke") in command:
            try:
                os.kill(pid, signal.SIGTERM)
            except ProcessLookupError:
                pass
