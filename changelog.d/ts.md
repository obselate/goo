## Added

- `State[T]` tracks reads in Cell builds and retained builders. Changed values invalidate their readers. Equal writes do nothing.
- `Window.State`, `IsFocused`, `Size`, `NativeWidth`, `NativeHeight`, `UiScale`, `PixelScale`, `Preferences`, `Modifiers`, `Focus.EditsText`, `Focus.Editor` and `Focus.Selection` track their Cell and retained-builder readers. Changes rebuild only readers of the changed value.
