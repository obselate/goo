package GooAsyncReadbackSmoke

import Goo
import GooReadbackFixture
import System
import System.Collections.Generic
import System.IO
import System.Numerics

class PartialPlainCell : Cell {
  internal var Step int32

  override func Build() Blob -> Container() {.Width: Percent(100),.Height: Percent(100),.Position: PositionType.Relative,.BackgroundColor: Color.Rgb(12, 20, 32),
    Container{
      Position: PositionType.Absolute,
      Left: 8,
      Top: 8,
      Width: 120,
      Height: 60,
      BackgroundColor: Step >= 1 ? Color.Rgb(196, 88, 200) : Color.Rgb(52, 196, 112),
    },
    Container{
      Position: PositionType.Absolute,
      Left: 96,
      Top: 40,
      Width: 140,
      Height: 90,
      BorderRadius: 18,
      BackgroundColor: Color.Rgba(228, 64, 72, 180),
    },
    Container{
      Position: PositionType.Absolute,
      Left: Step >= 2 ? 230 : 250,
      Top: 12,
      Width: 130,
      Height: 70,
      BorderWidth: 3,
      BorderColor: Color.Rgb(236, 196, 72),
      BackgroundColor: Color.Rgb(26, 50, 76),
    },
    Text{
      Position: PositionType.Absolute,
      Left: 20,
      Top: 120,
      Content: Step >= 3 ? "Partial redraw works" : "Partial redraw proof",
      FontFamily: "ReadbackGateFont",
      FontSize: 26,
      Color: Color.White,
    },
    Text{
      Position: PositionType.Absolute,
      Left: 256,
      Top: 30,
      Content: "Over a box",
      FontFamily: "ReadbackGateFont",
      FontSize: 16,
      Color: Color.Rgb(72, 224, 128),
    },
    Text{
      Position: PositionType.Absolute,
      Left: 150,
      Top: 90,
      Width: 40,
      Height: 12,
      Content: Step >= 4 ? "Wide words past the box" : "Long text past its box",
      TextWrap: TextWrap.NoWrap,
      FontFamily: "ReadbackGateFont",
      FontSize: 22,
      Color: Color.Rgb(236, 196, 72),
    },
  }
}

class PartialRectClipCell : Cell {
  internal var Step int32

  override func Build() Blob -> Container() {.Width: Percent(100),.Height: Percent(100),.Position: PositionType.Relative,.BackgroundColor: Color.Rgb(12, 20, 32),
    Container() {.Position: PositionType.Absolute,.Left: 8,.Top: 8,.Width: Step >= 5 ? 130 : 150,.Height: 80,.Overflow: Overflow.Hidden,.BackgroundColor: Color.Rgb(18, 32, 52),
      Container{
        Position: PositionType.Absolute,
        Left: Step >= 2 ? 60 : 90,
        Top: 30,
        Width: 220,
        Height: 130,
        BackgroundColor: Step >= 1 ? Color.Rgb(72, 128, 224) : Color.Rgb(52, 196, 112),
      },
      Text{
        Position: PositionType.Absolute,
        Left: 10,
        Top: 52,
        Content: Step >= 4 ? "Changed text line" : "Clipped text line",
        FontFamily: "ReadbackGateFont",
        FontSize: 30,
        Color: Color.White,
      },
    },
    Container{
      Position: PositionType.Absolute,
      Left: 170,
      Top: 100,
      Width: 90,
      Height: 70,
      BackgroundColor: Color.Rgb(72, 128, 224),
    },
    Container() {.Position: PositionType.Absolute,.Left: 200,.Top: 8,.Width: 180,.Height: 110,.Overflow: Overflow.Hidden,.BackgroundColor: Color.Rgb(36, 52, 76),
      Container() {.Position: PositionType.Absolute,.Left: 40,.Top: 30,.Width: 240,.Height: 50,.Overflow: Overflow.Hidden,.BackgroundColor: Color.Rgb(228, 160, 64),
        Container{
          Position: PositionType.Absolute,
          Left: 100,
          Top: -30,
          Width: 200,
          Height: 200,
          BackgroundColor: Step >= 3 ? Color.Rgb(52, 196, 112) : Color.Rgb(196, 88, 200),
        },
      },
      Container{
        Position: PositionType.Absolute,
        Left: -20,
        Top: 90,
        Width: 260,
        Height: 60,
        BackgroundColor: Color.Rgb(228, 64, 72),
      },
    },
    Container{
      Position: PositionType.Absolute,
      Left: 300,
      Top: 126,
      Width: 92,
      Height: 56,
      BackgroundColor: Color.Rgb(236, 196, 72),
    },
  }
}

