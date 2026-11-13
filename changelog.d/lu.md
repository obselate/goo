## Changed

- `Length` supports `Em`, `Rem`, `Vw`, `Vh`, mixed arithmetic, intrinsic sizes, and `LayoutContext.ResolveLength`. Use `Length.MinContent`, `Length.MaxContent`, or `Length.FitContent(limit)` on size declarations, and keep animations in one unit.
- L6 is withdrawn. Keep `Length.Pixels` and `Length.Percent` for other .NET languages.

## Added

- `Length.Em`, `Length.Rem`, `Length.Vw` and `Length.Vh` factories for other .NET languages.

## Fixed

- Keep pixel and percentage layout values compact without per-frame allocation overhead.
