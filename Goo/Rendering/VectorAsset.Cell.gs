package Goo

internal data struct VectorAssetRenderInput {
  internal let Asset VectorAsset
  internal let Fit ShapeFit
}

internal sealed class VectorAssetDisplayCell : Cell[VectorAssetRenderInput] {
  private var asset VectorAsset?
  private var fit ShapeFit
  private var tree Container?
  private var player VectorAnimationPlayer?

  override func Build(input VectorAssetRenderInput) Blob {
    if let current = asset {
      if current == input.Asset && fit == input.Fit {
        if let existing = tree {
          return existing
        }
      }
    }
    let nextTree = input.Asset.BuildStaticTree(input.Fit)
    let nextPlayer VectorAnimationPlayer? = if input.Asset.HasPlaybackTracks {
      VectorAnimationPlayer(this, input.Asset, nextTree)
    } else {
      nil
    }
    if let previous = player {
      previous.Dispose()
      ReleaseMotionParticle(previous)
    }
    asset = input.Asset
    fit = input.Fit
    tree = nextTree
    player = nextPlayer
    if let created = nextPlayer {
      OwnMotionParticle(created)
    }
    return nextTree
  }
}
