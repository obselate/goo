# Tree API

Generated from `Goo.xml`. Source declarations supply type ownership and XML-emitter omissions.

Source: [`Goo/Tree`](../../Goo/Tree)

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

Set `Anchor` for automatic placement from another mounted element's transformed
border box. `Placement` defaults to `BottomStart`:

```gsharp
let trigger = ElementHandle{}
Container{Handle: trigger, Width: 120, Height: 32}
Portal{
    Anchor: trigger,
    Placement: PortalPlacement.BottomStart,
    Container{Width: 240, Height: 160, BackgroundColor: Color.White},
}
```

Goo tries the preferred side, flips to its opposite when that reduces viewport
overflow, then clamps the Portal border box inside the viewport. `Start` and `End`
on top and bottom placements follow the Portal's resolved text direction. On left
and right placements they mean top and bottom. A popup larger than the viewport is
capped to the viewport. Use `Overflow.Scroll` when its content must remain reachable.
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

## Virtualize complete data sources

`Virtual(items, itemWidth, itemHeight, itemKey, itemBuilder)` accepts the complete `IReadOnlyList<T>` source and one positive, finite logical width and height shared by every item. Goo derives list or wrapped-grid placement from `FlexDirection` and `FlexWrap`, then mounts only the viewport window plus one overscan line. The caller does not calculate a range, supply an item count, or choose a list or grid primitive.

The shared item extent is the sole source for placement and scroll range. Builder content is mounted inside that fixed extent and cannot resize the virtual layout.

Source order controls logical order, and `itemKey` supplies stable identity. Goo uses the item type's equality semantics to retain unchanged visible nodes without calling `itemBuilder`. Newly visible and changed items invoke the builder. Items leaving the viewport unmount through the ordinary Goo lifecycle, including focus, pointer capture, handles, and accessibility state. Keys must be unique and non-empty. Rebuild the owning Cell after same-count content changes. A live source count change is detected directly.

`VirtualRows(items, estimatedItemHeight, itemKey, itemBuilder)` opts into measured heights for a vertical list. Rows occupy the available content width and derive their height from actual child layout. It supports `Column` without wrapping; use `RowGap` or `Gap` for spacing. The finite positive estimate supplies the extent of rows that have not been measured. The default overflows are horizontal `Hidden` and vertical `Scroll`; give the list a bounded viewport height.

Keep item values immutable and include all render dependencies in item equality, or change builder identity when external render inputs change. Rebuild the owning Cell after source edits. Goo retains measured heights by key when the item, builder, and available width are unchanged. A width change resets measurements to the estimate and remeasures realized content. Changes within a retained child also update its measured height.

The first visible key and its pixel offset anchor scrolling when measurements change, rows are inserted, or the width changes. If that key disappears, the closest surviving source index is used. `ElementHandle.ScrollToItem(key)` immediately jumps either virtual mode to a stable key, returns false when the key is absent, and uses estimates for unmeasured rows. Subsequent measurement preserves that key's position, subject to the scroll range at the collection ends.

Measured lists retain two overscan rows on each side, plus the row containing keyboard focus even when it leaves the viewport. Blur releases an offscreen row through the normal lifecycle. Each refresh measures at most 128 rows; the normal frame processes at most three refresh passes and schedules further frames until measurements settle. Realization is limited to 4,096 viewport/overscan rows plus one focused row, and metadata to one million items; exceeding either limit throws explicitly. Zero measured heights are allowed. Fixed-extent virtualization keeps its existing behavior.

Metadata uses a prefix-sum tree: committed offset lookup, index lookup, and one measured-height update take O(log n). Explicit source reconciliation validates all keys and values in O(n); changed snapshots and width invalidation use O(n) metadata memory. Refresh work is bounded by realized rows and the 128 staged measurements. Stable metadata and row descriptions are reused between refreshes; no metadata is allocated for ordinary elements or fixed-extent lists.

## Animate computed position changes

Set `Blob.LayoutTransition` to a `LayoutTransition(durationMs, easing)` value to glide a mounted element when its own computed layout slot changes. It is separate from style `TransitionProperties`. The visual rectangle used by painting, hit testing, metrics, descendants, and accessibility moves together. Ordinary scrolling and ancestor-only movement do not start another glide.

