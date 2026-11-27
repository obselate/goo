import Goo
import System
import System.Collections.Generic
import System.IO
import System.Runtime.InteropServices
import Xunit

internal class MockHybridTextProvider : VulkanTextProvider {
    internal var MetricsValue VulkanHarfBuzzMetrics = VulkanHarfBuzzMetrics{
        UnitsPerEm: 1000u,
        GlyphCount: 64u,
        Scale: 1000,
        Ascender: 800,
        Descender: -200,
        LineGap: 0,
    }
    internal var PaintEnabled bool
    internal var BitmapEnabled bool
    internal var DrawBytesByGlyph Dictionary[uint32, int32] = Dictionary[uint32, int32]()
    internal var PaintBytesByGlyph Dictionary[uint32, int32] = Dictionary[uint32, int32]()
    internal var FailGlyphs HashSet[uint32] = HashSet[uint32]()
    internal var MisalignedGlyphs HashSet[uint32] = HashSet[uint32]()
    internal var UnboundedCapacityGlyphs HashSet[uint32] = HashSet[uint32]()
    internal var BitmapRgbaByGlyph Dictionary[uint32, []uint8] = Dictionary[uint32, []uint8]()
    internal var BitmapSizeByGlyph Dictionary[uint32, int32] = Dictionary[uint32, int32]()
    internal var RequireGrowthFirstCallGlyphs HashSet[uint32] = HashSet[uint32]()
    private let growthTriggered HashSet[uint32] = HashSet[uint32]()

    internal var EncodeDrawCallCount int32
    internal var EncodePaintCallCount int32
    internal var LastBitmapPpem int32

    public prop AbiVersion uint32{ get -> VulkanTextProviderAbi.Version }
    public prop Metrics VulkanHarfBuzzMetrics{ get -> MetricsValue }
    public prop OutlineHintingAvailable bool{ get -> false }

    public func ShapeInto(text string, options VulkanTextShapingOptions,
        workspace VulkanTextShapingWorkspace) VulkanTextProviderResult -> VulkanTextProviderResult{
            AbiVersion: VulkanTextProviderAbi.Version,
            Status: VulkanTextProviderAbi.Success,
            Count: 0,
            Required: 0,
        }

    public func ShapeInto(text string, itemOffset int32, itemLength int32,
        options VulkanTextShapingOptions, workspace VulkanTextShapingWorkspace) VulkanTextProviderResult -> VulkanTextProviderResult{
            AbiVersion: VulkanTextProviderAbi.Version,
            Status: VulkanTextProviderAbi.Success,
            Count: 0,
            Required: 0,
        }

    public func TryGetNominalGlyph(codepoint uint32, out glyphId uint32) bool {
        glyphId = 0u
        return false
    }

