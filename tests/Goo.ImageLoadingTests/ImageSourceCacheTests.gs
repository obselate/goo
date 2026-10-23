import Goo
import Goo.Images
import System
import System.Buffers.Binary
import System.Collections.Generic
import System.IO
import System.IO.Compression
import System.Linq
import System.Text
import System.Threading
import System.Threading.Tasks
import Xunit

class ImageSourceCacheTests : IDisposable {
    private let directory string = Path.Combine(Path.GetTempPath(), "goo-png-" + Guid.NewGuid().ToString())

    init() {
        Directory.CreateDirectory(directory)
    }

    func Dispose() -> Directory.Delete(directory, true)

    @Theory
    @InlineData("local-rgb.jpg")
    @InlineData("local-progressive.jpg")
    @InlineData("local-cmyk.jpg")
    @InlineData("local-transparent.gif")
    @InlineData("local-animated.gif")
    async func JpegAndFirstGifFrameHaveOwnedBoundedPixels(name string) {
        using let cache = ImageSourceCache()
        let path = Path.Combine(AppContext.BaseDirectory, "Assets", name)
        using let source = await cache.LoadAsync(path)
        using let second = await cache.LoadAsync(path)
        Assert.Equal(3, source.Width)
        Assert.Equal(2, source.Height)
        using let lease = second.Acquire()
        let decoded = lease.Result()!!
        source.Dispose()
        cache.Dispose()
        Assert.True(decoded.IsValid)
        let pixels = Assert.IsType[[]uint8](decoded.Pixels())
        Assert.Equal(24, pixels.Length)
        if name.EndsWith(".gif", StringComparison.Ordinal) {
            Assert.Equal([]uint8{0, 0, 0, 0}, pixels.Take(4))
            Assert.Equal([]uint8{30, 190, 90, 255}, pixels.Skip(4).Take(4))
        } else {
            Assert.InRange(int32(pixels[0]), 215, 225)
            Assert.InRange(int32(pixels[1]), 55, 65)
            Assert.InRange(int32(pixels[2]), 25, 35)
            Assert.Equal(255, int32(pixels[3]))
        }
        second.Dispose()
        Assert.True(decoded.IsValid)
        lease.Dispose()
        Assert.False(decoded.IsValid)
    }

    @Theory
    @InlineData("local-rgb.jpg")
    @InlineData("local-transparent.gif")
    async func JpegAndGifRejectTruncationAndOversizedHeadersBeforeDecoding(name string) {
        let bytes = File.ReadAllBytes(Path.Combine(AppContext.BaseDirectory, "Assets", name))
        using let cache = ImageSourceCache()
        await Assert.ThrowsAsync[InvalidDataException](() -> cache.LoadAsync(Write("truncated-" + name, bytes[.. ^2])))
        if name.EndsWith(".gif", StringComparison.Ordinal) {
            bytes[6] = uint8(0xff)
            bytes[7] = uint8(0x7f)
        } else {
            let frame = Enumerable.Range(0, bytes.Length - 1).First(
                (i int32) -> bytes[i] == uint8(0xff) && bytes[i + 1] == uint8(0xc0)
            )
            bytes[frame + 7] = uint8(0x7f)
            bytes[frame + 8] = uint8(0xff)
        }
        await Assert.ThrowsAsync[ImageLimitException](() -> cache.LoadAsync(Write("oversized-" + name, bytes)))
    }

    @Fact
    async func GifRejectsRasterExpansionBeyondTheFrame() {
        let bytes = File.ReadAllBytes(Path.Combine(AppContext.BaseDirectory, "Assets", "local-transparent.gif"))
        let image = Array.IndexOf(bytes, uint8(0x2c), 13)
        Assert.True(image > 0)
        bytes[image + 5] = uint8(1)
        bytes[image + 7] = uint8(1)
        using let cache = ImageSourceCache()
        await Assert.ThrowsAsync[InvalidDataException](() -> cache.LoadAsync(Write("overflow.gif", bytes)))
    }

    @Fact
    func IconRejectsWidePngBeforeSdlSquaresItsBuffer() {
        let png = Png(1025, 1, 8, 6, [1 + 1025 * 4]uint8)
        Assert.Throws[InvalidDataException](() -> RasterImageDecoder.DecodeIconPng(png))
    }

    @Fact
    func DecodeAllocatesOnlyTheReturnedPixelsInManagedMemory() {
        let png = Png(1024, 1024, 8, 6, [1024 * (1 + 1024 * 4)]uint8)
        let path = Write("large.png", png)
        ImageSource.Decode(png).Dispose()
        ImageSource.LoadThumbnail(path, 64, 64).Dispose()
        let start = GC.GetAllocatedBytesForCurrentThread()
        using let full = ImageSource.Decode(png)
        let afterFull = GC.GetAllocatedBytesForCurrentThread()
        using let thumbnail = ImageSource.LoadThumbnail(path, 64, 64)
        let afterThumbnail = GC.GetAllocatedBytesForCurrentThread()
        Assert.InRange(afterFull - start, int64(4 << 20), int64((4 << 20) + (256 << 10)))
        Assert.InRange(afterThumbnail - afterFull, int64(0), int64(256 << 10))
    }

    @Fact
    func GrowingStreamBufferKeepsTheEncodedBytes() {
        let raw = [512 * (1 + 512 * 4)]uint8
        Random(7).NextBytes(raw)
        for var y = 0; y < 512; y++ {
            raw[y * (1 + 512 * 4)] = uint8(0)
        }
        let png = Png(512, 512, 8, 6, raw)
        Assert.True(png.Length > 512 * 1024)
        using let expected = ImageSource.Decode(png)
        using let actual = ImageSource.Decode(ForwardOnlyStream(png))
        using let expectedLease = expected.Acquire()
        using let actualLease = actual.Acquire()
        Assert.Equal(expectedLease.Result()!!.Pixels(), actualLease.Result()!!.Pixels())
    }

