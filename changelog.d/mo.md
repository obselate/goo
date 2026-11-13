## Added

- Use `Anim.Play(from, to, spec, specs ...)` instead of `Snap(from)` followed by `To(to, spec, specs ...)` to restart an animation without invalidating the owner.
- Use `Motion.Delay(delayMs, spec)` to hold an animation's start value before running its simulation, with the delay in milliseconds and no delay when motion is reduced or disabled.
