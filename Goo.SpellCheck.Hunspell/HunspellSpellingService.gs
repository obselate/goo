package Goo.SpellCheck

import Goo
import System
import System.Collections.Generic
import System.Globalization
import System.IO
import System.Runtime.InteropServices
import System.Text
import System.Threading
import System.Threading.Tasks
import SystemObject = System.Object

/// Uses the installed Linux Hunspell 1.7 library and app-selected dictionary files. No assets are
/// downloaded.
unsafe class HunspellSpellingService : ISpellingService, IDisposable {
    private let gate object = SystemObject()
    private let language string
    private let affPath string
    private let dictionaryPath string
    private var library nint
    private var handle nint
    private var encoding Encoding = Encoding.UTF8
    private var wordCharacters string = ""
    private var wordBuffer[]uint8 = System.Array.Empty[uint8]()
    private var initialization SpellingStatus?
    private var disposed bool
    private var spell unmanaged[Cdecl](nint, *uint8) -> int32
    private var suggest unmanaged[Cdecl](nint, *nint, *uint8) -> int32
    private var freeList unmanaged[Cdecl](nint, *nint, int32) -> void
    private var destroy unmanaged[Cdecl](nint) -> void

    /// Configures the explicit BCP 47 language and .aff/.dic paths. Missing native support is an operation
    /// status.
    init(language string, affPath string, dictionaryPath string) {
        ArgumentException.ThrowIfNullOrWhiteSpace(language, paramName: "language")
        ArgumentException.ThrowIfNullOrWhiteSpace(affPath, paramName: "affPath")
        ArgumentException.ThrowIfNullOrWhiteSpace(dictionaryPath, paramName: "dictionaryPath")
        this.language = CultureInfo.GetCultureInfo(language).Name
        this.affPath = Path.GetFullPath(affPath)
        this.dictionaryPath = Path.GetFullPath(dictionaryPath)
    }

    /// Checks dictionary words and returns source UTF-16 ranges without normalizing the input.
    func CheckAsync(
        snapshot TextSnapshot,
        $range TextRange,
        language string,
        cancellation CancellationToken = default(CancellationToken)
    ) Task[SpellingResult] {
        var language = language
        language = SpellingInput.Validate(snapshot, $range, language)
        return Task.Run[SpellingResult](
            () -> {
                try {
                    return Check(snapshot, $range, language, cancellation)
                } catch (EncoderFallbackException) {
                    return SpellingResult(
                        SpellingStatus.Unsupported,
                        snapshot.Version,
                        language,
                        []Misspelling{},
                        "The dictionary encoding cannot represent this text."
                    )
                } catch (DecoderFallbackException) {
                    return SpellingResult(
                        SpellingStatus.Failed,
                        snapshot.Version,
                        language,
                        []Misspelling{},
                        "The dictionary returned invalid encoded text."
                    )
                }
            }
        )
    }

    /// Gets dictionary suggestions, decoding the dictionary's declared encoding.
    func SuggestAsync(
        snapshot TextSnapshot,
        $range TextRange,
        language string,
        cancellation CancellationToken = default(CancellationToken)
    ) Task[SpellingSuggestions] {
        var language = language
        language = SpellingInput.Validate(snapshot, $range, language)
        return Task.Run[SpellingSuggestions](
            () -> {
                try {
                    return Suggest(snapshot, $range, language, cancellation)
                } catch (EncoderFallbackException) {
                    return SpellingSuggestions(
                        SpellingStatus.Unsupported,
                        snapshot.Version,
                        language,
                        $range,
                        "",
                        []string{},
                        "The dictionary encoding cannot represent this text."
                    )
                } catch (DecoderFallbackException) {
                    return SpellingSuggestions(
                        SpellingStatus.Failed,
                        snapshot.Version,
                        language,
                        $range,
                        "",
                        []string{},
                        "The dictionary returned invalid encoded text."
                    )
                }
            }
        )
    }

    /// Waits for any active request and releases the dictionary and system library.
    func Dispose() {
        lock gate {
            if disposed {
                return
            }
            disposed = true
            if handle != 0 {
                destroy(handle)
            }
            handle = 0
            if library != 0 {
                NativeLibrary.Free(library)
            }
            library = 0
            wordBuffer = System.Array.Empty[uint8]()
        }
    }

