#!/usr/bin/env python3
"""Compile SDL's actual Wayland drop-enter handler and verify MIME selection."""
import os
from pathlib import Path
import subprocess
import sys
import tempfile

source = (Path(sys.argv[1]) / "src/video/wayland/SDL_waylandevents.c").read_text()
start = source.index("static void data_device_handle_enter(")
brace = source.index("{", start)
depth, end = 1, brace + 1
while depth:
    depth += (source[end] == "{") - (source[end] == "}")
    end += 1
handler = source[start:end]
harness = Path(__file__).with_name("wayland_drop_harness.c").read_text()
with tempfile.TemporaryDirectory(prefix="goo-sdl-drop-") as temp:
    test = Path(temp) / "test.c"
    test.write_text(harness.replace("/* DROP_HANDLER */", handler))
    binary = Path(temp) / "test"
    subprocess.run([os.environ.get("CC", "cc"), "-std=c11", "-Wall", "-Wextra", "-Werror", "-Wno-unused-parameter", str(test), "-o", str(binary)], check=True)
    subprocess.run([str(binary)], check=True)
