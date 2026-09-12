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
        var error = Assert.Throws<NotSupportedException>(() => ImageLayouts.ApplyPath(new Node(), "asset.png", ImageFit.Contain, null));
        Assert.Contains("ImageSourceCache.LoadAsync", error.Message);
    }

    private string Write(string name, byte[] bytes)
    {
        var path = Path.Combine(directory, name);
        File.WriteAllBytes(path, bytes);
        return path;
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
