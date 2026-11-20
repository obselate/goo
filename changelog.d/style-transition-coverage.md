## Changed

- Extend `TransitionProperties` with outline width, color and offset, text stroke width and color, text shadow stacks, background gradients, shape corner radius, stroke trim bounds, miter limit, dash phase and intervals, selection color and editor caret color. These use the existing duration, delay, easing and reduced-motion policy. Text shadow counts must match. Gradient types and stop counts must match. Dash interval counts must match after odd-count normalization. Incompatible values remain discrete. Transparent text shadows retain their declared slots for fades. `All` now includes these values. Use an explicit selector list or `TransitionMs: 0` to keep them discrete. Use the new `BackdropBlur` selector to opt in explicitly. Backdrop blur already animates under `All`.
- Preserve float64 precision for shape geometry, dash values and gradient geometry during transitions.
- Box shadow colors now interpolate with premultiplied alpha, like other style colors.
