# Android integration

Goo uses the same retained UI and Vulkan renderer on desktop and Android. Put
application Cells and a Window factory in a shared `net10.0` G# library. The
desktop entry point calls `window.Run()`. The Android entry point returns that
same Window from `GooActivity.CreateWindow()`.

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

Reference `Goo.Android` from a `net10.0-android` application and set
`SupportedOSPlatformVersion` to `33`. Use Android RIDs `android-arm64` and
`android-x64`. The host translates Android events into Goo's shared
`EmbeddedWindowHost` and `PlatformInput` contracts. Applications do not author a
second control tree, text editor, renderer, or asset API.
The sample handles orientation and size changes in the existing activity. Goo
receives a resized viewport while its retained Cells stay mounted.

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

`GooActivity` owns a `GooView` and forwards pause, resume, and destruction. Its
native layout applies system bar, display cutout, and keyboard insets before
sizing the SurfaceView. The framebuffer and input coordinates therefore cover
the same content rectangle.

For integration into an existing native activity, construct
`new GooView(context, window)` on the Android main thread, add it to the native
layout, and call its `Pause()`, `Resume()`, and `Dispose()` from the matching
activity callbacks. The native layout must size the view inside any required
safe or keyboard insets. Do not call `Window.Run()` or `Window.Pump()` for that
Window. Do not share an attached Window between views.

The view retains one ANativeWindow reference while the Surface exists. Surface
destruction detaches and drains Vulkan presentation before releasing that
reference. A replacement Surface attaches to the same Window and mounted Cells.
Full activity destruction closes that Window. Apps that need process or activity
recreation persistence keep their data in their normal application state owner.

Choreographer runs frames only on demand or at Goo's next animation/timer
deadline. Pause cancels scheduling and transient input. Resume resets the frame
clock.

`GooView.HasFrameDemand` is true while a Choreographer frame is pending or the
renderer needs another immediate frame. `FrameDemandChanged` reports changes
to that value on the Android UI thread. Read the property for the current
value, then use the event to update native frame-rate hints or other host
policy. A future animation/timer deadline leaves immediate demand false until
the frame is scheduled. Pause, surface destruction, view detachment, and
disposal cancel pending frames and clear demand. The event reports demand
transitions, not every presented frame.

## Input and keyboard policy

Touch IDs, mouse wheel, physical keys, focus, clipboard, UTF-16 selection,
composition, and semantic editor commands use shared Goo input. Stale IME
connections cannot edit a different focused field. Password fields suppress
surrounding and extracted text returned to the IME.

`GooView.DismissKeyboardOnSubmit` defaults to `true`: the IME Done action sends
the shared Submit command and hides the software keyboard. Set the property to
`false` for a composer that should keep the keyboard open after submission.
Submit still runs, and normal focus changes and lifecycle handling still
control text input. Next and Previous actions continue to move focus.

Android owns physical key repeat timing. GooView dispatches each native key-down
event, including repeat events, and releases its mapped Goo key before the
callback returns. A missing native key-up therefore cannot leave Goo's repeat
state active or cause a command such as Backspace to repeat indefinitely.
Mapped key-up events are consumed without issuing another edit. Printable
characters are committed from each native key-down when Ctrl and Alt are not
pressed.

## Transparent surfaces

Set `Window.Transparent` before constructing GooView. A transparent window uses
a translucent SurfaceView placed above the native view hierarchy, allowing
native content beneath it to show through transparent pixels.

Vulkan presentation prefers premultiplied composite alpha. Android also permits
inherited composite alpha when the surface exposes that mode, because GooView
has configured the native compositor for premultiplied transparency. Other
embedded hosts keep `EmbeddedWindowHost.AllowInheritedCompositeAlpha()` false
by default; override it only when their native compositor provides that same
contract. Transparent windows fail swapchain creation if neither a premultiplied
mode nor explicitly permitted inherited mode is available.

## Assets and native payloads

