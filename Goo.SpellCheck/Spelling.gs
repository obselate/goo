package Goo.SpellCheck

import Goo
import System
import System.Collections.Generic
import System.Globalization
import System.Text
import System.Threading
import System.Threading.Tasks

/// Reports a spelling operation independently of the returned words.
public enum SpellingStatus {
    /// The checker completed the operation.
    Success,
    /// The platform or optional native checker is unavailable.
    Unsupported,
    /// No dictionary supports the requested language.
    LanguageUnavailable,
    /// Checking is disabled, the owner closed, or editing is read-only.
    Disabled,
    /// The caller cancelled the operation.
    Cancelled,
    /// The document, selection or checker language changed.
    Stale,
    /// The requested text exceeds the checker limit.
    TooLarge,
    /// The checker could not complete the operation.
    Failed
}

/// A misspelled word and its absolute UTF-16 source range.
public data struct Misspelling(Range TextRange, Word string) { }

/// Owned spelling results for one immutable document version and language.
public data class SpellingResult(Status SpellingStatus, Version int64, Language string,
    Errors IReadOnlyList[Misspelling], Error string = "") { }

/// Owned suggestions for one word at an absolute UTF-16 source range.
public data class SpellingSuggestions(Status SpellingStatus, Version int64, Language string,
    Range TextRange, Word string, Values IReadOnlyList[string], Error string = "") { }

/// Checks immutable text without changing the document or learning words.
public interface ISpellingService {
    /// Checks a UTF-16 range, returning absolute source offsets.
    func CheckAsync(snapshot TextSnapshot, $range TextRange, language string,
        cancellation CancellationToken = default(CancellationToken)) Task[SpellingResult];

    /// Suggests replacements for the word in a UTF-16 source range.
    func SuggestAsync(snapshot TextSnapshot, $range TextRange, language string,
        cancellation CancellationToken = default(CancellationToken)) Task[SpellingSuggestions];
}

internal shared class SpellingInput {
    internal const MaxTextLength int32 = 65536
    internal const MaxSuggestions int32 = 16

    internal func Validate(snapshot TextSnapshot, $range TextRange, language string) string {
        ArgumentNullException.ThrowIfNull(snapshot)
        ArgumentException.ThrowIfNullOrWhiteSpace(language)
        if $range.Start < 0 || $range.Length < 0 || int64($range.Start) + $range.Length > snapshot.Length {
            throw ArgumentOutOfRangeException(nameof($range))
        }
        let canonical = CultureInfo.GetCultureInfo(language).Name
        if canonical.Length == 0 {
            throw ArgumentException("A specific language is required.", nameof(language))
        }
        return canonical
    }

    internal func IsLetter(rune Rune) bool -> Rune.GetUnicodeCategory(rune) is
        UnicodeCategory.UppercaseLetter or UnicodeCategory.LowercaseLetter or UnicodeCategory.TitlecaseLetter or
        UnicodeCategory.ModifierLetter or UnicodeCategory.OtherLetter

    internal func IsMark(rune Rune) bool -> Rune.GetUnicodeCategory(rune) is
        UnicodeCategory.NonSpacingMark or UnicodeCategory.SpacingCombiningMark or UnicodeCategory.EnclosingMark
}
