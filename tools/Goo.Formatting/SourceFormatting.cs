using GSharp.Core.CodeAnalysis.Text;
using GSharp.Formatting;

namespace Goo.Tools;

internal static class SourceFormatting
{
    internal static string Format(string source)
    {
        var result = GSharpFormatter.Format(SourceText.From(source));
        return result.Text?.ToString()
            ?? throw new System.InvalidOperationException(string.Join("\n", result.Diagnostics));
    }
}