## Owned image sources

`Image.Source` and `Style.BackgroundImageSource` accept an `ImageSourceProvider`. A source wins over its local image path. Goo preserves the path for a later source removal, but never falls back to it after source failure.

`ImageSource(width, height, pixels)` copies one exact row-major premultiplied-RGBA buffer (`width * height * 4` bytes) into Goo-owned storage. Width and height must be positive. The buffer must be non-null and exactly that length. Disposing the source releases its owner reference while already-mounted leases remain usable until their elements unmount or replace the source.

`ImageSource.Transfer(width, height, pixels, released)` adopts the same validated buffer without copying. A successful call transfers ownership to Goo: the caller must not read, write, or reuse the array until `released` runs. Goo invokes that callback exactly once after it can no longer read the array. The callback may run synchronously during disposal, and its exceptions do not interrupt cleanup. Rejected arguments leave ownership with the caller and do not invoke the callback.

For streaming content, retain one provider identity and publish each frame as a new immutable source with a monotonically increasing `ContentVersion`. Superseded generations may remain alive until their callbacks return their buffers to a bounded producer pool; never mutate an in-flight generation.

Custom providers create one `ImageSourceLease` per mounted binding. Each lease completes once through `Complete(source)` or `Fail()`. Goo releases a replaced or unmounted lease synchronously and raises `Released` exactly once, so providers should cancel outstanding work from that event. Late completion returns `false`; callback exceptions cannot interrupt Goo cleanup. Stable source identity keeps its existing lease, so warm paints do not reacquire or lock provider state.

When one provider source advances versions, Vulkan keeps the last published version renderable until the replacement upload completes, then moves current references and fence-retires the old version. Stale older versions cannot supersede a newer registration. If the configured resident or logical-source budget cannot hold both versions, Goo keeps the last-good version rather than presenting an empty handoff.

## Observe mounted element metrics

Subscribe to `ElementHandle.MetricsChanged` on the UI thread. The immutable snapshot contains mounted state, transformed border and content boxes in window logical coordinates, the actual scroll offset, and the maximum legal scroll range.

Goo calls listeners after reconciliation, layout, rect refresh, and scroll stepping settle. Detach produces one final `IsMounted = false` snapshot after tree disposal. A detach followed by reattach in the same update reports only the final mounted state.

Subscription state is sparse. Handles without a listener and ordinary blobs and nodes do not retain metrics state. New handle subscriptions made during metric delivery wait for the next update. Listener changes on an already accepted handle follow ordinary live event behavior.

## Control scrolling

Set `OverflowX` or `OverflowY` to `Scroll` and attach an `ElementHandle`. `ScrollTo` updates the smoothed target, `JumpTo` applies an immediate clamped offset, and `ScrollIntoView` adjusts every scrollable ancestor. `ScrollOffset` is the displayed position and `ScrollRange` is the maximum legal X/Y offset.

`ScrollbarVisibility.Auto` shows the built-in Vulkan thumb during wheel, programmatic, or drag interaction and then fades it. `Always` keeps the thumb rendered and draggable without creating idle frame demand. `Hidden` suppresses only the built-in thumb; scrolling and custom scrollbar composition continue working.

A custom thumb can derive content size as viewport size plus scroll range. Its length is `track * viewport / content`, and its position is `(track - thumb) * offset / range`. Use `JumpTo` while dragging so content stays under the pointer.

## Position a custom IME

A focused generic text client can call `ElementHandle.SetTextInputArea` with a finite, non-negative logical-window rectangle. Goo floors the origin, ceils the far edge, and passes cursor offset zero to the native IME. The call returns false for unmounted, unfocused, built-in, closed-window, nonparticipating, or native-IME-unavailable elements. Invalid and out-of-range rectangles throw.

## `Blob`

Source:

- [`Blob.gs`](../../Goo/Tree/Blob.gs)

Defines the common surface for Goo-owned declarative elements.

### `Accessibility`

Gets the platform-neutral accessibility declaration for this element.

### `Active`

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

### `Focus`

