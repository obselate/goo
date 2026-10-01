using System;
using System.IO;
using System.IO.Compression;
using System.Linq;
using System.Threading;
using System.Threading.Tasks;
using Goo;
using Xunit;

public sealed class ImageSourceCacheTests : IDisposable
{
    private readonly string directory = Path.Combine(Path.GetTempPath(), "goo-png-" + Guid.NewGuid());

    public ImageSourceCacheTests() => Directory.CreateDirectory(directory);
    public void Dispose() => Directory.Delete(directory, true);

    [Theory]
    [InlineData("local-rgb.jpg")]
    [InlineData("local-progressive.jpg")]
    [InlineData("local-cmyk.jpg")]
    [InlineData("local-transparent.gif")]
    [InlineData("local-animated.gif")]
    public async Task JpegAndFirstGifFrameHaveOwnedBoundedPixels(string name)
    {
        using var cache = new ImageSourceCache();
        var path = Path.Combine(AppContext.BaseDirectory, "Assets", name);
        using var source = await cache.LoadAsync(path);
        using var second = await cache.LoadAsync(path);
        Assert.Equal(3, source.Width);
        Assert.Equal(2, source.Height);
        using var lease = second.Acquire();
        var decoded = lease.Result()!;
        source.Dispose();
        cache.Dispose();
        Assert.True(decoded.IsValid);
        var pixels = Assert.IsType<byte[]>(decoded.Pixels());
        Assert.Equal(24, pixels.Length);
        if (name.EndsWith(".gif", StringComparison.Ordinal))
        {
            Assert.Equal(new byte[] { 0, 0, 0, 0 }, pixels.Take(4));
            Assert.Equal(new byte[] { 30, 190, 90, 255 }, pixels.Skip(4).Take(4));
        }
        else
        {
            Assert.InRange(pixels[0], 215, 225);
            Assert.InRange(pixels[1], 55, 65);
            Assert.InRange(pixels[2], 25, 35);
            Assert.Equal(255, pixels[3]);
        }
        second.Dispose();
        Assert.True(decoded.IsValid);
        lease.Dispose();
        Assert.False(decoded.IsValid);
    }

    [Theory]
    [InlineData("local-rgb.jpg")]
    [InlineData("local-transparent.gif")]
    public async Task JpegAndGifRejectTruncationAndOversizedHeadersBeforeDecoding(string name)
    {
        var bytes = File.ReadAllBytes(Path.Combine(AppContext.BaseDirectory, "Assets", name));
        using var cache = new ImageSourceCache();
        await Assert.ThrowsAsync<InvalidDataException>(() => cache.LoadAsync(Write("truncated-" + name, bytes[..^2])));
        if (name.EndsWith(".gif", StringComparison.Ordinal))
        {
            bytes[6] = 0xff;
            bytes[7] = 0x7f;
        }
        else
        {
            var frame = Enumerable.Range(0, bytes.Length - 1).First(i => bytes[i] == 0xff && bytes[i + 1] == 0xc0);
            bytes[frame + 7] = 0x7f;
            bytes[frame + 8] = 0xff;
        }
        await Assert.ThrowsAsync<InvalidDataException>(() => cache.LoadAsync(Write("oversized-" + name, bytes)));
    }

    [Fact]
    public async Task GifRejectsRasterExpansionBeyondTheFrame()
    {
        var bytes = File.ReadAllBytes(Path.Combine(AppContext.BaseDirectory, "Assets", "local-transparent.gif"));
        var image = Array.IndexOf(bytes, (byte)0x2c, 13);
        Assert.True(image > 0);
        bytes[image + 5] = 1;
        bytes[image + 7] = 1;
        using var cache = new ImageSourceCache();
        await Assert.ThrowsAsync<InvalidDataException>(() => cache.LoadAsync(Write("overflow.gif", bytes)));
    }

