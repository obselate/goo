# CLI reference

```sh
goo help input
```

Options below come from the command parser. Use `--name VALUE` or `--name=VALUE`.
One target is selected automatically. Several matches fail with a list unless `--latest` is set.
JSON success and errors go to stdout. Text errors go to stderr. Exit codes: 0 success, 1 operation failure, 2 invalid arguments, 130 cancelled.

## dev

```sh
goo dev [options] [-- command args]
```

Start an app with hot reload and diagnostics.

| Option | Meaning |
| --- | --- |
| `--project PATH` | Project file or directory. |
| `--configuration NAME` | Build configuration. Not valid with a child command. |
| `--env NAME=VALUE` | Set a child environment variable. Repeatable. |
| `--wait SECONDS` | Wait for the inspector target. Requires --inspector. Default: 15. |
| `--no-watch` | Run without hot reload. |
| `--input` | Permit diagnostic input in the child app. |
| `--inspector` | Open the bundled inspector when the app is ready. |
| `--help`, `-h` | Show command help. |

## list

```sh
goo list [options]
```

List running Goo apps.

| Option | Meaning |
| --- | --- |
| `--project PATH` | Project file or directory. |
| `--pid PID` | Select a process ID. |
| `--pipe NAME` | Select an exact pipe or socket name. |
| `--app NAME` | Match the application name. |
| `--window ID_OR_TITLE` | Match a stable window ID or window title. |
| `--latest` | Select the newest match instead of rejecting several matches. |
| `--wait SECONDS` | Wait for an endpoint. Default: 15. Maximum: 300. |
| `--json` | Write success and errors as JSON on stdout. |
| `--help`, `-h` | Show command help. |

## snapshot

```sh
goo snapshot [options]
```

Read a typed snapshot of the selected window.

| Option | Meaning |
| --- | --- |
| `--project PATH` | Project file or directory. |
| `--pid PID` | Select a process ID. |
| `--pipe NAME` | Select an exact pipe or socket name. |
| `--app NAME` | Match the application name. |
| `--window ID_OR_TITLE` | Match a stable window ID or window title. |
| `--latest` | Select the newest match instead of rejecting several matches. |
| `--wait SECONDS` | Wait for an endpoint. Default: 15. Maximum: 300. |
| `--compact` | Request the runtime's bounded snapshot instead of the full tree. |
| `--json` | Write success and errors as JSON on stdout. |
| `--help`, `-h` | Show command help. |

## capture

```sh
goo capture [options]
```

Capture the selected window.

| Option | Meaning |
| --- | --- |
| `--project PATH` | Project file or directory. |
| `--pid PID` | Select a process ID. |
| `--pipe NAME` | Select an exact pipe or socket name. |
| `--app NAME` | Match the application name. |
| `--window ID_OR_TITLE` | Match a stable window ID or window title. |
| `--latest` | Select the newest match instead of rejecting several matches. |
| `--wait SECONDS` | Wait for an endpoint. Default: 15. Maximum: 300. |
| `--format png\|rgba8` | Capture format. Default: png. |
| `--output PATH` | Write the image to a file. Default: binary stdout. Required with --json. |
| `--json` | Write success and errors as JSON on stdout. |
| `--help`, `-h` | Show command help. |

## input

```sh
goo input <event> [options]
```

Send input through normal Goo routing.

Events: `click, pointer.move, pointer.down, pointer.up, pointer.cancel, wheel, key.down, key.up, text, reset`.

