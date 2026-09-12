package Goo

import System
import System.Diagnostics
import System.Text.Json
import System.Threading

internal class DiagnosticCaptureCell : Cell {
  internal var Frame int32

  override func Build() Blob -> Container {
    Width: Length.Percent(100), Height: Length.Percent(100),
    BackgroundColor: Color.Rgb(12, 20, 32),
    Children: {
      Container{
        Width: 16, Height: 16, Margin: 8,
        BackgroundColor: Color.Rgb(Frame % 256, 120, 200),
      },
    },
  }
}

internal class DiagnosticCaptureFixture {
  shared {
    private func Require(condition bool, message string) {
      if !condition { throw InvalidOperationException(message) }
    }

    internal func Run() {
      let root = DiagnosticCaptureCell{}
      let window = Window{
        Title: "Goo diagnostic capture Busy regression",
        Width: 64, Height: 64, Root: root,
      }.Open()
      try {
        WindowReadbackTestFixture.ForceRender(window, 0.0)
        let session = window.AttachDiagnostics()
        WindowReadbackTestFixture.RuntimeHoldNextQueueSubmit(window)
        window.ForceRenderForTest(0.016)
        Require(WindowReadbackTestFixture.RuntimeWaitForHeldQueueCall(window, 2000),
          "Capture regression did not hold a real queue submission")
        Require(window.RequestDiagnosticsCapture() == WindowReadbackRequestStatus.Busy,
          "Capture regression did not encounter renderer Busy")
        for i in 0 ... 3 {
          using let response = JsonDocument.Parse(session.CapturePayload())
          Require(response.RootElement.GetProperty("pending").GetBoolean(),
            "Busy capture did not remain pending")
        }
        WindowReadbackTestFixture.RuntimeReleaseHeldQueueCall()
        for capture in 0 ... 3 {
          let deadline = Stopwatch.GetTimestamp() + Stopwatch.Frequency * 10
          var complete = false
          while Stopwatch.GetTimestamp() < deadline {
            using let response = JsonDocument.Parse(session.CapturePayload())
            let payload = response.RootElement
            if !payload.GetProperty("pending").GetBoolean() {
              let width = payload.GetProperty("width").GetInt32()
              let height = payload.GetProperty("height").GetInt32()
              let stride = payload.GetProperty("stride").GetInt32()
              let pixels = Convert.FromBase64String(payload.GetProperty("rgbaBase64").GetString() ?? "")
              Require(width > 0 && height > 0 && stride == width * 4
                  && pixels.Length == stride * height,
                "Capture returned invalid image dimensions")
              let pixel = 2 * stride + 8
              Require(Math.Abs(int32(pixels[pixel]) - 12) <= 2
                  && Math.Abs(int32(pixels[pixel + 1]) - 20) <= 2
                  && Math.Abs(int32(pixels[pixel + 2]) - 32) <= 2
                  && pixels[pixel + 3] == 255,
                "Capture returned incorrect background pixels: "
                +Convert.ToHexString(pixels.AsSpan(pixel, 4)))
              complete = true
              break
            }
            root.Frame++
            root.Rebuild()
            window.ForceRenderForTest(0.016)
            Thread.Sleep(1)
          }
          Require(complete, "Capture did not complete after releasing the queue")
          WindowReadbackTestFixture.ForceRender(window, 0.016)
        }
        Console.WriteLine("diagnostic-capture: busy_pending=3 repeated_images=3 pixels=verified")
      } finally {
        WindowReadbackTestFixture.RuntimeReleaseHeldQueueCall()
        window.RequestClose()
        let deadline = Stopwatch.GetTimestamp() + Stopwatch.Frequency * 5
        while window.IsOpen && Stopwatch.GetTimestamp() < deadline {
          window.PumpScheduled(0.0)
          Thread.Sleep(1)
        }
        Require(!window.IsOpen, "Capture regression window did not close")
      }
    }
  }
}
