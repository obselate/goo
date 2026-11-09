## Changed

- Rounded rectangles, gradients, borders and sharp shadows now use box filter edge coverage instead of a cubic smoothstep, so their edge pixels match exact area coverage (edge error 12/255 to 4/255) and use the same filter as text and vector paths.
