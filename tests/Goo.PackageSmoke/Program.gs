package GooPackageSmoke

import System
import System.IO
import System.Text
import System.Threading
import Goo
import GooPrimitiveFixture

class SmokeCell : Cell {
  internal var TextValue string
  internal var PressureSource ImageSourceProvider
  internal var PressureEnabled bool
  private var ImageProvider ImageSourceProvider?
  private var BackgroundProvider ImageSourceProvider?

  shared {
    let Root ElementHandle = ElementHandle{}
    let Viewport ElementHandle = ElementHandle{}
    let ScrollLeaf ElementHandle = ElementHandle{}
    let SharedImageSource ImageSource = ImageSource(2, 2, []uint8{
      255, 72, 72, 255,
      72, 224, 128, 255,
      72, 128, 224, 255,
      236, 196, 72, 255,
    })
  }

  init() {
    TextValue = "Goo Vulkan text"
    PressureSource = SmokeCell.SharedImageSource
    PressureEnabled = false
    ImageProvider = nil
    BackgroundProvider = nil
  }

  init(imageProvider ImageSourceProvider, backgroundProvider ImageSourceProvider) {
    TextValue = "Goo Vulkan text"
    PressureSource = SmokeCell.SharedImageSource
    PressureEnabled = false
    ImageProvider = imageProvider
    BackgroundProvider = backgroundProvider
  }

  internal func SetPressureSource(source ImageSourceProvider) {
    PressureSource = source
    PressureEnabled = true
    Rebuild()
  }

  override func Build() Blob {
    let imageSource ImageSourceProvider = if PressureEnabled {
      PressureSource
    } else if let source = ImageProvider {
      source
    } else {
      SmokeCell.SharedImageSource
    }
    let backgroundSource ImageSourceProvider = if PressureEnabled {
      SmokeCell.SharedImageSource
    } else if let source = BackgroundProvider {
      source
    } else {
      SmokeCell.SharedImageSource
    }
    return Container{
      Width: Length.Percent(100),
      Height: Length.Percent(100),
      Handle: SmokeCell.Root,
      Padding: 12,
      Gap: 8,
      Position: PositionType.Relative,
      BackgroundColor: Color.Rgb(12, 20, 32),
      Children: {
        Text{
          Content: TextValue,
          FontSize: 24,
          Color: Color.White,
        },
        Container{
          Width: 224,
          Height: 48,
          BackgroundImageSource: backgroundSource,
          BackgroundImageFit: ImageFit.Cover,
          BorderStyle: BorderStyle.Solid,
          BorderTopWidth: 2,
          BorderRightWidth: 2,
          BorderBottomWidth: 2,
          BorderLeftWidth: 2,
          BorderTopColor: Color.Rgb(236, 128, 64),
          BorderRightColor: Color.Rgb(128, 236, 96),
          BorderBottomColor: Color.Rgb(64, 160, 236),
          BorderLeftColor: Color.Rgb(212, 96, 212),
          Children: {
            Image{
              Width: 96,
              Height: 48,
              Source: imageSource,
              Fit: ImageFit.Contain,
            },
          },
        },
        Container{
          Width: 224,
          Height: 48,
          BorderRadius: 12,
          BoxShadow: BoxShadow{
            OffsetX: 3,
            OffsetY: 4,
            Blur: 6,
            Spread: 1,
            Color: Color.Rgba(0, 0, 0, 160),
          },
          BackgroundGradient: LinearGradient(90.0, []GradientStop{
            GradientStop{ Offset: 0.0, Color: Color.Rgb(24, 68, 132) },
            GradientStop{ Offset: 0.3, Color: Color.Rgb(46, 126, 196) },
            GradientStop{ Offset: 0.7, Color: Color.Rgb(88, 172, 210) },
            GradientStop{ Offset: 1.0, Color: Color.Rgb(38, 92, 152) },
          }),
        },
        Container{
          Width: 224,
          Height: 48,
          BorderRadius: 12,
          BackgroundGradient: RadialGradient(0.5, 0.5, 0.5, []GradientStop{
            GradientStop{ Offset: 0.0, Color: Color.Rgb(232, 178, 78) },
            GradientStop{ Offset: 1.0, Color: Color.Rgb(128, 54, 92) },
          }),
        },
        Container{
          Width: 224,
          Height: 20,
          BorderStyle: BorderStyle.Dashed,
          BorderTopWidth: 3,
          BorderRightWidth: 4,
          BorderBottomWidth: 2,
          BorderLeftWidth: 5,
          BorderTopColor: Color.Rgb(224, 72, 72),
          BorderRightColor: Color.Rgb(72, 224, 128),
          BorderBottomColor: Color.Rgb(72, 128, 224),
          BorderLeftColor: Color.Rgb(224, 184, 72),
        },
        Container{
          Width: 224,
          Height: 20,
          BorderStyle: BorderStyle.Dotted,
          BorderTopWidth: 2,
          BorderRightWidth: 3,
          BorderBottomWidth: 4,
          BorderLeftWidth: 3,
          BorderTopColor: Color.Rgb(236, 128, 64),
          BorderRightColor: Color.Rgb(128, 236, 96),
          BorderBottomColor: Color.Rgb(64, 160, 236),
          BorderLeftColor: Color.Rgb(212, 96, 212),
        },
        Container{
          Position: PositionType.Absolute,
          Left: 236,
          Top: 8,
          Width: 72,
          Height: 156,
          Children: {
            Container{
              Position: PositionType.Absolute,
              Width: 28,
              Height: 28,
              Transform: PanelTransform{ TranslateX: 2, TranslateY: 2 },
              Children: {
                Container{
                  Width: 12,
                  Height: 12,
                  Transform: PanelTransform{ TranslateX: 3, TranslateY: 3 },
                  BackgroundColor: Color.Rgb(46, 126, 196),
                },
              },
            },
            Container{
              Position: PositionType.Absolute,
              Top: 36,
              Width: 64,
              Height: 48,
              Overflow: Overflow.Scroll,
              Handle: SmokeCell.Viewport,
              Children: {
                Container{
                  Width: 120,
                  Height: 40,
                  Overflow: Overflow.Hidden,
                  Children: {
                    Container{
                      Width: 20,
                      Height: 20,
                      Handle: SmokeCell.ScrollLeaf,
                      BackgroundColor: Color.Rgb(28, 180, 92),
                    },
                  },
                },
              },
            },
            Container{
              Position: PositionType.Absolute,
              Top: 90,
              Width: 16,
              Height: 16,
              Visibility: Visibility.Hidden,
              BackgroundColor: Color.Rgb(210, 30, 30),
            },
            Container{
              Position: PositionType.Absolute,
              Left: 20,
              Top: 90,
              Width: 16,
              Height: 16,
              Opacity: 0.5,
              BackgroundColor: Color.Rgb(220, 180, 20),
            },
            Container{
              Position: PositionType.Absolute,
              Left: 40,
              Width: 24,
              Height: 24,
              ZIndex: -1,
              BackgroundColor: Color.Rgb(20, 60, 220),
            },
            Container{
              Position: PositionType.Absolute,
              Left: 40,
              Width: 24,
              Height: 24,
              ZIndex: 1,
              BackgroundColor: Color.Rgb(220, 40, 40),
            },
          },
        },
      }
    }
  }
}
class LayerCapacitySmokeCell : Cell {
  private let depth int32

  init(layerDepth int32) {
    depth = layerDepth
  }

  override func Build() Blob -> BuildLayerTree(depth)
}

func BuildLayerTree(depth int32) Blob {
  if depth <= 0 {
    return Container{
      Width: 48,
      Height: 48,
      BackgroundColor: Color.Rgb(72, 160, 236),
    }
  }
  return Container{
    Width: 64,
    Height: 64,
    Opacity: 0.98,
    Children: {
      BuildLayerTree(depth - 1)
    },
  }
}

class CompiledVectorSmokeCell : Cell {
  shared {
    let Root ElementHandle = ElementHandle{}
    let StaticHost ElementHandle = ElementHandle{}
    let AnimatedHost ElementHandle = ElementHandle{}
    let MorphHost ElementHandle = ElementHandle{}
  }

  private var staticAsset CompiledVectorAsset
  private var animatedAsset CompiledVectorAsset
  private var morphAsset CompiledVectorAsset

  init(staticValue CompiledVectorAsset, animatedValue CompiledVectorAsset, morphValue CompiledVectorAsset) {
    staticAsset = staticValue
    animatedAsset = animatedValue
    morphAsset = morphValue
  }

  override func Build() Blob -> Container {
    Width: Length.Percent(100),
    Height: Length.Percent(100),
    Handle: CompiledVectorSmokeCell.Root,
    Position: PositionType.Relative,
    BackgroundColor: Color.Rgb(12, 20, 32),
    Children: {
      Container{
        Key: "static-host",
        Position: PositionType.Absolute,
        Left: 12,
        Top: 12,
        Width: 280,
        Height: 220,
        Handle: CompiledVectorSmokeCell.StaticHost,
        BackgroundColor: Color.Rgb(24, 48, 76),
        Children: {
          staticAsset.Render("static")
        },
      },
      Container{
        Key: "animated-host",
        Position: PositionType.Absolute,
        Left: 308,
        Top: 12,
        Width: 280,
        Height: 220,
        Handle: CompiledVectorSmokeCell.AnimatedHost,
        BackgroundColor: Color.Rgb(38, 48, 76),
        Children: {
          animatedAsset.Render("animated")
        },
      },
      Container{
        Key: "morph-host",
        Position: PositionType.Absolute,
        Left: 604,
        Top: 12,
        Width: 280,
        Height: 220,
        Handle: CompiledVectorSmokeCell.MorphHost,
        BackgroundColor: Color.Rgb(48, 38, 76),
        Children: {
          morphAsset.Render("morph")
        },
      },
    },
  }
}

class PathSmokeCell : Cell {
  private var Phase int32

  shared {
    let Root ElementHandle = ElementHandle{}
    let NonZeroShape ElementHandle = ElementHandle{}
    let EvenOddShape ElementHandle = ElementHandle{}
    let RoundedFillShape ElementHandle = ElementHandle{}
    let RoundedStrokeShape ElementHandle = ElementHandle{}
    let NonZeroPath VectorPath = PathBuilder(0.0, 0.0, 100.0, 100.0).MoveTo(10.0, 10.0).LineTo(90.0, 10.0).QuadraticTo(96.0, 24.0, 90.0, 36.0).CubicTo(84.0, 52.0, 84.0, 72.0, 90.0, 90.0).ArcTo(40.0, 40.0, 0.0, false, true, 10.0, 90.0).LineTo(10.0, 10.0).Close().Build()
    let EvenOddPath VectorPath = PathBuilder(0.0, 0.0, 100.0, 100.0).MoveTo(8.0, 8.0).LineTo(92.0, 8.0).LineTo(92.0, 92.0).LineTo(8.0, 92.0).Close().MoveTo(30.0, 30.0).LineTo(70.0, 30.0).LineTo(70.0, 70.0).LineTo(30.0, 70.0).Close().Build()
    let RoundedPath VectorPath = PathBuilder(0.0, 0.0, 100.0, 100.0).MoveTo(8.0, 8.0).LineTo(92.0, 8.0).LineTo(92.0, 92.0).LineTo(8.0, 92.0).Close().Build()
    let RadialPaint RadialGradient = RadialGradient(0.5, 0.5, 0.5, []GradientStop{
      GradientStop{ Offset: 0.0, Color: Color.Rgb(244, 220, 108) },
      GradientStop{ Offset: 1.0, Color: Color.Rgb(88, 96, 196) },
    })
    internal func ChurnPath(phase int32) VectorPath {
      let builder = PathBuilder(0.0, 0.0, 1200.0, 4000.0)
      builder.MoveTo(8.0, 8.0)
      var index int32 = 0
      while index < 400 {
        let column = index % 8
        let row = index / 8
        let x = 8.0 + float64(column) * 10.0
        let y = 8.0 + float64(row) * 16.0
        let offset = float64(phase) * 0.25
        builder.QuadraticTo(x + 4.0 + offset, y + 4.0, x, y + 8.0)
        index = index + 1
      }
      builder.LineTo(8.0, 8.0)
      builder.Close()
      return builder.Build()
    }
  }

  init() {
    Phase = 0
  }

  internal func SetPhase(value int32) {
    Phase = value
    Rebuild()
  }

  override func Build() Blob -> Container {
    Width: Length.Percent(100),
    Height: Length.Percent(100),
    Handle: PathSmokeCell.Root,
    Padding: 12,
    Gap: 12,
    FlexDirection: FlexDirection.Row,
    BackgroundColor: Color.Rgb(12, 20, 32),
    Children: {
      Shape{
        Width: 220,
        Height: 170,
        Handle: PathSmokeCell.NonZeroShape,
        PaddingLeft: 14,
        PaddingTop: 10,
        PaddingRight: 18,
        PaddingBottom: 6,
        Path: if Phase == 0 {
          PathSmokeCell.NonZeroPath
        } else {
          PathSmokeCell.ChurnPath(Phase)
        },
        Fit: ShapeFit.Contain,
        FillRule: FillRule.NonZero,
        BackgroundColor: Color.Rgb(40, 132, 224),
      },
      Shape{
        Width: 220,
        Height: 170,
        Handle: PathSmokeCell.EvenOddShape,
        Path: PathSmokeCell.EvenOddPath,
        Fit: ShapeFit.Fill,
        FillRule: FillRule.EvenOdd,
        BackgroundImageSource: SmokeCell.SharedImageSource,
      },
      Shape{
        Width: 220,
        Height: 170,
        Handle: PathSmokeCell.RoundedFillShape,
        Path: PathSmokeCell.RoundedPath,
        Fit: ShapeFit.Contain,
        FillRule: FillRule.NonZero,
        CornerRadius: 12,
        BackgroundGradient: PathSmokeCell.RadialPaint,
      },
      Shape{
        Width: 220,
        Height: 170,
        Handle: PathSmokeCell.RoundedStrokeShape,
        Path: PathSmokeCell.RoundedPath,
        Fit: ShapeFit.Contain,
        FillRule: FillRule.NonZero,
        CornerRadius: 10,
        BackgroundColor: Color.Rgba(0, 0, 0, 0),
        BorderWidth: 6,
        BorderColor: Color.White,
        StrokeCap: StrokeCap.Round,
        StrokeJoin: StrokeJoin.Round,
        Dashes: DashPattern([]float64{ 14.0, 7.0 }, 3.0),
      },
    },
  }
}

