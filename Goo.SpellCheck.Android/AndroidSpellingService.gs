package Goo.SpellCheck

import Android.Content
import Android.OS
import Android.Views.TextService
import Goo
import Java.Lang
import Java.Util
import System
import System.Collections.Generic
import System.Threading
import System.Threading.Tasks

/// Uses the user-enabled Android spell service. Submit only text that the app permits the service to
/// read.
class AndroidSpellingService : ISpellingService {
    private let context Context

    /// Creates an adapter using the application context. Requests must start on the Android main thread.
    init(context Context) {
        ArgumentNullException.ThrowIfNull(context, paramName: "context")
        this.context = context.ApplicationContext ?? context
    }

    /// Checks a snapshot with an explicit locale and absolute UTF-16 result ranges.
    async func CheckAsync(
        snapshot TextSnapshot,
        $range TextRange,
        language string,
        cancellation CancellationToken = default(CancellationToken)
    ) SpellingResult {
        var language = language
        language = SpellingInput.Validate(snapshot, $range, language)
        let result = await RequestAsync(snapshot, $range, language, cancellation).ConfigureAwait(false)
        return SpellingResult(result.Status, snapshot.Version, language, result.Errors, result.Error)
    }

    /// Gets suggestions for the supplied word through the same sentence-suggestion API.
    async func SuggestAsync(
        snapshot TextSnapshot,
        $range TextRange,
        language string,
        cancellation CancellationToken = default(CancellationToken)
    ) SpellingSuggestions {
        var $range = $range
        var language = language
        language = SpellingInput.Validate(snapshot, $range, language)
        let result = await RequestAsync(snapshot, $range, language, cancellation).ConfigureAwait(false)
        return SpellingSuggestions(
            result.Status,
            snapshot.Version,
            language,
            $range,
            if $range.Length <= SpellingInput.MaxTextLength {
                snapshot.GetText($range)
            } else {
                ""
            },
            result.Values,
            result.Error
        )
    }

    private async func RequestAsync(
        snapshot TextSnapshot,
        $range TextRange,
        language string,
        cancellation CancellationToken
    ) NativeResult {
        var $range = $range
        if Looper.MyLooper() != Looper.MainLooper {
            throw InvalidOperationException("Start Android spelling requests on the Android main thread.")
        }
        if cancellation.IsCancellationRequested {
            return NativeResult(SpellingStatus.Cancelled, []Misspelling{}, []string{})
        }
        if $range.Length > SpellingInput.MaxTextLength {
            return NativeResult(SpellingStatus.TooLarge, []Misspelling{}, []string{})
        }
        if $range.Length == 0 {
            return NativeResult(SpellingStatus.Success, []Misspelling{}, []string{})
        }
        using let manager TextServicesManager? = context.GetSystemService(
            Context.TextServicesManagerService
        ) as TextServicesManager
        if manager == nil {
            return NativeResult(SpellingStatus.Unsupported, []Misspelling{}, []string{})
        }
        if !manager.IsSpellCheckerEnabled {
            return NativeResult(SpellingStatus.Disabled, []Misspelling{}, []string{})
        }
        using let request = Request(snapshot.GetText($range), $range.Start)
        using let handler = Handler(Looper.MainLooper!!)
        using let registration = cancellation.Register(() -> handler.Post(() -> request.Cancel()))
        try {
            using let locale = Locale.ForLanguageTag(language)
            using let builder = SpellCheckerSession.SpellCheckerSessionParams.Builder()
            builder.SetLocale(locale)
            builder.SetShouldReferToSpellCheckerLanguageSettings(false)
            using let parameters = builder.Build()
            request.Session = manager.NewSpellCheckerSession(parameters, context.MainExecutor!!, request)
            if request.Session == nil {
                return NativeResult(SpellingStatus.LanguageUnavailable, []Misspelling{}, []string{})
            }
            using let info = TextInfo(request.Text, Request.Cookie, Request.Sequence)
            request.Session!!.GetSentenceSuggestions([]TextInfo{info}, SpellingInput.MaxSuggestions)
            return await request.Completion.Task.ConfigureAwait(false)
        } catch (SecurityException) {
            return NativeResult(
                SpellingStatus.Disabled,
                []Misspelling{},
                []string{},
                "The Android spell service denied access."
            )
        } catch (IllegalArgumentException) {
            return NativeResult(SpellingStatus.LanguageUnavailable, []Misspelling{}, []string{})
        } finally {
            if Looper.MyLooper() == Looper.MainLooper {
                request.Close()
            } else {
                let closed = TaskCompletionSource(TaskCreationOptions.RunContinuationsAsynchronously)
                handler.Post(
                    () -> {
                        request.Close()
                        closed.TrySetResult()
                    }
                )
                await closed.Task.ConfigureAwait(false)
            }
        }
    }

