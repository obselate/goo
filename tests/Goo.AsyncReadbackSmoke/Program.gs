package GooAsyncReadbackSmoke

import System
import System.Diagnostics
import System.IO
import System.Collections.Generic
import System.Threading
import Goo
import GooPrimitiveFixture
import GooReadbackFixture

class ReadbackSmokeCell : Cell {
  shared {
    let Root ElementHandle = ElementHandle{}
  }

  override func Build() Blob -> Container {
    Width: Length.Percent(100),
    Height: Length.Percent(100),
    Handle: ReadbackSmokeCell.Root,
    Position: PositionType.Relative,
    BackgroundColor: Color.Rgb(12, 20, 32),
    Children: {
      Container{
        Position: PositionType.Absolute,
        Left: 8,
        Top: 8,
        Width: 48,
        Height: 40,
        Opacity: 0.5,
        Children: {
          Container{
            Width: Length.Percent(100),
            Height: Length.Percent(100),
            BackgroundColor: Color.Rgb(220, 40, 64),
          },
          Container{
            Width: Length.Percent(100),
            Height: Length.Percent(100),
            BackgroundColor: Color.Rgb(40, 80, 220),
          },
        },
      },
    },
  }
}

class RetentionCell : Cell {
  private var ColorChanged bool
  private var BoundsChanged bool
  private var ExtraVisible bool
  private var UnsupportedFeature bool
  private var ParentColorChanged bool
  private var ParentUnsupportedFeature bool
  private var BorderColorChanged bool
  private var BorderUnsupportedFeature bool

  shared {
    let Root ElementHandle = ElementHandle{}
    let StableTop ElementHandle = ElementHandle{}
    let MutatedBox ElementHandle = ElementHandle{}
    let StableBottom ElementHandle = ElementHandle{}
    let RoundedBox ElementHandle = ElementHandle{}
    let BorderLeaf ElementHandle = ElementHandle{}
  }

  init() {
    ColorChanged = false
    BoundsChanged = false
    ExtraVisible = false
    UnsupportedFeature = false
    ParentColorChanged = false
    ParentUnsupportedFeature = false
    BorderColorChanged = false
    BorderUnsupportedFeature = false
  }

  func MutateBox() {
    ColorChanged = true
    Rebuild()
  }

  func MutateBounds() {
    BoundsChanged = true
    Rebuild()
  }

  func MutateParentBox() {
    ParentColorChanged = true
    Rebuild()
  }

  func ToggleExtra() {
    ExtraVisible = !ExtraVisible
    Rebuild()
  }

  func ToggleUnsupportedFeature() {
    UnsupportedFeature = !UnsupportedFeature
    Rebuild()
  }

  func ToggleParentUnsupportedFeature() {
    ParentUnsupportedFeature = !ParentUnsupportedFeature
    Rebuild()
  }

  func MutateBorder() {
    BorderColorChanged = !BorderColorChanged
    Rebuild()
  }

  func ToggleBorderUnsupportedFeature() {
    BorderUnsupportedFeature = !BorderUnsupportedFeature
    Rebuild()
  }

  override func Build() Blob {
    let children = List[Blob](6)
    children.Add(Container{
      Key: "retained-stable-top",
      Position: PositionType.Absolute,
      Left: 8,
      Top: 8,
      Width: 64,
      Height: 32,
      Handle: RetentionCell.StableTop,
      BackgroundColor: Color.Rgb(42, 112, 188),
    })
    children.Add(Container{
      Key: "retained-mutated-box",
      Position: PositionType.Absolute,
      Left: if BoundsChanged { 104 } else { 88 },
      Top: 8,
      Width: 64,
      Height: 32,
      Handle: RetentionCell.MutatedBox,
      BackgroundColor: if ColorChanged {
        Color.Rgb(40, 220, 96)
      } else {
        Color.Rgb(220, 40, 64)
      },
    })
    children.Add(Container{
      Key: "retained-stable-bottom",
      Position: PositionType.Absolute,
      Left: 8,
      Top: 56,
      Width: 64,
      Height: 32,
      Handle: RetentionCell.StableBottom,
      BackgroundColor: Color.Rgb(196, 224, 88),
    })
    children.Add(Container{
      Key: "retained-rounded-box",
      Position: PositionType.Absolute,
      Left: 88,
      Top: 56,
      Width: 64,
      Height: 32,
      Handle: RetentionCell.RoundedBox,
      BorderTopLeftRadius: 4,
      BorderTopRightRadius: 8,
      BorderBottomRightRadius: 12,
      BorderBottomLeftRadius: 16,
      OverflowX: if UnsupportedFeature { Overflow.Hidden } else { Overflow.Visible },
      BackgroundColor: Color.Rgb(72, 180, 212),
    })
    children.Add(Container{
      Key: "retained-border-leaf",
      Position: PositionType.Absolute,
      Left: 168,
      Top: 8,
      Width: 64,
      Height: 32,
      Handle: RetentionCell.BorderLeaf,
      BorderStyle: BorderStyle.Solid,
      BorderTopWidth: 2,
      BorderRightWidth: 3,
      BorderBottomWidth: 4,
      BorderLeftWidth: 5,
      BorderRadius: if BorderUnsupportedFeature { 6 } else { 0 },
      BorderTopColor: if BorderColorChanged {
        Color.Rgb(248, 196, 48)
      } else {
        Color.Rgb(232, 96, 72)
      },
      BorderRightColor: Color.Rgb(96, 224, 128),
      BorderBottomColor: Color.Rgb(72, 144, 232),
      BorderLeftColor: Color.Rgb(224, 184, 72),
    })
    if ExtraVisible {
      children.Add(Container{
        Key: "retained-extra-box",
        Position: PositionType.Absolute,
        Left: 168,
        Top: 56,
        Width: 64,
        Height: 32,
        BackgroundColor: Color.Rgb(128, 72, 220),
      })
    }
    return Container{
      Width: Length.Percent(100),
      Height: Length.Percent(100),
      Handle: RetentionCell.Root,
      Position: PositionType.Relative,
      BackgroundColor: if ParentColorChanged {
        Color.Rgb(18, 30, 48)
      } else {
        Color.Rgb(12, 20, 32)
      },
      OverflowX: if ParentUnsupportedFeature {
        Overflow.Hidden
      } else {
        Overflow.Visible
      },
      Children: children,
    }
  }
}

class RecordingAccessibilityAdapter : AccessibilityAdapter {
  internal var Tree AccessibilityTree?
  internal var Updates int32

  public func Update(tree AccessibilityTree) {
    Tree = tree
    Updates++
  }
}

class ProtectedTextCell : Cell {
  shared {
    let Entry ElementHandle = ElementHandle{}
    let Control ElementHandle = ElementHandle{}
  }

  internal var LastValue string
  internal var CompositionText string
  internal var CompositionCount int32

  init() {
    LastValue = ""
    CompositionText = ""
  }

  override func Build() Blob -> Container {
    Width: 320,
    Height: 96,
    Position: PositionType.Relative,
    BackgroundColor: Color.Rgb(12, 20, 32),
    Children: {
      TextEntry{
        Handle: ProtectedTextCell.Entry,
        Position: PositionType.Absolute,
        Left: 0,
        Top: 0,
        Width: 320,
        Height: 44,
        Padding: 6,
        FontFamily: "InputGateFont",
        FontSize: 20,
        Color: Color.Rgb(240, 244, 248),
        Value: "a\u0301👨‍👩‍👧‍👦b",
        Password: true,
        Accessibility: Accessibility{ Value: "metadata-secret" },
        OnChange: func(value string) { LastValue = value },
        OnTextComposition: func(value TextCompositionEvent) {
          CompositionText = value.Text
          CompositionCount++
        },
      },
      TextEntry{
        Handle: ProtectedTextCell.Control,
        Position: PositionType.Absolute,
        Left: 0,
        Top: 48,
        Width: 320,
        Height: 44,
        Padding: 6,
        FontFamily: "InputGateFont",
        FontSize: 20,
        Color: Color.Rgb(240, 244, 248),
        Value: "•••",
        Accessibility: Accessibility{ Hidden: true },
      },
    },
  }
}

class InputAccessibilityCell : Cell {
  private var disabled bool
  private var motion Anim[float64]

  shared {
    let Target ElementHandle = ElementHandle{}
    let ScrollViewport ElementHandle = ElementHandle{}
    let ScrollLeaf ElementHandle = ElementHandle{}
    let MotionBox ElementHandle = ElementHandle{}
  }

  internal var PointerEnterCount int32
  internal var PointerLeaveCount int32
  internal var PointerDownCount int32
  internal var PointerUpCount int32
  internal var ClickCount int32
  internal var FocusCount int32
  internal var BlurCount int32
  internal var KeyDownCount int32
  internal var KeyUpCount int32
  internal var TargetWheelCount int32
  internal var ScrollWheelCount int32

  init() {
    disabled = false
    motion = Animate(0.0)
  }

  internal func DisableTarget() {
    disabled = true
    Rebuild()
  }

  internal func StartMotion() {
    motion.To(64.0)
  }

  internal prop MotionRunning bool{ get -> motion.Running }

