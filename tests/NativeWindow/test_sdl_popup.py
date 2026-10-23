#!/usr/bin/env python3
import ctypes
from pathlib import Path
import sys

root = Path(sys.argv[1]) / "src/video/wayland"
events = (root / "SDL_waylandevents.c").read_text()
window = (root / "SDL_waylandwindow.c").read_text()
creation = window[window.index("// Assign the popup role"):]
assert creation.index("Goo_GrabPopup(") < creation.index("SDL_SetPointerProperty(props, SDL_PROP_WINDOW_WAYLAND_XDG_POPUP_POINTER")
assert "Goo_RecordPopupInput(window->sdlwindow, seat, nsTimestamp)" in events
assert "Goo_RecordPopupInput(SDL_GetKeyboardFocus(), seat, timestamp_ns)" in events
assert "Goo_RecordPopupInput(window_data->sdlwindow, seat, Wayland_GetTouchTimestamp(seat, timestamp))" in events
sdl = ctypes.CDLL(str(Path(sys.argv[2]).resolve()))
sdl.SDL_Init.argtypes = [ctypes.c_uint32]
sdl.SDL_Init.restype = ctypes.c_bool
sdl.SDL_CreateWindow.argtypes = [ctypes.c_char_p, ctypes.c_int, ctypes.c_int, ctypes.c_uint64]
sdl.SDL_CreateWindow.restype = ctypes.c_void_p
sdl.SDL_CreatePopupWindow.argtypes = [ctypes.c_void_p, ctypes.c_int, ctypes.c_int, ctypes.c_int, ctypes.c_int, ctypes.c_uint64]
sdl.SDL_CreatePopupWindow.restype = ctypes.c_void_p
sdl.SDL_DestroyWindow.argtypes = [ctypes.c_void_p]
sdl.Goo_ConfigurePopup.argtypes = [ctypes.c_void_p, ctypes.c_void_p, ctypes.c_uint64] + [ctypes.c_int] * 5
sdl.Goo_ConfigurePopup.restype = ctypes.c_bool
sdl.SDL_GetError.restype = ctypes.c_char_p
assert sdl.SDL_Init(0x20), sdl.SDL_GetError()
parent = sdl.SDL_CreateWindow(b"Popup bridge lifetime", 320, 240, 0x8)
assert parent, sdl.SDL_GetError()
try:
    for kind in (0x80000, 0x40000):
        popup = sdl.SDL_CreatePopupWindow(parent, 0, 0, 80, 60, kind | 0x8)
        assert popup, sdl.SDL_GetError()
        try:
            configured = sdl.Goo_ConfigurePopup(parent, popup, 0, 10, 10, 20, 20, 0)
            assert configured == (kind == 0x40000), sdl.SDL_GetError()
            if kind == 0x80000:
                assert not sdl.Goo_ConfigurePopup(parent, popup, 0xFFFFFFFFFFFFFFFF, 10, 10, 20, 20, 0)
        finally:
            sdl.SDL_DestroyWindow(popup)
finally:
    sdl.SDL_DestroyWindow(parent)
    sdl.SDL_Quit()
print("PASS actual Wayland popup bridge rejects absent/unmatched input and accepts non-grabbing tooltips")
