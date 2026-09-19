## Present content above the normal tree

Use `Portal` for popups, menus, tooltips, and other content that must escape its
declaration-site clipping and transforms. Portal children remain logical children:
keyed reconciliation, Cell disposal, routed events, focus scopes, pointer capture,
and accessibility keep the same ownership path. Their layout and geometry instead
start at the logical window viewport, so `ElementHandle.BorderBox` supplies window
coordinates suitable for anchor placement.

```gsharp
Portal{ZIndex: 20,
  Container{ Width: 240, Height: 160, BackgroundColor: Color.White },
}
```

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
semantics. Goo does not provide automatic anchor placement, dismissal, or a named
layer system; compose those policies with handles, input callbacks, and focus scopes.

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
