## Changed
- Window sizes and limits now use layout-unit `Size`, `MinSize` and `MaxSize` pairs. Replace scalar initializers with `LayoutSize(width, height)` and use `NativeWidth` or `NativeHeight` for native logical units.
- `SetTopmost` and `SetFullscreenDisplay` replace `TrySetTopmost` and `TrySetFullscreenDisplay`. Rename calls and keep handling `WindowOperationResult`.
- Initialize `Topmost` before `Open`. Replace runtime property assignments with `SetTopmost(value)` and handle the result.
- Window scalar settings and `WindowMetrics.UiScale` now use `float64`. Remove casts to `float64` when reading `UiScale`, `PixelScale`, `DragStartDistance`, `WheelScrollScale`, or `ResizeBand`.
- Replace `WindowMetrics.LogicalWidth` and `LogicalHeight` with `NativeWidth` and `NativeHeight`. Replace the first two `OffscreenRenderOptions` arguments with `LayoutSize(width, height)` in layout units.
- `DragStartDistance` now uses Euclidean distance in layout units, matching `PointerDragThreshold`. Diagonal movement can start a drag sooner than the old per-axis test. The defaults remain 8 for mouse and pen and 4 for touch.

## Added
- `Window.SizeToContent` measures selected root axes once before the first map. Set `SizeToContent.Width`, `Height` or `Both`, with optional `MinSize` and `MaxSize` bounds.
