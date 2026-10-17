# Ship a desktop app

Create the [starter app](../README.md#quick-start) in a directory named `goo-ship`.
Check the [platform preflight](platform-preflight.md), then add SVG support:

```sh
dotnet add package Goo.Svg --version 0.7.35
```

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
See [SVG support and limits](../Goo.Svg/README.md).

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
It does not automatically embed app-owned assets. Trimming and single-file are
not validated release profiles for this sample.
