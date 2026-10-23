using System;
using System.Diagnostics;
using System.Reflection;
using System.Runtime.InteropServices;
using System.Text;
using Goo;
using Xunit;

public sealed class MacClipboardTests
{
    [Fact]
    public void NativePasteboardRoundTripsRichFormatsImagesAndFileUrls()
    {
        if (!OperatingSystem.IsMacOS()) return;
        var library = NativeLibrary.Load("/System/Library/Frameworks/AppKit.framework/AppKit");
        var pool = objc_autoreleasePoolPush();
        try
        {
            var plain = Encoding.UTF8.GetBytes("clipboard h\u00e9llo");
            var html = Encoding.UTF8.GetBytes("<b>clipboard h\u00e9llo</b>");
            var rtf = Encoding.ASCII.GetBytes("{\\rtf1 clipboard hello}");
            var png = Convert.FromBase64String("iVBORw0KGgoAAAANSUhEUgAAAAIAAAACCAYAAABytg0kAAAAG0lEQVR4nGN4YKDwX+GCRwODQcKD/x8OGPwHAEr2CTbQb4AmAAAAAElFTkSuQmCC");
            var representations = new[]
            {
                new TransferRepresentation("text/plain;charset=utf-8", plain),
                new TransferRepresentation("text/plain", plain),
                new TransferRepresentation("text/html", html),
                new TransferRepresentation("text/rtf", rtf),
                new TransferRepresentation("image/png", png),
                new TransferRepresentation("application/x-goo-test", new byte[] { 0, 1, 2, 0, 255 }),
                new TransferRepresentation("application/x-goo-empty", ReadOnlyMemory<byte>.Empty),
            };
            var uris = new[] { new Uri(Environment.ProcessPath!), new Uri(typeof(Window).Assembly.Location) };
            var data = new TransferData(representations, uris);
            var written = Invoke<ClipboardWriteResult>("WriteTransfer", data, ClipboardIntent.Copy);
            Assert.True(written.Status == DataTransferStatus.Success, written.Error);
            Assert.Equal(plain, ReadNativeFormat("public.utf8-plain-text"));
            Assert.Equal(html, ReadNativeFormat("public.html"));
            Assert.Equal(rtf, ReadNativeFormat("public.rtf"));
            Assert.Equal(png, ReadNativeFormat("public.png"));
            var formats = Invoke<ClipboardFormats>("Query");
            Assert.True(formats.Status == ClipboardReadStatus.Success, formats.Error);
            Assert.True(formats.HasImage && formats.HasFiles);
            Assert.Contains("text/html", formats.Formats);
            Assert.Contains("text/rtf", formats.Formats);
            Assert.Contains("application/x-goo-test", formats.Formats);
            var types = new[] { "text/plain;charset=utf-8", "text/plain", "text/html", "text/rtf", "image/png", "application/x-goo-test", "application/x-goo-empty", "text/uri-list" };
            var read = Invoke<ClipboardDataResult>("ReadTransfer", (object)types);
            Assert.True(read.Status == ClipboardReadStatus.Success, read.Error);
            Assert.Equal(ClipboardIntent.Copy, read.Intent);
            Assert.Equal(uris, read.Data.Uris);
            Assert.Equal(representations.Length, read.Data.Representations.Count);
            for (var i = 0; i < representations.Length; i++)
                Assert.Equal(representations[i].Bytes.ToArray(), read.Data.Representations[i].Bytes.ToArray());
            var alias = Invoke<ClipboardDataResult>("ReadTransfer", (object)new[] { "application/rtf" });
            Assert.True(alias.Status == ClipboardReadStatus.Success, alias.Error);
            Assert.Equal(rtf, Assert.Single(alias.Data.Representations).Bytes.ToArray());
            var cut = Invoke<ClipboardWriteResult>("WriteTransfer", data, ClipboardIntent.Cut);
            Assert.Equal(DataTransferStatus.Unsupported, cut.Status);
            Assert.Equal(html, ReadNativeFormat("public.html"));
            written = Invoke<ClipboardWriteResult>("WriteTransfer", new TransferData([representations[0]], []), ClipboardIntent.Copy);
            Assert.True(written.Status == DataTransferStatus.Success, written.Error);
            Assert.Equal(html, read.Data.Representations[2].Bytes.ToArray());
            var child = Environment.GetEnvironmentVariable("GOO_CLIPBOARD_CHILD");
            if (!string.IsNullOrEmpty(child)) ReadAfterSourceExit(child);
        }
        finally
        {
            objc_autoreleasePoolPop(pool);
            NativeLibrary.Free(library);
        }
    }

