## Added

- `State[T]` tracks reads in Cell builds and retained builders. Changed values invalidate their readers. Equal writes do nothing.
- Window state, focus, size, scale, preferences, modifiers and text-focus getters track their Cell and retained-builder readers. Changes rebuild only readers of the changed value.

## Changed

- Cells with safe tracked State fields can skip unchanged callbacks, including inherited Cells. Virtual rows track State through their retained element and refresh all realized rows when a dependency changes.
- `Application.VerifyState` rebuilds eligible Cells and reports untracked tree changes. It defaults to enabled under a debugger or DevTools. Mutable instance or static fields and observed mutable ElementHandle values retain automatic callback rebuilding.
- Breaking: removed `Cell[TInput].ShouldRebuild`. Input equality now decides child rebuilds. Remove those overrides and derive input-dependent state in `InputChanged(input)` before `Build`.
- `State[T]` no longer exposes the implementation-only `StateDependency` base type.
