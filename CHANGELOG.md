# Changelog

## Unreleased

- Keep damage clipping inside offscreen opacity and rounded-overflow layers.

## 0.22.3 - 2026-10-28

- Read configured fallback fonts in the background before their first layout.
- Avoid duplicate font reads when preloading a large primary family.
- Reduce GPU work for large rounded borders without changing their pixels.

## 0.22.2 - 2026-10-28

- Reduce large backdrop blur work with a two-axis downsample pyramid.
- Wait for pending images before the first presentation and after showing a layer window, with a 500 ms image-wait budget.
- Keep layer-shell roles across Hide/Show and restore their requested layer. Layer-shell windows now require protocol version 2 or newer.

## 0.22.1 - 2026-10-27

- Release cached GPU images before reclaiming dead image-provider identities.
- Cancel `Window.Closed` after native teardown finishes or fails, not when closing starts.

## 0.22.0 - 2026-10-27

- Add `Window.LayerShell` for Wayland panels and overlays with output anchors, reserved space and keyboard focus.

## 0.21.0 - 2026-10-27

- Add ImageSource.EncodePng for PNG export from premultiplied RGBA images.
- Prevent stale generated-doc pushes and retry hdiutil verification only for the exact EAGAIN error.
- Fix Weston 13 popup crashes with the initial SDL popup commit.
- Keep hover active in unfocused windows while keyboard and press input stay blocked.

## 0.20.0 - 2026-10-26

- Add Shape.UseCurrentColor to fill solid shapes with inherited Color.

## 0.19.1 - 2026-10-26

- Hover callbacks on retired virtual rows no longer rebuild the parent Cell

## 0.19.0 - 2026-10-26

- Window.FrameTheme, ContentUnderTitlebar and TitlebarControlsRect for native dark frames and macOS full-size content

## 0.18.1 - 2026-10-26

- Enable the SDL tray API on Linux.

## 0.18.0 - 2026-10-25

- Add `PlaceholderColor` to `TextEntry` and `TextEditor`.

## 0.17.0 - 2026-10-25

- Fix the native transfer check when its peer exits before the close request.
- Keep the original stack for failures in reconciler mount and factory-build paths.
- Fix documentation commands, navigation, sibling-key guidance and plugin reference links.
- Add Android API reference generation and public-type documentation checks.
- Trim readmes, authoring guidance and public summaries.
- Trim guides and consolidate shared checklists.
- Add declarative paint animation slots and non-rebuilding Cell.AnimateValue factories.

## 0.16.1 - 2026-10-24

- Apply requested font weights to system variable fonts, so variable system fonts no longer render at their default weight.
- Omitted print DPI settings default to 300 for consumers instead of 0.
- Keep the original Build stack trace when a cell build throws during a frame.
- Remove Python from notification, data-transfer and input-build host checks, and merge activation checks into one G# host-check tool.

## 0.16.0 - 2026-10-24

- BREAKING: Remove PinToBottom and Pinned from core and move log tail-following policy to consumer state and Widgets.
- BREAKING: Gestures, Images, NativeDialogs, NativeMenus, Printing, SpellCheck and Notifications are now part of Goo and Goo.Android. Remove those package references. Namespaces are unchanged.
- BREAKING: Desktop activation, placement and single-instance hosting are included in Goo. Remove the Goo.AppHost package reference.
- Add MIME clipboard data, native data drag and Android document streams.
- Add optional native notifications with explicit permission, delivery and activation results.
- Path encoding allocates about 18% less by passing encoder scratch lists directly instead of copying them to arrays.
- Reduce Yoga style allocation during virtual grid scrolling with inline style buffers and constant edge names (SWARM B/render down 4 to 6%, GC pause totals down).
- Unify bounded external input reads, including Android clipboard MIME and document streams.
- Add native tray icons and platform lifecycle checks to core Goo.
- Add Android notifications with explicit permission and warm and cold activation.
- Add managed ICC conversion for RGB matrix/TRC and gray image profiles.
- Share managed ICC conversion with consumer image decoders.
- Remove Python and uv from the Goo plugin runtime by shipping its MCP tools in Goo.DevTools.
- Move production shader authoring inputs into Goo and remove the unused solid-quad pipeline.
- Add HTML and RTF clipboard editing in Goo.
- Make repeated registration of identical font sources a no-op.
- Publish release packages to GitHub Packages as well as NuGet.org.
- Remove Python from managed-host repository tools, CI qualification and investigation runners.

## 0.15.0 - 2026-10-24

- Goo 0.14.0 was tagged but never published to NuGet. Its changes ship in this release.
- Fix NuGet publishing after GitHub release assets were removed.
- Add optional desktop instance hosting and supported window placement capture and restore.
- Fix the generated documentation sync for the optional package API pages.
- Remove unused qualification files and execute the Android detached-page proof.
- Remove the stale docs baseline and forthcoming-SVG claim.
- Fix Android accessibility smoke event synchronization.
- An ElementHandle can move to another element within one tree update (branch switch, nested keyed reorder, parent replacement) without throwing. Two live elements sharing a handle still throw.

## 0.14.0 - 2026-10-24

- Fall back to the primary macOS spelling dictionary when the full tag is unavailable.
- GitHub releases now contain notes only. Packages stay on NuGet.
- Add SVG-aligned non-scaling vector strokes with retained local geometry.
- Keep dashed and dotted border patterns evenly spaced through rounded corners.
- Remove the unused bundled G# compiler and formatter from the Goo package, cutting it from 16.1 MB to 12.8 MB.
- Remove unused internal helpers without changing the public API.
- Smooth large analytic gradients with static output-space dithering.
- Use ordinary style entries for Button centering defaults and remove the special reconciler path.
- Fix API documentation mapping for root G# package declarations.
- Cut backdrop blur GPU cost with an alpha-preserving Gaussian mip chain (3x faster at sigma 16, 6-7x at sigma 64-128 on an RTX 3080), shared by both blur paths.
- Add GC pause attribution, bounded tail summaries, cap-wait timing and opt-in allocation type samples to the profiler.
- Fix border antialiasing across fragment quad lanes and make coverage derivatives safe on RDNA2 and MoltenVK.
- Fix path-filtered CI jobs running repository commands without checkout.
- Reuse one test-enabled Goo assembly across Linux fixture lanes.
- Remove Gallery dependencies from shader and profiler UI qualification.
- Share one Vend Sans source font and license across demos and benchmarks.
- Match ordinary node hit regions to painted rounded corners.
- Port first-party Android code to G#.
- Reveal keyboard focus targets through nested scroll regions.
- A contour with only a MoveTo no longer makes the rest of the path's stroke disappear.
- Building unchanged decorated text no longer allocates per frame (160 B to 0 B), and changed text allocates less (2,768 B to 2,184 B).

## 0.13.0 - 2026-10-23

- Port the repository build tools, linter and package projects to G#.
- Stop queued application actions from running during deferred owner close.
- Port the goo CLI and its packaging commands to G#.
- Add a consumable window key preview for overlay dismissal.
- Port the core, API, image, gesture, Vulkan ABI and native menu test projects to G#.
- Port the optional printing and spelling packages and tests to G#, fixing macOS available spelling languages.
- Remove managed allocations from vector path comparison and hot color comparisons. Comparing two equal 128-rectangle paths drops from 179 us and 502 KB to 18 us and 0 B.

