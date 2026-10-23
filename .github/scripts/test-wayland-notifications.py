import os
from pathlib import Path
import subprocess
import sys
import time

program = Path(sys.argv[1]).resolve(strict=True)
root = Path(sys.argv[2]).resolve()
root.mkdir(parents=True)
environment = os.environ.copy()
for key, folder in (("XDG_CACHE_HOME", "cache"), ("XDG_CONFIG_HOME", "config"), ("XDG_DATA_HOME", "data")):
    directory = root / folder
    directory.mkdir(exist_ok=True)
    environment[key] = str(directory)
command = ["dotnet", str(program)] if program.suffix == ".dll" else [str(program)]

with (
    (root / "mako.log").open("w", encoding="utf-8") as daemon_log,
    (root / "smoke.log").open("w", encoding="utf-8") as log,
):
    daemon = subprocess.Popen(["mako", "--config", "/dev/null"], env=environment,
                              stdout=daemon_log, stderr=subprocess.STDOUT)
    child = None
    try:
        deadline = time.monotonic() + 15
        while time.monotonic() < deadline:
            if daemon.poll() is not None:
                raise RuntimeError("The native Wayland notification daemon exited")
            ready = subprocess.run(["makoctl", "list"], env=environment, capture_output=True, timeout=3)
            if ready.returncode == 0:
                break
            time.sleep(0.05)
        else:
            raise TimeoutError("The native notification daemon did not acquire its D-Bus service")
        child = subprocess.Popen(command + ["linux", str(root)], env=environment, stdout=log, stderr=subprocess.STDOUT)
        deadline = time.monotonic() + 40
        while not (root / "ready").exists():
            if child.poll() is not None:
                raise RuntimeError(f"Notification proof exited {child.returncode}")
            if time.monotonic() >= deadline:
                raise TimeoutError("Native notification submission timed out")
            time.sleep(0.02)
        subprocess.run(["makoctl", "invoke", "default"], env=environment, check=True, timeout=10)
        child.wait(timeout=40)
        if child.returncode != 0:
            raise RuntimeError(f"Notification proof exited {child.returncode}")
        log.flush()
        print((root / "smoke.log").read_text(encoding="utf-8"))
        print("Wayland notifications: native replacement, action, UI-thread activation and removal passed")
    except BaseException:
        log.flush()
        daemon_log.flush()
        print((root / "mako.log").read_text(encoding="utf-8"), file=sys.stderr)
        print((root / "smoke.log").read_text(encoding="utf-8"), file=sys.stderr)
        raise
    finally:
        if child is not None and child.poll() is None:
            child.kill()
            child.wait(timeout=10)
        daemon.terminate()
        try:
            daemon.wait(timeout=10)
        except subprocess.TimeoutExpired:
            daemon.kill()
            daemon.wait(timeout=10)