    @Fact
    func ClipboardBitmapBecomesPngWithTheSamePixels() {
        let bmp = [62]uint8
        bmp[0] = uint8(66)
        bmp[1] = uint8(77)
        bmp[2] = uint8(62)
        bmp[10] = uint8(54)
        bmp[14] = uint8(40)
        bmp[18] = uint8(2)
        bmp[22] = uint8(1)
        bmp[26] = uint8(1)
        bmp[28] = uint8(24)
        bmp[54] = uint8(255)
        bmp[59] = uint8(255)
        using let source = ImageSource.Decode(ClipboardBitmap.ToPng(bmp))
        using let lease = source.Acquire()
        Assert.Equal([]uint8{0, 0, 255, 255, 255, 0, 0, 255}, lease.Result()!!.Pixels())
    }

    @Fact
    async func ConcurrentLoadsSharePixelsWithIndependentOwnersAndLeases() {
        let path = Write(
            "rgba.png",
            Png(
                2,
                1,
                8,
                6,
                []uint8{
                    uint8(0),
                    uint8(240),
                    uint8(120),
                    uint8(60),
                    uint8(128),
                    uint8(10),
                    uint8(20),
                    uint8(30),
                    uint8(255)
                }
            )
        )
        using let cache = ImageSourceCache()
        let loaded = await Task.WhenAll(Enumerable.Range(0, 12).Select((_ int32) -> cache.LoadAsync(path)))
        let first = loaded[0].Acquire()
        let decoded = Assert.IsType[DecodedImage](first.Result())
        Assert.Equal([]uint8{120, 60, 30, 128, 10, 20, 30, 255}, decoded.Pixels())
        for source in loaded {
            using let lease = source.Acquire()
            Assert.Same(decoded, lease.Result())
            source.Dispose()
        }
        cache.Dispose()
        Assert.True(decoded.IsValid)
        first.Dispose()
        Assert.False(decoded.IsValid)
    }

    @Theory
    @InlineData(int32(2), int32(8), []uint8{0, 20, 40, 80}, []uint8{20, 40, 80, 255})
    @InlineData(int32(0), int32(8), []uint8{0, 42}, []uint8{42, 42, 42, 255})
    @InlineData(int32(4), int32(8), []uint8{0, 84, 128}, []uint8{42, 42, 42, 128})
    @InlineData(int32(0), int32(1), []uint8{0, 128}, []uint8{255, 255, 255, 255})
    @InlineData(int32(6), int32(16), []uint8{0, 255, 255, 0, 0, 0, 0, 255, 255}, []uint8{255, 0, 0, 255})
    async func DecodesCommonPngColorTypes(color int32, depth int32, raw[]uint8, expected[]uint8) {
        using let cache = ImageSourceCache()
        using let source = await cache.LoadAsync(Write("color.png", Png(1, 1, depth, color, raw)))
        using let lease = source.Acquire()
        Assert.Equal(expected, lease.Result()!!.Pixels())
    }

    @Fact
    async func SupportsAdam7AndIndexedTransparency() {
        using let cache = ImageSourceCache()
        using let interlaced = await cache.LoadAsync(
            Write(
                "adam7.png",
                Png(1, 1, 8, 6, []uint8{uint8(0), uint8(90), uint8(60), uint8(30), uint8(255)}, interlace: 1)
            )
        )
        using let first = interlaced.Acquire()
        Assert.Equal([]uint8{90, 60, 30, 255}, first.Result()!!.Pixels())
        using let indexed = await cache.LoadAsync(
            Write(
                "indexed.png",
                Png(
                    1,
                    1,
                    8,
                    3,
                    []uint8{uint8(0), uint8(0)},
                    palette: []uint8{uint8(200), uint8(100), uint8(50)},
                    alpha: []uint8{uint8(128)}
                )
            )
        )
        using let second = indexed.Acquire()
        Assert.Equal([]uint8{100, 50, 25, 128}, second.Result()!!.Pixels())
    }

    @Fact
    async func DecodesAllAdam7Passes() {
        let expected = Enumerable.Range(0, 8 * 8).SelectMany((i int32) -> []uint8{uint8(i), 32, 64, 255}).ToArray()
        using let raw = MemoryStream()
        for (x, y, dx, dy) in[](int32, int32, int32, int32){
            (0, 0, 8, 8),
            (4, 0, 8, 8),
            (0, 4, 4, 8),
            (2, 0, 4, 4),
            (0, 2, 2, 4),
            (1, 0, 2, 2),
            (0, 1, 1, 2)
        } {
            for var row = y; row < 8; row += dy {
                raw.WriteByte(0)
                for var column = x; column < 8; column += dx {
                    raw.Write(expected, (row * 8 + column) * 4, 4)
                }
            }
        }
        using let cache = ImageSourceCache()
        using let source = await cache.LoadAsync(Write("passes.png", Png(8, 8, 8, 6, raw.ToArray(), interlace: 1)))
        using let lease = source.Acquire()
        Assert.Equal(expected, lease.Result()!!.Pixels())
    }

    @Fact
    async func MissingAndInvalidFilesAreObservableAndRetryable() {
        using let cache = ImageSourceCache()
        let path = Path.Combine(directory, "retry.png")
        await Assert.ThrowsAsync[FileNotFoundException](() -> cache.LoadAsync(path))
        File.WriteAllBytes(path, []uint8{uint8(1), uint8(2)})
        await Assert.ThrowsAsync[InvalidDataException](() -> cache.LoadAsync(path))
        File.WriteAllBytes(path, Png(1, 1, 8, 6, []uint8{uint8(0), uint8(1), uint8(2), uint8(3), uint8(255)}))
        using let valid = await cache.LoadAsync(path)
        Assert.Equal(1, valid.Width)
    }

