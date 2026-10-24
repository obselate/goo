package Goo.SpellCheck

import Goo
import System
import System.Collections.Generic
import System.Runtime.InteropServices
import System.Threading

internal unsafe shared class WindowsSpelling {
    private let FactoryClass Guid = Guid("7ab36653-1796-484b-bdfa-e74f1db7c1dc")
    private let FactoryInterface Guid = Guid("8e018a9d-2415-4677-bf08-794ea61f94bb")
    private const ClassNotRegistered int32 = unchecked(int32(0x80040154U))

    internal func Check(
        snapshot TextSnapshot,
        $range TextRange,
        language string,
        cancellation CancellationToken
    ) SpellingResult {
        let text = snapshot.GetText($range)
        if text.Contains('\u0000') {
            return SpellingResult(
                SpellingStatus.Unsupported,
                snapshot.Version,
                language,
                Array.Empty[Misspelling](),
                "Windows spelling does not accept embedded NUL characters."
            )
        }
        let errors = List[Misspelling]()
        var status = Run(
            language,
            (checker nint) -> {
                var enumeration nint = 0
                fixed value *char = text {
                    CheckResult(
                        cast[unmanaged[Stdcall](nint, *char, *nint) -> int32](Table(checker)[4])(
                            checker,
                            value,
                            &enumeration
                        )
                    )
                }
                try {
                    while !cancellation.IsCancellationRequested {
                        var error nint = 0
                        let next = cast[unmanaged[Stdcall](nint, *nint) -> int32](Table(enumeration)[3])(
                            enumeration,
                            &error
                        )
                        if next == 1 {
                            break
                        }
                        CheckResult(next)
                        if error == 0 {
                            throw COMException("The checker returned an empty error.")
                        }
                        try {
                            var start uint32 = uint32(0)
                            var length uint32 = uint32(0)
                            var action uint32 = uint32(0)
                            CheckResult(cast[unmanaged[Stdcall](nint, *uint32) -> int32](Table(error)[3])(error, &start))
                            CheckResult(cast[unmanaged[Stdcall](nint, *uint32) -> int32](Table(error)[4])(error, &length))
                            CheckResult(cast[unmanaged[Stdcall](nint, *uint32) -> int32](Table(error)[5])(error, &action))
                            if action != uint32(0) &&
                                length != uint32(0) &&
                                uint64(start) +
                                uint64(length) <= uint64(text.Length) {
                                errors.Add(
                                    Misspelling(
                                        TextRange($range.Start + int32(start), int32(length)),
                                        text.Substring(int32(start), int32(length))
                                    )
                                )
                            }
                        } finally {
                            Release(error)
                        }
                    }
                } finally {
                    Release(enumeration)
                }
            },
            out var detail
        )
        if cancellation.IsCancellationRequested {
            status = SpellingStatus.Cancelled
        }
        return SpellingResult(
            status,
            snapshot.Version,
            language,
            if status == SpellingStatus.Success {
                cast[IReadOnlyList[Misspelling]](errors.AsReadOnly())
            } else {
                cast[IReadOnlyList[Misspelling]](Array.Empty[Misspelling]())
            },
            detail
        )
    }

    internal func Suggest(
        snapshot TextSnapshot,
        $range TextRange,
        language string,
        cancellation CancellationToken
    ) SpellingSuggestions {
        let word = snapshot.GetText($range)
        if word.Contains('\u0000') {
            return SpellingSuggestions(
                SpellingStatus.Unsupported,
                snapshot.Version,
                language,
                $range,
                word,
                Array.Empty[string](),
                "Windows spelling does not accept embedded NUL characters."
            )
        }
        let values = List[string]()
        var status = Run(
            language,
            (checker nint) -> {
                var enumeration nint = 0
                fixed value *char = word {
                    CheckResult(
                        cast[unmanaged[Stdcall](nint, *char, *nint) -> int32](Table(checker)[5])(
                            checker,
                            value,
                            &enumeration
                        )
                    )
                }
                try {
                    while values.Count < SpellingInput.MaxSuggestions && !cancellation.IsCancellationRequested {
                        var value nint = 0
                        var fetched uint32 = uint32(0)
                        let next = cast[unmanaged[Stdcall](nint, uint32, *nint, *uint32) -> int32](Table(enumeration)[3])(
                            enumeration,
                            1,
                            &value,
                            &fetched
                        )
                        try {
                            CheckResult(next)
                            if fetched == uint32(0) {
                                break
                            }
                            if value != 0 {
                                values.Add(Marshal.PtrToStringUni(value) ?? "")
                            }
                        } finally {
                            Marshal.FreeCoTaskMem(value)
                        }
                    }
                } finally {
                    Release(enumeration)
                }
            },
            out var detail
        )
        if cancellation.IsCancellationRequested {
            status = SpellingStatus.Cancelled
        }
        return SpellingSuggestions(
            status,
            snapshot.Version,
            language,
            $range,
            word,
            if status == SpellingStatus.Success {
                cast[IReadOnlyList[string]](values.AsReadOnly())
            } else {
                cast[IReadOnlyList[string]](Array.Empty[string]())
            },
            detail
        )
    }

    private func Run(language string, action(nint) -> void, out detail string) SpellingStatus {
        detail = ""
        var factory nint = 0
        var checker nint = 0
        var initialized = false
        try {
            CheckResult(CoInitializeEx(0, 0))
            initialized = true
            var classId = FactoryClass
            var interfaceId = FactoryInterface
            CheckResult(CoCreateInstance(&classId, 0, 1, &interfaceId, &factory))
            var supported = 0
            fixed tag *char = language {
                CheckResult(
                    cast[unmanaged[Stdcall](nint, *char, *int32) -> int32](Table(factory)[4])(factory, tag, &supported)
                )
                if supported == 0 {
                    return SpellingStatus.LanguageUnavailable
                }
                CheckResult(
                    cast[unmanaged[Stdcall](nint, *char, *nint) -> int32](Table(factory)[5])(factory, tag, &checker)
                )
            }
            if checker == 0 {
                return SpellingStatus.LanguageUnavailable
            }
            action(checker)
            return SpellingStatus.Success
        } catch (error COMException) {
            detail = "Windows spelling failed (0x${error.HResult:X8})."
            return if error.HResult == ClassNotRegistered {
                SpellingStatus.Unsupported
            } else {
                SpellingStatus.Failed
            }
        } catch (DllNotFoundException) {
            return SpellingStatus.Unsupported
        } catch (EntryPointNotFoundException) {
            return SpellingStatus.Unsupported
        } finally {
            Release(checker)
            Release(factory)
            if initialized {
                CoUninitialize()
            }
        }
    }

    private func Table(instance nint) *nint {
        if instance == 0 {
            throw COMException("The checker returned an empty COM object.")
        }
        let table = cast[**nint](instance)
        return table[0]
    }

    private func Release(instance nint) {
        if instance != 0 {
            cast[unmanaged[Stdcall](nint) -> uint32](Table(instance)[2])(instance)
        }
    }

    private func CheckResult(result int32) {
        if result < 0 {
            throw COMException("Windows spelling failed.", result)
        }
    }

    @DllImport("ole32.dll")
    private func CoInitializeEx(reserved nint, flags uint32) int32;

    @DllImport("ole32.dll")
    private func CoUninitialize();

    @DllImport("ole32.dll")
    private func CoCreateInstance(classId *Guid, outer nint, context uint32, interfaceId *Guid, value *nint) int32;
}