class StaticPathSmokeCell : Cell {
  shared {
    let Root ElementHandle = ElementHandle{}
    let ShapeHandle ElementHandle = ElementHandle{}
    let Path VectorPath = PathBuilder(0.0, 0.0, 100.0, 100.0).MoveTo(10.0, 12.0).LineTo(90.0, 12.0).QuadraticTo(96.0, 48.0, 82.0, 86.0).CubicTo(64.0, 72.0, 36.0, 72.0, 18.0, 86.0).ArcTo(40.0, 40.0, 0.0, false, true, 10.0, 12.0).Close().Build()
  }

  override func Build() Blob -> Container {
    Width: Length.Percent(100),
    Height: Length.Percent(100),
    Handle: StaticPathSmokeCell.Root,
    ClipPath: StaticPathSmokeCell.Path,
    ClipPathFit: ShapeFit.Fill,
    Padding: 12,
    BackgroundColor: Color.Rgb(12, 20, 32),
    Children: {
      Shape{
        Width: 260,
        Height: 190,
        Handle: StaticPathSmokeCell.ShapeHandle,
        Path: StaticPathSmokeCell.Path,
        Fit: ShapeFit.Contain,
        FillRule: FillRule.NonZero,
        BackgroundColor: Color.Rgb(76, 188, 224),
      },
    },
  }
}

class RegisteredFontCorpusSmokeCell : Cell {
  shared {
    let Root ElementHandle = ElementHandle{}
    let Cff ElementHandle = ElementHandle{}
    let StyleRegular ElementHandle = ElementHandle{}
    let StyleBold ElementHandle = ElementHandle{}
    let StyleItalic ElementHandle = ElementHandle{}
    let StyleBoldItalic ElementHandle = ElementHandle{}
    let VariableRegular ElementHandle = ElementHandle{}
    let VariableBold ElementHandle = ElementHandle{}
    let Fallback ElementHandle = ElementHandle{}
  }

  override func Build() Blob -> Container {
    Width: Length.Percent(100),
    Height: Length.Percent(100),
    Padding: 8,
    Gap: 3,
    AlignItems: AlignItems.FlexStart,
    Handle: RegisteredFontCorpusSmokeCell.Root,
    BackgroundColor: Color.Rgb(12, 20, 32),
    Children: {
      Text{
        Content: "A a registered fallback",
        FontFamily: "GooSmokePrimary,GooSmokeFallback",
        FontSize: 18,
        Color: Color.White,
      },
      Text{
        Content: "!",
        FontFamily: "GooSmokeCff",
        FontSize: 18,
        Handle: RegisteredFontCorpusSmokeCell.Cff,
        Color: Color.White,
      },
      Text{
        Content: "Aa",
        FontFamily: "GooSmokeCffSecond",
        FontSize: 18,
        Color: Color.White,
      },
      Text{
        Content: "A",
        FontFamily: "GooSmokeStyle",
        FontSize: 18,
        FontWeight: 400,
        Handle: RegisteredFontCorpusSmokeCell.StyleRegular,
        Color: Color.White,
      },
      Text{
        Content: "A",
        FontFamily: "GooSmokeStyle",
        FontSize: 18,
        FontWeight: 700,
        Handle: RegisteredFontCorpusSmokeCell.StyleBold,
        Color: Color.White,
      },
      Text{
        Content: "A",
        FontFamily: "GooSmokeStyle",
        FontSize: 18,
        FontStyle: FontStyle.Italic,
        Handle: RegisteredFontCorpusSmokeCell.StyleItalic,
        Color: Color.White,
      },
      Text{
        Content: "A",
        FontFamily: "GooSmokeStyle",
        FontSize: 18,
        FontWeight: 700,
        FontStyle: FontStyle.Italic,
        Handle: RegisteredFontCorpusSmokeCell.StyleBoldItalic,
        Color: Color.White,
      },
      Text{
        Content: ".",
        FontFamily: "GooSmokeTtc",
        FontSize: 18,
        FontWeight: 400,
        Color: Color.White,
      },
      Text{
        Content: ".",
        FontFamily: "GooSmokeTtc",
        FontSize: 18,
        FontWeight: 700,
        Color: Color.White,
      },
      Text{
        Content: "A",
        FontFamily: "GooSmokeOtc",
        FontSize: 18,
        FontWeight: 400,
        Color: Color.White,
      },
      Text{
        Content: "A",
        FontFamily: "GooSmokeOtc",
        FontSize: 18,
        FontWeight: 700,
        Color: Color.White,
      },
      Text{
        Content: "A",
        FontFamily: "GooSmokeVariable",
        FontSize: 18,
        FontWeight: 400,
        Handle: RegisteredFontCorpusSmokeCell.VariableRegular,
        Color: Color.White,
      },
      Text{
        Content: "A",
        FontFamily: "GooSmokeVariable",
        FontSize: 18,
        FontWeight: 700,
        Handle: RegisteredFontCorpusSmokeCell.VariableBold,
        Color: Color.White,
      },
      Text{
        Content: "!",
        FontFamily: "GooSmokeTtc,GooSmokeCff",
        FontSize: 18,
        Handle: RegisteredFontCorpusSmokeCell.Fallback,
        Color: Color.White,
      },
    },
  }
}

class TextControlsSmokeCell : Cell {
  shared {
    let Root ElementHandle = ElementHandle{}
    let Entry ElementHandle = ElementHandle{}
    let Editor ElementHandle = ElementHandle{}
    let Rich ElementHandle = ElementHandle{}
  }

  private let document TextDocument
  private let controller TextEditorController
  private let presentation TextPresentationLayer
  private let richContent string

  init(nativeDocument TextDocument, nativeController TextEditorController) {
    document = nativeDocument
    controller = nativeController
    presentation = TextPresentationLayer(document)
    richContent = "Rich \u3041\u4c2e שלום cafe\u0301 ffi office wraps across the passive text box"
    let source = document.GetText()
    let replacementStart = source.IndexOf("projection")
    let hiddenStart = source.IndexOf("secret")
    if replacementStart < 0 || hiddenStart < 0 {
      throw InvalidOperationException("Text controls smoke corpus is missing its projections")
    }
    presentation.SetStyle("line-style", TextRange{ Start: 0, Length: 3 }, Style{
      Color: Color.Rgb(252, 190, 72),
      FontWeight: 700,
      TextDecoration: TextDecoration.Underline,
    })
    presentation.SetStyle("cjk-style", TextRange{ Start: 4, Length: 2 }, Style{
      FontFamily: "GooSmokeCjk",
      Color: Color.Rgb(108, 224, 196),
      FontWeight: 700,
      TextStrokeWidth: 2,
      TextStrokeColor: Color.Rgb(56, 112, 176),
      TextShadow: TextShadow{
        OffsetX: 1,
        OffsetY: 1,
        Blur: 0,
        Color: Color.Rgba(0, 0, 0, 160),
      },
    })
    presentation.SetReplacement("line-replacement",
      TextRange{ Start: replacementStart, Length: "projection".Length }, "rendered")
    presentation.SetHiddenRange("line-hidden",
      TextRange{ Start: hiddenStart, Length: "secret".Length })
  }

  internal func DisposePresentation() {
    presentation.Dispose()
  }

  override func Build() Blob -> Container {
    Width: Length.Percent(100),
    Height: Length.Percent(100),
    Handle: TextControlsSmokeCell.Root,
    Padding: 12,
    Gap: 10,
    BackgroundColor: Color.Rgb(12, 20, 32),
    Children: {
      TextEntry{
        Width: 296,
        Height: 32,
        Handle: TextControlsSmokeCell.Entry,
        Value: "focused entry",
        BackgroundColor: Color.Rgb(28, 42, 62),
        Color: Color.White,
        FontSize: 16,
        TextDecoration: TextDecoration.Underline,
      },
      TextEditor(controller, []TextPresentationLayer{ presentation }) {
        Width = 296,
        Height = 120,
        Handle = TextControlsSmokeCell.Editor,
        BackgroundColor = Color.Rgb(20, 32, 50),
        Color = Color.Rgb(224, 232, 244),
        FontSize = 16,
        TextDecoration = TextDecoration.LineThrough,
      },
      Text{
        Content: richContent,
        Width: 296,
        Height: 72,
        Handle: TextControlsSmokeCell.Rich,
        Color: Color.Rgb(224, 232, 244),
        FontSize: 16,
        TextWrap: TextWrap.Wrap,
        TextStrokeWidth: 2,
        TextStrokeColor: Color.Rgb(56, 112, 176),
        TextShadow: TextShadow{
          OffsetX: 1,
          OffsetY: 1,
          Blur: 0,
          Color: Color.Rgba(0, 0, 0, 160),
        },
        TextDecoration: TextDecoration.LineThrough,
        StyleRanges: []TextStyleRange{
          TextStyleRange{
            Range: TextRange{ Start: 0, Length: 4 },
            Style: Style{
              Color: Color.Rgb(252, 190, 72),
              FontSize: 22,
              FontWeight: 700,
              TextDecoration: TextDecoration.Underline,
            },
          },
          TextStyleRange{
            Range: TextRange{ Start: 5, Length: 2 },
            Style: Style{
              FontFamily: "GooSmokeCjk",
              Color: Color.Rgb(108, 224, 196),
              FontWeight: 700,
            },
          },
        },
      },
    },
  }
}

class TextReopenSmokeCell : Cell {
  shared {
    let Root ElementHandle = ElementHandle{}
  }

  override func Build() Blob -> Container {
    Width: Length.Percent(100),
    Height: Length.Percent(100),
    Padding: 12,
    BackgroundColor: Color.Rgb(12, 20, 32),
    Children: {
      Text{
        Content: "Goo reopened text",
        Handle: TextReopenSmokeCell.Root,
        FontSize: 18,
        Color: Color.White,
      },
    },
  }
}

class TextAtlasSmokeCell : Cell {
  shared {
    let Root ElementHandle = ElementHandle{}
  }

  private let content string
  private var phase int32

  init(nativeContent string) {
    content = nativeContent
    phase = 0
  }

  internal func SetPhase(value int32) {
    phase = value
    Rebuild()
  }

  override func Build() Blob -> Container {
    Width: Length.Percent(100),
    Height: Length.Percent(100),
    Handle: TextAtlasSmokeCell.Root,
    Padding: 8,
    BackgroundColor: Color.Rgb(12, 20, 32),
    Children: {
      Text{
        Content: content,
        FontSize: 18,
        Color: Color.White,
        StyleRanges: AtlasStyleRanges(phase),
      },
    },
  }
}

func AtlasFontFamily(group int32, index int32) string -> "GooAtlas" + group.ToString() + "_" + index.ToString()

func AtlasStyleRanges(group int32) []TextStyleRange {
  let length int32 = 4
  return []TextStyleRange{
    TextStyleRange{ Range: TextRange{ Start: 0, Length: length }, Style: Style{ FontFamily: AtlasFontFamily(group, 0) } },
    TextStyleRange{ Range: TextRange{ Start: length, Length: length }, Style: Style{ FontFamily: AtlasFontFamily(group, 1) } },
    TextStyleRange{ Range: TextRange{ Start: length * 2, Length: length }, Style: Style{ FontFamily: AtlasFontFamily(group, 2) } },
    TextStyleRange{ Range: TextRange{ Start: length * 3, Length: length }, Style: Style{ FontFamily: AtlasFontFamily(group, 3) } },
  }
}

func BuildAtlasCorpus() string {
  let builder = StringBuilder()
  var codepoint int32 = 65
  while codepoint < 65 + 16 {
    builder.Append(Char.ConvertFromUtf32(codepoint))
    codepoint = codepoint + 1
  }
  return builder.ToString()
}

func DiagnosticCounterValue(diagnostics string, name string) uint64 {
  let marker = "\"" + name + "\":"
  let start = diagnostics.IndexOf(marker)
  if start < 0 { return 0uL }
  var index = start + marker.Length
  var value uint64
  var digits int32
  while index < diagnostics.Length {
    let current = diagnostics[index]
    if current < '0' || current > '9' { break }
    let digit = uint64(int32(current) - int32('0'))
    if value > (uint64.MaxValue - digit) / 10uL {
      throw OverflowException("diagnostic counter overflow")
    }
    value = value * 10uL + digit
    digits = digits + 1
    index = index + 1
  }
  return digits == 0 ? 0uL : value
}
func CloseWindow(window Window) bool {
  if !window.IsOpen {
    return true
  }
  window.RequestClose()
  var pumps int32 = 0
  while window.IsOpen && pumps < 4096 {
    window.Pump(0.0)
    if window.IsOpen {
      Thread.Sleep(1)
    }
    pumps = pumps + 1
  }
  return !window.IsOpen
}

