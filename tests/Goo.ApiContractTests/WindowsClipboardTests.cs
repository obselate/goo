using System;
using System.Diagnostics;
using System.Reflection;
using System.Runtime.ExceptionServices;
using System.Runtime.InteropServices;
using System.Text;
using System.Threading;
using Goo;
using Xunit;

public sealed class WindowsClipboardTests
{
    [Fact]
    public void NativeClipboardRoundTripsRichFormatsImagesFilesAndBinaryData()
    {
        if (!OperatingSystem.IsWindows()) return;
        Exception? failure = null;
        var thread = new Thread(() =>
        {
            try { RoundTrip(); }
            catch (Exception error) { failure = error; }
        }) { IsBackground = true };
        thread.SetApartmentState(ApartmentState.STA);
        thread.Start();
        Assert.True(thread.Join(TimeSpan.FromMinutes(2)), "Windows clipboard check did not complete.");
        if (failure is not null) ExceptionDispatchInfo.Capture(failure).Throw();
    }

    private static void RoundTrip()
    {
        const string plain = "clipboard h\u00e9llo";
        const string html = "<b>clipboard h\u00e9llo</b>";
        var png = Convert.FromBase64String("iVBORw0KGgoAAAANSUhEUgAAAAIAAAACCAYAAABytg0kAAAAG0lEQVR4nGN4YKDwX+GCRwODQcKD/x8OGPwHAEr2CTbQb4AmAAAAAElFTkSuQmCC");
        var representations = new[]
        {
            new TransferRepresentation("text/plain;charset=utf-8", Encoding.UTF8.GetBytes(plain)),
            new TransferRepresentation("text/html", Encoding.UTF8.GetBytes(html)),
            new TransferRepresentation("text/rtf", Encoding.ASCII.GetBytes("{\\rtf1 clipboard hello}")),
            new TransferRepresentation("image/png", png),
            new TransferRepresentation("application/x-goo-test", new byte[] { 0, 1, 2, 0, 255 }),
            new TransferRepresentation("application/x-goo-empty", ReadOnlyMemory<byte>.Empty),
        };
        var uri = new Uri(Environment.ProcessPath!);
        var data = new TransferData(representations, [uri]);
        var written = Invoke<ClipboardWriteResult>("WriteTransfer", data, ClipboardIntent.Cut);
        Assert.True(written.Status == DataTransferStatus.Success, written.Error);
        var nativeHtml = ReadNativeFormat("HTML Format");
        var header = Encoding.ASCII.GetString(nativeHtml);
        var start = int.Parse(header.Substring(header.IndexOf("StartFragment:", StringComparison.Ordinal) + 14, 10));
        var end = int.Parse(header.Substring(header.IndexOf("EndFragment:", StringComparison.Ordinal) + 12, 10));
        Assert.Equal(html, Encoding.UTF8.GetString(nativeHtml, start, end - start));
        Assert.Equal("{\\rtf1 clipboard hello}", Encoding.ASCII.GetString(ReadNativeFormat("Rich Text Format")).TrimEnd('\0'));
        Assert.True(ReadNativeFormat("PNG").AsSpan(0, png.Length).SequenceEqual(png));
        var formats = Invoke<ClipboardFormats>("Query");
        Assert.Equal(ClipboardReadStatus.Success, formats.Status);
        Assert.True(formats.HasImage && formats.HasFiles);
        Assert.Contains("text/html", formats.Formats);
        Assert.Contains("text/rtf", formats.Formats);
        Assert.Contains("application/x-goo-test", formats.Formats);
        var types = new[] { "text/plain;charset=utf-8", "text/html", "text/rtf", "image/png", "application/x-goo-test", "application/x-goo-empty", "text/uri-list" };
        var read = Invoke<ClipboardDataResult>("ReadTransfer", (object)types);
        Assert.True(read.Status == ClipboardReadStatus.Success, read.Error);
        Assert.Equal(ClipboardIntent.Cut, read.Intent);
        Assert.Equal(uri, Assert.Single(read.Data.Uris));
        Assert.Equal(representations.Length, read.Data.Representations.Count);
        for (var i = 0; i < representations.Length; i++)
            Assert.Equal(representations[i].Bytes.ToArray(), read.Data.Representations[i].Bytes.ToArray());
        var rtfAlias = Invoke<ClipboardDataResult>("ReadTransfer", (object)new[] { "application/rtf" });
        Assert.True(rtfAlias.Status == ClipboardReadStatus.Success, rtfAlias.Error);
        Assert.Equal(representations[2].Bytes.ToArray(), Assert.Single(rtfAlias.Data.Representations).Bytes.ToArray());
        var bitmap = Invoke<ClipboardDataResult>("ReadTransfer", (object)new[] { "image/bmp" });
        Assert.True(bitmap.Status == ClipboardReadStatus.Success, bitmap.Error);
        var bitmapBytes = Assert.Single(bitmap.Data.Representations).Bytes.Span;
        Assert.True(bitmapBytes.StartsWith("BM"u8));
        Assert.Equal(2, BitConverter.ToInt32(bitmapBytes.Slice(18, 4)));
        Assert.Equal(-2, BitConverter.ToInt32(bitmapBytes.Slice(22, 4)));
        foreach (var unsupported in new[]
        {
            new TransferData([
                new TransferRepresentation("application/x-goo-CASE", ReadOnlyMemory<byte>.Empty),
                new TransferRepresentation("application/x-goo-case", ReadOnlyMemory<byte>.Empty)], []),
            new TransferData([new TransferRepresentation("application/" + new string('a', 244), ReadOnlyMemory<byte>.Empty)], []),
            new TransferData([], [new Uri("https://example.test/document")]),
            new TransferData([new TransferRepresentation("text/plain", Encoding.UTF8.GetBytes("one\0two"))], []),
        })
        {
            var rejected = Invoke<ClipboardWriteResult>("WriteTransfer", unsupported, ClipboardIntent.Copy);
            Assert.True(rejected.Status == DataTransferStatus.Unsupported, rejected.Error);
        }
        var unchanged = Invoke<ClipboardDataResult>("ReadTransfer", (object)new[] { "text/html" });
        Assert.Equal(html, Encoding.UTF8.GetString(Assert.Single(unchanged.Data.Representations).Bytes.Span));
        var uriOnly = new TransferData([new TransferRepresentation("text/uri-list", Encoding.UTF8.GetBytes(uri.AbsoluteUri + "\r\n"))], []);
        written = Invoke<ClipboardWriteResult>("WriteTransfer", uriOnly, ClipboardIntent.Copy);
        Assert.True(written.Status == DataTransferStatus.Success, written.Error);
        var uriRead = Invoke<ClipboardDataResult>("ReadTransfer", (object)new[] { "text/uri-list" });
        Assert.True(uriRead.Status == ClipboardReadStatus.Success, uriRead.Error);
        Assert.Equal(uri, Assert.Single(uriRead.Data.Uris));
        written = Invoke<ClipboardWriteResult>("WriteTransfer", new TransferData([representations[0]], []), ClipboardIntent.Copy);
        Assert.True(written.Status == DataTransferStatus.Success, written.Error);
        Assert.Equal(html, Encoding.UTF8.GetString(read.Data.Representations[1].Bytes.Span));
        var child = Environment.GetEnvironmentVariable("GOO_CLIPBOARD_CHILD");
        if (!string.IsNullOrEmpty(child)) ReadAfterSourceExit(child);
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
        try { Assert.True(child.WaitForExit(60_000), "Clipboard source did not exit."); }
        finally { if (!child.HasExited) child.Kill(entireProcessTree: true); }
        Assert.True(child.ExitCode == 0, output.GetAwaiter().GetResult() + error.GetAwaiter().GetResult());
        var read = Invoke<ClipboardDataResult>("ReadTransfer", (object)new[] { "text/plain;charset=utf-8", "text/html", "image/png", "application/x-goo-empty", "text/uri-list" });
        Assert.True(read.Status == ClipboardReadStatus.Success, read.Error);
        Assert.Equal(ClipboardIntent.Cut, read.Intent);
        Assert.Equal(new Uri(executable), Assert.Single(read.Data.Uris));
        Assert.Equal(4, read.Data.Representations.Count);
        Assert.Equal("clipboard plain", Encoding.UTF8.GetString(read.Data.Representations[0].Bytes.Span));
        Assert.Equal("<b>clipboard plain</b>", Encoding.UTF8.GetString(read.Data.Representations[1].Bytes.Span));
        Assert.True(read.Data.Representations[3].Bytes.IsEmpty);
    }