    @Fact
    async func RejectsUnsupportedInputCorruptionAndDecompressionOverflow() {
        using let cache = ImageSourceCache()
        await Assert.ThrowsAsync[NotSupportedException](() -> cache.LoadAsync(Write("other.jpg", [12]uint8)))
        let corrupt = Png(1, 1, 8, 6, []uint8{uint8(0), uint8(1), uint8(2), uint8(3), uint8(255)})
        corrupt[29] ^= uint8(1)
        await Assert.ThrowsAsync[InvalidDataException](() -> cache.LoadAsync(Write("crc.png", corrupt)))
        await Assert.ThrowsAsync[InvalidDataException](
            () -> cache.LoadAsync(Write("bomb.png", Png(1, 1, 8, 6, [1000000]uint8)))
        )
        await Assert.ThrowsAsync[InvalidDataException](
            () -> cache.LoadAsync(Write("truncated.png", Png(1, 1, 8, 6, []uint8{uint8(0), uint8(1)})))
        )
        await Assert.ThrowsAsync[ImageLimitException](
            () -> cache.LoadAsync(Write("huge.png", Png(8193, 1, 8, 6, System.Array.Empty[uint8]())))
        )
        await Assert.ThrowsAsync[ImageLimitException](
            () -> cache.LoadAsync(Write("pixels.png", Png(8192, 8192, 8, 6, System.Array.Empty[uint8]())))
        )
        let large = Path.Combine(directory, "encoded.png")
        {
            using let file = File.Create(large)
            file.SetLength(16777217)
        }
        await Assert.ThrowsAsync[ImageLimitException](() -> cache.LoadAsync(large))
    }

    @Fact
    async func CapacityFailureKeepsPreviouslyLoadedSourcesValid() {
        let first = Write("a.png", Png(1, 1, 8, 6, []uint8{uint8(0), uint8(1), uint8(2), uint8(3), uint8(255)}))
        let second = Write("b.png", Png(1, 1, 8, 6, []uint8{uint8(0), uint8(4), uint8(5), uint8(6), uint8(255)}))
        using let bytes = ImageSourceCache(4, 2)
        using let source = await bytes.LoadAsync(first)
        await Assert.ThrowsAsync[InvalidOperationException](() -> bytes.LoadAsync(second))
        using let hit = await bytes.LoadAsync(first)
        Assert.False(hit.IsDisposed)
        using let entries = ImageSourceCache(8, 1)
        using let initial = await entries.LoadAsync(first)
        await Assert.ThrowsAsync[InvalidOperationException](() -> entries.LoadAsync(second))
    }

    @Fact
    async func CancellationAndCacheDisposalDoNotInvalidateReturnedSources() {
        let path = Write("cancel.png", Png(1, 1, 8, 6, []uint8{uint8(0), uint8(1), uint8(2), uint8(3), uint8(255)}))
        using let cache = ImageSourceCache()
        using let cancellation = CancellationTokenSource()
        cancellation.Cancel()
        await Assert.ThrowsAnyAsync[OperationCanceledException](() -> cache.LoadAsync(path, cancellation.Token))
        using let source = await cache.LoadAsync(path)
        cache.Dispose()
        using let lease = source.Acquire()
        Assert.False(lease.IsFailed)
        await Assert.ThrowsAnyAsync[OperationCanceledException](() -> cache.LoadAsync(path))
    }

    @Theory
    @InlineData(true, int64(33), int32(0))
    @InlineData(true, int64(1), int32(33))
    @InlineData(false, int64(0), int32(33))
    func StreamSizeLimitRejectsKnownGrowingAndForwardOnlyInput(seekable bool, length int64, readBytes int32) {
        using let stream = SizedInputStream([33]uint8, seekable, length)
        let error = Assert.Throws[ImageLimitException](
            () -> ImageSource.Decode(stream, ImageDecodeLimits{MaxEncodedBytes: 32}, CancellationToken.None)
        )
        Assert.Equal("Encoded image exceeds 32 bytes", error.Message)
        Assert.Equal(int64(readBytes), stream.Position)
        Assert.True(stream.CanRead)
    }

    @Fact
    func LegacyPathFailsWithMigrationInstruction() {
        let error = Assert.Throws[NotSupportedException](
            () -> ImageLayouts.ApplyPath(Node(), "asset.png", ImageFit.Contain)
        )
        Assert.Contains("ImageSourceCache.LoadAsync", error.Message)
    }

    @Fact
    func BackgroundPathChangesPreserveSourcePrecedenceAndOwnership() {
        let node = Node()
        using let source = ImageSource(1, 1, []uint8{20, 40, 80, 255})
        BackgroundImageLayouts.SetPath(node, "asset.png", nil)
        Assert.Same(DecodedImage.Failed, BackgroundImageLayouts.Image(node))
        BackgroundImageLayouts.SetSource(node, source, nil, nil)
        let decoded = BackgroundImageLayouts.Image(node)
        Assert.True(decoded!!.IsValid)
        BackgroundImageLayouts.SetPath(node, "changed.png", nil)
        Assert.Same(decoded, BackgroundImageLayouts.Image(node))
        BackgroundImageLayouts.SetSource(node, nil, nil, nil)
        Assert.Same(DecodedImage.Failed, BackgroundImageLayouts.Image(node))
        Assert.True(decoded!!.IsValid)
        BackgroundImageLayouts.SetSource(node, source, nil, nil)
        BackgroundImageLayouts.SetPath(node, "", nil)
        Assert.Same(decoded, BackgroundImageLayouts.Image(node))
        BackgroundImageLayouts.SetSource(node, nil, nil, nil)
        Assert.Null(BackgroundImageLayouts.Image(node))
        Assert.False(node.HasBackgroundImageState)
    }

    @Fact
    func ClipboardAndStreamImagesUseMountedLeaseOwnershipAndBoundedDecoding() {
        let bytes = Png(1, 1, 8, 6, []uint8{uint8(0), uint8(200), uint8(100), uint8(50), uint8(128)})
        let clipboard = ClipboardImage(ClipboardReadStatus.Success, "image/png", bytes)
        let node = Node()
        using let source = ImageSource.Decode(clipboard.Bytes)
        ImageLayouts.ApplySource(node, source, ImageFit.Contain, nil, nil)
        source.Dispose()
        Assert.Equal([]uint8{100, 50, 25, 128}, node.DecodedImage!!.Pixels())
        let mounted = node.DecodedImage
        ImageLayouts.Dispose(node)
        Assert.False(mounted!!.IsValid)
        using let stream = MemoryStream([]uint8{42}.Concat(bytes).ToArray())
        stream.Position = 1
        using let streamed = ImageSource.Decode(stream)
        using let lease = streamed.Acquire()
        Assert.Equal([]uint8{100, 50, 25, 128}, lease.Result()!!.Pixels())
        Assert.True(stream.CanRead)
        using let malformed = MemoryStream(Png(1, 1, 8, 6, [1000000]uint8))
        Assert.Throws[InvalidDataException](() -> ImageSource.Decode(malformed))
        Assert.True(malformed.CanRead)
    }