    private func Check(
        snapshot TextSnapshot,
        $range TextRange,
        requestedLanguage string,
        cancellation CancellationToken
    ) SpellingResult {
        var $range = $range
        lock gate {
            let status = Ready(requestedLanguage, $range, cancellation)
            if status != SpellingStatus.Success {
                return SpellingResult(status, snapshot.Version, requestedLanguage, []Misspelling{})
            }
            let text = snapshot.GetText($range)
            let errors = List[Misspelling]()
            var cursor = 0
            while cursor < text.Length && !cancellation.IsCancellationRequested {
                Rune.DecodeFromUtf16(text.AsSpan(cursor), out var rune, out var width)
                if !SpellingInput.IsLetter(rune) {
                    cursor += width
                    continue
                }
                let start = cursor
                cursor += width
                while cursor < text.Length {
                    Rune.DecodeFromUtf16(text.AsSpan(cursor), out rune, out width)
                    if !SpellingInput.IsLetter(rune) && !SpellingInput.IsMark(rune) && !IsWordCharacter(rune) {
                        break
                    }
                    cursor += width
                }
                EncodeWord(text.AsSpan(start, cursor - start))
                fixed nativeWord *uint8 = wordBuffer {
                    if spell(handle, nativeWord) == 0 {
                        errors.Add(
                            Misspelling(
                                TextRange($range.Start + start, cursor - start),
                                text.Substring(start, cursor - start)
                            )
                        )
                    }
                }
            }
            return SpellingResult(
                if cancellation.IsCancellationRequested {
                    SpellingStatus.Cancelled
                } else {
                    SpellingStatus.Success
                },
                snapshot.Version,
                requestedLanguage,
                if cancellation.IsCancellationRequested {
                    cast[IReadOnlyList[Misspelling]](Array.Empty[Misspelling]())
                } else {
                    cast[IReadOnlyList[Misspelling]](errors.AsReadOnly())
                }
            )
        }
    }

    private func Suggest(
        snapshot TextSnapshot,
        $range TextRange,
        requestedLanguage string,
        cancellation CancellationToken
    ) SpellingSuggestions {
        var $range = $range
        lock gate {
            let status = Ready(requestedLanguage, $range, cancellation)
            let word = if $range.Length <= SpellingInput.MaxTextLength {
                snapshot.GetText($range)
            } else {
                ""
            }
            if status != SpellingStatus.Success {
                return SpellingSuggestions(status, snapshot.Version, requestedLanguage, $range, word, []string{})
            }
            EncodeWord(word.AsSpan())
            var list nint = 0
            var count int32
            fixed nativeWord *uint8 = wordBuffer {
                count = suggest(handle, &list, nativeWord)
            }
            try {
                if count < 0 || (count != 0 && list == 0) {
                    return SpellingSuggestions(
                        SpellingStatus.Failed,
                        snapshot.Version,
                        requestedLanguage,
                        $range,
                        word,
                        []string{},
                        "Hunspell returned an invalid suggestion list."
                    )
                }
                let values = List[string](Math.Min(count, SpellingInput.MaxSuggestions))
                for var i = 0;
                    i < count &&
                    i < SpellingInput.MaxSuggestions &&
                    !cancellation.IsCancellationRequested;
                    i++ {
                    values.Add(Decode((*nint(list))[i]))
                }
                return SpellingSuggestions(
                    if cancellation.IsCancellationRequested {
                        SpellingStatus.Cancelled
                    } else {
                        SpellingStatus.Success
                    },
                    snapshot.Version,
                    requestedLanguage,
                    $range,
                    word,
                    if cancellation.IsCancellationRequested {
                        cast[IReadOnlyList[string]](Array.Empty[string]())
                    } else {
                        cast[IReadOnlyList[string]](values.AsReadOnly())
                    }
                )
            } finally {
                if list != 0 {
                    freeList(handle, &list, count)
                }
            }
        }
    }

