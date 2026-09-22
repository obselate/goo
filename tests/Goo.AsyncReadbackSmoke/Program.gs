package GooAsyncReadbackSmoke

import Goo
import GooPrimitiveFixture
import GooReadbackFixture
import System
import System.Collections.Generic
import System.Diagnostics
import System.IO
import System.Threading

class ReadbackSmokeCell : Cell {
  shared {
    let Root ElementHandle = ElementHandle{}
  }

  override func Build() Blob -> Container() {.Width: Percent(100),.Height: Percent(100),.Handle: ReadbackSmokeCell.Root,.Position: PositionType.Relative,.BackgroundColor: Color.Rgb(12, 20, 32),
    Container() {.Position: PositionType.Absolute,.Left: 8,.Top: 8,.Width: 48,.Height: 40,.Opacity: 0.5,
      Container{
            Width: Percent(100),
            Height: Percent(100),
            BackgroundColor: Color.Rgb(220, 40, 64),
          },
          Container{
            Width: Percent(100),
            Height: Percent(100),
            BackgroundColor: Color.Rgb(40, 80, 220),
      },
    },
  }
}

func Require(condition bool, message string) {
  if !condition {
    throw InvalidOperationException(message)
  }
}

func DiagnosticField(line string, name string) uint64? {
  let marker = "\"" + name + "\":"
  let fieldIndex = line.IndexOf(marker)
  if fieldIndex < 0 {
    return nil
  }
  let valueStart = fieldIndex + marker.Length
  let remaining = line.Substring(valueStart)
  let commaIndex = remaining.IndexOf(",")
  let valueText = if commaIndex < 0 {
    remaining.TrimEnd('}')
  } else {
    remaining.Substring(0, commaIndex)
  }
  try {
    return UInt64.Parse(valueText)
  } catch (error Exception) {
    return nil
  }
}

func DiagnosticCounter(diagnostics string, name string) uint64 {
  let marker = "\"kind\":\"counters\""
  let countersIndex = diagnostics.LastIndexOf(marker)
  if countersIndex < 0 {
    return 0uL
  }
  let lineEnd = diagnostics.IndexOf("\n", countersIndex)
  let line = if lineEnd < 0 {
    diagnostics.Substring(countersIndex)
  } else {
    diagnostics.Substring(countersIndex, lineEnd - countersIndex)
  }
  let value = DiagnosticField(line, name)
  return if let result = value { result } else { 0uL }
}

func DiagnosticExcerpt(diagnostics string, kind string) string {
  let marker = "{\"kind\":\"" + kind + "\""
  let start = diagnostics.LastIndexOf(marker)
  if start < 0 {
    return "missing"
  }
  let lineEnd = diagnostics.IndexOf("\n", start)
  let line = if lineEnd < 0 {
    diagnostics.Substring(start)
  } else {
    diagnostics.Substring(start, lineEnd - start)
  }
  return if line.Length > 512 { line.Substring(0, 512) } else { line }
}

func TicksToNanoseconds(ticks int64) int64 -> int64(float64(ticks) * 1000000000.0 / float64(Stopwatch.Frequency))

func ReadbackOpenCell(root ReadbackSmokeCell) Window {
  let opened = Window{
    Title: "Goo Readback async readback",
    Width: 64,
    Height: 64,
    VSync: false,
    Root: root,
  }
  opened.Open()
  return opened
}

func ReadbackReadbackArm() string {
  let arm = Environment.GetEnvironmentVariable("GOO_READBACK_ARM")
  if arm == "active" {
    return "active"
  }
  if arm == "disabled" || arm == nil || arm == "" {
    return "disabled"
  }
  throw InvalidOperationException("GOO_READBACK_ARM must be active or disabled")
}

func ReadbackAwaitReadbackReady(window Window, timeoutMs int32) {
  let timeoutTicks = int64(float64(Stopwatch.Frequency) * float64(timeoutMs) / 1000.0)
  let start = Stopwatch.GetTimestamp()
  while Stopwatch.GetTimestamp() - start < timeoutTicks {
    let status = WindowReadbackTestFixture.Poll(window)
    if status == VkConstants.VK_SUCCESS {
      return
    }
    Require(status == VkConstants.VK_NOT_READY,
      "Readback completion failed: " + status.ToString())
    Thread.Yield()
  }
  throw InvalidOperationException("Readback did not become ready within the timeout")
}

