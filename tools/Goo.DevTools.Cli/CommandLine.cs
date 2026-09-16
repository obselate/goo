namespace Goo.DevTools.Cli;

internal sealed class CommandLine
{
    private static readonly IReadOnlyDictionary<string, OptionSet> Commands = new Dictionary<string, OptionSet>(StringComparer.OrdinalIgnoreCase)
    {
        ["help"] = new([], ["json"]),
        ["dev"] = new(["project", "configuration", "env", "wait"], ["watch", "no-watch", "input", "inspector", "focus"]),
        ["attach"] = new(["project", "pid", "pipe", "app", "window", "wait", "command", "payload", "require-capabilities", "require-override-property"], ["latest", "inspector", "focus", "once", "json"]),
        ["doctor"] = new(["project"], ["json"]),
        ["list"] = new(["project", "pid", "pipe", "app", "window"], ["json"]),
        ["capture"] = new(["project", "pid", "pipe", "app", "window", "wait", "format", "output"], ["latest", "json"]),
        ["input"] = new(["project", "pid", "pipe", "app", "window", "wait", "gesture", "target", "node", "key", "text", "button", "x", "y", "offset-x", "offset-y", "delta-x", "delta-y"], ["latest", "json", "alt", "ctrl", "shift", "super"])
    };
    private static readonly HashSet<string> GlobalFlags = new(["help", "version"], StringComparer.OrdinalIgnoreCase);

    private CommandLine(string command, Dictionary<string, string?> options, List<string> positionals, List<string> trailing)
    {
        Command = command;
        Options = options;
        Positionals = positionals;
        Trailing = trailing;
    }

    public string Command { get; }

    public IReadOnlyDictionary<string, string?> Options { get; }

    public IReadOnlyList<string> Positionals { get; }

    public IReadOnlyList<string> Trailing { get; }

    public bool Has(string name) => Options.ContainsKey(name);

    public string? Get(string name) => Options.TryGetValue(name, out var value) ? value : null;

    public static CommandLine Parse(string[] args)
    {
        var command = args.Length == 0 || args[0].StartsWith('-') ? "help" : args[0].ToLowerInvariant();
        var start = command == "help" && (args.Length == 0 || args[0].StartsWith('-')) ? 0 : 1;
        var options = new Dictionary<string, string?>(StringComparer.OrdinalIgnoreCase);
        var positionals = new List<string>();
        var trailing = new List<string>();
        var afterSeparator = false;
        Commands.TryGetValue(command, out var commandOptions);

        for (var index = start; index < args.Length; index++)
        {
            var argument = args[index];
            if (afterSeparator)
            {
                trailing.Add(argument);
                continue;
            }

            if (argument == "--")
            {
                afterSeparator = true;
                continue;
            }

            if (!argument.StartsWith("--", StringComparison.Ordinal))
            {
                positionals.Add(argument);
                continue;
            }

            var valueSeparator = argument.IndexOf('=');
            var name = valueSeparator < 0 ? argument[2..] : argument[2..valueSeparator];
            if (name.Length == 0)
                throw new CliException("An option name is required after '--'.");
            if (options.ContainsKey(name))
                throw new CliException($"Option '--{name}' was specified more than once.");
            var isFlag = GlobalFlags.Contains(name) || commandOptions?.Flags.Contains(name) == true;
            var needsValue = commandOptions?.Values.Contains(name) == true;
            if (!isFlag && !needsValue)
                throw new CliException($"Unknown option '--{name}' for {command}.");

            if (valueSeparator >= 0)
            {
                if (isFlag)
                    throw new CliException($"Option '--{name}' does not accept a value.");
                if (valueSeparator == argument.Length - 1 && !name.Equals("text", StringComparison.OrdinalIgnoreCase))
                    throw new CliException($"Option '--{name}' needs a value.");
                options[name] = argument[(valueSeparator + 1)..];
                continue;
            }

            if (needsValue)
            {
                if (index + 1 >= args.Length || args[index + 1] == "--" || args[index + 1].StartsWith("--", StringComparison.Ordinal))
                    throw new CliException($"Option '--{name}' needs a value.");
                options[name] = args[++index];
                continue;
            }

            options[name] = null;
        }

        if (positionals.Count != 0 && command != "input")
            throw new CliException($"Unexpected argument '{positionals[0]}'. Put child command arguments after '--'.");
        if (trailing.Count != 0 && command != "dev")
            throw new CliException("Only `goo dev` accepts a command after '--'.");

        return new CommandLine(command, options, positionals, trailing);
    }

    private sealed class OptionSet
    {
        public OptionSet(IEnumerable<string> values, IEnumerable<string> flags)
        {
            Values = new HashSet<string>(values, StringComparer.OrdinalIgnoreCase);
            Flags = new HashSet<string>(flags, StringComparer.OrdinalIgnoreCase);
        }

        public HashSet<string> Values { get; }

        public HashSet<string> Flags { get; }
    }
}

internal sealed class CliException : Exception
{
    public CliException(string message, string code = "invalid-argument", string phase = "validation", bool mayHaveApplied = false, string? runtimeHello = null) : base(message)
    {
        Code = code;
        Phase = phase;
        MayHaveApplied = mayHaveApplied;
        RuntimeHello = runtimeHello;
    }

    public string Code { get; }

    public string Phase { get; }

    public bool MayHaveApplied { get; }

    public string? RuntimeHello { get; }
}
