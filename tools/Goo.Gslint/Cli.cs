namespace Goo.Gslint;

public static partial class Program
{
    private const string FormatRule = "GL0001";
    private const string AliasRule = "GL0002";
    private const string InferredTypeRule = "GL0003";
    private const string VarRule = "GL0004";
    private const string DoubleBangRule = "GL0005";
    private const string PublicDocRule = "GL0006";
    private const string ImportRule = "GL0007";
    private const string ExpressionBodyRule = "GL0008";
    private const string AccessorRule = "GL0010";
    private const string OperatorSpacingRule = "GL0011";
    private static readonly HashSet<string> KnownRules =
    [
        FormatRule,
        AliasRule,
        InferredTypeRule,
        VarRule,
        DoubleBangRule,
        PublicDocRule,
        ImportRule,
        ExpressionBodyRule,
        AccessorRule,
        OperatorSpacingRule,
    ];
    private static readonly IReadOnlyDictionary<string, string> TypeAliases = new Dictionary<string, string>
    {
        ["int"] = "int32",
        ["uint"] = "uint32",
        ["long"] = "int64",
        ["ulong"] = "uint64",
        ["short"] = "int16",
        ["ushort"] = "uint16",
        ["byte"] = "uint8",
        ["sbyte"] = "int8",
        ["float"] = "float32",
        ["double"] = "float64",
    };

    public static int Main(string[] args)
    {
        try
        {
            return Run(args);
        }
        catch (Exception ex)
        {
            Console.Error.WriteLine($"gslint: internal error: {ex.Message}");
            return 2;
        }
    }

    private static int Run(string[] args)
    {
        var strict = false;
        var fix = false;
        var reduce = false;
        var severityOverrides = new Dictionary<string, string>(StringComparer.OrdinalIgnoreCase);
        var paths = new List<string>();
        for (var index = 0; index < args.Length; index++)
        {
            var arg = args[index];
            if (arg == "--strict")
            {
                strict = true;
            }
            else if (arg == "--fix")
            {
                fix = true;
            }
            else if (arg == "--reduce")
            {
                reduce = true;
            }
            else if (arg == "--severity")
            {
                if (++index >= args.Length || !TryParseSeverityOverride(args[index], out var rule, out var severity))
                {
                    Console.Error.WriteLine("gslint: --severity requires ID=<error|warning|info|none>");
                    return 2;
                }

                severityOverrides[rule] = severity;
            }
            else if (arg == "--version")
            {
                Console.WriteLine("Goo.Gslint 1.2.0");
                return 0;
            }
            else if (arg.StartsWith("--", StringComparison.Ordinal))
            {
                Console.Error.WriteLine($"gslint: unknown option '{arg}'");
                return 2;
            }
            else
            {
                paths.Add(arg);
            }
        }

        if (paths.Count == 0)
        {
            paths.Add(".");
        }

        var failed = false;
        var fixedFiles = 0;
        foreach (var file in DiscoverFiles(paths))
        {
            var source = File.ReadAllText(file);
            var tree = SyntaxTree.Load(file);
            var parseErrors = tree.Diagnostics.Where(diagnostic => diagnostic.Severity == DiagnosticSeverity.Error).ToList();
            if (parseErrors.Count > 0)
            {
                foreach (var diagnostic in tree.Diagnostics)
                {
                    PrintDiagnostic(diagnostic);
                    failed |= diagnostic.Severity != DiagnosticSeverity.Info;
                }

                continue;
            }

            if (fix || reduce)
            {
                var rewritten = reduce ? ReduceSource(source, file) : FixSource(tree, source);
                if (rewritten != source)
                {
                    File.WriteAllText(file, rewritten, new System.Text.UTF8Encoding(false));
                    source = rewritten;
                    tree = SyntaxTree.Load(file);
                    fixedFiles++;
                }
            }

            var findings = Analyze(tree, source, strict)
                .Select(finding => severityOverrides.TryGetValue(finding.Rule, out var severity)
                    ? finding with { Severity = severity }
                    : finding)
                .Where(finding => finding.Severity != "none")
                .OrderBy(finding => finding.Location.Span.Start)
                .ThenBy(finding => finding.Rule, StringComparer.Ordinal)
                .ToList();
            foreach (var finding in findings)
            {
                PrintFinding(finding);
                failed |= finding.Severity is "warning" or "error";
            }
        }

        if (fix || reduce)
        {
            Console.WriteLine($"gslint: {(reduce ? "reduced" : "fixed")} {fixedFiles} file(s)");
        }

        return failed ? 1 : 0;
    }

    private static bool TryParseSeverityOverride(string value, out string rule, out string severity)
    {
        var separator = value.IndexOf('=');
        rule = separator > 0 ? value[..separator] : string.Empty;
        severity = separator > 0 ? value[(separator + 1)..].ToLowerInvariant() : string.Empty;
        return KnownRules.Contains(rule) && severity is "error" or "warning" or "info" or "none";
    }

}
