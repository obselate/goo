## Fixed

- Interpolate computed width and height with position in `LayoutTransition` for application commits. Single-line flex placement and absolute insets follow visible sizes without remeasuring or scaling children. Wrapped flex, custom layout and `Sized` keep their target local placement. Resize, scale and resource updates apply at once without restarting application motion. Paint, hit testing, metrics and accessibility use the same bounds. App retargets preserve velocity on all four axes.
