## Added

- `Window.SizeToContent` measures selected root axes once before the first map. Set `SizeToContent.Width`, `Height` or `Both`, with optional `MinSize` and `MaxSize` bounds.
- `SizeToContent` keeps the declared `Size` on root axes with percentage, viewport-relative or mixed container-dependent sizes. Descendant `Vw` and `Vh` resolve against that declared size during measurement. Remove container-dependent root sizes to measure those axes from content.