## 0.12.1 - 2026-10-23

- Publish Goo.Audio without an empty symbol package, so every package publishes. Goo.DevTools, Goo.DevTools.App, Goo.Templates, Goo.SpellCheck and Goo.Printing missed 0.12.0.

## 0.12.0 - 2026-10-23

- Fix an early Wayland popup presentation that could close the display connection.
- Breaking: sound moves into the optional Goo.Audio package. Add a Goo.Audio reference if your app plays sounds. It has explicit statuses, bounded streaming, live gain, pause/resume and extended WAV decoding.
- Add Android playback to Goo.Audio.
- Add optional platform click and alert sounds.
- Add output-device selection to Goo.Audio.
- Reduce paint cost for large paths 4x to 14x without changing encoded band output.
- Keep retained paths resident when fresh paths need cache space mid-frame, reclaiming only what is needed, least recently used first.
- Cut GPU paint cost for large retained paths with density-aware band counts (a 10,000-point path: 75 to 28 ms GPU per frame).

## 0.11.0 - 2026-10-23

- Drain Vulkan work before process exit, fixing intermittent crashes when an app returns from Main with a window open.
- Release unmounted window roots when their host closes.
- Add optional owned native message boxes for Windows, macOS and Android.
- Add native popup surfaces with platform grabs, dismissal and typed results.
- Android now supports native Goo popup surfaces with owner-bound rendering and dismissal.
- Bound Android accessibility harness teardown after its checks finish.
- Retain shared vector identities across transform-only draws and sweep dead identities once per frame.

## 0.10.0 - 2026-10-23

- Add external Vulkan image import and retained frame release ownership.
- Import DMA-BUF images with explicit modifiers and fence readiness.
- Add retained Metal texture and IOSurface import with shared-event readiness.
- Add geometry and focus operations for external accessibility hosts.
- Expose Goo controls as Android virtual accessibility nodes.
- Preserve Android accessibility identity and geometry across Surface recreation.
- Android accessibility now sends incremental updates and live-region events.
- Android accessibility now has native API 36 emulator checks in CI.
- Bound Android native menu harness startup and cleanup.
- Fix offscreen and embedded virtual scrolling that stopped realizing rows in Goo 0.8.1.
- Add bounded offscreen page rendering and retained renderer sessions for native OS services.
- Add optional spell checking, editor suggestions, raster PDF export and system printing.

## 0.9.0 - 2026-10-23

- Breaking: FontFamily no longer loads font files from paths. Load them explicitly with the size-bounded FontSource.FromPath factories.
- Keep scrollbar thumb drags active when virtual rows retire.
- Add shared edit hints and Android keyboard and focused-field autofill mapping.
- Add optional macOS native menu bars and context menus.
- Add Windows native menu bars, context menus and accelerators.
- Add Android native context menus to Goo.NativeMenus.
- Keep DevTools pipe cleanup from masking capture results after a peer disconnect.
- Add raster density metadata and scale-change snapshots for HiDPI image assets.
- Add optional scale-aware image asset families.

## 0.8.2 - 2026-10-23

