# Vulkan GPU experiments

```sh
dotnet build Goo/Goo.gsproj -c Release -p:GooGpuExperiments=true
GOO_VK_DIAGNOSTICS=1 GOO_VK_GPU_EXPERIMENT=no-text ./Application
```

These internal experiments remove rendering work. They are not application settings.
Normal builds omit the selector and use a compile-time `None` constant. No extra
shader, GPU command or environment lookup is added to a normal frame.

An experiment build also requires `GOO_VK_DIAGNOSTICS=1`. It reads one selection
once, before the first Vulkan frame. Restart the process to change it. With no
selection, rendering is unchanged. Experiment builds retain CPU selection checks.
Do not compare their CPU time with a normal build as an optimization result.

For one Android APK, set `GOO_VK_GPU_EXPERIMENT_FILE` to an absolute path in the
test application's private files directory before Goo starts. The file contains
one table value. If it exists, it overrides `GOO_VK_GPU_EXPERIMENT`. A missing file
uses the environment value. An unknown value or an unreadable file stops startup.
The selected value is printed to standard error. No file is polled during frames.

| Value | Work removed or changed | Limits |
| --- | --- | --- |
| `none` | Nothing | Baseline for every pair |
| `full-redraw` | Damage restriction | Initial swapchain rendering already uses CLEAR, not LOAD. This forces the full surface and disables backdrop reuse |
| `no-text` | Cached text draws, including color glyphs and text effects | Layout, shaping and text uploads remain. Decorations emitted as separate draws remain |
| `no-shadows` | Analytic box and shape shadow draws | Text shadows remain part of text draws |
| `no-images` | Cached image draws | Decoding, uploads, layer boundaries and layer composites remain |
| `no-layers` | Complete offscreen subtrees and generator effects | Removes child paint as well as pass splits. This is not a pure pass-merging comparison |
| `no-clip-sampling` | Clip-chain lookup and sampling in all fragment families | Mask generation remains. Rectangular scissors remain. Shape-shadow masks still sample and their offscreen origin mapping can change |
| `clip-clear-only` | Analytic path draws that populate dirty clip masks | The same dirty regions still CLEAR and STORE. Empty masks hide clipped content, which reduces later fragment work |
| `clip-regenerate` | Retention of clean masks | Forces every acquired mask dirty. Compare static and moving scenes separately |
| `no-gpu-timestamps` | Vulkan timestamp pool, resets and writes | CPU profiling and diagnostics remain. Use presentation data, not missing GPU timings, as its result |

Use one value at a time. `no-images` versus `no-layers` separates image paint from
layer subtrees only approximately. Neither makes arbitrary effects safe to merge.
There is no render-pass merging switch. Sampled intermediate images and backdrop
copies cross rendering boundaries. Replacing them with tile-local inputs is a
renderer change, not a diagnostics switch.

## Measurement

- Use NativeAOT Release and record the APK hash and toolkit commit.
- Use a fixed synthetic message list, fixed images and a deterministic drawer
  animation. Freeze timestamps, caret, network updates and image readiness.
- Keep the same physical surface, scale, language, content and gesture path.
- Run `none`, selected value, selected value, `none`. Repeat that block three times.
- Record GPU frequency through submission-to-completion, thermal state, battery
  temperature, power source, saver state and active display rate for every leg.
  Do not force clocks. Compare matched frequency and thermal bins only.
- Separate cold pipeline-cache startup from warmed steady-state rendering. Save
  the cache with an orderly exit. Do not count force-stop as an orderly exit.
- Capture SurfaceFlinger/FrameTimeline presentation intervals and application
  buffer identity. Queue submission counts are not presentation rates.
- Keep captures and tree snapshots outside timing windows. Use native input.
- Require complete traces, `dropped=0`, no omitted GPU scopes and a final End.
- Report sample counts, p50, p95, p99, max and counts over the target budget.
  Main includes offscreen and effects work. Stage timestamps can overlap.
- Use raw decoded RGBA comparisons for identity-preserving modes. Require equal
  dimensions and maximum channel difference at most 4/255. Suppression modes
  intentionally change pixels and cannot prove production visual identity.
