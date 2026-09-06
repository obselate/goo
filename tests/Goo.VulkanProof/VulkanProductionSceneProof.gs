package Goo.VulkanProof

import System
import System.Threading
import Goo

internal class VulkanProductionProofCell : Cell {
  override func Build() Blob -> Container {
    Width: 64,
    Height: 64,
  }
}

internal func OpenVulkanProductionProofWindow() Window {
  let window = Window{
    Title: "Goo Vulkan production proof",
    Width: 64,
    Height: 64,
    VSync: false,
    Root: VulkanProductionProofCell{},
  }
  window.Open()
  WindowReadbackTestFixture.ForceRender(window, 0.0)
  WindowReadbackTestFixture.DrainWindowQueue(window, 2000)
  return window
}

internal func CloseVulkanProductionProofWindow(window Window) {
  if window.IsOpen {
    window.RequestClose()
    WindowReadbackTestFixture.ForceRender(window, 0.0)
  }
}

internal func AwaitVulkanProductionSubmission(
  window Window,
  acceptedSerial uint64) uint64{
    let deadline = Environment.TickCount64 + 5000L
    var completed = VulkanProductionReadbackFixture.CompletedSubmissionSerial(window)
    while completed < acceptedSerial && Environment.TickCount64 < deadline {
      VulkanProductionReadbackFixture.PollQueueCompletion(window)
      Thread.Yield()
      completed = VulkanProductionReadbackFixture.CompletedSubmissionSerial(window)
    }
    if completed < acceptedSerial {
      throw InvalidOperationException("Vulkan production submission did not complete: accepted="
        +acceptedSerial.ToString() + " completed=" + completed.ToString())
    }
    return completed
  }

internal func AwaitVulkanProductionReadback(
  capture VulkanProductionReadbackCapture) VulkanReadbackResult{
    let deadline = Environment.TickCount64 + 5000L
    var status = capture.Poll()
    while status == VkConstants.VK_NOT_READY && Environment.TickCount64 < deadline {
      Thread.Yield()
      status = capture.Poll()
    }
    if status != VkConstants.VK_SUCCESS {
      throw InvalidOperationException("Vulkan production readback did not complete: " + status.ToString())
    }
    guard let result = capture.Take() else {
      throw InvalidOperationException("Vulkan production readback result is unavailable")
    }
    return result
  }

internal func RequestVulkanProductionReadback(
  capture VulkanProductionReadbackCapture,
  frame SceneFrame,
  clearColor VkClearColorValue) VulkanReadbackResult{
    let submit = capture.Request(frame, clearColor)
    if submit != VkConstants.VK_SUCCESS {
      throw InvalidOperationException("Vulkan production readback submission failed: " + submit.ToString())
    }
    if capture.LastRequestAllocatedBytes != 0uL {
      throw InvalidOperationException("Vulkan production readback request path allocated managed bytes: "
        +capture.LastRequestAllocatedBytes.ToString())
    }
    return AwaitVulkanProductionReadback(capture)
  }

internal func WarmVulkanProductionReadback(
  capture VulkanProductionReadbackCapture,
  frame SceneFrame,
  clearColor VkClearColorValue) {
    let submit = capture.Request(frame, clearColor)
    if submit != VkConstants.VK_SUCCESS {
      throw InvalidOperationException("Vulkan production readback warmup submission failed: "
        +submit.ToString())
    }
    AwaitVulkanProductionReadback(capture)
  }

internal func VulkanProofTextChannel(value int32) float32 {
  let encoded = float32(value) / 255.0F
  return if encoded <= 0.04045F {
    encoded / 12.92F
  } else {
    MathF.Pow((encoded + 0.055F) / 1.055F, 2.4F)
  }
}