    [Fact]
    public void IconRejectsWidePngBeforeSdlSquaresItsBuffer()
    {
        var png = Png(1025, 1, 8, 6, new byte[1 + 1025 * 4]);
        Assert.Throws<InvalidDataException>(() => RasterImageDecoder.DecodeIconPng(png));
    }

    [Fact]
    public async Task ConcurrentLoadsSharePixelsWithIndependentOwnersAndLeases()
    {
        var path = Write("rgba.png", Png(2, 1, 8, 6, [0, 240, 120, 60, 128, 10, 20, 30, 255]));
        using var cache = new ImageSourceCache();
        var loaded = await Task.WhenAll(Enumerable.Range(0, 12).Select(_ => cache.LoadAsync(path)));
        var first = loaded[0].Acquire();
        var decoded = Assert.IsType<DecodedImage>(first.Result());
        Assert.Equal(new byte[] { 120, 60, 30, 128, 10, 20, 30, 255 }, decoded.Pixels());
        foreach (var source in loaded)
        {
            using var lease = source.Acquire();
            Assert.Same(decoded, lease.Result());
            source.Dispose();
        }
        cache.Dispose();
        Assert.True(decoded.IsValid);
        first.Dispose();
        Assert.False(decoded.IsValid);
    }

    [Theory]
    [InlineData(2, 8, new byte[] { 0, 20, 40, 80 }, new byte[] { 20, 40, 80, 255 })]
    [InlineData(0, 8, new byte[] { 0, 42 }, new byte[] { 42, 42, 42, 255 })]
    [InlineData(4, 8, new byte[] { 0, 84, 128 }, new byte[] { 42, 42, 42, 128 })]
    [InlineData(0, 1, new byte[] { 0, 128 }, new byte[] { 255, 255, 255, 255 })]
    [InlineData(6, 16, new byte[] { 0, 255, 255, 0, 0, 0, 0, 255, 255 }, new byte[] { 255, 0, 0, 255 })]
    public async Task DecodesCommonPngColorTypes(int color, int depth, byte[] raw, byte[] expected)
    {
        using var cache = new ImageSourceCache();
        using var source = await cache.LoadAsync(Write("color.png", Png(1, 1, depth, color, raw)));
        using var lease = source.Acquire();
        Assert.Equal(expected, lease.Result()!.Pixels());
    }

    [Fact]
    public async Task SupportsAdam7AndIndexedTransparency()
    {
        using var cache = new ImageSourceCache();
        using var interlaced = await cache.LoadAsync(Write("adam7.png", Png(1, 1, 8, 6, [0, 90, 60, 30, 255], interlace: 1)));
        using var first = interlaced.Acquire();
        Assert.Equal(new byte[] { 90, 60, 30, 255 }, first.Result()!.Pixels());
        using var indexed = await cache.LoadAsync(Write("indexed.png", Png(1, 1, 8, 3, [0, 0], palette: [200, 100, 50], alpha: [128])));
        using var second = indexed.Acquire();
        Assert.Equal(new byte[] { 100, 50, 25, 128 }, second.Result()!.Pixels());
    }

    [Fact]
    public async Task DecodesAllAdam7Passes()
    {
        byte[] expected = Enumerable.Range(0, 8 * 8).SelectMany(i => new byte[] { (byte)i, 32, 64, 255 }).ToArray();
        using var raw = new MemoryStream();
        foreach (var (x, y, dx, dy) in new[] { (0, 0, 8, 8), (4, 0, 8, 8), (0, 4, 4, 8),
            (2, 0, 4, 4), (0, 2, 2, 4), (1, 0, 2, 2), (0, 1, 1, 2) })
        {
            for (var row = y; row < 8; row += dy)
            {
                raw.WriteByte(0);
                for (var column = x; column < 8; column += dx) raw.Write(expected, (row * 8 + column) * 4, 4);
            }
        }
        using var cache = new ImageSourceCache();
        using var source = await cache.LoadAsync(Write("passes.png", Png(8, 8, 8, 6, raw.ToArray(), interlace: 1)));
        using var lease = source.Acquire();
        Assert.Equal(expected, lease.Result()!.Pixels());
    }