    private static void ReadAfterSourceExit(string executable)
    {
        var start = new ProcessStartInfo(executable)
        {
            UseShellExecute = false,
            RedirectStandardOutput = true,
            RedirectStandardError = true,
        };
        start.Environment["GOO_CLIPBOARD_DATA_SMOKE"] = "1";
        start.Environment["GOO_CLIPBOARD_PRESERVE"] = "1";
        using var child = Process.Start(start)!;
        var output = child.StandardOutput.ReadToEndAsync();
        var error = child.StandardError.ReadToEndAsync();
        try { Assert.True(child.WaitForExit(60_000), "Pasteboard source did not exit."); }
        finally { if (!child.HasExited) child.Kill(entireProcessTree: true); }
        Assert.True(child.ExitCode == 0, output.GetAwaiter().GetResult() + error.GetAwaiter().GetResult());
        var read = Invoke<ClipboardDataResult>("ReadTransfer", (object)new[] { "text/plain;charset=utf-8", "text/html", "image/png", "application/x-goo-empty", "text/uri-list" });
        Assert.True(read.Status == ClipboardReadStatus.Success, read.Error);
        Assert.Equal(ClipboardIntent.Copy, read.Intent);
        Assert.Equal(new Uri(executable), Assert.Single(read.Data.Uris));
        Assert.Equal(4, read.Data.Representations.Count);
        Assert.Equal("clipboard plain", Encoding.UTF8.GetString(read.Data.Representations[0].Bytes.Span));
        Assert.Equal("<b>clipboard plain</b>", Encoding.UTF8.GetString(read.Data.Representations[1].Bytes.Span));
        Assert.True(read.Data.Representations[3].Bytes.IsEmpty);
    }

    private static byte[] ReadNativeFormat(string name)
    {
        var type = CFStringCreateWithCString(0, name, 0x08000100);
        Assert.NotEqual(0, type);
        try
        {
            var board = Send(objc_getClass("NSPasteboard"), sel_registerName("generalPasteboard"));
            var data = SendArg(board, sel_registerName("dataForType:"), type);
            Assert.NotEqual(0, data);
            var bytes = new byte[checked((int)CFDataGetLength(data))];
            if (bytes.Length > 0) Marshal.Copy(CFDataGetBytePtr(data), bytes, 0, bytes.Length);
            return bytes;
        }
        finally { CFRelease(type); }
    }

    [DllImport("/usr/lib/libobjc.A.dylib")]
    private static extern nint objc_getClass(string name);
    [DllImport("/usr/lib/libobjc.A.dylib")]
    private static extern nint sel_registerName(string name);
    [DllImport("/usr/lib/libobjc.A.dylib")]
    private static extern nint objc_autoreleasePoolPush();
    [DllImport("/usr/lib/libobjc.A.dylib")]
    private static extern void objc_autoreleasePoolPop(nint pool);
    [DllImport("/usr/lib/libobjc.A.dylib", EntryPoint = "objc_msgSend")]
    private static extern nint Send(nint receiver, nint selector);
    [DllImport("/usr/lib/libobjc.A.dylib", EntryPoint = "objc_msgSend")]
    private static extern nint SendArg(nint receiver, nint selector, nint argument);
    [DllImport("/System/Library/Frameworks/CoreFoundation.framework/CoreFoundation")]
    private static extern nint CFStringCreateWithCString(nint allocator, [MarshalAs(UnmanagedType.LPUTF8Str)] string value, uint encoding);
    [DllImport("/System/Library/Frameworks/CoreFoundation.framework/CoreFoundation")]
    private static extern void CFRelease(nint value);
    [DllImport("/System/Library/Frameworks/CoreFoundation.framework/CoreFoundation")]
    private static extern nint CFDataGetLength(nint data);
    [DllImport("/System/Library/Frameworks/CoreFoundation.framework/CoreFoundation")]
    private static extern nint CFDataGetBytePtr(nint data);

    private static T Invoke<T>(string name, params object[] arguments) => (T)typeof(Window).Assembly
        .GetType("Goo.ClipboardTransfer", true)!
        .GetMethod(name, BindingFlags.Static | BindingFlags.NonPublic)!
        .Invoke(null, arguments)!;
}
