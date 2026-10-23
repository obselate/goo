package GooAndroidClipboardPeer

import Android.App
import Android.Content
import Android.Database
import Android.OS
import Android.Provider
import System
import System.IO
import System.Text
import System.Threading.Tasks
import Doc = Android.Provider.DocumentsContract.Document
import Root = Android.Provider.DocumentsContract.Root

@ContentProvider([]string{"org.goo.clipboardpeer.documents"}, Name: "org.goo.clipboardpeer.Documents", Exported: true,
    GrantUriPermissions: true, Permission: "android.permission.MANAGE_DOCUMENTS")
@IntentFilterAttribute([]string{"android.content.action.DOCUMENTS_PROVIDER"})
internal sealed class DocumentProvider : DocumentsProvider {
    private var directory string = ""
    private data struct Document(Id string, Name string, Type string, Size int64)

    public override func OnCreate() bool {
        directory = Path.Combine(Context!!.NoBackupFilesDir!!.AbsolutePath, DirectoryName)
        Directory.CreateDirectory(directory)
        if !File.Exists(Path.Combine(directory, TextId + DataSuffix)) {
            File.WriteAllBytes(Path.Combine(directory, TextId + DataSuffix), Encoding.UTF8.GetBytes(DocumentText))
        }
        if !File.Exists(Path.Combine(directory, ImageId + DataSuffix)) {
            File.WriteAllBytes(Path.Combine(directory, ImageId + DataSuffix), Convert.FromBase64String(ImageBase64))
        }
        return true
    }

    public override func QueryRoots(projection []?string) ICursor? {
        let columns = projection ?? []string{Root.ColumnRootId, Root.ColumnDocumentId, Root.ColumnTitle,
            Root.ColumnFlags, Root.ColumnMimeTypes, Root.ColumnIcon}
        let cursor = MatrixCursor(columns)
        let row = cursor.NewRow()!!
        for column in columns {
            let value Java.Lang.Object? = if column == Root.ColumnRootId || column == Root.ColumnDocumentId {
                Java.Lang.String(RootId)
            } else if column == Root.ColumnTitle { Java.Lang.String(DirectoryTitle) }
            else if column == Root.ColumnIcon { Java.Lang.Integer.ValueOf(Android.Resource.Drawable.IcMenuSave) }
            else if column == Root.ColumnFlags {
                Java.Lang.Integer.ValueOf(int32(DocumentRootFlags.SupportsCreate | DocumentRootFlags.SupportsIsChild))
            } else if column == Root.ColumnMimeTypes { Java.Lang.String(AllMimeTypes) } else { nil }
            row.Add(value)
        }
        return cursor
    }

    public override func QueryDocument(documentId string?, projection []?string) ICursor? {
        let columns = projection ?? DocumentColumns
        let cursor = MatrixCursor(columns)
        Add(cursor, columns, Read(documentId))
        return cursor
    }

    public override func QueryChildDocuments(parentDocumentId string?, projection []?string, sortOrder string?)
        ICursor? {
        if parentDocumentId != RootId { throw Java.IO.FileNotFoundException("Not a document directory") }
        let columns = projection ?? DocumentColumns
        let cursor = MatrixCursor(columns)
        for id in []string{TextId, ImageId, StreamId} { Add(cursor, columns, Read(id)) }
        for metadata in Directory.EnumerateFiles(directory, CreatedPrefix + "*" + MetadataSuffix) {
            Add(cursor, columns, Read(Path.GetFileNameWithoutExtension(metadata)))
        }
        return cursor
    }

    private func Read(id string?) Document {
        guard let identifier = id else { throw Java.IO.FileNotFoundException("Unknown document") }
        if identifier == RootId { return Document(identifier, DirectoryTitle, Doc.MimeTypeDir, 0) }
        if identifier == StreamId { return Document(identifier, "stream.bin", StreamMime, StreamBytes) }
        let path = FilePath(identifier)
        if !File.Exists(path) { throw Java.IO.FileNotFoundException("Unknown document") }
        if identifier == TextId { return Document(identifier, "first.txt", PlainMime, FileInfo(path).Length) }
        if identifier == ImageId { return Document(identifier, "image.png", ImageMime, FileInfo(path).Length) }
        using let metadata = BinaryReader(File.OpenRead(Path.Combine(directory, identifier + MetadataSuffix)))
        let type = metadata.ReadString()
        return Document(identifier, metadata.ReadString(), type, FileInfo(path).Length)
    }

    private func FilePath(id string?) string {
        guard let identifier = id else { throw Java.IO.FileNotFoundException("Unknown document") }
        if identifier != TextId && identifier != ImageId
            && (!identifier.StartsWith(CreatedPrefix, StringComparison.Ordinal)
            || !Guid.TryParseExact(identifier.AsSpan(CreatedPrefix.Length), IdFormat, out _)) {
            throw Java.IO.FileNotFoundException("Unknown document")
        }
        return Path.Combine(directory, identifier + DataSuffix)
    }

