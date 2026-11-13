# Motion API

Source: [`Goo/Motion`](https://github.com/obselate/goo/tree/main/Goo/Motion)

## Bind animated paint values

```gsharp
class AnimatedPanel : Cell {
    private let opacity Anim[float64]
    private let translation Anim[Point]
    private var dimmed bool

    init() {
        opacity = AnimateValue(1.0)
        translation = AnimateValue(Point{})
    }

    override func Build() Blob {
        let theme = Theme.Read()
        return Container{
            BasedOn: theme.CanvasStyle,
            FlexGrow: 1,
            Padding: theme.Spacing * 6,
            Gap: theme.Spacing * 3,
            Container{
                BasedOn: theme.PanelStyle,
                Padding: theme.Spacing * 6,
                OpacityAnim: opacity,
                TranslateAnim: translation,
                Text{Content: "Animated panel", FontSize: theme.H2FontSize},
            },
            ActionButton{
                Content: "Animate panel",
                OnClick: () -> {
                    dimmed = !dimmed
                    let motion = Motion.Tween(theme.MotionNormalMs)
                    translation.To(
                        Point{
                            X: if dimmed {
                                theme.Spacing * 4
                            } else {
                                0.0
                            }
                        },
                        motion
                    )
                    opacity.To(
                        if dimmed {
                            .25
                        } else {
                            1.0
                        },
                        motion
                    )
                },
            }.Build(),
        }
    }
}
```

Use `Goo.Widgets`, `Goo.Widgets.Actions` and `Theme.Attach(window, Theme.Default)`
for this example. Set the window's root to `AnimatedPanel()`.

| Contract | Behavior |
| --- | --- |
| Value binding | `AnimateValue(initial)` updates paint without rebuilding. `Animate(initial)` rebuilds its Cell. Both own and dispose the Anim. |
| Slots | All primitives inherit paint slots from Style. Inline text ranges and text presentation styles cannot bind slots. |
| Transforms | `TranslateAnim` takes `Anim[Point]` in pixels. `ScaleAnim` takes a uniform factor. Other Transform components stay declared. |
| Precedence | A slot wins over the field declaration and `TransitionMs`. Ticks do not run Build or layout. Inherited text colors reach descendants without their own declaration. |
| Rebinding | The same Anim keeps its binding. Removing a slot or disposing the Anim restores the latest declaration under normal transition rules. Pause and completion keep the value bound. |
| Lifetime | Anim and target belong to the same window. Removing the target releases the binding, not the Anim. `Set` and `Snap` request a frame while bound. |
| Reduced motion | Uses normal Anim settlement. Custom simulations use the same slots. |
| Infinite simulations | Override `Simulation.IsInfinite`. Fully clipped, offscreen, hidden or minimized targets skip ticks and resume at the current phase. See [Simulation.IsInfinite](#isinfinite). |
| Unbound animations | Infinite `AnimateValue` without paint bindings requests no frames. Other unbound animations use their owning Cell's mounted element. |
| Finite simulations | `IsInfinite` defaults to false. Finite and unmarked custom simulations keep ticking and deliver completion. |

## Layout position simulations

`LayoutTransition(durationMs, easing)` uses a timed transition. Set its optional
`SimulationFactory` to supply a Simulation for each position axis.
The factory receives the starting offset, target offset and incoming velocity.
Interrupted transitions retain visual position and pass sampled velocity to the replacement.

Spring equations belong to Goo.Animations or an app simulation. Core owns layout,
sampling and invalidation. The simulation must settle at the supplied target.
Reduced motion snaps to final layout and disposes active work.
Keep the same factory delegate while its policy stays the same.

## `Anim<T>`


Bridges scalar simulations to a Cell-owned animated value.

### `Completed`

Reports completion once after the owning motion pump settles, on its UI thread. Retarget, Set, Snap, and disposal cancel pending delivery. A handler may retarget this animation; the new run advances on a later pump. Handler failures propagate after the remaining completion batch is delivered, unless the window closes.

### `Pause`

Holds the current value until Resume, retargeting, or forced completion.

### `Play(T,T)`

Snaps to the start value, then animates with Motion.Default. Restarts on every call. Call it from an event, Mounted or a callback, not unconditionally in Build.

- `from`: value to start from
- `to`: value to animate toward

### `Play(T,T,System.Func{float64,float64,float64,Simulation},System.Func{float64,float64,float64,Simulation}[])`

Snaps to the start value, then animates toward the target. Restarts on every call. Call it from an event, Mounted or a callback, not unconditionally in Build.

- `from`: value to start from
- `to`: value to animate toward
- `spec`: first specification
- `specs`: remaining specifications, empty for shared behavior

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


Describes an opt-in position transition using DurationMs and Easing, or a custom SimulationFactory.

### `SimulationFactory`

Creates an optional simulation for each position axis. Omission uses DurationMs and Easing. The simulation starts at from with the supplied velocity and settles at to.

## `Motion`


Configures the animation core. Animation durations use milliseconds. Simulation elapsed time and velocity use seconds.

### `Delay(float64,System.Func{float64,float64,float64,Simulation})`

Holds the start value before running a scalar simulation factory. Position stays at the start value, velocity is zero, and Done is false during the delay. The simulation then receives elapsed seconds minus the delay. Reduced motion and TimeScale at zero or below skip the delay.

- `delayMs`: finite, nonnegative delay in milliseconds
- `spec`: simulation factory to run after the delay

Returns: a reusable factory with the delay applied

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


Identifies why an animation reached its terminal value. Finished means all simulations ended naturally. ReducedMotion means the host requested less motion. Disabled means Motion.TimeScale is zero or negative and takes precedence.

### Values

- `Finished`
- `ReducedMotion`
- `Disabled`

## `MotionConverter<T>`


Converts an animated value to fixed scalar simulation coordinates.

### `new(int32,System.Action{T,float64[]},System.Func{float64[],T})`

Creates a converter with a fixed coordinate count and conversion callbacks.

- `dimensions`: positive coordinate count
- `read`: writes a value into an Anim-owned coordinate buffer
- `write`: creates a value from an Anim-owned coordinate buffer

## `MotionVelocity`


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

### `IsInfinite`

Gets whether this simulation runs indefinitely. The default is false. An animation with only infinite simulations skips ticks while its node is fully clipped or its window is hidden, then resumes at the current clock phase.