    @Fact
    func ThumbnailBoundsRetainedPixelsAndPreservesPremultipliedAlpha() {
        using let raw = MemoryStream()
        for var y = 0; y < 160; y++ {
            raw.WriteByte(0)
            for var x = 0; x < 320; x++ {
                raw.Write([]uint8{uint8(200), uint8(100), uint8(50), uint8(128)})
            }
        }
        let path = Write("large-rgba.png", Png(320, 160, 8, 6, raw.ToArray()))
        using let source = ImageSource.LoadThumbnail(path, 160, 160)
        Assert.Equal(160, source.Width)
        Assert.Equal(80, source.Height)
        using let lease = source.Acquire()
        let pixels = lease.Result()!!.Pixels()!!
        Assert.Equal(160 * 80 * 4, pixels.Length)
        Assert.Equal([]uint8{100, 50, 25, 128}, pixels[.. 4])
        Assert.Equal([]uint8{100, 50, 25, 128}, pixels[^4 ..])
        using let full = ImageSource.LoadThumbnail(path, 640, 640)
        Assert.Equal(320, full.Width)
        Assert.Equal(160, full.Height)
        using let cancelled = CancellationTokenSource()
        cancelled.Cancel()
        Assert.ThrowsAny[OperationCanceledException](() -> ImageSource.LoadThumbnail(path, 160, 160, cancelled.Token))
    }

    @Theory
    @InlineData(
        int32(17),
        int32(11),
        int32(7),
        int32(5),
        int32(7),
        int32(5),
        "CgsKTj0XKKE4ECNbSSBKfhoobJgsIUxXf0A2qQwmFHYnKyRkYUNLkkYvQWIfTXKFOkNQeE9FEWgTTiZ4MU42elFUSXRXaGyKG1lWckJuD31gXR98EVwudT07T4RibmOJKRdHZCYeFpI9KBd1dh05jSAgWKUlDjdSaiZ5ijciZnwfJBNlX0I4p0YjKFQ="
    )
    @InlineData(
        int32(11),
        int32(17),
        int32(5),
        int32(7),
        int32(5),
        int32(7),
        "CQ4KUjEWIpNAFCl3XB47axkraqAJJBJlJzEnbF5NTpxTLz1iF0ZedRNkL44pSzFrSVlHb3FnYoMUSFVoE0I1djYiTYFOP1Z3RCJuexcRIIYYHUZ9LiNKZWIzeY5QLVF5FjYWciBRY403SWZ8T0swalNoFJYSRxlgG1xXalCRXKBDNQ9bQzUgdyQ+PZw="
    )
    @InlineData(int32(31), int32(3), int32(7), int32(4), int32(7), int32(1), "HBYXdlYfOHgcJVh3Yjk2iiRALHpaTFF+KFRafw==")
    @InlineData(int32(3), int32(31), int32(4), int32(7), int32(1), int32(7), "DxoRZxROK3MgKE+DJVZsgzA4LJE1UiaCODQ9eg==")
    @InlineData(int32(1), int32(17), int32(7), int32(5), int32(1), int32(5), "AhYJWAZBG3MNWTqSDiY7ZhZiX4I=")
    @InlineData(int32(17), int32(1), int32(5), int32(7), int32(5), int32(1), "DQIHNUMLKIkkDzJYGRhSclgkSHs=")
    func ThumbnailFractionalCoverageMatchesPublishedPixels(
        width int32,
        height int32,
        maxWidth int32,
        maxHeight int32,
        expectedWidth int32,
        expectedHeight int32,
        published string
    ) {
        using let raw = MemoryStream()
        for var y = 0; y < height; y++ {
            raw.WriteByte(0)
            for var x = 0; x < width; x++ {
                raw.Write(
                    []uint8{
                        uint8((x * 29 + y * 3)),
                        uint8((x * 5 + y * 31)),
                        uint8((x * 17 + y * 13)),
                        uint8((x * 43 + y * 71))
                    }
                )
            }
        }
        let path = Write("fractional.png", Png(width, height, 8, 6, raw.ToArray()))
        using let source = ImageSource.LoadThumbnail(path, maxWidth, maxHeight)
        Assert.Equal(expectedWidth, source.Width)
        Assert.Equal(expectedHeight, source.Height)
        using let lease = source.Acquire()
        let pixels = lease.Result()!!.Pixels()!!
        let expected = Convert.FromBase64String(published)
        Assert.Equal(expected.Length, pixels.Length)
        for var i = 0; i < pixels.Length; i++ {
            Assert.InRange(Math.Abs(pixels[i] - expected[i]), 0, 1)
        }
        for var i = 0; i < pixels.Length; i += 4 {
            for var channel = 0; channel < 3; channel++ {
                Assert.True(pixels[i + channel] <= pixels[i + 3])
            }
        }
    }

    @Fact
    func ThumbnailMaximumRasterCoverageDoesNotOverflow() {
        const width = 8192
        const height = 2048
        let stride = width * 4 + 1
        let raw = [stride * height]uint8
        Array.Fill(raw, uint8(255))
        for var y = 0; y < height; y++ {
            raw[y * stride] = uint8(0)
        }
        let path = Write("maximum.png", Png(width, height, 8, 6, raw))
        using let source = ImageSource.LoadThumbnail(path, 1, 1)
        Assert.Equal(1, source.Width)
        Assert.Equal(1, source.Height)
        using let lease = source.Acquire()
        Assert.Equal([]uint8{255, 255, 255, 255}, lease.Result()!!.Pixels())
    }

    @Fact
    func ThumbnailFilteringDoesNotBleedHiddenRgbIntoVisiblePixels() {
        let path = Write(
            "alpha-edge.png",
            Png(
                2,
                1,
                8,
                6,
                []uint8{uint8(0), uint8(255), uint8(0), uint8(0), uint8(255), uint8(0), uint8(0), uint8(255), uint8(0)}
            )
        )
        using let source = ImageSource.LoadThumbnail(path, 1, 1)
        using let lease = source.Acquire()
        Assert.Equal([]uint8{128, 0, 0, 128}, lease.Result()!!.Pixels())
    }