class PartialClipMaskCell : Cell {
  shared {
    let Pattern ImageSource = ImageSource(2, 2, []uint8{
      248, 72, 72, 255,
      72, 224, 128, 255,
      72, 128, 232, 255,
      236, 196, 72, 255,
    })
    let Diamond VectorPath = PathBuilder().MoveTo(0.5, 0.0).LineTo(1.0, 0.5).LineTo(0.5, 1.0).LineTo(0.0, 0.5).Close().Build()
    let Triangle VectorPath = PathBuilder().MoveTo(0.5, 0.0).LineTo(1.0, 1.0).LineTo(0.0, 1.0).Close().Build()
  }

  internal let Scroll ElementHandle = ElementHandle{}
  internal var Step int32

  override func Build() Blob -> Container() {.Width: Percent(100),.Height: Percent(100),.Position: PositionType.Relative,.BackgroundColor: Color.Rgb(12, 20, 32),
    Container() {.Position: PositionType.Absolute,.Left: 8,.Top: 8,.Width: Step >= 6 ? 104 : 124,.Height: 96,.BorderRadius: Step >= 7 ? 36 : 20,.Overflow: Overflow.Hidden,.BackgroundColor: Color.Rgb(228, 64, 72),
      Text{
        Position: PositionType.Absolute,
        Left: 16,
        Top: 14,
        Content: Step >= 3 ? "Mask" : "Clip",
        FontFamily: "ReadbackGateFont",
        FontSize: 18,
        Color: Color.White,
      },
      Image{
        Position: PositionType.Absolute,
        Left: 78,
        Top: 48,
        Width: 42,
        Height: 42,
        Source: PartialClipMaskCell.Pattern,
        Fit: ImageFit.Fill,
      },
      Container{
        Position: PositionType.Absolute,
        Left: Step >= 2 ? 96 : 116,
        Top: 70,
        Width: 84,
        Height: 46,
        BackgroundColor: Step >= 1 ? Color.Rgb(72, 128, 224) : Color.Rgb(72, 224, 128),
      },
    },
    Container() {.Position: PositionType.Absolute,.Left: 144,.Top: 8,.Width: 120,.Height: 72,.OverflowX: Overflow.Visible,.OverflowY: Overflow.Scroll,.Handle: Scroll,.BackgroundColor: Color.Rgb(36, 52, 76),
      Container() {.Position: PositionType.Absolute,.Width: 150,.Height: 200,.BackgroundColor: Color.Rgb(228, 160, 64),
        Container{
          Position: PositionType.Absolute,
          Top: 40,
          Width: 120,
          Height: 64,
          BackgroundColor: Step >= 4 ? Color.Rgb(52, 196, 112) : Color.Rgb(196, 88, 200),
        },
      },
    },
    Container() {.Position: PositionType.Absolute,.Left: 288,.Top: 84,.Width: 104,.Height: 96,.ClipPath: PartialClipMaskCell.Diamond,.ClipPathFit: ShapeFit.Fill,.BackgroundColor: Color.Rgb(32, 96, 144),
      Container() {.Position: PositionType.Absolute,.Left: 8,.Top: 8,.Width: 88,.Height: 80,.ClipPath: PartialClipMaskCell.Triangle,.ClipPathFit: ShapeFit.Fill,.BackgroundColor: Color.Rgb(160, 64, 192),
        Container{
          Position: PositionType.Absolute,
          Left: 20,
          Top: 18,
          Width: 44,
          Height: 34,
          BackgroundColor: Step >= 5 ? Color.Rgb(72, 224, 128) : Color.Rgb(236, 196, 72),
        },
      },
    },
    Container{
      Position: PositionType.Absolute,
      Left: 150,
      Top: 120,
      Width: 110,
      Height: 60,
      BackgroundColor: Color.Rgb(72, 128, 224),
    },
  }
}

