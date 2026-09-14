using System;
using System.IO;
using System.Linq;
using Goo;
using Xunit;

public sealed class ClipboardTests
{
    private static readonly string FirstPath = Path.Combine(Path.GetTempPath(), "one two");
    private static readonly string SecondPath = Path.Combine(Path.GetTempPath(), "café");
    private static readonly string FirstUri = new Uri(FirstPath).AbsoluteUri;
    private static readonly string SecondUri = new Uri(SecondPath).AbsoluteUri;

    [Fact]
    public void FileListsDecodeUrisPreserveOrderAndOwnAnImmutableList()
    {
        var localhost = new UriBuilder(SecondUri) { Host = "localhost" }.Uri.AbsoluteUri;
        var result = ClipboardTransfer.ParseFiles($"# comment\r\n{FirstUri}\r\n{localhost}\n", false);
        Assert.Equal(ClipboardReadStatus.Success, result.Status);
        Assert.Equal(new[] { FirstPath, SecondPath }, result.Paths);
        Assert.Throws<NotSupportedException>(() => ((System.Collections.Generic.IList<string>)result.Paths)[0] = "changed");
        Assert.Equal(result.Paths, ClipboardTransfer.ParseFiles($"cut\n{FirstUri}\n{SecondUri}\n", true).Paths);
        Assert.Equal(ClipboardReadStatus.Empty, ClipboardTransfer.ParseFiles("# none\n", false).Status);
    }

    [Theory]
    [InlineData("https://example.com/file")]
    [InlineData("file://remote-server/tmp/file")]
    [InlineData("/tmp/file")]
    [InlineData("file:///tmp/nul%00file")]
    public void FileListsRejectNonlocalAndInvalidPaths(string value) =>
        Assert.Throws<InvalidDataException>(() => ClipboardTransfer.ParseFiles(value, false));

    [Fact]
    public void FileListsEnforceCountAndPathBudgets()
    {
        Assert.Throws<InvalidDataException>(() => ClipboardTransfer.ParseFiles("move\nfile:///tmp/a", true));
        Assert.Throws<ClipboardLimitException>(() => ClipboardTransfer.ParseFiles(string.Concat(Enumerable.Repeat(FirstUri + "\n", 4097)), false));
        var paths = new System.Collections.Generic.List<string>();
        var units = 0;
        Assert.Throws<ClipboardLimitException>(() => ClipboardTransfer.AddPath(paths, FirstPath + new string('x', 32768), ref units));
    }

    [Fact]
    public void NativeBitmapConversionPreservesPixelsAndRejectsUnboundedOrTruncatedImages()
    {
        var bmp = Bitmap();
        var png = ClipboardBitmap.ToPng(bmp);
        Assert.Equal(new byte[] { 137, 80, 78, 71, 13, 10, 26, 10 }, png.Take(8));
        var decoded = StbImageSharp.ImageResult.FromMemory(png, StbImageSharp.ColorComponents.RedGreenBlueAlpha);
        Assert.Equal(2, decoded.Width);
        Assert.Equal(1, decoded.Height);
        Assert.Equal(new byte[] { 255, 0, 0, 255, 0, 255, 0, 255 }, decoded.Data);
        Assert.Throws<InvalidDataException>(() => ClipboardBitmap.ToPng(bmp[..^1]));
        BitConverter.GetBytes(8193).CopyTo(bmp, 18);
        Assert.Throws<ClipboardLimitException>(() => ClipboardBitmap.ToPng(bmp));
        Assert.Throws<ClipboardLimitException>(() => ClipboardBitmap.ValidateDimensions(8192, 8192));
    }

    [Fact]
    public void ClipboardReadsRequireAnOpenWindow()
    {
        var window = new Window();
        Assert.Throws<InvalidOperationException>(() => window.GetClipboardFormats());
        Assert.Throws<InvalidOperationException>(() => window.ReadClipboardFiles());
        Assert.Throws<InvalidOperationException>(() => window.ReadClipboardImage());
    }

    private static byte[] Bitmap()
    {
        var bytes = new byte[62];
        bytes[0] = (byte)'B'; bytes[1] = (byte)'M';
        BitConverter.GetBytes(bytes.Length).CopyTo(bytes, 2);
        BitConverter.GetBytes(54).CopyTo(bytes, 10);
        BitConverter.GetBytes(40).CopyTo(bytes, 14);
        BitConverter.GetBytes(2).CopyTo(bytes, 18);
        BitConverter.GetBytes(1).CopyTo(bytes, 22);
        bytes[26] = 1; bytes[28] = 24;
        bytes[56] = 255; bytes[58] = 255;
        return bytes;
    }
}
