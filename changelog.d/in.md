## Changed
- Construct shortcuts with `KeyBinding(key, modifiers, onPress)` or rename literal `Action` to `OnPress`. Use `KeyModifiers.None`, `Primary`, and `PrimaryShift` for common exact modifier combinations.
- Read click and input modifiers from `Window.Modifiers`. Use `KeyEvent.TargetEditsText` or `Window.Focus.EditsText` to keep navigation shortcuts out of text editing.
- Move `PlatformInput.Editor`, `Selection`, `SetSelection`, and `Execute` calls to `Window.Focus`. Replace `PlatformInput.MoveFocus` with `Window.Focus.Move` and `PlatformInput.ClearFocus` with `Window.Focus.Clear`. Keep host injection and composition on `PlatformInput`.
