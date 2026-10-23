using Android.Content;
using Android.OS;
using Android.Text;
using System.Buffers;
using System.Text;
using AndroidUri = Android.Net.Uri;

namespace Goo.Android;

internal sealed class AndroidClipboard(GooView view) : IDisposable
{
    private const string UriList = "text/uri-list";
    private const string Plain = "text/plain;charset=utf-8";
    private const string MimeKey = "io.github.obselate.goo.clipboard.mime";
    private static readonly UTF8Encoding Utf8 = new(false, true);
    private static readonly Handler Main = new(Looper.MainLooper!);
    private static long writeGeneration;
    private readonly Context context = view.Context!.ApplicationContext!;
    private volatile bool disposed;
    private readonly record struct Item(string? Text, string? Html, string? Uri);
    private sealed record Snapshot(string[] Formats, Item[] Items, string? MimeUri = null);

    private global::Android.Content.ClipboardManager Manager => (global::Android.Content.ClipboardManager)context.GetSystemService(Context.ClipboardService)!;
    public void Dispose() => disposed = true;

    internal ClipboardFormats Query()
    {
        try
        {
            var snapshot = Capture(false);
            return new ClipboardFormats(snapshot.Formats.Length == 0 ? ClipboardReadStatus.Empty : ClipboardReadStatus.Success, snapshot.Formats);
        }
        catch (Exception error) when (Known(error))
        {
            return new ClipboardFormats(ReadStatus(error), [], error.Message);
        }
    }

    private Snapshot Capture(bool includeData = true)
    {
        if (disposed || !view.HasWindowFocus) throw new IOException("Clipboard reads require a focused Goo view");
        using var clip = Manager.PrimaryClip;
        if (clip is null) return new Snapshot([], []);
        if (clip.ItemCount > NativeFilePaths.MaxCount) throw new ClipboardLimitException("Clipboard exceeds 4096 items");
        using var description = clip.Description;
        if (description is null || description.MimeTypeCount > 128) throw new ClipboardLimitException("Clipboard exceeds 128 MIME types");
        var formats = new List<string>();
        for (int i = 0; i < description.MimeTypeCount; i++)
        {
            string? type = description.GetMimeType(i);
            if (type is null) continue;
            try { TransferRepresentation.ValidateType(type); }
            catch (Exception error) when (error is ArgumentException or FormatException) { continue; }
            if (!formats.Contains(type)) formats.Add(type);
        }
        var items = includeData ? new Item[clip.ItemCount] : [];
        int uriUnits = 0;
        for (int i = 0; i < clip.ItemCount; i++)
        {
            using var item = clip.GetItemAt(i);
            if (item is null) throw new IOException("Clipboard item is unavailable");
            using var uri = item.Uri;
            if (uri is not null && !formats.Contains(UriList)) formats.Add(UriList);
            if (!includeData) continue;
            var reference = uri?.ToString();
            if (reference is not null)
            {
                uriUnits += reference.Length;
                if (reference.Length > NativeFilePaths.MaxPathUnits || uriUnits > NativeFilePaths.MaxTotalUnits)
                    throw new ClipboardLimitException("Clipboard URI references exceed their text budget");
            }
            using var text = item.TextFormatted;
            if (text?.Length() > ClipboardTransfer.MaxTextBytes) throw new ClipboardLimitException("Clipboard text exceeds 16 MiB");
            var html = item.HtmlText;
            if (html?.Length > ClipboardTransfer.MaxTextBytes) throw new ClipboardLimitException("Clipboard HTML exceeds 16 MiB");
            items[i] = new Item(text?.ToString(), html, reference);
        }
        if (formats.Contains("text/plain") && !formats.Contains(Plain)) formats.Add(Plain);
        if (formats.Count > 128) throw new ClipboardLimitException("Clipboard aliases exceed 128 MIME types");
        using var extras = description.Extras;
        var mimeUri = extras?.GetString(MimeKey);
        return new Snapshot(formats.ToArray(), items, items.Length > 0 && items[0].Uri == mimeUri ? mimeUri : null);
    }