func RunCompiledVectorSmoke() {
  if Environment.GetEnvironmentVariable("GOO_VK_DIAGNOSTICS") != "1" {
    throw InvalidOperationException("GOO_VK_DIAGNOSTICS=1 is required")
  }
  let capturedError = StringWriter()
  let originalError = Console.Error
  Console.SetError(capturedError)
  try {
    let staticAsset = CompiledVectorAsset.Load(Convert.FromBase64String("R0NWMQEArADcBQAACwAAAAAAAAAAAAAAAAAAAAAAAAAAAIBDAAAAQ6wAAACQAQAABQAAADwCAABAAAAABAAAAHwCAAAoAgAAFwAAAKQEAACgAAAABAAAAEQFAAAwAAAABAAAAHQFAABQAAAAAgAAAMQFAAAIAAAAAgAAAMwFAAAQAAAAAQAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAP////8BAAAAAQAAAAAAAAAAAAAAAAAAAP///////////////////////////////wAAgD8AAAAAAAAAAAAAgD8AAAAAAAAAAAAAgD8AAAAAAAAAAAIAAAADAAAAAAAAAAAAAAAAAAAA////////////////////////////////AACAPwAAAAAAAAAAAACAPwAAgEAAAIBAZmZmPwAAAAABAAAA/////wAAAAAAAAAAAAAAAAEAAAAAAAAAAAAAAAAAAAD///////////////8AAIA/AAAAAAAAAAAAAIA/AAAAAAAAAAAAAIA/AAAAAAEAAAD/////AAAAAAEAAAACAAAAAQAAAAIAAAD//////////////////////////wAAgD8AAAAAAAAAAAAAgD8AAAAAAAAAAAAAgD8AAAAAAQAAAP////8AAAAAAAAAAAMAAAABAAAA/////wEAAAD/////////////////////AACAPwAAAAAAAAAAAACAPwAAAAAAAAAAAACAPwAAAAAAAAAACAAAAAEAAAAAAAAACAAAAAgAAAABAAAAAAAAABAAAAAEAAAAAQAAAAAAAAAUAAAAAwAAAAEAAAAAAAAAAABAQQAAAAAAAGBCAAAAAAAAyEIAAAAAAADIQgAAAAAAAOBCAAAAAAAA4EIAAEBBAADgQgAAQEEAAOBCAABAQgAA4EIAAKhCAADgQgAAqEIAAOBCAADAQgAAyEIAAMBCAADIQgAAwEIAAGBCAADAQgAAQEEAAMBCAABAQQAAwEIAAAAAAADAQgAAAAAAAKhCAAAAAAAAqEIAAAAAAABAQgAAAAAAAEBBAAAAAAAAQEEAAAAAAAAAAAAAQEEAAAAAAACgQQAAAEEAAIBCAAAAQQAA2EIAAABBAADYQgAAAEEAAPBCAAAAQQAA8EIAAKBBAADwQgAAoEEAAPBCAABgQgAA8EIAALhCAADwQgAAuEIAAPBCAADQQgAA2EIAANBCAADYQgAA0EIAAIBCAADQQgAAoEEAANBCAACgQQAA0EIAAABBAADQQgAAAEEAALhCAAAAQQAAuEIAAABBAABgQgAAAEEAAKBBAAAAQQAAoEEAAABBAAAAQQAAoEEAAABBAAAMQwAAgEEAAEBDAABQwQAAaEMAABBCAABoQwAAEEIAAH1DAACqQgAAOEMAANBCAAA4QwAA0EIAACBDAADYQgAAEEMAALBCAAAQQwAAsEIAAA5DAABQQgAADEMAAIBBAAAUQwAAmEIAACBDAABwQgAALEMAADBCAAAsQwAAMEIAADhDAABwQgAAREMAAJhCAABEQwAAmEIAACxDAACYQgAAFEMAAJhCAQAAAAAAAAAAAIA/AAAAAAAAAAAAAOBCAAAAAP////8AAAAAAgAAAAAAAAD/////AACAPwAAAAAAAAAAAAAAAAAAAAD/////AgAAAAAAAAACAAAAAAAAAAAAgD8zczxD7MRbQmbmbENVVdFC/////wIAAAACAAAAAAAAAP9s3PQAAIA/AAAAAAAAAAAAAAAAAAAAAP////8EAAAAAAAAAAAAAAD/4GgoAAAAAAAAgD//gFjgAAAAAAAAAAD/bNz0AAAAAAAAgD//XDaAAAAAAAAAQEAAAIBAAAAAAAAAAAAAAAAAAQAAAP////8AAAAAAgAAAAAAAAAAAIBAAACAQAEAAAABAAAAAAAAAAMAAAD/////AgAAAAAAAAAAAAAAAADAQAAAQEABAAAAAQAAAAAAAAD/////"))
    let animatedAsset = CompiledVectorAsset.Load(Convert.FromBase64String("R0NWMQEArABsCAAACwAAAAAAAAAAAAAAAAAAAAAAAAAAAHBDAADwQqwAAABAAQAABAAAAOwBAAAgAAAAAgAAAAwCAAAIAQAACwAAABQDAACgAAAABAAAAAAAAAAAAAAAAAAAALQDAABQAAAAAgAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAQEAACoAAAABwAAAKwEAADAAwAAFAAAAAAAAAAAAAAAAAAAAP////8BAAAAAgAAAAAAAAAAAAAAAAAAAP///////////////////////////////wAAgD8AAAAAAAAAAAAAgD8AAAAAAAAAAAAAgD8AAAAAAAAAAAMAAAABAAAAAAAAAAAAAAAAAAAA////////////////AAAAAP//////////AACAPwAAAAAAAAAAAACAPwAAIEEAAABBAACAPwAAAAAAAAAA/////wAAAAAAAAAAAAAAAAEAAAAAAAAAAAAAAP////8BAAAA//////////8AAIA/AAAAAAAAAAAAAIA/AAAAAAAAAAAAAIA/AAAAAAEAAAD/////AAAAAAAAAAABAAAAAQAAAAIAAAABAAAA//////////8EAAAA/////wAAgD8AAAAAAAAAAAAAgD8AAAAAAAAAAAAAgD8AAAAAAAAAAAMAAAABAAAAAAAAAAMAAAAIAAAAAQAAAAAAAAAAAAJDAADAQQAAKkMAAMBBAABSQwAAwEEAAFJDAADAQQAAPkMAAHBCAAAqQwAAwEIAACpDAADAQgAAFkMAAHBCAAACQwAAwEEAAABBAAAAAAAAMEIAAAAAAACgQgAAAAAAAKBCAAAAAAAAsEIAAAAAAACwQgAAAEEAALBCAAAAQQAAsEIAANBBAACwQgAAMEIAALBCAAAwQgAAsEIAAFBCAACgQgAAUEIAAKBCAABQQgAAMEIAAFBCAAAAQQAAUEIAAABBAABQQgAAAAAAAFBCAAAAAAAAMEIAAAAAAAAwQgAAAAAAANBBAAAAAAAAAEEAAAAAAAAAQQAAAAAAAAAAAAAAQQAAAAAAAAAA/4e7XAAAgD8AAAAAAAAAAAAAAAAAAAAA/////wAAAAAAAAAAAAAAAP////8AAIA/AAAAAAAAAAAAAAAAAAAAAAIAAAAAAAAAAAAAAAAAAAD/4GgoAACAPwAAAAAAAAAAAAAAAAAAAAAFAAAAAAAAAAAAAAAAAAAA/2zc9AAAgD8AAAAAAAAAAAAAAAAAAAAA/////wAAAAAAAAAAAABAQAAAgEAAAAAAAAAAAAAAAAABAAAAAwAAAAAAAAAAAAAAAAAAAAAAAEAAAIBAAAAAAAAAAAAAAAAAAwAAAAYAAAAAAAAAAAAAAAAAAAAAAAIAAAAAAAQAAAAAAIBAAAAAAAAAAAAAAAIABAAAAAIAAAAAAMA/AQAAAAAAAAACAAEABgAAAAQAAAAAAABAAAAAAAAAAAADAAMACgAAAAIAAAAAAIA/AAAAAAAAAAABAAAADAAAAAQAAAAAAIA/AAAAAAAAAAACAAEAEAAAAAIAAAAAAIA/AQAAAAAAAAADAAMAEgAAAAIAAAAAAIA/AAAAAAAAAAAAAAAAAACAPwAAAAAAAAAAAACAPwAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAABAAACAPwAAAAAAAAAAAACAPwAAoEEAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAABAAACAPwAAAAAAAAAAAACAPwAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAIBAAACAPwAAAAAAAAAAAACAPwAAoEEAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAACAPwAAAAAAAAAAAACAPwAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAMA/NYJ9P2WDDj5lgw6+NYJ9P0xDDkEYOrnBAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAACAPwAAgD8AAIA/AACAPwAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAIA/gYAAP9nYWD65uLg+AACAPwAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAIA/AACAPwAAgD8AAIA/AACAPwAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAABAgYAAP9nYWD65uLg+AACAPwAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAABAQAAAgEAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAIA/AABAQAAAgEAAAIA/AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAZmbmPgAAAAAAAAAAAAAAAAAAAAAAAAAAAgAAAAAAgD7NzMw9AACAPgAAgD8AAAA/AACAPwAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA/ZmbmPgAAAAAAAAAAAAAAAAAAAAAAAAAAAgAAAAAAgD7NzMw9AACAPgAAgD8AAIA/AACAPwAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAoaAgPtHQ0D7h4GA/AACAPwAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAIA/4eBgP7GwsD6BgAA/AACAPwAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAQAAAgEAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAIA/AADAQAAAgEAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA="))
    let morphAsset = CompiledVectorAsset.Load(Convert.FromBase64String("R0NWMQEArAAUBAAACwAAAAAAAAAAAAAAAAAAAAAAAAAAAPBCAADIQqwAAACgAAAAAgAAAEwBAAAQAAAAAQAAAFwBAABIAAAAAwAAAKQBAABQAAAAAgAAAAAAAAAAAAAAAAAAAPQBAAAoAAAAAQAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAABwCAAAYAAAAAQAAADQCAADAAAAABAAAAPQCAAAgAQAADAAAAP////8BAAAAAQAAAAAAAAAAAAAAAAAAAP///////////////////////////////wAAgD8AAAAAAAAAAAAAgD8AAAAAAAAAAAAAgD8AAAAAAAAAAP////8AAAAAAAAAAAAAAAABAAAAAAAAAAAAAAD///////////////8AAAAAAACAPwAAAAAAAAAAAACAPwAAAAAAAAAAAACAPwAAAAAAAAAAAwAAAAEAAAAAAAAAAACQQQAAkEEAAHBCAACQQQAAzEIAAJBBAADMQgAAkEEAAKJCAABIQgAAcEIAAKRCAABwQgAApEIAABxCAABIQgAAkEEAAJBBAAAAAP+Hu1wAAIA/AAAAAAAAAAAAAAAAAAAAAP////8AAAAAAAAAAAAAAAD/////AACAPwAAAAAAAAAAAAAAAAAAAAD/////AAAAAAAAAAAAAEBAAACAQAAAAAAAAAAAAAAAAAEAAAD/////AAAAAAAAAAAAAAAABAAEAAAAAAAEAAAAAAAAQAAAAAAAAAAAAAAAAAAAAAADAAAAAAAAAAAAAAAAAAAAAAAAAAIAAAAAAIA+zczMPQAAgD4AAIA/AACAPwMAAAADAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAACAPwYAAAADAAAAAAAAAAAAAAAAAAAAAAAAAAIAAAAAAIA+zczMPQAAgD4AAIA/AAAAQAkAAAADAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAACQQQAAkEEAAHBCAACQQQAAzEIAAJBBAADMQgAAkEEAAKJCAABIQgAAcEIAAKRCAABwQgAApEIAABxCAABIQgAAkEEAAJBBAADAQQAA4EEAAHBCAADAQQAAwEIAAKBBAADAQgAAoEEAAJxCAAA8QgAAcEIAAJRCAABwQgAAlEIAAChCAABMQgAAwEEAAOBBAACQQQAAkEEAAHBCAACQQQAAzEIAAJBBAADMQgAAkEEAAKJCAABIQgAAcEIAAKRCAABwQgAApEIAABxCAABIQgAAkEEAAJBBAADAQQAA4EEAAHBCAADAQQAAwEIAAKBBAADAQgAAoEEAAJxCAAA8QgAAcEIAAJRCAABwQgAAlEIAAChCAABMQgAAwEEAAOBB"))
    if staticAsset.NodeCount == 0 || staticAsset.CurveCount == 0 || staticAsset.TrackCount != 0
      || staticAsset.MorphCurveCount != 0 {
        throw InvalidOperationException("Path static compiled vector asset failed the public load contract")
      }
    if animatedAsset.NodeCount == 0 || animatedAsset.TrackCount == 0
      || animatedAsset.KeyframeCount == 0 || animatedAsset.MorphCurveCount != 0 {
        throw InvalidOperationException("Path retained animation asset failed the public load contract")
      }
    if morphAsset.NodeCount == 0 || morphAsset.TrackCount == 0
      || morphAsset.KeyframeCount == 0 || morphAsset.MorphCurveCount == 0 {
        throw InvalidOperationException("Path morph animation asset failed the public load contract")
      }
    let morphPath = morphAsset.PathForNode(0)
    if morphPath.ViewBoxWidth <= 0.0 || morphPath.ViewBoxHeight <= 0.0 {
      throw InvalidOperationException("Path morph animation path failed the public geometry contract")
    }

    let root = CompiledVectorSmokeCell(staticAsset, animatedAsset, morphAsset)
    let window = Window{
      Title: "Goo Path compiled vector",
      Width: 900,
      Height: 260,
      VSync: false,
      Root: root,
    }
    try {
      window.Open()
      window.Pump(0.0)
      var pumps int32 = 0
      while pumps < 64 {
        window.Pump(0.016)
        Thread.Yield()
        pumps = pumps + 1
      }
      if !window.IsOpen
        || !CompiledVectorSmokeCell.Root.IsMounted
        || !CompiledVectorSmokeCell.StaticHost.IsMounted
        || !CompiledVectorSmokeCell.AnimatedHost.IsMounted
        || !CompiledVectorSmokeCell.MorphHost.IsMounted
        || CompiledVectorSmokeCell.Root.BorderBox.Width <= 0.0
        || CompiledVectorSmokeCell.Root.BorderBox.Height <= 0.0
        || CompiledVectorSmokeCell.StaticHost.BorderBox.Width <= 0.0
        || CompiledVectorSmokeCell.StaticHost.BorderBox.Height <= 0.0
        || CompiledVectorSmokeCell.AnimatedHost.BorderBox.Width <= 0.0
        || CompiledVectorSmokeCell.AnimatedHost.BorderBox.Height <= 0.0
        || CompiledVectorSmokeCell.MorphHost.BorderBox.Width <= 0.0
        || CompiledVectorSmokeCell.MorphHost.BorderBox.Height <= 0.0 {
          throw InvalidOperationException("Path compiled vector assets did not mount with positive geometry")
        }
      if !CloseWindow(window) {
        throw InvalidOperationException("Path compiled vector smoke window did not close")
      }
      let diagnostics = capturedError.ToString()
      let planCompileCount = DiagnosticCounterValue(diagnostics, "planCompileCount")
      let recordCount = DiagnosticCounterValue(diagnostics, "recordCount")
      let drawCount = DiagnosticCounterValue(diagnostics, "drawCount")
      let pathResident = DiagnosticCounterValue(diagnostics, "pathAtlasResidentWords")
      let pathCount = DiagnosticCounterValue(diagnostics, "pathAtlasPathCount")
      let pathActiveReferences = DiagnosticCounterValue(diagnostics, "pathAtlasActiveReferenceCount")
      let pathLiveObjects = DiagnosticCounterValue(diagnostics, "pathAtlasLiveObjectCount")
      let pathRetiredWords = DiagnosticCounterValue(diagnostics, "pathAtlasRetiredWords")
      let pathReuseCount = DiagnosticCounterValue(diagnostics, "pathAtlasReuseCount")
      let imageLiveObjects = DiagnosticCounterValue(diagnostics, "imageLiveObjectCount")
      let textLiveObjects = DiagnosticCounterValue(diagnostics, "textAtlasLiveObjectCount")
      let vulkanObjects = DiagnosticCounterValue(diagnostics, "vulkanObjectCount")
      let validationErrors = DiagnosticCounterValue(diagnostics, "validationErrorCount")
      let resultFailures = DiagnosticCounterValue(diagnostics, "resultFailureCount")
      if diagnostics.Contains("\"kind\":\"fatal\"")
        || planCompileCount <= 1uL || recordCount <= 1uL || drawCount == 0uL
        || pathReuseCount == 0uL
        || pathResident != 0uL || pathCount != 0uL || pathActiveReferences != 0uL
        || pathLiveObjects != 0uL || imageLiveObjects != 0uL || textLiveObjects != 0uL
        || vulkanObjects != 0uL || validationErrors != 0uL || resultFailures != 0uL {
          Console.SetError(originalError)
          originalError.Write(diagnostics)
          throw InvalidOperationException("Path compiled vector smoke diagnostics failed: plan="
            +planCompileCount.ToString() + " record=" + recordCount.ToString()
            +" draw=" + drawCount.ToString() + " pathRetired=" + pathRetiredWords.ToString()
            +" pathReuse=" + pathReuseCount.ToString()
            +" pathLive=" + pathLiveObjects.ToString() + " imageLive=" + imageLiveObjects.ToString()
            +" textLive=" + textLiveObjects.ToString() + " vulkanObjects=" + vulkanObjects.ToString()
            +" validation=" + validationErrors.ToString() + " resultFailures=" + resultFailures.ToString())
        }
      Console.SetError(originalError)
      Console.WriteLine(
        "path-compiled-vector: static="
        +staticAsset.ByteCount.ToString()
        +" animatedTracks=" + animatedAsset.TrackCount.ToString()
        +" morphCurves=" + morphAsset.MorphCurveCount.ToString()
        +" plan=" + planCompileCount.ToString()
        +" record=" + recordCount.ToString()
        +" draw=" + drawCount.ToString()
        +" pathRetired=" + pathRetiredWords.ToString()
        +" pathReuse=" + pathReuseCount.ToString()
        +" mounted=1")
    } finally {
      if window.IsOpen {
        CloseWindow(window)
      }
    }
  } finally {
    Console.SetError(originalError)
  }
}