    @Fact
    func ThumbnailCancellationStopsReadingBeforeDecode() {
        using let cancelled = CancellationTokenSource()
        using let stream = CancelAfterReadStream(
            Png(
                2,
                1,
                8,
                6,
                []uint8{uint8(0), uint8(255), uint8(0), uint8(0), uint8(255), uint8(0), uint8(0), uint8(255), uint8(0)}
            ),
            cancelled
        )
        Assert.ThrowsAny[OperationCanceledException](
            () -> RasterImageDecoder.LoadThumbnail(stream, 1, 1, ImageDecodeLimits.Default, cancelled.Token)
        )
    }

    @Theory
    @InlineData("local-rgb.jpg")
    @InlineData("local-transparent.gif")
    func ThumbnailLoadsExistingJpegAndGifFormats(name string) {
        let path = Path.Combine(AppContext.BaseDirectory, "Assets", name)
        using let source = ImageSource.LoadThumbnail(path, 2, 1)
        Assert.Equal(2, source.Width)
        Assert.Equal(1, source.Height)
        using let lease = source.Acquire()
        Assert.Equal(8, lease.Result()!!.Pixels()!!.Length)
    }

    @Theory
    @InlineData(int32(1), "012345")
    @InlineData(int32(2), "210543")
    @InlineData(int32(3), "543210")
    @InlineData(int32(4), "345012")
    @InlineData(int32(5), "031425")
    @InlineData(int32(6), "304152")
    @InlineData(int32(7), "524130")
    @InlineData(int32(8), "251403")
    func ExifOrientationTransformsPngAndJpegPixels(orientation int32, order string) {
        let png = Png(
            3,
            2,
            8,
            2,
            []uint8{
                uint8(0),
                uint8(10),
                uint8(20),
                uint8(30),
                uint8(40),
                uint8(50),
                uint8(60),
                uint8(70),
                uint8(80),
                uint8(90),
                uint8(0),
                uint8(100),
                uint8(110),
                uint8(120),
                uint8(130),
                uint8(140),
                uint8(150),
                uint8(160),
                uint8(170),
                uint8(180)
            }
        )
        let jpeg = File.ReadAllBytes(Path.Combine(AppContext.BaseDirectory, "Assets", "local-rgb.jpg"))
        for encoded in[][]uint8{png, jpeg} {
            using let original = ImageSource.Decode(encoded)
            using let originalLease = original.Acquire()
            let pixels = originalLease.Result()!!.Pixels()!!
            let expected = order.SelectMany((index char) -> pixels.Skip((index - '0') * 4).Take(4)).ToArray()
            for little in[]bool{false, true} {
                using let rotated = ImageSource.Decode(WithExif(encoded, Exif(orientation, little)))
                using let lease = rotated.Acquire()
                Assert.Equal(
                    if orientation >= 5 {
                        (2, 3)
                    } else {
                        (3, 2)
                    },
                    (rotated.Width, rotated.Height)
                )
                Assert.Equal(expected, lease.Result()!!.Pixels())
            }
        }
    }

    @Fact
    func OrientedThumbnailUsesDisplayedBoundsAndDecodedLimit() {
        let png = Png(3, 2, 8, 2, [20]uint8)
        let path = Write("portrait.png", WithExif(png, Exif(6, true)))
        using let thumbnail = ImageSource.LoadThumbnail(
            path,
            1,
            2,
            ImageDecodeLimits{MaxDecodedBytes: 8},
            CancellationToken.None
        )
        Assert.Equal((1, 2), (thumbnail.Width, thumbnail.Height))
    }

    @Fact
    func MalformedOrDuplicateExifKeepsPngAndJpegUnrotated() {
        let png = Png(
            3,
            2,
            8,
            2,
            []uint8{
                uint8(0),
                uint8(10),
                uint8(20),
                uint8(30),
                uint8(40),
                uint8(50),
                uint8(60),
                uint8(70),
                uint8(80),
                uint8(90),
                uint8(0),
                uint8(100),
                uint8(110),
                uint8(120),
                uint8(130),
                uint8(140),
                uint8(150),
                uint8(160),
                uint8(170),
                uint8(180)
            }
        )
        let jpeg = File.ReadAllBytes(Path.Combine(AppContext.BaseDirectory, "Assets", "local-rgb.jpg"))
        let invalidOffset = Exif(6, true)
        invalidOffset.AsSpan(4, 4).Fill(uint8(255))
        let invalidOrder = Exif(6, true)
        invalidOrder[0] = uint8(0)
        let invalidHeader = Exif(6, true)
        invalidHeader[2] = uint8(0)
        let invalidType = Exif(6, true)
        invalidType[12] = uint8(4)
        let invalidCount = Exif(6, true)
        invalidCount[14] = uint8(2)
        let duplicateTag = [38]uint8
        Exif(6, true).AsSpan(0, 22).CopyTo(duplicateTag)
        duplicateTag[8] = uint8(2)
        duplicateTag.AsSpan(10, 12).CopyTo(duplicateTag.AsSpan(22, 12))
        for encoded in[][]uint8{png, jpeg} {
            using let original = ImageSource.Decode(encoded)
            using let originalLease = original.Acquire()
            let malformed = [][]uint8{
                invalidOffset,
                invalidOrder,
                invalidHeader,
                invalidType,
                invalidCount,
                duplicateTag,
                Exif(0, true),
                Exif(9, false),
                Exif(6, true)[.. 7],
                Exif(6, true)[.. ^1]
            }
            let inputs = malformed.Select((exif[]uint8) -> WithExif(encoded, exif)).Append(
                WithExif(WithExif(encoded, Exif(6, true)), Exif(1, false))
            )
            for input in inputs {
                using let source = ImageSource.Decode(input)
                using let lease = source.Acquire()
                Assert.Equal((original.Width, original.Height), (source.Width, source.Height))
                Assert.Equal(originalLease.Result()!!.Pixels(), lease.Result()!!.Pixels())
            }
        }
    }

