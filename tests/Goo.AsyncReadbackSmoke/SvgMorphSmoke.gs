package GooAsyncReadbackSmoke

import Goo
import Goo.Svg
import System
import System.IO
import System.Linq

sealed class SvgMorphSmokeCell : Cell {
    private let asset VectorAsset

    init(asset VectorAsset) {
        this.asset = asset
    }

    override func Build() Blob -> Container{
        Width: Percent(100), Height: Percent(100), asset.Render(),
    }
}

func RunSvgMorphSmoke() {
    let asset = Svg.Load(Path.Combine(AppContext.BaseDirectory, "SvgCorpus", "s13-morph.svg"))
    let originalHash = asset.PathForNode(1).GetHashCode()
    let window = Window{
        Title: "Goo SVG morph regression", Width: 256, Height: 256,
        VSync: false, Background: Color.White, Root: SvgMorphSmokeCell(asset),
    }
    try {
        window.Open()
        WindowReadbackTestFixture.ForceRender(window, 0.0)
        let metrics = WindowReadbackTestFixture.Metrics(window)
        let before = PrimitiveReadback(window, metrics).Pixels
        WindowReadbackTestFixture.ForceRender(window, 0.25)
        let after = PrimitiveReadback(window, metrics).Pixels

        Require(!before.SequenceEqual(after), "SVG morph did not change the rendered pixels")
        Require(asset.PathForNode(1).GetHashCode() == originalHash,
            "SVG playback changed the reusable asset path")
        Console.WriteLine("svg-morph-smoke: pixels-changed=1 asset-unchanged=1")
    } finally {
        if window.IsOpen {
            window.RequestClose()
            WindowReadbackTestFixture.ForceRender(window, 0.0)
        }
    }
}