Gets the style that applies while this element has focus.

### `Focusable`

Reports whether this element can receive keyboard focus.

### `Handle`

Gets the consumer-owned handle attached while this element is mounted.

### `Hover`

Gets the style that applies while the pointer hovers this element.

### `Key`

Gets the stable key within the sibling list.

### `KeyBindings`

Gets explicit key bindings. Primitives have no built-in keyboard bindings.

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

Source:

- [`Button.gs`](../../Goo/Tree/Button.gs)

Defines a semantic button container with pointer and keyboard activation.

### `new`

Initializes an empty button.

### `Add(Blob)`

Adds a child to the end of the ordered child collection.

- `child`: The child to add.

### `Children`

Gets the mutable child list. Read-only lists supplied during initialization are copied. Give all siblings stable keys, or give no sibling a key.

## `Container`

Source:

- [`Container.gs`](../../Goo/Tree/Container.gs)

Defines an element that contains child blobs.

### `new`

Initializes an empty child collection.

### `Add(Blob)`

Adds a child to the end of the ordered child collection.

- `child`: The child to add.

### `Children`

Gets the mutable child list. Read-only lists supplied during initialization are copied. Give all siblings stable keys, or give no sibling a key.

### `HitTestSelf`

Overrides whether this container participates in pointer hit testing. When omitted, Goo derives the value from authored interaction behavior.

### `Layout`

Gets the optional retained measure/arrange policy. Nil uses the normal flex layout; replace the immutable policy when its configuration changes.

### `PinToBottom`

Reports whether scroll content stays pinned to the bottom.

## `ElementHandle`

Source:

- [`ElementHandle.gs`](../../Goo/Tree/ElementHandle.gs)

Represents a consumer-owned handle for one mounted element.

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

### `EndPress(bool)`

Ends this button's press, optionally activating it if it still owns focus and is eligible.

- `activate`: Whether to invoke the click callback on a valid release.

Returns: False when this button has no pending press.

### `Focus`

Moves keyboard focus to this focusable mounted element.

Returns: False when the handle is unmounted or the element cannot receive focus.

### `JumpTo(float64,float64)`

Immediately sets this element's logical scroll offset.

- `x`: The non-negative horizontal offset.
- `y`: The non-negative vertical offset.

Returns: False when the handle is unmounted or the element is not scrollable.

### `ScrollIntoView`

Scrolls each scrollable ancestor enough to reveal this element.

Returns: False when the handle is unmounted.

### `ScrollTo(float64,float64)`

Sets this element's logical scroll target.

- `x`: The non-negative horizontal target.
- `y`: The non-negative vertical target.

Returns: False when the handle is unmounted or the element is not scrollable.

### `ScrollToItem(string)`

Immediately scrolls a virtual collection to a stable item key, using estimates for unmeasured rows.

- `key`: The nonempty stable key returned by the virtual collection's itemKey callback.

Returns: False for an unmounted handle, a nonvirtual element, or an unknown key.

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

### `IsMounted`

Reports whether this handle is currently attached to an element.

### `ScrollOffset`

Gets the current logical scroll offset. An unmounted handle returns the origin.

### `ScrollRange`

Gets the maximum legal logical scroll offset. An unmounted handle returns the origin.

## `ElementMetrics`

Source:

- [`ElementHandle.gs`](../../Goo/Tree/ElementHandle.gs)

Describes one stable mounted-element geometry snapshot.

### `BorderBox`

Gets the transformed border box in window logical coordinates.

### `ContentBox`

Gets the transformed content box in window logical coordinates.

### `IsMounted`

Reports whether the element is mounted.

### `ScrollOffset`

Gets the current logical scroll offset.

### `ScrollRange`

Gets the maximum legal logical scroll offset.

## `ElementRect`

Source:

- [`ElementHandle.gs`](../../Goo/Tree/ElementHandle.gs)

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

Source:

- [`Image.gs`](../../Goo/Tree/Image.gs)

Defines a local bitmap image element.

### `new`

Initializes an image with an empty path and contained fit mode.

### `Fit`

Gets the image fit mode.

### `Path`

