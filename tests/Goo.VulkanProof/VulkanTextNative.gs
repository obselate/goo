package Goo.VulkanProof

import Goo
import System
import System.IO

internal data struct VulkanTextGlyphEncoding {
  var Bytes []uint8
  var Extents VulkanTextGlyphExtents
  var Scale int32
}

internal data struct VulkanTextPaintEncoding {
  var Bytes []uint8
  var Extents VulkanTextGlyphExtents
  var Scale int32
  var Palette uint32
}

internal sealed class VulkanTextRun {
  private let glyphs []VulkanTextGlyph

  internal prop Count int32{ get -> glyphs.Length }

  internal init(values []VulkanTextGlyph) {
    glyphs = values
  }

  internal func GlyphAt(index int32) VulkanTextGlyph -> glyphs[index]
}

internal sealed class VulkanTextFont : IDisposable {
  private let inner Goo.VulkanTextFont

  internal prop Metrics VulkanHarfBuzzMetrics{ get -> inner.Metrics }
  internal prop FaceIndex uint32{ get -> inner.FaceIndex }
  internal prop FaceCount uint32{ get -> inner.FaceCount }

  internal init(value Goo.VulkanTextFont) {
    inner = value
  }

  internal func Shape(text string, options VulkanTextShapingOptions) VulkanTextRun {
    var workspace = VulkanTextShapingWorkspace(text.Length)
    var result = inner.ShapeInto(text, options, workspace)
    if result.Status == VulkanTextProviderAbi.CapacityExceeded {
      workspace = VulkanTextShapingWorkspace(result.Required)
      result = inner.ShapeInto(text, options, workspace)
    }
    RequireSuccess(result, "shape")
    let glyphs = [result.Count]VulkanTextGlyph
    Array.Copy(workspace.GlyphBuffer, glyphs, result.Count)
    return VulkanTextRun(glyphs)
  }

  internal func EncodeGlyph(glyphId uint32) VulkanTextGlyphEncoding {
    let workspace = Encode(glyphId, 0u, false)
    return VulkanTextGlyphEncoding{
      Bytes: CopyBytes(workspace),
      Extents: workspace.GlyphExtents,
      Scale: workspace.GlyphScale,
    }
  }

  internal func EncodePaintGlyph(glyphId uint32,
    paletteIndex uint32) VulkanTextPaintEncoding {
      let workspace = Encode(glyphId, paletteIndex, true)
      return VulkanTextPaintEncoding{
        Bytes: CopyBytes(workspace),
        Extents: workspace.GlyphExtents,
        Scale: workspace.GlyphScale,
        Palette: paletteIndex,
      }
    }

  internal func HasColorPaint() bool -> inner.HasColorPaint()

  internal func HasColorLayers() bool -> inner.HasColorLayers()

  internal func GlyphHasColorPaint(glyphId uint32) bool ->
  inner.GlyphHasColorPaint(glyphId)

  internal func GlyphHasColorLayers(glyphId uint32) bool ->
  inner.GlyphHasColorLayers(glyphId)

  public func Dispose() {
    inner.Dispose()
  }

  private func Encode(glyphId uint32, paletteIndex uint32,
    paint bool) VulkanTextProviderWorkspace {
      var workspace = VulkanTextProviderWorkspace([0]uint8)
      var result = EncodeInto(glyphId, paletteIndex, paint, workspace)
      if result.Status == VulkanTextProviderAbi.CapacityExceeded {
        workspace = VulkanTextProviderWorkspace([result.Required]uint8)
        result = EncodeInto(glyphId, paletteIndex, paint, workspace)
      }
      RequireSuccess(result, paint ? "paint" : "glyph")
      return workspace
    }

  private func EncodeInto(glyphId uint32, paletteIndex uint32,
    paint bool, workspace VulkanTextProviderWorkspace) VulkanTextProviderResult ->
  if paint {
    inner.EncodePaintGlyphInto(glyphId, paletteIndex, workspace)
  } else {
    inner.EncodeGlyphInto(glyphId, workspace)
  }

  private func CopyBytes(workspace VulkanTextProviderWorkspace) []uint8 {
    let bytes = [workspace.ByteCount]uint8
    Array.Copy(workspace.ByteBuffer, bytes, bytes.Length)
    return bytes
  }

  private func RequireSuccess(result VulkanTextProviderResult, operation string) {
    if result.Status != VulkanTextProviderAbi.Success {
      throw InvalidOperationException("HarfBuzz " + operation
        + " failed with status " + result.Status.ToString())
    }
  }
}

internal func LoadVulkanTextFont(path string,
  pixelHeight uint32) VulkanTextFont ->
VulkanTextFont(Goo.VulkanTextFont(File.ReadAllBytes(path), pixelHeight, 0u, nil))

internal func LoadVulkanTextFont(path string, pixelHeight uint32,
  faceIndex uint32, variations([]VulkanTextVariation)?) VulkanTextFont ->
VulkanTextFont(Goo.VulkanTextFont(File.ReadAllBytes(path), pixelHeight,
  faceIndex, variations))