class PartialTransformCell : Cell {
  internal var Step int32

  override func Build() Blob -> Container() {.Width: Percent(100),.Height: Percent(100),.Position: PositionType.Relative,.BackgroundColor: Color.Rgb(12, 20, 32),
    Container() {.Position: PositionType.Absolute,.Left: 12,.Top: 14,.Width: 150,.Height: 70,.Transform: PanelTransform{ TranslateX: Step >= 2 ? 34 : 10, TranslateY: 6 },.BackgroundColor: Color.Rgb(18, 32, 52),
      Container{
        Position: PositionType.Absolute,
        Left: 10,
        Top: 10,
        Width: 50,
        Height: 30,
        BackgroundColor: Step >= 1 ? Color.Rgb(196, 88, 200) : Color.Rgb(52, 196, 112),
      },
      Text{
        Position: PositionType.Absolute,
        Left: 12,
        Top: 42,
        Content: Step >= 4 ? "Moved" : "Under",
        FontFamily: "ReadbackGateFont",
        FontSize: 18,
        Color: Color.White,
      },
    },
    Container{
      Position: PositionType.Absolute,
      Left: 230,
      Top: 30,
      Width: 80,
      Height: 50,
      Transform: PanelTransform{ Rotate: Step >= 3 ? -18 : 18 },
      BackgroundColor: Color.Rgb(236, 196, 72),
    },
    Container() {.Position: PositionType.Absolute,.Left: 20,.Top: 104,.Width: 150,.Height: 70,.Overflow: Overflow.Hidden,.BackgroundColor: Color.Rgb(36, 52, 76),
      Container() {.Position: PositionType.Absolute,.Left: 30,.Top: 10,.Width: 160,.Height: 40,.Transform: PanelTransform{ Rotate: 12, ScaleX: Step >= 5 ? 1.2 : 0.9, ScaleY: 1.1 },.BackgroundColor: Color.Rgb(228, 64, 72),
        Container{
          Position: PositionType.Absolute,
          Left: 20,
          Top: 8,
          Width: 60,
          Height: 20,
          Transform: PanelTransform{ TranslateX: 12, Rotate: -30 },
          BackgroundColor: Step >= 6 ? Color.Rgb(72, 224, 128) : Color.Rgb(72, 128, 224),
        },
      },
    },
    Container{
      Position: PositionType.Absolute,
      Left: 250,
      Top: 110,
      Width: 120,
      Height: 60,
      BorderWidth: 3,
      BorderColor: Color.Rgb(72, 224, 128),
      Transform: PanelTransform{ TranslateY: Step >= 7 ? -14 : 0, ScaleX: 0.8 },
      BackgroundColor: Color.Rgb(26, 50, 76),
    },
  }
}

class PartialPaintCell : Cell {
  shared {
    let Star VectorPath = PathBuilder().MoveTo(0.5, 0.0).LineTo(0.65, 0.35).LineTo(1.0, 0.4).LineTo(0.72, 0.62).LineTo(0.8, 1.0).LineTo(0.5, 0.78).LineTo(0.2, 1.0).LineTo(0.28, 0.62).LineTo(0.0, 0.4).LineTo(0.35, 0.35).Close().Build()
  }

