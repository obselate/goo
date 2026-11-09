## Fixed

- Rotated or skewed rectangles with square corners, and their square borders, now anti-alias their edges. Their quads were not expanded under these transforms, so pixels just outside an edge were never shaded.
