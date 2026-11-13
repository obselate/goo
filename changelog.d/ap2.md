## Changed
- Window sizes and limits now use layout-unit `Size`, `MinSize` and `MaxSize` pairs. Replace scalar initializers with `LayoutSize(width, height)` and use `NativeWidth` or `NativeHeight` for native logical units.
- `SetTopmost` and `SetFullscreenDisplay` replace `TrySetTopmost` and `TrySetFullscreenDisplay`. Rename calls and keep handling `WindowOperationResult`.

## Added
- `Window.SizeToContent` measures selected root axes once before the first map. Set `SizeToContent.Width`, `Height` or `Both`, with optional `MinSize` and `MaxSize` bounds.

## Fixed
- `SizeToContent` keeps the declared `Size` on root axes with percentage, viewport-relative or mixed container-dependent sizes. Descendant `Vw` and `Vh` resolve against that declared size during measurement. Remove container-dependent root sizes to measure those axes from content.
