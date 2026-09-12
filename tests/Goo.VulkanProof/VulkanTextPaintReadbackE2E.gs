package Goo.VulkanProof

import System
import System.IO
import Goo

internal class VulkanTextPaintReadbackContract {
  const Width uint32 = 64u
  const Height uint32 = 64u
  const MinBackgroundPixels uint32 = 1000u
  const MinColoredPixelsPerGlyph uint32 = 64u
}

internal data struct VulkanTextPaintReadbackResult {
  var Digest uint64
  var InkPixels uint32
  var BackgroundPixels uint32
  var OpaquePixels uint32
  var ColoredPixels uint32
  var LeftColoredPixels uint32
  var RightColoredPixels uint32
}

internal unsafe sealed class VulkanTextPaintReadbackFixture : IDisposable {
  private var firstFont VulkanTextFont? = nil
  private var secondFont VulkanTextFont? = nil
  private let atlasId ResourceId
  private let atlasGeneration uint64
  private var frame SceneFrame? = nil
  private var firstEncoding VulkanTextPaintEncoding
  private var secondEncoding VulkanTextPaintEncoding
  private var disposed bool

  internal prop Frame SceneFrame{ get -> frame!! }

  internal init(
    nativeAtlas VulkanTextAtlas,
    nativeAtlasId ResourceId,
    nativeAtlasGeneration uint64) {
      atlasId = nativeAtlasId
      atlasGeneration = nativeAtlasGeneration
      try {
        let firstPath = Path.Combine(AppContext.BaseDirectory, "HarfBuzz-chromacheck-colr.ttf")
        let secondPath = Path.Combine(AppContext.BaseDirectory, "HarfBuzz-adwaita-colrv1.ttf")
        if !File.Exists(firstPath) {
          throw FileNotFoundException("HarfBuzz COLRv0 proof font is missing", firstPath)
        }
        if !File.Exists(secondPath) {
          throw FileNotFoundException("HarfBuzz COLRv1 proof font is missing", secondPath)
        }
        firstFont = LoadVulkanTextFont(firstPath, 16u)
        secondFont = LoadVulkanTextFont(secondPath, 16u)
        let firstGlyphId = 1u
        let secondGlyphId = 2u
        if !firstFont!!.HasColorLayers()
          || firstFont!!.HasColorPaint()
          || !secondFont!!.HasColorPaint()
          || secondFont!!.HasColorLayers()
          || !secondFont!!.GlyphHasColorPaint(secondGlyphId) {
            throw InvalidOperationException("HarfBuzz COLR paint fixtures do not match the Vulkan proof contract")
          }
        firstEncoding = firstFont!!.EncodePaintGlyph(firstGlyphId, 0u)
        secondEncoding = secondFont!!.EncodePaintGlyph(secondGlyphId, 0u)
        if firstEncoding.Bytes.Length == 0 || secondEncoding.Bytes.Length == 0
          || (firstEncoding.Bytes.Length & 7) != 0
          || (secondEncoding.Bytes.Length & 7) != 0 {
            throw InvalidOperationException("HarfBuzz COLR paint blobs are not texel aligned")
          }
        let firstTexelCount = firstEncoding.Bytes.Length / 8
        let totalBytes = firstEncoding.Bytes.Length + secondEncoding.Bytes.Length
        let combined = [totalBytes]uint8
        var index int32 = 0
        while index < firstEncoding.Bytes.Length {
          combined[index] = firstEncoding.Bytes[index]
          index++
        }
        index = 0
        while index < secondEncoding.Bytes.Length {
          combined[firstEncoding.Bytes.Length + index] = secondEncoding.Bytes[index]
          index++
        }
        QueueVulkanTextPaintAtlasUpload(nativeAtlas, combined)
        frame = SceneFrame(2)
        frame!!.ResetForReuse()
        BuildFrame(frame!!, uint32(firstTexelCount))
      } catch (error Exception) {
        Dispose()
        throw error
      }
    }

  public func Dispose() {
    if disposed {
      return
    }
    var firstError Exception? = nil
    if firstFont != nil {
      try {
        firstFont!!.Dispose()
        firstFont = nil
      } catch (error Exception) {
        if firstError == nil {
          firstError = error
        }
      }
    }
    if secondFont != nil {
      try {
        secondFont!!.Dispose()
        secondFont = nil
      } catch (error Exception) {
        if firstError == nil {
          firstError = error
        }
      }
    }
    frame = nil
    if firstError != nil {
      throw firstError
    }
    disposed = true
  }

