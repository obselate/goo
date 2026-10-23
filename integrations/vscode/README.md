# Goo DevTools for VS Code

This extension is a thin VS Code front end for the `goo` CLI. It does not duplicate the standalone inspector.

Install the CLI first:

```sh
dotnet tool install --global Goo.DevTools --version 0.11.0
dotnet tool install --global Goo.DevTools.App --version 0.11.0
```

Then package the extension from the checkout:

```sh
npx @vscode/vsce package integrations/vscode
code --install-extension goo-devtools-0.11.0.vsix
```

For local development, open `integrations/vscode` in VS Code and press F5 to launch an Extension Development Host.

Commands:

- Goo: Start with DevTools starts `goo dev --watch` directly in a terminal without a shell.
- Goo: Attach to Latest Window streams JSON protocol events.
- Goo: Open Inspector launches the configured standalone inspector.
- Goo: Capture Screenshot writes a PNG selected in the save dialog.
- Goo: Open Source Location opens the latest source location event or a selected file.
- Goo: Restart Hot Reload replaces the previous terminal and starts the watch command again.
- Goo: Doctor reports CLI and endpoint health.

Set `goo.cliPath` and `goo.inspectorPath` in user or machine settings to absolute executable paths when the defaults do not apply. An empty `goo.cliPath` uses `goo` from PATH. Set `goo.project` in workspace settings to a project inside the workspace. The status item polls `goo doctor --json` and shows whether a live endpoint exists.

The extension is MIT licensed.
