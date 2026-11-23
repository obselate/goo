## Added

- Add `Window.CaptureCompleted`. It reports that a requested capture is ready to poll, even when the window is idle.
- Add `ImageSource.LoadThumbnail` overloads for encoded memory and streams.
- Add `Image.KeepPreviousWhilePending` to keep the previous frame and intrinsic size while a different image source loads.
- Native popup menus and tooltips have transparent corners where the platform supports alpha, and stay opaque otherwise.
- Add `NotificationMessage.Silent` to request a desktop notification without sound.
- Add `Window.IconPngs` for several icon sizes. Windows selects the closest size for each icon slot.
- Add an `Application.AcquireSingleInstance` overload with an election scope. The native application identity does not change.
