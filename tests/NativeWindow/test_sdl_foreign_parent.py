#!/usr/bin/env python3
import os
from pathlib import Path
import re
import shlex
import subprocess
import sys
import tempfile


def check_trace(trace):
    imports = list(re.finditer(r'import_toplevel\(new id zxdg_imported_v2#(\d+), "([^"]+)"\)', trace))
    valid = [entry for entry in imports if entry[2] != "invalid-foreign-parent-e2e-handle"]
    assert len(valid) >= 4, "Missing foreign-parent lifecycle imports"
    for entry in valid[:2]:
        parent = re.search(rf'zxdg_imported_v2#{entry[1]}\.set_parent_of\(wl_surface#(\d+)\)', trace[entry.end():])
        assert parent, "Imported parent was not applied to the child surface"
        parent_position = entry.end() + parent.start()
        surface = parent[1]
        shells = list(re.finditer(rf'get_xdg_surface\(new id xdg_surface#\d+, wl_surface#{surface}\)', trace[:entry.start()]))
        assert shells, "Child xdg surface was not created before importing"
        commit = rf'wl_surface#{surface}\.commit\(\)'
        assert not re.search(commit, trace[shells[-1].end():parent_position]), "Child was committed before parenting"
        mapping = re.search(commit, trace[parent_position:])
        assert mapping, "Child surface was not committed"
        if '"xdg_wm_dialog_v1"' in trace:
            assert re.search(r'xdg_dialog_v1#\d+\.set_modal\(\)', trace[parent_position:parent_position + mapping.start()]), "Modal state was not applied before mapping"


if len(sys.argv) not in (3, 4) or (len(sys.argv) == 4 and sys.argv[3] != "--xdg-only"):
    raise SystemExit("usage: test_sdl_foreign_parent.py SDL_SOURCE SDL_LIBRARY [--xdg-only]")
source_root = Path(sys.argv[1]).resolve()
library = Path(sys.argv[2]).resolve()
bin_dir = Path.home() / ".local/bin"
bin_dir.mkdir(parents=True, exist_ok=True)
fd, name = tempfile.mkstemp(prefix="goo-foreign-parent-e2e-", dir=bin_dir)
os.close(fd)
binary = Path(name)
binary.unlink()
try:
    wayland_flags = shlex.split(subprocess.check_output(["pkg-config", "--cflags", "--libs", "wayland-client"], text=True))
    subprocess.run([os.environ.get("CC", "cc"), "-std=c11", "-Wall", "-Wextra", "-Werror",
                    "-I", str(source_root / "include"), str(Path(__file__).with_name("foreign_parent_e2e.c")),
                    str(library), f"-Wl,-rpath,{library.parent}", *wayland_flags, "-ldl", "-o", str(binary)], check=True)
    for libdecor in ((False, True) if len(sys.argv) == 3 else (False,)):
        env = dict(os.environ, SDL_VIDEODRIVER="wayland", WAYLAND_DEBUG="client", LD_PRELOAD=str(library),
                   SDL_VIDEO_WAYLAND_ALLOW_LIBDECOR="1" if libdecor else "0",
                   SDL_VIDEO_WAYLAND_PREFER_LIBDECOR="1" if libdecor else "0")
        result = subprocess.run([str(binary)], env=env, text=True, capture_output=True, timeout=30)
        if result.returncode:
            sys.stderr.write(result.stderr)
            result.check_returncode()
        check_trace(result.stderr)
        print(f"Foreign parent E2E and protocol ordering passed ({'libdecor' if libdecor else 'xdg-shell'})")
finally:
    binary.unlink(missing_ok=True)
