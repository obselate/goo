# Goo graphical inspector

```sh
dotnet tool install --global Goo.DevTools --version 0.27.9
goo dev --project MyApp.gsproj --inspector
```

The inspector is bundled with the CLI in `Goo.DevTools`.

```sh
goo list
goo inspector --project MyApp.gsproj
goo inspector --pid 12345 --window main
goo inspector --help
```

One matching window is selected automatically. Several matches fail with a list. Use `--window`, `--pipe` or `--latest` to select one.

See the [DevTools guide](../../docs/devtools/README.md) and [development guide](../../docs/devtools/development.md).
