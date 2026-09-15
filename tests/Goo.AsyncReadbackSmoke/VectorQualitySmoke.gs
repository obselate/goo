package GooAsyncReadbackSmoke

import Goo
import Goo.Svg
import GooReadbackFixture
import System
import System.IO
import System.Text

class VectorQualityCell : Cell {
  let Asset VectorAsset
  let RuntimeAsset VectorAsset
  let AuthoredAsset VectorAsset
  let CompositionAsset VectorAsset
  let AnimatedAsset VectorAsset
  var Scale float64 = 2

  init(asset VectorAsset, runtimeAsset VectorAsset) {
    Asset = asset
    RuntimeAsset = runtimeAsset
    AuthoredAsset = VectorQualityAuthoredAsset()
    AnimatedAsset = Svg.Parse("<svg xmlns=\"http://www.w3.org/2000/svg\" viewBox=\"0 0 100 100\"><path d=\"M5 5 H25 V25 H5 Z\" fill=\"#f1c36d\"><animate attributeName=\"d\" values=\"M5 5 H25 V25 H5 Z;M45 5 H65 V25 H45 Z\" dur=\"0.5s\" fill=\"freeze\"/></path><path d=\"M5 45 H25 V65 H5 Z\" fill=\"#70d9cf\"><animateTransform attributeName=\"transform\" type=\"translate\" values=\"0 0;40 0\" dur=\"0.5s\" fill=\"freeze\"/></path></svg>")
    CompositionAsset = Svg.Parse("<svg xmlns=\"http://www.w3.org/2000/svg\" viewBox=\"10 20 100 100\"><g transform=\"translate(10 20) scale(.5)\"><path d=\"M20 30 H60 V50 H20 Z\" fill=\"#f1c36d\" stroke=\"#70d9cf\" stroke-width=\"4\"/><g transform=\"translate(60 100)\"><path d=\"M0 0 H20 L0 20\" fill=\"#70d9cf\"/></g></g><path d=\"M65 65 H75 V75 H65 Z\" fill=\"#af82e1\"/></svg>")
  }

  override func Build() Blob -> Container() {.Width: Length.Percent(100),.Height: Length.Percent(100),.BackgroundColor: Color.Rgb(12, 20, 32),
    Container() {.Position: PositionType.Absolute,.Left: 20,.Top: 20,.Width: 160,.Height: 120,
      RuntimeAsset.Render(),
      },
      Container() {.Position: PositionType.Absolute,.Left: 220,.Top: 20,.Width: 160,.Height: 120, Asset.Render(),
      },
      Container() {.Position: PositionType.Absolute,.Left: 20,.Top: 180,.Width: 160.0 * Scale,.Height: 120.0 * Scale,
      RuntimeAsset.Render(),
      },
      Container() {.Position: PositionType.Absolute,.Left: 20,.Top: 450,.Width: 160,.Height: 160,
      AuthoredAsset.Render(),
      },
      Container() {.Position: PositionType.Absolute,.Left: 380,.Top: 220,.Width: 100,.Height: 100,
      AnimatedAsset.Render(),
      },
      Container() {.Position: PositionType.Absolute,.Left: 220,.Top: 450,.Width: 160,.Height: 160,
      CompositionAsset.Render(),
    },
  }
}

