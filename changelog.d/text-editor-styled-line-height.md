## Fixed

- `TextEditor` line height is now `FontSize * LineHeight`, the same as `Text` and CSS. Before, a line used the natural font height times `LineHeight`, so editor lines were taller than `Text` lines. The natural font height is no longer a minimum: glyphs can extend into the half-leading, as in CSS. An inline slot still makes its line tall enough to hold the slot.
