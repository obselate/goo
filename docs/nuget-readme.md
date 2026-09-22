# Goo

[![CI status](https://img.shields.io/github/actions/workflow/status/obselate/goo/ci.yml?branch=main&style=flat-square&label=ci)](https://github.com/obselate/goo/actions/workflows/ci.yml)
[![NuGet version](https://img.shields.io/nuget/v/Goo?style=flat-square)](https://www.nuget.org/packages/Goo/)
[![MIT license](https://img.shields.io/github/license/obselate/goo?style=flat-square)](https://github.com/obselate/goo/blob/main/LICENSE)

A retained UI framework for G#, rendered directly with Vulkan.

Goo applications describe UI as ordinary G# objects. Goo retains mounted state, rebuilds only dirty `Cell` boundaries, lays out with Yoga, and renders through Vulkan 1.3.

## Quick start

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
compiler, SDL, or HarfBuzz installation is not required. Projects that add
custom `<GooShaderEffect>` source need the pinned Slang and Vulkan SDK tools.
Use the platform links in the
[custom shader setup](https://github.com/obselate/goo#custom-shaders), then set
`SLANG_SDK` and `VULKAN_SDK` or put `slangc` and `spirv-val` on `PATH`.

## Example

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

`Cell` owns local state. Event handlers invalidate their owning Cell automatically, so changing `count` rebuilds only this component.

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
  identity presentation support. Add the `Goo.Android` adapter to host the same
  Window and Cell application in an Android activity or native view.

## Further reading

- [API documentation](https://github.com/obselate/goo/tree/main/docs/api)
- [Android integration](https://github.com/obselate/goo/blob/main/docs/android.md)
- [DevTools](https://github.com/obselate/goo/tree/main/docs/devtools)
- [Shader effects](https://github.com/obselate/goo/blob/main/docs/api/rendering.md#apply-fragment-shaders-to-retained-elements)
- [Testing and verification](https://github.com/obselate/goo/blob/main/tests/README.md)
- [Contributing and source builds](https://github.com/obselate/goo/blob/main/CONTRIBUTING.md)
- [Release notes](https://github.com/obselate/goo/blob/main/CHANGELOG.md)
