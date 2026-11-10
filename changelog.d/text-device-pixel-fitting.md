## Fixed

- Shape text at 1/65536 em instead of 1/64 em, and fit glyph outlines to device pixels at every display scale and size, so fractional and high-density displays get correct glyph spacing and crisp horizontal edges. Text is fitted when it first appears and when its size changes once, so static text is never presented unfitted. Text whose size changed in two consecutive frames, such as a font size or UiScale animation, draws unfitted until its size has held for a frame, so animations do not fill the glyph atlas with fitted variants.
