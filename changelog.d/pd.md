## Added
- `OnPointerDrag` captures primary-pointer drags without hover callbacks. Events provide local position, translation, per-sample delta and lifecycle phases. Threshold and axis properties control when a drag starts. Touch keeps the existing press-time capture behavior.
- Replace drag-only press, move, release and cancel handlers with `OnPointerDrag`. Remove pointer-id and dragging fields, manual capture and manual rebuild calls.
