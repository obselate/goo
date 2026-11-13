## Added

- Use `Anim.Play(from, to)` with `Motion.Default`, or `Anim.Play(from, to, spec, specs ...)`, instead of `Snap(from)` followed by `To(to, ...)`. Each call restarts the animation without invalidating the owner. Call from an event, `Mounted` or a callback, not unconditionally in `Build`.
- Use `Motion.Delay(delayMs, spec)` to hold an animation's start value before running its simulation, with the delay in milliseconds and no delay when motion is reduced or disabled.
