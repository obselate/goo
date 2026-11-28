package GooAsyncReadbackSmoke

import Goo
import System
import System.Diagnostics
import System.IO
import System.Numerics

class ShaderEffectCell : Cell {
  private var effect ShaderEffect

  shared {
    let Target ElementHandle = ElementHandle{}
  }

  internal var ClickCount int32

  init(value ShaderEffect) {
    effect = value
  }

  internal func ReplaceEffect(value ShaderEffect) {
    effect = value
    Rebuild()
  }

  override func Build() Blob -> Container() {.Width: Percent(100),.Height: Percent(100),.Position: PositionType.Relative,.BackgroundColor: Color.Rgb(12, 20, 32),
    Container{
        Position: PositionType.Absolute,
        Left: 16,
        Top: 24,
        Width: 16,
        Height: 80,
        BackgroundColor: Color.Rgb(238, 188, 34),
      },
      Container{
        Position: PositionType.Absolute,
        Left: 32,
        Top: 24,
        Width: 128,
        Height: 80,
        BackgroundColor: Color.Rgb(28, 118, 224),
      },
      Button{
        Handle: ShaderEffectCell.Target,
        Position: PositionType.Absolute,
        Left: 32,
        Top: 24,
        Width: 128,
        Height: 80,
        BorderRadius: 22,
        BackgroundColor: Color.Rgb(232, 72, 48),
        ShaderEffect: effect,
        OnClick: func() { ClickCount++ },
      },
      Container{
        Position: PositionType.Absolute,
        Left: 160,
        Top: 24,
        Width: 16,
        Height: 80,
        BackgroundColor: Color.Rgb(238, 188, 34),
      },
      Container{
        Position: PositionType.Absolute,
        Left: 160,
        Top: 24,
        Width: 16,
        Height: 80,
        BackgroundColor: Color.Rgb(232, 72, 48),
        ShaderEffect: effect,
        BlendMode: BlendMode.Multiply,
      },
      Text{
        Content: "DPI",
        Position: PositionType.Absolute,
        Left: 80,
        Top: 2,
        FontFamily: "monospace",
        FontSize: 16,
        Color: Color.Rgb(4, 252, 4),
    },
  }
}

func ShaderEffectDelta(after uint64, before uint64) uint64 -> after >= before ? after - before : uint64.MaxValue

func ShaderEffectSum(values []int64) int64 {
  var total int64
  var index int32
  while index < values.Length {
    total = total + values[index]
    index++
  }
  return total
}

func ShaderEffectWaitForGraphics(window Window) {
  let timeline = WindowReadbackTestFixture.GraphicsTimeline(window)
  Require(timeline.Available && timeline.CompletedResult == VkConstants.VK_SUCCESS
      && timeline.LastEnqueuedSerial > 0uL,
    "ShaderEffect graphics timeline is unavailable")
  Require(WindowReadbackTestFixture.WaitGraphicsSubmission(
    window, timeline.LastEnqueuedSerial, VkConstants.VK_WHOLE_SIZE) == VkConstants.VK_SUCCESS,
    "ShaderEffect graphics submission did not complete")
}

func ShaderEffectGreenTextMinX(frame VulkanReadbackResult) int32 {
  var minimum = Int32.MaxValue
  var y uint32
  let maximumY = frame.Height < 40u ? frame.Height : 40u
  while y < maximumY {
    var x uint32
    while x < frame.Width {
      let index = int32((y * frame.Width + x) * 4u)
      let red = int32(frame.Pixels[index])
      let green = int32(frame.Pixels[index + 1])
      let blue = int32(frame.Pixels[index + 2])
      if green > 160 && green > red + 80 && green > blue + 80
        && int32(x) < minimum{
          minimum = int32(x)
        }
      x++
    }
    y++
  }
  return minimum
}

