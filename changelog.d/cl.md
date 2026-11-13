## Added
- Use `Cell.Mount<TInput, TCell>(key, input, factory)` to combine typed input with constructor dependencies. Goo stores new input on each parent diff and calls the factory only for a new mount.
- Use protected `Cell.Host`, `Mounted()` and `Unmounting()` instead of passing the window into each Cell or scheduling mount-time work with a timer. `Mounted()` runs after the first layout and before paint, then applies the normal callback rebuild rule. `Unmounting()` runs before handles detach and does not request a rebuild.
- Use protected `Cell.Post(action)`, `After(delayMs, action)` and `Every(intervalMs, action)` for Cell-owned callbacks. Goo drops pending work at unmount and applies its callback rebuild rule after each action.
- `Cell.Post`, `After` and `Every` throw during `Build`. Schedule from `InputChanged`, `Mounted`, callbacks or continuations instead.
- Pass `Cell.Lifetime` to cancellable work and use `Cell.Latest(name)` for replaceable requests. Read them after window binding, not in constructors, where they throw `InvalidOperationException`. Goo cancels these tokens after `Unmounting()` returns and before `IDisposable.Dispose`.
- Before window binding, `Cell.Post` returns false and `Cell.After` and `Cell.Every` return inactive timers. Start owned work after binding, from `InputChanged`, `Mounted`, callbacks or continuations.

## Changed
- Replace `Cell.Mount<TCell>(factory, key)` with `Cell.Mount<TCell>(key, factory)`. The parameterless mount now uses one optional key parameter.
- Replace `Window.SetTimeout(action, delayMs)` with `Window.After(delayMs, action)` and `Window.SetInterval(action, intervalMs)` with `Window.Every(intervalMs, action)`. These window timers do not rebuild a Cell.
- Replace `Cell.Mount<TCell>(key, configure)` with typed input through `Cell.Mount<TInput, TCell>(key, input, factory)`. Put one-time setup in the constructor or factory.
- `WindowFocus`, `Platform`, `PlatformOpenResult`, `ClipboardTextResult` and `WindowClipboard` now emit sealed CLR classes. These types have no public constructors. Consume the window-owned services and returned results instead of deriving from them.