    internal Task<ClipboardDataResult> Read(IReadOnlyList<string> types)
    {
        Snapshot snapshot;
        try { snapshot = Capture(); }
        catch (Exception error) when (Known(error)) { return Task.FromResult(new ClipboardDataResult(ReadStatus(error), error: error.Message)); }
        return Task.Run(() => Read(snapshot, types));
    }

    private ClipboardDataResult Read(Snapshot snapshot, IReadOnlyList<string> types)
    {
        try
        {
            var items = new List<TransferRepresentation>();
            var uris = new List<Uri>();
            int total = 0;
            foreach (var type in types)
            {
                if (disposed) throw new IOException("The clipboard owner closed");
                if (type == UriList)
                {
                    foreach (var item in snapshot.Items)
                        if (item.Uri is not null) uris.Add(new Uri(item.Uri, UriKind.Absolute));
                    continue;
                }
                int limit = Math.Min(type.StartsWith("text/", StringComparison.Ordinal) ? ClipboardTransfer.MaxTextBytes : ClipboardTransfer.MaxImageBytes,
                    ClipboardTransfer.MaxImageBytes - total);
                var bytes = ReadRepresentation(snapshot, type, limit);
                if (bytes is null) continue;
                total += bytes.Length;
                items.Add(new TransferRepresentation(type, bytes));
            }
            if (disposed) throw new IOException("The clipboard owner closed");
            return new ClipboardDataResult(items.Count == 0 && uris.Count == 0 ? ClipboardReadStatus.Empty : ClipboardReadStatus.Success,
                new TransferData(items, uris));
        }
        catch (Exception error) when (Known(error)) { return new ClipboardDataResult(ReadStatus(error), error: error.Message); }
    }

    private byte[]? ReadRepresentation(Snapshot snapshot, string type, int limit)
    {
        foreach (var item in snapshot.Items)
        {
            if (item.Uri is null || item.Uri != snapshot.MimeUri) continue;
            using var uri = AndroidUri.Parse(item.Uri)!;
            if (uri.Authority != GooClipboardProvider.Authority(context)) continue;
            if (context.ContentResolver!.GetStreamTypes(uri, type)?.Contains(type) == true) return ReadUri(uri, type, limit);
        }
        if (type is Plain or "text/plain" or "text/html")
        {
            int size = 0, count = 0;
            foreach (var item in snapshot.Items)
            {
                var text = type == "text/html" ? item.Html : item.Text;
                if (text is null) continue;
                int length = Utf8.GetByteCount(text);
                if (count++ > 0) size++;
                if (length > limit - size) throw new ClipboardLimitException("Clipboard text exceeds its byte budget");
                size += length;
            }
            if (count > 0)
            {
                var bytes = new byte[size];
                int offset = 0, written = 0;
                foreach (var item in snapshot.Items)
                {
                    var text = type == "text/html" ? item.Html : item.Text;
                    if (text is null) continue;
                    if (written++ > 0) bytes[offset++] = (byte)'\n';
                    offset += Utf8.GetBytes(text.AsSpan(), bytes.AsSpan(offset));
                }
                return bytes;
            }
        }
        string? selected = null;
        foreach (var item in snapshot.Items)
        {
            if (item.Uri is null) continue;
            using var uri = AndroidUri.Parse(item.Uri)!;
            if (context.ContentResolver!.GetStreamTypes(uri, type)?.Contains(type) != true && context.ContentResolver.GetType(uri) != type) continue;
            if (selected is not null) throw new NotSupportedException("Read multiple clipboard documents as URI references");
            selected = item.Uri;
        }
        if (selected is null) return null;
        using var source = AndroidUri.Parse(selected)!;
        return ReadUri(source, type, limit);
    }

