package GooAndroidClipboardPeer

import Android.App
import Android.Content
import Android.Graphics
import Android.OS
import Android.Widget
import System
import System.Linq
import System.Text
import System.Threading.Tasks

@Activity(Name: "org.goo.clipboardpeer.MainActivity", MainLauncher: true, Exported: true)
public sealed class MainActivity : Activity {
    private var started bool
    private var output TextView?

    protected override func OnCreate(savedInstanceState Bundle?) {
        base.OnCreate(savedInstanceState)
        output = TextView(this){Text = "Checking OS clipboard streams"}
        SetContentView(output)
    }

    public override async func OnWindowFocusChanged(hasFocus bool) void {
        base.OnWindowFocusChanged(hasFocus)
        if !hasFocus || started { return }
        started = true
        try {
            let manager = cast[ClipboardManager](this.GetSystemService(Context.ClipboardService)!!)
            using let clip = manager.PrimaryClip ?? throw InvalidOperationException("OS clipboard is empty")
            Require(clip.ItemCount == 1, "MIME selection did not use one URI item")
            using let item = clip.GetItemAt(0)!!
            using let uri = item.Uri ?? throw InvalidOperationException("Clipboard has no content URI")
            Require(uri.Scheme == "content", "Clipboard exposed a filesystem path")
            Require(item.CoerceToText(this)?.ToString() == PlainText, "Native text alternative changed")
            await Task.Run(() -> Verify(uri))
            output!!.Text = "OS clipboard streams passed"
            Android.Util.Log.Info(Tag, "GOO_ANDROID_CLIPBOARD_PASS")
        } catch (error Exception) {
            output!!.Text = error.ToString()
            Android.Util.Log.Error(Tag, "GOO_ANDROID_CLIPBOARD_FAIL " + error.ToString())
        }
    }

    private func Verify(uri Android.Net.Uri) {
        let types = []string{ImageType, "text/plain;charset=utf-8", HtmlType, RtfType, BinaryType, EmptyType}
        let resolver = ContentResolver!!
        Require(resolver.GetType(uri) == ImageType, "Native image MIME type changed")
        let offered = resolver.GetStreamTypes(uri, "*/*") ?? Array.Empty[string]()
        Require(types.All(offered.Contains), "A native stream alternative was omitted")
        for type in types {
            using let asset = resolver.OpenTypedAssetFileDescriptor(uri, type, nil)
                ?? throw InvalidOperationException("Missing stream " + type)
            using let stream = asset.CreateInputStream()!!
            let length = if type == ImageType { ImageBytes } else if type == BinaryType { BinaryBytes }
                else if type == EmptyType { 0 } else { Encoding.UTF8.GetByteCount(Text(type)) }
            let bytes = [length]uint8
            stream.ReadExactly(bytes)
            Require(stream.ReadByte() == -1, "Stream byte count changed for " + type)
            if type == ImageType {
                using let bitmap = BitmapFactory.DecodeByteArray(bytes, 0, bytes.Length)
                Require(bitmap != nil && bitmap.Width == 2 && bitmap.Height == 2, "Native image did not decode")
            } else if type == BinaryType {
                for i in 0 ... bytes.Length { Require(bytes[i] == uint8(i), "Large stream bytes changed") }
            } else if type != EmptyType {
                Require(Encoding.UTF8.GetString(bytes) == Text(type), "Text bytes changed for " + type)
            }
        }
        var readOnly bool
        try { using let stream = resolver.OpenOutputStream(uri) }
        catch (error Java.Lang.SecurityException) { readOnly = true }
        Require(readOnly, "Clipboard URI granted write access")
    }

    shared {
        private const Tag string = "GooClipboard"
        private const ImageType string = "image/png"
        private const HtmlType string = "text/html"
        private const RtfType string = "application/rtf"
        private const BinaryType string = "application/x-goo-transfer-check"
        private const EmptyType string = "application/x-goo-empty"
        private const PlainText string = "Android MIME transfer"
        private const ImageBytes int32 = 84
        private const BinaryBytes int32 = 1048576

        private func Text(type string) string -> if type == HtmlType { "<b>Android MIME transfer</b>" }
            else if type == RtfType { `{\rtf1 Android MIME transfer}` } else { PlainText }

        private func Require(condition bool, message string) {
            if !condition { throw InvalidOperationException(message) }
        }
    }
}