    [Fact]
    public async Task MissingAndInvalidFilesAreObservableAndRetryable()
    {
        using var cache = new ImageSourceCache();
        var path = Path.Combine(directory, "retry.png");
        await Assert.ThrowsAsync<FileNotFoundException>(() => cache.LoadAsync(path));
        File.WriteAllBytes(path, [1, 2]);
        await Assert.ThrowsAsync<InvalidDataException>(() => cache.LoadAsync(path));
        File.WriteAllBytes(path, Png(1, 1, 8, 6, [0, 1, 2, 3, 255]));
        using var valid = await cache.LoadAsync(path);
        Assert.Equal(1, valid.Width);
    }

    [Fact]
    public async Task RejectsUnsupportedInputCorruptionAndDecompressionOverflow()
    {
        using var cache = new ImageSourceCache();
        await Assert.ThrowsAsync<NotSupportedException>(() => cache.LoadAsync(Write("other.jpg", new byte[12])));
        var corrupt = Png(1, 1, 8, 6, [0, 1, 2, 3, 255]);
        corrupt[29] ^= 1;
        await Assert.ThrowsAsync<InvalidDataException>(() => cache.LoadAsync(Write("crc.png", corrupt)));
        await Assert.ThrowsAsync<InvalidDataException>(() => cache.LoadAsync(Write("bomb.png", Png(1, 1, 8, 6, new byte[1000000]))));
        await Assert.ThrowsAsync<InvalidDataException>(() => cache.LoadAsync(Write("truncated.png", Png(1, 1, 8, 6, [0, 1]))));
        await Assert.ThrowsAsync<InvalidDataException>(() => cache.LoadAsync(Write("huge.png", Png(8193, 1, 8, 6, []))));
        await Assert.ThrowsAsync<InvalidDataException>(() => cache.LoadAsync(Write("pixels.png", Png(8192, 8192, 8, 6, []))));
        var large = Path.Combine(directory, "encoded.png");
        using (var file = File.Create(large)) file.SetLength(16777217);
        await Assert.ThrowsAsync<InvalidDataException>(() => cache.LoadAsync(large));
    }

    [Fact]
    public async Task CapacityFailureKeepsPreviouslyLoadedSourcesValid()
    {
        var first = Write("a.png", Png(1, 1, 8, 6, [0, 1, 2, 3, 255]));
        var second = Write("b.png", Png(1, 1, 8, 6, [0, 4, 5, 6, 255]));
        using var bytes = new ImageSourceCache(4, 2);
        using var source = await bytes.LoadAsync(first);
        await Assert.ThrowsAsync<InvalidOperationException>(() => bytes.LoadAsync(second));
        using var hit = await bytes.LoadAsync(first);
        Assert.False(hit.IsDisposed);
        using var entries = new ImageSourceCache(8, 1);
        using var initial = await entries.LoadAsync(first);
        await Assert.ThrowsAsync<InvalidOperationException>(() => entries.LoadAsync(second));
    }

    [Fact]
    public async Task CancellationAndCacheDisposalDoNotInvalidateReturnedSources()
    {
        var path = Write("cancel.png", Png(1, 1, 8, 6, [0, 1, 2, 3, 255]));
        using var cache = new ImageSourceCache();
        using var cancellation = new CancellationTokenSource();
        cancellation.Cancel();
        await Assert.ThrowsAnyAsync<OperationCanceledException>(() => cache.LoadAsync(path, cancellation.Token));
        using var source = await cache.LoadAsync(path);
        cache.Dispose();
        using var lease = source.Acquire();
        Assert.False(lease.IsFailed);
        await Assert.ThrowsAnyAsync<OperationCanceledException>(() => cache.LoadAsync(path));
    }

    [Fact]
    public void LegacyPathFailsWithMigrationInstruction()
    {
        var error = Assert.Throws<NotSupportedException>(() => ImageLayouts.ApplyPath(new Node(), "asset.png", ImageFit.Contain));
        Assert.Contains("ImageSourceCache.LoadAsync", error.Message);
    }

