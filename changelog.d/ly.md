## Changed
- Use sealed `Row` and `Column` Blobs for fixed-axis flex containers and `Spacer()` for free space. Remove `FlexDirection` from their declarations and state styles.
- Use `Flex: n` for grow n, shrink 1 and basis 0, and `Inset` for all four position offsets. Later declarations override individual parts.
- Replace `Hover`, `Active` and `Focus` Blob declarations with `HoverStyle`, `ActiveStyle` and `FocusStyle`.
- Replace implicit string-to-Color conversion with `Color.Parse(value)`.
- Use `AccessibilityName` and `AccessibilityRole` to set individual accessibility fields. A later `Accessibility` declaration replaces all fields.
