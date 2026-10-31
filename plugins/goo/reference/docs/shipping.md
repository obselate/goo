# Ship a desktop app

Create the [starter app](../README.md#quick-start) in `goo-ship`.
Run [platform preflight](platform-preflight.md). SVG is included in `Goo`.

Create `Assets/icon.svg`:

```xml
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32">
  <circle cx="16" cy="16" r="14" fill="#4a7dff" />
  <path d="M16 8v16M8 16h16" stroke="white" stroke-width="3" />
</svg>
```

Copy assets to build and publish output in the project's `ItemGroup`:

```xml
<Content Include="Assets/**/*" CopyToOutputDirectory="PreserveNewest" CopyToPublishDirectory="PreserveNewest" />
```

Import `Goo.Svg`, `System` and `System.IO`. Retain the asset in the starter's
`Counter` Cell, not inside `Build`:

```gsharp
private var icon VectorAsset = Svg.Load(Path.Combine(AppContext.BaseDirectory, "Assets", "icon.svg"))
```

Add `Container{Width: 32, Height: 32, icon.Render(),},` to the built container.
The base-directory lookup works independently of the caller's working directory.
See [SVG support and limits](svg.md).

## Publish

```sh
dotnet publish -c Release -r linux-x64 --self-contained true -o publish
```

Start `publish/goo_ship` from another directory to check asset lookup.
Distribute the whole publish directory, including `Assets`, native libraries and
licenses. Self-contained includes .NET, not GPU drivers, Wayland, fonts or OS libraries.

Publish on the target OS with `-r win-x64` for Windows x64 or `-r osx-arm64` for
Apple silicon. [NativeAOT is the preferred desktop release mode](../CONTRIBUTING.md#source-setup).
It does not automatically embed app-owned assets. Single-file publishing is not
validated for this sample.

## Android signed AAB

```sh
bash tools/Goo.DevTools.Cli/Packaging/fetch-bundletool.sh "$HOME/.cache/goo-android-tools"
export GOO_BUNDLETOOL="$HOME/.cache/goo-android-tools/bundletool-all-1.18.3.jar"
goo package --project App.Android.gsproj --target android --output artifacts/packages
```

Use an existing `net10.0-android` application with the pinned Android workload,
SDK and JDK. Put signing paths in a private MSBuild import or environment:

```xml
<PropertyGroup>
  <RuntimeIdentifiers>android-arm64;android-x64</RuntimeIdentifiers>
  <ApplicationVersion>1</ApplicationVersion>
  <AndroidKeyStore>true</AndroidKeyStore>
  <AndroidSigningKeyStore>/private/upload.keystore</AndroidSigningKeyStore>
  <AndroidSigningKeyAlias>upload</AndroidSigningKeyAlias>
  <AndroidSigningKeyPass>file:/private/key-password</AndroidSigningKeyPass>
  <AndroidSigningStorePass>file:/private/store-password</AndroidSigningStorePass>
</PropertyGroup>
```

- Create the upload key once with JDK `keytool`. Keep encrypted backups.
- Keep keys and passwords out of the repository and published files.
- Use `file:` password references. AAB signing does not support `env:` password references.
- Keep `ApplicationId` stable. Increase `ApplicationVersion` for each Play release.
- The command creates Release AAB only. It checks the bundle and upload certificate.
- The bundletool JAR is pinned to SHA-256 `a099cfa1543f55593bc2ed16a70a7c67fe54b1747bb7301f37fdfd6d91028e29`.
- AAB is not an installable APK. Use `bundletool build-apks` and `install-apks` for device checks.
- Check 16 KB alignment on the generated APK, not the AAB.
- Play App Signing uses a separate installed-app signing key. Configure it in Play Console.
- A locally signed APK cannot be assumed to update a Play-installed copy.
- Store uploads, key creation and device installation are separate operations.
- Keep signing logs private. Do not publish diagnostic build logs.

See [Android integration](https://github.com/obselate/goo/blob/40351bb35c5882849cea9623a27a0659592710df/docs/android.md) for device, Vulkan and native-library checks.

## macOS app and DMG

```sh
goo package --project MyApp.gsproj --target macos --output artifacts/packages
```

- Build on Apple silicon with the NativeAOT build tools.
- Set `Product`, numeric `Version`, `GooPackageId` and `GooPackageIcon`.
- Use an `.icns` icon. The bundle requires macOS 14 or later.
- Output includes `AssemblyName.app`, `Id-Version-osx-arm64.dmg` and symbols when present.
- Choose a new output directory if the app bundle already exists.
- Copy the app from the mounted DMG to Applications before launch.
- The app is ad-hoc signed. The DMG is not notarized.
- Gatekeeper can block downloaded copies. Use Apple's per-app **Open Anyway** control only for an app you trust.
- A managed Mac can prohibit this override. Do not disable Gatekeeper or remove quarantine.
- Developer ID, notarization and Intel Mac support are not included.

## Windows installer

```powershell
$env:GOO_ISCC = 'C:\Program Files\Inno Setup 7\ISCC.exe'
goo package --project MyApp.gsproj --target windows --output artifacts/packages
```

- Run on Windows x64 with Inno Setup 7.1.0 and the NativeAOT build tools.
- Set `Product`, `Version`, `Company`, `GooPackageId` and `GooPackageIcon` in the project.
- Use a `.ico` file for the Windows icon. Keep the ID stable across releases.
- Output is `Id-Version-win-x64-setup.exe`, plus a symbol archive when present.
- The installer uses the current user's Local AppData directory. It does not request elevation.
- It adds one Start Menu shortcut and an uninstaller. It keeps application data.
- Windows 11 x64 is required. No Windows Arm or Windows 10 support is implied.
- The installer is unsigned. SmartScreen can show **unknown publisher** or block the download.
- Signing, automatic updates and store uploads are not part of this command.

Fetch the pinned Inno Setup installer, then run it to install the compiler:

```powershell
.\tools\Goo.DevTools.Cli\Packaging\fetch-inno-setup.ps1 "$HOME\.cache\goo-inno"
```

The script checks SHA-256
`0362a383ed217d4c4239b5933866dd96d3eb2102737da92f80f6057a4b40df2f`.
It does not install the compiler. Check [Inno Setup's license](https://jrsoftware.org/isinfo.php)
for commercial use.

## Linux AppImage

The optional `Goo.DevTools` dotnet tool supplies `goo package`. It publishes
a Release, self-contained NativeAOT app and stages the complete output.
Build, run and publish defaults are unchanged. Requires Linux x64 and NativeAOT
build tools. Flatpak and X11 are not supported.

Set these properties in the application project:

```xml
<PropertyGroup>
  <Product>My App</Product>
  <Version>1.0.0</Version>
  <GooPackageId>org.example.myapp</GooPackageId>
  <GooPackageIcon>Assets/icon.png</GooPackageIcon>
</PropertyGroup>
```

Use a stable reverse-DNS ID with lowercase letters, digits, dots and hyphens,
a three-part numeric `Version`, and an `AssemblyName` containing only letters,
digits, dots, underscores and hyphens. The PNG icon path is relative to the project.
Assets and notices need `CopyToPublishDirectory` metadata. They remain beside the
executable, including XML data and nested directories.

Install the tool, then fetch the pinned AppImage creator and static type-2 runtime.
From a Goo source checkout:

```sh
bash tools/Goo.DevTools.Cli/Packaging/fetch-appimage-tools.sh "$HOME/.cache/goo-appimage"
export GOO_APPIMAGETOOL="$HOME/.cache/goo-appimage/appimagetool-x86_64.AppImage"
export GOO_APPIMAGE_RUNTIME="$HOME/.cache/goo-appimage/runtime-x86_64"
goo package --project MyApp.gsproj --target linux --output artifacts/packages
```

The fetch script also ships beside the installed tool DLL in `Packaging`.
It downloads fixed GitHub asset IDs and checks SHA-256 before making the creator
executable. Packaging rechecks the hashes and never downloads tools or a moving runtime.

| Input | SHA-256 |
| --- | --- |
| [appimagetool 1.9.1 asset 324406736](https://api.github.com/repos/AppImage/appimagetool/releases/assets/324406736) | `ed4ce84f0d9caff66f50bcca6ff6f35aae54ce8135408b3fa33abfc3cb384eb0` |
| [type-2 runtime asset 657374641](https://api.github.com/repos/AppImage/type2-runtime/releases/assets/657374641) | `617aa77314d57c8b8e4fae9c3f0b35af7b30d5529cb69e98f64f92510ed98a46` |

Output is `Id-Version-linux-x64.AppImage`, plus `.symbols.zip` when debug symbols
exist. Relative output paths use the project directory. `--json` reports paths
and unsigned status. Failures include `unsupported-target`, `missing-tool`,
`invalid-tool`, `invalid-package-metadata`, `publish-failed`, `stage-failed`
and `package-failed`.

Run the AppImage from another directory to check asset paths. The runtime does
not need a separate `libfuse2` install. If FUSE mounts are prohibited, use
`./MyApp.AppImage --appimage-extract-and-run`. The mounted app is read-only.
Keep writable application data outside the bundle.

AppImage adds no sandbox, updater, publisher certificate, desktop installation,
launchers, or file/URI associations. The host still needs supported glibc, native
Wayland, fonts, a Vulkan loader and GPU driver. Packaging does not expand platform
support. Include all application and dependency license notices, including those
for the embedded AppImage runtime.

## Publish presets

New starter apps include opt-in profiles in `Properties/PublishProfiles`.
Default `dotnet run` and `dotnet publish` behavior is unchanged.

```sh
dotnet publish -c Release -p:PublishProfile=NativeAot -o publish/aot
dotnet publish -c Release -p:PublishProfile=Trimmed -o publish/trimmed
```

Both profiles target `linux-x64` and include .NET. `NativeAot` compiles native code
for size. `Trimmed` keeps the runtime and removes unused code.
Publish on the target OS. Override with `-r win-x64` or `-r osx-arm64`, or change
the profile's `RuntimeIdentifier`. NativeAOT needs
[platform build tools](https://learn.microsoft.com/dotnet/core/deploying/native-aot/).
Check app and dependency trim/AOT warnings, then test the output.
Neither profile embeds app-owned assets.

Output size includes symbols and native payloads. Framework-dependent output
excludes the installed .NET runtime. Memory and output size depend on GPU drivers,
app content and host state, not just publish mode.
