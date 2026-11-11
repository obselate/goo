# Goo DevTools for Rider

Use Rider's External Tools profile to run the `goo` CLI and its inspector.

1. Install the CLI and bundled inspector with `dotnet tool install --global Goo.DevTools`.
2. In Rider, open Settings > Tools > External Tools and import `GooDevTools.xml`, or copy it into the project's `.idea/tools` directory.
3. Run the commands from Tools > External Tools > Goo DevTools.

The profile provides hot reload, attach, inspector launch, screenshot capture and doctor checks. `GOO_DEVTOOLS_INSPECTOR` can select a custom inspector.

Source navigation uses CLI JSON-lines output and Rider's terminal and editor.

The profile is MIT licensed.
