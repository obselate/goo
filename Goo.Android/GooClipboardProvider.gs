package Goo.Android

import Android.Content
import Android.Content.Res
import Android.Database
import Android.OS
import Android.Provider
import Goo
import System
import System.Collections.Generic
import System.IO
import System.Linq
import System.Text
import AndroidUri = Android.Net.Uri

@ContentProvider([]string{`${applicationId}.goo.clipboard`},
    Name: "io.github.obselate.goo.GooClipboardProvider", Exported: false, GrantUriPermissions: true)
internal sealed class GooClipboardProvider : ContentProvider {
    internal data struct ClipboardFormat(Type string, Length int64)
    private data struct Offer(Directory string, Formats []ClipboardFormat)

    public override func OnCreate() bool -> true

    private func Resolve(uri AndroidUri) Offer {
        guard let context = Context else { throw Java.IO.FileNotFoundException("Unknown clipboard URI") }
        guard let segments = uri.PathSegments else { throw Java.IO.FileNotFoundException("Unknown clipboard URI") }
        if uri.Scheme != ContentScheme || uri.Authority != Authority(context) || segments.Count != 1
            || !string.IsNullOrEmpty(uri.Query) || !string.IsNullOrEmpty(uri.Fragment)
            || !Guid.TryParseExact(segments[0], IdFormat, out _) {
            throw Java.IO.FileNotFoundException("Unknown clipboard URI")
        }
        try {
            let directory = Path.Combine(Root(context), segments[0])
            using let manifest = BinaryReader(File.OpenRead(Path.Combine(directory, OfferFile)), Encoding.ASCII)
            let count = manifest.ReadInt32()
            if count < 1 || count > MaxFormats { throw IOException("Invalid clipboard format count") }
            let formats = [count]ClipboardFormat
            var total int64
            for i in 0 ... count {
                let length = int32(manifest.ReadUInt16())
                if length < 1 || length > MaxMimeNameBytes { throw IOException("Invalid clipboard MIME name") }
                let encoded = manifest.ReadBytes(length)
                if encoded.Length != length { throw EndOfStreamException() }
                let type = Encoding.ASCII.GetString(encoded)
                TransferRepresentation.ValidateType(type)
                let size = manifest.ReadInt64()
                if size < 0 || size > ClipboardTransfer.MaxImageBytes
                    || total > ClipboardTransfer.MaxImageBytes - size {
                    throw IOException("Invalid clipboard byte count")
                }
                total += size
                formats[i] = ClipboardFormat(type, size)
            }
            return Offer(directory, formats)
        } catch (error Exception) when (error is IOException || error is UnauthorizedAccessException
            || error is ArgumentException || error is FormatException) {
            throw Java.IO.FileNotFoundException("Clipboard data is unavailable")
        }
    }

    public override func GetType(uri AndroidUri) string? -> Resolve(uri).Formats[0].Type

    public override func GetStreamTypes(uri AndroidUri, mimeTypeFilter string) []?string -> Resolve(uri).Formats
        .Where(format -> ClipDescription.CompareMimeTypes(format.Type, mimeTypeFilter))
        .Select(format -> format.Type).ToArray()

    public override func OpenFile(uri AndroidUri, mode string) ParcelFileDescriptor? {
        if mode != ReadMode { throw Java.Lang.SecurityException(ReadOnlyError) }
        let offer = Resolve(uri)
        return ParcelFileDescriptor.Open(Java.IO.File(Path.Combine(offer.Directory, "0" + DataSuffix)),
            ParcelFileMode.ReadOnly)
    }

    public override func OpenTypedAssetFile(uri AndroidUri, mimeTypeFilter string, options Bundle?)
        AssetFileDescriptor? {
        let offer = Resolve(uri)
        for i in 0 ... offer.Formats.Length {
            if !ClipDescription.CompareMimeTypes(offer.Formats[i].Type, mimeTypeFilter) { continue }
            let descriptor = ParcelFileDescriptor.Open(
                Java.IO.File(Path.Combine(offer.Directory, i.ToString() + DataSuffix)),
                ParcelFileMode.ReadOnly) ?? throw Java.IO.FileNotFoundException("Clipboard data is unavailable")
            return AssetFileDescriptor(descriptor, 0, offer.Formats[i].Length)
        }
        throw Java.IO.FileNotFoundException("Clipboard MIME type is unavailable")
    }

