## Fixed

- Shape text at 1/65536 em instead of 1/64 em, and fit glyph outlines to device pixels at every display scale and size, so fractional and high-density displays get correct glyph spacing and crisp horizontal edges. Text whose size changes from frame to frame, such as a font size animation or a UiScale change, draws unfitted until its size holds for two frames, so animations do not fill the glyph atlas with fitted variants.