    private byte[] ReadUri(AndroidUri uri, string type, int limit)
    {
        using var asset = context.ContentResolver!.OpenTypedAssetFileDescriptor(uri, type, null)
            ?? throw new IOException("Clipboard MIME stream is unavailable");
        using var stream = asset.CreateInputStream() ?? throw new IOException("Clipboard MIME stream could not be opened");
        long length = asset.DeclaredLength;
        if (length > limit) throw new ClipboardLimitException("Clipboard data exceeds its byte budget");
        if (length >= 0)
        {
            var bytes = new byte[(int)length];
            stream.ReadExactly(bytes);
            return bytes;
        }
        var chunks = new List<byte[]>();
        int total = 0;
        try
        {
            bool complete = false;
            while (!complete)
            {
                var chunk = ArrayPool<byte>.Shared.Rent(65536);
                chunks.Add(chunk);
                int used = 0;
                while (used < 65536)
                {
                    int count = stream.Read(chunk, used, Math.Min(65536 - used, limit - total + 1));
                    if (count == 0) { complete = true; break; }
                    used += count;
                    total += count;
                    if (total > limit) throw new ClipboardLimitException("Clipboard data exceeds its byte budget");
                }
            }
            var bytes = new byte[total];
            int offset = 0;
            foreach (var chunk in chunks)
            {
                int count = Math.Min(65536, total - offset);
                if (count == 0) break;
                Buffer.BlockCopy(chunk, 0, bytes, offset, count);
                offset += count;
            }
            return bytes;
        }
        finally { foreach (var chunk in chunks) ArrayPool<byte>.Shared.Return(chunk); }
    }

    internal async Task<ClipboardWriteResult> Write(TransferData data, ClipboardIntent intent)
    {
        if (intent == ClipboardIntent.Cut) return new ClipboardWriteResult(DataTransferStatus.Unsupported, "Android does not support native file Cut");
        if (disposed) return new ClipboardWriteResult(DataTransferStatus.Cancelled, "The clipboard owner closed");
        if (data.Representations.Any(item => item.ContentType == UriList))
            return new ClipboardWriteResult(DataTransferStatus.Unsupported, "Android document references must use TransferData.Uris");
        foreach (var uri in data.Uris)
            if (uri.Scheme != "content") return new ClipboardWriteResult(DataTransferStatus.Unsupported, "Android clipboard files require content URIs");
        if (data.Uris.Count + (data.Representations.Count > 0 ? 1 : 0) > NativeFilePaths.MaxCount)
            return new ClipboardWriteResult(DataTransferStatus.TooLarge, "Clipboard exceeds 4096 items");
        long generation = Interlocked.Increment(ref writeGeneration);
        string? publication = null;
        try
        {
            if (data.Representations.Count > 0) publication = await Task.Run(() => GooClipboardProvider.Stage(context, data)).ConfigureAwait(false);
            string[] uriTypes = data.Uris.Count == 0 ? [] : await Task.Run(() => {
                var types = new List<string>();
                var visited = new HashSet<string>(StringComparer.Ordinal);
                foreach (var reference in data.Uris)
                {
                    if (!visited.Add(reference.AbsoluteUri)) continue;
                    using var uri = AndroidUri.Parse(reference.AbsoluteUri)!;
                    var type = context.ContentResolver!.GetType(uri);
                    if (type is null || types.Contains(type)) continue;
                    try { TransferRepresentation.ValidateType(type); }
                    catch (ArgumentException) { continue; }
                    types.Add(type);
                    if (types.Count > 128) throw new ClipboardLimitException("Clipboard documents exceed 128 MIME types");
                }
                return types.ToArray();
            }).ConfigureAwait(false);
            var completion = new TaskCompletionSource<ClipboardWriteResult>(TaskCreationOptions.RunContinuationsAsynchronously);
            if (!Main.Post(() => {
                try
                {
                    if (disposed || generation != Interlocked.Read(ref writeGeneration))
                    {
                        if (publication is not null) GooClipboardProvider.Discard(context, publication);
                        completion.SetResult(new ClipboardWriteResult(DataTransferStatus.Cancelled, "Clipboard publication was superseded"));
                        return;
                    }
                    using var clip = CreateClip(data, publication, uriTypes);
                    if (clip is not null)
                    {
                        using var parcel = Parcel.Obtain();
                        clip.WriteToParcel(parcel, ParcelableWriteFlags.None);
                        if (parcel.DataSize() > 524288) throw new ClipboardLimitException("Clipboard metadata exceeds 512 KiB");
                        if (publication is not null) GooClipboardProvider.Commit(context, publication);
                        Manager.PrimaryClip = clip;
                    }
                    else Manager.ClearPrimaryClip();
                    GooClipboardProvider.Retire(context, publication, data.Uris);
                    completion.SetResult(new ClipboardWriteResult(DataTransferStatus.Success));
                }
                catch (Exception error)
                {
                    try
                    {
                        if (publication is not null) GooClipboardProvider.Discard(context, publication);
                        if (Known(error)) completion.SetResult(new ClipboardWriteResult(WriteStatus(error), error.Message));
                        else completion.SetException(error);
                    }
                    catch (Exception cleanupError) { completion.SetException(cleanupError); }
                }
            }))
            {
                if (publication is not null) GooClipboardProvider.Discard(context, publication);
                return new ClipboardWriteResult(DataTransferStatus.Cancelled, "Android UI dispatcher is unavailable");
            }
            return await completion.Task.ConfigureAwait(false);
        }
        catch (Exception error) when (Known(error))
        {
            if (publication is not null) GooClipboardProvider.Discard(context, publication);
            return new ClipboardWriteResult(WriteStatus(error), error.Message);
        }
    }

