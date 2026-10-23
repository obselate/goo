using Android.Content;
using Android.Content.Res;
using Android.Database;
using Android.OS;
using Android.Provider;
using System.Text;
using AndroidUri = Android.Net.Uri;

namespace Goo.Android;

[ContentProvider(["${applicationId}.goo.clipboard"], Name = "io.github.obselate.goo.GooClipboardProvider", Exported = false, GrantUriPermissions = true)]
internal sealed class GooClipboardProvider : ContentProvider
{
    private static readonly object initializationGate = new();
    private static bool initialized;
    internal readonly record struct Format(string Type, long Length);
    private readonly record struct Offer(string Directory, Format[] Formats);

    internal static string Authority(Context context) => context.PackageName + ".goo.clipboard";
    internal static string Root(Context context) => Path.Combine(context.NoBackupFilesDir!.AbsolutePath, "goo-clipboard");
    internal static AndroidUri Uri(Context context, string id) => AndroidUri.Parse("content://" + Authority(context) + "/" + id)!;

    internal static string Stage(Context context, TransferData data)
    {
        var root = Root(context);
        lock (initializationGate)
        {
            if (!initialized)
            {
                Directory.CreateDirectory(root);
                foreach (var pending in Directory.EnumerateDirectories(root, ".pending-*")) Directory.Delete(pending, true);
                initialized = true;
            }
        }
        var id = Guid.NewGuid().ToString("N");
        var directory = Path.Combine(root, ".pending-" + id);
        Directory.CreateDirectory(directory);
        try
        {
            using var manifest = new BinaryWriter(File.Create(Path.Combine(directory, "offer")), Encoding.ASCII);
            manifest.Write(data.Representations.Count);
            for (int i = 0; i < data.Representations.Count; i++)
            {
                var item = data.Representations[i];
                var type = Encoding.ASCII.GetBytes(item.ContentType);
                manifest.Write((ushort)type.Length);
                manifest.Write(type);
                manifest.Write((long)item.Bytes.Length);
                File.WriteAllBytes(Path.Combine(directory, i + ".data"), item.Data);
            }
            return id;
        }
        catch
        {
            Directory.Delete(directory, true);
            throw;
        }
    }

    internal static void Commit(Context context, string id) => Directory.Move(Path.Combine(Root(context), ".pending-" + id), Path.Combine(Root(context), id));

    internal static void Discard(Context context, string id)
    {
        var directory = Path.Combine(Root(context), ".pending-" + id);
        if (Directory.Exists(directory)) Directory.Delete(directory, true);
    }

    internal static void Retire(Context context, string? current, IReadOnlyList<Uri> references)
    {
        var root = Root(context);
        if (!Directory.Exists(root)) return;
        var retained = new HashSet<string>(StringComparer.Ordinal);
        if (current is not null) retained.Add(current);
        foreach (var reference in references)
            if (reference.Host == Authority(context) && reference.AbsolutePath.Length == 33)
                retained.Add(reference.AbsolutePath[1..]);
        foreach (var directory in Directory.EnumerateDirectories(root))
        {
            var id = Path.GetFileName(directory);
            if (retained.Contains(id) || !Guid.TryParseExact(id, "N", out _)) continue;
            using var uri = Uri(context, id);
            context.RevokeUriPermission(uri, ActivityFlags.GrantReadUriPermission);
            Directory.Delete(directory, true);
        }
    }

    public override bool OnCreate() => true;

