package Goo

import System

internal partial class VulkanWindowTarget {
  private func ScaleFrame(frame SceneFrame, scaleX float32, scaleY float32) {
    if scaleX == 1.0F && scaleY == 1.0F {
      return
    }
    frame.InvalidateRetainedPrimitiveSpans()
    for index in 0 ... frame.ChunkCount {
      frame.Chunks[index].Bounds = ScaleBounds(frame.Chunks[index].Bounds, scaleX, scaleY)
    }
    for index in 0 ... frame.SolidBoxCount {
      frame.SolidBoxes[index].Bounds = ScaleBounds(frame.SolidBoxes[index].Bounds, scaleX, scaleY)
    }
    let roundedBoxes = frame.RoundedBoxes
    for index in 0 ... frame.RoundedBoxCount {
      roundedBoxes[index].Bounds = ScaleBounds(roundedBoxes[index].Bounds, scaleX, scaleY)
      roundedBoxes[index].RadiusTopLeft = ScaleRadius(roundedBoxes[index].RadiusTopLeft, scaleX, scaleY)
      roundedBoxes[index].RadiusTopRight = ScaleRadius(roundedBoxes[index].RadiusTopRight, scaleX, scaleY)
      roundedBoxes[index].RadiusBottomRight = ScaleRadius(roundedBoxes[index].RadiusBottomRight, scaleX, scaleY)
      roundedBoxes[index].RadiusBottomLeft = ScaleRadius(roundedBoxes[index].RadiusBottomLeft, scaleX, scaleY)
      roundedBoxes[index].OpaqueBorderWidth = roundedBoxes[index].OpaqueBorderWidth * scaleX
      roundedBoxes[index].OpaqueBorderHeight = roundedBoxes[index].OpaqueBorderHeight * scaleY
    }
    let borders = frame.PerEdgeBorders
    for index in 0 ... frame.PerEdgeBorderCount {
      borders[index].Bounds = ScaleBounds(borders[index].Bounds, scaleX, scaleY)
      borders[index].TopWidth = borders[index].TopWidth * scaleY
      borders[index].RightWidth = borders[index].RightWidth * scaleX
      borders[index].BottomWidth = borders[index].BottomWidth * scaleY
      borders[index].LeftWidth = borders[index].LeftWidth * scaleX
      borders[index].RadiusTopLeft = ScaleRadius(borders[index].RadiusTopLeft, scaleX, scaleY)
      borders[index].RadiusTopRight = ScaleRadius(borders[index].RadiusTopRight, scaleX, scaleY)
      borders[index].RadiusBottomRight = ScaleRadius(borders[index].RadiusBottomRight, scaleX, scaleY)
      borders[index].RadiusBottomLeft = ScaleRadius(borders[index].RadiusBottomLeft, scaleX, scaleY)
    }
    let linearGradients = frame.LinearGradients
    for index in 0 ... frame.LinearGradientCount {
      linearGradients[index].Bounds = ScaleBounds(linearGradients[index].Bounds, scaleX, scaleY)
      linearGradients[index].RadiusTopLeft = ScaleRadius(linearGradients[index].RadiusTopLeft, scaleX, scaleY)
      linearGradients[index].RadiusTopRight = ScaleRadius(linearGradients[index].RadiusTopRight, scaleX, scaleY)
      linearGradients[index].RadiusBottomRight = ScaleRadius(linearGradients[index].RadiusBottomRight, scaleX, scaleY)
      linearGradients[index].RadiusBottomLeft = ScaleRadius(linearGradients[index].RadiusBottomLeft, scaleX, scaleY)
      linearGradients[index].StartX = linearGradients[index].StartX * scaleX
      linearGradients[index].StartY = linearGradients[index].StartY * scaleY
      linearGradients[index].EndX = linearGradients[index].EndX * scaleX
      linearGradients[index].EndY = linearGradients[index].EndY * scaleY
    }
    let radialGradients = frame.RadialGradients
    for index in 0 ... frame.RadialGradientCount {
      radialGradients[index].Bounds = ScaleBounds(radialGradients[index].Bounds, scaleX, scaleY)
      radialGradients[index].RadiusTopLeft = ScaleRadius(radialGradients[index].RadiusTopLeft, scaleX, scaleY)
      radialGradients[index].RadiusTopRight = ScaleRadius(radialGradients[index].RadiusTopRight, scaleX, scaleY)
      radialGradients[index].RadiusBottomRight = ScaleRadius(radialGradients[index].RadiusBottomRight, scaleX, scaleY)
      radialGradients[index].RadiusBottomLeft = ScaleRadius(radialGradients[index].RadiusBottomLeft, scaleX, scaleY)
      radialGradients[index].CenterX = radialGradients[index].CenterX * scaleX
      radialGradients[index].CenterY = radialGradients[index].CenterY * scaleY
      radialGradients[index].RadiusX = radialGradients[index].RadiusX * scaleX
      radialGradients[index].RadiusY = radialGradients[index].RadiusY * scaleY
    }
    for index in 0 ... frame.CachedImageCount {
      frame.CachedImages[index].Bounds = ScaleBounds(frame.CachedImages[index].Bounds, scaleX, scaleY)
    }
    let paths = frame.AnalyticPathBands
    for index in 0 ... frame.AnalyticPathBandCount {
      paths[index].Bounds = ScaleBounds(paths[index].Bounds, scaleX, scaleY)
      paths[index].ScaleX = paths[index].ScaleX * scaleX
      paths[index].ScaleY = paths[index].ScaleY * scaleY
      paths[index].TranslateX = paths[index].TranslateX * scaleX
      paths[index].TranslateY = paths[index].TranslateY * scaleY
    }
    for index in 0 ... frame.TransformCount {
      frame.Transforms[index].TX = frame.Transforms[index].TX * scaleX
      frame.Transforms[index].TY = frame.Transforms[index].TY * scaleY
    }
    for index in 0 ... frame.RectClipCount {
      frame.RectClips[index].Bounds = ScaleBounds(frame.RectClips[index].Bounds, scaleX, scaleY)
    }
    let clipMasks = frame.ClipMasks
    for index in 0 ... frame.ClipMaskCount {
      clipMasks[index].Bounds = ScaleBounds(clipMasks[index].Bounds, scaleX, scaleY)
      clipMasks[index].PathBounds = ScaleBounds(clipMasks[index].PathBounds, scaleX, scaleY)
      clipMasks[index].ScaleX = clipMasks[index].ScaleX * scaleX
      clipMasks[index].ScaleY = clipMasks[index].ScaleY * scaleY
      clipMasks[index].TranslateX = clipMasks[index].TranslateX * scaleX
      clipMasks[index].TranslateY = clipMasks[index].TranslateY * scaleY
      clipMasks[index].ContentKey = ScaleClipContentKey(clipMasks[index].ContentKey, scaleX, scaleY)
    }
    let shadows = frame.Shadows
    for index in 0 ... frame.ShadowCount {
      shadows[index].Bounds = ScaleBounds(shadows[index].Bounds, scaleX, scaleY)
      shadows[index].RadiusTopLeft = ScaleRadius(shadows[index].RadiusTopLeft, scaleX, scaleY)
      shadows[index].RadiusTopRight = ScaleRadius(shadows[index].RadiusTopRight, scaleX, scaleY)
      shadows[index].RadiusBottomRight = ScaleRadius(shadows[index].RadiusBottomRight, scaleX, scaleY)
      shadows[index].RadiusBottomLeft = ScaleRadius(shadows[index].RadiusBottomLeft, scaleX, scaleY)
      shadows[index].OffsetX = shadows[index].OffsetX * scaleX
      shadows[index].OffsetY = shadows[index].OffsetY * scaleY
      shadows[index].Spread = ScaleRadius(shadows[index].Spread, scaleX, scaleY)
      shadows[index].Blur = ScaleRadius(shadows[index].Blur, scaleX, scaleY)
    }
    for index in 0 ... frame.UnderlineCount {
      frame.Underlines[index].Bounds = ScaleBounds(frame.Underlines[index].Bounds, scaleX, scaleY)
      frame.Underlines[index].Thickness = ScaleRadius(frame.Underlines[index].Thickness, scaleX, scaleY)
    }
    for index in 0 ... frame.LavaCount {
      frame.Lavas[index].Bounds = ScaleBounds(frame.Lavas[index].Bounds, scaleX, scaleY)
    }
    let layers = frame.Layers
    for index in 0 ... frame.LayerCount {
      layers[index].Bounds = ScaleBounds(layers[index].Bounds, scaleX, scaleY)
      layers[index].OriginX = layers[index].OriginX * scaleX
      layers[index].OriginY = layers[index].OriginY * scaleY
      layers[index].ExtentWidth = uint32(MathF.Ceiling(float32(layers[index].ExtentWidth) * scaleX))
      layers[index].ExtentHeight = uint32(MathF.Ceiling(float32(layers[index].ExtentHeight) * scaleY))
    }
  }

  private func ScaleBounds(value ConservativeBounds, scaleX float32, scaleY float32) ConservativeBounds -> ConservativeBounds {
    X: value.X * scaleX,
    Y: value.Y * scaleY,
    Width: value.Width * scaleX,
    Height: value.Height * scaleY,
  }

  private func ScaleRadius(value float32, scaleX float32, scaleY float32) float32 -> value * (scaleX < scaleY ? scaleX : scaleY)

  private func ScaleClipContentKey(value uint64, scaleX float32, scaleY float32) uint64 {
    var hash = (value ^ uint64(uint32(BitConverter.SingleToInt32Bits(scaleX)))) *
    uint64(1099511628211)
    hash = (hash ^ uint64(uint32(BitConverter.SingleToInt32Bits(scaleY)))) *
    uint64(1099511628211)
    return hash
  }
}