func RunPathSmoke() {
  if Environment.GetEnvironmentVariable("GOO_VK_DIAGNOSTICS") != "1" {
    throw InvalidOperationException("GOO_VK_DIAGNOSTICS=1 is required")
  }
  let churnRoot = PathSmokeCell{}
  let staticRoot = StaticPathSmokeCell{}
  let capturedError = StringWriter()
  let originalError = Console.Error
  var churnWindow Window? = nil
  var staticWindow Window? = nil
  Console.SetError(capturedError)
  try {
    let churnOpened = Window{
      Title: "Goo Path path churn",
      Width: 520,
      Height: 220,
      VSync: false,
      Root: churnRoot,
    }
    let staticOpened = Window{
      Title: "Goo Path static path",
      Width: 320,
      Height: 240,
      VSync: false,
      Root: staticRoot,
    }
    churnWindow = churnOpened
    staticWindow = staticOpened
    churnOpened.Open()
    staticOpened.Open()
    churnOpened.Pump(0.0)
    staticOpened.Pump(0.0)
    var pumps int32
    while pumps < 12 {
      churnOpened.Pump(0.016)
      staticOpened.Pump(0.016)
      pumps = pumps + 1
    }
    if !churnOpened.IsOpen || !staticOpened.IsOpen
      || !PathSmokeCell.Root.IsMounted
      || !PathSmokeCell.NonZeroShape.IsMounted
      || !PathSmokeCell.EvenOddShape.IsMounted
      || !PathSmokeCell.RoundedFillShape.IsMounted
      || !PathSmokeCell.RoundedStrokeShape.IsMounted
      || !StaticPathSmokeCell.Root.IsMounted
      || !StaticPathSmokeCell.ShapeHandle.IsMounted
      || PathSmokeCell.Root.BorderBox.Width <= 0.0
      || PathSmokeCell.Root.BorderBox.Height <= 0.0
      || PathSmokeCell.NonZeroShape.BorderBox.Width <= 0.0
      || PathSmokeCell.NonZeroShape.BorderBox.Height <= 0.0
      || PathSmokeCell.EvenOddShape.BorderBox.Width <= 0.0
      || PathSmokeCell.EvenOddShape.BorderBox.Height <= 0.0
      || PathSmokeCell.RoundedFillShape.BorderBox.Width <= 0.0
      || PathSmokeCell.RoundedFillShape.BorderBox.Height <= 0.0
      || PathSmokeCell.RoundedStrokeShape.BorderBox.Width <= 0.0
      || PathSmokeCell.RoundedStrokeShape.BorderBox.Height <= 0.0
      || StaticPathSmokeCell.Root.BorderBox.Width <= 0.0
      || StaticPathSmokeCell.Root.BorderBox.Height <= 0.0
      || StaticPathSmokeCell.ShapeHandle.BorderBox.Width <= 0.0
      || StaticPathSmokeCell.ShapeHandle.BorderBox.Height <= 0.0 {
        throw InvalidOperationException("Path path smoke did not retain visible positive geometry in both windows")
      }
    var phase int32 = 1
    while phase <= 12 {
      churnRoot.SetPhase(phase)
      var phasePump int32
      while phasePump < 32 {
        churnOpened.Pump(0.016)
        staticOpened.Pump(0.016)
        Thread.Yield()
        phasePump = phasePump + 1
      }
      if !churnOpened.IsOpen || !staticOpened.IsOpen {
        throw InvalidOperationException("Path path churn smoke window closed")
      }
      phase = phase + 1
    }
    if !CloseWindow(churnOpened) {
      throw InvalidOperationException("Path path churn window did not close")
    }
    if !staticOpened.IsOpen
      || !StaticPathSmokeCell.Root.IsMounted
      || !StaticPathSmokeCell.ShapeHandle.IsMounted
      || StaticPathSmokeCell.Root.BorderBox.Width <= 0.0
      || StaticPathSmokeCell.Root.BorderBox.Height <= 0.0
      || StaticPathSmokeCell.ShapeHandle.BorderBox.Width <= 0.0
      || StaticPathSmokeCell.ShapeHandle.BorderBox.Height <= 0.0 {
        throw InvalidOperationException("Path static path window was disrupted by churn window disposal")
      }
    var staticPumps int32
    while staticPumps < 4 {
      staticOpened.Pump(0.016)
      staticPumps = staticPumps + 1
    }
    if !CloseWindow(staticOpened) {
      throw InvalidOperationException("Path static path window did not close")
    }
    let diagnostics = capturedError.ToString()
    let pathBudget = DiagnosticCounterValue(diagnostics, "pathAtlasByteBudget")
    let pathResident = DiagnosticCounterValue(diagnostics, "pathAtlasResidentWords")
    let pathFree = DiagnosticCounterValue(diagnostics, "pathAtlasFreeWords")
    let pathCount = DiagnosticCounterValue(diagnostics, "pathAtlasPathCount")
    let activeReferences = DiagnosticCounterValue(diagnostics, "pathAtlasActiveReferenceCount")
    let liveObjects = DiagnosticCounterValue(diagnostics, "pathAtlasLiveObjectCount")
    let evictionCount = DiagnosticCounterValue(diagnostics, "pathAtlasEvictionCount")
    let retiredWords = DiagnosticCounterValue(diagnostics, "pathAtlasRetiredWords")
    let reuseCount = DiagnosticCounterValue(diagnostics, "pathAtlasReuseCount")
    let pressureEvents = DiagnosticCounterValue(diagnostics, "pathAtlasPressureEventCount")
    let pressureFailures = DiagnosticCounterValue(diagnostics, "pathAtlasPressureFailureCount")
    let validationErrors = DiagnosticCounterValue(diagnostics, "validationErrorCount")
    let resultFailures = DiagnosticCounterValue(diagnostics, "resultFailureCount")
    let drawCount = DiagnosticCounterValue(diagnostics, "drawCount")
    if diagnostics.Contains("\"kind\":\"fatal\"")
      || diagnostics.Contains("\"event\":325")
      || pathBudget == 0uL || pathBudget > 262144uL
      || pathResident != 0uL || pathFree != 0uL || pathCount != 0uL
      || activeReferences != 0uL || liveObjects != 0uL
      || pressureEvents == 0uL || evictionCount == 0uL || reuseCount == 0uL
      || pressureFailures != 0uL || validationErrors != 0uL
      || resultFailures != 0uL || drawCount == 0uL {
        Console.SetError(originalError)
        originalError.Write(diagnostics)
        throw InvalidOperationException("Path path smoke did not qualify bounded lifetime and cleanup: budget="
          +pathBudget.ToString() + " residentWords=" + pathResident.ToString()
          +" freeWords=" + pathFree.ToString() + " pathCount=" + pathCount.ToString()
          +" activeReferences=" + activeReferences.ToString() + " liveObjects=" + liveObjects.ToString()
          +" pressureEvents=" + pressureEvents.ToString() + " evictionCount=" + evictionCount.ToString()
          +" retiredWords=" + retiredWords.ToString() + " reuseCount=" + reuseCount.ToString()
          +" pressureFailures=" + pressureFailures.ToString() + " validationErrors="
          +validationErrors.ToString() + " resultFailures=" + resultFailures.ToString()
          +" drawCount=" + drawCount.ToString())
      }
    Console.SetError(originalError)
    Console.WriteLine("path-path: nonzero=1 evenodd=1 rounded=1 clip=1 mounted=1 static=1 pressureEvents="
      +pressureEvents.ToString() + " evictionCount=" + evictionCount.ToString()
      +" retiredWords=" + retiredWords.ToString() + " reuseCount=" + reuseCount.ToString()
      +" close=1")
  } finally {
    Console.SetError(originalError)
    if let active = churnWindow {
      if active.IsOpen {
        CloseWindow(active)
      }
    }
    if let active = staticWindow {
      if active.IsOpen {
        CloseWindow(active)
      }
    }
  }
}

func RunPrimitiveSmoke() {
  if Environment.GetEnvironmentVariable("GOO_VK_DIAGNOSTICS") != "1" {
    throw InvalidOperationException("GOO_VK_DIAGNOSTICS=1 is required")
  }
  let root = PrimitiveSmokeCell{}
  let capturedError = StringWriter()
  let originalError = Console.Error
  var window Window? = nil
  Console.SetError(capturedError)
  try {
    let opened = Window{
      Title: "Goo Primitive public smoke",
      Width: 400,
      Height: 220,
      VSync: false,
      Root: root,
    }
    window = opened
    opened.Open()
    opened.Pump(0.0)
    if !opened.IsOpen || !PrimitiveSmokeCell.Root.IsMounted
      || !PrimitiveSmokeCell.ScrollViewport.IsMounted
      || !PrimitiveSmokeCell.ScrollLeaf.IsMounted{
        throw InvalidOperationException("Primitive smoke did not mount its public handles")
      }
    var pumps int32
    while pumps < 8 {
      opened.Pump(0.016)
      pumps = pumps + 1
    }
    if !opened.IsOpen
      || PrimitiveSmokeCell.Root.BorderBox.Width <= 0.0
      || PrimitiveSmokeCell.Root.BorderBox.Height <= 0.0
      || PrimitiveSmokeCell.SolidBox.BorderBox.Width <= 0.0
      || PrimitiveSmokeCell.RoundedBox.BorderBox.Height <= 0.0
      || PrimitiveSmokeCell.SolidBorderBox.BorderBox.Width <= 0.0
      || PrimitiveSmokeCell.DashedBorderBox.BorderBox.Height <= 0.0
      || PrimitiveSmokeCell.DottedBorderBox.BorderBox.Width <= 0.0
      || PrimitiveSmokeCell.LinearGradientBox.BorderBox.Height <= 0.0
      || PrimitiveSmokeCell.RadialGradientBox.BorderBox.Width <= 0.0
      || PrimitiveSmokeCell.TransformOuter.BorderBox.Width <= 0.0
      || PrimitiveSmokeCell.TransformInner.BorderBox.Height <= 0.0
      || PrimitiveSmokeCell.ScrollViewport.BorderBox.Width <= 0.0
      || PrimitiveSmokeCell.ClipOuter.BorderBox.Height <= 0.0
      || PrimitiveSmokeCell.ClipInner.BorderBox.Width <= 0.0
      || PrimitiveSmokeCell.ScrollLeaf.BorderBox.Height <= 0.0
      || PrimitiveSmokeCell.OpacityLeaf.BorderBox.Width <= 0.0
      || PrimitiveSmokeCell.BackStack.BorderBox.Height <= 0.0
      || PrimitiveSmokeCell.FrontStack.BorderBox.Width <= 0.0 {
        throw InvalidOperationException("Primitive smoke did not settle positive public geometry")
      }
    let beforeOffset = PrimitiveSmokeCell.ScrollViewport.ScrollOffset.X
    let before = PrimitiveSmokeCell.ScrollLeaf.BorderBox
    if !PrimitiveSmokeCell.ScrollViewport.ScrollTo(24.0, 0.0) {
      throw InvalidOperationException("Primitive smoke public scroll failed")
    }
    opened.Pump(0.05)
    let afterOffset = PrimitiveSmokeCell.ScrollViewport.ScrollOffset.X
    let after = PrimitiveSmokeCell.ScrollLeaf.BorderBox
    let offsetShift = afterOffset - beforeOffset
    let borderShift = before.X - after.X
    if afterOffset <= beforeOffset
      || after.Y != before.Y
      || after.Width != before.Width
      || after.Height != before.Height
      || Math.Abs(borderShift - offsetShift) > 0.01 {
        throw InvalidOperationException("Primitive smoke public scroll was not applied once")
      }
    if !CloseWindow(opened) {
      throw InvalidOperationException("Primitive smoke window did not close")
    }
    let diagnostics = capturedError.ToString()
    let validationErrors = DiagnosticCounterValue(diagnostics, "validationErrorCount")
    let resultFailures = DiagnosticCounterValue(diagnostics, "resultFailureCount")
    if diagnostics.Contains("\"kind\":\"fatal\"")
      || diagnostics.Contains("\"event\":325")
      || validationErrors != 0uL || resultFailures != 0uL {
        throw InvalidOperationException("Primitive smoke emitted Vulkan diagnostics errors")
      }
    let drawCount = DiagnosticCounterValue(diagnostics, "drawCount")
    let planCompileCount = DiagnosticCounterValue(diagnostics, "planCompileCount")
    let recordCount = DiagnosticCounterValue(diagnostics, "recordCount")
    if drawCount <= 0 || planCompileCount <= 0 || recordCount <= 0 {
      throw InvalidOperationException("Primitive smoke did not record draw, plan, and record work")
    }
    Console.SetError(originalError)
    Console.WriteLine("primitive: mounted=1 scroll=1 drawCount=" + drawCount.ToString()
      +" planCompileCount=" + planCompileCount.ToString()
      +" recordCount=" + recordCount.ToString() + " close=1")
  } finally {
    Console.SetError(originalError)
    if let active = window {
      if active.IsOpen {
        CloseWindow(active)
      }
    }
  }
}

