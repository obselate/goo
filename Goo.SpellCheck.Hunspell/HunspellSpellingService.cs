using System.Globalization;
using System.Runtime.InteropServices;
using System.Text;

namespace Goo.SpellCheck;

/// <summary>Uses the installed Linux Hunspell 1.7 library and app-selected dictionary files. No assets are downloaded.</summary>
public sealed unsafe class HunspellSpellingService : ISpellingService, IDisposable
{
    private readonly object gate = new();
    private readonly string language;
    private readonly string affPath;
    private readonly string dictionaryPath;
    private nint library;
    private nint handle;
    private Encoding encoding = Encoding.UTF8;
    private string wordCharacters = "";
    private byte[] wordBuffer = [];
    private SpellingStatus? initialization;
    private bool disposed;
    private delegate* unmanaged[Cdecl]<nint, byte*, int> spell;
    private delegate* unmanaged[Cdecl]<nint, nint*, byte*, int> suggest;
    private delegate* unmanaged[Cdecl]<nint, nint*, int, void> freeList;
    private delegate* unmanaged[Cdecl]<nint, void> destroy;

    /// <summary>Configures the explicit BCP 47 language and .aff/.dic paths. Missing native support is an operation status.</summary>
    public HunspellSpellingService(string language, string affPath, string dictionaryPath)
    {
        ArgumentException.ThrowIfNullOrWhiteSpace(language);
        ArgumentException.ThrowIfNullOrWhiteSpace(affPath);
        ArgumentException.ThrowIfNullOrWhiteSpace(dictionaryPath);
        this.language = CultureInfo.GetCultureInfo(language).Name;
        this.affPath = Path.GetFullPath(affPath);
        this.dictionaryPath = Path.GetFullPath(dictionaryPath);
    }

    /// <summary>Checks dictionary words and returns source UTF-16 ranges without normalizing the input.</summary>
    public Task<SpellingResult> CheckAsync(TextSnapshot snapshot, TextRange range, string language,
        CancellationToken cancellation = default)
    {
        language = SpellingInput.Validate(snapshot, range, language);
        return Task.Run(() =>
        {
            try { return Check(snapshot, range, language, cancellation); }
            catch (EncoderFallbackException)
            {
                return new SpellingResult(SpellingStatus.Unsupported, snapshot.Version, language, [],
                    "The dictionary encoding cannot represent this text.");
            }
            catch (DecoderFallbackException)
            {
                return new SpellingResult(SpellingStatus.Failed, snapshot.Version, language, [],
                    "The dictionary returned invalid encoded text.");
            }
        });
    }

    /// <summary>Gets dictionary suggestions, decoding the dictionary's declared encoding.</summary>
    public Task<SpellingSuggestions> SuggestAsync(TextSnapshot snapshot, TextRange range, string language,
        CancellationToken cancellation = default)
    {
        language = SpellingInput.Validate(snapshot, range, language);
        return Task.Run(() =>
        {
            try { return Suggest(snapshot, range, language, cancellation); }
            catch (EncoderFallbackException)
            {
                return new SpellingSuggestions(SpellingStatus.Unsupported, snapshot.Version, language, range, "", [],
                    "The dictionary encoding cannot represent this text.");
            }
            catch (DecoderFallbackException)
            {
                return new SpellingSuggestions(SpellingStatus.Failed, snapshot.Version, language, range, "", [],
                    "The dictionary returned invalid encoded text.");
            }
        });
    }

    /// <summary>Waits for any active request and releases the dictionary and system library.</summary>
    public void Dispose()
    {
        lock (gate)
        {
            if (disposed)
                return;
            disposed = true;
            if (handle != 0)
                destroy(handle);
            handle = 0;
            if (library != 0)
                NativeLibrary.Free(library);
            library = 0;
            wordBuffer = [];
        }
    }

    private SpellingResult Check(TextSnapshot snapshot, TextRange range, string requestedLanguage,
        CancellationToken cancellation)
    {
        lock (gate)
        {
            var status = Ready(requestedLanguage, range, cancellation);
            if (status != SpellingStatus.Success)
                return new SpellingResult(status, snapshot.Version, requestedLanguage, []);
            var text = snapshot.GetText(range);
            var errors = new List<Misspelling>();
            var cursor = 0;
            while (cursor < text.Length && !cancellation.IsCancellationRequested)
            {
                Rune.DecodeFromUtf16(text.AsSpan(cursor), out var rune, out var width);
                if (!SpellingInput.IsLetter(rune))
                {
                    cursor += width;
                    continue;
                }
                var start = cursor;
                cursor += width;
                while (cursor < text.Length)
                {
                    Rune.DecodeFromUtf16(text.AsSpan(cursor), out rune, out width);
                    if (!SpellingInput.IsLetter(rune) && !SpellingInput.IsMark(rune) &&
                        !IsWordCharacter(rune))
                        break;
                    cursor += width;
                }
                EncodeWord(text.AsSpan(start, cursor - start));
                fixed (byte* nativeWord = wordBuffer)
                {
                    if (spell(handle, nativeWord) == 0)
                        errors.Add(new Misspelling(new TextRange(range.Start + start, cursor - start),
                            text.Substring(start, cursor - start)));
                }
            }
            return new SpellingResult(cancellation.IsCancellationRequested ? SpellingStatus.Cancelled : SpellingStatus.Success,
                snapshot.Version, requestedLanguage,
                cancellation.IsCancellationRequested ? Array.Empty<Misspelling>() : errors.AsReadOnly());
        }
    }

