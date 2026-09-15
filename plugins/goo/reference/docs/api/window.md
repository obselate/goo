# Window API

Generated from `Goo.xml`. Source declarations supply type ownership and XML-emitter omissions.

Source: [`Goo/Window`](../../Goo/Window)

## Observe window metrics

Subscribe to `Window.MetricsChanged` on the UI thread. Goo delivers an immutable snapshot after queued native metrics and tree layout settle. A callback can queue UI work, but it must not expect recursive layout.

The snapshot reports the dimensions from the latest native metrics event. A zero framebuffer dimension is reported as zero and its corresponding display scale is zero. Goo keeps the prior render target while minimized or otherwise zero-sized.

Equal snapshots do not notify. A listener added after another listener has already received the current snapshot waits for a real change. Removing the final listener resets that listener stream, so a later first listener receives a new initial snapshot.

## Observe window notifications

Subscribe to `StateChanged`, `FocusChanged`, and `KeyPressed` with `+=` on the window UI thread. Each event supports independent listeners. Remove listeners with `-=` when their ownership ends.

`OnClosing` is different: it is the single close-policy callback, and returning `false` vetoes the pending close request.

## Post UI work

Call `Window.Post` from any thread. Accepted actions use FIFO order. Post accepts work before the first `Open`. A pending `RequestClose` still accepts work because `OnClosing` can veto the request.

Use `TryPost` when teardown can race the producer. It returns `false` after posting closes instead of throwing. `true` means the action was atomically accepted into the queue, not that it is guaranteed to execute, because later teardown may still discard queued work.

Each `Pump` drains one fixed accepted batch after close decisions and native metrics, and before input. Posts made while that batch runs wait for the next `Pump`. When native closing or teardown starts, Goo discards queued work. Teardown is terminal and later `Post` calls throw `InvalidOperationException`.

Pump removes an action before it calls the action. If it throws, Pump throws the same exception and later queued actions remain for the next direct `Pump`. `Run` propagates the exception, then closes the window and discards queued work. Accessibility adapters can use `Post` before calling Window accessibility APIs.

## Use the native clipboard

Call `Window.GetClipboardText` and `Window.SetClipboardText` only on the open window's UI thread. Both fail deterministically after close. An empty getter result can mean either an empty clipboard or a native copy failure; setter failures propagate. Built-in text entry and editor shortcuts use the same native clipboard path.

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
- [`Window.Dispatcher.gs`](../../Goo/Window/WindowParts/Window.Dispatcher.gs)
- [`Window.DragRegion.gs`](../../Goo/Window/WindowParts/Window.DragRegion.gs)
- [`Window.ElementHandle.gs`](../../Goo/Window/WindowParts/Window.ElementHandle.gs)
- [`Window.Embedded.gs`](../../Goo/Window/WindowParts/Window.Embedded.gs)
- [`Window.Frame.gs`](../../Goo/Window/WindowParts/Window.Frame.gs)
- [`Window.Host.gs`](../../Goo/Window/WindowParts/Window.Host.gs)
- [`Window.Images.gs`](../../Goo/Window/WindowParts/Window.Images.gs)
- [`Window.Input.gs`](../../Goo/Window/WindowParts/Window.Input.gs)
- [`Window.Ownership.gs`](../../Goo/Window/WindowParts/Window.Ownership.gs)
- [`Window.Platform.gs`](../../Goo/Window/WindowParts/Window.Platform.gs)
- [`Window.Retained.gs`](../../Goo/Window/WindowParts/Window.Retained.gs)
- [`Window.SizeConstraints.gs`](../../Goo/Window/WindowParts/Window.SizeConstraints.gs)
- [`Window.Titlebar.gs`](../../Goo/Window/WindowParts/Window.Titlebar.gs)

Hosts a Goo tree on one process-wide UI thread. After Open or Attach, only Post and RequestClose are safe from another thread.

### `FocusChanged`

Occurs after the native window focus state changes.

### `KeyPressed`

Occurs for each physical key press before focused-element routing.

### `MetricsChanged`

Occurs after the native window reports a new stable size or display scale. Callbacks run on the window UI thread after native metrics and layout settle.

### `StateChanged`

Occurs after the native window reports a new window state.

### `TitlebarDoubleClicked`

