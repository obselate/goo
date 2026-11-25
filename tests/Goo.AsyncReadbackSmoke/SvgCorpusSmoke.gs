package GooAsyncReadbackSmoke

import Goo
import Goo.Svg
import System
import System.IO
import System.Security.Cryptography

class SvgCorpusCell : Cell {
    private let asset VectorAsset

    init(asset VectorAsset) {
        this.asset = asset
    }

    override func Build() Blob -> Container{
        Width: Percent(100), Height: Percent(100), asset.Render(),
    }
}

class TransformedSvgCell : Cell {
    private let shifted VectorAsset = Svg.Parse(
        "<svg width='48' height='48'><g transform='translate(0 -300)'>"
        + "<rect x='4' y='304' width='40' height='40' fill='#00c000'/></g></svg>")
    private let gradient VectorAsset = Svg.Parse(
        "<svg width='48' height='48'><defs><linearGradient id='fill'>"
        + "<stop stop-color='#ff0000'/><stop offset='1' stop-color='#0000ff'/>"
        + "</linearGradient></defs><g transform='translate(0 -300)'>"
        + "<rect x='4' y='304' width='40' height='40' fill='url(#fill)'/></g></svg>")
    private let opacity Anim[float64]
    private let translation Anim[Point]

    init() {
        opacity = AnimateValue(0.75)
        translation = AnimateValue(Point{Y: 2.0})
    }

    protected override func Mounted() {
        opacity.To(1.0, Motion.Tween(300.0, Easing.EaseOut))
        translation.To(Point{}, Motion.Tween(300.0, Easing.EaseOut))
    }

    private func Icon() Blob -> Container{Width: 48, Height: 48, FlexShrink: 0, shifted.Render()}

    override func Build() Blob -> Row{
        Gap: 8,
        Column{Gap: 40, Icon(), Icon(), Icon(), Icon(), Icon(), Icon()},
        Column{Gap: 40, OpacityAnim: opacity, Icon(), Icon(), Icon(), Icon(), Icon(), Icon()},
        Column{Gap: 40, TranslateAnim: translation, Icon(), Icon(), Icon(), Icon(), Icon(), Icon()},
        Container{Width: 48, Height: 48, gradient.Render()},
    }
}

func VerifyTransformedSvg() {
    let window = Window{
        Title: "Transformed SVG", Size: LayoutSize(216, 496),
        VSync: false, Background: Color.White, Root: TransformedSvgCell(),
    }
    try {
        window.Open()
        for sample in 0 ... 3 {
            WindowReadbackTestFixture.ForceRender(window, 0.05)
            let metrics = WindowReadbackTestFixture.Metrics(window)
            let frame = PrimitiveReadback(window, metrics)
            for column in 0 ... 3 {
                for row in 0 ... 6 {
                    let pixel = PrimitiveLogicalPixel(frame.Pixels, frame.Width, metrics,
                        float64(24 + column * 56), float64(24 + row * 88))
                    Require(int32(pixel[1]) > int32(pixel[0]) + 40
                        && int32(pixel[1]) > int32(pixel[2]) + 40,
                        "Transformed SVG missing at column " + column.ToString() + " row " + row.ToString())
                }
            }
            for y in 5 ... 43 {
                let left = PrimitiveLogicalPixel(frame.Pixels, frame.Width, metrics, 173.0, float64(y))
                let right = PrimitiveLogicalPixel(frame.Pixels, frame.Width, metrics, 210.0, float64(y))
                Require(left[0] > 220 && left[1] < 20 && right[2] > 220 && right[1] < 20,
                    "Transformed SVG gradient clipped at row " + y.ToString())
            }
        }
    } finally {
        if window.IsOpen {
            window.RequestClose()
            WindowReadbackTestFixture.ForceRender(window, 0.0)
        }
    }
}

func RunSvgCorpusSmoke() {
    let output = Environment.GetEnvironmentVariable("GOO_SVG_CORPUS_OUTPUT")!!
    let baseline = Environment.GetEnvironmentVariable("GOO_SVG_CORPUS_BASELINE")
    Directory.CreateDirectory(output)
    VerifyTransformedSvg()

    for name in []string{"s13-representative.svg", "s13-animated.svg", "s13-morph.svg"} {
        let asset = Svg.Load(Path.Combine(AppContext.BaseDirectory, "SvgCorpus", name))
        let window = Window{
            Title: "Goo SVG corpus", Size: LayoutSize(256, 256),
            VSync: false, Background: Color.White, Root: SvgCorpusCell(asset),
        }
        try {
            window.Open()
            WindowReadbackTestFixture.ForceRender(window, 0.0, timeoutSeconds: 10.0)
            for sample in 0 ... 4 {
                WindowReadbackTestFixture.ForceRender(window, if sample == 0 { 0.0 } else { 0.25 })
                let metrics = WindowReadbackTestFixture.Metrics(window)
                let frame = PrimitiveReadback(window, metrics)
                let file = name + "." + sample.ToString() + ".png"
                let pixels = frame.Pixels
                using let image = ImageSource.Transfer(int32(frame.Width), int32(frame.Height), pixels, () -> {})
                File.WriteAllBytes(Path.Combine(output, file), image.EncodePng())
                if let expectedDirectory = baseline {
                    using let expected = RasterImageDecoder.DecodeIconPng(File.ReadAllBytes(Path.Combine(expectedDirectory, file)))
                    Require(uint32(expected.Width) == frame.Width && uint32(expected.Height) == frame.Height,
                        "SVG corpus extent differs: " + file)
                    let exact = window.RenderingDevice.Kind == RenderingDeviceKind.Cpu
                    var coverageDifferences = 0
                    for index in 0 ... pixels.Length / 4 {
                        var difference = 0
                        for channel in 0 ... 4 {
                            let offset = index * 4 + channel
                            difference = Math.Max(difference, Math.Abs(int32(expected.Pixels[offset]) - int32(pixels[offset])))
                        }
                        Require(difference <= (if exact { 0 } else { 16 }), "SVG corpus pixels differ: " + file)
                        if difference > 2 { coverageDifferences++ }
                    }
                    Require(coverageDifferences <= 2, "SVG corpus coverage differs: " + file)
                }
                Console.WriteLine(file + " " + frame.Width.ToString() + "x" + frame.Height.ToString()
                    + " " + Convert.ToHexString(SHA256.HashData(pixels)))
            }
        } finally {
            if window.IsOpen {
                window.RequestClose()
                WindowReadbackTestFixture.ForceRender(window, 0.0)
            }
        }
    }
}