    public func EncodeGlyphInto(glyphId uint32,
        workspace VulkanTextProviderWorkspace, ppem int32) VulkanTextProviderResult {
        EncodeDrawCallCount = EncodeDrawCallCount + 1
        if UnboundedCapacityGlyphs.Contains(glyphId) {
            return VulkanTextProviderResult{
                AbiVersion: VulkanTextProviderAbi.Version,
                Status: VulkanTextProviderAbi.CapacityExceeded,
                Count: 0,
                Required: 33554432,
            }
        }
        if FailGlyphs.Contains(glyphId) {
            return VulkanTextProviderResult{
                AbiVersion: VulkanTextProviderAbi.Version,
                Status: VulkanTextProviderAbi.NativeFailure,
                Count: 0,
                Required: 0,
            }
        }
        if MisalignedGlyphs.Contains(glyphId) {
            workspace.Reset()
            workspace.SetEncoding(7, VulkanTextGlyphExtents{
                XBearing: 0, YBearing: 800, Width: 800, Height: -800,
            }, 1000, 0u)
            return VulkanTextProviderResult{
                AbiVersion: VulkanTextProviderAbi.Version,
                Status: VulkanTextProviderAbi.Success,
                Count: 7,
                Required: 7,
            }
        }
        let byteCount = if DrawBytesByGlyph.TryGetValue(glyphId, out var configured) {
            configured
        } else {
            64
        }
        if (RequireGrowthFirstCallGlyphs.Contains(glyphId) && !growthTriggered.Contains(glyphId))
            || byteCount > workspace.ByteCapacity {
            growthTriggered.Add(glyphId)
            workspace.Reset()
            workspace.SetRequiredByteCount(byteCount)
            return VulkanTextProviderResult{
                AbiVersion: VulkanTextProviderAbi.Version,
                Status: VulkanTextProviderAbi.CapacityExceeded,
                Count: 0,
                Required: byteCount,
            }
        }
        workspace.Reset()
        var index int32 = 0
        while index < byteCount {
            workspace.ByteBuffer[index] = uint8((index + int32(glyphId) * 7) & 255)
            index++
        }
        workspace.SetEncoding(byteCount, VulkanTextGlyphExtents{
            XBearing: 50,
            YBearing: 850,
            Width: 750,
            Height: -850,
        }, 1000, 0u)
        return VulkanTextProviderResult{
            AbiVersion: VulkanTextProviderAbi.Version,
            Status: VulkanTextProviderAbi.Success,
            Count: byteCount,
            Required: byteCount,
        }
    }

    public func EncodePaintGlyphInto(glyphId uint32, paletteIndex uint32,
        workspace VulkanTextProviderWorkspace) VulkanTextProviderResult {
        EncodePaintCallCount = EncodePaintCallCount + 1
        if FailGlyphs.Contains(glyphId) {
            return VulkanTextProviderResult{
                AbiVersion: VulkanTextProviderAbi.Version,
                Status: VulkanTextProviderAbi.NativeFailure,
                Count: 0,
                Required: 0,
            }
        }
        let byteCount = if PaintBytesByGlyph.TryGetValue(glyphId, out var configured) {
            configured
        } else {
            64
        }
        if byteCount > workspace.ByteCapacity {
            workspace.Reset()
            workspace.SetRequiredByteCount(byteCount)
            return VulkanTextProviderResult{
                AbiVersion: VulkanTextProviderAbi.Version,
                Status: VulkanTextProviderAbi.CapacityExceeded,
                Count: 0,
                Required: byteCount,
            }
        }
        workspace.Reset()
        var index int32 = 0
        while index < byteCount {
            workspace.ByteBuffer[index] = uint8((index + int32(glyphId) * 13) & 255)
            index++
        }
        workspace.SetEncoding(byteCount, VulkanTextGlyphExtents{
            XBearing: 0,
            YBearing: 900,
            Width: 900,
            Height: -900,
        }, 1000, paletteIndex)
        return VulkanTextProviderResult{
            AbiVersion: VulkanTextProviderAbi.Version,
            Status: VulkanTextProviderAbi.Success,
            Count: byteCount,
            Required: byteCount,
        }
    }

    public func HasColorPaint() bool -> PaintEnabled
    public func HasColorLayers() bool -> false
    public func HasColorBitmaps() bool -> BitmapEnabled
    public func HasColorSvg() bool -> false
    public func GlyphHasColorPaint(glyphId uint32) bool -> PaintEnabled && PaintBytesByGlyph.ContainsKey(glyphId)
    public func GlyphHasColorLayers(glyphId uint32) bool -> false

    public func TryDecodeColorBitmapGlyph(glyphId uint32, ppem int32,
        out width int32, out height int32, out rgba([]uint8)?,
        out extents VulkanTextGlyphExtents, out scale int32) bool {
        LastBitmapPpem = ppem
        width = 0
        height = 0
        rgba = nil
        extents = VulkanTextGlyphExtents{}
        scale = 1000
        if !BitmapEnabled || !BitmapRgbaByGlyph.TryGetValue(glyphId, out var pixels) {
            return false
        }
        let dim = if BitmapSizeByGlyph.TryGetValue(glyphId, out var size) { size } else { 4 }
        width = dim
        height = dim
        rgba = pixels
        extents = VulkanTextGlyphExtents{
            XBearing: 0,
            YBearing: 900,
            Width: 900,
            Height: -900,
        }
        scale = 1000
        return true
    }

