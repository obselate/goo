# Production desktop and mobile readiness

This assessment uses the Goo 0.6.6 source and published platform contracts.
It identifies work required for broader production use. It is not a claim that
the proposed capabilities are implemented or qualified on devices.

Goo core owns rendering, input, retained state, lifecycle, platform contracts,
and extension points. Widgets, animation composition, themes, forms, resource
catalogs, and application workflows belong in optional or community packages.
Add a core capability when a library cannot implement it correctly through the
public API. Keep one owner for scheduling, focus, editing, and accessibility.

## Existing foundation

Goo already supplies IME composition, semantic editing, bidirectional text,
virtualization, native desktop accessibility, desktop file dialogs and clipboard
data, NativeAOT packaging, diagnostics, device recovery, and Android surface and
pause/resume lifecycle handling. Those areas need platform qualification, not
replacement implementations. See the [API index](api/README.md),
[Android integration](android.md), and [supported platforms](../README.md#platforms).

## Core priorities

Priority 0 blocks a common supported-platform workflow or access requirement.
Priority 1 closes a host contract or verification gap. Priority 2 improves the
evidence available to adopters. Platform expansion needs separate qualification.

| Priority | Verified gap and current owner | Required contract and acceptance |
| --- | --- | --- |
| 0 | **Android accessibility.** The neutral [accessibility tree and actions](api/accessibility.md) exist. Embedded hosts supply their own adapter, but [GooView](../Goo.Android/GooView.cs) has no Android accessibility node provider. | Goo.Android maps retained semantic nodes, bounds, text, focus, and actions to Android. Route actions through `Window.PerformAccessibilityAction`. Verify navigation, editing, activation, disabled controls, and removal with TalkBack on a device. |
| 0 | **Mobile text input intent.** [FocusedEditorSnapshot](../Goo/Input/PlatformInput.gs) carries password, multiline, and read-only state. [GooView](../Goo.Android/GooView.cs) selects a text keyboard and Done/None action. | Add neutral input purpose, enter action, autofill, and privacy hints to the edit primitive and host snapshot. Map email, URL, number, phone, search, next, and done in Android. Verify actual keyboard behavior, composition, focus transfer, and password privacy on a device. |
| 0 | **Platform coverage.** [Supported platforms](../README.md#platforms) require modern Vulkan devices. Linux is native Wayland only, enforced by [SdlRuntime](../Goo/Platform/Sdl/SdlRuntime.gs). iOS is not supported. | Qualify Linux X11 as a separate target before advertising it. Verify native payloads, Vulkan presentation, IME, clipboard, dialogs, accessibility, and package consumers. Add other RIDs and iOS only with a supported host/rendering route and device qualification. Publish clear preflight failures for unsupported graphics capabilities. |
| 1 | **Embedded data services.** [EmbeddedWindowBridge](../Goo/Platform/EmbeddedWindowBridge.gs) forwards text clipboard operations. [Clipboard](../Goo/Window/Clipboard.gs) data and [file dialogs](../Goo/Window/FileDialog.gs) return Unsupported for embedded hosts. | Define optional host capabilities for system document selection and MIME data transfer. Specify cancellation and URI/stream lifetime without assuming a desktop path. Implement Android system pickers and clipboard adapters. Applications retain ownership of import/export behavior. |
| 1 | **Locale observation.** [PlatformPreferences](../Goo/Platform/PlatformPreferences.gs) reports theme, motion, contrast, and text scale. Locale is absent even though styles support direction and BCP47 language. | Provide a preferred-locale snapshot and change notification from the host. Define how an application applies language/direction without overriding explicit styles. Verify configuration changes and shaping. Keep translation catalogs and formatting policy outside core. |
| 1 | **Activity state handoff.** [GooActivity](../Goo.Android/GooActivity.cs) recreates the Window without passing saved state to its factory. [The lifecycle contract](android.md) correctly leaves persistence with the application. | Expose an optional save/restore handoff around Window creation and activity recreation. The app supplies serialization and storage. Separately verify Surface recreation, activity recreation, and process recreation. Preserve the current retained Surface lifecycle. |
| 1 | **Native qualification.** [CI](../.github/workflows/ci.yml) validates Android package/ABI contents and desktop accessibility packages. Package validation does not prove device rendering, input, or assistive technology behavior. | Add a repeatable device/OS test lane for Android presentation, IME, TalkBack, and lifecycle, plus desktop screen readers and complex IME. Record OS, device, driver, package version, actions, and results. Report untested combinations explicitly. |
| 2 | **Performance evidence.** Profiling and [fixed workloads](perf/performance-workloads.json) exist. [Consumer measurements](../CONTRIBUTING.md) remain advisory, and CI collects publish artifacts. | Publish repeatable supported-device baselines for startup, idle, scrolling, editing, multiple windows, memory, and frame distributions. Gate deterministic behavioral/resource regressions. Keep timing and memory measurements advisory unless a separate calibrated policy is adopted. |

## Library extension priorities

The first implementation batch is Goo 0.6.7 motion completion, Goo.Animations
0.2.3 Timeline lifecycle handling, and Goo.Widgets 0.2.7 style hooks. The other
items below remain follow-up work. Release notes in each package identify the
shipped changes.

| Owner | Gap | Acceptance |
| --- | --- | --- |
| Goo motion core | Per-tick value callbacks cannot safely chain another mutation on the same animation. Timeline must currently post through a caller-supplied Window. | Deliver completion once after motion registry compaction. Distinguish natural completion, reduced motion, and disabled motion. Retarget, Set, Snap, and disposal cancel stale completion. A completion may start the next animation for the next pump. |
| Goo.Animations | Timeline owns sequence policy but depends on Window dispatch. Reduced motion can leave looping timelines generating work indefinitely. | Use core completion for window-independent playback. Retain the old entry point for compatibility. Define finite and looping reduced-motion behavior and verify no perpetual frame demand after settlement or stop. |
| Goo.Widgets | Calendar labels, submenu arrows, and TreeView scrollbars have no direct style hooks. Some content factories are followed by child replacement. | Add missing style inputs while preserving defaults and behavior. In a later batch, define content slots that preserve custom children, identity, events, and accessibility. Verify both virtual and regular tree paths. |
| Goo.Widgets | SearchList has no unified filtered-result keyboard navigation. Theme presets cover only part of the controls. | Add enabled-result navigation, activation, scroll visibility, and semantic active selection. Extend reusable theme inputs across primary controls and states. |
| Optional libraries | DataGrid has display/custom-cell support but no standard controlled edit lifecycle. Fields expose validation messages but no shared form lifecycle. | Build optional edit/commit/cancel and validation contracts on existing focus, input, and virtualization. Keep data storage, business rules, and submission policy with applications. |

## Comparison basis

Large frameworks make these contracts available without requiring each app to
rebuild the platform layer. Flutter exposes [text input configuration](https://api.flutter.dev/flutter/services/TextInputConfiguration-class.html)
and [platform plugin integration](https://docs.flutter.dev/platform-integration/platform-channels).
Qt exposes [animation lifecycle signals](https://doc.qt.io/qt-6/qml-qtquick-animation.html)
and [native accessibility integration](https://doc.qt.io/qt-6/accessible.html).
Avalonia documents [platform coverage](https://docs.avaloniaui.net/docs/supported-platforms)
and [native Windows integration](https://docs.avaloniaui.net/docs/platform-specific-guides/windows).

The comparison sets workflow and extension expectations. It does not require Goo
to copy their architecture or put their full control catalogs in core. Signed
installers, native menus, tray icons, notifications, and embedded native controls
need separate demand and ownership assessment before being called core blockers.
