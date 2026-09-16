# Goo DevTools for Rider

This integration uses Rider's built-in External Tools support. It is a command profile for the `goo` CLI, not a separate JVM plugin.

1. Install the CLI with `dotnet tool install --global Goo.DevTools --version 0.5.4`.
2. In Rider, open Settings > Tools > External Tools and import `GooDevTools.xml`, or copy it into the project's `.idea/tools` directory.
3. Run the commands from Tools > External Tools > Goo DevTools.

The profile provides start with `dotnet watch`, attach, screenshot capture, and doctor checks.

Rider source navigation uses the CLI's JSON-lines output and Rider's normal terminal/editor behavior. No Rider-specific source protocol is claimed by this profile.

The profile is MIT licensed.