Legacy path metadata. A nonempty path without Source throws when mounted. Load local PNG assets with ImageSourceCache.LoadAsync and set Source instead.

### `Source`

Gets the owned or provider-backed image source. It wins over Path when set.

## `ImageFit`

Source:

- [`Image.gs`](../../Goo/Tree/Image.gs)

Controls how an image fits its destination box.

### Values

- `Contain`
- `Cover`
- `Fill`
- `None`

### `Contain`

Preserves the image aspect ratio within the destination box.

### `Cover`

Preserves the image aspect ratio while filling the destination box.

### `Fill`

Stretches the image to fill the destination box.

### `None`

Paints the image at its intrinsic size without scaling.

## `ImageSource`

Source:

- [`ImageSource.gs`](../../Goo/Tree/ImageSource.gs)

Owns one immutable premultiplied RGBA image resource.

### `ContentChanged`

Occurs when the image content changes.

### `new(int32,int32,System.Byte[])`

Copies exactly Width times Height premultiplied RGBA pixels into an owned image.

- `width`: The positive pixel width.
- `height`: The positive pixel height.
- `pixels`: The row-major premultiplied RGBA pixels.

### `Acquire`

Creates an already-completed binding that retains this source until release.

Returns: The completed binding for this source.

### `Dispose`

Releases this source's owner reference. Existing mounted leases stay valid.

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

Source:

- [`ImageSourceCache.gs`](../../Goo/Tree/ImageSourceCache.gs)

Loads local PNG, JPEG, and static GIF assets outside painting and shares immutable decoded pixels. Each result is an independently disposable owner. Mounted leases survive both result and cache disposal. Paths are snapshots; create a new cache to reload.

### `new(int32,int32)`

Creates a cache bounded by decoded RGBA bytes and unique paths. Limits must be positive; the default budget is 64 MiB and 128 paths.

### `Dispose`

Cancels queued/in-flight loads and releases cached owners. Existing returned sources and mounted leases remain valid. Repeated disposal is harmless.

### `LoadAsync(string)`

Loads a local PNG, JPEG, or static GIF and returns an owned source for Image.Source. File, decoding, unsupported-format, and capacity errors fault the task.

### `LoadAsync(string,System.Threading.CancellationToken)`

Loads a local PNG, JPEG, or static GIF with cancellation before reading, during validation, and before publication. Cancellation affects only this caller. Concurrent loads serialize decoding and reuse completed paths; failed loads can be retried.

## `ImageSourceLease`

Source:

- [`ImageSource.gs`](../../Goo/Tree/ImageSource.gs)

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

Source:

- [`ImageSource.gs`](../../Goo/Tree/ImageSource.gs)

Supplies one image binding when a Goo element mounts.

### `ContentChanged`

Occurs when provider-backed image content changes.

### `Acquire`

Creates the lease Goo owns and disposes for one mounted element.

### `ContentVersion`

Gets the content version used to invalidate mounted image bindings.

## `Portal`

Source:

- [`Portal.gs`](../../Goo/Tree/Portal.gs)

Defines a logical child subtree that is laid out against the window viewport and presented in its Window's shared overlay after the normal tree. The subtree retains its declaration-site ownership, event route, Cell lifecycle, focus, and accessibility relationships. An optional Anchor changes only its border-box placement, not that logical ownership.

### `new`

Initializes an empty child collection.

### `Add(Blob)`

Adds a child for mixed composite initialization. Give all siblings stable keys, or give no sibling a key.

- `child`: The child to add.

### `Anchor`

Gets the optional mounted element whose transformed border box positions this Portal. When set, an unmounted, hidden, wrong-Window, descendant, or cyclic anchor suppresses the Portal. An unset Anchor keeps ordinary window-level Portal positioning.

### `Placement`

Gets the preferred side and alignment used when Anchor is mounted in this Window. Goo flips to the opposite side when that reduces overflow, then contains the Portal border box within the viewport. The default is BottomStart.

## `PortalPlacement`

Source:

- [`Portal.gs`](../../Goo/Tree/Portal.gs)

Specifies the preferred side and alignment of an anchored Portal before automatic edge flipping and viewport containment.

### Values