    private data class NativeResult(
        Status SpellingStatus,
        Errors IReadOnlyList[Misspelling],
        Values IReadOnlyList[string],
        Error string = ""
    ) : IEquatable[NativeResult] { }

    private class Request(text string, sourceStart int32) : Java
        .Lang
        .Object,
    SpellCheckerSession
        .ISpellCheckerSessionListener {
        internal let Text string = text
        internal let Completion TaskCompletionSource[NativeResult] = TaskCompletionSource[NativeResult](
            TaskCreationOptions.RunContinuationsAsynchronously
        )
        internal var Session SpellCheckerSession?

        func OnGetSentenceSuggestions(results[]?SentenceSuggestionsInfo) {
            if Completion.Task.IsCompleted {
                return
            }
            let errors = List[Misspelling]()
            let values = List[string]()
            for sentence in results ?? System.Array.Empty[SentenceSuggestionsInfo]() {
                for var i = 0; i < sentence.SuggestionsCount; i++ {
                    using let info SuggestionsInfo? = sentence.GetSuggestionsInfoAt(i)
                    if info == nil || info.Cookie != Cookie || info.Sequence != Sequence {
                        continue
                    }
                    let start = sentence.GetOffsetAt(i)
                    let length = sentence.GetLengthAt(i)
                    if start < 0 || length <= 0 || int64(start) + int64(length) > int64(Text.Length) {
                        Completion.TrySetResult(
                            NativeResult(
                                SpellingStatus.Failed,
                                []Misspelling{},
                                []string{},
                                "The Android checker returned an invalid range."
                            )
                        )
                        return
                    }
                    let attributes = SuggestionsAttributes(info.SuggestionsAttributes)
                    if (attributes & SuggestionsAttributes.LooksLikeTypo) != 0 &&
                        (attributes & SuggestionsAttributes.InTheDictionary) == 0 {
                        errors.Add(Misspelling(TextRange(sourceStart + start, length), Text.Substring(start, length)))
                    }
                    if start != 0 ||
                        length != Text.Length ||
                        (attributes & SuggestionsAttributes.DontShowUiForSuggestions) != 0 {
                        continue
                    }
                    for var index = 0;
                        index < info.SuggestionsCount &&
                        values.Count < SpellingInput.MaxSuggestions;
                        index++ {
                        let value = info.GetSuggestionAt(index)
                        if !string.IsNullOrEmpty(value) {
                            values.Add(value)
                        }
                    }
                }
            }
            Completion.TrySetResult(NativeResult(SpellingStatus.Success, errors.AsReadOnly(), values.AsReadOnly()))
        }

        func OnGetSuggestions(results[]?SuggestionsInfo) -> Completion.TrySetResult(
            NativeResult(
                SpellingStatus.Failed,
                []Misspelling{},
                []string{},
                "Unexpected legacy Android spelling callback."
            )
        )

        internal func Cancel() {
            Session?.Cancel()
            Completion.TrySetResult(NativeResult(SpellingStatus.Cancelled, []Misspelling{}, []string{}))
        }

        internal func Close() {
            Session?.Close()
            Session?.Dispose()
            Session = nil
        }

        shared {
            internal const Cookie int32 = 717
            internal const Sequence int32 = 1
        }
    }
}
