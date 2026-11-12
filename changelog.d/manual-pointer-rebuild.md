## Changed

- Breaking: Pointer-move callbacks, drag-target queries and move notifications, and changed gesture callbacks no longer rebuild their owner automatically. Call `Cell.Rebuild()` when the callback changes the Cell's rendered state. Other callback invalidation is unchanged.
