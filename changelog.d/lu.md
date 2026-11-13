## Added

- `Length` supports `Em`, `Rem`, `Vw`, `Vh`, mixed arithmetic, intrinsic sizes, and `LayoutContext.ResolveLength`. Use `Length.MinContent`, `Length.MaxContent`, or `Length.FitContent(limit)` on size declarations, and keep animations in one unit.
- `Length.Em`, `Length.Rem`, `Length.Vw` and `Length.Vh` factories for other .NET languages.

## Changed

- `HasMagnitude` is false for font-relative, viewport-relative and mixed lengths. Do not derive pixels from `Magnitude` for these values. Use `LayoutContext.ResolveLength` in custom layout callbacks.

## Fixed

- `LayoutContext.ResolveLength` returns `nil` when a nonzero percentage has no finite basis. Handle `nil` as unresolved. `Em` uses the custom-layout container's font size.
