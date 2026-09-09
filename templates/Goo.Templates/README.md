# Goo templates

Install the package and create a Goo application:

```sh
dotnet new install Goo.Templates@0.5.2
dotnet new goo --name HelloGoo
cd HelloGoo
dotnet run
```

The generated project targets .NET 10, uses `Gsharp.NET.Sdk`, and references Goo 0.5.2. Use `--goo-version` to select another compatible Goo package version.

The package is MIT licensed.