    public func TryGetColorSvgGlyph(glyphId uint32, out svgBytes([]uint8)?,
        out extents VulkanTextGlyphExtents, out scale int32) bool {
        svgBytes = nil
        extents = VulkanTextGlyphExtents{}
        scale = 1000
        return false
    }
}

class TextEngineAtlasTests {
    private func BuildSingleRunShape(provider VulkanTextProvider, glyphIds []uint32) ShapedText {
        let count = glyphIds.Length
        let points = [count]TextPoint
        let clusters = [count]uint32
        let textChars = [count]char
        var index int32 = 0
        while index < count {
            points[index] = TextPoint(float32(index) * 24.0F, 0.0F)
            clusters[index] = uint32(index)
            textChars[index] = 'A'
            index++
        }
        let run = ShapedRun(
            String(textChars),
            "TestHybridFamily",
            glyphIds,
            points,
            clusters,
            0,
            false,
            0.0F,
            float32(count) * 24.0F,
            false,
            nil,
            provider
        )
        let runs = List[ShapedRun]()
        runs.Add(run)
        return ShapedText(String(textChars), runs, float32(count) * 24.0F, -20.0F, 6.0F, false)
    }

    @Fact
    func LargeComplexGlyphGrowsWorkspaceAndAtlasWithoutCrashing() {
        using let atlasSet = VulkanTextAtlasSet(262144uL, allowGrowth: true)
        let scene = VulkanTextScene(atlasSet)
        let provider = MockHybridTextProvider()
        provider.DrawBytesByGlyph[10u] = 327680
        provider.RequireGrowthFirstCallGlyphs.Add(10u)
        using let shape = BuildSingleRunShape(provider, []uint32{ 10u })
        let frame = SceneFrame(16)
        scene.BeginCompile(0uL, 1.0F)
        frame.BeginChunk(1uL, 1uL, ConservativeBounds{ X: 0.0F, Y: 0.0F, Width: 200.0F, Height: 64.0F }, true)
        let emitted = scene.EmitShapeForTest(
            frame,
            shape,
            32.0F,
            0.0F,
            32.0F,
            Color.Black,
            1.0F,
            -1,
            0.0F,
            Color.Transparent,
            nil
        )
        frame.EndChunk()
        Assert.True(emitted)
        Assert.Equal(1, frame.CachedTextSegmentCount)
        Assert.True(scene.GlyphWorkspaceByteCapacity >= 327680)
        Assert.True(atlasSet.AtlasCount >= 2)
        Assert.True(atlasSet.AtlasAt(1).ByteSize >= 327680uL)
    }

