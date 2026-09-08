#!/usr/bin/env python3
"""Exercise the actual patched SDL hit-test/configure handlers without a compositor.

Usage: python3 tests/NativeWindow/test_sdl_wayland.py /path/to/patched/SDL3
The SDL source must be the release pinned by build-sdl-linux-x64.sh.
"""
import os
from pathlib import Path
import subprocess
import sys
import tempfile


def function(source, name):
    start = source.rfind("static ", 0, source.index(name))
    brace = source.index("{", start)
    depth = 1
    end = brace + 1
    while depth:
        depth += (source[end] == "{") - (source[end] == "}")
        end += 1
    return source[start:end]


root = Path(sys.argv[1]) / "src/video/wayland"
handlers = function((root / "SDL_waylandevents.c").read_text(), "Wayland_ProcessHitTest(")
handlers += "\n" + function((root / "SDL_waylandwindow.c").read_text(), "handle_xdg_surface_configure(")
harness = Path(__file__).with_name("wayland_harness.c").read_text()
with tempfile.TemporaryDirectory(prefix="goo-sdl-test-") as temp:
    source = Path(temp) / "test.c"
    source.write_text(harness.replace("/* PATCHED_HANDLERS */", handlers))
    binary = Path(temp) / "test"
    subprocess.run([os.environ.get("CC", "cc"), "-std=c11", "-Wall", "-Wextra", "-Werror", str(source), "-o", str(binary)], check=True)
    subprocess.run([str(binary)], check=True)
