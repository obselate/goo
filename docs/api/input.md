# Input API

`TextEntry.Value` normally applies only while unfocused. Set `Controlled: true` to accept host value replacements while focused, for example when canceling a draft or changing a formatter. Keep `Value` current in `OnChange`. Replacements retain focus, clamp selections to grapheme boundaries, and do not invoke `OnChange` or `OnSubmit`. An unchanged committed value preserves active IME composition; replacing it cancels that composition without committing its draft.

Generated from `Goo.xml`. Source declarations supply type ownership and XML-emitter omissions.

Source: [`Goo/Input`](../../Goo/Input)

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

Single-line text entry selects a word for counts two and three. TextEditor uses
one for the caret, two for a word, and three for a line. Applications keep control
over what generic double/triple presses do.

## Route keyboard and focus callbacks

`OnKeyDown` and `OnKeyUp` start at the currently focused element and bubble through its parents, so an ancestor can own shortcuts for a subtree. `KeyEvent.StopPropagation()` ends that route before the next ancestor without canceling Goo's default action. `KeyEvent.PreventDefault()` cancels the default action without stopping the remaining callbacks. Both controls are active only during that route; retaining the event value cannot affect a later dispatch.

Key-down defaults run after the route and include text editing, `Tab` or `Shift+Tab` traversal, and `Button` Enter or Space press behavior. Preventing the matching Space key-up cancels release activation. Repeated key downs use the same route with `Repeat: true` and resolve the current focus target again for each repeat.

A focus transfer updates the old and new `Focused` states first, then routes `OnBlur` from the old element to its parents and `OnFocus` from the new element to its parents. These lifecycle callbacks cannot cancel the transfer. `FocusEvent.StopPropagation()` only skips the remaining ancestors. A reentrant focus request from `OnBlur` or `OnFocus` wins over the superseded transfer.

Set `Focusable: true` on a generic Blob. `Button`, `TextEntry`, and `TextEditor` are focusable by default; explicitly setting `Focusable: false` removes them from keyboard focus. During a rebuilt tree update, `AutoFocus` selects the first eligible element only when nothing else holds focus. `Tab` and `Shift+Tab` visit enabled, visible focusables in depth-first tree order and wrap at the ends. An unprevented primary pointer press focuses the deepest focusable element in its hit route. `ElementHandle.Focus()` and `ElementHandle.Blur()` use the same mounted, visible, enabled eligibility rules.

## Mounted focus scopes

Call `ElementHandle.BeginFocusScope(FocusScopeOptions)` after the element mounts,
for example from `MetricsChanged`, and dispose the returned `FocusScope` when an
overlay closes. The visible, enabled root must be focusable. On the next stable
input/tree update, Goo uses the eligible `InitialFocus` handle, an `AutoFocus`
descendant, the first descendant tab stop, or the root when no child accepts
focus. Tab and Shift+Tab wrap within the top scope and skip the scope root unless
it is the fallback. Editors retain their normal Tab indentation behavior.

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

One in-app pointer drag can be active per window. Goo provides no visual drag preview, automatic scrolling, or generic keyboard target navigation. Applications must expose an equivalent keyboard and accessibility action when drag movement affects application state.

### Native file drops

Set `Window.NativeFileDropEnabled = true` before `Open` or on its owning UI thread to receive external file lists through `DropTarget`. `Window.NativeTransferCapabilities` reports support for `FileDrop`, `DropPreview`, `OutboundData`, and `EffectNegotiation`. The supported Windows, Cocoa, and native Wayland hosts support the first two; outbound offers and native effect feedback are unsupported. Closed/embedded windows report `None`; enabling on an unsupported host throws. Native file ingress is off by default. Linux requires Goo's patched SDL payload to preserve file-URI priority when a file manager also offers plain text.

Accept `DragData.Value is NativeFileDrop` with `DragEffect.Copy`. Preview callbacks carry `IsPreview = true` and an empty `Paths` list because SDL does not expose file names until drop. A preview may ultimately be a text offer or an empty/cancelled offer, so it never promises deliverable files. The final query and `Drop` use an immutable owned `Paths` list with `IsPreview = false`. Paths follow the same absolute-path validation and order as clipboard file lists (`text/uri-list` on Linux); Goo does not open or read them. Retaining the payload after drop or window close is safe.

The deepest eligible target accepting Copy receives Enter, Move, and either Drop or Leave. Coordinates are logical window/target coordinates, `PointerId` is -1, and native ingress does not capture a Goo pointer. Leaving, cancellation, disabling ingress, blocking the owner with a modal window, and owner close cancel the preview. Retired or disabled targets receive no stale callbacks. Missing-position, text-only, and malformed offers do not produce a Drop. Native callbacks run on the window UI thread and rebuild their owning Cell through the usual input invalidation path.

The bridge accepts at most 4,096 paths, 32,768 UTF-16 units per path, 1,048,576 total path units, and 131,072 UTF-8 bytes per incoming path. An invalid or oversized path rejects the whole offer and records `Window.LastNativeFileDropError`, cleared by the next offer. No partial list is delivered. SDL's source cursor/effect remains Copy independently of Goo target acceptance; `EffectNegotiation` is absent to expose that backend limit. These rules do not add work to frame painting; disabled windows allocate no transfer state.

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

## `FocusedEditorSnapshot`

Source:

- [`PlatformInput.gs`](../../Goo/Input/PlatformInput.gs)

Captures FocusId, effective UTF-16 Text, SelectionStart, SelectionEnd, CompositionStart, CompositionEnd, IsPassword, IsMultiline, IsReadOnly, and logical CaretArea for one editor. Password text is available only to the trusted host, which must apply platform privacy rules.

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

## `PlatformInput`

Source:

- [`PlatformInput.gs`](../../Goo/Input/PlatformInput.gs)

Routes platform events and semantic editing through the window's existing input system. Call on the window owner thread. Use Window.Post to dispatch from another thread.

### `EditorChanged`

Reports settled focus, text, selection, composition, and caret-area changes.

### `CancelComposition`

Discards preedit and restores the committed value and selection.

### `ClearFocus`

Removes editor focus and cancels transient composition.

### `CommitText(string)`

Replaces the current selection or preedit with committed text.

### `DeleteSurroundingText(int32,int32)`

Deletes UTF-16 lengths outside the union of selection and composition, retaining both. Deletion expands to whole grapheme clusters without committing preedit.

### `Execute(TextCommand)`

Executes shared semantic navigation, editing, clipboard, or submit behavior.

### `FinishComposition`

Commits the existing preedit without changing its text.

### `FocusLost`

Clears editor focus, composition, pressed keys, and pointer capture.

### `KeyPress(Key,KeyModifiers)`

Dispatches a physical key press through the existing keyboard routing.

### `KeyRelease(Key)`

Releases a physical key and stops its repeat state.

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

### `SetSelection(int32,int32)`

Selects effective UTF-16 offsets. Goo expands ranges to whole grapheme clusters. Selection direction and composing ranges remain independent.

### `Editor`

Gets a current immutable snapshot, or nil when no text editor has focus.

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

`Blob.TabStop` defaults to `true`. Set it to `false` on focusable children of a
composite widget to exclude them from sequential Tab navigation while preserving
pointer, `ElementHandle.Focus()`, and accessibility focus. Keep one enabled child
as the tab stop and move focus explicitly for arrow-key navigation.
