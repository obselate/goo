# Goo SDL 3.4.0 Linux patches

```sh
.github/scripts/build-sdl-linux-x64.sh /absolute/path/to/libSDL3.so
dotnet build path/to/App.gsproj -c Release \
  -p:GooLinuxSdlPath=/absolute/path/to/libSDL3.so
```

The builder applies these patches to checksum-pinned SDL with no fuzz. Review backports when upgrading SDL. Release payloads use the Ubuntu 18.04 environment and glibc 2.27 baseline. A newer-host build is for local checks only. System SDL does not include Goo's patches. Windows and macOS payloads are unchanged.

| Patch | Purpose | Check |
| --- | --- | --- |
| `event-wakeup-race.patch` | Arm wakeup before the final queue check | `tests/NativeWindow/test_sdl_wakeup.py` |
| `wayland-wakeup-pipe.patch` | Wake blocked display reads and flushes with a local pipe | `test_sdl_wakeup_pipe.py` |
| `wayland-window-interactions.patch` | Custom-titlebar maximize/restore and resize exposure | `test_sdl_wayland.py` |
| `wayland-drop-mime-priority.patch` | Prefer file URI and portal transfers to text fallback | `test_sdl_drop.py` |
| `wayland-no-pointer-cursor.patch` | Guard touch-only and virtual seats, upstream `79b40ad3975431cbab09f29ad90b5aef469131d8` | `test_sdl_no_pointer.py` |
| `wayland-data-transfer.patch` | MIME drag sources and owned drop captures | `Goo.HostChecks wayland-data-transfer` |
| `wayland-disconnect.patch` | Report compositor disconnect without unsafe cleanup | `test_sdl_disconnect.py` |
| `portal-dialog-lifetime.patch` | Own portal dialog request lifetime | Native file-dialog checks |
| `wayland-foreign-parent.patch` | Import owned xdg-foreign-v2 parents | `Goo.Investigation foreign-parent` |
| `wayland-popup-grab.patch` | Bind popup placement and grabs to the originating input serial | `test_sdl_popup_handlers.py`, `Goo.Investigation popup` |
| `static-no-dynapi.patch` | Disable dynamic API indirection for static SDL | Static NativeAOT package checks |
| `wayland-secondary-startup.patch` | Allow secondary-process activation forwarding | AppHost checks |
| `wayland-activation-token.patch` | Preserve Wayland activation-token routing | AppHost checks |
| `wayland-clipboard-replacement.patch` | Keep clipboard data when a cleared selection is replaced, upstream `01997ebebde6a57af1506956764732554c2b85b0` | `Goo.HostChecks wayland-clipboard` |
| `wayland-selection-serial.patch` | Publish a selection set before input with the latest serial, upstream `7063546818de5fcd78ac7afe0b8404b753a95ab6` | `Goo.HostChecks wayland-clipboard` |

Python check names without a prefix are under `tests/NativeWindow`. The build script owns patch order and automatic native checks.

## Foreign parents and popups

`Goo_SetForeignParent(SDL_Window *, const char *bare_handle, Uint8 modal)` imports an xdg-foreign-v2 parent. Hidden windows apply it before the first shell commit. Hide releases the import, show restores it, and destruction releases it. Null or empty handles clear it. Invalid or revoked handles clear parenting and modal state. Unsupported backends, protocols, malformed handles and non-toplevel windows return false. True means queued or applied, not compositor validation. Modal state uses xdg-dialog-v1 when available.

Use a private compositor with xdg-foreign-v2 and installed libdecor:

```sh
sdl_source=/absolute/path/to/patched/SDL3-3.4.0
sdl_library=/absolute/path/to/patched/libSDL3.so
.github/scripts/with-headless-wayland.sh \
  dotnet run --project tools/Goo.Investigation -c Release -- foreign-parent "$sdl_source" "$sdl_library"
.github/scripts/with-headless-wayland.sh \
  dotnet run --project tools/Goo.Investigation -c Release -- popup "$sdl_source" "$sdl_library"
```

The [foreign-parent runner](../../../tools/Goo.Investigation/ForeignParent.gs) owns its assertion list. Use `--xdg-only` for a payload built without libdecor. Popup checks require an input serial from the originating seat. Missing input or removed seats fail rather than opening an ungrabbed menu. Tooltips stay ungrabbed.

## Idle resize qualification

Use a private compositor and the patched `GooLinuxSdlPath`:

1. Open an undecorated resizable window with `Window.WithDragRegion` and a `MetricsChanged` listener.
2. Let it idle. Double-click the titlebar to maximize and restore.
3. Hold a resize edge. Verify multiple metric changes and a capture with relaid-out content before releasing the button.
4. Repeat with interactive titlebar children and fixed-size windows.

Do not animate continuously. Animation can conceal an idle resize failure.
