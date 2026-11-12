## Changed

- `Length` supports `Em`, `Rem`, `Vw`, `Vh`, mixed arithmetic, intrinsic sizes, and `LayoutContext.ResolveLength`. Use `Length.MinContent`, `Length.MaxContent`, or `Length.FitContent(limit)` on size declarations, and keep animations in one unit.

## Removed

- Removed `Length.Pixels` and `Length.Percent`. Assign a number for layout pixels and call `Percent(value)` for percentages.
