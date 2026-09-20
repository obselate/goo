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

`PointerEvent.IsFromInteractiveChild` identifies a clickable or focusable descendant
below the current handler on a routed down, move, up, or cancel path. A parent can
use it to handle decorative title content while leaving embedded controls alone.
It excludes the current handler itself; unrouted hover notifications report false.

## Route keyboard and focus callbacks

Primitives have no automatic keyboard bindings, including editing, submit, button activation, or focus traversal. Assign `KeyBindings` on a primitive or ancestor just like other UI properties. Native text and IME input still insert text independently of physical keys.

```gsharp
TextEditor(controller) {
  KeyBindings: []KeyBinding{
    KeyBinding{ Key: Key.Enter, Action: () -> { submit() } },
    KeyBinding{ Key: Key.Enter, Modifiers: KeyModifiers{ Shift: true },
      Action: () -> { controller.Execute(TextCommand{ Kind: TextCommandKind.Insert, Text: "\n" }) } },
    KeyBinding{ Key: Key.Left, Repeat: true,
      Action: () -> { controller.Execute(TextCommand{ Kind: TextCommandKind.MoveLeft }) } },
  },
}
```

Keys match physical `Key` values and exact `Modifiers`. Omitted modifiers mean none. The first matching binding on the nearest element wins. `Action` runs on press. `OnRelease` is paired with that press and runs only if the original target still owns focus, even if modifiers were released first. Changing focus, disabling, or removing the target cancels the pending release. `Repeat: true` repeats the action after 400 ms and then at 30 Hz while focus remains on the original target. It works on any focusable primitive and any key.

`OnKeyDown` and `OnKeyUp` first bubble from the focused element through its parents. With no focused element they start at the root, so a root Tab binding can acquire initial focus. The matching binding runs after these callbacks. `KeyEvent.StopPropagation()` limits both callbacks and binding lookup to the visited elements. `KeyEvent.PreventDefault()` skips assigned bindings without stopping callbacks. Both controls expire after dispatch. Repeated callbacks report `Repeat: true`.

Use `window.PlatformInput.Execute(TextCommand)` for focused text actions and clipboard access. `Paste` without `Text` reads the clipboard. Supplied paste text keeps `Paste` command interception and its separate undo group. `CancelEdit` restores a TextEntry's value from when it gained focus, reports the change, and blurs it. `CancelComposition` remains a separate action. A TextEditor controller accepts document commands directly.

Bind `window.PlatformInput.MoveFocus(true)` and `MoveFocus(false)` explicitly for forward and backward traversal. For buttons, `ElementHandle.Activate()` performs a click. To show a held press and activate on release, bind `Action: () -> { handle.BeginPress() }` and `OnRelease: () -> { handle.EndPress(true) }`. `EndPress(false)` cancels the press. Focus loss, removal, and a canceled or failing key release clear the pressed state.

A focus transfer updates the old and new `Focused` states first, then routes `OnBlur` from the old element to its parents and `OnFocus` from the new element to its parents. These lifecycle callbacks cannot cancel the transfer. `FocusEvent.StopPropagation()` only skips the remaining ancestors. A reentrant focus request from `OnBlur` or `OnFocus` wins over the superseded transfer.

Set `Focusable: true` on a generic Blob. `Button`, `TextEntry`, and `TextEditor` are focusable by default; explicitly setting `Focusable: false` removes them from keyboard focus. During a rebuilt tree update, `AutoFocus` selects the first eligible element only when nothing else holds focus. Calls to `PlatformInput.MoveFocus` visit enabled, visible focusables in depth-first tree order and wrap at the ends. An unprevented primary pointer press focuses the deepest focusable element in its hit route. `ElementHandle.Focus()` and `ElementHandle.Blur()` use the same mounted, visible, enabled eligibility rules.

## Mounted focus scopes

Call `ElementHandle.BeginFocusScope(FocusScopeOptions)` after the element mounts,
for example from `MetricsChanged`, and dispose the returned `FocusScope` when an
overlay closes. The visible, enabled root must be focusable. On the next stable
input/tree update, Goo uses the eligible `InitialFocus` handle, an `AutoFocus`
descendant, the first descendant tab stop, or the root when no child accepts
focus. Explicit `MoveFocus` bindings wrap within the top scope and skip the scope
root unless it is the fallback. Bind `Indent` and `Outdent` explicitly when an
editor should handle Tab itself.

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

Call `window.PlatformInput.CancelDrag()` to cancel the session, and bind Escape explicitly when desired. Pointer cancellation, focus loss, window close, source removal or disablement, and callback failure also cancel it. Internal termination and capture cleanup run once. `DragSource.End` runs at most once only while its source remains mounted. Goo strongly retains the payload through an eligible `End`, then releases it. Goo never calls `Dispose` on consumer payloads. Callback cleanup preserves the original exception.

One in-app pointer drag can be active per window. Goo provides no visual drag preview, automatic scrolling, or generic keyboard target navigation. Applications must expose an equivalent keyboard and accessibility action when drag movement affects application state.

### Native file drops

Set `Window.NativeFileDropEnabled = true` before `Open` or on its owning UI thread to receive external file lists through `DropTarget`. `Window.NativeTransferCapabilities` reports support for `FileDrop`, `DropPreview`, `OutboundData`, and `EffectNegotiation`. The supported Windows, Cocoa, and native Wayland hosts support the first two; outbound offers and native effect feedback are unsupported. Closed/embedded windows report `None`; enabling on an unsupported host throws. Native file ingress is off by default. Linux requires Goo's patched SDL payload to preserve file-URI priority when a file manager also offers plain text.

Accept `DragData.Value is NativeFileDrop` with `DragEffect.Copy`. Preview callbacks carry `IsPreview = true` and an empty `Paths` list because SDL does not expose file names until drop. A preview may ultimately be a text offer or an empty/cancelled offer, so it never promises deliverable files. The final query and `Drop` use an immutable owned `Paths` list with `IsPreview = false`. Paths follow the same absolute-path validation and order as clipboard file lists (`text/uri-list` on Linux); Goo does not open or read them. Retaining the payload after drop or window close is safe.

The deepest eligible target accepting Copy receives Enter, Move, and either Drop or Leave. Coordinates are logical window/target coordinates, `PointerId` is -1, and native ingress does not capture a Goo pointer. Leaving, cancellation, disabling ingress, blocking the owner with a modal window, and owner close cancel the preview. Retired or disabled targets receive no stale callbacks. Missing-position, text-only, and malformed offers do not produce a Drop. Native callbacks run on the window UI thread and rebuild their owning Cell through the usual input invalidation path.

The bridge accepts at most 4,096 paths, 32,768 UTF-16 units per path, 1,048,576 total path units, and 131,072 UTF-8 bytes per incoming path. An invalid or oversized path rejects the whole offer and records `Window.LastNativeFileDropError`, cleared by the next offer. No partial list is delivered. SDL's source cursor/effect remains Copy independently of Goo target acceptance; `EffectNegotiation` is absent to expose that backend limit. These rules do not add work to frame painting; disabled windows allocate no transfer state.

## Composite Tab stops

`Blob.TabStop` defaults to `true`. Set it to `false` on focusable children of a
composite widget to exclude them from sequential Tab navigation while preserving
pointer, `ElementHandle.Focus()`, and accessibility focus. Keep one enabled child
as the tab stop and move focus explicitly for arrow-key navigation.