  deinit{
    try {
      Dispose()
    } catch (error Exception) {
    }
  }

  private func BuildFrame(target SceneFrame, secondAtlasTexelOffset uint32) {
    let firstBounds = PaintBounds(firstEncoding.Extents)
    let secondBounds = PaintBounds(secondEncoding.Extents)
    target.BeginChunk(0x544558545041494EuL, 1uL,
      ConservativeBounds{ X: 0.0F, Y: -250.0F, Width: 1300.0F, Height: 1250.0F }, true)
    let firstTransform = TransformRecord{
      A: 0.025F,
      B: 0.0F,
      C: 0.0F,
      D: -0.025F,
      TX: 4.0F,
      TY: 54.0F,
      ParentIndex: -1,
    }
    let secondTransform = TransformRecord{
      A: 0.025F,
      B: 0.0F,
      C: 0.0F,
      D: -0.025F,
      TX: 29.0F,
      TY: 54.0F,
      ParentIndex: -1,
    }
    AppendVulkanProofGlyph(target, 9701uL, atlasId, atlasGeneration,
      firstTransform, firstBounds.X, firstBounds.Y,
      firstBounds.X + firstBounds.Width, firstBounds.Y + firstBounds.Height,
      0u, uint32(firstEncoding.Bytes.Length / 8), 0xFFFFFFFFu, 3u, 0u, 0.0F)
    AppendVulkanProofGlyph(target, 9702uL, atlasId, atlasGeneration,
      secondTransform, secondBounds.X, secondBounds.Y,
      secondBounds.X + secondBounds.Width, secondBounds.Y + secondBounds.Height,
      secondAtlasTexelOffset, uint32(secondEncoding.Bytes.Length / 8),
      0xFFFFFFFFu, 3u, 0u, 0.0F)
    target.EndChunk()
  }

  private func PaintBounds(extents VulkanTextGlyphExtents) ConservativeBounds {
    let minX = float32(extents.XBearing)
    let minY = float32(extents.YBearing + extents.Height)
    let maxX = float32(extents.XBearing + extents.Width)
    let maxY = float32(extents.YBearing)
    return ConservativeBounds{
      X: minX,
      Y: minY,
      Width: maxX - minX,
      Height: maxY - minY,
    }
  }
}

internal unsafe func QueueVulkanTextPaintAtlasUpload(atlas VulkanTextAtlas, bytes []uint8) {
  fixed source * uint8 = bytes{
    if !atlas.QueueUpload(source, 0uL, VkDeviceSize(bytes.Length)) {
      throw InvalidOperationException("Vulkan COLR paint atlas upload did not queue")
    }
  }
}

internal unsafe func AnalyzeVulkanTextPaintReadback(
  readback * uint8,
  width uint32,
  height uint32) VulkanTextPaintReadbackResult{
    if readback == nil || width < VulkanTextPaintReadbackContract.Width
      || height < VulkanTextPaintReadbackContract.Height{
        throw ArgumentException("invalid Vulkan COLR paint readback")
      }
    var hash uint64 = 14695981039346656037uL
    var inkPixels uint32 = 0u
    var backgroundPixels uint32 = 0u
    var opaquePixels uint32 = 0u
    var coloredPixels uint32 = 0u
    var leftColoredPixels uint32 = 0u
    var rightColoredPixels uint32 = 0u
    var y uint32 = 0u
    while y < VulkanTextPaintReadbackContract.Height {
      var x uint32 = 0u
      while x < VulkanTextPaintReadbackContract.Width {
        let offset = uint64(y) * uint64(width) * 4uL + uint64(x) * 4uL
        let red = readback[offset]
        let green = readback[offset + 1uL]
        let blue = readback[offset + 2uL]
        let alpha = readback[offset + 3uL]
        hash = (hash ^ uint64(red)) * 1099511628211uL
        hash = (hash ^ uint64(green)) * 1099511628211uL
        hash = (hash ^ uint64(blue)) * 1099511628211uL
        hash = (hash ^ uint64(alpha)) * 1099511628211uL
        if alpha == 255u {
          opaquePixels++
        }
        let isBackground = red == 0u && green == 0u && blue == 0u && alpha == 255u
        if isBackground {
          backgroundPixels++
        } else if red != 0u || green != 0u || blue != 0u {
          inkPixels++
          if red != green || green != blue {
            coloredPixels++
            if x < 32u {
              leftColoredPixels++
            } else {
              rightColoredPixels++
            }
          }
        }
        x++
      }
      y++
    }
    return VulkanTextPaintReadbackResult{
      Digest: hash,
      InkPixels: inkPixels,
      BackgroundPixels: backgroundPixels,
      OpaquePixels: opaquePixels,
      ColoredPixels: coloredPixels,
      LeftColoredPixels: leftColoredPixels,
      RightColoredPixels: rightColoredPixels,
    }
  }

