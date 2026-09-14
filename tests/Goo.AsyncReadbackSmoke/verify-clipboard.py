#!/usr/bin/env python3
"""Exercise external clipboard transfers in a separate nested KWin session."""
import json
import os
from pathlib import Path
import signal
import struct
import subprocess
import tempfile
import time

root = Path(__file__).resolve().parents[2]
evidence = root / "artifacts/issues-50-60/clipboard"
evidence.mkdir(parents=True, exist_ok=True)
parent = Path(os.environ["WAYLAND_DISPLAY"])
if not parent.is_absolute():
    parent = Path(os.environ["XDG_RUNTIME_DIR"]) / parent

with tempfile.TemporaryDirectory(prefix="goo-clipboard-") as temporary:
    fixtures = Path(temporary)
    runtime = fixtures / "runtime"
    runtime.mkdir(mode=0o700)
    (fixtures / "config").mkdir()
    (fixtures / "files.uri").write_text("file:///tmp/one%20two\r\nfile://localhost/tmp/caf%C3%A9\r\n")
    (fixtures / "files.expected").write_text("/tmp/one two\n/tmp/café\n")
    (fixtures / "gnome.uri").write_text("copy\nfile:///tmp/one%20two\nfile:///tmp/caf%C3%A9\n")
    (fixtures / "invalid.uri").write_text("file://remote-server/tmp/a\n")
    (fixtures / "large.uri").write_bytes(b"#" + b"x" * 1048577)
    (fixtures / "text.txt").write_text("plain text only")
    bitmap = bytearray(62)
    bitmap[:2] = b"BM"
    for offset, value in [(2, 62), (10, 54), (14, 40), (18, 2), (22, 1)]:
        struct.pack_into("<I", bitmap, offset, value)
    bitmap[26] = 1
    bitmap[28] = 24
    bitmap[56] = 255
    bitmap[58] = 255
    (fixtures / "colors.bmp").write_bytes(bitmap)

    env = dict(os.environ, XDG_RUNTIME_DIR=str(runtime), XDG_CONFIG_HOME=str(fixtures / "config"),
               WAYLAND_DISPLAY=str(parent), QT_QPA_PLATFORM="wayland")
    with (evidence / "compositor.log").open("w") as compositor_log:
        compositor = subprocess.Popen([
            "dbus-run-session", "--", "kwin_wayland", "--wayland-display", str(parent),
            "--width", "800", "--height", "600", "--scale", "1", "--no-global-shortcuts",
            "--no-lockscreen", "--no-kactivities", "--socket", "goo-clipboard",
        ], env=env, stdout=compositor_log, stderr=subprocess.STDOUT, start_new_session=True)
        try:
            for _ in range(100):
                if (runtime / "goo-clipboard").exists():
                    break
                if compositor.poll() is not None:
                    raise RuntimeError("Nested compositor failed to start")
                time.sleep(0.05)
            else:
                raise RuntimeError("Nested compositor socket did not appear")
            env.update(WAYLAND_DISPLAY="goo-clipboard", SDL_VIDEODRIVER="wayland",
                       GOO_CLIPBOARD_ISOLATED="1", GOO_VK_DIAGNOSTICS="1", GOO_VK_VALIDATION="1",
                       LD_LIBRARY_PATH=str(root / "artifacts/native"))
            cases = [
                ("files", "text/uri-list", fixtures / "files.uri", fixtures / "files.expected"),
                ("files", "x-special/gnome-copied-files", fixtures / "gnome.uri", fixtures / "files.expected"),
                ("image", "image/png", root / "tests/Shared/Assets/local-rgba.png", None),
                ("bitmap", "image/bmp", fixtures / "colors.bmp", None),
                ("invalid", "text/uri-list", fixtures / "invalid.uri", None),
                ("large", "text/uri-list", fixtures / "large.uri", None),
                ("empty", "text/plain", fixtures / "text.txt", None),
            ]
            for index, (mode, mime, payload, expected) in enumerate(cases):
                subprocess.run(["wl-copy", "--type", mime], input=payload.read_bytes(), env=env, check=True)
                env.update(GOO_CLIPBOARD_SMOKE=mode, GOO_CLIPBOARD_EXPECTED=str(expected or payload))
                log = evidence / f"{index}-{mode}.log"
                with log.open("w") as output:
                    result = subprocess.run([
                        "dotnet", str(root / "tests/Goo.AsyncReadbackSmoke/bin/Release/net10.0/Goo.AsyncReadbackSmoke.dll"),
                    ], env=env, stdout=output, stderr=subprocess.STDOUT, timeout=40)
                transcript = log.read_text()
                if result.returncode:
                    raise RuntimeError(f"{mime}: exit {result.returncode}; see {log}")
                counters = [json.loads(line) for line in transcript.splitlines() if line.startswith('{"kind":"counters"')]
                if not counters or any(counters[-1][key] for key in ["validationErrors", "fatalCode", "vulkanObjectCount", "vulkanDeviceMemoryBytes"]):
                    raise RuntimeError(f"Native cleanup failed: {log}")
                marker = f"clipboard-native: {mode}=pass external-provider=1 owned-after-close=1"
                if marker not in transcript:
                    raise RuntimeError(f"Missing native acceptance result: {log}")
                print(f"{mime}: {marker}", flush=True)
        finally:
            if compositor.poll() is None:
                os.killpg(compositor.pid, signal.SIGTERM)
                compositor.wait(timeout=10)
print("clipboard-native: all seven external-transfer cases passed")
