using System.Runtime.InteropServices;

namespace Goo.SpellCheck;

internal static unsafe class WindowsSpelling
{
    private static readonly Guid FactoryClass = new("7ab36653-1796-484b-bdfa-e74f1db7c1dc");
    private static readonly Guid FactoryInterface = new("8e018a9d-2415-4677-bf08-794ea61f94bb");
    private const int ClassNotRegistered = unchecked((int)0x80040154);

    internal static SpellingResult Check(TextSnapshot snapshot, TextRange range, string language,
        CancellationToken cancellation)
    {
        var text = snapshot.GetText(range);
        if (text.Contains('\0'))
            return new SpellingResult(SpellingStatus.Unsupported, snapshot.Version, language, [],
                "Windows spelling does not accept embedded NUL characters.");
        var errors = new List<Misspelling>();
        var status = Run(language, checker =>
        {
            nint enumeration = 0;
            fixed (char* value = text)
                CheckResult(((delegate* unmanaged[Stdcall]<nint, char*, nint*, int>)Table(checker)[4])
                    (checker, value, &enumeration));
            try
            {
                while (!cancellation.IsCancellationRequested)
                {
                    nint error = 0;
                    var next = ((delegate* unmanaged[Stdcall]<nint, nint*, int>)Table(enumeration)[3])
                        (enumeration, &error);
                    if (next == 1)
                        break;
                    CheckResult(next);
                    if (error == 0)
                        throw new COMException("The checker returned an empty error.");
                    try
                    {
                        uint start = 0, length = 0, action = 0;
                        CheckResult(((delegate* unmanaged[Stdcall]<nint, uint*, int>)Table(error)[3])(error, &start));
                        CheckResult(((delegate* unmanaged[Stdcall]<nint, uint*, int>)Table(error)[4])(error, &length));
                        CheckResult(((delegate* unmanaged[Stdcall]<nint, uint*, int>)Table(error)[5])(error, &action));
                        if (action != 0 && length != 0 && (ulong)start + length <= (ulong)text.Length)
                            errors.Add(new Misspelling(new TextRange(range.Start + (int)start, (int)length),
                                text.Substring((int)start, (int)length)));
                    }
                    finally { Release(error); }
                }
            }
            finally { Release(enumeration); }
        }, out var detail);
        if (cancellation.IsCancellationRequested)
            status = SpellingStatus.Cancelled;
        return new SpellingResult(status, snapshot.Version, language,
            status == SpellingStatus.Success ? errors.AsReadOnly() : Array.Empty<Misspelling>(), detail);
    }

    internal static SpellingSuggestions Suggest(TextSnapshot snapshot, TextRange range, string language,
        CancellationToken cancellation)
    {
        var word = snapshot.GetText(range);
        if (word.Contains('\0'))
            return new SpellingSuggestions(SpellingStatus.Unsupported, snapshot.Version, language, range, word, [],
                "Windows spelling does not accept embedded NUL characters.");
        var values = new List<string>();
        var status = Run(language, checker =>
        {
            nint enumeration = 0;
            fixed (char* value = word)
                CheckResult(((delegate* unmanaged[Stdcall]<nint, char*, nint*, int>)Table(checker)[5])
                    (checker, value, &enumeration));
            try
            {
                while (values.Count < SpellingInput.MaxSuggestions && !cancellation.IsCancellationRequested)
                {
                    nint value = 0;
                    uint fetched = 0;
                    var next = ((delegate* unmanaged[Stdcall]<nint, uint, nint*, uint*, int>)Table(enumeration)[3])
                        (enumeration, 1, &value, &fetched);
                    try
                    {
                        CheckResult(next);
                        if (fetched == 0)
                            break;
                        if (value != 0)
                            values.Add(Marshal.PtrToStringUni(value) ?? "");
                    }
                    finally { Marshal.FreeCoTaskMem(value); }
                }
            }
            finally { Release(enumeration); }
        }, out var detail);
        if (cancellation.IsCancellationRequested)
            status = SpellingStatus.Cancelled;
        return new SpellingSuggestions(status, snapshot.Version, language, range, word,
            status == SpellingStatus.Success ? values.AsReadOnly() : Array.Empty<string>(), detail);
    }

    private static SpellingStatus Run(string language, Action<nint> action, out string detail)
    {
        detail = "";
        nint factory = 0, checker = 0;
        var initialized = false;
        try
        {
            CheckResult(CoInitializeEx(0, 0));
            initialized = true;
            var classId = FactoryClass;
            var interfaceId = FactoryInterface;
            CheckResult(CoCreateInstance(&classId, 0, 1, &interfaceId, &factory));
            int supported = 0;
            fixed (char* tag = language)
            {
                CheckResult(((delegate* unmanaged[Stdcall]<nint, char*, int*, int>)Table(factory)[4])
                    (factory, tag, &supported));
                if (supported == 0)
                    return SpellingStatus.LanguageUnavailable;
                CheckResult(((delegate* unmanaged[Stdcall]<nint, char*, nint*, int>)Table(factory)[5])
                    (factory, tag, &checker));
            }
            if (checker == 0)
                return SpellingStatus.LanguageUnavailable;
            action(checker);
            return SpellingStatus.Success;
        }
        catch (COMException error)
        {
            detail = $"Windows spelling failed (0x{error.HResult:X8}).";
            return error.HResult == ClassNotRegistered ? SpellingStatus.Unsupported : SpellingStatus.Failed;
        }
        catch (DllNotFoundException) { return SpellingStatus.Unsupported; }
        catch (EntryPointNotFoundException) { return SpellingStatus.Unsupported; }
        finally
        {
            Release(checker);
            Release(factory);
            if (initialized)
                CoUninitialize();
        }
    }

    private static nint* Table(nint instance)
    {
        if (instance == 0)
            throw new COMException("The checker returned an empty COM object.");
        return *(nint**)instance;
    }

    private static void Release(nint instance)
    {
        if (instance != 0)
            ((delegate* unmanaged[Stdcall]<nint, uint>)Table(instance)[2])(instance);
    }

    private static void CheckResult(int result)
    {
        if (result < 0)
            throw new COMException("Windows spelling failed.", result);
    }

    [DllImport("ole32.dll")]
    private static extern int CoInitializeEx(nint reserved, uint flags);

    [DllImport("ole32.dll")]
    private static extern void CoUninitialize();

    [DllImport("ole32.dll")]
    private static extern int CoCreateInstance(Guid* classId, nint outer, uint context, Guid* interfaceId, nint* value);
}
