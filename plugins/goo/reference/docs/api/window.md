# Window API

Generated from `Goo.xml`. Source declarations supply type ownership and XML-emitter omissions.

Source: [`Goo/Window`](https://github.com/obselate/goo/tree/main/Goo/Window)

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
- `PostApplicationActivation` copies requests from any thread.- Arguments keep their boundaries, empty values and sender directory.
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
shown. Unsupported `Focusable` assignments throw before changing the configuredvalue. `Topmost` is a requested preference, so unsupported hosts retain it without
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
