# Window API

Generated from `Goo.xml`. Source declarations supply type ownership and XML-emitter omissions.

Source: [`Goo/Window`](../../Goo/Window)

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
let dialog = Window{Title: "Settings", Width: 420, Height: 280, Owner: owner, Modal: true, Root: SettingsCell{}}.Open()
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

## `ClipboardFiles`

Source:

- [`Clipboard.gs`](../../Goo/Window/Clipboard.gs)

Contains an immutable owned file-path list copied from the native clipboard.

### `Error`

Gets a native failure or limit explanation, or an empty string.

### `Paths`

Gets absolute file paths in clipboard order, without reading any file contents.

### `Status`

Gets the read outcome; Empty differs from native failure and unsupported access.

## `ClipboardFormats`

Source:

- [`Clipboard.gs`](../../Goo/Window/Clipboard.gs)

Describes the available clipboard MIME representations without reading payload bytes.

### `Error`

Gets a native failure or limit explanation, or an empty string.

### `Formats`

Gets an immutable owned list of available MIME representations.

### `HasFiles`

Gets whether a supported file-list representation is available.

### `HasImage`

Gets whether a supported image representation is available.

### `Status`

Gets the query outcome.

## `ClipboardImage`

Source:

- [`Clipboard.gs`](../../Goo/Window/Clipboard.gs)

Contains encoded image bytes copied into managed ownership from the clipboard.

### `Bytes`

Gets owned encoded bytes that remain valid after clipboard changes or window close.

### `ContentType`

Gets the declared MIME content type; native bitmaps are normalized to image/png.

### `Error`

Gets a native failure or limit explanation, or an empty string.

### `Status`

Gets the read outcome.

## `ClipboardReadStatus`

Source:

- [`Clipboard.gs`](../../Goo/Window/Clipboard.gs)

Reports a native clipboard query/read outcome independently of payload contents.

### Values

- `Success`
- `Empty`
- `Unsupported`
- `TooLarge`
- `Failed`

## `FileDialogFilter`

Source:

- [`FileDialog.gs`](../../Goo/Window/FileDialog.gs)

Describes one immutable native chooser filter.

### `new(string,string)`

Creates a filter; the chooser validates the bounded label and extension syntax before launch.

- `name`: The user-visible filter label.
- `pattern`: Semicolon-separated extensions or a single asterisk.

### `Name`

Gets the label shown to the user.

### `Pattern`

Gets semicolon-separated extensions, such as png;jpg, or a single * for all files.

## `FileDialogKind`

Source:

- [`FileDialog.gs`](../../Goo/Window/FileDialog.gs)

Selects an open-file, save-file, or folder chooser.

### Values

- `OpenFile`
- `SaveFile`
- `Folder`

## `FileDialogOptions`

Source:

- [`FileDialog.gs`](../../Goo/Window/FileDialog.gs)

Supplies optional native chooser hints, copied when the request starts.

### `new`

Creates options with native defaults and single selection.

### `Filters`

Gets up to 64 filters; folder dialogs reject nonempty filters.

### `InitialPath`

Gets the initial absolute directory or full file path; include a filename for a save suggestion.

### `Multiple`

Gets whether open-file and folder dialogs may select multiple entries; save dialogs reject true.

### `Title`

Gets the optional title; empty uses the platform default.

## `FileDialogResult`

Source:

- [`FileDialog.gs`](../../Goo/Window/FileDialog.gs)

Contains owned native chooser results without opening or writing any selected file.

### `Error`

Gets a native failure or limit explanation, or an empty string.

### `FilterIndex`

Gets the selected filter index, or -1 when the backend does not report it.

### `Paths`

Gets the immutable absolute paths selected by the user, valid after owner close.

### `Status`

Gets the request outcome.

## `FileDialogStatus`

Source:

- [`FileDialog.gs`](../../Goo/Window/FileDialog.gs)

Distinguishes selected paths, cancellation, unavailable backends, excessive results, and native failures.

### Values

- `Success`
- `Cancelled`
- `Unsupported`
- `TooLarge`
- `Failed`

## `Window`

Sources:

