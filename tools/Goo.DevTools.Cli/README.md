# Goo DevTools

```sh
dotnet tool install --global Goo.DevTools --version 0.26.1
goo dev --project MyApp.gsproj --input --inspector
```

The package includes the `goo` CLI and graphical inspector. `goo dev` enables diagnostics and hot reload.

```sh
goo list
goo snapshot --project MyApp.gsproj
goo capture --project MyApp.gsproj --output frame.png
goo input click --project MyApp.gsproj --node-id 12
goo inspector --project MyApp.gsproj
goo help input
goo doctor --project MyApp.gsproj
```

Use a node ID from the selected snapshot. Several matching apps require a narrower selection or `--latest`.

See the [Goo DevTools guide](https://github.com/obselate/goo/blob/main/docs/devtools/README.md) and [CLI reference](https://github.com/obselate/goo/blob/main/docs/devtools/cli.md).