internal unsafe func VerifyVulkanTextPaintReadback(
  readback * uint8,
  width uint32,
  height uint32,
  result VulkanTextPaintReadbackResult) bool{
    if readback == nil || width < VulkanTextPaintReadbackContract.Width
      || height < VulkanTextPaintReadbackContract.Height{
        return false
      }
    let totalPixels = VulkanTextPaintReadbackContract.Width * VulkanTextPaintReadbackContract.Height
    if result.OpaquePixels != totalPixels
      || result.BackgroundPixels < VulkanTextPaintReadbackContract.MinBackgroundPixels
      || result.InkPixels == 0u
      || result.ColoredPixels < VulkanTextPaintReadbackContract.MinColoredPixelsPerGlyph
      || result.LeftColoredPixels < VulkanTextPaintReadbackContract.MinColoredPixelsPerGlyph
      || result.RightColoredPixels < VulkanTextPaintReadbackContract.MinColoredPixelsPerGlyph{
        return false
      }
    return result.BackgroundPixels + result.InkPixels == totalPixels
  }

internal unsafe func RunProductionTextPaintReadback() {
  let window = OpenVulkanProductionProofWindow()
  var fixture VulkanTextPaintReadbackFixture? = nil
  var capture VulkanProductionReadbackCapture? = nil
  try {
    guard let atlases = VulkanProductionReadbackFixture.TextAtlases(window) else {
      throw InvalidOperationException("Vulkan production text atlases are unavailable")
    }
    let atlasIndex = atlases.CurrentAtlasIndex
    let atlas = atlases.AtlasAt(atlasIndex)
    let activeFixture = VulkanTextPaintReadbackFixture(
      atlas, atlases.IdentityAt(atlasIndex), atlases.Generation)
    fixture = activeFixture
    PublishVulkanProofTextAtlasUpload(window, atlases, atlas)
    let activeCapture = VulkanProductionReadbackFixture.Open(window,
      VulkanTextPaintReadbackContract.Width, VulkanTextPaintReadbackContract.Height)
    capture = activeCapture
    var clearColor = VkClearColorValue{}
    clearColor.float32.values[3] = 1.0F
    let warmSubmit = activeCapture.Request(activeFixture.Frame, clearColor)
    if warmSubmit != VkConstants.VK_SUCCESS {
      throw InvalidOperationException("Vulkan production text paint warm submission failed: "
        +warmSubmit.ToString())
    }
    AwaitVulkanProductionReadback(activeCapture)
    let result = RequestVulkanProductionReadback(activeCapture, activeFixture.Frame, clearColor)
    fixed readback * uint8 = result.Pixels{
      let analyzed = AnalyzeVulkanTextPaintReadback(readback, result.Width, result.Height)
      Console.WriteLine("Text paint readback: digest=${analyzed.Digest} ink=${analyzed.InkPixels} background=${analyzed.BackgroundPixels} colored=${analyzed.ColoredPixels} leftColored=${analyzed.LeftColoredPixels} rightColored=${analyzed.RightColoredPixels} opaque=${analyzed.OpaquePixels} allocated=${activeCapture.LastRequestAllocatedBytes}")
      if !VerifyVulkanTextPaintReadback(readback, result.Width, result.Height, analyzed) {
        throw InvalidOperationException("Vulkan text paint readback pixels are invalid")
      }
    }
  } finally {
    if let active = capture {
      active.Dispose()
    }
    if let active = fixture {
      active.Dispose()
    }
    CloseVulkanProductionProofWindow(window)
  }
}
