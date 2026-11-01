# Tree API

Generated from `Goo.xml`. Source declarations supply type ownership and XML-emitter omissions.

Source: [`Goo/Tree`](https://github.com/obselate/goo/tree/main/Goo/Tree)

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

Portal itself is not a pointer target. Input checks its children first and fallsthrough to the normal tree on an ordinary geometry hit-test miss, not according to
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
    init(items IReadOnlyList[string]) {
        Items = items
    }

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

    override func Realize(viewport VirtualViewport, output VirtualOutput) {        next.Clear()
        guard let input = Pending ?? rows else {
            return
        }
        let count = input.Items.Count
        pendingFirst = First(viewport, count)
        pendingLast = Last(viewport, count)
        for index in pendingFirst ... pendingLast {
            let key = input.Items[index]
            let content Blob? = if mounted.Contains(key) {
                nil
            } else {
                Text{Content: key}
            }
            output.Add(
                VirtualItem{
                    Key: key,
                    Index: index,
                    Y: float64(index) * 20.0,
                    Width: viewport.Size.Width,
                    Height: 20.0,
                    Content: content,
                }
            )
            next.Add(key)
        }
        output.ContentSize = LayoutSize{Width: viewport.Size.Width, Height: float64(count) * 20.0}
        output.ItemCount = count
    }

    override func NeedsRealize(viewport VirtualViewport) bool {
        guard let input = rows else {
            return false
        }
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

    override func Cancel() {
        Pending = nil
    }

    private func First(viewport VirtualViewport, count int32) int32 ->
    Math.Clamp(int32(viewport.ScrollOffset.Y / 20.0) - 1, 0, count)

    private func Last(viewport VirtualViewport, count int32) int32 ->
    Math.Clamp(int32((viewport.ScrollOffset.Y + viewport.Size.Height) / 20.0) + 2, 0, count)
}
```
