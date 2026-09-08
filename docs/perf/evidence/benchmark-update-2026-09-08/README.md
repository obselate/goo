# Updated benchmark evidence

The new chart copies the earlier four-panel layout and uses fresh before/after production measurements. `original-chart.png` is the historical reference, not an input to the new numerical analysis.

`overlays/provenance.json` records exact source revisions, build commands, source delta, executable hashes, SDK/toolchain, SDL and asset manifests. Reconstruct each source with `git archive` at its recorded revision. Overlay `overlays/harness/`, then apply `overlays/residency-diagnostics-only.patch`. No prototype policy switches are included. Publish using the recorded commands with paths adjusted for the machine.

`runs/` contains all 28 accepted process logs, compressed losslessly, and their execution manifests. `run_chart.py` runs a round against the recorded binary hashes. It rejects reused output directories. Run rounds 0, 1, 2 and 3 serially with the owned compositor configured as recorded in `compositor.json`. The compositor has been stopped after collection.

`analyze_chart.py` checks workload identity, binary hashes, environment, 500 valid matched CPU/GPU records per process, completed submission/presentation counts, geometry, image residency and clean resource closure. It pools 1,000 frames per workload/revision. Memory comparisons use the median of the two pre-GC boundaries. `plot_chart.py` uses the resulting values, including Vulkan allocator block totals, with no hardcoded memory-result bars.

To regenerate results and charts from this archive with Python, NumPy and Matplotlib:

```sh
python3 reproduce.py --output /tmp/goo-chart-reproduced
```

The reproduction helper expands logs into a temporary directory and relocates only manifest log paths. It retains binary, environment, frame and geometry checks. It does not rerun native benchmarks.

`preflight/` holds the separate candidate visible-image Khronos validation run at 2160 by 1350. `rejected-extent-validation/` holds the initial baseline preflight at 2160 by 1296. That preflight is excluded from all chart numbers. Enlarging the nested compositor allowed the requested 1440 by 900 logical window to fit without clamping.

No measured run is excluded for having an unfavorable result. In particular, the first updated Radial process has 237 frames with Build allocation. Both Radial processes remain in the CSV and aggregate. CPU run variation and tails must be considered when comparing small timing differences.
