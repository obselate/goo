# Window API

Generated from `Goo.xml`. Source declarations supply type ownership and XML-emitter omissions.

Source: [`Goo/Window`](https://github.com/obselate/goo/tree/4819f4ac422dee642c56ee3b3ea20a47bab3d205/Goo/Window)

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
Window.ApplicationActivated += activation -> {
    if activation.Kind == ApplicationActivationKind.OpenUri {
        window.Title = activation.Target!!.AbsoluteUri
    }
}
let status = Window.InitializeApplicationActivation(
    ApplicationActivation{IsInitial: true})
```

Subscribe before opening the first window. Check the returned status.

- One process event reaches the UI thread during `Pump`, an embedded frame or `Run`.
- The app chooses the target window and validates notification data.
- `PostApplicationActivation` copies requests from any thread.
- Arguments keep their boundaries, empty values and sender directory.
- Documents remain URIs, including Android `content:` values.
- A document URI does not grant access to its data.
- An initial native request replaces a sole pending synthetic Launch.
- Other requests use FIFO order, with callback posts deferred to the next batch.
- Closing the last window clears pending requests.
- The same owner thread can initialize a new delivery lifetime.
- Hosts and optional packages own native associations, IPC and notifications.
- macOS cold and warm file or URL opens use this event.
- Native document batches stay separate from drag/drop into a window.
- Declare URL schemes and document types in the app bundle.

| Post status | Meaning |
| --- | --- |
| Accepted | The queue owns the request. |
| NotInitialized | Call InitializeApplicationActivation first. |
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

`Window.Preferences` is an immutable `PlatformPreferences` snapshot.
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
| Windows | Client-area animation, high contrast, DWM accent and the selected sound scheme. |
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
        for tag in locales {
            Console.WriteLine(tag)
        }
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
let dialog = Window{Title: "Settings", Width: 420, Height: 280, Owner: owner, Modal: true, Root: SettingsCell{}}.Open()
owner.Run()
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

Once the owner's `OnClosing` accepts closure, Goo tears down every owned
descendant before destroying the owner's native window, waiting for GPU work
without blocking the shared frame loop. Descendant `OnClosing` callbacks do not
veto this forced teardown; put application-wide save/close policy on the owner.
A child's normal `RequestClose` still invokes its own policy. Owned window trees
cannot gain new children after teardown begins. Native failures establishing
ownership/modality throw `NotSupportedException` with the SDL error and clean up
the partially created child. Windows and macOS use the same SDL contract; native
verification must be performed on the target desktop.

Generated from `Goo.xml`. Source declarations supply type ownership and XML-emitter omissions.

Source: [`Goo/Window`](https://github.com/obselate/goo/tree/main/Goo/Window)

## Native size constraints

`Window.MinWidth`, `MinHeight`, `MaxWidth`, and `MaxHeight` constrain the native
client area in logical window pixels, independently of layout-node constraints.
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
controls `Window.Run`: `Display` is the default and `Uncapped` schedules demanded
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

## Render pages without presenting

```gsharp
let created = window.CreateOffscreenSession()
if created.Status == OffscreenRenderStatus.Success {
    using let session = created.Session!!
    let options = OffscreenRenderOptions(240.0F, 180.0F, 480u, 360u, Color.White, 134217728L)
    let pending = session.RenderAsync(MyPage(), options, CancellationToken.None)
    while !pending.IsCompleted {
        session.Service()
        Thread.Sleep(1)
    }
    let rendered = pending.GetAwaiter().GetResult()
}
```

Create the session on the window thread before opening native UI.
The session keeps the shared renderer, not the native surface.
It can render while an embedded host is paused or detached.
Call `Service` from the host's UI scheduler until each page finishes.
Create, render, service and dispose on the same thread.

Each page uses a fresh, unattached cell.
Logical size controls layout. Pixel size controls resolution.
`MaxBytes` bounds new GPU allocations and CPU pixels.
Pass a previous capture to reuse its pixels at the same size.
Do not read those pixels until the next render completes.

`window.RenderOffscreenAsync` uses the window's existing renderer instead.
Keep pumping that window until completion.
Both paths return an explicit `OffscreenRenderStatus`.
Closing the owner cancels pending pages.
`window.Closed` is a cancellation token for optional owner-bound services.

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
if result.Status == WindowOperationResult.Accepted {
    window.Run()
}
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

Use `TryPost` when teardown can race the producer. It returns `false` after posting closes instead of throwing. `true` means the action was atomically accepted into the queue, not that it is guaranteed to execute, because later teardown may still discard queued work.

Each `Pump` drains one fixed accepted batch after close decisions and native metrics, and before input. Posts made while that batch runs wait for the next `Pump`. When native closing or teardown starts, Goo discards queued work. Teardown is terminal and later `Post` calls throw `InvalidOperationException`.

`Window.Closed` is cancelled when owner-thread dispatch stops. Link asynchronous
package work to this token so its result can complete even when teardown discards
an accepted action. Cancellation callbacks must not throw or use torn-down UI state.

Pump removes an action before it calls the action. If it throws, Pump throws the same exception and later queued actions remain for the next direct `Pump`. `Run` propagates the exception, then closes the window and discards queued work. Accessibility adapters can use `Post` before calling Window accessibility APIs.

## Schedule window timers

Call `SetTimeout(callback, delayMs)` for one callback or `SetInterval(callback, intervalMs)` for repeated callbacks. Both return a `WindowTimer`. The window must be open, and scheduling and `Dispose` must run on its UI thread. A timeout accepts a zero delay; an interval must be greater than zero. Both durations must be finite and nonnegative.

Timers use the window event loop, so callbacks can update UI state directly. The window wakes for the next deadline while idle. Each pump fires due timers once. An overdue interval skips missed periods instead of calling the callback in a burst. Timers scheduled inside a callback wait until a later pump.

Keep the returned timer and call `Dispose` when its owner no longer needs callbacks. `IsActive` reports whether it remains scheduled. A one-shot timer becomes inactive before its callback runs. Closing the window cancels its timers, including those in an embedded window. A timer callback that closes the window stops dispatch of the remaining due callbacks.

## Use the native clipboard

Call `Window.GetClipboardText` and `Window.SetClipboardText` only on the open window's UI thread. Both fail deterministically after close. Reads reject text above 16 MiB of UTF-8, without truncation. An empty getter result can mean an empty clipboard, a native copy failure, or an oversized payload. Setter failures propagate. Built-in text entry and editor paste use the same limit, including supplied paste text, and leave the selection unchanged when rejected. This budget allows large source and log pastes, matches the SVG input budget, and bounds text conversion and input processing separately from the 64 MiB image budget.

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

Windows uses the SDL native chooser; macOS uses its native panel. Linux uses the
XDG desktop FileChooser portal through Goo's bundled SDL bridge, preserving the exact
Wayland/X11 owner and supporting `Request.Close` cancellation. A missing portal or
an SDL payload without that bridge reports `Unsupported`. Embedded hosts report
`Unsupported`. Normal native waiting creates no polling timer in Goo; the regular SDL event
pump delivers completion. Windows cancellation briefly retries dismissal until SDL
creates and closes its worker-owned chooser. Windows and macOS require runtime verification on their
respective platforms.

## File and image clipboard data

`GetClipboardFormats()` returns an owned MIME list plus `HasFiles` and `HasImage` without copying image payloads or opening listed files. `ReadClipboardFiles()` and `ReadClipboardImage()` return owned data and an explicit `ClipboardReadStatus`: `Success`, `Empty`, `Unsupported`, `TooLarge`, or `Failed`. `Error` explains failures and exceeded limits. Each call reads the current clipboard; a query and later read are not an atomic snapshot. Applications choose which representation to prefer when both files and images are offered.

Call these methods on the open window's UI thread. Calls before open, after close, or on another thread throw. Embedded windows report `Unsupported` because their clipboard belongs to the host. Clipboard contents are never modified by these methods. Returned paths and bytes survive later clipboard changes and window close and need no disposal.

File reads support local `text/uri-list`, GNOME copied-file lists, Windows `CF_HDROP`, and macOS pasteboard file URLs. Paths retain clipboard order; Goo does not read their contents. URI lists reject remote hosts, relative paths, and NUL characters. Limits are 4096 paths, 32768 UTF-16 units per path, and 1048576 total path units; MIME file-list payloads are limited to 1 MiB.

Image reads prefer PNG, JPEG, GIF, BMP, then macOS TIFF. PNG/JPEG/GIF bytes keep their declared MIME type; a successful transfer does not validate their encoding. Windows DIB/BMP and macOS TIFF are converted to PNG. Every encoded result is limited to 64 MiB. Native bitmap conversion checks dimensions before raster decode, allowing at most 8192 pixels per dimension and 64 MiB of RGBA pixels. These are payload and raster limits, not peak temporary-memory limits. Encoded bytes can be saved directly or passed to an application image-loading workflow.

Linux relies on the active SDL clipboard backend. Windows uses native file-list and DIB access; macOS uses pasteboard items and ImageIO for TIFF conversion. Backend failures are reported explicitly; native Windows/macOS execution requires validation on those systems.

## Publish multiple clipboard formats

```gsharp
let plain = System.Text.Encoding.UTF8.GetBytes("Hello")
let html = System.Text.Encoding.UTF8.GetBytes("<b>Hello</b>")
let data = TransferData(
    []TransferRepresentation{
        TransferRepresentation("text/plain", ReadOnlyMemory[uint8](plain)),
        TransferRepresentation("text/html", ReadOnlyMemory[uint8](html))
    },
    []Uri{}
)
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


## `ClipboardDataResult`

Source:

- [`TransferData.gs`](https://github.com/obselate/goo/blob/4819f4ac422dee642c56ee3b3ea20a47bab3d205/Goo/Window/TransferData.gs)

Contains an owned multi-format clipboard snapshot and its file-transfer intent.

### `Data`

Gets owned MIME bytes and URI references, or an empty payload on failure.

### `Error`

Gets a bounded explanation of native failure or excessive data.

### `Intent`

Gets the native file-transfer hint, defaulting to Copy when no marker exists.

### `Status`

Gets the snapshot outcome, independently of individual representation lengths.

## `ClipboardFiles`

Source:

- [`Clipboard.gs`](https://github.com/obselate/goo/blob/4819f4ac422dee642c56ee3b3ea20a47bab3d205/Goo/Window/Clipboard.gs)

Contains an immutable owned file-path list copied from the native clipboard.

### `Error`

Gets a native failure or limit explanation, or an empty string.

### `Paths`

Gets absolute file paths in clipboard order, without reading any file contents.

### `Status`

Gets the read outcome; Empty differs from native failure and unsupported access.

## `ClipboardFormats`

Source:

- [`Clipboard.gs`](https://github.com/obselate/goo/blob/4819f4ac422dee642c56ee3b3ea20a47bab3d205/Goo/Window/Clipboard.gs)

Describes the available clipboard MIME representations without reading payload bytes.

### `Error`

Gets a native failure or limit explanation, or an empty string.

### `Formats`

Gets an immutable owned list of available MIME representations.

### `HasFiles`

Gets whether a supported file-list representation is available.

### `HasImage`

Gets whether a supported image representation is available.

### `Status`

Gets the query outcome.

## `ClipboardImage`

Source:

- [`Clipboard.gs`](https://github.com/obselate/goo/blob/4819f4ac422dee642c56ee3b3ea20a47bab3d205/Goo/Window/Clipboard.gs)

Contains encoded image bytes copied into managed ownership from the clipboard.

### `Bytes`

Gets owned encoded bytes that remain valid after clipboard changes or window close.

### `ContentType`

Gets the declared MIME content type; native bitmaps are normalized to image/png.

### `Error`

Gets a native failure or limit explanation, or an empty string.

### `Status`

Gets the read outcome.

## `ClipboardIntent`

Source:

- [`TransferData.gs`](https://github.com/obselate/goo/blob/4819f4ac422dee642c56ee3b3ea20a47bab3d205/Goo/Window/TransferData.gs)

Selects whether a file clipboard publication prefers copying or a deferred move.

### Values

- `Copy`
- `Cut`

### `Copy`

Publishes references without requesting source removal.

### `Cut`

Requests a deferred file move where the native clipboard supports that intent.

## `ClipboardReadStatus`

Source:

- [`Clipboard.gs`](https://github.com/obselate/goo/blob/4819f4ac422dee642c56ee3b3ea20a47bab3d205/Goo/Window/Clipboard.gs)

Reports a native clipboard query/read outcome independently of payload contents.

### Values

- `Success`
- `Empty`
- `Unsupported`
- `TooLarge`
- `Failed`

## `ClipboardWriteResult`

Source:

- [`TransferData.gs`](https://github.com/obselate/goo/blob/4819f4ac422dee642c56ee3b3ea20a47bab3d205/Goo/Window/TransferData.gs)

Reports whether all requested clipboard representations were published.

### `Error`

Gets a bounded native failure explanation, or an empty string.

### `Status`

Gets the publication outcome, not confirmation that another application pasted it.

## `DataTransferStatus`

Source:

- [`TransferData.gs`](https://github.com/obselate/goo/blob/4819f4ac422dee642c56ee3b3ea20a47bab3d205/Goo/Window/TransferData.gs)

Reports a native data publication outcome without throwing for platform failures.

### Values

- `Success`
- `Cancelled`
- `Unsupported`
- `TooLarge`
- `Denied`
- `Failed`

### `Cancelled`

The transfer was cancelled before completion.

### `Denied`

The operating system denied access to the transfer.

### `Failed`

A native transfer operation failed.

### `Success`

Every requested representation was published.

### `TooLarge`

The transfer exceeds a native or managed data budget.

### `Unsupported`

The host cannot provide the requested transfer or intent.

## `FileDialogFilter`

Source:

- [`FileDialog.gs`](https://github.com/obselate/goo/blob/4819f4ac422dee642c56ee3b3ea20a47bab3d205/Goo/Window/FileDialog.gs)

Describes one immutable native chooser filter.

### `new(string,string)`

Creates a filter; the chooser validates the bounded label and extension syntax before launch.

- `name`: The user-visible filter label.
- `pattern`: Semicolon-separated extensions or a single asterisk.

### `Name`

Gets the label shown to the user.

### `Pattern`

Gets semicolon-separated extensions, such as png;jpg, or a single * for all files.

## `FileDialogKind`

Source:

- [`FileDialog.gs`](https://github.com/obselate/goo/blob/4819f4ac422dee642c56ee3b3ea20a47bab3d205/Goo/Window/FileDialog.gs)

Selects an open-file, save-file, or folder chooser.

### Values

- `OpenFile`
- `SaveFile`
- `Folder`

## `FileDialogOptions`

Source:

- [`FileDialog.gs`](https://github.com/obselate/goo/blob/4819f4ac422dee642c56ee3b3ea20a47bab3d205/Goo/Window/FileDialog.gs)

Supplies optional native chooser hints, copied when the request starts.

### `new`

Creates options with native defaults and single selection.

### `Filters`

Gets up to 64 filters; folder dialogs reject nonempty filters.

### `InitialPath`

Gets the initial absolute directory or full file path; include a filename for a save suggestion.

### `Multiple`

Gets whether open-file and folder dialogs may select multiple entries; save dialogs reject true.

### `Title`

Gets the optional title; empty uses the platform default.

## `FileDialogResult`

Source:

- [`FileDialog.gs`](https://github.com/obselate/goo/blob/4819f4ac422dee642c56ee3b3ea20a47bab3d205/Goo/Window/FileDialog.gs)

Contains owned native chooser results without opening or writing any selected file.

### `Error`

Gets a native failure or limit explanation, or an empty string.

### `FilterIndex`

Gets the selected filter index, or -1 when the backend does not report it.

### `Paths`

Gets the immutable absolute paths selected by the user, valid after owner close.

### `Status`

Gets the request outcome.

## `FileDialogStatus`

Source:

- [`FileDialog.gs`](https://github.com/obselate/goo/blob/4819f4ac422dee642c56ee3b3ea20a47bab3d205/Goo/Window/FileDialog.gs)

Distinguishes selected paths, cancellation, unavailable backends, excessive results, and native failures.

### Values

- `Success`
- `Cancelled`
- `Unsupported`
- `TooLarge`
- `Failed`

## `MacOSBackdropMaterial`

Source:

- [`Window.Backdrop.gs`](https://github.com/obselate/goo/blob/4819f4ac422dee642c56ee3b3ea20a47bab3d205/Goo/Window/WindowParts/Window.Backdrop.gs)

Selects a semantic AppKit backdrop material. Appearance follows macOS policy.

### Values

- `UnderWindowBackground`
- `Titlebar`
- `Selection`
- `Menu`
- `Popover`
- `Sidebar`
- `HeaderView`
- `Sheet`
- `WindowBackground`
- `HudWindow`
- `FullScreenUI`
- `ToolTip`
- `ContentBackground`
- `UnderPageBackground`

### `ContentBackground`

Uses the content background material.

### `FullScreenUI`

Uses the fullscreen interface material.

### `HeaderView`

Uses the header material.

### `HudWindow`

Uses the heads-up display material.

### `Menu`

Uses the menu material.

### `Popover`

Uses the popover material.

### `Selection`

Uses the selection material.

### `Sheet`

Uses the sheet material.

### `Sidebar`

Uses the sidebar material.

### `Titlebar`

Uses the titlebar material.

### `ToolTip`

Uses the tooltip material.

### `UnderPageBackground`

Uses the material beneath page backgrounds.

### `UnderWindowBackground`

Uses the material behind window backgrounds. This is the default.

### `WindowBackground`

Uses the window background material.

## `MacOSBackdropOptions`

Source:

- [`Window.Backdrop.gs`](https://github.com/obselate/goo/blob/4819f4ac422dee642c56ee3b3ea20a47bab3d205/Goo/Window/WindowParts/Window.Backdrop.gs)

Configures this window's behind-window AppKit effect. Other platforms ignore it.

### `Emphasized`

Gets whether the native material uses its emphasized appearance.

### `Mask`

Gets the alpha mask, or nil for the full view. This masks the material, not Goo content or input.

### `Material`

Gets the semantic material. Some materials are opaque. Defaults to UnderWindowBackground.

### `State`

Gets the activation policy. Defaults to FollowWindow and still respects accessibility settings.

## `MacOSBackdropState`

Source:

- [`Window.Backdrop.gs`](https://github.com/obselate/goo/blob/4819f4ac422dee642c56ee3b3ea20a47bab3d205/Goo/Window/WindowParts/Window.Backdrop.gs)

Controls whether an AppKit backdrop uses its active or inactive appearance.

### Values

- `FollowWindow`
- `Active`
- `Inactive`

### `Active`

Uses the active material appearance.

### `FollowWindow`

Follows native window activation. This is the default.

### `Inactive`

Uses the inactive material appearance.

## `NativeDialogOwnerKind`

Source:

- [`NativeDialogOwner.gs`](https://github.com/obselate/goo/blob/4819f4ac422dee642c56ee3b3ea20a47bab3d205/Goo/Window/NativeDialogOwner.gs)

Identifies the borrowed native owner representation.

### Values

- `Win32`
- `Cocoa`
- `Wayland`

## `NativeDialogOwnerLease`

Source:

- [`NativeDialogOwner.gs`](https://github.com/obselate/goo/blob/4819f4ac422dee642c56ee3b3ea20a47bab3d205/Goo/Window/NativeDialogOwner.gs)

Keeps a native dialog owner alive and blocks only that owner's Goo input until disposed.

### `Dispose`

Releases modal ownership on the window thread after native callbacks stop using the owner.

### `Closed`

Gets a token cancelled when the owner requests close. Release the lease after native dismissal.

### `Handle`

Gets the HWND or NSWindow. Wayland owners use Identifier instead.

### `Identifier`

Gets the exported wayland: parent identifier, or an empty string on other hosts.

### `Kind`

Gets the kind of borrowed native owner. The lease never owns the native window.

## `NativeDialogOwnerResult`

Source:

- [`NativeDialogOwner.gs`](https://github.com/obselate/goo/blob/4819f4ac422dee642c56ee3b3ea20a47bab3d205/Goo/Window/NativeDialogOwner.gs)

Contains Status, an Owner lease on Success and Error detail on failure.

## `NativeDialogOwnerStatus`

Source:

- [`NativeDialogOwner.gs`](https://github.com/obselate/goo/blob/4819f4ac422dee642c56ee3b3ea20a47bab3d205/Goo/Window/NativeDialogOwner.gs)

Reports whether a native service can borrow this window as a modal owner.

### Values

- `Success`
- `Unsupported`
- `Busy`
- `NotReady`
- `Closed`
- `Cancelled`
- `Failed`

## `PopupDismissReason`

Source:

- [`PopupWindow.gs`](https://github.com/obselate/goo/blob/4819f4ac422dee642c56ee3b3ea20a47bab3d205/Goo/Window/PopupWindow.gs)

Identifies why a complete native popup chain was dismissed.

### Values

- `Programmatic`
- `Escape`
- `OutsideInteraction`
- `FocusLost`
- `OwnerHidden`
- `OwnerClosed`
- `PlatformDismissed`

### `Escape`

Escape dismissed the popup.

### `FocusLost`

Keyboard focus left the owner and popup chain.

### `OutsideInteraction`

Input outside the popup chain dismissed it.

### `OwnerClosed`

The owner closed.

### `OwnerHidden`

The owner became hidden.

### `PlatformDismissed`

The compositor dismissed the popup without a more specific reason.

### `Programmatic`

The application requested dismissal.

## `PopupKind`

Source:

- [`PopupWindow.gs`](https://github.com/obselate/goo/blob/4819f4ac422dee642c56ee3b3ea20a47bab3d205/Goo/Window/PopupWindow.gs)

Selects an interactive native popup or an input-transparent tooltip.

### Values

- `Menu`
- `Tooltip`

### `Menu`

Receives input and joins the owner's native popup grab chain.

### `Tooltip`

Does not receive keyboard or pointer input.

## `PopupResult`

Source:

- [`PopupWindow.gs`](https://github.com/obselate/goo/blob/4819f4ac422dee642c56ee3b3ea20a47bab3d205/Goo/Window/PopupWindow.gs)

Contains a native popup creation outcome and owned failure detail.

### `Error`

Gets native failure detail, or an empty string.

### `Status`

Gets the native creation outcome.

## `PopupStatus`

Source:

- [`PopupWindow.gs`](https://github.com/obselate/goo/blob/4819f4ac422dee642c56ee3b3ea20a47bab3d205/Goo/Window/PopupWindow.gs)

Reports native popup creation without substituting an ordinary window.

### Values

- `Opened`
- `Closed`
- `Unsupported`
- `RequiresUserAction`
- `Failed`
- `Busy`

### `Busy`

The owner already has a popup or modal operation.

### `Closed`

The owner is closed or closing.

### `Failed`

Native creation or presentation initialization failed.

### `Opened`

Native creation and mapping were accepted, subject to compositor policy.

### `RequiresUserAction`

A Wayland menu requires an originating native input event.

### `Unsupported`

The host does not provide the requested native popup operation.

## `PopupWindow`

Source:

- [`PopupWindow.gs`](https://github.com/obselate/goo/blob/4819f4ac422dee642c56ee3b3ea20a47bab3d205/Goo/Window/PopupWindow.gs)

Hosts one new Goo root in a transient native surface outside its owner's bounds. Create a new root and PopupWindow for each opening. Portal ownership is unchanged.

### `Dismissed`

Runs once after the popup and all descendants release their native resources.

### `new(PopupWindow,Cell,PopupKind)`

Creates a submenu whose native parent is another open popup.

- `owner`: The open parent popup on the same UI thread.
- `root`: A root Cell not mounted in another window.
- `kind`: Interactive menu or input-transparent tooltip.

### `new(Window,Cell,PopupKind)`

Creates a popup with an independent root and a desktop or Android owner.

- `owner`: The open native owner on the same UI thread.
- `root`: A root Cell not mounted in another window.
- `kind`: Interactive menu or input-transparent tooltip.

### `Close`

Requests descendant-first dismissal. GPU retirement can defer native destruction.

### `Dispose`

Requests dismissal and prevents this instance from reopening.

### `Open(ElementRect,int32,int32,PortalPlacement)`

Opens a native popup relative to its parent's content rectangle in layout units. Wayland menus must open from native input or an active parent popup grab.

- `anchor`: The finite parent-content anchor rectangle.
- `width`: Requested positive content width in layout units.
- `height`: Requested positive content height in layout units.
- `placement`: Preferred side and alignment before native display constraints.

Returns: An explicit native creation result, never a top-level-window fallback.

### `UpdatePlacement(ElementRect,int32,int32,PortalPlacement)`

Updates requested size and parent-local placement without changing the root.

- `anchor`: The finite parent-content anchor rectangle.
- `width`: Requested positive content width in layout units.
- `height`: Requested positive content height in layout units.
- `placement`: Preferred side and alignment before native display constraints.

Returns: Accepted, Closed, Unsupported or Failed from the native operation.

### `IsOpen`

Reports whether the surface is open, including deferred GPU retirement during close.

### `Metrics`

Gets the current logical and framebuffer metrics on the owner thread.

## `TransferData`

Source:

- [`TransferData.gs`](https://github.com/obselate/goo/blob/4819f4ac422dee642c56ee3b3ea20a47bab3d205/Goo/Window/TransferData.gs)

Owns MIME alternatives and an ordered document URI selection without reading document contents.

### `new(System.Collections.Generic.IReadOnlyList{TransferRepresentation},System.Collections.Generic.IReadOnlyList{System.Uri})`

Captures at most 128 representations, 64 MiB total bytes and 4096 bounded absolute URIs.

- `representations`: Owned MIME alternatives with unique exact type names.
- `uris`: Absolute document references in selection order, without a duplicate text/uri-list representation.

### `Representations`

Gets immutable MIME alternatives for the same logical selection.

### `Uris`

Gets document references, which do not imply local paths or persistent access grants.

## `TransferRepresentation`

Source:

- [`TransferData.gs`](https://github.com/obselate/goo/blob/4819f4ac422dee642c56ee3b3ea20a47bab3d205/Goo/Window/TransferData.gs)

Owns immutable bytes for one exact MIME representation of a selection.

### `new(string,System.ReadOnlyMemory{System.Byte})`

Copies a bounded MIME representation into managed ownership.

- `contentType`: A MIME type of at most 256 ASCII bytes, without control characters.
- `bytes`: Encoded bytes, at most 64 MiB, without a text terminator.

### `Bytes`

Gets owned bytes that remain valid after clipboard replacement or window close.

### `ContentType`

Gets the exact MIME type offered to native consumers.

## `WaylandBackdropOptions`

Source:

- [`Window.Backdrop.gs`](https://github.com/obselate/goo/blob/4819f4ac422dee642c56ee3b3ea20a47bab3d205/Goo/Window/WindowParts/Window.Backdrop.gs)

Configures this window's Wayland background effect. Other platforms ignore it.

### `CornerRadius`

Gets the blur region corner radius in logical pixels. Defaults to zero and clamps to half the region size.

### `Region`

Gets a surface-local rectangle in logical pixels, or nil for the whole window. Coordinates and sizes must be nonnegative and fit in signed 32-bit surface coordinates. Fractional bounds round outward. A zero width or height removes blur. The compositor clips to the surface.

## `Window`

Sources:

- [`NativeAccessibilityHost.gs`](https://github.com/obselate/goo/blob/4819f4ac422dee642c56ee3b3ea20a47bab3d205/Goo/Accessibility/Native/NativeAccessibilityHost.gs)
- [`Clipboard.gs`](https://github.com/obselate/goo/blob/4819f4ac422dee642c56ee3b3ea20a47bab3d205/Goo/Window/Clipboard.gs)
- [`FileDialog.gs`](https://github.com/obselate/goo/blob/4819f4ac422dee642c56ee3b3ea20a47bab3d205/Goo/Window/FileDialog.gs)
- [`NativeDialogOwner.gs`](https://github.com/obselate/goo/blob/4819f4ac422dee642c56ee3b3ea20a47bab3d205/Goo/Window/NativeDialogOwner.gs)
- [`NativeFileDrop.gs`](https://github.com/obselate/goo/blob/4819f4ac422dee642c56ee3b3ea20a47bab3d205/Goo/Window/NativeFileDrop.gs)
- [`Window.gs`](https://github.com/obselate/goo/blob/4819f4ac422dee642c56ee3b3ea20a47bab3d205/Goo/Window/Window.gs)
- [`Window.Accessibility.gs`](https://github.com/obselate/goo/blob/4819f4ac422dee642c56ee3b3ea20a47bab3d205/Goo/Window/WindowParts/Window.Accessibility.gs)
- [`Window.Activation.gs`](https://github.com/obselate/goo/blob/4819f4ac422dee642c56ee3b3ea20a47bab3d205/Goo/Window/WindowParts/Window.Activation.gs)
- [`Window.ApplicationActivation.gs`](https://github.com/obselate/goo/blob/4819f4ac422dee642c56ee3b3ea20a47bab3d205/Goo/Window/WindowParts/Window.ApplicationActivation.gs)
- [`Window.Backdrop.gs`](https://github.com/obselate/goo/blob/4819f4ac422dee642c56ee3b3ea20a47bab3d205/Goo/Window/WindowParts/Window.Backdrop.gs)
- [`Window.Context.gs`](https://github.com/obselate/goo/blob/4819f4ac422dee642c56ee3b3ea20a47bab3d205/Goo/Window/WindowParts/Window.Context.gs)
- [`Window.Dispatcher.gs`](https://github.com/obselate/goo/blob/4819f4ac422dee642c56ee3b3ea20a47bab3d205/Goo/Window/WindowParts/Window.Dispatcher.gs)
- [`Window.Displays.gs`](https://github.com/obselate/goo/blob/4819f4ac422dee642c56ee3b3ea20a47bab3d205/Goo/Window/WindowParts/Window.Displays.gs)
- [`Window.DragRegion.gs`](https://github.com/obselate/goo/blob/4819f4ac422dee642c56ee3b3ea20a47bab3d205/Goo/Window/WindowParts/Window.DragRegion.gs)
- [`Window.ElementHandle.gs`](https://github.com/obselate/goo/blob/4819f4ac422dee642c56ee3b3ea20a47bab3d205/Goo/Window/WindowParts/Window.ElementHandle.gs)
- [`Window.Embedded.gs`](https://github.com/obselate/goo/blob/4819f4ac422dee642c56ee3b3ea20a47bab3d205/Goo/Window/WindowParts/Window.Embedded.gs)
- [`Window.ExternalImages.gs`](https://github.com/obselate/goo/blob/4819f4ac422dee642c56ee3b3ea20a47bab3d205/Goo/Window/WindowParts/Window.ExternalImages.gs)
- [`Window.Frame.gs`](https://github.com/obselate/goo/blob/4819f4ac422dee642c56ee3b3ea20a47bab3d205/Goo/Window/WindowParts/Window.Frame.gs)
- [`Window.Host.gs`](https://github.com/obselate/goo/blob/4819f4ac422dee642c56ee3b3ea20a47bab3d205/Goo/Window/WindowParts/Window.Host.gs)
- [`Window.Images.gs`](https://github.com/obselate/goo/blob/4819f4ac422dee642c56ee3b3ea20a47bab3d205/Goo/Window/WindowParts/Window.Images.gs)
- [`Window.Input.gs`](https://github.com/obselate/goo/blob/4819f4ac422dee642c56ee3b3ea20a47bab3d205/Goo/Window/WindowParts/Window.Input.gs)
- [`Window.NativeModal.gs`](https://github.com/obselate/goo/blob/4819f4ac422dee642c56ee3b3ea20a47bab3d205/Goo/Window/WindowParts/Window.NativeModal.gs)
- [`Window.Offscreen.gs`](https://github.com/obselate/goo/blob/4819f4ac422dee642c56ee3b3ea20a47bab3d205/Goo/Window/WindowParts/Window.Offscreen.gs)
- [`Window.Ownership.gs`](https://github.com/obselate/goo/blob/4819f4ac422dee642c56ee3b3ea20a47bab3d205/Goo/Window/WindowParts/Window.Ownership.gs)
- [`Window.Placement.gs`](https://github.com/obselate/goo/blob/4819f4ac422dee642c56ee3b3ea20a47bab3d205/Goo/Window/WindowParts/Window.Placement.gs)
- [`Window.Platform.gs`](https://github.com/obselate/goo/blob/4819f4ac422dee642c56ee3b3ea20a47bab3d205/Goo/Window/WindowParts/Window.Platform.gs)
- [`Window.Popup.gs`](https://github.com/obselate/goo/blob/4819f4ac422dee642c56ee3b3ea20a47bab3d205/Goo/Window/WindowParts/Window.Popup.gs)
- [`Window.Preferences.Layout.gs`](https://github.com/obselate/goo/blob/4819f4ac422dee642c56ee3b3ea20a47bab3d205/Goo/Window/WindowParts/Window.Preferences.Layout.gs)
- [`Window.Preferences.gs`](https://github.com/obselate/goo/blob/4819f4ac422dee642c56ee3b3ea20a47bab3d205/Goo/Window/WindowParts/Window.Preferences.gs)
- [`Window.Profile.gs`](https://github.com/obselate/goo/blob/4819f4ac422dee642c56ee3b3ea20a47bab3d205/Goo/Window/WindowParts/Window.Profile.gs)
- [`Window.Retained.gs`](https://github.com/obselate/goo/blob/4819f4ac422dee642c56ee3b3ea20a47bab3d205/Goo/Window/WindowParts/Window.Retained.gs)
- [`Window.SizeConstraints.gs`](https://github.com/obselate/goo/blob/4819f4ac422dee642c56ee3b3ea20a47bab3d205/Goo/Window/WindowParts/Window.SizeConstraints.gs)
- [`Window.Timers.gs`](https://github.com/obselate/goo/blob/4819f4ac422dee642c56ee3b3ea20a47bab3d205/Goo/Window/WindowParts/Window.Timers.gs)
- [`Window.Titlebar.gs`](https://github.com/obselate/goo/blob/4819f4ac422dee642c56ee3b3ea20a47bab3d205/Goo/Window/WindowParts/Window.Titlebar.gs)
- [`Window.UiScale.gs`](https://github.com/obselate/goo/blob/4819f4ac422dee642c56ee3b3ea20a47bab3d205/Goo/Window/WindowParts/Window.UiScale.gs)
- [`Window.Visibility.gs`](https://github.com/obselate/goo/blob/4819f4ac422dee642c56ee3b3ea20a47bab3d205/Goo/Window/WindowParts/Window.Visibility.gs)

Hosts a Goo tree on one process-wide UI thread. After Open or Attach, only Post and RequestClose are safe from another thread.

### `ApplicationActivated`

Occurs once per application activation on the process UI thread, not once per open window. Subscribe before initializing activation. Handlers own validation and window selection. The queue retains 1024 requests, with 4096 arguments or documents per request. Text is limited to 64 KiB per UTF-8 string and 1 MiB per request. Native requests outside these limits, or received before initialization or after close, are dropped.

### `DisplayChanged`

Occurs on the UI thread when this window changes display or native display scale, after updating its minimum size.

### `FocusChanged`

Occurs after the native window focus state changes.

### `KeyPressed`

Occurs for each physical key press before focused-element routing.

### `MetricsChanged`

Occurs after the native window reports a new stable size or display scale. Callbacks run on the window UI thread after native metrics and layout settle.

### `PreferencesChanged`

Reports preference changes after affected layout and motion policy are updated on the owner thread.

### `PresentationAccepted`

Occurs on the UI thread through the posted-action queue after Vulkan accepts a present request. Acceptance does not establish a display scanout time.

### `PreviewKeyPressed`

Occurs before KeyPressed and focused-element routing, including in modal scopes. Return true to consume the key and stop later preview handlers.

### `StateChanged`

Occurs after the native window reports a new window state.

### `TitlebarDoubleClicked`

Occurs before a native titlebar double-click performs its default action. Uses platform click-sequence recognition; clickable/focusable content is excluded. Set Handled to replace the action. Subscribe and handle on the window UI thread.

### `VisibilityChanged`

Reports observed viewport visibility changes on the owner thread.

### `new`

Creates a window with default configuration.

### `AccessibilityHitTest(float64,float64)`

Finds the published semantic node at a point in window logical coordinates.

- `x`: The finite horizontal window logical coordinate.
- `y`: The finite vertical window logical coordinate.

Returns: The topmost semantic identity, or nil outside visible semantic content.

### `AcquireNativeDialogOwnerAsync(System.Threading.CancellationToken)`

Borrows a native owner for one optional package dialog without exposing SDL state.

- `cancellation`: Cancels acquisition before native ownership begins.

Returns: A lease on Success, or an explicit host or lifecycle status.

### `ApplyPlacement(WindowPlacement)`

Applies supported fields on the owner thread, or stages normal size, position and state before Open. Geometry rounds to SDL integer screen units. Wayland never applies global position. Fullscreen display selection requires an open window. Unsupported fields remain absent from AppliedFields. Accepted means the request was accepted, not that the compositor granted its final geometry or state. Applying normal geometry can wait for a finite native window transition. Capture again after native configure to observe the result. Android and embedded hosts return Unsupported.

- `value`: Saved normal geometry, state and display matching hints.

Returns: Applied fields with Accepted, Unsupported, Closed, or Failed for invalid data or native failure.

### `Attach(EmbeddedWindowHost)`

Attaches this window to an external viewport without creating a desktop window. The host attaches its native presentation surface separately and drives RenderFrame.

### `CancelFileDialog`

Cancels delivery of a pending chooser result on the UI thread and requests native dismissal where available. Native ownership remains active until the platform callback returns.

Returns: True when a pending native chooser exists, including one already awaiting dismissal.

### `CapturePlacement`

Captures normal client bounds and restorable state from the open native window. Maximized, fullscreen and minimized sizes do not replace normal bounds. Display hints are not permanent monitor IDs. Android and embedded hosts return Unsupported.

Returns: Accepted with owned placement, Closed without an open window, or an explicit host failure.

### `ConfigureApplication(string,string,string)`

Configures process-wide application identity before SDL initialization.

- `name`: human-readable application name
- `version`: application version
- `identifier`: unique reverse-domain identifier

### `CreateOffscreenSession`

Creates a renderer lease before opening native UI that can remove this window's presentation surface.

Returns: A session on Success, or an explicit renderer status.

### `DragRegion(Container)`

Marks a container subtree as a native drag region for undecorated windows. Clickable or focusable descendants still win their own pointer input.

- `region`: container to mark

Returns: the same container

### `GetClipboardFormats`

Queries MIME availability without reading image bytes or file contents.

Returns: An owned format list and explicit query status.

### `GetClipboardText`

Gets the current native clipboard text on the window UI thread. An empty result can mean an empty clipboard, native copy failure, or text exceeding 16 MiB of UTF-8.

### `GetCurrentDisplay`

Gets this window's current display, or nil for an embedded host or unavailable SDL display. Open the window first and call on its UI thread.

Returns: an immutable snapshot of the current display, or nil when unavailable.

### `GetDisplays`

Gets an immutable snapshot of the current host's displays. Open the window first and call on its UI thread. IDs can become stale after hotplug or SDL restart. Embedded hosts return an empty list.

### `Hide`

Hides an open desktop window and cancels transient input without destroying its tree. Releases the swapchain and clip atlas after pending GPU work completes. Show recreates them. Modal windows and owners blocked by a modal child or chooser cannot be hidden.

### `InitializeApplicationActivation(ApplicationActivation)`

Binds activation to the current UI thread and retains the initial request until a window pumps. Call before opening the first desktop window or from the embedded host's owner thread. After all windows close, the same owner thread may initialize a new delivery lifetime.

- `initial`: The initial request, copied with its IsInitial value unchanged.

Returns: Accepted when retained, or Failed when the request exceeds the activation data limits.

### `Open`

Creates the native window and returns this window.

Returns: this window after native initialization

### `PerformAccessibilityAction(AccessibilityId,AccessibilityActionRequest)`

Routes one platform-neutral accessibility action to a mounted semantic node.

- `id`: The retained semantic node identity.
- `request`: The requested supported operation.

Returns: False when the node is unavailable or the action is unsupported.

### `PollCapture`

Takes a completed capture, or returns nil while it is pending. Failed readback throws and releases this request's ownership.

### `Post(System.Action)`

Queues an action for the UI thread.

- `action`: action to run during the next Pump

### `PostApplicationActivation(ApplicationActivation)`

Copies and queues a request from any thread for the process-wide activation event. Accepted confirms queue ownership, not handler completion, document access, or focus. Requests allow 4096 arguments and documents each, 64 KiB per UTF-8 string and 1 MiB total text.

- `value`: The owned request data to copy. Relative URIs and null values are invalid arguments.

Returns: Accepted, NotInitialized, Closed, QueueFull at 1024 pending requests, or TooLarge.

### `Pump(float64)`

Processes one frame with the specified elapsed time.

- `dt`: elapsed seconds since the previous frame

### `ReadClipboardDataAsync(System.Collections.Generic.IReadOnlyList{string})`

Copies requested available MIME alternatives and URI references from one native clipboard offer.

- `contentTypes`: Exact MIME types to read, including text/uri-list for document references.

Returns: Owned data and explicit status, with no partial payload on a native read failure.

### `ReadClipboardFiles`

Reads at most 4096 absolute paths and 1048576 UTF-16 path units from the current clipboard.

Returns: Owned paths and explicit read status; the clipboard may have changed since a format query.

### `ReadClipboardImage`

Reads at most 64 MiB of encoded image data; native bitmap conversion also limits decoded RGBA to 64 MiB.

Returns: Owned encoded bytes with a MIME type and explicit read status.

### `RenderOffscreenAsync(Cell,OffscreenRenderOptions,System.Threading.CancellationToken,WindowCapture)`

Renders a fresh, unattached cell at a separate layout size without resizing or presenting this window. Keep pumping the owner until completion. Pixels and new GPU allocations share MaxBytes.

- `root`: The independent page content.
- `options`: The logical viewport, pixel size, background and memory limit.
- `cancellation`: Cancels the operation after in-flight GPU work is safe to release.
- `reusable`: Previous pixels to reuse when the output size matches. Do not access them until completion.

Returns: Owned pixels or an explicit operation status.

### `RequestActivation`

Requests restoration of a minimized window, raising, and keyboard activation. Call on the owning UI thread in response to a user action. Desktop policy controls the outcome; observe IsFocused and FocusChanged for actual focus. Maximized/fullscreen state and the focused Goo element are preserved. Redirects to the active modal child. Returns Closed before Open or after close, Unsupported for embedded hosts, nonfocusable windows, or an active native chooser, or Failed if the native request reports an immediate error. Asynchronous policy denials are not reported by the desktop backend. Wayland requests use SDL's xdg-activation token and recent input serial.

### `RequestCapture`

Starts an asynchronous offscreen replay of the current scene. This may submit a native present and does not sample a specific display scanout. Call PollCapture on the UI thread until it returns pixels.

### `RequestCapture(WindowCapture)`

Reuses a previous capture's caller-owned pixels when its size matches. Do not access or reuse those pixels until PollCapture completes this request. A changed capture size allocates an independent pixel array.

### `RequestClose`

Queues an idempotent close request. This is safe from any thread.

### `Run`

Opens the window and processes frames until all open Goo windows close.

### `SetClipboardText(string)`

Sets the native clipboard text on the window UI thread. Native set failures throw.

### `SetColors(Color,Color)`

Sets the clear and inherited root text colors together on the owner thread. Explicit element colors take precedence over the inherited foreground.

- `background`: The window clear color.
- `foreground`: The inherited root text color.

### `SetInterval(System.Action,float64)`

Runs a callback repeatedly on the UI thread at the requested interval.

### `SetNativeDataDropFormats(System.Collections.Generic.IReadOnlyList{string})`

Enables an exact MIME allow-list for native drops on the owning UI thread.

- `formats`: At most 128 unique MIME names. An empty list disables MIME drops.

Returns: Accepted, Closed, Unsupported or Failed without changing an unsupported host.

### `SetTimeout(System.Action,float64)`

Runs a callback once on the UI thread after the delay.

### `Show(bool)`

Shows an open desktop window, optionally requesting activation. The mounted tree survives Hide. Activation follows RequestActivation, including modal child routing. Nonfocusable windows show passively. Embedded hosts return Unsupported.

### `ShowFileDialogAsync(FileDialogKind,FileDialogOptions)`

Starts one owner-modal chooser on the open window's UI thread; other windows continue rendering.

- `kind`: The open-file, save-file, or folder chooser to show.
- `options`: Optional title, initial path, filters, and multiple-selection hints copied before launch.

Returns: A task completed on the UI thread with owned paths and an explicit outcome. Await continuations follow normal .NET context rules.

### `TryPost(System.Action)`

Attempts to queue an action for the UI thread. A successful enqueue can still be discarded if teardown begins before the action runs.

- `action`: action to run during a later Pump

Returns: True when the action was accepted into the queue.

### `TrySetFullscreenDisplay(WindowDisplayId)`

Requests borderless fullscreen on the selected display, including retargeting an already-fullscreen window. This must run on the window's UI thread. Returns Closed before Open or after close, Unsupported for embedded hosts, Failed for a stale ID or native failure, and Accepted when SDL accepts the request. Acceptance does not guarantee compositor placement. The compositor may keep the current display when retargeting fullscreen.

### `TrySetTopmost(bool)`

Attempts to submit a topmost request to the current native host. Accepted means the host accepted the request; desktop policy still controls observed stacking.

Returns: Closed, Unsupported, Accepted, or Failed for the host operation.

### `WriteClipboardAsync(TransferData,ClipboardIntent)`

Publishes every MIME alternative and URI reference in one native clipboard publication.

- `data`: The immutable selection to publish without opening referenced documents.
- `intent`: Copy or a supported deferred file-cut hint, never an instruction to delete source files.

Returns: Explicit publication status. Success does not confirm that a paste occurred.

### `AccessibilityAdapter`

Gets or sets the adapter that receives this window's retained semantic tree.

### `Backdrop`

Gets or sets the native desktop material. Blur requests per-pixel transparency at Open. Enable transparency before opening a window that will toggle blur at runtime. Native policy controls the appearance. Unsupported hosts use BackdropFallbackColor.

### `BackdropAvailable`

Reports whether the open native host accepts blur and advertises support. The compositor can still vary or suppress its material according to system policy.

### `BackdropFallbackColor`

Gets or sets the opaque window background used when requested blur is unavailable. Defaults to black. Foreground content is rendered over this color normally.

### `Background`

Gets or sets the window clear color. The default is white.

### `CanMove`

Reports whether programmatic window movement is available.

### `Capabilities`

Gets supported native lifecycle operations, or None before Open or Attach.

### `Closed`

Gets a token cancelled when this window stops accepting owner-thread work. A posted action can be discarded during teardown. Use this token to complete pending asynchronous work.

### `ContentUnderTitlebar`

Gets or sets whether macOS content extends under the transparent titlebar. Defaults to false. Keeps native window controls. Other platforms ignore it.

### `Decorated`

Gets or sets whether the system draws window decorations.

### `DragStartDistance`

Sets the logical pixels a pressed mouse or pen pointer must move on either axis before a drag source starts a drag. Touch contacts start at 4. The default is 8.

### `Focusable`

Gets or sets whether the desktop window may receive keyboard focus. Unsupported hosts throw before changing the requested value. Modal windows must remain focusable.

### `Foreground`

Gets or sets the inherited root text color. The default is black.

### `ForeignParentHandle`

Gets or sets a portal parent identifier before Open, such as wayland: followed by an exported surface handle. Unsupported or expired handles leave the window unparented. This cannot be combined with Owner.

### `FramePacing`

Gets or sets the frame pacing used by Window.Run. Uncapped still honors GPU queue readiness and the selected presentation mode.

### `FrameTheme`

Gets or sets the native frame and material appearance. Unknown follows the system. Applies immediately on Windows and macOS. Other platforms ignore it.

### `Height`

Gets or sets the window height.

### `IconPng`

Configures PNG bytes for the native window icon in the Window initializer before Open. The icon is decoded when opening, has a 1024 pixel edge limit, and requires no external file.

### `InitiallyVisible`

Gets or sets whether Open shows the desktop window. Configure before Open.

### `IsFocused`

Reports whether the window holds native input focus.

### `IsInputBlocked`

Gets whether a modal child, native chooser, or native modal service blocks this window's input and accessibility actions.

### `IsOpen`

Reports whether the window is open.

### `IsVisible`

Gets whether the host reports a visible viewport. This does not imply focus or lack of occlusion.

### `LastAccessibilityError`

Gets the most recent adapter exception. Failed delivery retries on the next UI-thread update.

### `LastNativeFileDropError`

Gets the most recent rejected native file-list explanation, cleared when the next offer begins.

### `LastNativeTransferError`

Gets the latest native drop explanation, bounded to 1024 characters.

### `LastNativeTransferStatus`

Gets the latest native drop capture status.

### `MacOSBackdrop`

Gets or sets macOS-only material, activation, emphasis and mask options. Changes apply immediately. The native view samples behind the window. Use Style.ShaderEffect to sample Goo content within it.

### `MaxHeight`

Gets or sets the client maximum height in layout pixels, multiplied by UiScale for the native limit; zero removes the limit. Must be nonnegative and, when nonzero, no smaller than MinHeight. Embedded hosts are unsupported.

### `MaxWidth`

Gets or sets the client maximum width in layout pixels, multiplied by UiScale for the native limit; zero removes the limit. Must be nonnegative and, when nonzero, no smaller than MinWidth. Embedded hosts are unsupported.

### `MinHeight`

Gets or sets the client minimum height in layout pixels, multiplied by UiScale and clamped to the current display's usable height. Zero removes the limit. Must be nonnegative and no greater than a nonzero MaxHeight. Embedded hosts are unsupported.

### `MinWidth`

Gets or sets the client minimum width in layout pixels, multiplied by UiScale and clamped to the current display's usable width. Zero removes the limit. Must be nonnegative and no greater than a nonzero MaxWidth. Embedded hosts are unsupported.

### `Modal`

Gets or sets whether this window is modal to Owner or ForeignParentHandle. Configure before Open. One direct modal child may be open per owner. Nested dialogs use the active modal child as their owner.

### `NativeFileDropEnabled`

Enables native file-drop ingress before Open or on the owning UI thread; disabled by default. Unsupported hosts reject enabling. Disabling cancels any active preview.

### `NativeTransferCapabilities`

Gets the current native transfer capabilities; closed and embedded windows return None.

### `OnClosing`

Gets or sets the close-request handler. Return false to veto closure. OS termination bypasses this handler. Accepted requests do not invoke the handler again while teardown finishes.

### `Owner`

Gets or sets the native owner before Open. The owner must be an open desktop window on the same UI thread. Ownership cannot change while open. Self-ownership and ancestor cycles are rejected.

### `PlatformInput`

Gets the owner-thread platform input and focused-editor contract.

### `Preferences`

Gets the current host snapshot. Unsupported preferences remain unknown.

### `QueueWorkPending`

Reports whether the native target has pending GPU submit or present work. Use Pump(0) to service pending work without advancing the simulation.

### `Resizable`

Gets or sets whether the user can resize the window.

### `ResizeBand`

Gets or sets the undecorated edge resize band in logical pixels.

### `Root`

Gets the root cell.

### `SmoothScrolling`

Enables animated scrolling and touch momentum. The default is true.

### `State`

Gets or sets the window state.

### `Title`

Gets or sets the window title.

### `TitlebarControlsRect`

Gets the macOS window controls' bounds in top-left window logical pixels, including titlebar height. Returns nil without overlapping native controls, including fullscreen and other platforms.

### `Topmost`

Gets or sets the requested desktop topmost preference. Unsupported hosts retain the request without changing native stacking. Desktop policy controls the final stacking order.

### `Transparent`

Gets or sets next-open per-pixel alpha. An open window is unchanged. Transparency requires the GPU renderer.

### `UiScale`

Gets or sets the layout and rendering scale, clamped to 0.5 through 3. The default is 1, or the owner's scale when not explicitly set. Width and Height remain native logical sizes. Layout uses those sizes divided by UiScale, and rendering multiplies the display scale by UiScale.

### `VSync`

Gets or sets per-window GPU presentation synchronization. True requests FIFO. Software Vulkan devices prefer Immediate, then Mailbox, then FIFO. False prefers Immediate, then Mailbox, then FIFO on every device. Window.Run pacing is controlled separately by FramePacing.

### `WaylandBackdrop`

Gets or sets Wayland-only blur region options. Changes apply on the next surface commit.

### `WheelScrollScale`

Scales the platform wheel distance for this window. The default is 1.

### `Width`

Gets or sets the window width.

### `WindowsBackdrop`

Gets or sets Windows-only material options. Changes apply to an open window immediately.

### `X`

Gets or sets the requested horizontal position.

### `Y`

Gets or sets the requested vertical position.

## `WindowBackdrop`

Source:

- [`Window.Backdrop.gs`](https://github.com/obselate/goo/blob/4819f4ac422dee642c56ee3b3ea20a47bab3d205/Goo/Window/WindowParts/Window.Backdrop.gs)

Selects a native material behind the window's rendered content.

### Values

- `None`
- `Blur`

### `Blur`

Requests compositor blur of the desktop behind this window.

### `None`

No native background effect.

## `WindowBackdropMask`

Source:

- [`Window.Backdrop.gs`](https://github.com/obselate/goo/blob/4819f4ac422dee642c56ee3b3ea20a47bab3d205/Goo/Window/WindowParts/Window.Backdrop.gs)

Owns an immutable alpha mask for a native macOS backdrop, stretched to its bounds.

### `new(int32,int32,System.Byte[])`

Copies a row-major alpha mask. Zero hides the material and 255 fully shows it.

- `width`: The positive pixel width.
- `height`: The positive pixel height.
- `alpha`: Exactly width times height alpha bytes, starting at the top-left.

### `Height`

Gets the mask height in pixels.

### `Width`

Gets the mask width in pixels.

## `WindowCapabilities`

Source:

- [`Window.Visibility.gs`](https://github.com/obselate/goo/blob/4819f4ac422dee642c56ee3b3ea20a47bab3d205/Goo/Window/WindowParts/Window.Visibility.gs)

Reports native lifecycle operations supported by the current host.

### Values

- `None`
- `Visibility`
- `ShowWithoutActivation`
- `Focusability`
- `Topmost`

## `WindowCapture`

Source:

- [`Window.gs`](https://github.com/obselate/goo/blob/4819f4ac422dee642c56ee3b3ea20a47bab3d205/Goo/Window/Window.gs)

Owns RGBA8, sRGB, premultiplied pixels copied from a completed scene capture.

### `Height`

Gets the captured height in pixels.

### `OriginTopLeft`

Reports that the first pixel is at the top left.

### `Pixels`

Gets the caller-owned, top-left-origin RGBA8 pixel array.

### `Premultiplied`

Reports that color channels are premultiplied by alpha.

### `RowBytes`

Gets the row stride in bytes.

### `SrgbEncoded`

Reports that color channels use sRGB encoding.

### `Width`

Gets the captured width in pixels.

## `WindowCaptureRequestStatus`

Source:

- [`Window.gs`](https://github.com/obselate/goo/blob/4819f4ac422dee642c56ee3b3ea20a47bab3d205/Goo/Window/Window.gs)

Reports whether an asynchronous window capture request was accepted.

### Values

- `Accepted`
- `Busy`
- `BudgetExceeded`
- `NotReady`
- `Failed`
- `DeviceLost`
- `Unsupported`

## `WindowDisplay`

Source:

- [`Window.Displays.gs`](https://github.com/obselate/goo/blob/4819f4ac422dee642c56ee3b3ea20a47bab3d205/Goo/Window/WindowParts/Window.Displays.gs)

Describes one display from an immutable SDL inventory snapshot.

### `Bounds`

Gets the display bounds in SDL screen coordinates.

### `ContentScale`

Gets SDL's expected content scale for the display, or zero if SDL cannot provide it. A window scale can differ.

### `Id`

Gets the opaque process-local display ID.

### `Name`

Gets the SDL display name.

### `UsableBounds`

Gets usable non-fullscreen bounds, or nil if SDL could not provide them.

## `WindowDisplayId`

Source:

- [`Window.Displays.gs`](https://github.com/obselate/goo/blob/4819f4ac422dee642c56ee3b3ea20a47bab3d205/Goo/Window/WindowParts/Window.Displays.gs)

Identifies one SDL display in the current process. The value can become stale after display changes.

## `WindowFramePacing`

Source:

- [`Window.gs`](https://github.com/obselate/goo/blob/4819f4ac422dee642c56ee3b3ea20a47bab3d205/Goo/Window/Window.gs)

Controls how Window.Run schedules frames that have visual demand.

### Values

- `Display`
- `Uncapped`

## `WindowMetrics`

Source:

- [`Window.gs`](https://github.com/obselate/goo/blob/4819f4ac422dee642c56ee3b3ea20a47bab3d205/Goo/Window/Window.gs)

Describes one stable window size and display-scale snapshot.

### `DisplayScaleX`

Gets the horizontal framebuffer-to-logical scale.

### `DisplayScaleY`

Gets the vertical framebuffer-to-logical scale.

### `FramebufferHeight`

Gets the reported framebuffer height.

### `FramebufferWidth`

Gets the reported framebuffer width.

### `LogicalHeight`

Gets the reported logical height.

### `LogicalWidth`

Gets the reported logical width.

### `UiScale`

Gets the retained UI scale. A default snapshot uses 1.

## `WindowOperationResult`

Source:

- [`Window.Visibility.gs`](https://github.com/obselate/goo/blob/4819f4ac422dee642c56ee3b3ea20a47bab3d205/Goo/Window/WindowParts/Window.Visibility.gs)

Reports whether a window operation was submitted to the host. Accepted does not guarantee that desktop policy grants activation or stacking.

### Values

- `Accepted`
- `Closed`
- `Unsupported`
- `Failed`

## `WindowPlacement`

Source:

- [`WindowPlacement.gs`](https://github.com/obselate/goo/blob/4819f4ac422dee642c56ee3b3ea20a47bab3d205/Goo/Window/WindowPlacement.gs)

Owns restorable desktop geometry and display matching hints, without process-local display IDs.

### `new`

Creates an empty placement. Set Fields and its corresponding values before applying it.

### `DisplayBounds`

Gets the display bounds used to match a current display after topology changes.

### `DisplayName`

Gets a display name hint, not a unique or permanent monitor identity.

### `DisplayScale`

Gets the display's expected content scale, or zero when unavailable.

### `Fields`

Gets the fields present in this saved placement.

### `NormalBounds`

Gets normal client geometry in SDL integer screen units, not framebuffer pixels. Position is meaningful only when Fields includes Position.

### `State`

Gets the restorable state. Capture records the last non-minimized state for a minimized window.

## `WindowPlacementFields`

Source:

- [`WindowPlacement.gs`](https://github.com/obselate/goo/blob/4819f4ac422dee642c56ee3b3ea20a47bab3d205/Goo/Window/WindowPlacement.gs)

Identifies the placement fields retained or accepted by a desktop host.

### Values

- `None`
- `NormalSize`
- `Position`
- `State`
- `FullscreenDisplay`

### `FullscreenDisplay`

A fullscreen display matching hint is present.

### `None`

No placement fields are present.

### `NormalSize`

Normal client width and height are present.

### `Position`

Global desktop position is present. Wayland does not support this field.

### `State`

Restorable window state is present.

## `WindowPlacementResult`

Source:

- [`WindowPlacement.gs`](https://github.com/obselate/goo/blob/4819f4ac422dee642c56ee3b3ea20a47bab3d205/Goo/Window/WindowPlacement.gs)

Reports captured placement or the fields accepted by an apply request.

### `AppliedFields`

Gets fields accepted for application. Capture results use None.

### `Error`

Gets bounded failure detail, or an empty string.

### `Placement`

Gets captured placement, or nil for an apply request or a failed capture.

### `Status`

Gets Accepted, Closed, Unsupported or Failed for this placement operation.

## `WindowPresentationAccepted`

Source:

- [`Window.gs`](https://github.com/obselate/goo/blob/4819f4ac422dee642c56ee3b3ea20a47bab3d205/Goo/Window/Window.gs)

Reports a successful queue-present handoff, not display scanout.

### `AcceptedTicks`

Gets the monotonic Stopwatch timestamp when Goo observed that acceptance.

### `FrameIndex`

Gets the one-based accepted presentation number for this window opening.

## `WindowState`

Source:

- [`Window.gs`](https://github.com/obselate/goo/blob/4819f4ac422dee642c56ee3b3ea20a47bab3d205/Goo/Window/Window.gs)

Identifies the requested state of a window.

### Values

- `Normal`
- `Minimized`
- `Maximized`
- `Fullscreen`

## `WindowTimer`

Source:

- [`Window.Timers.gs`](https://github.com/obselate/goo/blob/4819f4ac422dee642c56ee3b3ea20a47bab3d205/Goo/Window/WindowParts/Window.Timers.gs)

A cancellable callback scheduled on a Window's UI thread.

### `Dispose`

Cancels the callback. Call this on the Window's UI thread.

### `IsActive`

Reports whether the callback remains scheduled.

## `WindowTitlebarEvent`

Source:

- [`Window.Titlebar.gs`](https://github.com/obselate/goo/blob/4819f4ac422dee642c56ee3b3ea20a47bab3d205/Goo/Window/WindowParts/Window.Titlebar.gs)

A native double-click on eligible blank space in an undecorated drag region.

### `Handled`

Set true after handling the command to suppress the platform's default action.

### `Position`

Gets the pointer position in logical client coordinates.

## `WindowsBackdropMaterial`

Source:

- [`Window.Backdrop.gs`](https://github.com/obselate/goo/blob/4819f4ac422dee642c56ee3b3ea20a47bab3d205/Goo/Window/WindowParts/Window.Backdrop.gs)

Selects a Windows 11 system backdrop material.

### Values

- `Acrylic`
- `Automatic`
- `Mica`
- `MicaAlt`

### `Acrylic`

Blurs the desktop using Acrylic.

### `Automatic`

Lets DWM choose a material, which may cover only the titlebar or be absent.

### `Mica`

Uses the wallpaper-based Mica material.

### `MicaAlt`

Uses the alternate Mica material for tabbed windows.

## `WindowsBackdropOptions`

Source:

- [`Window.Backdrop.gs`](https://github.com/obselate/goo/blob/4819f4ac422dee642c56ee3b3ea20a47bab3d205/Goo/Window/WindowParts/Window.Backdrop.gs)

Configures the native material for this window on Windows. Other platforms ignore it.

### `Material`

Gets the material. The default is Acrylic.