- [`NativeAccessibilityHost.gs`](../../Goo/Accessibility/Native/NativeAccessibilityHost.gs)
- [`Clipboard.gs`](../../Goo/Window/Clipboard.gs)
- [`FileDialog.gs`](../../Goo/Window/FileDialog.gs)
- [`NativeFileDrop.gs`](../../Goo/Window/NativeFileDrop.gs)
- [`Window.gs`](../../Goo/Window/Window.gs)
- [`Window.Accessibility.gs`](../../Goo/Window/WindowParts/Window.Accessibility.gs)
- [`Window.Activation.gs`](../../Goo/Window/WindowParts/Window.Activation.gs)
- [`Window.Backdrop.gs`](../../Goo/Window/WindowParts/Window.Backdrop.gs)
- [`Window.Dispatcher.gs`](../../Goo/Window/WindowParts/Window.Dispatcher.gs)
- [`Window.Displays.gs`](../../Goo/Window/WindowParts/Window.Displays.gs)
- [`Window.DragRegion.gs`](../../Goo/Window/WindowParts/Window.DragRegion.gs)
- [`Window.ElementHandle.gs`](../../Goo/Window/WindowParts/Window.ElementHandle.gs)
- [`Window.Embedded.gs`](../../Goo/Window/WindowParts/Window.Embedded.gs)
- [`Window.Frame.gs`](../../Goo/Window/WindowParts/Window.Frame.gs)
- [`Window.Host.gs`](../../Goo/Window/WindowParts/Window.Host.gs)
- [`Window.Images.gs`](../../Goo/Window/WindowParts/Window.Images.gs)
- [`Window.Input.gs`](../../Goo/Window/WindowParts/Window.Input.gs)
- [`Window.Ownership.gs`](../../Goo/Window/WindowParts/Window.Ownership.gs)
- [`Window.Platform.gs`](../../Goo/Window/WindowParts/Window.Platform.gs)
- [`Window.Preferences.Layout.gs`](../../Goo/Window/WindowParts/Window.Preferences.Layout.gs)
- [`Window.Preferences.gs`](../../Goo/Window/WindowParts/Window.Preferences.gs)
- [`Window.Retained.gs`](../../Goo/Window/WindowParts/Window.Retained.gs)
- [`Window.SizeConstraints.gs`](../../Goo/Window/WindowParts/Window.SizeConstraints.gs)
- [`Window.Timers.gs`](../../Goo/Window/WindowParts/Window.Timers.gs)
- [`Window.Titlebar.gs`](../../Goo/Window/WindowParts/Window.Titlebar.gs)
- [`Window.Visibility.gs`](../../Goo/Window/WindowParts/Window.Visibility.gs)

Hosts a Goo tree on one process-wide UI thread. After Open or Attach, only Post and RequestClose are safe from another thread.

### `FocusChanged`

Occurs after the native window focus state changes.

### `KeyPressed`

Occurs for each physical key press before focused-element routing.

### `MetricsChanged`

Occurs after the native window reports a new stable size or display scale. Callbacks run on the window UI thread after native metrics and layout settle.

### `PreferencesChanged`

Reports preference changes after affected layout and motion policy are updated on the owner thread.

### `PresentationAccepted`

Occurs on the UI thread through the posted-action queue after Vulkan accepts a present request. Acceptance does not establish a display scanout time.

### `StateChanged`

Occurs after the native window reports a new window state.

### `TitlebarDoubleClicked`

Occurs before a native titlebar double-click performs its default action. Uses platform click-sequence recognition; clickable/focusable content is excluded. Set Handled to replace the action. Subscribe and handle on the window UI thread.

### `VisibilityChanged`

Reports observed viewport visibility changes on the owner thread.

### `new`

Creates a window with default configuration.

### `Attach(EmbeddedWindowHost)`

Attaches this window to an external viewport without creating a desktop window. The host attaches its native presentation surface separately and drives RenderFrame.

### `CancelFileDialog`

Cancels delivery of a pending chooser result on the UI thread and requests native dismissal where available. Native ownership remains active until the platform callback returns.

Returns: True when a pending native chooser exists, including one already awaiting dismissal.

### `ConfigureApplication(string,string,string)`

Configures process-wide application identity before SDL initialization.

- `name`: human-readable application name
- `version`: application version
- `identifier`: unique reverse-domain identifier

### `DragRegion(Container)`

Marks a container subtree as a native drag region for undecorated windows. Clickable or focusable descendants still win their own pointer input.

- `region`: container to mark

Returns: the same container

### `GetClipboardFormats`

Queries MIME availability without reading image bytes or file contents.

Returns: An owned format list and explicit query status.

### `GetClipboardText`

Gets the current native clipboard text on the window UI thread. An empty result can mean an empty clipboard or native copy failure.

### `GetDisplays`

Gets an immutable snapshot of the current host's displays. Open the window first and call on its UI thread. IDs can become stale after hotplug or SDL restart. Embedded hosts return an empty list.

### `Hide`

Hides an open desktop window and cancels transient input without destroying its tree. Modal windows and owners blocked by a modal child or chooser cannot be hidden.

### `Open`

Creates the native window and returns this window.

