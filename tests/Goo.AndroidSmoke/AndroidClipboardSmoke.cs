using Android.Content;
using Android.Graphics;
using Goo;
using Goo.Android;
using System.Text;

namespace GooAndroidSmokeApp;

internal static class AndroidClipboardSmoke
{
    private const string Tag = "GooClipboard";
    private static readonly byte[] Image = Convert.FromBase64String("iVBORw0KGgoAAAANSUhEUgAAAAIAAAACCAYAAABytg0kAAAAG0lEQVR4nGN4YKDwX+GCRwODQcKD/x8OGPwHAEr2CTbQb4AmAAAAAElFTkSuQmCC");
    private static readonly string[] Types = ["image/png", "text/plain;charset=utf-8", "text/html", "application/rtf", "application/x-goo-transfer-check", "application/x-goo-empty"];

    internal static async void Run(GooView view)
    {
        try
        {
            var large = new byte[1048576];
            for (int i = 0; i < large.Length; i++) large[i] = (byte)i;
            byte[][] expected = [Image, Encoding.UTF8.GetBytes("Android MIME transfer"), Encoding.UTF8.GetBytes("<b>Android MIME transfer</b>"), Encoding.UTF8.GetBytes(@"{\rtf1 Android MIME transfer}"), large, []];
            var representations = new TransferRepresentation[Types.Length];
            for (int i = 0; i < representations.Length; i++) representations[i] = new TransferRepresentation(Types[i], new ReadOnlyMemory<byte>(expected[i]));
            var data = new TransferData(representations, []);
            var result = await view.Window.WriteClipboardAsync(data);
            Require(result.Status == DataTransferStatus.Success, "MIME write: " + result.Status + " " + result.Error);
            var formats = view.Window.GetClipboardFormats();
            Require(formats.Status == ClipboardReadStatus.Success, "Format query: " + formats.Status);
            foreach (var type in Types) Require(formats.Formats.Contains(type), "Missing MIME format " + type);
            var snapshot = await view.Window.ReadClipboardDataAsync(Types);
            Require(snapshot.Status == ClipboardReadStatus.Success, "MIME read: " + snapshot.Status + " " + snapshot.Error);
            foreach (var item in snapshot.Data.Representations)
            {
                int index = Array.IndexOf(Types, item.ContentType);
                Require(index >= 0 && item.Bytes.Span.SequenceEqual(expected[index]), "Changed MIME bytes " + item.ContentType);
            }
            Require(snapshot.Data.Representations.Count == Types.Length, "A MIME alternative was omitted");
            using var bitmap = BitmapFactory.DecodeByteArray(Image, 0, Image.Length);
            Require(bitmap is { Width: 2, Height: 2 }, "Image fixture did not decode");
            var manager = (ClipboardManager)view.Context!.GetSystemService(Context.ClipboardService)!;
            using var native = manager.PrimaryClip!;
            using var first = native.GetItemAt(0)!;
            using var uri = first.Uri!;
            Require(uri.Scheme == "content" && native.ItemCount == 1, "MIME bytes were not published through one content URI");
            var reference = new Uri(uri.ToString()!, UriKind.Absolute);
            await Task.Run(() => VerifyNative(view.Context!, uri));
            var files = new TransferData([], [reference]);
            result = await view.Window.WriteClipboardAsync(files);
            Require(result.Status == DataTransferStatus.Success, "URI write: " + result.Status + " " + result.Error);
            var references = await view.Window.ReadClipboardDataAsync(["text/uri-list"]);
            Require(references.Status == ClipboardReadStatus.Success && references.Data.Uris.Count == 1 && references.Data.Uris[0] == reference, "URI reference changed");
            var image = await view.Window.ReadClipboardDataAsync(["image/png"]);
            Require(image.Status == ClipboardReadStatus.Success && image.Data.Representations.Single().Bytes.Span.SequenceEqual(Image), "Referenced image stream was retired");
            result = await view.Window.WriteClipboardAsync(files, ClipboardIntent.Cut);
            Require(result.Status == DataTransferStatus.Unsupported, "Android Cut did not report Unsupported");
            result = await view.Window.WriteClipboardAsync(new TransferData([], [new Uri("file:///clipboard-check.png")]));
            Require(result.Status == DataTransferStatus.Unsupported, "A filesystem path was accepted as an Android document");
            var repeated = new Uri[4095];
            Array.Fill(repeated, reference);
            var inline = new TransferRepresentation("text/html", new ReadOnlyMemory<byte>(Encoding.UTF8.GetBytes(new string('a', 65536))));
            result = await view.Window.WriteClipboardAsync(new TransferData([inline], repeated));
            Require(result.Status == DataTransferStatus.TooLarge, "Large Binder metadata: " + result.Status + " " + result.Error);
            result = await view.Window.WriteClipboardAsync(data);
            Require(result.Status == DataTransferStatus.Success, "Final MIME write: " + result.Status + " " + result.Error);
            view.Dispose();
            Require(snapshot.Data.Representations[0].Bytes.Span.SequenceEqual(Image), "Owned bytes changed after view disposal");
            Android.Util.Log.Info(Tag, "GOO_ANDROID_CLIPBOARD_READY");
        }
        catch (Exception error) { Android.Util.Log.Error(Tag, "GOO_ANDROID_CLIPBOARD_FAIL " + error); }
    }

    private static void VerifyNative(Context context, Android.Net.Uri uri)
    {
        var resolver = context.ContentResolver!;
        Require(resolver.GetType(uri) == "image/png", "Native image type is unavailable");
        Require(resolver.GetStreamTypes(uri, "*/*")?.Length == Types.Length, "Native stream alternatives are incomplete");
        using var image = resolver.OpenTypedAssetFileDescriptor(uri, "image/png", null)!;
        using var stream = image.CreateInputStream()!;
        var bytes = new byte[Image.Length];
        stream.ReadExactly(bytes);
        Require(bytes.AsSpan().SequenceEqual(Image), "Native PNG bytes changed");
        bool readOnly = false;
        try { using var output = resolver.OpenOutputStream(uri); }
        catch (Java.Lang.SecurityException) { readOnly = true; }
        Require(readOnly, "Clipboard provider allowed a write");
    }

    private static void Require(bool condition, string message)
    {
        if (!condition) throw new InvalidOperationException(message);
    }
}