func ShaderEffectWarmRetainedResources(window Window) {
  WindowReadbackTestFixture.WaitForPipelinePreparation(window)
  var stableSlots uint32
  var attempt int32
  while attempt < 32 && stableSlots != 3u {
    let before = WindowReadbackTestFixture.DiagnosticCounters(window)
    WindowReadbackTestFixture.ForceRender(window, 0.0166666666666667)
    ShaderEffectWaitForGraphics(window)
    let after = WindowReadbackTestFixture.DiagnosticCounters(window)
    let primitive = WindowReadbackTestFixture.PrimitiveFrameRetention(window)
    if ShaderEffectDelta(after[VulkanCounterId.VulkanObjectAllocationCount],
      before[VulkanCounterId.VulkanObjectAllocationCount]) == 0uL
      && ShaderEffectDelta(after[VulkanCounterId.VulkanDeviceMemoryAllocationCount],
        before[VulkanCounterId.VulkanDeviceMemoryAllocationCount]) == 0uL
      && ShaderEffectDelta(after[VulkanCounterId.LayerPoolCreateCount],
        before[VulkanCounterId.LayerPoolCreateCount]) == 0uL {
          if primitive.SlotIndex == 0 {
            stableSlots = stableSlots | 1u
          } else if primitive.SlotIndex == 1 {
            stableSlots = stableSlots | 2u
          }
        } else {
          stableSlots = 0u
        }
    attempt++
  }
  Require(stableSlots == 3u,
    "ShaderEffect retained resources did not stabilize across both frame slots")
}

class ShaderBlendResultCell : Cell {
  internal let Effect ShaderEffect

  init(effect ShaderEffect) { Effect = effect }

  override func Build() Blob ->
  Container{Width: 64, Height: 64, BackgroundColor: Color.White, ShaderEffect: Effect}
}

func VerifyShaderEffectBlendResults() {
  let bytes = File.ReadAllBytes(Path.Combine(AppContext.BaseDirectory, "blend_result.frag.goo-effect"))
  var valid = true
  for replacingFirst in []bool{false, true} {
    let created = OffscreenRenderSession.Create()
    Require(created.Status == OffscreenRenderStatus.Success, "blend result session: " + created.Error)
    using let session = created.Session!!
    for index in 0 ... 2 {
      let replacing = if index == 0 { replacingFirst } else { !replacingFirst }
      let effect = ShaderEffect(ShaderEffectProgram(bytes, replacing))
      let pending = session.RenderAsync(ShaderBlendResultCell(effect),
        OffscreenRenderOptions(LayoutSize(64, 64), 64u, 64u, Color.Rgb(0, 0, 255), 134217728L),
        System.Threading.CancellationToken.None)
      let deadline = Stopwatch.GetTimestamp() + Stopwatch.Frequency * 10L
      while !pending.IsCompleted && Stopwatch.GetTimestamp() < deadline {
        session.Service()
        System.Threading.Thread.Sleep(1)
      }
      Require(pending.IsCompleted, "blend result render timed out")
      let result = pending.GetAwaiter().GetResult()
      Require(result.Status == OffscreenRenderStatus.Success, "blend result render: " + result.Error)
      let capture = result.Capture!!
      let pixel = 32 * int32(capture.RowBytes) + 32 * 4
      Console.WriteLine("shader-blend: replacing-first=${replacingFirst} replacing=${replacing} "
        + "rgba=${capture.Pixels[pixel]},${capture.Pixels[pixel + 1]},"
        + "${capture.Pixels[pixel + 2]},${capture.Pixels[pixel + 3]}")
      if let directory = Environment.GetEnvironmentVariable("GOO_SHADER_BLEND_OUTPUT") {
        Directory.CreateDirectory(directory)
        using let image = ImageSource.Transfer(64, 64, capture.Pixels, () -> {})
        File.WriteAllBytes(Path.Combine(directory, "${replacingFirst}-${replacing}.png"), image.EncodePng())
      }
      valid = valid && Math.Abs(int32(capture.Pixels[pixel]) - 128) <= 1
        && capture.Pixels[pixel + 1] == uint8(0)
        && Math.Abs(int32(capture.Pixels[pixel + 2]) - (if replacing { 0 } else { 127 })) <= 1
        && Math.Abs(int32(capture.Pixels[pixel + 3]) - (if replacing { 128 } else { 255 })) <= 1
    }
  }
  Require(valid, "shader blend result did not match its backdrop replacement flag")
}

class RoundedBackdropCaptureCell : Cell {
  private let effect ShaderEffect

  init(effect ShaderEffect) { this.effect = effect }

  override func Build() Blob -> Container{
    Width: 64, Height: 64,
    Container{Width: 64, Height: 16, BackgroundColor: Color.Rgba(0, 255, 0, 128)},
    Container{Width: 64, Height: 48, BackgroundColor: Color.Rgba(255, 0, 0, 128)},
    Container{
      Position: PositionType.Absolute, Left: 16, Top: 24, Width: 32, Height: 32,
      BorderRadius: 12, Overflow: Overflow.Hidden,
      Container{Width: 25, Height: 24, ShaderEffect: effect},
    },
  }
}