func RunTextControlsSmoke() {
  if Environment.GetEnvironmentVariable("GOO_VK_DIAGNOSTICS") != "1" {
    throw InvalidOperationException("GOO_VK_DIAGNOSTICS=1 is required")
  }
  let document = TextDocument(
    "CJK \u3041\u4c2e\n"
    +"RTL שלום مرحبا بالعالم\n"
    +"Combining cafe\u0301 e\u0301 and ligature ffi office\n"
    +"Wrapping projection hidden secret line with enough words to wrap across the editor viewport\n"
    +"offscreen tail alpha beta gamma delta epsilon zeta eta theta\n"
    +"final caret line for recovery and focus follow")
  let controller = TextEditorController(document)
  let root = TextControlsSmokeCell(document, controller)
  let cjkPath = Path.Combine(AppContext.BaseDirectory, "HarfBuzz-cff-style-italic.otf")
  if !File.Exists(cjkPath) {
    throw FileNotFoundException("Text controls smoke CJK font asset is missing")
  }
  let cjkFont = FontSource("GooSmokeCjk", 400, false, File.ReadAllBytes(cjkPath))
  cjkFont.Register()
  let capturedError = StringWriter()
  let originalError = Console.Error
  var window Window? = nil
  var secondWindow Window? = nil
  Console.SetError(capturedError)
  try {
    let opened = Window{
      Title: "Goo text controls smoke",
      Width: 336,
      Height: 320,
      VSync: false,
      Root: root,
    }
    window = opened
    opened.Open()
    opened.Pump(0.0)
    if !opened.IsOpen || !TextControlsSmokeCell.Root.IsMounted
      || !TextControlsSmokeCell.Entry.IsMounted || !TextControlsSmokeCell.Editor.IsMounted
      || !TextControlsSmokeCell.Rich.IsMounted{
        throw InvalidOperationException("Text controls smoke did not mount its controls")
      }
    controller.Focus()
    if !controller.IsFocused {
      throw InvalidOperationException("Text controls smoke controller did not retain focus")
    }
    controller.Selection = TextSelection{
      Anchor: TextPosition{ Offset: 0, Affinity: TextAffinity.Upstream },
      Active: TextPosition{ Offset: 3, Affinity: TextAffinity.Downstream },
    }
    let selectionRects = [16]ElementRect
    let selectionDestination = selectionRects.AsSpan()
    var selectionRequired int32
    let selectionGeometry = TextControlsSmokeCell.Editor.TryCopyTextRangeRects(
      TextRange{ Start: 0, Length: 3 }, TextCoordinateSpace.Content,
      selectionDestination, out selectionRequired)
    var selectedCaret ElementRect
    let selectedCaretGeometry = TextControlsSmokeCell.Editor.TryGetTextCaretRect(
      TextPosition{ Offset: 3, Affinity: TextAffinity.Downstream },
      TextCoordinateSpace.Content, out selectedCaret)
    var richCaret ElementRect
    let richGeometry = TextControlsSmokeCell.Rich.TryGetTextCaretRect(
      TextPosition{ Offset: 0, Affinity: TextAffinity.Downstream },
      TextCoordinateSpace.Content, out richCaret)
    if !selectionGeometry || selectionRequired <= 0 || !selectedCaretGeometry
      || selectedCaret.Height <= 0.0 || !richGeometry || richCaret.Height <= 0.0 {
        throw InvalidOperationException("Text controls smoke public text geometry is unavailable")
      }

    let endPosition = TextPosition{ Offset: document.Length,
      Affinity: TextAffinity.Downstream }
    controller.Selection = TextSelection{ Anchor: endPosition, Active: endPosition }
    opened.Pump(0.016)
    var endCaret ElementRect
    let endCaretGeometry = TextControlsSmokeCell.Editor.TryGetTextCaretRect(
      endPosition, TextCoordinateSpace.Content, out endCaret)
    if controller.ScrollTargetY <= 0.0 || !endCaretGeometry || endCaret.Height <= 0.0 {
      throw InvalidOperationException("Text controls smoke did not follow its offscreen active caret")
    }
    if !controller.Execute(TextCommand { Kind: TextCommandKind.BeginComposition })
      || !controller.UpdateComposition("compose", 2, 3) {
        throw InvalidOperationException("Text controls smoke could not activate composition")
      }
    let composition = controller.Composition
    if composition == nil {
      throw InvalidOperationException("Text controls smoke lost composition before pump")
    }
    let activeComposition = composition
    if activeComposition.SelectionStart != 2 || activeComposition.SelectionLength != 3
      || activeComposition.Text != "compose" {
        throw InvalidOperationException("Text controls smoke lost composition selection")
      }
    var pumps int32
    while pumps < 12 {
      opened.Pump(0.016)
      pumps = pumps + 1
    }
    var compositionCaret ElementRect
    let compositionCaretGeometry = TextControlsSmokeCell.Editor.TryGetTextCaretRect(
      endPosition, TextCoordinateSpace.Content, out compositionCaret)
    if !opened.IsOpen || controller.Composition == nil || !compositionCaretGeometry
      || compositionCaret.Height <= 0.0
      || TextControlsSmokeCell.Entry.BorderBox.Width <= 0.0
      || TextControlsSmokeCell.Editor.BorderBox.Width <= 0.0
      || TextControlsSmokeCell.Editor.BorderBox.Height <= 0.0 {
        throw InvalidOperationException("Text controls smoke did not settle control geometry entry="
          +TextControlsSmokeCell.Entry.BorderBox.Width.ToString() + "x"
          +TextControlsSmokeCell.Entry.BorderBox.Height.ToString() + " editor="
          +TextControlsSmokeCell.Editor.BorderBox.Width.ToString() + "x"
          +TextControlsSmokeCell.Editor.BorderBox.Height.ToString() + " composition="
          +(controller.Composition != nil).ToString())
      }
    if !CloseWindow(opened) {
      throw InvalidOperationException("Text controls smoke window did not close")
    }

    let secondRoot = TextReopenSmokeCell{}
    let reopened = Window{
      Title: "Goo text controls reopen smoke",
      Width: 240,
      Height: 96,
      VSync: false,
      Root: secondRoot,
    }
    secondWindow = reopened
    reopened.Open()
    reopened.Pump(0.0)
    if !reopened.IsOpen || !TextReopenSmokeCell.Root.IsMounted
      || TextReopenSmokeCell.Root.BorderBox.Width <= 0.0
      || TextReopenSmokeCell.Root.BorderBox.Height <= 0.0 {
        throw InvalidOperationException("Text controls smoke did not reopen a simple text window")
      }
    var reopenedCaret ElementRect
    if !TextReopenSmokeCell.Root.TryGetTextCaretRect(
      TextPosition{ Offset: 0, Affinity: TextAffinity.Downstream },
      TextCoordinateSpace.Content, out reopenedCaret) || reopenedCaret.Height <= 0.0 {
        throw InvalidOperationException("Text controls smoke reopen text geometry is unavailable")
      }
    if !CloseWindow(reopened) {
      throw InvalidOperationException("Text controls smoke reopen window did not close")
    }

    let diagnostics = capturedError.ToString()
    let drawCount = DiagnosticCounterValue(diagnostics, "drawCount")
    let validationErrors = DiagnosticCounterValue(diagnostics, "validationErrorCount")
    let resultFailures = DiagnosticCounterValue(diagnostics, "resultFailureCount")
    if diagnostics.Contains("\"kind\":\"fatal\"")
      || diagnostics.Contains("\"event\":325")
      || diagnostics.Contains("EditorComposition")
      || diagnostics.Contains("EditorLayers")
      || diagnostics.Contains("TextShadows")
      || diagnostics.Contains("TextStrokeWidth")
      || diagnostics.Contains("TextShadow")
      || diagnostics.Contains("TextStroke")
      || validationErrors != 0uL || resultFailures != 0uL {
        throw InvalidOperationException("Text controls smoke emitted Vulkan diagnostics errors")
      }
    if drawCount <= 1 {
      throw InvalidOperationException("Text controls smoke did not record text draw work")
    }
    Console.SetError(originalError)
    Console.WriteLine("text-controls: mounted=1 focused=1 pumps=" + pumps.ToString()
      +" selection=1 composition=1 caretFollow=1 reopen=1 drawCount="
      +drawCount.ToString() + " close=1")
  } finally {
    Console.SetError(originalError)
    if let active = window {
      if active.IsOpen {
        CloseWindow(active)
      }
    }
    if let active = secondWindow {
      if active.IsOpen {
        CloseWindow(active)
      }
    }
    controller.Dispose()
    root.DisposePresentation()
    cjkFont.Dispose()
  }
}

