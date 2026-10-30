# Motion API

Generated from `Goo.xml`. Source declarations supply type ownership and XML-emitter omissions.

Source: [`Goo/Motion`](https://github.com/obselate/goo/tree/2bb14e71457b4f41ffde9d7884c8e55a1df7cf79/Goo/Motion)

## Bind animated paint values

```gsharp
class Fade : Cell {
    let fade Anim[float64]
    init() {
        fade = AnimateValue(1.0)
    }

    override func Build() Blob -> Container{Opacity: 1.0, OpacityAnim: fade}

    func Hide() {
        fade.To(0.0, Motion.Tween(200.0))
    }
}
```

- `AnimateValue(initial)` does not rebuild its Cell. `Animate(initial)` still rebuilds. Both own and dispose the Anim.
- Slots are inherited from `Style` by every primitive. Use `OpacityAnim`, `BackgroundColorAnim`, `BorderColorAnim`, `BorderStartColorAnim`, `BorderEndColorAnim`, `OutlineColorAnim`, `ColorAnim` or `TextStrokeColorAnim`.
- Slots bind mounted elements, not inline text ranges or text presentation styles.
- `TranslateAnim` takes `Anim[Point]` in pixels. `ScaleAnim` takes a uniform factor. Other `Transform` components stay declared. No layout fields have slots.
- A slot wins over the field's declaration and `TransitionMs`. Ticks change paint without Build or layout. Inherited text colors reach descendants without their own color declaration or slot.
- Rebuilding with the same Anim keeps the binding. Removing the slot or disposing its Anim restores the latest declaration under normal transition rules. Completion and pause keep the value bound.
- An Anim and its target must belong to the same window. Removing the target releases the binding, not the Anim. `Set` and `Snap` request a frame while bound.
- Reduced motion uses the Anim's normal settlement. Custom `Simulation` values, including Goo.Animations specifications, use the same slots.

## `Anim<T>`

Source:

- [`Anim.gs`](https://github.com/obselate/goo/blob/2bb14e71457b4f41ffde9d7884c8e55a1df7cf79/Goo/Motion/Anim.gs)

Bridges scalar simulations to a Cell-owned animated value.

### `Completed`

Reports completion once after the owning motion pump settles, on its UI thread. Retarget, Set, Snap, and disposal cancel pending delivery. A handler may retarget this animation; the new run advances on a later pump. Handler failures propagate after the remaining completion batch is delivered, unless the window closes.

### `Pause`

Holds the current value until Resume, retargeting, or forced completion.

### `Resume`

Continues a paused animation from its held elapsed time.

### `Seek(float64)`

Sets elapsed time on an active Motion.Tween animation, preserving pause state. Times beyond the duration land on the target. Completion is delivered on the next pump, even when paused. Non-tween or inactive animations throw InvalidOperationException.

- `elapsedMs`: finite, nonnegative elapsed milliseconds, independent of TimeScale

### `Set(T)`

Snaps to value, stops all scalar simulations, and notifies the owner.

- `value`: value to set

### `Snap(T)`

Snaps to value and stops all scalar simulations without invalidating the owner. Safe during Build; the build in progress reads the new value.

- `value`: value to set

### `To(T)`

Animates toward target with Motion.Default.

- `target`: value to animate toward

### `To(T,MotionVelocity)`

Animates toward target with an explicit initial converter-coordinate velocity.

- `target`: value to animate toward
- `velocity`: uniform or dimension-ordered initial velocity

### `To(T,MotionVelocity,System.Func{float64,float64,float64,Simulation},System.Func{float64,float64,float64,Simulation}[])`

Animates toward target with explicit velocity and shared or per-dimension specifications.

- `target`: value to animate toward
- `velocity`: uniform or dimension-ordered initial velocity
- `spec`: first specification
- `specs`: remaining specifications, empty for shared behavior

### `To(T,System.Func{float64,float64,float64,Simulation},System.Func{float64,float64,float64,Simulation}[])`

Animates toward target with one shared or one-per-dimension specification.

- `target`: value to animate toward
- `spec`: first specification
- `specs`: remaining specifications, empty for shared behavior

### `IsDisposed`

Gets whether the owning Cell has disposed this animation.

### `IsPaused`

Gets whether this animation is paused. A paused animation remains Running.

### `Running`

Gets whether an animation is active, including while paused.

### `Target`

Gets the target value for the current or last animation.

### `Value`

Gets the current value at the current motion clock time.

### `Velocity`

Gets the current velocity in converter-coordinate units per second. A resting or paused animation reports zero velocity in every dimension.

## `LayoutTransition`

Source:

- [`LayoutTransition.gs`](https://github.com/obselate/goo/blob/2bb14e71457b4f41ffde9d7884c8e55a1df7cf79/Goo/Motion/LayoutTransition.gs)

Describes an opt-in position transition using DurationMs and Easing, or a custom SimulationFactory.

### `SimulationFactory`

Creates an optional simulation for each position axis. Omission uses DurationMs and Easing. The simulation starts at from with the supplied velocity and settles at to.

## `Motion`

Source:

- [`Motion.gs`](https://github.com/obselate/goo/blob/2bb14e71457b4f41ffde9d7884c8e55a1df7cf79/Goo/Motion/Motion.gs)

Configures the animation core. Animation durations use milliseconds. Simulation elapsed time and velocity use seconds.

### `Tween(float64,Easing)`

Creates an exact-duration scalar simulation factory.

- `durationMs`: duration in milliseconds, including zero
- `easing`: progress curve

Returns: a reusable scalar simulation factory

### `Default`

Gets or sets the sim factory used by To(target) when no spec is given. Core wires a 180 ms linear timed sim at startup.

### `TimeScale`

Gets or sets the global playback rate. 1 is normal speed; 0 or lower lands every running animation on its target on the next tick.

## `MotionCompletionReason`

Source:

- [`Motion.gs`](https://github.com/obselate/goo/blob/2bb14e71457b4f41ffde9d7884c8e55a1df7cf79/Goo/Motion/Motion.gs)

Identifies why an animation reached its terminal value. Finished means all simulations ended naturally. ReducedMotion means the host requested less motion. Disabled means Motion.TimeScale is zero or negative and takes precedence.

### Values

- `Finished`
- `ReducedMotion`
- `Disabled`

## `MotionConverter<T>`

Source:

- [`MotionConverter.gs`](https://github.com/obselate/goo/blob/2bb14e71457b4f41ffde9d7884c8e55a1df7cf79/Goo/Motion/MotionConverter.gs)

Converts an animated value to fixed scalar simulation coordinates.

### `new(int32,System.Action{T,float64[]},System.Func{float64[],T})`

Creates a converter with a fixed coordinate count and conversion callbacks.

- `dimensions`: positive coordinate count
- `read`: writes a value into an Anim-owned coordinate buffer
- `write`: creates a value from an Anim-owned coordinate buffer

## `MotionVelocity`

Source:

- [`MotionVelocity.gs`](https://github.com/obselate/goo/blob/2bb14e71457b4f41ffde9d7884c8e55a1df7cf79/Goo/Motion/MotionVelocity.gs)

Specifies initial scalar velocities in converter-coordinate units per second. Create values with Uniform or Components because the default value is invalid.

### `Add(MotionVelocity)`

Adds another velocity in the same converter-coordinate space.

- `other`: velocity to add

Returns: the component-wise sum

### `Components(float64[])`

Creates velocities ordered by converter dimension.

- `values`: one finite velocity per converter dimension

Returns: a component velocity command

### `Uniform(float64)`

Creates a velocity shared by every converter dimension.

- `value`: finite velocity in converter-coordinate units per second

Returns: a uniform velocity command

## `Simulation`

Source:

- [`Simulation.gs`](https://github.com/obselate/goo/blob/2bb14e71457b4f41ffde9d7884c8e55a1df7cf79/Goo/Motion/Simulation.gs)

Evaluates a closed-form motion at an elapsed time. No numeric integration: every override is a pure function of elapsed seconds, so evaluation is idempotent and safe to repeat within a frame.

### `Done(float64)`

Gets whether the simulation has settled at the specified elapsed time.

- `elapsed`: seconds since the simulation began

Returns: true once the simulation has reached its target

### `Position(float64)`

Gets the scalar coordinate at the specified elapsed time.

- `elapsed`: seconds since the simulation began

Returns: the coordinate value at elapsed

### `Velocity(float64)`

Gets the rate of change of progress at the specified elapsed time.

- `elapsed`: seconds since the simulation began

Returns: the velocity at elapsed
