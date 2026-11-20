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
                    translation.To(Point{X: if dimmed { theme.Spacing * 4 } else { 0.0 }}, motion)
                    opacity.To(if dimmed { .25 } else { 1.0 }, motion)
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

## Layout bounds simulations

`LayoutTransition(durationMs, easing)` interpolates application changes to computed x, y, width and height.
Set `SimulationFactory` to supply a Simulation for each changed axis.
The factory receives the starting offset, target offset and incoming velocity.
An application retarget keeps the displayed bounds and passes sampled velocity to the replacement.

| Values | Owner |
| --- | --- |
| Application changes to computed position and size, including sibling and parent reflow | `LayoutTransition` |
| Declared lengths, spacing, colors, border radii and widths, opacity, shadows, typography and transforms | Style `TransitionProperties` |

The box paints at its interpolated size. Borders and radii are not stretched.
Single-line flex placement and absolute insets follow the visible sizes of the box and its children.
Position simulations animate only the change not explained by that placement.
Wrapped flex, custom layout and `Sized` keep their target local placement.
Text is not scaled or reflowed on each motion frame. A clipping box clips its descendants
at its interpolated bounds. Hit testing, metrics and accessibility use the same geometry.
Style transitions compose with these bounds. A layout-valued style or Motion binding
uses its sampled layout directly. It does not start another bounds animation each tick.

| Cause | Bounds behavior |
| --- | --- |
| App State, authored declarations, logical text edits and explicit rebuilds | Animate the retained slot delta under the current environment. |
| Window or embedded viewport size, programmatic `Window.Size`, scale, DPI, fonts and image completion | Apply the new target at once. Keep any current application offset, velocity and clock. Do not call the factory. |
| Size-driven builders, scroll, virtual realization, portal clamping and unattributed layout dirt | Apply at once. Do not start a transition. |
| One Build that reads both changed app State and changed window metrics | Treat the Build as one application commit. Its responsive output can animate. |

Scrolling and ancestor-only movement do not start a transition.

Spring equations belong to Goo.Animations or an app simulation. Core owns layout,
sampling and invalidation. The simulation must settle at the supplied target.
Reduced motion snaps to final layout and disposes active work.
Keep the same factory delegate while its policy stays the same.
