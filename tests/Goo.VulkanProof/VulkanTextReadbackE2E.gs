package Goo.VulkanProof

import System
import System.IO
import Goo

internal class VulkanTextReadbackContract {
  const Width uint32 = 64u
  const Height uint32 = 64u
  const PixelHeight uint32 = 32u
  const MinInkPixels uint32 = 350u
  const MaxInkPixels uint32 = 650u
  const MinInkX uint32 = 9u
  const MaxInkX uint32 = 13u
  const MinInkY uint32 = 12u
  const MaxInkY uint32 = 17u
  const MinInkRight uint32 = 41u
  const MaxInkRight uint32 = 47u
  const MinInkBottom uint32 = 53u
  const MaxInkBottom uint32 = 58u
}

internal data struct VulkanTextReadbackResult {
  var Digest uint64
  var InkPixels uint32
  var BackgroundPixels uint32
  var OpaquePixels uint32
  var NonGrayPixels uint32
  var RedDominantPixels uint32
  var GreenDominantPixels uint32
  var GrayInkPixels uint32
  var MinInkX uint32
  var MinInkY uint32
  var MaxInkX uint32
  var MaxInkY uint32
}

internal unsafe sealed class VulkanTextReadbackFixture : IDisposable {
  private var font VulkanTextFont? = nil
  private let atlasId ResourceId
  private let atlasGeneration uint64
  private var frame SceneFrame? = nil
  private var encoding VulkanTextGlyphEncoding
  private var disposed bool

  internal prop Frame SceneFrame{ get -> frame!! }

