# SDL Wayland window regressions

Run against the patched SDL source tree:

```sh
python3 tests/NativeWindow/test_sdl_wayland.py /path/to/patched/SDL3
```

The Linux native build runs this automatically after applying the patch. The
harness compiles the actual `Wayland_ProcessHitTest` and
`handle_xdg_surface_configure` functions with native call doubles. It checks
maximize/restore, click timing/distance, independent click pairs, window
identity, client content, fixed-size/fullscreen exclusions, all resize edges,
release handling, locked pointers, and resize exposure coalescing.

For compositor qualification, build a Goo window with the patched
`GooLinuxSdlPath`, an undecorated `Window.DragRegion` titlebar, a resizable root,
and a `MetricsChanged` listener. Let it idle, double-click to maximize and
restore, then drag a resize edge. Verify multiple metric notifications and a
capture with relaid-out content **before releasing the mouse button**. Repeat
with interactive titlebar children and fixed-size windows. Continuous animation
would conceal the idle resize regression.

The September 8, 2026 local KWin/Wayland check passed maximize, restore, and 30
successive size changes during a held resize (640×400 to 790×490), with an
in-drag Goo capture showing the resized content. This is not Windows/macOS or
glibc-baseline release qualification.