    [Fact]
    public void BackgroundPathChangesPreserveSourcePrecedenceAndOwnership()
    {
        var node = new Node();
        using var source = new ImageSource(1, 1, new byte[] { 20, 40, 80, 255 });
        BackgroundImageLayouts.SetPath(node, "asset.png", null);
        Assert.Same(DecodedImage.Failed, BackgroundImageLayouts.Image(node));
        BackgroundImageLayouts.SetSource(node, source, null, null);
        var decoded = BackgroundImageLayouts.Image(node);
        Assert.True(decoded!.IsValid);
        BackgroundImageLayouts.SetPath(node, "changed.png", null);
        Assert.Same(decoded, BackgroundImageLayouts.Image(node));
        BackgroundImageLayouts.SetSource(node, null, null, null);
        Assert.Same(DecodedImage.Failed, BackgroundImageLayouts.Image(node));
        Assert.True(decoded.IsValid);
        BackgroundImageLayouts.SetSource(node, source, null, null);
        BackgroundImageLayouts.SetPath(node, "", null);
        Assert.Same(decoded, BackgroundImageLayouts.Image(node));
        BackgroundImageLayouts.SetSource(node, null, null, null);
        Assert.Null(BackgroundImageLayouts.Image(node));
        Assert.False(node.HasBackgroundImageState);
    }

    [Fact]
    public void ClipboardAndStreamImagesUseMountedLeaseOwnershipAndBoundedDecoding()
    {
        var bytes = Png(1, 1, 8, 6, [0, 200, 100, 50, 128]);
        var clipboard = new ClipboardImage(ClipboardReadStatus.Success, "image/png", bytes);
        var node = new Node();
        using var source = ImageSource.Decode(clipboard.Bytes);
        ImageLayouts.ApplySource(node, source, ImageFit.Contain, null, null);
        source.Dispose();
        Assert.Equal(new byte[] { 100, 50, 25, 128 }, node.DecodedImage!.Pixels());
        var mounted = node.DecodedImage;
        ImageLayouts.Dispose(node);
        Assert.False(mounted.IsValid);

        using var stream = new MemoryStream(new byte[] { 42 }.Concat(bytes).ToArray());
        stream.Position = 1;
        using var streamed = ImageSource.Decode(stream);
        using var lease = streamed.Acquire();
        Assert.Equal(new byte[] { 100, 50, 25, 128 }, lease.Result()!.Pixels());
        Assert.True(stream.CanRead);
        using var malformed = new MemoryStream(Png(1, 1, 8, 6, new byte[1000000]));
        Assert.Throws<InvalidDataException>(() => ImageSource.Decode(malformed));
        Assert.True(malformed.CanRead);
    }

    [Fact]
    public void ThumbnailBoundsRetainedPixelsAndPreservesPremultipliedAlpha()
    {
        using var raw = new MemoryStream();
        for (var y = 0; y < 160; y++)
        {
            raw.WriteByte(0);
            for (var x = 0; x < 320; x++) raw.Write([200, 100, 50, 128]);
        }
        var path = Write("large-rgba.png", Png(320, 160, 8, 6, raw.ToArray()));
        using var source = ImageSource.LoadThumbnail(path, 160, 160);
        Assert.Equal(160, source.Width);
        Assert.Equal(80, source.Height);
        using var lease = source.Acquire();
        var pixels = lease.Result()!.Pixels()!;
        Assert.Equal(160 * 80 * 4, pixels.Length);
        Assert.Equal(new byte[] { 100, 50, 25, 128 }, pixels[..4]);
        Assert.Equal(new byte[] { 100, 50, 25, 128 }, pixels[^4..]);

        using var full = ImageSource.LoadThumbnail(path, 640, 640);
        Assert.Equal(320, full.Width);
        Assert.Equal(160, full.Height);
        using var cancelled = new CancellationTokenSource();
        cancelled.Cancel();
        Assert.ThrowsAny<OperationCanceledException>(() => ImageSource.LoadThumbnail(path, 160, 160, cancelled.Token));
    }

