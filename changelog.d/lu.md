## Added

- `Length` supports `Em`, `Rem`, `Vw`, `Vh`, mixed arithmetic, intrinsic sizes, and `LayoutContext.ResolveLength`. Use `Length.MinContent`, `Length.MaxContent`, or `Length.FitContent(limit)` on size declarations, and keep animations in one unit.
- `LayoutContext.ResolveLength` returns `nil` when a nonzero percentage has no finite basis. `Em` uses the custom-layout container's font size.
- `Length.Em`, `Length.Rem`, `Length.Vw` and `Length.Vh` factories for other .NET languages.
