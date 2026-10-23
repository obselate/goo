# Goo templates

Install the package and create a Goo application:

```sh
dotnet new install Goo.Templates@0.8.1
dotnet new goo --name HelloGoo
cd HelloGoo
dotnet run
```

The generated project targets .NET 10, uses `Gsharp.NET.Sdk`, and references Goo 0.8.1. Use `--goo-version` to select another compatible Goo package version.

## Android

```sh
dotnet new goo-android --name HelloGoo --application-id com.example.hellogoo
dotnet build HelloGoo/HelloGoo.csproj -c Release
```

- Install the .NET Android workload and its supported Android SDK and JDK.
- Includes an Activity, a Vulkan manifest, and a shared G# library.
- Requires API 33 and a compatible Vulkan 1.3 device.
- Use `--goo-version` to select a release that contains `Goo.Android`.

The package is MIT licensed.
