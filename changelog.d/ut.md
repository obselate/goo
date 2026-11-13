## Changed

- Goo callbacks now resume after `await` on their window's UI thread, including embedded host dispatchers, and rebuild their owning Cell through tracked-state rules. Use `async func Handler() void` and pass `Lifetime` to cancellable work.
- Window close now cancels Cell lifetimes and pending window tasks before a bounded continuation drain. Set `CloseDrainMs` to change the 2000 ms bound. Continuations after the bound run on a serialized background queue and must not access UI state.
- `EmbeddedWindowHost.Dispose` now pumps pending window continuations on the calling thread until the same close drain completes or expires.
- Use `Window.InvokeAsync` for awaitable dispatch and `Window.NextPresentationAsync` for the next accepted presentation receipt.

## Removed

- Removed `Window.TryPost`. Use `Window.Post` and check its Boolean result.
