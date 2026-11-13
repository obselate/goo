## Open a window

```gsharp
Application.Run(Window{Root: Cell{}})
```

## Native library loading

Goo loads its bundled patched SDL and shares that handle with its SDL bindings.
It checks beside `Goo.dll`, then `runtimes/<rid>/native` in the output or NuGet
package. It also checks the host's native-library search directories, including
single-file extraction directories. Scripting hosts can load the managed assemblies
with `Assembly.LoadFrom`.
They do not need an application dependency manifest or a custom SDL search path.

## Native desktop backdrops

Set `Backdrop: WindowBackdrop.Blur` with a translucent `Background`. Configure
each platform before `Open` or replace its options on the window's UI thread:

```gs
let window = Window{
    Backdrop: WindowBackdrop.Blur,
    Background: Color.Parse("#090b10").WithAlpha(0.78),
    BackdropFallbackColor: "#090b10",
    WindowsBackdrop: WindowsBackdropOptions{Material: WindowsBackdropMaterial.Acrylic},
    MacOSBackdrop: MacOSBackdropOptions{
        Material: MacOSBackdropMaterial.UnderWindowBackground,
        State: MacOSBackdropState.FollowWindow,
    },
    WaylandBackdrop: WaylandBackdropOptions{
        Region: ElementRect{X: 0, Y: 0, Width: 320, Height: 240},
    },
}
```

Other platforms ignore these options. Default options preserve full-window blur.
Wayland `Region: nil` covers the whole surface, including after resize. An empty
rectangle removes blur without disabling support. Coordinates use surface-local
logical pixels and round outward. macOS `Mask` accepts an immutable
`WindowBackdropMask(width, height, alpha)` with top-left row-major alpha bytes.
It masks only the native material. `State` and `Emphasized` control AppKit's
appearance and do not override accessibility preferences.

Windows Mica materials use wallpaper, not live desktop blur. `Automatic` lets
DWM choose the material and coverage, including no material. `BackdropAvailable`
reports native acceptance, not a guarantee of visible blur. Unsupported hosts use
the opaque fallback. Native appearance remains subject to system policy.
Desktop-wide settings and numeric blur strength are not exposed. For blur of Goo
content within the window, use `Style.ShaderEffect`.

## Process application activation

```gs
let window = Window{}
Application.Activated += activation -> {
    if activation.Kind == ApplicationActivationKind.OpenUri {
        window.Title = activation.Target!!.AbsoluteUri
    }
}
Application.Run(window)
```

Call `Application.Configure` before startup. Use `Application.AcquireSingleInstance(arguments)` before `Run` when the app needs one primary instance. Keep its primary lease until shutdown.

