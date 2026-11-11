# Goo

[![CI status](https://img.shields.io/github/actions/workflow/status/obselate/goo/ci.yml?branch=main&style=flat-square&label=ci)](https://github.com/obselate/goo/actions/workflows/ci.yml)
[![NuGet version](https://img.shields.io/nuget/v/Goo?style=flat-square)](https://www.nuget.org/packages/Goo/)
[![MIT license](https://img.shields.io/github/license/obselate/goo?style=flat-square)](https://github.com/obselate/goo/blob/main/LICENSE)

A retained .NET UI framework in G#, rendered with Vulkan.

## Quick start

Check [platform requirements](https://github.com/obselate/goo/blob/main/docs/platform-preflight.md), then:

```sh
dotnet new install Goo.Templates
dotnet tool install --global Goo.DevTools
dotnet new goo -n HelloGoo
cd HelloGoo
goo dev
```

The template restores the G# compiler from NuGet automatically.
The generated counter runs with hot reload. A separate SDL or HarfBuzz
installation is not required.

Custom `<GooShaderEffect>` source needs the
[shader tools](https://github.com/obselate/goo/blob/main/docs/platform-preflight.md#custom-shaders).


## Platforms

Runtime assets: `win-x64`, `linux-x64`, `osx-arm64`, `android-arm64` and `android-x64`.
See [platform preflight](https://github.com/obselate/goo/blob/main/docs/platform-preflight.md) for host requirements.

## Further reading

- [API documentation](https://github.com/obselate/goo/tree/main/docs/api)
- [Android integration](https://github.com/obselate/goo/blob/main/docs/android.md)
- [DevTools](https://github.com/obselate/goo/tree/main/docs/devtools)
- [Shader effects](https://github.com/obselate/goo/blob/main/docs/api/rendering.md#apply-fragment-shaders-to-retained-elements)
- [Release notes](https://github.com/obselate/goo/blob/main/CHANGELOG.md)
