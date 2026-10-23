package Goo.Android

import Android.Content
import Android.OS
import Android.Text
import Goo
import System
import System.Buffers
import System.Collections.Generic
import System.IO
import System.Linq
import System.Text
import System.Threading
import System.Threading.Tasks
import AndroidUri = Android.Net.Uri
import NativeClipboardManager = Android.Content.ClipboardManager

internal sealed class AndroidClipboard : IDisposable {
    private let view GooView
    private let context Context
    private var disposed bool

    internal init(view GooView) {
        this.view = view
        context = view.Context!!.ApplicationContext!!
    }

    private data struct Item(Text string?, Html string?, Uri string?)
    private sealed data class Snapshot(Formats []string, Items []Item, MimeUri string? = nil)

    private prop Manager NativeClipboardManager -> cast[NativeClipboardManager](
        context.GetSystemService(Context.ClipboardService)!!)

    public func Dispose() -> Volatile.Write(ref disposed, true)

    internal func Query() ClipboardFormats {
        try {
            let snapshot = Capture(false)
            return ClipboardFormats(if snapshot.Formats.Length == 0 { ClipboardReadStatus.Empty }
                else { ClipboardReadStatus.Success }, snapshot.Formats)
        } catch (error Exception) when (Known(error)) {
            return ClipboardFormats(ReadStatus(error), Array.Empty[string](), error.Message)
        }
    }

    private func Capture(includeData bool = true) Snapshot {
        if Volatile.Read(ref disposed) || !view.HasWindowFocus {
            throw IOException("Clipboard reads require a focused Goo view")
        }
        using let clip = Manager.PrimaryClip
        if clip == nil { return Snapshot(Array.Empty[string](), Array.Empty[Item]()) }
        if clip.ItemCount > NativeFilePaths.MaxCount { throw ClipboardLimitException("Clipboard exceeds 4096 items") }
        using let description = clip.Description
        if description == nil || description.MimeTypeCount > MaxMimeTypes {
            throw ClipboardLimitException("Clipboard exceeds 128 MIME types")
        }

        let formats = List[string]()
        for i in 0 ... description.MimeTypeCount {
            guard let type = description.GetMimeType(i) else { continue }
            try { TransferRepresentation.ValidateType(type) }
            catch (error Exception) when (error is ArgumentException || error is FormatException) { continue }
            if !formats.Contains(type) { formats.Add(type) }
        }
        let items = if includeData { [clip.ItemCount]Item } else { Array.Empty[Item]() }
        var uriUnits int32
        for i in 0 ... clip.ItemCount {
            using let item = clip.GetItemAt(i) ?? throw IOException("Clipboard item is unavailable")
            using let uri = item.Uri
            if uri != nil && !formats.Contains(UriList) { formats.Add(UriList) }
            if !includeData { continue }
            let reference = uri?.ToString()
            if let value = reference {
                uriUnits += value.Length
                if value.Length > NativeFilePaths.MaxPathUnits || uriUnits > NativeFilePaths.MaxTotalUnits {
                    throw ClipboardLimitException("Clipboard URI references exceed their text budget")
                }
            }
            using let text = item.TextFormatted
            if text != nil && text.Length() > ClipboardTransfer.MaxTextBytes {
                throw ClipboardLimitException("Clipboard text exceeds 16 MiB")
            }
            let html = item.HtmlText
            if html != nil && html.Length > ClipboardTransfer.MaxTextBytes {
                throw ClipboardLimitException("Clipboard HTML exceeds 16 MiB")
            }
            items[i] = Item(text?.ToString(), html, reference)
        }
        if formats.Contains(PlainMime) && !formats.Contains(Plain) { formats.Add(Plain) }
        if formats.Count > MaxMimeTypes { throw ClipboardLimitException("Clipboard aliases exceed 128 MIME types") }
        using let extras = description.Extras
        let mimeUri = extras?.GetString(MimeKey)
        return Snapshot(formats.ToArray(), items,
            if items.Length > 0 && items[0].Uri == mimeUri { mimeUri } else { nil })
    }

    internal func Read(types IReadOnlyList[string]) Task[ClipboardDataResult] {
        try {
            let snapshot = Capture()
            return Task.Run(() -> Read(snapshot, types))
        } catch (error Exception) when (Known(error)) {
            return Task.FromResult(ClipboardDataResult(ReadStatus(error), error: error.Message))
        }
    }

