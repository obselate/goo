## Changed

- Rounded rectangle fills, gradients and borders compute the exact pixel area inside the shape at their edges, and rotated or skewed shapes use the exact pixel area under the edge line, so small circles, pills and corners match exact coverage (edge error up to 54/255 at small radii, now about 1/255).
