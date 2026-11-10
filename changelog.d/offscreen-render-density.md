## Fixed

- Offscreen pages (`OffscreenRenderSession`, `goo render --scale`) lay out at the render scale, so boxes snap to device pixels at 1.25x or 1.5x the same way a window at that display scale does. Integer scales are unchanged.