    private func Read(snapshot Snapshot, types IReadOnlyList[string]) ClipboardDataResult {
        try {
            let items = List[TransferRepresentation]()
            let uris = List[Uri]()
            var total int32
            for type in types {
                if Volatile.Read(ref disposed) { throw IOException("The clipboard owner closed") }
                if type == UriList {
                    for item in snapshot.Items {
                        if let reference = item.Uri { uris.Add(Uri(reference, UriKind.Absolute)) }
                    }
                    continue
                }
                let limit = Math.Min(if type.StartsWith("text/", StringComparison.Ordinal) {
                    ClipboardTransfer.MaxTextBytes
                } else { ClipboardTransfer.MaxImageBytes }, ClipboardTransfer.MaxImageBytes - total)
                guard let bytes = ReadRepresentation(snapshot, type, limit) else { continue }
                total += bytes.Length
                items.Add(TransferRepresentation(type, bytes))
            }
            if Volatile.Read(ref disposed) { throw IOException("The clipboard owner closed") }
            return ClipboardDataResult(if items.Count == 0 && uris.Count == 0 { ClipboardReadStatus.Empty }
                else { ClipboardReadStatus.Success }, TransferData(items, uris))
        } catch (error Exception) when (Known(error)) {
            return ClipboardDataResult(ReadStatus(error), error: error.Message)
        }
    }

    private func ReadRepresentation(snapshot Snapshot, type string, limit int32) []?uint8 {
        for item in snapshot.Items {
            guard let reference = item.Uri else { continue }
            if reference != snapshot.MimeUri { continue }
            using let uri = AndroidUri.Parse(reference)!!
            if uri.Authority != GooClipboardProvider.Authority(context) { continue }
            if context.ContentResolver!!.GetStreamTypes(uri, type)?.Contains(type) == true {
                return ReadUri(uri, type, limit)
            }
        }
        if type == Plain || type == PlainMime || type == HtmlMime {
            var size int32
            var count int32
            for item in snapshot.Items {
                guard let text = if type == HtmlMime { item.Html } else { item.Text } else { continue }
                let length = Utf8.GetByteCount(text)
                if count > 0 { size++ }
                count++
                if length > limit - size { throw ClipboardLimitException("Clipboard text exceeds its byte budget") }
                size += length
            }
            if count > 0 {
                let bytes = [size]uint8
                var offset int32
                var written int32
                for item in snapshot.Items {
                    guard let text = if type == HtmlMime { item.Html } else { item.Text } else { continue }
                    if written > 0 {
                        bytes[offset] = 10
                        offset++
                    }
                    written++
                    offset += Utf8.GetBytes(text.AsSpan(), bytes.AsSpan(offset))
                }
                return bytes
            }
        }
        var selected string?
        for item in snapshot.Items {
            guard let reference = item.Uri else { continue }
            using let uri = AndroidUri.Parse(reference)!!
            if context.ContentResolver!!.GetStreamTypes(uri, type)?.Contains(type) != true
                && context.ContentResolver!!.GetType(uri) != type { continue }
            if selected != nil { throw NotSupportedException("Read multiple clipboard documents as URI references") }
            selected = reference
        }
        guard let reference = selected else { return nil }
        using let source = AndroidUri.Parse(reference)!!
        return ReadUri(source, type, limit)
    }

    private func ReadUri(uri AndroidUri, type string, limit int32) []uint8 {
        using let asset = context.ContentResolver!!.OpenTypedAssetFileDescriptor(uri, type, nil)
            ?? throw IOException("Clipboard MIME stream is unavailable")
        using let stream = asset.CreateInputStream() ?? throw IOException("Clipboard MIME stream could not be opened")
        let length = asset.DeclaredLength
        if length > limit { throw ClipboardLimitException("Clipboard data exceeds its byte budget") }
        if length >= 0 {
            let bytes = [int32(length)]uint8
            stream.ReadExactly(bytes)
            return bytes
        }
        let chunks = List[[]uint8]()
        var total int32
        try {
            var complete bool
            while !complete {
                let chunk = ArrayPool[uint8].Shared.Rent(StreamChunkBytes)
                chunks.Add(chunk)
                var used int32
                while used < StreamChunkBytes {
                    let count = stream.Read(chunk, used, Math.Min(StreamChunkBytes - used, limit - total + 1))
                    if count == 0 {
                        complete = true
                        break
                    }
                    used += count
                    total += count
                    if total > limit { throw ClipboardLimitException("Clipboard data exceeds its byte budget") }
                }
            }
            let bytes = [total]uint8
            var offset int32
            for chunk in chunks {
                let count = Math.Min(StreamChunkBytes, total - offset)
                if count == 0 { break }
                Buffer.BlockCopy(chunk, 0, bytes, offset, count)
                offset += count
            }
            return bytes
        } finally {
            for chunk in chunks { ArrayPool[uint8].Shared.Return(chunk) }
        }
    }