func ReadbackRequestReadbackUntilAccepted(window Window, width uint32, height uint32) {
  let timeoutTicks = int64(float64(Stopwatch.Frequency) * 1.0)
  let start = Stopwatch.GetTimestamp()
  var status = WindowReadbackTestFixture.Request(window, width, height)
  while status == WindowReadbackRequestStatus.Busy
    || status == WindowReadbackRequestStatus.NotReady{
      if Stopwatch.GetTimestamp() - start >= timeoutTicks {
        throw InvalidOperationException(
          "Readback request did not become accepted within the timeout")
      }
      WindowReadbackTestFixture.Pump(window, 0.0)
      Thread.Yield()
      status = WindowReadbackTestFixture.Request(window, width, height)
    }
  Require(status == WindowReadbackRequestStatus.Accepted,
    "Readback request was not accepted: " + status.ToString())
}

func ReadbackTakeReadback(window Window) VulkanReadbackResult {
  let result = WindowReadbackTestFixture.Take(window)
  if let ready = result {
    return ready
  }
  throw InvalidOperationException("Readback result was unavailable after completion")
}

func ReadbackBeginReadback(window Window) int64 {
  let requestStart = Stopwatch.GetTimestamp()
  ReadbackRequestReadbackUntilAccepted(window, 64u, 64u)
  return requestStart
}

func ReadbackFinishReadback(window Window, requestStart int64) int64 {
  ReadbackAwaitReadbackReady(window, 1000)
  let readyTicks = Stopwatch.GetTimestamp()
  let latency = readyTicks - requestStart
  ReadbackTakeReadback(window)
  return latency
}

func ReadbackPixel(pixels []uint8, x int32, y int32, channel int32) uint8 {
  let index = (y * 64 + x) * 4 + channel
  return pixels[index]
}

func ReadbackValidateReadbackResult(result VulkanReadbackResult) {
  Require(result.Width == 64u && result.Height == 64u,
    "Readback result extent is not 64x64")
  Require(result.RowBytes == 256u,
    "Readback result row bytes are not 256")
  Require(int32(result.Format) == 43,
    "Readback result format is not VK_FORMAT_R8G8B8A8_SRGB")
  Require(result.Generation > 0uL && result.SubmissionSerial > 0uL,
    "Readback result identity is invalid")
  Require(result.Premultiplied && !result.OriginBottomLeft && result.SrgbEncoded,
    "Readback result metadata is invalid")
  let pixels = result.Pixels
  Require(pixels.Length == 16384,
    "Readback result byte count is not 64x64 RGBA8")
  let topLeft = ReadbackPixel(pixels, 0, 0, 0).ToString()
  +"/" + ReadbackPixel(pixels, 0, 0, 1).ToString()
  +"/" + ReadbackPixel(pixels, 0, 0, 2).ToString()
  +"/" + ReadbackPixel(pixels, 0, 0, 3).ToString()
  Require((ReadbackPixel(pixels, 0, 0, 0) == uint8(12)
      || ReadbackPixel(pixels, 0, 0, 0) == uint8(13))
      && ReadbackPixel(pixels, 0, 0, 1) == uint8(20)
      && ReadbackPixel(pixels, 0, 0, 2) == uint8(32)
      && ReadbackPixel(pixels, 0, 0, 3) == uint8(255),
    "Readback top-left pixel is incorrect: " + topLeft)
  let center = ReadbackPixel(pixels, 32, 32, 0).ToString()
  +"/" + ReadbackPixel(pixels, 32, 32, 1).ToString()
  +"/" + ReadbackPixel(pixels, 32, 32, 2).ToString()
  +"/" + ReadbackPixel(pixels, 32, 32, 3).ToString()
  Require(Math.Abs(int32(ReadbackPixel(pixels, 32, 32, 0)) - 161) <= 1
      && Math.Abs(int32(ReadbackPixel(pixels, 32, 32, 1)) - 32) <= 1
      && Math.Abs(int32(ReadbackPixel(pixels, 32, 32, 2)) - 51) <= 1
      && ReadbackPixel(pixels, 32, 32, 3) == uint8(255),
    "Readback center pixel is incorrect: " + center)
}

func ReadbackValidateCommonDiagnostics(diagnostics string) {
  ReadbackValidateCommonDiagnostics(diagnostics, 0uL)
}

