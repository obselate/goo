import os
from pathlib import Path
import re
import subprocess
import sys
import time
import uuid

program = Path(sys.argv[1]).resolve(strict=True)
root = Path(sys.argv[2]).resolve()
root.mkdir(parents=True)
identity = "org.goo.token." + uuid.uuid4().hex
environment = os.environ.copy()
environment.pop("XDG_ACTIVATION_TOKEN", None)
environment["GOO_ACTIVATION_NATIVE_WINDOW"] = "1"
environment["WAYLAND_DEBUG"] = "client"
command = ["dotnet", str(program)] if program.suffix == ".dll" else [str(program)]


def wait_for(name):
    deadline = time.monotonic() + 30
    while time.monotonic() < deadline:
        if (root / "error").exists():
            raise RuntimeError((root / "error").read_text(encoding="utf-8"))
        path = root / name
        if path.exists():
            return path
        if primary.poll() is not None:
            raise RuntimeError(f"Native receiver exited {primary.returncode}")
        time.sleep(0.02)
    raise TimeoutError(name)


with (root / "native.log").open("w", encoding="utf-8") as log:
    primary = subprocess.Popen(command + ["activated", identity, str(root)], env=environment,
                               stdout=log, stderr=subprocess.STDOUT)
    try:
        wait_for("1.event")
        for index, token in enumerate(("goo-native-token-one", "goo-native-token-two"), 2):
            forwarded = environment.copy()
            forwarded["XDG_ACTIVATION_TOKEN"] = token
            subprocess.run(command + ["activated", identity, str(root), "--goo-open-uri",
                                      f"goo-token-test://route/{index}"],
                           env=forwarded, check=True, timeout=15, stdout=log, stderr=subprocess.STDOUT)
            actual = wait_for(f"{index}.event").read_text(encoding="utf-8").splitlines()
            if actual != ["OpenUri", "warm", f"goo-token-test://route/{index}"]:
                raise RuntimeError(f"Native token activation changed: {actual}")
        (root / "stop").touch()
        primary.wait(timeout=15)
        if primary.returncode != 0:
            raise RuntimeError(f"Native receiver exited {primary.returncode}")
    except BaseException:
        log.flush()
        print((root / "native.log").read_text(encoding="utf-8"), file=sys.stderr)
        raise
    finally:
        if primary.poll() is None:
            primary.kill()
            primary.wait(timeout=10)

trace = (root / "native.log").read_text(encoding="utf-8")
for token in ("goo-native-token-one", "goo-native-token-two"):
    if not re.search(r'xdg_activation_v1[#@]\d+\.activate\("' + token + r'", wl_surface[#@]\d+\)', trace):
        print(trace, file=sys.stderr)
        raise RuntimeError(f"Wayland did not receive token {token}. See {root / 'native.log'}")
print("Wayland activation: forwarded tokens reached the compositor on the owner-selected window")
