# Ship a desktop app

Create the [starter app](../README.md#quick-start) in a directory named `goo-ship`.
Check the [platform preflight](platform-preflight.md). SVG support is included in `Goo`.

Create `Assets/icon.svg`:

```xml
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32">
  <circle cx="16" cy="16" r="14" fill="#4a7dff" />
  <path d="M16 8v16M8 16h16" stroke="white" stroke-width="3" />
</svg>
```

Add this item to the project's `ItemGroup` to copy assets to build and publish output:

```xml
<Content Include="Assets/**/*" CopyToOutputDirectory="PreserveNewest" CopyToPublishDirectory="PreserveNewest" />
```

Import `Goo.Svg`, `System` and `System.IO` in `Program.gs`. Retain the asset as a
field in the starter's `Counter` Cell, rather than loading it inside `Build`:

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

Start `publish/goo_ship` from a different directory to check asset lookup.
The tested Linux self-contained output was about 93 MB. Distribute the whole
publish directory, including `Assets`, native libraries and license files.
Self-contained includes .NET, not GPU drivers, Wayland, system fonts or OS libraries.

Publish on the target OS with `-r win-x64` for Windows x64 or `-r osx-arm64` for
Apple silicon. [NativeAOT is the preferred desktop release mode](../CONTRIBUTING.md#source-setup).
It does not automatically embed app-owned assets. Single-file publishing is not
validated for this sample.

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

`goo package` is part of the optional `Goo.DevTools` dotnet tool. It publishes a
Release, self-contained NativeAOT app and stages the complete publish tree.
Normal build, run and publish behavior is unchanged. Packaging currently requires
Linux x64 and the NativeAOT build tools. No Flatpak or X11 support is added.

Set these properties in the application project:

```xml
<PropertyGroup>
  <Product>My App</Product>
  <Version>1.0.0</Version>
  <GooPackageId>org.example.myapp</GooPackageId>
  <GooPackageIcon>Assets/icon.png</GooPackageIcon>
</PropertyGroup>
```

Use a stable reverse-DNS ID with lowercase letters, digits, dots and hyphens.
`Version` must contain three numeric components. `AssemblyName` must be a portable
filename containing only letters, digits, dots, underscores and hyphens.
The icon must be an existing PNG, relative to the project directory.
App-owned assets and notices must already have `CopyToPublishDirectory` metadata.
They remain beside the executable, including XML data and nested directories.

Install the tool, then fetch the pinned AppImage creator and static type-2 runtime.
From a Goo source checkout:

```sh
bash tools/Goo.DevTools.Cli/Packaging/fetch-appimage-tools.sh "$HOME/.cache/goo-appimage"
export GOO_APPIMAGETOOL="$HOME/.cache/goo-appimage/appimagetool-x86_64.AppImage"
export GOO_APPIMAGE_RUNTIME="$HOME/.cache/goo-appimage/runtime-x86_64"
goo package --project MyApp.gsproj --target linux --output artifacts/packages
```

The fetch script is also shipped as `Packaging/fetch-appimage-tools.sh` beside the
installed tool DLL. It downloads fixed GitHub asset IDs and checks SHA-256 before
making the creator executable. Packaging checks the same hashes and never downloads
tools or a moving latest runtime itself.

| Input | SHA-256 |
| --- | --- |
| [appimagetool asset 610035789](https://api.github.com/repos/AppImage/appimagetool/releases/assets/610035789) | `95cbe7cce9717fce90c484e34052ee7c7f1d7635b33c12525b4776826a7d29b6` |
| [type-2 runtime asset 657374641](https://api.github.com/repos/AppImage/type2-runtime/releases/assets/657374641) | `617aa77314d57c8b8e4fae9c3f0b35af7b30d5529cb69e98f64f92510ed98a46` |

Output is `Id-Version-linux-x64.AppImage`, plus a `.symbols.zip` if the publish
contains debug symbols. A relative output path is relative to the project.
`--json` reports artifact paths and unsigned status. Expected failures include
`unsupported-target`, `missing-tool`, `invalid-tool`, `invalid-package-metadata`,
`publish-failed`, `stage-failed` and `package-failed`.

Run the AppImage from another directory to check asset paths. The runtime does
not need a separate `libfuse2` install. If FUSE mounts are prohibited, use
`./MyApp.AppImage --appimage-extract-and-run`. The mounted app is read-only.
Keep writable application data outside the bundle.

AppImage is not a sandbox, updater, publisher certificate or desktop installation
service. This command does not install launchers or file/URI associations.
The host still needs the supported glibc, native Wayland session, fonts, Vulkan
loader and GPU driver. Packaging does not expand Goo's platform requirements.
Keep all required application and dependency license notices in the published
content, including notices required for the embedded AppImage runtime.

## Publish presets

New starter apps include opt-in profiles in `Properties/PublishProfiles`.
Default `dotnet run` and `dotnet publish` behavior is unchanged.

```sh
dotnet publish -c Release -p:PublishProfile=NativeAot -o publish/aot
dotnet publish -c Release -p:PublishProfile=Trimmed -o publish/trimmed
```

Both profiles target `linux-x64` and include .NET. `NativeAot` compiles native code
with size optimization. `Trimmed` keeps the runtime and removes unused code.
Publish on the target OS. Override the RID with `-r win-x64` or `-r osx-arm64`,
or change `RuntimeIdentifier` in the profile. NativeAOT needs the
[platform build tools](https://learn.microsoft.com/dotnet/core/deploying/native-aot/).
Check trim and AOT warnings in your app and dependencies, then test the output.
Neither profile embeds app-owned assets.

Measured on the unmodified Goo 0.7.35 Linux x64 starter with .NET 10.0.12,
NVIDIA RTX 3080 and isolated virtual KWin:

| Publish mode | Output size | RSS |
|---|---:|---:|
| Default, framework-dependent | 25.77 MiB | 195.59 MiB |
| Trimmed, self-contained | 30.44 MiB | 183.02 MiB |
| NativeAOT, self-contained | 21.88 MiB | 155.23 MiB |

Output size is the sum of published file lengths, including symbols and native
payloads. Default output excludes the installed .NET runtime. RSS was read from
`smaps_rollup` five seconds after the first successful Vulkan present.
Trimming saved 12.57 MiB RSS and NativeAOT saved 40.37 MiB in this run.
Both publishes had no trim or AOT warnings. These are idle starter measurements,
not memory limits. GPU drivers, app content and host state affect the result.
