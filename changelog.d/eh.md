## Changed

- Breaking: `ElementHandle.ScrollToItem(key, alignment = ScrollAlignment.Start, settle = true)` replaces both overloads and holds one unknown-key request for up to three frames. Remove delayed reveal timers and call it directly. Use `ScrollAlignment.Nearest` for minimal movement.
- Breaking: `ElementHandle.ScrollTo` and `JumpTo` accept optional axes. Use `ScrollTo(y: value)` or `JumpTo(y: value)` to keep the horizontal offset.
- Breaking: `ElementMetrics` positional deconstruction adds `IsAtEndX` and `IsAtEndY` after `RawBorderBox`. Add both outputs or read the named properties instead.