  internal var Step int32

  override func Build() Blob -> Container() {.Width: Percent(100),.Height: Percent(100),.Position: PositionType.Relative,.BackgroundColor: Color.Rgb(12, 20, 32),
    Container{
      Position: PositionType.Absolute,
      Left: 10,
      Top: 10,
      Width: 110,
      Height: 50,
      BorderRadius: 12,
      BackgroundGradient: LinearGradient(90.0, []GradientStop{
        GradientStop{ Offset: 0.0, Color: Color.Rgb(24, 68, 132) },
        GradientStop{ Offset: 1.0, Color: Step >= 1 ? Color.Rgb(196, 88, 200) : Color.Rgb(88, 172, 210) },
      }),
    },
    Container{
      Position: PositionType.Absolute,
      Left: Step >= 2 ? 150 : 132,
      Top: 10,
      Width: 70,
      Height: 50,
      BackgroundGradient: RadialGradient(0.5, 0.5, 0.5, []GradientStop{
        GradientStop{ Offset: 0.0, Color: Color.Rgb(232, 178, 78) },
        GradientStop{ Offset: 1.0, Color: Color.Rgb(128, 54, 92) },
      }),
    },
    Container{
      Position: PositionType.Absolute,
      Left: 240,
      Top: 10,
      Width: 70,
      Height: 50,
      BorderRadius: 14,
      BorderWidth: 4,
      BorderColor: Step >= 3 ? Color.Rgb(72, 224, 128) : Color.Rgb(236, 196, 72),
    },
    Container{
      Position: PositionType.Absolute,
      Left: 322,
      Top: 10,
      Width: 66,
      Height: 50,
      BorderWidth: 3,
      BorderStyle: BorderStyle.Dashed,
      BorderColor: Step >= 3 ? Color.Rgb(236, 196, 72) : Color.Rgb(72, 224, 128),
    },
    Text{
      Position: PositionType.Absolute,
      Left: 12,
      Top: 72,
      Content: Step >= 4 ? "Underlined words" : "Underlined text",
      TextDecoration: TextDecoration.Underline,
      FontFamily: "ReadbackGateFont",
      FontSize: 20,
      Color: Color.White,
    },
    Shape{
      Position: PositionType.Absolute,
      Left: 200,
      Top: 70,
      Width: 56,
      Height: 56,
      Path: PartialPaintCell.Star,
      BackgroundColor: Step >= 5 ? Color.Rgb(72, 128, 224) : Color.Rgb(236, 196, 72),
    },
    Container{
      Position: PositionType.Absolute,
      Left: 30,
      Top: 120,
      Width: 90,
      Height: 40,
      BorderRadius: 8,
      BackgroundColor: Color.Rgb(26, 50, 76),
      BoxShadow: BoxShadow{ OffsetX: Step >= 6 ? 14 : 4, OffsetY: 6, Blur: 10, Color: Color.Rgb(228, 64, 72) },
    },
    Container{
      Position: PositionType.Absolute,
      Left: 290,
      Top: 90,
      Width: 80,
      Height: 60,
      BackgroundColor: Color.Rgb(36, 52, 76),
      OutlineWidth: Step >= 7 ? 6 : 2,
      OutlineColor: Color.Rgb(52, 196, 112),
      OutlineOffset: 3,
      BoxShadow: BoxShadow{ Inset: true, Blur: 8, Spread: 2, Color: Color.Rgb(196, 88, 200) },
    },
  }
}

class PartialLayerCell : Cell {
  private let control ShaderEffect
  private let glass ShaderEffect
  private let generator ShaderEffect
  internal var Step int32

  init(control ShaderEffect, glass ShaderEffect, generator ShaderEffect) {
    this.control = control
    this.glass = glass
    this.generator = generator
  }

