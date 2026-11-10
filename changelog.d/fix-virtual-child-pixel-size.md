## Fixed

- `VirtualViewport.Child(i).Size` is the layout size before rounding to device pixels. At fractional scales a 33 px row no longer reads as 32.67 or 33.33, so measured virtual rows keep exact offsets.
