## Changed

- Breaking: Replace `Cell.Mount<TCell>(factory, key)` with `Cell.Mount<TCell>(key, factory)`. The parameterless mount now uses one optional key parameter.
- Breaking: Replace `Window.SetTimeout(action, delayMs)` with `Window.After(delayMs, action)` and `Window.SetInterval(action, intervalMs)` with `Window.Every(intervalMs, action)`. These window timers do not rebuild a Cell.
- Breaking: Replace `Cell.Mount<TCell>(key, configure)` with typed input through `Cell.Mount<TInput, TCell>(key, input, factory)`. Put one-time setup in the constructor or factory.
