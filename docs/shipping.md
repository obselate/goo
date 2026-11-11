# Ship a desktop app

## Publish

From an app created by `dotnet new goo`:

```sh
dotnet publish -c Release -r linux-x64 --self-contained true -o publish
```

Distribute the whole `publish` directory, including native libraries and licenses.
Self-contained includes .NET, not GPU drivers, Wayland, fonts or OS libraries.
Check [platform preflight](platform-preflight.md) on the target machine.
Publish on the target OS. Use `-r win-x64` for Windows x64 or `-r osx-arm64`
for Apple silicon.

## NativeAOT

```sh
dotnet publish -c Release -p:PublishProfile=NativeAot -o publish/aot
```

NativeAOT is the default release format used by this project.
The profile targets `linux-x64`. Override with `-r win-x64` or `-r osx-arm64`
on that OS. Install the [NativeAOT build tools](https://learn.microsoft.com/dotnet/core/deploying/native-aot/).
Review trim and AOT warnings, then test the output. App-owned assets are not embedded.

Trimmed JIT is also supported. It keeps the runtime:

```sh
dotnet publish -c Release -p:PublishProfile=Trimmed -o publish/trimmed
```

## Optional assets

Use an existing SVG asset such as `Assets/icon.svg`.

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

Publish again, then start `publish/HelloGoo` from another directory to check
asset lookup. Include `Assets` in the distributed output.
Single-file publishing is not validated for this sample.

## Packaging

Use `goo package` for the formats below. The command is included in `Goo.DevTools`.

| Shared setting | Contract |
| --- | --- |
| Metadata | Set `Product`, numeric `Version`, stable `GooPackageId` and `GooPackageIcon`. Windows also uses `Company`. |
| Output | Relative paths use the project directory. Desktop outputs include a symbol archive when symbols exist. `--json` reports output paths and unsigned status. |
| Assets | Use `CopyToPublishDirectory`. Keep notices and feature data, including XML and nested directories. |

The Goo package defaults NativeAOT apps to `IlcFoldIdenticalMethodBodies=true`.
Apps can override it. Identical methods can share addresses and stack-trace names.
Globalization remains an explicit setting. Apps that do not read dependency XML
docs can set `PublishReferencesDocumentationFiles=false`. Do not delete XML by name.

### Android signed AAB

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
- AAB is not an installable APK. Use `bundletool build-apks` and `install-apks` for device checks.
- Check 16 KB alignment on the generated APK, not the AAB.
- Play App Signing uses a separate installed-app signing key. Configure it in Play Console.
- A locally signed APK cannot be assumed to update a Play-installed copy.
- Store uploads, key creation and device installation are separate operations.
- Keep signing logs private. Do not publish diagnostic build logs.

See [Android integration](android.md) for device, Vulkan and native-library checks.

### macOS app and DMG

```sh
goo package --project MyApp.gsproj --target macos --output artifacts/packages
```

- Build on Apple silicon with the NativeAOT build tools.
- Use an `.icns` icon. The bundle requires macOS 14 or later.
- Output includes `AssemblyName.app` and `Id-Version-osx-arm64.dmg`.
- Choose a new output directory if the app bundle already exists.
- Copy the app from the mounted DMG to Applications before launch.

```xml
<ItemGroup>
  <GooPackageUrlScheme Include="blocknet" />
  <GooPackageDocumentType Include="wallet" />
</ItemGroup>
```

- These repeatable items apply only to `--target macos`. Other targets ignore them.
- URL schemes start with a letter, followed by letters, digits, `+`, `-` or `.`.
- Document types are nonempty file extensions without a dot or path separator.
- The URL type uses `GooPackageId` as its name. Each document type uses its extension as its name. Both use the `Viewer` role.
- The app is ad-hoc signed. The DMG is not notarized.
- Gatekeeper can block downloaded copies. Use Apple's per-app **Open Anyway** control only for an app you trust.
- A managed Mac can prohibit this override. Do not disable Gatekeeper or remove quarantine.
- Developer ID, notarization and Intel Mac support are not included.

### Windows installer

```powershell
$env:GOO_ISCC = 'C:\Program Files\Inno Setup 7\ISCC.exe'
goo package --project MyApp.gsproj --target windows --output artifacts/packages
```

- Run on Windows x64 with Inno Setup 7.1.0 and the NativeAOT build tools.
- Set `Company` in addition to the shared metadata.
- Use a `.ico` file for the Windows icon. Keep the ID stable across releases.
- Output is `Id-Version-win-x64-setup.exe`.
- The installer uses the current user's Local AppData directory. It does not request elevation.
- It adds one Start Menu shortcut and an uninstaller. It keeps application data.
- Windows 11 x64 is required. No Windows Arm or Windows 10 support is implied.
- The installer is unsigned. SmartScreen can show **unknown publisher** or block the download.
- Signing, automatic updates and store uploads are not part of this command.

Fetch the pinned Inno Setup installer, then run it to install the compiler:

```powershell
.\tools\Goo.DevTools.Cli\Packaging\fetch-inno-setup.ps1 "$HOME\.cache\goo-inno"
```

The [fetch script](../tools/Goo.DevTools.Cli/Packaging/fetch-inno-setup.ps1) verifies the pinned download.
It does not install the compiler. Check [Inno Setup's license](https://jrsoftware.org/isinfo.php)
for commercial use.

### Linux AppImage

`goo package` publishes a Release, self-contained NativeAOT app and stages
the complete output. It requires Linux x64 and NativeAOT build tools.
Flatpak and X11 are not supported.

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

Fetch the pinned AppImage creator and static type-2 runtime from a Goo source checkout:

```sh
bash tools/Goo.DevTools.Cli/Packaging/fetch-appimage-tools.sh "$HOME/.cache/goo-appimage"
export GOO_APPIMAGETOOL="$HOME/.cache/goo-appimage/appimagetool-x86_64.AppImage"
export GOO_APPIMAGE_RUNTIME="$HOME/.cache/goo-appimage/runtime-x86_64"
goo package --project MyApp.gsproj --target linux --output artifacts/packages
```

The fetch script also ships beside the installed tool DLL in `Packaging`.
It downloads fixed GitHub asset IDs and checks SHA-256 before making the creator
executable. Packaging rechecks the hashes and never downloads tools or a moving runtime.

Output is `Id-Version-linux-x64.AppImage`. Failures report unsupported targets,
missing or invalid tools, invalid metadata, publish, staging or packaging errors.

Run the AppImage from another directory to check asset paths. The runtime does
not need a separate `libfuse2` install. If FUSE mounts are prohibited, use
`./MyApp.AppImage --appimage-extract-and-run`. The mounted app is read-only.
Keep writable application data outside the bundle.

AppImage adds no sandbox, updater, publisher certificate, desktop installation,
launchers, or file/URI associations. The host still needs supported glibc, native
Wayland, fonts, a Vulkan loader and GPU driver. Packaging does not expand platform
support. Include all application and dependency license notices, including those
for the embedded AppImage runtime.

