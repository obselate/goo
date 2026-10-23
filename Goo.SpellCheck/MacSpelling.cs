using System.Runtime.InteropServices;

namespace Goo.SpellCheck;

internal static unsafe class MacSpelling
{
    private const string ObjectiveC = "/usr/lib/libobjc.A.dylib";
    private const string AppKit = "/System/Library/Frameworks/AppKit.framework/AppKit";
    private static readonly nint AppKitLibrary = LoadAppKit();

    [StructLayout(LayoutKind.Sequential)]
    private readonly struct Range(nuint location, nuint length)
    {
        internal readonly nuint Location = location;
        internal readonly nuint Length = length;
    }

    internal static SpellingResult Check(TextSnapshot snapshot, TextRange range, string language,
        CancellationToken cancellation)
    {
        RequireMainThread();
        var errors = new List<Misspelling>();
        var pool = objc_autoreleasePoolPush();
        nint checker = 0;
        nint document = 0;
        try
        {
            var status = Open(language, out checker, out document, out var nativeLanguage);
            if (status != SpellingStatus.Success)
                return new SpellingResult(status, snapshot.Version, language, []);
            var text = snapshot.GetText(range);
            var nativeText = String(text);
            nuint start = 0;
            while (start < (nuint)text.Length && !cancellation.IsCancellationRequested)
            {
                var error = CheckWord(checker, Selector("checkSpellingOfString:startingAt:language:wrap:inSpellDocumentWithTag:wordCount:"),
                    nativeText, (nint)start, nativeLanguage, 0, document, 0);
                if (error.Location == nuint.MaxValue)
                    break;
                if (error.Location < start || error.Length == 0 || error.Location > (nuint)text.Length ||
                    error.Length > (nuint)text.Length - error.Location)
                    return new SpellingResult(SpellingStatus.Failed, snapshot.Version, language, [],
                        "The macOS checker returned an invalid range.");
                errors.Add(new Misspelling(new TextRange(range.Start + (int)error.Location, (int)error.Length),
                    text.Substring((int)error.Location, (int)error.Length)));
                start = error.Location + error.Length;
            }
            return new SpellingResult(cancellation.IsCancellationRequested ? SpellingStatus.Cancelled : SpellingStatus.Success,
                snapshot.Version, language, cancellation.IsCancellationRequested ? Array.Empty<Misspelling>() : errors.AsReadOnly());
        }
        finally
        {
            if (checker != 0 && document != 0)
                SendVoid(checker, Selector("closeSpellDocumentWithTag:"), document);
            objc_autoreleasePoolPop(pool);
        }
    }

    internal static SpellingSuggestions Suggest(TextSnapshot snapshot, TextRange range, string language,
        CancellationToken cancellation)
    {
        RequireMainThread();
        var pool = objc_autoreleasePoolPush();
        var word = snapshot.GetText(range);
        nint checker = 0;
        nint document = 0;
        try
        {
            var status = Open(language, out checker, out document, out var nativeLanguage);
            if (status != SpellingStatus.Success)
                return new SpellingSuggestions(status, snapshot.Version, language, range, word, []);
            var array = Guesses(checker, Selector("guessesForWordRange:inString:language:inSpellDocumentWithTag:"),
                new Range(0, (nuint)word.Length), String(word), nativeLanguage, document);
            var values = new List<string>();
            var count = array == 0 ? 0 : (int)Math.Min((nuint)SpellingInput.MaxSuggestions,
                (nuint)Send(array, Selector("count")));
            for (var i = 0; i < count && !cancellation.IsCancellationRequested; i++)
                values.Add(ManagedString(SendAt(array, Selector("objectAtIndex:"), (nuint)i)));
            return new SpellingSuggestions(cancellation.IsCancellationRequested ? SpellingStatus.Cancelled : SpellingStatus.Success,
                snapshot.Version, language, range, word,
                cancellation.IsCancellationRequested ? Array.Empty<string>() : values.AsReadOnly());
        }
        finally
        {
            if (checker != 0 && document != 0)
                SendVoid(checker, Selector("closeSpellDocumentWithTag:"), document);
            objc_autoreleasePoolPop(pool);
        }
    }