    @Fact
    func LazyColorEffectOutlinesAndSplitAtlasPagesAvoidCombinedOverflow() {
        using let atlasSet = VulkanTextAtlasSet(8192uL, allowGrowth: true)
        let scene = VulkanTextScene(atlasSet)
        let provider = MockHybridTextProvider()
        provider.PaintEnabled = true
        provider.PaintBytesByGlyph[20u] = 5120
        provider.DrawBytesByGlyph[20u] = 5120
        using let shape = BuildSingleRunShape(provider, []uint32{ 20u })
        let frameFill = SceneFrame(16)
        scene.BeginCompile(0uL, 1.0F)
        frameFill.BeginChunk(1uL, 1uL, ConservativeBounds{ X: 0.0F, Y: 0.0F, Width: 200.0F, Height: 64.0F }, true)
        let emittedFill = scene.EmitShapeForTest(
            frameFill,
            shape,
            32.0F,
            0.0F,
            32.0F,
            Color.White,
            1.0F,
            -1,
            0.0F,
            Color.Transparent,
            nil
        )
        frameFill.EndChunk()
        Assert.True(emittedFill)
        Assert.Equal(1, frameFill.CachedTextSegmentCount)
        Assert.Equal(1, provider.EncodePaintCallCount)
        Assert.Equal(0, provider.EncodeDrawCallCount)
        Assert.Equal(1, atlasSet.AtlasCount)

        let frameStroke = SceneFrame(16)
        scene.BeginCompile(0uL, 1.0F)
        frameStroke.BeginChunk(2uL, 1uL, ConservativeBounds{ X: 0.0F, Y: 0.0F, Width: 200.0F, Height: 64.0F }, true)
        let emittedStroke = scene.EmitShapeForTest(
            frameStroke,
            shape,
            32.0F,
            0.0F,
            32.0F,
            Color.White,
            1.0F,
            -1,
            2.0F,
            Color.Black,
            nil
        )
        frameStroke.EndChunk()
        Assert.True(emittedStroke)
        Assert.Equal(2, frameStroke.CachedTextSegmentCount)
        Assert.Equal(1, provider.EncodeDrawCallCount)
        Assert.Equal(2, atlasSet.AtlasCount)
    }

    @Fact
    func HeavyPaintGlyphThresholdRoutesToColorAtlasOrGrownPageSafely() {
        let provider = MockHybridTextProvider()
        provider.PaintEnabled = true
        provider.BitmapEnabled = true
        provider.PaintBytesByGlyph[25u] = 73728
        provider.DrawBytesByGlyph[25u] = 64
        let bitmapPixels = [4 * 4 * 4]uint8
        var byteIdx int32 = 0
        while byteIdx < bitmapPixels.Length {
            bitmapPixels[byteIdx] = uint8(200)
            bitmapPixels[byteIdx + 1] = uint8(100)
            bitmapPixels[byteIdx + 2] = uint8(50)
            bitmapPixels[byteIdx + 3] = uint8(255)
            byteIdx = byteIdx + 4
        }
        provider.BitmapRgbaByGlyph[25u] = bitmapPixels
        provider.BitmapSizeByGlyph[25u] = 4

        using let atlasSetWithBitmap = VulkanTextAtlasSet(262144uL)
        using let colorAtlas = VulkanColorGlyphAtlas(64u, 64u, 2)
        let sceneWithBitmap = VulkanTextScene(atlasSetWithBitmap, colorAtlas)
        using let shape = BuildSingleRunShape(provider, []uint32{ 25u })
        let frameWithBitmap = SceneFrame(16)
        sceneWithBitmap.BeginCompile(0uL, 1.0F)
        frameWithBitmap.BeginChunk(1uL, 1uL, ConservativeBounds{ X: 0.0F, Y: 0.0F, Width: 100.0F, Height: 64.0F }, true)
        Assert.True(sceneWithBitmap.EmitShapeForTest(
            frameWithBitmap, shape, 32.0F, 0.0F, 32.0F, Color.White, 1.0F, -1, 0.0F, Color.Transparent, nil
        ))
        frameWithBitmap.EndChunk()
        Assert.Equal(1, frameWithBitmap.CachedImageCount)
        Assert.Equal(0, frameWithBitmap.CachedTextSegmentCount)

        provider.BitmapEnabled = false
        using let atlasSetNoBitmap = VulkanTextAtlasSet(8192uL, allowGrowth: true)
        let sceneNoBitmap = VulkanTextScene(atlasSetNoBitmap)
        let frameNoBitmap = SceneFrame(16)
        sceneNoBitmap.BeginCompile(0uL, 1.0F)
        frameNoBitmap.BeginChunk(2uL, 1uL, ConservativeBounds{ X: 0.0F, Y: 0.0F, Width: 100.0F, Height: 64.0F }, true)
        Assert.True(sceneNoBitmap.EmitShapeForTest(
            frameNoBitmap, shape, 32.0F, 0.0F, 32.0F, Color.White, 1.0F, -1, 0.0F, Color.Transparent, nil
        ))
        frameNoBitmap.EndChunk()
        Assert.Equal(1, frameNoBitmap.CachedTextSegmentCount)
        Assert.True(atlasSetNoBitmap.AtlasAt(1).ByteSize >= 73728uL)
    }

