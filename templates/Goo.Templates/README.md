# Goo templates

```sh
dotnet new install Goo.Templates
dotnet tool install --global Goo.DevTools
dotnet new goo -n HelloGoo
cd HelloGoo
goo dev
```

The template restores the G# compiler from NuGet. It references Goo 0.29.1.
Use `--goo-version` to select another compatible version.
See [platform requirements](https://github.com/obselate/goo/blob/main/docs/platform-preflight.md).

## Android

```sh
dotnet new goo-android --name HelloGoo --application-id com.example.hellogoo
dotnet build HelloGoo/HelloGoo.gsproj -c Release
```

- Install the .NET Android workload and its supported Android SDK and JDK.
- Includes an Activity, a Vulkan manifest, and a shared G# library.
- Requires API 33 and a compatible Vulkan 1.3 device.
- Use `--goo-version` to select a release that contains `Goo.Android`.

The package is MIT licensed.
