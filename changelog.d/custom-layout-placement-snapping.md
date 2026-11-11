## Fixed

- Custom layouts and anchored portals snap child and popup positions to device pixels. Custom layouts also update when display scale changes.
- Translation-only transforms snap their combined movement to device pixels. Drawing, hit testing and element bounds use the same position.
- Text, text-input and image boxes round their size up to the device pixel grid, regardless of their position.
