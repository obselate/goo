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

  override func Build() Blob -> Container() {.Width: Length.Percent(100),.Height: Length.Percent(100),.Position: PositionType.Relative,.BackgroundColor: Color.Rgb(12, 20, 32),
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
  var stableSlots uint32
  var attempt int32
  while attempt < 32 && stableSlots != 3u {
    let before = WindowReadbackTestFixture.DiagnosticCounters(window)
    WindowReadbackTestFixture.ForceRender(window, 0.0166666666666667)
    ShaderEffectWaitForGraphics(window)
    let after = WindowReadbackTestFixture.DiagnosticCounters(window)
    let primitive = WindowReadbackTestFixture.PrimitiveFrameRetention(window)
    if ShaderEffectDelta(after.vulkanObjectAllocationCount,
      before.vulkanObjectAllocationCount) == 0uL
      && ShaderEffectDelta(after.vulkanDeviceMemoryAllocationCount,
        before.vulkanDeviceMemoryAllocationCount) == 0uL
      && ShaderEffectDelta(after.layerPoolCreateCount,
        before.layerPoolCreateCount) == 0uL {
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

func RunShaderEffectSmoke() {
  WindowReadbackTestFixture.ShaderEffectVerifyPresentationRetirement()
  Require(Environment.GetEnvironmentVariable("GOO_VK_DIAGNOSTICS") == "1",
    "GOO_VK_DIAGNOSTICS=1 is required")
  let shaderPath = Path.Combine(AppContext.BaseDirectory, "control_effect.frag.goo-effect")
  Require(File.Exists(shaderPath), "Shader effect asset is missing")
  let program = ShaderEffectProgram.Load(shaderPath)
  let effect = ShaderEffect(program, true, 20.0F)
  let replacementEffect = ShaderEffect(program, true, 20.0F)
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
      Width: 192,
      Height: 128,
      VSync: false,
      Root: cell,
    }
    window = opened
    Console.SetError(capturedError)
    opened.Open()
    WindowReadbackTestFixture.ForceRender(opened, 0.0)
    WindowReadbackTestFixture.ForceRender(opened, 0.0166666666666667)
    let metrics = WindowReadbackTestFixture.Metrics(opened)
    Require(metrics.LogicalWidth == 192 && metrics.LogicalHeight == 128,
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
      dataCountersAfter.vulkanObjectAllocationCount,
      dataCountersBefore.vulkanObjectAllocationCount)
    let retainedDataMemoryAllocations = ShaderEffectDelta(
      dataCountersAfter.vulkanDeviceMemoryAllocationCount,
      dataCountersBefore.vulkanDeviceMemoryAllocationCount)
    Require(retainedDataObjectAllocations == 0uL && retainedDataMemoryAllocations == 0uL,
      "ShaderEffect retained data frame created Vulkan resources: objects="
      +retainedDataObjectAllocations.ToString() + " memory="
      +retainedDataMemoryAllocations.ToString() + " layers="
      +ShaderEffectDelta(dataCountersAfter.layerPoolCreateCount,
        dataCountersBefore.layerPoolCreateCount).ToString())
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
    warmObjectAllocations = ShaderEffectDelta(countersAfter.vulkanObjectAllocationCount,
      countersBefore.vulkanObjectAllocationCount)
    warmDeviceMemoryAllocations = ShaderEffectDelta(countersAfter.vulkanDeviceMemoryAllocationCount,
      countersBefore.vulkanDeviceMemoryAllocationCount)
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

    opened.Width = 176
    opened.Height = 120
    var resizeAttempt int32
    var resizedMetrics = WindowReadbackTestFixture.Metrics(opened)
    while (resizedMetrics.LogicalWidth != 176 || resizedMetrics.LogicalHeight != 120)
      && resizeAttempt < 1000 {
        WindowReadbackTestFixture.PumpNativeEvents()
        WindowReadbackTestFixture.Pump(opened, 0.0)
        resizedMetrics = WindowReadbackTestFixture.Metrics(opened)
        resizeAttempt++
      }
    Require(resizedMetrics.LogicalWidth == 176 && resizedMetrics.LogicalHeight == 120,
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
    Require(WindowReadbackTestFixture.Resize(opened, 176, 120, 264, 180),
      "Shader effect synthetic 1.5x resize failed")
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

    let recoveryBefore = WindowReadbackTestFixture.DiagnosticCounters(opened).deviceRecoveryCount
    VulkanSharedRuntime.FailNextGraphicsSubmissionForTest()
    effect.SetParameter(0, Vector4(1.0F, 0.25F, 0.25F, 0.0F))
    WindowReadbackTestFixture.ForceRender(opened, 0.0166666666666667)
    deviceRecoveries = ShaderEffectDelta(
      WindowReadbackTestFixture.DiagnosticCounters(opened).deviceRecoveryCount,
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