- `BottomStart`
- `Bottom`
- `BottomEnd`
- `TopStart`
- `Top`
- `TopEnd`
- `RightStart`
- `Right`
- `RightEnd`
- `LeftStart`
- `Left`
- `LeftEnd`

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

## `Text`

Source:

- [`Text.gs`](../../Goo/Tree/Text.gs)

Defines a text element.

### `new`

Initializes a text element with empty content.

### `new(string)`

Initializes a text element with the displayed content.

- `content`: The displayed text.

### `Content`

Gets the displayed text.

### `StyleRanges`

Gets ordered passive inline styles in UTF-16 source offsets. A cluster uses the style at its logical start. Later ranges override earlier fields.

## `TextCoordinateSpace`

Source:

- [`ElementHandle.gs`](../../Goo/Tree/ElementHandle.gs)

Specifies the coordinate space used by mounted text geometry queries.

### Values

- `Element`
- `Content`
- `Window`

## `TextEditor`

Source:

- [`TextEditor.gs`](../../Goo/Tree/TextEditor.gs)

Defines a retained multiline text editor.

### `new(TextEditorController)`

Creates an editor without presentation layers.

- `controller`: The per-view controller that owns the edited document.

### `new(TextEditorController,TextPresentationLayer[])`

Creates an editor with ordered presentation layers.

- `controller`: The per-view controller that owns the edited document.
- `layers`: The ordered presentation layers.

### `CaretColor`

Gets the caret color.

### `Controller`

Gets the per-view editing controller.

### `CurrentLineColor`

Gets the current-line highlight color.

### `Layers`

Gets the ordered presentation layers.

### `OnChange`

Gets the callback that receives committed document changes.

### `OnSubmit`

Gets the callback invoked by an accepted submit command.

### `OverscanLines`

Gets the logical-line overscan used by viewport layout.

### `Placeholder`

Gets the placeholder shown for an empty document.

### `ReadOnly`

Gets whether editing commands are disabled.

### `SelectionColor`

Gets the selection highlight color.

## `TextEntry`

Source:

- [`TextEntry.gs`](../../Goo/Tree/TextEntry.gs)

Defines an editable single-line text element.

### `new`

Initializes an empty text entry with the default selection highlight.

### `Controlled`

Applies Value while focused without reporting an edit. Defaults to false. Preserves an IME composition when Value matches its committed text; a replacement cancels it.

### `OnChange`

Gets the action that receives each edited value.

### `OnSubmit`

Gets the action that receives the submitted value.

### `Password`

Reports whether the value is presented as protected text.

### `Placeholder`

Gets the placeholder shown for an empty value.

### `SelectionColor`

Gets the selection highlight color.

### `Value`

Gets the value used while unfocused, or also while focused when Controlled is true.

## `Virtual<T>`

Source:

- [`Virtualization.gs`](../../Goo/Tree/Virtualization.gs)

## `VirtualRows<T>`

Source:

- [`VirtualRows.gs`](../../Goo/Tree/VirtualRows.gs)

Creates a vertically scrolling virtual list whose retained rows are measured at the available content width. @param items Immutable row values; replace changed values and rebuild the owning Cell after collection changes. @param estimatedItemHeight A finite positive estimate used until a row is measured. @param itemKey Stable, nonempty keys, unique across the whole collection. @param itemBuilder Builds one row; all render dependencies should participate in item equality or builder identity. @typeparam T The immutable row value type. @returns A vertical virtual collection with two overscan rows on either side and bounded measurement work.

### `VirtualRows<T>(System.Collections.Generic.IReadOnlyList{T},float64,System.Func{T,string},System.Func{T,Blob})`

Creates a vertically scrolling virtual list whose retained rows are measured at the available content width.

- `T`: The immutable row value type.
- `items`: Immutable row values; replace changed values and rebuild the owning Cell after collection changes.
- `estimatedItemHeight`: A finite positive estimate used until a row is measured.
- `itemKey`: Stable, nonempty keys, unique across the whole collection.
- `itemBuilder`: Builds one row; all render dependencies should participate in item equality or builder identity.

Returns: A vertical virtual collection with two overscan rows on either side and bounded measurement work.
