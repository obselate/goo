## Changed

- Breaking: Replace `Window.Width` and `Height` with `Size`, `MinWidth` and `MinHeight` with `MinSize`, and `MaxWidth` and `MaxHeight` with `MaxSize`. Each pair uses `LayoutSize(width, height)` in layout units. Read `NativeWidth` or `NativeHeight` for native logical units.
- Breaking: `SetTopmost` and `SetFullscreenDisplay` replace `TrySetTopmost` and `TrySetFullscreenDisplay`. Rename calls and keep handling `WindowOperationResult`.
- Breaking: Initialize `Topmost` before `Open`. Replace runtime property assignments with `SetTopmost(value)` and handle the result.
- Breaking: Window scalar settings and `WindowMetrics.UiScale` now use `float64`. Remove casts to `float64` when reading `UiScale`, `PixelScale`, `DragStartDistance`, `WheelScrollScale`, or `ResizeBand`.
- Breaking: Replace `WindowMetrics.LogicalWidth` and `LogicalHeight` with `NativeWidth` and `NativeHeight`. Replace the first two `OffscreenRenderOptions` constructor arguments with `LayoutSize(width, height)` in layout units. Read `Size.Width` and `Size.Height` instead of `LogicalWidth` and `LogicalHeight`. Its deconstruction now returns one `Size` output instead of two scalar size outputs.
- Breaking: `DragStartDistance` now uses Euclidean distance in layout units, matching `PointerDragThreshold`. Diagonal movement can start a drag sooner than the old per-axis test. The defaults remain 8 for mouse and pen and 4 for touch.
- Breaking: Platform input coordinates and wheel deltas, `WindowDisplay.ContentScale`, and `PlatformPreferences.TextScaleFactor` now use `float64`. Remove `float32` coordinate casts before calling `PlatformInput`. Pointer pressure remains `float32`.
