<p align="center">
  <img src="https://raw.githubusercontent.com/obselate/goo/main/docs/assets/goo-readme-banner.gif" alt="Goo" width="1200">
</p>

<p align="center">A retained desktop UI framework for G#, rendered directly with Vulkan.</p>

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
dotnet new install Goo.Templates@0.5.0

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
```

Download [Goo.0.5.0.nupkg](https://github.com/obselate/goo/releases/download/v0.5.0/Goo.0.5.0.nupkg)
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
| [Goo.DevTools.App](https://www.nuget.org/packages/Goo.DevTools.App/) | [Graphical inspector](apps/Goo.DevTools/README.md), launched with `goo-devtools` | `dotnet tool install --global Goo.DevTools.App` |
| [Goo.Templates](https://www.nuget.org/packages/Goo.Templates/) | [Create starter projects](templates/Goo.Templates/README.md) with `dotnet new goo` | `dotnet new install Goo.Templates` |

Add library packages from your application directory. Install both DevTools
packages to launch the graphical inspector with `goo dev --inspector`.
Precompiled SVG assets can be loaded by core `Goo` without `Goo.Svg`.

## Example

```gsharp
package CounterApp

import Goo

data struct CounterInput {
  var Title string
  var Accent Color
}

open class Counter : Cell[CounterInput] {
  shared {
    let Card Style = Style{
      Padding: 24,
      Gap: 12,
      BorderRadius: 16,
      BackgroundColor: Color.Rgb(24, 31, 43),
    }
    let Action Style = Style{
      Padding: 10,
      BorderRadius: 10,
    }
  }

  private var count int32

  protected override func Build(input CounterInput) Blob -> Container {
    BasedOn: Card,
    Width: Length.Percent(100),
    Height: Length.Percent(100),
    Children: {
      Text{
        Content: input.Title + ": " + count.ToString(),
        FontSize: 24,
        Color: Color.Rgb(244, 247, 255),
      },
      Button{
        BasedOn: Action,
        BackgroundColor: input.Accent,
        OnClick: () -> { count++ },
        Children: {
          Text{ Content: "Add one", Color: Color.White },
        },
      },
    },
  }
}

class App : Cell {
  override func Build() Blob -> Container { Children: {
    Cell.Mount[CounterInput, Counter]("counter", CounterInput{
      Title: "Count",
      Accent: Color.Rgb(74, 125, 255),
    }),
  } }
}

func Main() {
  Window.ConfigureApplication("Counter", "1.0.0", "com.example.counter")
  let window = Window{ Title: "Counter", Width: 320, Height: 180, Root: App{} }
  window.StateChanged += (state) -> {
    if state == WindowState.Maximized { window.Title = "Counter - maximized" }
  }
  window.Run()
}
```

`Cell[TInput].Build(input)` receives the current immutable input snapshot directly. Packaged typed Cells are `open class` declarations because G# requires that for protected overrides. The protected `Input` property exposes the same snapshot to callbacks and `ShouldRebuild`. Event handlers invalidate their owning Cell automatically, so changing `count` rebuilds only this component.

`Style.BasedOn` copies ordered declarations at its exact position. Later declarations such as the button's `BackgroundColor` win. Window notifications use native G# event authoring with `+=` and `-=`. Virtual collections now take explicit fixed item width and height so placement and scroll range do not depend on realized child measurement.

## Platforms

Goo ships runtime assets for Windows x64, Linux x64, and macOS arm64. The
renderer requires the Vulkan 1.3 feature set used by Goo.

- Windows x64 is tested on Windows 11 with current vendor Vulkan drivers. The
  minimum supported Windows version is not yet established.
- Linux x64 requires Linux 6.6 or newer, glibc 2.27 or newer, a native Wayland
  1.18 or newer session, and a TrueType or OpenType sans-serif font. X11 and
  XWayland are not supported.
- macOS arm64 requires macOS 14 or newer on Apple silicon. Goo bundles
  MoltenVK 1.4.2 and selects installed Apple system fonts without requiring a
  Vulkan SDK.

## Further reading

- [API documentation](https://github.com/obselate/goo/tree/main/docs/api)
- [DevTools](https://github.com/obselate/goo/tree/main/docs/devtools)
- [Shader effects](https://github.com/obselate/goo/blob/main/docs/api/rendering.md#apply-fragment-shaders-to-retained-elements)
- [Testing and verification](https://github.com/obselate/goo/blob/main/tests/README.md)
- [Contributing and source builds](https://github.com/obselate/goo/blob/main/CONTRIBUTING.md)
- [Release notes](https://github.com/obselate/goo/blob/main/CHANGELOG.md)
