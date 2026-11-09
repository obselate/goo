## Fixed

- Keep the natural stroke thickness of round glyph tops and bottoms when fitting outlines to device pixels. The edge on the baseline, x-height or cap height stays on a whole pixel row and the stroke's other edge follows it, so the top and bottom of o, 0, e, s and similar glyphs are symmetric instead of one stroke being squashed to a thin row.
