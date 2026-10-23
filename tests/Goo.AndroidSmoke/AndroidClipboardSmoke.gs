package GooAndroidSmokeApp

import Android.Content
import Android.Graphics
import Goo
import Goo.Android
import System
import System.Linq
import System.Text
import System.Threading.Tasks

internal class AndroidClipboardSmoke {
    shared {
        private const Tag string = "GooClipboard"
        private const ImageType string = "image/png"
        private const UriList string = "text/uri-list"
        private const BinaryBytes int32 = 1048576
        private const InlineBytes int32 = 65536
        private const RepeatedUris int32 = 4095
        private let Image []uint8 = Convert.FromBase64String(
            "iVBORw0KGgoAAAANSUhEUgAAAAIAAAACCAYAAABytg0kAAAAG0lEQVR4nGN4YKDwX+GCRwOD"
                + "QcKD/x8OGPwHAEr2CTbQb4AmAAAAAElFTkSuQmCC")
        private let Types []string = []string{ImageType, "text/plain;charset=utf-8", "text/html", "application/rtf",
            "application/x-goo-transfer-check", "application/x-goo-empty"}

        internal async func Run(view GooView) void {
            try {
                let large = [BinaryBytes]uint8
                for i in 0 ... large.Length { large[i] = uint8(i) }
                let expected = [][]uint8{Image, Encoding.UTF8.GetBytes("Android MIME transfer"),
                    Encoding.UTF8.GetBytes("<b>Android MIME transfer</b>"),
                    Encoding.UTF8.GetBytes(`{\rtf1 Android MIME transfer}`), large, Array.Empty[uint8]()}
                let representations = [Types.Length]TransferRepresentation
                for i in 0 ... representations.Length {
                    representations[i] = TransferRepresentation(Types[i], ReadOnlyMemory[uint8](expected[i]))
                }
                let data = TransferData(representations, Array.Empty[Uri]())
                var result = await view.Window.WriteClipboardAsync(data)
                Require(result.Status == DataTransferStatus.Success,
                    "MIME write: ${result.Status} ${result.Error}")
                let formats = view.Window.GetClipboardFormats()
                Require(formats.Status == ClipboardReadStatus.Success, "Format query: ${formats.Status}")
                for type in Types { Require(formats.Formats.Contains(type), "Missing MIME format " + type) }
                let snapshot = await view.Window.ReadClipboardDataAsync(Types)
                Require(snapshot.Status == ClipboardReadStatus.Success,
                    "MIME read: ${snapshot.Status} ${snapshot.Error}")
                for item in snapshot.Data.Representations {
                    let index = Array.IndexOf(Types, item.ContentType)
                    Require(index >= 0 && item.Bytes.Span.SequenceEqual(expected[index]),
                        "Changed MIME bytes " + item.ContentType)
                }
                Require(snapshot.Data.Representations.Count == Types.Length, "A MIME alternative was omitted")
                using let bitmap = BitmapFactory.DecodeByteArray(Image, 0, Image.Length)
                Require(bitmap != nil && bitmap.Width == 2 && bitmap.Height == 2, "Image fixture did not decode")
                let manager = cast[ClipboardManager](view.Context!!.GetSystemService(Context.ClipboardService)!!)
                using let native = manager.PrimaryClip!!
                using let first = native.GetItemAt(0)!!
                using let uri = first.Uri!!
                Require(uri.Scheme == "content" && native.ItemCount == 1,
                    "MIME bytes were not published through one content URI")
                let reference = Uri(uri.ToString()!!, UriKind.Absolute)
                await Task.Run(() -> VerifyNative(view.Context!!, uri))
                let files = TransferData(Array.Empty[TransferRepresentation](), []Uri{reference})
                result = await view.Window.WriteClipboardAsync(files)
                Require(result.Status == DataTransferStatus.Success, "URI write: ${result.Status} ${result.Error}")
                let references = await view.Window.ReadClipboardDataAsync([]string{UriList})
                Require(references.Status == ClipboardReadStatus.Success && references.Data.Uris.Count == 1
                    && references.Data.Uris[0] == reference, "URI reference changed")
                let image = await view.Window.ReadClipboardDataAsync([]string{ImageType})
                Require(image.Status == ClipboardReadStatus.Success
                    && image.Data.Representations.Single().Bytes.Span.SequenceEqual(Image),
                    "Referenced image stream was retired")
                result = await view.Window.WriteClipboardAsync(files, ClipboardIntent.Cut)
                Require(result.Status == DataTransferStatus.Unsupported, "Android Cut did not report Unsupported")
                result = await view.Window.WriteClipboardAsync(TransferData(Array.Empty[TransferRepresentation](),
                    []Uri{Uri("file:///clipboard-check.png")}))
                Require(result.Status == DataTransferStatus.Unsupported,
                    "A filesystem path was accepted as an Android document")
                let repeated = [RepeatedUris]Uri
                Array.Fill(repeated, reference)
                let inline = TransferRepresentation("text/html",
                    ReadOnlyMemory[uint8](Encoding.UTF8.GetBytes(String('a', InlineBytes))))
                result = await view.Window.WriteClipboardAsync(TransferData([]TransferRepresentation{inline}, repeated))
                Require(result.Status == DataTransferStatus.TooLarge,
                    "Large Binder metadata: ${result.Status} ${result.Error}")
                result = await view.Window.WriteClipboardAsync(data)
                Require(result.Status == DataTransferStatus.Success,
                    "Final MIME write: ${result.Status} ${result.Error}")
                cast[IDisposable](view).Dispose()
                Require(snapshot.Data.Representations[0].Bytes.Span.SequenceEqual(Image),
                    "Owned bytes changed after view disposal")
                Android.Util.Log.Info(Tag, "GOO_ANDROID_CLIPBOARD_READY")
            } catch (error Exception) { Android.Util.Log.Error(Tag, "GOO_ANDROID_CLIPBOARD_FAIL " + error.ToString()) }
        }

        private func VerifyNative(context Context, uri Android.Net.Uri) {
            let resolver = context.ContentResolver!!
            Require(resolver.GetType(uri) == ImageType, "Native image type is unavailable")
            Require(resolver.GetStreamTypes(uri, "*/*")?.Length == Types.Length,
                "Native stream alternatives are incomplete")
            using let image = resolver.OpenTypedAssetFileDescriptor(uri, ImageType, nil)!!
            using let stream = image.CreateInputStream()!!
            let bytes = [Image.Length]uint8
            stream.ReadExactly(bytes)
            Require(bytes.AsSpan().SequenceEqual(Image), "Native PNG bytes changed")
            var readOnly bool
            try { using let output = resolver.OpenOutputStream(uri) }
            catch (error Java.Lang.SecurityException) { readOnly = true }
            Require(readOnly, "Clipboard provider allowed a write")
        }

        private func Require(condition bool, message string) {
            if !condition { throw InvalidOperationException(message) }
        }
    }
}
