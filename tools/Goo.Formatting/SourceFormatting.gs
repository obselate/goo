package Goo.Tools

import GSharp.Core.CodeAnalysis.Text
import GSharp.Formatting
import System

internal shared class SourceFormatting {
    internal func Format(source string) string {
        let result = GSharpFormatter.Format(SourceText.From(source))
        return result.Text?.ToString() ?? throw InvalidOperationException(string.Join("\n", result.Diagnostics))
    }
}
