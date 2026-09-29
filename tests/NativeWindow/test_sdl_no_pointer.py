#!/usr/bin/env python3
import os
from pathlib import Path
import subprocess
import sys
import tempfile


source = (Path(sys.argv[1]) / "src/video/wayland/SDL_waylandmouse.c").read_text()
start = source.index("static bool Wayland_ShowCursor(")
brace = source.index("{", start)
depth = 1
end = brace + 1
while depth:
    depth += (source[end] == "{") - (source[end] == "}")
    end += 1
handler = source[start:end]
harness = Path(__file__).with_name("no_pointer_cursor_harness.c").read_text()
with tempfile.TemporaryDirectory(prefix="goo-sdl-no-pointer-") as temp:
    test_source = Path(temp) / "test.c"
    test_source.write_text(harness.replace("__WAYLAND_SHOW_CURSOR__", handler))
    binary = Path(temp) / "test"
    subprocess.run([os.environ.get("CC", "cc"), "-std=c11", "-Wall", "-Wextra", "-Werror",
                    str(test_source), "-o", str(binary)], check=True)
    subprocess.run([str(binary)], check=True)