    @Fact
    func GlyphEncodingFailuresDegradeGracefullyWithoutThrowing() {
        using let atlasSet = VulkanTextAtlasSet(262144uL)
        let scene = VulkanTextScene(atlasSet)
        let provider = MockHybridTextProvider()
        provider.FailGlyphs.Add(30u)
        provider.MisalignedGlyphs.Add(31u)
        provider.UnboundedCapacityGlyphs.Add(32u)
        provider.DrawBytesByGlyph[0u] = 64
        provider.DrawBytesByGlyph[33u] = 128

        using let notdefShape = BuildSingleRunShape(provider, []uint32{ 30u })
        let frameNotdef = SceneFrame(16)
        scene.BeginCompile(0uL, 1.0F)
        frameNotdef.BeginChunk(1uL, 1uL, ConservativeBounds{ X: 0.0F, Y: 0.0F, Width: 120.0F, Height: 64.0F }, true)
        Assert.True(scene.EmitShapeForTest(
            frameNotdef, notdefShape, 32.0F, 0.0F, 32.0F, Color.Black, 1.0F, -1, 0.0F, Color.Transparent, nil
        ))
        frameNotdef.EndChunk()
        Assert.Equal(1, frameNotdef.CachedTextSegmentCount)
        Assert.Equal(1uL, scene.FallbackGlyphSkipCount)
        Assert.True(scene.ConsumeColorGlyphFallback())

        provider.FailGlyphs.Add(0u)
        using let skipShape = BuildSingleRunShape(provider, []uint32{ 31u, 32u, 33u })
        let frameSkip = SceneFrame(16)
        scene.BeginCompile(0uL, 1.0F)
        frameSkip.BeginChunk(2uL, 1uL, ConservativeBounds{ X: 0.0F, Y: 0.0F, Width: 200.0F, Height: 64.0F }, true)
        Assert.True(scene.EmitShapeForTest(
            frameSkip, skipShape, 32.0F, 0.0F, 32.0F, Color.Black, 1.0F, -1, 0.0F, Color.Transparent, nil
        ))
        frameSkip.EndChunk()
        Assert.Equal(1, frameSkip.CachedTextSegmentCount)
        Assert.Equal(1, frameSkip.CachedTextSegments[0].GlyphCount)
        Assert.Equal(3uL, scene.FallbackGlyphSkipCount)
        Assert.True(scene.ConsumeColorGlyphFallback())
    }

