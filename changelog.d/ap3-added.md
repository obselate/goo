## Added

- Add `NativeDialogs.ShowError(title, message)` for a synchronous ownerless error box before any window or after the last window closes. Check the returned `MessageBoxStatus`.
- Add `Platform.OpenAsync(target, cancellationToken)` to start the system handler for an absolute path or URI. Check `PlatformOpenResult.Status` and `Error`.
