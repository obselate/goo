## Changed

- `Length` supports `Em`, `Rem`, `Vw`, `Vh`, mixed arithmetic, intrinsic sizes, and `LayoutContext.ResolveLength`. Use `Length.MinContent`, `Length.MaxContent`, or `Length.FitContent(limit)` on size declarations, and keep animations in one unit.
- Other .NET languages can use `Length.Em`, `Length.Rem`, `Length.Vw` and `Length.Vh` beside the existing `Length.Pixels` and `Length.Percent` factories.
