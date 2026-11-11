---
name: goo-authoring
description: "Author and review standalone G# Goo apps for desktop and Android. Mandatory: read references/best-practices.md before app work. Not for s&box Goo or SharpTUI."
---

# Goo authoring

Use `goo` MCP tools to look up APIs and inspect the app.

## Source and API

Call `goo_context` once. Check preflight before runtime work and follow its actions. Compiler diagnostics and the selected checkout take precedence over bundled guides.

Use a focused natural-language or symbol `goo_search`, then `goo_read` the result's `path` and `section_id`. Results are ranked, not exact matches. Reads return the smallest heading or XML member with parent context. If `complete=false`, follow `continuation` with the same path and source arguments. Use `count` only for an explicit line range.

Pass `project` to search and read Widgets or Animations APIs from that project's restored packages. Without a project, the tools use the newest cached package. Missing packages are reported as unavailable.

Docs use XML notation such as `Cell<T>` and `System.Action{T}`. Write `Cell[T]` and `Action[T]` in G#.

For C#, F# and Visual Basic, use the [interop guide](../../reference/docs/interop.md). For PowerShell, use its [PowerShell section](../../reference/docs/interop.md#powershell).

## Create and edit

For a new app, write the files returned by `goo_starter` and run its `build` command. Run available `lint`. If unavailable, state that lint is skipped. Keep existing apps' SDK and package choices.

Read [app best practices](references/best-practices.md) before writing or reviewing app code. Use repository conventions for framework and tooling work.

Goo is a retained UI framework:

- Build immutable Blobs in `Cell.Build`. Keep local state in Cell fields. Mount fixed children with `Cell.Mount[TCell]()`. Use keys for siblings that can move. Keyed and unkeyed siblings can mix. Unkeyed identity uses the absolute sibling index and never matches a key.
- For typed Cells consumed across assemblies, use `open class X : Cell[Input]` with `protected override func Build(input Input) Blob`.
- Put `BasedOn` before overrides. Later style declarations win.
- Avoid invented convenience APIs and s&box GooPanel patterns.
- Check [platform preflight](../../reference/docs/platform-preflight.md) for runtime requirements.

## Run, inspect, iterate

For desktop apps, run `goo dev --project App.gsproj` in a managed terminal session. It enables diagnostics and hot reload. For Android, follow the [Android guide](../../reference/docs/android.md).

Use `goo render App.gsproj --list` to find scenes, then `goo render App.gsproj --scene NAME --out frame.png` for a display-free image. Repeat with `--theme dark` and `--scale 2`, then view each PNG. Compare with `goo diff reference.png frame.png --tolerance 2 --out difference.png`.

Use `goo_list` for live processes and windows. Use bounded compact `goo_snapshot` queries and `goo_capture` for images. Keep the process alive while inspecting.

Call `goo_capabilities` before inspection or temporary style work.

For requested UI automation, launch with `goo dev --input --project App.gsproj`. Finish gestures with matching releases or `pointer.cancel`. Follow input with a snapshot and capture. Do not restart an existing app to enable input unless requested.

Test the visible interactions, resize, focus and state changes. A build or handshake alone does not verify UI. Close only task-owned app processes.

Read [watch modes and limits](references/watch.md) for supported edits.

If MCP is unavailable, read bundled `reference/docs/api` files and use the [CLI](../../reference/docs/devtools/cli.md). Do not add a manual MCP command.