Returns: this window after native initialization

### `PerformAccessibilityAction(AccessibilityId,AccessibilityActionRequest)`

Routes one platform-neutral accessibility action to a mounted semantic node.

- `id`: The retained semantic node identity.
- `request`: The requested supported operation.

Returns: False when the node is unavailable or the action is unsupported.

### `PollCapture`

Takes a completed capture, or returns nil while it is pending. Failed readback throws and releases this request's ownership.

### `Post(System.Action)`

Queues an action for the UI thread.

- `action`: action to run during the next Pump

### `Pump(float64)`

Processes one frame with the specified elapsed time.

- `dt`: elapsed seconds since the previous frame

### `ReadClipboardFiles`

Reads at most 4096 absolute paths and 1048576 UTF-16 path units from the current clipboard.

Returns: Owned paths and explicit read status; the clipboard may have changed since a format query.

### `ReadClipboardImage`

Reads at most 64 MiB of encoded image data; native bitmap conversion also limits decoded RGBA to 64 MiB.

Returns: Owned encoded bytes with a MIME type and explicit read status.

### `RequestActivation`

Requests restoration of a minimized window, raising, and keyboard activation. Call on the owning UI thread in response to a user action. Desktop policy controls the outcome; observe IsFocused and FocusChanged for actual focus. Maximized/fullscreen state and the focused Goo element are preserved. Redirects to the active modal child. Returns Closed before Open or after close, Unsupported for embedded hosts, nonfocusable windows, or an active native chooser, or Failed if the native request reports an immediate error. Asynchronous policy denials are not reported by the desktop backend. Wayland requests use SDL's xdg-activation token and recent input serial.

### `RequestCapture`

Starts an asynchronous offscreen replay of the current scene. This may submit a native present and does not sample a specific display scanout. Call PollCapture on the UI thread until it returns pixels.

### `RequestClose`

Queues an idempotent close request. This is safe from any thread.

### `Run`

Opens the window and processes frames until all open Goo windows close.

### `SetClipboardText(string)`

Sets the native clipboard text on the window UI thread. Native set failures throw.

### `SetInterval(System.Action,float64)`

Runs a callback repeatedly on the UI thread at the requested interval.

### `SetTimeout(System.Action,float64)`

Runs a callback once on the UI thread after the delay.

### `Show(bool)`

Shows an open desktop window, optionally requesting activation. The mounted tree survives Hide. Activation follows RequestActivation, including modal child routing. Nonfocusable windows show passively. Embedded hosts return Unsupported.

### `ShowFileDialogAsync(FileDialogKind,FileDialogOptions)`

Starts one owner-modal chooser on the open window's UI thread; other windows continue rendering.

- `kind`: The open-file, save-file, or folder chooser to show.
- `options`: Optional title, initial path, filters, and multiple-selection hints copied before launch.

Returns: A task completed on the UI thread with owned paths and an explicit outcome. Await continuations follow normal .NET context rules.

### `TryPost(System.Action)`

Attempts to queue an action for the UI thread. A successful enqueue can still be discarded if teardown begins before the action runs.

- `action`: action to run during a later Pump

Returns: True when the action was accepted into the queue.

### `TrySetFullscreenDisplay(WindowDisplayId)`

Requests borderless fullscreen on the selected display, including retargeting an already-fullscreen window. This must run on the window's UI thread. Returns Closed before Open or after close, Unsupported for embedded hosts, Failed for a stale ID or native failure, and Accepted when SDL accepts the request. Acceptance does not guarantee compositor placement. The compositor may keep the current display when retargeting fullscreen.

### `TrySetTopmost(bool)`

Attempts to submit a topmost request to the current native host. Accepted means the host accepted the request; desktop policy still controls observed stacking.

Returns: Closed, Unsupported, Accepted, or Failed for the host operation.

### `AccessibilityAdapter`

Gets or sets the adapter that receives this window's retained semantic tree.

### `Backdrop`

Gets or sets the native desktop material. Blur requests per-pixel transparency at Open. Enable transparency before opening a window that will toggle blur at runtime. Native policy controls the appearance. Unsupported hosts use BackdropFallbackColor.

### `BackdropAvailable`

Reports whether the open native host accepts blur and currently advertises support. The compositor can still vary or suppress its material according to system policy.

### `BackdropFallbackColor`

Gets or sets the opaque window background used when requested blur is unavailable. Defaults to black. Foreground content is rendered over this color normally.

### `Background`

Gets or sets the window clear color.

### `CanMove`

Reports whether programmatic window movement is available.

### `Capabilities`

Gets supported native lifecycle operations, or None before Open or Attach.

