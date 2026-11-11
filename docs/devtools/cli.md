# CLI reference

```sh
goo help input
```

Use `goo help COMMAND` for all options. JSON success and errors go to stdout. Text errors go to stderr.
Exit codes: 0 success, 1 operation failure, 2 invalid arguments, 130 cancelled.

## Target options

Runtime commands share these selectors. One match is selected automatically. Several matches fail unless `--latest` is set.

| Option | Meaning |
| --- | --- |
| `--project PATH` | Project file or directory. |
| `--pid PID` | Select a process ID. |
| `--pipe NAME` | Select an exact pipe or socket name. |
| `--app NAME` | Match the application name. |
| `--window ID_OR_TITLE` | Match a stable window ID or window title. |
| `--latest` | Select the newest match instead of rejecting several matches. |
| `--wait SECONDS` | Wait for an endpoint. Default: 15. Maximum: 300. |

## dev

```sh
goo dev [options] [-- command args]
```

Start an app with hot reload and diagnostics.

| Option | Meaning |
| --- | --- |
| `--configuration NAME` | Build configuration. Not valid with a child command. |
| `--env NAME=VALUE` | Set a child environment variable. Repeatable. |
| `--wait SECONDS` | Wait for the inspector target. Requires --inspector. Default: 15. |
| `--no-watch` | Run without hot reload. |
| `--input` | Permit diagnostic input in the child app. |
| `--inspector` | Open the bundled inspector when the app is ready. |

## render

```sh
goo render <project-or-executable> [--out PATH | --list] [options]
```

Build an app and render one frame without a display.

| Option | Meaning |
| --- | --- |
| `--project PATH` | Project file or directory, instead of the positional project. |
| `--out PATH` | Required PNG output path. |
| `--size WxH` | Logical viewport size. Default: app window size. |
| `--scale NUMBER` | Pixels per logical unit. Default: 1. |
| `--theme light\|dark` | Preferred app theme. Default: light. |
| `--scene NAME` | Named state registered on Window.Scenes. |
| `--list` | List registered scene names without rendering. |

## diff

```sh
goo diff <a.png> <b.png> [options]
```

Compare two PNG images.

| Option | Meaning |
| --- | --- |
| `--tolerance 0..255` | Maximum per-channel difference. Default: 0. |
| `--out PATH` | Write a PNG marking changed pixels. |

## list

```sh
goo list [options]
```

List running Goo apps.

Use the shared [target options](#target-options).


## snapshot

```sh
goo snapshot [options]
```

Read a typed snapshot of the selected window.

Use the shared [target options](#target-options).

| Option | Meaning |
| --- | --- |
| `--compact` | Request the runtime's bounded snapshot instead of the full tree. |
| `--json` | Write success and errors as JSON on stdout. |

## capture

```sh
goo capture [options]
```

Capture the selected window.

Use the shared [target options](#target-options).

Without `--output`, capture writes binary image bytes to stdout. `--json` requires an output file.

| Option | Meaning |
| --- | --- |
| `--format png\|rgba8` | Capture format. Default: png. |
| `--output PATH` | Write the image to a file. Default: binary stdout. Required with --json. |
| `--json` | Write success and errors as JSON on stdout. |

## input

```sh
goo input <event> [options]
```

Send input through normal Goo routing.

Use the shared [target options](#target-options).

```sh
goo input click --pid PID --target HANDLE
goo input text --pid PID --text "hello"
```

Use a fresh snapshot target. Release held pointer and key gestures with matching up events, or cancel/reset them. Run `goo help input` for events and parameters.

## inspector

```sh
goo inspector [options]
```

Open the bundled graphical inspector.

Use the shared [target options](#target-options).


## attach

```sh
goo attach [options]
```

Advanced: send raw protocol requests or stream events.

Use the shared [target options](#target-options).

```sh
goo attach --pid PID --once --command capabilities --payload '{}' --require-capabilities profiler.trace.v1 --json
```

| Option | Meaning |
| --- | --- |
| `--once` | Send one request and exit. |
| `--command NAME` | Raw request command. Requires --once. Default: snapshot. |
| `--payload JSON` | Raw request object. Requires --once. |
| `--require-capabilities NAMES` | Required comma-separated capabilities. Requires --once. |
| `--require-override-property NAME` | Required runtime override property. Requires --once. |
| `--json` | Write success and errors as JSON on stdout. |

## doctor

```sh
goo doctor [options]
```

Check the SDK, project, runtime and inspector.

Run `goo doctor --project App.gsproj` for prerequisite fixes.

## package

```sh
goo package --target TARGET [options]
```

Publish a desktop package or Android app bundle.

Targets: `linux`, `windows`, `macos`, `android`. See [Shipping](../shipping.md) for metadata, signing and output limits.
