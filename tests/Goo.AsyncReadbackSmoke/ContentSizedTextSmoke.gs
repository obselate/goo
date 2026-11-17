package GooAsyncReadbackSmoke

import Goo
import System
import System.Diagnostics
import System.IO
import System.Threading

class ContentSizedTextCell(hidden bool, control bool = false, nested bool = false, border float64 = 0) : Cell {
  override func Build() Blob {
    let root = Container{Width: 1120, Height: 240, BackgroundColor: Color.White}
    for size in 12 ... 17 {
      for phase in 0 ... 10 {
        let parent = Container{Position: PositionType.Absolute, Left: 8 + phase * 110,
          Top: 16 + (size - 12) * 44 + float64(phase) * 0.1,
          BorderWidth: border, BorderColor: Color.White,
          FlexDirection: FlexDirection.Row, Overflow: hidden ? Overflow.Hidden : Overflow.Visible}
        let text = Text{Content: "gjpqy ÁÉ", FontFamily: "Content rounding", FontSize: size, LineHeight: 1.2,
          Color: Color.Black, TextWrap: TextWrap.NoWrap, FlexGrow: 1}
        if nested { parent.Add(Container{Overflow: Overflow.Visible, FlexDirection: FlexDirection.Row, text}) }
        else { parent.Add(text) }
        if control { parent.Height = 2 }
        root.Add(parent)
      }
    }
    return root
  }
}

func CaptureContentSizedText(session OffscreenRenderSession, scale float32, hidden bool,
  control bool = false, nested bool = false, border float64 = 0) WindowCapture {
  let options = OffscreenRenderOptions(LayoutSize(1120, 240), uint32(1120.0F * scale),
    uint32(240.0F * scale), Color.White, 134217728)
  let pending = session.RenderAsync(ContentSizedTextCell(hidden, control, nested, border), options, CancellationToken.None)
  let clock = Stopwatch.StartNew()
  while !pending.IsCompleted && clock.Elapsed < TimeSpan.FromSeconds(30) {
    session.Service()
    Thread.Sleep(1)
  }
  Require(pending.IsCompleted, "Content-sized text render timed out")
  let result = pending.GetAwaiter().GetResult()
  Require(result.Status == OffscreenRenderStatus.Success && result.Capture != nil,
    "Content-sized text render failed: " + result.Status.ToString() + " " + result.Error)
  return result.Capture!!
}

func RunContentSizedTextSmoke() {
  using let font = FontSource.FromPath("Content rounding", 400, false,
    Path.Combine(AppContext.BaseDirectory, "VendSans-VariableFont_wght.ttf"))
  font.Register()
  let created = OffscreenRenderSession.Create()
  Require(created.Status == OffscreenRenderStatus.Success, "Content-sized text session failed")
  using let session = created.Session!!
  for nested in []bool{false, true} {
    for border in []float64{0, 1} {
      for scale in []float32{1.0F, 1.25F, 1.5F, 2.0F} {
        let actual = CaptureContentSizedText(session, scale, true, nested: nested, border: border)
        let reference = CaptureContentSizedText(session, scale, false, nested: nested, border: border)
        let control = CaptureContentSizedText(session, scale, true, true, nested, border)
        var difference = 0
        var controlDifference = 0
        for index in 0 ... actual.Pixels.Length {
          if control.Pixels[index] != reference.Pixels[index] { controlDifference++ }
        }
        for size in 12 ... 17 {
          for phase in 0 ... 10 {
            let left = int32(Math.Floor((float64(8 + phase * 110) + border) * float64(scale) + 0.0001))
            let top = int32(Math.Floor((16.0 + float64(size - 12) * 44.0 + float64(phase) * 0.1 + border) * float64(scale) + 0.0001))
            let width = int32(Math.Ceiling(108.0 * float64(scale) - 0.0001))
            let height = int32(Math.Ceiling(float64(size) * 1.2 * float64(scale) - 0.0001))
            for y in top ... top + height {
              for x in left ... left + width {
                let pixel = (y * int32(actual.Width) + x) * 4
                for channel in 0 ... 4 {
                  if actual.Pixels[pixel + channel] != reference.Pixels[pixel + channel] { difference++ }
                }
              }
            }
          }
        }
        Require(difference == 0, "Content-sized parent lost in-box glyph ink at scale ${scale}, nested=${nested}, border=${border}: ${difference} bytes")
        Require(controlDifference > 0, "Explicit-height control did not clip glyph ink")
      }
    }
  }
}