    internal async func Write(data TransferData, intent ClipboardIntent) Task[ClipboardWriteResult] {
        if intent == ClipboardIntent.Cut {
            return ClipboardWriteResult(DataTransferStatus.Unsupported, "Android does not support native file Cut")
        }
        if Volatile.Read(ref disposed) {
            return ClipboardWriteResult(DataTransferStatus.Cancelled, "The clipboard owner closed")
        }
        if data.Representations.Any(item -> item.ContentType == UriList) {
            return ClipboardWriteResult(DataTransferStatus.Unsupported,
                "Android document references must use TransferData.Uris")
        }
        for uri in data.Uris {
            if uri.Scheme != ContentScheme {
                return ClipboardWriteResult(DataTransferStatus.Unsupported,
                    "Android clipboard files require content URIs")
            }
        }
        if data.Uris.Count + (if data.Representations.Count > 0 { 1 } else { 0 }) > NativeFilePaths.MaxCount {
            return ClipboardWriteResult(DataTransferStatus.TooLarge, "Clipboard exceeds 4096 items")
        }
        let generation = Interlocked.Increment(ref writeGeneration)
        var publication string?
        try {
            if data.Representations.Count > 0 {
                publication = await Task.Run(() -> GooClipboardProvider.Stage(context, data)).ConfigureAwait(false)
            }
            let uriTypes = if data.Uris.Count == 0 { Array.Empty[string]() } else {
                await Task.Run(() -> {
                    let types = List[string]()
                    let visited = HashSet[string](StringComparer.Ordinal)
                    for reference in data.Uris {
                        if !visited.Add(reference.AbsoluteUri) { continue }
                        using let uri = AndroidUri.Parse(reference.AbsoluteUri)!!
                        let type = context.ContentResolver!!.GetType(uri)
                        if type == nil || types.Contains(type) { continue }
                        try { TransferRepresentation.ValidateType(type) }
                        catch (error ArgumentException) { continue }
                        types.Add(type)
                        if types.Count > MaxMimeTypes {
                            throw ClipboardLimitException("Clipboard documents exceed 128 MIME types")
                        }
                    }
                    return types.ToArray()
                }).ConfigureAwait(false)
            }
            let completion =
                TaskCompletionSource[ClipboardWriteResult](TaskCreationOptions.RunContinuationsAsynchronously)
            if !Main.Post(() -> {
                try {
                    if Volatile.Read(ref disposed) || generation != Interlocked.Read(ref writeGeneration) {
                        if let staged = publication { GooClipboardProvider.Discard(context, staged) }
                        completion.SetResult(ClipboardWriteResult(DataTransferStatus.Cancelled,
                            "Clipboard publication was superseded"))
                        return
                    }
                    using let clip = CreateClip(data, publication, uriTypes)
                    if clip != nil {
                        using let parcel = Parcel.Obtain()
                        clip.WriteToParcel(parcel, ParcelableWriteFlags.None)
                        if parcel.DataSize() > MaxMetadataBytes {
                            throw ClipboardLimitException("Clipboard metadata exceeds 512 KiB")
                        }
                        if let staged = publication { GooClipboardProvider.Commit(context, staged) }
                        Manager.PrimaryClip = clip
                    } else { Manager.ClearPrimaryClip() }
                    GooClipboardProvider.Retire(context, publication, data.Uris)
                    completion.SetResult(ClipboardWriteResult(DataTransferStatus.Success))
                } catch (error Exception) {
                    try {
                        if let staged = publication { GooClipboardProvider.Discard(context, staged) }
                        if Known(error) {
                            completion.SetResult(ClipboardWriteResult(WriteStatus(error), error.Message))
                        }
                        else { completion.SetException(error) }
                    } catch (cleanupError Exception) { completion.SetException(cleanupError) }
                }
            }) {
                if let staged = publication { GooClipboardProvider.Discard(context, staged) }
                return ClipboardWriteResult(DataTransferStatus.Cancelled, "Android UI dispatcher is unavailable")
            }
            return await completion.Task.ConfigureAwait(false)
        } catch (error Exception) when (Known(error)) {
            if let staged = publication { GooClipboardProvider.Discard(context, staged) }
            return ClipboardWriteResult(WriteStatus(error), error.Message)
        }
    }

