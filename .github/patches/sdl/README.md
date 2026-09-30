# Goo's SDL 3.4.0 Wayland window patch

`build-sdl-linux-x64.sh` applies `wayland-window-interactions.patch` to the
checksum-pinned SDL source before building the Linux runtime. It also compiles
and runs `tests/NativeWindow/test_sdl_wayland.py` against the patched handlers.

`wayland-no-pointer-cursor.patch` backports the SDL Wayland seat guard from
[upstream commit 79b40ad](https://github.com/libsdl-org/SDL/commit/79b40ad3975431cbab09f29ad90b5aef469131d8).
SDL 3.4.0 otherwise dereferences a null `wl_pointer` while initializing its
cursor on a touch-only or virtual seat. The actual `Wayland_ShowCursor` function
is exercised by `tests/NativeWindow/test_sdl_no_pointer.py` with pointerless,
pointer, and tablet seats.

- SDL consumes custom hit-test titlebar clicks before its normal mouse click
  tracker. Track primary presses per seat/window with SDL's configured
  double-click time and radius, then maximize/restore resizable windows. Before
  the default action, the optional `Goo.Window.TitlebarDoubleClick.1` window
  pointer property is called as `bool callback(int x, int y)`; true consumes the
  command. Goo installs it only while `Window.TitlebarDoubleClicked` has subscribers.
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

`wayland-drop-mime-priority.patch` keeps file URIs (or a document-portal file
transfer) ahead of text fallbacks during drag negotiation. SDL 3.4.0 otherwise
accepts Nemo's plain-text names and tries to decode those names as file URIs,
producing an empty drop. The build runs `test_sdl_drop.py` against the actual C
handler; the unpatched handler fails the mixed URI/text case. The real transfer
is exercised by `tests/Goo.AsyncReadbackSmoke/verify-native-file-drop.py` in an
isolated KWin session with Nemo and compositor input supplied by libei.

`wayland-outbound-file-drag.patch` adds Goo's file-only drag source bridge to the
pinned SDL Wayland backend. The held pointer's primary-press serial starts a
Copy `text/uri-list` offer after Goo moves an in-window drag outside its source
window. Source completion reports acceptance after the Wayland target finishes.
The bridge uses SDL's existing Wayland seat, data device, and event loop and
adds no runtime dependency. A same-process return to an SDL window reads its
owned URI list directly to avoid waiting on its own event loop.

`wayland-foreign-parent.patch` exports
`bool Goo_SetForeignParent(SDL_Window *, const char *bare_handle, Uint8 modal)`.
It imports an xdg-foreign-v2 parent through SDL's Wayland registry. Hidden
windows retain the request in owned SDL properties and apply it before the
initial shell surface commit. Hide destroys the import, show restores it, and
window destruction releases it. A revoked or invalid handle clears the parent
request and modal state. Null or empty handles clear the request. Unsupported
backends, protocols, malformed handles, and non-toplevel windows return false.
True means the request was queued or applied, not that the compositor validated
the handle. Modal state uses xdg-dialog-v1 when available.

`tests/NativeWindow/foreign_parent_e2e.c` maps parent and child windows on two
separate Wayland connections. It checks hidden setup, first show, hide/re-show,
modal changes, malformed and invalid handles, explicit clearing, and parent
revocation. Its Python runner compiles against the patched SDL library and
`wayland-client`, runs xdg-shell and libdecor, and checks protocol traces for
parenting and modal requests before the initial shell commit. Run it on a
compositor with xdg-foreign-v2 and installed libdecor:

```sh
sdl_source=/absolute/path/to/patched/SDL3-3.4.0
sdl_library=/absolute/path/to/patched/libSDL3.so
python3 tests/NativeWindow/test_sdl_foreign_parent.py "$sdl_source" "$sdl_library"
```

The fixture checks the actual xdg-surface listener owner to prevent silent
libdecor fallback. The runner preloads the exact supplied SDL library even when
its directory has no SONAME symlink. Use `--xdg-only` for payloads built without
libdecor support.
