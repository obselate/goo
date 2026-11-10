## Fixed

- `TextEditor` line height is now `FontSize * LineHeight`, the same as `Text` and CSS. Before, a line used the natural font height times `LineHeight`, so editor lines were taller than `Text` lines. When the font is taller than the line, the editor adds the overflow above the first line and below the last line, so ascenders and descenders are not clipped. An inline slot still makes its line tall enough to hold the slot.
