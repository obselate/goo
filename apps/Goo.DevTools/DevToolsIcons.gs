package GooDevTools

import System
import System.IO
import Goo
import Goo.Svg

class DevToolsIcons {
  shared {
    let Minimize VectorAsset = Load("remove")
    let Maximize VectorAsset = Load("crop_square")
    let Close VectorAsset = Load("close")
    let Expand VectorAsset = Load("expand_more")
    let Chevron VectorAsset = Load("chevron_right")

    private func Load(name string) VectorAsset -> Svg.Load(Path.Combine(AppContext.BaseDirectory, "Assets", "Icons", name + ".svg"))

    func View(key string, asset VectorAsset) Container -> Container {
      Key: key, Width: 18, Height: 18, Padding: 0, Margin: 0,
      Children: { asset.Render() },
    }
  }
}