func ReadbackValidateCommonDiagnostics(diagnostics string, expectedResultFailureCount uint64) {
  Require(!diagnostics.Contains("\"kind\":\"fatal\""),
    "Readback render emitted a fatal diagnostic: "
    +DiagnosticExcerpt(diagnostics, "fatal")
    +" validation=" + DiagnosticExcerpt(diagnostics, "validation")
    +" validationError=" + DiagnosticExcerpt(diagnostics, "\"severity\":4096"))
  Require(DiagnosticCounter(diagnostics, "validationErrorCount") == 0uL,
    "Readback render validation error counter is nonzero: "
    +DiagnosticExcerpt(diagnostics, "validation"))
  let resultFailureCount = DiagnosticCounter(diagnostics, "resultFailureCount")
  Require(resultFailureCount == expectedResultFailureCount,
    "Readback render result failure count is " + resultFailureCount.ToString()
    +", expected " + expectedResultFailureCount.ToString())
  Require(DiagnosticCounter(diagnostics, "vulkanObjectCount") == 0uL,
    "Readback render leaked Vulkan objects")
}

func RunReadbackSmoke() {
  Require(Environment.GetEnvironmentVariable("GOO_VK_DIAGNOSTICS") == "1",
    "GOO_VK_DIAGNOSTICS=1 is required")
  let root = ReadbackSmokeCell{}
  let capturedError = StringWriter()
  let originalError = Console.Error
  Console.SetError(capturedError)
  var window Window? = nil
  var requestReadyNs int64 = 0L
  var residentBeforeClose uint64 = 0uL
  try {
    let opened = ReadbackOpenCell(root)
    window = opened
    WindowReadbackTestFixture.ForceRender(opened, 0.0)
    var frame int32 = 0
    while frame < 8 {
      WindowReadbackTestFixture.ForceRender(opened, 0.0166666666666667)
      frame = frame + 1
    }
    Require(ReadbackSmokeCell.Root.IsMounted
        && ReadbackSmokeCell.Root.BorderBox.Width == 64.0
        && ReadbackSmokeCell.Root.BorderBox.Height == 64.0,
      "Readback render smoke did not retain 64x64 geometry")
    let requestStart = ReadbackBeginReadback(opened)
    ReadbackAwaitReadbackReady(opened, 1000)
    let readyTicks = Stopwatch.GetTimestamp()
    let result = ReadbackTakeReadback(opened)
    ReadbackValidateReadbackResult(result)
    requestReadyNs = TicksToNanoseconds(readyTicks - requestStart)
    Require(requestReadyNs > 0L, "Readback request-to-ready latency is not positive")
    Require(WindowReadbackTestFixture.RequestCount(opened) == 1uL
        && WindowReadbackTestFixture.CompletionCount(opened) == 1uL,
      "Readback request and completion counts are incorrect")
    residentBeforeClose = WindowReadbackTestFixture.ResidentResourceBytes(opened)
    Require(residentBeforeClose >= 16384uL,
      "Readback staging resources are not resident after completion")
    opened.RequestClose()
    WindowReadbackTestFixture.ForceRender(opened, 0.0)
    Require(!opened.IsOpen, "Readback render smoke window did not close")
  } finally {
    Console.SetError(originalError)
    if let active = window {
      if active.IsOpen {
        active.RequestClose()
        WindowReadbackTestFixture.ForceRender(active, 0.0)
      }
    }
  }
  let diagnostics = capturedError.ToString()
  ReadbackValidateCommonDiagnostics(diagnostics)
  Console.WriteLine("readback: frames=9 width=64 height=64 row_bytes=256"
    +" bytes=16384 origin=top-left premultiplied=1 request_ready_ns="
    +requestReadyNs.ToString() + " resource_resident_before_close="
    +residentBeforeClose.ToString() + " resource_resident_after_close=0 cleanup=1 close=1")
}

func PrimitivePixelIndex(width uint32, x int32, y int32) int32 -> int32((uint64(y) * uint64(width) + uint64(x)) * 4uL)

func PrimitiveLogicalPixel(pixels []uint8, width uint32, metrics WindowMetrics,
  x float64, y float64) []uint8{
    let scaleX = if metrics.DisplayScaleX > 0.0 { metrics.DisplayScaleX } else { 1.0 }
    let scaleY = if metrics.DisplayScaleY > 0.0 { metrics.DisplayScaleY } else { 1.0 }
    let px = int32(Math.Floor(x * scaleX))
    let py = int32(Math.Floor(y * scaleY))
    let index = PrimitivePixelIndex(width, px, py)
    return []uint8{
      pixels[index],
      pixels[index + 1],
      pixels[index + 2],
      pixels[index + 3],
    }
  }

