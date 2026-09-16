namespace Goo.Gslint;

public static partial class Program
{
    private static int FirstDifference(string source, string formatted)
    {
        var max = Math.Min(source.Length, formatted.Length);
        var index = 0;
        while (index < max && source[index] == formatted[index])
        {
            index++;
        }

        return source.Length == 0 ? 0 : Math.Min(index, source.Length - 1);
    }

    private static IReadOnlyList<string> DiscoverFiles(IEnumerable<string> paths)
    {
        var result = new HashSet<string>(StringComparer.Ordinal);
        foreach (var path in paths)
        {
            if (File.Exists(path))
            {
                if (Path.GetExtension(path) == ".gs")
                {
                    result.Add(Path.GetFullPath(path));
                }

                continue;
            }

            if (!Directory.Exists(path))
            {
                throw new DirectoryNotFoundException($"path not found: {path}");
            }

            WalkDirectory(path, result);
        }

        return result.OrderBy(path => path, StringComparer.Ordinal).ToList();
    }

    private static void WalkDirectory(string directory, HashSet<string> result)
    {
        foreach (var file in Directory.EnumerateFiles(directory, "*.gs").OrderBy(path => path, StringComparer.Ordinal))
        {
            result.Add(Path.GetFullPath(file));
        }

        foreach (var subdirectory in Directory.EnumerateDirectories(directory).OrderBy(path => path, StringComparer.Ordinal))
        {
            var name = Path.GetFileName(subdirectory);
            if (name is "bin" or "obj" || name.StartsWith('.'))
            {
                continue;
            }

            WalkDirectory(subdirectory, result);
        }
    }

    private static void PrintFinding(Finding finding)
    {
        var file = finding.Location.FileName ?? string.Empty;
        Console.WriteLine(
            $"{file}({finding.Location.StartLine + 1},{finding.Location.StartCharacter + 1}): " +
            $"{finding.Severity} {finding.Rule}: {finding.Message}");
    }

    private static void PrintDiagnostic(Diagnostic diagnostic)
    {
        if (diagnostic.Location.Text is null)
        {
            Console.WriteLine($"{diagnostic.Id}: {diagnostic.Message}");
            return;
        }

        var severity = diagnostic.Severity switch
        {
            DiagnosticSeverity.Error => "error",
            DiagnosticSeverity.Warning => "warning",
            _ => "info",
        };
        Console.WriteLine(
            $"{diagnostic.Location.FileName}({diagnostic.Location.StartLine + 1},{diagnostic.Location.StartCharacter + 1}): " +
            $"{severity} {diagnostic.Id}: {diagnostic.Message}");
    }

    private sealed record Finding(string Rule, string Severity, TextLocation Location, string Message);

    private readonly record struct SourceEdit(int Start, int Length, string Text);
}
