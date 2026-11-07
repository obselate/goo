## Fixed

- Upload new glyphs and rebuild the acquired frame before presenting a text edit. Do not present a frame with missing text while its glyphs are pending.
- Reset timestamp queries before use when profiling starts during a pending upload replay.
