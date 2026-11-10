## Changed

- The scroll placement smoke compares each scrolled frame, rendered through the retained partial redraw path, against a fresh full render of the same content at the same scroll offset and requires byte equality, and checks that the button border and the nested rows moved by the expected whole device pixels. It no longer encodes one driver's rasterization in per-pose tolerance tables, so it runs unchanged on lavapipe and NVIDIA.
