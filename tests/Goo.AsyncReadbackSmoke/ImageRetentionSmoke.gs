package GooAsyncReadbackSmoke

import Goo
import System
import System.IO

class ImageRetentionCell : Cell {
  private let source ImageSource
  private var changed bool

  init() {
    source = ImageSource(1, 1, []uint8{
      uint8(48), uint8(96), uint8(224), uint8(128),
    })
  }

  internal func Mutate() {
    changed = true
    Rebuild()
  }

  internal func DisposeSource() {
    source.Dispose()
  }

  override func Build() Blob -> Container() {.Width: 160,.Height: 64,.Position: PositionType.Relative,.BackgroundColor: Color.Rgb(12, 20, 32),
    Image{
        Position: PositionType.Absolute,
        Left: 8,
        Top: 8,
        Width: 32,
        Height: 32,
        Source: source,
        Fit: ImageFit.Fill,
        BackgroundColor: if changed {
          Color.Rgb(32, 208, 72)
        } else {
          Color.Rgb(224, 40, 48)
        },
      },
      Image{
        Position: PositionType.Absolute,
        Left: 96,
        Top: 8,
        Width: 32,
        Height: 32,
        Source: source,
        Fit: ImageFit.Fill,
        BackgroundColor: Color.Rgb(168, 96, 40),
    },
  }
}

func RunImageRetentionSmoke() {
  Require(Environment.GetEnvironmentVariable("GOO_VK_DIAGNOSTICS") == "1",
    "GOO_VK_DIAGNOSTICS=1 is required")
  let root = ImageRetentionCell{}
  let capturedError = StringWriter()
  let originalError = Console.Error
  var window Window? = nil
  try {
    let opened = Window{
      Title: "Goo retained image gate",
      Width: 160,
      Height: 64,
      VSync: false,
      Root: root,
    }
    window = opened
    Console.SetError(capturedError)
    opened.Open()
    var warmup int32 = 0
    while warmup < 12 {
      WindowReadbackTestFixture.ForceRender(opened, 0.0166666666666667)
      warmup = warmup + 1
    }
    let metrics = WindowReadbackTestFixture.Metrics(opened)
    let before = PrimitiveReadback(opened, metrics)
    root.Mutate()
    WindowReadbackTestFixture.ForceRender(opened, 0.0166666666666667)
    let state = WindowReadbackTestFixture.SceneRetention(opened)
    Require(state.PartialRedraw && !state.FullRedraw
        && state.DamageWidth > 0 && state.DamageHeight > 0
        && state.DamageWidth < metrics.FramebufferWidth
        && state.DamageHeight < metrics.FramebufferHeight,
      "Retained image mutation did not produce bounded partial damage")
    let after = PrimitiveReadback(opened, metrics)
    RetainedRequireOutsideStable(before.Pixels, after.Pixels, after.Width,
      after.Height, state.DamageX, state.DamageY,
      state.DamageX + state.DamageWidth, state.DamageY + state.DamageHeight)
    let beforePixel = PrimitiveLogicalPixel(before.Pixels, before.Width,
      metrics, 24.0, 24.0)
    let afterPixel = PrimitiveLogicalPixel(after.Pixels, after.Width,
      metrics, 24.0, 24.0)
    let changed = Math.Abs(int32(beforePixel[0]) - int32(afterPixel[0]))
    +Math.Abs(int32(beforePixel[1]) - int32(afterPixel[1]))
    +Math.Abs(int32(beforePixel[2]) - int32(afterPixel[2]))
    Require(changed > 20,
      "Retained image mutation did not update the composited image pixel")
    opened.RequestClose()
    WindowReadbackTestFixture.ForceRender(opened, 0.0)
    Require(!opened.IsOpen, "Retained image gate window did not close")
    Require(WindowReadbackTestFixture.ResidentResourceBytes(opened) == 0uL,
      "Retained image gate resources remain resident after close")
  } finally {
    Console.SetError(originalError)
    if let active = window {
      if active.IsOpen {
        active.RequestClose()
        WindowReadbackTestFixture.ForceRender(active, 0.0)
      }
    }
    root.DisposeSource()
  }
  let diagnostics = capturedError.ToString()
  ReadbackValidateCommonDiagnostics(diagnostics)
  Require(!diagnostics.Contains("\"event\":325")
      && !diagnostics.Contains("\"event\":326"),
    "Retained image gate emitted unsupported-scene diagnostics")
  Console.WriteLine("image-retention-smoke: partial_damage=1 exact_image=1 pixels=1 close=1")
}
