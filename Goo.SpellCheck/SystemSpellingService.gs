package Goo.SpellCheck

import Goo
import System
import System.Threading
import System.Threading.Tasks

/// Uses Windows ISpellChecker or macOS NSSpellChecker. Other hosts return Unsupported.
class SystemSpellingService : ISpellingService {
    /// Checks a snapshot range using an installed dictionary for the explicit language.
    func CheckAsync(
        snapshot TextSnapshot,
        $range TextRange,
        language string,
        cancellation CancellationToken = default(CancellationToken)
    ) Task[SpellingResult] {
        var language = language
        language = SpellingInput.Validate(snapshot, $range, language)
        if cancellation.IsCancellationRequested {
            return Task.FromResult(
                SpellingResult(SpellingStatus.Cancelled, snapshot.Version, language, Array.Empty[Misspelling]())
            )
        }
        if $range.Length > SpellingInput.MaxTextLength {
            return Task.FromResult(SpellingResult(SpellingStatus.TooLarge, snapshot.Version, language, Array.Empty[Misspelling]()))
        }
        if OperatingSystem.IsWindows() {
            return Task.Run[SpellingResult](() -> WindowsSpelling.Check(snapshot, $range, language, cancellation))
        }
        if OperatingSystem.IsMacOS() {
            return Task.FromResult(MacSpelling.Check(snapshot, $range, language, cancellation))
        }
        return Task.FromResult(SpellingResult(SpellingStatus.Unsupported, snapshot.Version, language, Array.Empty[Misspelling]()))
    }

    /// Gets bounded replacement choices without learning or automatically correcting words.
    func SuggestAsync(
        snapshot TextSnapshot,
        $range TextRange,
        language string,
        cancellation CancellationToken = default(CancellationToken)
    ) Task[SpellingSuggestions] {
        var language = language
        language = SpellingInput.Validate(snapshot, $range, language)
        if cancellation.IsCancellationRequested {
            return Task.FromResult(
                SpellingSuggestions(SpellingStatus.Cancelled, snapshot.Version, language, $range, "", Array.Empty[string]())
            )
        }
        if $range.Length > SpellingInput.MaxTextLength {
            return Task.FromResult(
                SpellingSuggestions(SpellingStatus.TooLarge, snapshot.Version, language, $range, "", Array.Empty[string]())
            )
        }
        if OperatingSystem.IsWindows() {
            return Task.Run[SpellingSuggestions](
                () -> WindowsSpelling.Suggest(snapshot, $range, language, cancellation)
            )
        }
        if OperatingSystem.IsMacOS() {
            return Task.FromResult(MacSpelling.Suggest(snapshot, $range, language, cancellation))
        }
        return Task.FromResult(
            SpellingSuggestions(SpellingStatus.Unsupported, snapshot.Version, language, $range, "", Array.Empty[string]())
        )
    }
}
