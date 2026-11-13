### Changed

- Gallery and DevTools use component values in Blob slots. App-owned stateful components convert to typed `Cell.Mount(key, input)` calls and keep their existing keys. Stateless Widgets convert without explicit `.Build()` calls.
- The getting-started guide and tutorials use `Row`, `Column`, `Application.Run`, `Window.Size`, and `Cell.Host`. Use `Name(){children}` for a child-only container. Put changing child values in a typed input, not a mount configuration callback.
