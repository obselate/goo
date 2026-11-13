## Changed

- `ElementHandle.ScrollToItem(key, alignment = ScrollAlignment.Start, settle = true)` replaces both overloads and holds one unknown-key request for up to three frames. Remove delayed reveal timers and call it directly. Use `ScrollAlignment.Nearest` for minimal movement.
- `ElementHandle.ScrollTo` and `JumpTo` accept optional axes. Use `ScrollTo(y: value)` or `JumpTo(y: value)` to keep the horizontal offset.
- `ElementMetrics` positional deconstruction adds `IsAtEndX` and `IsAtEndY` after `RawBorderBox`. Add both outputs or read the named properties instead.

## Added

- Use `ElementHandle.SelectText(start, end)` to focus and select UTF-16 offsets, including one request made before mount.
- Use `IsAtEndX` and `IsAtEndY` on handles or metrics snapshots instead of an application epsilon. Use `ScrollToEnd()` to animate to the range end.
