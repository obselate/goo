# Gallery category CPU evidence

`provenance.json` records source revisions, build configuration and binary hashes. The production delta is `MotionChapter.gs`. Both variants use the same diagnostics, input harness, default Yoga backend, assets and system SDL. `source-reconstruction-check.json` confirms that all 646 recorded source inputs can be reconstructed for each variant. The source manifests differ only in `MotionChapter.gs`.

## Reproduce the analysis

Python, NumPy and Matplotlib are required.

```sh
python3 reproduce.py --output /tmp/goo-category-reproduced
```

The helper expands all accepted logs into a temporary directory, relocates manifest log paths, runs both analyses and regenerates the plot. It checks the aggregate JSON and numeric CSV outputs against the archive. It does not run the application. All 12 frame processes and all four scheduler processes are included, including the slower candidate presentation-completion results.

`runs/` holds the ABBA frame logs and manifests. Each fresh process has 120 warmup and 500 measured frames. The three workloads yield 6,000 measured frames, 1,000 per variant and workload. Host measurements enclose a forced frame with pacing outside that interval. They measure CPU-side frame work, not display cadence. GPU samples are validated and matched by frame ID. `analyze_pairs.py` also checks geometry, binary identity, environment, submission/presentation counts and zero resource errors at closure.

`scheduler-runs/` holds a separate ABBA experiment through `Window.Run`, VSync enabled, using native SDL category clicks and no forced frame pump. Each process records five first-cycle and 100 repeated selections. The first cycle is not cold because the initial All Categories page already built the cards. The parser checks destination content, ordered unique presentation IDs and actual present-fence observation. Injection-to-handoff and injection-to-completion-observation are separate endpoints. Neither is scanout. The latter is an upper bound recorded when the UI thread observes the present fence, not a hardware fence signal timestamp.

## Reconstruct and rerun the native experiment

1. Export baseline commit `5d4b360` into a fresh source directory with `git archive`. Apply `overlays/residency-diagnostics-only.patch` there and copy `overlays/harness/` over that source tree. Compare the 646 inputs against `baseline-source-sha256.json`.
2. Publish from that directory with the command in `provenance.json`, substituting an empty `published-baseline` output directory. The harness executable is named `Goo.AsyncReadbackSmoke`. Preserve all assets in its publish directory.
3. Replace only `apps/Goo.Gallery/Views/MotionChapter.gs` with the file from commit `fd104fa`. Refresh its modification time, or clean intermediate outputs. Compare against `candidate-source-sha256.json`, then publish into an empty `published-candidate` directory. Do not reuse an identical baseline executable as the candidate. The original final builds used the same absolute source directory.
4. Start a nested KWin compositor using the arguments in `compositor.json`, adjusting the parent Wayland display if needed. The 1440 by 900 logical child must produce a 2160 by 1350 physical swapchain with three images. Keep both runs on the same device, compositor, SDL and power configuration. The archived compositor was stopped after measurement.
5. Copy the runner scripts and `expected-binaries.json` into a new experiment directory containing both publish directories. The recorded hashes identify the archived binaries. Fresh builds may produce different hashes due to build paths or toolchain changes. Record and inspect new source and asset provenance before recording new binary hashes. Do not change archived hashes or overwrite archived measurements.
6. Run `python3 run_pairs.py --round N` serially for N = 0, 1, 2, 3. Then run `python3 run_scheduler.py --round N` in the same serial order. The scripts reject existing logs and enforce the recorded per-variant binary hash. Keep other benchmarks, builds and profilers stopped during these runs.
7. Run `analyze_pairs.py`, `analyze_scheduler.py`, and `plot_results.py` from the new experiment directory. Compare both process medians and the unchanged layout control before attributing small timing changes.

## Correctness evidence

`validation/` contains the strict production build, production Gallery smoke, complete candidate interaction gate, separate settled visual passes, and both final NativeAOT publish logs. `scheduler-validation/` contains the separate candidate run with Khronos validation enabled. Timing runs have validation disabled.

The full interaction gate covers category visibility, text input, focus, hide/reveal state, reset, switch animation, slider, accordion, resize, scrolling, readback and resource closure. `baseline-interaction-failure.log.gz` records the pre-existing baseline ElementHandle attachment failure in the reset/toggle/category trace. The candidate passes that trace. Baseline visual comparison uses a separate settled-state path that avoids the failing interaction sequence.

`visual-comparison.json` records zero differing bytes and matching SHA-256 hashes for six full RGBA captures. Each capture contains 11,664,000 bytes. `visuals/` retains one lossless PNG per identical pair. Full interaction captures are not claimed to be byte-identical.

No general virtualization, paced construction queue or frame scheduler change is included. Retention is bounded to the four component cards. The report distinguishes this CPU optimization from the unresolved normal-scheduler completion-latency result.