### `Decorated`

Gets or sets whether the system draws window decorations.

### `Focusable`

Gets or sets whether the desktop window may receive keyboard focus. Unsupported hosts throw before changing the requested value. Modal windows must remain focusable.

### `ForeignParentHandle`

Gets or sets a portal parent identifier before Open, such as wayland: followed by an exported surface handle. Unsupported or expired handles leave the window unparented. This cannot be combined with Owner.

### `FramePacing`

Gets or sets the frame pacing used by Window.Run. Uncapped still honors GPU queue readiness and the selected presentation mode.

### `Height`

Gets or sets the window height.

### `IconPng`

Configures PNG bytes for the native window icon in the Window initializer before Open. The icon is decoded when opening, has a 1024 pixel edge limit, and requires no external file.

### `InitiallyVisible`

Gets or sets whether Open shows the desktop window. Configure before Open.

### `IsFocused`

Reports whether the window currently holds native input focus.

### `IsInputBlocked`

Gets whether a modal child or native chooser blocks this window's native, platform, focus, and accessibility input.

### `IsOpen`

Reports whether the window is open.

### `IsVisible`

Gets whether the host currently reports a visible viewport. This does not imply focus or lack of occlusion.

### `LastAccessibilityError`

Gets the most recent adapter exception. Failed delivery retries on the next UI-thread update.

### `LastNativeFileDropError`

Gets the most recent rejected native file-list explanation, cleared when the next offer begins.

### `MaxHeight`

Gets or sets the native client maximum height in logical pixels; zero removes the limit. Must be nonnegative and, when nonzero, no smaller than MinHeight. Embedded hosts are unsupported.

### `MaxWidth`

Gets or sets the native client maximum width in logical pixels; zero removes the limit. Must be nonnegative and, when nonzero, no smaller than MinWidth. Embedded hosts are unsupported.

### `MinHeight`

Gets or sets the native client minimum height in logical pixels; zero removes the limit. Must be nonnegative and no greater than a nonzero MaxHeight. Embedded hosts are unsupported.

### `MinWidth`

Gets or sets the native client minimum width in logical pixels; zero removes the limit. Must be nonnegative and no greater than a nonzero MaxWidth. Embedded hosts are unsupported.

### `Modal`

Gets or sets whether this window is modal to Owner or ForeignParentHandle. Configure before Open. One direct modal child may be open per owner. Nested dialogs use the active modal child as their owner.

### `NativeFileDropEnabled`

Enables native file-drop ingress before Open or on the owning UI thread; disabled by default. Unsupported hosts reject enabling. Disabling cancels any active preview.

### `NativeTransferCapabilities`

Gets the current native transfer capabilities; closed and embedded windows return None.

### `OnClosing`

Gets or sets the close-request handler. Return false to veto closure. Accepted requests do not invoke the handler again while teardown finishes.

### `Owner`

Gets or sets the native owner before Open. The owner must be an open desktop window on the same UI thread. Ownership cannot change while open. Self-ownership and ancestor cycles are rejected.

### `PlatformInput`

Gets the owner-thread platform input and focused-editor contract.

### `Preferences`

Gets the current host snapshot. Unsupported preferences remain unknown.

### `QueueWorkPending`

Reports whether the native target has pending GPU submit or present work. Use Pump(0) to service pending work without advancing the simulation.

### `Resizable`

Gets or sets whether the user can resize the window.

### `ResizeBand`

Gets or sets the undecorated edge resize band in logical pixels.

### `Root`

Gets the root cell.

### `SmoothScrolling`

Enables animated scrolling and touch momentum. The default is true.

### `State`

Gets or sets the window state.

### `Title`

Gets or sets the window title.

### `Topmost`

Gets or sets the requested desktop topmost preference. Unsupported hosts retain the request without changing native stacking. Desktop policy controls the final stacking order.

### `Transparent`

Gets or sets next-open per-pixel alpha. An open window is unchanged. Transparency requires the GPU renderer.

### `VSync`

Gets or sets per-window GPU presentation synchronization. True requests FIFO. Software Vulkan devices prefer Immediate, then Mailbox, then FIFO. False prefers Immediate, then Mailbox, then FIFO on every device. Window.Run pacing is controlled separately by FramePacing.

### `WheelScrollScale`

Scales the platform wheel distance for this window. The default is 1.

### `Width`

Gets or sets the window width.

### `X`

Gets or sets the requested horizontal position.

### `Y`

Gets or sets the requested vertical position.

## `WindowBackdrop`

Source:

- [`Window.Backdrop.gs`](../../Goo/Window/WindowParts/Window.Backdrop.gs)