    private ClipData? CreateClip(TransferData data, string? publication, string[] uriTypes)
    {
        if (data.Representations.Count == 0 && data.Uris.Count == 0) return null;
        var types = new List<string>();
        string? text = null, html = null;
        int inlineBytes = 0;
        foreach (var item in data.Representations)
        {
            types.Add(item.ContentType);
            if (item.ContentType is not (Plain or "text/plain" or "text/html") || item.Bytes.Length > 65536 - inlineBytes) continue;
            var value = Utf8.GetString(item.Bytes.Span);
            if (item.ContentType == "text/html") html = value;
            else if (text is null) text = value;
            inlineBytes += item.Bytes.Length;
        }
        foreach (var type in uriTypes) if (!types.Contains(type)) types.Add(type);
        if (html is not null && text is null)
        {
            using var parsed = Html.FromHtml(html, FromHtmlOptions.ModeLegacy);
            text = parsed?.ToString();
        }
        if (text is not null && !types.Contains("text/plain")) types.Add("text/plain");
        if (!types.Contains(UriList)) types.Add(UriList);
        if (types.Count > 128) throw new ClipboardLimitException("Clipboard aliases exceed 128 MIME types");
        using var uri = publication is null ? AndroidUri.Parse(data.Uris[0].AbsoluteUri)! : GooClipboardProvider.Uri(context, publication);
        using var first = new ClipData.Item(text, html, null, uri);
        var clip = new ClipData("Goo", types.ToArray(), first);
        if (publication is not null)
        {
            using var description = clip.Description!;
            using var extras = new PersistableBundle();
            extras.PutString(MimeKey, uri.ToString());
            description.Extras = extras;
        }
        for (int i = publication is null ? 1 : 0; i < data.Uris.Count; i++)
        {
            using var reference = AndroidUri.Parse(data.Uris[i].AbsoluteUri)!;
            using var item = new ClipData.Item(reference);
            clip.AddItem(item);
        }
        return clip;
    }

    private static bool Known(Exception error) => error is IOException or UnauthorizedAccessException or ArgumentException or FormatException
        or NotSupportedException or ClipboardLimitException or Java.Lang.Exception;
    private static ClipboardReadStatus ReadStatus(Exception error) => error is ClipboardLimitException or TransactionTooLargeException ? ClipboardReadStatus.TooLarge
        : error is NotSupportedException ? ClipboardReadStatus.Unsupported : ClipboardReadStatus.Failed;
    private static DataTransferStatus WriteStatus(Exception error) => error is ClipboardLimitException or TransactionTooLargeException ? DataTransferStatus.TooLarge
        : error is UnauthorizedAccessException or Java.Lang.SecurityException ? DataTransferStatus.Denied
        : error is NotSupportedException or DecoderFallbackException ? DataTransferStatus.Unsupported : DataTransferStatus.Failed;
}
