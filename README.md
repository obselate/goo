<p align="center">
  <img src="https://raw.githubusercontent.com/obselate/goo/main/docs/assets/goo-readme-banner.gif" alt="Goo" width="1200">
</p>

<p align="center">A retained UI framework for G#, rendered directly with Vulkan.</p>

<p align="center">
  <a href="https://github.com/obselate/goo/actions/workflows/ci.yml"><img src="https://img.shields.io/github/actions/workflow/status/obselate/goo/ci.yml?branch=main&amp;style=flat-square&amp;label=ci" alt="CI status"></a>
  <a href="https://www.nuget.org/packages/Goo/"><img src="https://img.shields.io/nuget/v/Goo?style=flat-square" alt="NuGet version"></a>
  <a href="https://github.com/obselate/goo/blob/main/LICENSE"><img src="https://img.shields.io/github/license/obselate/goo?style=flat-square" alt="MIT license"></a>
</p>

Goo applications describe UI as ordinary G# objects. Goo retains mounted state, rebuilds only dirty `Cell` boundaries, lays out with Yoga, and renders through Vulkan 1.3.

## Quick start

### Create an app

Install the [.NET 10 SDK](https://dotnet.microsoft.com/download/dotnet/10.0)
and meet the [platform requirements](#platforms), then:

```sh
dotnet new install Goo.Templates@0.5.4

mkdir hello-goo
cd hello-goo
dotnet new goo
```

Replace `Program.gs` with the example below, then run:

```sh
dotnet run
```

The template restores the G# SDK and Goo package through NuGet. A separate G#
compiler, SDL, HarfBuzz, or shader compiler installation is not required for
this starter application.

### Build and run Goo Gallery

The Gallery lets you try Goo's controls, layout, animation, drag and drop,
and shaders. Install .NET 10, Git, and the
[source-build shader tools](https://github.com/obselate/goo/blob/main/CONTRIBUTING.md#source-setup):
Slang 2026.16 and Vulkan SDK 1.4.357.0. Set `SLANG_SDK` and `VULKAN_SDK`
to their SDK roots. The Gallery compiles its own shaders during the build.

```sh
git clone https://github.com/obselate/goo.git
cd goo
python3 .github/scripts/bootstrap-gsharp.py artifacts/gsharp
```

Download [Goo.0.5.4.nupkg](https://github.com/obselate/goo/releases/download/v0.5.4/Goo.0.5.4.nupkg)
and extract it as a ZIP archive into `artifacts/gallery-native` inside the
checkout. This supplies the released native libraries without compiling them
yourself. Keep the archive's directory structure intact.

From the checkout root, use the command for your platform. `dotnet run` builds
the Gallery in Release mode and opens it.

**Linux x64 (Wayland):**

```sh
dotnet run --project apps/Goo.Gallery/Goo.Gallery.gsproj -c Release -p:GooLinuxSdlPath="$PWD/artifacts/gallery-native/runtimes/linux-x64/native/libSDL3.so"
```

**Windows x64 (PowerShell):**

```powershell
dotnet run --project apps/Goo.Gallery/Goo.Gallery.gsproj -c Release -p:GooWindowsSdlPath="$PWD/artifacts/gallery-native/runtimes/win-x64/native/SDL3.dll"
```

**macOS arm64:**

```sh
dotnet run --project apps/Goo.Gallery/Goo.Gallery.gsproj -c Release -p:GooMacOsArm64NativeRoot="$PWD/artifacts/gallery-native/runtimes/osx-arm64/native"
```

Open **Surfaces > Fridge** to try drag and drop, or **Shaders** for the shader
examples. Apple silicon users can also download the prebuilt Gallery and its
installer from the [latest release](https://github.com/obselate/goo/releases/latest).

## Packages

`Goo` is the framework package referenced by your application. The other packages
are optional and installed separately. The starter template already references
`Goo`.

| Package | Purpose | Install |
| --- | --- | --- |
| [Goo](https://www.nuget.org/packages/Goo/) | UI framework, renderer, and native runtime assets | `dotnet add package Goo` |
| [Goo.Svg](https://www.nuget.org/packages/Goo.Svg/) | [Load SVG files at runtime](Goo.Svg/README.md) | `dotnet add package Goo.Svg` |
| [Goo.SvgCompiler](https://www.nuget.org/packages/Goo.SvgCompiler/) | [Compile SVG assets](tools/Goo.SvgCompiler/README.md) with `goo-svgc` | `dotnet tool install --global Goo.SvgCompiler` |
| [Goo.DevTools](https://www.nuget.org/packages/Goo.DevTools/) | [Launch, attach, and capture](docs/devtools/README.md) with the `goo` CLI | `dotnet tool install --global Goo.DevTools` |
| [Goo.Templates](https://www.nuget.org/packages/Goo.Templates/) | [Create starter projects](templates/Goo.Templates/README.md) with `dotnet new goo` | `dotnet new install Goo.Templates` |

Add library packages from your application directory. Use the DevTools CLI to
launch, discover, inspect, and capture applications.
Precompiled SVG assets can be loaded by core `Goo` without `Goo.Svg`.

## Example

This example runs with the starter above. Goo supplies the upstream G# compiler
needed for direct child composition automatically.

```gsharp
package CounterApp

import Goo

class Counter : Cell {
    private var count int32

    override func Build() Blob -> Container{
        Width: Length.Percent(100),
        Height: Length.Percent(100),
        Padding: 24,
        Gap: 12,
        BackgroundColor: Color.Rgb(24, 31, 43),
        Text{Content: "Count: $count", FontSize: 24, Color: Color.White},
        Button{
            Padding: 10,
            BorderRadius: 10,
            BackgroundColor: Color.Rgb(74, 125, 255),
            OnClick: () -> {
                count++
            },
            Text{Content: "Add one", Color: Color.White},
        },
    }
}

func Main() {
    Window.ConfigureApplication("Goo starter", "1.0.0", "com.example.goostarter")
    Window{Title: "Goo starter", Width: 360, Height: 220, Root: Counter{}}.Run()
}
```

`Cell` owns local state. Input callbacks automatically rebuild their owning Cell,
so the button only changes `count`. Ordinary G# interpolation formats the label.
Direct children and spreads use `Add` in source order; no child-list wrapper or
builder API is needed. See the [native authoring guide](docs/native-authoring.md)
for composition, typed Cell inputs, and current language conventions.

`Style.BasedOn` applies declarations at its exact position; later overrides win.
`Virtual` uses fixed item extents. `VirtualRows` measures varying row heights and
preserves stable-key scroll positions as content changes.

## Platforms

Goo ships runtime assets for Windows x64, Linux x64, macOS arm64, Android ARM64,
and Android x64. The
renderer requires the Vulkan 1.3 feature set used by Goo.

- Windows x64 is tested on Windows 11 with current vendor Vulkan drivers. The
  minimum supported Windows version is not yet established.
- Linux x64 requires Linux 6.6 or newer, glibc 2.27 or newer, a native Wayland
  1.18 or newer session, and a TrueType or OpenType sans-serif font. X11 and
  XWayland are not supported.
- macOS arm64 requires macOS 14 or newer on Apple silicon. Goo bundles
  MoltenVK 1.4.2 and selects installed Apple system fonts without requiring a
  Vulkan SDK.

- Android requires Android 13 (API 33) or newer and a Vulkan 1.3 device. The
  `Goo.Android` adapter hosts the same Window, Cell, and Blob application in an
  Android activity or native view. See [Android integration](docs/android.md)
  for the shared smoke app, NDK builds, packaging, and lifecycle checks.

## Further reading

- [API documentation](https://github.com/obselate/goo/tree/main/docs/api)
- [DevTools](https://github.com/obselate/goo/tree/main/docs/devtools)
- [Shader effects](https://github.com/obselate/goo/blob/main/docs/api/rendering.md#apply-fragment-shaders-to-retained-elements)
- [Testing and verification](https://github.com/obselate/goo/blob/main/tests/README.md)
- [Contributing and source builds](https://github.com/obselate/goo/blob/main/CONTRIBUTING.md)
- [Release notes](https://github.com/obselate/goo/blob/main/CHANGELOG.md)
