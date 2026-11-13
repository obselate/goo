## Changed

- Move window clipboard methods to `window.Clipboard`: use `ReadText`, `WriteText`, `GetFormats`, `ReadFiles`, `ReadImage`, `ReadDataAsync`, and `WriteAsync`. Check text read and write status instead of relying on empty text or native exceptions.

## Added

- Add `NativeDialogs.ShowError(title, message)` for a synchronous ownerless error box before any window or after the last window closes. Check the returned `MessageBoxStatus`.
- Add `Platform.OpenAsync(target, cancellationToken)` to start the system handler for an absolute path or URI. Check `PlatformOpenResult.Status` and `Error`.