func VectorQualityAuthoredAsset() VectorAsset {
  let rectangle = PathBuilder(0, 0, 200, 200)
  rectangle.MoveTo(20, 30).LineTo(60, 30).LineTo(60, 50).LineTo(20, 50).Close()
  let triangle = PathBuilder(0, 0, 1, 1)
  triangle.MoveTo(0, 0).LineTo(20, 0).LineTo(0, 20)
  let sibling = PathBuilder(0, 0, 100, 100)
  sibling.MoveTo(65, 65).LineTo(75, 65).LineTo(75, 75).LineTo(65, 75).Close()
  let gold = VectorPaint(Color.Rgb(241, 195, 109))
  let teal = VectorPaint(Color.Rgb(112, 217, 207))
  let nested = VectorNode(VectorPath.Empty, VectorNodeStyle{
    Transform: PanelTransform{ TranslateX: 60, TranslateY: 100 },
  }, []VectorNode{ VectorNode(triangle.Build(), VectorNodeStyle{ Fill: teal }, []VectorNode{}) })
  let group = VectorNode(VectorPath.Empty, VectorNodeStyle{
    Transform: PanelTransform{ TranslateX: 10, TranslateY: 20, ScaleX: 0.5, ScaleY: 0.5 },
  }, []VectorNode{
    VectorNode(rectangle.Build(), VectorNodeStyle{ Fill: gold, Stroke: VectorStroke(4, teal) }, []VectorNode{}),
    nested,
  })
  return VectorAsset(10, 20, 100, 100, []VectorNode{
    group,
    VectorNode(sibling.Build(), VectorNodeStyle{ Fill: VectorPaint(Color.Rgb(175, 130, 225)) }, []VectorNode{}),
  })
}

func VectorQualityRequireParity(pixels []uint8, width uint32, metrics WindowMetrics,
  top float64, height float64) {
    let originX = int32(Math.Round(20.0 * metrics.DisplayScaleX))
    let originY = int32(Math.Round(top * metrics.DisplayScaleY))
    let offset = int32(Math.Round(200.0 * metrics.DisplayScaleX))
    for y in 0 ... int32(Math.Round(height * metrics.DisplayScaleY)) {
      for x in 0 ... int32(Math.Round(160.0 * metrics.DisplayScaleX)) {
        let first = PrimitivePixelIndex(width, originX + x, originY + y)
        let second = PrimitivePixelIndex(width, originX + x + offset, originY + y)
        for channel in 0 ... 4 {
          Require(Math.Abs(int32(pixels[first + channel]) - int32(pixels[second + channel])) <= 3,
            "Vector source pixel parity failed at " + x.ToString() + "," + y.ToString())
        }
      }
    }
  }

func VectorQualityWriteImage(result VulkanReadbackResult, path string) {
  using let stream = File.Create(path)
  let header = Encoding.ASCII.GetBytes("P6\n" + result.Width.ToString()
    +" " + result.Height.ToString() + "\n255\n")
  stream.Write(header, 0, header.Length)
  let pixels = result.Pixels
  let row = [int32(result.Width) * 3]uint8
  for y in 0 ... int32(result.Height) {
    for x in 0 ... int32(result.Width) {
      let source = (y * int32(result.Width) + x) * 4
      row[x * 3] = pixels[source]
      row[x * 3 + 1] = pixels[source + 1]
      row[x * 3 + 2] = pixels[source + 2]
    }
    stream.Write(row, 0, row.Length)
  }
}