    @Fact
    func ColorAtlasPacksPremultipliedRgbaWithPaddingAndLruEviction() {
        let straight = []uint8{ 200, 100, 50, 128, 255, 0, 255, 0 }
        let premul = VulkanColorGlyphAtlas.PremultiplyRgba(straight, 2, 1)
        Assert.Equal(uint8(100), premul[0])
        Assert.Equal(uint8(50), premul[1])
        Assert.Equal(uint8(25), premul[2])
        Assert.Equal(uint8(128), premul[3])
        Assert.Equal(uint8(0), premul[4])
        Assert.Equal(uint8(0), premul[5])
        Assert.Equal(uint8(0), premul[6])
        Assert.Equal(uint8(0), premul[7])

        let provider = MockHybridTextProvider()
        using let colorAtlas = VulkanColorGlyphAtlas(32u, 32u, 2)
        let tile = [14 * 14 * 4]uint8
        var i int32 = 0
        while i < tile.Length {
            tile[i] = uint8(10)
            tile[i + 1] = uint8(20)
            tile[i + 2] = uint8(30)
            tile[i + 3] = uint8(255)
            i = i + 4
        }
        let extents = VulkanTextGlyphExtents{ XBearing: 0, YBearing: 900, Width: 900, Height: -900 }
        var firstPlacement = VulkanColorGlyphPlacement{}
        var glyphId uint32 = 1u
        while glyphId <= 8u {
            colorAtlas.BeginCompile(0uL)
            Assert.True(colorAtlas.TryAcquireGlyph("Emoji", provider, glyphId, 0,
                14, 14, tile, extents, 1000, out var placed))
            Assert.True(placed.Valid)
            Assert.Equal(0u, colorAtlas.ReadOfflinePixelRgba(placed.PageIndex, placed.ContentX - 1u, placed.ContentY - 1u))
            let innerPixel = colorAtlas.ReadOfflinePixelRgba(placed.PageIndex, placed.ContentX, placed.ContentY)
            Assert.NotEqual(0u, innerPixel)
            Assert.True(placed.SourceX > 0.0F && placed.SourceWidth > 0.0F && placed.SourceX + placed.SourceWidth < 1.0F)
            if glyphId == 1u { firstPlacement = placed }
            colorAtlas.RecordUploads(nint(1))
            colorAtlas.MarkUsed(uint64(glyphId))
            glyphId = glyphId + 1u
        }
        Assert.Equal(2, colorAtlas.ActivePageCount)

        colorAtlas.BeginCompile(8uL)
        Assert.True(colorAtlas.TryAcquireGlyph("Emoji", provider, 9u, 0, 14, 14, tile, extents, 1000, out var evictedPlaced))
        Assert.True(evictedPlaced.Valid)
        Assert.True(colorAtlas.EvictionCount >= 1uL)
        Assert.False(colorAtlas.IsPlacementResident(firstPlacement))
        Assert.Equal(2, colorAtlas.ActivePageCount)

        let oversized = [64 * 64 * 4]uint8
        oversized[0] = uint8(255)
        oversized[3] = uint8(255)
        Assert.True(colorAtlas.TryAcquireGlyph("Emoji", provider, 10u, 0, 64, 64, oversized, extents, 1000, out var resizedPlaced))
        Assert.True(resizedPlaced.ContentWidth <= 30u && resizedPlaced.ContentHeight <= 30u)
    }

