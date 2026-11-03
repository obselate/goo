package Goo.VulkanProof

import Goo
import System
import System.Diagnostics
import System.IO
import System.Threading

internal sealed class VulkanDynamicTextCell : Cell {
  private var value string = "012345"

  internal func Change(frame int32) {
    value = (49850 + frame).ToString("000000")
    Rebuild()
  }

  override func Build() Blob -> Container{
    Width: 640,
    Height: 224,
    BackgroundColor: Color.Black,
    Text{
      Position: PositionType.Absolute, Left: 16, Top: 0,
      Content: "0123456789 . K / Syncing",
      FontFamily: "DynamicTextProof", FontSize: 12, Color: Color.White,
    },
    Text{
      Position: PositionType.Absolute, Left: 16, Top: 24,
      Content: "0123456789 . K / Syncing",
      FontFamily: "DynamicTextProof", FontSize: 20, Color: Color.White,
    },
    Text{
      Position: PositionType.Absolute, Left: 16, Top: 52,
      Content: "Syncing " + value + " / 499999",
      FontFamily: "DynamicTextProof", FontSize: 12, Color: Color.White,
    },
    Text{
      Position: PositionType.Absolute, Left: 16, Top: 104,
      Content: value.Substring(0, 3) + "." + value.Substring(3) + " K",
      FontFamily: "DynamicTextProof", FontSize: 20, Color: Color.White,
      StyleRanges: []TextStyleRange{
        TextStyleRange(TextRange(3, 6), Style{Color: Color.Rgb(32, 224, 96)}),
      },
    },
    Text{
      Position: PositionType.Absolute, Left: 16, Top: 164,
      Content: "69%",
      FontFamily: "DynamicTextProof", FontSize: 12, Color: Color.White,
    },
  }
}

internal func DynamicTextCapture(window Window) VulkanReadbackResult {
  let metrics = WindowReadbackTestFixture.Metrics(window)
  let start = Stopwatch.GetTimestamp()
  var status = WindowReadbackTestFixture.Request(window,
    uint32(metrics.FramebufferWidth), uint32(metrics.FramebufferHeight))
  while status == WindowReadbackRequestStatus.Busy
    || status == WindowReadbackRequestStatus.NotReady {
    if Stopwatch.GetElapsedTime(start).TotalSeconds > 10.0 {
      throw InvalidOperationException("Dynamic text capture did not become ready")
    }
    WindowReadbackTestFixture.Pump(window, 0.0)
    Thread.Yield()
    status = WindowReadbackTestFixture.Request(window,
      uint32(metrics.FramebufferWidth), uint32(metrics.FramebufferHeight))
  }
  if status != WindowReadbackRequestStatus.Accepted {
    throw InvalidOperationException("Dynamic text capture failed: " + status.ToString())
  }
  while WindowReadbackTestFixture.Poll(window) == VkConstants.VK_NOT_READY {
    if Stopwatch.GetElapsedTime(start).TotalSeconds > 10.0 {
      throw InvalidOperationException("Dynamic text readback did not complete")
    }
    Thread.Yield()
  }
  return WindowReadbackTestFixture.Take(window)
    ?? throw InvalidOperationException("Dynamic text pixels are unavailable")
}

internal func DynamicTextInk(result VulkanReadbackResult,
  top int32, bottom int32, green bool = false) int32 {
  let scale = float64(result.Height) / 224.0
  let pixels = result.OwnedPixels
  var ink int32 = 0
  for y in int32(float64(top) * scale) ... int32(float64(bottom) * scale) {
    for x in 0 ... int32(result.Width) {
      let offset = (y * int32(result.Width) + x) * 4
      let red = pixels[offset]
      let value = pixels[offset + 1]
      let blue = pixels[offset + 2]
      if green ? value > uint8(150) && red < uint8(128) && blue < uint8(128)
        : red > uint8(128) && value > uint8(128) && blue > uint8(128) {
        ink++
      }
    }
  }
  return ink
}

internal func RunVulkanDynamicTextReadback() {
  using let font = FontSource.FromPath("DynamicTextProof", 400, false,
    Path.Combine(AppContext.BaseDirectory, "JetBrainsMono-Regular.ttf"))
  font.Register()
  let scale = Int32.Parse(Environment.GetEnvironmentVariable("GOO_DYNAMIC_TEXT_SCALE") ?? "1")
  let root = VulkanDynamicTextCell()
  let window = Window{Title: "Goo dynamic text proof", Width: 640 * scale,
    Height: 224 * scale, UiScale: float32(scale), VSync: false, Root: root}.Open()
  let target = WindowReadbackTestFixture.CaptureTarget(window)
    ?? throw InvalidOperationException("Dynamic text target is unavailable")
  try {
    for frame in 0 ... 12 {
      WindowReadbackTestFixture.ForceRender(window, 1.0 / 60.0)
    }
    DynamicTextCapture(window)
    var plainBlank int32 = 0
    var integerBlank int32 = 0
    var fractionBlank int32 = 0
    var staticBlank int32 = 0
    var minimumPlain int32 = Int32.MaxValue
    var samples int32 = 0
    target.BeginDynamicTextCapture((capture VulkanReadbackResult) -> {
      let plain = DynamicTextInk(capture, 48, 100)
      let integer = DynamicTextInk(capture, 100, 156)
      let fraction = DynamicTextInk(capture, 100, 156, true)
      let control = DynamicTextInk(capture, 156, 224)
      minimumPlain = Math.Min(minimumPlain, plain)
      if plain < 8 { plainBlank++ }
      if integer < 8 { integerBlank++ }
      if fraction < 8 { fractionBlank++ }
      if control < 8 { staticBlank++ }
      Console.WriteLine("dynamic-text-frame: frame=" + samples.ToString()
        + " plain=" + plain.ToString() + " integer=" + integer.ToString()
        + " fraction=" + fraction.ToString() + " static=" + control.ToString())
      samples++
    })
    for frame in 0 ... 600 {
      root.Change(frame)
      WindowReadbackTestFixture.ForceRender(window, 1.0 / 60.0)
    }
    target.EndDynamicTextCapture()
    Console.WriteLine("dynamic-text-summary: frames=" + samples.ToString()
      + " scale=" + scale.ToString() + " plain_blank=" + plainBlank.ToString()
      + " integer_blank=" + integerBlank.ToString() + " fraction_blank=" + fractionBlank.ToString()
      + " static_blank=" + staticBlank.ToString() + " minimum_plain=" + minimumPlain.ToString())
  } finally {
    target.EndDynamicTextCapture()
    window.Close()
  }
}
