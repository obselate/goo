## Fixed

- Interpolate computed width and height with position in `LayoutTransition`. Paint, hit testing, metrics and accessibility use the same bounds. Descendants keep their final layout size without scaling or per-frame text reflow. Interrupted transitions preserve velocity on all four axes.
