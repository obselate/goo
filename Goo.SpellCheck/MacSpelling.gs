package Goo.SpellCheck

import Goo
import System
import System.Collections.Generic
import System.Runtime.InteropServices
import System.Threading

internal unsafe shared class MacSpelling {
    @StructLayout(LayoutKind.Sequential)
    private struct Range(location nuint, length nuint) {
        internal let Location nuint = location
        internal let Length nuint = length
    }

    private const ObjectiveC string = "/usr/lib/libobjc.A.dylib"
    private const AppKit string = "/System/Library/Frameworks/AppKit.framework/AppKit"
    private let AppKitLibrary nint = LoadAppKit()

    internal func Check(
        snapshot TextSnapshot,
        $range TextRange,
        language string,
        cancellation CancellationToken
    ) SpellingResult {
        RequireMainThread()
        let errors = List[Misspelling]()
        let pool = objc_autoreleasePoolPush()
        var checker nint = 0
        var document nint = 0
        try {
            let status = Open(language, out checker, out document, out var nativeLanguage)
            if status != SpellingStatus.Success {
                return SpellingResult(status, snapshot.Version, language, Array.Empty[Misspelling]())
            }
            let text = snapshot.GetText($range)
            let nativeText = MacSpelling.String(text)
            var start nuint = 0
            while start < nuint(text.Length) && !cancellation.IsCancellationRequested {
                let error = CheckWord(
                    checker,
                    Selector("checkSpellingOfString:startingAt:language:wrap:inSpellDocumentWithTag:wordCount:"),
                    nativeText,
                    nint(start),
                    nativeLanguage,
                    0,
                    document,
                    0
                )
                if error.Location == nuint.MaxValue {
                    break
                }
                if error.Location < start ||
                    error.Length == 0 ||
                    error.Location > nuint(text.Length) ||
                    error.Length > nuint(text.Length) - error
                    .Location {
                    return SpellingResult(
                        SpellingStatus.Failed,
                        snapshot.Version,
                        language,
                        Array.Empty[Misspelling](),
                        "The macOS checker returned an invalid range."
                    )
                }
                errors.Add(
                    Misspelling(
                        TextRange($range.Start + int32(error.Location), int32(error.Length)),
                        text.Substring(int32(error.Location), int32(error.Length))
                    )
                )
                start = error.Location + error.Length
            }
            return SpellingResult(
                if cancellation.IsCancellationRequested {
                    SpellingStatus.Cancelled
                } else {
                    SpellingStatus.Success
                },
                snapshot.Version,
                language,
                if cancellation.IsCancellationRequested {
                    cast[IReadOnlyList[Misspelling]](Array.Empty[Misspelling]())
                } else {
                    cast[IReadOnlyList[Misspelling]](errors.AsReadOnly())
                }
            )
        } finally {
            if checker != 0 && document != 0 {
                SendVoid(checker, Selector("closeSpellDocumentWithTag:"), document)
            }
            objc_autoreleasePoolPop(pool)
        }
    }

    internal func Suggest(
        snapshot TextSnapshot,
        $range TextRange,
        language string,
        cancellation CancellationToken
    ) SpellingSuggestions {
        RequireMainThread()
        let pool = objc_autoreleasePoolPush()
        let word = snapshot.GetText($range)
        var checker nint = 0
        var document nint = 0
        try {
            let status = Open(language, out checker, out document, out var nativeLanguage)
            if status != SpellingStatus.Success {
                return SpellingSuggestions(status, snapshot.Version, language, $range, word, Array.Empty[string]())
            }
            let array = Guesses(
                checker,
                Selector("guessesForWordRange:inString:language:inSpellDocumentWithTag:"),
                MacSpelling.Range(0, nuint(word.Length)),
                MacSpelling.String(word),
                nativeLanguage,
                document
            )
            let values = List[string]()
            let count = if array == 0 {
                0
            } else {
                int32(Math.Min(nuint(SpellingInput.MaxSuggestions), nuint(Send(array, Selector("count")))))
            }
            for var i = 0; i < count && !cancellation.IsCancellationRequested; i++ {
                values.Add(ManagedString(SendAt(array, Selector("objectAtIndex:"), nuint(i))))
            }
            return SpellingSuggestions(
                if cancellation.IsCancellationRequested {
                    SpellingStatus.Cancelled
                } else {
                    SpellingStatus.Success
                },
                snapshot.Version,
                language,
                $range,
                word,
                if cancellation.IsCancellationRequested {
                    cast[IReadOnlyList[string]](Array.Empty[string]())
                } else {
                    cast[IReadOnlyList[string]](values.AsReadOnly())
                }
            )
        } finally {
            if checker != 0 && document != 0 {
                SendVoid(checker, Selector("closeSpellDocumentWithTag:"), document)
            }
            objc_autoreleasePoolPop(pool)
        }
    }

    private func Open(language string, out checker nint, out document nint, out nativeLanguage nint) SpellingStatus {
        checker = (document = (nativeLanguage = 0))
        if AppKitLibrary == 0 {
            return SpellingStatus.Unsupported
        }
        let type = objc_getClass("NSSpellChecker")
        if type == 0 {
            return SpellingStatus.Unsupported
        }
        checker = Send(type, Selector("sharedSpellChecker"))
        if checker == 0 {
            return SpellingStatus.Unsupported
        }
        let languages = Send(checker, Selector("availableLanguages"))
        let count = if languages == 0 {
            0
        } else {
            nuint(Send(languages, Selector("count")))
        }
        for var index nuint = 0; index < count; index++ {
            let candidate = SendAt(languages, Selector("objectAtIndex:"), index)
            if string.Equals(ManagedString(candidate).Replace('_', '-'), language, StringComparison.OrdinalIgnoreCase) {
                nativeLanguage = candidate
                break
            }
        }
        if nativeLanguage == 0 {
            return SpellingStatus.LanguageUnavailable
        }
        document = Send(type, Selector("uniqueSpellDocumentTag"))
        return SpellingStatus.Success
    }

    private func LoadAppKit() nint -> if NativeLibrary.TryLoad(AppKit, out var library) {
        library
    } else {
        0
    }

    private func RequireMainThread() {
        if AppKitLibrary != 0 && Send(objc_getClass("NSThread"), Selector("isMainThread")) == 0 {
            throw InvalidOperationException("Use the macOS spelling service on the AppKit main thread.")
        }
    }

    private func String(value string) nint {
        fixed characters *char = value {
            let allocated = Send(objc_getClass("NSString"), Selector("alloc"))
            return Send(
                SendString(allocated, Selector("initWithCharacters:length:"), characters, nuint(value.Length)),
                Selector("autorelease")
            )
        }
    }

    private func ManagedString(value nint) string {
        let length = checked(int32(Send(value, Selector("length"))))
        return string.Create(
            length,
            value,
            (destination Span[char], source nint) -> {
                fixed characters *char = destination {
                    CopyCharacters(
                        source,
                        Selector("getCharacters:range:"),
                        characters,
                        MacSpelling.Range(0, nuint(destination.Length))
                    )
                }
            }
        )
    }

    private func Selector(name string) nint -> sel_registerName(name)

    @DllImport("/usr/lib/libobjc.A.dylib")
    private func objc_getClass(name string) nint;

    @DllImport("/usr/lib/libobjc.A.dylib")
    private func sel_registerName(name string) nint;

    @DllImport("/usr/lib/libobjc.A.dylib")
    private func objc_autoreleasePoolPush() nint;

    @DllImport("/usr/lib/libobjc.A.dylib")
    private func objc_autoreleasePoolPop(pool nint);

    @DllImport("/usr/lib/libobjc.A.dylib", EntryPoint = "objc_msgSend")
    private func Send(receiver nint, selector nint) nint;

    @DllImport("/usr/lib/libobjc.A.dylib", EntryPoint = "objc_msgSend")
    private func SendAt(receiver nint, selector nint, index nuint) nint;

    @DllImport("/usr/lib/libobjc.A.dylib", EntryPoint = "objc_msgSend")
    private func SendVoid(receiver nint, selector nint, value nint);

    @DllImport("/usr/lib/libobjc.A.dylib", EntryPoint = "objc_msgSend")
    private func SendString(receiver nint, selector nint, value *char, length nuint) nint;

    @DllImport("/usr/lib/libobjc.A.dylib", EntryPoint = "objc_msgSend")
    private func CopyCharacters(receiver nint, selector nint, destination *char, $range MacSpelling.Range);

    @DllImport("/usr/lib/libobjc.A.dylib", EntryPoint = "objc_msgSend")
    private func CheckWord(
        receiver nint,
        selector nint,
        text nint,
        start nint,
        language nint,
        wrap uint8,
        document nint,
        count nint
    ) MacSpelling.Range;

    @DllImport("/usr/lib/libobjc.A.dylib", EntryPoint = "objc_msgSend")
    private func Guesses(
        receiver nint,
        selector nint,
        $range MacSpelling.Range,
        text nint,
        language nint,
        document nint
    ) nint;
}
