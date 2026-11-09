## Fixed

- Box shadows now integrate the Gaussian blur over the rounded rectangle instead of blurring its signed distance, so corners are no longer twice as dark as the blur radius allows and the shadow carries the correct total weight (ink was 1.06 to 1.53 of a true Gaussian at blur 4 to 24, now 0.98 to 1.00). The shadow coverage is dithered by one level, which removes banding in large soft shadows.
