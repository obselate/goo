## Added
- `OnPointerDrag` captures primary-pointer drags without hover callbacks. Events provide local position, translation, per-sample delta and lifecycle phases. Threshold and axis properties control when a drag starts. Touch keeps the existing press-time capture behavior.
- Replace drag-only press, move, release and cancel handlers with `OnPointerDrag`. Remove pointer-id and dragging fields, manual capture and manual rebuild calls.
- Use `GesturePhase` for drag phases. Replace `Moved` with `Changed` and `Ended` with `Completed`. Read `Reason` for cancellation. Drag events are supplied by Goo and their init accessors are internal.
- Set `PointerDragAxis` to `LayoutAxis.Horizontal` or `Vertical`. Use nil for both axes. Thresholds and coordinates use layout units. After a drag starts, the press does not produce `OnClick`.
