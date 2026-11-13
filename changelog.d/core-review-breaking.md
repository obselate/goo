## Changed

- Breaking: `Rebuild` on a mounted Cell throws when called off its window's UI thread. Use `Cell.Post` to apply background results. Goo handles callback rebuilds.