    private func Ready(requestedLanguage string, $range TextRange, cancellation CancellationToken) SpellingStatus {
        var $range = $range
        ObjectDisposedException.ThrowIf(disposed, this)
        if cancellation.IsCancellationRequested {
            return SpellingStatus.Cancelled
        }
        if $range.Length > SpellingInput.MaxTextLength {
            return SpellingStatus.TooLarge
        }
        if !string.Equals(requestedLanguage, language, StringComparison.OrdinalIgnoreCase) {
            return SpellingStatus.LanguageUnavailable
        }
        initialization ??= Initialize()
        return initialization!!
    }

    private func Initialize() SpellingStatus {
        if !OperatingSystem.IsLinux() || !NativeLibrary.TryLoad("libhunspell-1.7.so.0", out library) {
            return SpellingStatus.Unsupported
        }
        if !File.Exists(affPath) || !File.Exists(dictionaryPath) {
            return SpellingStatus.LanguageUnavailable
        }
        try {
            let create = cast[unmanaged[Cdecl](*uint8, *uint8) -> nint](NativeLibrary.GetExport(library, "Hunspell_create"))
            spell = cast[unmanaged[Cdecl](nint, *uint8) -> int32](NativeLibrary.GetExport(library, "Hunspell_spell"))
            suggest = cast[unmanaged[Cdecl](nint, *nint, *uint8) -> int32](NativeLibrary.GetExport(library, "Hunspell_suggest"))
            freeList = cast[unmanaged[Cdecl](nint, *nint, int32) -> void](NativeLibrary.GetExport(library, "Hunspell_free_list"))
            destroy = cast[unmanaged[Cdecl](nint) -> void](NativeLibrary.GetExport(library, "Hunspell_destroy"))
            let getEncoding = cast[unmanaged[Cdecl](nint) -> nint](NativeLibrary.GetExport(library, "Hunspell_get_dic_encoding"))
            let aff []uint8 = Encoding.UTF8.GetBytes(affPath + '\u0000')
            let dictionary []uint8 = Encoding.UTF8.GetBytes(dictionaryPath + '\u0000')
            fixed nativeAff *uint8 = aff {
                fixed nativeDictionary *uint8 = dictionary {
                    handle = create(nativeAff, nativeDictionary)
                }
            }
            if handle == 0 {
                return SpellingStatus.LanguageUnavailable
            }
            let name = Marshal.PtrToStringUTF8(getEncoding(handle))
            if string.IsNullOrWhiteSpace(name) {
                return SpellingStatus.Failed
            }
            encoding = Encoding.GetEncoding(
                name,
                EncoderFallback.ExceptionFallback,
                DecoderFallback.ExceptionFallback
            )
            for line in File.ReadLines(affPath, encoding) {
                if line.StartsWith("WORDCHARS ", StringComparison.Ordinal) || line.StartsWith(
                    "WORDCHARS\t",
                    StringComparison.Ordinal
                ) {
                    wordCharacters = line[10 ..].Trim()
                    break
                }
            }
            return SpellingStatus.Success
        } catch (EntryPointNotFoundException) {
            return SpellingStatus.Unsupported
        } catch (ArgumentException) {
            return SpellingStatus.Unsupported
        } catch (NotSupportedException) {
            return SpellingStatus.Unsupported
        } catch (IOException) {
            return SpellingStatus.Failed
        } catch (UnauthorizedAccessException) {
            return SpellingStatus.Failed
        }
    }

    private func EncodeWord(word ReadOnlySpan[char]) {
        let capacity = encoding.GetMaxByteCount(word.Length) + 1
        if wordBuffer.Length < capacity {
            wordBuffer = [Math.Max(capacity, wordBuffer.Length * 2)]uint8
        }
        let length = encoding.GetBytes(word, wordBuffer)
        wordBuffer[length] = uint8(0)
    }

    private func IsWordCharacter(value Rune) bool {
        for character in wordCharacters.EnumerateRunes() {
            if character == value {
                return true
            }
        }
        return false
    }

    private func Decode(value nint) string {
        if value == 0 {
            return ""
        }
        let bytes = *uint8(value)
        var length = 0
        while length < SpellingInput.MaxTextLength && bytes[length] != uint8(0) {
            length++
        }
        return encoding.GetString(ReadOnlySpan[uint8](*void(bytes), length))
    }
}