  internal func Advance() {
    Step++
    if Step == 6 { generator.SetParameter(0, Vector4(0.0F, 1.0F, 0.0F, 0.0F)) }
    Rebuild()
  }

  override func Build() Blob -> Container() {.Width: Percent(100),.Height: Percent(100),.Position: PositionType.Relative,.BackgroundColor: Color.Rgb(12, 20, 32),
    Container() {.Position: PositionType.Absolute,.Left: 8,.Top: 8,.Width: 90,.Height: 60,.Opacity: Step >= 2 ? 0.8 : 0.5,.BackgroundColor: Color.Rgb(52, 196, 112),
      Container{
        Position: PositionType.Absolute,
        Left: 50,
        Top: 30,
        Width: 70,
        Height: 50,
        BackgroundColor: Step >= 1 ? Color.Rgb(196, 88, 200) : Color.Rgb(236, 196, 72),
      },
    },
    Container{
      Position: PositionType.Absolute,
      Left: 10,
      Top: 120,
      Width: 130,
      Height: 30,
      BackgroundColor: Color.Rgb(228, 160, 64),
    },
    Container() {.Position: PositionType.Absolute,.Left: 40,.Top: 104,.Width: 60,.Height: 60,.BlendMode: BlendMode.Multiply,.BackgroundColor: Color.Rgb(72, 128, 224),
      Container{
        Position: PositionType.Absolute,
        Left: 10,
        Top: 10,
        Width: 30,
        Height: 30,
        BackgroundColor: Step >= 3 ? Color.Rgb(228, 64, 72) : Color.Rgb(72, 224, 128),
      },
    },
    Container{
      Position: PositionType.Absolute,
      Left: 150,
      Top: 8,
      Width: 80,
      Height: 60,
      BorderRadius: 12,
      BackgroundColor: Step >= 4 ? Color.Rgb(52, 196, 112) : Color.Rgb(232, 72, 48),
      ShaderEffect: control,
    },
    Container{
      Position: PositionType.Absolute,
      Left: 250,
      Top: 8,
      Width: 40,
      Height: 90,
      BackgroundColor: Step >= 5 ? Color.Rgb(72, 128, 224) : Color.Rgb(255, 24, 8),
    },
    Container{
      Position: PositionType.Absolute,
      Left: 270,
      Top: 20,
      Width: 110,
      Height: 70,
      BackgroundColor: Color.Transparent,
      ShaderEffect: glass,
    },
    Container{
      Position: PositionType.Absolute,
      Left: 160,
      Top: 100,
      Width: 64,
      Height: 64,
      ShaderEffect: generator,
    },
    Container{
      Position: PositionType.Absolute,
      Left: 340,
      Top: 150,
      Width: 40,
      Height: 30,
      BackgroundColor: Step >= 7 ? Color.Rgb(236, 196, 72) : Color.Rgb(196, 88, 200),
    },
  }
}

func PartialRedrawLayerCell() PartialLayerCell {
  let control = ShaderEffect(ShaderEffectProgram.Load(
      Path.Combine(AppContext.BaseDirectory, "control_effect.frag.goo-effect")), true, 20.0F)
  control.SetData(0, ShaderEffectData(BitConverter.GetBytes(1.0F)))
  control.SetParameter(0, Vector4(1.0F, 0.25F, 0.25F, 0.0F))
  let glass = ShaderEffect(ShaderEffectProgram.Load(
      Path.Combine(AppContext.BaseDirectory, "liquid_glass.frag.goo-effect")), true, 24.0F)
  glass.SetParameter(2, Vector4(0.0F, 0.0F, 0.0F, -1.0F))
  glass.SetParameter(3, Vector4(0.0F, 0.0F, 0.0F, 0.78F))
  glass.SetParameter(4, Vector4(0.0F, 0.0F, 0.0F, 1.0F))
  let generator = ShaderEffect(ShaderEffectProgram.Load(
      Path.Combine(AppContext.BaseDirectory, "generator_effect.frag.goo-effect")), false)
  generator.SetData(0, ShaderEffectData(BitConverter.GetBytes(0.0F)))
  generator.SetParameter(0, Vector4(1.0F, 0.0F, 0.0F, 0.0F))
  return PartialLayerCell(control, glass, generator)
}

