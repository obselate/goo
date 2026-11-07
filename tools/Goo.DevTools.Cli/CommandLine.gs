package Goo.DevTools.Cli

import System
import System.Collections.Generic
import System.Linq
import System.Text

internal class CommandLine {
    private init(
        command string,
        options Dictionary[string, string?],
        positionals List[string],
        trailing List[string],
        environment List[string]
    ) {
        Command = command
        Options = options
        Positionals = positionals
        Trailing = trailing
        Environment = environment
    }

    prop Command string {
        get;
    }

    prop Options IReadOnlyDictionary[string, string?] {
        get;
    }

    prop Positionals IReadOnlyList[string] {
        get;
    }

    prop Trailing IReadOnlyList[string] {
        get;
    }

    prop Environment IReadOnlyList[string] {
        get;
    }

    func Has(name string) bool -> Options.ContainsKey(name)

    func Get(name string) string? -> if Options.TryGetValue(name, out var value) {
        value
    } else {
        nil
    }

    private data class Option(Name string, Value string, Description string) : IEquatable[Option] { }

    private class CommandDefinition {
        init(summary string, usage string, options[]Option, targeting bool = false) {
            Summary = summary
            Usage = usage
            Options = if targeting {
                CommandLine.Targets.Concat(options).ToArray()
            } else {
                options
            }
        }

        prop Summary string {
            get;
        }

        prop Usage string {
            get;
        }

        prop Options[]Option {
            get;
        }
    }