    private func CreateClip(data TransferData, publication string?, uriTypes []string) ClipData? {
        if data.Representations.Count == 0 && data.Uris.Count == 0 { return nil }
        let types = List[string]()
        var text string?
        var html string?
        var inlineBytes int32
        for item in data.Representations {
            types.Add(item.ContentType)
            if (item.ContentType != Plain && item.ContentType != PlainMime && item.ContentType != HtmlMime)
                || item.Bytes.Length > MaxInlineTextBytes - inlineBytes { continue }
            let value = Utf8.GetString(item.Bytes.Span)
            if item.ContentType == HtmlMime { html = value }
            else if text == nil { text = value }
            inlineBytes += item.Bytes.Length
        }
        for type in uriTypes { if !types.Contains(type) { types.Add(type) } }
        if html != nil && text == nil {
            using let parsed = Html.FromHtml(html, FromHtmlOptions.ModeLegacy)
            text = parsed?.ToString()
        }
        if text != nil && !types.Contains(PlainMime) { types.Add(PlainMime) }
        if !types.Contains(UriList) { types.Add(UriList) }
        if types.Count > MaxMimeTypes { throw ClipboardLimitException("Clipboard aliases exceed 128 MIME types") }
        using let uri = if publication == nil { AndroidUri.Parse(data.Uris[0].AbsoluteUri)!! }
            else { GooClipboardProvider.Uri(context, publication) }
        using let first = ClipData.Item(text, html, nil, uri)
        let clip = ClipData("Goo", types.ToArray(), first)
        if publication != nil {
            using let description = clip.Description!!
            using let extras = PersistableBundle()
            extras.PutString(MimeKey, uri.ToString())
            description.Extras = extras
        }
        for i in (if publication == nil { 1 } else { 0 }) ... data.Uris.Count {
            using let reference = AndroidUri.Parse(data.Uris[i].AbsoluteUri)!!
            using let item = ClipData.Item(reference)
            clip.AddItem(item)
        }
        return clip
    }

    shared {
        private const UriList string = "text/uri-list"
        private const Plain string = "text/plain;charset=utf-8"
        private const PlainMime string = "text/plain"
        private const HtmlMime string = "text/html"
        private const ContentScheme string = "content"
        private const MimeKey string = "io.github.obselate.goo.clipboard.mime"
        private const MaxMimeTypes int32 = 128
        private const StreamChunkBytes int32 = 65536
        private const MaxInlineTextBytes int32 = 65536
        private const MaxMetadataBytes int32 = 524288
        private let Utf8 UTF8Encoding = UTF8Encoding(false, true)
        private let Main Handler = Handler(Looper.MainLooper!!)
        private var writeGeneration int64

        private func Known(error Exception) bool -> error is IOException || error is UnauthorizedAccessException
            || error is ArgumentException || error is FormatException || error is NotSupportedException
            || error is ClipboardLimitException || error is Java.Lang.Exception

        private func ReadStatus(error Exception) ClipboardReadStatus ->
            if error is ClipboardLimitException || error is TransactionTooLargeException {
                ClipboardReadStatus.TooLarge
            } else if error is NotSupportedException { ClipboardReadStatus.Unsupported }
            else { ClipboardReadStatus.Failed }

        private func WriteStatus(error Exception) DataTransferStatus ->
            if error is ClipboardLimitException || error is TransactionTooLargeException { DataTransferStatus.TooLarge }
            else if error is UnauthorizedAccessException || error is Java.Lang.SecurityException {
                DataTransferStatus.Denied
            } else if error is NotSupportedException || error is DecoderFallbackException {
                DataTransferStatus.Unsupported
            }
            else { DataTransferStatus.Failed }
    }
}
