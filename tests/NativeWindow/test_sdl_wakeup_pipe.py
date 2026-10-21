#!/usr/bin/env python3
import os
from pathlib import Path
import subprocess
import sys
import tempfile


source = (Path(sys.argv[1]) / "src/video/wayland/SDL_waylandevents.c").read_text()
harness = Path(__file__).with_name("wakeup_pipe_harness.c").read_text()
for name in ("Wayland_SendWakeupEvent", "Wayland_WaitForWakeup", "Wayland_WaitEventTimeout"):
    start = source.index("int " + name + "(") if name != "Wayland_SendWakeupEvent" else source.index("void " + name + "(")
    brace = source.index("{", start)
    depth = 1
    end = brace + 1
    while depth:
        depth += (source[end] == "{") - (source[end] == "}")
        end += 1
    harness = harness.replace("__" + name.upper() + "__", source[start:end])
with tempfile.TemporaryDirectory(prefix="goo-sdl-wakeup-pipe-") as temp:
    test = Path(temp) / "test.c"
    test.write_text(harness)
    binary = Path(temp) / "test"
    for ppoll in (True, False):
        defines = ["-DHAVE_PPOLL"] if ppoll else []
        subprocess.run([os.environ.get("CC", "cc"), "-std=c11", "-Wall", "-Wextra", "-Werror",
                        "-Wno-unused-parameter", "-Wno-sign-compare", *defines, str(test), "-o", str(binary)], check=True)
        subprocess.run([str(binary)], check=True)
