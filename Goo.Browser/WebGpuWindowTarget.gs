package Goo.Browser

import Goo
import Goo.Browser.Interop
import System
import System.Numerics
import System.Runtime.InteropServices
internal unsafe sealed class WebGpuWindowTarget(handle int32) : WindowRenderTarget {
  private let compiler VulkanSceneCompiler = VulkanSceneCompiler()
  private var buffer *uint8
  private var capacity int32
  private var count int32
  private var width int32
  private var height int32
  private var hidden bool
  private var submitted bool
  private var needsRender bool = true
  private var captureFailure Exception?

  public event PresentationAccepted Action[int64]
  public prop ProfileSink FrameProfileSink? { get -> nil }
  public prop NeedsRender bool { get -> needsRender && !hidden }
  public prop MemoryPressureWaiting bool { get -> false }
  public prop LastFrameSubmitted bool { get -> submitted }
  public prop QueueWorkPending bool { get -> false }
  public prop RetirementWorkPending bool { get -> false }
  public prop CaptureFailure Exception? { get -> captureFailure }

  public func PrepareClose() bool -> true
  public func SetVSync(value bool) { }
  public func SetHidden(value bool) { hidden = value }
  public func BeginFrame() { submitted = false }
  public func ServicePendingSubmission() bool -> false
  public func PollQueueCompletion() bool -> false
  public func Resize(width int32, height int32) bool {
    this.width = width
    this.height = height
    needsRender = true
    return width >= 0 && height >= 0
  }

  public func Render(root Node?, portalRoot Node?, background Color, dpi Vector2, overlay DiagnosticOverlay?) {
    if overlay != nil { throw NotSupportedException("Browser diagnostic overlays are not supported") }
    let logicalWidth = float32(width) / dpi.X
    let logicalHeight = float32(height) / dpi.Y
    let result = compiler.Compile(root, portalRoot, background, logicalWidth, logicalHeight)
    let frame = compiler.Frame
    if result.HasUnsupported || frame.ClipChainCount > 1 || frame.RectClipCount != 0 {
      throw NotSupportedException("The browser renderer supports only unclipped solid boxes, rounded boxes and borders")
    }
    count = frame.DrawRefCount
    if buffer == nil || count > capacity {
      capacity = Math.Max(count, Math.Max(16, capacity * 2))
      NativeMemory.Free(buffer)
      buffer = *uint8(NativeMemory.Alloc(nuint(16 + capacity * 132)))
    }
    let uniforms = *float32(buffer)
    uniforms[0] = logicalWidth
    uniforms[1] = logicalHeight
    uniforms[2] = dpi.X
    uniforms[3] = dpi.Y
    let records = *VulkanPrimitiveGpuRecord(buffer + 16)
    let commands = *uint32(buffer + 16 + count * 128)
    for index in 0 ... count {
      let reference = frame.DrawRefs[index]
      var record = VulkanPrimitiveGpuRecord{}
      var bounds ConservativeBounds
      var transformIndex int32 = -1
      commands[index] = 0u
      if reference.Kind == SceneDrawKind.SolidBox {
        let value = frame.SolidBoxes[reference.Index]
        bounds = value.Bounds
        transformIndex = value.TransformIndex
        let color = PackColor(value.Color, value.Opacity)
        record.packedColors_x = color.Rgb
        record.packedColors_w = color.Alpha
      } else if reference.Kind == SceneDrawKind.RoundedBox {
        let value = frame.RoundedBoxes[reference.Index]
        bounds = value.Bounds
        transformIndex = value.TransformIndex
        record.radii_x = value.RadiusTopLeft
        record.radii_y = value.RadiusTopRight
        record.radii_z = value.RadiusBottomRight
        record.radii_w = value.RadiusBottomLeft
        record.params_x = SnapWidth(value.OpaqueBorderWidth * dpi.X) / dpi.X
        record.params_y = SnapWidth(value.OpaqueBorderHeight * dpi.Y) / dpi.Y
        record.Geometry.transform1_w = 1.0F / MathF.Min(dpi.X, dpi.Y)
        let color = PackColor(value.Color, value.Opacity)
        record.packedColors_x = color.Rgb
        record.packedColors_w = color.Alpha
      } else if reference.Kind == SceneDrawKind.PerEdgeBorder {
        let value = frame.PerEdgeBorders[reference.Index]
        bounds = value.Bounds
        transformIndex = value.TransformIndex
        record.radii_x = SnapWidth(value.TopWidth * dpi.Y) / dpi.Y
        record.radii_y = SnapWidth(value.RightWidth * dpi.X) / dpi.X
        record.radii_z = SnapWidth(value.BottomWidth * dpi.Y) / dpi.Y
        record.radii_w = SnapWidth(value.LeftWidth * dpi.X) / dpi.X
        record.stopPositions_x = value.RadiusTopLeft
        record.stopPositions_y = value.RadiusTopRight
        record.stopPositions_z = value.RadiusBottomRight
        record.stopPositions_w = value.RadiusBottomLeft
        record.params_y = bounds.Width
        record.params_z = bounds.Width + bounds.Height
        record.params_w = bounds.Width * 2.0F + bounds.Height
        record.Geometry.transform1_w = 1.0F / MathF.Min(dpi.X, dpi.Y)
        let top = PackColor(value.TopColor, 1.0F)
        let right = PackColor(value.RightColor, 1.0F)
        let bottom = PackColor(value.BottomColor, 1.0F)
        let left = PackColor(value.LeftColor, 1.0F)
        record.packedColors_x = top.Rgb
        record.packedColors_y = right.Rgb
        record.packedColors_z = bottom.Rgb
        record.packedColors_w = top.Alpha | (right.Alpha << 10) | (bottom.Alpha << 20)
        record.packedColorsExtra_x = left.Rgb
        record.packedColorsExtra_y = left.Alpha
        record.packedColorsExtra_w = value.Style
        commands[index] = 1u
      } else if reference.Kind == SceneDrawKind.Transform {
        commands[index] = 2u
      } else {
        throw NotSupportedException("Unsupported browser scene draw: ${reference.Kind}")
      }
      record.Geometry.rect_x = bounds.X
      record.Geometry.rect_y = bounds.Y
      record.Geometry.rect_z = bounds.Width
      record.Geometry.rect_w = bounds.Height
      var transform = PrimitiveTransform{ A: 1.0F, D: 1.0F }
      while transformIndex >= 0 {
        let value = frame.Transforms[transformIndex]
        if value.IsScrollPlacement { throw NotSupportedException("Browser scrolling is not supported") }
        transform = PrimitiveTransform{
          A: value.A * transform.A + value.C * transform.B,
          B: value.B * transform.A + value.D * transform.B,
          C: value.A * transform.C + value.C * transform.D,
          D: value.B * transform.C + value.D * transform.D,
          TX: value.A * transform.TX + value.C * transform.TY + value.TX,
          TY: value.B * transform.TX + value.D * transform.TY + value.TY,
        }
        transformIndex = value.ParentIndex
      }
      record.Geometry.transform0_x = transform.A
      record.Geometry.transform0_y = transform.C
      record.Geometry.transform0_z = transform.TX
      record.Geometry.transform1_x = transform.B
      record.Geometry.transform1_y = transform.D
      record.Geometry.transform1_z = transform.TY
      records[index] = record
    }
  }

