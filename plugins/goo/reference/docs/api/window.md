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

## `Window`

Sources:

- [`Window.gs`](../../Goo/Window/Window.gs)
- [`Window.Accessibility.gs`](../../Goo/Window/WindowParts/Window.Accessibility.gs)
- [`Window.Dispatcher.gs`](../../Goo/Window/WindowParts/Window.Dispatcher.gs)
- [`Window.DragRegion.gs`](../../Goo/Window/WindowParts/Window.DragRegion.gs)
- [`Window.ElementHandle.gs`](../../Goo/Window/WindowParts/Window.ElementHandle.gs)
- [`Window.Frame.gs`](../../Goo/Window/WindowParts/Window.Frame.gs)
- [`Window.Host.gs`](../../Goo/Window/WindowParts/Window.Host.gs)
- [`Window.Images.gs`](../../Goo/Window/WindowParts/Window.Images.gs)
- [`Window.Platform.gs`](../../Goo/Window/WindowParts/Window.Platform.gs)
- [`Window.Retained.gs`](../../Goo/Window/WindowParts/Window.Retained.gs)

Hosts a Goo tree on one process-wide UI thread. After Open, only Post and RequestClose are safe from another thread.

### `FocusChanged`

Occurs after the native window focus state changes.

### `KeyPressed`

Occurs for each physical key press before focused-element routing.

### `MetricsChanged`

Occurs after the native window reports a new stable size or display scale. Callbacks run on the window UI thread after native metrics and layout settle.

### `StateChanged`

Occurs after the native window reports a new window state.

### `new`

Creates a window with default configuration.

### `ConfigureApplication(string,string,string)`

Configures process-wide application identity before SDL initialization.

- `name`: human-readable application name
- `version`: application version
- `identifier`: unique reverse-domain identifier

### `DragRegion(Container)`

Marks a container subtree as a native drag region for undecorated windows. Clickable or focusable descendants still win their own pointer input.

- `region`: container to mark

Returns: the same container

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

### `RequestClose`

Queues an idempotent close request. This is safe from any thread.

### `Run`

Opens the window and processes frames until all open Goo windows close.

### `SetClipboardText(string)`

Sets the native clipboard text on the window UI thread. Native set failures throw.

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

### `IsOpen`

Reports whether the window is open.

### `LastAccessibilityError`

Gets the most recent adapter exception. Failed delivery retries on the next UI-thread update.

### `OnClosing`

Gets or sets the close-request handler; return false to veto closure.

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