func VerifyRoundedBackdropCapture() {
  let bytes = File.ReadAllBytes(Path.Combine(AppContext.BaseDirectory, "offset_backdrop.frag.goo-effect"))
  let effect = ShaderEffect(ShaderEffectProgram(bytes, replacesBackdrop: true), true, 22.0)
  effect.SetParameter(0, Vector4(0.0F, -22.0F, 0.0F, 0.0F))
  let created = OffscreenRenderSession.Create()
  Require(created.Status == OffscreenRenderStatus.Success, "rounded backdrop session: " + created.Error)
  using let session = created.Session!!
  let pending = session.RenderAsync(RoundedBackdropCaptureCell(effect),
    OffscreenRenderOptions(LayoutSize(64, 64), 64u, 64u, Color.Transparent, 134217728L),
    System.Threading.CancellationToken.None)
  let deadline = Stopwatch.GetTimestamp() + Stopwatch.Frequency * 10L
  while !pending.IsCompleted && Stopwatch.GetTimestamp() < deadline {
    session.Service()
    System.Threading.Thread.Sleep(1)
  }
  Require(pending.IsCompleted, "rounded backdrop render timed out")
  let result = pending.GetAwaiter().GetResult()
  Require(result.Status == OffscreenRenderStatus.Success, "rounded backdrop render: " + result.Error)
  let capture = result.Capture!!
  let stride = int32(capture.RowBytes)
  let lens = BitConverter.ToUInt32(capture.Pixels, 30 * stride + 24 * 4)
  let interior = BitConverter.ToUInt32(capture.Pixels, 50 * stride + 36 * 4)
  let corner = BitConverter.ToUInt32(capture.Pixels, 24 * stride + 16 * 4)
  Console.WriteLine("rounded-backdrop: lens=${lens:X8} interior=${interior:X8} corner=${corner:X8} (ABGR)")
  Require(interior == 0x80000080u, "rounded backdrop changed the wrapper outside the lens")
  Require(corner == 0x80000080u, "rounded backdrop changed the clipped corner")
  Require(lens == 0x80008000u, "rounded backdrop lost the translucent sample outside the clip")
}