  override func Build() Blob -> Container {
    Width: 320,
    Height: 176,
    Position: PositionType.Relative,
    BackgroundColor: Color.Rgb(12, 20, 32),
    Children: {
      Button{
        Handle: InputAccessibilityCell.Target,
        Position: PositionType.Absolute,
        Left: 8,
        Top: 8,
        Width: 96,
        Height: 64,
        Focusable: true,
        Disabled: disabled,
        BackgroundColor: Color.Rgb(208, 48, 64),
        BorderWidth: 4,
        BorderColor: Color.Rgb(24, 32, 48),
        Hover: Style{ BackgroundColor: Color.Rgb(48, 208, 96) },
        Active: Style{ BackgroundColor: Color.Rgb(64, 96, 232) },
        Focus: Style{ BorderColor: Color.Rgb(248, 196, 48) },
        DisabledStyle: Style{
          BackgroundColor: Color.Rgb(112, 120, 132),
          BorderColor: Color.Rgb(80, 88, 100),
        },
        TransitionMs: 100,
        TransitionProperties: []TransitionProperty{ TransitionProperty.BackgroundColor },
        Accessibility: Accessibility{
          Role: AccessibilityRole.Button,
          Name: "Input action",
        },
        OnPointerEnter: func(value PointerEvent) { PointerEnterCount++ },
        OnPointerLeave: func(value PointerEvent) { PointerLeaveCount++ },
        OnPointerDown: func(value PointerEvent) { PointerDownCount++ },
        OnPointerUp: func(value PointerEvent) { PointerUpCount++ },
        OnClick: func() { ClickCount++ },
        OnFocus: func(value FocusEvent) { FocusCount++ },
        OnBlur: func(value FocusEvent) { BlurCount++ },
        OnKeyDown: func(value KeyEvent) { KeyDownCount++ },
        OnKeyUp: func(value KeyEvent) { KeyUpCount++ },
        OnWheel: func(value WheelEvent) { TargetWheelCount++ },
      },
      Container{
        Handle: InputAccessibilityCell.MotionBox,
        Position: PositionType.Absolute,
        Left: 144.0 + motion.Value,
        Top: 8,
        Width: 32,
        Height: 32,
        BackgroundColor: Color.Rgb(72, 144, 232),
      },
      Container{
        Handle: InputAccessibilityCell.ScrollViewport,
        Position: PositionType.Absolute,
        Left: 8,
        Top: 88,
        Width: 120,
        Height: 72,
        OverflowY: Overflow.Scroll,
        BackgroundColor: Color.Rgb(24, 32, 48),
        Children: {
          Container{
            Handle: InputAccessibilityCell.ScrollLeaf,
            Width: 120,
            Height: 176,
            BackgroundColor: Color.Rgb(96, 176, 216),
            OnWheel: func(value WheelEvent) { ScrollWheelCount++ },
          },
        },
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
  if line.Length > 512 {
    return line.Substring(0, 512)
  }
  return line
}

func EnvironmentCount(name string, fallback int32, maximum int32) int32 {
  let text = Environment.GetEnvironmentVariable(name)
  if text == nil || text == "" {
    return fallback
  }
  var value int32
  try {
    value = int32(UInt64.Parse(text!!))
  } catch (error Exception) {
    throw InvalidOperationException(name + " must be an integer")
  }
  if value < 0 || value > maximum {
    throw InvalidOperationException(name + " is outside the supported range")
  }
  return value
}

func TicksToNanoseconds(ticks int64) int64 -> int64(float64(ticks) * 1000000000.0 / float64(Stopwatch.Frequency))

func Percentile(values []int64, percentile float64) int64 {
  let sorted = [values.Length]int64
  Array.Copy(values, sorted, values.Length)
  Array.Sort(sorted)
  let rawIndex = int32(Math.Ceiling(float64(sorted.Length) * percentile)) - 1
  let index = if rawIndex < 0 { 0 } else if rawIndex >= sorted.Length { sorted.Length - 1 } else { rawIndex }
  return sorted[index]
}

func Maximum(values []int64) int64 {
  var maximum int64 = 0L
  var index int32 = 0
  while index < values.Length {
    if values[index] > maximum {
      maximum = values[index]
    }
    index = index + 1
  }
  return maximum
}

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

func RunOffscreenFailureSmoke() {
  Require(Environment.GetEnvironmentVariable("GOO_VK_DIAGNOSTICS") == "1",
    "GOO_VK_DIAGNOSTICS=1 is required")
  let root = ReadbackSmokeCell{}
  let capturedError = StringWriter()
  let originalError = Console.Error
  Console.SetError(capturedError)
  var window Window? = nil
  var accepted = false
  var deviceLoss = false
  var storageCleared = false
  var close = false
  try {
    let opened = ReadbackOpenCell(root)
    window = opened
    let staged = WindowReadbackTestFixture.Request(opened, 64u, 64u)
    Require(staged == WindowReadbackRequestStatus.NotReady,
      "D02 offscreen failure request did not stage the window prerequisite")
    WindowReadbackTestFixture.DrainWindowQueue(opened, 2000)
    VulkanSharedRuntime.FailNextGraphicsSubmissionForTest()
    let retry = WindowReadbackTestFixture.Request(opened, 64u, 64u)
    accepted = retry == WindowReadbackRequestStatus.Accepted
    Require(accepted,
      "D02 offscreen failure retry was not accepted: " + retry.ToString())
    let timeoutTicks = int64(float64(Stopwatch.Frequency) * 2.0)
    let start = Stopwatch.GetTimestamp()
    var result = WindowReadbackTestFixture.Poll(opened)
    while result == VkConstants.VK_NOT_READY {
      if Stopwatch.GetTimestamp() - start >= timeoutTicks {
        throw InvalidOperationException("D02 offscreen failure did not complete within the timeout")
      }
      WindowReadbackTestFixture.Pump(opened, 0.0)
      Thread.Yield()
      result = WindowReadbackTestFixture.Poll(opened)
    }
    deviceLoss = result == VkConstants.VK_ERROR_DEVICE_LOST
    Require(deviceLoss,
      "D02 offscreen failure did not report VK_ERROR_DEVICE_LOST: " + result.ToString())
    storageCleared = WindowReadbackTestFixture.ResidentResourceBytes(opened) == 0uL
    Require(storageCleared,
      "D02 offscreen failure left readback storage resident")
    let followup = WindowReadbackTestFixture.Request(opened, 64u, 64u)
    Require(followup != WindowReadbackRequestStatus.Busy,
      "D02 offscreen failure left a readback request Busy")
    WindowReadbackTestFixture.ForceRender(opened, 0.0)
    Require(opened.IsOpen,
      "D02 offscreen failure window did not recover before close")
    opened.RequestClose()
    WindowReadbackTestFixture.ForceRender(opened, 0.0)
    close = !opened.IsOpen
    Require(close, "D02 offscreen failure window did not close")
  } finally {
    if let active = window {
      if active.IsOpen {
        active.RequestClose()
        WindowReadbackTestFixture.ForceRender(active, 0.0)
      }
    }
    Console.SetError(originalError)
  }
  let diagnostics = capturedError.ToString()
  ReadbackValidateCommonDiagnostics(diagnostics, 1uL)
  Console.WriteLine("d02-offscreen-failure-gate: accepted=" + (if accepted { "1" } else { "0" })
    +" device_loss=" + (if deviceLoss { "1" } else { "0" })
    +" storage_cleared=" + (if storageCleared { "1" } else { "0" })
    +" close=" + (if close { "1" } else { "0" }))
}

func ReadbackRunCalibration(values []int64) {
  var index int32 = 0
  var sink int64 = 0L
  while index < values.Length {
    let beforeBytes = GC.GetAllocatedBytesForCurrentThread()
    let start = Stopwatch.GetTimestamp()
    sink = sink + beforeBytes
    let end = Stopwatch.GetTimestamp()
    let afterBytes = GC.GetAllocatedBytesForCurrentThread()
    sink = sink + afterBytes
    values[index] = end - start
    index = index + 1
  }
  if sink == 0L {
    throw InvalidOperationException("Readback timing calibration did not execute")
  }
}

func RunReadbackReadbackMeasure() {
  Require(Environment.GetEnvironmentVariable("GOO_VK_DIAGNOSTICS") == "1",
    "GOO_VK_DIAGNOSTICS=1 is required")
  let arm = ReadbackReadbackArm()
  let warmup = EnvironmentCount("GOO_READBACK_WARMUP", 8, 64)
  let samplesCount = EnvironmentCount("GOO_READBACK_SAMPLES", 64, 512)
  Require(samplesCount > 0, "GOO_READBACK_SAMPLES must be positive")
  let frameTicks = [samplesCount]int64
  let frameAllocations = [samplesCount]int64
  let timerOverhead = [samplesCount]int64
  let requestReadyTicks = [samplesCount]int64
  let requestCpuTicks = [samplesCount]int64
  let normalRecordTicks = [samplesCount]int64
  let completionObservedTicks = [samplesCount]int64
  let cpuCopyTicks = [samplesCount]int64
  let objectCreateDeltas = [samplesCount]uint64
  let objectDestroyDeltas = [samplesCount]uint64
  let requestAllocations = [samplesCount]int64
  let completionAllocations = [samplesCount]int64
  let totalAllocations = [samplesCount]int64
  let gpuSceneReplayValues = [samplesCount]int64
  let gpuCopyValues = [samplesCount]int64
  let root = ReadbackSmokeCell{}
  let capturedError = StringWriter()
  let originalError = Console.Error
  Console.SetError(capturedError)
  var window Window? = nil
  var warmAllocated int64 = 0L
  var requestCountBeforeSamples uint64 = 0uL
  var completionCountBeforeSamples uint64 = 0uL
  var requestCountAfterSamples uint64 = 0uL
  var completionCountAfterSamples uint64 = 0uL
  var takeCountAfterSamples uint64 = 0uL
  var residentPeak uint64 = 0uL
  var residentBeforeClose uint64 = 0uL
  var requestedBytes uint64 = 0uL
  var warmupObjectCreateDelta uint64 = 0uL
  var gpuTimingSampleCount int32 = 0
  try {
    let opened = ReadbackOpenCell(root)
    window = opened
    WindowReadbackTestFixture.ForceRender(opened, 0.0)
    let warmStartBytes = GC.GetAllocatedBytesForCurrentThread()
    var warmIndex int32 = 0
    while warmIndex < warmup {
      if arm == "active" {
        let requestStart = ReadbackBeginReadback(opened)
        ReadbackFinishReadback(opened, requestStart)
        let timing = WindowReadbackTestFixture.Timing(opened)
        warmupObjectCreateDelta = warmupObjectCreateDelta + timing.ObjectCreateDelta
      } else {
        WindowReadbackTestFixture.ForceRender(opened, 0.0166666666666667)
      }
      warmIndex = warmIndex + 1
    }
    warmAllocated = GC.GetAllocatedBytesForCurrentThread() - warmStartBytes
    requestCountBeforeSamples = WindowReadbackTestFixture.RequestCount(opened)
    completionCountBeforeSamples = WindowReadbackTestFixture.CompletionCount(opened)
    residentPeak = WindowReadbackTestFixture.ResidentResourceBytes(opened)
    var sampleIndex int32 = 0
    while sampleIndex < samplesCount {
      let beforeBytes = GC.GetAllocatedBytesForCurrentThread()
      let start = Stopwatch.GetTimestamp()
      var requestStart int64 = 0L
      if arm == "active" {
        requestStart = ReadbackBeginReadback(opened)
      } else {
        WindowReadbackTestFixture.ForceRender(opened, 0.0166666666666667)
      }
      let end = Stopwatch.GetTimestamp()
      let afterRequestBytes = GC.GetAllocatedBytesForCurrentThread()
      frameTicks[sampleIndex] = end - start
      requestAllocations[sampleIndex] = afterRequestBytes - beforeBytes
      frameAllocations[sampleIndex] = requestAllocations[sampleIndex]
      if arm == "active" {
        let beforeCompletionBytes = GC.GetAllocatedBytesForCurrentThread()
        ReadbackAwaitReadbackReady(opened, 1000)
        let readyTicks = Stopwatch.GetTimestamp()
        ReadbackTakeReadback(opened)
        let afterTakeBytes = GC.GetAllocatedBytesForCurrentThread()
        completionAllocations[sampleIndex] = afterTakeBytes - beforeCompletionBytes
        totalAllocations[sampleIndex] = afterTakeBytes - beforeBytes
        takeCountAfterSamples = takeCountAfterSamples + 1uL
        let timing = WindowReadbackTestFixture.Timing(opened)
        Require(timing.ReadyTicks >= timing.RequestStartTicks
            && timing.RecordTicks >= timing.RequestStartTicks
            && timing.SubmitTicks >= timing.RecordTicks
            && timing.CpuCopyStartTicks >= timing.SubmitTicks
            && timing.CpuCopyEndTicks >= timing.CpuCopyStartTicks
            && timing.ReadyTicks >= timing.CpuCopyEndTicks,
          "Readback active measurement timing snapshot is invalid")
        normalRecordTicks[sampleIndex] = timing.RecordTicks - timing.RequestStartTicks
        requestCpuTicks[sampleIndex] = timing.SubmitTicks - timing.RequestStartTicks
        completionObservedTicks[sampleIndex] = timing.CpuCopyStartTicks - timing.RequestStartTicks
        requestReadyTicks[sampleIndex] = timing.ReadyTicks - timing.RequestStartTicks
        Require(readyTicks >= timing.ReadyTicks,
          "Readback active measurement ready timestamp is invalid")
        cpuCopyTicks[sampleIndex] = timing.CpuCopyEndTicks - timing.CpuCopyStartTicks
        objectCreateDeltas[sampleIndex] = timing.ObjectCreateDelta
        objectDestroyDeltas[sampleIndex] = timing.ObjectDestroyDelta
        requestedBytes = uint64(timing.RequestedByteSize)
        if timing.GpuTimingAvailable {
          gpuSceneReplayValues[gpuTimingSampleCount] =
          int64(timing.GpuSceneReplayNanoseconds)
          gpuCopyValues[gpuTimingSampleCount] = int64(timing.GpuCopyNanoseconds)
          gpuTimingSampleCount = gpuTimingSampleCount + 1
        }
      }
      let resident = WindowReadbackTestFixture.ResidentResourceBytes(opened)
      if resident > residentPeak {
        residentPeak = resident
      }
      sampleIndex = sampleIndex + 1
    }
    requestCountAfterSamples = WindowReadbackTestFixture.RequestCount(opened)
    completionCountAfterSamples = WindowReadbackTestFixture.CompletionCount(opened)
    residentBeforeClose = WindowReadbackTestFixture.ResidentResourceBytes(opened)
    ReadbackRunCalibration(timerOverhead)
    Require(ReadbackSmokeCell.Root.IsMounted,
      "Readback measurement lost the root mount")
    opened.RequestClose()
    WindowReadbackTestFixture.ForceRender(opened, 0.0)
    Require(!opened.IsOpen, "Readback measurement window did not close")
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
  let frameNs = [samplesCount]int64
  let allocationValues = [samplesCount]int64
  let requestAllocationValues = [samplesCount]int64
  let completionAllocationValues = [samplesCount]int64
  let totalAllocationValues = [samplesCount]int64
  let overheadNs = [samplesCount]int64
  let requestCpuNs = [samplesCount]int64
  let normalRecordNs = [samplesCount]int64
  let completionObservedNs = [samplesCount]int64
  let requestReadyNs = [samplesCount]int64
  let cpuCopyNs = [samplesCount]int64
  var objectCreateDeltaTotal uint64 = warmupObjectCreateDelta
  var objectDestroyDeltaTotal uint64 = 0uL
  var index int32 = 0
  while index < samplesCount {
    frameNs[index] = TicksToNanoseconds(frameTicks[index])
    allocationValues[index] = frameAllocations[index]
    requestAllocationValues[index] = requestAllocations[index]
    completionAllocationValues[index] = completionAllocations[index]
    totalAllocationValues[index] = totalAllocations[index]
    overheadNs[index] = TicksToNanoseconds(timerOverhead[index])
    normalRecordNs[index] = TicksToNanoseconds(normalRecordTicks[index])
    requestCpuNs[index] = TicksToNanoseconds(requestCpuTicks[index])
    completionObservedNs[index] = TicksToNanoseconds(completionObservedTicks[index])
    requestReadyNs[index] = TicksToNanoseconds(requestReadyTicks[index])
    cpuCopyNs[index] = TicksToNanoseconds(cpuCopyTicks[index])
    objectCreateDeltaTotal = objectCreateDeltaTotal + objectCreateDeltas[index]
    objectDestroyDeltaTotal = objectDestroyDeltaTotal + objectDestroyDeltas[index]
    index = index + 1
  }
  var gpuTimingAvailable bool = false
  var gpuSceneReplayP95 int64 = 0L
  var gpuSceneReplayMax int64 = 0L
  var gpuCopyP95 int64 = 0L
  var gpuCopyMax int64 = 0L
  if gpuTimingSampleCount > 0 {
    let gpuSceneTimingValues = [gpuTimingSampleCount]int64
    let gpuCopyTimingValues = [gpuTimingSampleCount]int64
    var gpuIndex int32 = 0
    while gpuIndex < gpuTimingSampleCount {
      gpuSceneTimingValues[gpuIndex] = gpuSceneReplayValues[gpuIndex]
      gpuCopyTimingValues[gpuIndex] = gpuCopyValues[gpuIndex]
      gpuIndex = gpuIndex + 1
    }
    gpuTimingAvailable = true
    gpuSceneReplayP95 = Percentile(gpuSceneTimingValues, 0.95)
    gpuSceneReplayMax = Maximum(gpuSceneTimingValues)
    gpuCopyP95 = Percentile(gpuCopyTimingValues, 0.95)
    gpuCopyMax = Maximum(gpuCopyTimingValues)
  }
  let frameP50 = Percentile(frameNs, 0.50)
  let frameP95 = Percentile(frameNs, 0.95)
  let frameP99 = Percentile(frameNs, 0.99)
  let frameP999 = Percentile(frameNs, 0.999)
  let overheadP95 = Percentile(overheadNs, 0.95)
  let allocationP95 = Percentile(allocationValues, 0.95)
  let allocationMax = Maximum(allocationValues)
  var requestAllocationP95 int64 = 0L
  var completionAllocationP95 int64 = 0L
  var totalAllocationP95 int64 = 0L
  if arm == "active" {
    requestAllocationP95 = Percentile(requestAllocationValues, 0.95)
    completionAllocationP95 = Percentile(completionAllocationValues, 0.95)
    totalAllocationP95 = Percentile(totalAllocationValues, 0.95)
  }
  var requestReadyP95 int64 = 0L
  var requestReadyMax int64 = 0L
  var normalRecordP95 int64 = 0L
  var normalRecordMax int64 = 0L
  var requestCpuP95 int64 = 0L
  var requestCpuMax int64 = 0L
  var completionObservedP95 int64 = 0L
  var completionObservedMax int64 = 0L
  var cpuCopyP95 int64 = 0L
  var cpuCopyMax int64 = 0L
  if arm == "active" {
    normalRecordP95 = Percentile(normalRecordNs, 0.95)
    normalRecordMax = Maximum(normalRecordNs)
    requestReadyP95 = Percentile(requestReadyNs, 0.95)
    requestReadyMax = Maximum(requestReadyNs)
    requestCpuP95 = Percentile(requestCpuNs, 0.95)
    requestCpuMax = Maximum(requestCpuNs)
    completionObservedP95 = Percentile(completionObservedNs, 0.95)
    completionObservedMax = Maximum(completionObservedNs)
    cpuCopyP95 = Percentile(cpuCopyNs, 0.95)
    cpuCopyMax = Maximum(cpuCopyNs)
  }
  let requestDelta = requestCountAfterSamples - requestCountBeforeSamples
  let completionDelta = completionCountAfterSamples - completionCountBeforeSamples
  let takeDelta = takeCountAfterSamples
  if arm == "active" {
    Require(requestDelta == uint64(samplesCount),
      "Readback active measurement request count is incomplete")
    Require(completionDelta == uint64(samplesCount),
      "Readback active measurement completion count is incomplete")
    Require(takeDelta == uint64(samplesCount),
      "Readback active measurement result take count is incomplete")
    Require(requestedBytes == 16384uL,
      "Readback active measurement requested region byte size is incorrect")
    Require(residentBeforeClose > 0uL && residentPeak == residentBeforeClose,
      "Readback active measurement readback residency did not reuse one pool slot")
  } else {
    Require(requestDelta == 0uL && completionDelta == 0uL && takeDelta == 0uL,
      "Readback disabled measurement performed readback work")
    Require(residentPeak == 0uL && residentBeforeClose == 0uL,
      "Readback disabled measurement retained readback resources")
  }
  let requireZero = Environment.GetEnvironmentVariable("GOO_READBACK_REQUIRE_ZERO_ALLOC") == "1"
  if requireZero && arm == "disabled" {
    Require(allocationMax == 0L,
      "Readback disabled warm frame allocated managed memory")
  }
  Console.WriteLine("readback-measure: arm=" + arm
    +" warmup=" + warmup.ToString()
    +" samples=" + samplesCount.ToString()
    +" frame_p50_ns=" + frameP50.ToString()
    +" frame_p95_ns=" + frameP95.ToString()
    +" frame_p99_ns=" + frameP99.ToString()
    +" frame_p999_ns=" + frameP999.ToString()
    +" frame_max_ns=" + Maximum(frameNs).ToString()
    +" harness_p95_ns=" + overheadP95.ToString()
    +" alloc_p95_B=" + allocationP95.ToString()
    +" alloc_max_B=" + allocationMax.ToString()
    +" request_alloc_p95_B=" + requestAllocationP95.ToString()
    +" completion_alloc_p95_B=" + completionAllocationP95.ToString()
    +" total_request_alloc_p95_B=" + totalAllocationP95.ToString()
    +" warm_alloc_B=" + warmAllocated.ToString()
    +" readback_request_delta=" + requestDelta.ToString()
    +" readback_completion_delta=" + completionDelta.ToString()
    +" readback_take_delta=" + takeDelta.ToString()
    +" normal_scene_record_cpu_p95_ns=" + normalRecordP95.ToString()
    +" normal_scene_record_cpu_max_ns=" + normalRecordMax.ToString()
    +" request_submit_cpu_p95_ns=" + requestCpuP95.ToString()
    +" request_submit_cpu_max_ns=" + requestCpuMax.ToString()
    +" completion_observed_before_copy_p95_ns=" + completionObservedP95.ToString()
    +" completion_observed_before_copy_max_ns=" + completionObservedMax.ToString()
    +" request_ready_after_copy_p95_ns=" + requestReadyP95.ToString()
    +" request_ready_after_copy_max_ns=" + requestReadyMax.ToString()
    +" cpu_copy_p95_ns=" + cpuCopyP95.ToString()
    +" cpu_copy_max_ns=" + cpuCopyMax.ToString()
    +" gpu_timing_available=" + (if gpuTimingAvailable { "1" } else { "0" })
    +" gpu_timing_samples=" + gpuTimingSampleCount.ToString()
    +" gpu_scene_replay_p95_ns=" + gpuSceneReplayP95.ToString()
    +" gpu_scene_replay_max_ns=" + gpuSceneReplayMax.ToString()
    +" gpu_copy_p95_ns=" + gpuCopyP95.ToString()
    +" gpu_copy_max_ns=" + gpuCopyMax.ToString()
    +" requested_bytes=" + (if arm == "active" { "16384" } else { "0" })
    +" requested_bytes_snapshot=" + requestedBytes.ToString()
    +" resource_create_delta=" + objectCreateDeltaTotal.ToString()
    +" resource_destroy_delta=" + objectDestroyDeltaTotal.ToString()
    +" resource_resident_peak_B=" + residentPeak.ToString()
    +" resource_resident_before_close_B=" + residentBeforeClose.ToString()
    +" resource_resident_after_close_B=0"
    +" render_path=" + (if arm == "active" { "readback_request" } else { "forced" }))
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

func RetainedRequireOutsideStable(before []uint8, after []uint8, width uint32,
  height uint32, left int32, top int32, right int32, bottom int32) {
    var y uint32 = 0u
    while y < height {
      var x uint32 = 0u
      while x < width {
        let outside = int32(x) < left || int32(x) >= right
          || int32(y) < top || int32(y) >= bottom
        if outside {
          let index = int32((y * width + x) * 4u)
          var channel int32 = 0
          while channel < 4 {
            if Math.Abs(int32(before[index + channel])
              -int32(after[index + channel])) > 1 {
                throw InvalidOperationException("Retained scene changed a pixel outside the mutation")
              }
            channel = channel + 1
          }
        }
        x = x + 1u
      }
      y = y + 1u
    }
  }

func RetainedRequireBorderPayload(state VulkanSceneRetentionTestSnapshot,
  bounds ElementRect, scaleX float64, scaleY float64, radiusScale float64,
  topWidth float64, rightWidth float64, bottomWidth float64, leftWidth float64,
  radius float64, topColor uint32, rightColor uint32, bottomColor uint32,
  leftColor uint32, style uint32, name string) {
    Require(state.BorderLeafFound && state.BorderLeafCount == 1u
        && Math.Abs(float64(state.BorderLeafBoundsX) - bounds.X * scaleX) <= 0.01
        && Math.Abs(float64(state.BorderLeafBoundsY) - bounds.Y * scaleY) <= 0.01
        && Math.Abs(float64(state.BorderLeafBoundsWidth) - bounds.Width * scaleX) <= 0.01
        && Math.Abs(float64(state.BorderLeafBoundsHeight) - bounds.Height * scaleY) <= 0.01
        && Math.Abs(float64(state.BorderLeafTopWidth) - topWidth * scaleY) <= 0.01
        && Math.Abs(float64(state.BorderLeafRightWidth) - rightWidth * scaleX) <= 0.01
        && Math.Abs(float64(state.BorderLeafBottomWidth) - bottomWidth * scaleY) <= 0.01
        && Math.Abs(float64(state.BorderLeafLeftWidth) - leftWidth * scaleX) <= 0.01
        && Math.Abs(float64(state.BorderLeafRadiusTopLeft) - radius * radiusScale) <= 0.01
        && Math.Abs(float64(state.BorderLeafRadiusTopRight) - radius * radiusScale) <= 0.01
        && Math.Abs(float64(state.BorderLeafRadiusBottomRight) - radius * radiusScale) <= 0.01
        && Math.Abs(float64(state.BorderLeafRadiusBottomLeft) - radius * radiusScale) <= 0.01
        && state.BorderLeafTopColor == topColor
        && state.BorderLeafRightColor == rightColor
        && state.BorderLeafBottomColor == bottomColor
        && state.BorderLeafLeftColor == leftColor
        && state.BorderLeafStyle == style
        && state.BorderLeafTransformIndex == -1,
      "Retained " + name + " did not preserve the exact per-edge border payload")
  }

func RunRetentionSmoke() {
  Require(Environment.GetEnvironmentVariable("GOO_VK_DIAGNOSTICS") == "1",
    "GOO_VK_DIAGNOSTICS=1 is required")
  let root = RetentionCell{}
  let capturedError = StringWriter()
  let originalError = Console.Error
  var window Window? = nil
  var initialResult VulkanReadbackResult? = nil
  var mutatedResult VulkanReadbackResult? = nil
  var boundsResult VulkanReadbackResult? = nil
  var topologyAddResult VulkanReadbackResult? = nil
  var topologyRemoveResult VulkanReadbackResult? = nil
  var borderMutationResult VulkanReadbackResult? = nil
  var parentMutationResult VulkanReadbackResult? = nil
  var initialState VulkanSceneRetentionTestSnapshot{}
  var warmState VulkanSceneRetentionTestSnapshot{}
  var parentMutatedState VulkanSceneRetentionTestSnapshot{}
  var parentUnsupportedState VulkanSceneRetentionTestSnapshot{}
  var parentRecapturedState VulkanSceneRetentionTestSnapshot{}
  var mutatedState VulkanSceneRetentionTestSnapshot{}
  var boundsState VulkanSceneRetentionTestSnapshot{}
  var unsupportedState VulkanSceneRetentionTestSnapshot{}
  var recapturedState VulkanSceneRetentionTestSnapshot{}
  var recapturedWarmState VulkanSceneRetentionTestSnapshot{}
  var topologyAddState VulkanSceneRetentionTestSnapshot{}
  var topologyRemoveState VulkanSceneRetentionTestSnapshot{}
  var borderMutationState VulkanSceneRetentionTestSnapshot{}
  var borderUnsupportedState VulkanSceneRetentionTestSnapshot{}
  var borderRecapturedState VulkanSceneRetentionTestSnapshot{}
  var borderWarmState VulkanSceneRetentionTestSnapshot{}
  var finalState VulkanSceneRetentionTestSnapshot{}
  var initialPrimitive VulkanPrimitiveFrameRetentionTestSnapshot{}
  var warmPrimitive VulkanPrimitiveFrameRetentionTestSnapshot{}
  var mutatedPrimitive VulkanPrimitiveFrameRetentionTestSnapshot{}
  var topologyAddPrimitive VulkanPrimitiveFrameRetentionTestSnapshot{}
  var topologyRemovePrimitive VulkanPrimitiveFrameRetentionTestSnapshot{}
  var borderWarmPrimitive VulkanPrimitiveFrameRetentionTestSnapshot{}
  var borderMutatedPrimitive VulkanPrimitiveFrameRetentionTestSnapshot{}
  try {
    let opened = Window{
      Title: "Goo Retained scene gate",
      Width: 240,
      Height: 140,
      VSync: false,
      Root: root,
    }
    window = opened
    Console.SetError(capturedError)
    opened.Open()
    WindowReadbackTestFixture.StabilizeNativeMetrics(opened)
    WindowReadbackTestFixture.SuppressNativeEventPump(opened, true)
    WindowReadbackTestFixture.InputQueuePointerMove(opened, -1.0, -1.0)
    WindowReadbackTestFixture.ForceRender(opened, 0.0)
    let metrics = WindowReadbackTestFixture.Metrics(opened)
    Require(metrics.LogicalWidth == 240 && metrics.LogicalHeight == 140,
      "Retained scene metrics are incorrect")
    let scaleX = if metrics.DisplayScaleX > 0.0 { metrics.DisplayScaleX } else { 1.0 }
    let scaleY = if metrics.DisplayScaleY > 0.0 { metrics.DisplayScaleY } else { 1.0 }
    let radiusScale = if scaleX < scaleY { scaleX } else { scaleY }
    let roundedBounds = RetentionCell.RoundedBox.BorderBox
    let borderBounds = RetentionCell.BorderLeaf.BorderBox
    let roundedColor = (uint32(72) << 24) | (uint32(180) << 16)
    | (uint32(212) << 8) | uint32(255)
    let initialMutatedColor = (uint32(220) << 24) | (uint32(40) << 16)
    | (uint32(64) << 8) | uint32(255)
    let changedMutatedColor = (uint32(40) << 24) | (uint32(220) << 16)
    | (uint32(96) << 8) | uint32(255)
    let initialBorderTopColor = (uint32(232) << 24) | (uint32(96) << 16)
    | (uint32(72) << 8) | uint32(255)
    let changedBorderTopColor = (uint32(248) << 24) | (uint32(196) << 16)
    | (uint32(48) << 8) | uint32(255)
    let borderRightColor = (uint32(96) << 24) | (uint32(224) << 16)
    | (uint32(128) << 8) | uint32(255)
    let borderBottomColor = (uint32(72) << 24) | (uint32(144) << 16)
    | (uint32(232) << 8) | uint32(255)
    let borderLeftColor = (uint32(224) << 24) | (uint32(184) << 16)
    | (uint32(72) << 8) | uint32(255)
    let solidBorderStyle = uint32(int32(BorderStyle.Solid))
    Require(RetentionCell.Root.IsMounted
        && RetentionCell.MutatedBox.IsMounted
        && RetentionCell.RoundedBox.IsMounted
        && RetentionCell.BorderLeaf.IsMounted,
      "Retained scene did not mount the mutation box")
    initialState = WindowReadbackTestFixture.SceneRetention(opened)
    Require(initialState.ActiveSceneVersion > 0uL
        && initialState.SceneVersion == initialState.ActiveSceneVersion
        && initialState.AcquiredImageState
        && initialState.FullRedraw
        && !initialState.PartialRedraw
        && initialState.DamageWidth == metrics.FramebufferWidth
        && initialState.DamageHeight == metrics.FramebufferHeight,
      "Retained first use did not force a full redraw: scene="
      +initialState.SceneVersion.ToString() + " active="
      +initialState.ActiveSceneVersion.ToString() + " acquired="
      +initialState.AcquiredImageState.ToString() + " applied="
      +initialState.ActiveAppliedSceneVersion.ToString() + " partial="
      +initialState.PartialRedraw.ToString() + " full="
      +initialState.FullRedraw.ToString() + " damage="
      +initialState.DamageX.ToString() + "," + initialState.DamageY.ToString() + ","
      +initialState.DamageWidth.ToString() + "," + initialState.DamageHeight.ToString()
      +" framebuffer=" + metrics.FramebufferWidth.ToString() + "x"
      +metrics.FramebufferHeight.ToString())
    Require(initialState.DirtyChunkCount > 0u
        && initialState.PendingImageCount == 1u
        && initialState.ActivePendingSceneVersion == initialState.ActiveSceneVersion
        && initialState.PendingSceneVersion == initialState.ActiveSceneVersion,
      "Retained first use did not publish the scene to the acquired image")
    Require(initialState.AppliedImageCount == 0u
        && !initialState.ActiveImagePromoted
        && initialState.ActiveAppliedSceneVersion == 0uL,
      "Retained first use promoted a scene before presentation")
    Require(initialState.RetainedLeafTotalCount == 4uL
        && initialState.RetainedLeafHitCount == 0uL
        && initialState.RetainedLeafRebuildCount == 4uL
        && initialState.RetainedLeafFallbackCount == 0uL
        && initialState.RetainedLeafInvalidationCount == 0uL,
      "Retained first use did not rebuild the exact solid and rounded leaves")
    Require(initialState.RetainedParentBoxTotalCount == 1uL
        && initialState.RetainedParentBoxHitCount == 0uL
        && initialState.RetainedParentBoxRebuildCount == 1uL
        && initialState.RetainedParentBoxFallbackCount == 0uL
        && initialState.RetainedParentBoxInvalidationCount == 0uL,
      "Retained first use did not rebuild the retained parent box")
    Require(initialState.RetainedBorderTotalCount == 1uL
        && initialState.RetainedBorderHitCount == 0uL
        && initialState.RetainedBorderRebuildCount == 1uL
        && initialState.RetainedBorderFallbackCount == 0uL
        && initialState.RetainedBorderInvalidationCount == 0uL,
      "Retained first use did not rebuild the exact solid border leaf")
    Require(initialState.RoundedLeafCount == 1u
        && Math.Abs(float64(initialState.RoundedLeafBoundsX)
          -roundedBounds.X * scaleX) <= 0.01
        && Math.Abs(float64(initialState.RoundedLeafBoundsY)
          -roundedBounds.Y * scaleY) <= 0.01
        && Math.Abs(float64(initialState.RoundedLeafBoundsWidth)
          -roundedBounds.Width * scaleX) <= 0.01
        && Math.Abs(float64(initialState.RoundedLeafBoundsHeight)
          -roundedBounds.Height * scaleY) <= 0.01
        && Math.Abs(float64(initialState.RoundedLeafRadiusTopLeft) - 4.0 * radiusScale) <= 0.01
        && Math.Abs(float64(initialState.RoundedLeafRadiusTopRight) - 8.0 * radiusScale) <= 0.01
        && Math.Abs(float64(initialState.RoundedLeafRadiusBottomRight) - 12.0 * radiusScale) <= 0.01
        && Math.Abs(float64(initialState.RoundedLeafRadiusBottomLeft) - 16.0 * radiusScale) <= 0.01
        && initialState.RoundedLeafColor == roundedColor
        && Math.Abs(float64(initialState.RoundedLeafOpacity) - 1.0) <= 0.01,
      "Retained first use did not emit the exact rounded kind, bounds, color, opacity, and radii")
    Require(initialState.MutatedSolidLeafFound
        && Math.Abs(float64(initialState.MutatedSolidLeafBoundsX) - 88.0 * scaleX) <= 0.01
        && Math.Abs(float64(initialState.MutatedSolidLeafBoundsY) - 8.0 * scaleY) <= 0.01
        && Math.Abs(float64(initialState.MutatedSolidLeafBoundsWidth) - 64.0 * scaleX) <= 0.01
        && Math.Abs(float64(initialState.MutatedSolidLeafBoundsHeight) - 32.0 * scaleY) <= 0.01
        && initialState.MutatedSolidLeafColor == initialMutatedColor
        && Math.Abs(float64(initialState.MutatedSolidLeafOpacity) - 1.0) <= 0.01,
      "Retained first use did not emit the exact solid leaf payload")
    RetainedRequireBorderPayload(initialState, borderBounds, scaleX, scaleY, radiusScale,
      2.0, 3.0, 4.0, 5.0, 0.0, initialBorderTopColor, borderRightColor,
      borderBottomColor, borderLeftColor, solidBorderStyle, "first-use border")
    initialPrimitive = WindowReadbackTestFixture.PrimitiveFrameRetention(opened)
    Require(initialPrimitive.SlotIndex == 0 || initialPrimitive.SlotIndex == 1,
      "Retained first primitive frame used an invalid slot")
    Require(initialPrimitive.RecordCount > 1
        && initialPrimitive.ByteCount
      == uint64(initialPrimitive.RecordCount) * 128uL
        && initialPrimitive.FullUpload
        && initialPrimitive.DirtyRecordCount == initialPrimitive.RecordCount
        && initialPrimitive.UploadRangeCount == 1
        && initialPrimitive.PlannedTransferBytes == initialPrimitive.ByteCount
        && initialPrimitive.SkippedTransferBytes == 0uL
        && initialPrimitive.CpuWriteOperations == uint64(initialPrimitive.RecordCount)
        && initialPrimitive.FlushRequests == 1uL
        && initialPrimitive.NativeFlushCalls <= initialPrimitive.FlushRequests
        && initialPrimitive.RetainedReuse == 0uL,
      "Retained first primitive frame did not force a full upload")
    initialResult = PrimitiveReadback(opened, metrics)
    PrimitiveRequirePixelNear(initialResult!!.Pixels, initialResult!!.Width, metrics,
      120.0, 24.0, uint8(220), uint8(40), uint8(64), 4, "initial_mutated_box")
    PrimitiveRequirePixelNear(initialResult!!.Pixels, initialResult!!.Width, metrics,
      200.0, 9.0, uint8(232), uint8(96), uint8(72), 8, "initial_border_top")
    PrimitiveRequirePixelNear(initialResult!!.Pixels, initialResult!!.Width, metrics,
      200.0, 9.0, uint8(232), uint8(96), uint8(72), 8, "initial_border_top")
    PrimitiveRequirePixelNear(initialResult!!.Pixels, initialResult!!.Width, metrics,
      230.0, 24.0, uint8(96), uint8(224), uint8(128), 8, "initial_border_right")
    PrimitiveRequirePixelNear(initialResult!!.Pixels, initialResult!!.Width, metrics,
      200.0, 38.0, uint8(72), uint8(144), uint8(232), 8, "initial_border_bottom")
    PrimitiveRequirePixelNear(initialResult!!.Pixels, initialResult!!.Width, metrics,
      170.0, 24.0, uint8(224), uint8(184), uint8(72), 8, "initial_border_left")

    var sawPrimitiveSlot0 bool = false
    var sawPrimitiveSlot1 bool = false
    var sawPrimitiveSlot0Clean bool = false
    var sawPrimitiveSlot1Clean bool = false
    var swapchainImagesInitialized bool = false
    var primitiveWarmupFrame int32 = 0
    while primitiveWarmupFrame < 64
      && (!sawPrimitiveSlot0Clean || !sawPrimitiveSlot1Clean
          || !swapchainImagesInitialized) {
            WindowReadbackTestFixture.ForceRender(opened, 0.0166666666666667)
            let nextPrimitive = WindowReadbackTestFixture.PrimitiveFrameRetention(opened)
            warmPrimitive = nextPrimitive
            warmState = WindowReadbackTestFixture.SceneRetention(opened)
            swapchainImagesInitialized = warmState.SwapchainImageCount > 0u
              && warmState.InitializedImageCount == warmState.SwapchainImageCount
              && warmState.MinimumImageSceneVersion >= initialState.SceneVersion
            if nextPrimitive.RecordCount > 0 {
              let clean = !nextPrimitive.FullUpload
                && nextPrimitive.PlannedTransferBytes == 0uL
                && nextPrimitive.SkippedTransferBytes == nextPrimitive.ByteCount
                && nextPrimitive.DirtyRecordCount == 0
                && nextPrimitive.UploadRangeCount == 0
                && nextPrimitive.CpuWriteOperations == uint64(nextPrimitive.RecordCount)
                && nextPrimitive.NativeFlushCalls == 0uL
                && nextPrimitive.RetainedReuse
              == uint64(nextPrimitive.RecordCount)
              if nextPrimitive.SlotIndex == 0 {
                sawPrimitiveSlot0 = true
                if clean {
                  sawPrimitiveSlot0Clean = true
                }
              } else if nextPrimitive.SlotIndex == 1 {
                sawPrimitiveSlot1 = true
                if clean {
                  sawPrimitiveSlot1Clean = true
                }
              }
            }
            primitiveWarmupFrame = primitiveWarmupFrame + 1
          }
    Require(sawPrimitiveSlot0 && sawPrimitiveSlot1
        && sawPrimitiveSlot0Clean && sawPrimitiveSlot1Clean
        && swapchainImagesInitialized
        && warmPrimitive.RecordCount == initialPrimitive.RecordCount
        && warmPrimitive.ByteCount == initialPrimitive.ByteCount,
      "Retained warmup did not retain both frame slots and initialize every swapchain image: initialized="
      +warmState.InitializedImageCount.ToString() + " images="
      +warmState.SwapchainImageCount.ToString())
    let warmLeafTotal = warmState.RetainedLeafTotalCount
    -initialState.RetainedLeafTotalCount
    let warmLeafHits = warmState.RetainedLeafHitCount
    -initialState.RetainedLeafHitCount
    Require(warmLeafTotal > 0uL
        && warmLeafHits == warmLeafTotal
        && warmState.RetainedLeafRebuildCount
      == initialState.RetainedLeafRebuildCount
        && warmState.RetainedLeafFallbackCount
      == initialState.RetainedLeafFallbackCount
        && warmState.RetainedLeafInvalidationCount
      == initialState.RetainedLeafInvalidationCount,
      "Retained unchanged leaves did not produce exact warm solid and rounded hits")
    let warmParentTotal = warmState.RetainedParentBoxTotalCount
    -initialState.RetainedParentBoxTotalCount
    let warmParentHits = warmState.RetainedParentBoxHitCount
    -initialState.RetainedParentBoxHitCount
    Require(warmParentTotal > 0uL
        && warmParentHits == warmParentTotal
        && warmState.RetainedParentBoxRebuildCount
      == initialState.RetainedParentBoxRebuildCount
        && warmState.RetainedParentBoxFallbackCount
      == initialState.RetainedParentBoxFallbackCount
        && warmState.RetainedParentBoxInvalidationCount
      == initialState.RetainedParentBoxInvalidationCount,
      "Retained warm parent box did not hit while continuing into generic children: total="
      +warmParentTotal.ToString() + " hits=" + warmParentHits.ToString()
      +" initialRebuilds=" + initialState.RetainedParentBoxRebuildCount.ToString()
      +" warmRebuilds=" + warmState.RetainedParentBoxRebuildCount.ToString()
      +" initialFallbacks=" + initialState.RetainedParentBoxFallbackCount.ToString()
      +" warmFallbacks=" + warmState.RetainedParentBoxFallbackCount.ToString()
      +" initialInvalidations="
      +initialState.RetainedParentBoxInvalidationCount.ToString()
      +" warmInvalidations="
      +warmState.RetainedParentBoxInvalidationCount.ToString())
    let warmBorderTotal = warmState.RetainedBorderTotalCount
    -initialState.RetainedBorderTotalCount
    let warmBorderHits = warmState.RetainedBorderHitCount
    -initialState.RetainedBorderHitCount
    Require(warmBorderTotal > 0uL
        && warmBorderHits == warmBorderTotal
        && warmState.RetainedBorderRebuildCount
      == initialState.RetainedBorderRebuildCount
        && warmState.RetainedBorderFallbackCount
      == initialState.RetainedBorderFallbackCount
        && warmState.RetainedBorderInvalidationCount
      == initialState.RetainedBorderInvalidationCount,
      "Retained unchanged border leaf did not produce exact warm hits")
    RetainedRequireBorderPayload(warmState, borderBounds, scaleX, scaleY, radiusScale,
      2.0, 3.0, 4.0, 5.0, 0.0, initialBorderTopColor, borderRightColor,
      borderBottomColor, borderLeftColor, solidBorderStyle, "warm border")
    Require(warmState.RoundedLeafCount == initialState.RoundedLeafCount
        && Math.Abs(float64(warmState.RoundedLeafBoundsX)
          -roundedBounds.X * scaleX) <= 0.01
        && Math.Abs(float64(warmState.RoundedLeafBoundsY)
          -roundedBounds.Y * scaleY) <= 0.01
        && Math.Abs(float64(warmState.RoundedLeafBoundsWidth)
          -roundedBounds.Width * scaleX) <= 0.01
        && Math.Abs(float64(warmState.RoundedLeafBoundsHeight)
          -roundedBounds.Height * scaleY) <= 0.01
        && Math.Abs(float64(warmState.RoundedLeafRadiusTopLeft) - 4.0 * radiusScale) <= 0.01
        && Math.Abs(float64(warmState.RoundedLeafRadiusTopRight) - 8.0 * radiusScale) <= 0.01
        && Math.Abs(float64(warmState.RoundedLeafRadiusBottomRight) - 12.0 * radiusScale) <= 0.01
        && Math.Abs(float64(warmState.RoundedLeafRadiusBottomLeft) - 16.0 * radiusScale) <= 0.01
        && warmState.RoundedLeafColor == roundedColor
        && Math.Abs(float64(warmState.RoundedLeafOpacity) - 1.0) <= 0.01,
      "Retained warm rounded leaf did not preserve exact emitted payload")

    root.MutateBox()
    WindowReadbackTestFixture.ForceRender(opened, 0.0166666666666667)
    mutatedPrimitive = WindowReadbackTestFixture.PrimitiveFrameRetention(opened)
    Require(mutatedPrimitive.RecordCount == warmPrimitive.RecordCount
        && mutatedPrimitive.ByteCount == warmPrimitive.ByteCount
        && !mutatedPrimitive.FullUpload
        && mutatedPrimitive.DirtyRecordCount == 1
        && mutatedPrimitive.UploadRangeCount == 1
        && mutatedPrimitive.PlannedTransferBytes == 128uL
        && mutatedPrimitive.SkippedTransferBytes == mutatedPrimitive.ByteCount - 128uL
        && mutatedPrimitive.CpuWriteOperations == uint64(mutatedPrimitive.RecordCount)
        && mutatedPrimitive.FlushRequests == 1uL
        && mutatedPrimitive.NativeFlushCalls <= mutatedPrimitive.FlushRequests
        && mutatedPrimitive.RetainedReuse
      == uint64(mutatedPrimitive.RecordCount - 1),
      "Retained one-box mutation did not upload one dirty primitive record")
    mutatedState = WindowReadbackTestFixture.SceneRetention(opened)
    let colorLeafTotal = mutatedState.RetainedLeafTotalCount
    -warmState.RetainedLeafTotalCount
    let colorLeafHits = mutatedState.RetainedLeafHitCount
    -warmState.RetainedLeafHitCount
    let colorLeafRebuilds = mutatedState.RetainedLeafRebuildCount
    -warmState.RetainedLeafRebuildCount
    let colorLeafInvalidations = mutatedState.RetainedLeafInvalidationCount
    -warmState.RetainedLeafInvalidationCount
    Require(colorLeafTotal > 0uL
        && colorLeafRebuilds == 1uL
        && colorLeafHits == colorLeafTotal - 1uL
        && colorLeafInvalidations == 1uL
        && mutatedState.RetainedLeafFallbackCount
      == warmState.RetainedLeafFallbackCount,
      "Retained color mutation did not miss exactly one leaf with clean siblings retained")
    Require(mutatedState.MutatedSolidLeafFound
        && Math.Abs(float64(mutatedState.MutatedSolidLeafBoundsX) - 88.0 * scaleX) <= 0.01
        && Math.Abs(float64(mutatedState.MutatedSolidLeafBoundsY) - 8.0 * scaleY) <= 0.01
        && Math.Abs(float64(mutatedState.MutatedSolidLeafBoundsWidth) - 64.0 * scaleX) <= 0.01
        && Math.Abs(float64(mutatedState.MutatedSolidLeafBoundsHeight) - 32.0 * scaleY) <= 0.01
        && mutatedState.MutatedSolidLeafColor == changedMutatedColor
        && Math.Abs(float64(mutatedState.MutatedSolidLeafOpacity) - 1.0) <= 0.01,
      "Retained color mutation did not emit the current packed solid payload")
    let changedLeft = int32(Math.Floor(88.0 * scaleX))
    let changedTop = int32(Math.Floor(8.0 * scaleY))
    let changedRight = int32(Math.Ceiling(152.0 * scaleX))
    let changedBottom = int32(Math.Ceiling(40.0 * scaleY))
    Require(mutatedState.ActiveSceneVersion > initialState.ActiveSceneVersion
        && mutatedState.SceneVersion == mutatedState.ActiveSceneVersion
        && mutatedState.AcquiredImageState
        && mutatedState.ActiveAppliedSceneVersion < mutatedState.ActiveSceneVersion
        && mutatedState.PartialRedraw
        && !mutatedState.FullRedraw
        && mutatedState.DamageWidth < metrics.FramebufferWidth
        && mutatedState.DamageHeight < metrics.FramebufferHeight
        && mutatedState.DamageX <= changedLeft
        && mutatedState.DamageY <= changedTop
        && mutatedState.DamageX + mutatedState.DamageWidth >= changedRight
        && mutatedState.DamageY + mutatedState.DamageHeight >= changedBottom,
      "Retained box mutation did not produce bounded partial damage: scene="
      +mutatedState.SceneVersion.ToString() + " active="
      +mutatedState.ActiveSceneVersion.ToString() + " acquired="
      +mutatedState.AcquiredImageState.ToString() + " applied="
      +mutatedState.ActiveAppliedSceneVersion.ToString() + " partial="
      +mutatedState.PartialRedraw.ToString() + " full="
      +mutatedState.FullRedraw.ToString() + " damage="
      +mutatedState.DamageX.ToString() + ","
      +mutatedState.DamageY.ToString() + ","
      +mutatedState.DamageWidth.ToString() + ","
      +mutatedState.DamageHeight.ToString() + " framebuffer="
      +metrics.FramebufferWidth.ToString() + "x"
      +metrics.FramebufferHeight.ToString() + " warmPartial="
      +warmState.PartialRedraw.ToString() + " warmFull="
      +warmState.FullRedraw.ToString() + " warmDamage="
      +warmState.DamageX.ToString() + "," + warmState.DamageY.ToString() + ","
      +warmState.DamageWidth.ToString() + ","
      +warmState.DamageHeight.ToString() + " warmDirty="
      +warmState.DirtyChunkCount.ToString() + " warmReused="
      +warmState.ReusedChunkCount.ToString() + " mutatedDirty="
      +mutatedState.DirtyChunkCount.ToString() + " mutatedReused="
      +mutatedState.ReusedChunkCount.ToString())
    Require(mutatedState.DirtyChunkCount > 0u
        && mutatedState.ReusedChunkCount > 0u,
      "Retained box mutation did not retain clean chunks")
    Require(mutatedState.PendingImageCount > 0u
        && mutatedState.ActivePendingSceneVersion == mutatedState.ActiveSceneVersion
        && mutatedState.PendingSceneVersion == mutatedState.ActiveSceneVersion,
      "Retained box mutation did not publish its scene version to the acquired image")
    mutatedResult = PrimitiveReadback(opened, metrics)
    PrimitiveRequirePixelNear(mutatedResult!!.Pixels, mutatedResult!!.Width, metrics,
      120.0, 24.0, uint8(40), uint8(220), uint8(96), 4, "mutated_box")
    RetainedRequireOutsideStable(initialResult!!.Pixels, mutatedResult!!.Pixels,
      mutatedResult!!.Width, mutatedResult!!.Height,
      changedLeft, changedTop, changedRight, changedBottom)

    root.MutateBounds()
    WindowReadbackTestFixture.ForceRender(opened, 0.0166666666666667)
    boundsState = WindowReadbackTestFixture.SceneRetention(opened)
    let boundsLeafTotal = boundsState.RetainedLeafTotalCount
    -mutatedState.RetainedLeafTotalCount
    let boundsLeafHits = boundsState.RetainedLeafHitCount
    -mutatedState.RetainedLeafHitCount
    let boundsLeafRebuilds = boundsState.RetainedLeafRebuildCount
    -mutatedState.RetainedLeafRebuildCount
    let boundsLeafInvalidations = boundsState.RetainedLeafInvalidationCount
    -mutatedState.RetainedLeafInvalidationCount
    Require(boundsLeafTotal > 0uL
        && boundsLeafRebuilds == 1uL
        && boundsLeafHits == boundsLeafTotal - 1uL
        && boundsLeafInvalidations == 1uL
        && boundsState.RetainedLeafFallbackCount
      == mutatedState.RetainedLeafFallbackCount,
      "Retained bounds mutation did not rebuild exactly one leaf with clean siblings retained")
    Require(boundsState.MutatedSolidLeafFound
        && Math.Abs(float64(boundsState.MutatedSolidLeafBoundsX) - 104.0 * scaleX) <= 0.01
        && Math.Abs(float64(boundsState.MutatedSolidLeafBoundsY) - 8.0 * scaleY) <= 0.01
        && Math.Abs(float64(boundsState.MutatedSolidLeafBoundsWidth) - 64.0 * scaleX) <= 0.01
        && Math.Abs(float64(boundsState.MutatedSolidLeafBoundsHeight) - 32.0 * scaleY) <= 0.01
        && boundsState.MutatedSolidLeafColor == changedMutatedColor
        && Math.Abs(float64(boundsState.MutatedSolidLeafOpacity) - 1.0) <= 0.01,
      "Retained bounds mutation did not emit the exact moved solid payload")
    let movedBounds = RetentionCell.MutatedBox.BorderBox
    Require(movedBounds.Width > 0.0 && movedBounds.Height > 0.0,
      "Retained bounds mutation lost the moved box geometry")
    let movedLeft = int32(Math.Floor(movedBounds.X * scaleX))
    let movedTop = int32(Math.Floor(movedBounds.Y * scaleY))
    let movedRight = int32(Math.Ceiling((movedBounds.X + movedBounds.Width) * scaleX))
    let movedBottom = int32(Math.Ceiling((movedBounds.Y + movedBounds.Height) * scaleY))
    let damageLeft = if changedLeft < movedLeft { changedLeft } else { movedLeft }
    let unionRight = if changedRight > movedRight { changedRight } else { movedRight }
    let damageRight = if unionRight > metrics.FramebufferWidth {
      metrics.FramebufferWidth
    } else {
      unionRight
    }
    let damageTop = if changedTop < movedTop { changedTop } else { movedTop }
    let unionBottom = if changedBottom > movedBottom { changedBottom } else { movedBottom }
    let damageBottom = if unionBottom > metrics.FramebufferHeight {
      metrics.FramebufferHeight
    } else {
      unionBottom
    }
    Require(boundsState.ActiveSceneVersion > mutatedState.ActiveSceneVersion
        && boundsState.SceneVersion == boundsState.ActiveSceneVersion
        && boundsState.AcquiredImageState
        && boundsState.ActiveAppliedSceneVersion < boundsState.ActiveSceneVersion
        && boundsState.PartialRedraw
        && !boundsState.FullRedraw
        && boundsState.DamageWidth < metrics.FramebufferWidth
        && boundsState.DamageHeight < metrics.FramebufferHeight
        && boundsState.DamageX <= damageLeft
        && boundsState.DamageY <= damageTop
        && boundsState.DamageX + boundsState.DamageWidth >= damageRight
        && boundsState.DamageY + boundsState.DamageHeight >= damageBottom,
      "Retained bounds mutation did not damage both old and new bounds: x="
      +boundsState.DamageX.ToString() + " y=" + boundsState.DamageY.ToString()
      +" w=" + boundsState.DamageWidth.ToString() + " h="
      +boundsState.DamageHeight.ToString() + " oldLeft=" + changedLeft.ToString()
      +" oldRight=" + changedRight.ToString() + " newLeft=" + movedLeft.ToString()
      +" newRight=" + movedRight.ToString() + " unionLeft=" + damageLeft.ToString()
      +" unionRight=" + unionRight.ToString() + " clippedRight="
      +damageRight.ToString() + " unionTop=" + damageTop.ToString()
      +" unionBottom=" + unionBottom.ToString() + " clippedBottom="
      +damageBottom.ToString() + " partial="
      +boundsState.PartialRedraw.ToString())
    boundsResult = PrimitiveReadback(opened, metrics)
    PrimitiveRequirePixelNear(boundsResult!!.Pixels, boundsResult!!.Width, metrics,
      136.0, 24.0, uint8(40), uint8(220), uint8(96), 4, "bounds_mutated_box")
    PrimitiveRequirePixelNear(boundsResult!!.Pixels, boundsResult!!.Width, metrics,
      96.0, 24.0, uint8(12), uint8(20), uint8(32), 8, "bounds_old_only_background")
    RetainedRequireOutsideStable(mutatedResult!!.Pixels, boundsResult!!.Pixels,
      boundsResult!!.Width, boundsResult!!.Height,
      damageLeft, damageTop, damageRight, damageBottom)

    root.ToggleUnsupportedFeature()
    WindowReadbackTestFixture.ForceRender(opened, 0.0166666666666667)
    unsupportedState = WindowReadbackTestFixture.SceneRetention(opened)
    let unsupportedLeafFallbacks = unsupportedState.RetainedLeafFallbackCount
    -boundsState.RetainedLeafFallbackCount
    let unsupportedLeafInvalidations = unsupportedState.RetainedLeafInvalidationCount
    -boundsState.RetainedLeafInvalidationCount
    Require(unsupportedLeafFallbacks == 1uL
        && unsupportedLeafInvalidations == 1uL
        && unsupportedState.AcquiredImageState
        && unsupportedState.FullRedraw
        && !unsupportedState.PartialRedraw
        && unsupportedState.DamageWidth == metrics.FramebufferWidth
        && unsupportedState.DamageHeight == metrics.FramebufferHeight,
      "Retained unsupported leaf feature did not force one generic fallback and full damage"
      +" fallbackDelta=" + unsupportedLeafFallbacks.ToString()
      +" invalidationDelta=" + unsupportedLeafInvalidations.ToString()
      +" acquired=" + unsupportedState.AcquiredImageState.ToString()
      +" full=" + unsupportedState.FullRedraw.ToString()
      +" partial=" + unsupportedState.PartialRedraw.ToString()
      +" damageX=" + unsupportedState.DamageX.ToString()
      +" damageY=" + unsupportedState.DamageY.ToString()
      +" damageWidth=" + unsupportedState.DamageWidth.ToString()
      +" damageHeight=" + unsupportedState.DamageHeight.ToString()
      +" framebufferWidth=" + metrics.FramebufferWidth.ToString()
      +" framebufferHeight=" + metrics.FramebufferHeight.ToString())

    root.ToggleUnsupportedFeature()
    WindowReadbackTestFixture.ForceRender(opened, 0.0166666666666667)
    recapturedState = WindowReadbackTestFixture.SceneRetention(opened)
    let recapturedLeafRebuilds = recapturedState.RetainedLeafRebuildCount
    -unsupportedState.RetainedLeafRebuildCount
    let recapturedLeafInvalidations = recapturedState.RetainedLeafInvalidationCount
    -unsupportedState.RetainedLeafInvalidationCount
    Require(recapturedLeafRebuilds == 1uL
        && recapturedLeafInvalidations == 0uL
        && recapturedState.RetainedLeafFallbackCount
      == unsupportedState.RetainedLeafFallbackCount,
      "Retained unsupported leaf removal did not safely recapture the rounded leaf")
    WindowReadbackTestFixture.ForceRender(opened, 0.0166666666666667)
    recapturedWarmState = WindowReadbackTestFixture.SceneRetention(opened)
    let recapturedWarmLeafTotal = recapturedWarmState.RetainedLeafTotalCount
    -recapturedState.RetainedLeafTotalCount
    let recapturedWarmLeafHits = recapturedWarmState.RetainedLeafHitCount
    -recapturedState.RetainedLeafHitCount
    Require(recapturedWarmLeafTotal > 0uL
        && recapturedWarmLeafHits == recapturedWarmLeafTotal
        && recapturedWarmState.RetainedLeafRebuildCount
      == recapturedState.RetainedLeafRebuildCount,
      "Retained rounded leaf did not return to exact warm retention after fallback"
      +" warmTotalDelta=" + recapturedWarmLeafTotal.ToString()
      +" warmHitDelta=" + recapturedWarmLeafHits.ToString()
      +" recapturedRebuilds="
      +recapturedState.RetainedLeafRebuildCount.ToString()
      +" warmRebuilds="
      +recapturedWarmState.RetainedLeafRebuildCount.ToString()
      +" recapturedFallbacks="
      +recapturedState.RetainedLeafFallbackCount.ToString()
      +" warmFallbacks="
      +recapturedWarmState.RetainedLeafFallbackCount.ToString()
      +" recapturedInvalidations="
      +recapturedState.RetainedLeafInvalidationCount.ToString()
      +" warmInvalidations="
      +recapturedWarmState.RetainedLeafInvalidationCount.ToString()
      +" dirty=" + recapturedWarmState.DirtyChunkCount.ToString()
      +" reused=" + recapturedWarmState.ReusedChunkCount.ToString()
      +" acquired=" + recapturedWarmState.AcquiredImageState.ToString()
      +" full=" + recapturedWarmState.FullRedraw.ToString()
      +" partial=" + recapturedWarmState.PartialRedraw.ToString()
      +" damageX=" + recapturedWarmState.DamageX.ToString()
      +" damageY=" + recapturedWarmState.DamageY.ToString()
      +" damageWidth=" + recapturedWarmState.DamageWidth.ToString()
      +" damageHeight=" + recapturedWarmState.DamageHeight.ToString()
      +" framebufferWidth=" + metrics.FramebufferWidth.ToString()
      +" framebufferHeight=" + metrics.FramebufferHeight.ToString())
    Require(recapturedWarmState.RoundedLeafCount == initialState.RoundedLeafCount
        && recapturedWarmState.RoundedLeafColor == roundedColor
        && Math.Abs(float64(recapturedWarmState.RoundedLeafRadiusTopLeft)
          -4.0 * radiusScale) <= 0.01
        && Math.Abs(float64(recapturedWarmState.RoundedLeafRadiusTopRight)
          -8.0 * radiusScale) <= 0.01
        && Math.Abs(float64(recapturedWarmState.RoundedLeafRadiusBottomRight)
          -12.0 * radiusScale) <= 0.01
        && Math.Abs(float64(recapturedWarmState.RoundedLeafRadiusBottomLeft)
          -16.0 * radiusScale) <= 0.01,
      "Retained rounded leaf recapture did not restore its exact payload")

    root.ToggleExtra()
    WindowReadbackTestFixture.ForceRender(opened, 0.0166666666666667)
    topologyAddPrimitive = WindowReadbackTestFixture.PrimitiveFrameRetention(opened)
    Require(topologyAddPrimitive.RecordCount != mutatedPrimitive.RecordCount
        && topologyAddPrimitive.ByteCount
      == uint64(topologyAddPrimitive.RecordCount) * 128uL
        && topologyAddPrimitive.FullUpload
        && topologyAddPrimitive.DirtyRecordCount == topologyAddPrimitive.RecordCount
        && topologyAddPrimitive.UploadRangeCount == 1
        && topologyAddPrimitive.PlannedTransferBytes == topologyAddPrimitive.ByteCount
        && topologyAddPrimitive.SkippedTransferBytes == 0uL
        && topologyAddPrimitive.CpuWriteOperations == uint64(topologyAddPrimitive.RecordCount)
        && topologyAddPrimitive.FlushRequests == 1uL
        && topologyAddPrimitive.NativeFlushCalls <= topologyAddPrimitive.FlushRequests
        && topologyAddPrimitive.RetainedReuse == 0uL,
      "Retained topology add did not force a full primitive upload")
    topologyAddState = WindowReadbackTestFixture.SceneRetention(opened)
    Require(topologyAddState.FullRedraw
        && topologyAddState.AcquiredImageState
        && !topologyAddState.PartialRedraw
        && topologyAddState.DamageWidth == metrics.FramebufferWidth
        && topologyAddState.DamageHeight == metrics.FramebufferHeight
        && topologyAddState.RetainedLeafTotalCount
      -recapturedWarmState.RetainedLeafTotalCount == 5uL
        && topologyAddState.RetainedLeafHitCount
      -recapturedWarmState.RetainedLeafHitCount == 4uL
        && topologyAddState.RetainedLeafRebuildCount
      -recapturedWarmState.RetainedLeafRebuildCount == 1uL,
      "Retained topology add did not force full damage")
    topologyAddResult = PrimitiveReadback(opened, metrics)
    PrimitiveRequirePixelNear(topologyAddResult!!.Pixels, topologyAddResult!!.Width, metrics,
      200.0, 72.0, uint8(128), uint8(72), uint8(220), 6, "topology_added_box")

    root.ToggleExtra()
    WindowReadbackTestFixture.ForceRender(opened, 0.0166666666666667)
    topologyRemovePrimitive = WindowReadbackTestFixture.PrimitiveFrameRetention(opened)
    Require(topologyRemovePrimitive.RecordCount == mutatedPrimitive.RecordCount
        && topologyRemovePrimitive.ByteCount
      == uint64(topologyRemovePrimitive.RecordCount) * 128uL
        && topologyRemovePrimitive.FullUpload
        && topologyRemovePrimitive.DirtyRecordCount == topologyRemovePrimitive.RecordCount
        && topologyRemovePrimitive.UploadRangeCount == 1
        && topologyRemovePrimitive.PlannedTransferBytes == topologyRemovePrimitive.ByteCount
        && topologyRemovePrimitive.SkippedTransferBytes == 0uL
        && topologyRemovePrimitive.CpuWriteOperations == uint64(topologyRemovePrimitive.RecordCount)
        && topologyRemovePrimitive.FlushRequests == 1uL
        && topologyRemovePrimitive.NativeFlushCalls <= topologyRemovePrimitive.FlushRequests
        && topologyRemovePrimitive.RetainedReuse == 0uL,
      "Retained topology remove did not force a full primitive upload")
    topologyRemoveState = WindowReadbackTestFixture.SceneRetention(opened)
    Require(topologyRemoveState.FullRedraw
        && topologyRemoveState.AcquiredImageState
        && !topologyRemoveState.PartialRedraw
        && topologyRemoveState.DamageWidth == metrics.FramebufferWidth
        && topologyRemoveState.DamageHeight == metrics.FramebufferHeight,
      "Retained topology remove did not force full damage: partial="
      +topologyRemoveState.PartialRedraw.ToString() + " x="
      +topologyRemoveState.DamageX.ToString() + " y="
      +topologyRemoveState.DamageY.ToString() + " w="
      +topologyRemoveState.DamageWidth.ToString() + " h="
      +topologyRemoveState.DamageHeight.ToString())
    Require(topologyRemoveState.RetainedLeafTotalCount
      -topologyAddState.RetainedLeafTotalCount > 0uL
        && topologyRemoveState.RetainedLeafHitCount
      -topologyAddState.RetainedLeafHitCount
      == topologyRemoveState.RetainedLeafTotalCount
      -topologyAddState.RetainedLeafTotalCount
        && topologyRemoveState.RetainedLeafRebuildCount
      == topologyAddState.RetainedLeafRebuildCount,
      "Retained topology remove did not retain the unchanged leaves")

    topologyRemoveResult = PrimitiveReadback(opened, metrics)
    PrimitiveRequirePixelNear(topologyRemoveResult!!.Pixels, topologyRemoveResult!!.Width, metrics,
      200.0, 72.0, uint8(12), uint8(20), uint8(32), 8, "topology_removed_background")

    var borderWarmReady bool = false
    var borderSawSlot0 bool = false
    var borderSawSlot1 bool = false
    var borderSawSlot0Clean bool = false
    var borderSawSlot1Clean bool = false
    var borderWarmupFrame int32 = 0
    while borderWarmupFrame < 64
      && (!borderSawSlot0Clean || !borderSawSlot1Clean) {
        WindowReadbackTestFixture.ForceRender(opened, 0.0166666666666667)
        borderWarmPrimitive = WindowReadbackTestFixture.PrimitiveFrameRetention(opened)
        borderWarmState = WindowReadbackTestFixture.SceneRetention(opened)
        if borderWarmPrimitive.RecordCount > 0 {
          let clean = !borderWarmPrimitive.FullUpload
            && borderWarmPrimitive.RecordCount >= 9
            && borderWarmPrimitive.PlannedTransferBytes == 0uL
            && borderWarmPrimitive.SkippedTransferBytes == borderWarmPrimitive.ByteCount
            && borderWarmPrimitive.DirtyRecordCount == 0
            && borderWarmPrimitive.UploadRangeCount == 0
            && borderWarmPrimitive.RetainedReuse
          == uint64(borderWarmPrimitive.RecordCount)
          if borderWarmPrimitive.SlotIndex == 0 {
            borderSawSlot0 = true
            if clean {
              borderSawSlot0Clean = true
            }
          } else if borderWarmPrimitive.SlotIndex == 1 {
            borderSawSlot1 = true
            if clean {
              borderSawSlot1Clean = true
            }
          }
        }
        borderWarmupFrame = borderWarmupFrame + 1
      }
    borderWarmReady = borderSawSlot0 && borderSawSlot1
      && borderSawSlot0Clean && borderSawSlot1Clean
    Require(borderWarmReady,
      "Retained border warm primitive expansion did not retain its clean records")

    root.MutateBorder()
    WindowReadbackTestFixture.ForceRender(opened, 0.0166666666666667)
    borderMutatedPrimitive = WindowReadbackTestFixture.PrimitiveFrameRetention(opened)
    borderMutationState = WindowReadbackTestFixture.SceneRetention(opened)
    Require(borderMutatedPrimitive.RecordCount == borderWarmPrimitive.RecordCount
        && borderMutatedPrimitive.ByteCount == borderWarmPrimitive.ByteCount
        && !borderMutatedPrimitive.FullUpload
        && borderMutatedPrimitive.RecordCount >= 9
        && borderMutatedPrimitive.DirtyRecordCount == 1
        && borderMutatedPrimitive.UploadRangeCount == 1
        && borderMutatedPrimitive.PlannedTransferBytes == 128uL
        && borderMutatedPrimitive.SkippedTransferBytes
      == borderMutatedPrimitive.ByteCount - 128uL
        && borderMutatedPrimitive.RetainedReuse
      == uint64(borderMutatedPrimitive.RecordCount - 1),
      "Retained one-edge border mutation did not upload one expanded solid-border record")
    let borderMutationTotal = borderMutationState.RetainedBorderTotalCount
    -borderWarmState.RetainedBorderTotalCount
    let borderMutationHits = borderMutationState.RetainedBorderHitCount
    -borderWarmState.RetainedBorderHitCount
    let borderMutationRebuilds = borderMutationState.RetainedBorderRebuildCount
    -borderWarmState.RetainedBorderRebuildCount
    let borderMutationInvalidations = borderMutationState.RetainedBorderInvalidationCount
    -borderWarmState.RetainedBorderInvalidationCount
    let borderMutationLeafTotal = borderMutationState.RetainedLeafTotalCount
    -borderWarmState.RetainedLeafTotalCount
    let borderMutationLeafHits = borderMutationState.RetainedLeafHitCount
    -borderWarmState.RetainedLeafHitCount
    Require(borderMutationTotal > 0uL
        && borderMutationRebuilds == 1uL
        && borderMutationHits == borderMutationTotal - 1uL
        && borderMutationInvalidations == 1uL
        && borderMutationState.RetainedBorderFallbackCount
      == borderWarmState.RetainedBorderFallbackCount
        && borderMutationLeafTotal > 0uL
        && borderMutationLeafHits == borderMutationLeafTotal
        && borderMutationState.RetainedLeafRebuildCount
      == borderWarmState.RetainedLeafRebuildCount
        && borderMutationState.RetainedLeafFallbackCount
      == borderWarmState.RetainedLeafFallbackCount
        && borderMutationState.RetainedLeafInvalidationCount
      == borderWarmState.RetainedLeafInvalidationCount
        && borderMutationState.RetainedParentBoxTotalCount
      > borderWarmState.RetainedParentBoxTotalCount
        && borderMutationState.RetainedParentBoxHitCount
      -borderWarmState.RetainedParentBoxHitCount
      == borderMutationState.RetainedParentBoxTotalCount
      -borderWarmState.RetainedParentBoxTotalCount
        && borderMutationState.RetainedParentBoxRebuildCount
      == borderWarmState.RetainedParentBoxRebuildCount
        && borderMutationState.RetainedParentBoxFallbackCount
      == borderWarmState.RetainedParentBoxFallbackCount
        && borderMutationState.RetainedParentBoxInvalidationCount
      == borderWarmState.RetainedParentBoxInvalidationCount,
      "Retained border color mutation did not isolate one exact border rebuild")
    var borderDamageAttempt int32 = 0
    while borderDamageAttempt < 32 && !borderMutationState.PartialRedraw {
      root.MutateBorder()
      WindowReadbackTestFixture.ForceRender(opened, 0.0166666666666667)
      root.MutateBorder()
      WindowReadbackTestFixture.ForceRender(opened, 0.0166666666666667)
      borderMutationState = WindowReadbackTestFixture.SceneRetention(opened)
      borderDamageAttempt = borderDamageAttempt + 1
    }
    RetainedRequireBorderPayload(borderMutationState, borderBounds, scaleX, scaleY,
      radiusScale, 2.0, 3.0, 4.0, 5.0, 0.0, changedBorderTopColor,
      borderRightColor, borderBottomColor, borderLeftColor, solidBorderStyle,
      "mutated border")
    let borderDamageLeft = int32(Math.Floor(borderBounds.X * scaleX))
    let borderDamageTop = int32(Math.Floor(borderBounds.Y * scaleY))
    let borderDamageRight = int32(Math.Ceiling(
      (borderBounds.X + borderBounds.Width) * scaleX))
    let borderDamageBottom = int32(Math.Ceiling(
      (borderBounds.Y + borderBounds.Height) * scaleY))
    Require(borderMutationState.AcquiredImageState
        && borderMutationState.PartialRedraw
        && !borderMutationState.FullRedraw
        && borderMutationState.DamageWidth < metrics.FramebufferWidth
        && borderMutationState.DamageHeight < metrics.FramebufferHeight
        && borderMutationState.DamageX <= borderDamageLeft
        && borderMutationState.DamageY <= borderDamageTop
        && borderMutationState.DamageX + borderMutationState.DamageWidth
      >= borderDamageRight
        && borderMutationState.DamageY + borderMutationState.DamageHeight
      >= borderDamageBottom,
      "Retained border color mutation did not produce bounded acquired-image damage"
      +" acquired=" + borderMutationState.AcquiredImageState.ToString()
      +" partial=" + borderMutationState.PartialRedraw.ToString()
      +" full=" + borderMutationState.FullRedraw.ToString()
      +" sceneVersion=" + borderMutationState.SceneVersion.ToString()
      +" activeVersion=" + borderMutationState.ActiveSceneVersion.ToString()
      +" appliedVersion="
      +borderMutationState.ActiveAppliedSceneVersion.ToString()
      +" pendingVersion="
      +borderMutationState.ActivePendingSceneVersion.ToString()
      +" damageX=" + borderMutationState.DamageX.ToString()
      +" damageY=" + borderMutationState.DamageY.ToString()
      +" damageWidth=" + borderMutationState.DamageWidth.ToString()
      +" damageHeight=" + borderMutationState.DamageHeight.ToString()
      +" expectedX=" + borderDamageLeft.ToString()
      +" expectedY=" + borderDamageTop.ToString()
      +" expectedRight=" + borderDamageRight.ToString()
      +" expectedBottom=" + borderDamageBottom.ToString()
      +" framebufferWidth=" + metrics.FramebufferWidth.ToString()
      +" framebufferHeight=" + metrics.FramebufferHeight.ToString()
      +" dirty=" + borderMutationState.DirtyChunkCount.ToString()
      +" reused=" + borderMutationState.ReusedChunkCount.ToString())
    borderMutationResult = PrimitiveReadback(opened, metrics)
    PrimitiveRequirePixelNear(borderMutationResult!!.Pixels, borderMutationResult!!.Width, metrics,
      200.0, 9.0, uint8(248), uint8(196), uint8(48), 8, "mutated_border_top")
    PrimitiveRequirePixelNear(borderMutationResult!!.Pixels, borderMutationResult!!.Width, metrics,
      230.0, 24.0, uint8(96), uint8(224), uint8(128), 8, "mutated_border_right")
    PrimitiveRequirePixelNear(borderMutationResult!!.Pixels, borderMutationResult!!.Width, metrics,
      200.0, 38.0, uint8(72), uint8(144), uint8(232), 8, "mutated_border_bottom")
    PrimitiveRequirePixelNear(borderMutationResult!!.Pixels, borderMutationResult!!.Width, metrics,
      170.0, 24.0, uint8(224), uint8(184), uint8(72), 8, "mutated_border_left")
    RetainedRequireOutsideStable(topologyRemoveResult!!.Pixels,
      borderMutationResult!!.Pixels, borderMutationResult!!.Width,
      borderMutationResult!!.Height, borderDamageLeft, borderDamageTop,
      borderDamageRight, borderDamageBottom)

    root.ToggleBorderUnsupportedFeature()
    WindowReadbackTestFixture.ForceRender(opened, 0.0166666666666667)
    borderUnsupportedState = WindowReadbackTestFixture.SceneRetention(opened)
    let borderFallbacks = borderUnsupportedState.RetainedBorderFallbackCount
    -borderMutationState.RetainedBorderFallbackCount
    let borderFallbackInvalidations = borderUnsupportedState.RetainedBorderInvalidationCount
    -borderMutationState.RetainedBorderInvalidationCount
    Require(borderFallbacks == 1uL
        && borderFallbackInvalidations == 1uL
        && borderUnsupportedState.AcquiredImageState
        && borderUnsupportedState.FullRedraw
        && !borderUnsupportedState.PartialRedraw
        && borderUnsupportedState.DamageWidth == metrics.FramebufferWidth
        && borderUnsupportedState.DamageHeight == metrics.FramebufferHeight,
      "Retained rounded border fallback did not force full acquired-image damage")
    RetainedRequireBorderPayload(borderUnsupportedState, borderBounds, scaleX, scaleY,
      radiusScale, 2.0, 3.0, 4.0, 5.0, 6.0, changedBorderTopColor,
      borderRightColor, borderBottomColor, borderLeftColor, solidBorderStyle,
      "rounded border fallback")

    root.ToggleBorderUnsupportedFeature()
    WindowReadbackTestFixture.ForceRender(opened, 0.0166666666666667)
    borderRecapturedState = WindowReadbackTestFixture.SceneRetention(opened)
    let borderRecapturedRebuilds = borderRecapturedState.RetainedBorderRebuildCount
    -borderUnsupportedState.RetainedBorderRebuildCount
    let borderRecapturedInvalidations = borderRecapturedState.RetainedBorderInvalidationCount
    -borderUnsupportedState.RetainedBorderInvalidationCount
    Require(borderRecapturedRebuilds == 1uL
        && borderRecapturedInvalidations == 0uL
        && borderRecapturedState.RetainedBorderFallbackCount
      == borderUnsupportedState.RetainedBorderFallbackCount,
      "Retained rounded border removal did not recapture the exact border leaf")
    RetainedRequireBorderPayload(borderRecapturedState, borderBounds, scaleX, scaleY,
      radiusScale, 2.0, 3.0, 4.0, 5.0, 0.0, changedBorderTopColor,
      borderRightColor, borderBottomColor, borderLeftColor, solidBorderStyle,
      "recaptured border")
    WindowReadbackTestFixture.ForceRender(opened, 0.0166666666666667)
    borderWarmState = WindowReadbackTestFixture.SceneRetention(opened)
    let recapturedBorderTotal = borderWarmState.RetainedBorderTotalCount
    -borderRecapturedState.RetainedBorderTotalCount
    let recapturedBorderHits = borderWarmState.RetainedBorderHitCount
    -borderRecapturedState.RetainedBorderHitCount
    Require(recapturedBorderTotal > 0uL
        && recapturedBorderHits == recapturedBorderTotal
        && borderWarmState.RetainedBorderRebuildCount
      == borderRecapturedState.RetainedBorderRebuildCount
        && borderWarmState.RetainedBorderFallbackCount
      == borderRecapturedState.RetainedBorderFallbackCount
        && borderWarmState.RetainedBorderInvalidationCount
      == borderRecapturedState.RetainedBorderInvalidationCount,
      "Retained recaptured border leaf did not return to exact warm hits")
    RetainedRequireBorderPayload(borderWarmState, borderBounds, scaleX, scaleY, radiusScale,
      2.0, 3.0, 4.0, 5.0, 0.0, changedBorderTopColor, borderRightColor,
      borderBottomColor, borderLeftColor, solidBorderStyle, "recaptured warm border")

    root.MutateParentBox()
    WindowReadbackTestFixture.ForceRender(opened, 0.0166666666666667)
    parentMutatedState = WindowReadbackTestFixture.SceneRetention(opened)
    let parentMutationTotal = parentMutatedState.RetainedParentBoxTotalCount
    -borderWarmState.RetainedParentBoxTotalCount
    let parentMutationHits = parentMutatedState.RetainedParentBoxHitCount
    -borderWarmState.RetainedParentBoxHitCount
    let parentMutationRebuilds = parentMutatedState.RetainedParentBoxRebuildCount
    -borderWarmState.RetainedParentBoxRebuildCount
    let parentMutationInvalidations = parentMutatedState.RetainedParentBoxInvalidationCount
    -borderWarmState.RetainedParentBoxInvalidationCount
    let parentMutationLeafTotal = parentMutatedState.RetainedLeafTotalCount
    -borderWarmState.RetainedLeafTotalCount
    let parentMutationLeafHits = parentMutatedState.RetainedLeafHitCount
    -borderWarmState.RetainedLeafHitCount
    let parentMutationBorderTotal = parentMutatedState.RetainedBorderTotalCount
    -borderWarmState.RetainedBorderTotalCount
    let parentMutationBorderHits = parentMutatedState.RetainedBorderHitCount
    -borderWarmState.RetainedBorderHitCount
    Require(parentMutationTotal > 0uL
        && parentMutationRebuilds == 1uL
        && parentMutationInvalidations == 1uL
        && parentMutationHits == parentMutationTotal - 1uL
        && parentMutationLeafTotal > 0uL
        && parentMutationLeafHits == parentMutationLeafTotal
        && parentMutationBorderTotal > 0uL
        && parentMutationBorderHits == parentMutationBorderTotal
        && parentMutatedState.RetainedBorderRebuildCount
      == borderWarmState.RetainedBorderRebuildCount
        && parentMutatedState.RetainedBorderFallbackCount
      == borderWarmState.RetainedBorderFallbackCount
        && parentMutatedState.RetainedBorderInvalidationCount
      == borderWarmState.RetainedBorderInvalidationCount,
      "Retained parent mutation did not rebuild one own box and continue exact children")
    parentMutationResult = PrimitiveReadback(opened, metrics)
    PrimitiveRequirePixelNear(parentMutationResult!!.Pixels, parentMutationResult!!.Width, metrics,
      200.0, 72.0, uint8(18), uint8(30), uint8(48), 8, "parent_mutated_background")
    PrimitiveRequirePixelNear(parentMutationResult!!.Pixels, parentMutationResult!!.Width, metrics,
      200.0, 9.0, uint8(248), uint8(196), uint8(48), 8, "recaptured_border_top")
    PrimitiveRequirePixelNear(parentMutationResult!!.Pixels, parentMutationResult!!.Width, metrics,
      230.0, 24.0, uint8(96), uint8(224), uint8(128), 8, "recaptured_border_right")
    PrimitiveRequirePixelNear(parentMutationResult!!.Pixels, parentMutationResult!!.Width, metrics,
      200.0, 38.0, uint8(72), uint8(144), uint8(232), 8, "recaptured_border_bottom")
    PrimitiveRequirePixelNear(parentMutationResult!!.Pixels, parentMutationResult!!.Width, metrics,
      170.0, 24.0, uint8(224), uint8(184), uint8(72), 8, "recaptured_border_left")

    root.ToggleParentUnsupportedFeature()
    WindowReadbackTestFixture.ForceRender(opened, 0.0166666666666667)
    parentUnsupportedState = WindowReadbackTestFixture.SceneRetention(opened)
    let parentFallbacks = parentUnsupportedState.RetainedParentBoxFallbackCount
    -parentMutatedState.RetainedParentBoxFallbackCount
    let parentFallbackInvalidations = parentUnsupportedState.RetainedParentBoxInvalidationCount
    -parentMutatedState.RetainedParentBoxInvalidationCount
    let genericChildFallbacks = parentUnsupportedState.RetainedLeafFallbackCount
    -parentMutatedState.RetainedLeafFallbackCount
    let genericBorderFallbacks = parentUnsupportedState.RetainedBorderFallbackCount
    -parentMutatedState.RetainedBorderFallbackCount
    let genericBorderInvalidations = parentUnsupportedState.RetainedBorderInvalidationCount
    -parentMutatedState.RetainedBorderInvalidationCount
    Require(parentFallbacks == 1uL
        && parentFallbackInvalidations == 1uL
        && genericChildFallbacks == 4uL
        && genericBorderFallbacks == 1uL
        && genericBorderInvalidations == 1uL
        && parentUnsupportedState.MutatedSolidLeafFound
        && parentUnsupportedState.FullRedraw
        && !parentUnsupportedState.PartialRedraw,
      "Retained parent fallback did not continue through generic child compilation")

    root.ToggleParentUnsupportedFeature()
    WindowReadbackTestFixture.ForceRender(opened, 0.0166666666666667)
    parentRecapturedState = WindowReadbackTestFixture.SceneRetention(opened)
    let parentRecapturedRebuilds = parentRecapturedState.RetainedParentBoxRebuildCount
    -parentUnsupportedState.RetainedParentBoxRebuildCount
    let parentRecapturedLeafRebuilds = parentRecapturedState.RetainedLeafRebuildCount
    -parentUnsupportedState.RetainedLeafRebuildCount
    let parentRecapturedBorderRebuilds = parentRecapturedState.RetainedBorderRebuildCount
    -parentUnsupportedState.RetainedBorderRebuildCount
    let parentRecapturedBorderInvalidations = parentRecapturedState.RetainedBorderInvalidationCount
    -parentUnsupportedState.RetainedBorderInvalidationCount
    Require(parentRecapturedRebuilds == 1uL
        && parentRecapturedLeafRebuilds == 4uL
        && parentRecapturedBorderRebuilds == 1uL
        && parentRecapturedBorderInvalidations == 0uL
        && parentRecapturedState.RetainedParentBoxFallbackCount
      == parentUnsupportedState.RetainedParentBoxFallbackCount
        && parentRecapturedState.RetainedParentBoxInvalidationCount
      == parentUnsupportedState.RetainedParentBoxInvalidationCount,
      "Retained parent fallback did not recapture the own box and children")

    finalState = mutatedState
    var frame int32 = 0
    while frame < 8 && finalState.ActiveAppliedSceneVersion == 0uL {
      WindowReadbackTestFixture.ForceRender(opened, 0.0166666666666667)
      finalState = WindowReadbackTestFixture.SceneRetention(opened)
      frame = frame + 1
    }
    Require(finalState.AcquiredImageState
        && finalState.ActiveImagePromoted
        && finalState.ActiveAppliedSceneVersion > 0uL,
      "Retained acquired swapchain image scene version was never promoted")
    Require(finalState.PendingImageCount > 0u
        && finalState.ActivePendingSceneVersion == finalState.ActiveSceneVersion
        && finalState.PendingSceneVersion == finalState.ActiveSceneVersion,
      "Retained acquired image scene version was not left pending after presentation")
    Require(WindowReadbackTestFixture.RequestCount(opened) == 7uL
        && WindowReadbackTestFixture.CompletionCount(opened) == 7uL,
      "Retained readback lifecycle counts are incorrect")

    var clipFrame VulkanClipMaskRetentionTestSnapshot =
    WindowReadbackTestFixture.ClipMaskRetention(opened)
    var priorClipSlot int32 = -1
    var alternatedClipSlots bool = false
    var sawClipSlot0 bool = false
    var sawClipSlot1 bool = false
    var warmupBoundReady bool = false
    var warmupMappedWrites uint64 = 0uL
    var warmupFlushes uint64 = 0uL
    var clipWarmupFrame int32 = 0
    while clipWarmupFrame < 12
      && (!warmupBoundReady || !alternatedClipSlots || !clipFrame.Retained) {
        WindowReadbackTestFixture.ForceRender(opened, 0.0166666666666667)
        let nextClipFrame = WindowReadbackTestFixture.ClipMaskRetention(opened)
        if nextClipFrame.ByteCount > 0uL {
          if priorClipSlot >= 0 && priorClipSlot != nextClipFrame.SlotIndex {
            alternatedClipSlots = true
          }
          priorClipSlot = nextClipFrame.SlotIndex
          if nextClipFrame.SlotIndex == 0 {
            sawClipSlot0 = true
          } else if nextClipFrame.SlotIndex == 1 {
            sawClipSlot1 = true
          }
          if sawClipSlot0 && sawClipSlot1 && !warmupBoundReady {
            warmupBoundReady = true
            warmupMappedWrites = nextClipFrame.TotalMappedWrites
            warmupFlushes = nextClipFrame.TotalFlushes
          }
        }
        clipFrame = nextClipFrame
        clipWarmupFrame = clipWarmupFrame + 1
      }
    Require(warmupBoundReady && alternatedClipSlots
        && sawClipSlot0 && sawClipSlot1 && clipFrame.RetentionEligible
        && clipFrame.Retained && clipFrame.RetentionValid,
      "Retained clip frame slots did not alternate and retain the eligible payload")
    Require(clipFrame.WrittenBytes == 0uL
        && clipFrame.MappedWrites == 0uL
        && clipFrame.Flushes == 0uL
        && clipFrame.SkippedBytes == clipFrame.ByteCount
        && clipFrame.SkippedBytes > 0uL
        && clipFrame.RetainedReuse > 0uL
        && clipFrame.MaskCount == 0
        && clipFrame.ClipChainCount == 1
        && clipFrame.LayerCount == 0,
      "Retained clip frame payload evidence is invalid: slot="
      +clipFrame.SlotIndex.ToString() + " bytes="
      +clipFrame.ByteCount.ToString() + " skipped="
      +clipFrame.SkippedBytes.ToString())
    Require(clipFrame.TotalMappedWrites > 0uL
        && clipFrame.TotalFlushes > 0uL
        && clipFrame.TotalMappedWrites <= warmupMappedWrites
        && clipFrame.TotalFlushes <= warmupFlushes
        && clipFrame.TotalWrittenBytes > 0uL
        && clipFrame.TotalSkippedBytes > 0uL
        && clipFrame.TotalRetainedReuse > 0uL,
      "Retained clip frame cumulative retention evidence is invalid: mapped="
      +clipFrame.TotalMappedWrites.ToString() + " flushes="
      +clipFrame.TotalFlushes.ToString() + " warmupMapped="
      +warmupMappedWrites.ToString() + " warmupFlushes="
      +warmupFlushes.ToString())
    opened.RequestClose()
    WindowReadbackTestFixture.ForceRender(opened, 0.0)
    Require(!opened.IsOpen, "Retained scene window did not close")
    Require(WindowReadbackTestFixture.ResidentResourceBytes(opened) == 0uL,
      "Retained scene readback resources remain resident after close")
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
  Require(!diagnostics.Contains("\"event\":325")
      && !diagnostics.Contains("\"event\":326"),
    "Retained scene emitted unsupported-scene diagnostics")
  let damageCount = DiagnosticCounter(diagnostics, "damageCount")
  let dirtyChunkCount = DiagnosticCounter(diagnostics, "dirtyChunkCount")
  let reusedChunkCount = DiagnosticCounter(diagnostics, "reusedChunkCount")
  let drawCount = DiagnosticCounter(diagnostics, "drawCount")
  let recordCount = DiagnosticCounter(diagnostics, "recordCount")
  let clipFrameWrittenBytes = DiagnosticCounter(diagnostics, "clipFrameWrittenBytes")
  let clipFrameSkippedBytes = DiagnosticCounter(diagnostics, "clipFrameSkippedBytes")
  let clipFrameMappedWrites = DiagnosticCounter(diagnostics, "clipFrameMappedWrites")
  let clipFrameFlushes = DiagnosticCounter(diagnostics, "clipFrameFlushes")
  let clipFrameRetainedReuse = DiagnosticCounter(diagnostics, "clipFrameRetainedReuse")
  let clipFrameRetained = DiagnosticCounter(diagnostics, "clipFrameRetained")
  Require(clipFrameWrittenBytes > 0uL
      && clipFrameSkippedBytes > 0uL
      && clipFrameMappedWrites > 0uL
      && clipFrameFlushes > 0uL
      && clipFrameRetainedReuse > 0uL
      && clipFrameRetained == 1uL,
    "Retained diagnostics did not emit clip payload retention evidence: written="
    +clipFrameWrittenBytes.ToString() + " skipped="
    +clipFrameSkippedBytes.ToString() + " mapped="
    +clipFrameMappedWrites.ToString() + " flushes="
    +clipFrameFlushes.ToString() + " reuse="
    +clipFrameRetainedReuse.ToString() + " retained="
    +clipFrameRetained.ToString())
  Require(damageCount >= 2uL && drawCount > 0uL && recordCount > 0uL
      && reusedChunkCount > 0uL,
    "Retained diagnostics did not retain render and damage evidence: damage="
    +damageCount.ToString() + " dirty=" + dirtyChunkCount.ToString()
    +" reused=" + reusedChunkCount.ToString() + " draw=" + drawCount.ToString()
    +" record=" + recordCount.ToString())
  Console.WriteLine("retention-smoke: first_use_full=1 box_mutation=1 partial_damage=1"
    +" parent_own_box=1"
    +" bounds_old_background=1 topology_add_full=1 topology_remove_full=1"
    +" exact_leaf_solid_rounded=1 exact_color_miss=1 exact_bounds_miss=1"
    +" exact_border_leaf=1"
    +" unsupported_fallback_recapture=1"
    +" primitive_first_full=1 primitive_slots=2 primitive_warm_copy_zero=1"
    +" primitive_staging_candidate=1"
    +" primitive_mutation_dirty=1 primitive_mutation_planned_transfer="
    +mutatedPrimitive.PlannedTransferBytes.ToString()
    +" primitive_topology_full=1 image_version_promotion=1 damageCount="
    +damageCount.ToString() + " dirtyChunkCount=" + dirtyChunkCount.ToString()
    +" reusedChunkCount=" + reusedChunkCount.ToString()
    +" drawCount=" + drawCount.ToString() + " recordCount="
    +recordCount.ToString() + " clipWritten="
    +clipFrameWrittenBytes.ToString() + " clipSkipped="
    +clipFrameSkippedBytes.ToString() + " clipMapped="
    +clipFrameMappedWrites.ToString() + " clipFlushes="
    +clipFrameFlushes.ToString() + " clipReuse="
    +clipFrameRetainedReuse.ToString() + " clipRetained="
    +clipFrameRetained.ToString() + " close=1")
}

func RunPrimitivePixelSmoke() {
  Require(Environment.GetEnvironmentVariable("GOO_VK_DIAGNOSTICS") == "1",
    "GOO_VK_DIAGNOSTICS=1 is required")
  let root = PrimitiveSmokeCell{}
  let capturedError = StringWriter()
  let originalError = Console.Error
  var window Window? = nil
  var initialResult VulkanReadbackResult? = nil
  var scrolledResult VulkanReadbackResult? = nil
  try {
    let opened = Window{
      Title: "Goo Primitive Vulkan pixel gate",
      Width: 400,
      Height: 220,
      VSync: false,
      Root: root,
    }
    window = opened
    Console.SetError(capturedError)
    opened.Open()
    WindowReadbackTestFixture.ForceRender(opened, 0.0)
    var frame int32 = 0
    while frame < 8 {
      WindowReadbackTestFixture.ForceRender(opened, 0.0166666666666667)
      frame = frame + 1
    }
    let metrics = WindowReadbackTestFixture.Metrics(opened)
    Require(metrics.LogicalWidth == 400 && metrics.LogicalHeight == 220,
      "Primitive logical window metrics are incorrect")
    Require(PrimitiveSmokeCell.Root.IsMounted
        && PrimitiveSmokeCell.ScrollViewport.IsMounted
        && PrimitiveSmokeCell.ScrollLeaf.IsMounted,
      "Primitive pixel gate did not mount required handles")
    initialResult = PrimitiveReadback(opened, metrics)
    let initialPixels = initialResult!!.Pixels
    PrimitiveRequirePixelNear(initialPixels, initialResult!!.Width, metrics,
      30.0, 25.0, uint8(42), uint8(112), uint8(188), 4, "solid")
    PrimitiveRequirePixelNear(initialPixels, initialResult!!.Width, metrics,
      130.0, 25.0, uint8(82), uint8(176), uint8(112), 4, "rounded")
    PrimitiveRequirePixelNear(initialPixels, initialResult!!.Width, metrics,
      95.0, 11.0, uint8(12), uint8(20), uint8(32), 4, "rounded_corner")
    PrimitiveRequirePixelNear(initialPixels, initialResult!!.Width, metrics,
      215.0, 11.0, uint8(232), uint8(96), uint8(72), 6, "solid_border_top")
    PrimitiveRequirePixelNear(initialPixels, initialResult!!.Width, metrics,
      249.0, 25.0, uint8(96), uint8(224), uint8(128), 6, "solid_border_right")
    PrimitiveRequirePixelNear(initialPixels, initialResult!!.Width, metrics,
      215.0, 45.0, uint8(72), uint8(144), uint8(232), 6, "solid_border_bottom")
    PrimitiveRequirePixelNear(initialPixels, initialResult!!.Width, metrics,
      181.0, 25.0, uint8(224), uint8(184), uint8(72), 6, "solid_border_left")
    PrimitiveRequireBorderPattern(initialPixels, initialResult!!.Width, metrics,
      266, 318, "dashed border")
    PrimitiveRequireBorderPattern(initialPixels, initialResult!!.Width, metrics,
      336, 388, "dotted border")
    PrimitiveRequirePixelNear(initialPixels, initialResult!!.Width, metrics,
      15.0, 80.0, uint8(27), uint8(75), uint8(140), 10, "linear_gradient_start")
    PrimitiveRequirePixelNear(initialPixels, initialResult!!.Width, metrics,
      50.0, 80.0, uint8(46), uint8(126), uint8(196), 8, "linear_gradient_mid")
    PrimitiveRequirePixelNear(initialPixels, initialResult!!.Width, metrics,
      95.0, 80.0, uint8(83), uint8(163), uint8(203), 8, "linear_gradient_stop")
    PrimitiveRequirePixelNear(initialPixels, initialResult!!.Width, metrics,
      125.0, 80.0, uint8(44), uint8(102), uint8(159), 10, "linear_gradient_end")
    PrimitiveRequirePixelNear(initialPixels, initialResult!!.Width, metrics,
      200.0, 86.0, uint8(232), uint8(178), uint8(78), 8, "radial_gradient_center")
    PrimitiveRequirePixelNear(initialPixels, initialResult!!.Width, metrics,
      145.0, 86.0, uint8(137), uint8(64), uint8(91), 14, "radial_gradient_edge")
    PrimitiveRequirePixelNear(initialPixels, initialResult!!.Width, metrics,
      276.0, 64.0, uint8(24), uint8(42), uint8(72), 8, "transform_outer")
    PrimitiveRequirePixelNear(initialPixels, initialResult!!.Width, metrics,
      290.0, 78.0, uint8(196), uint8(224), uint8(88), 8, "transform_inner")
    PrimitiveRequirePixelNear(initialPixels, initialResult!!.Width, metrics,
      30.0, 148.0, uint8(52), uint8(196), uint8(112), 8, "scroll_leaf")
    PrimitiveRequirePixelNear(initialPixels, initialResult!!.Width, metrics,
      105.0, 148.0, uint8(12), uint8(20), uint8(32), 8, "rect_clip")
    PrimitiveRequirePixelNear(initialPixels, initialResult!!.Width, metrics,
      120.0, 155.0, uint8(12), uint8(20), uint8(32), 8, "hidden_leaf")
    PrimitiveRequirePixelNear(initialPixels, initialResult!!.Width, metrics,
      202.0, 142.0, uint8(36), uint8(76), uint8(208), 8, "back_stack")
    PrimitiveRequirePixelNear(initialPixels, initialResult!!.Width, metrics,
      220.0, 165.0, uint8(220), uint8(48), uint8(48), 8, "front_stack")
    PrimitiveRequireBlended(initialPixels, initialResult!!.Width, metrics,
      160.0, 158.0, "opacity_leaf")
    let beforeOffset = PrimitiveSmokeCell.ScrollViewport.ScrollOffset.X
    Require(PrimitiveSmokeCell.ScrollViewport.ScrollTo(24.0, 0.0),
      "Primitive scroll request was rejected")
    WindowReadbackTestFixture.ForceRender(opened, 0.05)
    let afterOffset = PrimitiveSmokeCell.ScrollViewport.ScrollOffset.X
    Require(afterOffset > beforeOffset,
      "Primitive scroll offset did not advance")
    scrolledResult = PrimitiveReadback(opened, metrics)
    let scrolledPixels = scrolledResult!!.Pixels
    PrimitiveRequirePixelDifferent(scrolledPixels, scrolledResult!!.Width, metrics,
      30.0, 148.0, uint8(52), uint8(196), uint8(112), 12, "scroll_leaf")
    PrimitiveRequirePixelNear(scrolledPixels, scrolledResult!!.Width, metrics,
      12.0, 148.0, uint8(52), uint8(196), uint8(112), 12, "scroll_clip_sliver")
    Require(WindowReadbackTestFixture.RequestCount(opened) == 2uL
        && WindowReadbackTestFixture.CompletionCount(opened) == 2uL,
      "Primitive readback lifecycle counts are incorrect")
    let residentBeforeClose = WindowReadbackTestFixture.ResidentResourceBytes(opened)
    Require(residentBeforeClose >= uint64(scrolledResult!!.Pixels.Length),
      "Primitive readback resources are not resident before close")
    opened.RequestClose()
    WindowReadbackTestFixture.ForceRender(opened, 0.0)
    Require(!opened.IsOpen, "Primitive pixel gate window did not close")
    Require(WindowReadbackTestFixture.ResidentResourceBytes(opened) == 0uL,
      "Primitive readback resources remain resident after close")
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
  Require(!diagnostics.Contains("\"event\":325")
      && !diagnostics.Contains("\"event\":326"),
    "Primitive pixel gate emitted unsupported-scene diagnostics")
  let drawCount = DiagnosticCounter(diagnostics, "drawCount")
  let planCompileCount = DiagnosticCounter(diagnostics, "planCompileCount")
  let recordCount = DiagnosticCounter(diagnostics, "recordCount")
  let readbackCount = DiagnosticCounter(diagnostics, "readbackCount")
  Require(drawCount > 0uL && planCompileCount > 0uL && recordCount > 0uL
      && readbackCount == 2uL,
    "Primitive pixel gate did not record the expected render and readback work")
  Console.WriteLine("primitive-pixel-smoke: boxes=1 borders=solid,dashed,dotted gradients=2,4"
    +" transforms=1 clips=1 scroll=1 visibility=1 opacity=1 stacking=1"
    +" drawCount=" + drawCount.ToString()
    +" planCompileCount=" + planCompileCount.ToString()
    +" recordCount=" + recordCount.ToString()
    +" readbackCount=" + readbackCount.ToString() + " close=1")
}

func RunRoundedOverflowSmoke() {
  Require(Environment.GetEnvironmentVariable("GOO_VK_DIAGNOSTICS") == "1",
    "GOO_VK_DIAGNOSTICS=1 is required")
  let fontPath = Path.Combine(AppContext.BaseDirectory, "VendSans-VariableFont_wght.ttf")
  Require(File.Exists(fontPath), "Readback text font asset is missing")
  let font = FontSource("ReadbackGateFont", 400, false, File.ReadAllBytes(fontPath))
  font.Register()
  let root = RoundedOverflowCell{}
  let capturedError = StringWriter()
  let originalError = Console.Error
  var window Window? = nil
  var initialResult VulkanReadbackResult? = nil
  var axisScrolledResult VulkanReadbackResult? = nil
  var verticalScrolledResult VulkanReadbackResult? = nil
  try {
    let opened = Window{
      Title: "Goo Readback mixed-axis clip gate",
      Width: 400,
      Height: 190,
      VSync: false,
      Root: root,
    }
    window = opened
    Console.SetError(capturedError)
    opened.Open()
    WindowReadbackTestFixture.ForceRender(opened, 0.0)
    var frame int32 = 0
    while frame < 8 {
      WindowReadbackTestFixture.ForceRender(opened, 0.0166666666666667)
      frame = frame + 1
    }
    let metrics = WindowReadbackTestFixture.Metrics(opened)
    Require(metrics.LogicalWidth == 400 && metrics.LogicalHeight == 190,
      "Readback mixed-axis clip logical window metrics are incorrect")
    Require(RoundedOverflowCell.Root.IsMounted
        && RoundedOverflowCell.HorizontalViewport.IsMounted
        && RoundedOverflowCell.HorizontalContent.IsMounted
        && RoundedOverflowCell.HorizontalStripe.IsMounted
        && RoundedOverflowCell.VerticalViewport.IsMounted
        && RoundedOverflowCell.VerticalContent.IsMounted
        && RoundedOverflowCell.VerticalStripe.IsMounted
        && RoundedOverflowCell.RoundedHidden.IsMounted
        && RoundedOverflowCell.RoundedText.IsMounted
        && RoundedOverflowCell.RoundedImage.IsMounted
        && RoundedOverflowCell.RoundedScroll.IsMounted
        && RoundedOverflowCell.RoundedScrollContent.IsMounted
        && RoundedOverflowCell.RoundedScrollStripe.IsMounted
        && RoundedOverflowCell.ClipOuter.IsMounted
        && RoundedOverflowCell.ClipInner.IsMounted
        && RoundedOverflowCell.TransformLeaf.IsMounted,
      "Readback mixed-axis clip gate did not mount required handles")
    Require(RoundedOverflowCell.HorizontalContent.BorderBox.Width
      > RoundedOverflowCell.HorizontalViewport.BorderBox.Width
        && RoundedOverflowCell.VerticalContent.BorderBox.Height
      > RoundedOverflowCell.VerticalViewport.BorderBox.Height
        && RoundedOverflowCell.RoundedScrollContent.BorderBox.Width
      > RoundedOverflowCell.RoundedScroll.BorderBox.Width,
      "Readback mixed-axis clip gate did not retain overflowing child geometry")
    initialResult = PrimitiveReadback(opened, metrics)
    let initialPixels = initialResult!!.Pixels
    let horizontalBounds = RoundedOverflowCell.HorizontalViewport.BorderBox
    PrimitiveRequirePixelNear(initialPixels, initialResult!!.Width, metrics,
      horizontalBounds.X - 1.0, horizontalBounds.Y - 1.0,
      uint8(12), uint8(20), uint8(32), 8, "horizontal_background")
    PrimitiveRequirePixelNear(initialPixels, initialResult!!.Width, metrics,
      68.0, 30.0, uint8(52), uint8(196), uint8(112), 8, "horizontal_initial")
    PrimitiveRequirePixelNear(initialPixels, initialResult!!.Width, metrics,
      20.0, 70.0, uint8(52), uint8(196), uint8(112), 8, "horizontal_vertical_visible")
    PrimitiveRequirePixelNear(initialPixels, initialResult!!.Width, metrics,
      180.0, 30.0, uint8(228), uint8(160), uint8(64), 8, "vertical_initial")
    PrimitiveRequirePixelNear(initialPixels, initialResult!!.Width, metrics,
      268.0, 30.0, uint8(228), uint8(160), uint8(64), 8, "vertical_horizontal_visible")
    PrimitiveRequirePixelNear(initialPixels, initialResult!!.Width, metrics,
      9.0, 85.0, uint8(12), uint8(20), uint8(32), 8, "rounded_hidden_top_left")
    PrimitiveRequirePixelNear(initialPixels, initialResult!!.Width, metrics,
      130.0, 85.0, uint8(12), uint8(20), uint8(32), 8, "rounded_hidden_top_right")
    PrimitiveRequirePixelNear(initialPixels, initialResult!!.Width, metrics,
      9.0, 178.0, uint8(12), uint8(20), uint8(32), 8, "rounded_hidden_bottom_left")
    PrimitiveRequirePixelNear(initialPixels, initialResult!!.Width, metrics,
      130.0, 178.0, uint8(12), uint8(20), uint8(32), 8, "rounded_hidden_bottom_right")
    PrimitiveRequirePixelNear(initialPixels, initialResult!!.Width, metrics,
      24.0, 130.0, uint8(228), uint8(64), uint8(72), 8, "rounded_hidden_center")
    PrimitiveRequirePixelNear(initialPixels, initialResult!!.Width, metrics,
      91.0, 141.0, uint8(248), uint8(72), uint8(72), 28, "image_top_left")
    PrimitiveRequirePixelNear(initialPixels, initialResult!!.Width, metrics,
      120.0, 166.0, uint8(236), uint8(196), uint8(72), 28, "image_bottom_right")
    RequireTextCoverage(initialPixels, initialResult!!.Width, metrics,
      18, 96, 98, 128, "rounded_text")
    PrimitiveRequirePixelNear(initialPixels, initialResult!!.Width, metrics,
      149.0, 85.0, uint8(12), uint8(20), uint8(32), 8, "rounded_scroll_top_left")
    PrimitiveRequirePixelNear(initialPixels, initialResult!!.Width, metrics,
      270.0, 85.0, uint8(12), uint8(20), uint8(32), 8, "rounded_scroll_top_right")
    PrimitiveRequirePixelNear(initialPixels, initialResult!!.Width, metrics,
      149.0, 178.0, uint8(12), uint8(20), uint8(32), 8, "rounded_scroll_bottom_left")
    PrimitiveRequirePixelNear(initialPixels, initialResult!!.Width, metrics,
      270.0, 178.0, uint8(12), uint8(20), uint8(32), 8, "rounded_scroll_bottom_right")
    PrimitiveRequirePixelNear(initialPixels, initialResult!!.Width, metrics,
      210.0, 130.0, uint8(52), uint8(196), uint8(112), 8, "rounded_scroll_initial")
    let outerBounds = RoundedOverflowCell.ClipOuter.BorderBox
    let innerBounds = RoundedOverflowCell.ClipInner.BorderBox
    PrimitiveRequirePixelNear(initialPixels, initialResult!!.Width, metrics,
      290.0, 86.0, uint8(12), uint8(20), uint8(32), 8, "outer_clip_corner")
    PrimitiveRequirePixelNear(initialPixels, initialResult!!.Width, metrics,
      outerBounds.X + outerBounds.Width * 0.30,
      outerBounds.Y + outerBounds.Height * 0.25,
      uint8(32), uint8(96), uint8(144), 12, "inner_clip_outside")
    PrimitiveRequirePixelNear(initialPixels, initialResult!!.Width, metrics,
      innerBounds.X + innerBounds.Width * 0.25,
      innerBounds.Y + innerBounds.Height * 0.75,
      uint8(160), uint8(64), uint8(192), 16, "inner_clip_inside")
    PrimitiveRequirePixelNear(initialPixels, initialResult!!.Width, metrics,
      340.0, 130.0, uint8(236), uint8(196), uint8(72), 24, "transformed_leaf")
    let horizontalBefore = RoundedOverflowCell.HorizontalViewport.ScrollOffset.X
    let roundedBefore = RoundedOverflowCell.RoundedScroll.ScrollOffset.X
    Require(RoundedOverflowCell.HorizontalViewport.ScrollTo(80.0, 0.0),
      "Readback horizontal scroll request was rejected")
    Require(RoundedOverflowCell.RoundedScroll.ScrollTo(80.0, 0.0),
      "Readback rounded scroll request was rejected")
    WindowReadbackTestFixture.ForceRender(opened, 0.05)
    let horizontalAfter = RoundedOverflowCell.HorizontalViewport.ScrollOffset.X
    let roundedAfter = RoundedOverflowCell.RoundedScroll.ScrollOffset.X
    Require(horizontalAfter > horizontalBefore && roundedAfter > roundedBefore,
      "Readback horizontal scroll offsets did not advance")
    axisScrolledResult = PrimitiveReadback(opened, metrics)
    let axisScrolledPixels = axisScrolledResult!!.Pixels
    let horizontalViewportBoundsAfter = RoundedOverflowCell.HorizontalViewport.BorderBox
    let horizontalStripeBoundsAfter = RoundedOverflowCell.HorizontalStripe.BorderBox
    let horizontalStripeSampleX = if horizontalStripeBoundsAfter.X
    > horizontalViewportBoundsAfter.X{
      horizontalStripeBoundsAfter.X + 4.0
    } else {
      horizontalViewportBoundsAfter.X + 4.0
    }
    let horizontalStripeSampleY = horizontalViewportBoundsAfter.Y
    +horizontalViewportBoundsAfter.Height * 0.5
    let roundedStripeBoundsAfter = RoundedOverflowCell.RoundedScrollStripe.BorderBox
    let roundedViewportBoundsAfter = RoundedOverflowCell.RoundedScroll.BorderBox
    let roundedStripeSampleX = if roundedStripeBoundsAfter.X
    > roundedViewportBoundsAfter.X{
      roundedStripeBoundsAfter.X + 4.0
    } else {
      roundedViewportBoundsAfter.X + 4.0
    }
    let roundedStripeSampleY = roundedViewportBoundsAfter.Y
    +roundedViewportBoundsAfter.Height * 0.5
    PrimitiveRequirePixelNear(axisScrolledPixels, axisScrolledResult!!.Width, metrics,
      horizontalStripeSampleX, horizontalStripeSampleY,
      uint8(72), uint8(128), uint8(224), 8, "horizontal_scrolled")
    PrimitiveRequirePixelNear(axisScrolledPixels, axisScrolledResult!!.Width, metrics,
      20.0, 70.0, uint8(52), uint8(196), uint8(112), 8, "horizontal_y_visible_after")
    PrimitiveRequirePixelNear(axisScrolledPixels, axisScrolledResult!!.Width, metrics,
      roundedStripeSampleX, roundedStripeSampleY,
      uint8(72), uint8(128), uint8(224), 8, "rounded_scroll_after")
    let verticalBefore = RoundedOverflowCell.VerticalViewport.ScrollOffset.Y
    Require(RoundedOverflowCell.VerticalViewport.ScrollTo(0.0, 80.0),
      "Readback vertical scroll request was rejected")
    WindowReadbackTestFixture.ForceRender(opened, 0.05)
    let verticalAfter = RoundedOverflowCell.VerticalViewport.ScrollOffset.Y
    Require(verticalAfter > verticalBefore,
      "Readback vertical scroll offset did not advance")
    verticalScrolledResult = PrimitiveReadback(opened, metrics)
    let verticalScrolledPixels = verticalScrolledResult!!.Pixels
    let verticalViewportBoundsAfter = RoundedOverflowCell.VerticalViewport.BorderBox
    let verticalStripeBoundsAfter = RoundedOverflowCell.VerticalStripe.BorderBox
    let verticalStripeSampleX = verticalViewportBoundsAfter.X
    +verticalViewportBoundsAfter.Width * 0.5
    let verticalStripeSampleY = if verticalStripeBoundsAfter.Y
    > verticalViewportBoundsAfter.Y{
      verticalStripeBoundsAfter.Y + 4.0
    } else {
      verticalViewportBoundsAfter.Y + 4.0
    }
    PrimitiveRequirePixelNear(verticalScrolledPixels, verticalScrolledResult!!.Width, metrics,
      verticalStripeSampleX, verticalStripeSampleY,
      uint8(196), uint8(88), uint8(200), 8, "vertical_scrolled")
    PrimitiveRequirePixelNear(verticalScrolledPixels, verticalScrolledResult!!.Width, metrics,
      268.0, 30.0, uint8(228), uint8(160), uint8(64), 8, "vertical_x_visible_after")
    Require(WindowReadbackTestFixture.RequestCount(opened) == 3uL
        && WindowReadbackTestFixture.CompletionCount(opened) == 3uL,
      "Readback rounded overflow readback lifecycle counts are incorrect")
    let residentBeforeClose = WindowReadbackTestFixture.ResidentResourceBytes(opened)
    Require(residentBeforeClose >= uint64(verticalScrolledResult!!.Pixels.Length),
      "Readback rounded overflow readback resources are not resident before close")
    opened.RequestClose()
    WindowReadbackTestFixture.ForceRender(opened, 0.0)
    Require(!opened.IsOpen, "Readback rounded overflow gate window did not close")
    Require(WindowReadbackTestFixture.ResidentResourceBytes(opened) == 0uL,
      "Readback rounded overflow readback resources remain resident after close")
  } finally {
    Console.SetError(originalError)
    if let active = window {
      if active.IsOpen {
        active.RequestClose()
        WindowReadbackTestFixture.ForceRender(active, 0.0)
      }
    }
    font.Dispose()
  }
  let diagnostics = capturedError.ToString()
  ReadbackValidateCommonDiagnostics(diagnostics)
  Require(!diagnostics.Contains("\"event\":325")
      && !diagnostics.Contains("\"event\":326"),
    "Readback mixed-axis clip gate emitted unsupported-scene diagnostics")
  let drawCount = DiagnosticCounter(diagnostics, "drawCount")
  let planCompileCount = DiagnosticCounter(diagnostics, "planCompileCount")
  let recordCount = DiagnosticCounter(diagnostics, "recordCount")
  let readbackCount = DiagnosticCounter(diagnostics, "readbackCount")
  Require(drawCount > 0uL && planCompileCount > 0uL && recordCount > 0uL
      && readbackCount == 3uL,
    "Readback mixed-axis clip gate did not record expected render and readback work")
  Console.WriteLine("readback-mixed-axis-clip-gate: horizontal=1 vertical=1 nested_clip=1"
    +" transform=1 text=1 image=1 rounded_hidden=1 rounded_scroll=1 corners=8"
    +" readbackCount=" + readbackCount.ToString()
    +" drawCount=" + drawCount.ToString()
    +" planCompileCount=" + planCompileCount.ToString()
    +" recordCount=" + recordCount.ToString() + " close=1")
}

func RunEffectsSmoke() {
  Require(Environment.GetEnvironmentVariable("GOO_VK_DIAGNOSTICS") == "1",
    "GOO_VK_DIAGNOSTICS=1 is required")
  let fontPath = Path.Combine(AppContext.BaseDirectory, "VendSans-VariableFont_wght.ttf")
  let colorFontPath = Path.Combine(AppContext.BaseDirectory, "HarfBuzz-chromacheck-colr.ttf")
  Require(File.Exists(fontPath), "Readback effects text font asset is missing")
  Require(File.Exists(colorFontPath), "Readback effects color font asset is missing")
  let font = FontSource("ReadbackGateFont", 400, false, File.ReadAllBytes(fontPath))
  let colorFont = FontSource("ReadbackColor", 400, false, File.ReadAllBytes(colorFontPath))
  font.Register()
  colorFont.Register()
  let root = EffectsCell{}
  let capturedError = StringWriter()
  let originalError = Console.Error
  var window Window? = nil
  var firstResult VulkanReadbackResult? = nil
  var secondResult VulkanReadbackResult? = nil
  try {
    let opened = Window{
      Title: "Goo Readback Vulkan effects gate",
      Width: 440,
      Height: 270,
      VSync: false,
      Root: root,
    }
    window = opened
    Console.SetError(capturedError)
    opened.Open()
    WindowReadbackTestFixture.ForceRender(opened, 0.0)
    var frame int32 = 0
    while frame < 8 {
      WindowReadbackTestFixture.ForceRender(opened, 0.0166666666666667)
      frame = frame + 1
    }
    let metrics = WindowReadbackTestFixture.Metrics(opened)
    Require(metrics.LogicalWidth == 440 && metrics.LogicalHeight == 270,
      "Readback effects logical window metrics are incorrect")
    Require(EffectsCell.Root.IsMounted
        && EffectsCell.ShadowContainer.IsMounted
        && EffectsCell.ShadowButton.IsMounted
        && EffectsCell.ShapeShadow.IsMounted
        && EffectsCell.GroupOuter.IsMounted
        && EffectsCell.GroupInner.IsMounted
        && EffectsCell.ClipViewport.IsMounted
        && EffectsCell.ClipLeaf.IsMounted
        && EffectsCell.ColorGlyph.IsMounted
        && EffectsCell.BlendMultiply.IsMounted
        && EffectsCell.BlendScreen.IsMounted
        && EffectsCell.BlendOverlay.IsMounted
        && EffectsCell.BlendDifference.IsMounted,
      "Readback effects gate did not mount required handles")
    Require(EffectsCell.ShadowContainer.BorderBox.Width == 112.0
        && EffectsCell.ShadowButton.BorderBox.Height == 88.0
        && EffectsCell.GroupOuter.BorderBox.Width == 154.0
        && EffectsCell.ClipViewport.BorderBox.Height == 112.0,
      "Readback effects gate retained incorrect geometry")
    firstResult = PrimitiveReadback(opened, metrics)
    let firstPixels = firstResult!!.Pixels
    PrimitiveRequirePixelNear(firstPixels, firstResult!!.Width, metrics,
      70.0, 60.0, uint8(44), uint8(92), uint8(132), 20, "container_fill")
    PrimitiveRequirePixelNear(firstPixels, firstResult!!.Width, metrics,
      200.0, 60.0, uint8(36), uint8(116), uint8(84), 20, "button_fill")
    PrimitiveRequirePixelDifferent(firstPixels, firstResult!!.Width, metrics,
      130.0, 76.0, uint8(12), uint8(20), uint8(32), 18, "container_outer_shadow")
    PrimitiveRequirePixelDifferent(firstPixels, firstResult!!.Width, metrics,
      200.0, 108.0, uint8(12), uint8(20), uint8(32), 2, "button_outer_shadow")
    PrimitiveRequirePixelDifferent(firstPixels, firstResult!!.Width, metrics,
      18.0, 60.0, uint8(44), uint8(92), uint8(132), 16, "container_inset_shadow")
    PrimitiveRequirePixelDifferent(firstPixels, firstResult!!.Width, metrics,
      128.0, 119.0, uint8(12), uint8(20), uint8(32), 12, "shape_outer_shadow")
    PrimitiveRequirePixelDifferent(firstPixels, firstResult!!.Width, metrics,
      70.0, 108.0, uint8(72), uint8(128), uint8(224), 12, "shape_inset_shadow")
    PrimitiveRequirePixelNear(firstPixels, firstResult!!.Width, metrics,
      70.0, 9.0, uint8(232), uint8(196), uint8(72), 48, "container_outline")
    let groupPixel = PrimitiveLogicalPixel(firstPixels, firstResult!!.Width, metrics, 286.0, 42.0)
    Require(groupPixel[0] > uint8(70) && groupPixel[2] < uint8(170),
      "Readback group opacity outer paint is missing: " + PrimitivePixelText(groupPixel))
    let groupOverlap = PrimitiveLogicalPixel(firstPixels, firstResult!!.Width, metrics, 330.0, 60.0)
    Require(groupOverlap[2] > groupOverlap[0]
        && groupOverlap[2] > uint8(48) && groupOverlap[0] > uint8(12),
      "Readback nested group opacity overlap is incorrect: " + PrimitivePixelText(groupOverlap))
    PrimitiveRequirePixelNear(firstPixels, firstResult!!.Width, metrics,
      15.0, 133.0, uint8(12), uint8(20), uint8(32), 20, "clip_corner")
    let clipPixel = PrimitiveLogicalPixel(firstPixels, firstResult!!.Width, metrics, 72.0, 188.0)
    Require(clipPixel[0] > uint8(120) && clipPixel[1] > uint8(100)
        && clipPixel[2] < uint8(140),
      "Readback transformed clip leaf is missing: " + PrimitivePixelText(clipPixel))
    RequireColorCoverage(firstPixels, firstResult!!.Width, metrics,
      178, 144, 274, 230, "colr")
    PrimitiveRequirePixelDifferent(firstPixels, firstResult!!.Width, metrics,
      310.0, 110.0, uint8(13), uint8(20), uint8(32), 2, "blurred_text_shadow")
    PrimitiveRequirePixelDifferent(firstPixels, firstResult!!.Width, metrics,
      270.0, 123.0, uint8(12), uint8(20), uint8(32), 8, "text_box_shadow")
    let multiplyPixel = PrimitiveLogicalPixel(firstPixels, firstResult!!.Width, metrics, 44.0, 254.0)
    let screenPixel = PrimitiveLogicalPixel(firstPixels, firstResult!!.Width, metrics, 150.0, 254.0)
    let overlayPixel = PrimitiveLogicalPixel(firstPixels, firstResult!!.Width, metrics, 256.0, 254.0)
    let differencePixel = PrimitiveLogicalPixel(firstPixels, firstResult!!.Width, metrics, 362.0, 254.0)
    Require(multiplyPixel[0] > uint8(40)
        && multiplyPixel[2] > uint8(40)
        && Math.Abs(int32(multiplyPixel[0]) - int32(multiplyPixel[2])) <= 8
        && screenPixel[0] > multiplyPixel[0]
        && overlayPixel[2] > uint8(40)
        && differencePixel[0] > uint8(70),
      "Readback blend overlap matrix is incorrect: multiply=" + PrimitivePixelText(multiplyPixel)
      +" screen=" + PrimitivePixelText(screenPixel)
      +" overlay=" + PrimitivePixelText(overlayPixel)
      +" difference=" + PrimitivePixelText(differencePixel))
    WindowReadbackTestFixture.ForceRender(opened, 0.05)
    secondResult = PrimitiveReadback(opened, metrics)
    Require(secondResult!!.Pixels.Length == firstResult!!.Pixels.Length,
      "Readback effects repeated readback extent changed")
    Require(WindowReadbackTestFixture.RequestCount(opened) == 2uL
        && WindowReadbackTestFixture.CompletionCount(opened) == 2uL,
      "Readback effects readback lifecycle counts are incorrect")
    let residentBeforeClose = WindowReadbackTestFixture.ResidentResourceBytes(opened)
    Require(residentBeforeClose >= uint64(secondResult!!.Pixels.Length),
      "Readback effects readback resources are not resident before close")
    opened.RequestClose()
    WindowReadbackTestFixture.ForceRender(opened, 0.0)
    Require(!opened.IsOpen, "Readback effects gate window did not close")
    Require(WindowReadbackTestFixture.ResidentResourceBytes(opened) == 0uL,
      "Readback effects resources remain resident after close")
  } finally {
    Console.SetError(originalError)
    if let active = window {
      if active.IsOpen {
        active.RequestClose()
        WindowReadbackTestFixture.ForceRender(active, 0.0)
      }
    }
    colorFont.Dispose()
    font.Dispose()
  }
  let diagnostics = capturedError.ToString()
  ReadbackValidateCommonDiagnostics(diagnostics)
  Require(!diagnostics.Contains("\"event\":325")
      && !diagnostics.Contains("\"event\":326"),
    "Readback effects gate emitted unsupported-scene diagnostics")
  let drawCount = DiagnosticCounter(diagnostics, "drawCount")
  let planCompileCount = DiagnosticCounter(diagnostics, "planCompileCount")
  let recordCount = DiagnosticCounter(diagnostics, "recordCount")
  let readbackCount = DiagnosticCounter(diagnostics, "readbackCount")
  let layerPassCount = DiagnosticCounter(diagnostics, "layerPoolPassCount")
  let layerCompositeCount = DiagnosticCounter(diagnostics, "layerPoolCompositeCount")
  let layerCreateCount = DiagnosticCounter(diagnostics, "layerPoolCreateCount")
  let layerFailureCount = DiagnosticCounter(diagnostics, "layerPoolFailureCount")
  let layerPressureFailureCount = DiagnosticCounter(diagnostics, "layerPoolPressureFailureCount")
  let layerResidentBytes = DiagnosticCounter(diagnostics, "layerPoolResidentBytes")
  let layerTargetCount = DiagnosticCounter(diagnostics, "layerPoolTargetCount")
  let layerLeasedCount = DiagnosticCounter(diagnostics, "layerPoolLeasedCount")
  Require(drawCount > 0uL && planCompileCount > 0uL && recordCount > 0uL
      && readbackCount == 2uL,
    "Readback effects gate did not record expected render and readback work")
  Require(layerPassCount > 0uL && layerCompositeCount > 0uL && layerCreateCount > 0uL,
    "Readback effects gate did not record layer pass lifecycle")
  Require(layerFailureCount == 0uL && layerPressureFailureCount == 0uL,
    "Readback effects gate recorded a layer pool failure")
  Require(layerResidentBytes == 0uL && layerTargetCount == 0uL && layerLeasedCount == 0uL,
    "Readback effects gate left layer pool resources resident after close")
  Console.WriteLine("readback-effects-gate: shadows=container,button,text,shape,outer,inset,stacked=1"
    +" text_shadow_blur=plain,colr=1 outline=1 group_opacity=nested=1"
    +" blend=multiply,screen,overlay,difference=1"
    +" clip=rounded,arbitrary transform=1 colr=1 readbackCount=" + readbackCount.ToString()
    +" layerPassCount=" + layerPassCount.ToString()
    +" layerCompositeCount=" + layerCompositeCount.ToString()
    +" layerCreateCount=" + layerCreateCount.ToString()
    +" drawCount=" + drawCount.ToString()
    +" planCompileCount=" + planCompileCount.ToString()
    +" recordCount=" + recordCount.ToString() + " close=1")
}

func InputValidateVisual(result VulkanReadbackResult, metrics WindowMetrics) {
  let first = ProtectedTextCell.Entry.BorderBox
  let second = ProtectedTextCell.Control.BorderBox
  let firstX = int32(Math.Round(first.X * metrics.DisplayScaleX))
  let firstY = int32(Math.Round(first.Y * metrics.DisplayScaleY))
  let secondX = int32(Math.Round(second.X * metrics.DisplayScaleX))
  let secondY = int32(Math.Round(second.Y * metrics.DisplayScaleY))
  let width = int32(Math.Round(first.Width * metrics.DisplayScaleX))
  let height = int32(Math.Round(first.Height * metrics.DisplayScaleY))
  let rowWidth = int32(result.Width)
  var coverage int32
  var y int32
  while y < height {
    var x int32
    while x < width {
      let firstIndex = ((firstY + y) * rowWidth + firstX + x) * 4
      let secondIndex = ((secondY + y) * rowWidth + secondX + x) * 4
      var channel int32
      while channel < 4 {
        if Math.Abs(int32(result.Pixels[firstIndex + channel])
          -int32(result.Pixels[secondIndex + channel])) > 1 {
            throw InvalidOperationException("Input protected Vulkan presentation differs from its mask")
          }
        channel++
      }
      if Math.Abs(int32(result.Pixels[firstIndex]) - 12) > 8
        || Math.Abs(int32(result.Pixels[firstIndex + 1]) - 20) > 8
        || Math.Abs(int32(result.Pixels[firstIndex + 2]) - 32) > 8 {
          coverage++
        }
      x++
    }
    y++
  }
  Require(coverage > 20, "Input protected Vulkan presentation has no glyph coverage")
}

func InputHasAction(node AccessibilityNode, expected AccessibilityAction) bool {
  for action in node.Actions {
    if action == expected { return true }
  }
  return false
}

func InputAdvance(window Window, duration float64) {
  var elapsed = 0.0
  while elapsed < duration {
    let step = Math.Min(1.0 / 30.0, duration - elapsed)
    WindowReadbackTestFixture.ForceRender(window, step)
    elapsed = elapsed + step
  }
}

func RunInputAccessibilitySmoke() {
  Require(Environment.GetEnvironmentVariable("GOO_VK_DIAGNOSTICS") == "1",
    "GOO_VK_DIAGNOSTICS=1 is required")
  let cell = InputAccessibilityCell{}
  let adapter = RecordingAccessibilityAdapter{}
  let window = Window{ Root: cell, Width: 320, Height: 176, VSync: false }
  let capturedError = StringWriter()
  let originalError = Console.Error
  try {
    Console.SetError(capturedError)
    window.AccessibilityAdapter = adapter
    window.Open()
    WindowReadbackTestFixture.ForceRender(window, 0.0)
    WindowReadbackTestFixture.ForceRender(window, 0.0166666666666667)
    Require(InputAccessibilityCell.Target.IsMounted
        && InputAccessibilityCell.ScrollViewport.IsMounted
        && InputAccessibilityCell.ScrollLeaf.IsMounted
        && InputAccessibilityCell.MotionBox.IsMounted,
      "Input core behavior handles did not mount")
    let metrics = WindowReadbackTestFixture.Metrics(window)
    let target = InputAccessibilityCell.Target.BorderBox
    let targetX = target.X + target.Width * 0.5
    let targetY = target.Y + target.Height * 0.5
    let borderX = target.X + 1.0
    let initial = PrimitiveReadback(window, metrics)
    PrimitiveRequirePixelNear(initial.Pixels, initial.Width, metrics, targetX, targetY,
      uint8(208), uint8(48), uint8(64), 3, "Input base state")
    guard let initialSemantic = adapter.Tree?.Root else {
      throw InvalidOperationException("Input core semantic node is missing")
    }
    Require(initialSemantic.Role == AccessibilityRole.Button
        && initialSemantic.Name == "Input action"
        && !initialSemantic.Disabled
        && !initialSemantic.Focused
        && InputHasAction(initialSemantic, AccessibilityAction.Focus)
        && InputHasAction(initialSemantic, AccessibilityAction.Activate),
      "Input core semantic contract is incorrect")

    WindowReadbackTestFixture.InputQueuePointerMove(window, targetX, targetY)
    WindowReadbackTestFixture.ForceRender(window, 0.0)
    InputAdvance(window, 0.05)
    let hoverMid = PrimitiveReadback(window, metrics)
    let hoverMidPixel = PrimitiveLogicalPixel(hoverMid.Pixels, hoverMid.Width, metrics,
      targetX, targetY)
    Require(!PrimitiveNear(hoverMidPixel, uint8(208), uint8(48), uint8(64), 3)
        && !PrimitiveNear(hoverMidPixel, uint8(48), uint8(208), uint8(96), 3),
      "Input hover transition did not produce an intermediate frame: "
      +PrimitivePixelText(hoverMidPixel))
    InputAdvance(window, 0.06)
    let hovered = PrimitiveReadback(window, metrics)
    PrimitiveRequirePixelNear(hovered.Pixels, hovered.Width, metrics, targetX, targetY,
      uint8(48), uint8(208), uint8(96), 3, "Input hover state")
    Require(cell.PointerEnterCount == 1 && cell.PointerLeaveCount == 0,
      "Input pointer hover lifecycle is incorrect")

    WindowReadbackTestFixture.InputQueuePointerPress(window, targetX, targetY)
    WindowReadbackTestFixture.ForceRender(window, 0.0)
    InputAdvance(window, 0.11)
    let active = PrimitiveReadback(window, metrics)
    PrimitiveRequirePixelNear(active.Pixels, active.Width, metrics, targetX, targetY,
      uint8(64), uint8(96), uint8(232), 3, "Input active state")
    PrimitiveRequirePixelNear(active.Pixels, active.Width, metrics, borderX, targetY,
      uint8(248), uint8(196), uint8(48), 3, "Input focus state")
    Require(cell.PointerDownCount == 1 && cell.FocusCount == 1,
      "Input pointer press or focus callback is incorrect")
    guard let focusedSemantic = adapter.Tree?.Root else {
      throw InvalidOperationException("Input focused semantic node is missing")
    }
    Require(focusedSemantic.Focused, "Input semantic focus state is incorrect")

    WindowReadbackTestFixture.InputQueuePointerRelease(window, targetX, targetY)
    WindowReadbackTestFixture.ForceRender(window, 0.0)
    InputAdvance(window, 0.11)
    let released = PrimitiveReadback(window, metrics)
    PrimitiveRequirePixelNear(released.Pixels, released.Width, metrics, targetX, targetY,
      uint8(48), uint8(208), uint8(96), 3, "Input released hover state")
    Require(cell.PointerUpCount == 1 && cell.ClickCount == 1,
      "Input pointer release or activation callback is incorrect")

    WindowReadbackTestFixture.InputQueueKeyPress(window, Key.Enter)
    WindowReadbackTestFixture.ForceRender(window, 0.0)
    InputAdvance(window, 0.11)
    let keyboardActive = PrimitiveReadback(window, metrics)
    PrimitiveRequirePixelNear(keyboardActive.Pixels, keyboardActive.Width, metrics,
      targetX, targetY, uint8(64), uint8(96), uint8(232), 3,
      "Input keyboard active state")
    Require(cell.KeyDownCount == 1 && cell.ClickCount == 2,
      "Input keyboard press or activation callback is incorrect")
    WindowReadbackTestFixture.InputQueueKeyRelease(window, Key.Enter)
    WindowReadbackTestFixture.ForceRender(window, 0.0)
    InputAdvance(window, 0.11)
    Require(cell.KeyUpCount == 1, "Input keyboard release callback is incorrect")

    guard let actionSemantic = adapter.Tree?.Root else {
      throw InvalidOperationException("Input action semantic node is missing")
    }
    Require(window.PerformAccessibilityAction(actionSemantic.Id,
      AccessibilityActionRequest(AccessibilityAction.Activate))
        && cell.ClickCount == 3,
      "Input neutral activation did not route through public behavior")
    WindowReadbackTestFixture.ForceRender(window, 0.0)

    WindowReadbackTestFixture.InputQueuePointerMove(window, 300.0, 168.0)
    WindowReadbackTestFixture.ForceRender(window, 0.0)
    InputAdvance(window, 0.11)
    let focused = PrimitiveReadback(window, metrics)
    PrimitiveRequirePixelNear(focused.Pixels, focused.Width, metrics, targetX, targetY,
      uint8(208), uint8(48), uint8(64), 3, "Input focus-only background")
    PrimitiveRequirePixelNear(focused.Pixels, focused.Width, metrics, borderX, targetY,
      uint8(248), uint8(196), uint8(48), 3, "Input retained focus state")
    Require(cell.PointerLeaveCount == 1, "Input pointer leave callback is incorrect")

    let scrollBefore = InputAccessibilityCell.ScrollLeaf.BorderBox
    let scrollViewport = InputAccessibilityCell.ScrollViewport.BorderBox
    WindowReadbackTestFixture.InputQueueWheel(window,
      scrollViewport.X + scrollViewport.Width * 0.5,
      scrollViewport.Y + scrollViewport.Height * 0.5, 0.0, -1.0)
    WindowReadbackTestFixture.ForceRender(window, 0.0)
    InputAdvance(window, 0.05)
    let scrollAfter = InputAccessibilityCell.ScrollLeaf.BorderBox
    Require(cell.ScrollWheelCount == 1
        && InputAccessibilityCell.ScrollViewport.ScrollOffset.Y > 0.0
        && scrollAfter.Y < scrollBefore.Y,
      "Input wheel input did not move the public scroll state")

    let motionBefore = InputAccessibilityCell.MotionBox.BorderBox.X
    cell.StartMotion()
    WindowReadbackTestFixture.ForceRender(window, 0.0)
    InputAdvance(window, 0.09)
    let motionMid = InputAccessibilityCell.MotionBox.BorderBox.X
    InputAdvance(window, 0.10)
    let motionAfter = InputAccessibilityCell.MotionBox.BorderBox.X
    Require(motionMid > motionBefore && motionMid < motionBefore + 64.0
        && Math.Abs(motionAfter - (motionBefore + 64.0)) <= 0.01
        && !cell.MotionRunning,
      "Input motion did not advance and settle through public geometry")

    cell.DisableTarget()
    WindowReadbackTestFixture.ForceRender(window, 0.0)
    InputAdvance(window, 0.11)
    let disabled = PrimitiveReadback(window, metrics)
    PrimitiveRequirePixelNear(disabled.Pixels, disabled.Width, metrics, targetX, targetY,
      uint8(112), uint8(120), uint8(132), 3, "Input disabled state")
    Require(cell.BlurCount == 1 && !InputAccessibilityCell.Target.Focus(),
      "Input disabled target retained or accepted focus")
    guard let disabledSemantic = adapter.Tree?.Root else {
      throw InvalidOperationException("Input disabled semantic node is missing")
    }
    Require(disabledSemantic.Disabled && !disabledSemantic.Focused
        && disabledSemantic.Actions.Count == 0,
      "Input disabled semantic state is incorrect")

    let blockedDown = cell.PointerDownCount
    let blockedUp = cell.PointerUpCount
    let blockedClick = cell.ClickCount
    let blockedKeyDown = cell.KeyDownCount
    let blockedKeyUp = cell.KeyUpCount
    let blockedWheel = cell.TargetWheelCount
    WindowReadbackTestFixture.InputQueuePointerMove(window, targetX, targetY)
    WindowReadbackTestFixture.InputQueuePointerPress(window, targetX, targetY)
    WindowReadbackTestFixture.InputQueuePointerRelease(window, targetX, targetY)
    WindowReadbackTestFixture.InputQueueWheel(window, targetX, targetY, 0.0, -1.0)
    WindowReadbackTestFixture.InputQueueKeyPress(window, Key.Enter)
    WindowReadbackTestFixture.InputQueueKeyRelease(window, Key.Enter)
    WindowReadbackTestFixture.ForceRender(window, 0.0)
    Require(cell.PointerDownCount == blockedDown
        && cell.PointerUpCount == blockedUp
        && cell.ClickCount == blockedClick
        && cell.KeyDownCount == blockedKeyDown
        && cell.KeyUpCount == blockedKeyUp
        && cell.TargetWheelCount == blockedWheel,
      "Input disabled target accepted input")

    window.RequestClose()
    WindowReadbackTestFixture.ForceRender(window, 0.0)
    Require(!window.IsOpen, "Input core behavior gate window did not close")
    Require(WindowReadbackTestFixture.ResidentResourceBytes(window) == 0uL,
      "Input core behavior readback resources remain resident after close")
  } finally {
    if window.IsOpen {
      window.RequestClose()
      WindowReadbackTestFixture.ForceRender(window, 0.0)
    }
    Console.SetError(originalError)
  }
  let diagnostics = capturedError.ToString()
  ReadbackValidateCommonDiagnostics(diagnostics)
  Require(!diagnostics.Contains("\"event\":325")
      && !diagnostics.Contains("\"event\":326"),
    "Input core behavior gate emitted unsupported-scene diagnostics")
  Console.WriteLine("input-core-behavior-gate: pointer=1 focus=1 hover=1 active=1 disabled=1"
    +" keyboard=1 wheel=1 scroll=1 motion=1 transitions=1 handles=1 semantics=1 close=1")
}

func RunProtectedTextSmoke() {
  Require(Environment.GetEnvironmentVariable("GOO_VK_DIAGNOSTICS") == "1",
    "GOO_VK_DIAGNOSTICS=1 is required")
  let fontPath = Path.Combine(AppContext.BaseDirectory, "VendSans-VariableFont_wght.ttf")
  Require(File.Exists(fontPath), "Input text font asset is missing")
  let font = FontSource("InputGateFont", 400, false, File.ReadAllBytes(fontPath))
  font.Register()
  let source = "a\u0301👨‍👩‍👧‍👦b"
  let cell = ProtectedTextCell{}
  let adapter = RecordingAccessibilityAdapter{}
  let window = Window{ Root: cell, Width: 320, Height: 96, VSync: false }
  let capturedError = StringWriter()
  let originalError = Console.Error
  var originalClipboard = ""
  var clipboardChanged bool
  try {
    Console.SetError(capturedError)
    window.AccessibilityAdapter = adapter
    window.Open()
    WindowReadbackTestFixture.ForceRender(window, 0.0)
    WindowReadbackTestFixture.ForceRender(window, 0.0166666666666667)
    Require(ProtectedTextCell.Entry.IsMounted && ProtectedTextCell.Control.IsMounted,
      "Input protected visual pair did not mount")
    let metrics = WindowReadbackTestFixture.Metrics(window)
    let visual = PrimitiveReadback(window, metrics)
    InputValidateVisual(visual, metrics)
    Require(WindowReadbackTestFixture.InputValidateInitial(window,
      ProtectedTextCell.Entry, source),
      "Input protected grapheme mapping or geometry is incorrect")

    guard let initialSemantic = adapter.Tree?.Root else {
      throw InvalidOperationException("Input protected semantic node is missing")
    }
    Require(initialSemantic.Value == "•••",
      "Input protected semantic value was not redacted")
    Require(window.PerformAccessibilityAction(initialSemantic.Id,
      AccessibilityActionRequest.SetSelection(1, 1)),
      "Input protected semantic selection action failed")
    WindowReadbackTestFixture.UpdateTree(window)
    guard let selectedSemantic = adapter.Tree?.Root else {
      throw InvalidOperationException("Input protected semantic selection was not published")
    }
    Require(WindowReadbackTestFixture.InputSelectionMapped(window,
      ProtectedTextCell.Entry)
        && selectedSemantic.SelectionStart == 1
        && selectedSemantic.SelectionLength == 1
        && selectedSemantic.Caret == 2,
      "Input protected semantic coordinates are incorrect")

    Require(ProtectedTextCell.Entry.Focus(), "Input protected entry did not focus")
    originalClipboard = window.GetClipboardText()
    window.SetClipboardText("safe")
    clipboardChanged = true
    Require(WindowReadbackTestFixture.InputExerciseInput(window,
      ProtectedTextCell.Entry, source)
        && cell.CompositionCount == 1
        && cell.CompositionText == "z\u0301"
        && cell.LastValue == source + "safe" + "z\u0301",
      "Input protected clipboard or IME behavior is incorrect")
    window.SetClipboardText(originalClipboard)
    clipboardChanged = false

    window.AccessibilityAdapter = nil
    window.AccessibilityAdapter = adapter
    WindowReadbackTestFixture.UpdateTree(window)
    guard let finalSemantic = adapter.Tree?.Root else {
      throw InvalidOperationException("Input final protected semantic node is missing")
    }
    Require(finalSemantic.Value == "••••••••"
        && finalSemantic.SelectionStart == 8
        && finalSemantic.SelectionLength == 0
        && finalSemantic.Caret == 8
        && !finalSemantic.Value.Contains("metadata"),
      "Input final protected semantic state is incorrect")
    Require(ProtectedTextCell.Entry.Blur(), "Input protected entry did not blur")
    window.RequestClose()
    WindowReadbackTestFixture.ForceRender(window, 0.0)
    Require(!window.IsOpen, "Input protected gate window did not close")
    Require(WindowReadbackTestFixture.ResidentResourceBytes(window) == 0uL,
      "Input protected readback resources remain resident after close")
  } finally {
    if window.IsOpen {
      if clipboardChanged { window.SetClipboardText(originalClipboard) }
      window.RequestClose()
      WindowReadbackTestFixture.ForceRender(window, 0.0)
    }
    Console.SetError(originalError)
    font.Dispose()
  }
  let diagnostics = capturedError.ToString()
  ReadbackValidateCommonDiagnostics(diagnostics)
  Require(!diagnostics.Contains("\"event\":325")
      && !diagnostics.Contains("\"event\":326"),
    "Input protected gate emitted unsupported-scene diagnostics")
  Console.WriteLine("input-protected-text-gate: graphemes=3,8 visual=1 geometry=1 clipboard=1"
    +" ime=1 semantics=1 close=1")
}

let managedEntryTimestamp = Stopwatch.GetTimestamp()
Window.ConfigureApplication("Goo Readback async readback smoke", "0.1.0", "io.github.obselate.goo.readback.readback")
if Environment.GetEnvironmentVariable("GOO_ALL_BLOB_BENCHMARK") == "1" {
  RunAllBlobBenchmark()
  return
}
if Environment.GetEnvironmentVariable("GOO_PIPELINE_CACHE_BENCHMARK") == "1" {
  RunPipelineCacheBenchmark()
  return
}
if Environment.GetEnvironmentVariable("GOO_INPUT_LATENCY_SMOKE") == "1" {
  RunPerformanceLatencyBenchmark(managedEntryTimestamp)
  return
}
if Environment.GetEnvironmentVariable("GOO_GPU_TIMESTAMPS_SMOKE") == "1" {
  RunGpuTimestampSmoke()
  return
}
if Environment.GetEnvironmentVariable("GOO_GPU_PATH_BENCHMARK") == "1" {
  RunGpuPathBenchmark()
  return
}
if Environment.GetEnvironmentVariable("GOO_GPU_GLASS_BENCHMARK") == "1" {
  RunGpuGlassBenchmark()
  return
}
if Environment.GetEnvironmentVariable("GOO_NATIVE_INPUT_SMOKE") == "1" {
  RunNativeInputSmoke()
  return
}

if Environment.GetEnvironmentVariable("GOO_PERFORMANCE_SMOKE") == "1" {
  RunPerformanceBenchmark()
  return
}
if Environment.GetEnvironmentVariable("GOO_IDLE_SMOKE") == "1" {
  RunIdleSmoke()
  return
}
if Environment.GetEnvironmentVariable("GOO_OFFSCREEN_FAILURE_SMOKE") == "1" {
  RunOffscreenFailureSmoke()
  return
}
if Environment.GetEnvironmentVariable("GOO_SCROLLBAR_SMOKE") == "1" {
  RunScrollbarSmoke()
  return
}
if Environment.GetEnvironmentVariable("GOO_SHADER_EFFECT_SMOKE") == "1" {
  RunShaderEffectSmoke()
  return
}
if Environment.GetEnvironmentVariable("GOO_LIQUID_GLASS_ALPHA_SMOKE") == "1" {
  RunLiquidGlassAlphaSmoke()
  return
}
if Environment.GetEnvironmentVariable("GOO_FRAGMENT_CORRECTNESS_SMOKE") == "1" {
  RunFragmentCorrectnessSmoke()
  return
}
if Environment.GetEnvironmentVariable("GOO_SHADER_EFFECT_BENCHMARK") == "1" {
  RunShaderEffectBenchmark()
  return
}
if Environment.GetEnvironmentVariable("GOO_PIPELINE_IDENTITY_SMOKE") == "1" {
  RunPipelineIdentitySmoke()
  return
}
if Environment.GetEnvironmentVariable("GOO_INPUT_ACCESSIBILITY_SMOKE") == "1" {
  RunInputAccessibilitySmoke()
  return
}
if Environment.GetEnvironmentVariable("GOO_PROTECTED_TEXT_SMOKE") == "1" {
  RunProtectedTextSmoke()
  return
}
if Environment.GetEnvironmentVariable("GOO_TEXT_EDITOR_SMOKE") == "1" {
  RunTextEditorSmoke()
  return
}
if Environment.GetEnvironmentVariable("GOO_LIVE_FRAME_PACING_SMOKE") == "1" {
  RunLiveFramePacingSmoke()
  return
}
if Environment.GetEnvironmentVariable("GOO_FRAME_PACING_SMOKE") == "1" {
  RunFramePacingChecks()
  return
}
if Environment.GetEnvironmentVariable("GOO_VSYNC_SMOKE") == "1" {
  RunVSyncSmoke()
  return
}
if Environment.GetEnvironmentVariable("GOO_QUEUE_ISOLATION_SMOKE") == "1" {
  RunQueueIsolationSmoke()
  return
}
if Environment.GetEnvironmentVariable("GOO_QUEUE_WAKE_SMOKE") == "1" {
  RunQueueWakeSmoke()
  return
}
if Environment.GetEnvironmentVariable("GOO_TIMELINE_COMPLETION_SMOKE") == "1" {
  RunTimelineCompletionSmoke()
  return
}
if Environment.GetEnvironmentVariable("GOO_VIRTUAL_TABLE_SMOKE") == "1" {
  RunVirtualTableSmoke()
  return
}
if Environment.GetEnvironmentVariable("GOO_VIRTUAL_TABLE_BENCHMARK") == "1" {
  RunVirtualTableBenchmark()
  return
}
if Environment.GetEnvironmentVariable("GOO_PRIMITIVE_METRICS_SMOKE") == "1" {
  RunPrimitiveUploadMetricsSmoke()
  return
}
if Environment.GetEnvironmentVariable("GOO_PRIMITIVE_UPLOAD_BENCHMARK") == "1" {
  RunPrimitiveUploadBenchmark()
  return
}
if Environment.GetEnvironmentVariable("GOO_TEXT_CULLING_SMOKE") == "1" {
  RunTextCullingSmoke()
  return
}
if Environment.GetEnvironmentVariable("GOO_TEXT_TRANSPORT_SMOKE") == "1" {
  RunTextTransportSmoke()
  return
}
if Environment.GetEnvironmentVariable("GOO_RETENTION_SMOKE") == "1" {
  RunRetentionSmoke()
  return
}
if Environment.GetEnvironmentVariable("GOO_IMAGE_STAGING_SMOKE") == "1" {
  RunImageStagingSmoke()
  return
}
if Environment.GetEnvironmentVariable("GOO_IMAGE_RETENTION_SMOKE") == "1" {
  RunImageRetentionSmoke()
  return
}
if Environment.GetEnvironmentVariable("GOO_EFFECTS_SMOKE") == "1" {
  RunEffectsSmoke()
  return
}
if Environment.GetEnvironmentVariable("GOO_ROUNDED_OVERFLOW_SMOKE") == "1" {
  RunRoundedOverflowSmoke()
  return
}
if Environment.GetEnvironmentVariable("GOO_PADDING_EDGE_OVERFLOW_SMOKE") == "1" {
  RunPaddingEdgeOverflowSmoke()
  return
}
if Environment.GetEnvironmentVariable("GOO_VECTOR_QUALITY_SMOKE") == "1" {
  RunVectorQualitySmoke()
  return
}
if Environment.GetEnvironmentVariable("GOO_CLIP_CAPTURE_SMOKE") == "1" {
  RunClipCaptureSmoke()
  return
}
if Environment.GetEnvironmentVariable("GOO_PRIMITIVE_PIXEL_SMOKE") == "1" {
  RunPrimitivePixelSmoke()
  return
}
let mode = Environment.GetEnvironmentVariable("GOO_READBACK_MODE")
if mode == "measure" {
  RunReadbackReadbackMeasure()
} else {
  RunReadbackSmoke()
}