    @Theory
    @InlineData(1.0, 1f, 1f)
    @InlineData(1.25, 1f, 1.5f)
    @InlineData(1.6, 1f, 2f)
    @InlineData(2.5, 1f, 3f)
    @InlineData(4.0, 1f, 3f)
    @InlineData(2.0, 1.5f, 3f)
    async func ImageVariantsUseWindowScaleAndReuseOwnedPixels(displayScale float64, uiScale float32, expected float32) {
        let family = []float32{3f, 1f, 2f, 1.5f}.Select(
            (density float32) -> {
                let edge = int32((density * float32(2.0)))
                let path = Write("logo@${density}x.png", Png(edge, edge, 8, 6, [edge * (1 + edge * 4)]uint8))
                return ImageVariant(path, density)
            }
        )
            .ToArray()
        using let variants = ImageVariants(family)
        let metrics = WindowMetrics{DisplayScaleX: displayScale, DisplayScaleY: displayScale, UiScale: uiScale}
        let result = await variants.LoadAsync(metrics, CancellationToken.None)
        let second = await variants.LoadAsync(metrics, CancellationToken.None)
        Assert.Equal(ImageAssetStatus.Success, result.Status)
        Assert.Equal(ImageAssetStatus.Success, second.Status)
        Assert.Equal(expected, result.PixelsPerUnit)
        using let source = result.Source!!
        using let owner = second.Source!!
        Assert.Equal(expected * float32(2.0), float32(source.Width))
        using let lease = source.Acquire()
        using let other = owner.Acquire()
        Assert.Same(lease.Result(), other.Result())
        variants.Dispose()
        source.Dispose()
        Assert.False(lease.IsFailed)
        Assert.True(other.Result()!!.IsValid)
    }

    @Fact
    async func ImageVariantsReportMissingMetricsAndMismatchedLogicalSizes() {
        let path = Write("same-size.png", Png(2, 2, 8, 6, [18]uint8))
        using let variants = ImageVariants([]ImageVariant{ImageVariant(path, 1.0F), ImageVariant(path, 2.0F)})
        Assert.Equal(
            ImageAssetStatus.NotReady,
            (await variants.LoadAsync(default(WindowMetrics), CancellationToken.None)).Status
        )
        let small = await variants.LoadAsync(
            WindowMetrics{DisplayScaleX: 1.0, DisplayScaleY: 1.0},
            CancellationToken.None
        )
        Assert.Equal(ImageAssetStatus.Success, small.Status)
        small.Source!!.Dispose()
        Assert.Equal(
            ImageAssetStatus.InvalidData,
            (
                await variants.LoadAsync(WindowMetrics{DisplayScaleX: 2.0, DisplayScaleY: 2.0}, CancellationToken.None)
            ).Status
        )
        using let missing = ImageVariants([]ImageVariant{ImageVariant(Path.Combine(directory, "missing.png"), 1.0F)})
        Assert.Equal(
            ImageAssetStatus.NotFound,
            (
                await missing.LoadAsync(WindowMetrics{DisplayScaleX: 1.0, DisplayScaleY: 1.0}, CancellationToken.None)
            ).Status
        )
        Assert.Equal(
            ImageAssetStatus.Cancelled,
            (
                await variants.LoadAsync(WindowMetrics{DisplayScaleX: 1.0, DisplayScaleY: 1.0}, CancellationToken(true))
            ).Status
        )
    }

    @Theory
    @InlineData("sRGB-v4.icc", []uint8{0, 0, 0, 255, 255, 255, 16, 32, 64, 64, 128, 192, 180, 90, 30, 128, 128, 128, 230, 230, 230})
    @InlineData("sRGB-v2-micro.icc", []uint8{0, 0, 0, 255, 255, 255, 16, 32, 64, 64, 128, 192, 180, 90, 30, 128, 128, 128, 230, 230, 230})
    @InlineData("DisplayP3-v4.icc", []uint8{0, 0, 0, 255, 255, 255, 10, 33, 66, 32, 130, 197, 193, 83, 0, 128, 128, 128, 230, 230, 230})
    @InlineData("AdobeCompat-v2.icc", []uint8{0, 0, 0, 255, 255, 255, 0, 26, 63, 0, 129, 196, 205, 90, 16, 129, 129, 129, 231, 231, 231})
    @InlineData("ProPhoto-v4.icc", []uint8{0, 0, 0, 255, 255, 255, 0, 46, 86, 0, 157, 211, 251, 73, 0, 146, 146, 146, 235, 235, 235})
    @InlineData("sGrey-v4.icc", []uint8{0, 0, 0, 255, 255, 255, 16, 16, 16, 64, 64, 64, 180, 180, 180, 128, 128, 128, 230, 230, 230})
    func ManagedIccMatchesReferenceConversions(name string, expected []uint8) {
        let profile = File.ReadAllBytes(Path.Combine(AppContext.BaseDirectory, "Assets", "icc", name))
        let gray = name.StartsWith("sGrey", StringComparison.Ordinal)
        let samples = if gray { []uint8{0, 255, 16, 64, 180, 128, 230} }
            else { []uint8{0, 0, 0, 255, 255, 255, 16, 32, 64, 64, 128, 192, 180, 90, 30, 128, 128, 128, 230, 230, 230} }
        let png = WithIcc(Png(7, 1, 8, if gray { 0 } else { 2 }, []uint8{0}.Concat(samples).ToArray()), profile)
        let result = ImageSource.DecodeColorManaged(png, ImageDecodeLimits.Default, CancellationToken.None)
        Assert.Equal(ImageDecodeStatus.Success, result.Status)
        using let source = result.Source!!
        using let lease = source.Acquire()
        let pixels = lease.Result()!!.Pixels()!!
        for pixel in 0 ... 7 {
            for channel in 0 ... 3 {
                Assert.InRange(int32(pixels[pixel * 4 + channel]), Math.Max(0, int32(expected[pixel * 3 + channel]) - 2),
                    Math.Min(255, int32(expected[pixel * 3 + channel]) + 2))
            }
            Assert.Equal(uint8(255), pixels[pixel * 4 + 3])
        }
    }

