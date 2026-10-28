# Goo DevTools for Rider

Use Rider's built-in External Tools to run `goo`. This is not a JVM plugin or a separate inspector.

1. Install the CLI and standalone inspector with `dotnet tool install --global Goo.DevTools --version 0.22.3` and `dotnet tool install --global Goo.DevTools.App --version 0.22.3`.
2. In Rider, open Settings > Tools > External Tools and import `GooDevTools.xml`, or copy it into the project's `.idea/tools` directory.
3. Run the commands from Tools > External Tools > Goo DevTools.

The profile provides start with `dotnet watch`, attach, inspector launch, screenshot capture, and doctor checks. `GOO_DEVTOOLS_INSPECTOR` can point at the standalone inspector when it is not discoverable on `PATH`.

Rider source navigation uses the CLI's JSON-lines output and Rider's normal terminal/editor behavior. No Rider-specific source protocol is claimed by this profile.

The profile is MIT licensed.
