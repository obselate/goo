# Input API

Generated from `Goo.xml`. Source declarations supply type ownership and XML-emitter omissions.

Source: [`Goo/Input`](../../Goo/Input)

## Route keyboard and focus callbacks

`OnKeyDown` and `OnKeyUp` start at the currently focused element and bubble through its parents, so an ancestor can own shortcuts for a subtree. `KeyEvent.StopPropagation()` ends that route before the next ancestor without canceling Goo's default action. `KeyEvent.PreventDefault()` cancels the default action without stopping the remaining callbacks. Both controls are active only during that route; retaining the event value cannot affect a later dispatch.

Key-down defaults run after the route and include text editing, `Tab` or `Shift+Tab` traversal, and `Button` Enter or Space press behavior. Preventing the matching Space key-up cancels release activation. Repeated key downs use the same route with `Repeat: true` and resolve the current focus target again for each repeat.

A focus transfer updates the old and new `Focused` states first, then routes `OnBlur` from the old element to its parents and `OnFocus` from the new element to its parents. These lifecycle callbacks cannot cancel the transfer. `FocusEvent.StopPropagation()` only skips the remaining ancestors. A reentrant focus request from `OnBlur` or `OnFocus` wins over the superseded transfer.

Set `Focusable: true` on a generic Blob. `Button`, `TextEntry`, and `TextEditor` are focusable by default. During a rebuilt tree update, `AutoFocus` selects the first eligible element only when nothing else holds focus. `Tab` and `Shift+Tab` visit enabled, visible focusables in depth-first tree order and wrap at the ends. An unprevented primary pointer press focuses the deepest focusable element in its hit route. `ElementHandle.Focus()` and `ElementHandle.Blur()` use the same mounted, visible, enabled eligibility rules.

## Receive generic text and IME input

A focusable `Blob` can opt into `OnTextInput`, `OnTextComposition`, `OnTextCompositionCancel`, and `OnTextCandidates`. Committed text and composition offsets use UTF-16. Invalid or surrogate-splitting composition selections are delivered as the empty range. Candidate snapshots are read-only and use `SelectedCandidate = -1` when native selection is invalid.

Callbacks run only for the currently focused, enabled, visible client. Queued text is bound to the focus generation that received it, so it is discarded after a focus transfer, including a transfer back to the original element. `TextEntry` and `TextEditor` retain their existing default behavior before these observers run. Goo provides no candidate UI; applications own candidate presentation.

## Receive pointer lifecycle and pressure input

`OnPointerEnter` and `OnPointerLeave` are sparse, non-bubbling lifecycle callbacks. They run only for mouse hover-route changes. Goo sends leaves from the old route leaf to root, then enters from the new route root to leaf. Shared route ancestors receive neither callback. Removal, disable, hidden state, focus loss, and transformed hit routes use the same order.

`PointerEvent.IsPrimary` is true for the mouse and the first active touch or pen contact in a device-type sequence. The primary contact stays primary through its up callback. Goo does not promote another held contact during that sequence.

`PointerEvent.Pressure` is normalized to the inclusive range from 0 to 1. Mouse pressure is 1 only while the primary button is held and 0 otherwise. Touch samples every SDL down, move, and up event. Pen samples its latest pressure-axis value on the next down, move, up, or pen-button event. A pressure-axis event alone emits no `PointerMove`. A pen proximity-out clears that pen's sampled pressure. Goo does not coalesce movement or expose tilt, twist, contact geometry, raw history, or gesture recognition.

## Transfer data within a Goo window

Attach an optional `DragSource` or `DropTarget` descriptor to a `Blob`. Goo records a source candidate after an unclaimed primary press. It calls `DragSource.Create` once when movement reaches four logical pixels. Returning null rejects the drag and preserves normal click behavior. Returning `DragData` captures the initiating pointer and suppresses its click.

`DragData.AllowedEffects` must contain `Copy`, `Move`, or both. A target query accepts by returning exactly one allowed effect. Any other value is treated as `None`. Goo hit-tests independently of source capture, honors clipping and transforms, and walks from the deepest target to its ancestors. It queries again when pointer modifiers change, after input-affecting tree updates, and immediately before release. A target with no `Changed` callback can accept a no-op drop through `Query`.

The selected target receives `Enter`, `Move`, `Leave`, and `Drop` snapshots through `Changed`. Positions are current target-local and logical-window coordinates. A successful `Drop` remains successful when its callback removes or reparents the target or source. Goo makes no further callback to a detached owner.

Escape, pointer cancellation, focus loss, window close, source removal or disablement, and callback failure cancel the session. Internal termination and capture cleanup run once. `DragSource.End` runs at most once only while its source remains mounted. Goo strongly retains the payload through an eligible `End`, then releases it. Goo never calls `Dispose` on consumer payloads. Callback cleanup preserves the original exception.

One pointer drag can be active per window. Goo provides no drag preview, automatic scrolling, native transfer, or generic keyboard target navigation. Applications must expose an equivalent keyboard and accessibility action when drag movement affects application state.

