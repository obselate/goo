## Fixed

- Children placed by a custom `LayoutAlgorithm` now land on device pixels. `ArrangeChild` offsets such as 22.8 are rounded to the device grid when the absolute rect is read, with the same rule Yoga applies to flex layout, so 1 px borders and bevels inside Grid-style layouts draw solid instead of split across two columns. Arranged bounds and cached layouts keep their unrounded values, and repeated relayouts stay identical to a fresh layout.
