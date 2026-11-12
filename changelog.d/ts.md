## Changed

- Cells with safe tracked State fields can skip unchanged callbacks, including inherited Cells. Virtual rows track State through their retained element and refresh all realized rows when a dependency changes.
- State verification rebuilds eligible Cells and reports untracked tree changes when enabled. Mutable instance or static fields and observed mutable ElementHandle values retain automatic callback rebuilding.
- Breaking: removed `Cell[TInput].ShouldRebuild`. Input equality now decides child rebuilds. Remove those overrides and derive input-dependent state in `InputChanged(input)` before `Build`.