## `DragData`

Source:

- [`DragDrop.gs`](../../Goo/Input/DragDrop.gs)

Holds the consumer-owned value and allowed effects for one in-app drag operation.

### `new(System.Object,DragEffect)`

Creates drag data for a non-null payload and one or more allowed effects.

- `value`: consumer-owned payload retained for the drag lifetime
- `allowedEffects`: effects that a target may select

### `AllowedEffects`

Gets the effects that a target may select.

### `Value`

Gets the consumer-owned payload.

## `DragEffect`

Source:

- [`DragDrop.gs`](../../Goo/Input/DragDrop.gs)

Selects the effects allowed or accepted by an in-app drag operation.

### Values

- `None`
- `Copy`
- `Move`

## `DragEndEvent`

Source:

- [`DragDrop.gs`](../../Goo/Input/DragDrop.gs)

Describes the terminal source callback for one in-app drag operation.

### `Effect`

Gets the completed effect, or None when canceled.

### `Kind`

Gets how the operation ended.

## `DragEndKind`

Source:

- [`DragDrop.gs`](../../Goo/Input/DragDrop.gs)

Identifies how an in-app drag operation ended.

### Values

- `Dropped`
- `Canceled`

## `DragEvent`

Source:

- [`DragDrop.gs`](../../Goo/Input/DragDrop.gs)

Describes one callback in the lifetime of an accepting drop target.

### `AllowedEffects`

Gets the effects allowed by the source.

### `Data`

Gets the drag data.

### `Device`

Gets the pointer device type.

### `Effect`

Gets the effect selected by this target, or None while querying.

### `Kind`

Gets the lifecycle phase.

### `Modifiers`

Gets the modifier keys held for this callback.

### `PointerId`

Gets the stable pointer identifier.

### `Position`

Gets the pointer position in target-local coordinates.

### `WindowPosition`

Gets the pointer position in logical window coordinates.

## `DragEventKind`

Source:

- [`DragDrop.gs`](../../Goo/Input/DragDrop.gs)

Identifies a drop-target lifecycle callback.

### Values

- `Enter`
- `Move`
- `Leave`
- `Drop`

## `DragSource`

Source:

- [`DragDrop.gs`](../../Goo/Input/DragDrop.gs)

Defines payload creation and terminal notification for an in-app drag source.

### `new(System.Func{DragStartEvent,DragData},System.Action{DragEndEvent})`

Creates a source descriptor.

- `create`: callback that creates or rejects drag data at the threshold
- `end`: optional terminal callback

### `Create`

Gets the callback invoked once after the pointer crosses the drag threshold.

### `End`

Gets the optional callback invoked after the operation terminates.

## `DragStartEvent`

Source:

- [`DragDrop.gs`](../../Goo/Input/DragDrop.gs)

Describes the pointer state when a source crosses the drag threshold.

### `Device`

Gets the pointer device type.

### `Modifiers`

Gets the modifier keys held at the threshold.

### `PointerId`

Gets the stable pointer identifier.

### `Position`

Gets the pointer position in source-local coordinates.

### `WindowPosition`

Gets the pointer position in logical window coordinates.

## `DropTarget`

Source:

- [`DragDrop.gs`](../../Goo/Input/DragDrop.gs)

Defines negotiation and lifecycle callbacks for an in-app drop target.

### `new(System.Func{DragEvent,DragEffect},System.Action{DragEvent})`

Creates a target descriptor.

- `query`: callback that selects one allowed effect or None
- `changed`: optional lifecycle callback

### `Changed`

Gets the optional enter, move, leave, and drop callback.

### `Query`

Gets the callback that selects one allowed effect or rejects the drag.

## `FocusEvent`

Source:

- [`KeyboardEvent.gs`](../../Goo/Input/KeyboardEvent.gs)

Describes a non-cancelable focus lifecycle callback.

### `StopPropagation`

Stops this lifecycle event before the next ancestor callback. Focus has already changed.

## `Key`

Source:

- [`Key.gs`](../../Goo/Input/Key.gs)

Identifies a physical keyboard key.

### Values