    [Theory]
    [InlineData(17, 11, 7, 5, 7, 5, "CgsKTj0XKKE4ECNbSSBKfhoobJgsIUxXf0A2qQwmFHYnKyRkYUNLkkYvQWIfTXKFOkNQeE9FEWgTTiZ4MU42elFUSXRXaGyKG1lWckJuD31gXR98EVwudT07T4RibmOJKRdHZCYeFpI9KBd1dh05jSAgWKUlDjdSaiZ5ijciZnwfJBNlX0I4p0YjKFQ=")]
    [InlineData(11, 17, 5, 7, 5, 7, "CQ4KUjEWIpNAFCl3XB47axkraqAJJBJlJzEnbF5NTpxTLz1iF0ZedRNkL44pSzFrSVlHb3FnYoMUSFVoE0I1djYiTYFOP1Z3RCJuexcRIIYYHUZ9LiNKZWIzeY5QLVF5FjYWciBRY403SWZ8T0swalNoFJYSRxlgG1xXalCRXKBDNQ9bQzUgdyQ+PZw=")]
    [InlineData(31, 3, 7, 4, 7, 1, "HBYXdlYfOHgcJVh3Yjk2iiRALHpaTFF+KFRafw==")]
    [InlineData(3, 31, 4, 7, 1, 7, "DxoRZxROK3MgKE+DJVZsgzA4LJE1UiaCODQ9eg==")]
    [InlineData(1, 17, 7, 5, 1, 5, "AhYJWAZBG3MNWTqSDiY7ZhZiX4I=")]
    [InlineData(17, 1, 5, 7, 5, 1, "DQIHNUMLKIkkDzJYGRhSclgkSHs=")]
    public void ThumbnailFractionalCoverageMatchesPublishedPixels(int width, int height,
        int maxWidth, int maxHeight, int expectedWidth, int expectedHeight, string published)
    {
        using var raw = new MemoryStream();
        for (var y = 0; y < height; y++)
        {
            raw.WriteByte(0);
            for (var x = 0; x < width; x++)
                raw.Write([(byte)(x * 29 + y * 3), (byte)(x * 5 + y * 31),
                    (byte)(x * 17 + y * 13), (byte)(x * 43 + y * 71)]);
        }
        var path = Write("fractional.png", Png(width, height, 8, 6, raw.ToArray()));
        using var source = ImageSource.LoadThumbnail(path, maxWidth, maxHeight);
        Assert.Equal(expectedWidth, source.Width);
        Assert.Equal(expectedHeight, source.Height);
        using var lease = source.Acquire();
        var pixels = lease.Result()!.Pixels()!;
        var expected = Convert.FromBase64String(published);
        Assert.Equal(expected.Length, pixels.Length);
        for (var i = 0; i < pixels.Length; i++) Assert.InRange(Math.Abs(pixels[i] - expected[i]), 0, 1);
        for (var i = 0; i < pixels.Length; i += 4)
            for (var channel = 0; channel < 3; channel++) Assert.True(pixels[i + channel] <= pixels[i + 3]);
    }

    [Fact]
    public void ThumbnailMaximumRasterCoverageDoesNotOverflow()
    {
        const int width = 8192, height = 2048;
        var stride = width * 4 + 1;
        var raw = new byte[stride * height];
        Array.Fill(raw, (byte)255);
        for (var y = 0; y < height; y++) raw[y * stride] = 0;
        var path = Write("maximum.png", Png(width, height, 8, 6, raw));
        using var source = ImageSource.LoadThumbnail(path, 1, 1);
        Assert.Equal(1, source.Width);
        Assert.Equal(1, source.Height);
        using var lease = source.Acquire();
        Assert.Equal(new byte[] { 255, 255, 255, 255 }, lease.Result()!.Pixels());
    }