  internal init(
    nativeAtlas VulkanTextAtlas,
    nativeAtlasId ResourceId,
    nativeAtlasGeneration uint64,
    effects bool) {
      atlasId = nativeAtlasId
      atlasGeneration = nativeAtlasGeneration
      try {
        let fontPath = Path.Combine(AppContext.BaseDirectory, "VendSans-VariableFont_wght.ttf")
        if !File.Exists(fontPath) {
          throw FileNotFoundException("VendSans proof font is missing", fontPath)
        }
        font = LoadVulkanTextFont(fontPath, VulkanTextReadbackContract.PixelHeight)
        let options = VulkanTextShapingOptions{
          Direction: 4u,
          Script: VulkanTextTag("Latn"),
          Language: "en",
          ClusterLevel: 0u,
          Flags: 0u,
          Features: nil,
        }
        let run = font!!.Shape("A", options)
        if run.Count != 1 {
          throw InvalidOperationException("Vulkan text readback shaping did not produce one glyph")
        }
        let glyph = run.GlyphAt(0)
        if glyph.GlyphId == 0u {
          throw InvalidOperationException("Vulkan text readback shaped a missing glyph")
        }
        encoding = font!!.EncodeGlyph(glyph.GlyphId)
        if encoding.Bytes.Length == 0 || (encoding.Bytes.Length & 7) != 0 {
          throw InvalidOperationException("Vulkan text readback glyph blob is not 8-byte aligned")
        }
        QueueVulkanTextAtlasUpload(nativeAtlas, encoding.Bytes)
        frame = SceneFrame(1)
        frame!!.ResetForReuse()
        BuildFrame(frame!!, effects)
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
    if font != nil {
      try {
        font!!.Dispose()
        font = nil
      } catch (error Exception) {
        firstError = error
      }
    }
    frame = nil
    if firstError != nil {
      throw firstError!!
    }
    disposed = true
  }

  deinit{
    try {
      Dispose()
    } catch (error Exception) {
    }
  }

  private func BuildFrame(target SceneFrame, effects bool) {
    let extents = encoding.Extents
    let minX = float32(extents.XBearing)
    let minY = float32(extents.YBearing + extents.Height)
    let maxX = float32(extents.XBearing + extents.Width)
    let maxY = float32(extents.YBearing)
    let bounds = ConservativeBounds{
      X: minX,
      Y: minY,
      Width: maxX - minX,
      Height: maxY - minY,
    }
    let chunkBounds = if effects { ConservativeBounds{
      X: 0.0F, Y: 0.0F, Width: 64.0F, Height: 64.0F,
    } } else { bounds }
    target.BeginChunk(0x5445585452454144uL, 1uL, chunkBounds, true)
    let transform = TransformRecord{
      A: 0.06F,
      B: 0.0F,
      C: 0.0F,
      D: -0.06F,
      TX: 8.0F,
      TY: 56.0F,
      ParentIndex: -1,
    }
    if effects {
      let shadowTransform = TransformRecord{
        A: 0.06F,
        B: 0.0F,
        C: 0.0F,
        D: -0.06F,
        TX: 11.0F,
        TY: 58.0F,
        ParentIndex: -1,
      }
      let strokeRadius = 2.0F / 0.06F * 0.5F
      AppendVulkanProofGlyph(target, 9603uL, atlasId, atlasGeneration,
        shadowTransform, minX, minY, maxX, maxY, 0u,
        uint32(encoding.Bytes.Length / 8), 0x00FF00FFu, 2u, 1u, 0.0F)
      AppendVulkanProofGlyph(target, 9604uL, atlasId, atlasGeneration,
        transform, minX - strokeRadius, minY - strokeRadius,
        maxX + strokeRadius, maxY + strokeRadius, 0u,
        uint32(encoding.Bytes.Length / 8), 0xFF0000FFu, 2u, 2u, strokeRadius)
    }
    AppendVulkanProofGlyph(target, 9605uL, atlasId, atlasGeneration,
      transform, minX, minY, maxX, maxY, 0u,
      uint32(encoding.Bytes.Length / 8), 0xFFFFFFFFu, 2u, 0u, 0.0F)
    target.EndChunk()
  }
}

internal unsafe func QueueVulkanTextAtlasUpload(atlas VulkanTextAtlas, bytes []uint8) {
  fixed source * uint8 = bytes{
    if !atlas.QueueUpload(source, 0uL, VkDeviceSize(bytes.Length)) {
      throw InvalidOperationException("Vulkan text readback glyph upload did not queue")
    }
  }
}

internal unsafe func AnalyzeVulkanTextReadback(
  readback * uint8,
  width uint32,
  height uint32) VulkanTextReadbackResult{
    if readback == nil || width < VulkanTextReadbackContract.Width
      || height < VulkanTextReadbackContract.Height{
        throw ArgumentException("invalid Vulkan text readback")
      }
    var hash uint64 = 14695981039346656037uL
    var inkPixels uint32 = 0u
    var backgroundPixels uint32 = 0u
    var opaquePixels uint32 = 0u
    var nonGrayPixels uint32 = 0u
    var redDominantPixels uint32 = 0u
    var greenDominantPixels uint32 = 0u
    var grayInkPixels uint32 = 0u
    var minInkX uint32 = width
    var minInkY uint32 = height
    var maxInkX uint32 = 0u
    var maxInkY uint32 = 0u
    var y uint32 = 0u
    while y < VulkanTextReadbackContract.Height {
      var x uint32 = 0u
      while x < VulkanTextReadbackContract.Width {
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
        if red != green || green != blue {
          nonGrayPixels++
        }
        if red > green && red > blue {
          redDominantPixels++
        } else if green > red && green > blue {
          greenDominantPixels++
        } else if red == green && green == blue && red != 0u {
          grayInkPixels++
        }
        if red == 0u && green == 0u && blue == 0u && alpha == 255u {
          backgroundPixels++
        }
        if red != 0u || green != 0u || blue != 0u {
          inkPixels++
          if x < minInkX { minInkX = x }
          if y < minInkY { minInkY = y }
          if x > maxInkX { maxInkX = x }
          if y > maxInkY { maxInkY = y }
        }
        x++
      }
      y++
    }
    return VulkanTextReadbackResult{
      Digest: hash,
      InkPixels: inkPixels,
      BackgroundPixels: backgroundPixels,
      OpaquePixels: opaquePixels,
      NonGrayPixels: nonGrayPixels,
      RedDominantPixels: redDominantPixels,
      GreenDominantPixels: greenDominantPixels,
      GrayInkPixels: grayInkPixels,
      MinInkX: minInkX,
      MinInkY: minInkY,
      MaxInkX: maxInkX,
      MaxInkY: maxInkY,
    }
  }

internal unsafe func VerifyVulkanTextReadback(
  readback * uint8,
  width uint32,
  height uint32,
  result VulkanTextReadbackResult) bool{
    if readback == nil || width < VulkanTextReadbackContract.Width
      || height < VulkanTextReadbackContract.Height{
        return false
      }
    let totalPixels = VulkanTextReadbackContract.Width * VulkanTextReadbackContract.Height
    if result.InkPixels < VulkanTextReadbackContract.MinInkPixels
      || result.InkPixels > VulkanTextReadbackContract.MaxInkPixels
      || result.BackgroundPixels == 0u
      || result.BackgroundPixels + result.InkPixels != totalPixels
      || result.OpaquePixels != totalPixels
      || result.NonGrayPixels != 0u {
        return false
      }
    if result.MinInkX < VulkanTextReadbackContract.MinInkX
      || result.MinInkX > VulkanTextReadbackContract.MaxInkX
      || result.MinInkY < VulkanTextReadbackContract.MinInkY
      || result.MinInkY > VulkanTextReadbackContract.MaxInkY
      || result.MaxInkX < VulkanTextReadbackContract.MinInkRight
      || result.MaxInkX > VulkanTextReadbackContract.MaxInkRight
      || result.MaxInkY < VulkanTextReadbackContract.MinInkBottom
      || result.MaxInkY > VulkanTextReadbackContract.MaxInkBottom{
        return false
      }
    return true
  }

internal func VerifyVulkanTextEffectReadback(result VulkanTextReadbackResult) bool {
  if result.InkPixels <= VulkanTextReadbackContract.MinInkPixels
    || result.NonGrayPixels == 0u
    || result.RedDominantPixels == 0u
    || result.GreenDominantPixels == 0u
    || result.GrayInkPixels == 0u
    || result.MinInkX > 8u
    || result.MaxInkX < 46u
    || result.MinInkY > 13u
    || result.MaxInkY < 57u {
      return false
    }
  return result.BackgroundPixels != 0u
    && result.OpaquePixels == VulkanTextReadbackContract.Width * VulkanTextReadbackContract.Height
}

internal unsafe func RunProductionTextReadback(effects bool) {
  let window = OpenVulkanProductionProofWindow()
  var fixture VulkanTextReadbackFixture? = nil
  var capture VulkanProductionReadbackCapture? = nil
  try {
    guard let atlases = VulkanProductionReadbackFixture.TextAtlases(window) else {
      throw InvalidOperationException("Vulkan production text atlases are unavailable")
    }
    let atlasIndex = atlases.CurrentAtlasIndex
    let atlas = atlases.AtlasAt(atlasIndex)
    let activeFixture = VulkanTextReadbackFixture(
      atlas, atlases.IdentityAt(atlasIndex), atlases.Generation, effects)
    fixture = activeFixture
    PublishVulkanProofTextAtlasUpload(window, atlases, atlas)
    let activeCapture = VulkanProductionReadbackFixture.Open(window,
      VulkanTextReadbackContract.Width, VulkanTextReadbackContract.Height)
    capture = activeCapture
    var clearColor = VkClearColorValue{}
    clearColor.float32.values[3] = 1.0F
    let warmSubmit = activeCapture.Request(activeFixture.Frame, clearColor)
    if warmSubmit != VkConstants.VK_SUCCESS {
      throw InvalidOperationException("Vulkan production text warm submission failed: "
        +warmSubmit.ToString())
    }
    AwaitVulkanProductionReadback(activeCapture)
    let result = RequestVulkanProductionReadback(activeCapture, activeFixture.Frame, clearColor)
    fixed readback * uint8 = result.Pixels{
      let analyzed = AnalyzeVulkanTextReadback(readback, result.Width, result.Height)
      if effects {
        Console.WriteLine("Text effect readback: digest=${analyzed.Digest} ink=${analyzed.InkPixels} background=${analyzed.BackgroundPixels} bounds=${analyzed.MinInkX},${analyzed.MinInkY}-${analyzed.MaxInkX},${analyzed.MaxInkY} opaque=${analyzed.OpaquePixels} nongray=${analyzed.NonGrayPixels} red=${analyzed.RedDominantPixels} green=${analyzed.GreenDominantPixels} gray=${analyzed.GrayInkPixels} allocated=${activeCapture.LastRequestAllocatedBytes}")
        if !VerifyVulkanTextEffectReadback(analyzed) {
          throw InvalidOperationException("Vulkan text effect readback pixels are invalid")
        }
      } else {
        Console.WriteLine("Text readback: digest=${analyzed.Digest} ink=${analyzed.InkPixels} background=${analyzed.BackgroundPixels} bounds=${analyzed.MinInkX},${analyzed.MinInkY}-${analyzed.MaxInkX},${analyzed.MaxInkY} opaque=${analyzed.OpaquePixels} nongray=${analyzed.NonGrayPixels} allocated=${activeCapture.LastRequestAllocatedBytes}")
        if !VerifyVulkanTextReadback(readback, result.Width, result.Height, analyzed) {
          throw InvalidOperationException("Vulkan text readback ink or background pixels are invalid")
        }
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

internal func PublishVulkanProofTextAtlasUpload(
  window Window,
  atlases VulkanTextAtlasSet,
  atlas VulkanTextAtlas) {
    let acceptedBefore = VulkanProductionReadbackFixture.AcceptedSubmissionSerial(window)
    WindowReadbackTestFixture.ForceRender(window, 0.0)
    WindowReadbackTestFixture.DrainWindowQueue(window, 2000)
    let accepted = VulkanProductionReadbackFixture.AcceptedSubmissionSerial(window)
    if accepted <= acceptedBefore {
      throw InvalidOperationException("Vulkan production text atlas upload was not submitted")
    }
    let completed = AwaitVulkanProductionSubmission(window, accepted)
    atlases.Collect(completed)
    if !atlas.IsUploaded {
      throw InvalidOperationException("Vulkan production text atlas upload did not publish")
    }
  }
