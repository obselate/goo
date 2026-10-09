#!/usr/bin/env python3
import os
from pathlib import Path
import subprocess
import sys
import tempfile


source = (Path(sys.argv[1]) / "src/video/wayland/SDL_waylandvideo.c").read_text()
start = source.index("bool Wayland_HandleDisplayDisconnected(")
brace = source.index("{", start)
depth = 1
end = brace + 1
while depth:
    depth += (source[end] == "{") - (source[end] == "}")
    end += 1
harness = Path(__file__).with_name("disconnect_harness.c").read_text()
with tempfile.TemporaryDirectory(prefix="goo-sdl-disconnect-") as temp:
    test = Path(temp) / "test.c"
    test.write_text(harness.replace("__DISCONNECT_HANDLER__", source[start:end]))
    binary = Path(temp) / "test"
    subprocess.run([os.environ.get("CC", "cc"), "-std=c11", "-Wall", "-Wextra", "-Werror",
                    str(test), "-o", str(binary)], check=True)
    subprocess.run([str(binary)], check=True)
