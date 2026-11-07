package GooAsyncReadbackSmoke

import Goo
import Goo.Svg
import System
import System.IO
import System.Linq
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

func RunSvgCorpusSmoke() {
    let output = Environment.GetEnvironmentVariable("GOO_SVG_CORPUS_OUTPUT")!!
    let baseline = Environment.GetEnvironmentVariable("GOO_SVG_CORPUS_BASELINE")
    Directory.CreateDirectory(output)

    for name in []string{"s13-representative.svg", "s13-animated.svg", "s13-morph.svg"} {
        let asset = Svg.Load(Path.Combine(AppContext.BaseDirectory, "SvgCorpus", name))
        let window = Window{
            Title: "Goo SVG corpus", Width: 256, Height: 256,
            VSync: false, Background: Color.White, Root: SvgCorpusCell(asset),
        }
        try {
            window.Open()
            WindowReadbackTestFixture.ForceRender(window, 0.0)
            for sample in 0 ... 4 {
                WindowReadbackTestFixture.ForceRender(window, if sample == 0 { 0.0 } else { 0.25 })
                let metrics = WindowReadbackTestFixture.Metrics(window)
                let frame = PrimitiveReadback(window, metrics)
                let file = name + "." + sample.ToString() + ".rgba"
                let pixels = frame.Pixels
                File.WriteAllBytes(Path.Combine(output, file), pixels)
                if let expectedDirectory = baseline {
                    let expected = File.ReadAllBytes(Path.Combine(expectedDirectory, file))
                    Require(expected.SequenceEqual(pixels), "SVG corpus pixels differ: " + file)
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
