## Visibility, activation and stacking

Set `Window.IconPng` in the `Window` initializer to embedded PNG bytes before
`Open` to request a native window icon. Goo validates the PNG with the same
16 MiB encoded and 64 MiB decoded limits as image loading, plus a 1024 pixel
icon edge limit. It gives SDL straight RGBA pixels before the window is shown.
No external icon file is needed for this property. On Wayland, the compositor
normally uses the matching `.desktop` entry's icon. `SDL_SetWindowIcon` works
only when the compositor supports `xdg-toplevel-icon-v1`.


`Open` shows the desktop window by default. Set `InitiallyVisible: false` before
`Open` to create and mount it while hidden, then call `Show()` or `Show(false)`.
`Show(false)` reveals the window without requesting activation. `Hide()` retains
the mounted tree, cancels transient input and suspends presentation. Callbacks and
timers still run while hidden. Hidden windows remain open until closed.

`Show`, `Hide` and `RequestActivation` return `WindowOperationResult`: `Accepted`, `Closed`,
`Unsupported` or `Failed`. Accepted means the native request was submitted.
Observe `IsVisible` and `VisibilityChanged` for visibility, and `IsFocused` and
`FocusChanged` for keyboard focus. Visibility does not guarantee that another
window does not cover this one. `Show()` uses `RequestActivation()` for focusable
windows, restoring minimized windows and requesting focus without changing the
focused Goo element synchronously. Activation redirects to an active modal child
and returns `Unsupported` while a native chooser blocks the owner.

`Focusable` defaults to true and `Topmost` to false. Set them before `Open` or on
the owner thread afterward. Nonfocusable windows never request activation when
shown. Unsupported `Focusable` assignments throw before changing the configured
value. `Topmost` is a requested preference, so unsupported hosts retain it without
changing stacking or failing `Open`. Call `TrySetTopmost(value)` to distinguish
`Accepted`, `Unsupported`, `Closed` and `Failed` on an open window.
`Capabilities` reports operations supported by the current host, or `None` before
opening. Windows, macOS and X11 expose visibility, passive show, focusability and
topmost requests. Wayland exposes visibility but reports the other three as
unsupported for top-level windows. Final activation and stacking remain subject
to desktop policy. Embedded hosts own their viewport lifecycle and return
`Unsupported` for `Show` and `Hide`.

Modal windows must open visible and focusable with a visible owner. `Hide` returns
`Unsupported` for a modal window or an owner blocked by a modal child or chooser.
Close the modal window to release its owner. This prevents an invisible modal
window from retaining the input block.

## Platform preferences

`Window.Preferences` is an immutable `PlatformPreferences` snapshot.
`Theme` is `Unknown`, `Light` or `Dark`. `ReducedMotion`, `HighContrast` and
`TextScaleFactor` are nullable so unsupported values remain distinct from false
or the default scale. Text scale must be finite and positive and is independent
of display density. It affects text measurement, shaping and geometry, including
explicit font sizes and styled spans, without changing declared sizes or DPI.

Subscribe to `PreferencesChanged` on the owner thread. Equal snapshots do not
notify. Goo updates its layout and motion policy before calling subscribers.
Applications choose theme colors and contrast styling from the snapshot.
Reduced motion settles animations and transitions and stops automatic vector
playback at its current frame. Completed animations require a new target. A later
rebuild or rebind can resume vector playback when the preference permits it.
Embedded adapters publish snapshots with `EmbeddedWindowHost.UpdatePreferences`,
before or after attaching the window.

Desktop theme follows SDL system theme notifications. The desktop event loop also
refreshes available preferences at most once per second. Windows reports client
area animation and high contrast settings. macOS reports reduced motion and
increased contrast. Desktop text scale remains unknown when the backend cannot
report it. Android reports theme, font scale and disabled animations on attach,
resume and configuration changes. Other unsupported preferences remain unknown.

## Native owned and modal windows

Portal backends can set `ForeignParentHandle` to the request's full
`wayland:<HANDLE>` parent identifier before `Open`. Do not combine it with `Owner`.
Set `Modal` to request a native modal hint for that foreign parent. Goo imports the
surface through xdg-foreign-v2 before mapping its window and releases the import on
hide or close. Showing again imports the handle again. An expired handle, unsupported
identifier, unavailable importer, or incompatible native payload leaves a usable
unparented window. Modal hints require compositor xdg-dialog-v1 support. Goo cannot
block input in another process. Parent destruction removes the foreign relationship
without closing the Goo window. The bundled Linux SDL shared and static archives
provide the same bridge, including NativeAOT consumers.

