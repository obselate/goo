# Blob cost table, 2026-09-05

5 fresh processes per Blob, 1,000 cells, 300 warmup frames and 2000 measured frames. Validation: disabled.

| Blob | Cold CPU low/worst (ms) | Cold alloc low/worst (B) | Warm CPU P50/P95/P99 (ms) | Warm alloc P50/P95 (B/frame) | Managed/RSS/PSS (MiB) |
| --- | ---: | ---: | ---: | ---: | ---: |
| Container | 5.010 / 13.616 | 664 / 159,216 | 0.804 / 1.311 / 2.228 | 664 / 664 | 6.50 / 158.1 / 98.9 |
| Button | 5.476 / 14.042 | 1,120 / 159,672 | 0.680 / 1.328 / 2.070 | 1,120 / 1,120 | 6.65 / 161.0 / 101.7 |
| Text | 9.004 / 25.928 | 74,912 / 855,584 | 1.304 / 2.135 / 2.851 | 776 / 776 | 10.32 / 174.0 / 114.9 |
| TextEntry | 27.485 / 30.396 | 75,432 / 654,800 | 3.368 / 4.510 / 5.308 | 824 / 824 | 11.81 / 178.1 / 118.9 |
| TextEditor | 26.113 / 35.232 | 76,088 / 655,544 | 3.852 / 5.027 / 5.754 | 968 / 968 | 14.04 / 182.5 / 123.3 |
| Image | 6.871 / 22.251 | 156,528 / 990,720 | 1.233 / 1.874 / 2.426 | 640 / 640 | 7.91 / 175.7 / 116.5 |
| Shape | 5.105 / 22.019 | 4,344 / 765,384 | 0.981 / 1.589 / 2.205 | 1,776 / 1,776 | 6.72 / 160.7 / 101.5 |

Cold values are medians of the 5 process-level lows and worsts, each computed from two post-initial-render frames. Warm CPU and allocation values are medians of process-level quantiles. Managed, RSS, and PSS are medians from the same post-measurement forced-GC checkpoint. Detailed minimum and maximum process values remain in analysis.json.

## GPU companion

| Blob | Main P50/P99 ms | Upload P50/P99 ms | Vulkan allocated MiB |
| --- | ---: | ---: | ---: |
| Container | 0.004 / 0.015 | 0.000096 / 0.000096 | 6.0 |
| Button | 0.004 / 0.015 | 0.000096 / 0.000096 | 6.0 |
| Text | 0.024 / 0.061 | 0.000096 / 0.000096 | 6.0 |
| TextEntry | 0.410 / 0.436 | 0.000096 / 0.000160 | 8.0 |
| TextEditor | 0.411 / 0.465 | 0.000096 / 0.000160 | 8.0 |
| Image | 0.004 / 0.015 | 0.000096 / 0.000096 | 22.0 |
| Shape | 0.144 / 0.150 | 0.000096 / 0.000224 | 6.0 |

Main is the outer renderer timestamp scope. It excludes presentation and separate upload timing, and it may enclose effects and offscreen work. Do not sum stage timings. Vulkan allocated MiB is Goo-tracked Vulkan allocation across memory types at the measured endpoint, not physical VRAM residency.

## Measurement scope

Each process mounts 1,000 stable leaf Cells in a 50 by 20 grid inside a 1000 by 640 window. Exactly one Cell changes opacity per frame. The parent builds once. Button has no text child, text variants contain one glyph, Image shares one immutable pixel, and Shape shares one immutable triangle. This workload measures retained surface updates, not text editing, changing image content, or path morphing.

Cold means the first two update frames after one untimed initial render. It does not measure process startup, window opening, or first paint. Low and worst are computed within each process, then the table takes the median of each field across five processes. Warm percentiles are also medians of five process-level percentiles, not pooled percentiles.

CPU is host frame wall time from mutation through rendering and queue reconciliation, including waits. Allocation is managed bytes allocated by the frame thread inside that scope. Managed is GC.GetTotalMemory(true). RSS and PSS come from one /proc/self/smaps_rollup read immediately after that collection, before window close. RSS and PSS therefore share a sampling point. The historical screenshot used Process.WorkingSet64 for RSS. These are fresh measurements, not a controlled speedup comparison against the screenshot.

## Environment and verification

AMD Ryzen 7 3700X, NVIDIA GeForce RTX 3080, NVIDIA driver 610.57.04, Linux 7.2.0-1-cachyos, .NET SDK 10.0.302, Gsharp.NET.Sdk 0.4.1. A dedicated KWin virtual Wayland compositor runs at scale 1. The benchmark disables VSync. The normal desktop remains active, and per-run CPU load and device-wide GPU state are archived. These results are from Linux hardware only.

Seven separate Vulkan-validation runs use 50 warmup frames and 100 measured frames each. The final 35 timing runs disable validation and use 300 warmup frames and 2,000 measured frames each. No builds or other benchmarks run concurrently. Strict G# lint and the Release build pass. Every process checks exact cold/warm/measured Cell build and mutation counts, submit/present counts, complete main-pass GPU samples, both frame slots, no dropped timestamp scopes, and zero tracked allocator bytes, Vulkan allocation bytes, native objects, and readback-pool bytes after close.

## Evidence and reproduction

The evidence directory contains all 42 process logs, raw cold observations, per-run quantiles, paired memory snapshots, CPU/GPU context, source and binary hashes, the task patch, and the runner/analyzer scripts. The prior all-mode benchmark remains unchanged.

Build tests/Goo.AsyncReadbackSmoke/Goo.AsyncReadbackSmoke.gsproj in Release and freeze its output in a separate runtime directory. Run the archived run.py with --phase pilot --validation, then --phase final --no-validation, using --runtime and --wayland-display for that runtime and test compositor. Run analyze.py RUNS_JSON --output OUTPUT --expected-rounds 5 for the final table.

[Raw runs](https://github.com/obselate/goo/blob/1003f46a94a9087b289326c52c7a6ee600766b7a/docs/perf/evidence/blob-cost-table-2026-09-05/results/final/runs.json), [table CSV](https://github.com/obselate/goo/blob/1003f46a94a9087b289326c52c7a6ee600766b7a/docs/perf/evidence/blob-cost-table-2026-09-05/results/final/table.csv), [detailed ranges](https://github.com/obselate/goo/blob/1003f46a94a9087b289326c52c7a6ee600766b7a/docs/perf/evidence/blob-cost-table-2026-09-05/results/final/analysis.json), [coverage audit](https://github.com/obselate/goo/blob/1003f46a94a9087b289326c52c7a6ee600766b7a/docs/perf/evidence/blob-cost-table-2026-09-05/coverage-audit.json), [HTML table](blob-cost-table-2026-09-05.html), [prior full matrix](all-blobs-2026-09-05.md).
