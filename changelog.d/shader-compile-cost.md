## Changed

- Path fill, stroke and clip-mask fragment shaders share one axis-generic coverage traversal and single copies of the stroke dash, cap and parameter routines, so driver shader compilation does less work on the first draw of a new scene with the same pixels.
