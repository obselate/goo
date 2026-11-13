# Android integration

## Android starter

```sh
dotnet new install Goo.Templates
dotnet new goo-android --name HelloGoo --application-id com.example.hellogoo
dotnet build HelloGoo/HelloGoo.gsproj -c Release
```

- Requires the .NET Android workload, its supported Android SDK and JDK.
- Includes an Activity, a shared G# library, Vulkan manifest rules and ARM64/x64 RIDs.
- Use `--goo-version` to select the matching Goo and Goo.Android release.
- Set `AndroidSdkDirectory` and `JavaSdkDirectory` if tool discovery fails.

[API reference](https://github.com/obselate/goo/blob/main/docs/api-android/README.md).

## Shared application

Put application Cells and a Window factory in a shared `net10.0` G# library.
Desktop calls `Application.Run(window)`. Android returns the same Window from
`GooActivity.CreateWindow()`:

```csharp
using Android.App;
using Android.Content.PM;
using Goo.Android;

[Activity(MainLauncher = true, Exported = true,
    ConfigurationChanges = ConfigChanges.Orientation | ConfigChanges.ScreenSize
        | ConfigChanges.ScreenLayout | ConfigChanges.SmallestScreenSize
        | ConfigChanges.Density | ConfigChanges.KeyboardHidden)]
public sealed class MainActivity : GooActivity
{
    protected override Goo.Window CreateWindow() => MyApplication.CreateWindow();
}
```

Reference `Goo.Android` from a `net10.0-android` app. Set
`SupportedOSPlatformVersion` to `33`. Both hosts share the same control tree,
editor, renderer and assets.

## Activation

```csharp
private static bool subscribed;

protected override Goo.Window CreateWindow()
{
    if (!subscribed)
    {
        Goo.Application.Activated += activation =>
            Android.Util.Log.Info("Goo", activation.Kind.ToString());
        subscribed = true;
    }
    return MyApplication.CreateWindow();
}
```

| Android input | Goo activation | Data |
| --- | --- | --- |
| `Goo.Android.Notification` action | `Notification` | `Goo.NotificationId`, `Goo.ActionId`, `Goo.Payload` extras |
| Launcher | `Launch` | None |
| Data URI other than `content:` or `file:` | `OpenUri` | `Target` |
| `content:`, `file:`, or ClipData URIs | `OpenDocuments` | `Documents`, in source order |

- Register once before `CreateWindow()` returns.
- Cold launch and `OnNewIntent` use the same UI-thread event.
- `IsInitial` marks the first process launch. Activity recreation does not replay the old Intent.
- Override `OnNewIntent` only if needed. Call base, then read `LastActivationStatus` for queue or size failures.
- The starter uses SingleTop. Add your app's URI filters and MIME types to its manifest.
- Open document URIs with `ContentResolver`, not file paths.
- Android owns URI grants. Use `TakePersistableUriPermission` only when the sender offers it.
- Copy data before a temporary URI grant expires.

## Device requirements

- Android 13 / API 33 or newer, with a Vulkan 1.3 implementation and Goo's
  required Vulkan features and identity presentation transform. Android API level alone does not establish GPU
  support.
- ARM64 phones and tablets use `android-arm64`. x64 emulators use `android-x64`.
- A Vulkan-capable emulator is required. Query its actual device support with
  `adb shell cmd gpu vkjson` before testing.
- Declare the required Vulkan version in the app manifest:

```xml
<uses-feature android:name="android.hardware.vulkan.version"
              android:version="0x00403000" android:required="true" />
<uses-feature android:name="android.hardware.vulkan.level"
              android:version="1" android:required="true" />
```

The API requirement follows the [Android Vulkan support table](https://developer.android.com/games/develop/vulkan/native-engine-support).
Native payloads support [16 KB page alignment](https://developer.android.com/guide/practices/page-sizes).

## View and lifecycle ownership

`GooActivity` owns a `GooView` and forwards pause, resume, and destruction.
Native layout applies system bar, display cutout, and keyboard insets before
sizing the SurfaceView. Framebuffer and input coordinates share that content rectangle.

In a native activity, construct `new GooView(context, window)` on the Android
main thread. Add it to the native layout and call `Pause()`, `Resume()`, and
`Dispose()` from the matching activity callbacks. Size it inside safe and keyboard
insets. Do not call `Application.Run(window)` or `Window.Pump()` or attach the Window to another view.

Surface replacement keeps the Window and mounted Cells. Activity destruction
closes the Window. Store process-recreation data in app state.

### Activity state restoration

```csharp
private string draft = "";

protected override Goo.Window CreateWindow()
{
    draft = SavedInstanceState?.GetString("draft") ?? "";
    return new Goo.Window
    {
        Root = new Goo.TextEntry { Value = draft, OnChange = value => draft = value }
    };
}

protected override void OnSaveInstanceState(Android.OS.Bundle outState)
{
    outState.PutString("draft", draft);
    base.OnSaveInstanceState(outState);
}
```

- `SavedInstanceState` holds Android's Bundle during `CreateWindow()`. It is null on a fresh launch.
- The app owns keys, serialization, versioning, and state restoration.
- Call base from `OnSaveInstanceState`. Goo does not serialize Cells or native resources.
- Store large or durable data outside the Bundle.
- Handled orientation and size changes keep the current tree.

### Frame scheduling

Choreographer schedules only on frame demand or the next animation/timer deadline.
Pause cancels frames and transient input. Resume resets the clock.
Use `HasFrameDemand` and `FrameDemandChanged` on the Android UI thread for host
frame-rate policy. The event reports demand changes, not each frame.

## Documents and URI streams

```csharp
var picked = await Documents.ShowPickerAsync(Goo.FileDialogKind.OpenFile);
if (picked.Status != Goo.FileDialogStatus.Success) return;
var opened = await Documents.OpenReadAsync(picked.Uris[0]);
if (opened.Status != DocumentStatus.Success) return;
await using var stream = opened.Stream!;
```

Use `GooActivity.Documents` on the Activity's main thread to launch a picker.
Documents stay as `content://` URIs, not filesystem paths.

| Operation | Contract |
| --- | --- |
| Open | MIME filters and optional multiple selection. The default requests Read access. |
| Save | Creates one new document. Supply one concrete MIME type and Write access. It is not an overwrite dialog. |
| Folder | Returns one tree URI. Open a child document URI to read its bytes. |
| Streams | `OpenReadAsync` and `OpenWriteAsync` open off the UI thread. The caller owns each successful stream. Writes replace and truncate contents. Later I/O uses normal .NET stream semantics. |
| Grants | `GrantedAccess` and `CanPersist` report returned flags. Call `PersistAccess` or `ReleaseAccess` on the main thread. Store URI values in app state. Persistence is never automatic. |
| Lifetime | Pause and surface loss keep the picker open. Cancellation or Activity destruction completes it with Cancelled. A replacement Activity does not restore an old task. |
| Failures | Stream and grant results distinguish Unsupported, Denied, NotFound, Cancelled and Failed. A failed stream result has no stream. |

## Input and keyboard policy

Touch IDs, mouse wheel, physical keys, focus, clipboard, UTF-16 selection,
composition, and semantic editor commands use shared Goo input. Stale IME
connections cannot edit a different focused field. Password fields suppress
surrounding and extracted text returned to the IME.

Each Android move event updates all contact positions before gesture recognition.
An accepted gesture receives one coherent update per move event.

```gsharp
TextEntry{
    InputOptions: TextInputOptions{
        Purpose: InputPurpose.Email,
        EnterAction: EnterAction.Next,
        AutofillHints: []string{"emailAddress"},
    },
}
```

- Works with `TextEntry.InputOptions` and `TextEditor.InputOptions`.
- Android maps hints to `EditorInfo` and focused-field autofill.
- Autofill replaces the focused value. This is not a multi-field autofill form.
- Hints do not validate input.
- Without options, entries request Done and multiline editors request None.
- `InputPurpose.Password` masks TextEntry like `Password: true`. Use TextEntry for protected values.
- Desktop ignores other keyboard and autofill hints.

`GooView.DismissKeyboardOnSubmit` defaults to `true`. IME Done sends Submit and
hides the keyboard. Set it to `false` to keep the keyboard open after Submit.
Focus changes and lifecycle handling still control text input. Next and Previous
move focus.

Android owns physical key repeat timing. GooView dispatches each native key-down,
including repeats, and releases its mapped Goo key before returning.
A missing key-up cannot leave Goo repeat active. Mapped key-up events are consumed
without another edit. Each key-down commits printable characters unless Ctrl or
Alt is pressed.

## Accessibility

```gsharp
TextEntry{ Accessibility: Accessibility{ Name: "Name" } }
```

- `GooView` exposes Goo semantics as Android virtual accessibility nodes.
- The bridge runs when an Android accessibility service is active.
- Give custom controls a role, name, state and supported actions through `Accessibility`.
- Text, password masks, selection and editing use the shared Goo action path.
- `GooView` owns `Window.AccessibilityAdapter`. Leave the slot empty before construction.
- Enable TalkBack in Android settings. No app permission or extra package is needed.
- Reading focus does not take keyboard focus or open the keyboard.
- Touch exploration uses Goo stacking, transforms and clipping.
- Surface replacement keeps virtual IDs and clears reading focus.
- The virtual subtree is available after the replacement presentation updates.
- Text, selection, scroll and state changes send events for the changed nodes.
- Root, native geometry and Surface changes refresh the host subtree.
- `Accessibility.Live` sets polite or assertive live-region behavior.
- Atomic regions send their full current text. Resume does not replay old announcements.

Before release, record the Android and TalkBack versions and check:

| Check | Expected result |
| --- | --- |
| Explore by touch and swipe | Correct control name, role, state and order. No canvas stop. |
| Double-tap controls | One action. Text entry opens the keyboard. |
| Read and select mixed-direction text | Whole characters and correct selection. |
| Edit a password | No document text in speech. |
| Change a live region | Correct polite or assertive speech. Atomic regions read the whole update. |
| Scroll, rotate, background and resume | Correct bounds. No stale focus or repeated live update. |
| Disable or remove controls, then replace the Surface | No stale nodes or focus. Navigation, editing, and activation still work. |

## Native popup surfaces

```gsharp
using let popup = PopupWindow(window, TooltipCell{}, PopupKind.Tooltip)
let result = popup.Open(anchor.BorderBox, 240, 120, PortalPlacement.BottomStart)
```

- Uses Android `PopupWindow` with a separate GooView and Vulkan surface.
- A menu receives focus and dismisses on Back or outside input. A tooltip receives no input.
- Coordinates use owner-content layout units. Size follows the owner's UiScale and display density.
- The native window may extend beyond its owner view. Android clips it to the app's display bounds.
- Pause, surface loss, view detach and owner disposal dismiss the popup chain.
- A missing live owner view returns `Unsupported`. Native window failure returns `Failed`.
- Portal and widgets Menu keep their in-window behavior.

## Transparent surfaces

Set `Window.Transparent` before constructing GooView. It places a translucent
SurfaceView above native views, which show through transparent pixels.

Vulkan prefers premultiplied composite alpha. Android also allows inherited alpha
when exposed, because GooView configures premultiplied transparency.
Other embedded hosts default `EmbeddedWindowHost.AllowInheritedCompositeAlpha()`
to false. Override it only for the same compositor contract. Swapchain creation
fails without premultiplied or explicitly permitted inherited alpha.

## Assets and native payloads

Use `FontSource` and premultiplied RGBA `ImageSource`. Shared libraries can embed
font bytes with `EmbeddedResource` and register them on either platform.
Android `sans-serif` uses Roboto with generic Noto Sans fallback.
Goo.dll embeds Vulkan shaders, including in APKs. No extraction directory is needed.

Goo contains HarfBuzz and hb-gpu for both Android RIDs. `Goo.Android` source builds
create a native archive for project references. NuGet omits it and uses Goo's
payloads to avoid duplicate libraries. The renderer adds no SDL, Skia, OpenGL,
FreeType, or C++ runtime payload.

## Notifications

Reference `Goo.Android` and use `AndroidNotifications.Open(activity, options)`
on the owner's UI thread. Supply `ChannelId`, `ChannelName` and a drawable
`SmallIconResource`. The adapter supplies `POST_NOTIFICATIONS`.

- Request permission from an explicit user action. `ShowAsync` never requests it.
- Android controls channel importance and notification settings.
- Default clicks target the concrete `GooActivity` and use its shared activation event.
- Activity destruction closes the service and ends pending permission work.
- Accepted notifications and their `PendingIntent` routes survive service disposal.
- See [notification outcomes](https://github.com/obselate/goo/blob/main/docs/desktop-integration.md#notifications).