    private static byte[] ReadNativeFormat(string name)
    {
        Assert.True(OpenClipboard(0));
        try
        {
            var memory = GetClipboardData(RegisterClipboardFormatW(name));
            Assert.NotEqual(0, memory);
            var pointer = GlobalLock(memory);
            Assert.NotEqual(0, pointer);
            try
            {
                var bytes = new byte[checked((int)GlobalSize(memory))];
                Marshal.Copy(pointer, bytes, 0, bytes.Length);
                return bytes;
            }
            finally { GlobalUnlock(memory); }
        }
        finally { CloseClipboard(); }
    }

    [DllImport("user32.dll")]
    [return: MarshalAs(UnmanagedType.Bool)]
    private static extern bool OpenClipboard(nint owner);
    [DllImport("user32.dll")]
    [return: MarshalAs(UnmanagedType.Bool)]
    private static extern bool CloseClipboard();
    [DllImport("user32.dll")]
    private static extern nint GetClipboardData(uint format);
    [DllImport("user32.dll", CharSet = CharSet.Unicode)]
    private static extern uint RegisterClipboardFormatW(string name);
    [DllImport("kernel32.dll")]
    private static extern nuint GlobalSize(nint memory);
    [DllImport("kernel32.dll")]
    private static extern nint GlobalLock(nint memory);
    [DllImport("kernel32.dll")]
    [return: MarshalAs(UnmanagedType.Bool)]
    private static extern bool GlobalUnlock(nint memory);

    private static T Invoke<T>(string name, params object[] arguments) => (T)typeof(Window).Assembly
        .GetType("Goo.ClipboardTransfer", true)!
        .GetMethod(name, BindingFlags.Static | BindingFlags.NonPublic)!
        .Invoke(null, arguments)!;
}
