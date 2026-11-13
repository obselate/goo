## Changed

- Move window clipboard methods to `window.Clipboard`: use `ReadText`, `WriteText`, `GetFormats`, `ReadFiles`, `ReadImage`, `ReadDataAsync`, and `WriteAsync`. Check text read and write status instead of relying on empty text or native exceptions.
- Text reads use `ClipboardReadStatus`. Replace `ClipboardTextStatus` with `ClipboardReadStatus`.
- Embedded hosts override `ReadClipboardText() ClipboardTextResult` and `WriteClipboardText(value) ClipboardWriteResult`. Return an explicit status instead of throwing for native failures. The defaults return `Unsupported`.
- `WindowClipboard.ReadDataAsync` and `WriteAsync` accept a trailing optional `CancellationToken`. Pass a token to cancel the wait and discard a late native result.

## Added

- Add `NativeDialogs.ShowError(title, message)` for a synchronous ownerless error box before any window or after the last window closes. Check the returned `MessageBoxStatus`.
- Add `Platform.OpenAsync(target, cancellationToken)` to start the system handler for an absolute path or URI. Check `PlatformOpenResult.Status` and `Error`.
