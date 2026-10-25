# Goo templates

Install the package and create a Goo application:

```sh
dotnet new install Goo.Templates@0.18.0
dotnet new goo --name HelloGoo
cd HelloGoo
dotnet run
```

The generated project targets .NET 10, uses `Gsharp.NET.Sdk`, and references Goo 0.18.0. Use `--goo-version` to select another compatible Goo package version.

Images, gestures, native dialogs and menus, notifications, printing, rich text clipboard, spell checking, and desktop instance hosting are included in `Goo`.
Android printing and spell checking are included in `Goo.Android`. No separate feature packages are needed.

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
