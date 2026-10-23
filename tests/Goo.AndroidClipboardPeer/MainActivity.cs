using Android.App;
using Android.Content;
using Android.Graphics;
using Android.OS;
using Android.Widget;
using System.Text;

namespace GooAndroidClipboardPeer;

[Activity(Name = "org.goo.clipboardpeer.MainActivity", MainLauncher = true, Exported = true)]
public sealed class MainActivity : Activity
{
    private bool started;
    private TextView? output;

    protected override void OnCreate(Bundle? savedInstanceState)
    {
        base.OnCreate(savedInstanceState);
        output = new TextView(this) { Text = "Checking OS clipboard streams" };
        SetContentView(output);
    }

    public override async void OnWindowFocusChanged(bool hasFocus)
    {
        base.OnWindowFocusChanged(hasFocus);
        if (!hasFocus || started) return;
        started = true;
        try
        {
            var manager = (ClipboardManager)GetSystemService(ClipboardService)!;
            using var clip = manager.PrimaryClip ?? throw new InvalidOperationException("OS clipboard is empty");
            Require(clip.ItemCount == 1, "MIME selection did not use one URI item");
            using var item = clip.GetItemAt(0)!;
            using var uri = item.Uri ?? throw new InvalidOperationException("Clipboard has no content URI");
            Require(uri.Scheme == "content", "Clipboard exposed a filesystem path");
            Require(item.CoerceToText(this)?.ToString() == "Android MIME transfer", "Native text alternative changed");
            await Task.Run(() => Verify(uri));
            output!.Text = "OS clipboard streams passed";
            Android.Util.Log.Info("GooClipboard", "GOO_ANDROID_CLIPBOARD_PASS");
        }
        catch (Exception error)
        {
            output!.Text = error.ToString();
            Android.Util.Log.Error("GooClipboard", "GOO_ANDROID_CLIPBOARD_FAIL " + error);
        }
    }

    private void Verify(Android.Net.Uri uri)
    {
        string[] types = ["image/png", "text/plain;charset=utf-8", "text/html", "application/rtf", "application/x-goo-transfer-check", "application/x-goo-empty"];
        var resolver = ContentResolver!;
        Require(resolver.GetType(uri) == "image/png", "Native image MIME type changed");
        var offered = resolver.GetStreamTypes(uri, "*/*") ?? [];
        Require(types.All(offered.Contains), "A native stream alternative was omitted");
        foreach (var type in types)
        {
            using var asset = resolver.OpenTypedAssetFileDescriptor(uri, type, null) ?? throw new InvalidOperationException("Missing stream " + type);
            using var stream = asset.CreateInputStream()!;
            int length = type switch {
                "image/png" => 84,
                "application/x-goo-transfer-check" => 1048576,
                "application/x-goo-empty" => 0,
                _ => Encoding.UTF8.GetByteCount(Text(type))
            };
            var bytes = new byte[length];
            stream.ReadExactly(bytes);
            Require(stream.ReadByte() == -1, "Stream byte count changed for " + type);
            if (type == "image/png")
            {
                using var bitmap = BitmapFactory.DecodeByteArray(bytes, 0, bytes.Length);
                Require(bitmap is { Width: 2, Height: 2 }, "Native image did not decode");
            }
            else if (type == "application/x-goo-transfer-check")
            {
                for (int i = 0; i < bytes.Length; i++) Require(bytes[i] == (byte)i, "Large stream bytes changed");
            }
            else if (type != "application/x-goo-empty") Require(Encoding.UTF8.GetString(bytes) == Text(type), "Text bytes changed for " + type);
        }
        bool readOnly = false;
        try { using var stream = resolver.OpenOutputStream(uri); }
        catch (Java.Lang.SecurityException) { readOnly = true; }
        Require(readOnly, "Clipboard URI granted write access");
    }

    private static string Text(string type) => type switch {
        "text/html" => "<b>Android MIME transfer</b>",
        "application/rtf" => @"{\rtf1 Android MIME transfer}",
        _ => "Android MIME transfer"
    };

    private static void Require(bool condition, string message)
    {
        if (!condition) throw new InvalidOperationException(message);
    }
}