Set `Owner` and optional `Modal: true` before `Open`. The owner must already be
open on the same UI thread. Both windows must use desktop hosts; embedded
viewports explicitly reject these relationships. Self-ownership and cycles are
rejected before native creation. Existing independent windows remain the default.

```gsharp
let owner = Window{Title: "Main", Width: 800, Height: 600, Root: MainCell{}}.Open()
let dialog = Window{Title: "Settings", Width: 420, Height: 280,
  Owner: owner, Modal: true, Root: SettingsCell{}}.Open()
owner.Run()
```

`Owner` and `Modal` cannot change while open. One direct modal child may be open
per owner; use that modal window as the owner of another nested dialog. A modeless
child does not block its owner. `IsInputBlocked` reports the direct modal block:
queued native input is discarded, `ElementHandle.Focus` and accessibility actions
return false, and modifying `PlatformInput` operations throw while blocked.
Cancellation, key release, and focus clearing remain available for cleanup.
Activation requests for a blocked owner are forwarded to its active modal child.

SDL establishes the native parent and modal relationship before showing the
child. The desktop controls stacking, taskbar grouping, minimizing/hiding and
activation policy; child `State` is not a copy of owner `State`. Closing a modal
restores the previous owner element's focus when it remains mounted and requests
native owner activation. A compositor may deny focus or raising requests.

Once the owner's `OnClosing` accepts closure, Goo tears down every owned
descendant before destroying the owner's native window, waiting for GPU work
without blocking the shared frame loop. Descendant `OnClosing` callbacks do not
veto this forced teardown; put application-wide save/close policy on the owner.
A child's normal `RequestClose` still invokes its own policy. Owned window trees
cannot gain new children after teardown begins. Native failures establishing
ownership/modality throw `NotSupportedException` with the SDL error and clean up
the partially created child. Windows and macOS use the same SDL contract; native
verification must be performed on the target desktop.

Generated from `Goo.xml`. Source declarations supply type ownership and XML-emitter omissions.