    shared {
        private let Targets[]Option = []Option{
            Option("project", "PATH", "Project file or directory."),
            Option("pid", "PID", "Select a process ID."),
            Option("pipe", "NAME", "Select an exact pipe or socket name."),
            Option("app", "NAME", "Match the application name."),
            Option("window", "ID_OR_TITLE", "Match a stable window ID or window title."),
            Option("latest", "", "Select the newest match instead of rejecting several matches."),
            Option("wait", "SECONDS", "Wait for an endpoint. Default: 15. Maximum: 300.")
        }
        private let Json Option = Option("json", "", "Write success and errors as JSON on stdout.")
        private let Commands Dictionary[string, CommandDefinition] = Dictionary[string, CommandDefinition](
            StringComparer.Ordinal
        ){
            ["dev"] = CommandDefinition(
                "Start an app with hot reload and diagnostics.",
                "[options] [-- command args]",
                []Option{
                    Option("project", "PATH", "Project file or directory."),
                    Option("configuration", "NAME", "Build configuration. Not valid with a child command."),
                    Option("env", "NAME=VALUE", "Set a child environment variable. Repeatable."),
                    Option("wait", "SECONDS", "Wait for the inspector target. Requires --inspector. Default: 15."),
                    Option("no-watch", "", "Run without hot reload."),
                    Option("input", "", "Permit diagnostic input in the child app."),
                    Option("inspector", "", "Open the bundled inspector when the app is ready.")
                }
            ),
            ["list"] = CommandDefinition("List running Goo apps.", "[options]", []Option{Json}, true),
            ["snapshot"] = CommandDefinition(
                "Read a typed snapshot of the selected window.",
                "[options]",
                []Option{
                    Option("compact", "", "Request the runtime's bounded snapshot instead of the full tree."),
                    Json
                },
                true
            ),
            ["capture"] = CommandDefinition(
                "Capture the selected window.",
                "[options]",
                []Option{
                    Option("format", "png|rgba8", "Capture format. Default: png."),
                    Option(
                        "output",
                        "PATH",
                        "Write the image to a file. Default: binary stdout. Required with --json."
                    ),
                    Json
                },
                true
            ),
            ["input"] = CommandDefinition(
                "Send input through normal Goo routing.",
                "<event> [options]",
                []Option{
                    Option("gesture", "TOKEN", "Continue a held pointer or key gesture."),
                    Option("target", "HANDLE", "Opaque target handle from the selected snapshot."),
                    Option("node-id", "ID", "Positive node ID from the selected snapshot."),
                    Option("key", "NAME", "Key for key.down or key.up."),
                    Option("text", "TEXT", "Committed text for the text event."),
                    Option("button", "Primary|Secondary|Middle|Back|Forward", "Pointer button. Default: Primary."),
                    Option("x", "NUMBER", "Logical horizontal position."),
                    Option("y", "NUMBER", "Logical vertical position."),
                    Option("offset-x", "NUMBER", "Horizontal offset within a target."),
                    Option("offset-y", "NUMBER", "Vertical offset within a target."),
                    Option("delta-x", "NUMBER", "Horizontal wheel distance."),
                    Option("delta-y", "NUMBER", "Vertical wheel distance."),
                    Option("alt", "", "Hold Alt."),
                    Option("ctrl", "", "Hold Control."),
                    Option("shift", "", "Hold Shift."),
                    Option("super", "", "Hold Super."),
                    Json
                },
                true
            ),
            ["inspector"] = CommandDefinition("Open the bundled graphical inspector.", "[options]", []Option{}, true),
            ["attach"] = CommandDefinition(
                "Advanced: send raw protocol requests or stream events.",
                "[options]",
                []Option{
                    Option("once", "", "Send one request and exit."),
                    Option("command", "NAME", "Raw request command. Requires --once. Default: snapshot."),
                    Option("payload", "JSON", "Raw request object. Requires --once."),
                    Option("require-capabilities", "NAMES", "Required comma-separated capabilities. Requires --once."),
                    Option("require-override-property", "NAME", "Required runtime override property. Requires --once."),
                    Json
                },
                true
            ),
            ["doctor"] = CommandDefinition(
                "Check the SDK, project, runtime and inspector.",
                "[options]",
                []Option{Option("project", "PATH", "Project file or directory."), Json}
            ),
            ["audit"] = CommandDefinition(
                "Partial best-practice check for rules 1, 2, 4, 6, 7 and 15 by text pattern. " +
                    "Exit 1 means hits. Exit 0 does not verify the other rules, including cancellation, " +
                    "stale results, virtualization, Build cost and idle rendering. " +
                    "They need review and runtime measurement.",
                "[path]",
                []Option{}
            ),
            ["package"] = CommandDefinition(
                "Publish a desktop package or Android app bundle.",
                "--target TARGET [options]",
                []Option{
                    Option("project", "PATH", "Application project file or directory."),
                    Option("target", "linux|windows|macos|android", "Required package target."),
                    Option("output", "PATH", "Package output directory."),
                    Json
                }
            ),
            ["mcp"] = CommandDefinition(
                "Serve the plugin's stdio MCP tools.",
                "--plugin-root PATH [options]",
                []Option{
                    Option("plugin-root", "PATH", "Required plugin directory."),
                    Option("verify", "", "Verify tools against a live starter app.")
                }
            )
        }
        const InputEvents string = "click, pointer.move, pointer.down, pointer.up, pointer.cancel, wheel, key.down, key.up, text, reset"

        func Help(command string = "help") string {
            let text = StringBuilder()
            if command == "help" {
                text.AppendLine("Goo DevTools CLI")
                text.AppendLine("Usage: goo <command> [options]")
                text.AppendLine()
                text.AppendLine("Commands:")
                for (name, definition) in Commands {
                    text.AppendLine("  $name  ${definition.Summary}")
                }
                text.AppendLine()
                text.AppendLine("Global options:")
                text.AppendLine("  --help, -h  Show help. Use goo help <command> for command options.")
                text.AppendLine("  --version   Print the version. Root only.")
                text.AppendLine("  --json      Write root help or version as JSON.")
            } else {
                let definition = Commands[command]
                text.AppendLine("Usage: goo $command ${definition.Usage}")
                text.AppendLine(definition.Summary)
                if command == "input" {
                    text.AppendLine("Events: $InputEvents")
                }
                text.AppendLine()
                text.AppendLine("Options:")
                for option in definition.Options {
                    text.AppendLine(
                        "  --${option.Name}${(if option.Value == "" { "" } else { " " + option.Value })}  ${option.Description}"
                    )
                }
                text.AppendLine("  --help, -h  Show this help.")
            }
            return text.ToString().TrimEnd()
        }

        func Reference() string {
            let text = StringBuilder("# CLI reference\n\n```sh\ngoo help input\n```\n\n")
            text.AppendLine("Options below come from the command parser. Use `--name VALUE` or `--name=VALUE`.")
            text.AppendLine(
                "One target is selected automatically. Several matches fail with a list unless `--latest` is set."
            )
            text.AppendLine(
                "JSON success and errors go to stdout. Text errors go to stderr. Exit codes: 0 success, 1 operation failure, 2 invalid arguments, 130 cancelled."
            )
            for (name, definition) in Commands {
                text.AppendLine("\n## $name\n\n```sh\ngoo $name ${definition.Usage}\n```\n\n${definition.Summary}\n")
                if name == "input" {
                    text.AppendLine("Events: `$InputEvents`.\n")
                }
                text.AppendLine("| Option | Meaning |\n| --- | --- |")
                for option in definition.Options {
                    text.AppendLine(
                        "| `--${option.Name}${(if option.Value == "" { "" } else { " " + option.Value.Replace("|", "\\|") })}` | ${option.Description} |"
                    )
                }
                text.AppendLine("| `--help`, `-h` | Show command help. |")
            }
            return text.ToString().TrimEnd()
        }

        func Parse(args[]string) CommandLine {
            var command = if args.Length == 0 || args[0].StartsWith('-') {
                "help"
            } else {
                args[0]
            }
            var start = if command == "help" && (args.Length == 0 || args[0].StartsWith('-')) {
                0
            } else {
                1
            }
            if command == "help" && args.Length > start && !args[start].StartsWith('-') {
                command = args[start]
                start++
            }
            if command != "help" && !Commands.ContainsKey(command) {
                throw CliException("Unknown command '$command'. Run `goo --help`.")
            }
            let options = Dictionary[string, string?](StringComparer.Ordinal)
            if args.Length > 0 && args[0] == "help" {
                options["help"] = nil
            }
            let positionals = List[string]()
            let trailing = List[string]()
            let environment = List[string]()
            var afterSeparator = false
            for var index = start; index < args.Length; index++ {
                let argument = args[index]
                if afterSeparator {
                    trailing.Add(argument)
                    continue
                }
                if argument == "--" {
                    afterSeparator = true
                    continue
                }
                if argument == "-h" {
                    options["help"] = nil
                    continue
                }
                if !argument.StartsWith("--", StringComparison.Ordinal) {
                    positionals.Add(argument)
                    continue
                }
                let separator = argument.IndexOf('=')
                let name = if separator < 0 {
                    argument[2 ..]
                } else {
                    argument[2 .. separator]
                }
                let option = if command == "help" {
                    nil
                } else {
                    Commands[command].Options.FirstOrDefault(x -> x.Name == name)
                }
                let global = name == "help" || (command == "help" && (name == "version" || name == "json"))
                if option == nil && !global {
                    throw CliException("Unknown option '--$name' for $command.")
                }
                if options.ContainsKey(name) && name != "env" {
                    throw CliException("Option '--$name' was specified more than once.")
                }
                let needsValue = option != nil && option.Value != ""
                var value string? = nil
                if separator >= 0 {
                    if !needsValue {
                        throw CliException("Option '--$name' does not accept a value.")
                    }
                    value = argument[(separator + 1) ..]
                } else if needsValue {
                    if index + 1 >= args.Length || args[index + 1].StartsWith("--") {
                        throw CliException("Option '--$name' needs a value.")
                    }
                    value = args[(index += 1)]
                }
                if needsValue && value == "" && name != "text" {
                    throw CliException("Option '--$name' needs a value.")
                }
                options[name] = value
                if name == "env" {
                    environment.Add(value!!)
                }
            }
            if positionals.Count != 0 && command != "input" && (command != "audit" || positionals.Count > 1) {
                throw CliException("Unexpected argument '${positionals[0]}'.")
            }
            if trailing.Count != 0 && command != "dev" {
                throw CliException("Only `goo dev` accepts a child command after '--'.")
            }
            return CommandLine(command, options, positionals, trailing, environment)
        }
    }
}

internal class CliException : Exception {
    init(
        message string,
        code string = "invalid-argument",
        phase string = "validation",
        mayHaveApplied bool = false,
        runtimeHello string? = nil
    ) : base(message) {
        Code = code
        Phase = phase
        MayHaveApplied = mayHaveApplied
        RuntimeHello = runtimeHello
    }

    prop Code string {
        get;
    }

    prop Phase string {
        get;
    }

    prop MayHaveApplied bool {
        get;
    }

    prop RuntimeHello string? {
        get;
    }
}