    private SpellingSuggestions Suggest(TextSnapshot snapshot, TextRange range, string requestedLanguage,
        CancellationToken cancellation)
    {
        lock (gate)
        {
            var status = Ready(requestedLanguage, range, cancellation);
            var word = range.Length <= SpellingInput.MaxTextLength ? snapshot.GetText(range) : "";
            if (status != SpellingStatus.Success)
                return new SpellingSuggestions(status, snapshot.Version, requestedLanguage, range, word, []);
            EncodeWord(word.AsSpan());
            nint list = 0;
            int count;
            fixed (byte* nativeWord = wordBuffer)
                count = suggest(handle, &list, nativeWord);
            try
            {
                if (count < 0 || (count != 0 && list == 0))
                    return new SpellingSuggestions(SpellingStatus.Failed, snapshot.Version, requestedLanguage,
                        range, word, [], "Hunspell returned an invalid suggestion list.");
                var values = new List<string>(Math.Min(count, SpellingInput.MaxSuggestions));
                for (var i = 0; i < count && i < SpellingInput.MaxSuggestions && !cancellation.IsCancellationRequested; i++)
                    values.Add(Decode(((nint*)list)[i]));
                return new SpellingSuggestions(cancellation.IsCancellationRequested ? SpellingStatus.Cancelled : SpellingStatus.Success,
                    snapshot.Version, requestedLanguage, range, word,
                    cancellation.IsCancellationRequested ? Array.Empty<string>() : values.AsReadOnly());
            }
            finally
            {
                if (list != 0)
                    freeList(handle, &list, count);
            }
        }
    }

    private SpellingStatus Ready(string requestedLanguage, TextRange range, CancellationToken cancellation)
    {
        ObjectDisposedException.ThrowIf(disposed, this);
        if (cancellation.IsCancellationRequested)
            return SpellingStatus.Cancelled;
        if (range.Length > SpellingInput.MaxTextLength)
            return SpellingStatus.TooLarge;
        if (!string.Equals(requestedLanguage, language, StringComparison.OrdinalIgnoreCase))
            return SpellingStatus.LanguageUnavailable;
        initialization ??= Initialize();
        return initialization.Value;
    }

    private SpellingStatus Initialize()
    {
        if (!OperatingSystem.IsLinux() || !NativeLibrary.TryLoad("libhunspell-1.7.so.0", out library))
            return SpellingStatus.Unsupported;
        if (!File.Exists(affPath) || !File.Exists(dictionaryPath))
            return SpellingStatus.LanguageUnavailable;
        try
        {
            var create = (delegate* unmanaged[Cdecl]<byte*, byte*, nint>)NativeLibrary.GetExport(library, "Hunspell_create");
            spell = (delegate* unmanaged[Cdecl]<nint, byte*, int>)NativeLibrary.GetExport(library, "Hunspell_spell");
            suggest = (delegate* unmanaged[Cdecl]<nint, nint*, byte*, int>)NativeLibrary.GetExport(library, "Hunspell_suggest");
            freeList = (delegate* unmanaged[Cdecl]<nint, nint*, int, void>)NativeLibrary.GetExport(library, "Hunspell_free_list");
            destroy = (delegate* unmanaged[Cdecl]<nint, void>)NativeLibrary.GetExport(library, "Hunspell_destroy");
            var getEncoding = (delegate* unmanaged[Cdecl]<nint, nint>)NativeLibrary.GetExport(library, "Hunspell_get_dic_encoding");
            var aff = Encoding.UTF8.GetBytes(affPath + '\0');
            var dictionary = Encoding.UTF8.GetBytes(dictionaryPath + '\0');
            fixed (byte* nativeAff = aff, nativeDictionary = dictionary)
                handle = create(nativeAff, nativeDictionary);
            if (handle == 0)
                return SpellingStatus.LanguageUnavailable;
            var name = Marshal.PtrToStringUTF8(getEncoding(handle));
            if (string.IsNullOrWhiteSpace(name))
                return SpellingStatus.Failed;
            encoding = Encoding.GetEncoding(name, EncoderFallback.ExceptionFallback, DecoderFallback.ExceptionFallback);
            foreach (var line in File.ReadLines(affPath, encoding))
            {
                if (line.StartsWith("WORDCHARS ", StringComparison.Ordinal) ||
                    line.StartsWith("WORDCHARS\t", StringComparison.Ordinal))
                {
                    wordCharacters = line[10..].Trim();
                    break;
                }
            }
            return SpellingStatus.Success;
        }
        catch (EntryPointNotFoundException) { return SpellingStatus.Unsupported; }
        catch (ArgumentException) { return SpellingStatus.Unsupported; }
        catch (NotSupportedException) { return SpellingStatus.Unsupported; }
        catch (IOException) { return SpellingStatus.Failed; }
        catch (UnauthorizedAccessException) { return SpellingStatus.Failed; }
    }

    private void EncodeWord(ReadOnlySpan<char> word)
    {
        var capacity = encoding.GetMaxByteCount(word.Length) + 1;
        if (wordBuffer.Length < capacity)
            wordBuffer = new byte[Math.Max(capacity, wordBuffer.Length * 2)];
        var length = encoding.GetBytes(word, wordBuffer);
        wordBuffer[length] = 0;
    }

    private bool IsWordCharacter(Rune value)
    {
        foreach (var character in wordCharacters.EnumerateRunes())
            if (character == value)
                return true;
        return false;
    }

    private string Decode(nint value)
    {
        if (value == 0)
            return "";
        var bytes = (byte*)value;
        var length = 0;
        while (length < SpellingInput.MaxTextLength && bytes[length] != 0)
            length++;
        return encoding.GetString(new ReadOnlySpan<byte>(bytes, length));
    }
}