Source: [`Goo/Window`](https://github.com/obselate/goo/tree/main/Goo/Window)

## Native size constraints

`Window.MinWidth`, `MinHeight`, `MaxWidth`, and `MaxHeight` constrain the native
client area in logical window pixels, independently of layout-node constraints.
Zero removes a limit. Values must be nonnegative, and a nonzero maximum must be
at least its corresponding minimum. An invalid assignment leaves the old value.
Set these properties before `Open` or on the window's owner UI thread afterward.
When moving a bounded interval, widen or clear the old bound before crossing it.

`Open` clamps the requested initial size. Later `Width`/`Height` requests are also
clamped. Changing native limits asks SDL to resize an out-of-range client area;
`Width`, `Height`, and `MetricsChanged` reflect the compositor's resulting size
when its queued metrics settle. Limits constrain normal resizing; fullscreen and
window-manager-controlled states remain subject to platform policy. Native
failures throw and leave the corresponding configured limit unchanged.

Embedded hosts own viewport geometry: `Attach` rejects preconfigured limits and
changing a limit on an attached window throws `NotSupportedException`.

## Observe window metrics

Subscribe to `Window.MetricsChanged` on the UI thread. Goo delivers an immutable snapshot after queued native metrics and tree layout settle. A callback can queue UI work, but it must not expect recursive layout.

The snapshot reports the dimensions from the latest native metrics event. A zero framebuffer dimension is reported as zero and its corresponding display scale is zero. Goo keeps the prior render target while minimized or otherwise zero-sized.

Metrics callbacks run after layout and before scene compilation. Publish retained
shader data there when it depends on current `ElementHandle.BorderBox` values.
That publication joins the current paint. Reading a handle during `Build` still
returns the preceding completed layout. Native startup dimensions are snapshots,
not a promise that the compositor has finished changing scale. Continue applying
later metrics notifications, including display and fractional-scale changes.

Equal snapshots do not notify. A listener added after another listener has already received the current snapshot waits for a real change. Removing the final listener resets that listener stream, so a later first listener receives a new initial snapshot.

## Frame pacing and manual capture

`VSync` selects the preferred native presentation mode. `FramePacing` separately
controls `Window.Run`: `Display` is the default and `Uncapped` schedules demanded
frames as soon as the native queue is ready. Uncapped mode does not override a
compositor's presentation policy or render hidden and unavailable windows.

`Pump(dt)` advances simulation by the supplied seconds even when native work is
pending. A manual clock can advance once, then service the window with `Pump(0)`
while `QueueWorkPending` is true. Keep pumping to deliver input, close requests
and posted callbacks. A running animation does not rebuild its owner when its
sampled value is unchanged.

`PresentationAccepted` reports a successful Vulkan queue-present handoff on the
UI thread in a later pump. `FrameIndex` counts accepted presentations for that
window opening. `AcceptedTicks` is the monotonic `Stopwatch` timestamp when Goo
observed acceptance. Neither value identifies display scanout or a screenshot.

After applying a deterministic simulation step and pumping layout, call
`RequestCapture()`. Retry `Busy` or `NotReady` while pumping with zero delta.
Once accepted, call `PollCapture()` until it returns a `WindowCapture`. The result
owns top-left-origin RGBA8 pixels with a byte row stride, sRGB encoding and
premultiplied alpha. A failed readback throws and releases the request. DevTools
and public capture cannot take each other's accepted request.
Stop retrying if the window closes or the request reports a failure status.

Capture replays the current scene offscreen and may submit an additional native
present. It requires an open desktop window and does not capture a specific prior
presentation. Embedded hosts return `Unsupported`. The application owns its
manual clock, sampling of arbitrary scene state, frame ordering and video encoding.

## Fullscreen displays

Call `window.GetDisplays()` on an open window's UI thread for an owned read-only
snapshot of connected desktop displays. Each `WindowDisplay` contains an opaque
`WindowDisplayId`, name, SDL screen-coordinate bounds, optional usable bounds and
expected content scale. Content scale is separate from the current window's
framebuffer scale. IDs can become stale after hotplug or SDL teardown. Embedded
hosts return an empty inventory.

`TrySetFullscreenDisplay(id)` requests borderless fullscreen on that display,
including output changes for an existing fullscreen window. It returns `Accepted`, `Closed`,
`Unsupported` or `Failed`. `Accepted` means SDL accepted the request, not that
the compositor moved the window. A compositor may keep the current output when
an already-fullscreen window is retargeted. A default or disconnected display ID
fails. Use a hidden initial window to inspect the inventory and select an output
before showing it.

KWin 6.7.5 can ignore an output change while fullscreen. To request another
output there, set `State` to `Normal`, wait for `StateChanged` to report
`Normal`, then call `TrySetFullscreenDisplay(id)` again. The app must wait for
the native state event before sending the next request.

Wayland supports fullscreen output selection while normal windowed placement
remains compositor-controlled. This API does not enable `CanMove` or switch the
monitor into an exclusive video mode. `State = WindowState.Fullscreen` remains
available when no explicit output selection is needed.

## Observe window notifications

Subscribe to `StateChanged`, `FocusChanged`, and `KeyPressed` with `+=` on the window UI thread. Each event supports independent listeners. Remove listeners with `-=` when their ownership ends.

`OnClosing` is different: it is the single close-policy callback, and returning `false` vetoes the pending close request.

## Post UI work

Call `Window.Post` from any thread. Accepted actions use FIFO order. Post accepts work before the first `Open`. A pending `RequestClose` still accepts work because `OnClosing` can veto the request.

Use `TryPost` when teardown can race the producer. It returns `false` after posting closes instead of throwing. `true` means the action was atomically accepted into the queue, not that it is guaranteed to execute, because later teardown may still discard queued work.

Each `Pump` drains one fixed accepted batch after close decisions and native metrics, and before input. Posts made while that batch runs wait for the next `Pump`. When native closing or teardown starts, Goo discards queued work. Teardown is terminal and later `Post` calls throw `InvalidOperationException`.

Pump removes an action before it calls the action. If it throws, Pump throws the same exception and later queued actions remain for the next direct `Pump`. `Run` propagates the exception, then closes the window and discards queued work. Accessibility adapters can use `Post` before calling Window accessibility APIs.

## Schedule window timers

Call `SetTimeout(callback, delayMs)` for one callback or `SetInterval(callback, intervalMs)` for repeated callbacks. Both return a `WindowTimer`. The window must be open, and scheduling and `Dispose` must run on its UI thread. A timeout accepts a zero delay; an interval must be greater than zero. Both durations must be finite and nonnegative.

Timers use the window event loop, so callbacks can update UI state directly. The window wakes for the next deadline while idle. Each pump fires due timers once. An overdue interval skips missed periods instead of calling the callback in a burst. Timers scheduled inside a callback wait until a later pump.

Keep the returned timer and call `Dispose` when its owner no longer needs callbacks. `IsActive` reports whether it remains scheduled. A one-shot timer becomes inactive before its callback runs. Closing the window cancels its timers, including those in an embedded window. A timer callback that closes the window stops dispatch of the remaining due callbacks.

## Use the native clipboard

Call `Window.GetClipboardText` and `Window.SetClipboardText` only on the open window's UI thread. Both fail deterministically after close. An empty getter result can mean either an empty clipboard or a native copy failure; setter failures propagate. Built-in text entry and editor shortcuts use the same native clipboard path.

## Native file dialogs

`window.ShowFileDialogAsync(FileDialogKind.OpenFile, options)` opens an owner-modal
native chooser and returns `Task[FileDialogResult]`. `SaveFile` suggests a filename
when `InitialPath` includes one; `Folder` selects directories. `FileDialogOptions`
also accepts a `Title`, `Multiple` for open/folder selection, and `Filters` such as
`FileDialogFilter("Images", "png;jpg")` or `FileDialogFilter("All files", "*")`.
Filters contain extensions, without `*.`. Options are copied at launch. The selected
filter index is `-1` when the backend does not report it.

Call the service on the open owner's UI thread and continue pumping its windows.
The chooser blocks only its owner's Goo input and accessibility actions; independent
windows continue rendering and accepting input. Completion releases modal ownership
and restores the owner's previous focus on the UI thread. Task continuations follow
normal .NET synchronization-context rules. A second chooser or an already-modal
owner is rejected. An accepted owner close cancels the task, requests native dismissal,
and retains the native owner until its callback finishes. `CancelFileDialog()` does
the same cancellation without closing the owner. No selected file is opened or
written by Goo; applications perform their own import/export after success.

`FileDialogResult.Status` distinguishes `Success`, `Cancelled`, `Unsupported`,
`TooLarge`, and `Failed`. Successful paths are immutable, fully qualified owned
strings that remain valid after owner close. Requests allow at most 64 filters, a
256-character title/filter label, a 1,024-character filter pattern, and a
32,768-character initial path. Results allow at most 4,096 paths, 32,768 UTF-16 code
units per path, and 1 MiB of total path code units. Invalid options throw before any
native work; native and result-limit errors return an explicit outcome.

Windows uses the SDL native chooser; macOS uses its native panel. Linux uses the
XDG desktop FileChooser portal through Goo's bundled SDL bridge, preserving the exact
Wayland/X11 owner and supporting `Request.Close` cancellation. A missing portal or
an SDL payload without that bridge reports `Unsupported`. Embedded hosts report
`Unsupported`. Normal native waiting creates no polling timer in Goo; the regular SDL event
pump delivers completion. Windows cancellation briefly retries dismissal until SDL
creates and closes its worker-owned chooser. Windows and macOS require runtime verification on their
respective platforms; the Linux transport has a repeatable two-window fixture in
`tests/Goo.AsyncReadbackSmoke/verify-file-dialogs.py`.

## File and image clipboard data

`GetClipboardFormats()` returns an owned MIME list plus `HasFiles` and `HasImage` without copying image payloads or opening listed files. `ReadClipboardFiles()` and `ReadClipboardImage()` return owned data and an explicit `ClipboardReadStatus`: `Success`, `Empty`, `Unsupported`, `TooLarge`, or `Failed`. `Error` explains failures and exceeded limits. Each call reads the current clipboard; a query and later read are not an atomic snapshot. Applications choose which representation to prefer when both files and images are offered.

Call these methods on the open window's UI thread. Calls before open, after close, or on another thread throw. Embedded windows report `Unsupported` because their clipboard belongs to the host. Clipboard contents are never modified by these methods. Returned paths and bytes survive later clipboard changes and window close and need no disposal.

File reads support local `text/uri-list`, GNOME copied-file lists, Windows `CF_HDROP`, and macOS pasteboard file URLs. Paths retain clipboard order; Goo does not read their contents. URI lists reject remote hosts, relative paths, and NUL characters. Limits are 4096 paths, 32768 UTF-16 units per path, and 1048576 total path units; MIME file-list payloads are limited to 1 MiB.

Image reads prefer PNG, JPEG, GIF, BMP, then macOS TIFF. PNG/JPEG/GIF bytes keep their declared MIME type; a successful transfer does not validate their encoding. Windows DIB/BMP and macOS TIFF are converted to PNG. Every encoded result is limited to 64 MiB. Native bitmap conversion checks dimensions before raster decode, allowing at most 8192 pixels per dimension and 64 MiB of RGBA pixels. These are payload and raster limits, not peak temporary-memory limits. Encoded bytes can be saved directly or passed to an application image-loading workflow.

Linux relies on the active SDL clipboard backend. Windows uses native file-list and DIB access; macOS uses pasteboard items and ImageIO for TIFF conversion. Backend failures are reported explicitly; native Windows/macOS execution requires validation on those systems.