func RunShaderEffectSmoke() {
  WindowReadbackTestFixture.ShaderEffectVerifyPresentationRetirement()
  Require(Environment.GetEnvironmentVariable("GOO_VK_DIAGNOSTICS") == "1",
    "GOO_VK_DIAGNOSTICS=1 is required")
  VerifyShaderEffectBlendResults()
  VerifyRoundedBackdropCapture()
  let program = ShaderEffectProgram.Load(System.Reflection.Assembly.GetExecutingAssembly(), "embedded-control")
  VulkanProofFixture.VerifyLayerEffectCoordinates(program)
  let effect = ShaderEffect(program, true, 20.0)
  let replacementEffect = ShaderEffect(program, true, 20.0)
  var transferReleaseCount int32
  let data = ShaderEffectData.Transfer(BitConverter.GetBytes(1.0F),
    func() { transferReleaseCount++ })
  Require(effect.SetData(0, data), "Shader effect rejected its retained data source")
  Require(!effect.SetData(0, data), "Shader effect reported an unchanged data source as changed")
  Require(effect.SetParameter(0, Vector4(1.0F, 0.25F, 0.25F, 0.0F)),
    "Shader effect rejected its initial parameter")
  Require(!effect.SetParameter(0, Vector4(1.0F, 0.25F, 0.25F, 0.0F)),
    "Shader effect reported an unchanged parameter as changed")
  Require(replacementEffect.SetData(0, data),
    "Replacement shader effect rejected its retained data source")
  Require(replacementEffect.SetParameter(0, Vector4(0.25F, 1.0F, 0.25F, 1.0F)),
    "Replacement shader effect rejected its initial parameter")
  let cell = ShaderEffectCell(effect)
  let capturedError = StringWriter()
  let originalError = Console.Error
  var window Window? = nil
  var parameterAllocated int64
  var warmObjectAllocations uint64
  var warmDeviceMemoryAllocations uint64
  var deviceRecoveries uint64
  var displayScaleX float64
  try {
    let opened = Window{
      Title: "Goo Shader effect gate",
      Size: LayoutSize(192, 128),
      VSync: false,
      Root: cell,
    }
    window = opened
    Console.SetError(capturedError)
    opened.Open()
    WindowReadbackTestFixture.ForceRender(opened, 0.0, waitForPresentation: true)
    WindowReadbackTestFixture.ForceRender(opened, 0.0166666666666667)
    let metrics = WindowReadbackTestFixture.Metrics(opened)
    Require(metrics.NativeWidth == 192 && metrics.NativeHeight == 128,
      "Shader effect window metrics are incorrect")
    Require(ShaderEffectCell.Target.IsMounted,
      "Shader effect button did not mount")
    let initialBounds = ShaderEffectCell.Target.BorderBox
    let targetX = initialBounds.X + initialBounds.Width * 0.5
    let targetY = initialBounds.Y + initialBounds.Height * 0.5
    let first = PrimitiveReadback(opened, metrics)
    let firstCenter = PrimitiveLogicalPixel(first.Pixels, first.Width, metrics, targetX, targetY)
    Require(int32(firstCenter[0]) > int32(firstCenter[1]) + 80
        && int32(firstCenter[0]) > int32(firstCenter[2]) + 80,
      "Shader effect did not tint the control source: " + PrimitivePixelText(firstCenter))
    let clippedCorner = PrimitiveLogicalPixel(first.Pixels, first.Width, metrics,
      initialBounds.X + 1.0, initialBounds.Y + 1.0)
    Require(int32(clippedCorner[2]) > int32(clippedCorner[0]) + 100
        && int32(clippedCorner[2]) > int32(clippedCorner[1]) + 60,
      "Shader effect escaped the rounded control source: "
      +PrimitivePixelText(clippedCorner))

    cell.ReplaceEffect(replacementEffect)
    WindowReadbackTestFixture.ForceRender(opened, 0.0166666666666667)
    let replacement = PrimitiveReadback(opened, metrics)
    let replacementCenter = PrimitiveLogicalPixel(replacement.Pixels,
      replacement.Width, metrics, targetX, targetY)
    Require(int32(replacementCenter[2]) > int32(replacementCenter[0]) + 100
        && int32(replacementCenter[2]) > int32(replacementCenter[1]) + 60,
      "Shader effect-only replacement did not reach the renderer: "
      +PrimitivePixelText(replacementCenter))
    cell.ReplaceEffect(effect)
    WindowReadbackTestFixture.ForceRender(opened, 0.0166666666666667)
    let restored = PrimitiveReadback(opened, metrics)
    let restoredCenter = PrimitiveLogicalPixel(restored.Pixels,
      restored.Width, metrics, targetX, targetY)
    Require(int32(restoredCenter[0]) > int32(restoredCenter[1]) + 80
        && int32(restoredCenter[0]) > int32(restoredCenter[2]) + 80,
      "Shader effect-only restoration did not reach the renderer: "
      +PrimitivePixelText(restoredCenter))

    WindowReadbackTestFixture.InputQueuePointerMove(opened, targetX, targetY)
    WindowReadbackTestFixture.InputQueuePointerPress(opened, targetX, targetY)
    WindowReadbackTestFixture.InputQueuePointerRelease(opened, targetX, targetY)
    WindowReadbackTestFixture.ForceRender(opened, 0.0)
    Require(cell.ClickCount == 1,
      "Shader effect changed the button hit target")

    data.PublishTransferred(BitConverter.GetBytes(0.5F),
      func() { transferReleaseCount++ })
    Require(transferReleaseCount == 1,
      "ShaderEffect did not release the replaced transferred data")
    WindowReadbackTestFixture.ForceRender(opened, 0.0166666666666667)
    let dataFrame = PrimitiveReadback(opened, metrics)
    let dataCenter = PrimitiveLogicalPixel(dataFrame.Pixels, dataFrame.Width,
      metrics, targetX, targetY)
    Require(int32(firstCenter[0]) > int32(dataCenter[0]) + 40,
      "ShaderEffect retained data mutation did not change output: "
      +PrimitivePixelText(dataCenter))
    ShaderEffectWarmRetainedResources(opened)
    let dataCountersBefore = WindowReadbackTestFixture.DiagnosticCounters(opened)
    WindowReadbackTestFixture.ForceRender(opened, 0.0166666666666667)
    ShaderEffectWaitForGraphics(opened)
    WindowReadbackTestFixture.ForceRender(opened, 0.0166666666666667)
    ShaderEffectWaitForGraphics(opened)
    let retainedDataFrame = WindowReadbackTestFixture.PrimitiveFrameRetention(opened)
    let dataCountersAfter = WindowReadbackTestFixture.DiagnosticCounters(opened)
    Require(retainedDataFrame.PlannedTransferBytes == 0uL
        && retainedDataFrame.RetainedReuse > 0uL,
      "ShaderEffect unchanged retained data was uploaded again")
    let retainedDataObjectAllocations = ShaderEffectDelta(
      dataCountersAfter[VulkanCounterId.VulkanObjectAllocationCount],
      dataCountersBefore[VulkanCounterId.VulkanObjectAllocationCount])
    let retainedDataMemoryAllocations = ShaderEffectDelta(
      dataCountersAfter[VulkanCounterId.VulkanDeviceMemoryAllocationCount],
      dataCountersBefore[VulkanCounterId.VulkanDeviceMemoryAllocationCount])
    Require(retainedDataObjectAllocations == 0uL && retainedDataMemoryAllocations == 0uL,
      "ShaderEffect retained data frame created Vulkan resources: objects="
      +retainedDataObjectAllocations.ToString() + " memory="
      +retainedDataMemoryAllocations.ToString() + " layers="
      +ShaderEffectDelta(dataCountersAfter[VulkanCounterId.LayerPoolCreateCount],
        dataCountersBefore[VulkanCounterId.LayerPoolCreateCount]).ToString())
    let copiedData = BitConverter.GetBytes(1.0F)
    data.Publish(copiedData)
    var copiedDataIndex int32
    while copiedDataIndex < copiedData.Length {
      copiedData[copiedDataIndex] = uint8(0)
      copiedDataIndex++
    }
    Require(transferReleaseCount == 2,
      "ShaderEffect did not release the second transferred publication")
    var slot int32
    effect.SetParameter(0, Vector4(1.0F, 0.25F, 0.25F, 0.0F))
    let beforeBytes = GC.GetAllocatedBytesForCurrentThread()
    while slot < 2048 {
      let red = if (slot & 1) == 0 { 0.75F } else { 1.0F }
      effect.SetParameter(0, Vector4(red, 0.25F, 0.25F, 0.0F))
      slot++
    }
    parameterAllocated = GC.GetAllocatedBytesForCurrentThread() - beforeBytes
    Require(parameterAllocated == 0L,
      "ShaderEffect warm parameter mutation allocated managed memory")
    effect.SetParameter(0, Vector4(0.25F, 1.0F, 0.25F, 1.0F))
    let countersBefore = WindowReadbackTestFixture.DiagnosticCounters(opened)
    WindowReadbackTestFixture.ForceRender(opened, 0.0166666666666667)
    ShaderEffectWaitForGraphics(opened)
    let countersAfter = WindowReadbackTestFixture.DiagnosticCounters(opened)
    warmObjectAllocations = ShaderEffectDelta(countersAfter[VulkanCounterId.VulkanObjectAllocationCount],
      countersBefore[VulkanCounterId.VulkanObjectAllocationCount])
    warmDeviceMemoryAllocations = ShaderEffectDelta(countersAfter[VulkanCounterId.VulkanDeviceMemoryAllocationCount],
      countersBefore[VulkanCounterId.VulkanDeviceMemoryAllocationCount])
    Require(warmObjectAllocations == 0uL && warmDeviceMemoryAllocations == 0uL,
      "ShaderEffect warm parameter frame created Vulkan resources")
    let second = PrimitiveReadback(opened, metrics)
    let secondCenter = PrimitiveLogicalPixel(second.Pixels, second.Width, metrics, targetX, targetY)
    Require(int32(secondCenter[2]) > int32(secondCenter[0]) + 100
        && int32(secondCenter[2]) > int32(secondCenter[1]) + 60,
      "Shader effect did not sample the retained backdrop: "
      +PrimitivePixelText(secondCenter))
    let combinedCenter = PrimitiveLogicalPixel(second.Pixels, second.Width, metrics, 168.0, 64.0)
    Require(int32(combinedCenter[1]) > 80
        && int32(combinedCenter[0]) > int32(combinedCenter[2]) + 60,
      "ShaderEffect combined shader effect did not sample the original parent backdrop: "
      +PrimitivePixelText(combinedCenter))
    Require(Math.Abs(int32(firstCenter[0]) - int32(secondCenter[0])) > 60,
      "ShaderEffect shader parameter mutation did not change the rendered control")
    effect.SetParameter(1, Vector4(-16.0F, 0.0F, 0.0F, 0.0F))
    WindowReadbackTestFixture.ForceRender(opened, 0.0166666666666667)
    let outset = PrimitiveReadback(opened, metrics)
    let outsetSample = PrimitiveLogicalPixel(outset.Pixels, outset.Width, metrics,
      initialBounds.X + 8.0, targetY)
    Require(int32(outsetSample[0]) > int32(outsetSample[2]) + 100
        && int32(outsetSample[1]) > int32(outsetSample[2]) + 70,
      "Shader effect backdrop outset did not expose neighboring pixels: "
      +PrimitivePixelText(outsetSample))
    effect.SetParameter(1, Vector4.Zero)
    let finalBounds = ShaderEffectCell.Target.BorderBox
    Require(finalBounds.X == initialBounds.X && finalBounds.Y == initialBounds.Y
        && finalBounds.Width == initialBounds.Width
        && finalBounds.Height == initialBounds.Height,
      "Shader effect changed control layout")

    opened.Size = LayoutSize(176, 120)
    var resizeAttempt int32
    var resizedMetrics = WindowReadbackTestFixture.Metrics(opened)
    while (resizedMetrics.NativeWidth != 176 || resizedMetrics.NativeHeight != 120)
      && resizeAttempt < 1000 {
        WindowReadbackTestFixture.PumpNativeEvents()
        WindowReadbackTestFixture.Pump(opened, 0.0)
        resizedMetrics = WindowReadbackTestFixture.Metrics(opened)
        resizeAttempt++
      }
    Require(resizedMetrics.NativeWidth == 176 && resizedMetrics.NativeHeight == 120,
      "Shader effect window did not resize")
    displayScaleX = resizedMetrics.DisplayScaleX
    Require(displayScaleX > 0.0 && resizedMetrics.DisplayScaleY > 0.0,
      "Shader effect display scale is invalid")
    WindowReadbackTestFixture.ForceRender(opened, 0.0166666666666667)
    let resized = PrimitiveReadback(opened, resizedMetrics)
    let resizedCenter = PrimitiveLogicalPixel(resized.Pixels, resized.Width,
      resizedMetrics, targetX, targetY)
    Require(int32(resizedCenter[2]) > int32(resizedCenter[0]) + 100
        && int32(resizedCenter[2]) > int32(resizedCenter[1]) + 60,
      "Shader effect output did not survive resize and display scaling: "
      +PrimitivePixelText(resizedCenter))
    WindowReadbackTestFixture.SetForceFullRedraw(opened, true)
    WindowReadbackTestFixture.ForceRenderNonblocking(opened, 0.0166666666666667)
    Require(WindowReadbackTestFixture.RuntimeQueueWorkPending(opened),
      "Shader effect resize did not stage pending window queue work")
    Require(WindowReadbackTestFixture.DiagnosticCounters(opened)[VulkanCounterId.LayerPoolTargetCount] > 0uL,
      "Shader effect resize has no cached layer targets")
    Require(WindowReadbackTestFixture.Resize(opened, 176, 120, 264, 180),
      "Shader effect synthetic 1.5x resize failed")
    Require(WindowReadbackTestFixture.DiagnosticCounters(opened)[VulkanCounterId.LayerPoolTargetCount] > 0uL,
      "Shader effect resize discarded reusable completed layer targets")
    let scaledMetrics = WindowReadbackTestFixture.Metrics(opened)
    Require(Math.Abs(scaledMetrics.DisplayScaleX - 1.5) < 0.001
        && Math.Abs(scaledMetrics.DisplayScaleY - 1.5) < 0.001,
      "Shader effect synthetic display scale is incorrect")
    WindowReadbackTestFixture.ForceRender(opened, 0.0166666666666667)
    let scaled = PrimitiveReadback(opened, scaledMetrics)
    let scaledTextMinX = ShaderEffectGreenTextMinX(scaled)
    Require(scaledTextMinX >= 110 && scaledTextMinX < 150,
      "Shader effect readback did not scale retained text: x="
      +scaledTextMinX.ToString())
    resizedMetrics = scaledMetrics

    let recoveryBefore = WindowReadbackTestFixture.DiagnosticCounters(opened)[VulkanCounterId.DeviceRecoveryCount]
    VulkanSharedRuntime.FailNextGraphicsSubmissionForTest()
    effect.SetParameter(0, Vector4(1.0F, 0.25F, 0.25F, 0.0F))
    WindowReadbackTestFixture.ForceRender(opened, 0.0166666666666667, waitForPresentation: true)
    deviceRecoveries = ShaderEffectDelta(
      WindowReadbackTestFixture.DiagnosticCounters(opened)[VulkanCounterId.DeviceRecoveryCount],
      recoveryBefore)
    Require(deviceRecoveries == 1uL,
      "Shader effect pipeline did not survive device recovery")
    let recovered = PrimitiveReadback(opened, resizedMetrics)
    let recoveredCenter = PrimitiveLogicalPixel(recovered.Pixels, recovered.Width,
      resizedMetrics, targetX, targetY)
    Require(int32(recoveredCenter[0]) > int32(recoveredCenter[1]) + 80
        && int32(recoveredCenter[0]) > int32(recoveredCenter[2]) + 80,
      "Shader effect output was not restored after device recovery: "
      +PrimitivePixelText(recoveredCenter))
    opened.RequestClose()
    WindowReadbackTestFixture.ForceRender(opened, 0.0)
    Require(!opened.IsOpen, "Shader effect gate window did not close")
    Require(WindowReadbackTestFixture.ResidentResourceBytes(opened) == 0uL,
      "Shader effect resources remain resident after close")
  } finally {
    Console.SetError(originalError)
    if let active = window {
      if active.IsOpen {
        active.RequestClose()
        WindowReadbackTestFixture.ForceRender(active, 0.0)
      }
    }
    data.Dispose()
  }
  let diagnostics = capturedError.ToString()
  ReadbackValidateCommonDiagnostics(diagnostics, 1uL)
  Require(!diagnostics.Contains("\"event\":325")
      && !diagnostics.Contains("\"event\":326"),
    "Shader effect gate emitted unsupported-scene diagnostics")
  let layerPassCount = DiagnosticCounter(diagnostics, "layerPoolPassCount")
  let layerCompositeCount = DiagnosticCounter(diagnostics, "layerPoolCompositeCount")
  let layerCreateCount = DiagnosticCounter(diagnostics, "layerPoolCreateCount")
  let layerFailureCount = DiagnosticCounter(diagnostics, "layerPoolFailureCount")
  let layerPressureFailureCount = DiagnosticCounter(diagnostics, "layerPoolPressureFailureCount")
  let layerResidentBytes = DiagnosticCounter(diagnostics, "layerPoolResidentBytes")
  let layerTargetCount = DiagnosticCounter(diagnostics, "layerPoolTargetCount")
  let layerLeasedCount = DiagnosticCounter(diagnostics, "layerPoolLeasedCount")
  Require(layerPassCount > 0uL && layerCompositeCount > 0uL
      && layerCreateCount >= 2uL,
    "Shader effect gate did not execute the retained layer path")
  Require(layerFailureCount == 0uL && layerPressureFailureCount == 0uL,
    "Shader effect gate recorded a layer pool failure")
  Require(layerResidentBytes == 0uL && layerTargetCount == 0uL
      && layerLeasedCount == 0uL,
    "Shader effect gate left layer resources resident after close")
  Console.WriteLine("shader-effect-smoke: control=button backdrop=1 blend=multiply combined=1 clip=rounded input=click effect_replacement=1 effect_restore=1"
    +" data=retained transfer_releases=" + transferReleaseCount.ToString()
    +" resize=1 dpi=" + displayScaleX.ToString("0.###")
    +" device_recovery=" + deviceRecoveries.ToString()
    +" parameter_alloc_B=" + parameterAllocated.ToString()
    +" warm_vk_objects=" + warmObjectAllocations.ToString()
    +" warm_device_memory=" + warmDeviceMemoryAllocations.ToString()
    +" layerPassCount=" + layerPassCount.ToString()
    +" layerCompositeCount=" + layerCompositeCount.ToString()
    +" layerCreateCount=" + layerCreateCount.ToString() + " close=1")
}