Use existing `FontSource` and premultiplied RGBA `ImageSource` APIs. A shared
library can embed a font with `EmbeddedResource`, read its bytes, and register a
FontSource on either platform. Android system `sans-serif` resolves to the
platform's Roboto font with generic Noto Sans fallback. The shared Vulkan shader
loader reads published files when present and otherwise reads the same shaders
embedded in Goo.dll, including within an APK. No extraction directory is needed.

The main Goo package contains HarfBuzz and hb-gpu for both Android RIDs.
The `Goo.Android` source build creates a native archive for project references.
Its NuGet package omits that archive and uses Goo's native payloads, which prevents
duplicate libraries. No SDL, Skia, OpenGL, FreeType, or C++
runtime payload is added for the Android renderer.

Build the pinned HarfBuzz 14.3.1 libraries on Linux with Android NDK
`27.2.12479018`, Meson, Ninja, Python 3, and the normal archive tools:

```sh
bash .github/scripts/build-text-native-android.sh android-arm64 Goo/Runtime/Vulkan/android-arm64 "$ANDROID_NDK_HOME"
bash .github/scripts/build-text-native-android.sh android-x64 Goo/Runtime/Vulkan/android-x64 "$ANDROID_NDK_HOME"
```

The script verifies the source archive and patch hashes, target ABI, required
exports, private SONAMEs, dependencies, and page alignment. It writes
`text-native-build.json` beside each payload. CI rebuilds each ABI twice and
compares all bytes before building the Release smoke packages.

## Shared smoke app

`tests/Goo.AndroidSmoke.Shared` contains one G# Cell scene with a packaged font,
system text, retained counter, image, text entry, password entry, multiline editor,
and scroll container. Both entry projects reference that library.

```sh
dotnet run --project tests/Goo.AndroidSmoke.Desktop/Goo.AndroidSmoke.Desktop.gsproj -c Release
dotnet build tests/Goo.AndroidSmoke/Goo.AndroidSmoke.csproj -c Release -p:AndroidSdkDirectory="$ANDROID_HOME" -p:JavaSdkDirectory="$JAVA_HOME"
python3 .github/scripts/validate-android-package.py tests/Goo.AndroidSmoke/bin/Release/net10.0-android/org.goo.androidsmoke-Signed.apk
python3 .github/scripts/validate-android-package.py tests/Goo.AndroidSmoke/bin/Release/net10.0-android/org.goo.androidsmoke.aab
"$ANDROID_HOME/build-tools/36.0.0/zipalign" -c -P 16 -v 4 tests/Goo.AndroidSmoke/bin/Release/net10.0-android/org.goo.androidsmoke-Signed.apk
adb install -r tests/Goo.AndroidSmoke/bin/Release/net10.0-android/org.goo.androidsmoke-Signed.apk
adb shell monkey -p org.goo.androidsmoke 1
```

Run the deterministic input-connection checks after installation:

```sh
adb shell am start -S -a android.intent.action.MAIN -c android.intent.category.LAUNCHER -p org.goo.androidsmoke --ez goo.input_smoke true
adb logcat -d -s GooInputSmoke:I
```

Wait for the final `PASS` log after exercising text and composition cursors,
surrounding deletion, code points, context queries, batches, password privacy,
stale focus, and multiline input through the Android input connection. The
last checks leave a Backspace key-up absent and deliver explicit native repeat
events, then wait to verify that no additional deletion occurs.

The package checker verifies both ABI payloads against build provenance, checks
dependencies and page alignment, and rejects legacy native renderer libraries.
For a single-ABI build pass `--abi arm64-v8a` or `--abi x86_64`.
The separate `zipalign` check verifies 16 KB alignment within the installable APK.

On a compatible device, check first-frame text and image rendering, taps, touch
scrolling, keyboard entry, selection and composition, password privacy, rotation,
background/resume, and Surface destruction/recreation. Increment the counter
before recreating only the Surface and confirm that its value remains. API/ABI
and archive checks do not establish device rendering or input correctness.