    @Fact
    func ManagedIccPreservesAlphaAndLegacyDecodeKeepsSrgbAssumption() {
        let profile = File.ReadAllBytes(Path.Combine(AppContext.BaseDirectory, "Assets", "icc", "DisplayP3-v4.icc"))
        let png = WithIcc(Png(2, 1, 8, 6, []uint8{0, 180, 90, 30, 128, 180, 90, 30, 0}), profile)
        let result = ImageSource.DecodeColorManaged(png, ImageDecodeLimits.Default, CancellationToken.None)
        Assert.Equal(ImageDecodeStatus.Success, result.Status)
        using let managed = result.Source!!
        using let managedLease = managed.Acquire()
        let converted = managedLease.Result()!!.Pixels()!!
        Assert.InRange(converted[0], uint8(96), uint8(98))
        Assert.InRange(converted[1], uint8(41), uint8(43))
        Assert.Equal([]uint8{0, 128, 0, 0, 0, 0}, converted.Skip(2))
        using let legacy = ImageSource.Decode(png)
        using let legacyLease = legacy.Acquire()
        Assert.Equal([]uint8{90, 45, 15, 128, 0, 0, 0, 0}, legacyLease.Result()!!.Pixels())
    }

    @Fact
    func ManagedIccRejectsIncompleteFragmentsBoundsAndUnsupportedProfiles() {
        let profile = File.ReadAllBytes(Path.Combine(AppContext.BaseDirectory, "Assets", "icc", "sRGB-v4.icc"))
        let jpeg = File.ReadAllBytes(Path.Combine(AppContext.BaseDirectory, "Assets", "local-rgb.jpg"))
        let png = Png(1, 1, 8, 2, []uint8{0, 180, 90, 30})
        let fragmented = WithJpegIcc(WithJpegIcc(jpeg, 1, 2, profile[..200]), 2, 2, profile[200..])
        let result = ImageSource.DecodeColorManaged(fragmented, ImageDecodeLimits.Default, CancellationToken.None)
        Assert.Equal(ImageDecodeStatus.Success, result.Status)
        result.Source!!.Dispose()
        let incomplete = WithJpegIcc(jpeg, 2, 2, profile[200..])
        Assert.Equal(ImageDecodeStatus.InvalidData, ImageSource.DecodeColorManaged(incomplete,
            ImageDecodeLimits.Default, CancellationToken.None).Status)
        let duplicate = WithJpegIcc(WithJpegIcc(jpeg, 1, 2, profile[..200]), 1, 2, profile[200..])
        Assert.Equal(ImageDecodeStatus.InvalidData, ImageSource.DecodeColorManaged(duplicate,
            ImageDecodeLimits.Default, CancellationToken.None).Status)
        let invalid = cast[[]uint8](profile.Clone())
        invalid.AsSpan(136, 4).Fill(uint8(255))
        Assert.Equal(ImageDecodeStatus.InvalidData, ImageSource.DecodeColorManaged(WithIcc(png, invalid),
            ImageDecodeLimits.Default, CancellationToken.None).Status)
        let lut = cast[[]uint8](profile.Clone())
        System.Text.Encoding.ASCII.GetBytes("A2B0").CopyTo(lut, 132)
        Assert.Equal(ImageDecodeStatus.Unsupported, ImageSource.DecodeColorManaged(WithIcc(png, lut),
            ImageDecodeLimits.Default, CancellationToken.None).Status)
        let cmyk = cast[[]uint8](profile.Clone())
        System.Text.Encoding.ASCII.GetBytes("CMYK").CopyTo(cmyk, 16)
        Assert.Equal(ImageDecodeStatus.Unsupported, ImageSource.DecodeColorManaged(WithIcc(png, cmyk),
            ImageDecodeLimits.Default, CancellationToken.None).Status)
        let oversized = [(4 << 20) + 1]uint8
        Assert.Equal(ImageDecodeStatus.InvalidData, ImageSource.DecodeColorManaged(WithIcc(png, oversized),
            ImageDecodeLimits.Default, CancellationToken.None).Status)
        Assert.Equal(ImageDecodeStatus.Cancelled, ImageSource.DecodeColorManaged(png,
            ImageDecodeLimits.Default, CancellationToken(true)).Status)
    }

    @Fact
    func PngCicpSrgbTakesPrecedenceOverEmbeddedIcc() {
        let profile = File.ReadAllBytes(Path.Combine(AppContext.BaseDirectory, "Assets", "icc", "DisplayP3-v4.icc"))
        let png = WithIcc(Png(1, 1, 8, 2, []uint8{0, 180, 90, 30}), profile)
        using let output = MemoryStream()
        output.Write(png.AsSpan(0, 33))
        Chunk(output, "cICP", []uint8{1, 13, 0, 1})
        output.Write(png.AsSpan(33))
        let result = ImageSource.DecodeColorManaged(output.ToArray(), ImageDecodeLimits.Default, CancellationToken.None)
        Assert.Equal(ImageDecodeStatus.Success, result.Status)
        using let source = result.Source!!
        using let lease = source.Acquire()
        Assert.Equal([]uint8{180, 90, 30, 255}, lease.Result()!!.Pixels())
    }

    private func Write(name string, bytes[]uint8) string {
        let path = Path.Combine(directory, name)
        File.WriteAllBytes(path, bytes)
        return path
    }

    private class ForwardOnlyStream(bytes[]uint8) : MemoryStream(bytes) {
        override prop CanSeek bool -> false
    }

    private class SizedInputStream(bytes []uint8, seekable bool, length int64) : MemoryStream(bytes) {
        override prop CanSeek bool -> seekable

        override prop Length int64 -> length
    }

    private class CancelAfterReadStream(bytes[]uint8, cancellation CancellationTokenSource) : MemoryStream(bytes) {
        override func Read(buffer[]uint8, offset int32, count int32) int32 {
            let read = base.Read(buffer, offset, count)
            cancellation.Cancel()
            return read
        }
    }