    public override func Query(uri AndroidUri, projection []?string, selection string?, selectionArgs []?string,
        sortOrder string?) ICursor? {
        let offer = Resolve(uri)
        let columns = projection ?? []string{IOpenableColumns.DisplayName, IOpenableColumns.Size}
        let result = MatrixCursor(columns)
        let row = result.NewRow()!!
        for column in columns {
            let value Java.Lang.Object? = if column == IOpenableColumns.DisplayName { Java.Lang.String("Clipboard") }
                else if column == IOpenableColumns.Size { Java.Lang.Long.ValueOf(offer.Formats[0].Length) } else { nil }
            row.Add(value)
        }
        return result
    }

    public override func Insert(uri AndroidUri, values ContentValues?) AndroidUri? ->
        throw Java.Lang.SecurityException(ReadOnlyError)

    public override func Update(uri AndroidUri, values ContentValues?, selection string?, selectionArgs []?string)
        int32 ->
        throw Java.Lang.SecurityException(ReadOnlyError)

    public override func Delete(uri AndroidUri, selection string?, selectionArgs []?string) int32 ->
        throw Java.Lang.SecurityException(ReadOnlyError)

    shared {
        private const ContentScheme string = "content"
        private const AuthoritySuffix string = ".goo.clipboard"
        private const RootDirectory string = "goo-clipboard"
        private const PendingPrefix string = ".pending-"
        private const OfferFile string = "offer"
        private const DataSuffix string = ".data"
        private const IdFormat string = "N"
        private const IdPathLength int32 = 33
        private const MaxFormats int32 = 128
        private const MaxMimeNameBytes int32 = 256
        private const ReadMode string = "r"
        private const ReadOnlyError string = "Clipboard data is read-only"
        private let initializationGate object = Object()
        private var initialized bool

        internal func Authority(context Context) string -> context.PackageName + AuthoritySuffix

        internal func Root(context Context) string ->
            Path.Combine(context.NoBackupFilesDir!!.AbsolutePath, RootDirectory)

        internal func Uri(context Context, id string) AndroidUri ->
            AndroidUri.Parse(ContentScheme + "://" + Authority(context) + "/" + id)!!

        internal func Stage(context Context, data TransferData) string {
            let root = Root(context)
            lock (initializationGate) {
                if !initialized {
                    Directory.CreateDirectory(root)
                    for pending in Directory.EnumerateDirectories(root, PendingPrefix + "*") {
                        Directory.Delete(pending, true)
                    }
                    initialized = true
                }
            }
            let id = Guid.NewGuid().ToString(IdFormat)
            let directory = Path.Combine(root, PendingPrefix + id)
            Directory.CreateDirectory(directory)
            try {
                using let manifest = BinaryWriter(File.Create(Path.Combine(directory, OfferFile)), Encoding.ASCII)
                manifest.Write(data.Representations.Count)
                for i in 0 ... data.Representations.Count {
                    let item = data.Representations[i]
                    let type = Encoding.ASCII.GetBytes(item.ContentType)
                    manifest.Write(uint16(type.Length))
                    manifest.Write(type)
                    manifest.Write(int64(item.Bytes.Length))
                    File.WriteAllBytes(Path.Combine(directory, i.ToString() + DataSuffix), item.Data)
                }
                return id
            } catch {
                Directory.Delete(directory, true)
                rethrow
            }
        }

        internal func Commit(context Context, id string) ->
            Directory.Move(Path.Combine(Root(context), PendingPrefix + id), Path.Combine(Root(context), id))

        internal func Discard(context Context, id string) {
            let directory = Path.Combine(Root(context), PendingPrefix + id)
            if Directory.Exists(directory) { Directory.Delete(directory, true) }
        }

        internal func Retire(context Context, current string?, references IReadOnlyList[System.Uri]) {
            let root = Root(context)
            if !Directory.Exists(root) { return }
            let retained = HashSet[string](StringComparer.Ordinal)
            if let id = current { retained.Add(id) }
            for reference in references {
                if reference.Host == Authority(context) && reference.AbsolutePath.Length == IdPathLength {
                    retained.Add(reference.AbsolutePath.Substring(1))
                }
            }
            for directory in Directory.EnumerateDirectories(root) {
                let id = Path.GetFileName(directory)
                if retained.Contains(id) || !Guid.TryParseExact(id, IdFormat, out _) { continue }
                using let uri = Uri(context, id)
                context.RevokeUriPermission(uri, ActivityFlags.GrantReadUriPermission)
                Directory.Delete(directory, true)
            }
        }
    }
}
