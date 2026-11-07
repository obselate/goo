<p align="center">
  <img src="https://raw.githubusercontent.com/obselate/goo/main/docs/assets/goo-readme-banner.gif" alt="Goo" width="1200">
</p>

A retained .NET GUI framework in [G#](https://github.com/DavidObando/gsharp), rendered with Vulkan.

[![CI](https://img.shields.io/github/actions/workflow/status/obselate/goo/ci.yml?branch=main)](https://github.com/obselate/goo/actions/workflows/ci.yml) [![NuGet](https://img.shields.io/nuget/v/Goo)](https://www.nuget.org/packages/Goo/) [![MIT](https://img.shields.io/github/license/obselate/goo)](LICENSE)

## Use

Requires [.NET SDK 10.0.403+](https://dotnet.microsoft.com/download/dotnet/10.0), Vulkan 1.3 and native Wayland on Linux. [Platform requirements](docs/platform-preflight.md).

```sh
dotnet new install Goo.Templates
dotnet tool install --global Goo.DevTools
dotnet new goo -n HelloGoo
cd HelloGoo
goo dev
```

## Example

```gsharp
package GooStarter

import Goo

class Counter : Cell {
    private var count int32

    override func Build() Blob -> Container{
        Width: Percent(100),
        Text{Content: "Count: $count"},
        Button{
            OnClick: () -> { count++ },
            Text{Content: "Add one"},
        },
    }
}

func Main() {
    Window.ConfigureApplication("Goo starter", "1.0.0", "com.example.goostarter")
    Window{Title: "Goo starter", Width: 360, Height: 220, Root: Counter{}}.Run()
}
```

## Build from source

```sh
git clone https://github.com/obselate/goo.git
cd goo
dotnet run --project tools/Goo.Repo -- build
```

[Contributing](CONTRIBUTING.md)

## AI plugin

- Codex: `codex plugin marketplace add obselate/goo && codex plugin add goo@obselate-goo`
- OMP, from the source checkout: `omp plugin link ./plugins/goo`

[Docs](docs/README.md) · [API reference](docs/api/README.md) · [License](LICENSE)
