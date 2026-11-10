## Added

- Diagnostics counters report `layerPoolResolutionShift`, and a `capture` response reports `layerResolutionShift` and `degraded`, so a capture rendered with reduced offscreen layer resolution under GPU memory pressure is identifiable. `goo capture` prints a note on stderr and includes the value in `--json` output.
