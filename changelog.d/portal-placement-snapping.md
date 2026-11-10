## Fixed

- Anchored portals land on device pixels. The popup origin is rounded to the device grid when its rect is read, with the same rule as flex and custom layouts, so text in a popup over a field paints on the same device rows as the field at fractional display scales (for example 1.5 with `UiScale` 1.5). Placement and collision math keep unrounded values.
