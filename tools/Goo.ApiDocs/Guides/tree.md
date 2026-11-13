## Add direct children

```gsharp
let rows = []Blob{Text("Second")}
let content = Container{
    Gap: 12.0,
    Text("First"),
    ...rows,
    Button{OnClick: () -> Save(), Text("Save")},
}
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
- Set `TextEditor.Controller` and `Virtual.Source` before mounting. Missing values throw at mount. Editor layers must use the controller's document.
- Ellipsis text has automatic minimum width zero. An explicit `MinWidth` still wins.

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

Set `Anchor` for automatic placement from a mounted element's unrounded layout
geometry. Goo rounds the popup origin on the window's device grid.
`Placement` defaults to `BottomStart`:

```gsharp
let trigger = ElementHandle{}
Container{Handle: trigger, Width: 120, Height: 32}
Portal{Anchor: trigger, Placement: PortalPlacement.BottomStart,
  Container{Width: 240, Height: 160, BackgroundColor: Color.White},
}
```

Set `AnchorRect` to use part of the anchor in its local border-box coordinates.
Set `CollisionBounds` to limit placement to a rectangle in window logical coordinates:

```gsharp
Portal{Anchor: trigger,
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
semantics. Goo does not infer an anchor from the declaration parent.

Set `FocusScope: FocusScopeOptions{Modal: true}` for a modal overlay. After its
first layout, `InitialFocus`, then `AutoFocus`, then the first tab stop receives
focus. An empty scope focuses the Portal. Closing restores eligible prior focus
unless `RestoreFocus` is false or focus has moved outside.

`OnDismiss` receives `PopupDismissReason.Escape` outside text composition and
`OutsideInteraction` on an outside press. Remove the Portal to close it.
`OnDismiss` alone opens a nonmodal focus scope. Nil `FocusScope` and `OnDismiss`
leave focus unchanged. `Scrim` paints a full-window layer behind the content.
A modal scope uses a transparent scrim when `Scrim` is nil and sets the
accessibility modal flag. Use `AccessibilityRole` and `AccessibilityName` on the Portal.

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

Subscribe to `ElementHandle.MetricsChanged` on the UI thread. The immutable snapshot contains `IsMounted`, `BorderBox`, `ContentBox`, `ScrollOffset`, `ScrollRange` and `RawBorderBox`, in that positional deconstruction order. `RawBorderBox` is the transformed layout box before device-pixel snapping. Other boxes describe painted geometry in window logical coordinates.

Goo calls listeners after reconciliation, layout, rect refresh, and scroll stepping settle. Detach produces one final `IsMounted = false` snapshot after tree disposal. A detach followed by reattach in the same update reports only the final mounted state.

A new handle subscribed during metrics delivery waits for the next update. Changes to an accepted handle follow live event behavior.

## Control scrolling

Set `OverflowX` or `OverflowY` to `Scroll` and attach an `ElementHandle`. `ScrollTo` updates the smoothed target, `JumpTo` applies an immediate clamped offset, and `ScrollIntoView` adjusts every scrollable ancestor. `ScrollOffset` is the displayed position and `ScrollRange` is the maximum legal X/Y offset.
`JumpTo` calls made by metrics listeners refresh rectangles before the current frame is painted, so a second scroll viewport can follow the reported offset without a one-frame visual delay.

```gsharp
viewport.ScrollToItem(key, ScrollAlignment.Center)
let target = viewport.ScrollOffsetOf(key, ScrollAlignment.End)
let saved = viewport.VisibleAnchor
if let anchor = saved { viewport.RestoreAnchor(anchor) }
```

`ScrollToItem(key)` moves immediately. The aligned overload and `RestoreAnchor` settle while visible items are measured. Set `settle: false` for one immediate move. Direct scrolling cancels settlement. `ScrollOffsetOf` returns the current measured or estimated target for `ScrollTo` or a consumer animation. `VisibleAnchor` stores the first visible item key and its signed viewport offset.
`IsScrollSettling` reports whether measurement is still correcting the request.

`ScrollbarVisibility.Auto` shows the built-in Vulkan thumb during wheel, programmatic or drag interaction and then fades it. `Always` keeps it visible and draggable without idle frames. `Hidden` hides only the built-in thumb.

A custom thumb can derive content size as viewport size plus scroll range. Its length is `track * viewport / content`, and its position is `(track - thumb) * offset / range`. Use `JumpTo` while dragging so content stays under the pointer.

For custom text clients, see [custom IME positioning](input.md#position-a-custom-ime).


For decoding, thumbnails and raster density, see [images](../images.md).
