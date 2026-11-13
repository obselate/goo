## Changed
- Use sealed `Row` and `Column` Blobs for fixed-axis flex containers and `Spacer()` for free space. Remove `FlexDirection` from their declarations and state styles.
- Use `Flex: n` for grow n, shrink 1 and basis 0. `Inset` now accepts `Edges` in top, right, bottom, left order. Existing uniform lengths still compile. Rebuild binary consumers for the new setter type. Later declarations override individual parts.
- Replace `Hover`, `Active` and `Focus` Blob declarations with `HoverStyle`, `ActiveStyle` and `FocusStyle`.
- Replace implicit string-to-Color conversion with `Color.Parse(value)`.
- `AccessibilityName` and `AccessibilityRole` use non-null `string` and `AccessibilityRole` values. Replace `nil` with `""` or `AccessibilityRole.Auto`, and coalesce optional inputs. A later `Accessibility` declaration replaces all fields.

## Added
- `Row.HitTestSelf` and `Column.HitTestSelf` override automatic pointer hit testing, like `Container.HitTestSelf`.

## Fixed
- Setting `AccessibilityName` to `""` or `AccessibilityRole` to `Auto` leaves an absent accessibility declaration unset. Existing declarations keep their other fields.
