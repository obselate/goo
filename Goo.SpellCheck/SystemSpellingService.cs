namespace Goo.SpellCheck;

/// <summary>Uses Windows ISpellChecker or macOS NSSpellChecker. Other hosts return Unsupported.</summary>
public sealed class SystemSpellingService : ISpellingService
{
    /// <summary>Checks a snapshot range using an installed dictionary for the explicit language.</summary>
    public Task<SpellingResult> CheckAsync(TextSnapshot snapshot, TextRange range, string language,
        CancellationToken cancellation = default)
    {
        language = SpellingInput.Validate(snapshot, range, language);
        if (cancellation.IsCancellationRequested)
            return Task.FromResult(new SpellingResult(SpellingStatus.Cancelled, snapshot.Version, language, []));
        if (range.Length > SpellingInput.MaxTextLength)
            return Task.FromResult(new SpellingResult(SpellingStatus.TooLarge, snapshot.Version, language, []));
        if (OperatingSystem.IsWindows())
            return Task.Run(() => WindowsSpelling.Check(snapshot, range, language, cancellation));
        if (OperatingSystem.IsMacOS())
            return Task.FromResult(MacSpelling.Check(snapshot, range, language, cancellation));
        return Task.FromResult(new SpellingResult(SpellingStatus.Unsupported, snapshot.Version, language, []));
    }

    /// <summary>Gets bounded replacement choices without learning or automatically correcting words.</summary>
    public Task<SpellingSuggestions> SuggestAsync(TextSnapshot snapshot, TextRange range, string language,
        CancellationToken cancellation = default)
    {
        language = SpellingInput.Validate(snapshot, range, language);
        if (cancellation.IsCancellationRequested)
            return Task.FromResult(new SpellingSuggestions(SpellingStatus.Cancelled, snapshot.Version, language,
                range, "", []));
        if (range.Length > SpellingInput.MaxTextLength)
            return Task.FromResult(new SpellingSuggestions(SpellingStatus.TooLarge, snapshot.Version, language,
                range, "", []));
        if (OperatingSystem.IsWindows())
            return Task.Run(() => WindowsSpelling.Suggest(snapshot, range, language, cancellation));
        if (OperatingSystem.IsMacOS())
            return Task.FromResult(MacSpelling.Suggest(snapshot, range, language, cancellation));
        return Task.FromResult(new SpellingSuggestions(SpellingStatus.Unsupported, snapshot.Version, language,
            range, "", []));
    }
}