    @Fact
    func LimitsApplyToKeptPixelsAndReportTheSourceSize() {
        using let raw = MemoryStream()
        for var y = 0; y < 64; y++ {
            raw.WriteByte(0)
            for var x = 0; x < 64; x++ {
                raw.Write([]uint8{uint8(10), uint8(20), uint8(30), uint8(255)})
            }
        }
        let png = Png(64, 64, 8, 6, raw.ToArray())
        let limits = ImageDecodeLimits{MaxDecodedBytes: 1024}
        using let thumbnail = ImageSource.LoadThumbnail(Write("limits.png", png), 8, 8, limits, CancellationToken.None)
        Assert.Equal(8, thumbnail.Width)
        Assert.Equal(8, thumbnail.Height)
        let decoded = Assert.Throws[ImageLimitException](() -> ImageSource.Decode(png, limits, CancellationToken.None))
        Assert.Equal((64, 64), (decoded.Width, decoded.Height))
        let side = Assert.Throws[ImageLimitException](
            () -> ImageSource.Decode(png, ImageDecodeLimits{MaxPixelsPerSide: 32}, CancellationToken.None)
        )
        Assert.Equal((64, 64), (side.Width, side.Height))
        let encoded = Assert.Throws[ImageLimitException](
            () -> ImageSource.Decode(png, ImageDecodeLimits{MaxEncodedBytes: 16}, CancellationToken.None)
        )
        Assert.Equal((0, 0), (encoded.Width, encoded.Height))
    }

    shared {
        private func WithIcc(png []uint8, profile []uint8) []uint8 {
            using let compressed = MemoryStream()
            compressed.Write([]uint8{73, 67, 67, 0, 0})
            {
                using let zlib = ZLibStream(compressed, CompressionLevel.Fastest, true)
                zlib.Write(profile)
            }
            using let output = MemoryStream()
            output.Write(png.AsSpan(0, 33))
            Chunk(output, "iCCP", compressed.ToArray())
            output.Write(png.AsSpan(33))
            return output.ToArray()
        }

        private func WithJpegIcc(jpeg []uint8, sequence int32, count int32, profile []uint8) []uint8 {
            using let output = MemoryStream()
            output.Write(jpeg.AsSpan(0, 2))
            let size = profile.Length + 16
            output.Write([]uint8{255, 226, uint8(size >> 8), uint8(size)})
            output.Write(System.Text.Encoding.ASCII.GetBytes("ICC_PROFILE\0"))
            output.WriteByte(uint8(sequence))
            output.WriteByte(uint8(count))
            output.Write(profile)
            output.Write(jpeg.AsSpan(2))
            return output.ToArray()
        }

        private func Exif(orientation int32, little bool)[]uint8 {
            let bytes = [26]uint8
            bytes[0] = (
                bytes[1] = if little {
                    uint8(73)
                } else {
                    uint8(77)
                }
            )
            let Write16 = (offset int32, value uint16) -> {
                if little {
                    BinaryPrimitives.WriteUInt16LittleEndian(bytes.AsSpan(offset), value)
                } else {
                    BinaryPrimitives.WriteUInt16BigEndian(bytes.AsSpan(offset), value)
                }
            }
            let Write32 = (offset int32, value uint32) -> {
                if little {
                    BinaryPrimitives.WriteUInt32LittleEndian(bytes.AsSpan(offset), value)
                } else {
                    BinaryPrimitives.WriteUInt32BigEndian(bytes.AsSpan(offset), value)
                }
            }
            Write16(2, 42)
            Write32(4, 8)
            Write16(8, 1)
            Write16(10, 0x0112)
            Write16(12, 3)
            Write32(14, 1)
            Write16(18, uint16(orientation))
            return bytes
        }

        private func WithExif(encoded[]uint8, exif[]uint8)[]uint8 {
            using let output = MemoryStream()
            if encoded[0] == uint8(255) {
                output.Write(encoded.AsSpan(0, 2))
                output.Write(
                    []uint8{
                        uint8(255),
                        uint8(225),
                        uint8(0),
                        uint8((exif.Length + 8)),
                        uint8(69),
                        uint8(120),
                        uint8(105),
                        uint8(102),
                        uint8(0),
                        uint8(0)
                    }
                )
                output.Write(exif)
                output.Write(encoded.AsSpan(2))
            } else {
                output.Write(encoded.AsSpan(0, encoded.Length - 12))
                Chunk(output, "eXIf", exif)
                output.Write(encoded.AsSpan(encoded.Length - 12))
            }
            return output.ToArray()
        }

        private func Png(
            width int32,
            height int32,
            depth int32,
            color int32,
            raw[]uint8,
            interlace uint8 = 0,
            palette[]?uint8 = nil,
            alpha[]?uint8 = nil
        )[]uint8 {
            using let png = MemoryStream()
            png.Write([]uint8{137, 80, 78, 71, 13, 10, 26, 10})
            let header = [13]uint8
            BinaryPrimitives.WriteInt32BigEndian(header, width)
            BinaryPrimitives.WriteInt32BigEndian(header.AsSpan(4), height)
            header[8] = uint8(depth)
            header[9] = uint8(color)
            header[12] = interlace
            Chunk(png, "IHDR", header)
            if palette != nil {
                Chunk(png, "PLTE", palette)
            }
            if alpha != nil {
                Chunk(png, "tRNS", alpha)
            }
            using let compressed = MemoryStream()
            {
                using let zlib = ZLibStream(compressed, CompressionLevel.Fastest, true)
                zlib.Write(raw)
            }
            Chunk(png, "IDAT", compressed.ToArray())
            Chunk(png, "IEND", System.Array.Empty[uint8]())
            return png.ToArray()
        }

        private func Chunk(output Stream, kind string, data[]uint8) {
            let number = stackalloc[4]uint8
            BinaryPrimitives.WriteInt32BigEndian(number, data.Length)
            output.Write(number)
            let bytes = Encoding.ASCII.GetBytes(kind).Concat(data).ToArray()
            output.Write(bytes)
            var crc = uint32.MaxValue
            for value in bytes {
                crc ^= uint32(value)
                for var bit = 0; bit < 8; bit++ {
                    crc = (crc >> 1) ^ (
                        if (crc & uint32(1)) == uint32(0) {
                            0u
                        } else {
                            0xedb88320u
                        }
                    )
                }
            }
            BinaryPrimitives.WriteUInt32BigEndian(number, ~crc)
            output.Write(number)
        }
    }
}