func RunTextAtlasSmoke() {
  if Environment.GetEnvironmentVariable("GOO_VK_DIAGNOSTICS") != "1"
    || Environment.GetEnvironmentVariable("GOO_VK_TEXT_ATLAS_BYTES") != "8192" {
      throw InvalidOperationException("GOO_VK_DIAGNOSTICS=1 and GOO_VK_TEXT_ATLAS_BYTES=8192 are required")
    }
  let fontPath = Path.Combine(AppContext.BaseDirectory, "VendSans-VariableFont_wght.ttf")
  if !File.Exists(fontPath) {
    throw FileNotFoundException("Text atlas smoke font asset is missing")
  }
  let fontBytes = File.ReadAllBytes(fontPath)
  let fonts = [36]FontSource?
  var fontIndex int32 = 0
  try {
    while fontIndex < fonts.Length {
      let group = fontIndex / 4
      let index = fontIndex % 4
      let font = FontSource(AtlasFontFamily(group, index), 400, false, fontBytes)
      font.Register()
      fonts[fontIndex] = font
      fontIndex = fontIndex + 1
    }
    let root = TextAtlasSmokeCell(BuildAtlasCorpus())
    let capturedError = StringWriter()
    let originalError = Console.Error
    var window Window? = nil
    Console.SetError(capturedError)
    try {
      let opened = Window{
        Title: "Goo text atlas smoke",
        Width: 640,
        Height: 420,
        VSync: false,
        Root: root,
      }
      window = opened
      opened.Open()
      opened.Pump(0.0)
      if !opened.IsOpen || !TextAtlasSmokeCell.Root.IsMounted {
        throw InvalidOperationException("Text atlas smoke did not mount its root")
      }
      var pumps int32 = 0
      while pumps < 24 {
        opened.Pump(0.016)
        pumps = pumps + 1
      }
      var phase int32 = 0
      while phase < 9 {
        root.SetPhase(phase)
        pumps = 0
        while pumps < 24 {
          opened.Pump(0.016)
          pumps = pumps + 1
        }
        phase = phase + 1
      }
      if !opened.IsOpen || TextAtlasSmokeCell.Root.BorderBox.Width <= 0.0
        || TextAtlasSmokeCell.Root.BorderBox.Height <= 0.0 {
          throw InvalidOperationException("Text atlas smoke did not render after atlas reuse")
        }
      if !CloseWindow(opened) {
        throw InvalidOperationException("Text atlas smoke window did not close")
      }
      let diagnostics = capturedError.ToString()
      if diagnostics.Contains("\"kind\":\"fatal\"")
        || diagnostics.Contains("\"event\":325") {
          throw InvalidOperationException("Text atlas smoke emitted Vulkan diagnostics errors")
        }
      let atlasCount = DiagnosticCounterValue(diagnostics, "textAtlasPeakCount")
      let budget = DiagnosticCounterValue(diagnostics, "textAtlasPeakByteBudget")
      let resident = DiagnosticCounterValue(diagnostics, "textAtlasPeakResidentBytes")
      let liveObjects = DiagnosticCounterValue(diagnostics, "textAtlasPeakLiveObjectCount")
      let currentAtlasCount = DiagnosticCounterValue(diagnostics, "textAtlasCount")
      let currentResident = DiagnosticCounterValue(diagnostics, "textAtlasResidentBytes")
      let currentLiveObjects = DiagnosticCounterValue(diagnostics, "textAtlasLiveObjectCount")
      let currentVulkanObjects = DiagnosticCounterValue(diagnostics, "vulkanObjectCount")
      let currentDeviceMemory = DiagnosticCounterValue(diagnostics, "vulkanDeviceMemoryBytes")
      let uploadBytes = DiagnosticCounterValue(diagnostics, "textAtlasRecordedUploadBytes")
      let evictionCount = DiagnosticCounterValue(diagnostics, "textAtlasEvictionCount")
      let retirementCount = DiagnosticCounterValue(diagnostics, "textAtlasRetirementCount")
      let validationErrors = DiagnosticCounterValue(diagnostics, "validationErrorCount")
      let resultFailures = DiagnosticCounterValue(diagnostics, "resultFailureCount")
      let drawCount = DiagnosticCounterValue(diagnostics, "drawCount")
      if atlasCount < 3 || budget != 65536 || resident != budget || liveObjects <= 0
        || currentAtlasCount != 0 || currentResident != 0uL || currentLiveObjects != 0uL
        || currentVulkanObjects != 0uL || currentDeviceMemory != 0uL
        || uploadBytes <= 0 || evictionCount <= 0 || retirementCount <= 0
        || validationErrors != 0 || resultFailures != 0 || drawCount <= 0 {
          throw InvalidOperationException("Text atlas smoke did not qualify atlas growth and reuse: atlasCount="
            +atlasCount.ToString() + " budget=" + budget.ToString() + " resident=" + resident.ToString()
            +" liveObjects=" + liveObjects.ToString() + " uploadBytes=" + uploadBytes.ToString()
            +" currentAtlasCount=" + currentAtlasCount.ToString()
            +" currentResident=" + currentResident.ToString()
            +" currentLiveObjects=" + currentLiveObjects.ToString()
            +" currentVulkanObjects=" + currentVulkanObjects.ToString()
            +" currentDeviceMemory=" + currentDeviceMemory.ToString()
            +" evictionCount=" + evictionCount.ToString() + " retirementCount=" + retirementCount.ToString()
            +" validationErrors=" + validationErrors.ToString() + " resultFailures="
            +resultFailures.ToString() + " drawCount=" + drawCount.ToString())
        }
      Console.SetError(originalError)
      Console.WriteLine("text-atlas: atlasCount=" + atlasCount.ToString()
        +" budget=" + budget.ToString() + " resident=" + resident.ToString()
        +" liveObjects=" + liveObjects.ToString() + " uploadBytes=" + uploadBytes.ToString()
        +" evictionCount=" + evictionCount.ToString() + " retirementCount="
        +retirementCount.ToString() + " drawCount=" + drawCount.ToString() + " close=1")
    } finally {
      Console.SetError(originalError)
      if let active = window {
        if active.IsOpen {
          CloseWindow(active)
        }
      }
    }
  } finally {
    var disposeIndex int32 = 0
    while disposeIndex < fonts.Length {
      if let font = fonts[disposeIndex] {
        font.Dispose()
      }
      disposeIndex = disposeIndex + 1
    }
  }
}

public class VersionedImageProvider : ImageSourceProvider {
  private let gate object
  private var version uint64
  private var currentLease ImageSourceLease?
  private var staleLease ImageSourceLease?
  private var acquireCount int32
  private var releasedCount int32

  init() {
    gate = Object()
    version = 1uL
  }

  public prop ContentVersion uint64{
    get {
      var result uint64
      lock gate { result = version }
      return result
    }
  }

  public event ContentChanged Action

  public prop AcquireCount int32{
    get {
      var result int32
      lock gate { result = acquireCount }
      return result
    }
  }

  public prop ReleasedCount int32{
    get {
      var result int32
      lock gate { result = releasedCount }
      return result
    }
  }

  public func Acquire() ImageSourceLease {
    let lease = ImageSourceLease()
    lease.Released += func() {
      lock gate { releasedCount = releasedCount + 1 }
    }
    lock gate {
      if let current = currentLease { staleLease = current }
      currentLease = lease
      acquireCount = acquireCount + 1
    }
    return lease
  }

  public func CompleteCurrent(source ImageSource) bool {
    var lease ImageSourceLease?
    lock gate {
      lease = currentLease
      if let current = currentLease { staleLease = current }
      currentLease = nil
    }
    guard let current = lease else { return false }
    return current.Complete(source)
  }

  public func CompleteStale(source ImageSource) bool {
    var lease ImageSourceLease?
    lock gate { lease = staleLease }
    guard let current = lease else { return false }
    return current.Complete(source)
  }

  public func FailCurrent() bool {
    var lease ImageSourceLease?
    lock gate {
      lease = currentLease
      if let current = currentLease { staleLease = current }
      currentLease = nil
    }
    guard let current = lease else { return false }
    return current.Fail()
  }

  public func CompleteAndAdvanceAsync(source ImageSource) Thread {
    let worker = Thread(func() {
      CompleteCurrent(source)
      Advance()
    })
    worker.Start()
    return worker
  }

  public func Advance() {
    var changed Action?
    lock gate {
      if version == UInt64.MaxValue { throw InvalidOperationException("Image provider version overflow") }
      version = version + 1uL
      changed = ContentChanged
    }
    changed?.Invoke()
  }
}

class PressureImageProvider : ImageSourceProvider, IDisposable {
  private let source ImageSource
  private var acquireCount int32
  private var releasedCount int32

  init(nativeSource ImageSource) {
    source = nativeSource
  }

  public prop ContentVersion uint64{ get -> 1uL }
  public event ContentChanged Action
  public prop AcquireCount int32{ get -> Interlocked.CompareExchange(&acquireCount, 0, 0) }
  public prop ReleasedCount int32{ get -> Interlocked.CompareExchange(&releasedCount, 0, 0) }

  public func Acquire() ImageSourceLease {
    let lease = source.Acquire()
    Interlocked.Increment(&acquireCount)
    lease.Released += func() { Interlocked.Increment(&releasedCount) }
    return lease
  }

  public func Dispose() {
    source.Dispose()
  }
}

func CreatePressureImage(width int32, height int32, seed uint8) PressureImageProvider {
  let pixels = [width * height * 4]uint8
  var index int32 = 0
  while index < pixels.Length {
    pixels[index] = seed
    pixels[index + 1] = uint8(96)
    pixels[index + 2] = uint8(224)
    pixels[index + 3] = uint8(255)
    index = index + 4
  }
  return PressureImageProvider(ImageSource(width, height, pixels))
}

func PumpPressureSwap(window Window, root SmokeCell,
  prior PressureImageProvider, next PressureImageProvider) {
    root.SetPressureSource(next)
    var pumps int32 = 0
    while pumps < 6 {
      window.Pump(0.016)
      pumps = pumps + 1
    }
    if !window.IsOpen || next.AcquireCount == 0
      || prior.ReleasedCount != prior.AcquireCount{
        throw InvalidOperationException("Native image pressure swap did not settle")
      }
    prior.Dispose()
  }

func RunImageChunkSmoke(window Window, root SmokeCell, initial PressureImageProvider) {
  let image = CreatePressureImage(4096, 4096, uint8(42))
  root.SetPressureSource(image)
  var pumps int32 = 0
  while pumps < 16 {
    window.Pump(0.016)
    pumps++
  }
  if !window.IsOpen || image.AcquireCount == 0
    || initial.ReleasedCount != initial.AcquireCount{
      throw InvalidOperationException("Native chunked image upload did not settle")
    }
  initial.Dispose()
  if !CloseWindow(window) || image.ReleasedCount != image.AcquireCount {
    throw InvalidOperationException("Native chunked image upload did not release its final lease")
  }
  image.Dispose()
}

func RunImagePressureSmoke(window Window, root SmokeCell, initial PressureImageProvider) {
  var current = initial
  var index int32 = 0
  while index < 20 {
    let next = CreatePressureImage(2048, 2048, uint8(index % 251))
    PumpPressureSwap(window, root, current, next)
    current = next
    index = index + 1
  }
  if !window.IsOpen || current.AcquireCount == current.ReleasedCount {
    throw InvalidOperationException("Native image pressure smoke closed or lost its current lease")
  }
  if !CloseWindow(window) || current.ReleasedCount != current.AcquireCount {
    throw InvalidOperationException("Native image pressure smoke did not release its final lease")
  }
  current.Dispose()
}

func RunRegisteredFontSmoke() {
  let primaryPath = Path.Combine(AppContext.BaseDirectory, "HarfBuzz-adwaita-colrv1.ttf")
  let fallbackPath = Path.Combine(AppContext.BaseDirectory, "VendSans-VariableFont_wght.ttf")
  let ttcPath = Path.Combine(AppContext.BaseDirectory, "HarfBuzz-TTC.ttc")
  let cffFace0Path = Path.Combine(AppContext.BaseDirectory, "HarfBuzz-cff-f1.otf")
  let cffFace1Path = Path.Combine(AppContext.BaseDirectory, "HarfBuzz-cff-f2.otf")
  let otcPath = Path.Combine(AppContext.BaseDirectory, "HarfBuzz-cff.otc")
  let styleRegularPath = Path.Combine(AppContext.BaseDirectory, "HarfBuzz-cff-style-regular.otf")
  let styleBoldPath = Path.Combine(AppContext.BaseDirectory, "HarfBuzz-cff-style-bold.otf")
  let styleItalicPath = Path.Combine(AppContext.BaseDirectory, "HarfBuzz-cff-style-italic.otf")
  if !File.Exists(primaryPath) || !File.Exists(fallbackPath) || !File.Exists(ttcPath)
    || !File.Exists(cffFace0Path) || !File.Exists(cffFace1Path) || !File.Exists(otcPath)
    || !File.Exists(styleRegularPath) || !File.Exists(styleBoldPath) || !File.Exists(styleItalicPath) {
      throw FileNotFoundException("Registered font smoke assets are missing")
    }
  let primaryBytes = File.ReadAllBytes(primaryPath)
  let fallbackBytes = File.ReadAllBytes(fallbackPath)
  let ttcBytes = File.ReadAllBytes(ttcPath)
  let cffFace0Bytes = File.ReadAllBytes(cffFace0Path)
  let cffFace1Bytes = File.ReadAllBytes(cffFace1Path)
  let otcBytes = File.ReadAllBytes(otcPath)
  let invalidTtcBytes = File.ReadAllBytes(ttcPath)
  let invalidOtcBytes = File.ReadAllBytes(otcPath)
  let styleRegularBytes = File.ReadAllBytes(styleRegularPath)
  let styleBoldBytes = File.ReadAllBytes(styleBoldPath)
  let styleItalicBytes = File.ReadAllBytes(styleItalicPath)
  let primary = FontSource("GooSmokePrimary", 400, false, primaryBytes)
  let fallback = FontSource("GooSmokeFallback", 400, false, fallbackBytes)
  let cff = FontSource("GooSmokeCff", 400, false, cffFace0Bytes)
  let cffSecond = FontSource("GooSmokeCffSecond", 400, false, cffFace1Bytes)
  let styleRegular = FontSource("GooSmokeStyle", 400, false, styleRegularBytes)
  let styleBold = FontSource("GooSmokeStyle", 700, false, styleBoldBytes)
  let styleItalic = FontSource("GooSmokeStyle", 400, true, styleItalicBytes)
  let styleBoldItalic = FontSource("GooSmokeStyle", 700, true, cffFace1Bytes)
  let ttcFace0 = FontSource("GooSmokeTtc", 400, false, ttcBytes, 0u, []FontVariation{})
  let ttcFace1 = FontSource("GooSmokeTtc", 700, false, ttcBytes, 1u, []FontVariation{})
  let otcFace0 = FontSource("GooSmokeOtc", 400, false, otcBytes, 0u, []FontVariation{})
  let otcFace1 = FontSource("GooSmokeOtc", 700, false, otcBytes, 1u, []FontVariation{})
  let variableRegular = FontSource("GooSmokeVariable", 400, false, fallbackBytes, 0u,
    []FontVariation{ FontVariation("wght", 400.0F) })
  let variableBold = FontSource("GooSmokeVariable", 700, false, fallbackBytes, 0u,
    []FontVariation{ FontVariation("wght", 700.0F) })
  primaryBytes[0] = 0u
  fallbackBytes[0] = 0u
  ttcBytes[0] = 0u
  cffFace0Bytes[0] = 0u
  cffFace1Bytes[0] = 0u
  otcBytes[0] = 0u
  styleRegularBytes[0] = 0u
  styleBoldBytes[0] = 0u
  styleItalicBytes[0] = 0u
  if cff.Family != "GooSmokeCff" || cff.Weight != 400 || cff.Italic
    || ttcFace1.FaceIndex != 1u || otcFace1.FaceIndex != 1u {
      throw InvalidOperationException("Registered font smoke did not retain public source metadata")
    }
  let regularVariations = variableRegular.Variations
  let boldVariations = variableBold.Variations
  if regularVariations.Length != 1 || boldVariations.Length != 1
    || regularVariations[0].Tag != "wght" || boldVariations[0].Tag != "wght"
    || regularVariations[0].Value != 400.0F || boldVariations[0].Value != 700.0F {
      throw InvalidOperationException("Registered font smoke did not retain variation coordinates")
    }
  try {
    primary.Register()
    fallback.Register()
    cff.Register()
    cffSecond.Register()
    styleRegular.Register()
    styleBold.Register()
    styleItalic.Register()
    styleBoldItalic.Register()
    ttcFace0.Register()
    ttcFace1.Register()
    otcFace0.Register()
    otcFace1.Register()
    variableRegular.Register()
    variableBold.Register()
    if !primary.IsRegistered || !fallback.IsRegistered || !cff.IsRegistered
      || !cffSecond.IsRegistered
      || !styleRegular.IsRegistered || !styleBold.IsRegistered || !styleItalic.IsRegistered
      || !styleBoldItalic.IsRegistered || !ttcFace0.IsRegistered || !ttcFace1.IsRegistered
      || !otcFace0.IsRegistered || !otcFace1.IsRegistered
      || !variableRegular.IsRegistered || !variableBold.IsRegistered{
        throw InvalidOperationException("Registered font smoke did not register the corpus")
      }
    let duplicate = FontSource("GooSmokeStyle", 700, false, cffFace0Bytes)
    var duplicateRejected bool
    try {
      duplicate.Register()
    } catch (error InvalidOperationException) {
      duplicateRejected = true
    }
    duplicate.Dispose()
    if !duplicateRejected {
      throw InvalidOperationException("Registered font smoke accepted a duplicate style")
    }
    let invalidTtc = FontSource("GooSmokeInvalidTtc", 400, false, invalidTtcBytes, 2u,
      []FontVariation{})
    var invalidTtcRejected bool
    try {
      invalidTtc.Register()
    } catch (error ArgumentOutOfRangeException) {
      invalidTtcRejected = true
    }
    invalidTtc.Dispose()
    let invalidOtc = FontSource("GooSmokeInvalidOtc", 400, false, invalidOtcBytes, 2u,
      []FontVariation{})
    var invalidOtcRejected bool
    try {
      invalidOtc.Register()
    } catch (error ArgumentOutOfRangeException) {
      invalidOtcRejected = true
    }
    invalidOtc.Dispose()
    if !invalidTtcRejected || !invalidOtcRejected {
      throw InvalidOperationException("Registered font smoke accepted an invalid face index")
    }
    let root = RegisteredFontCorpusSmokeCell{}
    let window = Window{
      Title: "Goo registered font corpus smoke",
      Width: 640,
      Height: 420,
      VSync: false,
      Root: root,
    }
    window.Open()
    window.Pump(0.0)
    var pumps int32
    while pumps < 8 {
      window.Pump(0.016)
      pumps = pumps + 1
    }
    if !window.IsOpen || !RegisteredFontCorpusSmokeCell.Root.IsMounted
      || RegisteredFontCorpusSmokeCell.Cff.BorderBox.Width <= 0.0
      || RegisteredFontCorpusSmokeCell.StyleRegular.BorderBox.Width <= 0.0
      || RegisteredFontCorpusSmokeCell.StyleBold.BorderBox.Width <= 0.0
      || RegisteredFontCorpusSmokeCell.StyleItalic.BorderBox.Width <= 0.0
      || RegisteredFontCorpusSmokeCell.StyleBoldItalic.BorderBox.Width <= 0.0
      || RegisteredFontCorpusSmokeCell.StyleRegular.BorderBox.Width
    == RegisteredFontCorpusSmokeCell.StyleBold.BorderBox.Width
      || RegisteredFontCorpusSmokeCell.StyleRegular.BorderBox.Width
    == RegisteredFontCorpusSmokeCell.StyleItalic.BorderBox.Width
      || RegisteredFontCorpusSmokeCell.StyleRegular.BorderBox.Width
    == RegisteredFontCorpusSmokeCell.StyleBoldItalic.BorderBox.Width
      || RegisteredFontCorpusSmokeCell.StyleBold.BorderBox.Width
    == RegisteredFontCorpusSmokeCell.StyleItalic.BorderBox.Width
      || RegisteredFontCorpusSmokeCell.StyleBold.BorderBox.Width
    == RegisteredFontCorpusSmokeCell.StyleBoldItalic.BorderBox.Width
      || RegisteredFontCorpusSmokeCell.StyleItalic.BorderBox.Width
    == RegisteredFontCorpusSmokeCell.StyleBoldItalic.BorderBox.Width
      || RegisteredFontCorpusSmokeCell.VariableRegular.BorderBox.Width <= 0.0
      || RegisteredFontCorpusSmokeCell.VariableBold.BorderBox.Width <= 0.0
      || RegisteredFontCorpusSmokeCell.VariableRegular.BorderBox.Width
    == RegisteredFontCorpusSmokeCell.VariableBold.BorderBox.Width
      || RegisteredFontCorpusSmokeCell.Fallback.BorderBox.Width <= 0.0
      || RegisteredFontCorpusSmokeCell.Fallback.BorderBox.Width
    != RegisteredFontCorpusSmokeCell.Cff.BorderBox.Width{
      throw InvalidOperationException("Registered font smoke did not render the corpus matrix")
    }
    primary.Dispose()
    fallback.Dispose()
    cff.Dispose()
    cffSecond.Dispose()
    styleRegular.Dispose()
    styleBold.Dispose()
    styleItalic.Dispose()
    styleBoldItalic.Dispose()
    ttcFace0.Dispose()
    ttcFace1.Dispose()
    otcFace0.Dispose()
    otcFace1.Dispose()
    variableRegular.Dispose()
    variableBold.Dispose()
    window.Pump(0.0)
    if !window.IsOpen {
      throw InvalidOperationException("Registered font smoke lost its retained corpus leases")
    }
    if !CloseWindow(window) {
      throw InvalidOperationException("Registered font smoke window did not close")
    }
  } finally {
    fallback.Dispose()
    primary.Dispose()
    cff.Dispose()
    cffSecond.Dispose()
    styleRegular.Dispose()
    styleBold.Dispose()
    styleItalic.Dispose()
    styleBoldItalic.Dispose()
    ttcFace0.Dispose()
    ttcFace1.Dispose()
    otcFace0.Dispose()
    otcFace1.Dispose()
    variableRegular.Dispose()
    variableBold.Dispose()
  }
}

