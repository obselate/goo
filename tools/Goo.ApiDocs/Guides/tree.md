## Present content above the normal tree

Use `Portal` for popups, menus, tooltips, and other content that must escape its
declaration-site clipping and transforms. Portal children remain logical children:
keyed reconciliation, Cell disposal, routed events, focus scopes, pointer capture,
and accessibility keep the same ownership path. Their layout and geometry instead
start at the logical window viewport, so `ElementHandle.BorderBox` supplies window
coordinates.

```gsharp
Portal{ZIndex: 20,
  Container{ Width: 240, Height: 160, BackgroundColor: Color.White },
}
```

Set `Anchor` for automatic placement from another mounted element's transformed
border box. `Placement` defaults to `BottomStart`:

```gsharp
let trigger = ElementHandle{}
Container{Handle: trigger, Width: 120, Height: 32}
Portal{Anchor: trigger, Placement: PortalPlacement.BottomStart,
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

## Virtualize large collections

`Virtual(source)` is a scrolling element that mounts only the items that its source places. Goo has no list or grid policy of its own. Goo.Widgets supplies `VirtualItems` for items of one size and `VirtualRows` for rows of measured height. Write a policy when neither fits.

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

This policy places rows of height 20. Mount it with `Virtual(Rows(lines)) { Height = 200 }`.

```gsharp
class Rows : VirtualSource {
  let Items IReadOnlyList[string]
  init(items IReadOnlyList[string]) { Items = items }

  func State(current VirtualState?) VirtualState {
    let state = (current as RowsState) ?? RowsState()
    state.Pending = this
    return state
  }
}

class RowsState : VirtualState {
  var Pending Rows?
  private var rows Rows?
  private var mounted HashSet[string] = HashSet[string]()
  private var next HashSet[string] = HashSet[string]()
  private var first int32
  private var last int32
  private var pendingFirst int32
  private var pendingLast int32

  override func Realize(viewport VirtualViewport, output VirtualOutput) {
    next.Clear()
    guard let input = Pending ?? rows else { return }
    let count = input.Items.Count
    pendingFirst = First(viewport, count)
    pendingLast = Last(viewport, count)
    for index in pendingFirst ... pendingLast {
      let key = input.Items[index]
      let content Blob? = if mounted.Contains(key) { nil } else { Text{ Content: key } }
      output.Add(VirtualItem{
        Key: key, Index: index, Y: float64(index) * 20.0,
        Width: viewport.Size.Width, Height: 20.0, Content: content,
      })
      next.Add(key)
    }
    output.ContentSize = LayoutSize{ Width: viewport.Size.Width, Height: float64(count) * 20.0 }
    output.ItemCount = count
  }

  override func NeedsRealize(viewport VirtualViewport) bool {
    guard let input = rows else { return false }
    let count = input.Items.Count
    return First(viewport, count) != first || Last(viewport, count) != last
  }

  override func Commit() {
    let old = mounted
    mounted = next
    next = old
    rows = Pending ?? rows
    Pending = nil
    first = pendingFirst
    last = pendingLast
  }

  override func Cancel() { Pending = nil }

  private func First(viewport VirtualViewport, count int32) int32 ->
  Math.Clamp(int32(viewport.ScrollOffset.Y / 20.0) - 1, 0, count)

  private func Last(viewport VirtualViewport, count int32) int32 ->
  Math.Clamp(int32((viewport.ScrollOffset.Y + viewport.Size.Height) / 20.0) + 2, 0, count)
}
```

Items use content coordinates. The origin is the start of the content box at scroll offset zero, so a scroll offset is also the content coordinate at the start of the viewport. Padding is not part of the content size.

| `VirtualItem` member | Meaning |
|---|---|
| `Key` | Stable, nonempty, and unique in one result. |
| `Index` | Position in the whole collection. Goo reports it as `PositionInSet`. |
| `X`, `Y` | Content coordinates. |
| `Width`, `Height` | Nil takes the size from the content. |
| `Content` | Nil keeps the content that is mounted for this key. |

Goo wraps each item in a keyed, absolutely positioned element. The wrapper has the list item role while the `Virtual` element has the list role. An item that leaves the result unmounts through the ordinary lifecycle, including focus, pointer capture, handles, and accessibility state.

`VirtualViewport` gives the visible content size, the scroll offset, the resolved gaps, the flex direction and wrap, and the mounted items. `Child(index)` returns the key and the last layout size of a mounted item, and `Measured` is false until its current content has a layout. `FocusedChild` is the mounted item that contains keyboard focus. A policy that measures items reads these sizes and returns true from `NeedsRealize` until they settle.

Goo calls `NeedsRealize` after each layout and scroll. A true result runs `Realize` again in the same frame, for at most three passes, and then in the next frames.

Set `output.ScrollOffset` to move the scroll position together with the items, for example to keep an anchor row in place when rows above it change size. A scroll in progress keeps its remaining distance. `Virtual.PinToBottom` keeps the end in view until the reader scrolls away, and `viewport.Pinned` reports that state.

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


## Decode owned image data

Use `ImageSource.Decode(clipboard.Bytes)` for encoded clipboard images, or pass a
readable `Stream` positioned at the image. Both overloads share the local-file
loader's PNG, JPEG, and first-frame GIF decoder and validation. Decoding is
synchronous, so perform expensive decoding in a worker. The stream stays open.
The optional cancellation token is checked between reads, during validation,
and before publication.

Inputs are limited to 16 MiB encoded data, 8192 pixels per dimension, and 64 MiB
of decoded premultiplied RGBA pixels. Assign the returned source to `Image.Source`.
The caller owns and disposes the source. Mounted leases keep their pixels alive
until the image unmounts, even after source disposal. `ImageSourceCache.LoadAsync`
continues to provide bounded path-based sharing for local assets.

Use `ImageSource.LoadThumbnail(path, maxWidth, maxHeight, cancellationToken)`
to load a local image on a worker while retaining only bounded pixels. Both
bounds must be positive. Goo keeps the original aspect ratio, never enlarges
the image, and area-filters premultiplied RGBA when reducing it. The temporary
full decode obeys the same limits above. The caller owns the returned source.