Selects a native material behind the window's rendered content.

### Values

- `None`
- `Blur`

### `Blur`

Requests compositor blur of the desktop behind this window.

### `None`

No native background effect.

## `WindowCapabilities`

Source:

- [`Window.Visibility.gs`](../../Goo/Window/WindowParts/Window.Visibility.gs)

Reports native lifecycle operations supported by the current host.

### Values

- `None`
- `Visibility`
- `ShowWithoutActivation`
- `Focusability`
- `Topmost`

## `WindowCapture`

Source:

- [`Window.gs`](../../Goo/Window/Window.gs)

Owns RGBA8, sRGB, premultiplied pixels copied from a completed scene capture.

### `Height`

Gets the captured height in pixels.

### `OriginTopLeft`

Reports that the first pixel is at the top left.

### `Pixels`

Gets the caller-owned, top-left-origin RGBA8 pixel array.

### `Premultiplied`

Reports that color channels are premultiplied by alpha.

### `RowBytes`

Gets the row stride in bytes.

### `SrgbEncoded`

Reports that color channels use sRGB encoding.

### `Width`

Gets the captured width in pixels.

## `WindowCaptureRequestStatus`

Source:

- [`Window.gs`](../../Goo/Window/Window.gs)

Reports whether an asynchronous window capture request was accepted.

### Values

- `Accepted`
- `Busy`
- `BudgetExceeded`
- `NotReady`
- `Failed`
- `DeviceLost`
- `Unsupported`

## `WindowDisplay`

Source:

- [`Window.Displays.gs`](../../Goo/Window/WindowParts/Window.Displays.gs)

Describes one display from an immutable SDL inventory snapshot.

### `Bounds`

Gets the display bounds in SDL screen coordinates.

### `ContentScale`

Gets SDL's expected content scale for the display, or zero if SDL cannot provide it. A window scale can differ.

### `Id`

Gets the opaque process-local display ID.

### `Name`

Gets the SDL display name.

### `UsableBounds`

Gets usable non-fullscreen bounds, or nil if SDL could not provide them.

## `WindowDisplayId`

Source:

- [`Window.Displays.gs`](../../Goo/Window/WindowParts/Window.Displays.gs)

Identifies one SDL display in the current process. The value can become stale after display changes.

## `WindowFramePacing`

Source:

- [`Window.gs`](../../Goo/Window/Window.gs)

Controls how Window.Run schedules frames that have visual demand.

### Values

- `Display`
- `Uncapped`

## `WindowMetrics`

Source:

- [`Window.gs`](../../Goo/Window/Window.gs)

Describes one stable window size and display-scale snapshot.

### `DisplayScaleX`

Gets the horizontal framebuffer-to-logical scale.

### `DisplayScaleY`

Gets the vertical framebuffer-to-logical scale.

### `FramebufferHeight`

Gets the reported framebuffer height.

### `FramebufferWidth`

Gets the reported framebuffer width.

### `LogicalHeight`

Gets the reported logical height.

### `LogicalWidth`

Gets the reported logical width.

## `WindowOperationResult`

Source:

- [`Window.Visibility.gs`](../../Goo/Window/WindowParts/Window.Visibility.gs)

Reports whether a window operation was submitted to the host. Accepted does not guarantee that desktop policy grants activation or stacking.

### Values

- `Accepted`
- `Closed`
- `Unsupported`
- `Failed`

## `WindowPresentationAccepted`

Source:

- [`Window.gs`](../../Goo/Window/Window.gs)

Reports a successful queue-present handoff, not display scanout.

### `AcceptedTicks`

Gets the monotonic Stopwatch timestamp when Goo observed that acceptance.

### `FrameIndex`

Gets the one-based accepted presentation number for this window opening.

## `WindowState`

Source:

- [`Window.gs`](../../Goo/Window/Window.gs)

Identifies the requested state of a window.

### Values

- `Normal`
- `Minimized`
- `Maximized`
- `Fullscreen`

## `WindowTimer`

Source:

- [`Window.Timers.gs`](../../Goo/Window/WindowParts/Window.Timers.gs)

A cancellable callback scheduled on a Window's UI thread.

### `Dispose`

Cancels the callback. Call this on the Window's UI thread.

### `IsActive`

Reports whether the callback remains scheduled.

## `WindowTitlebarEvent`

Source:

- [`Window.Titlebar.gs`](../../Goo/Window/WindowParts/Window.Titlebar.gs)

A native double-click on eligible blank space in an undecorated drag region.

### `Handled`

Set true after handling the command to suppress the platform's default action.

### `Position`

Gets the pointer position in logical client coordinates.
