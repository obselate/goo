using Android.Content;
using Android.Database;
using Android.OS;
using Android.Provider;
using System.Text;
using Doc = Android.Provider.DocumentsContract.Document;
using Root = Android.Provider.DocumentsContract.Root;

namespace GooAndroidClipboardPeer;

[ContentProvider(["org.goo.clipboardpeer.documents"], Name = "org.goo.clipboardpeer.Documents", Exported = true,
    GrantUriPermissions = true, Permission = Android.Manifest.Permission.ManageDocuments)]
[IntentFilter([DocumentsContract.ProviderInterface])]
internal sealed class DocumentProvider : DocumentsProvider
{
    private static readonly string[] DocumentColumns = [Doc.ColumnDocumentId, Doc.ColumnDisplayName, Doc.ColumnMimeType,
        Doc.ColumnFlags, Doc.ColumnSize, Doc.ColumnLastModified];
    private string directory = "";
    private readonly record struct Document(string Id, string Name, string Type, long Size);

    public override bool OnCreate()
    {
        directory = Path.Combine(Context!.NoBackupFilesDir!.AbsolutePath, "documents");
        Directory.CreateDirectory(directory);
        if (!File.Exists(Path.Combine(directory, "text.data")))
            File.WriteAllBytes(Path.Combine(directory, "text.data"), Encoding.UTF8.GetBytes("SAF text document"));
        if (!File.Exists(Path.Combine(directory, "image.data")))
            File.WriteAllBytes(Path.Combine(directory, "image.data"), Convert.FromBase64String("iVBORw0KGgoAAAANSUhEUgAAAAIAAAACCAYAAABytg0kAAAAG0lEQVR4nGN4YKDwX+GCRwODQcKD/x8OGPwHAEr2CTbQb4AmAAAAAElFTkSuQmCC"));
        return true;
    }

    public override ICursor? QueryRoots(string[]? projection)
    {
        var columns = projection ?? [Root.ColumnRootId, Root.ColumnDocumentId, Root.ColumnTitle,
            Root.ColumnFlags, Root.ColumnMimeTypes, Root.ColumnIcon];
        var cursor = new MatrixCursor(columns);
        var row = cursor.NewRow()!;
        foreach (var column in columns)
            row.Add(column switch {
                Root.ColumnRootId => new Java.Lang.String("root"),
                Root.ColumnDocumentId => new Java.Lang.String("root"),
                Root.ColumnTitle => new Java.Lang.String("Goo documents"),
                Root.ColumnIcon => Java.Lang.Integer.ValueOf(Android.Resource.Drawable.IcMenuSave),
                Root.ColumnFlags => Java.Lang.Integer.ValueOf((int)(DocumentRootFlags.SupportsCreate | DocumentRootFlags.SupportsIsChild)),
                Root.ColumnMimeTypes => new Java.Lang.String("*/*"),
                _ => null
            });
        return cursor;
    }

    public override ICursor? QueryDocument(string? documentId, string[]? projection)
    {
        var columns = projection ?? DocumentColumns;
        var cursor = new MatrixCursor(columns);
        Add(cursor, columns, Read(documentId));
        return cursor;
    }

    public override ICursor? QueryChildDocuments(string? parentDocumentId, string[]? projection, string? sortOrder)
    {
        if (parentDocumentId != "root") throw new Java.IO.FileNotFoundException("Not a document directory");
        var columns = projection ?? DocumentColumns;
        var cursor = new MatrixCursor(columns);
        foreach (var id in new[] { "text", "image", "stream" }) Add(cursor, columns, Read(id));
        foreach (var metadata in Directory.EnumerateFiles(directory, "created-*.meta"))
            Add(cursor, columns, Read(Path.GetFileNameWithoutExtension(metadata)));
        return cursor;
    }

