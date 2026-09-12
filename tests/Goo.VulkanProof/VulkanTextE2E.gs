package Goo.VulkanProof

import System
import System.IO

internal class VulkanTextE2EContract {
  const PixelHeight uint32 = 32u
  const ExpectedUnitsPerEm uint32 = 1000u
  const ExpectedGlyphCount uint32 = 447u
  const ExpectedScale int32 = 1000
  const ExpectedAscender int32 = 1090
  const ExpectedDescender int32 = -390
  const ExpectedLineGap int32 = 0
  const ExpectedRunCount int32 = 9
  const ExpectedRunDigest uint64 = 11802865774309286459uL
  const ExpectedEncodedBytes int32 = 2880
  const ExpectedEncodedDigest uint64 = 3868234327082800552uL
  const ExpectedXBearing int32 = 42
  const ExpectedYBearing int32 = 561
  const ExpectedWidth int32 = 485
  const ExpectedHeight int32 = -576
  const ExpectedCollectionFaceCount uint32 = 2u
  const ExpectedCollectionGlyphCount uint32 = 6u
  const VariationWeight float32 = 700.0F
}

internal func RunVulkanTextE2E() {
  let fontPath = Path.Combine(AppContext.BaseDirectory, "VendSans-VariableFont_wght.ttf")
  if !File.Exists(fontPath) {
    throw FileNotFoundException("VendSans proof font is missing", fontPath)
  }
  var font VulkanTextFont? = nil
  var variationFont VulkanTextFont? = nil
  var collectionFont VulkanTextFont? = nil
  try {
    font = LoadVulkanTextFont(fontPath, VulkanTextE2EContract.PixelHeight)
    let metrics = font.Metrics
    let options = VulkanTextShapingOptions{
      Direction: 4u,
      Script: VulkanTextTag("Latn"),
      Language: "en",
      ClusterLevel: 0u,
      Flags: 0u,
      Features: nil,
    }
    let run = font.Shape("office café", options)
    let utf16Run = font.Shape("AéB", options)
    if utf16Run.Count != 3 || utf16Run.GlyphAt(2).Cluster != 2u {
      throw InvalidOperationException("HarfBuzz UTF-16 cluster contract failed")
    }
    if metrics.UnitsPerEm != VulkanTextE2EContract.ExpectedUnitsPerEm {
      throw InvalidOperationException("HarfBuzz units-per-em contract failed")
    }
    if metrics.GlyphCount != VulkanTextE2EContract.ExpectedGlyphCount {
      throw InvalidOperationException("HarfBuzz glyph count contract failed")
    }
    if metrics.Scale != VulkanTextE2EContract.ExpectedScale {
      throw InvalidOperationException("HarfBuzz scale contract failed")
    }
    if metrics.Ascender != VulkanTextE2EContract.ExpectedAscender
      || metrics.Descender != VulkanTextE2EContract.ExpectedDescender
      || metrics.LineGap != VulkanTextE2EContract.ExpectedLineGap{
        throw InvalidOperationException("HarfBuzz font metrics contract failed")
      }
    if run.Count != VulkanTextE2EContract.ExpectedRunCount {
      throw InvalidOperationException("HarfBuzz glyph count contract failed")
    }
    let runDigest = VulkanTextRunDigest(run)
    if runDigest != VulkanTextE2EContract.ExpectedRunDigest {
      throw InvalidOperationException("HarfBuzz glyph digest contract failed")
    }
    let firstGlyph = run.GlyphAt(0)
    let encoded = font.EncodeGlyph(firstGlyph.GlyphId)
    if encoded.Scale != VulkanTextE2EContract.ExpectedScale {
      throw InvalidOperationException("HarfBuzz encoded scale contract failed")
    }
    if encoded.Bytes.Length != VulkanTextE2EContract.ExpectedEncodedBytes
      || (encoded.Bytes.Length & 7) != 0 {
        throw InvalidOperationException("HarfBuzz encoded glyph blob contract failed")
      }
    if encoded.Extents.XBearing != VulkanTextE2EContract.ExpectedXBearing
      || encoded.Extents.YBearing != VulkanTextE2EContract.ExpectedYBearing
      || encoded.Extents.Width != VulkanTextE2EContract.ExpectedWidth
      || encoded.Extents.Height != VulkanTextE2EContract.ExpectedHeight{
        throw InvalidOperationException("HarfBuzz glyph extents contract failed")
      }
    let encodedDigest = VulkanTextEncodedDigest(encoded.Bytes)
    if encodedDigest != VulkanTextE2EContract.ExpectedEncodedDigest {
      throw InvalidOperationException("HarfBuzz encoded glyph digest contract failed")
    }
    let featureSettings = [1]VulkanTextFeature
    featureSettings[0] = VulkanTextFeature{
      Tag: VulkanTextTag("liga"),
      Value: 0u,
      Start: 0u,
      End: 4294967295u,
    }
    let featureOptions = VulkanTextShapingOptions{
      Direction: 4u,
      Script: VulkanTextTag("Latn"),
      Language: "en",
      ClusterLevel: 0u,
      Flags: 0u,
      Features: featureSettings,
    }
    let featureRun = font.Shape("office", featureOptions)
    if featureRun.Count == 0 || VulkanTextRunDigest(featureRun) == VulkanTextRunDigest(font.Shape("office", options)) {
      throw InvalidOperationException("HarfBuzz feature contract failed")
    }
    let variationSettings = [1]VulkanTextVariation
    variationSettings[0] = VulkanTextVariation{
      Tag: VulkanTextTag("wght"),
      Value: VulkanTextE2EContract.VariationWeight,
    }
    variationFont = LoadVulkanTextFont(
      fontPath,
      VulkanTextE2EContract.PixelHeight,
      0u,
      variationSettings)
    let variationRun = variationFont.Shape("office café", options)
    let variationRunDigest = VulkanTextRunDigest(variationRun)
    let variationEncoded = variationFont.EncodeGlyph(variationRun.GlyphAt(0).GlyphId)
    let variationEncodedDigest = VulkanTextEncodedDigest(variationEncoded.Bytes)
    if variationRunDigest == runDigest {
      throw InvalidOperationException("HarfBuzz variation did not change shaping")
    }
    if variationEncodedDigest == encodedDigest {
      throw InvalidOperationException("HarfBuzz variation did not change encoding")
    }
    let collectionPath = Path.Combine(AppContext.BaseDirectory, "HarfBuzz-TTC.ttc")
    if !File.Exists(collectionPath) {
      throw FileNotFoundException("HarfBuzz collection proof font is missing", collectionPath)
    }
    collectionFont = LoadVulkanTextFont(
      collectionPath,
      VulkanTextE2EContract.PixelHeight,
      1u,
      nil)
    if collectionFont.FaceCount != VulkanTextE2EContract.ExpectedCollectionFaceCount
      || collectionFont.FaceIndex != 1u
      || collectionFont.Metrics.GlyphCount != VulkanTextE2EContract.ExpectedCollectionGlyphCount{
        throw InvalidOperationException("HarfBuzz collection face contract failed")
      }
    var invalidFaceRejected bool = false
    try {
      let invalidFont = LoadVulkanTextFont(
        collectionPath,
        VulkanTextE2EContract.PixelHeight,
        VulkanTextE2EContract.ExpectedCollectionFaceCount,
        nil)
      invalidFont.Dispose()
    } catch (error ArgumentOutOfRangeException) {
      invalidFaceRejected = true
    }
    if !invalidFaceRejected {
      throw InvalidOperationException("HarfBuzz collection face bounds contract failed")
    }
    Console.WriteLine("TEXT_E2E unitsPerEm=" + metrics.UnitsPerEm.ToString()
      +" glyphs=" + metrics.GlyphCount.ToString()
      +" scale=" + metrics.Scale.ToString()
      +" ascender=" + metrics.Ascender.ToString()
      +" descender=" + metrics.Descender.ToString()
      +" lineGap=" + metrics.LineGap.ToString()
      +" runGlyphs=" + run.Count.ToString()
      +" runDigest=" + runDigest.ToString()
      +" encodedBytes=" + encoded.Bytes.Length.ToString()
      +" encodedDigest=" + encodedDigest.ToString()
      +" xBearing=" + encoded.Extents.XBearing.ToString()
      +" yBearing=" + encoded.Extents.YBearing.ToString()
      +" width=" + encoded.Extents.Width.ToString()
      +" height=" + encoded.Extents.Height.ToString()
      +" variationRunDigest=" + variationRunDigest.ToString()
      +" variationEncodedDigest=" + variationEncodedDigest.ToString()
      +" faceCount=" + collectionFont.FaceCount.ToString()
      +" faceIndex=" + collectionFont.FaceIndex.ToString())
  } finally {
    if let value = font {
      value.Dispose()
    }
    if let value = variationFont {
      value.Dispose()
    }
    if let value = collectionFont {
      value.Dispose()
    }
  }
}

internal func VulkanTextRunDigest(run VulkanTextRun) uint64 {
  var hash uint64 = 14695981039346656037uL
  var index int32 = 0
  while index < run.Count {
    let glyph = run.GlyphAt(index)
    hash = (hash ^ uint64(glyph.GlyphId)) * 1099511628211uL
    hash = (hash ^ uint64(glyph.Cluster)) * 1099511628211uL
    hash = (hash ^ uint64(glyph.XAdvance)) * 1099511628211uL
    hash = (hash ^ uint64(glyph.YAdvance)) * 1099511628211uL
    hash = (hash ^ uint64(glyph.XOffset)) * 1099511628211uL
    hash = (hash ^ uint64(glyph.YOffset)) * 1099511628211uL
    index++
  }
  return hash
}

internal func VulkanTextEncodedDigest(bytes []uint8) uint64 {
  var hash uint64 = 14695981039346656037uL
  var index int32 = 0
  while index < bytes.Length {
    hash = (hash ^ uint64(bytes[index])) * 1099511628211uL
    index++
  }
  return hash
}