    private static SpellingStatus Open(string language, out nint checker, out nint document, out nint nativeLanguage)
    {
        checker = document = nativeLanguage = 0;
        if (AppKitLibrary == 0)
            return SpellingStatus.Unsupported;
        var type = objc_getClass("NSSpellChecker");
        if (type == 0)
            return SpellingStatus.Unsupported;
        var languages = Send(type, Selector("availableLanguages"));
        var count = languages == 0 ? 0 : (nuint)Send(languages, Selector("count"));
        for (nuint index = 0; index < count; index++)
        {
            var candidate = SendAt(languages, Selector("objectAtIndex:"), index);
            if (string.Equals(ManagedString(candidate).Replace('_', '-'), language, StringComparison.OrdinalIgnoreCase))
            {
                nativeLanguage = candidate;
                break;
            }
        }
        if (nativeLanguage == 0)
            return SpellingStatus.LanguageUnavailable;
        checker = Send(type, Selector("sharedSpellChecker"));
        if (checker == 0)
            return SpellingStatus.Unsupported;
        document = Send(type, Selector("uniqueSpellDocumentTag"));
        return SpellingStatus.Success;
    }

    private static nint LoadAppKit() => NativeLibrary.TryLoad(AppKit, out var library) ? library : 0;

    private static void RequireMainThread()
    {
        if (AppKitLibrary != 0 && Send(objc_getClass("NSThread"), Selector("isMainThread")) == 0)
            throw new InvalidOperationException("Use the macOS spelling service on the AppKit main thread.");
    }

    private static nint String(string value)
    {
        fixed (char* characters = value)
        {
            var allocated = Send(objc_getClass("NSString"), Selector("alloc"));
            return Send(SendString(allocated, Selector("initWithCharacters:length:"), characters, (nuint)value.Length),
                Selector("autorelease"));
        }
    }

    private static string ManagedString(nint value)
    {
        var length = checked((int)Send(value, Selector("length")));
        return string.Create(length, value, (destination, source) =>
        {
            fixed (char* characters = destination)
                CopyCharacters(source, Selector("getCharacters:range:"), characters, new Range(0, (nuint)destination.Length));
        });
    }

    private static nint Selector(string name) => sel_registerName(name);

    [DllImport(ObjectiveC)] private static extern nint objc_getClass(string name);
    [DllImport(ObjectiveC)] private static extern nint sel_registerName(string name);
    [DllImport(ObjectiveC)] private static extern nint objc_autoreleasePoolPush();
    [DllImport(ObjectiveC)] private static extern void objc_autoreleasePoolPop(nint pool);
    [DllImport(ObjectiveC, EntryPoint = "objc_msgSend")] private static extern nint Send(nint receiver, nint selector);
    [DllImport(ObjectiveC, EntryPoint = "objc_msgSend")] private static extern nint SendAt(nint receiver, nint selector, nuint index);
    [DllImport(ObjectiveC, EntryPoint = "objc_msgSend")] private static extern void SendVoid(nint receiver, nint selector, nint value);
    [DllImport(ObjectiveC, EntryPoint = "objc_msgSend")] private static extern nint SendString(nint receiver, nint selector, char* value, nuint length);
    [DllImport(ObjectiveC, EntryPoint = "objc_msgSend")] private static extern void CopyCharacters(nint receiver, nint selector, char* destination, Range range);
    [DllImport(ObjectiveC, EntryPoint = "objc_msgSend")] private static extern Range CheckWord(nint receiver, nint selector, nint text, nint start, nint language, byte wrap, nint document, nint count);
    [DllImport(ObjectiveC, EntryPoint = "objc_msgSend")] private static extern nint Guesses(nint receiver, nint selector, Range range, nint text, nint language, nint document);
}
