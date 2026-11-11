# Goo DevTools for VS Code

This extension is a thin VS Code front end for the `goo` CLI. It does not duplicate the standalone inspector.

Install the CLI first:

```sh
dotnet tool install --global Goo.DevTools
```

Then package the extension from the checkout:

```sh
cd integrations/vscode
npx @vscode/vsce package --out goo-devtools.vsix
code --install-extension goo-devtools.vsix
```

For local development, run `code --extensionDevelopmentPath="$PWD/integrations/vscode"` from the repository root.

Commands:

- Goo: Start with DevTools starts `goo dev` directly in a terminal without a shell.
- Goo: Attach to Latest Window streams JSON protocol events.
- Goo: Open Inspector launches the configured standalone inspector.
- Goo: Capture Screenshot writes a PNG selected in the save dialog.
- Goo: Open Source Location opens the latest source location event or a selected file.
- Goo: Restart Hot Reload replaces the previous terminal and starts the watch command again.
- Goo: Doctor reports CLI and endpoint health.

- `goo.cliPath`: absolute CLI executable path. Empty uses `goo` from PATH.
- `goo.inspectorPath`: absolute inspector executable path.
- `goo.project`: project inside the workspace.

Set executable paths in user or machine settings. The status item polls `goo doctor --json` for a live endpoint.

The extension is MIT licensed.