    [Fact]
    public void ThumbnailFilteringDoesNotBleedHiddenRgbIntoVisiblePixels()
    {
        var path = Write("alpha-edge.png", Png(2, 1, 8, 6, [0, 255, 0, 0, 255, 0, 0, 255, 0]));
        using var source = ImageSource.LoadThumbnail(path, 1, 1);
        using var lease = source.Acquire();
        Assert.Equal(new byte[] { 128, 0, 0, 128 }, lease.Result()!.Pixels());
    }

    [Fact]
    public void ThumbnailCancellationStopsReadingBeforeDecode()
    {
        using var cancelled = new CancellationTokenSource();
        using var stream = new CancelAfterReadStream(Png(2, 1, 8, 6, [0, 255, 0, 0, 255, 0, 0, 255, 0]), cancelled);
        Assert.ThrowsAny<OperationCanceledException>(() =>
            RasterImageDecoder.LoadThumbnail(stream, 1, 1, cancelled.Token));
    }

    [Theory]
    [InlineData("local-rgb.jpg")]
    [InlineData("local-transparent.gif")]
    public void ThumbnailLoadsExistingJpegAndGifFormats(string name)
    {
        var path = Path.Combine(AppContext.BaseDirectory, "Assets", name);
        using var source = ImageSource.LoadThumbnail(path, 2, 1);
        Assert.Equal(2, source.Width);
        Assert.Equal(1, source.Height);
        using var lease = source.Acquire();
        Assert.Equal(8, lease.Result()!.Pixels()!.Length);
    }

    private string Write(string name, byte[] bytes)
    {
        var path = Path.Combine(directory, name);
        File.WriteAllBytes(path, bytes);
        return path;
    }

    private sealed class CancelAfterReadStream(byte[] bytes, CancellationTokenSource cancellation) : MemoryStream(bytes)
    {
        public override int Read(byte[] buffer, int offset, int count)
        {
            var read = base.Read(buffer, offset, count);
            cancellation.Cancel();
            return read;
        }
    }

    private static byte[] Png(int width, int height, int depth, int color, byte[] raw,
        byte interlace = 0, byte[]? palette = null, byte[]? alpha = null)
    {
        using var png = new MemoryStream();
        png.Write(new byte[] { 137, 80, 78, 71, 13, 10, 26, 10 });
        var header = new byte[13];
        System.Buffers.Binary.BinaryPrimitives.WriteInt32BigEndian(header, width);
        System.Buffers.Binary.BinaryPrimitives.WriteInt32BigEndian(header.AsSpan(4), height);
        header[8] = (byte)depth;
        header[9] = (byte)color;
        header[12] = interlace;
        Chunk(png, "IHDR", header);
        if (palette != null) Chunk(png, "PLTE", palette);
        if (alpha != null) Chunk(png, "tRNS", alpha);
        using var compressed = new MemoryStream();
        using (var zlib = new ZLibStream(compressed, CompressionLevel.Fastest, true)) zlib.Write(raw);
        Chunk(png, "IDAT", compressed.ToArray());
        Chunk(png, "IEND", []);
        return png.ToArray();
    }

    private static void Chunk(Stream output, string kind, byte[] data)
    {
        Span<byte> number = stackalloc byte[4];
        System.Buffers.Binary.BinaryPrimitives.WriteInt32BigEndian(number, data.Length);
        output.Write(number);
        var bytes = System.Text.Encoding.ASCII.GetBytes(kind).Concat(data).ToArray();
        output.Write(bytes);
        uint crc = uint.MaxValue;
        foreach (var value in bytes)
        {
            crc ^= value;
            for (var bit = 0; bit < 8; bit++) crc = (crc >> 1) ^ ((crc & 1) == 0 ? 0u : 0xedb88320u);
        }
        System.Buffers.Binary.BinaryPrimitives.WriteUInt32BigEndian(number, ~crc);
        output.Write(number);
    }
}
