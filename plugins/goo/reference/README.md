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

### Create a NuGet app

Install the [.NET 10 SDK](https://dotnet.microsoft.com/download/dotnet/10.0)
and meet the [platform requirements](#platforms), then:

```sh
dotnet new install Goo.Templates@0.6.5

mkdir hello-goo
cd hello-goo
dotnet new goo
```

Replace `Program.gs` with the example below, then run:

```sh
dotnet run
```

The template restores the G# SDK and Goo package through NuGet. A separate G#
compiler, SDL, or HarfBuzz installation is not required. Apps that add custom
`<GooShaderEffect>` source need the pinned shader tools listed under
[custom shaders](#custom-shaders).

### Custom shaders

Goo includes the ShaderEffect build adapter and authoring modules. Install these
third-party tools only when the project contains `<GooShaderEffect>` items:

| Platform | Slang 2026.16 | Vulkan SDK 1.4.357.0 with `spirv-val` |
| --- | --- | --- |
| Linux x64 | [Download `.tar.gz`](https://github.com/shader-slang/slang/releases/download/v2026.16/slang-2026.16-linux-x86_64-glibc-2.27.tar.gz) | [Download `.tar.xz`](https://sdk.lunarg.com/sdk/download/1.4.357.0/linux/vulkan_sdk.tar.xz) |
| Windows x64 | [Download `.zip`](https://github.com/shader-slang/slang/releases/download/v2026.16/slang-2026.16-windows-x86_64.zip) | [Download installer](https://sdk.lunarg.com/sdk/download/1.4.357.0/windows/vulkan_sdk.exe) |
| macOS arm64 | [Download `.tar.gz`](https://github.com/shader-slang/slang/releases/download/v2026.16/slang-2026.16-macos-aarch64.tar.gz) | [Download `.zip`](https://sdk.lunarg.com/sdk/download/1.4.357.0/mac/vulkan_sdk.zip) |

Set `SLANG_SDK` and `VULKAN_SDK` to the extracted or installed SDK roots. Goo
also accepts `slangc` and `spirv-val` on `PATH`.

### Build the source Gallery

The Gallery lets you try Goo's controls, layout, animation, drag and drop,
and shaders. Install .NET 10 SDK 10.0.401 and Git. Then download both pinned
[custom shader tools](#custom-shaders) for your platform and set their SDK
environment variables. The Gallery compiles its shaders during the build.

```sh
git clone https://github.com/obselate/goo.git
cd goo
./bootstrap.sh
dotnet run --project apps/Goo.Gallery/Goo.Gallery.gsproj -c Release
```

On Windows:

```bat
git clone https://github.com/obselate/goo.git
cd goo
bootstrap.bat
dotnet run --project apps/Goo.Gallery/Goo.Gallery.gsproj -c Release
```

The bootstrap builds the pinned G# compiler and formatter, then downloads the
released Goo package for the Gallery's native runtime files. It does not install
software globally.

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
| [Goo.DevTools](https://www.nuget.org/packages/Goo.DevTools/) | [Launch, attach, and capture](docs/devtools/README.md) with the `goo` CLI | `dotnet tool install --global Goo.DevTools` |
| [Goo.DevTools.App](https://www.nuget.org/packages/Goo.DevTools.App/) | [Graphical inspector](apps/Goo.DevTools/README.md), launched with `goo-devtools` | `dotnet tool install --global Goo.DevTools.App` |
| [Goo.Templates](https://www.nuget.org/packages/Goo.Templates/) | [Create starter projects](templates/Goo.Templates/README.md) with `dotnet new goo` | `dotnet new install Goo.Templates` |

Add library packages from your application directory. Install both DevTools
packages to launch the graphical inspector with `goo dev --inspector`.

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

- Android requires Android 13 (API 33) or newer and a Vulkan 1.3 device with
  identity presentation support. The `Goo.Android` adapter hosts the same
  application in an Android activity or native view. See
  [Android integration](docs/android.md).

## Further reading

- [API documentation](https://github.com/obselate/goo/tree/main/docs/api)
- [DevTools](https://github.com/obselate/goo/tree/main/docs/devtools)
- [Goo agent plugin for Codex and OMP](plugins/goo/README.md)
- [Shader effects](https://github.com/obselate/goo/blob/main/docs/api/rendering.md#apply-fragment-shaders-to-retained-elements)
- [Testing and verification](https://github.com/obselate/goo/blob/main/tests/README.md)
- [Contributing and source builds](https://github.com/obselate/goo/blob/main/CONTRIBUTING.md)
- [Release notes](https://github.com/obselate/goo/blob/main/CHANGELOG.md)
