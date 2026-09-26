<p align="center">
  <img src="https://raw.githubusercontent.com/obselate/goo/main/docs/assets/goo-readme-banner.gif" alt="Goo" width="1200">
</p>

<p align="center">A declarative retained GUI framework for .NET. Written in G# and rendered directly with Vulkan.</p>

<p align="center">
  <a href="https://github.com/obselate/goo/actions/workflows/ci.yml"><img src="https://img.shields.io/github/actions/workflow/status/obselate/goo/ci.yml?branch=main&amp;style=flat-square&amp;label=ci" alt="CI status"></a>
  <a href="https://www.nuget.org/packages/Goo/"><img src="https://img.shields.io/nuget/v/Goo?style=flat-square" alt="NuGet version"></a>
  <a href="https://github.com/obselate/goo/blob/main/LICENSE"><img src="https://img.shields.io/github/license/obselate/goo?style=flat-square" alt="MIT license"></a>
</p>

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

Run the provided Goo template app with

```sh
dotnet run
```

### Build the source Gallery

The Gallery gives you a representative preview of Goo's capabilities. 
Install .NET 10 SDK 10.0.401 and Git. Then download both pinned [custom shader tools](#custom-shaders) 
for your platform and set their SDK environment variables. 

The Gallery compiles its shaders during the build.

### On Linux:

```sh
git clone https://github.com/obselate/goo.git
cd goo
./bootstrap.sh
dotnet run --project apps/Goo.Gallery/Goo.Gallery.gsproj -c Release
```

### On Windows:

```bat
git clone https://github.com/obselate/goo.git
cd goo
bootstrap.bat
dotnet run --project apps/Goo.Gallery/Goo.Gallery.gsproj -c Release
```

The bootstrap builds the pinned G# compiler and formatter, then downloads the
released Goo package for the Gallery's native runtime files. It does not install
software globally.

### Run the Git workbench

The [Git workbench](apps/Goo.GitWorkbench/README.md) is a small Goo app for reviewing
changes and commits, staging files, and committing. It uses the published Goo package.
With .NET 10 and Git installed, run it from a clone of this repository:

```sh
dotnet run --project apps/Goo.GitWorkbench/Goo.GitWorkbench.gsproj -c Release -- /path/to/repo
```

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

## Goo Extras

Goo is built on a core that exposes APIs for the broadest cases. As a result, goo may
end up being verbose if written from core alone. The idea is that the core is the
"substrate" that other packages and libraries can be built on. For both convenience
and as a working example, there are a few published libraries that work with Goo:

| Package | Purpose | Install |
| --- | --- | --- |
| [Goo Widgets](https://github.com/obselate/goo-widgets/) | Pre-built UI widgets | `dotnet add package Goo.Widgets` |
| [Goo Animations](https://github.com/obselate/goo-animations/) | A library for Animation and Motion factories | `dotnet add package Goo.Animations` |

## Example

The Goo.Templates app:

```gsharp
package CounterApp

import Goo

class Counter : Cell {
    private var count int32

    override func Build() Blob -> Container{
        Width: Percent(100),
        Height: Percent(100),
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

Concepts that may be confusing at first:

`Blob` is a UI primitive. Goo core only contains UI primitives that have unique behavior
that cannot be satisfied with composition with the exception of the semantic `Button`.

`Cell` is a state management primitive. It encapsulates UI state, identity, and rebuild behaviors.
In the template app, input callbacks automatically rebuild their owning `Cell`, so the button only changes `count`.

UI elements can be composed and reused through ordinary functions and methods, with built-in overrides
for changing specific properties using `with`:

```gsharp
let baseButton = ActionButton{Height: 38.0, MinWidth: 112.0, OnClick: () -> { },}

let primaryButton = baseButton with{Content = "Primary",}

let successButton = baseButton with{
    Content = "Success",
    BackgroundColor = Color.Parse("#166534"),
    TextColor = Color.Parse("#fafafa"),
    HoverBackgroundColor = Color.Parse("#15803d"),
    ActiveBackgroundColor = Color.Parse("#14532d"),
}

let disabledButton = baseButton with{Content = "Disabled", Disabled = true,}
```

Direct children and spreads use `Add` in source order. 
See the [native authoring guide](docs/native-authoring.md) for composition, typed Cell inputs, and current language conventions.

## Platforms

Goo ships runtime assets for Windows x64, Linux x64, macOS arm64, Android ARM64,
and Android x64. The renderer requires the Vulkan 1.3 feature set used by Goo.

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

## Further reading

- [API documentation](https://github.com/obselate/goo/tree/main/docs/api)
- [DevTools](https://github.com/obselate/goo/tree/main/docs/devtools)
- [Goo agent plugin for Codex and OMP](plugins/goo/README.md)
- [Shader effects](https://github.com/obselate/goo/blob/main/docs/api/rendering.md#apply-fragment-shaders-to-retained-elements)
- [Testing and verification](https://github.com/obselate/goo/blob/main/tests/README.md)
- [Contributing and source builds](https://github.com/obselate/goo/blob/main/CONTRIBUTING.md)
- [Release notes](https://github.com/obselate/goo/blob/main/CHANGELOG.md)