    public override func OpenDocument(documentId string?, mode string?, signal CancellationSignal?)
        ParcelFileDescriptor? {
        signal?.ThrowIfCanceled()
        guard let accessMode = mode else { throw Java.Lang.IllegalArgumentException("A document mode is required") }
        if documentId == StreamId {
            if accessMode != ReadMode { throw Java.Lang.SecurityException("Stream document is read-only") }
            let pipe = ParcelFileDescriptor.CreatePipe()!!
            Task.Run(() -> {
                using let output = ParcelFileDescriptor.AutoCloseOutputStream(pipe[1])
                try {
                    let chunk = [ChunkBytes]uint8
                    for i in 0 ... chunk.Length { chunk[i] = uint8(i) }
                    for i in 0 ... StreamChunks { output.Write(chunk, 0, chunk.Length) }
                } finally {
                    output.Close()
                    cast[IDisposable](pipe[1]).Dispose()
                }
            })
            return pipe[0]
        }
        let path = FilePath(documentId)
        if !File.Exists(path) { throw Java.IO.FileNotFoundException("Unknown document") }
        return ParcelFileDescriptor.Open(Java.IO.File(path), ParcelFileDescriptor.ParseMode(accessMode))
    }

    public override func CreateDocument(parentDocumentId string?, mimeType string?, displayName string?) string? {
        if parentDocumentId != RootId { throw Java.IO.FileNotFoundException("Not a document directory") }
        if mimeType == nil || displayName == nil {
            throw Java.Lang.IllegalArgumentException("Document MIME type and name are required")
        }
        let id = CreatedPrefix + Guid.NewGuid().ToString(IdFormat)
        { using let file = File.Create(FilePath(id)) }
        using let metadata = BinaryWriter(File.Create(Path.Combine(directory, id + MetadataSuffix)))
        metadata.Write(mimeType)
        metadata.Write(displayName)
        return id
    }

    public override func IsChildDocument(parentDocumentId string?, documentId string?) bool {
        if parentDocumentId != RootId || documentId == RootId { return false }
        Read(documentId)
        return true
    }

    public override func FindDocumentPath(parentDocumentId string?, childDocumentId string?) DocumentsContract.Path? {
        let document = Read(childDocumentId)
        if parentDocumentId != nil && parentDocumentId != RootId && parentDocumentId != document.Id {
            throw Java.IO.FileNotFoundException("Unknown parent document")
        }
        let path = if document.Id == RootId || parentDocumentId == document.Id { []string{document.Id} }
            else { []string{RootId, document.Id} }
        let rootId string? = if parentDocumentId == nil { RootId } else { nil }
        return DocumentsContract.Path(rootId, path)
    }

    shared {
        private const DirectoryName string = "documents"
        private const DirectoryTitle string = "Goo documents"
        private const RootId string = "root"
        private const TextId string = "text"
        private const ImageId string = "image"
        private const StreamId string = "stream"
        private const CreatedPrefix string = "created-"
        private const DataSuffix string = ".data"
        private const MetadataSuffix string = ".meta"
        private const IdFormat string = "N"
        private const ReadMode string = "r"
        private const PlainMime string = "text/plain"
        private const ImageMime string = "image/png"
        private const StreamMime string = "application/octet-stream"
        private const AllMimeTypes string = "*/*"
        private const DocumentText string = "SAF text document"
        private const ChunkBytes int32 = 65536
        private const StreamChunks int32 = 4
        private const StreamBytes int32 = ChunkBytes * StreamChunks
        private const ImageBase64 string = "iVBORw0KGgoAAAANSUhEUgAAAAIAAAACCAYAAABytg0kAAAAG0lEQVR4nGN4YKDwX+GCRwOD"
            + "QcKD/x8OGPwHAEr2CTbQb4AmAAAAAElFTkSuQmCC"
        private let DocumentColumns []string = []string{Doc.ColumnDocumentId, Doc.ColumnDisplayName, Doc.ColumnMimeType,
            Doc.ColumnFlags, Doc.ColumnSize, Doc.ColumnLastModified}

        private func Add(cursor MatrixCursor, columns []string, document Document) {
            let row = cursor.NewRow()!!
            for column in columns {
                let value Java.Lang.Object? = if column == Doc.ColumnDocumentId { Java.Lang.String(document.Id) }
                    else if column == Doc.ColumnDisplayName { Java.Lang.String(document.Name) }
                    else if column == Doc.ColumnMimeType { Java.Lang.String(document.Type) }
                    else if column == Doc.ColumnSize { Java.Lang.Long.ValueOf(document.Size) }
                    else if column == Doc.ColumnLastModified { Java.Lang.Long.ValueOf(1) }
                    else if column == Doc.ColumnFlags {
                        Java.Lang.Integer.ValueOf(if document.Id == RootId {
                            int32(DocumentContractFlags.DirSupportsCreate)
                        }
                            else if document.Id == StreamId { 0 } else { int32(DocumentContractFlags.SupportsWrite) })
                    } else { nil }
                row.Add(value)
            }
        }
    }
}