- `Unknown`
- `Space`
- `Apostrophe`
- `Comma`
- `Minus`
- `Period`
- `Slash`
- `Number0`
- `D0`
- `Number1`
- `Number2`
- `Number3`
- `Number4`
- `Number5`
- `Number6`
- `Number7`
- `Number8`
- `Number9`
- `Semicolon`
- `Equal`
- `A`
- `B`
- `C`
- `D`
- `E`
- `F`
- `G`
- `H`
- `I`
- `J`
- `K`
- `L`
- `M`
- `N`
- `O`
- `P`
- `Q`
- `R`
- `S`
- `T`
- `U`
- `V`
- `W`
- `X`
- `Y`
- `Z`
- `LeftBracket`
- `BackSlash`
- `RightBracket`
- `GraveAccent`
- `World1`
- `World2`
- `Escape`
- `Enter`
- `Tab`
- `Backspace`
- `Insert`
- `Delete`
- `Right`
- `Left`
- `Down`
- `Up`
- `PageUp`
- `PageDown`
- `Home`
- `End`
- `CapsLock`
- `ScrollLock`
- `NumLock`
- `PrintScreen`
- `Pause`
- `F1`
- `F2`
- `F3`
- `F4`
- `F5`
- `F6`
- `F7`
- `F8`
- `F9`
- `F10`
- `F11`
- `F12`
- `F13`
- `F14`
- `F15`
- `F16`
- `F17`
- `F18`
- `F19`
- `F20`
- `F21`
- `F22`
- `F23`
- `F24`
- `F25`
- `Keypad0`
- `Keypad1`
- `Keypad2`
- `Keypad3`
- `Keypad4`
- `Keypad5`
- `Keypad6`
- `Keypad7`
- `Keypad8`
- `Keypad9`
- `KeypadDecimal`
- `KeypadDivide`
- `KeypadMultiply`
- `KeypadSubtract`
- `KeypadAdd`
- `KeypadEnter`
- `KeypadEqual`
- `ShiftLeft`
- `ControlLeft`
- `AltLeft`
- `SuperLeft`
- `ShiftRight`
- `ControlRight`
- `AltRight`
- `SuperRight`
- `Menu`

## `KeyEvent`

Source:

- [`KeyboardEvent.gs`](../../Goo/Input/KeyboardEvent.gs)

Describes a keyboard callback.

### `PreventDefault`

Prevents the default keyboard behavior without stopping ancestor callbacks.

### `StopPropagation`

Stops this event before the next ancestor callback without preventing its default behavior.

### `Key`

Gets the physical key.

### `Modifiers`

Gets the modifier keys held for this event.

### `Repeat`

Reports whether this key down came from Goo key repeat.

## `KeyModifiers`

Source:

- [`KeyModifiers.gs`](../../Goo/Input/KeyModifiers.gs)

Describes the modifier keys for one key press.

### `Alt`

Reports whether Alt is pressed.

### `Ctrl`

Reports whether Ctrl is pressed.

### `Shift`

Reports whether Shift is pressed.

### `Super`

Reports whether Super is pressed.

## `PointerButton`

Source:

- [`PointerButton.gs`](../../Goo/Input/PointerButton.gs)

Identifies the pointer button that changed for an input event.

### Values

- `None`
- `Primary`
- `Secondary`
- `Middle`
- `Back`
- `Forward`

## `PointerButtons`

Source:

- [`PointerButton.gs`](../../Goo/Input/PointerButton.gs)

Identifies the pointer buttons held during an input event.

### Values

- `None`
- `Primary`
- `Secondary`
- `Middle`
- `Back`
- `Forward`

## `PointerDevice`

Source:

- [`PointerDevice.gs`](../../Goo/Input/PointerDevice.gs)

Identifies the pointer device type that produced a pointer event.

### Values

- `Mouse`
- `Touch`
- `Pen`

## `PointerEvent`

Source:

- [`PointerEvent.gs`](../../Goo/Input/PointerEvent.gs)

Describes a pointer input callback.

### `Capture`

Requests pointer capture for the current callback target.

### `PreventDefault`

Prevents the default behavior for this event.

### `ReleaseCapture`

Releases pointer capture held by the current callback target.

### `StopPropagation`

Stops further callback propagation for this event.

### `Button`

Gets the pointer button that changed, or None for movement.

### `Buttons`

Gets the pointer buttons held after the event transition.

### `Delta`

Gets movement since the preceding pointer position in the current handler coordinates.

### `Device`

Gets the pointer device type that produced this event.

### `IsPrimary`

Reports whether this contact is primary for its active device-type sequence.

### `Modifiers`

Gets the modifier keys held for the event.

### `PointerId`

Gets the stable identifier for this pointer while it is connected.

### `Position`

Gets the pointer position in the current handler coordinates.

### `Pressure`

Gets normalized pressure in the inclusive range from 0 to 1.

### `WindowPosition`

Gets the pointer position in logical window coordinates.

## `TextCandidateEvent`

Source:

- [`TextInputEvent.gs`](../../Goo/Input/TextInputEvent.gs)

Describes one native IME candidate-list update with Candidates, SelectedCandidate, and Horizontal layout.

## `TextCompositionEvent`

Source:

- [`TextInputEvent.gs`](../../Goo/Input/TextInputEvent.gs)

Describes transient IME composition Text and its selected UTF-16 SelectionStart and SelectionLength.

## `WheelEvent`

Source:

- [`WheelEvent.gs`](../../Goo/Input/WheelEvent.gs)

Describes a pointer wheel callback.

### `PreventDefault`

Prevents the default behavior for this event.

### `StopPropagation`

Stops further callback propagation for this event.

### `Delta`

Gets the raw platform wheel movement.

### `Modifiers`

Gets the modifier keys held for the event.

### `Position`

Gets the wheel position in the current handler coordinates.

### `WindowPosition`

Gets the wheel position in logical window coordinates.
