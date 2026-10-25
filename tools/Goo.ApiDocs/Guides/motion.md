## Bind animated paint values

```gsharp
class Fade : Cell {
  let fade = AnimateValue(1.0)
  override func Build() Blob -> Container{ Opacity: 1.0, OpacityAnim: fade }
  func Hide() { fade.To(0.0, Motion.Tween(200.0)) }
}
```

- `AnimateValue(initial)` does not rebuild its Cell. `Animate(initial)` still rebuilds. Both own and dispose the Anim.
- Slots are inherited from `Style` by every primitive. Use `OpacityAnim`, `BackgroundColorAnim`, `BorderColorAnim`, `BorderStartColorAnim`, `BorderEndColorAnim`, `OutlineColorAnim`, `ColorAnim` or `TextStrokeColorAnim`.
- Slots bind mounted elements, not inline text ranges or text presentation styles.
- `TranslateAnim` takes `Anim<Point>` in pixels. `ScaleAnim` takes a uniform factor. Other `Transform` components stay declared. No layout fields have slots.
- A slot wins over the field's declaration and `TransitionMs`. Ticks change paint without Build or layout. Inherited text colors reach descendants without their own color declaration or slot.
- Rebuilding with the same Anim keeps the binding. Removing the slot or disposing its Anim restores the latest declaration under normal transition rules. Completion and pause keep the value bound.
- An Anim and its target must belong to the same window. Removing the target releases the binding, not the Anim. `Set` and `Snap` request a frame while bound.
- Reduced motion uses the Anim's normal settlement. Custom `Simulation` values, including Goo.Animations specifications, use the same slots.
