## Changed

- Breaking: Replace `Window.DragRegion` with `Window.WithDragRegion`, which returns a fresh drag-region wrapper without changing its content.
- Add `AccessibilityAttachment` to attach field relationships and validation state without changing supplied elements or layout.
- Let `Each` assign item keys to frozen keyless results without changing the supplied elements.
