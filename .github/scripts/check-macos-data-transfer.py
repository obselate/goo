#!/usr/bin/env python3
import os
from pathlib import Path
import subprocess
import sys
import time

application = Path(sys.argv[1]).resolve()
output = Path(sys.argv[2]).resolve()
output.mkdir(parents=True, exist_ok=True)
peer = output / "macos-data-transfer-peer"
source = Path(__file__).resolve().parents[2] / "tests/NativeWindow/macos_data_transfer_peer.m"
subprocess.run([
    "nice", "-n", "10", "clang", "-fobjc-arc", "-mmacosx-version-min=14.0", "-Wall", "-Wextra", "-Werror",
    "-Wno-deprecated-declarations", "-framework", "Cocoa", "-framework", "CoreGraphics", "-framework", "CoreServices",
    str(source), "-o", str(peer),
], check=True)
png = application.parent / "local-rgba.png"
if not png.is_file():
    raise RuntimeError("The native PNG fixture is missing")


def start_fixture(executable, arguments, prefix, environment):
    with prefix.with_suffix(".stdout").open("w") as stdout, prefix.with_suffix(".stderr").open("w") as stderr:
        process = subprocess.Popen([str(executable), *map(str, arguments)], stdout=stdout, stderr=stderr, env=environment)
    deadline = time.monotonic() + 20
    while time.monotonic() < deadline:
        if "ready" in prefix.with_suffix(".stdout").read_text():
            return process
        if process.poll() is not None:
            raise RuntimeError(f"Fixture exited before ready: {prefix}\n{prefix.with_suffix('.stderr').read_text()}")
        time.sleep(0.05)
    process.kill()
    process.wait()
    raise RuntimeError(f"Fixture did not become ready: {prefix}")


cases = [
    ("out-copy", "source", 1, "mime", False, False),
    ("out-move", "source", 2, "mime", False, False),
    ("in-copy", "target", 1, "mime", False, False),
    ("in-move", "target", 2, "mime", False, False),
    ("final-reject", "target", 2, "mime", True, False),
    ("source-close", "source", 1, "mime", False, True),
    ("legacy-files", "target", 1, "legacy", False, False),
    ("in-files-copy", "target", 1, "files", False, False),
    ("in-files-move", "target", 2, "files", False, False),
    ("out-files-copy", "source", 1, "files", False, False),
    ("out-files-move", "source", 2, "files", False, False),
]
for name, role, effect, kind, reject, cancel in cases:
    directory = output / name
    directory.mkdir(parents=True, exist_ok=True)
    for index in range(2):
        (directory / f"source-{index}.txt").write_text(f"native file {index}")
    title = f"goo-transfer-{os.getpid()}-{name}"
    environment = os.environ | {
        "GOO_NATIVE_TRANSFER_SMOKE": "1", "GOO_TRANSFER_TITLE": title,
        "GOO_TRANSFER_DIRECTORY": str(directory), "GOO_TRANSFER_ROLE": role,
        "GOO_TRANSFER_EFFECT": str(effect), "GOO_TRANSFER_KIND": kind,
        "GOO_TRANSFER_REJECT": "1" if reject else "0", "GOO_TRANSFER_CANCEL": "1" if cancel else "0",
    }
    goo = native = None
    try:
        goo = start_fixture(application, [], directory / "goo", environment)
        peer_role = "target" if role == "source" else "source"
        native = start_fixture(peer, [peer_role, f"native-{title}", effect, kind, directory, png], directory / "peer", os.environ)
        source_pid, target_pid = (goo.pid, native.pid) if role == "source" else (native.pid, goo.pid)
        gesture = subprocess.run([str(peer), "input", str(source_pid), str(target_pid), "1200" if cancel else "250"],
            capture_output=True, text=True, timeout=15)
        (directory / "input.stdout").write_text(gesture.stdout)
        (directory / "input.stderr").write_text(gesture.stderr)
        gesture.check_returncode()
        if reject:
            native.wait(timeout=15)
            subprocess.run([str(peer), "close", str(goo.pid)], check=True)
        if cancel:
            subprocess.run([str(peer), "close", str(native.pid)], check=True)
        if goo.wait(timeout=15) or native.wait(timeout=15):
            raise RuntimeError("A native transfer process failed")
        goo_output = (directory / "goo.stdout").read_text()
        native_output = (directory / "peer.stdout").read_text()
        if "transfer-pass" not in goo_output:
            raise RuntimeError("Goo transfer result is missing")
        if role == "target":
            expected = "source-end 1 0 0" if reject else f"source-end 0 {effect} "
            if expected not in native_output:
                raise RuntimeError(f"Native source result changed: {native_output}")
        elif not cancel and f"drop-complete {effect}" not in native_output:
            raise RuntimeError("Native target result is missing")
        print(f"native-transfer: {name} passed", flush=True)
    except Exception:
        for path in sorted(directory.glob("*.stdout")) + sorted(directory.glob("*.stderr")):
            print(f"{path.name}\n{path.read_text()}", file=sys.stderr)
        raise
    finally:
        for process in (goo, native):
            if process and process.poll() is None:
                process.kill()
                process.wait()
