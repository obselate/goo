## Added

- Use `Row` and `Column` for fixed-axis flex containers and `Spacer()` for free space. Set their axis through the Blob type, not `FlexDirection` in declarations or state styles.
- Use `Flex: n` for grow n, shrink 1 and basis 0. `Inset` accepts `Edges` in top, right, bottom, left order. Uniform lengths also work. Later declarations override individual parts.
- `AccessibilityName` and `AccessibilityRole` use non-null `string` and `AccessibilityRole` values. Use `""` or `AccessibilityRole.Auto` for defaults and coalesce optional inputs. A later `Accessibility` declaration replaces all fields.
- `Row.HitTestSelf` and `Column.HitTestSelf` override automatic pointer hit testing, like `Container.HitTestSelf`.
