## Fixed

- Round scroll offsets half up like layout placement, so content at a whole-pixel distance from the viewport edge no longer paints 1 px off at half-pixel scroll offsets.
- Pixel snapping no longer moves whole-pixel positions above 8,388,608 px in very long scroll content.
