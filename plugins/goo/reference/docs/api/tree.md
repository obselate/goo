# Tree API

Source: [`Goo/Tree`](https://github.com/obselate/goo/tree/main/Goo/Tree)

## Add direct children

```gsharp
let rows = []Blob{Text("Second")}
let content = Container{Gap: 12.0, Text("First"), ...rows, Button{OnClick: () -> Save(), Text("Save")},}
```

- `Member: value` sets a member. Bare children call `Add`. A spread enumerates its source once.
- Values, children and spreads run in source order. Put `BasedOn` before overrides.
- Keys retain identity across moves. Unkeyed children match only at the same absolute sibling index.
- Start with a member when mixing properties and children. Use `Text("Hello")` for plain text.
- `Container{...source}` projects members. Use `Container(){...rows,}` to enumerate only children.
- After a constructor or factory call, unmarked `key: value` calls `Add(key, value)`.
- `Children: existingList` assigns the list. A spread copies its contents.

## Compose and select text

```gsharp
Text("Plain ", TextSpan("styled", Style{FontWeight: 700}), " text")
Text{Content: "Copy this text", Selectable: true}
TextEditor{Controller: controller, Layers: layers}
```

- `Text` concatenates spans. Plain strings use inherited style. Each styled span adds one UTF-16 `TextStyleRange`.
- `Content` and `StyleRanges` remain available for indexed styles.
- `Selectable` supports pointer selection, word and line selection, Shift plus movement, Select All and Copy. It adds focus and accessibility selection, but no caret, editing or IME.
- Set `TextEditor.Controller` and `Virtual.Source` before mounting. Missing values compile but throw `InvalidOperationException` at mount. Editor layers must use the controller's document.
- Ellipsis text has automatic minimum width zero. An explicit `MinWidth` still wins.

## Present content above the normal tree

Use `Portal` for popups, menus, tooltips, and other content that must escape its
declaration-site clipping and transforms. Portal children remain logical children:
keyed reconciliation, Cell disposal, routed events, focus scopes, pointer capture,
and accessibility keep the same ownership path. Their layout and geometry instead
start at the logical window viewport, so `ElementHandle.BorderBox` supplies window
coordinates.

```gsharp
Portal{ZIndex: 20, Container{Width: 240, Height: 160, BackgroundColor: Color.White},}
```

Set `Anchor` for automatic placement from a mounted element's unrounded layout
geometry. Goo rounds the popup origin on the window's device grid.
`Placement` defaults to `BottomStart`:

```gsharp
let trigger = ElementHandle{}
Container{Handle: trigger, Width: 120, Height: 32}
Portal{
    Anchor: trigger,
    Placement: PortalPlacement.BottomStart,
    Container{Width: 240, Height: 160, BackgroundColor: Color.White},
}
```

Set `AnchorRect` to use part of the anchor in its local border-box coordinates.
Set `CollisionBounds` to limit placement to a rectangle in window logical coordinates:

```gsharp
Portal{
    Anchor: trigger,
    AnchorRect: ElementRect{X: 8, Y: 4, Width: 80, Height: 24},
    CollisionBounds: ElementRect{X: 12, Y: 12, Width: 776, Height: 576},
    Container{Width: 240, Height: 160},
}
```

Nil values use the whole anchor and viewport. Collision bounds also cap the Portal's
size. Both properties have no effect without `Anchor`.

Set `HideWhenAnchorClipped: true` to hide a popup when its anchor rectangle scrolls
fully outside its ancestor clips. It stays mounted and keeps keyboard focus, text
composition and edit state. It is not painted, hit-tested or visible to accessibility.
It shows again without rebuilding its content when the anchor returns.
The default is false.

Goo keeps the preferred side when the popup fits. Otherwise it flips if the opposite
side has more space. It then caps the main-axis size to the space between the anchor
edge and the collision edge, so the popup does not cover the anchor. The cross axis
shifts inside the collision bounds. `Start` and `End` on top and bottom placements
follow the Portal's resolved text direction. On left and right placements they mean
top and bottom. Use `Overflow.Scroll` when its content must remain reachable.
Padding on a transparent Portal can provide a gap that follows the popup when it
flips.

Anchoring changes only geometric placement. Logical ownership remains at the
declaration site. Goo observes layout, scrolling, transforms, content size, and
window resize directly, so consumers do not subscribe to handle metrics or rebuild
a Cell to keep placement current. A set anchor that is unmounted, hidden, from a
different Window, a descendant, or part of an anchor dependency cycle suppresses
the Portal until the relationship becomes valid. An unset `Anchor` retains ordinary
window-level Portal placement. Suppression does not dismiss or unmount the Portal.

With `Anchor` set, automatic border-box placement owns the Portal's window position,
including computed outer margin offsets. Authored `Left` and `Top` do not move it
past viewport containment. With `Anchor` unset, ordinary Portal positioning retains
the authored position and margins. Transforms and descendant overflow still use
normal rendering semantics and can extend beyond the contained placement box.

For a manually positioned point popup, use `ElementHandle.RawBorderBox` and
`Window.PixelScale` to retain the anchor's device-pixel phase. Use `BorderBox` for
painted bounds and hit testing.

Each Window owns one automatic overlay shared by all its Portals. It remains inside
that native window; Portal does not create a native child window. The normal tree
paints completely before the overlay. Direct Portal peers are ordered by `ZIndex`;
equal values keep declaration order.

Portal itself is not a pointer target. Input checks its children first and falls
through to the normal tree on an ordinary geometry hit-test miss, not according to
painted pixel alpha. Opacity zero therefore retains normal Goo hit-test behavior.
`Visibility.Hidden` and `Display.None` on a Portal or source ancestor suppress the
Portal. `Disabled` and focus-scope policies follow the logical tree, while source
opacity, overflow clipping, and transforms do not constrain presented geometry.

Portal children do not participate in their source container's Yoga or custom
layout and do not enlarge its scroll extent. Apply size, position, transform,
overflow, and paint styles to the Portal itself when the overlay needs those
semantics. Goo does not infer an anchor from the declaration parent and does not
provide automatic dismissal or a named layer system; compose those policies with
handles, input callbacks, and focus scopes.

## Virtualize large collections

`Virtual{Source: source}` is a scrolling element that mounts only the items that its source places. Goo has no list or grid policy of its own. Goo.Widgets supplies `VirtualItems` for items of one size and `VirtualRows` for rows of measured height. Write a policy when neither fits.

A policy has two parts:

- `VirtualSource` carries the inputs of one build. `State(current)` returns the retained state with these inputs pending, or a new state.
- `VirtualState` is retained for each mounted element. It places the items.

| `VirtualState` member | Purpose |
|---|---|
| `Realize(viewport, output)` | Add each item to mount, and set `ContentSize` and `ItemCount`. |
| `NeedsRealize(viewport)` | Return true when the committed items no longer agree with the viewport. |
| `OffsetOf(viewport, key)` | Return the scroll offset of an item for `ElementHandle.ScrollToItem`. |
| `Commit()` | Make the last `Realize` result current. |
| `Cancel()` | Discard the last `Realize` result and the pending inputs. |
| `Dispose()` | Release the state. |

`Realize` must keep all changes pending until `Commit`. Goo calls `Cancel` when an item fails to mount.

Use [Goo.Widgets VirtualRows](https://github.com/obselate/goo-widgets/blob/main/docs/usage.md#virtual-lists)
for measured rows instead of writing a fixed-row policy.

Items use content coordinates. The origin is the start of the content box at scroll offset zero, so a scroll offset is also the content coordinate at the start of the viewport. Padding is not part of the content size.

| `VirtualItem` member | Meaning |
|---|---|
| `Key` | Stable, nonempty, and unique in one result. |
| `Index` | Position in the whole collection. Goo reports it as `PositionInSet`. |
| `X`, `Y` | Content coordinates. |
| `Width`, `Height` | Nil takes the size from the content. |
| `Content` | Nil keeps the content that is mounted for this key. |

Goo wraps each item in a keyed, absolutely positioned element. The wrapper has the list item role while the `Virtual` element has the list role. An item that leaves the result unmounts through the ordinary lifecycle, including focus, pointer capture, handles, and accessibility state.

`VirtualViewport` gives visible content size, scroll offset, resolved gaps, flex direction and wrap, and mounted items. `Child(index).Size` is the layout size before device-pixel rounding. Use it for measured row offsets. `Measured` is false until current content has a layout. `FocusedChild` contains keyboard focus. Return true from `NeedsRealize` while measurements settle.

Goo calls `NeedsRealize` after each layout and scroll. A true result runs `Realize` again in the same frame, for at most three passes, and then in the next frames.

Set `output.ScrollOffset` to move the scroll position together with the items, for example to keep an anchor row in place when rows above it change size. A scroll in progress keeps its remaining distance. Own tail-following state in the list or log view. `ElementHandle.MetricsChanged` reports scroll range changes, and `JumpTo` can move to the new end before paint.
Set `output.AnchorKey` to the retained visible row key to keep its first surviving content node at the same vertical position after layout. No descendant adjustment is applied at vertical scroll offset zero. Implement `BoundsOf` with measured or estimated item bounds for aligned scrolling.

## Animate computed position changes

Set `Blob.LayoutTransition` to a `LayoutTransition(durationMs, easing)` value to glide a mounted element when its own computed layout slot changes. It is separate from style `TransitionProperties`. The visual rectangle used by painting, hit testing, metrics, descendants, and accessibility moves together. Ordinary scrolling and ancestor-only movement do not start another glide.

## Owned image sources

`Image.Source` and `Style.BackgroundImageSource` accept an `ImageSourceProvider`.
Source takes precedence over Path. A nonempty `Image.Path` without Source throws
when mounted. Load local assets with `ImageSourceCache.LoadAsync` and assign Source.

See [image loading and ownership](../images.md) for loading, decoding, buffer
transfer, provider lifetime and memory-pressure behavior.

Provider updates keep the last-good version visible until a replacement is ready.

## Observe mounted element metrics

Subscribe to `ElementHandle.MetricsChanged` on the UI thread. The immutable snapshot contains `IsMounted`, `BorderBox`, `ContentBox`, `ScrollOffset`, `ScrollRange`, `RawBorderBox`, `IsAtEndX` and `IsAtEndY`, in that positional deconstruction order. `RawBorderBox` is the transformed layout box before device-pixel snapping. Other boxes describe painted geometry in window logical coordinates.

Goo calls listeners after reconciliation, layout, rect refresh, and scroll stepping settle. Detach produces one final `IsMounted = false` snapshot after tree disposal. A detach followed by reattach in the same update reports only the final mounted state.

A new handle subscribed during metrics delivery waits for the next update. Changes to an accepted handle follow live event behavior.

## Control scrolling

Set `OverflowX` or `OverflowY` to `Scroll` and attach an `ElementHandle`. `ScrollTo` updates the smoothed target, `JumpTo` applies an immediate clamped offset, and `ScrollIntoView` adjusts every scrollable ancestor. `ScrollOffset` is the displayed position and `ScrollRange` is the maximum legal X/Y offset.
`JumpTo` calls made by metrics listeners refresh rectangles before the current frame is painted, so a second scroll viewport can follow the reported offset without a one-frame visual delay.

```gsharp
viewport.ScrollToItem(key, ScrollAlignment.Center)
let target = viewport.ScrollOffsetOf(key, ScrollAlignment.End)
let saved = viewport.VisibleAnchor
if let anchor = saved {
    viewport.RestoreAnchor(anchor)
}
```

`ScrollToItem(key, alignment: ScrollAlignment.Start, settle: true)` moves immediately and settles while visible items are measured. `Nearest` moves only enough to reveal the item. An unknown key on a mounted virtual element is held for up to three frames and applied at the first realization that knows it. A later scroll call, user scroll or unmount cancels the request. Set `settle: false` for one immediate move. `RestoreAnchor` also settles while items are measured. `ScrollOffsetOf` returns the measured or estimated target for `ScrollTo` or an animation. `VisibleAnchor` stores the first visible item key and its signed viewport offset.
`IsScrollSettling` reports whether measurement is still correcting the request.

`ScrollTo(y: 0.0)` and `JumpTo(y: 0.0)` keep the horizontal offset. `ScrollToEnd()` animates both scrollable axes to their range ends. `IsAtEndX` and `IsAtEndY` on a handle or metrics snapshot are true when the range is zero or the offset is within one device pixel of its end.

`handle.SelectText(start, end)` focuses a text control and selects UTF-16 offsets `[start, end)`. Before mount, it retains one request until the next mount and layout. A later request replaces it. Unmount clears it. A mounted non-text control returns false.

`ScrollbarVisibility.Auto` shows the built-in Vulkan thumb during wheel, programmatic or drag interaction and then fades it. `Always` keeps it visible and draggable without idle frames. `Hidden` hides only the built-in thumb.

A custom thumb can derive content size as viewport size plus scroll range. Its length is `track * viewport / content`, and its position is `(track - thumb) * offset / range`. Use `JumpTo` while dragging so content stays under the pointer.

For custom text clients, see [custom IME positioning](input.md#position-a-custom-ime).


For decoding, thumbnails and raster density, see [images](../images.md).

## `Blob`


Defines the common surface for Goo-owned declarative elements.

### `Each``1(System.Collections.Generic.IReadOnlyList{T},System.Func{T,string},System.Func{T,Blob})`

Builds one child per item. Children without a key get the item's key. Explicit keys stay unchanged.

- `T`: The item type.
- `items`: The items in child order.
- `itemKey`: Selects a stable, unique sibling key from an item.
- `itemBuilder`: Builds the child for an item.

Returns: Children to spread into a container. Duplicate sibling keys are rejected during reconciliation.

### `Accessibility`

Gets the platform-neutral accessibility declaration for this element.

### `AccessibilityName`

Gets or sets the name without replacing other accessibility fields. An empty name is the default and leaves an absent declaration unset. A later Accessibility declaration replaces all fields.

### `AccessibilityRole`

Gets or sets the role without replacing other accessibility fields. Auto is the default and leaves an absent declaration unset. A later Accessibility declaration replaces all fields.

### `ActiveStyle`

Gets the style that applies while this element is active.

### `AutoFocus`

Requests keyboard focus after mounting while nothing else holds focus.

### `Disabled`

Reports whether this element and its descendants reject input.

### `DisabledStyle`

Gets the style that applies while this element is disabled.

### `DragSource`

Gets the optional in-app drag source descriptor.

### `DropTarget`

Gets the optional in-app drop target descriptor.

### `FocusStyle`

Gets the style that applies while this element has focus.

### `FocusTarget`

Gets the descendant that also resolves FocusStyle while this owner has visible focus. The target need not be focusable. Native focus and accessibility relationships do not change.

### `Focusable`

Reports whether this element can receive keyboard focus.

### `Gestures`

Gets reusable touch recognizers in same-owner arbitration order. Keep declaration instances stable across rebuilds to preserve active sessions.

### `Handle`

Gets the consumer-owned handle attached while this element is mounted.

### `HoverStyle`

Gets the style that applies while the pointer hovers this element.

### `Key`

Gets the stable key within the sibling list.

### `KeyBindings`

Gets explicit key bindings. Focused-element bindings override built-in text editing keys.

### `LayoutTransition`

Gets the opt-in transition for computed layout position changes.

### `OnBlur`

Gets the non-cancelable callback routed after this element or a descendant loses focus.

### `OnClick`

Gets the action that runs when the element is clicked.

### `OnFocus`

Gets the non-cancelable callback routed after this element or a descendant gains focus.

### `OnKeyDown`

Gets key-down callbacks routed from this focused element or a focused descendant.

### `OnKeyUp`

Gets key-up callbacks routed from this focused element or a focused descendant.

### `OnPointerCancel`

Gets the callback that receives pointer cancellation.

### `OnPointerDown`

Gets the callback that receives each pointer button press.

### `OnPointerDrag`

Gets the callback for a captured primary-pointer drag. Hover does not invoke it. Touch drags wait for movement in PointerDragAxis. An enclosing scroller claims movement along its scroll axis first. After a drag starts, the press does not produce OnClick.

### `OnPointerEnter`

Gets the non-bubbling lifecycle callback after this element enters the mouse hover route.

### `OnPointerLeave`

Gets the non-bubbling lifecycle callback after this element leaves the mouse hover route.

### `OnPointerMove`

Gets the callback that receives each pointer movement.

### `OnPointerUp`

Gets the callback that receives each pointer button release.

### `OnTextCandidates`

Gets the callback that receives native IME candidate updates while this element has focus.

### `OnTextComposition`

Gets the callback that receives transient IME composition updates while this element has focus.

### `OnTextCompositionCancel`

Gets the callback that receives native IME composition cancellation while this element has focus.

### `OnTextInput`

Gets the callback that receives committed UTF-16 text while this element has focus.

### `OnWheel`

Gets the callback that receives pointer wheel movement.

### `PointerDragAxis`

Gets the axis measured by the threshold. Nil measures both axes. Off-axis movement alone does not start a drag.

### `PointerDragThreshold`

Gets the Euclidean press-to-start distance in layout units, measured on PointerDragAxis. Zero starts on press for mouse and pen, or on the first nonzero touch movement.

### `TabStop`

Controls whether a focusable element participates in sequential Tab navigation. Defaults to true. False preserves pointer, programmatic, and accessibility focus for composite widgets.

### `TransitionDelayMs`

Gets the delay before a transition starts, in milliseconds.

### `TransitionEasing`

Gets the easing curve applied to transition progress.

### `TransitionMs`

Gets the transition duration in milliseconds.

### `TransitionProperties`

Gets a defensive copy of the style properties selected for transitions. All interpolable properties are selected when this property is omitted.

## `Button`


Defines a semantic button container with pointer and keyboard activation.

### `new`

Initializes an empty button.

### `Add(Blob)`

Adds a child to the end of the ordered child collection.

- `child`: The child to add.

### `Children`

Gets the mutable child list. Read-only lists supplied during initialization are copied. Siblings can mix keyed and unkeyed entries. Keyed children match by key; unkeyed children match only at the same absolute sibling index.

## `Column`


Defines a vertical flex container. Setting FlexDirection throws when mounted.

### `new`

Initializes an empty vertical flex container.

### `Add(Blob)`

Adds a child to the ordered child collection.

- `child`: The child to add.

### `Children`

Gets the ordered child collection. Read-only lists are copied.

### `HitTestSelf`

Overrides whether this container participates in pointer hit testing. When omitted, Goo derives the value from authored interaction behavior.

## `Container`


Defines an element that contains child blobs.

### `new`

Initializes an empty child collection.

### `Add(Blob)`

Adds a child to the end of the ordered child collection.

- `child`: The child to add.

### `Children`

Gets the mutable child list. Read-only lists supplied during initialization are copied. Siblings can mix keyed and unkeyed entries. Keyed children match by key; unkeyed children match only at the same absolute sibling index.

### `HitTestSelf`

Overrides whether this container participates in pointer hit testing. When omitted, Goo derives the value from authored interaction behavior.

### `Layout`

Gets the optional retained measure/arrange policy. Nil uses the normal flex layout; replace the immutable policy when its configuration changes.

## `Each<T>`


### `Each<T>(System.Collections.Generic.IReadOnlyList{T},System.Func{T,string},System.Func{T,Blob})`

Builds one child per item. Children without a key get the item's key. Explicit keys stay unchanged.

- `T`: The item type.
- `items`: The items in child order.
- `itemKey`: Selects a stable, unique sibling key from an item.
- `itemBuilder`: Builds the child for an item.

Returns: Children to spread into a container. Duplicate sibling keys are rejected during reconciliation.

## `ElementHandle`


Represents a consumer-owned handle for one mounted element. A tree update can move the handle to another element, but cannot attach it to two live elements.

### `MetricsChanged`

Occurs after this mounted element reaches a new stable geometry or scroll state. Callbacks run on the window UI thread after reconciliation and layout.

### `new`

Initializes an unmounted element handle.

### `Activate`

Invokes this eligible mounted button's click callback and rebuilds its owning cell.

Returns: False when unmounted, ineligible, or not a button with a click callback.

### `BeginFocusScope(FocusScopeOptions)`

Begins a nested focus scope on this mounted, visible, enabled, focusable element.

- `options`: Modal blocking, initial focus, and restoration policy.

Returns: A scope to dispose when the overlay closes; removal also closes it automatically.

### `BeginPress`

Begins a press on this focused button. Focus loss or removal cancels it.

Returns: False when unmounted, ineligible, or not a focused button.

### `Blur`

Removes keyboard focus when this element owns it.

Returns: False when the handle is unmounted or does not own focus.

### `CancelGestures`

Cancels recognizer sessions owned by this element without replaying pending input.

Returns: True when at least one session was canceled.

### `EndPress(bool)`

Ends this button's press, optionally activating it if it still owns focus and is eligible.

- `activate`: Whether to invoke the click callback on a valid release.

Returns: False when this button has no pending press.

### `Focus`

Moves keyboard focus to this focusable mounted element.

Returns: False when the handle is unmounted or the element cannot receive focus.

### `JumpTo(System.Nullable{float64},System.Nullable{float64})`

Immediately sets this element's logical scroll offset. A nil axis keeps its offset.

- `x`: The non-negative horizontal offset, or nil to keep the offset.
- `y`: The non-negative vertical offset, or nil to keep the offset.

Returns: False when the handle is unmounted or the element is not scrollable.

### `RestoreAnchor(VirtualScrollAnchor,bool)`

Restores a saved virtual item position and corrects it while visible rows are measured.

- `anchor`: The saved item key and signed viewport position.
- `settle`: Whether to correct the offset after measurement.

Returns: False when the handle, collection, or key is unavailable.

### `ScrollIntoView`

Scrolls each scrollable ancestor enough to reveal this element.

Returns: False when the handle is unmounted.

### `ScrollOffsetOf(string,ScrollAlignment)`

Returns a clamped item target for ScrollTo or a consumer animation.

- `key`: The stable item key.
- `alignment`: The item's alignment in the viewport.

Returns: The current measured or estimated target, or nil when unavailable.

### `ScrollTo(System.Nullable{float64},System.Nullable{float64})`

Sets this element's logical scroll target. A nil axis keeps its current offset.

- `x`: The non-negative horizontal target, or nil to keep the offset.
- `y`: The non-negative vertical target, or nil to keep the offset.

Returns: False when the handle is unmounted or the element is not scrollable.

### `ScrollToEnd`

Animates this element to the range end on both scrollable axes.

Returns: False when the handle is unmounted or the element is not scrollable.

### `ScrollToItem(string,ScrollAlignment,bool)`

Scrolls to an item and optionally corrects alignment while rows are measured. Unknown keys are held for at most three frames. A later scroll, user scroll or unmount cancels them.

- `key`: The nonempty stable item key.
- `alignment`: The item's alignment in the viewport.
- `settle`: Whether to correct the offset after measurement.

Returns: True when applied or stored, false for an unmounted or nonvirtual element.

### `SelectText(int32,int32)`

Focuses this text control and selects UTF-16 offsets [start, end). An unmounted handle retains one request until its next mount and layout.

- `start`: The selection anchor offset.
- `end`: The active selection offset.

Returns: True when stored or applied, false for an ineligible control or invalid range.

### `SetFocusTarget(ElementHandle)`

Sets the descendant that also resolves Focus style while this owner has visible focus. An unmounted target is retained for remounting. The next rebuild restores Blob.FocusTarget.

- `target`: The descendant handle, or nil to clear projection.

Returns: False when this owner is unmounted.

### `SetTextInputArea(ElementRect)`

Sets the native IME caret/input rectangle in window logical coordinates.

Returns: False when the element is ineligible or native text input is unavailable.

### `TryCopyTextRangeRects(TextRange,TextCoordinateSpace,System.Span{ElementRect},int32@)`

Copies retained rectangles for a source UTF-16 range into destination.

- `required`: Receives the full rectangle count, including rectangles that did not fit.

Returns: False when this is unmounted, not a text primitive, the range is invalid, or no current retained layout exists.

### `TryGetTextCaretRect(TextPosition,TextCoordinateSpace,ElementRect@)`

Gets the retained caret rectangle for a source UTF-16 text position.

Returns: False when this is unmounted, not a text primitive, or the position is not retained.

### `TryGetTextPositionAt(Point,TextCoordinateSpace,TextPosition@)`

Gets the retained text position nearest to a point.

Returns: False when this is unmounted, not a text primitive, or has no current retained layout.

### `BorderBox`

Gets the transformed border box in window logical coordinates. An unmounted handle returns an empty rectangle.

### `ContentBox`

Gets the transformed content box in window logical coordinates. An unmounted handle returns an empty rectangle.

### `IsAtEndX`

Reports whether the horizontal offset is within one device pixel of the range end.

### `IsAtEndY`

Reports whether the vertical offset is within one device pixel of the range end.

### `IsFocusVisible`

Reports whether this mounted element resolves Focus style through direct focus or projection.

### `IsMounted`

Reports whether this handle is attached to an element.

### `IsScrollSettling`

Gets whether a virtual item request is still being corrected after layout.

### `RawBorderBox`

Gets the transformed pre-snapping layout box in window logical coordinates. Pure-move transforms use their drawn, device-pixel-snapped translation. Use it to position popups that must share this element's device-pixel phase. An unmounted handle returns an empty rectangle.

### `ScrollOffset`

Gets the current logical scroll offset. An unmounted handle returns the origin.

### `ScrollRange`

Gets the maximum legal logical scroll offset. An unmounted handle returns the origin.

### `VisibleAnchor`

Gets the first visible virtual item's key and signed position inside the viewport.

## `ElementMetrics`


Describes one stable mounted-element geometry snapshot.

### `BorderBox`

Gets the transformed border box in window logical coordinates.

### `ContentBox`

Gets the transformed content box in window logical coordinates.

### `IsAtEndX`

Reports whether the horizontal offset is within one device pixel of the range end.

### `IsAtEndY`

Reports whether the vertical offset is within one device pixel of the range end.

### `IsMounted`

Reports whether the element is mounted.

### `RawBorderBox`

Gets the transformed pre-snapping layout box in window logical coordinates. Pure-move transforms use their drawn, device-pixel-snapped translation. Use it to position popups that must share this element's device-pixel phase.

### `ScrollOffset`

Gets the current logical scroll offset.

### `ScrollRange`

Gets the maximum legal logical scroll offset.

## `ElementRect`


Represents an axis-aligned rectangle in the requested logical coordinate space.

### `Height`

Gets the height.

### `Width`

Gets the width.

### `X`

Gets the horizontal origin.

### `Y`

Gets the vertical origin.

## `Image`


Defines a local bitmap image element.

### `new`

Initializes an image with an empty path and contained fit mode.

### `Fit`

Gets the image fit mode.

### `Path`

Legacy path metadata. A nonempty path without Source throws when mounted. Load local PNG assets with ImageSourceCache.LoadAsync and set Source instead.

### `PixelsPerUnit`

Gets source pixels per logical layout unit. Positive and finite, default 1. A 128-pixel image at density 2 has a natural width of 64 logical units.

### `Source`

Gets the owned or provider-backed image source. It wins over Path when set.

## `ImageDecodeLimits`


Sets the size limits for one image decode.

### `new`

Initializes the default limits.

### `Default`

Gets the default limits.

### `MaxDecodedBytes`

Gets the maximum size in bytes of the RGBA pixels that the decode keeps. The default is 64 MiB. For a thumbnail, this limit applies to the reduced pixels and not to the source.

### `MaxEncodedBytes`

Gets the maximum encoded input size in bytes. The default is 16 MiB.

### `MaxPixelsPerSide`

Gets the maximum source width and height in pixels. The default is 8192.

## `ImageDecodeResult`


Contains the owned image on success and a bounded explanation on failure.

### `Detail`

Gets a bounded failure explanation, or an empty string on success.

### `Source`

Gets the independently disposable source on success, otherwise nil.

### `Status`

Gets the decode outcome.

## `ImageDecodeStatus`


Describes a strict image decode outcome without hiding unsupported color profiles.

### Values

- `Success`
- `InvalidData`
- `LimitExceeded`
- `Unsupported`
- `Cancelled`

## `ImageFit`


Controls how an image fits its destination box.

### `Contain`

Preserves the image aspect ratio within the destination box.

### `Cover`

Preserves the image aspect ratio while filling the destination box.

### `Fill`

Stretches the image to fill the destination box.

### `None`

Paints the image at its intrinsic size without scaling.

## `ImageLimitException`


Reports an image that exceeds an ImageDecodeLimits value.

### `Height`

Gets the source pixel height, or 0 when the limit was exceeded before the header gave it.

### `Width`

Gets the source pixel width, or 0 when the limit was exceeded before the header gave it.

## `ImageSource`


Owns one immutable premultiplied RGBA image resource.

### `ContentChanged`

Never raised by immutable ImageSource. Satisfies ImageSourceProvider.

### `new(int32,int32,System.Byte[])`

Copies exactly Width times Height premultiplied RGBA pixels into an owned image.

- `width`: The positive pixel width.
- `height`: The positive pixel height.
- `pixels`: The row-major premultiplied RGBA pixels.

### `Acquire`

Creates an already-completed binding that retains this source until release.

Returns: The completed binding for this source.

### `Decode(System.IO.Stream)`

Decodes from the stream's current position and leaves the stream open. Uses the same limits and synchronous decoding as the encoded-byte overload.

### `Decode(System.IO.Stream,ImageDecodeLimits,System.Threading.CancellationToken)`

Decodes a stream with the given limits and leaves the stream open.

### `Decode(System.IO.Stream,System.Threading.CancellationToken)`

Decodes a stream with cancellation between reads and during validation. Leaves the stream open, including on cancellation or decoding failure.

### `Decode(System.ReadOnlyMemory{System.Byte})`

Decodes PNG, JPEG, or the first GIF frame into an owned premultiplied RGBA source. PNG and JPEG EXIF orientation is applied. Color-profile metadata is not converted. The default ImageDecodeLimits apply. An image that exceeds a limit throws ImageLimitException. Decoding is synchronous. Call from a worker when loading outside the UI thread.

### `Decode(System.ReadOnlyMemory{System.Byte},ImageDecodeLimits,System.Threading.CancellationToken)`

Decodes encoded bytes with the given limits.

### `Decode(System.ReadOnlyMemory{System.Byte},System.Threading.CancellationToken)`

Decodes encoded bytes with cancellation during validation and before publication.

### `DecodeColorManaged(System.ReadOnlyMemory{System.Byte},ImageDecodeLimits,System.Threading.CancellationToken)`

Decodes PNG or JPEG with embedded RGB matrix/TRC or gray ICC profiles converted to SDR sRGB. Applies EXIF orientation. LUT and CMYK profiles return Unsupported. Files without an embedded profile use sRGB. Existing Decode overloads keep their sRGB assumption.

- `encoded`: The complete bounded encoded image.
- `limits`: The encoded and decoded image limits.
- `cancellationToken`: Cancels validation, color conversion and publication.

Returns: An owned source on success or an explicit failure status.

### `Dispose`

Releases this source's owner reference. Existing mounted leases stay valid.

### `EncodePng`

Encodes this source as owned PNG bytes with straight RGBA pixels. Encoding is synchronous and can run outside the UI thread.

Returns: The encoded PNG bytes.

### `LoadThumbnail(string,int32,int32)`

Loads a local PNG, JPEG, or first GIF frame as an owned bounded thumbnail. The image applies EXIF orientation, keeps its displayed aspect ratio, never grows, and retains only reduced pixels. This synchronous operation belongs on a worker outside the UI thread.

### `LoadThumbnail(string,int32,int32,ImageDecodeLimits,System.Threading.CancellationToken)`

Loads a bounded thumbnail with the given limits.

### `LoadThumbnail(string,int32,int32,System.Threading.CancellationToken)`

Loads a bounded thumbnail with cancellation during reading, validation, and resampling. The default ImageDecodeLimits apply. The decoded-byte limit applies to the reduced pixels.

### `Transfer(int32,int32,System.Byte[],System.Action)`

Creates an immutable source by taking ownership of an exact pixel buffer.

- `width`: The positive pixel width.
- `height`: The positive pixel height.
- `pixels`: The exact row-major premultiplied RGBA buffer transferred to Goo.
- `released`: Called exactly once after Goo can no longer read the transferred array.

Returns: The owned image source.

### `ContentVersion`

Gets the current image content version.

### `Height`

Gets this immutable source's pixel height.

### `IsDisposed`

Gets whether this source has released its owner reference.

### `Width`

Gets this immutable source's pixel width.

## `ImageSourceCache`


Loads local PNG, JPEG, and static GIF assets outside painting and shares immutable decoded pixels. Each result is an independently disposable owner. Mounted leases survive both result and cache disposal. Cache-only entries can be evicted in least-recently-used order. A later load decodes an evicted path again and can read changed file content.

### `new(int32,int32,ImageDecodeLimits)`

Creates a cache bounded by decoded RGBA bytes and unique paths. Limits must be positive; the default budget is 64 MiB and 128 paths. Each load uses the given decode limits, or the default limits when none are given.

### `Dispose`

Cancels queued/in-flight loads and releases cached owners. Existing returned sources and mounted leases remain valid. Repeated disposal is harmless.

### `LoadAsync(string)`

Loads a local PNG, JPEG, or static GIF and returns an owned source for Image.Source. File, decoding, unsupported-format, and capacity errors fault the task.

### `LoadAsync(string,System.Threading.CancellationToken)`

Loads a local PNG, JPEG, or static GIF with cancellation before reading, during validation, and before publication. Cancellation affects only this caller. Concurrent loads serialize decoding and reuse completed paths; failed loads can be retried.

## `ImageSourceLease`


Owns one provider result while it is mounted by Goo.

### `Released`

Raised synchronously once when Goo releases this binding.

### `new`

Creates a pending provider binding.

### `Complete(ImageSource)`

Completes this binding with a retained source resource.

- `source`: The source whose image the binding retains.

Returns: False when this binding was already completed or released.

### `Dispose`

Releases the retained result and notifies the provider.

### `Fail`

Completes this binding as a failure.

Returns: False when this binding was already completed or released.

### `IsComplete`

Gets whether the provider completed this binding.

### `IsDisposed`

Gets whether Goo released this binding.

### `IsFailed`

Gets whether this binding completed without an image.

## `ImageSourceProvider`


Supplies one image binding when a Goo element mounts.

### `ContentChanged`

Occurs when provider-backed image content changes.

### `Acquire`

Creates the lease Goo owns and disposes for one mounted element.

### `ContentVersion`

Gets the content version used to invalidate mounted image bindings.

## `Portal`


Presents a logical child subtree in the window overlay while retaining declaration-site ownership.

### `new`

Initializes an empty child collection.

### `Add(Blob)`

Adds a child for mixed composite initialization. Siblings can mix keyed and unkeyed entries. Keyed children match by key; unkeyed children match only at the same absolute sibling index.

- `child`: The child to add.

### `Anchor`

Gets the mounted anchor handle. Invalid anchor relationships suppress presentation.

### `AnchorRect`

Gets a rectangle within Anchor's local border-box coordinates. Nil uses the whole border box. Values must be finite and dimensions nonnegative.

### `CollisionBounds`

Gets collision bounds in window logical coordinates. Nil uses the viewport. Values are finite and sizes nonnegative.

### `HideWhenAnchorClipped`

Hides presentation when AnchorRect is fully clipped by the anchor's ancestors. Content stays mounted. Defaults to false.

### `Placement`

Gets the preferred side and alignment. Defaults to BottomStart. Placement flips and clamps to collision bounds.

## `PortalPlacement`


Specifies the preferred side and alignment of an anchored Portal before automatic edge flipping and viewport containment.

### `Bottom`

Places the Portal below its anchor and centers it horizontally.

### `BottomEnd`

Places the Portal below its anchor and aligns their inline-end edges.

### `BottomStart`

Places the Portal below its anchor and aligns their inline-start edges.

### `Left`

Places the Portal to the left of its anchor and centers it vertically.

### `LeftEnd`

Places the Portal to the left of its anchor and aligns their bottom edges.

### `LeftStart`

Places the Portal to the left of its anchor and aligns their top edges.

### `Right`

Places the Portal to the right of its anchor and centers it vertically.

### `RightEnd`

Places the Portal to the right of its anchor and aligns their bottom edges.

### `RightStart`

Places the Portal to the right of its anchor and aligns their top edges.

### `Top`

Places the Portal above its anchor and centers it horizontally.

### `TopEnd`

Places the Portal above its anchor and aligns their inline-end edges.

### `TopStart`

Places the Portal above its anchor and aligns their inline-start edges.

## `Row`


Defines a horizontal flex container. Setting FlexDirection throws when mounted.

### `new`

Initializes an empty horizontal flex container.

### `Add(Blob)`

Adds a child to the ordered child collection.

- `child`: The child to add.

### `Children`

Gets the ordered child collection. Read-only lists are copied.

### `HitTestSelf`

Overrides whether this container participates in pointer hit testing. When omitted, Goo derives the value from authored interaction behavior.

## `ScrollAlignment`


Selects an item's alignment in the viewport.

### Values

- `Start`
- `Center`
- `End`
- `Nearest`

## `Spacer`


Takes free main-axis space without paint, input, or accessibility output.

### `new`

Initializes a spacer with grow 1, shrink 1, basis 0, and minimum size 0.

## `Text`


Defines a text element.

### `new`

Initializes a text element with empty content.

### `new(TextSpan[])`

Initializes text by concatenating plain and styled spans.

- `spans`: The ordered text parts.

### `new(string)`

Initializes a text element with the displayed content.

- `content`: The displayed text.

### `Content`

Gets the displayed text.

### `Selectable`

Gets whether the text supports selection and copy without editing or a caret.

### `SelectionColor`

Gets the selection highlight color.

### `StyleRanges`

Gets ordered passive inline styles in UTF-16 source offsets. A cluster uses the style at its logical start. Later ranges override earlier fields.

## `TextCoordinateSpace`


Specifies the coordinate space used by mounted text geometry queries.

### Values

- `Element`
- `Content`
- `Window`

## `TextEditor`


Defines a retained multiline text editor.

### `new`

Creates an editor. Controller must be set before mounting.

### `CaretColor`

Gets the caret color.

### `Controller`

Gets the required per-view editing controller. Set it before mounting.

### `CurrentLineColor`

Gets the current-line highlight color.

### `InputOptions`

Gets optional software keyboard and autofill hints.

### `Layers`

Gets the ordered presentation layers.

### `LineNumberColor`

Gets the line-number gutter color.

### `OnChange`

Gets the callback that receives committed document changes.

### `OnSubmit`

Gets the callback invoked by an accepted submit command.

### `OverscanLines`

Gets the logical-line overscan used by viewport layout.

### `Placeholder`

Gets the placeholder shown for an empty document.

### `PlaceholderColor`

Gets the placeholder color. Nil draws Color at 45% opacity.

### `ReadOnly`

Gets whether editing commands are disabled.

### `SelectionColor`

Gets the selection highlight color.

### `ShowLineNumbers`

Gets whether logical line numbers are shown outside the document.

## `TextEntry`


Defines an editable single-line text element.

### `new`

Initializes an empty text entry with the default selection highlight.

### `Controlled`

Applies Value while focused without reporting an edit. Defaults to false. Preserves an IME composition when Value matches its committed text; a replacement cancels it.

### `InputOptions`

Gets optional software keyboard and autofill hints.

### `OnChange`

Gets the action that receives each edited value.

### `OnSubmit`

Gets the action that receives the submitted value.

### `Password`

Reports whether the value is presented as protected text.

### `Placeholder`

Gets the placeholder shown for an empty value.

### `PlaceholderColor`

Gets the placeholder color. Nil draws Color at 45% opacity.

### `ReadOnly`

Gets whether editing commands are disabled.

### `SelectionColor`

Gets the selection highlight color.

### `Value`

Gets the value used while unfocused, or also while focused when Controlled is true.

## `TextSpan`


Defines displayed Text and an optional inline Style for one text part.

### `op_Implicit(string)~TextSpan`

Converts plain text to an unstyled text span.

- `value`: The displayed text.

Returns: An unstyled text span.

## `Virtual`


Mounts the items placed by a VirtualSource. It scrolls content coordinates. Overriding the list role or clearing Accessibility forwards item position to content.

### `new`

Initializes a list element that scrolls on both axes. Source must be set before mounting.

### `Source`

Gets the required item policy. Set a new immutable source on each build.

## `VirtualChild`


Describes a mounted item of a Virtual element.

### `Key`

Gets the stable key of the item.

### `Measured`

Gets whether Size is the result of a layout of the current content.

### `Size`

Gets the size of the item from its last layout, before rounding to device pixels.

## `VirtualItem`


Places one item of a Virtual element.

### `Content`

Gets the content to mount. Nil keeps the content that is mounted for this key.

### `Height`

Gets the height. Nil takes the height from the content.

### `Index`

Gets the zero-based position of the item in the whole collection, for accessibility.

### `Key`

Gets the stable, nonempty key, unique among the items of one Realize call.

### `Width`

Gets the width. Nil takes the width from the content.

### `X`

Gets the horizontal content coordinate.

### `Y`

Gets the vertical content coordinate.

## `VirtualOutput`


Receives the result of a VirtualState.Realize call. Access outside that call throws.

### `Add(VirtualItem)`

Adds an item to mount. Goo places it and keys it.

- `item`: The key, the position in the collection, the content box, and the content.

### `AnchorKey`

Gets or sets the visible item whose retained descendants keep their vertical position after layout. Nil leaves descendant anchoring disabled. No descendant adjustment is applied at vertical scroll offset zero.

### `ContentSize`

Gets or sets the finite, nonnegative size of the whole content, which sets the scroll range.

### `ItemCount`

Gets or sets the number of items in the whole collection, for accessibility.

### `ScrollOffset`

Gets or sets the scroll offset to apply together with the items. Nil keeps the current offset. A scroll in progress keeps its remaining distance.

## `VirtualScrollAnchor`


Stores a visible virtual item's key and signed position inside the viewport.

### `Key`

Gets the stable item key.

### `Offset`

Gets the item's position relative to the viewport origin.

## `VirtualSource`


Supplies the inputs of one build of a Virtual element. Implementations must be immutable.

### `State(VirtualState)`

Returns the state that places the items of this source.

- `current`: The state that the element retained from its previous build, or nil for a new element.

Returns: current with the inputs of this source pending when it can continue from them, else a new state.

## `VirtualState`


Places the items of one mounted Virtual element. Goo retains one state for each element.

### `BoundsOf(VirtualViewport,string)`

Returns an item's content bounds, using estimates until it is measured.

- `viewport`: The current element geometry.
- `key`: The stable item key.

Returns: The bounds, or nil for an unknown key.

### `Cancel`

Discards the result of the last Realize and all pending inputs. Goo calls it when the items fail to mount.

### `Commit`

Makes the result of the last Realize current. Goo calls it after the items are mounted.

### `Dispose`

Releases the state when the element unmounts or when a different state replaces this one.

### `NeedsRealize(VirtualViewport)`

Reports whether the committed items no longer agree with the viewport, such as after a scroll or a layout. Goo then calls Realize again in the same frame, and in the next frame while the result stays true.

- `viewport`: The element geometry and its mounted items. Valid only during this call.

Returns: True when Realize must run again.

### `OffsetOf(VirtualViewport,string)`

Returns the scroll offset that puts an item at the start of the viewport. ElementHandle.ScrollToItem uses it.

- `viewport`: The element geometry and its mounted items. Valid only during this call.
- `key`: The stable key of the item.

Returns: The scroll offset, or nil for an unknown key.

### `Realize(VirtualViewport,VirtualOutput)`

Adds each item to mount and sets the content size. All changes, including the inputs that VirtualSource.State supplied, must stay pending until Commit.

- `viewport`: The element geometry and its mounted items. Valid only during this call.
- `output`: Receives the items, the content size, the item count, and an optional scroll offset.

## `VirtualViewport`


Describes a Virtual element to its state. Access outside the call that receives it throws.

### `Child(int32)`

Gets a mounted item.

- `index`: The zero-based index, in the order of the last committed Realize.

Returns: The key and the last layout size of the item.

### `ChildCount`

Gets the number of mounted items.

### `ColumnGap`

Gets the resolved gap between columns.

### `ContextVersion`

Gets the generation of the effective retained context during this callback. A changed lineage, unshadowed provider value or PixelScale invalidates cached item content.

### `Direction`

Gets the authored flex direction.

### `FocusedChild`

Gets the index of the mounted item that contains keyboard focus, or -1.

### `PixelScale`

Gets the device pixels per layout unit used to round layout in this window. Includes Window.UiScale. A change also changes ContextVersion.

### `RowGap`

Gets the resolved gap between rows.

### `ScrollOffset`

Gets the current scroll offset.

### `Size`

Gets the size of the visible content area.

### `VisibleAnchor`

Gets the first visible mounted item and its signed position after layout.

### `Wrap`

Gets the authored flex wrap.
