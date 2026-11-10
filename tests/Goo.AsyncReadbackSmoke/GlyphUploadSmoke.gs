package GooAsyncReadbackSmoke

import Goo
import System
import System.IO

class GlyphUploadSmokeCell : Cell {
  internal var Content string = "0%"

  override func Build() Blob -> Container{
    Width: Percent(100),
    Height: Percent(100),
    BackgroundColor: Color.Black,
    Text{
      Position: PositionType.Absolute,
      Left: 8,
      Top: 8,
      Width: 180,
      Height: 40,
      TextWrap: TextWrap.NoWrap,
      Content: Content,
      FontFamily: "ReadbackGateFont",
      FontSize: 23,
      Color: Color.White,
    },
  }
}

func GlyphUploadPresent(window Window, cell GlyphUploadSmokeCell, content string,
  expectUpload bool) {
    WindowReadbackTestFixture.DrainWindowQueue(window, 10000)
    let timeline = WindowReadbackTestFixture.GraphicsTimeline(window)
    Require(WindowReadbackTestFixture.WaitGraphicsSubmission(window,
        timeline.LastEnqueuedSerial, VkConstants.VK_WHOLE_SIZE) == VkConstants.VK_SUCCESS,
      "Glyph upload smoke did not settle before " + content)
    let before = WindowReadbackTestFixture.DiagnosticCounters(window)
    cell.Content = content
    cell.Rebuild()
    WindowReadbackTestFixture.ForceRender(window, 0.0, 10.0, true)
    let after = WindowReadbackTestFixture.DiagnosticCounters(window)
    let submits = after.submitCount - before.submitCount
    let uploaded = after.textAtlasRecordedUploadBytes - before.textAtlasRecordedUploadBytes
    Require(expectUpload == (uploaded > 0uL),
      "Glyph upload smoke " + content + " uploaded " + uploaded.ToString() + " atlas bytes")
    Require(submits == 1uL,
      "Glyph upload smoke " + content + " presented after " + submits.ToString() + " submissions")
    let metrics = WindowReadbackTestFixture.Metrics(window)
    guard let target = WindowReadbackTestFixture.CaptureTarget(window) else {
      throw InvalidOperationException("Glyph upload smoke render target is unavailable")
    }
    target.UsePresentedSceneForTest(float32(metrics.DisplayScaleX), float32(metrics.DisplayScaleY))
    let presented = ClipCaptureReadback(window, metrics)
    RequireTextCoverage(presented.Pixels, presented.Width, metrics, 8, 8, 180, 48, content)
    Console.WriteLine("glyph-upload-smoke: content=" + content + " submits=" + submits.ToString()
      + " upload-bytes=" + uploaded.ToString())
  }

func RunGlyphUploadSmoke() {
  Require(Environment.GetEnvironmentVariable("GOO_VK_DIAGNOSTICS") == "1",
    "GOO_VK_DIAGNOSTICS=1 is required")
  using let font = FontSource("ReadbackGateFont", 400, false,
    File.ReadAllBytes(Path.Combine(AppContext.BaseDirectory, "VendSans-VariableFont_wght.ttf")))
  font.Register()
  let cell = GlyphUploadSmokeCell{}
  let window = Window{ Title: "Goo glyph upload smoke", Width: 200, Height: 60,
    VSync: false, Root: cell }
  window.Open()
  try {
    WindowReadbackTestFixture.ForceRender(window, 0.0, 10.0, true)
    let metrics = WindowReadbackTestFixture.Metrics(window)
    let initial = ClipCaptureReadback(window, metrics)
    RequireTextCoverage(initial.Pixels, initial.Width, metrics, 8, 8, 180, 48, "0%")
    GlyphUploadPresent(window, cell, "%0", false)
    for digit in 1 ... 10 {
      GlyphUploadPresent(window, cell, digit.ToString() + "%", true)
    }
    GlyphUploadPresent(window, cell, "100%", false)
  } finally {
    window.RequestClose()
    WindowReadbackTestFixture.Pump(window, 0.0)
    WindowReadbackTestFixture.DrainWindowQueue(window, 10000)
  }
  Require(!window.IsOpen, "Glyph upload smoke window did not close")
}
