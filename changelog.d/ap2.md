## Changed
- Window sizes and limits now use layout-unit `Size`, `MinSize` and `MaxSize` pairs. Replace scalar initializers with `LayoutSize(width, height)` and use `NativeWidth` or `NativeHeight` for native logical units.
- `SetTopmost` and `SetFullscreenDisplay` replace `TrySetTopmost` and `TrySetFullscreenDisplay`. Rename calls and keep handling `WindowOperationResult`.
- Initialize `Topmost` before `Open`. Replace runtime property assignments with `SetTopmost(value)` and handle the result.
- Window scalar settings and `WindowMetrics.UiScale` now use `float64`. Remove casts to `float64` when reading `UiScale`, `PixelScale`, `DragStartDistance`, `WheelScrollScale`, or `ResizeBand`.
- Replace `WindowMetrics.LogicalWidth` and `LogicalHeight` with `NativeWidth` and `NativeHeight`. Replace the first two `OffscreenRenderOptions` arguments with `LayoutSize(width, height)` in layout units.

## Added
- `Window.SizeToContent` measures selected root axes once before the first map. Set `SizeToContent.Width`, `Height` or `Both`, with optional `MinSize` and `MaxSize` bounds.