func RunLayerCapacitySmoke() {
  if Environment.GetEnvironmentVariable("GOO_VK_DIAGNOSTICS") != "1" {
    throw InvalidOperationException("GOO_VK_DIAGNOSTICS=1 is required")
  }
  let capturedError = StringWriter()
  let originalError = Console.Error
  Console.SetError(capturedError)
  let window = Window{
    Title: "Goo layer capacity smoke",
    Width: 96,
    Height: 96,
    VSync: false,
    Root: LayerCapacitySmokeCell(17),
  }
  try {
    window.Open()
    window.Pump(0.0)
    window.Pump(0.0)
    if !window.IsOpen {
      throw InvalidOperationException("Layer capacity smoke window did not present")
    }
    if !CloseWindow(window) {
      throw InvalidOperationException("Layer capacity smoke window did not close")
    }
    let diagnostics = capturedError.ToString()
    let createCount = DiagnosticCounterValue(diagnostics, "layerPoolCreateCount")
    let failureCount = DiagnosticCounterValue(diagnostics, "layerPoolFailureCount")
    let pressureFailureCount = DiagnosticCounterValue(diagnostics, "layerPoolPressureFailureCount")
    let passCount = DiagnosticCounterValue(diagnostics, "layerPoolPassCount")
    let compositeCount = DiagnosticCounterValue(diagnostics, "layerPoolCompositeCount")
    if diagnostics.Contains("\"kind\":\"fatal\"")
      || diagnostics.Contains("\"event\":325")
      || createCount < 17uL || passCount < 17uL || compositeCount < 17uL
      || failureCount != 0uL || pressureFailureCount != 0uL {
        throw InvalidOperationException("Layer capacity smoke did not exceed the former target ceiling: created="
          +createCount.ToString() + " passes=" + passCount.ToString()
          +" composites=" + compositeCount.ToString() + " failures="
          +failureCount.ToString() + " pressureFailures=" + pressureFailureCount.ToString())
      }
    Console.SetError(originalError)
    Console.WriteLine("layer-capacity: created=" + createCount.ToString()
      +" passes=" + passCount.ToString() + " composites=" + compositeCount.ToString()
      +" failures=0 close=1")
  } finally {
    Console.SetError(originalError)
    if window.IsOpen {
      CloseWindow(window)
    }
  }
}