| Option | Meaning |
| --- | --- |
| `--project PATH` | Project file or directory. |
| `--pid PID` | Select a process ID. |
| `--pipe NAME` | Select an exact pipe or socket name. |
| `--app NAME` | Match the application name. |
| `--window ID_OR_TITLE` | Match a stable window ID or window title. |
| `--latest` | Select the newest match instead of rejecting several matches. |
| `--wait SECONDS` | Wait for an endpoint. Default: 15. Maximum: 300. |
| `--gesture TOKEN` | Continue a held pointer or key gesture. |
| `--target HANDLE` | Opaque target handle from the selected snapshot. |
| `--node-id ID` | Positive node ID from the selected snapshot. |
| `--key NAME` | Key for key.down or key.up. |
| `--text TEXT` | Committed text for the text event. |
| `--button Primary\|Secondary\|Middle\|Back\|Forward` | Pointer button. Default: Primary. |
| `--x NUMBER` | Logical horizontal position. |
| `--y NUMBER` | Logical vertical position. |
| `--offset-x NUMBER` | Horizontal offset within a target. |
| `--offset-y NUMBER` | Vertical offset within a target. |
| `--delta-x NUMBER` | Horizontal wheel distance. |
| `--delta-y NUMBER` | Vertical wheel distance. |
| `--alt` | Hold Alt. |
| `--ctrl` | Hold Control. |
| `--shift` | Hold Shift. |
| `--super` | Hold Super. |
| `--json` | Write success and errors as JSON on stdout. |
| `--help`, `-h` | Show command help. |

## inspector

```sh
goo inspector [options]
```

Open the bundled graphical inspector.

| Option | Meaning |
| --- | --- |
| `--project PATH` | Project file or directory. |
| `--pid PID` | Select a process ID. |
| `--pipe NAME` | Select an exact pipe or socket name. |
| `--app NAME` | Match the application name. |
| `--window ID_OR_TITLE` | Match a stable window ID or window title. |
| `--latest` | Select the newest match instead of rejecting several matches. |
| `--wait SECONDS` | Wait for an endpoint. Default: 15. Maximum: 300. |
| `--help`, `-h` | Show command help. |

## attach

```sh
goo attach [options]
```

Advanced: send raw protocol requests or stream events.

| Option | Meaning |
| --- | --- |
| `--project PATH` | Project file or directory. |
| `--pid PID` | Select a process ID. |
| `--pipe NAME` | Select an exact pipe or socket name. |
| `--app NAME` | Match the application name. |
| `--window ID_OR_TITLE` | Match a stable window ID or window title. |
| `--latest` | Select the newest match instead of rejecting several matches. |
| `--wait SECONDS` | Wait for an endpoint. Default: 15. Maximum: 300. |
| `--once` | Send one request and exit. |
| `--command NAME` | Raw request command. Requires --once. Default: snapshot. |
| `--payload JSON` | Raw request object. Requires --once. |
| `--require-capabilities NAMES` | Required comma-separated capabilities. Requires --once. |
| `--require-override-property NAME` | Required runtime override property. Requires --once. |
| `--json` | Write success and errors as JSON on stdout. |
| `--help`, `-h` | Show command help. |

## doctor

```sh
goo doctor [options]
```

Check the SDK, project, runtime and inspector.

| Option | Meaning |
| --- | --- |
| `--project PATH` | Project file or directory. |
| `--json` | Write success and errors as JSON on stdout. |
| `--help`, `-h` | Show command help. |

## audit

```sh
goo audit [path]
```

Partial best-practice check for rules 1, 2, 4, 6, 7 and 15 by text pattern. Exit 1 means hits. Exit 0 does not verify the other rules, including cancellation, stale results, virtualization, Build cost and idle rendering. They need review and runtime measurement.

| Option | Meaning |
| --- | --- |
| `--help`, `-h` | Show command help. |

## package

```sh
goo package --target TARGET [options]
```

Publish a desktop package or Android app bundle.

| Option | Meaning |
| --- | --- |
| `--project PATH` | Application project file or directory. |
| `--target linux\|windows\|macos\|android` | Required package target. |
| `--output PATH` | Package output directory. |
| `--json` | Write success and errors as JSON on stdout. |
| `--help`, `-h` | Show command help. |

## mcp

```sh
goo mcp --plugin-root PATH [options]
```

Serve the plugin's stdio MCP tools.

| Option | Meaning |
| --- | --- |
| `--plugin-root PATH` | Required plugin directory. |
| `--verify` | Verify tools against a live starter app. |
| `--help`, `-h` | Show command help. |
