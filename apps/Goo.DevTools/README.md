# Goo DevTools Inspector

`Goo.DevTools.App` installs the graphical inspector for local Goo applications. It is separate from the `Goo.DevTools` command-line tool.

## Install

```sh
dotnet tool install --global Goo.DevTools.App --version 0.5.1
```

## Use

Start your app with diagnostics enabled, as shown in the
[DevTools guide](../../docs/devtools/README.md#run-and-inspect-your-app), then open
the inspector to connect to the newest live target:

```sh
goo-devtools
```

Select a target or open the built-in sample data:

```sh
goo-devtools --pid 12345
goo-devtools --pipe "pipe-name"
goo-devtools --sample
```

Install the separate `Goo.DevTools` package when you also need the `goo` CLI.

See the [Goo DevTools guide](../../docs/devtools/README.md), [local protocol reference](../../docs/devtools/protocol.md), and [development guide](../../docs/devtools/development.md).
