package GooAsyncReadbackSmoke

import Goo
import System
import System.IO

data struct TextCullingCase {
  internal var Name string
  internal var Left float64
  internal var Top float64
  internal var ContentMode int32
  internal var SceneMode int32
  internal var Outside bool
  internal var Unsupported bool
}

data struct TextCullingArm {
  internal var Pixels []uint8
  internal var Scene VulkanSceneRetentionTestSnapshot
  internal var Text VulkanTextFrameRetentionTestSnapshot
}

class TextCullingCullCell : Cell {
  private var Left float64
  private var Top float64
  private var ContentMode int32
  private var SceneMode int32
  private var ColorMode int32
  private var Revealed bool
  private let effect ShaderEffect

  shared {
    let ScrollViewport ElementHandle = ElementHandle{}
    let ClipPath VectorPath = PathBuilder().MoveTo(0.5, 0.0).LineTo(1.0, 0.5).LineTo(0.5, 1.0).LineTo(0.0, 0.5).Close().Build()
  }

  init(shader ShaderEffect) {
    Left = 8.0
    Top = 8.0
    Revealed = true
    effect = shader
  }

  func SetCase(value TextCullingCase) {
    Left = value.Left
    Top = value.Top
    ContentMode = value.ContentMode
    SceneMode = value.SceneMode
    ColorMode = 0
    Revealed = true
    Rebuild()
  }

  func MutateOffscreen() {
    ContentMode = 5
    ColorMode = 1
    Revealed = false
    Rebuild()
  }

  func Reveal() {
    Revealed = true
    Rebuild()
  }

  func Hide() {
    Revealed = false
    Rebuild()
  }

  func ScrollTo(x float64, y float64) bool -> ScrollViewport.ScrollTo(x, y)

  override func Build() Blob {
    let nested = SceneMode == 1
    let scrolling = SceneMode == 2
    let rounded = SceneMode == 3
    let mixedAxis = SceneMode == 4
    let transformed = SceneMode == 5
    let pathClipped = SceneMode == 6
    let effected = SceneMode == 7
    let content = if ContentMode == 1 {
      "لا"
    } else if ContentMode == 2 {
      "abc אבג 123"
    } else if ContentMode == 3 {
      "e\u0301 a\u0308"
    } else if ContentMode == 4 {
      "A 中 registered fallback"
    } else if ContentMode == 5 {
      "MUTATED"
    } else {
      "INITIAL"
    }
    let textLeft = Revealed ? Left : 80.0
    let textColor = ColorMode == 1
    ? Color.Rgb(48, 220, 96) : Color.Rgb(220, 64, 48)
    var sceneEffect ShaderEffect? = nil
    if effected {
      sceneEffect = effect
    }
    return Container() {.Width: Length.Percent(100),.Height: Length.Percent(100),.Position: PositionType.Relative,.BackgroundColor: Color.Rgb(10, 12, 20),
      Container() {.Position: PositionType.Absolute,.Left: 8,.Top: 8,.Width: nested ? 88 : 80,.Height: nested ? 48 : 40,.OverflowX: Overflow.Hidden,.OverflowY: mixedAxis ? Overflow.Visible : Overflow.Hidden,.BorderRadius: rounded ? 8 : 0,.Transform: transformed
          ? PanelTransform{ Rotate: 18, ScaleX: 0.9, ScaleY: 1.1 } : PanelTransform{},.ClipPath: if pathClipped {
            TextCullingCullCell.ClipPath
          } else {
            VectorPath{}
          },.ClipPathFit: ShapeFit.Fill,.ShaderEffect: sceneEffect,.BackgroundColor: Color.Rgb(18, 24, 38),
        Container() {.Position: PositionType.Absolute,.Left: nested ? 8 : 0,.Top: nested ? 4 : 0,.Width: nested ? 72 : 80,.Height: nested ? 36 : 40,.OverflowX: scrolling ? Overflow.Scroll : Overflow.Hidden,.OverflowY: scrolling ? Overflow.Scroll : Overflow.Hidden,.Handle: TextCullingCullCell.ScrollViewport,
          Container() {.Position: PositionType.Absolute,.Width: scrolling ? 160 : (nested ? 72 : 80),.Height: scrolling ? 80 : (nested ? 36 : 40),
            Text{
                      Content: content,
                      Position: PositionType.Absolute,
                      Left: textLeft,
                      Top: Top,
                      Width: 64,
                      Height: 24,
                      OverflowX: Overflow.Hidden,
                      OverflowY: Overflow.Hidden,
                      FontFamily: "RetainedGateFont",
                      FontSize: 16,
                      TextWrap: TextWrap.NoWrap,
                      TextTrimming: TextTrimming.Ellipsis,
                      Color: textColor,
            },
          },
        },
      },
    }
  }
}

