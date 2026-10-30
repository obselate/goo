# Input API

Generated from `Goo.xml`. Source declarations supply type ownership and XML-emitter omissions.

Source: [`Goo/Input`](https://github.com/obselate/goo/tree/7d92136cfac8bd76dcb644816e2d85197124574b/Goo/Input)

## Software keyboard hints

```gsharp
TextEntry{
    InputOptions: TextInputOptions{
        Purpose: InputPurpose.Email,
        EnterAction: EnterAction.Next,
        AutofillHints: []string{"emailAddress"},
    },
}
```

- TextEntry and TextEditor pass these hints through `FocusedEditorSnapshot.InputOptions`.
- Android uses them for the keyboard and focused-field autofill.
- Hints do not restrict accepted text.
- Without options, entries request Done and multiline editors request None.
- Desktop ignores the hints except TextEntry password protection.
- Use TextEntry with `InputPurpose.Password` or `Password: true` for masked values.

## Pointer click sequences

`PointerEvent.ClickCount` is 1, 2, or 3 on a press and its matching button release;
movement and cancellation report zero. It counts consecutive presses, saturating
at three, using the same policy as built-in text selection. A sequence requires
the same deepest interactive target and button, less than 400 ms between presses,
and less than four logical window pixels of movement on each axis. Decorative
children inside one control do not split its sequence. This is Goo normalization,
independent of OS double-click preferences or native event counts.

Leaving the movement tolerance, releasing outside the target, explicit capture
release, capture transfer to a different target, cancellation, and focus/input
reset break continuity. PreventDefault does not hide the count. A captured up
still reports its original press count; capture does not turn a drag into a click.
Mouse and pen sequences belong to their pointer contact. Touch contacts end on up,
so separate taps report one; pen proximity cancellation resets its sequence.

TextEntry and TextEditor use one click for the caret, two for a word, and three
for a logical line. A TextEntry line is its entire value. TextEditor line selection
includes the line ending. Word selection keeps grapheme clusters intact and
separates word, whitespace, punctuation, and symbol runs. Underscores belong to
words. Dragging after a double/triple click extends by whole words/lines and
preserves the original selected unit when the pointer reverses direction. Small
pointer movement within the four-pixel tolerance preserves the selection.
Applications keep control over what generic double/triple presses do.

`PointerEvent.IsFromInteractiveChild` identifies a clickable or focusable descendant
below the current handler on a routed down, move, up, or cancel path. A parent can
use it to handle decorative title content while leaving embedded controls alone.
It excludes the current handler itself; unrouted hover notifications report false.

## Route keyboard and focus callbacks

TextEntry and TextEditor have built-in editing keys. No binding setup is needed. Tab and Shift+Tab move focus, except in an editable multiline editor, where they indent and outdent. Enter submits a single-line entry and inserts a newline in an editable multiline editor. Button activation still needs an explicit binding.

```gsharp
controller.UseTabs = false
controller.IndentWidth = 2
controller.TabWidth = 8

TextEditor(controller)
```

Keys match physical `Key` values and exact `Modifiers`. Omitted modifiers mean none. The first matching binding on the nearest element wins. `Action` runs on press. `OnRelease` is paired with that press and runs only if the original target still owns focus, even if modifiers were released first. Changing focus, disabling, or removing the target cancels the pending release. `Repeat: true` repeats the action after 400 ms and then at 30 Hz while focus remains on the original target. It works on any focusable primitive and any key.

Key press precedence is:

1. Routed `OnKeyDown` handlers, from the focused node up to the root.
2. `KeyBindings` on the focused node.
3. Built-in text editing for a focused TextEntry or TextEditor.
4. `KeyBindings` on ancestors.
5. Built-in Tab and Shift+Tab focus traversal.

Any routed `OnKeyDown` handler, including an ancestor's handler, can call `PreventDefault()` to block bindings and built-in defaults. A root handler for app navigation keys must skip events while a text field has focus. Check `window.PlatformInput.Selection != nil`.

An app-root Ctrl+A binding does not replace Select All in a focused text field. Override a field with its own binding or `OnKeyDown`. Existing app-root editing bindings do not run twice.

Movement and deletion repeat. Clipboard, history, submit, Tab, and Escape do not. Shift extends movement selection. Ctrl is the primary and word modifier on Windows and Linux. On macOS, Command is primary and Option moves or deletes words. Primary+A/C/X/V/Z selects all, copies, cuts, pastes, and undoes. Primary+Shift+Z and Ctrl+Y redo. Escape cancels a drag, then composition, then a single-line edit.

Share an application action with `Command(execute, canExecute)`. Assign the same
instance to `Button.Command`, `KeyBinding.Command`, or call `Execute()` from a
menu. `Execute()` checks `CanExecute` each time and returns false when unavailable.
The command takes precedence over `Button.OnClick` and `KeyBinding.Action`. An
unavailable key command consumes its matching binding and does not repeat or arm
its release callback. Button pointer, handle, keyboard activation, and default
accessibility actions use the same command. Rebuild the owning cell when
availability changes so the button's disabled styling, focusability, and
accessibility state update. Invocation checks availability even before that
rebuild. No shortcut is installed by assigning a command. Text operations still
use `TextCommand` through `PlatformInput.Execute` or a text editor controller.

`OnKeyDown` and `OnKeyUp` first bubble from the focused element through its parents. With no focused element they start at the root. Bindings and built-in defaults run after these callbacks. `KeyEvent.StopPropagation()` limits callbacks and binding lookup to the visited elements. `KeyEvent.PreventDefault()` skips bindings and built-in defaults and suppresses direct committed text from that key without stopping callbacks. A handled binding or default also suppresses its direct committed text. Preedit and IME commits remain text input. `KeyEvent.IsComposing` reports active preedit so callbacks can leave its keys to the IME. Bindings and defaults are skipped during preedit, except Escape can cancel it. Both controls expire after dispatch. Repeated callbacks report `Repeat: true`.

Pointer, keyboard, text, and native focus changes share an ordered ingress queue.
Input injected from an input callback runs after the current event finishes.
Synchronous nested focus callbacks preserve the outer event's cancellation
controls. Controls expire when their dispatch finishes and cannot cancel work
after an asynchronous continuation. A failing callback propagates its exception
after terminal pointer, drag, or focus cleanup, and its input event is not replayed.
`PlatformInput.KeyRelease(key, modifiers)` preserves modifiers still held on release.

Use `window.PlatformInput.Execute(TextCommand)` for focused text actions and clipboard access. `Paste` without `Text` reads the clipboard. Supplied paste text keeps `Paste` command interception and its separate undo group. `CancelEdit` restores a TextEntry's value from when it gained focus, reports the change, and blurs it. `CancelComposition` remains a separate action. A TextEditor controller accepts document commands directly.

`SelectWord` and `SelectLine` act at the caret, or at an explicit `TextCommand.Position`.
They work through `PlatformInput.Execute` for either text primitive and through
`TextEditorController.Execute` for an editor. `ExtendSelection` preserves the anchor.
Mouse selection uses the same core operations.

An editable editor uses `InsertTab` for Tab and `Outdent` for Shift+Tab.
`UseTabs` selects literal tabs or spaces. `IndentWidth` sets the space indentation
level and its insertion stops. `TabWidth` sets displayed tab stops without changing
document text. All three settings are per controller. Their defaults preserve
literal tabs and four-column indentation and display.

With no selection, `InsertTab` inserts a literal tab or enough spaces to reach the
next indentation stop. With a selection, `InsertTab` and `Indent` add one level to
every affected logical line. `Outdent` removes leading mixed tab and space
indentation through one indentation stop. A selected range ending at the next
line's start excludes that next line. Each action is one undo step. Source tabs
remain one character for selection, clipboard, caret, and hit testing. Single-line and read-only controls use focus traversal.

Call `window.PlatformInput.MoveFocus(true)` or `MoveFocus(false)` for explicit forward or backward traversal. For buttons, `ElementHandle.Activate()` performs a click. To show a held press and activate on release, bind `Action: () -> { handle.BeginPress() }` and `OnRelease: () -> { handle.EndPress(true) }`. `EndPress(false)` cancels the press. Focus loss, removal, and a canceled or failing key release clear the pressed state.

A focus transfer updates the old and new `Focused` states first, then routes `OnBlur` from the old element to its parents and `OnFocus` from the new element to its parents. These lifecycle callbacks cannot cancel the transfer. `FocusEvent.StopPropagation()` only skips the remaining ancestors. A reentrant focus request from `OnBlur` or `OnFocus` wins over the superseded transfer.

Set `Focusable: true` on a generic Blob. `Button`, `TextEntry`, and `TextEditor` are focusable by default; explicitly setting `Focusable: false` removes them from keyboard focus. During a rebuilt tree update, `AutoFocus` selects the first eligible element only when nothing else holds focus. Calls to `PlatformInput.MoveFocus` visit enabled, visible focusables in depth-first tree order and wrap at the ends. An unprevented primary pointer press focuses the deepest focusable element in its hit route. `ElementHandle.Focus()` and `ElementHandle.Blur()` use the same mounted, visible, enabled eligibility rules.

## Mounted focus scopes

Call `ElementHandle.BeginFocusScope(FocusScopeOptions)` after the element mounts,
for example from `MetricsChanged`, and dispose the returned `FocusScope` when an
overlay closes. The visible, enabled root must be focusable. On the next stable
input/tree update, Goo uses the eligible `InitialFocus` handle, an `AutoFocus`
descendant, the first descendant tab stop, or the root when no child accepts
focus. Tab and explicit `MoveFocus` calls wrap within the top scope and skip the scope
root unless it is the fallback. Editable multiline editors keep Tab for indentation.

`Modal: true` blocks input and accessibility outside the latest modal scope and
any nonmodal scopes opened after it. This lets menus and submenus remain usable
inside a dialog. The accessibility tree omits other background subtrees. Global
`Window.KeyPressed` callbacks are suspended while a modal scope exists. Routed
keyboard, pointer, wheel, and focus callbacks stop at scope boundaries.
Nonmodal scopes contain sequential focus and permit outside input; their widget
supplies outside-click dismissal.

Opening order chooses the active scope. `FocusScope.Order` can order sibling
overlays under the same parent; it does not move elements between parents or
change clipping. Disposal, removal, hiding, or disabling a scope root closes its
registration. Closing an underlying scope preserves the top scope and repairs its
restoration target. `RestoreFocus` defaults to true and restores the prior target
only if it remains eligible in the same window and focus has not explicitly moved
to another eligible target outside the closing scope. Restoration runs after the tree
is stable and waits while native focus is absent or an owned native modal blocks
the window. Disposing the window closes all scopes without restoring focus.

## Receive generic text and IME input

A focusable `Blob` can opt into `OnTextInput`, `OnTextComposition`, `OnTextCompositionCancel`, and `OnTextCandidates`. Committed text and composition offsets use UTF-16. Invalid or surrogate-splitting composition selections are delivered as the empty range. Candidate snapshots are read-only and use `SelectedCandidate = -1` when native selection is invalid.

`PlatformInput.CommitText` reports success when it delivers nonempty text to a focused generic `OnTextInput` callback, even if that callback changes focus. A focused generic element without `OnTextInput` does not accept committed text.

Callbacks run only for the currently focused, enabled, visible client. Queued text is bound to the focus generation that received it, so it is discarded after a focus transfer, including a transfer back to the original element. `TextEntry` and `TextEditor` retain their existing default behavior before these observers run. Goo provides no candidate UI; applications own candidate presentation.

## Receive pointer lifecycle and pressure input

`OnPointerEnter` and `OnPointerLeave` are sparse, non-bubbling lifecycle callbacks. They run only for mouse hover-route changes. Goo sends leaves from the old route leaf to root, then enters from the new route root to leaf. Shared route ancestors receive neither callback. Removal, disable, hidden state, focus loss, and transformed hit routes use the same order.

`PointerEvent.IsPrimary` is true for the mouse and the first active touch or pen contact in a device-type sequence. The primary contact stays primary through its up callback. Goo does not promote another held contact during that sequence.

`PointerEvent.Pressure` is normalized to the inclusive range from 0 to 1. Mouse pressure is 1 only while the primary button is held and 0 otherwise. Touch samples every SDL down, move, and up event. Pen samples its latest pressure-axis value on the next down, move, up, or pen-button event. A pressure-axis event alone emits no `PointerMove`. A pen proximity-out clears that pen's sampled pressure. Goo does not coalesce movement or expose tilt, twist, contact geometry or raw history. Shared recognizers participate through the gesture arbitration contract below.

## Transfer data within a Goo window

Attach an optional `DragSource` or `DropTarget` descriptor to a `Blob`. Goo records a source candidate after an unclaimed primary press. It calls `DragSource.Create` once when movement reaches `Window.DragStartDistance` logical pixels on either axis. Touch contacts start at four logical pixels. Returning null rejects the drag and preserves normal click behavior. Returning `DragData` captures the initiating pointer and suppresses its click.

`DragData.AllowedEffects` must contain `Copy`, `Move`, or both. A target query accepts by returning exactly one allowed effect. Any other value is treated as `None`. Goo hit-tests independently of source capture, honors clipping and transforms, and walks from the deepest target to its ancestors. It queries again when pointer modifiers change, after input-affecting tree updates, and immediately before release. A target with no `Changed` callback can accept a no-op drop through `Query`.

Pass `true` as the third `DropTarget` constructor argument when a target must own the hovered area even if it rejects the drag. `StopAncestorRouting` then prevents a parent target from accepting that rejected drop while the child remains mounted and enabled. The default is `false`; both in-window and native file-drop routing use the same rule.

The selected target receives `Enter`, `Move`, `Leave`, and `Drop` snapshots through `Changed`. Positions are current target-local and logical-window coordinates. A successful `Drop` remains successful when its callback removes or reparents the target or source. Goo makes no further callback to a detached owner.

Call `window.PlatformInput.CancelDrag()` to cancel the session, and bind Escape explicitly when desired. Pointer cancellation, focus loss, window close, source removal or disablement, and callback failure also cancel it. Internal termination and capture cleanup run once. `DragSource.End` runs at most once only while its source remains mounted. Goo strongly retains the payload through an eligible `End`, then releases it. Goo never calls `Dispose` on consumer payloads. Callback cleanup preserves the original exception.

Use `window.PlatformInput.BeginDrag(sourceHandle)` to start the same lifecycle
without a pointer. `UpdateDrag(targetHandle, modifiers)` selects an explicit
mounted target and negotiates from it through its ancestors. `DropDrag()` queries
the target again, delivers the drop, and terminates the session. `CancelDrag()`
cancels either kind of drag. These methods return whether the operation succeeded.
Bind them with ordinary `KeyBindings` callbacks. The consumer chooses target
navigation and key assignments. Handle targets must belong to the same window.

A drag started through `BeginDrag` uses element centers for event positions and
reports `IsPointer: false` in start/target events. It does not press, capture, or
move a pointer. PointerId and Device are not meaningful for that session. It shares
target negotiation, modifiers, cancellation, and cleanup with pointer drags. A
second drag cannot start while a drag or pointer press is active. Only one in-app
drag can be active per window. Goo provides no visual drag preview or automatic
scrolling.

### Native MIME and file drops

```gsharp
let data = TransferData(
    []TransferRepresentation{
        TransferRepresentation("text/plain;charset=utf-8", ReadOnlyMemory[uint8](Encoding.UTF8.GetBytes("Hello")))
    },
    Array.Empty[Uri]()
)
let source = DragSource(
    (_ DragStartEvent) ->
    DragData("selection", DragEffect.Copy | DragEffect.Move){NativeData = data}
)
let result = window.SetNativeDataDropFormats([]string{"text/plain;charset=utf-8", "image/png"})
```

Attach `source` to a `Blob`. Accept `NativeDataDrop` in its destination's `DropTarget`.

| Contract | Behavior |
| --- | --- |
| `NativeDataDrop.Formats` | Offered formats that match the window's exact allow-list. |
| `IsPreview = true` | Formats are available. Bytes and URI references are empty. |
| `IsPreview = false` | All requested bytes and URI references are owned snapshots. |
| `DragSource.End` | At most once while the source stays mounted. Reports `Status`, `Effect` and bounded `Error`. |
| `SourceRemovalRequired` | True when the app must remove its source after Move. Native file moves may already be complete. Goo never deletes sources. |
| `LastNativeTransferStatus` and `LastNativeTransferError` | The latest incoming capture result. |

- Set formats on the open window's UI thread. An empty list disables MIME drops.
- The final query runs after capture. Invalid or oversized data rejects the whole offer.
- Captured data stays valid after the drag or window closes.
- Only a held primary mouse drag can leave the window. Keyboard drags stay in Goo.
- `NativeData` cannot be combined with `NativeFiles`. Setup failure ends a native MIME drag with an explicit status.
- Limits are 128 formats, 64 MiB total, 16 MiB per text format, 1 MiB of URI text and 4096 local file references.

| Host | Native support |
| --- | --- |
| Wayland v3 with Goo's SDL | MIME and file ingress, MIME drag-out, Copy and Move negotiation. |
| Windows | MIME and file ingress, MIME drag-out, Copy and Move negotiation. |
| macOS | MIME and file ingress, MIME drag-out, Copy and Move negotiation. |
| Android, closed or embedded windows | None. |

`Window.NativeTransferCapabilities` reports the loaded host's support.
Missing bridges return `Unsupported`. Goo does not claim support from the OS name alone.

#### File-only drags

```gsharp
window.NativeFileDropEnabled = true
let source = DragSource(
    (_ DragStartEvent) ->
    DragData("selection", DragEffect.Copy, NativeFileDrag(paths))
)
```

- Enable file ingress before `Open` or on the window's UI thread.
- Accept `NativeFileDrop` with Copy. Preview paths are empty. Final paths are owned absolute local paths.
- If MIME ingress is also enabled, a matching MIME offer uses `NativeDataDrop`. Only one Drop is delivered.
- File-only drag-out stays Copy-only. A setup failure keeps the existing in-window drag.
- The file limit is 4096 paths, 32768 UTF-16 units per path and 1048576 total path units.
- Incoming paths are limited to 131072 UTF-8 bytes each. `LastNativeFileDropError` explains a rejected list.

## Composite Tab stops

`Blob.TabStop` defaults to `true`. Set it to `false` on focusable children of a
composite widget to exclude them from sequential Tab navigation while preserving
pointer, `ElementHandle.Focus()`, and accessibility focus. Keep one enabled child
as the tab stop and move focus explicitly for arrow-key navigation.

## Scroll nested and transformed content

Wheel input preserves fractional deltas and platform scroll scaling. `Window.WheelScrollScale` adjusts that distance. When a scroller reaches an edge, unused wheel movement passes to its scrollable ancestors. A disabled child receives no wheel callback, but enabled ancestors can handle and scroll under the pointer. Scrolling does not cross portal or active focus-scope boundaries. `PreventDefault()` suppresses the default scroll operation.

Primary touch begins a pan after eight logical window units when pointer callbacks, capture, text selection, or drag-and-drop have not claimed the interaction. Panning cancels the pending press and click, follows the pointer directly in each scroller's transformed local coordinates, and passes unused movement to ancestors. Recent movement can continue as bounded momentum after release. A new scroll action, input reset, or reduced-motion preference stops momentum. Reduced motion also makes ordinary scroll targets immediate on the next frame.

`ElementHandle.ScrollIntoView()` uses the usable viewport, including reserved scrollbar gutters. Scroll interpolation and momentum run on the owning UI thread through the existing frame clock.

## Participate in touch gesture arbitration

```gsharp
let surface = Container{Gestures: []GestureRecognizer{panRecognizer}}
surface.Handle = ElementHandle()
```

Keep each recognizer instance stable across rebuilds.
Core creates one session for each owner and interaction.

| Rule | Behavior |
| --- | --- |
| `Evaluate` | Read samples and update private state. Do not call app code or retain the input. |
| `Notify` | Deliver the resolved Started, Changed, Completed or Canceled event. |
| Deadline | Return an absolute input time, or positive infinity. Core wakes without continuous rendering. |
| Contact release | The Up sample includes the released contact with `IsDown = false`. |
| Winner | The deepest owner wins. Declaration order breaks a same-owner tie. |
| Default action | A same-owner recognizer wins a tie with scrolling or drag/drop. Deeper defaults keep their region. |
| Threshold | Scroll starts at eight logical units. Touch drag/drop starts at four. |
| Capture | Raw Capture or PreventDefault takes precedence. |
| Stable ownership | A later contact cannot steal a winning interaction. |
| Completion | Suppress losing clicks, selection drags and drops. |
| Cancellation | Native cancel, focus loss, owner loss, replacement and callback failure terminate once. |
| Explicit cancel | `ElementHandle.CancelGestures()` cancels its sessions without replay. |
| Touch editor | Defer caret placement until an unclaimed tap release. Mouse selection stays unchanged. |

Use `PlatformInput.Selection` to read effective positions and affinities.
Use `SetSelection(TextSelection)` to preserve affinities and normalize grapheme boundaries.

## Use shared recognizers

```gsharp
import Goo.Gestures

let navigation = TransformGesture(OnViewportGesture)
let surface = Container{Gestures: []GestureRecognizer{navigation}}
```

Reference `Goo`. Keep the `Goo.Gestures` namespace import.
Keep one TransformGesture for combined pan, pinch and rotation.

| Recognizer | Behavior |
| --- | --- |
| `PanGesture` | Starts after eight logical units. It adds no inertia. |
| `TransformGesture` | Pans with one contact. A second contact adds scale and clockwise rotation. |
| `LongPressGesture` | Starts after 500 ms within eight logical units. Movement can continue after acceptance. |
| `DoubleTapGesture` | Requires two complete taps within 400 ms and four logical units. It defers the first click. |

- Events use Started, Changed, Completed and Canceled phases.
- Transform scale starts at 1. Rotation uses radians.
- Lifting either transform contact ends the gesture. Remaining held contacts stay suppressed.
- `GestureSource.Trackpad` carries SDL's scale-only pinch stream without fake contacts.
- Trackpad rotation returns `GestureRotationStatus.Unsupported`. Contact rotation returns Available.
- The trackpad anchor is the mouse pointer position at gesture start, not a contact centroid.
- SDL 3.4 cannot distinguish a normal trackpad end from native cancellation.



## `Command`

Source:

- [`Command.gs`](https://github.com/obselate/goo/blob/7d92136cfac8bd76dcb644816e2d85197124574b/Goo/Input/Command.gs)

Shares an application action and its current availability across explicit bindings and controls. Rebuild the owning cell when availability changes to update button disabled styling and semantics.

### `new(System.Action,System.Func{bool})`

Creates an application action with an optional availability predicate.

### `Execute`

Rechecks availability and invokes the action. Returns false when unavailable.

### `CanExecute`

Evaluates whether the action can execute now.

## `DoubleTapGesture`

Source:

- [`Gestures.gs`](https://github.com/obselate/goo/blob/7d92136cfac8bd76dcb644816e2d85197124574b/Goo/Input/Gestures/Gestures.gs)

Recognizes two completed direct-touch taps within 400 milliseconds and four logical units. Core defers the first ordinary click only where this recognizer is installed.

### `new(System.Action{Gestures.TapGestureEvent})`

Creates a double-tap recognizer with the shared click-count bounds.

### `CreateSession`

Creates isolated state for one routed interaction.

## `DragData`

Source:

- [`DragDrop.gs`](https://github.com/obselate/goo/blob/7d92136cfac8bd76dcb644816e2d85197124574b/Goo/Input/DragDrop.gs)

Holds the consumer-owned value, allowed effects and optional native representations.

### `new(System.Object,DragEffect)`

Creates drag data for a non-null payload and one or more allowed effects.

- `value`: consumer-owned payload retained for the drag lifetime
- `allowedEffects`: effects that a target may select

### `new(System.Object,DragEffect,NativeFileDrag)`

Creates drag data with an optional native file representation.

- `value`: consumer-owned payload retained for the drag lifetime
- `allowedEffects`: effects that a target may select
- `nativeFiles`: optional local file paths for a Wayland Copy offer when the pointer leaves the window

### `AllowedEffects`

Gets the effects that a target may select.

### `NativeData`

Gets the owned MIME and URI representations offered to native targets. Cannot be combined with NativeFiles.

### `NativeFiles`

Gets the optional native file representation offered after a pointer leaves the window.

### `Value`

Gets the consumer-owned payload.

## `DragEffect`

Source:

- [`DragDrop.gs`](https://github.com/obselate/goo/blob/7d92136cfac8bd76dcb644816e2d85197124574b/Goo/Input/DragDrop.gs)

Selects the effects allowed or accepted by a drag operation.

### Values

- `None`
- `Copy`
- `Move`

## `DragEndEvent`

Source:

- [`DragDrop.gs`](https://github.com/obselate/goo/blob/7d92136cfac8bd76dcb644816e2d85197124574b/Goo/Input/DragDrop.gs)

Describes the terminal source callback for an in-app or native drag.

### `Effect`

Gets the completed effect, or None when canceled.

### `Error`

Gets the bounded native failure message, or an empty string.

### `Kind`

Gets how the operation ended.

### `SourceRemovalRequired`

Gets whether an accepted Move requires application-owned source cleanup. Goo never deletes source data or files.

### `Status`

Gets Success for an accepted drop, Cancelled for cancellation, or the native failure.

## `DragEndKind`

Source:

- [`DragDrop.gs`](https://github.com/obselate/goo/blob/7d92136cfac8bd76dcb644816e2d85197124574b/Goo/Input/DragDrop.gs)

Identifies how a drag operation ended.

### Values

- `Dropped`
- `Canceled`

## `DragEvent`

Source:

- [`DragDrop.gs`](https://github.com/obselate/goo/blob/7d92136cfac8bd76dcb644816e2d85197124574b/Goo/Input/DragDrop.gs)

Describes one callback in the lifetime of an accepting drop target.

### `AllowedEffects`

Gets the effects allowed by the source.

### `Data`

Gets the drag data.

### `Device`

Gets the pointer device type.

### `Effect`

Gets the effect selected by this target, or None while querying.

### `IsPointer`

Reports whether a pointer started this drag. PointerId and Device apply only when true.

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

- [`DragDrop.gs`](https://github.com/obselate/goo/blob/7d92136cfac8bd76dcb644816e2d85197124574b/Goo/Input/DragDrop.gs)

Identifies a drop-target lifecycle callback.

### Values

- `Enter`
- `Move`
- `Leave`
- `Drop`

## `DragSource`

Source:

- [`DragDrop.gs`](https://github.com/obselate/goo/blob/7d92136cfac8bd76dcb644816e2d85197124574b/Goo/Input/DragDrop.gs)

Defines data creation and terminal notification for a drag source.

### `new(System.Func{DragStartEvent,DragData},System.Action{DragEndEvent})`

Creates a source descriptor.

- `create`: callback that creates or rejects drag data when a drag begins
- `end`: optional terminal callback

### `Create`

Gets the callback invoked at the pointer threshold or by PlatformInput.BeginDrag.

### `End`

Gets the optional callback invoked after the operation terminates.

## `DragStartEvent`

Source:

- [`DragDrop.gs`](https://github.com/obselate/goo/blob/7d92136cfac8bd76dcb644816e2d85197124574b/Goo/Input/DragDrop.gs)

Describes the source position and input when an in-app drag begins.

### `Device`

Gets the pointer device type.

### `IsPointer`

Reports whether a pointer started this drag. PointerId and Device apply only when true.

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

- [`DragDrop.gs`](https://github.com/obselate/goo/blob/7d92136cfac8bd76dcb644816e2d85197124574b/Goo/Input/DragDrop.gs)

Defines negotiation and lifecycle callbacks for an in-app drop target.

### `new(System.Func{DragEvent,DragEffect},System.Action{DragEvent})`

Creates a target descriptor.

- `query`: callback that selects one allowed effect or None
- `changed`: optional lifecycle callback

### `new(System.Func{DragEvent,DragEffect},System.Action{DragEvent},bool)`

Creates a target descriptor that can block rejected drops from ancestor targets.

- `query`: callback that selects one allowed effect or None
- `changed`: optional lifecycle callback
- `stopAncestorRouting`: prevents ancestor fallback after this target rejects a drag

### `Changed`

Gets the optional enter, move, leave, and drop callback.

### `Query`

Gets the callback that selects one allowed effect or rejects the drag.

### `StopAncestorRouting`

Gets whether this target blocks ancestor fallback when its query rejects a drag.

## `EnterAction`

Source:

- [`TextInputOptions.gs`](https://github.com/obselate/goo/blob/7d92136cfac8bd76dcb644816e2d85197124574b/Goo/Input/TextInputOptions.gs)

Selects the software keyboard's enter action.

### Values

- `Done`
- `Go`
- `Next`
- `Search`
- `Send`
- `None`

### `Done`

Submits and finishes editing.

### `Go`

Submits navigation input.

### `Next`

Moves focus to the next field.

### `None`

Requests no submit action.

### `Search`

Submits a search.

### `Send`

Submits a message.

## `FocusEvent`

Source:

- [`KeyboardEvent.gs`](https://github.com/obselate/goo/blob/7d92136cfac8bd76dcb644816e2d85197124574b/Goo/Input/KeyboardEvent.gs)

Describes a non-cancelable focus lifecycle callback.

### `StopPropagation`

Stops this lifecycle event before the next ancestor callback. Focus has already changed.

## `FocusScope`

Source:

- [`FocusScope.gs`](https://github.com/obselate/goo/blob/7d92136cfac8bd76dcb644816e2d85197124574b/Goo/Input/FocusScope.gs)

Contains sequential keyboard focus until disposed or its root becomes unavailable. Nested scopes activate in opening order; dispose on the owning window's UI thread.

### `Dispose`

Closes this scope. Focus restoration occurs at the next stable input/tree update.

### `Dispose(bool)`

Closes this scope, optionally suppressing its configured focus restoration. Restoration occurs at the next stable input/tree update.

### `IsActive`

Reports whether the scope remains registered, including an inactive underlying layer.

### `Order`

Gets this scope's opening order among overlapping scopes in this window.

## `FocusScopeOptions`

Source:

- [`FocusScope.gs`](https://github.com/obselate/goo/blob/7d92136cfac8bd76dcb644816e2d85197124574b/Goo/Input/FocusScope.gs)

Configures one mounted focus scope. The root must be focusable for empty-scope fallback.

### `new`

Initializes a nonmodal scope that restores focus on close.

### `InitialFocus`

Requests initial focus within the scope. Otherwise AutoFocus, the first tab stop, or the root is used.

### `Modal`

Blocks input and accessibility outside the top scope while any modal registration is active.

### `RestoreFocus`

Restores prior eligible focus on close unless focus has explicitly moved outside. Defaults to true.

## `FocusedEditorSnapshot`

Source:

- [`PlatformInput.gs`](https://github.com/obselate/goo/blob/7d92136cfac8bd76dcb644816e2d85197124574b/Goo/Input/PlatformInput.gs)

Captures FocusId, effective UTF-16 Text, SelectionStart, SelectionEnd, CompositionStart, CompositionEnd, IsPassword, IsMultiline, IsReadOnly, logical CaretArea, and optional InputOptions for one editor. Password text is available only to the trusted host, which must apply platform privacy rules.

### `InputOptions`

Gets optional software keyboard and autofill hints.

## `GestureCancelReason`

Source:

- [`Gesture.gs`](https://github.com/obselate/goo/blob/7d92136cfac8bd76dcb644816e2d85197124574b/Goo/Input/Gesture.gs)

Explains why a gesture session did not complete normally.

### Values

- `None`
- `LostArbitration`
- `PointerCanceled`
- `FocusLost`
- `OwnerUnavailable`
- `Replaced`
- `Explicit`
- `CallbackFailed`

### `CallbackFailed`

A gesture callback failed.

### `Explicit`

The consumer explicitly canceled the gesture.

### `FocusLost`

The window lost input focus.

### `LostArbitration`

Another interaction acquired the contacts.

### `None`

The transition is not a cancellation.

### `OwnerUnavailable`

The owner was removed, hidden, disabled or blocked.

### `PointerCanceled`

The platform canceled a contact.

### `Replaced`

The owner's recognizer declarations changed.

## `GestureDecision`

Source:

- [`Gesture.gs`](https://github.com/obselate/goo/blob/7d92136cfac8bd76dcb644816e2d85197124574b/Goo/Input/Gesture.gs)

Selects the next arbitration operation without invoking application callbacks.

### Values

- `Pending`
- `Accept`
- `Recognize`
- `Complete`
- `Reject`

### `Accept`

Claims the interaction or updates its current winner.

### `Complete`

Completes an accepted gesture.

### `Pending`

Keeps the session eligible without changing ownership.

### `Recognize`

Claims and completes a discrete gesture.

### `Reject`

Withdraws this session.

## `GestureInput`

Source:

- [`Gesture.gs`](https://github.com/obselate/goo/blob/7d92136cfac8bd76dcb644816e2d85197124574b/Goo/Input/Gesture.gs)

Provides callback-lifetime access to an owner's settled contact samples. Do not retain this object beyond GestureSession.Evaluate.

### `PointerAt(int32)`

Gets a contact sample by arrival order. An invalid index is an argument error.

### `Anchor`

Gets the owner-local pointer anchor for a scale-only trackpad gesture.

### `ChangedPointerId`

Gets the changed contact identifier, or -1 when no contact changed.

### `Kind`

Gets the transition being evaluated.

### `PointerCount`

Gets the number of samples, including the released contact on Up.

### `Scale`

Gets cumulative scale for a trackpad gesture. Contact sessions calculate scale from their samples.

### `Source`

Gets the sample source. Trackpad gestures never create synthetic contacts.

### `TimeSeconds`

Gets monotonic window time in seconds, shared with session deadlines.

### `WindowAnchor`

Gets the logical-window pointer anchor for a scale-only trackpad gesture.

## `GestureInputKind`

Source:

- [`Gesture.gs`](https://github.com/obselate/goo/blob/7d92136cfac8bd76dcb644816e2d85197124574b/Goo/Input/Gesture.gs)

Identifies the input transition evaluated by a gesture session.

### Values

- `Down`
- `Move`
- `Up`
- `Deadline`

### `Deadline`

The session's monotonic deadline was reached.

### `Down`

A contact was pressed, or a trackpad pinch began.

### `Move`

A contact moved, or a trackpad pinch scale changed.

### `Up`

A contact was released, or a trackpad pinch ended.

## `GesturePhase`

Source:

- [`Gesture.gs`](https://github.com/obselate/goo/blob/7d92136cfac8bd76dcb644816e2d85197124574b/Goo/Input/Gesture.gs)

Identifies a gesture callback's lifecycle transition.

### Values

- `Started`
- `Changed`
- `Completed`
- `Canceled`

### `Canceled`

The session was canceled or rejected.

### `Changed`

The accepted session changed.

### `Completed`

The gesture completed normally.

### `Started`

The session acquired the interaction.

## `GesturePointer`

Source:

- [`Gesture.gs`](https://github.com/obselate/goo/blob/7d92136cfac8bd76dcb644816e2d85197124574b/Goo/Input/Gesture.gs)

Describes one contact with stable PointerId, Device, owner-local Position, logical WindowPosition and IsDown state. Up retains its contact through evaluation.

## `GestureRecognizer`

Source:

- [`Gesture.gs`](https://github.com/obselate/goo/blob/7d92136cfac8bd76dcb644816e2d85197124574b/Goo/Input/Gesture.gs)

Declares a reusable recognizer whose mutable state belongs to created sessions.

### `CreateSession`

Creates a distinct session for one mounted owner and interaction.

## `GestureRotationResult`

Source:

- [`Gestures.gs`](https://github.com/obselate/goo/blob/7d92136cfac8bd76dcb644816e2d85197124574b/Goo/Input/Gestures/Gestures.gs)

Reports rotation Status and clockwise Radians. Read Radians only when Status is Available.

## `GestureRotationStatus`

Source:

- [`Gestures.gs`](https://github.com/obselate/goo/blob/7d92136cfac8bd76dcb644816e2d85197124574b/Goo/Input/Gestures/Gestures.gs)

Reports whether rotation data is available from this gesture source.

### Values

- `Available`
- `Unsupported`

### `Available`

Real contact positions provide rotation.

### `Unsupported`

The platform supplies scale without rotation.

## `GestureSession`

Source:

- [`Gesture.gs`](https://github.com/obselate/goo/blob/7d92136cfac8bd76dcb644816e2d85197124574b/Goo/Input/Gesture.gs)

Evaluates input before core resolves ownership, then receives settled lifecycle notifications.

### `Evaluate(GestureInput)`

Updates private recognition state without invoking application callbacks or changing the tree.

### `NextDeadlineSeconds`

Gets the next absolute TimeSeconds deadline, or positive infinity when none is required.

### `Notify(GesturePhase,GestureCancelReason)`

Delivers a resolved transition. Every session receives exactly one terminal notification. Pending rejection also uses Canceled, but need not produce a public recognizer callback.

## `GestureSource`

Source:

- [`Gesture.gs`](https://github.com/obselate/goo/blob/7d92136cfac8bd76dcb644816e2d85197124574b/Goo/Input/Gesture.gs)

Identifies whether samples are direct contacts or a scale-only trackpad gesture.

### Values

- `Touch`
- `Trackpad`

### `Touch`

Provides real contact samples through PointerAt.

### `Trackpad`

Provides cumulative scale and a pointer anchor without contact samples.

## `InputPurpose`

Source:

- [`TextInputOptions.gs`](https://github.com/obselate/goo/blob/7d92136cfac8bd76dcb644816e2d85197124574b/Goo/Input/TextInputOptions.gs)

Selects the software keyboard's input purpose.

### Values

- `Text`
- `Email`
- `Url`
- `Number`
- `Decimal`
- `Phone`
- `Search`
- `Password`

### `Decimal`

Requests a decimal number.

### `Email`

Requests an email address.

### `Number`

Requests an integer.

### `Password`

Requests protected text. Use TextEntry for masked display.

### `Phone`

Requests a telephone number.

### `Search`

Requests search text.

### `Text`

Requests ordinary text.

### `Url`

Requests a URL.

## `Key`

Source:

- [`Key.gs`](https://github.com/obselate/goo/blob/7d92136cfac8bd76dcb644816e2d85197124574b/Goo/Input/Key.gs)

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

## `KeyBinding`

Source:

- [`KeyBinding.gs`](https://github.com/obselate/goo/blob/7d92136cfac8bd76dcb644816e2d85197124574b/Goo/Input/KeyBinding.gs)

Assigns callbacks to one exact physical key and modifier combination.

### `Action`

Gets the callback invoked on key down when Command is absent.

### `Command`

Gets the shared action invoked on key down. An unavailable command consumes the binding.

### `Key`

Gets the physical key to match.

### `Modifiers`

Gets the exact modifiers to match. Omitted modifiers mean no modifiers.

### `OnRelease`

Gets the callback invoked on key up.

### `Repeat`

Enables repeated key downs while this key stays held and its target keeps focus.

## `KeyEvent`

Source:

- [`KeyboardEvent.gs`](https://github.com/obselate/goo/blob/7d92136cfac8bd76dcb644816e2d85197124574b/Goo/Input/KeyboardEvent.gs)

Describes a keyboard callback.

### `PreventDefault`

Prevents assigned key bindings and direct committed text without stopping ancestor callbacks.

### `StopPropagation`

Stops this event before the next ancestor callback and binding without preventing local bindings.

### `IsComposing`

Reports whether platform text composition is active.

### `Key`

Gets the physical key.

### `Modifiers`

Gets the modifier keys held for this event.

### `Repeat`

Reports whether this key down came from Goo key repeat.

## `KeyModifiers`

Source:

- [`KeyModifiers.gs`](https://github.com/obselate/goo/blob/7d92136cfac8bd76dcb644816e2d85197124574b/Goo/Input/KeyModifiers.gs)

Describes the modifier keys for one key press.

### `Alt`

Reports whether Alt is pressed.

### `Ctrl`

Reports whether Ctrl is pressed.

### `Shift`

Reports whether Shift is pressed.

### `Super`

Reports whether Super is pressed.

## `LongPressGesture`

Source:

- [`Gestures.gs`](https://github.com/obselate/goo/blob/7d92136cfac8bd76dcb644816e2d85197124574b/Goo/Input/Gestures/Gestures.gs)

Recognizes a stationary direct-touch hold, then retains ownership until release or cancellation.

### `new(System.Action{Gestures.PressGestureEvent},float64)`

Creates a hold recognizer with eight logical units of movement slop. Duration must be finite and positive, in milliseconds.

### `CreateSession`

Creates isolated state for one routed interaction.

## `NativeDataDrop`

Source:

- [`NativeFileDrop.gs`](https://github.com/obselate/goo/blob/7d92136cfac8bd76dcb644816e2d85197124574b/Goo/Input/NativeFileDrop.gs)

Contains the allowed MIME formats and owned data for one native offer.

### `Data`

Gets captured bytes and URI references, or empty data during preview.

### `Formats`

Gets the offered formats that match the window's exact allow-list.

### `IsPreview`

Gets whether final data is still unavailable.

## `NativeFileDrag`

Source:

- [`NativeFileDrag.gs`](https://github.com/obselate/goo/blob/7d92136cfac8bd76dcb644816e2d85197124574b/Goo/Input/NativeFileDrag.gs)

Owns local file paths for a native Copy offer while DragData.Value stays available to in-window targets.

### `new(System.Collections.Generic.IReadOnlyList{string})`

Creates a native file offer from absolute local paths.

- `values`: absolute local paths to offer in order

### `TryCreate(System.Collections.Generic.IReadOnlyList{string},NativeFileDrag@)`

Tries to create a native file offer without discarding an oversized selection.

- `values`: absolute local paths to offer in order
- `result`: receives the offer, or null when native transfer limits are exceeded

Returns: true when the whole selection can be offered

### `Paths`

Gets the validated, immutable local paths in their original order.

## `NativeFileDrop`

Source:

- [`NativeFileDrop.gs`](https://github.com/obselate/goo/blob/7d92136cfac8bd76dcb644816e2d85197124574b/Goo/Input/NativeFileDrop.gs)

Contains an owned external file list, or an empty preview before the host delivers paths.

### `IsPreview`

Gets whether paths are still unavailable; preview acceptance must not depend on individual files.

### `Paths`

Gets absolute file paths without reading file contents; the list survives the drag and window lifetime.

## `NativeTransferCapabilities`

Source:

- [`NativeFileDrop.gs`](https://github.com/obselate/goo/blob/7d92136cfac8bd76dcb644816e2d85197124574b/Goo/Input/NativeFileDrop.gs)

Reports the native transfer operations supported by an open desktop window.

### Values

- `None`
- `FileDrop`
- `DropPreview`
- `OutboundData`
- `EffectNegotiation`
- `DataDrop`

### `DataDrop`

The host can deliver owned MIME data and URI references to DropTarget.

### `DropPreview`

The host reports drag positions before final transfer data is available.

### `EffectNegotiation`

The host can report a target's negotiated effect back to the source application.

### `FileDrop`

The host can deliver owned external file lists to DropTarget.

### `None`

No native transfer operation is available.

### `OutboundData`

The host can offer application data to other applications.

## `PanAxis`

Source:

- [`Gestures.gs`](https://github.com/obselate/goo/blob/7d92136cfac8bd76dcb644816e2d85197124574b/Goo/Input/Gestures/Gestures.gs)

Restricts pan recognition to both axes or one axis.

### Values

- `Both`
- `Horizontal`
- `Vertical`

### `Both`

Recognizes movement in either direction.

### `Horizontal`

Rejects predominantly vertical movement before activation.

### `Vertical`

Rejects predominantly horizontal movement before activation.

## `PanGesture`

Source:

- [`Gestures.gs`](https://github.com/obselate/goo/blob/7d92136cfac8bd76dcb644816e2d85197124574b/Goo/Input/Gestures/Gestures.gs)

Recognizes direct touch movement without adding scrolling or inertia policy.

### `new(System.Action{Gestures.PanGestureEvent},Gestures.PanAxis)`

Creates a pan recognizer with an eight-logical-window-unit activation distance.

### `CreateSession`

Creates isolated state for one routed interaction.

## `PanGestureEvent`

Source:

- [`Gestures.gs`](https://github.com/obselate/goo/blob/7d92136cfac8bd76dcb644816e2d85197124574b/Goo/Input/Gestures/Gestures.gs)

Reports Phase, owner-local Position, WindowPosition, cumulative Translation, per-update Delta and cancellation Reason for a pan.

## `PlatformInput`

Source:

- [`PlatformInput.gs`](https://github.com/obselate/goo/blob/7d92136cfac8bd76dcb644816e2d85197124574b/Goo/Input/PlatformInput.gs)

Routes platform events and semantic editing through the window's existing input system. Call on the window owner thread. Use Window.Post to dispatch from another thread.

### `EditorChanged`

Reports settled focus, text, selection, composition, and caret-area changes.

### `BeginDrag(ElementHandle,KeyModifiers)`

Starts an in-app drag from a mounted source, using its center as the event position. Uses the source's DragSource callback without pressing or capturing a pointer.

### `CancelComposition`

Discards preedit and restores the committed value and selection.

### `CancelDrag`

Cancels the current in-app drag and releases any pointer capture.

Returns: True when an active drag was canceled.

### `ClearFocus`

Removes editor focus and cancels transient composition.

### `CommitText(string)`

Replaces editor selection or preedit, or delivers text to a focused generic text client.

### `DeleteSurroundingText(int32,int32)`

Deletes UTF-16 lengths outside the union of selection and composition, retaining both. Deletion expands to whole grapheme clusters without committing preedit.

### `DropDrag`

Completes the active drag through its negotiated target and terminal source callback. Calls from the same drag's negotiation or terminal callback return false.

Returns: True when a drop was delivered, or false when no target accepted it.

### `Execute(TextCommand)`

Executes shared semantic navigation, editing, clipboard, submit, or entry CancelEdit behavior. Paste without Text reads the clipboard. Supplied paste text retains Paste interception and undo grouping.

### `FinishComposition`

Commits the existing preedit without changing its text.

### `FocusLost`

Clears editor focus, composition, pressed keys, and pointer capture.

### `KeyPress(Key,KeyModifiers)`

Dispatches a physical key press through the existing keyboard routing.

### `KeyRelease(Key)`

Releases a physical key and stops its repeat state.

### `KeyRelease(Key,KeyModifiers)`

Releases a physical key with the modifiers still held after the release.

### `MoveFocus(bool)`

Moves focus in the retained focus order, independent of editor indentation.

### `PointerCancel(System.Int64,PointerDevice)`

Cancels one pointer, releasing capture without generating a click.

### `PointerMove(System.Int64,PointerDevice,float32,float32,KeyModifiers,float32)`

Moves a platform pointer in window logical coordinates.

### `PointerPress(System.Int64,PointerDevice,float32,float32,PointerButton,KeyModifiers,float32)`

Presses a platform pointer in window logical coordinates.

### `PointerRelease(System.Int64,PointerDevice,float32,float32,PointerButton,KeyModifiers,float32)`

Releases a platform pointer in window logical coordinates.

### `PointerWheel(float32,float32,float32,float32,KeyModifiers)`

Dispatches wheel deltas at a window logical position.

### `SetComposition(string,int32,int32)`

Updates preedit and its selected UTF-16 segment without committing the value.

### `SetCompositionRange(int32,int32)`

Marks an existing effective UTF-16 range as composing text.

### `SetSelection(TextSelection)`

Selects effective UTF-16 positions while preserving both endpoint affinities. Grapheme normalization and composition use the same rules as the offset-only overload.

### `SetSelection(int32,int32)`

Selects effective UTF-16 offsets. Goo expands ranges to whole grapheme clusters. Selection direction and composing ranges remain independent.

### `UpdateDrag(ElementHandle,KeyModifiers)`

Targets a drag started with BeginDrag at an element's center, negotiating with its ancestors. Calls from the same drag's negotiation or terminal callback return false.

Returns: True when a drop target accepts the drag.

### `Editor`

Gets a current immutable snapshot, or nil when no text editor has focus.

### `Selection`

Gets the focused editor's effective selection, preserving endpoint affinities, or nil without an editor.

## `PointerButton`

Source:

- [`PointerButton.gs`](https://github.com/obselate/goo/blob/7d92136cfac8bd76dcb644816e2d85197124574b/Goo/Input/PointerButton.gs)

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

- [`PointerButton.gs`](https://github.com/obselate/goo/blob/7d92136cfac8bd76dcb644816e2d85197124574b/Goo/Input/PointerButton.gs)

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

- [`PointerDevice.gs`](https://github.com/obselate/goo/blob/7d92136cfac8bd76dcb644816e2d85197124574b/Goo/Input/PointerDevice.gs)

Identifies the pointer device type that produced a pointer event.

### Values

- `Mouse`
- `Touch`
- `Pen`

## `PointerEvent`

Source:

- [`PointerEvent.gs`](https://github.com/obselate/goo/blob/7d92136cfac8bd76dcb644816e2d85197124574b/Goo/Input/PointerEvent.gs)

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

### `ClickCount`

Gets the normalized press count (1 to 3) on down and matching up; zero on other events. Counts use the same target, button, 400 ms, and 4 logical pixel policy as text selection.

### `Delta`

Gets movement since the preceding pointer position in the current handler coordinates.

### `Device`

Gets the pointer device type that produced this event.

### `IsFromInteractiveChild`

True when a clickable or focusable descendant is below this handler on the routed path. Applies to down, move, up, and cancel; hover notifications are not routed.

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

## `PressGestureEvent`

Source:

- [`Gestures.gs`](https://github.com/obselate/goo/blob/7d92136cfac8bd76dcb644816e2d85197124574b/Goo/Input/Gestures/Gestures.gs)

Reports Phase, owner-local Position, WindowPosition and cancellation Reason for a held press.

## `TapGestureEvent`

Source:

- [`Gestures.gs`](https://github.com/obselate/goo/blob/7d92136cfac8bd76dcb644816e2d85197124574b/Goo/Input/Gestures/Gestures.gs)

Reports a recognized double tap's owner-local Position and WindowPosition.

## `TextCandidateEvent`

Source:

- [`TextInputEvent.gs`](https://github.com/obselate/goo/blob/7d92136cfac8bd76dcb644816e2d85197124574b/Goo/Input/TextInputEvent.gs)

Describes one native IME candidate-list update with Candidates, SelectedCandidate, and Horizontal layout.

## `TextCompositionEvent`

Source:

- [`TextInputEvent.gs`](https://github.com/obselate/goo/blob/7d92136cfac8bd76dcb644816e2d85197124574b/Goo/Input/TextInputEvent.gs)

Describes transient IME composition Text and its selected UTF-16 SelectionStart and SelectionLength.

## `TextInputOptions`

Source:

- [`TextInputOptions.gs`](https://github.com/obselate/goo/blob/7d92136cfac8bd76dcb644816e2d85197124574b/Goo/Input/TextInputOptions.gs)

Supplies optional platform editing hints. Desktop hosts ignore these except entry password protection.

### `new`

Creates default text input options.

### `AutofillHints`

Gets platform autofill hint names, such as username, password or emailAddress.

### `EnterAction`

Gets the enter action. Defaults to Done.

### `Purpose`

Gets the keyboard purpose. Defaults to Text.

## `TransformGesture`

Source:

- [`Gestures.gs`](https://github.com/obselate/goo/blob/7d92136cfac8bd76dcb644816e2d85197124574b/Goo/Input/Gestures/Gestures.gs)

Recognizes centroid pan, two-contact pinch and rotation as one exclusive interaction.

### `new(System.Action{Gestures.TransformGestureEvent})`

Creates a recognizer which accepts one-contact pan or two separated contacts.

### `CreateSession`

Creates isolated state for one routed interaction.

## `TransformGestureEvent`

Source:

- [`Gestures.gs`](https://github.com/obselate/goo/blob/7d92136cfac8bd76dcb644816e2d85197124574b/Goo/Input/Gestures/Gestures.gs)

Reports Phase, Source, owner-local Center, WindowCenter, cumulative Translation, cumulative Scale, typed Rotation and cancellation Reason.

## `WheelEvent`

Source:

- [`WheelEvent.gs`](https://github.com/obselate/goo/blob/7d92136cfac8bd76dcb644816e2d85197124574b/Goo/Input/WheelEvent.gs)

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