    private Offer Resolve(AndroidUri uri)
    {
        if (Context is null || uri.Scheme != "content" || uri.Authority != Authority(Context)
            || uri.PathSegments?.Count != 1 || !string.IsNullOrEmpty(uri.Query) || !string.IsNullOrEmpty(uri.Fragment)
            || !Guid.TryParseExact(uri.PathSegments[0], "N", out _))
            throw new Java.IO.FileNotFoundException("Unknown clipboard URI");
        try
        {
            var directory = Path.Combine(Root(Context), uri.PathSegments[0]);
            using var manifest = new BinaryReader(File.OpenRead(Path.Combine(directory, "offer")), Encoding.ASCII);
            int count = manifest.ReadInt32();
            if (count is < 1 or > 128) throw new IOException("Invalid clipboard format count");
            var formats = new Format[count];
            long total = 0;
            for (int i = 0; i < count; i++)
            {
                int length = manifest.ReadUInt16();
                if (length is < 1 or > 256) throw new IOException("Invalid clipboard MIME name");
                var encoded = manifest.ReadBytes(length);
                if (encoded.Length != length) throw new EndOfStreamException();
                var type = Encoding.ASCII.GetString(encoded);
                TransferRepresentation.ValidateType(type);
                long size = manifest.ReadInt64();
                if (size < 0 || size > ClipboardTransfer.MaxImageBytes || total > ClipboardTransfer.MaxImageBytes - size)
                    throw new IOException("Invalid clipboard byte count");
                total += size;
                formats[i] = new Format(type, size);
            }
            return new Offer(directory, formats);
        }
        catch (Exception error) when (error is IOException or UnauthorizedAccessException or ArgumentException or FormatException)
        {
            throw new Java.IO.FileNotFoundException("Clipboard data is unavailable");
        }
    }

    public override string? GetType(AndroidUri uri) => Resolve(uri).Formats[0].Type;

    public override string[]? GetStreamTypes(AndroidUri uri, string mimeTypeFilter) => Resolve(uri).Formats
        .Where(format => ClipDescription.CompareMimeTypes(format.Type, mimeTypeFilter)).Select(format => format.Type).ToArray();

    public override ParcelFileDescriptor? OpenFile(AndroidUri uri, string mode)
    {
        if (mode != "r") throw new Java.Lang.SecurityException("Clipboard data is read-only");
        var offer = Resolve(uri);
        return ParcelFileDescriptor.Open(new Java.IO.File(Path.Combine(offer.Directory, "0.data")), ParcelFileMode.ReadOnly);
    }

    public override AssetFileDescriptor? OpenTypedAssetFile(AndroidUri uri, string mimeTypeFilter, Bundle? options)
    {
        var offer = Resolve(uri);
        for (int i = 0; i < offer.Formats.Length; i++)
        {
            if (!ClipDescription.CompareMimeTypes(offer.Formats[i].Type, mimeTypeFilter)) continue;
            var descriptor = ParcelFileDescriptor.Open(new Java.IO.File(Path.Combine(offer.Directory, i + ".data")), ParcelFileMode.ReadOnly)
                ?? throw new Java.IO.FileNotFoundException("Clipboard data is unavailable");
            return new AssetFileDescriptor(descriptor, 0, offer.Formats[i].Length);
        }
        throw new Java.IO.FileNotFoundException("Clipboard MIME type is unavailable");
    }

    public override ICursor? Query(AndroidUri uri, string[]? projection, string? selection, string[]? selectionArgs, string? sortOrder)
    {
        var offer = Resolve(uri);
        var columns = projection ?? [IOpenableColumns.DisplayName, IOpenableColumns.Size];
        var result = new MatrixCursor(columns);
        var row = result.NewRow()!;
        foreach (var column in columns)
            row.Add(column == IOpenableColumns.DisplayName ? new Java.Lang.String("Clipboard") : column == IOpenableColumns.Size ? Java.Lang.Long.ValueOf(offer.Formats[0].Length) : null);
        return result;
    }

    public override AndroidUri? Insert(AndroidUri uri, ContentValues? values) => throw new Java.Lang.SecurityException("Clipboard data is read-only");
    public override int Update(AndroidUri uri, ContentValues? values, string? selection, string[]? selectionArgs) => throw new Java.Lang.SecurityException("Clipboard data is read-only");
    public override int Delete(AndroidUri uri, string? selection, string[]? selectionArgs) => throw new Java.Lang.SecurityException("Clipboard data is read-only");
}