func TextCullingRequirePixelsEqual(first []uint8, second []uint8, name string) {
  Require(first.Length == second.Length,
    "Retained text viewport " + name + " readback lengths differ")
  var index int32 = 0
  while index < first.Length {
    if first[index] != second[index] {
      throw InvalidOperationException("Retained text viewport " + name
        +" readback pixels differ at byte " + index.ToString())
    }
    index = index + 1
  }
}

func TextCullingRequirePixelsDifferent(first []uint8, second []uint8,
  name string) {
    Require(first.Length == second.Length,
      "Retained text viewport " + name + " readback lengths differ")
    var index int32 = 0
    while index < first.Length {
      if first[index] != second[index] {
        return
      }
      index = index + 1
    }
    throw InvalidOperationException("Retained text viewport " + name
      +" readback did not change")
  }

func TextCullingCapture(window Window, metrics WindowMetrics)
TextCullingArm{
  let result = PrimitiveReadback(window, metrics)
  return TextCullingArm{
    Pixels: result.Pixels,
    Scene: WindowReadbackTestFixture.SceneRetention(window),
    Text: WindowReadbackTestFixture.TextFrameRetention(window),
  }
}

func TextCullingRequireGreenText(pixels []uint8, width uint32,
  metrics WindowMetrics, name string) {
    var coverage int32 = 0
    var y int32 = 8
    while y < 48 {
      var x int32 = 8
      while x < 80 {
        let pixel = PrimitiveLogicalPixel(pixels, width, metrics,
          float64(x), float64(y))
        if int32(pixel[1]) > int32(pixel[0]) + 32
          && int32(pixel[1]) > int32(pixel[2]) + 16
          && pixel[3] >= uint8(240) {
            coverage = coverage + 1
          }
        x = x + 1
      }
      y = y + 1
    }
    Require(coverage > 2,
      "Retained text viewport " + name + " has no mutated color coverage")
  }

