# Production desktop and mobile readiness

Historical assessment for Goo 0.6.6, with Goo 0.7.0 follow-up.
This is not a current release qualification report.

Core owns rendering, input, retained state, lifecycle, platform contracts and
extension points. Optional libraries own widgets, animation composition, themes,
forms and resource catalogs. Apps own workflows, scene clocks, video encoding,
design-resolution scaling and domain-specific shader fields.
Add a core capability only when a library cannot implement it through public APIs.
Keep one owner for scheduling, focus, editing and accessibility.

## Existing foundation

Goo supplies IME composition, semantic editing, bidirectional text, virtualization,
native desktop accessibility, dialogs, clipboard, NativeAOT, diagnostics, device
recovery, and Android Surface and pause/resume handling. Qualify these implementations
rather than replace them. See [API](api/README.md), [Android](https://github.com/obselate/goo/blob/9013558620036b7d3f08f369536b9d487325b9fb/docs/android.md), and
[supported platforms](../README.md#platforms).

## Core priorities

Priority 0 blocks a common supported-platform workflow or access requirement.
Priority 1 closes a host contract or verification gap. Priority 2 improves adopter
evidence. Qualify platform expansion separately.

| Priority | Verified gap and current owner | Required contract and acceptance |
| --- | --- | --- |
| 0 | **Android accessibility qualification.** [GooView](https://github.com/obselate/goo/blob/9013558620036b7d3f08f369536b9d487325b9fb/Goo.Android/GooView.gs) maps retained semantics and actions to Android virtual nodes. | Run the [TalkBack qualification checklist](https://github.com/obselate/goo/blob/9013558620036b7d3f08f369536b9d487325b9fb/docs/android.md#accessibility-checks). |
| 0 | **Mobile text input intent.** [FocusedEditorSnapshot](https://github.com/obselate/goo/blob/9013558620036b7d3f08f369536b9d487325b9fb/Goo/Input/PlatformInput.gs) carries password, multiline, and read-only state. [GooView](https://github.com/obselate/goo/blob/9013558620036b7d3f08f369536b9d487325b9fb/Goo.Android/GooView.gs) selects a text keyboard and Done/None action. | Add neutral input purpose, enter action, autofill, and privacy hints to the edit primitive and host snapshot. Map email, URL, number, phone, search, next, and done in Android. Verify actual keyboard behavior, composition, focus transfer, and password privacy on a device. |
| 0 | **Platform coverage.** [Supported platforms](../README.md#platforms) require modern Vulkan devices. Linux is native Wayland only, enforced by [SdlRuntime](https://github.com/obselate/goo/blob/9013558620036b7d3f08f369536b9d487325b9fb/Goo/Platform/Sdl/SdlRuntime.gs). iOS is not supported. | Qualify Linux X11 as a separate target before advertising it. Verify native payloads, Vulkan presentation, IME, clipboard, dialogs, accessibility, and package consumers. Add other RIDs and iOS only with a supported host/rendering route and device qualification. Publish clear preflight failures for unsupported graphics capabilities. |
| 1 | **Embedded data services.** [EmbeddedWindowBridge](https://github.com/obselate/goo/blob/9013558620036b7d3f08f369536b9d487325b9fb/Goo/Platform/EmbeddedWindowBridge.gs) forwards text clipboard operations. [Clipboard](https://github.com/obselate/goo/blob/9013558620036b7d3f08f369536b9d487325b9fb/Goo/Window/Clipboard.gs) data and [file dialogs](https://github.com/obselate/goo/blob/9013558620036b7d3f08f369536b9d487325b9fb/Goo/Window/FileDialog.gs) return Unsupported for embedded hosts. | Define optional host capabilities for system document selection and MIME data transfer. Specify cancellation and URI/stream lifetime without assuming a desktop path. Implement Android system pickers and clipboard adapters. Applications retain ownership of import/export behavior. |
| 1 | **Activity state handoff.** [GooActivity](https://github.com/obselate/goo/blob/9013558620036b7d3f08f369536b9d487325b9fb/Goo.Android/GooActivity.gs) recreates the Window without passing saved state to its factory. [The lifecycle contract](https://github.com/obselate/goo/blob/9013558620036b7d3f08f369536b9d487325b9fb/docs/android.md) correctly leaves persistence with the application. | Expose an optional save/restore handoff around Window creation and activity recreation. The app supplies serialization and storage. Separately verify Surface recreation, activity recreation, and process recreation. Preserve the current retained Surface lifecycle. |
| 1 | **Native qualification.** [CI](https://github.com/obselate/goo/blob/9013558620036b7d3f08f369536b9d487325b9fb/.github/workflows/ci.yml) checks Android package/ABI contents and desktop accessibility packages, not device behavior. | Add repeatable lanes for [Android device checks](https://github.com/obselate/goo/blob/9013558620036b7d3f08f369536b9d487325b9fb/docs/android.md#device-checks), [TalkBack](https://github.com/obselate/goo/blob/9013558620036b7d3f08f369536b9d487325b9fb/docs/android.md#accessibility-checks), desktop screen readers and complex IME. Use the device checklist's evidence fields and reporting rules for each lane. |
| 2 | **Performance evidence.** Profiling and [fixed workloads](https://github.com/obselate/goo/blob/9013558620036b7d3f08f369536b9d487325b9fb/docs/perf/performance-workloads.json) exist. [Consumer measurements](../CONTRIBUTING.md) remain advisory, and CI collects publish artifacts. | Publish repeatable supported-device baselines for startup, idle, scrolling, editing, multiple windows, memory, and frame distributions. Gate deterministic behavioral/resource regressions. Keep timing and memory measurements advisory unless a separate calibrated policy is adopted. |

## Library extension priorities

The first implementation batch targets Goo 0.6.7, Goo.Animations 0.2.3 and
Goo.Widgets 0.2.7. Check each package's release notes for shipped changes.
Other entries below describe follow-up work.

| Owner | Gap | Acceptance |
| --- | --- | --- |
| Goo motion core | Per-tick value callbacks cannot safely chain another mutation on the same animation. Timeline must currently post through a caller-supplied Window. | Deliver completion once after motion registry compaction. Distinguish natural completion, reduced motion, and disabled motion. Retarget, Set, Snap, and disposal cancel stale completion. A completion may start the next animation for the next pump. |
| Goo.Animations | Timeline owns sequence policy but depends on Window dispatch. Reduced motion can leave looping timelines generating work indefinitely. | Use core completion for window-independent playback. Retain the old entry point for compatibility. Define finite and looping reduced-motion behavior and verify no perpetual frame demand after settlement or stop. |
| Goo motion core, next | Per-animation pause and resume are absent. Global `Motion.TimeScale <= 0` settles all running animations rather than pausing them. | Core owns elapsed time and pump registration. Pause must preserve sampled value, velocity, and elapsed state while other animations continue. Resume must remain continuous. Verify two independent animations through the real host loop. Cancel-at-current already composes as `anim.Set(anim.Value)`, which also clears pending completion. |
| Goo motion core, deferred | Seeking by elapsed simulation time has no public Anim contract. | Add only for a confirmed scrubbing use case. Define forward/backward seek, value/velocity, completion, and reduced-motion behavior with tween and spring checks. Keep imperative `Timeline.Run(Action)` sequences unseekable because actions can have external effects. |
| Goo.Widgets | Calendar labels, submenu arrows, and TreeView scrollbars have no direct style hooks. Some content factories are followed by child replacement. | Add missing style inputs while preserving defaults and behavior. In a later batch, define content slots that preserve custom children, identity, events, and accessibility. Verify both virtual and regular tree paths. |
| Goo.Widgets | SearchList has no unified filtered-result keyboard navigation. Theme presets cover only part of the controls. | Add enabled-result navigation, activation, scroll visibility, and semantic active selection. Extend reusable theme inputs across primary controls and states. |
| Optional libraries | DataGrid has display/custom-cell support but no standard controlled edit lifecycle. Fields expose validation messages but no shared form lifecycle. | Build optional edit/commit/cancel and validation contracts on existing focus, input, and virtualization. Keep data storage, business rules, and submission policy with applications. |

Core already supports retargeting and explicit velocity. Goo.Animations supplies
springs, cubic tweens, keyframes, delays, stagger, repeat and ping-pong.
Compose future controls with core animation instances and their clock.

## Comparison basis

These references set workflow expectations, not Goo's architecture or core scope:

- Flutter: [text input configuration](https://api.flutter.dev/flutter/services/TextInputConfiguration-class.html) and [platform integration](https://docs.flutter.dev/platform-integration/platform-channels).
- Qt: [animation lifecycle](https://doc.qt.io/qt-6/qml-qtquick-animation.html) and [native accessibility](https://doc.qt.io/qt-6/accessible.html).
- Avalonia: [platform coverage](https://docs.avaloniaui.net/docs/supported-platforms) and [Windows integration](https://docs.avaloniaui.net/docs/platform-specific-guides/windows).

Assess demand and ownership before treating signed installers, native menus,
tray icons, notifications or embedded native controls as core blockers.