  public func Present() {
    BrowserInterop.Submit(handle, int32(nint(buffer)), count)
    needsRender = false
    submitted = true
    PresentationAccepted?.Invoke(int64(compiler.LastResult.FrameVersion))
  }

  public func RequestCapture(root Node?, portalRoot Node?, background Color, dpi Vector2,
    reusablePixels([]uint8)? = nil) WindowReadbackRequestStatus {
    captureFailure = NotSupportedException("Browser window capture is not supported")
    return WindowReadbackRequestStatus.Failed
  }
  public func PollCapture() WindowReadbackPollStatus -> WindowReadbackPollStatus.Failed
  public func TakeCaptureResult() WindowReadbackResult? -> nil
  public func Dispose() {
    NativeMemory.Free(buffer)
    buffer = nil
    BrowserInterop.Dispose(handle)
  }

  private func SnapWidth(value float32) float32 ->
    if value > 0.0F { MathF.Max(1.0F, MathF.Round(value, MidpointRounding.AwayFromZero)) } else { 0.0F }

  private func PackColor(value uint32, opacity float32) PackedPrimitiveColor {
    let alpha = Math.Clamp(float32(value & 255u) / 255.0F * opacity, 0.0F, 1.0F)
    let red = uint32(float32((value >> 24) & 255u) / 255.0F * alpha * 2047.0F + 0.5F)
    let green = uint32(float32((value >> 16) & 255u) / 255.0F * alpha * 2047.0F + 0.5F)
    let blue = uint32(float32((value >> 8) & 255u) / 255.0F * alpha * 1023.0F + 0.5F)
    return PackedPrimitiveColor{ Rgb: red | (green << 11) | (blue << 22), Alpha: uint32(alpha * 1023.0F + 0.5F) }
  }
}