func PartialRedrawRegions(width int32, height int32) []VulkanDamageRegion {
  let regions = List[VulkanDamageRegion]()
  let columns = 6
  let rows = 4
  var row int32 = 0
  while row < rows {
    var column int32 = 0
    while column < columns {
      let left = width * column / columns
      let top = height * row / rows
      regions.Add(VulkanDamageRegion{
        X: left,
        Y: top,
        Width: width * (column + 1) / columns - left,
        Height: height * (row + 1) / rows - top,
      })
      column++
    }
    row++
  }
  regions.Add(VulkanDamageRegion{ X: 1, Y: 1, Width: width - 2, Height: height - 2 })
  regions.Add(VulkanDamageRegion{ X: width / 3, Y: 0, Width: 1, Height: height })
  regions.Add(VulkanDamageRegion{ X: 0, Y: height / 2, Width: width, Height: 1 })
  regions.Add(VulkanDamageRegion{
    X: width / 4 + 3,
    Y: height / 4 + 5,
    Width: width / 2 - 7,
    Height: height / 2 - 3,
  })
  return regions.ToArray()
}

func PartialRedrawDifference(full []uint8, partial []uint8, width int32,
  allowed VulkanDamageRegion) string{
    var count int32 = 0
    var first int32 = -1
    var at int32 = 0
    while at < full.Length {
      if full[at] != partial[at] || full[at + 1] != partial[at + 1]
        || full[at + 2] != partial[at + 2] || full[at + 3] != partial[at + 3] {
          let x = at / 4 % width
          let y = at / 4 / width
          if x < allowed.X || x >= allowed.Right || y < allowed.Y || y >= allowed.Bottom {
            if first < 0 { first = at / 4 }
            count++
          }
        }
      at = at + 4
    }
    if count == 0 { return "" }
    return "pixels=" + count.ToString() + " first=" + (first % width).ToString()
      + "," + (first / width).ToString()
  }

func PartialRedrawRegionText(region VulkanDamageRegion) string -> region.X.ToString() + "," + region.Y.ToString() + "," + region.Width.ToString() + "," + region.Height.ToString()

func PartialRedrawSettledCapture(window Window, metrics WindowMetrics) []uint8 {
  var current = ClipCaptureReadback(window, metrics).Pixels
  var attempt int32 = 0
  while attempt < 8 {
    let next = ClipCaptureReadback(window, metrics).Pixels
    if PartialRedrawDifference(current, next, metrics.FramebufferWidth,
      VulkanDamageRegion{}) == "" {
        return next
      }
    current = next
    attempt++
  }
  throw InvalidOperationException("Partial redraw capture did not settle")
}

func PartialRedrawRepeat(window Window, metrics WindowMetrics, name string, step int32,
  full []uint8, region VulkanDamageRegion) int32{
    WindowReadbackTestFixture.SetPartialRepeat(window, region)
    let partial = ClipCaptureReadback(window, metrics).Pixels
    WindowReadbackTestFixture.SetPartialRepeat(window, VulkanDamageRegion{})
    let difference = PartialRedrawDifference(full, partial, metrics.FramebufferWidth,
      VulkanDamageRegion{})
    if difference == "" { return 0 }
    Console.WriteLine("partial-redraw-mismatch: scene=" + name + " step=" + step.ToString()
      + " damage=" + PartialRedrawRegionText(region) + " " + difference)
    return 1
  }