    private static void Add(MatrixCursor cursor, string[] columns, Document document)
    {
        var row = cursor.NewRow()!;
        foreach (var column in columns)
            row.Add(column switch {
                Doc.ColumnDocumentId => new Java.Lang.String(document.Id),
                Doc.ColumnDisplayName => new Java.Lang.String(document.Name),
                Doc.ColumnMimeType => new Java.Lang.String(document.Type),
                Doc.ColumnSize => Java.Lang.Long.ValueOf(document.Size),
                Doc.ColumnLastModified => Java.Lang.Long.ValueOf(1),
                Doc.ColumnFlags => Java.Lang.Integer.ValueOf(document.Id == "root" ? (int)DocumentContractFlags.DirSupportsCreate
                    : document.Id == "stream" ? 0 : (int)DocumentContractFlags.SupportsWrite),
                _ => null
            });
    }

    private Document Read(string? id)
    {
        if (id is null) throw new Java.IO.FileNotFoundException("Unknown document");
        if (id == "root") return new Document(id, "Goo documents", Doc.MimeTypeDir, 0);
        if (id == "stream") return new Document(id, "stream.bin", "application/octet-stream", 262144);
        var path = FilePath(id);
        if (!File.Exists(path)) throw new Java.IO.FileNotFoundException("Unknown document");
        if (id == "text") return new Document(id, "first.txt", "text/plain", new FileInfo(path).Length);
        if (id == "image") return new Document(id, "image.png", "image/png", new FileInfo(path).Length);
        using var metadata = new BinaryReader(File.OpenRead(Path.Combine(directory, id + ".meta")));
        string type = metadata.ReadString();
        return new Document(id, metadata.ReadString(), type, new FileInfo(path).Length);
    }

    private string FilePath(string? id)
    {
        if (id is null || id is not ("text" or "image") && (!id.StartsWith("created-", StringComparison.Ordinal)
            || !Guid.TryParseExact(id.AsSpan(8), "N", out _)))
            throw new Java.IO.FileNotFoundException("Unknown document");
        return Path.Combine(directory, id + ".data");
    }

    public override ParcelFileDescriptor? OpenDocument(string? documentId, string? mode, CancellationSignal? signal)
    {
        signal?.ThrowIfCanceled();
        if (mode is null) throw new Java.Lang.IllegalArgumentException("A document mode is required");
        if (documentId == "stream")
        {
            if (mode != "r") throw new Java.Lang.SecurityException("Stream document is read-only");
            var pipe = ParcelFileDescriptor.CreatePipe()!;
            _ = Task.Run(() => {
                using var output = new ParcelFileDescriptor.AutoCloseOutputStream(pipe[1]);
                try
                {
                    var chunk = new byte[65536];
                    for (int i = 0; i < chunk.Length; i++) chunk[i] = (byte)i;
                    for (int i = 0; i < 4; i++) output.Write(chunk, 0, chunk.Length);
                }
                finally { output.Close(); pipe[1].Dispose(); }
            });
            return pipe[0];
        }
        var path = FilePath(documentId);
        if (!File.Exists(path)) throw new Java.IO.FileNotFoundException("Unknown document");
        return ParcelFileDescriptor.Open(new Java.IO.File(path), ParcelFileDescriptor.ParseMode(mode));
    }

    public override string? CreateDocument(string? parentDocumentId, string? mimeType, string? displayName)
    {
        if (parentDocumentId != "root") throw new Java.IO.FileNotFoundException("Not a document directory");
        if (mimeType is null || displayName is null) throw new Java.Lang.IllegalArgumentException("Document MIME type and name are required");
        var id = "created-" + Guid.NewGuid().ToString("N");
        using (File.Create(FilePath(id))) { }
        using var metadata = new BinaryWriter(File.Create(Path.Combine(directory, id + ".meta")));
        metadata.Write(mimeType);
        metadata.Write(displayName);
        return id;
    }

    public override bool IsChildDocument(string? parentDocumentId, string? documentId)
    {
        if (parentDocumentId != "root" || documentId == "root") return false;
        Read(documentId);
        return true;
    }

    public override DocumentsContract.Path? FindDocumentPath(string? parentDocumentId, string? childDocumentId)
    {
        var document = Read(childDocumentId);
        if (parentDocumentId is not null && parentDocumentId != "root" && parentDocumentId != document.Id)
            throw new Java.IO.FileNotFoundException("Unknown parent document");
        string[] path = document.Id == "root" || parentDocumentId == document.Id ? [document.Id] : ["root", document.Id];
        return new DocumentsContract.Path(parentDocumentId is null ? "root" : null, path);
    }
}
