## Added

- `OnPointerDrag` captures primary-pointer drags without hover callbacks. Events provide local position, translation, per-sample delta and lifecycle phases. Threshold and axis properties control when a drag starts.
- Replace drag-only press, move, release and cancel handlers with `OnPointerDrag`. Remove pointer-id and dragging fields, manual capture and manual rebuild calls.
- Use `GesturePhase.Started`, `Changed`, `Completed` and `Canceled` for drag phases. Read `Reason` for cancellation. `Delta` on `Started` excludes pre-threshold movement. Goo supplies drag events and their init accessors are internal.
- Set `PointerDragAxis` to `LayoutAxis.Horizontal` or `Vertical`. Use nil for both axes. Thresholds and coordinates use layout units. After a drag starts, the press does not produce `OnClick`.
- Drags wait for nonzero movement past `PointerDragThreshold` in `PointerDragAxis`. Child clicks remain available until the drag starts. An enclosing scroller claims touch movement along its scroll axis first. Keep horizontal drag handles inside vertical scrollers on `LayoutAxis.Horizontal`.
