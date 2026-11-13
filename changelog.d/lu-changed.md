## Changed

- `HasMagnitude` is false for font-relative, viewport-relative and mixed lengths. Do not derive pixels from `Magnitude` for these values. Use `LayoutContext.ResolveLength` in custom layout callbacks.