    @Fact
    func NotoColorEmojiPngDecodesAndEmitsToColorAtlasWhenAvailable() {
        let emojiPath = "/usr/share/fonts/noto/NotoColorEmoji.ttf"
        if !File.Exists(emojiPath) {
            return
        }
        using let fontData = FontData.FromPath(emojiPath)
        using let font = VulkanTextFont(fontData, 64u, 0u, nil)
        Assert.True(font.HasColorBitmaps())
        let options = VulkanTextShapingOptions{
            Direction: 4u,
            Script: 0x5A797979u,
            Language: "en",
            ClusterLevel: 0u,
            Flags: 0u,
            Features: nil,
        }
        let shapingWorkspace = VulkanTextShapingWorkspace(16)
        let shaped = font.ShapeInto("😀🎉", options, shapingWorkspace)
        Assert.Equal(VulkanTextProviderAbi.Success, shaped.Status)
        Assert.True(shapingWorkspace.GlyphCount >= 2)
        let firstGlyphId = shapingWorkspace.GlyphBuffer[0].GlyphId
        let secondGlyphId = shapingWorkspace.GlyphBuffer[1].GlyphId
        Assert.True(firstGlyphId != 0u && secondGlyphId != 0u)
        Assert.True(font.TryDecodeColorBitmapGlyph(firstGlyphId, 128, out var w, out var h, out var rgba, out var extents, out var scale))
        Assert.True(w > 0 && h > 0 && scale > 0 && rgba != nil)
        Assert.Equal(w * h * 4, rgba.Length)
        Assert.True(extents.Width > 0 && extents.Height < 0)

        using let atlasSet = VulkanTextAtlasSet(262144uL)
        using let colorAtlas = VulkanColorGlyphAtlas(512u, 512u, 4)
        let scene = VulkanTextScene(atlasSet, colorAtlas)
        using let runShape = BuildSingleRunShape(font, []uint32{ firstGlyphId, secondGlyphId })
        let segmentCache = VulkanTextNodeSegmentCache()
        let frame = SceneFrame(16)
        scene.BeginCompile(0uL, 1.0F)
        frame.BeginChunk(1uL, 1uL, ConservativeBounds{ X: 0.0F, Y: 0.0F, Width: 200.0F, Height: 64.0F }, true)
        Assert.True(scene.EmitShapeForTest(
            frame, runShape, 32.0F, 0.0F, 32.0F, Color.White, 1.0F, -1, 0.0F, Color.Transparent, nil, segmentCache
        ))
        frame.EndChunk()
        Assert.True(frame.CachedImageCount >= 2)
        Assert.True(colorAtlas.CachedGlyphCount >= 2)
        Assert.Equal(0uL, scene.FallbackGlyphSkipCount)

        let secondFrame = SceneFrame(16)
        scene.BeginCompile(0uL, 1.0F)
        secondFrame.BeginChunk(2uL, 1uL, ConservativeBounds{ X: 0.0F, Y: 0.0F, Width: 200.0F, Height: 64.0F }, true)
        Assert.True(scene.EmitShapeForTest(
            secondFrame, runShape, 32.0F, 0.0F, 32.0F, Color.White, 1.0F, -1, 0.0F, Color.Transparent, nil, segmentCache
        ))
        secondFrame.EndChunk()
        Assert.True(secondFrame.CachedImageCount >= 2)
    }

    @Fact
    unsafe func TextAtlasQueueUploadMemoryCopyMatchesExpectedBytes() {
        let size int32 = 8192
        let source = [size]uint8
        var i int32 = 0
        while i < size {
            source[i] = uint8((i * 37 + 13) & 255)
            i++
        }
        let stagingA = Marshal.AllocHGlobal(size)
        let stagingB = Marshal.AllocHGlobal(size)
        try {
            Span[uint8](*void(stagingA), size).Clear()
            Span[uint8](*void(stagingB), size).Clear()
            using let atlasA = VulkanTextAtlas(uint64(size), stagingA)
            using let atlasB = VulkanTextAtlas(uint64(size), stagingB)
            fixed srcPtr * uint8 = source {
                Assert.True(atlasA.QueueUpload(srcPtr, 0uL, 64uL))
                Assert.True(atlasB.QueueUpload(srcPtr, 512uL, 4096uL))
            }
            let viewA = *uint8(stagingA)
            let viewB = *uint8(stagingB)
            var check int32 = 0
            while check < size {
                let expectedA = if check < 64 { source[check] } else { uint8(0) }
                let expectedB = if check >= 512 && check < 512 + 4096 { source[check] } else { uint8(0) }
                Assert.Equal(expectedA, viewA[check])
                Assert.Equal(expectedB, viewB[check])
                check++
            }
        } finally {
            Marshal.FreeHGlobal(stagingA)
            Marshal.FreeHGlobal(stagingB)
        }
    }