func TextCullingCompareCase(window Window, root TextCullingCullCell,
  item TextCullingCase) {
    root.SetCase(item)
    WindowReadbackTestFixture.ForceRender(window, 0.0)
    if item.SceneMode == 2 {
      Require(root.ScrollTo(24.0, 8.0),
        "Retained text viewport scroll request was rejected")
    }
    let metrics = WindowReadbackTestFixture.Metrics(window)
    WindowReadbackTestFixture.SetExactTextClipCull(window, false)
    WindowReadbackTestFixture.ForceRender(window, 0.0)
    WindowReadbackTestFixture.ForceRender(window, 0.0)
    let control = TextCullingCapture(window, metrics)
    WindowReadbackTestFixture.SetExactTextClipCull(window, true)
    WindowReadbackTestFixture.ForceRender(window, 0.0)
    WindowReadbackTestFixture.ForceRender(window, 0.0)
    let enabled = TextCullingCapture(window, metrics)
    TextCullingRequirePixelsEqual(control.Pixels, enabled.Pixels, item.Name)
    if item.Unsupported {
      Require(enabled.Scene.ExactTextClipCandidateCount == 0
          && enabled.Scene.ExactTextClipCullCount == 0
          && enabled.Scene.TextLayoutRequestCount > 0,
        "Retained text viewport " + item.Name
        +" unexpectedly used exact clipped-text culling")
      Require(control.Scene.DrawCount == enabled.Scene.DrawCount
          && control.Scene.ResourceCount == enabled.Scene.ResourceCount
          && control.Scene.TextSegmentCount == enabled.Scene.TextSegmentCount
          && control.Text.SegmentCount == enabled.Text.SegmentCount
          && control.Text.RecordCount == enabled.Text.RecordCount,
        "Retained text viewport " + item.Name
        +" changed unsupported text output topology")
    } else if item.Outside {
      Require(control.Scene.ExactTextClipCullCount == 0
          && control.Scene.TextLayoutRequestCount > 0
          && control.Scene.TextSegmentCount > 0,
        "Retained text viewport " + item.Name
        +" disabled control did not take the full text path")
      Require(enabled.Scene.ExactTextClipCandidateCount > 0
          && enabled.Scene.ExactTextClipCullCount > 0
          && enabled.Scene.CachedTextPaintCullCount == 0
          && enabled.Scene.TextLayoutRequestCount == 0
          && enabled.Scene.TextSegmentCount == 0
          && enabled.Text.SegmentCount == 0
          && enabled.Text.RecordCount == 0,
        "Retained text viewport " + item.Name
        +" did not cull before text layout")
      WindowReadbackTestFixture.ForceRender(window, 0.0)
      let stable = TextCullingCapture(window, metrics)
      Require(stable.Scene.DrawCount == enabled.Scene.DrawCount
          && stable.Scene.ResourceCount == enabled.Scene.ResourceCount
          && stable.Scene.TextSegmentCount == enabled.Scene.TextSegmentCount
          && stable.Text.SegmentCount == enabled.Text.SegmentCount
          && stable.Text.RecordCount == enabled.Text.RecordCount,
        "Retained text viewport " + item.Name
        +" changed cull output topology on a warm frame")
    } else {
      Require(control.Scene.ExactTextClipCullCount == 0
          && control.Scene.TextLayoutRequestCount > 0,
        "Retained text viewport " + item.Name
        +" disabled control did not request full text layout")
      Require(enabled.Scene.ExactTextClipCandidateCount > 0
          && enabled.Scene.ExactTextClipCullCount == 0
          && enabled.Scene.CachedTextPaintCullCount == 0
          && enabled.Scene.TextLayoutRequestCount > 0,
        "Retained text viewport " + item.Name
        +" partial text did not use the full logical path")
      Require(control.Scene.DrawCount == enabled.Scene.DrawCount
          && control.Scene.ResourceCount == enabled.Scene.ResourceCount
          && control.Scene.TextSegmentCount == enabled.Scene.TextSegmentCount
          && control.Text.SegmentCount == enabled.Text.SegmentCount
          && control.Text.RecordCount == enabled.Text.RecordCount
          && control.Text.ByteCount == enabled.Text.ByteCount,
        "Retained text viewport " + item.Name
        +" changed partial text topology")
    }
  }

