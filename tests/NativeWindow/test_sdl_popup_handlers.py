#!/usr/bin/env python3
import os
from pathlib import Path
import shlex
import subprocess
import sys
import tempfile

source_root = Path(sys.argv[1]).resolve()
source = (source_root / "src/video/wayland/SDL_waylandevents.c").read_text()
start = source.index("#define GOO_POPUP_INPUT_CAPACITY")
end = source.index("// Focus clickthrough timeout", start)
harness = Path(__file__).with_name("popup_grab_harness.c").read_text()
with tempfile.TemporaryDirectory(prefix="goo-popup-handlers-") as temporary:
    test = Path(temporary) / "test.c"
    test.write_text(harness.replace("PATCHED_HANDLERS", source[start:end]))
    binary = Path(temporary) / "test"
    flags = shlex.split(subprocess.check_output(["pkg-config", "--cflags", "--libs", "wayland-client"], universal_newlines=True))
    subprocess.run([os.environ.get("CC", "cc"), "-std=c11", "-Wall", "-Wextra", "-Werror", "-I", str(source_root / "include"), str(test), str(Path(sys.argv[2]).resolve()), *flags, "-o", str(binary)], check=True)
    subprocess.run([str(binary)], check=True)
