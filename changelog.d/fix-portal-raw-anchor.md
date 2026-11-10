## Added

- Add `ElementHandle.RawBorderBox`, `ElementMetrics.RawBorderBox` and `Window.PixelScale` so point-positioned popups can preserve their anchor's device-pixel phase.
- `ElementMetrics` positional deconstruction now has a sixth element, `RawBorderBox`. The first five positions keep their order.