func PrimitivePixelText(pixel []uint8) string -> pixel[0].ToString() + "/" + pixel[1].ToString() + "/"
+pixel[2].ToString() + "/" + pixel[3].ToString()

func PrimitiveNear(pixel []uint8, red uint8, green uint8, blue uint8,
  tolerance int32) bool -> Math.Abs(int32(pixel[0]) - int32(red)) <= tolerance
  && Math.Abs(int32(pixel[1]) - int32(green)) <= tolerance
  && Math.Abs(int32(pixel[2]) - int32(blue)) <= tolerance
  && pixel[3] >= uint8(240)

func PrimitiveRequirePixelNear(pixels []uint8, width uint32, metrics WindowMetrics,
  x float64, y float64, red uint8, green uint8, blue uint8, tolerance int32,
  name string) {
    let pixel = PrimitiveLogicalPixel(pixels, width, metrics, x, y)
    if !PrimitiveNear(pixel, red, green, blue, tolerance) {
      throw InvalidOperationException("Primitive pixel " + name + " at "
        +x.ToString() + "," + y.ToString() + " was "
        +PrimitivePixelText(pixel))
    }
  }

func PrimitiveRequirePixelDifferent(pixels []uint8, width uint32, metrics WindowMetrics,
  x float64, y float64, red uint8, green uint8, blue uint8, tolerance int32,
  name string) {
    let pixel = PrimitiveLogicalPixel(pixels, width, metrics, x, y)
    let distance = Math.Abs(int32(pixel[0]) - int32(red))
    +Math.Abs(int32(pixel[1]) - int32(green))
    +Math.Abs(int32(pixel[2]) - int32(blue))
    if distance <= tolerance {
      throw InvalidOperationException("Primitive pixel " + name
        +" did not change: " + PrimitivePixelText(pixel))
    }
  }

func PrimitiveRequireBorderPattern(pixels []uint8, width uint32,
  metrics WindowMetrics, left int32, right int32, name string) {
    var painted int32 = 0
    var gaps int32 = 0
    var x = left
    while x <= right {
      let pixel = PrimitiveLogicalPixel(pixels, width, metrics, float64(x), 11.0)
      if PrimitiveNear(pixel, uint8(232), uint8(96), uint8(72), 24) {
        painted = painted + 1
      } else if PrimitiveNear(pixel, uint8(12), uint8(20), uint8(32), 16) {
        gaps = gaps + 1
      }
      x = x + 1
    }
    if painted == 0 || gaps == 0 {
      throw InvalidOperationException("Primitive " + name
        +" did not contain both painted coverage and gaps")
    }
  }

func PrimitiveRequireBlended(pixels []uint8, width uint32,
  metrics WindowMetrics, x float64, y float64, name string) {
    let pixel = PrimitiveLogicalPixel(pixels, width, metrics, x, y)
    if pixel[0] <= uint8(12) || pixel[0] >= uint8(232)
      || pixel[1] <= uint8(20) || pixel[1] >= uint8(196)
      || pixel[2] <= uint8(32) || pixel[2] >= uint8(48)
      || pixel[3] != uint8(255) {
        throw InvalidOperationException("Primitive pixel " + name + " was "
          +PrimitivePixelText(pixel))
      }
  }

func RequireTextCoverage(pixels []uint8, width uint32, metrics WindowMetrics,
  left int32, top int32, right int32, bottom int32, name string) {
    var covered int32 = 0
    var y = top
    while y <= bottom {
      var x = left
      while x <= right {
        let pixel = PrimitiveLogicalPixel(pixels, width, metrics, float64(x), float64(y))
        if pixel[0] >= uint8(180) && pixel[1] >= uint8(180)
          && pixel[2] >= uint8(180) && pixel[3] >= uint8(240) {
            covered = covered + 1
          }
        x = x + 1
      }
      y = y + 1
    }
    if covered < 3 {
      throw InvalidOperationException("Readback text " + name
        +" did not produce white coverage: " + covered.ToString())
    }
  }

func RequireColorCoverage(pixels []uint8, width uint32, metrics WindowMetrics,
  left int32, top int32, right int32, bottom int32, name string) {
    var covered int32 = 0
    var y = top
    while y <= bottom {
      var x = left
      while x <= right {
        let pixel = PrimitiveLogicalPixel(pixels, width, metrics, float64(x), float64(y))
        if pixel[3] >= uint8(240)
          && (pixel[0] > uint8(48) || pixel[1] > uint8(48) || pixel[2] > uint8(48)) {
            covered = covered + 1
          }
        x = x + 1
      }
      y = y + 1
    }
    if covered < 3 {
      throw InvalidOperationException("Readback color glyph " + name
        +" did not produce coverage: " + covered.ToString())
    }
  }