Occurs before a native titlebar double-click performs its default action. Uses platform click-sequence recognition; clickable/focusable content is excluded. Set Handled to replace the action. Subscribe and handle on the window UI thread.

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

### `Open`

Creates the native window and returns this window.

Returns: this window after native initialization

### `PerformAccessibilityAction(AccessibilityId,AccessibilityActionRequest)`

Routes one platform-neutral accessibility action to a mounted semantic node.

- `id`: The retained semantic node identity.
- `request`: The requested supported operation.

Returns: False when the node is unavailable or the action is unsupported.

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

Requests restoration of a minimized window, raising, and keyboard activation. Call on the owning UI thread in response to a user action. Desktop policy controls the outcome; observe IsFocused and FocusChanged for actual focus. Maximized/fullscreen state and the focused Goo element are preserved. Returns Closed before Open or after close, Unsupported for embedded hosts, or Failed if the native request reports an immediate error. Asynchronous policy denials are not reported by the desktop backend. Wayland requests use SDL's xdg-activation token and recent input serial.

### `RequestClose`

Queues an idempotent close request. This is safe from any thread.

### `Run`

Opens the window and processes frames until all open Goo windows close.

### `SetClipboardText(string)`

Sets the native clipboard text on the window UI thread. Native set failures throw.

### `ShowFileDialogAsync(FileDialogKind,FileDialogOptions)`

Starts one owner-modal chooser on the open window's UI thread; other windows continue rendering.

- `kind`: The open-file, save-file, or folder chooser to show.
- `options`: Optional title, initial path, filters, and multiple-selection hints copied before launch.

Returns: A task completed on the UI thread with owned paths and an explicit outcome. Await continuations follow normal .NET context rules.

### `TryPost(System.Action)`

Attempts to queue an action for the UI thread. A successful enqueue can still be discarded if teardown begins before the action runs.

- `action`: action to run during a later Pump

Returns: True when the action was accepted into the queue.

### `AccessibilityAdapter`

Gets or sets the adapter that receives this window's retained semantic tree.

### `Background`

Gets or sets the window clear color.

### `CanMove`

Reports whether programmatic window movement is available.

### `Decorated`

Gets or sets whether the system draws window decorations.

### `Height`

Gets or sets the window height.

### `IsFocused`

Reports whether the window currently holds native input focus.

### `IsInputBlocked`

Gets whether a modal child or native chooser blocks this window's native, platform, focus, and accessibility input.

### `IsOpen`

Reports whether the window is open.

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

Gets or sets whether this window is modal to Owner. Configure before Open; a modal window requires an owner. One direct modal child may be open per owner. Nested dialogs use the active modal child as their owner.

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

### `Resizable`

Gets or sets whether the user can resize the window.

### `ResizeBand`

Gets or sets the undecorated edge resize band in logical pixels.

### `Root`

Gets the root cell.

### `State`

Gets or sets the window state.

### `Title`

Gets or sets the window title.

### `Transparent`

Gets or sets next-open per-pixel alpha. An open window is unchanged. Transparency requires the GPU renderer.

### `VSync`

Gets or sets per-window GPU presentation synchronization. True requests FIFO. Software Vulkan devices prefer Immediate, then Mailbox, then FIFO. False prefers Immediate, then Mailbox, then FIFO on every device. Window.Run applies internal display-rate pacing for either value.

### `Width`

Gets or sets the window width.

### `X`

Gets or sets the requested horizontal position.

### `Y`

Gets or sets the requested vertical position.

## `WindowActivationResult`

Source:

- [`Window.Activation.gs`](../../Goo/Window/WindowParts/Window.Activation.gs)

Reports whether a native window activation request could be submitted. Accepted does not confirm focus; desktop policy may deny or ignore the request.

### Values

- `Accepted`
- `Closed`
- `Unsupported`
- `Failed`

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

## `WindowState`

Source:

- [`Window.gs`](../../Goo/Window/Window.gs)

Identifies the requested state of a window.

### Values

- `Normal`
- `Minimized`
- `Maximized`
- `Fullscreen`

## `WindowTitlebarEvent`

Source:

- [`Window.Titlebar.gs`](../../Goo/Window/WindowParts/Window.Titlebar.gs)

A native double-click on eligible blank space in an undecorated drag region.

### `Handled`

Set true after handling the command to suppress the platform's default action.

### `Position`

Gets the pointer position in logical client coordinates.