- One process event reaches the UI thread during `Pump`, an embedded frame or `Run`.
- The app chooses the target window and validates notification data.
- `Application.PostActivation` copies requests from any thread.
- Arguments keep their boundaries, empty values and sender directory.
- Documents remain URIs, including Android `content:` values.
- A document URI does not grant access to its data.
- An initial native request replaces a sole pending synthetic Launch.
- Other requests use FIFO order, with callback posts deferred to the next batch.
- Closing the last window clears pending requests.
- Requests wait until an activation handler is added.
- Hosts and optional packages own native associations, IPC and notifications.
- macOS cold and warm file or URL opens use this event.
- Native document batches stay separate from drag/drop into a window.
- Declare [URL schemes and document types](https://github.com/obselate/goo/blob/main/docs/shipping.md#macos-app-and-dmg) in the app project.

| Post status | Meaning |
| --- | --- |
| Accepted | The queue owns the request. |
| NotInitialized | Call `Application.AcquireSingleInstance` or `Application.Run` first. |
| Closed | All windows closed. |
| QueueFull | 1024 requests are pending. |
| TooLarge | More than 4096 arguments or documents, 64 KiB per UTF-8 string, or 1 MiB total text. |

Null data and relative URIs are invalid arguments.
Native requests outside these limits are dropped.

## Visibility, activation and stacking

Set `Window.IconPng` in the `Window` initializer to embedded PNG bytes before
`Open` to request a native window icon. Goo validates the PNG with the same
16 MiB encoded and 64 MiB decoded limits as image loading, plus a 1024 pixel
icon edge limit. It gives SDL straight RGBA pixels before the window is shown.
No external icon file is needed for this property. On Wayland, the compositor
normally uses the matching `.desktop` entry's icon. `SDL_SetWindowIcon` works
only when the compositor supports `xdg-toplevel-icon-v1`.


`Open` shows the desktop window by default. Set `InitiallyVisible: false` before
`Open` to create and mount it while hidden, then call `Show()` or `Show(false)`.
`Show(false)` reveals the window without requesting activation. `Hide()` retains
the mounted tree, cancels transient input and suspends presentation. Callbacks and
timers still run while hidden. Hidden windows remain open until closed.

Initial presentation waits for pending images for up to 500 ms. Layer-shell windows
repeat this wait after `Show`. Later frames keep asynchronous image updates.
After that budget, presentation proceeds even if an image is not ready. In-flight
GPU work must still finish before the next frame can be presented.

Layer-shell windows require protocol version 2 or newer. `Hide` retains the native
layer role. `Show` restores its layer and placement before mapping it again.

`Show`, `Hide` and `RequestActivation` return `WindowOperationResult`: `Accepted`, `Closed`,
`Unsupported` or `Failed`. Accepted means the native request was submitted.
Observe `IsVisible` and `VisibilityChanged` for visibility, and `IsFocused` and
`FocusChanged` for keyboard focus. Visibility does not guarantee that another
window does not cover this one. `Show()` uses `RequestActivation()` for focusable
windows, restoring minimized windows and requesting focus without changing the
focused Goo element synchronously. Activation redirects to an active modal child
and returns `Unsupported` while a native chooser blocks the owner.

`Focusable` defaults to true and `Topmost` to false. Set them before `Open` or on
the owner thread afterward. Nonfocusable windows never request activation when
shown. Unsupported `Focusable` assignments throw before changing the configured
value. `Topmost` is a requested preference, so unsupported hosts retain it without
changing stacking or failing `Open`. Call `TrySetTopmost(value)` to distinguish
`Accepted`, `Unsupported`, `Closed` and `Failed` on an open window.
`Capabilities` reports operations supported by the current host, or `None` before
opening. Windows, macOS and X11 expose visibility, passive show, focusability and
topmost requests. Wayland exposes visibility but reports the other three as
unsupported for top-level windows. Final activation and stacking remain subject
to desktop policy. Embedded hosts own their viewport lifecycle and return
`Unsupported` for `Show` and `Hide`.

Modal windows must open visible and focusable with a visible owner. `Hide` returns
`Unsupported` for a modal window or an owner blocked by a modal child or chooser.
Close the modal window to release its owner. This prevents an invisible modal
window from retaining the input block.

## Platform preferences

`Window.Preferences` is an immutable [PlatformPreferences](platform.md#platformpreferences) snapshot.
`Theme` is `Unknown`, `Light` or `Dark`. `AccentColor`, `ReducedMotion`, `HighContrast`,
`EventSoundsEnabled` and `TextScaleFactor` are nullable so unsupported values
remain distinct from an explicit value. Text scale must be finite and positive and is independent
of display density. It affects text measurement, shaping and geometry, including
explicit font sizes and styled spans, without changing declared sizes or DPI.

Subscribe to `PreferencesChanged` on the owner thread. Equal snapshots do not
notify. Goo updates its layout and motion policy before calling subscribers.
Applications choose theme colors and contrast styling from the snapshot.
Reduced motion settles animations and transitions and stops automatic vector
playback at its current frame. Completed animations require a new target. A later
rebuild or rebind can resume vector playback when the preference permits it.
Embedded adapters publish snapshots with `EmbeddedWindowHost.UpdatePreferences`,
before or after attaching the window.

Desktop theme follows SDL notifications. Other desktop preferences refresh at
most once per second. Portal setting changes also trigger a refresh.

| Platform | Available preference sources |
| --- | --- |
| Windows | Client-area animation, high contrast, the shell accent palette (`AccentColor` is the base; `AccentLight1`-`AccentLight3` and `AccentDark1`-`AccentDark3` are the shades) and the selected sound scheme. |
| macOS | Reduced motion, increased contrast, `NSColor.controlAccentColor` in sRGB and `com.apple.sound.uiaudio.enabled`. |
| Linux | Portal appearance `accent-color` and `contrast`, plus GNOME `event-sounds` when exposed. |
| Android | Theme, font scale, disabled animations, theme `colorAccent`, high text contrast and `SOUND_EFFECTS_ENABLED`. |

Android refreshes on attach, resume and configuration changes. It also observes
sound and high text contrast setting changes. Desktop text scale stays unknown
when the backend cannot report it.

Apps choose whether to play UI sounds from `EventSoundsEnabled`.
This preference does not control media playback or volume.

```gsharp
window.PreferencesChanged += (preferences PlatformPreferences) -> {
    if let locales = preferences.PreferredLocales {
        for tag in locales { Console.WriteLine(tag) }
    }
}
```

`PreferredLocales` contains ordered BCP-47 tags. Nil means unavailable.
Lists are copied and immutable. Equal lists do not notify.

| Platform | Source and updates |
| --- | --- |
| Windows | SDL reads `GetUserPreferredUILanguages`. SDL locale changes refresh the list. |
| macOS | SDL reads `NSLocale.preferredLanguages`. SDL locale changes refresh the list. |
| Linux | `LANGUAGE`, then `LC_ALL`, then `LANG`. POSIX names become language tags. SDL is the fallback. |
| Android | Configuration `LocaleList`, read on attach, resume and configuration changes. |

The settings portal has no preferred-locale key. Apps own translations and choose
how to apply locale tags to language and direction styles.

## Native popup surfaces

```gsharp
using let popup = PopupWindow(window, TooltipCell{}, PopupKind.Tooltip)
let result = popup.Open(anchor.BorderBox, 240, 120, PortalPlacement.BottomStart)
```

A popup hosts a new Cell root outside its owner's bounds. Portal and widgets
Menu keep their current in-window behavior.

| Operation | Contract |
| --- | --- |
| `Open` | Call once per instance on the owner thread. Use parent-content layout units. Size follows the owner's UiScale. |
| `PopupKind.Menu` | Receives input. Wayland needs the native button, key or touch event being handled, or a parent popup grab. |
| `PopupKind.Tooltip` | Receives no input. It needs no grab. |
| `PopupResult.Status` | `Opened`, `Closed`, `Unsupported`, `RequiresUserAction`, `Busy` or `Failed`. |
| `Metrics` | Actual logical and framebuffer sizes. Native display bounds can change placement and size. |
| `UpdatePlacement` | Updates the parent-local anchor and size. Wayland anchors must stay inside the parent. Older compositors can return `Unsupported`. |
| `Dismissed` | Runs once after descendants and pending GPU work close. The owner hide/close, Escape, outside input or focus loss dismisses the chain. |
| `Close`, `Dispose` | Request dismissal. The host retires pending GPU work before disposal. |

Use another PopupWindow as the owner for a submenu. Each owner permits one popup.
Create a new root and popup for each opening. Close it when its anchor becomes
invalid. Android uses a native PopupWindow with a separate GooView surface.
It follows the owner view's lifecycle and the app's display bounds.
Other embedded hosts return `Unsupported`.
Native dialogs return `Busy` while a popup retires. Launch them after `Dismissed`.

## Native owned and modal windows

Portal backends can set `ForeignParentHandle` to the request's full
`wayland:<HANDLE>` parent identifier before `Open`. Do not combine it with `Owner`.
Set `Modal` to request a native modal hint for that foreign parent. Goo imports the
surface through xdg-foreign-v2 before mapping its window and releases the import on
hide or close. Showing again imports the handle again. An expired handle, unsupported
identifier, unavailable importer, or incompatible native payload leaves a usable
unparented window. Modal hints require compositor xdg-dialog-v1 support. Goo cannot
block input in another process. Parent destruction removes the foreign relationship
without closing the Goo window. The bundled Linux SDL shared and static archives
provide the same bridge, including NativeAOT consumers.

Set `Owner` and optional `Modal: true` before `Open`. The owner must already be
open on the same UI thread. Both windows must use desktop hosts; embedded
viewports explicitly reject these relationships. Self-ownership and cycles are
rejected before native creation. Existing independent windows remain the default.

```gsharp
let owner = Window{Title: "Main", Width: 800, Height: 600, Root: MainCell{}}.Open()
let dialog = Window{Title: "Settings", Width: 420, Height: 280,
  Owner: owner, Modal: true, Root: SettingsCell{}}.Open()
Application.Run(owner)
```

`Owner` and `Modal` cannot change while open. One direct modal child may be open
per owner; use that modal window as the owner of another nested dialog. A modeless
child does not block its owner. `IsInputBlocked` reports the direct modal block:
queued native input is discarded, `ElementHandle.Focus` and accessibility actions
return false, and modifying `PlatformInput` operations throw while blocked.
Cancellation, key release, and focus clearing remain available for cleanup.
Activation requests for a blocked owner are forwarded to its active modal child.

SDL establishes the native parent and modal relationship before showing the
child. The desktop controls stacking, taskbar grouping, minimizing/hiding and
activation policy; child `State` is not a copy of owner `State`. Closing a modal
restores the previous owner element's focus when it remains mounted and requests
native owner activation. A compositor may deny focus or raising requests.

Once the owner accepts close, descendants close first and cannot veto it.
Put save policy on the owner. A child `RequestClose` uses its own policy.
New children are rejected during teardown. Native ownership failures throw
`NotSupportedException` and release the partial child.

## Native size constraints

`Window.MinWidth`, `MinHeight`, `MaxWidth` and `MaxHeight` use layout pixels.
Goo multiplies them by `UiScale` for native client-area limits.
`Width` and `Height` stay in native logical pixels.
Zero removes a limit. Values must be nonnegative, and a nonzero maximum must be
at least its corresponding minimum. An invalid assignment leaves the old value.
Set these properties before `Open` or on the window's owner UI thread afterward.
When moving a bounded interval, widen or clear the old bound before crossing it.

`Open` clamps the requested initial size. Later `Width`/`Height` requests are also
clamped. Changing native limits asks SDL to resize an out-of-range client area;
`Width`, `Height`, and `MetricsChanged` reflect the compositor's resulting size
when its queued metrics settle. Limits constrain normal resizing; fullscreen and
window-manager-controlled states remain subject to platform policy. Native
failures throw and leave the corresponding configured limit unchanged.

Embedded hosts own viewport geometry: `Attach` rejects preconfigured limits and
changing a limit on an attached window throws `NotSupportedException`.

## Observe window metrics

Subscribe to `Window.MetricsChanged` on the UI thread. Goo delivers an immutable snapshot after queued native metrics and tree layout settle. A callback can queue UI work, but it must not expect recursive layout.

The snapshot reports the dimensions from the latest native metrics event. A zero framebuffer dimension is reported as zero and its corresponding display scale is zero. Goo keeps the prior render target while minimized or otherwise zero-sized.

Metrics callbacks run after layout and before scene compilation. Publish retained
shader data there when it depends on current `ElementHandle.BorderBox` values.
That publication joins the current paint. Reading a handle during `Build` still
returns the preceding completed layout. Native startup dimensions are snapshots,
not a promise that the compositor has finished changing scale. Continue applying
later metrics notifications, including display and fractional-scale changes.

Equal snapshots do not notify. A listener added after another listener has already received the current snapshot waits for a real change. Removing the final listener resets that listener stream, so a later first listener receives a new initial snapshot.

## Frame pacing and manual capture

`VSync` selects the preferred native presentation mode. `FramePacing` separately
controls `Application.Run`: `Display` is the default and `Uncapped` schedules demanded
frames as soon as the native queue is ready. Uncapped mode does not override a
compositor's presentation policy or render hidden and unavailable windows.

`Pump(dt)` advances simulation by the supplied seconds even when native work is
pending. A manual clock can advance once, then service the window with `Pump(0)`
while `QueueWorkPending` is true. Keep pumping to deliver input, close requests
and posted callbacks. A running animation does not rebuild its owner when its
sampled value is unchanged.

`PresentationAccepted` reports a successful Vulkan queue-present handoff on the
UI thread in a later pump. `FrameIndex` counts accepted presentations for that
window opening. `AcceptedTicks` is the monotonic `Stopwatch` timestamp when Goo
observed acceptance. Neither value identifies display scanout or a screenshot.

After applying a deterministic simulation step and pumping layout, call
`RequestCapture()`. Retry `Busy` or `NotReady` while pumping with zero delta.
Once accepted, call `PollCapture()` until it returns a `WindowCapture`. The result
owns top-left-origin RGBA8 pixels with a byte row stride, sRGB encoding and
premultiplied alpha. A failed readback throws and releases the request. DevTools
and public capture cannot take each other's accepted request.
Stop retrying if the window closes or the request reports a failure status.

Capture replays the current scene offscreen and may submit an additional native
present. It requires an open desktop window and does not capture a specific prior
presentation. Embedded hosts return `Unsupported`. The application owns its
manual clock, sampling of arbitrary scene state, frame ordering and video encoding.

## Measure text

```gsharp
let width = Math.Max(
    window.MeasureText("Save", labelStyle),
    window.MeasureText("Save a copy", labelStyle))
Text{BasedOn: labelStyle, Content: "Save", Width: width}
```

- Call on the window's UI thread, for example in `Cell.Build`.
- The result is single-line width in layout units, with text scale and pixel-grid rounding.
- Pass the same explicit style to measurement and Text. Parent styles are not inherited.
- Line breaks are ignored.
- Use this for a small fixed set of labels that must share the widest width.

## Render pages without presenting

A batch tool can block its own thread, like `goo render`:

```gsharp
let created = OffscreenRenderSession.Create()
if created.Status == OffscreenRenderStatus.Success {
    using let session = created.Session!!
    let options = OffscreenRenderOptions(240.0F, 180.0F, 480u, 360u, Color.White, 134217728L)
    let pending = session.RenderAsync(MyPage(), options, CancellationToken.None)
    while !pending.IsCompleted {
        session.Service()
        Thread.Yield()
    }
    let rendered = pending.GetAwaiter().GetResult()
}
```

An app with an open window uses a mounted Cell to own the session:

```gsharp
class RenderPageButton : Cell, IDisposable {
    private let window Window
    private var session OffscreenRenderSession?
    private var timer WindowTimer?

    init(window Window) {
        this.window = window
    }

    override func Build() Blob ->
        Button{OnClick: RenderPage, Text{Content: "Render page"}}

    private func RenderPage() {
        Dispose()
        let created = window.CreateOffscreenSession()
        if created.Status != OffscreenRenderStatus.Success { return }
        let active = created.Session!!
        session = active
        let options = OffscreenRenderOptions(240.0F, 180.0F, 480u, 360u, Color.White, 134217728L)
        let pending = active.RenderAsync(MyPage(), options, window.Closed)
        timer = window.Every(1.0, () -> {
            try {
                if !pending.IsCompleted { return }
                let rendered = pending.Result
            } catch (error Exception) {
                Dispose()
                throw error
            }
            Dispose()
        })
    }

    public func Dispose() {
        timer?.Dispose()
        timer = nil
        session?.Dispose()
        session = nil
    }
}
```

Mount `RenderPageButton(window)` in the window's tree. Goo disposes it on unmount
or window close, releasing the timer and session on the UI thread.
The timer reads `Result` only after completion, so it does not block for the result.
Window-created sessions complete in the window loop without calling `Service`.
Create, render and dispose on the same thread.
The session keeps the renderer alive, not its presentation surface.
Without an open window, use `OffscreenRenderSession.Create()` and call `Service`
while awaiting completion. Manual `Service` also works for window-created sessions,
including detached or suspended embedded hosts.

Each page uses a fresh, unattached cell.
Logical size sets the layout viewport. Pixel size sets resolution and the device-pixel grid used to round layout.
`MaxBytes` bounds new GPU allocations and CPU pixels.
Pass a previous capture to reuse its pixels at the same size.
Do not read those pixels until the next render completes.

`window.RenderOffscreenAsync` uses the window's existing renderer instead.
Keep pumping that window until completion.
Both paths return an explicit `OffscreenRenderStatus`.
Closing the owner cancels pending pages.
`window.Closed` is a cancellation token for optional owner-bound services.

## Render an app without a display

See the [render and diff commands](../devtools/cli.md) for options.

`goo render` builds a project or runs an existing executable. `Application.Run` uses
`OffscreenRenderSession` without opening a window. No display or compositor is needed.
Size defaults to the declared window size. Scale sets pixels per layout unit and
the device-pixel grid used to round layout. Theme sets `Window.Preferences.Theme`.
It does not replace the app's colors. Apps that ignore theme render unchanged.
The renderer waits for GPU image, path and text uploads. It does not wait for
app services or advance app animations.

Register named states in the window initializer:

```gsharp
Application.Run(Window{
  Root: Counter(),
  Scenes: Dictionary[string, Func[Cell]]{
    ["default"] = () -> Counter(),
    ["incremented"] = () -> Counter(5)
  }
})
```

`Scenes` is a read-only map of names to factories that return fresh, unattached
Cells. Registration is NativeAOT-safe and uses no reflection. `--list` prints
the registered names. Unknown scenes report the available names. Without
`--scene`, render uses the window's root. Without a scene map, `default` is the
only scene and renders `Window.Root`.
`OffscreenRenderSession.Create()` also creates a surface-free session directly.
Create, use and dispose it on the same thread.

For render, diff and hot-reload capture options, see the [CLI reference](../devtools/cli.md).


## Fullscreen displays

Call `window.GetDisplays()` on an open window's UI thread for an owned read-only
snapshot of connected desktop displays. Each `WindowDisplay` contains an opaque
`WindowDisplayId`, name, SDL screen-coordinate bounds, optional usable bounds and
expected content scale. Content scale is separate from the current window's
framebuffer scale. IDs can become stale after hotplug or SDL teardown. Embedded
hosts return an empty inventory.

`TrySetFullscreenDisplay(id)` requests borderless fullscreen on that display,
including output changes for an existing fullscreen window. It returns `Accepted`, `Closed`,
`Unsupported` or `Failed`. `Accepted` means SDL accepted the request, not that
the compositor moved the window. A compositor may keep the current output when
an already-fullscreen window is retargeted. A default or disconnected display ID
fails. Use a hidden initial window to inspect the inventory and select an output
before showing it.

KWin 6.7.5 can ignore an output change while fullscreen. To request another
output there, set `State` to `Normal`, wait for `StateChanged` to report
`Normal`, then call `TrySetFullscreenDisplay(id)` again. The app must wait for
the native state event before sending the next request.

Wayland supports fullscreen output selection while normal windowed placement
remains compositor-controlled. This API does not enable `CanMove` or switch the
monitor into an exclusive video mode. `State = WindowState.Fullscreen` remains
available when no explicit output selection is needed.

## Save and restore placement

```gsharp
let saved = WindowPlacement{
    Fields: WindowPlacementFields.NormalSize | WindowPlacementFields.State,
    NormalBounds: ElementRect{Width: 800, Height: 600},
    State: WindowState.Maximized,
}
let window = Window{Root: Cell{}}
let result = window.ApplyPlacement(saved)
if result.Status == WindowOperationResult.Accepted { Application.Run(window) }
```

Call `CapturePlacement()` on the open window's UI thread before teardown.
Save its `Placement` only when `Status` is `Accepted`.
Normal bounds remain separate from maximized, fullscreen and minimized geometry.
Capturing a minimized window records its last non-minimized state.

`ApplyPlacement()` stages normal size, position and state before `Open`, or applies them to an open window.
`AppliedFields` lists accepted fields. Fullscreen output selection requires an open window and matching display hints.
Capture after native configure to observe the result. Accepted does not force compositor placement.

| Host | Supported fields |
| --- | --- |
| Windows and macOS | Normal client size, position, state and fullscreen output selection. |
| Linux Wayland | Normal size, state and fullscreen output selection. No global position. |
| Android and embedded hosts | Unsupported. The host owns viewport geometry. |

Geometry uses SDL screen units, not framebuffer pixels. Display names, bounds and scale are matching hints.
Do not persist `WindowDisplayId`, native handles, macOS Spaces or Windows snap groups.
The app owns its serializer and settings file. NativeAOT serializers need generated metadata.
Use `Placement.Restore` from `Goo` to match current displays and clamp usable bounds and size limits.
Wayland has no direct unminimize request. Restore into a new window or request activation through the app's normal activation route.

## Observe window notifications

Subscribe to `StateChanged`, `FocusChanged`, and `KeyPressed` with `+=` on the window UI thread. Each event supports independent listeners. Remove listeners with `-=` when their ownership ends.

`OnClosing` is different: it is the single close-policy callback, and returning `false` vetoes the pending close request.

`MetricsChanged` includes `UiScale` and runs when that scale changes.
Raster selection uses `max(DisplayScaleX, DisplayScaleY) * UiScale`.

## Post UI work

Call `Window.Post` from any thread. Accepted actions use FIFO order. Post accepts work before the first `Open`. A pending `RequestClose` still accepts work because `OnClosing` can veto the request.

`Post` returns `false` when the window no longer accepts work. Callers that must not lose work check this result and handle rejection. `true` means queue acceptance, not guaranteed execution. Later teardown can discard queued work.

Each `Pump` drains one fixed accepted batch after close decisions and native metrics, and before input. Posts made while that batch runs wait for the next `Pump`. Teardown is terminal and discards queued work.

`Window.Closed` is cancelled after native teardown finishes or fails. Dispatch stops
earlier and can discard an accepted action. Link asynchronous package work to this token.
Cancellation callbacks must not throw or use torn-down UI state.

Pump removes an action before it calls the action. If it throws, Pump throws the same exception and later queued actions remain for the next direct `Pump`. `Run` propagates the exception, then closes the window and discards queued work. Accessibility adapters can use `Post` before calling Window accessibility APIs.

## Await UI work

```gsharp
async func Load() void {
    let result = await service.LoadAsync(Lifetime)
    Apply(result)
}
```

In a Goo callback, an incomplete `await` resumes on the window's UI thread. A
completed task continues inline. `ConfigureAwait(false)` opts out. Goo forwards
continuations to an existing embedded host context. A `go` child has no UI context.

After each continuation, Goo applies the owning Cell's callback rebuild rule.
State-only Cells do not rebuild when nothing changed. Unmounted Cells do not rebuild.

Use `window.InvokeAsync(action, token)` from any thread to await dispatch. It accepts
synchronous or Task-returning callbacks and awaits all their work. Generic overloads
return the function result. Exceptions propagate. Cancellation, closing the window,
rejected posts and discarded accepted posts cancel the wait.

Use `await window.NextPresentationAsync(token)` on the UI thread to request one
frame and await its accepted presentation receipt. It works on an idle window.
The receipt is a queue handoff, not display scanout.

| Close phase | Behavior |
| --- | --- |
| Stop | Hide the window. Reject posts, rebuilds and timers. Stop input, layout and paint. |
| Unmount | Run `Unmounting`, then cancel `Lifetime`, `Latest` and pending window tasks. |
| Drain | Keep async handlers on the UI thread until they finish or `CloseDrainMs` expires. Other windows keep running. |
| Late queue | After the bound, serialize continuations for this window on a background thread. Do not access UI state. |

`CloseDrainMs` defaults to 2000 ms. Zero skips the wait. A task that never
completes cannot run its handler's `finally`. Pending work does not survive process
exit. Pass `Lifetime` to every awaited operation that accepts cancellation.

An escaped async handler exception is rethrown from the pump. Cancellation is
ignored. During the close drain, the first other exception is saved until drain
completion. An unhandled late-queue exception stops the process.


## Schedule window timers

Call `After(delayMs, action)` for one callback or `Every(intervalMs, action)` for repeated callbacks. Both return a `WindowTimer`. The window must be open, and scheduling and `Dispose` must run on its UI thread. A delay can be zero. An interval must be greater than zero. Both durations must be finite and nonnegative.

Timers use the window event loop, so callbacks can update UI state directly. The window wakes for the next deadline while idle. Each pump fires due timers once. An overdue interval skips missed periods instead of calling the callback in a burst. Timers scheduled inside a callback wait until a later pump.

Keep the returned timer and call `Dispose` when its owner no longer needs callbacks. `IsActive` reports whether it remains scheduled. A one-shot timer becomes inactive before its callback runs. Closing the window cancels its timers, including those in an embedded window. A timer callback that closes the window stops dispatch of the remaining due callbacks.

## Use the native clipboard

Use clipboard text methods on the open window UI thread. Reads reject more than 16 MiB of UTF-8. An empty result can mean empty data, native failure or oversize data. Set failures throw. Built-in and supplied paste share this limit and leave selection unchanged on rejection.

## Native file dialogs

`window.ShowFileDialogAsync(FileDialogKind.OpenFile, options)` opens an owner-modal
native chooser and returns `Task[FileDialogResult]`. `SaveFile` suggests a filename
when `InitialPath` includes one; `Folder` selects directories. `FileDialogOptions`
also accepts a `Title`, `Multiple` for open/folder selection, and `Filters` such as
`FileDialogFilter("Images", "png;jpg")` or `FileDialogFilter("All files", "*")`.
Filters contain extensions, without `*.`. Options are copied at launch. The selected
filter index is `-1` when the backend does not report it.

Call the service on the open owner's UI thread and continue pumping its windows.
The chooser blocks only its owner's Goo input and accessibility actions; independent
windows continue rendering and accepting input. Completion releases modal ownership
and restores the owner's previous focus on the UI thread. Task continuations follow
normal .NET synchronization-context rules. A second chooser or an already-modal
owner is rejected. An accepted owner close cancels the task, requests native dismissal,
and retains the native owner until its callback finishes. `CancelFileDialog()` does
the same cancellation without closing the owner. No selected file is opened or
written by Goo; applications perform their own import/export after success.

`FileDialogResult.Status` distinguishes `Success`, `Cancelled`, `Unsupported`,
`TooLarge`, and `Failed`. Successful paths are immutable, fully qualified owned
strings that remain valid after owner close. Requests allow at most 64 filters, a
256-character title/filter label, a 1,024-character filter pattern, and a
32,768-character initial path. Results allow at most 4,096 paths, 32,768 UTF-16 code
units per path, and 1 MiB of total path code units. Invalid options throw before any
native work; native and result-limit errors return an explicit outcome.

Windows and macOS use native choosers. Linux requires the XDG FileChooser portal
and the bundled SDL bridge. Missing portal or bridge support returns `Unsupported`.
Embedded hosts return `Unsupported`. `CancelFileDialog` requests native dismissal.

## File and image clipboard data

`GetClipboardFormats()` returns an owned MIME list plus `HasFiles` and `HasImage` without copying image payloads or opening listed files. `ReadClipboardFiles()` and `ReadClipboardImage()` return owned data and an explicit `ClipboardReadStatus`: `Success`, `Empty`, `Unsupported`, `TooLarge`, or `Failed`. `Error` explains failures and exceeded limits. Each call reads the current clipboard; a query and later read are not an atomic snapshot. Applications choose which representation to prefer when both files and images are offered.

Call these methods on the open window's UI thread. Calls before open, after close, or on another thread throw. Embedded windows report `Unsupported` because their clipboard belongs to the host. Clipboard contents are never modified by these methods. Returned paths and bytes survive later clipboard changes and window close and need no disposal.

File reads support local `text/uri-list`, GNOME copied-file lists, Windows `CF_HDROP`, and macOS pasteboard file URLs. Paths retain clipboard order; Goo does not read their contents. URI lists reject remote hosts, relative paths, and NUL characters. Limits are 4096 paths, 32768 UTF-16 units per path, and 1048576 total path units; MIME file-list payloads are limited to 1 MiB.

Image reads prefer PNG, JPEG, GIF, BMP, then macOS TIFF. PNG/JPEG/GIF bytes keep their declared MIME type; a successful transfer does not validate their encoding. Windows DIB/BMP and macOS TIFF are converted to PNG. Every encoded result is limited to 64 MiB. Native bitmap conversion checks dimensions before raster decode, allowing at most 8192 pixels per dimension and 64 MiB of RGBA pixels. These are payload and raster limits, not peak temporary-memory limits. Encoded bytes can be saved directly or passed to an application image-loading workflow.


## Publish multiple clipboard formats

```gsharp
let plain = System.Text.Encoding.UTF8.GetBytes("Hello")
let html = System.Text.Encoding.UTF8.GetBytes("<b>Hello</b>")
let data = TransferData([]TransferRepresentation{
  TransferRepresentation("text/plain", ReadOnlyMemory[uint8](plain)),
  TransferRepresentation("text/html", ReadOnlyMemory[uint8](html))
}, []Uri{})
let result = await window.WriteClipboardAsync(data)
```

Start clipboard calls on the open window's UI thread. Check `result.Status`.

| Contract | Behavior |
| --- | --- |
| Read | `ReadClipboardDataAsync(types)` copies requested formats from one offer. Include `text/uri-list` for document references. |
| Owned data | Byte snapshots and URI values stay unchanged after replacement or window close. Caller changes cannot alter published bytes. |
| Text and images | Plain text and HTML use UTF-8 without a terminator. RTF and encoded images keep their bytes. |
| Files | Put references in `Uris`, not a second URI-list representation. Goo does not open the files. Desktop references must be local file URIs. |
| Cut | File Cut requires URIs and never deletes sources. macOS and Android return `Unsupported`. Editor Cut writes Copy data, then removes its selection after Success. |
| Read status | Missing requested data is `Empty`. A present zero-byte format is `Success`. Failed reads return no partial selection. |
| Write status | Unsupported formats are not dropped. Native failures can replace or clear the old clipboard. Success does not confirm paste. |
| Limits | At most 128 MIME names, 256 ASCII bytes per name and 64 MiB total bytes. Text is limited to 16 MiB. Existing file-list bounds apply. |
| Platforms | These methods support Windows, macOS, Wayland and `Goo.Android`. Other hosts return `Unsupported`. Existing clipboard methods keep their behavior. |
| Windows formats | HTML, RTF, PNG and files use native formats. PNG, JPEG and GIF also offer a native bitmap. MIME bytes use owned global memory. |
| Windows limits | MIME names have at most 255 characters and cannot differ only by case. Plain text cannot contain NUL. An incompatible COM apartment returns `Unsupported`. |
| macOS formats | MIME bytes use native pasteboard types. File references use separate NSURL items. All data is copied before publication. |
| Lifetime | Windows and macOS keep data after app exit. Wayland needs a clipboard manager. A document URI does not grant persistent access. |
| Android formats | Images and MIME alternatives use read-only content streams, not Binder byte arrays. File references must use `content://` URIs. |
| Android access | Reads require a focused Goo view. MIME data survives view disposal and process recreation. The next MIME write releases old publication files. URI access is not persistent. |
| Android limits | Clip metadata is limited to 512 KiB and 4096 items. A MIME stream uses one item alongside any document references. |