func RunTextCullingSmoke() {
  Require(Environment.GetEnvironmentVariable("GOO_VK_DIAGNOSTICS") == "1",
    "GOO_VK_DIAGNOSTICS=1 is required")
  let fontPath = Path.Combine(AppContext.BaseDirectory, "VendSans-VariableFont_wght.ttf")
  Require(File.Exists(fontPath), "Retained text viewport font asset is missing")
  let font = FontSource("RetainedGateFont", 400, false, File.ReadAllBytes(fontPath))
  font.Register()
  let shaderPath = Path.Combine(AppContext.BaseDirectory, "control_effect.frag.goo-effect")
  Require(File.Exists(shaderPath), "Retained text viewport shader effect asset is missing")
  let effect = ShaderEffect(ShaderEffectProgram.Load(shaderPath), true, 20.0F)
  let root = TextCullingCullCell(effect)
  let capturedError = StringWriter()
  let originalError = Console.Error
  var window Window? = nil
  try {
    let opened = Window{
      Title: "Goo Retained text viewport cull",
      Width: 96,
      Height: 64,
      VSync: false,
      Root: root,
    }
    window = opened
    Console.SetError(capturedError)
    opened.Open()
    WindowReadbackTestFixture.SetExactTextClipCull(opened, true)
    WindowReadbackTestFixture.ForceRender(opened, 0.0)
    let initialCase = TextCullingCase{
      Name: "inside",
      Left: 8.0,
      Top: 8.0,
      ContentMode: 0,
      SceneMode: 0,
      Outside: false,
      Unsupported: false,
    }
    TextCullingCompareCase(opened, root, initialCase)

    TextCullingCompareCase(opened, root, TextCullingCase{
      Name: "outside-left",
      Left: -64.0,
      Top: 8.0,
      ContentMode: 0,
      SceneMode: 0,
      Outside: true,
      Unsupported: false,
    })
    TextCullingCompareCase(opened, root, TextCullingCase{
      Name: "outside-right",
      Left: 80.0,
      Top: 8.0,
      ContentMode: 0,
      SceneMode: 0,
      Outside: true,
      Unsupported: false,
    })
    TextCullingCompareCase(opened, root, TextCullingCase{
      Name: "outside-top",
      Left: 8.0,
      Top: -24.0,
      ContentMode: 0,
      SceneMode: 0,
      Outside: true,
      Unsupported: false,
    })
    TextCullingCompareCase(opened, root, TextCullingCase{
      Name: "outside-bottom",
      Left: 8.0,
      Top: 40.0,
      ContentMode: 0,
      SceneMode: 0,
      Outside: true,
      Unsupported: false,
    })
    TextCullingCompareCase(opened, root, TextCullingCase{
      Name: "outside-top-left",
      Left: -64.0,
      Top: -24.0,
      ContentMode: 0,
      SceneMode: 0,
      Outside: true,
      Unsupported: false,
    })
    TextCullingCompareCase(opened, root, TextCullingCase{
      Name: "outside-top-right",
      Left: 80.0,
      Top: -24.0,
      ContentMode: 0,
      SceneMode: 0,
      Outside: true,
      Unsupported: false,
    })
    TextCullingCompareCase(opened, root, TextCullingCase{
      Name: "outside-bottom-left",
      Left: -64.0,
      Top: 40.0,
      ContentMode: 0,
      SceneMode: 0,
      Outside: true,
      Unsupported: false,
    })
    TextCullingCompareCase(opened, root, TextCullingCase{
      Name: "outside-bottom-right",
      Left: 80.0,
      Top: 40.0,
      ContentMode: 0,
      SceneMode: 0,
      Outside: true,
      Unsupported: false,
    })
    TextCullingCompareCase(opened, root, TextCullingCase{
      Name: "edge-contact",
      Left: 80.0,
      Top: 40.0,
      ContentMode: 0,
      SceneMode: 0,
      Outside: true,
      Unsupported: false,
    })
    TextCullingCompareCase(opened, root, TextCullingCase{
      Name: "partial-left",
      Left: -63.0,
      Top: 8.0,
      ContentMode: 0,
      SceneMode: 0,
      Outside: false,
      Unsupported: false,
    })
    TextCullingCompareCase(opened, root, TextCullingCase{
      Name: "partial-right",
      Left: 79.0,
      Top: 8.0,
      ContentMode: 0,
      SceneMode: 0,
      Outside: false,
      Unsupported: false,
    })
    TextCullingCompareCase(opened, root, TextCullingCase{
      Name: "partial-top",
      Left: 8.0,
      Top: -23.0,
      ContentMode: 0,
      SceneMode: 0,
      Outside: false,
      Unsupported: false,
    })
    TextCullingCompareCase(opened, root, TextCullingCase{
      Name: "partial-bottom",
      Left: 8.0,
      Top: 39.0,
      ContentMode: 0,
      SceneMode: 0,
      Outside: false,
      Unsupported: false,
    })
    TextCullingCompareCase(opened, root, TextCullingCase{
      Name: "fractional-left",
      Left: -63.5,
      Top: 8.0,
      ContentMode: 0,
      SceneMode: 0,
      Outside: false,
      Unsupported: false,
    })
    TextCullingCompareCase(opened, root, TextCullingCase{
      Name: "fractional-right",
      Left: 79.5,
      Top: 8.0,
      ContentMode: 0,
      SceneMode: 0,
      Outside: false,
      Unsupported: false,
    })
    TextCullingCompareCase(opened, root, TextCullingCase{
      Name: "fractional-top",
      Left: 8.0,
      Top: -23.5,
      ContentMode: 0,
      SceneMode: 0,
      Outside: false,
      Unsupported: false,
    })
    TextCullingCompareCase(opened, root, TextCullingCase{
      Name: "fractional-bottom",
      Left: 8.0,
      Top: 39.5,
      ContentMode: 0,
      SceneMode: 0,
      Outside: false,
      Unsupported: false,
    })
    TextCullingCompareCase(opened, root, TextCullingCase{
      Name: "arabic-ligature",
      Left: 8.0,
      Top: 8.0,
      ContentMode: 1,
      SceneMode: 0,
      Outside: false,
      Unsupported: false,
    })
    TextCullingCompareCase(opened, root, TextCullingCase{
      Name: "mixed-bidi",
      Left: 8.0,
      Top: 8.0,
      ContentMode: 2,
      SceneMode: 0,
      Outside: false,
      Unsupported: false,
    })
    TextCullingCompareCase(opened, root, TextCullingCase{
      Name: "combining-marks",
      Left: 8.0,
      Top: 8.0,
      ContentMode: 3,
      SceneMode: 0,
      Outside: false,
      Unsupported: false,
    })
    TextCullingCompareCase(opened, root, TextCullingCase{
      Name: "registered-fallback",
      Left: 8.0,
      Top: 8.0,
      ContentMode: 4,
      SceneMode: 0,
      Outside: false,
      Unsupported: false,
    })
    TextCullingCompareCase(opened, root, TextCullingCase{
      Name: "nested-rectangular",
      Left: -63.0,
      Top: 8.0,
      ContentMode: 0,
      SceneMode: 1,
      Outside: false,
      Unsupported: false,
    })
    TextCullingCompareCase(opened, root, TextCullingCase{
      Name: "nested-outside",
      Left: 72.0,
      Top: 36.0,
      ContentMode: 0,
      SceneMode: 1,
      Outside: true,
      Unsupported: false,
    })
    TextCullingCompareCase(opened, root, TextCullingCase{
      Name: "simple-scroll",
      Left: 8.0,
      Top: 8.0,
      ContentMode: 2,
      SceneMode: 2,
      Outside: false,
      Unsupported: false,
    })
    let mutationCase = TextCullingCase{
      Name: "mutation",
      Left: 8.0,
      Top: 8.0,
      ContentMode: 0,
      SceneMode: 0,
      Outside: false,
      Unsupported: false,
    }
    root.SetCase(mutationCase)
    WindowReadbackTestFixture.SetExactTextClipCull(opened, true)
    WindowReadbackTestFixture.ForceRender(opened, 0.0)
    let beforeMutation = TextCullingCapture(opened,
      WindowReadbackTestFixture.Metrics(opened))
    root.MutateOffscreen()
    WindowReadbackTestFixture.ForceRender(opened, 0.0)
    let mutated = TextCullingCapture(opened,
      WindowReadbackTestFixture.Metrics(opened))
    Require(mutated.Scene.ExactTextClipCullCount > 0
        && mutated.Scene.TextLayoutRequestCount == 0
        && mutated.Scene.TextSegmentCount == 0
        && mutated.Text.RecordCount == 0,
      "Retained text viewport offscreen mutation contract failed: exactCull="
      +mutated.Scene.ExactTextClipCullCount.ToString()
      +" layout=" + mutated.Scene.TextLayoutRequestCount.ToString()
      +" segments=" + mutated.Scene.TextSegmentCount.ToString()
      +" records=" + mutated.Text.RecordCount.ToString())
    root.Reveal()
    WindowReadbackTestFixture.ForceRender(opened, 0.0)
    WindowReadbackTestFixture.ForceRender(opened, 0.0)
    let revealed = TextCullingCapture(opened,
      WindowReadbackTestFixture.Metrics(opened))
    Require(revealed.Scene.ExactTextClipCullCount == 0
        && revealed.Scene.TextLayoutRequestCount > 0
        && revealed.Scene.TextSegmentCount > 0
        && revealed.Text.RecordCount > 0,
      "Retained text viewport reveal contract failed: exactCull="
      +revealed.Scene.ExactTextClipCullCount.ToString()
      +" layout=" + revealed.Scene.TextLayoutRequestCount.ToString()
      +" segments=" + revealed.Scene.TextSegmentCount.ToString()
      +" records=" + revealed.Text.RecordCount.ToString())
    TextCullingRequireGreenText(revealed.Pixels,
      uint32(WindowReadbackTestFixture.Metrics(opened).FramebufferWidth),
      WindowReadbackTestFixture.Metrics(opened), "mutation reveal")
    TextCullingRequirePixelsDifferent(beforeMutation.Pixels, revealed.Pixels,
      "mutation reveal")
    root.Hide()
    WindowReadbackTestFixture.ForceRender(opened, 0.0)
    WindowReadbackTestFixture.ForceRender(opened, 0.0)
    let hidden = TextCullingCapture(opened,
      WindowReadbackTestFixture.Metrics(opened))
    Require(hidden.Scene.ExactTextClipCullCount > 0
        && hidden.Scene.TextLayoutRequestCount == 0
        && hidden.Text.RecordCount == 0,
      "Retained text viewport hide did not restore the placeholder")
    root.Reveal()
    WindowReadbackTestFixture.ForceRender(opened, 0.0)
    WindowReadbackTestFixture.ForceRender(opened, 0.0)
    let rerevealed = TextCullingCapture(opened,
      WindowReadbackTestFixture.Metrics(opened))
    TextCullingRequirePixelsEqual(revealed.Pixels, rerevealed.Pixels,
      "hide-reveal")
    TextCullingCompareCase(opened, root, TextCullingCase{
      Name: "rounded-fallback",
      Left: 8.0,
      Top: 8.0,
      ContentMode: 0,
      SceneMode: 3,
      Outside: false,
      Unsupported: true,
    })
    TextCullingCompareCase(opened, root, TextCullingCase{
      Name: "mixed-axis-fallback",
      Left: -64.0,
      Top: 8.0,
      ContentMode: 0,
      SceneMode: 4,
      Outside: true,
      Unsupported: true,
    })
    TextCullingCompareCase(opened, root, TextCullingCase{
      Name: "transform-fallback",
      Left: 8.0,
      Top: 8.0,
      ContentMode: 0,
      SceneMode: 5,
      Outside: false,
      Unsupported: true,
    })
    TextCullingCompareCase(opened, root, TextCullingCase{
      Name: "path-fallback",
      Left: 8.0,
      Top: 8.0,
      ContentMode: 0,
      SceneMode: 6,
      Outside: false,
      Unsupported: true,
    })
    TextCullingCompareCase(opened, root, TextCullingCase{
      Name: "effect-fallback",
      Left: 8.0,
      Top: 8.0,
      ContentMode: 0,
      SceneMode: 7,
      Outside: false,
      Unsupported: true,
    })

    root.SetCase(initialCase)
    opened.Width = 80
    opened.Height = 56
    var resizeMetrics = WindowReadbackTestFixture.Metrics(opened)
    var resizeAttempt int32 = 0
    while (resizeMetrics.LogicalWidth != 80 || resizeMetrics.LogicalHeight != 56)
      && resizeAttempt < 1000 {
        WindowReadbackTestFixture.PumpNativeEvents()
        WindowReadbackTestFixture.Pump(opened, 0.0)
        resizeMetrics = WindowReadbackTestFixture.Metrics(opened)
        resizeAttempt = resizeAttempt + 1
      }
    Require(resizeMetrics.LogicalWidth == 80 && resizeMetrics.LogicalHeight == 56,
      "Retained text viewport window did not resize")
    WindowReadbackTestFixture.SetExactTextClipCull(opened, false)
    WindowReadbackTestFixture.ForceRender(opened, 0.0)
    let resizedControl = TextCullingCapture(opened, resizeMetrics)
    WindowReadbackTestFixture.SetExactTextClipCull(opened, true)
    WindowReadbackTestFixture.ForceRender(opened, 0.0)
    let resizedEnabled = TextCullingCapture(opened, resizeMetrics)
    TextCullingRequirePixelsEqual(resizedControl.Pixels, resizedEnabled.Pixels,
      "resize")

    opened.RequestClose()
    WindowReadbackTestFixture.ForceRender(opened, 0.0)
    Require(!opened.IsOpen, "Retained text viewport cull window did not close")
    Require(WindowReadbackTestFixture.ResidentResourceBytes(opened) == 0uL,
      "Retained text viewport cull readback resources remain resident")
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
  ReadbackValidateCommonDiagnostics(capturedError.ToString())
  Console.WriteLine("text-culling-smoke: exact_outside=1 partial_full_shape=1"
    +" mutation_reveal=1 fallback=1 pixel_equality=1 resize=1 close=1")
}
