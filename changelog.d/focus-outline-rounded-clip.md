## Fixed

- Fit focus outlines inside non-scrolling clipping ancestors, so rounded `Overflow.Hidden` parents no longer cut focus rings. A clipped outset ring moves onto its control and keeps the control's corner radius, and takes the parent's corner radius only where the control meets a rounded parent corner.
