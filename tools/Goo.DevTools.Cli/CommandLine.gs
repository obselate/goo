package Goo.DevTools.Cli

import System
import System.Collections.Generic

internal class CommandLine {
    private init(command string, options Dictionary[string, string?], positionals List[string], trailing List[string]) {
        Command = command
        Options = options
        Positionals = positionals
        Trailing = trailing
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

    func Has(name string) bool -> Options.ContainsKey(name)

    func Get(name string) string? -> if Options.TryGetValue(name, out var value) {
        value
    } else {
        default(string?)
    }

    private class OptionSet {
        init(values IEnumerable[string], flags IEnumerable[string]) {
            Values = HashSet[string](values, StringComparer.OrdinalIgnoreCase)
            Flags = HashSet[string](flags, StringComparer.OrdinalIgnoreCase)
        }

        prop Values HashSet[string] {
            get;
        }

        prop Flags HashSet[string] {
            get;
        }
    }

    shared {
        private let Commands IReadOnlyDictionary[string, OptionSet] = Dictionary[string, OptionSet](
            StringComparer.OrdinalIgnoreCase
        ){
            ["help"] = OptionSet([]string{}, []string{"json"}),
            ["dev"] = OptionSet(
                []string{"project", "configuration", "env", "wait"},
                []string{"watch", "no-watch", "input", "inspector", "focus"}
            ),
            ["attach"] = OptionSet(
                []string{
                    "project",
                    "pid",
                    "pipe",
                    "app",
                    "window",
                    "wait",
                    "command",
                    "payload",
                    "require-capabilities",
                    "require-override-property"
                },
                []string{"latest", "inspector", "focus", "once", "json"}
            ),
            ["doctor"] = OptionSet([]string{"project"}, []string{"json"}),
            ["list"] = OptionSet([]string{"project", "pid", "pipe", "app", "window"}, []string{"json"}),
            ["package"] = OptionSet([]string{"project", "target", "output"}, []string{"json"}),
            ["capture"] = OptionSet(
                []string{"project", "pid", "pipe", "app", "window", "wait", "format", "output"},
                []string{"latest", "json"}
            ),
            ["input"] = OptionSet(
                []string{
                    "project",
                    "pid",
                    "pipe",
                    "app",
                    "window",
                    "wait",
                    "gesture",
                    "target",
                    "node",
                    "key",
                    "text",
                    "button",
                    "x",
                    "y",
                    "offset-x",
                    "offset-y",
                    "delta-x",
                    "delta-y"
                },
                []string{"latest", "json", "alt", "ctrl", "shift", "super"}
            )
        }
        private let GlobalFlags HashSet[string] = HashSet[string](
            []string{"help", "version"},
            StringComparer.OrdinalIgnoreCase
        )

        func Parse(args[]string) CommandLine {
            let command = if args.Length == 0 || args[0].StartsWith('-') {
                "help"
            } else {
                args[0].ToLowerInvariant()
            }
            let start = if command == "help" && (args.Length == 0 || args[0].StartsWith('-')) {
                0
            } else {
                1
            }
            let options = Dictionary[string, string?](StringComparer.OrdinalIgnoreCase)
            let positionals = List[string]()
            let trailing = List[string]()
            var afterSeparator = false
            Commands.TryGetValue(command, out var commandOptions)
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
                if !argument.StartsWith("--", StringComparison.Ordinal) {
                    positionals.Add(argument)
                    continue
                }
                let valueSeparator = argument.IndexOf('=')
                let name = if valueSeparator < 0 {
                    argument[2 ..]
                } else {
                    argument[2 .. valueSeparator]
                }
                if name.Length == 0 {
                    throw CliException("An option name is required after '--'.")
                }
                if options.ContainsKey(name) {
                    throw CliException("Option '--$name' was specified more than once.")
                }
                let isFlag = GlobalFlags.Contains(name) || commandOptions?.Flags.Contains(name) == true
                let needsValue = commandOptions?.Values.Contains(name) == true
                if !isFlag && !needsValue {
                    throw CliException("Unknown option '--$name' for $command.")
                }
                if valueSeparator >= 0 {
                    if isFlag {
                        throw CliException("Option '--$name' does not accept a value.")
                    }
                    if valueSeparator == argument.Length - 1 && !name.Equals(
                        "text",
                        StringComparison.OrdinalIgnoreCase
                    ) {
                        throw CliException("Option '--$name' needs a value.")
                    }
                    options[name] = argument[(valueSeparator + 1) ..]
                    continue
                }
                if needsValue {
                    if index + 1 >= args.Length || args[index + 1] == "--" || args[index + 1].StartsWith(
                        "--",
                        StringComparison.Ordinal
                    ) {
                        throw CliException("Option '--$name' needs a value.")
                    }
                    options[name] = args[(index += 1)]
                    continue
                }
                options[name] = nil
            }
            if positionals.Count != 0 && command != "input" {
                throw CliException("Unexpected argument '${positionals[0]}'. Put child command arguments after '--'.")
            }
            if trailing.Count != 0 && command != "dev" {
                throw CliException("Only `goo dev` accepts a command after '--'.")
            }
            return CommandLine(command, options, positionals, trailing)
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