internal func AppendVulkanProofGlyph(
  frame SceneFrame,
  segmentId uint64,
  atlasId ResourceId,
  atlasGeneration uint64,
  transform TransformRecord,
  minX float32,
  minY float32,
  maxX float32,
  maxY float32,
  atlasTexelOffset uint32,
  atlasTexelCount uint32,
  color uint32,
  renderMode uint32,
  effectMode uint32,
  effectRadius float32) {
    let firstX = transform.A * minX + transform.C * minY + transform.TX
    let secondX = transform.A * maxX + transform.C * maxY + transform.TX
    let firstY = transform.B * minX + transform.D * minY + transform.TY
    let secondY = transform.B * maxX + transform.D * maxY + transform.TY
    let bounds = ConservativeBounds{
      X: MathF.Min(firstX, secondX),
      Y: MathF.Min(firstY, secondY),
      Width: MathF.Abs(secondX - firstX),
      Height: MathF.Abs(secondY - firstY),
    }
    let alpha = float32(color & 255u) / 255.0F
    let red = VulkanProofTextChannel(int32((color >> 24) & 255u))
    let green = VulkanProofTextChannel(int32((color >> 16) & 255u))
    let blue = VulkanProofTextChannel(int32((color >> 8) & 255u))
    let pipelineKind = renderMode == 3u ? 1u : 0u
    let segment = VulkanRetainedTextSegment(1)
    segment.Id = segmentId
    segment.Version = 1uL
    segment.Bounds = bounds
    segment.GlyphCount = 1
    segment.ClipChainId = 0
    segment.Records[0] = HbGpuTextInstanceRecord{
      transform_m00: transform.A,
      transform_m01: transform.B,
      transform_m10: transform.C,
      transform_m11: transform.D,
      transform_m22: 1.0F,
      transform_m30: transform.TX,
      transform_m31: transform.TY,
      transform_m33: 1.0F,
      glyphBounds_x: minX,
      glyphBounds_y: minY,
      glyphBounds_z: maxX,
      glyphBounds_w: maxY,
      glyphInput_x: atlasTexelOffset,
      glyphInput_y: effectMode,
      glyphInput_z: 0u,
      glyphInput_w: uint32(BitConverter.SingleToInt32Bits(if effectMode == 2u {
        effectRadius
      } else { 0.0F })),
      foreground_x: pipelineKind == 0u ? red * alpha : red,
      foreground_y: pipelineKind == 0u ? green * alpha : green,
      foreground_z: pipelineKind == 0u ? blue * alpha : blue,
      foreground_w: alpha,
    }
    segment.RecordCount = 1
    segment.Runs[0] = VulkanTextSegmentRun{
      FirstInstance: 0,
      InstanceCount: 1,
      AtlasId: atlasId,
      PipelineKind: pipelineKind,
      ByteRangeEnd: uint64(atlasTexelOffset + atlasTexelCount) * 8uL,
    }
    segment.RunCount = 1
    segment.GlyphResources[0] = ResourceId{
      Kind: SceneResourceKind.GlyphRun,
      LogicalId: atlasId.LogicalId,
      Version: uint64(atlasTexelOffset) + 1uL,
    }
    segment.GlyphResourceCount = 1
    segment.GlyphAtlasTexelOffsets[0] = atlasTexelOffset
    segment.GlyphAtlasTexelCounts[0] = atlasTexelCount
    if effectMode != 0u {
      segment.GlyphEffectAtlasTexelOffsets[0] = atlasTexelOffset
      segment.GlyphEffectAtlasTexelCounts[0] = atlasTexelCount
    }
    segment.AtlasGeneration = atlasGeneration
    frame.AddCachedTextSegment(CachedTextSegmentRefRecord{
      Bounds: bounds,
      SegmentId: segment.Id,
      SegmentVersion: segment.Version,
      GlyphCount: 1,
      ClipChainId: 0,
      Segment: segment,
      FirstInstance: -1,
    })
  }

internal unsafe func RunProductionSceneReadback(shadow bool) {
  let window = OpenVulkanProductionProofWindow()
  var capture VulkanProductionReadbackCapture? = nil
  try {
    capture = VulkanProductionReadbackFixture.Open(window, 64u, 64u)
    let frame = SceneFrame(16)
    var clearColor = VkClearColorValue{}
    clearColor.float32.values[2] = 1.0F
    clearColor.float32.values[3] = 1.0F
    if shadow {
      BuildShadowPixelScene(frame, 1uL)
      let digest = ShadowPixelSceneSemanticDigest(frame)
      if digest != ShadowPixelSceneContract.ExpectedDigest {
        throw InvalidOperationException("Vulkan production shadow scene semantic digest changed: "
          +digest.ToString())
      }
      WarmVulkanProductionReadback(capture!!, frame, clearColor)
      let result = RequestVulkanProductionReadback(capture!!, frame, clearColor)
      fixed readback * uint8 = result.Pixels{
        if !VerifyShadowPixelSceneReadback(readback, result.Width, result.Height) {
          throw InvalidOperationException("Vulkan production shadow scene readback pixels are invalid")
        }
      }
      Console.WriteLine("Shadow scene readback: digest=${digest} draws=${frame.DrawRefCount} shadows=${frame.ShadowCount} allocated=0")
    } else {
      BuildPixelScene(frame, 1uL)
      let digest = PixelSceneSemanticDigest(frame)
      if digest != PixelSceneContract.ExpectedDigest {
        throw InvalidOperationException("Vulkan production scene semantic digest changed: "
          +digest.ToString())
      }
      WarmVulkanProductionReadback(capture!!, frame, clearColor)
      let result = RequestVulkanProductionReadback(capture!!, frame, clearColor)
      fixed readback * uint8 = result.Pixels{
        if !VerifyPixelSceneReadback(readback, result.Width, result.Height) {
          throw InvalidOperationException("Vulkan production scene readback pixels are invalid")
        }
      }
      Console.WriteLine("Scene readback: digest=${digest} allocated=0")
    }
  } finally {
    if let active = capture {
      active.Dispose()
    }
    CloseVulkanProductionProofWindow(window)
  }
}
