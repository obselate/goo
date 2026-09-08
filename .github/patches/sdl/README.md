# Goo's SDL 3.4.0 Wayland window patch

`build-sdl-linux-x64.sh` applies `wayland-window-interactions.patch` to the
checksum-pinned SDL source before building the Linux runtime. It also compiles
and runs `tests/NativeWindow/test_sdl_wayland.py` against the patched handlers.

- SDL consumes custom hit-test titlebar clicks before its normal mouse click
  tracker. Track primary presses per seat/window with SDL's configured
  double-click time and radius, then maximize/restore resizable windows.
  Releases must not start additional compositor moves or resizes.
- Backport the exposure wakeups from upstream SDL's Wayland configure handlers.
  An idle render-on-demand client otherwise waits for a size event while SDL
  waits for a presented frame to acknowledge that size. Both xdg-shell and
  libdecor need the wakeup.

The resize fix follows
[SDL's upstream Wayland window implementation](https://github.com/libsdl-org/SDL/blob/main/src/video/wayland/SDL_waylandwindow.c).
The titlebar change is Goo-specific. Keep the patch tied to the pinned release;
review/remove the backport when updating SDL rather than applying it with fuzz.

For local source builds, supply the patched library explicitly:

```sh
.github/scripts/build-sdl-linux-x64.sh /absolute/path/to/libSDL3.so
dotnet build path/to/App.gsproj -c Release \
  -p:GooLinuxSdlPath=/absolute/path/to/libSDL3.so
```

The release builder retains its glibc 2.27 requirement and should run in the
Ubuntu 18.04 build environment from CI. A library built on a newer host is
suitable for local testing only. An arbitrary system SDL does not include Goo's
titlebar patch. Existing published applications need a rebuilt native payload;
no application-level click handlers or continuously running render loop are
required. Windows and macOS payloads are unchanged.