func PartialRedrawScene(name string, root Cell, steps int32, advance Action) int32 {
  let window = Window{
    Title: "Goo partial redraw proof",
    Width: 400,
    Height: 190,
    VSync: false,
    Root: root,
  }
  var failures int32 = 0
  try {
    window.Open()
    WindowReadbackTestFixture.Pump(window, 0.0)
    let metrics = WindowReadbackTestFixture.Metrics(window)
    var full = PartialRedrawSettledCapture(window, metrics)
    for region in PartialRedrawRegions(metrics.FramebufferWidth, metrics.FramebufferHeight) {
      failures = failures + PartialRedrawRepeat(window, metrics, name, 0, full,
        WindowReadbackTestFixture.GrowDamage(window, region))
    }
    var step int32 = 1
    while step <= steps {
      let applied = WindowReadbackTestFixture.SceneVersion(window)
      advance()
      WindowReadbackTestFixture.Pump(window, 0.0)
      let changed = PartialRedrawSettledCapture(window, metrics)
      var damage VulkanDamageRegion
      if !WindowReadbackTestFixture.ScenePartialDamageSince(window, applied, out damage) {
        failures++
        Console.WriteLine("partial-redraw-full: scene=" + name + " step=" + step.ToString())
      } else {
        let outside = PartialRedrawDifference(full, changed, metrics.FramebufferWidth, damage)
        if outside != "" {
          failures++
          Console.WriteLine("partial-redraw-outside-damage: scene=" + name
            + " step=" + step.ToString() + " damage=" + PartialRedrawRegionText(damage)
            + " " + outside)
        }
        failures = failures + PartialRedrawRepeat(window, metrics, name, step, changed, damage)
      }
      full = changed
      step++
    }
    WindowReadbackTestFixture.DrainWindowQueue(window, 10000)
  } finally {
    if window.IsOpen {
      window.RequestClose()
      WindowReadbackTestFixture.Pump(window, 0.0)
    }
  }
  Console.WriteLine("partial-redraw-scene: name=" + name + " failures=" + failures.ToString())
  return failures
}

func RunPartialRedrawSmoke() {
  Require(Environment.GetEnvironmentVariable("GOO_VK_DIAGNOSTICS") == "1",
    "GOO_VK_DIAGNOSTICS=1 is required")
  let fontPath = Path.Combine(AppContext.BaseDirectory, "VendSans-VariableFont_wght.ttf")
  Require(File.Exists(fontPath), "Partial redraw text font asset is missing")
  let font = FontSource("ReadbackGateFont", 400, false, File.ReadAllBytes(fontPath))
  font.Register()
  var failures int32 = 0
  try {
    let plain = PartialPlainCell{}
    failures = failures + PartialRedrawScene("plain", plain, 4, () -> {
      plain.Step++
      plain.Rebuild()
    })
    let rectClip = PartialRectClipCell{}
    failures = failures + PartialRedrawScene("rect-clip", rectClip, 5, () -> {
      rectClip.Step++
      rectClip.Rebuild()
    })
    let clipMask = PartialClipMaskCell{}
    failures = failures + PartialRedrawScene("clip-mask", clipMask, 8, () -> {
      clipMask.Step++
      if clipMask.Step == 8 { clipMask.Scroll.JumpTo(0.0, 30.0) }
      clipMask.Rebuild()
    })
    let transform = PartialTransformCell{}
    failures = failures + PartialRedrawScene("transform", transform, 7, () -> {
      transform.Step++
      transform.Rebuild()
    })
    let paint = PartialPaintCell{}
    failures = failures + PartialRedrawScene("paint", paint, 7, () -> {
      paint.Step++
      paint.Rebuild()
    })
    let layer = PartialRedrawLayerCell()
    failures = failures + PartialRedrawScene("layer", layer, 7, () -> layer.Advance())
  } finally {
    font.Dispose()
  }
  Require(failures == 0, "Partial redraw proof failed in " + failures.ToString() + " cases")
  Console.WriteLine("partial-redraw: scenes=6 pixels=identical")
}
