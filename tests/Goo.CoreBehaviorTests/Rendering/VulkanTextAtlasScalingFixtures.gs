package Goo

import System

internal sealed class FakeOversizedGlyphProvider : VulkanTextProvider {
  private let hasColor bool
  private let paintBytes int32
  private let outlineBytes int32

  internal init(hasColor bool, paintBytes int32, outlineBytes int32) {
    this.hasColor = hasColor
    this.paintBytes = paintBytes
    this.outlineBytes = outlineBytes
  }

  public prop AbiVersion uint32 { get -> VulkanTextProviderAbi.Version }
  public prop Metrics VulkanHarfBuzzMetrics {
    get -> VulkanHarfBuzzMetrics{ UnitsPerEm: 1000u, GlyphCount: 16u, Scale: 1000, Ascender: 800, Descender: -200 }
  }
  public prop OutlineHintingAvailable bool { get -> !hasColor }

  public func ShapeInto(text string, options VulkanTextShapingOptions,
    workspace VulkanTextShapingWorkspace) VulkanTextProviderResult ->
    VulkanTextProviderResult{ AbiVersion: VulkanTextProviderAbi.Version, Status: VulkanTextProviderAbi.Success, Count: 0, Required: 0 }

  public func EncodeGlyphInto(glyphId uint32,
    workspace VulkanTextProviderWorkspace, ppem int32) VulkanTextProviderResult ->
    EncodePayload(outlineBytes, 0u, workspace)

  public func EncodePaintGlyphInto(glyphId uint32, paletteIndex uint32,
    workspace VulkanTextProviderWorkspace) VulkanTextProviderResult ->
    EncodePayload(paintBytes, paletteIndex, workspace)

  public func HasColorPaint() bool -> hasColor
  public func HasColorLayers() bool -> false
  public func GlyphHasColorPaint(glyphId uint32) bool -> hasColor
  public func GlyphHasColorLayers(glyphId uint32) bool -> false

  private func EncodePayload(byteCount int32, palette uint32, workspace VulkanTextProviderWorkspace) VulkanTextProviderResult {
    if byteCount > workspace.ByteCapacity {
      workspace.SetRequiredByteCount(byteCount)
      return VulkanTextProviderResult{
        AbiVersion: VulkanTextProviderAbi.Version,
        Status: VulkanTextProviderAbi.CapacityExceeded,
        Count: 0,
        Required: byteCount,
      }
    }
    var index int32 = 0
    while index < byteCount {
      workspace.ByteBuffer[index] = uint8((index + 1) & 0xFF)
      index++
    }
    workspace.SetEncoding(
      byteCount,
      VulkanTextGlyphExtents{ XBearing: 0, YBearing: 900, Width: 900, Height: -900 },
      1000,
      palette)
    return VulkanTextProviderResult{
      AbiVersion: VulkanTextProviderAbi.Version,
      Status: VulkanTextProviderAbi.Success,
      Count: byteCount,
      Required: byteCount,
    }
  }
}

public sealed class VulkanTextAtlasScalingFixtures {
  public func OversizedColorGlyphGrowsWorkspaceAndAtlasPage() bool {
    using let atlases = VulkanTextAtlasSet(8192uL)
    let scene = VulkanTextScene(atlases)
    let provider = FakeOversizedGlyphProvider(true, 24576, 12288)
    guard let glyph = scene.AcquireGlyph("Emoji", provider, 42u, 0) else { return false }
    if glyph.RenderMode != 3u || glyph.ByteLength != 24576u || glyph.EffectByteLength != 12288u {
      return false
    }
    if atlases.AtlasCount != 2 { return false }
    let oversized = atlases.AtlasAt(1)
    if oversized.ByteSize < 36864uL || (oversized.ByteSize % 8uL) != 0uL { return false }
    return atlases.ResidentByteSize == atlases.AtlasAt(0).ByteSize + oversized.ByteSize
  }

  public func OversizedOutlineGlyphGrowsWorkspaceAndAtlasPage() bool {
    using let atlases = VulkanTextAtlasSet(8192uL)
    let scene = VulkanTextScene(atlases)
    let provider = FakeOversizedGlyphProvider(false, 0, 20480)
    guard let glyph = scene.AcquireGlyph("Icons", provider, 7u, 0) else { return false }
    if glyph.RenderMode != 2u || glyph.ByteLength != 20480u { return false }
    if atlases.AtlasCount != 2 { return false }
    let oversized = atlases.AtlasAt(1)
    if oversized.ByteSize < 20480uL || (oversized.ByteSize % 8uL) != 0uL { return false }
    return atlases.ResidentByteSize == atlases.AtlasAt(0).ByteSize + oversized.ByteSize
  }

  public func RetireAndRecycleOversizedAtlasPagesKeepResidentBytesAccurate() bool {
    using let atlases = VulkanTextAtlasSet(8192uL)
    let scene = VulkanTextScene(atlases)
    let largeProvider = FakeOversizedGlyphProvider(true, 20480, 12288)
    guard let largeGlyph = scene.AcquireGlyph("Emoji", largeProvider, 1u, 0) else { return false }
    if largeGlyph.ByteLength != 20480u || atlases.AtlasCount != 2 { return false }
    let oversizedPageBytes = atlases.AtlasAt(1).ByteSize
    if oversizedPageBytes < 32768uL { return false }

    // Fill the remaining capacity of the oversized page or create a normal page for small glyphs.
    let smallProvider = FakeOversizedGlyphProvider(false, 0, 4096)
    var glyphId uint32 = 10u
    while atlases.AtlasCount == 2 && glyphId < 40u {
      if scene.AcquireGlyph("Text", smallProvider, glyphId, 0) == nil { return false }
      glyphId++
    }
    if atlases.AtlasCount != 3 { return false }
    let thirdPageBytes = atlases.AtlasAt(2).ByteSize
    if thirdPageBytes != 8192uL { return false }
    if atlases.ResidentByteSize != 8192uL + oversizedPageBytes + thirdPageBytes { return false }

    // Recycle page 1 (oversized -> normal) and check ResidentByteSize.
    let _ = atlases.RecycleAtlas(1, 0uL, 0uL)
    if atlases.AtlasAt(1).ByteSize != 8192uL { return false }
    if atlases.ResidentByteSize != 8192uL + 8192uL + thirdPageBytes { return false }

    // Recycle page 0 (normal -> oversized) and check ResidentByteSize.
    let _ = atlases.RecycleAtlas(0, 0uL, 24576uL)
    let recycledOversized = atlases.AtlasAt(0).ByteSize
    if recycledOversized < 24576uL { return false }
    if atlases.ResidentByteSize != recycledOversized + 8192uL + thirdPageBytes { return false }

    // Retire page 1 and verify final ResidentByteSize.
    if !atlases.TryRetireAtlas(1, 0uL) { return false }
    return atlases.ResidentByteSize == recycledOversized + thirdPageBytes
  }

  public func GlyphExceedingMaxWorkspaceCapacityStillThrows() bool {
    using let atlases = VulkanTextAtlasSet(8192uL)
    let scene = VulkanTextScene(atlases)
    let hugeProvider = FakeOversizedGlyphProvider(true, VulkanTextProviderWorkspace.MaxByteCapacity + 8, 1024)
    try {
      let _ = scene.AcquireGlyph("Huge", hugeProvider, 99u, 0)
      return false
    } catch (error InvalidOperationException) {
      return error.Message == "Vulkan text color glyph exceeds workspace capacity"
    }
  }
}
