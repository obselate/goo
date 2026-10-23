using System.Globalization;

namespace Goo.SpellCheck;

/// <summary>Reports a spelling operation independently of the returned words.</summary>
public enum SpellingStatus
{
    /// <summary>The checker completed the operation.</summary>
    Success,
    /// <summary>The platform or optional native checker is unavailable.</summary>
    Unsupported,
    /// <summary>No dictionary supports the requested language.</summary>
    LanguageUnavailable,
    /// <summary>Checking is disabled, the owner closed, or editing is read-only.</summary>
    Disabled,
    /// <summary>The caller cancelled the operation.</summary>
    Cancelled,
    /// <summary>The document, selection or checker language changed.</summary>
    Stale,
    /// <summary>The requested text exceeds the checker limit.</summary>
    TooLarge,
    /// <summary>The checker could not complete the operation.</summary>
    Failed
}

/// <summary>A misspelled word and its absolute UTF-16 source range.</summary>
public readonly record struct Misspelling(TextRange Range, string Word);

/// <summary>Owned spelling results for one immutable document version and language.</summary>
public sealed record SpellingResult(SpellingStatus Status, long Version, string Language,
    IReadOnlyList<Misspelling> Errors, string Error = "");

/// <summary>Owned suggestions for one word at an absolute UTF-16 source range.</summary>
public sealed record SpellingSuggestions(SpellingStatus Status, long Version, string Language,
    TextRange Range, string Word, IReadOnlyList<string> Values, string Error = "");

/// <summary>Checks immutable text without changing the document or learning words.</summary>
public interface ISpellingService
{
    /// <summary>Checks a UTF-16 range, returning absolute source offsets.</summary>
    Task<SpellingResult> CheckAsync(TextSnapshot snapshot, TextRange range, string language,
        CancellationToken cancellation = default);

    /// <summary>Suggests replacements for the word in a UTF-16 source range.</summary>
    Task<SpellingSuggestions> SuggestAsync(TextSnapshot snapshot, TextRange range, string language,
        CancellationToken cancellation = default);
}

internal static class SpellingInput
{
    internal const int MaxTextLength = 65536;
    internal const int MaxSuggestions = 16;

    internal static string Validate(TextSnapshot snapshot, TextRange range, string language)
    {
        ArgumentNullException.ThrowIfNull(snapshot);
        ArgumentException.ThrowIfNullOrWhiteSpace(language);
        if (range.Start < 0 || range.Length < 0 || (long)range.Start + range.Length > snapshot.Length)
            throw new ArgumentOutOfRangeException(nameof(range));
        var canonical = CultureInfo.GetCultureInfo(language).Name;
        if (canonical.Length == 0)
            throw new ArgumentException("A specific language is required.", nameof(language));
        return canonical;
    }

    internal static bool IsLetter(System.Text.Rune rune) => System.Text.Rune.GetUnicodeCategory(rune) is
        UnicodeCategory.UppercaseLetter or UnicodeCategory.LowercaseLetter or UnicodeCategory.TitlecaseLetter or
        UnicodeCategory.ModifierLetter or UnicodeCategory.OtherLetter;

    internal static bool IsMark(System.Text.Rune rune) => System.Text.Rune.GetUnicodeCategory(rune) is
        UnicodeCategory.NonSpacingMark or UnicodeCategory.SpacingCombiningMark or UnicodeCategory.EnclosingMark;
}