func RunVectorQualitySmoke() {
  Require(Environment.GetEnvironmentVariable("GOO_VK_DIAGNOSTICS") == "1",
    "GOO_VK_DIAGNOSTICS=1 is required")
  let assetPath = Environment.GetEnvironmentVariable("GOO_VECTOR_ASSET")
  ?? Path.Combine(AppContext.BaseDirectory, "vector-quality.gcv1")
  let asset = VectorAsset.Load(File.ReadAllBytes(assetPath))
  let svgPath = Environment.GetEnvironmentVariable("GOO_VECTOR_SVG")
  ?? Path.Combine(AppContext.BaseDirectory, "vector-quality.svg")
  let runtimeAsset = Svg.Load(svgPath)
  let capturedError = StringWriter()
  let originalError = Console.Error
  let root = VectorQualityCell(asset, runtimeAsset)
  let window = Window{
    Title: "Goo vector quality",
    Width: 560,
    Height: 640,
    VSync: false,
    Root: root,
  }
  try {
    Console.SetError(capturedError)
    window.Open()
    for frame in 0 ... 8 {
      WindowReadbackTestFixture.ForceRender(window, 0.0)
    }
    let metrics = WindowReadbackTestFixture.Metrics(window)
    let result = PrimitiveReadback(window, metrics)
    if let output = Environment.GetEnvironmentVariable("GOO_VECTOR_CAPTURE") {
      VectorQualityWriteImage(result, output)
    }
    PrimitiveRequirePixelNear(result.Pixels, result.Width, metrics,
      27, 80, uint8(112), uint8(217), uint8(207), 8, "vector centered stroke")
    PrimitiveRequirePixelNear(result.Pixels, result.Width, metrics,
      145, 51, uint8(241), uint8(195), uint8(109), 8, "vector open contour fill")
    PrimitiveRequirePixelNear(result.Pixels, result.Width, metrics,
      50, 51, uint8(241), uint8(195), uint8(109), 8, "vector circle fill")
    PrimitiveRequirePixelNear(result.Pixels, result.Width, metrics,
      34, 300, uint8(112), uint8(217), uint8(207), 8, "scaled vector centered stroke")
    let pixels = result.Pixels
    VectorQualityRequireParity(pixels, result.Width, metrics, 20, 120)
    VectorQualityRequireParity(pixels, result.Width, metrics, 450, 160)
    PrimitiveRequirePixelNear(pixels, result.Width, metrics,
      52, 482, uint8(241), uint8(195), uint8(109), 8, "authored view-box transform")
    PrimitiveRequirePixelNear(pixels, result.Width, metrics,
      116, 530, uint8(175), uint8(130), uint8(225), 8, "authored sibling")
    PrimitiveRequirePixelNear(pixels, result.Width, metrics,
      395, 235, uint8(241), uint8(195), uint8(109), 8, "initial morph")
    PrimitiveRequirePixelNear(pixels, result.Width, metrics,
      395, 275, uint8(112), uint8(217), uint8(207), 8, "initial transform animation")
    for frame in 0 ... 40 {
      WindowReadbackTestFixture.ForceRender(window, 0.025)
    }
    let animated = PrimitiveReadback(window, metrics)
    let animatedPixels = animated.Pixels
    PrimitiveRequirePixelNear(animatedPixels, animated.Width, metrics,
      435, 235, uint8(241), uint8(195), uint8(109), 8, "completed morph")
    PrimitiveRequirePixelNear(animatedPixels, animated.Width, metrics,
      435, 275, uint8(112), uint8(217), uint8(207), 8, "completed transform animation")
    PrimitiveRequirePixelNear(animatedPixels, animated.Width, metrics,
      395, 235, uint8(12), uint8(20), uint8(32), 8, "retired morph position")
    root.Scale = 1.5
    root.Rebuild()
    for frame in 0 ... 8 {
      WindowReadbackTestFixture.ForceRender(window, 0.0)
    }
    let resized = PrimitiveReadback(window, metrics)
    let resizedPixels = resized.Pixels
    PrimitiveRequirePixelNear(resizedPixels, resized.Width, metrics,
      31, 270, uint8(112), uint8(217), uint8(207), 8, "resized vector stroke")
    PrimitiveRequirePixelNear(resizedPixels, resized.Width, metrics,
      324, 300, uint8(12), uint8(20), uint8(32), 8, "cleared previous vector bounds")
    window.RequestClose()
    WindowReadbackTestFixture.ForceRender(window, 0.0)
    Require(!window.IsOpen, "Vector quality window did not close")
  } finally {
    try {
      if window.IsOpen {
        window.RequestClose()
        WindowReadbackTestFixture.ForceRender(window, 0.0)
      }
    } finally {
      Console.SetError(originalError)
      if let output = Environment.GetEnvironmentVariable("GOO_VECTOR_LOG") {
        File.WriteAllText(output, capturedError.ToString())
      }
    }
  }
  let diagnostics = capturedError.ToString()
  ReadbackValidateCommonDiagnostics(diagnostics)
  Require(!diagnostics.Contains("\"event\":325")
      && !diagnostics.Contains("\"event\":326"),
    "Vector quality emitted unsupported-scene diagnostics")
  Console.WriteLine("vector-quality: runtime_compiled=parity authored_svg=parity stroke=aligned open_fill=visible scales=1,1.5,2 resize=clean morph=advanced transform=advanced pixels=validated close=1")
}
