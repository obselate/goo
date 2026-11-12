## Added
- `OnPointerDrag` captures primary-pointer drags without hover callbacks, with local position, translation, per-sample delta, lifecycle phases, threshold and axis selection. Drag callbacks use tracked-state invalidation; touch capture preserves the existing press-time capture behavior.
