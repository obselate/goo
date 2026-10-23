using Android.Content;
using Android.OS;
using Android.Views.TextService;
using Java.Util;

namespace Goo.SpellCheck;

/// <summary>Uses the user-enabled Android spell service. Submit only text that the app permits the service to read.</summary>
public sealed class AndroidSpellingService : ISpellingService
{
    private readonly Context context;

    /// <summary>Creates an adapter using the application context. Requests must start on the Android main thread.</summary>
    public AndroidSpellingService(Context context)
    {
        ArgumentNullException.ThrowIfNull(context);
        this.context = context.ApplicationContext ?? context;
    }

    /// <summary>Checks a snapshot with an explicit locale and absolute UTF-16 result ranges.</summary>
    public async Task<SpellingResult> CheckAsync(TextSnapshot snapshot, TextRange range, string language,
        CancellationToken cancellation = default)
    {
        language = SpellingInput.Validate(snapshot, range, language);
        var result = await RequestAsync(snapshot, range, language, cancellation).ConfigureAwait(false);
        return new SpellingResult(result.Status, snapshot.Version, language, result.Errors, result.Error);
    }

    /// <summary>Gets suggestions for the supplied word through the same sentence-suggestion API.</summary>
    public async Task<SpellingSuggestions> SuggestAsync(TextSnapshot snapshot, TextRange range, string language,
        CancellationToken cancellation = default)
    {
        language = SpellingInput.Validate(snapshot, range, language);
        var result = await RequestAsync(snapshot, range, language, cancellation).ConfigureAwait(false);
        return new SpellingSuggestions(result.Status, snapshot.Version, language, range,
            range.Length <= SpellingInput.MaxTextLength ? snapshot.GetText(range) : "", result.Values, result.Error);
    }

    private async Task<NativeResult> RequestAsync(TextSnapshot snapshot, TextRange range, string language,
        CancellationToken cancellation)
    {
        if (Looper.MyLooper() != Looper.MainLooper)
            throw new InvalidOperationException("Start Android spelling requests on the Android main thread.");
        if (cancellation.IsCancellationRequested)
            return new(SpellingStatus.Cancelled, [], []);
        if (range.Length > SpellingInput.MaxTextLength)
            return new(SpellingStatus.TooLarge, [], []);
        if (range.Length == 0)
            return new(SpellingStatus.Success, [], []);
        using var manager = context.GetSystemService(Context.TextServicesManagerService) as TextServicesManager;
        if (manager == null)
            return new(SpellingStatus.Unsupported, [], []);
        if (!manager.IsSpellCheckerEnabled)
            return new(SpellingStatus.Disabled, [], []);
        using var request = new Request(snapshot.GetText(range), range.Start);
        using var handler = new Handler(Looper.MainLooper!);
        using var registration = cancellation.Register(() => handler.Post(() => request.Cancel()));
        try
        {
            using var locale = Locale.ForLanguageTag(language);
            using var builder = new SpellCheckerSession.SpellCheckerSessionParams.Builder();
            builder.SetLocale(locale);
            builder.SetShouldReferToSpellCheckerLanguageSettings(false);
            using var parameters = builder.Build();
            request.Session = manager.NewSpellCheckerSession(parameters, context.MainExecutor!, request);
            if (request.Session == null)
                return new(SpellingStatus.LanguageUnavailable, [], []);
            using var info = new TextInfo(request.Text, Request.Cookie, Request.Sequence);
            request.Session.GetSentenceSuggestions([info], SpellingInput.MaxSuggestions);
            return await request.Completion.Task.ConfigureAwait(false);
        }
        catch (Java.Lang.SecurityException)
        {
            return new(SpellingStatus.Disabled, [], [], "The Android spell service denied access.");
        }
        catch (Java.Lang.IllegalArgumentException)
        {
            return new(SpellingStatus.LanguageUnavailable, [], []);
        }
        finally
        {
            if (Looper.MyLooper() == Looper.MainLooper)
                request.Close();
            else
            {
                var closed = new TaskCompletionSource(TaskCreationOptions.RunContinuationsAsynchronously);
                handler.Post(() => { request.Close(); closed.TrySetResult(); });
                await closed.Task.ConfigureAwait(false);
            }
        }
    }

    private sealed record NativeResult(SpellingStatus Status, IReadOnlyList<Misspelling> Errors,
        IReadOnlyList<string> Values, string Error = "");

    private sealed class Request(string text, int sourceStart) : Java.Lang.Object,
        SpellCheckerSession.ISpellCheckerSessionListener
    {
        internal const int Cookie = 717;
        internal const int Sequence = 1;
        internal readonly string Text = text;
        internal readonly TaskCompletionSource<NativeResult> Completion =
            new(TaskCreationOptions.RunContinuationsAsynchronously);
        internal SpellCheckerSession? Session;

        public void OnGetSentenceSuggestions(SentenceSuggestionsInfo[]? results)
        {
            if (Completion.Task.IsCompleted)
                return;
            var errors = new List<Misspelling>();
            var values = new List<string>();
            foreach (var sentence in results ?? [])
            {
                for (var i = 0; i < sentence.SuggestionsCount; i++)
                {
                    using var info = sentence.GetSuggestionsInfoAt(i);
                    if (info == null || info.Cookie != Cookie || info.Sequence != Sequence)
                        continue;
                    var start = sentence.GetOffsetAt(i);
                    var length = sentence.GetLengthAt(i);
                    if (start < 0 || length <= 0 || (long)start + length > Text.Length)
                    {
                        Completion.TrySetResult(new(SpellingStatus.Failed, [], [],
                            "The Android checker returned an invalid range."));
                        return;
                    }
                    var attributes = (SuggestionsAttributes)info.SuggestionsAttributes;
                    if ((attributes & SuggestionsAttributes.LooksLikeTypo) != 0 &&
                        (attributes & SuggestionsAttributes.InTheDictionary) == 0)
                        errors.Add(new Misspelling(new TextRange(sourceStart + start, length), Text.Substring(start, length)));
                    if (start != 0 || length != Text.Length ||
                        (attributes & SuggestionsAttributes.DontShowUiForSuggestions) != 0)
                        continue;
                    for (var index = 0; index < info.SuggestionsCount && values.Count < SpellingInput.MaxSuggestions; index++)
                    {
                        var value = info.GetSuggestionAt(index);
                        if (!string.IsNullOrEmpty(value))
                            values.Add(value);
                    }
                }
            }
            Completion.TrySetResult(new(SpellingStatus.Success, errors.AsReadOnly(), values.AsReadOnly()));
        }

        public void OnGetSuggestions(SuggestionsInfo[]? results) =>
            Completion.TrySetResult(new(SpellingStatus.Failed, [], [], "Unexpected legacy Android spelling callback."));

        internal void Cancel()
        {
            Session?.Cancel();
            Completion.TrySetResult(new(SpellingStatus.Cancelled, [], []));
        }

        internal void Close()
        {
            Session?.Close();
            Session?.Dispose();
            Session = null;
        }
    }
}
