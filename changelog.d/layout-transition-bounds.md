## Fixed

- Interpolate computed width and height with position in `LayoutTransition` for application commits. Resize, scale, resources and placement apply at once without starting or restarting a transition. An active animation keeps its application offset, velocity and clock. Paint, hit testing, metrics and accessibility use the same bounds. Descendants keep their final layout size without scaling or per-frame text reflow. App retargets preserve velocity on all four axes.