- Shipped in 0.8.1 without a note: clip atlas samplers clamp to edges with transparent UV bounds, so Metal through MoltenVK can create them (#311).
- Update HarfBuzz to 15.0.0 to include COLR correctness fixes and bounded paint work.
- Build text and image natives with bounds, stack and branch protection, and fix a stb_image empty-IDAT pointer edge case.
- Check Windows native build reproducibility and disabled optional HarfBuzz components in CI.
- Expose the saved activity Bundle during Android window creation.
- Add consumer Linux AppImage packaging through goo package.
- Add unsigned Windows consumer installer packaging.
- Add macOS consumer app and DMG packaging.
- Add signed Android AAB packaging and upload-key guidance.
- Sync generated documentation on main after merge instead of requiring it in PRs.
- Add C#, F# and VB interop guides and package-backed samples.
- Apply EXIF orientation to PNG and JPEG images and thumbnails, ignoring malformed metadata.
- Detect nullable reference annotation changes in the public API gate.
- Deliver coherent Android contact frames to shared gesture recognizers.
- Publish Goo.Gestures with embedded symbols only, so the release job publishes every package (Goo.DevTools, Goo.DevTools.App and Goo.Templates missed 0.8.1).
- Expose OS UI and event sound preferences through PlatformPreferences.EventSoundsEnabled.
- Report system accent colors and available Linux and Android contrast preferences.
- Expose ordered preferred locale tags through platform preference snapshots and change events.
- Reduce grid scroll GC pauses by keeping scene owner IDs on nodes until a compiler handoff.

## 0.8.1 - 2026-10-23

- Coalesce scroll-only virtual row work while presentation is blocked, cutting grid thumb-drag p99 and max frame time.
- Remove revision-only conflicts from bundled docs manifests.
- Shipped in 0.8.0 without a note: core touch gesture arbitration and selection affinity access (#257), parallel Linux fixture CI jobs (#275).
- Add optional shared gesture recognizers in Goo.Gestures and SDL scale-only trackpad pinch.
- Add an Android starter template and shared launch, deep-link and document activation.
- Add nightly ten-minute generated-input quality checks for SVG, raster images, WAV audio, and fonts.
- Deliver cold and warm macOS links and document opens through Window.ApplicationActivated.
- Skip unrelated CI builds for narrow PR changes while keeping affected checks and status names.
- Correct sibling identity documentation for mixed keyed and unkeyed children.

## 0.8.0 - 2026-10-23

- Bound text entry undo history to 1,000 groups and 64 MiB of retained text while preserving undo and redo within those limits.
- Reduce DevTools snapshot costs for large interactive trees without changing snapshot output.
- Clamp accessibility text selections to complete graphemes before editing or clipboard operations.
- Do not dispatch pointer-cancel callbacks to retired nodes.
- Attribute virtualized Cell builds and report per-pump row mount, reuse, discard and uncached shaping counts.
- Bound all font file reads to 64 MiB before allocation and skip oversized system font candidates.
- Change Motion.Tween to take milliseconds instead of seconds (breaking: multiply existing second values by 1000). The default tween stays 180 ms.
- Start Linux validation in parallel with macOS native builds without removing checks.
- Correct the plugin verifier count for a Button without explicit keyboard bindings.
- Reject UI trees deeper than 64 nodes with a clear exception before recursive processing can exhaust the stack.
- Add process-wide application activation delivery with bounded owner-thread routing.
- Add per-animation Pause, Resume, IsPaused and millisecond Seek for active tween animations.
- Add named Length.Pixels and Length.Percent factories for C#, F# and VB callers.
- Start platform consumer checks as soon as packages are ready.
- Reuse apt package archives between Linux CI jobs without changing installed dependencies.

## 0.7.54 - 2026-10-22

- Pin CI actions and verify the pinned AccessKit Rust installer download.
- Reject deeply nested SVG before building the XML tree.
- Restrict DevTools named pipes to the current user.
- Bound SVG definitions, gradient references, normalized and inherited dash arrays, and animation value materialization.
- Store and discover DevTools descriptors in a per-user directory when XDG runtime storage is unavailable.
- Remove unused path-based capture responses from the DevTools CLI.
- Restrict VS Code executable settings to machine scope and keep project paths inside the workspace.
- Prevent gslint --fix and --reduce from rewriting symlink targets discovered inside linted directories.
- Restrict starter lint and local compiler suggestions to the bundled or user-configured Goo root.
- Fix the vendored stb_image multi-frame GIF history pointer without changing shipped native binaries.
- Fix VS Code Goo launch on PowerShell by starting the CLI directly with literal terminal arguments.
- Reject clipboard text above 16 MiB of UTF-8 before managed SDL conversion and runtime paste processing.
- Skip relative gslint inputs that traverse symlinks or reparse points and print a warning.

## 0.7.53 - 2026-10-22

- Avoid boxed collection enumerators in hot grid layout, portal, scrollbar, focus and shaped-text traversals.

## 0.7.52 - 2026-10-22

- Record virtual row realization separately from input-tree updates and add a reusable headless DataGrid CPU benchmark.
- Measure wrapped line widths without allocating discarded glyph layouts, reducing wrapped thumb-scroll allocation by 60 percent.

## 0.7.51 - 2026-10-22

- Keep secondary Wayland window startup responsive while Vulkan swapchains are prepared.
- Refresh scroll rectangles set by metrics listeners before painting the current frame, so synchronized scroll viewports have no one-frame visual delay.

## 0.7.50 - 2026-10-22

- Bound text document undo history to the newest 1,000 edit groups while preserving typing groups and redo.
- Add current-display queries and display-change events, and clamp scaled window minimum sizes to the current display usable bounds.
- Reduce DevTools capture and snapshot allocations while preserving decoded capture pixels and snapshot protocol output.

0.7.49 was tagged but never published. Its change ships in 0.7.50.

## 0.7.48 - 2026-10-22

- Preserve original stack traces for exceptions rethrown from frame, embedding and virtualization handlers.

## 0.7.47 - 2026-10-22

- Add Window.UiScale for whole-window layout, device-resolution rendering and consistent input coordinates.
- Snap text run origins in device space before projection so UI-scaled text matches text rendered at the final device size.

## 0.7.46 - 2026-10-22

- Improve text crispness by aligning run origins to device pixels without rounding glyph advances.

## 0.7.45 - 2026-10-22

- Fix custom title bar dragging when a drag region sits inside a focusable ancestor.

## 0.7.44 - 2026-10-21

- Keep DevTools clients alive while a response is being written so slow readers receive complete snapshots.
- Update the goo plugin's certifi to 2026.10.19 and mcp to 1.30.0 for security fixes.
- Fix requester windows remaining dimmed after closing a foreign-parent Wayland file chooser.
- Fix lost SDL idle wakeups on Linux so Window.Post, UI continuations and timers run without waiting for the next event.
- Add Window.RequestCapture(previousCapture) to reuse the caller-owned pixel buffer for repeated captures.

## 0.7.40 - 2026-10-20

- Reuse bounded plain-text layouts and right-size retained glyph storage, defer hidden custom arrangement, and preserve target bounds through nested scroll containers.
- Include the SDL error text when the SDL Vulkan loader fails to initialize.
- Add VulkanDrivers.Direct for app-local Windows Vulkan drivers, including elevated no-GPU startup without registry changes.
- Keep the DevTools pipe host running when a client write is canceled on Windows.
- Capture DevTools diagnostic trees only while a client observes them.

## 0.7.39 - 2026-10-19

- Build Goo with G# SDK 0.5.26 and refresh generated API metadata and SDK documentation.

## 0.7.38 - 2026-10-18

- Add the DevTools Profiler tab with live timelines, memory and resource lanes, and selected-range analysis.
- Release retired swapchain generations during idle once their present fences complete.
- Release swapchain, clip atlas and renderer layer-cache resources on explicit Window.Hide, and recreate them before rendering after Show.
- Release completed cached offscreen layer targets when recreating a window swapchain.
- Add Chrome trace import and export to the DevTools Profiler tab, with lossless Goo round trips and offline inspection.
- Expose per-window live and retired Vulkan swapchain/image counts and estimated current payload bytes with GOO_VK_DIAGNOSTICS=1.
- Restore 0.7.35 style spill allocation costs with linear traversal and recognize possible receiver mutation in GL0004.

## 0.7.37 - 2026-10-17

- Add memory, resource and GPU timing records to DevTools profiler captures.
- Handle changing Vulkan enumeration counts by re-querying after VK_INCOMPLETE.
- Remove stable Context read and commit-queue allocations from queued Cell rebuilds.
- Fix zero-size scrollbar thumbs after changing a mounted scrollbar descriptor.
- Preserve new Context dependencies when a later sibling causes a transaction to fail.

## 0.7.36 - 2026-10-17

- SVG is now part of Goo, and the Goo.Svg package is discontinued. Remove its PackageReference. `import Goo.Svg` is unchanged.
- The default window clear is now white, with a black default foreground that Text inherits. Add `Window.Foreground` and atomic `Window.SetColors`.
- Add retained typed `Context` values and scopes with dependency invalidation and virtual context generations.
- Prefer hardware Vulkan devices and fall back to the next compatible device when startup fails.
- Add opt-in bounded DevTools frame and queue tracing over the existing diagnostics pipe, with `GOO_PROFILE_START=1` to record from startup.
- Fix path morph animation for runtime-loaded SVG assets.
- Fix window resize while an offscreen capture has an unreconciled clip-mask submission.
- Add shipping, platform preflight, learning-path, edit-and-inspect and documentation index guides.
- Add root code conventions for Goo contributors.
- Define subsystem ownership and permitted references for Goo contributors.
- Keep style transitions progressing when a layer repeats or overrides a declaration.
- Layout transitions respect the motion time scale and settle when motion is disabled.
- Refresh held key modifiers so key repeat uses the current shortcut without restarting its delay.
- Stop IME selection and composition follow-up when commit callbacks change focus.
- Remove fully deleted text projections when the same transaction inserts text before them.
- Resolve font families in list order across registered and system fonts.
- Move PageUp and PageDown by the mounted text editor viewport height.
- Virtual state disposal failures preserve committed replacements and do not interrupt descendant cleanup.
- Synchronize backdrop clears before overlapping image copies.
- Preserve returning quadratic excursions when flattening stroke outlines and trim geometry.
- Retain SVG strokes with zero initial width when their animation produces a visible width.
- Preserve SVG matrix coefficient order when publishing static and animated transforms.
- Resolve long SVG gradient inheritance chains without overflowing the stack.
- Enforce the SVG file size limit while reading instead of loading the entire file first.
- Reserve aggregate SVG animation keyframe and morph budgets before parsing or expanding animation values.
- Let inline SVG opacity override presentation opacity before composing ancestor opacity.
- Approximate rounded SVG rectangle corners with the same ellipse conversion and tolerance as circles.
- Preserve clipPath, group and child transforms and inherited clip rules in runtime SVG clips.
- Disconnect DevTools and dispose its pipe when the target closes the connection.
- Clear DevTools target selection and hover when the runtime reports cleared IDs.
- Show runtime RGBA capture size, format, origin and stride in DevTools.
- Remove temporary fling log writes from Gallery pointer handlers.
- Keep locally handled Gallery keys from paging the showcase.
- Reconcile mixed keyed and positional siblings while retaining keyed moves and absolute-index positional identity.
- Allow PathBuilder to publish immutable snapshots and continue building without Reset.
- Animate logical edge state changes when direction mapping stays fixed and preserve snapping when direction reverses.
- Align word navigation and deletion with word selection for underscores and combining marks.
- Keep SVG clip paths on their owning root, group or shape node instead of inheriting them into child shapes.
- Preserve fill and stroke opacity when publishing SVG color animation keyframes.
- Reject stroke cache matches when normalized dash interval counts differ.
- Keep reused dash scratch capacity out of stroke interval traversal.
- Preserve allocated layer bytes in eviction and over-budget failure diagnostics.
- Clear stale DevTools rows when a full snapshot has no root and show an empty inspector.
- Keep four inline style entries and use indexable geometric-capacity storage for larger styles.
- Sort and deduplicate logical clusters once and use binary searches for geometry endpoints.
- Use binary search for grapheme boundary membership without changing letter spacing behavior.
- Validate presentation ranges against the document tree without materializing range text.

## 0.7.35 - 2026-10-16

- Allow `FocusScope.Dispose(false)` to close a scope without restoring prior focus, including when nested scopes close later.

## 0.7.34 - 2026-10-15

- Add undo and redo for single-line `TextEntry` edits, including selection restoration, grouped typing, and controlled-value history reset.
- Focus style follows focus-visible semantics. Keyboard navigation shows focus styles. Pointer presses hide them except on text entries and editors.
- Wait for text glyph uploads before retaining the frame used by window capture, so the first capture includes every label and line.

## 0.7.33 - 2026-10-14

- Add an optional `ShaderEffect.backdropBlur` that prefilters the backdrop with a quarter-resolution separable Gaussian blur. Support backdrop-only effects and preserve the exterior of replacement effects' clips.
- Add `ShaderEffectProgram.replacesBackdrop` for transparent backdrop replacement with clip coverage preserved.
- Compile ShaderEffect shaders when the compiler optimizes out the source or backdrop resource.
- Embed the precompiled filtered backdrop shader so source builds do not require Slang.
- Include native library licenses when packaging with an external `GooNativeRuntimeRoot`.

## 0.7.32 - 2026-10-12

- Size the Vulkan clip mask atlas from its byte budget and device array-layer limit, not the eight-mask clip-chain depth. Split panes and dialog changes could exhaust the false layer limit and close the application. The byte budget is unchanged.
- Reclaim completed clip mask cache regions under pressure without waiting for the cache age limit.

## 0.7.31 - 2026-10-12

- Return native image decode memory to the system when the decode frees it on Linux with glibc. This applies to encoded bytes, source pixels and decoder buffers of 128 KiB or more. Freed blocks stayed resident in the allocator arenas of the decode threads.

## 0.7.30 - 2026-10-12

- Release the GPU texture and the renderer identity of a disposed `ImageSource` when no element draws it. The release also occurs while the window is idle.
- Add `ImageDecodeLimits`. `ImageSource.Decode`, `ImageSource.LoadThumbnail` and `ImageSourceCache` accept it. `MaxDecodedBytes` applies to the pixels that the decode keeps. A thumbnail of a large image is limited by its reduced size and by `MaxPixelsPerSide`.
- Add `ImageLimitException` with `Width` and `Height`. An image that exceeds a limit now throws it. It threw `InvalidDataException`. `ImageLimitException` does not derive from `InvalidDataException`, so code that catches `InvalidDataException` for an oversize image must change.
- Decode images with `stb_image` in the `goo-harfbuzz-gpu` native library. Encoded bytes and source pixels are native memory that the decode frees before it returns. Only the returned pixels are managed memory.
- Remove the `StbImageSharp` package dependency.
- Accept `Window.TrySetFullscreenDisplay` on Wayland when the fullscreen window is already on the requested display. The call returned `Failed`.

## 0.7.29 - 2026-10-11

- Start drag and drop when a pressed mouse or pen pointer moves 8 logical pixels on either axis. The distance was 4. A double click with a small pointer slip no longer starts a drag. Touch contacts still start at 4.
- Add `Window.DragStartDistance`. It sets the drag start distance for mouse and pen pointers.

## 0.7.28 - 2026-10-11

- Add `Style.BackdropBlur`. It applies a Gaussian blur, from 0 through 64 pixels, to the window content behind the border box of an element. `BorderRadius`, clips and `Opacity` apply to the blur.
- Keep partial redraw active under rectangular clips, clip masks, path clips, transforms, layers and effects, and for all draw kinds. A small change in such a scene no longer redraws the full window.
- Stop damage for unchanged chunks of every draw kind. Text that draws outside its box is now included in the damage area.
- Validate cached text segment content once per segment version. A frame with unchanged text no longer validates each glyph again.

## 0.7.27 - 2026-10-11

- Advance the frame deadline when a due frame draws nothing. An animation that does not change the window no longer runs the event loop without a wait.
- Complete a window capture before the next frame changes the scene. `Window.RequestCapture` and `goo capture` now finish while an animation runs.
- Return `Accepted` from `Window.RequestCapture` when the renderer is busy. The window starts the capture when the renderer is free.
- Limit image table scans to the entries in use. A drawn image no longer scans the full image table on each frame.

## 0.7.26 - 2026-10-11

- Add `ElementMetrics.Pinned`. It reports whether `PinToBottom` is set and the reader has not scrolled away from the end, for `Container` and `Virtual`. `MetricsChanged` also fires when only this value changes.
- `ElementMetrics.Deconstruct` has a sixth `out` value for `Pinned`. Code that deconstructs `ElementMetrics` must add it.

## 0.7.24 - 2026-10-11

- Present straight sRGB color multiplied by alpha in transparent windows. Partly transparent pixels no longer show a bright fringe.
- Keep the previous image on screen until a new `Image.Source` or background image source can draw.
- Redraw `Text` when its style ranges change, and `TextEntry` when `Password` or `Placeholder` changes.
- Shape a lone surrogate as U+FFFD. Text layout no longer throws on invalid UTF-16.
- Place right-to-left glyphs in visual order.
- Scroll right for a positive horizontal wheel value, and pass wheel values through as the operating system delivers them. The `Flipped` direction no longer inverts the values.
- Keep the swapchain when a resize request has the same size, such as a window move.
- Accept suboptimal presents when the surface is rotated. A rotated Android surface no longer recreates the swapchain on each frame.
- Stop the posted action drain when an action closes the window.
- Clamp the `ImageFit.Cover` source rectangle to the image. Some size pairs no longer throw.
- Skip the clip chain read in blend and effect shaders when a frame has no clip masks. Compile shader effects again to get this change.
- Keep caret affinity when the custom layout state of a node changes.
- Compile a scene with portals without managed allocation.

## 0.7.23 - 2026-10-10

- Give virtual items the list item role only while the `Virtual` element has the list role. With another role, or with `Accessibility` set to nil, items have no role and the content of each item gets `PositionInSet`.

## 0.7.22 - 2026-10-10

- Add the `Virtual` element and its policy protocol: `VirtualSource`, `VirtualState`, `VirtualViewport`, `VirtualOutput`, `VirtualItem`, and `VirtualChild`.
- Remove the `Virtual(items, ...)` and `VirtualRows` functions. Goo.Widgets now supplies them as `VirtualItems` and `VirtualRows`.
- Place virtual items in content coordinates. Padding is no longer part of the scroll range of a virtual element.

## 0.7.21 - 2026-10-10

- Remove `VirtualLog`. `VirtualRows` now applies a change that only removes rows from the start and adds rows at the end in place.
- Add `pinToBottom` to `VirtualRows`: the end stays in view until the reader scrolls away.
- Show the oldest remaining row when such a change removes the row at the top of the view.
- Wrap long lines in time proportional to their length.
- Accept the Vulkan SDK `spirv-val` binary when compiling shader effects.

## 0.7.20 - 2026-10-09

- Add `VirtualLog` for streaming rows: updates take time proportional to the rows added and dropped.
- Update the scroll range and item count when virtual rows change out of view.
- Stop rounded borders from painting their color along sides without a border.

## 0.7.19 - 2026-10-09

- Build with G# SDK 0.4.1150 and update bitwise complement and native pointer syntax.

## 0.7.18 - 2026-10-09

- Exit on unrecoverable Wayland connection loss while retaining normal close and quit vetoes.

## 0.7.17 - 2026-10-08

- Fix text and border jitter when resizing windows at fractional display scale.

## 0.7.16 - 2026-10-07

- Add a per-window Wayland blur corner radius and keep blur regions bounded during resize.
- Align text inside inline editor slots with the surrounding prose baseline.
- Preserve path coverage at contour joins so small SVG icons do not lose edge pixels.

## 0.7.15 - 2026-10-06

- Add per-window `WindowsBackdrop`, `MacOSBackdrop`, and `WaylandBackdrop`
  options with live updates for native materials, AppKit state/emphasis/alpha
  masks, and Wayland blur regions. Defaults retain the existing appearance.
- Keep desktop-wide compositor settings outside the window API. Unsupported
  hosts retain the opaque fallback and ignore other platforms' options.

## 0.7.14 - 2026-10-06

- Add `Window.Backdrop = WindowBackdrop.Blur` for native desktop blur through
  Wayland's background-effect protocol, Windows 11 Desktop Acrylic, and macOS
  behind-window materials. Compositors control the final appearance.
- Expose `BackdropAvailable` and an opaque `BackdropFallbackColor`. Unsupported
  hosts use the fallback without changing foreground content or widget shaders.
- Add the Gallery's `--native-glass` sample and native lifecycle/fallback smoke
  checks for Linux, Windows, and macOS.

## 0.7.13 - 2026-10-01

- Pin descriptor layout and output arrays across Vulkan allocation calls,
  preventing collected or moved arrays from reaching the driver at startup.
- Keep validation messenger output, buffer copy ranges, and cached text records
  stable across native calls.
- Include Vulkan result codes in failed surface format and present mode queries.

## 0.7.12 - 2026-10-01

- Stream thumbnail area filtering through exact integer coverage weights and
  bounded row buffers, preserving premultiplied alpha and fractional coverage.
- Skip unchanged premultiplication for opaque raster pixels.
- Disable SDL dynamic API dispatch in the Linux static archive while retaining
  runtime dispatch in the shared payload.

## 0.7.11 - 2026-09-30

- Measure ordinary scroll content from the padded and bordered content origin,
  removing false scroll overflow when a child fits the content area.

## 0.7.10 - 2026-09-30

- Import portal Wayland parent handles before showing a window, with optional
  compositor modal hints and clean fallback for unavailable or expired parents.
- Keep the foreign-parent bridge in both shared and static Linux SDL payloads.

## 0.7.9 - 2026-09-29

- Reclaim detached Vulkan image records when the logical source budget fills,
  allowing repeated large images and evicted sources to render again.
- Offer local files to external Wayland targets as Copy drags while preserving
  in-window Move and Copy behavior. Native file offers can be skipped when path
  limits are exceeded without canceling an in-window drag.
- Let a rejecting drop target stop fallback to its ancestors when requested.
- Preserve each pointer event's keyboard modifiers so a fast Ctrl-drop keeps
  its Copy effect when Ctrl is released in the same event batch.

## 0.7.8 - 2026-09-29

- Add optional fixed line numbers to text editors, including wrapped text and
  independent line-number color.

## 0.7.7 - 2026-09-29

- Accept embedded PNG bytes for a native window icon before the first show.

## 0.7.6 - 2026-09-29

- Load aspect-preserved local image thumbnails with bounded retained pixels
  and alpha-safe area filtering.

## 0.7.5 - 2026-09-29

- Measure the destination editor layout before clamping a far caret jump so
  Ctrl+End reveals the final line after viewport changes.
- Clear stale pointer hover when window geometry changes and refresh it when
  the pointer enters the window.

## 0.7.4 - 2026-09-29

- Size text editor scroll extents from the rendered content and caret, preventing
  false cross-axis scrollbars while retaining end-caret visibility.

## 0.7.3 - 2026-09-29

- Replace a text presentation layer's keyed style spans in one validated batch,
  preserving projections and avoiding repeated index rebuilds for syntax highlighting.
- Reuse resolved editor style spans across viewport scrolling until the layer changes.

## 0.7.2 - 2026-09-29

- Let each window disable smooth scrolling while retaining its configured wheel
  scroll scale.
- Mark composing key events and prevent consumed shortcut keys from also
  dispatching committed text input.

## 0.7.1 - 2026-09-29

- Pack pinned Linux x64 static SDL3 and HarfBuzz archives and link them directly
  into NativeAOT consumers, allowing one-executable delivery without Goo native
  shared libraries.
- Use the bundled SDL3 library for audio-only NativeAOT source consumers that
  have no static SDL3 symbols in their executable.
- Wait briefly for a Vulkan swapchain image so live windows continue repainting
  when an image is not immediately available.
- Resolve generic monospace families and select the closest requested font
  weight, including light and black faces.
- Preserve percentage maximum width and height constraints in Yoga layout.

## 0.7.0 - 2026-09-28

### Added

- Added explicit display-paced and uncapped `Window.FramePacing`, native queue
  readiness, and UI-thread `PresentationAccepted` receipts. Receipts report
  queue handoff acceptance, not display scanout.
- Added asynchronous `Window.RequestCapture` and `PollCapture` with caller-owned
  RGBA pixels and exclusive request ownership shared with DevTools capture.
- Added `SourceIndependent` shader generators that draw without capturing the
  unused source subtree. Layout, input, clipping, opacity and required blend
  isolation remain intact.
- Added `ShaderEffectData.Publish<T unmanaged>(ReadOnlySpan<T>)` for one owned
  copy of typed shader data in native memory layout.
- Added `Shape.StrokeStart` and `StrokeEnd` to trim flattened path arc length
  before dashing, with matching stroke hit geometry.
- Added `PathBuilder.Reset` to reuse builder storage while preserving immutable
  paths already returned by `Build`.
- Added `LayoutTransition.SimulationFactory` for custom position simulations
  that preserve incoming velocity when interrupted.
- Added display inventory and explicit fullscreen display selection, including
  Wayland output targeting without enabling unsupported windowed movement.
- Added `Window.TrySetTopmost` with explicit operation results.

### Fixed

- Suppressed owner invalidation for unchanged running animation samples while
  preserving completion and reduced-motion behavior.
- Coalesced shader-data publication from layout metrics callbacks into the
  current paint instead of scheduling another paint.
- Reused flattened stroke contours across dash-phase and trim changes. CPU
  dashing and outline construction still run when their inputs change.
- Removed the intermediate list allocation from immutable `DashPattern` values.
- Kept unsupported topmost preferences from aborting window creation on Wayland.

## 0.6.7 - 2026-09-28

- Added `Anim<T>.Completed` with distinct natural, reduced-motion, and disabled-motion
  reasons. Completion runs after motion registry updates so libraries can safely
  chain animations without retaining a separate Window dispatcher.
- Cancelled stale completion when an animation is replaced, snapped, or disposed.
- Added `Anim<T>.IsDisposed` for library lifecycle checks and stopped frame work
  when a completion callback closes its owning window.
- Wheel input over a disabled child now reaches enabled scroll ancestors without
  invoking disabled handlers or crossing modal scope boundaries.
- Recorded production desktop and mobile extension priorities, ownership, and
  acceptance checks in [production readiness](https://github.com/obselate/goo/blob/v0.6.7/docs/production-readiness.md).

## 0.6.6 - 2026-09-27

### Added

- Added cancellable UI-thread callbacks through `Window.SetTimeout` and
  `Window.SetInterval`.
- Added reusable `Command` actions for buttons, key bindings, and menus, with
  availability checked on each execution.
- Added bounded synchronous `ImageSource.Decode` overloads for encoded memory
  and streams, with optional cancellation.
- Added window show, hide, initial visibility, topmost, focusability,
  capability, visibility event, and presentation preference APIs.
- Added virtual-collection accessibility metadata and visual text geometry.
- Added language-aware text shaping, package-level `Percent`, configurable
  wheel scaling, and platform key-release injection.

### Changed

- `ElementHandle.ScrollTo` and ordinary overflow scrolling now animate toward
  their targets. `JumpTo` remains immediate, and reduced-motion preferences
  disable scroll animation.
- `Padding`, `Margin`, `BorderWidth`, and `BorderColor` now use CSS-style
  `Edges` values. Uniform values remain supported.
- Window activation now returns the shared `WindowOperationResult` used by
  `Show`, `Hide`, and `RequestActivation`.
- Wheel scrolling now preserves fractional platform-scaled deltas, chains
  unused movement to eligible ancestors, and supports bounded touch momentum.
- Embedded runtime shaders ship only in `Goo.dll`. Release bundles retain
  runtime payloads and required licenses while omitting loose shaders,
  authoring tools, symbols, and native provenance.
- Vulkan diagnostics can record startup stages and live memory snapshots.
  Owned pipeline-cache files older than 30 days are removed when a cache is
  saved.
- Unchanged shader-tool and XML-merge builds are skipped unless an input or
  required output changes.

### Fixed

- Kept Vulkan present semaphore and fence pointers valid across garbage
  collection.
- Preserved input arrival order, cancellation, and callback settlement across
  queued keyboard, pointer, text, drag, and scrolling dispatch.
- Preserved a modal button press when its tree updates before release.
- Ignored inconsistent SDL resize metrics while a window is being maximized.
- Published asynchronous image replacements through the owning window and
  prevented retained tree, cell, scrollbar, and frame work from outliving its
  owner.

### Removed

- Removed `Length.Percent`, `WindowActivationResult`, and the individual
  padding, margin, border-width, and border-color side properties in favor of
  `Percent`, `WindowOperationResult`, and `Edges`.
- Moved Gituit to its own repository and removed the temporary bundled
  `apps/Goo.GitWorkbench` application.

## 0.6.5 - 2026-09-22

### Added

- Added native Codex marketplace installation and portable OMP support for the
  Goo agent plugin. `uv` manages its locked Python runtime, so installation no
  longer requires manual Python or MCP configuration, a working-directory
  change, or absolute paths.
- Added an internal package-consumer benchmark with isolated package inputs,
  provenance, separate runtime and symbol staging, and advisory size, startup,
  idle, and memory reports. CI reports measurements without numeric performance
  thresholds and uploads symbols separately.

### Changed

- Pinned source and CI builds to .NET SDK 10.0.401.
- Goo agent preflight now gives the published `Goo.DevTools` global update
  command as the normal CLI recovery path and reserves `GOO_CLI` for compatible
  source-build testing.

### Fixed

- Corrected the package-consumer benchmark to use the canonical
  `GooReleaseVersion` property.


## 0.6.4 - 2026-09-21

### Added

- Added configurable per-axis `Scrollbar` descriptors with optional ordinary
  `Track` and `Thumb` parts, `Auto`/`Always`/`Hidden` visibility, immediate
  dragging, one-viewport paging, and overlay or `ReserveSpace` gutters.
- Added explicit `KeyBinding` callbacks, primitive activation and press actions,
  focused text commands, and keyboard-operated drag-and-drop actions.
- Added configurable text-editor tab width, indentation width, tabs-or-spaces
  policy, and semantic word and line selection commands.

### Changed

- Primitives no longer install automatic editing, submit, button activation, or
  focus traversal key bindings. Applications must assign the desired bindings.
- Moved scrollbar visibility to ordered `Style` axis and shorthand entries.
  Removed the pre-1.0 `Blob.ScrollbarVisibility` authored-value getter.
  Applications that relied on the legacy built-in thumb appearance must author
  `Track` and `Thumb`.
- Double- and triple-click text selection now extends by whole words and logical
  lines while preserving grapheme clusters and the original selected unit.

### Fixed

- Preserved sharp text and offscreen layer placement at fractional display
  scales, and preserved premultiplied color when compositing offscreen layers.
- Fixed text-editor mouse selection, selection dragging, and explicit Tab and
  Shift+Tab indentation behavior.
- Preserved mouse-button release events during captured native window drags.


## 0.6.3 - 2026-09-19

### Added

- Added `Portal` overlays for popups, menus, tooltips, and other content that must render and receive input above the normal tree while preserving logical ownership, focus, accessibility, and lifecycle.
- Added optional `Portal.Anchor` and `Portal.Placement` APIs with automatic alignment, opposite-side flipping, viewport containment, and live geometry updates.

### Changed

- Container borders now render before descendants so child content can paint above them while retaining normal clipping behavior.
- Goo authoring tools now report source provenance and hashes, use focused coverage-aware API search, and return exact starter SDK, package, compiler, lint, and build metadata.

## 0.6.2 - 2026-09-18

### Fixed

- Padded multiline text editors now include content overflow in their scroll extent, keeping the caret fully visible at the first and last lines.

## 0.6.1 - 2026-09-18

### Fixed

- Multiline text editors now measure content before applying maximum height, so short prompts remain compact and grow as text is added. Explicit fixed heights remain unchanged.

## 0.6.0 - 2026-09-18

### Added

- Added stable DevTools target discovery, bounded snapshots and waits, opt-in input and gesture dispatch, runtime style inspection, and structured agent preflight diagnostics.
- Added parameterless `Cell.Mount[TCell]()` for unkeyed mounting of cells with parameterless constructors.
- Added cross-platform source bootstrap scripts for the pinned G# toolchain and released native runtime assets.

### Changed

- Removed the GCV1 binary vector format and the Goo.SvgCompiler tool. Goo.Svg now builds vector assets directly at runtime. Existing binary assets require migration to SVG sources. See the [GCV1 migration guide](docs/migrations/gcv1.md).
- Consolidated Vulkan shader, readback, frame, motion, and diagnostic ownership while pruning disconnected generators, proof paths, harnesses, and duplicated test plumbing.
- Stored generated Unicode data as binary resources and reorganized text layout, Vulkan scene compilation, and SVG parsing by responsibility.

### Fixed

- Preserved diagnostic client isolation, complete snapshots, gesture ownership, plugin configuration, and safe agent launcher behavior.
- Preserved constructor resets in Gslint reductions, handled named-pipe connection resets in capture timeouts, and retried transient macOS artifact-download failures.

## 0.5.4 - 2026-09-15

- Added native G# mixed initializers: `Container` and `Button` accept direct children and ordered spreads through `Add`. Examples use dot-free, member-first syntax. The package automatically supplies the upstream compiler/formatter containing G# #3785 while the tagged SDK catches up.
- Preserved measured virtual-row heights while replacement content is remeasured, fixing scroll jumps when DataGrid selection rebuilds rows near the bottom.
- Added `EmbeddedWindowHost`, host-owned `PlatformInput`, and the `Goo.Android` adapter for shared retained applications.
- Added bounded local PNG loading and `ImageSourceCache`, plus shared desktop UI audio through `SoundSource` and `SoundPlayer`.
- Added `Window.RequestActivation` with platform-managed foreground activation.
- Consolidated focus, scroll, input metadata, text-editor binding, and Cell ownership under explicit core boundaries.
- Removed the internal Lava surface/shader and obsolete Workbench and WindowsDemo applications. Custom shader effects remain supported.
- Fixed native and in-window drag queries reaching targets outside modal focus scopes.
- Restored reproducible API guides and centralized native file-path validation across clipboard, choosers, and drops.
- Container and Button copy read-only child lists so factory output retains the documented mutable child collection.
- Added native titlebar double-click interception for custom chrome, with platform defaults preserved unless handled.
- Fixed inline slot positions after styled text changes its measured advance.
- Added custom layout algorithms, measured virtual rows and stable-key scrolling.
- Added native accessibility adapters, native file-drop ingress, file/image clipboard reads, and asynchronous native file dialogs.
- Added native window size constraints, window ownership/modal lifecycle, pointer click counts, and composite-widget Tab stops.
- Added mounted focus scopes with modal input/accessibility isolation, nested activation, and focus restoration. Interactive primitives now honor explicit `Focusable: false`.
- Added opt-in controlled TextEntry values with focused replacement, grapheme-safe selection, and IME cancellation.
- Included tall inline editor projections in line height and intrinsic measurement; slot-child size changes now invalidate cached paragraph geometry.
- Added bounded JPEG/static GIF decoding and opted-in DevTools input dispatch and inspection improvements.

## 0.5.3 - 2026-09-09

### Added

- Added a Cell factory overload for constructor dependencies and F# object expressions, with stable mounted identity and Goo-owned disposal.

### Fixed

- Recovered shared Vulkan device loss before resizing and stopped frame processing when recovery closes the window.
- Preserved accepted close requests during GPU teardown so `OnClosing` runs once while vetoed requests can still be retried.

## 0.5.2 - 2026-09-09

### Fixed

- Preserved rounded primitive edge coverage at fractional pixel positions.
- Removed bright fringes from opaque rounded fills beneath uniform opaque borders.

## 0.5.1 - 2026-09-09

### Changed

- Removed the four-stop limit for linear and radial gradients, preserving alpha, opacity, and hard color edges.
- Included the Goo authoring plugin with API lookup, runtime inspection, capture, and starter tools.
- Simplified the DevTools inspector and refreshed mounted cells after supported hot reload updates.
- Reused resident path identities across garbage collection and equivalent default button styles.
- Grew image staging buffers and clip atlas layers on demand, skipped empty image bookkeeping, and avoided unnecessary text layout scans for paint padding.
- Updated Gallery shader parameters without rebuilding the Gallery cell.

### Fixed

- Fixed custom titlebar double-click maximize/restore and live resizing of idle windows on Wayland in Goo's bundled SDL runtime.
- Fixed black resize frames by keeping submitted path uploads renderable and deferring frames whose path resources are incomplete.
- Fixed retained text record copy bounds, border clipping, and corner coverage.
- Fixed Gallery direction glyphs and removed redundant impulse scaling.

### Verification

- Replaced duplicated Vulkan proof implementations with checks against the production renderer.
- Added regression coverage for rounded content in the first resize frame and pending path upload visibility.
- Passed 325 core behavior tests, 12 API and documentation tests, 10 SVG tests, 9 CLI tests, strict source lint, Release builds, and local Vulkan regression checks. Rounded resize and image staging checks passed on NVIDIA and software Vulkan.

## 0.5.0 - 2026-09-05

### Added

- Added sparse in-app drag and drop through `Blob.DragSource` and `Blob.DropTarget`, with Copy/Move negotiation, transformed and clipped target discovery, cancellation, and deterministic payload cleanup.
- Added immutable `VectorAsset`, `VectorNode`, `VectorPaint`, and `VectorStroke` APIs shared by authored, runtime SVG, and compiled vector content.
- Added backend-neutral `ShaderEffectProgram` containers and `.goo-effect` build artifacts.
- Added generic `Cell.Animate` overloads and `Motion.Tween`.

### Changed

- Changed `ShaderEffect` construction from raw fragment SPIR-V bytes to a validated `ShaderEffectProgram`. Load build output with `ShaderEffectProgram.Load` and pass the program to `ShaderEffect`.
- Changed `TextEditor` construction to take only its `TextEditorController`; the controller now supplies the document. Consolidated editor operations under `TextEditorController.Execute(TextCommand)` and moved presentation-layer record types behind keyed layer methods.
- Sealed `Anim<T>` and reorganized platform hosting behind internal per-platform services without adding a public backend selector.
- Unified vector rendering around immutable document nodes while retaining `VectorPath` for individual paths.

### Fixed

- Fixed sampled-image premultiplied alpha, liquid-glass dispersed coverage, transformed and clipped input routing, queue wake and isolation, effect-only replacement, pending-readback close, and failure cleanup.
- Fixed clipped Lava blending, CRT coverage at transparent edges, undefined Gallery falloff math, and volumetric premultiplied output. Shader playback rejects values that overflow GPU time, and reentrant drag failures preserve the original callback stack.
- Fixed repeated shared-path identity lookup so the measured 1,000-Shape workload allocates 2,032 B/frame instead of 1,282,032 B/frame.
- Fixed deferred graphics submission so acquired frames retain their recorded work, and exceptional frame abandonment now consumes the acquire semaphore before reuse.

### Performance

- Shared identical shader programs by byte identity, centralized GPU timeline completion, and reused eligible offscreen layer targets. These changes reduce native-object pressure and preserve resource lifetime without a broad frame-time claim.
- Reduced the measured EvenOdd overflow fallback by 34.96% at 33 contours and 35.64% at 65 contours on the qualified RTX 3080 workload. The 65-contour case remains above a 16.67 ms frame budget.
- Reduced the measured 1,000-Container full-update host-frame P50 from 3.012 to 2.694 ms through retained style payload identity checks, with allocation unchanged.

### Verification

- Passed 317 core behavior tests, 12 public API and documentation tests, strict repository lint, generated shader consistency, Release builds, and focused native Vulkan lifecycle, input, image, vector, clip, effect, queue, and readback gates.
- Current evidence and hardware limits are recorded in [historical Linux qualification](https://github.com/obselate/goo/blob/1003f46a94a9087b289326c52c7a6ee600766b7a/docs/perf/linux-release-qualification.md).

## 0.4.2 - 2026-09-02

### Added

- Added an Apple Silicon Goo Gallery app bundle for macOS 15 or newer.
- Added a checksum-verified unsigned installer that installs Goo Gallery under the current user account, removes quarantine only from the installed app, and launches it.
- Added pinned macOS arm64 SDL, MoltenVK, and HarfBuzz native payload builds with NativeAOT runtime verification.

## 0.4.1 - 2026-09-01

### Added

- Added ordered reusable style composition through `Style.BasedOn`.
- Added multi-listener window state, focus, and key notification events.
- Added a repo-local strict G# linter and enforced it in CI.
- Added persistent Vulkan pipeline caching and compatible primitive draw batching.

### Changed

- Made typed cells build from their immutable input snapshot and exposed that snapshot to derived cells.
- Made virtualized collections use explicit fixed item extents for deterministic placement and scroll range.
- Centralized style field behavior and defaults in generated metadata.
- Reduced dirty-cell queue work, retained-scene allocations, Vulkan command recording, and primitive staging overhead.

### Fixed

- Fixed best-effort cleanup ownership across reconciliation and the complete window close sequence.
- Fixed routed keyboard and focus callback semantics and default-action cancellation.
- Fixed Vulkan pipeline cache validation and retirement behavior.
- Embedded Goo debug symbols in the assembly so NuGet no longer rejects the G# portable PDB checksum.

### Performance

- Reduced scheduling for 1,000 dirty sibling cells from 1,088.133 to 341.695 microseconds, a 68.6% reduction, with unchanged managed allocation and without the rejected HashSet candidate's approximately 22.2 KiB retained capacity.
- Reduced stable primitive scene compilation by approximately 20% while keeping the compiler at 0 B/op before and after.
- Reduced compatible analytic draw calls by 92.8% to 99.0% across the sparse-box, topology, and small-animation workloads. Main-pass GPU P50 improved by 25.0%, 6.5%, and 16.7% respectively. No stable allocation improvement was measured.
- Reduced 13-pipeline creation from 2.824 seconds uncached to 5.235 milliseconds warm with the NVIDIA implicit disk cache disabled, a 99.8% reduction and 539x speedup. The explicit cache used approximately 1.13 MiB.

## 0.4.0 - 2026-08-31

### Added

- Added Windows x64 package support, tested on Windows 11, with the pinned SDL 3
  runtime, shared Vulkan host, software-Vulkan regression coverage, and
  NativeAOT qualification tooling.
- Added the `Goo.Templates` application template, the `Goo.DevTools` CLI, the
  `Goo.DevTools.App` inspector, and VS Code and Rider integrations.
- Added renderer-driven ShaderEffect playback, computed layout transitions,
  non-throwing window dispatch, and window diagnostics.
- Added four bounded, retained `ShaderEffectData` inputs with copy or ownership-transfer publication and shader authoring helpers.
- Added ownership-transfer construction for immutable `ImageSource` pixels with final-retirement callbacks.

### Changed

- Migrated Goo-owned Vulkan shaders to the pinned Slang 2026.16 toolchain.
- Replaced the Showcase application with Goo Gallery.
- Added complete clean-machine setup, conditional tool, DevTools, publishing,
  NativeAOT, troubleshooting, contributor, and release documentation.

### Fixed

- Fixed transparent Vulkan swapchains, ShaderEffect playback demand,
  clip-mask atlas pressure, and Windows software-Vulkan presentation.

## 0.3.0 - 2026-08-28

Goo 0.3.0 moves production rendering to Vulkan, broadens the Linux native ABI
to glibc 2.27, and qualifies Linux 6.6 or newer.

### Changed

- Replaced the Skia renderer with a direct Vulkan 1.3 renderer for Linux Wayland.
- Moved production hosting, text, images, paths, effects, windowing, diagnostics, and recovery into Goo-owned G# code.
- Added retained scene compilation, bounded GPU resource caches, damage tracking, asynchronous readback, and multi-window scheduling.
- Added native HarfBuzz shaping and GPU text paint with registered fonts, fallback, color glyphs, text editing, and IME geometry.
- Added retained images, vector paths, rounded clipping, borders, gradients, shadows, blend modes, scrolling, and draggable scrollbars.
- Lowered the Linux native ABI floor to glibc 2.27 and qualified Linux 6.6 or newer.
- Made Vulkan surface and swapchain maintenance extensions optional with an idle-safe compatibility path.

### Added

- Build-time SVG compilation into retained GCV1 vector assets.
- Build-time Slang and GLSL ShaderEffect compilation with deterministic SPIR-V validation.
- Package and NativeAOT verification for the public API, native libraries, shaders, and clean consumers.

### Verification

- Linux x64 passes public API, framework behavior, package, Vulkan validation, lifecycle, and performance checks.
- Accepted Linux evidence is summarized in [historical Linux qualification](https://github.com/obselate/goo/blob/1003f46a94a9087b289326c52c7a6ee600766b7a/docs/perf/linux-release-qualification.md).

### Pending

- Windows x64 runtime qualification.
- Linux integrated-GPU qualification.
- A second real display-scale qualification.

## 0.2.0 - 2026-08-07

### Changed

- SkiaSharp and SkiaSharp.HarfBuzz upgraded from 3.116.0 to 4.151.1, moving
  Skia from m116 to m151.
- HarfBuzzSharp and HarfBuzzSharp.NativeAssets.Linux upgraded from 8.3.1.1 to
  14.2.1.2, moving HarfBuzz from 8.3.1 to 14.2.1.
- Removed the SkiaSharp 3.x duplicate Linux native alias cleanup from
  `Goo.targets`; SkiaSharp 4.x ships a single canonical `libSkiaSharp.so`.
- Internal path construction migrated from the deprecated mutable `SKPath`
  API to `SKPathBuilder`, ahead of SkiaSharp removing its compatibility
  shim. Uniform solid borders and inset box shadows now paint through
  `SKCanvas.DrawRoundRectDifference`, making rounded solid borders about
  3x faster and removing the shim's per-paint allocation overhead. Public
  API is unchanged.

## 0.1.0 - 2026-08-07

Goo 0.1.0 is the first public release of the retained, declarative UI framework
for G# and .NET 10.

### Included

- Declarative Blob trees with keyed Cell invalidation and retained reconciliation.
- Yoga layout, Skia rendering, shapes, images, text, and style transitions.
- Keyboard, pointer, focus, scroll, clipboard, and generic text or IME input.
- Stable element handles, accessibility semantics, and a UI-thread dispatcher.
- Passive styled text and a retained multiline text editor.
- XML documentation and generated per-area API reference pages.

### Release constraints

- The supported platform is `linux-x64` with glibc 2.35 or newer on a native
  Wayland session. X11 and XWayland are not supported.
- Windows, macOS, and Linux ARM64 are not supported by 0.1.0.
- Custom IME candidate presentation is application-owned in 0.1.0.

### Compatibility

- Target framework: .NET 10.
- G# SDK: 0.3.633.
- Package version: 0.1.0.
- License: MIT.
