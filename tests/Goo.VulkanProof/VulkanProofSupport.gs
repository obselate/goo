package Goo.VulkanProof

import Goo
import System
import System.Numerics
import System.Threading

internal class VulkanProductionProofCell : Cell {
  override func Build() Blob -> Container {
    Width: 64,
    Height: 64,
  }
}

internal func OpenVulkanProductionProofWindow() Window {
  let window = Window{
    Title: "Goo Vulkan production proof",
    Size: LayoutSize(64, 64),
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
  clearColor VkClearColorValue, scaleX float32 = 1.0F, scaleY float32 = 1.0F) VulkanReadbackResult{
    let submit = capture.Request(frame, clearColor, scaleX, scaleY)
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
  clearColor VkClearColorValue, scaleX float32 = 1.0F, scaleY float32 = 1.0F) {
    let submit = capture.Request(frame, clearColor, scaleX, scaleY)
    if submit != VkConstants.VK_SUCCESS {
      throw InvalidOperationException("Vulkan production readback warmup submission failed: "
        +submit.ToString())
    }
    AwaitVulkanProductionReadback(capture)
  }

internal func VulkanProofTextChannel(value int32) float32 -> float32(value) / 255.0F

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
  effectRadius float32, runOriginX float32 = 0.0F, runOriginY float32 = 0.0F) {
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
      runOrigin_x: runOriginX,
      runOrigin_y: runOriginY,
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
      TransformIndex: -1,
      Segment: segment,
      FirstInstance: -1,
    })
  }

  func VerifyShaderEffectCaptureCoordinates(program ShaderEffectProgram) {
    let window = OpenVulkanProductionProofWindow()
    var capture VulkanProductionReadbackCapture? = nil
    try {
      let opened = VulkanProductionReadbackFixture.Open(window, 64u, 64u)
      capture = opened
      let effect = ShaderEffect(program, true)
      effect.SetParameter(0, Vector4(1.0F, 1.0F, 1.0F, 0.0F))
      let full = ConservativeBounds{Width: 64.0F, Height: 64.0F}
      var reference[]uint8 = Array.Empty[uint8]()
      for variant in 0 ... 4 {
        let bounds = if variant == 0 {
          full
        } else if variant == 3 {
          ConservativeBounds{X: 8.0F, Y: 16.0F, Width: 40.0F, Height: 32.0F}
        } else {
          ConservativeBounds{X: 16.0F, Y: 8.0F, Width: 32.0F, Height: 40.0F}
        }
        let originX = if variant == 2 {
          8.0F
        } else if variant == 3 {
          4.0F
        } else {
          0.0F
        }
        let originY = if variant == 2 {
          4.0F
        } else if variant == 3 {
          8.0F
        } else {
          0.0F
        }
        let frame = SceneFrame(16)
        frame.BeginChunk(0x4C415945525556uL, uint64(variant + 1), full, true)
        var snapshot ShaderEffectSnapshot
        effect.CopySnapshot(out snapshot)
        let layer = LayerRecord{
          Bounds: bounds,
          ReferenceIndex: frame.AddLayerCoverage(VulkanSceneLayerCoverage{Bounds: full, PaintBounds: full,}),
          OriginX: originX,
          OriginY: originY,
          ExtentWidth: uint32(64.0F - originX * 2.0F),
          ExtentHeight: uint32(64.0F - originY * 2.0F),
          Opacity: 1.0F,
          OffscreenTargetId: ResourceId{
            Kind: SceneResourceKind.OffscreenTarget,
            LogicalId: 0x4C415945525556uL,
            Version: 1uL,
          },
          EffectProgramId: snapshot.ProgramId,
          EffectVersion: snapshot.Version,
          EffectIndex: frame.AddShaderEffect(snapshot),
          Flags: uint32(LayerRecordFlags.SamplesBackdrop),
          TransformIndex: -1,
        }
        frame.AddLayerBegin(layer)
        frame.AddGradientStop(GradientStopRecord{Offset: 0.0F, Color: 0xFF0000FFu})
        frame.AddGradientStop(GradientStopRecord{Offset: 1.0F, Color: 0x00FF80FFu})
        frame.AddLinearGradient(
        LinearGradientRecord{
          Bounds: full,
          StartX: 0.0F,
          StartY: 0.0F,
          EndX: 64.0F,
          EndY: 64.0F,
          StopStart: 0,
          StopCount: 2,
          Opacity: 1.0F,
          TransformIndex: -1,
        }
        )
        frame.AddLayerEnd(layer)
        frame.EndChunk()
        WarmVulkanProductionReadback(opened, frame, VkClearColorValue{})
        let pixels = RequestVulkanProductionReadback(opened, frame, VkClearColorValue{}).Pixels
        if variant == 0 {
          reference = pixels
          if reference[(32 * 64 + 32) * 4 + 3] != uint8(255)
          || reference[(32 * 64 + 32) * 4] <= uint8(80) {
            throw InvalidOperationException("Shader effect coordinate reference was not drawn")
          }
          continue
        }
        for y in 0 ... 64 {
          for x in 0 ... 64 {
            let inside = float32(x) >= bounds.X && float32(x) < bounds.Right
            && float32(y) >= bounds.Y && float32(y) < bounds.Bottom
            for channel in 0 ... 4 {
              let index = (y * 64 + x) * 4 + channel
              let expected = inside ? reference[index]: uint8(0)
              if pixels[index] != expected {
                throw InvalidOperationException(
                "Shader effect capture changed coordinates at variant=${variant} x=${x} y=${y} channel=${channel} expected=${expected} actual=${pixels[index]}"
                )
              }
            }
          }
        }
      }
      Console.WriteLine("shader-effect-capture: reference=1 cropped=3 max-rgba-difference=0")
    } finally {
      if let active = capture {
        active.Dispose()
      }
      CloseVulkanProductionProofWindow(window)
    }
  }