    @Fact
    func FontLimitAndAtlasSetProgressiveDoublingContract() {
        Assert.Equal(536870912, VulkanTextFont.MaxFontBytes)

        using let growing = VulkanTextAtlasSet(262144uL, allowGrowth: true)
        Assert.Equal(262144uL, growing.AtlasAt(0).ByteSize)
        let page1 = growing.CreateAtlas()
        let page2 = growing.CreateAtlas()
        Assert.Equal(524288uL, growing.AtlasAt(page1).ByteSize)
        Assert.Equal(1048576uL, growing.AtlasAt(page2).ByteSize)
        Assert.Equal(262144uL + 524288uL + 1048576uL, growing.ResidentByteSize)
        Assert.True(growing.TryRetireAtlas(page2, 0uL))
        Assert.Equal(262144uL + 524288uL, growing.ResidentByteSize)

        using let fixedDefault = VulkanTextAtlasSet(1048576uL)
        let fixedPage1 = fixedDefault.CreateAtlas()
        Assert.Equal(1048576uL, fixedDefault.AtlasAt(0).ByteSize)
        Assert.Equal(1048576uL, fixedDefault.AtlasAt(fixedPage1).ByteSize)

        using let smokeFixed = VulkanTextAtlasSet(8192uL, 8192uL, false)
        let smokePage1 = smokeFixed.CreateAtlas()
        let smokePage2 = smokeFixed.CreateAtlas()
        Assert.Equal(8192uL, smokeFixed.AtlasAt(0).ByteSize)
        Assert.Equal(8192uL, smokeFixed.AtlasAt(smokePage1).ByteSize)
        Assert.Equal(8192uL, smokeFixed.AtlasAt(smokePage2).ByteSize)
    }

    @Fact
    func ColorAtlasAbortTouchSliceAndIntegerBitmapPpemContract() {
        using let atlasSet = VulkanTextAtlasSet(262144uL)
        using let colorAtlas = VulkanColorGlyphAtlas(64u, 64u, 2)
        let scene = VulkanTextScene(atlasSet, colorAtlas)
        let provider = MockHybridTextProvider()
        provider.BitmapEnabled = true
        let pixels = [4 * 4 * 4]uint8
        var i int32 = 0
        while i < pixels.Length {
            pixels[i] = uint8(120)
            pixels[i + 1] = uint8(180)
            pixels[i + 2] = uint8(240)
            pixels[i + 3] = uint8(255)
            i = i + 4
        }
        provider.BitmapRgbaByGlyph[42u] = pixels
        provider.BitmapSizeByGlyph[42u] = 4

        using let shape = BuildSingleRunShape(provider, []uint32{ 42u })
        using let sliced = shape.Runs[0].Slice(0, 1)
        Assert.NotNull(sliced)
        Assert.Same(provider, sliced!!.Provider)

        let frame = SceneFrame(16)
        scene.BeginCompile(0uL, 1.0F)
        frame.BeginChunk(1uL, 1uL, ConservativeBounds{ X: 0.0F, Y: 0.0F, Width: 100.0F, Height: 64.0F }, true)
        Assert.True(scene.EmitShapeForTest(
            frame, shape, 14.0F, 0.0F, 14.0F, Color.White, 1.0F, -1, 0.0F, Color.Transparent, nil
        ))
        frame.EndChunk()
        Assert.Equal(14, provider.LastBitmapPpem)
        Assert.Equal(1, colorAtlas.CachedGlyphCount)

        colorAtlas.AbortUploads()
        Assert.Equal(0, colorAtlas.CachedGlyphCount)

        scene.BeginCompile(0uL, 1.0F)
        let frame2 = SceneFrame(16)
        frame2.BeginChunk(2uL, 1uL, ConservativeBounds{ X: 0.0F, Y: 0.0F, Width: 100.0F, Height: 64.0F }, true)
        Assert.True(scene.EmitShapeForTest(
            frame2, shape, 14.0F, 0.0F, 14.0F, Color.White, 1.0F, -1, 0.0F, Color.Transparent, nil
        ))
        frame2.EndChunk()
        let imageId = frame2.CachedImages[0].ImageId

        colorAtlas.BeginCompile(1uL)
        scene.TouchColorAtlasImage(imageId)
        colorAtlas.MarkUsed(7uL)
        Assert.Equal(1, colorAtlas.ActivePageCount)
    }
}