func PrimitiveValidateResult(result VulkanReadbackResult, metrics WindowMetrics) {
  let expectedBytes = uint64(result.Width) * uint64(result.Height) * 4uL
  Require(result.Width == uint32(metrics.FramebufferWidth)
      && result.Height == uint32(metrics.FramebufferHeight),
    "Primitive readback extent does not match the framebuffer")
  Require(result.RowBytes == result.Width * 4u,
    "Primitive readback row bytes are incorrect")
  Require(uint64(result.Pixels.Length) == expectedBytes,
    "Primitive readback byte count is incorrect")
  Require(int32(result.Format) == 43 && result.Premultiplied
      && !result.OriginBottomLeft && result.SrgbEncoded,
    "Primitive readback metadata is incorrect")
  Require(result.Generation > 0uL && result.SubmissionSerial > 0uL,
    "Primitive readback identity is invalid")
}

func PrimitiveReadback(window Window, metrics WindowMetrics) VulkanReadbackResult {
  Require(metrics.FramebufferWidth > 0 && metrics.FramebufferHeight > 0,
    "Primitive framebuffer metrics are invalid")
  ReadbackRequestReadbackUntilAccepted(window, uint32(metrics.FramebufferWidth),
    uint32(metrics.FramebufferHeight))
  ReadbackAwaitReadbackReady(window, 10000)
  let result = ReadbackTakeReadback(window)
  PrimitiveValidateResult(result, metrics)
  return result
}

data struct SmokeMode(Name string, Value string, Run Action) { }
func RunSelectedSmoke(modes []SmokeMode) bool {
  for mode in modes {
    let value = Environment.GetEnvironmentVariable(mode.Name)
    if (mode.Value == "" && !String.IsNullOrEmpty(value)) || value == mode.Value {
      mode.Run()
      return true
    }
  }
  return false
}

Window.ConfigureApplication("Goo Readback async readback smoke", "0.1.0", "io.github.obselate.goo.readback.readback")
let modes = []SmokeMode{
  SmokeMode("GOO_WINDOW_ACTIVATION_SMOKE", "1", () -> WindowActivationSmoke.Run()),
  SmokeMode("GOO_EMBEDDED_HOST_SMOKE", "1", () -> EmbeddedHostSmoke.Run()),
  SmokeMode("GOO_DIAGNOSTIC_CAPTURE_BUSY_SMOKE", "1", () -> DiagnosticCaptureFixture.Run()),
  SmokeMode("GOO_SHADER_EFFECT_SMOKE", "1", () -> RunShaderEffectSmoke()),
  SmokeMode("GOO_LIQUID_GLASS_ALPHA_SMOKE", "1", () -> RunLiquidGlassAlphaSmoke()),
  SmokeMode("GOO_FRAGMENT_CORRECTNESS_SMOKE", "1", () -> RunFragmentCorrectnessSmoke()),
  SmokeMode("GOO_PIPELINE_IDENTITY_SMOKE", "1", () -> RunPipelineIdentitySmoke()),
  SmokeMode("GOO_QUEUE_WAKE_SMOKE", "1", () -> RunQueueWakeSmoke()),
  SmokeMode("GOO_TIMELINE_COMPLETION_SMOKE", "1", () -> RunTimelineCompletionSmoke()),
  SmokeMode("GOO_PRIMITIVE_METRICS_SMOKE", "1", () -> RunPrimitiveUploadMetricsSmoke()),
  SmokeMode("GOO_IMAGE_FILE_SMOKE", "1", () -> RunImageFileSmoke()),
  SmokeMode("GOO_IMAGE_STAGING_SMOKE", "1", () -> RunImageStagingSmoke()),
  SmokeMode("GOO_ROUNDED_RESIZE_FIRST_FRAME_SMOKE", "1", () -> RunRoundedResizeFirstFrameSmoke()),
  SmokeMode("GOO_CLIP_CAPTURE_SMOKE", "1", () -> RunClipCaptureSmoke()),
  SmokeMode("GOO_SCROLLBAR_SMOKE", "1", () -> RunScrollbarSmoke()),
  SmokeMode("GOO_PORTAL_CAPTURE_SMOKE", "1", () -> RunPortalCaptureSmoke()),
}
if !RunSelectedSmoke(modes) { RunReadbackSmoke() }