func Main() {
  Window.ConfigureApplication("Goo package smoke", "0.1.0", "io.github.obselate.goo.smoke")
  if Environment.GetEnvironmentVariable("GOO_WINDOWS_QUALIFICATION") == "1" {
    RunWindowsQualification()
    return
  }
  if Environment.GetEnvironmentVariable("GOO_LAYER_CAPACITY_SMOKE") == "1" {
    RunLayerCapacitySmoke()
    return
  }
  if Environment.GetEnvironmentVariable("GOO_PATH_SMOKE") == "1" {
    RunPathSmoke()
    return
  }
  if Environment.GetEnvironmentVariable("GOO_CLIP_MASK_SMOKE") == "1" {
    RunClipMaskSmoke()
    return
  }
  if Environment.GetEnvironmentVariable("GOO_COMPILED_VECTOR_SMOKE") == "1" {
    RunCompiledVectorSmoke()
    return
  }
  if Environment.GetEnvironmentVariable("GOO_PRIMITIVE_SMOKE") == "1" {
    RunPrimitiveSmoke()
    return
  }
  if Environment.GetEnvironmentVariable("GOO_TEXT_INPUT_SMOKE") == "1" {
    RunTextControlsSmoke()
    return
  }
  if Environment.GetEnvironmentVariable("GOO_TEXT_ATLAS_SMOKE") == "1" {
    RunTextAtlasSmoke()
    return
  }
  if Environment.GetEnvironmentVariable("GOO_FONT_SMOKE") == "1" {
    RunRegisteredFontSmoke()
    return
  }
  if Environment.GetEnvironmentVariable("GOO_MULTI_WINDOW_SMOKE") == "1" {
    let firstRoot = Cell{}
    let secondRoot = Cell{}
    let thirdRoot = Cell{}
    let first = Window{
      Title: "Goo package smoke first",
      Width: 160,
      Height: 90,
      VSync: false,
      Root: firstRoot,
    }
    let second = Window{
      Title: "Goo package smoke second",
      Width: 160,
      Height: 90,
      VSync: false,
      Root: secondRoot,
    }
    let third = Window{
      Title: "Goo package smoke third",
      Width: 160,
      Height: 90,
      VSync: false,
      Root: thirdRoot,
    }
    first.Open()
    second.Open()
    third.Open()
    first.Pump(0.0)
    second.Pump(0.0)
    third.Pump(0.0)
    if !first.IsOpen || !second.IsOpen || !third.IsOpen {
      throw InvalidOperationException("Native multi-window smoke did not present all windows")
    }
    first.State = WindowState.Minimized
    second.Background = Color.Rgb(20, 28, 40)
    var secondScheduled int32 = 0
    var thirdScheduled int32 = 0
    var closingCount int32 = 0
    first.OnClosing = () -> {
      Interlocked.Increment(&closingCount)
      third.Post(() -> {
        Interlocked.Exchange(&thirdScheduled, 1)
        second.RequestClose()
        third.RequestClose()
      })
      return true
    }
    second.Post(func() {
      Interlocked.Exchange(&secondScheduled, 1)
      first.RequestClose()
    })
    let watchdog = Thread(func() {
      var attempts int32
      while attempts < 500 && Interlocked.CompareExchange(&thirdScheduled, 0, 0) == 0 {
        Thread.Sleep(10)
        attempts = attempts + 1
      }
      if Interlocked.CompareExchange(&secondScheduled, 0, 0) == 0 {
        first.RequestClose()
      }
      if Interlocked.CompareExchange(&thirdScheduled, 0, 0) == 0 {
        second.RequestClose()
        third.RequestClose()
      }
    })
    watchdog.IsBackground = true
    watchdog.Start()
    first.Run()
    watchdog.Join()
    if Interlocked.CompareExchange(&secondScheduled, 0, 0) == 0
      || Interlocked.CompareExchange(&thirdScheduled, 0, 0) == 0 {
        throw InvalidOperationException("Native multi-window scheduler did not continue sibling work")
      }
    if first.IsOpen || second.IsOpen || third.IsOpen {
      throw InvalidOperationException("Native multi-window smoke windows did not close")
    }
    if closingCount != 1 {
      throw InvalidOperationException("Native multi-window close callback ran " + closingCount.ToString() + " times")
    }
    Console.WriteLine("multi-window: closing=1 siblings=2 close=3")
    return
  }
  let nativeSmoke = Environment.GetEnvironmentVariable("GOO_WINDOW_SMOKE") == "1"
  let pressureSmoke = Environment.GetEnvironmentVariable("GOO_IMAGE_PRESSURE_SMOKE") == "1"
  let chunkSmoke = Environment.GetEnvironmentVariable("GOO_IMAGE_CHUNK_SMOKE") == "1"
  var imageProvider VersionedImageProvider?
  var backgroundProvider VersionedImageProvider?
  var imageV1 ImageSource?
  var imageV2 ImageSource?
  var backgroundV1 ImageSource?
  var backgroundV2 ImageSource?
  if nativeSmoke {
    imageProvider = VersionedImageProvider{}
    backgroundProvider = VersionedImageProvider{}
    imageV1 = ImageSource(2, 2, []uint8{
      255, 64, 64, 255,
      255, 192, 64, 255,
      64, 192, 255, 255,
      64, 96, 255, 255,
    })
    imageV2 = ImageSource(2, 2, []uint8{
      64, 255, 96, 255,
      64, 255, 224, 255,
      192, 64, 255, 255,
      255, 64, 192, 255,
    })
    backgroundV1 = ImageSource(2, 2, []uint8{
      64, 255, 96, 255,
      64, 255, 224, 255,
      192, 64, 255, 255,
      255, 64, 192, 255,
    })
    backgroundV2 = ImageSource(2, 2, []uint8{
      255, 64, 64, 255,
      255, 192, 64, 255,
      64, 192, 255, 255,
      64, 96, 255, 255,
    })
  }
  let smokeRoot = if let provider = imageProvider {
    SmokeCell(provider, backgroundProvider!!)
  } else {
    SmokeCell{}
  }
  var pressureInitial PressureImageProvider?
  if pressureSmoke || chunkSmoke {
    pressureInitial = CreatePressureImage(1, 1, uint8(1))
    smokeRoot.SetPressureSource(pressureInitial)
  }
  let window = Window{
    Title: "Goo package smoke test",
    Width: 320,
    Height: 180,
    VSync: false,
    Root: smokeRoot,
  }

  var latestMetrics WindowMetrics = WindowMetrics{}
  var windowMetricEvents int32
  var minimizedStateEvents int32
  var latestRootMetrics ElementMetrics = ElementMetrics{}
  var rootMetricEvents int32
  window.MetricsChanged += func(value WindowMetrics) {
    latestMetrics = value
    windowMetricEvents = windowMetricEvents + 1
  }
  window.StateChanged += func(value WindowState) {
    if value == WindowState.Minimized {
      minimizedStateEvents = minimizedStateEvents + 1
    }
  }
  SmokeCell.Root.MetricsChanged += func(value ElementMetrics) {
    latestRootMetrics = value
    rootMetricEvents = rootMetricEvents + 1
  }

  if pressureSmoke || chunkSmoke {
    if Environment.GetEnvironmentVariable("GOO_VK_DIAGNOSTICS") != "1" {
      throw InvalidOperationException("GOO_VK_DIAGNOSTICS=1 is required")
    }
    let initial = pressureInitial!!
    let capturedError = StringWriter()
    let originalError = Console.Error
    Console.SetError(capturedError)
    try {
      window.Open()
      window.Pump(0.0)
      if !window.IsOpen || initial.AcquireCount == 0 {
        throw InvalidOperationException("Native image pressure smoke did not mount its initial lease")
      }
      if chunkSmoke {
        RunImageChunkSmoke(window, smokeRoot, initial)
      } else {
        RunImagePressureSmoke(window, smokeRoot, initial)
      }
      let diagnostics = capturedError.ToString()
      let imageBudget = DiagnosticCounterValue(diagnostics, "imageByteBudget")
      let imageResident = DiagnosticCounterValue(diagnostics, "imageResidentBytes")
      let imageLiveObjects = DiagnosticCounterValue(diagnostics, "imageLiveObjectCount")
      let imagePeakResident = DiagnosticCounterValue(diagnostics, "imagePeakResidentBytes")
      let imagePeakLiveObjects = DiagnosticCounterValue(diagnostics, "imagePeakLiveObjectCount")
      let imageEvictionCount = DiagnosticCounterValue(diagnostics, "imageEvictionCount")
      let imageRetirementCount = DiagnosticCounterValue(diagnostics, "imageRetirementCount")
      let uploadCount = DiagnosticCounterValue(diagnostics, "uploadCount")
      let imageUploadChunkCount = DiagnosticCounterValue(diagnostics, "imageUploadChunkCount")
      let imageUploadCompletedCount = DiagnosticCounterValue(diagnostics, "imageUploadCompletedCount")
      if diagnostics.Contains("\"kind\":\"fatal\"")
        || diagnostics.Contains("\"event\":325") {
          throw InvalidOperationException("Native image pressure smoke emitted Vulkan diagnostics errors")
        }
      if chunkSmoke {
        if imageBudget < 67108864uL || imagePeakResident < 67108864uL
          || imageUploadChunkCount <= imageUploadCompletedCount || imageUploadCompletedCount < 2uL
          || imageResident != 0uL || imageLiveObjects != 0uL {
            throw InvalidOperationException("Native chunked image upload did not qualify: budget="
              +imageBudget.ToString() + " peakResident=" + imagePeakResident.ToString()
              +" uploadCount=" + uploadCount.ToString()
              +" imageUploadChunkCount=" + imageUploadChunkCount.ToString()
              +" imageUploadCompletedCount=" + imageUploadCompletedCount.ToString()
              +" resident=" + imageResident.ToString() + " liveObjects=" + imageLiveObjects.ToString())
          }
      } else if imageBudget < 67108864uL || imagePeakResident == 0uL
        || imagePeakResident > imageBudget
        || imagePeakLiveObjects == 0uL || imageEvictionCount == 0uL
        || imageRetirementCount == 0uL || imageResident != 0uL
        || imageLiveObjects != 0uL {
          throw InvalidOperationException("Native image pressure smoke did not qualify GPU image pressure: budget="
            +imageBudget.ToString() + " resident=" + imageResident.ToString()
            +" liveObjects=" + imageLiveObjects.ToString() + " peakResident="
            +imagePeakResident.ToString() + " peakLiveObjects=" + imagePeakLiveObjects.ToString()
            +" evictionCount=" + imageEvictionCount.ToString() + " retirementCount="
            +imageRetirementCount.ToString())
        }
      Console.SetError(originalError)
      if chunkSmoke {
        Console.WriteLine("image-chunk: budget=" + imageBudget.ToString()
          +" peakResident=" + imagePeakResident.ToString()
          +" uploadCount=" + uploadCount.ToString()
          +" imageUploadChunkCount=" + imageUploadChunkCount.ToString()
          +" imageUploadCompletedCount=" + imageUploadCompletedCount.ToString()
          +" residentAfterClose=" + imageResident.ToString()
          +" liveObjectsAfterClose=" + imageLiveObjects.ToString() + " close=1")
      } else {
        Console.WriteLine("image-pressure: budget=" + imageBudget.ToString()
          +" peakResident=" + imagePeakResident.ToString()
          +" peakLiveObjects=" + imagePeakLiveObjects.ToString()
          +" evictionCount=" + imageEvictionCount.ToString()
          +" retirementCount=" + imageRetirementCount.ToString()
          +" residentAfterClose=" + imageResident.ToString()
          +" liveObjectsAfterClose=" + imageLiveObjects.ToString() + " close=1")
      }
    } finally {
      Console.SetError(originalError)
      if window.IsOpen {
        CloseWindow(window)
      }
    }
    return
  } else if Environment.GetEnvironmentVariable("GOO_WINDOW_SMOKE") == "1" {
    window.Open()
    window.Pump(0.0)
    if !SmokeCell.Viewport.IsMounted || !SmokeCell.ScrollLeaf.IsMounted {
      throw InvalidOperationException("Native smoke public handles did not mount")
    }
    if !SmokeCell.Root.IsMounted || windowMetricEvents == 0 || rootMetricEvents == 0 {
      throw InvalidOperationException("Native smoke resize handles did not report initial metrics")
    }
    if nativeSmoke {
      let image = imageProvider!!
      let background = backgroundProvider!!
      let firstImage = imageV1!!
      let secondImage = imageV2!!
      let firstBackground = backgroundV1!!
      let secondBackground = backgroundV2!!
      if image.ContentVersion != 1uL || background.ContentVersion != 1uL {
        throw InvalidOperationException("Versioned image providers did not start at version one")
      }
      let imageWorker = image.CompleteAndAdvanceAsync(firstImage)
      let backgroundWorker = background.CompleteAndAdvanceAsync(firstBackground)
      var asyncAttempts int32
      while asyncAttempts < 120 && (imageWorker.IsAlive || backgroundWorker.IsAlive) {
        window.Pump(0.016)
        asyncAttempts = asyncAttempts + 1
      }
      imageWorker.Join()
      backgroundWorker.Join()
      window.Pump(0.0)
      if image.ContentVersion != 2uL || background.ContentVersion != 2uL
        || image.AcquireCount != 2 || background.AcquireCount != 2
        || image.ReleasedCount != 1 || background.ReleasedCount != 1 {
          throw InvalidOperationException("Versioned image providers did not marshal async completion and change")
        }
      if image.CompleteStale(firstImage) {
        throw InvalidOperationException("Versioned image stale completion was accepted")
      }
      if !image.CompleteCurrent(secondImage) || !background.CompleteCurrent(secondBackground) {
        throw InvalidOperationException("Versioned image providers rejected the second completion")
      }
      window.Pump(0.0)
      window.Pump(0.0)
      image.Advance()
      background.Advance()
      if image.ContentVersion != 3uL || background.ContentVersion != 3uL
        || image.AcquireCount != 3 || background.AcquireCount != 3
        || image.ReleasedCount != 2 || background.ReleasedCount != 2 {
          throw InvalidOperationException("Versioned image providers did not enter the failed version")
        }
      if !image.FailCurrent() || !background.FailCurrent() {
        throw InvalidOperationException("Versioned image providers did not fail the terminal leases")
      }
      window.Pump(0.0)
      window.Pump(0.0)
      if image.AcquireCount != 3 || background.AcquireCount != 3
        || image.ReleasedCount != 2 || background.ReleasedCount != 2 {
          throw InvalidOperationException("Versioned image providers retried an unchanged failed version")
        }
      image.Advance()
      background.Advance()
      if image.ContentVersion != 4uL || background.ContentVersion != 4uL
        || image.AcquireCount != 4 || background.AcquireCount != 4
        || image.ReleasedCount != 3 || background.ReleasedCount != 3 {
          throw InvalidOperationException("Versioned image providers did not make one recovery transition")
        }
      if !image.CompleteCurrent(secondImage) || !background.CompleteCurrent(secondBackground) {
        throw InvalidOperationException("Versioned image providers rejected the recovery completion")
      }
      window.Pump(0.0)
      window.Pump(0.0)
    }
    let beforeMetrics = latestMetrics
    let beforeRoot = SmokeCell.Root.BorderBox
    let targetWidth int32 = 480
    let targetHeight int32 = 260
    window.Width = targetWidth
    window.Height = targetHeight
    var attempts int32
    var resized bool
    while attempts < 120 && !resized {
      window.Pump(0.016)
      resized = latestMetrics.LogicalWidth == targetWidth
        && latestMetrics.LogicalHeight == targetHeight
        && latestMetrics.FramebufferWidth > 0
        && latestMetrics.FramebufferHeight > 0
      attempts = attempts + 1
    }
    let scaleConsistent = latestMetrics.DisplayScaleX > 0.0
      && latestMetrics.DisplayScaleY > 0.0
      && Math.Abs(float64(latestMetrics.FramebufferWidth)
        -float64(latestMetrics.LogicalWidth) * latestMetrics.DisplayScaleX) < 0.01
      && Math.Abs(float64(latestMetrics.FramebufferHeight)
        -float64(latestMetrics.LogicalHeight) * latestMetrics.DisplayScaleY) < 0.01
    let finalRoot = SmokeCell.Root.BorderBox
    if !resized || !scaleConsistent || !latestRootMetrics.IsMounted
      || finalRoot.Width != float64(targetWidth) || finalRoot.Height != float64(targetHeight)
      || finalRoot.Width == beforeRoot.Width || finalRoot.Height == beforeRoot.Height
      || latestRootMetrics.BorderBox.Width != finalRoot.Width
      || latestRootMetrics.BorderBox.Height != finalRoot.Height
      || latestMetrics.FramebufferWidth == beforeMetrics.FramebufferWidth
      && latestMetrics.FramebufferHeight == beforeMetrics.FramebufferHeight{
        throw InvalidOperationException("Native smoke resize metrics or layout did not settle")
      }
    window.Pump(0.0)
    if !window.IsOpen {
      throw InvalidOperationException("Native smoke resize closed the window")
    }
    let beforeOffset = SmokeCell.Viewport.ScrollOffset.X
    let before = SmokeCell.ScrollLeaf.BorderBox
    if !SmokeCell.Viewport.ScrollTo(24.0, 0.0) {
      throw InvalidOperationException("Native smoke public scroll failed")
    }
    window.Pump(0.05)
    let afterOffset = SmokeCell.Viewport.ScrollOffset.X
    let after = SmokeCell.ScrollLeaf.BorderBox
    let offsetShift = afterOffset - beforeOffset
    let borderShift = before.X - after.X
    if afterOffset <= beforeOffset || after.Y != before.Y
      || after.Width != before.Width || after.Height != before.Height
      || Math.Abs(borderShift - offsetShift) > 0.01 {
        throw InvalidOperationException("Native smoke public scroll geometry was not single-shifted")
      }
    let minimizedStateEventStart = minimizedStateEvents
    window.State = WindowState.Minimized
    attempts = 0
    var minimized bool
    while attempts < 60 && !minimized {
      window.Pump(0.016)
      minimized = minimizedStateEvents > minimizedStateEventStart
      attempts = attempts + 1
    }
    if !window.IsOpen || !minimized || window.State != WindowState.Minimized {
      throw InvalidOperationException("Native smoke window did not report minimized state")
    }
    window.State = WindowState.Normal
    var restored bool
    attempts = 0
    while attempts < 60 && !restored {
      window.Pump(0.016)
      let scaleX = latestMetrics.DisplayScaleX
      let scaleY = latestMetrics.DisplayScaleY
      let scaleConsistent = scaleX > 0.0 && scaleY > 0.0
        && Math.Abs(float64(latestMetrics.FramebufferWidth)
          -float64(latestMetrics.LogicalWidth) * scaleX) < 0.01
        && Math.Abs(float64(latestMetrics.FramebufferHeight)
          -float64(latestMetrics.LogicalHeight) * scaleY) < 0.01
      restored = window.State == WindowState.Normal
        && latestMetrics.FramebufferWidth > 0
        && latestMetrics.FramebufferHeight > 0
        && scaleConsistent
      attempts = attempts + 1
    }
    let restoredRoot = SmokeCell.Root.BorderBox
    if !window.IsOpen || !restored || window.State != WindowState.Normal
      || restoredRoot.Width != float64(latestMetrics.LogicalWidth)
      || restoredRoot.Height != float64(latestMetrics.LogicalHeight)
      || latestRootMetrics.BorderBox.Width != restoredRoot.Width
      || latestRootMetrics.BorderBox.Height != restoredRoot.Height{
        throw InvalidOperationException("Native smoke window did not restore metrics or layout")
      }
    smokeRoot.TextValue = "Goo Vulkan text 2"
    smokeRoot.Rebuild()
    window.Pump(0.0)
    window.Background = Color.Rgb(16, 24, 36)
    window.Pump(0.0)
    window.Background = Color.Rgb(20, 28, 40)
    window.Pump(0.0)
    if !CloseWindow(window) {
      throw InvalidOperationException("Native smoke window did not close")
    }
    if nativeSmoke {
      let image = imageProvider!!
      let background = backgroundProvider!!
      if image.ReleasedCount != image.AcquireCount
        || background.ReleasedCount != background.AcquireCount{
          throw InvalidOperationException("Versioned image leases did not release on close")
        }
    }
  }
  imageV1?.Dispose()
  imageV2?.Dispose()
  backgroundV1?.Dispose()
  backgroundV2?.Dispose()
}
