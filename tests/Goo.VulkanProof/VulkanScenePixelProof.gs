package Goo.VulkanProof

internal class PixelSceneContract {
  const Width uint32 = 64u
  const Height uint32 = 64u
  const ExpectedDigest uint64 = 13590187435474851814uL
  const ClearColor uint32 = 0x0000FFFFu
  const BackgroundColor uint32 = 0x000000FFu
  const SolidColor uint32 = 0xFF0000FFu
  const RoundedColor uint32 = 0x00FF00FFu
  const BorderTopColor uint32 = 0xFF0000FFu
  const BorderRightColor uint32 = 0x00FF00FFu
  const BorderBottomColor uint32 = 0x0000FFFFu
  const BorderLeftColor uint32 = 0xFFFFFFFFu
  const UnderlineColor uint32 = 0xFFFFFFFFu
}

internal func ResetPixelScene(frame SceneFrame) {
  if frame == nil {
    throw ArgumentNullException("frame")
  }
  frame.ResetForReuse()
}

internal func BuildPixelScene(frame SceneFrame, version uint64) {
  if frame == nil {
    throw ArgumentNullException("frame")
  }
  if version == 0uL {
    throw ArgumentOutOfRangeException("version")
  }
  ResetPixelScene(frame)
  let sceneBounds = ConservativeBounds{
    X: 0.0F,
    Y: 0.0F,
    Width: float32(PixelSceneContract.Width),
    Height: float32(PixelSceneContract.Height),
  }
  frame.BeginChunk(0x5343454E45504958uL, version, sceneBounds, true)
  let translated = frame.AddTransform(TransformRecord{
    A: 1.0F,
    B: 0.0F,
    C: 0.0F,
    D: 1.0F,
    TX: 1.0F,
    TY: 1.0F,
    ParentIndex: -1,
  })
  let outerClip = frame.AddRectClipBegin(RectClipRecord{
    Bounds: ConservativeBounds{ X: 2.0F, Y: 2.0F, Width: 58.0F, Height: 58.0F },
    TransformIndex: -1,
    ParentIndex: -1,
  })
  frame.AddRectClipBegin(RectClipRecord{
    Bounds: ConservativeBounds{ X: 4.0F, Y: 4.0F, Width: 52.0F, Height: 52.0F },
    TransformIndex: -1,
    ParentIndex: outerClip,
  })
  frame.AddSolidBox(SolidBoxRecord{
    Bounds: sceneBounds,
    Color: PixelSceneContract.BackgroundColor,
    Opacity: 1.0F,
    TransformIndex: -1,
  })
  frame.AddSolidBox(SolidBoxRecord{
    Bounds: ConservativeBounds{ X: 6.0F, Y: 7.0F, Width: 10.0F, Height: 8.0F },
    Color: PixelSceneContract.SolidColor,
    Opacity: 1.0F,
    TransformIndex: translated,
  })
  frame.AddRoundedBox(RoundedBoxRecord{
    Bounds: ConservativeBounds{ X: 21.0F, Y: 7.0F, Width: 14.0F, Height: 10.0F },
    RadiusTopLeft: 3.0F,
    RadiusTopRight: 3.0F,
    RadiusBottomRight: 3.0F,
    RadiusBottomLeft: 3.0F,
    Color: PixelSceneContract.RoundedColor,
    Opacity: 1.0F,
    TransformIndex: -1,
  })
  frame.AddRoundedBox(RoundedBoxRecord{
    Bounds: ConservativeBounds{ X: 7.75F, Y: 18.75F, Width: 6.0F, Height: 6.0F },
    RadiusTopLeft: 3.0F,
    RadiusTopRight: 3.0F,
    RadiusBottomRight: 3.0F,
    RadiusBottomLeft: 3.0F,
    Color: PixelSceneContract.RoundedColor,
    Opacity: 1.0F,
    TransformIndex: -1,
  })
  frame.AddPerEdgeBorder(PerEdgeBorderRecord{
    Bounds: ConservativeBounds{ X: 40.0F, Y: 7.0F, Width: 14.0F, Height: 10.0F },
    TopWidth: 2.0F,
    RightWidth: 2.0F,
    BottomWidth: 2.0F,
    LeftWidth: 2.0F,
    TopColor: PixelSceneContract.BorderTopColor,
    RightColor: PixelSceneContract.BorderRightColor,
    BottomColor: PixelSceneContract.BorderBottomColor,
    LeftColor: PixelSceneContract.BorderLeftColor,
    Style: 0u,
    TransformIndex: -1,
  })
  frame.AddPerEdgeBorder(PerEdgeBorderRecord{
    Bounds: ConservativeBounds{ X: 5.0F, Y: 42.0F, Width: 14.0F, Height: 12.0F },
    TopWidth: 2.0F,
    RightWidth: 2.0F,
    BottomWidth: 2.0F,
    LeftWidth: 2.0F,
    RadiusTopLeft: 4.0F,
    RadiusTopRight: 4.0F,
    RadiusBottomRight: 4.0F,
    RadiusBottomLeft: 4.0F,
    TopColor: PixelSceneContract.BorderTopColor,
    RightColor: PixelSceneContract.BorderRightColor,
    BottomColor: PixelSceneContract.BorderBottomColor,
    LeftColor: PixelSceneContract.BorderLeftColor,
    Style: 0u,
    TransformIndex: -1,
  })
  frame.AddPerEdgeBorder(PerEdgeBorderRecord{
    Bounds: ConservativeBounds{ X: 23.0F, Y: 42.0F, Width: 14.0F, Height: 12.0F },
    TopWidth: 2.0F,
    RightWidth: 2.0F,
    BottomWidth: 2.0F,
    LeftWidth: 2.0F,
    RadiusTopLeft: 4.0F,
    RadiusTopRight: 4.0F,
    RadiusBottomRight: 4.0F,
    RadiusBottomLeft: 4.0F,
    TopColor: PixelSceneContract.BorderTopColor,
    RightColor: PixelSceneContract.BorderRightColor,
    BottomColor: PixelSceneContract.BorderBottomColor,
    LeftColor: PixelSceneContract.BorderLeftColor,
    Style: 1u,
    TransformIndex: -1,
  })
  frame.AddPerEdgeBorder(PerEdgeBorderRecord{
    Bounds: ConservativeBounds{ X: 41.0F, Y: 42.0F, Width: 14.0F, Height: 12.0F },
    TopWidth: 3.0F,
    RightWidth: 3.0F,
    BottomWidth: 3.0F,
    LeftWidth: 3.0F,
    RadiusTopLeft: 4.0F,
    RadiusTopRight: 4.0F,
    RadiusBottomRight: 4.0F,
    RadiusBottomLeft: 4.0F,
    TopColor: PixelSceneContract.BorderTopColor,
    RightColor: PixelSceneContract.BorderRightColor,
    BottomColor: PixelSceneContract.BorderBottomColor,
    LeftColor: PixelSceneContract.BorderLeftColor,
    Style: 2u,
    TransformIndex: -1,
  })
  frame.AddUnderline(UnderlineRecord{
    Bounds: ConservativeBounds{ X: 43.0F, Y: 20.0F, Width: 10.0F, Height: 2.0F },
    Thickness: 2.0F,
    Color: PixelSceneContract.UnderlineColor,
    Mode: 0u,
    TransformIndex: -1,
  })
  let linearStart = frame.GradientStopCount
  frame.AddGradientStop(GradientStopRecord{ Offset: 0.0F, Color: PixelSceneContract.BorderTopColor })
  frame.AddGradientStop(GradientStopRecord{ Offset: 0.5F, Color: PixelSceneContract.BorderRightColor })
  frame.AddGradientStop(GradientStopRecord{ Offset: 0.75F, Color: PixelSceneContract.BorderBottomColor })
  frame.AddGradientStop(GradientStopRecord{ Offset: 1.0F, Color: PixelSceneContract.BorderBottomColor })
  frame.AddLinearGradient(LinearGradientRecord{
    Bounds: ConservativeBounds{ X: 6.0F, Y: 25.0F, Width: 16.0F, Height: 10.0F },
    RadiusTopLeft: 5.0F,
    RadiusTopRight: 2.0F,
    RadiusBottomRight: 2.0F,
    RadiusBottomLeft: 2.0F,
    StartX: 6.0F,
    StartY: 30.0F,
    EndX: 22.0F,
    EndY: 30.0F,
    StopStart: linearStart,
    StopCount: 4,
    Opacity: 1.0F,
    TransformIndex: -1,
  })
  let radialStart = frame.GradientStopCount
  frame.AddGradientStop(GradientStopRecord{ Offset: 0.0F, Color: 0xFFFF00FFu })
  frame.AddGradientStop(GradientStopRecord{ Offset: 1.0F, Color: PixelSceneContract.BorderBottomColor })
  frame.AddRadialGradient(RadialGradientRecord{
    Bounds: ConservativeBounds{ X: 27.0F, Y: 25.0F, Width: 18.0F, Height: 16.0F },
    RadiusTopLeft: 5.0F,
    RadiusTopRight: 2.0F,
    RadiusBottomRight: 2.0F,
    RadiusBottomLeft: 2.0F,
    CenterX: 36.0F,
    CenterY: 33.0F,
    RadiusX: 9.0F,
    RadiusY: 8.0F,
    StopStart: radialStart,
    StopCount: 2,
    Opacity: 1.0F,
    TransformIndex: -1,
  })
  frame.AddRectClipEnd(RectClipRecord{
    Bounds: ConservativeBounds{ X: 4.0F, Y: 4.0F, Width: 52.0F, Height: 52.0F },
    TransformIndex: -1,
    ParentIndex: outerClip,
  })
  frame.AddRectClipEnd(RectClipRecord{
    Bounds: ConservativeBounds{ X: 2.0F, Y: 2.0F, Width: 58.0F, Height: 58.0F },
    TransformIndex: -1,
    ParentIndex: -1,
  })
  frame.EndChunk()
}

internal func PixelSceneSemanticDigest(frame SceneFrame) uint64 {
  if frame == nil {
    throw ArgumentNullException("frame")
  }
  return frame.SemanticDigest()
}

internal unsafe func PixelSceneReadbackDigest(readback * uint8, width uint32, height uint32) uint64 {
  if readback == nil || width < PixelSceneContract.Width || height < PixelSceneContract.Height {
    throw ArgumentException("invalid Vulkan scene readback")
  }
  var hash uint64 = 14695981039346656037uL
  var y uint32 = 0u
  while y < PixelSceneContract.Height {
    var x uint32 = 0u
    while x < PixelSceneContract.Width {
      let offset = uint64(y) * uint64(width) * 4uL + uint64(x) * 4uL
      hash = (hash ^ uint64(readback[offset])) * 1099511628211uL
      hash = (hash ^ uint64(readback[offset + 1uL])) * 1099511628211uL
      hash = (hash ^ uint64(readback[offset + 2uL])) * 1099511628211uL
      hash = (hash ^ uint64(readback[offset + 3uL])) * 1099511628211uL
      x++
    }
    y++
  }
  return hash
}

internal unsafe func VerifyPixelSceneReadback(
  readback * uint8,
  width uint32,
  height uint32) bool -> VerifyPixelSceneReadbackWithClear(readback, width, height, PixelSceneContract.ClearColor)

internal unsafe func VerifyPixelSceneReadbackWithClear(
  readback * uint8,
  width uint32,
  height uint32,
  clearColor uint32) bool{
    if readback == nil || width < PixelSceneContract.Width || height < PixelSceneContract.Height {
      return false
    }
    if !ExactPixel(readback, width, 3, 3, clearColor) {
      return false
    }
    if !ExactPixel(readback, width, 5, 5, PixelSceneContract.BackgroundColor) {
      return false
    }
    if !ExactPixel(readback, width, 10, 11, PixelSceneContract.SolidColor) {
      return false
    }
    if !ExactPixel(readback, width, 28, 12, PixelSceneContract.RoundedColor) {
      return false
    }
    if !FractionalRoundedEdge(readback, width) {
      return false
    }
    if !ExactPixel(readback, width, 47, 8, PixelSceneContract.BorderTopColor) {
      return false
    }
    if !ExactPixel(readback, width, 52, 12, PixelSceneContract.BorderRightColor) {
      return false
    }
    if !ExactPixel(readback, width, 47, 15, PixelSceneContract.BorderBottomColor) {
      return false
    }
    if !ExactPixel(readback, width, 41, 12, PixelSceneContract.BorderLeftColor) {
      return false
    }
    if !Dominant(readback, width, 12, 43, 0, 1, 2, 32) {
      return false
    }
    if !RoundedBorderCornerAntialias(readback, width) {
      return false
    }
    if !Dominant(readback, width, 26, 43, 0, 1, 2, 32) {
      return false
    }
    if !DimmedCorner(readback, width, 32, 43) {
      return false
    }
    if !Dominant(readback, width, 42, 43, 0, 1, 2, 32) {
      return false
    }
    if !DimmedCorner(readback, width, 46, 43) {
      return false
    }
    if !ExactPixel(readback, width, 47, 20, PixelSceneContract.UnderlineColor) {
      return false
    }
    if !DimmedCorner(readback, width, 6, 25) {
      return false
    }
    if !DimmedCorner(readback, width, 27, 25) {
      return false
    }
    if !Dominant(readback, width, 7, 30, 0, 1, 2, 32) {
      return false
    }
    if !Dominant(readback, width, 14, 30, 1, 0, 2, 32) {
      return false
    }
    if !Dominant(readback, width, 20, 30, 2, 0, 1, 32) {
      return false
    }
    if !YellowCenter(readback, width, 36, 33) {
      return false
    }
    if !Dominant(readback, width, 28, 33, 2, 0, 1, 24) {
      return false
    }
    if !Dominant(readback, width, 43, 33, 2, 0, 1, 24) {
      return false
    }
    return true
  }

private unsafe func ExactPixel(
  readback * uint8,
  width uint32,
  x int32,
  y int32,
  expected uint32) bool{
    let offset = PixelOffset(width, x, y)
    let packed = int32(expected)
    return readback[offset] == uint8((packed >> int32(24)) & int32(255))
      && readback[offset + 1] == uint8((packed >> int32(16)) & int32(255))
      && readback[offset + 2] == uint8((packed >> int32(8)) & int32(255))
      && readback[offset + 3] == uint8(packed & int32(255))
  }

private unsafe func DimmedCorner(
  readback * uint8,
  width uint32,
  x int32,
  y int32) bool{
    let offset = PixelOffset(width, x, y)
    return readback[offset] <= 64u
      && readback[offset + 1] <= 64u
      && readback[offset + 2] <= 64u
  }
private unsafe func RoundedBorderCornerAntialias(
  readback * uint8,
  width uint32) bool{
    let cornerOffset = PixelOffset(width, 5, 43)
    let outerEdgeOffset = PixelOffset(width, 5, 46)
    let innerEdgeOffset = PixelOffset(width, 6, 46)
    return readback[cornerOffset] >= 64u && readback[cornerOffset] <= 160u
      && readback[cornerOffset + 1] >= 64u && readback[cornerOffset + 1] <= 160u
      && readback[cornerOffset + 2] >= 64u && readback[cornerOffset + 2] <= 160u
      && readback[outerEdgeOffset] >= 240u
      && readback[outerEdgeOffset + 1] >= 240u
      && readback[outerEdgeOffset + 2] >= 240u
      && readback[innerEdgeOffset] >= 240u
      && readback[innerEdgeOffset + 1] >= 240u
      && readback[innerEdgeOffset + 2] >= 240u
  }

private unsafe func FractionalRoundedEdge(
  readback * uint8,
  width uint32) bool{
    let exterior = PixelOffset(width, 10, 18)
    let interior = PixelOffset(width, 10, 19)
    return readback[exterior] <= 8u
      && readback[exterior + 1] >= 8u
      && readback[exterior + 1] <= 240u
      && readback[exterior + 2] <= 8u
      && readback[interior + 1] >= 240u
  }

private unsafe func Dominant(
  readback * uint8,
  width uint32,
  x int32,
  y int32,
  winner int32,
  loserA int32,
  loserB int32,
  margin int32) bool{
    let offset = PixelOffset(width, x, y)
    var values = stackalloc[3]int32
    values[0] = int32(readback[offset])
    values[1] = int32(readback[offset + 1])
    values[2] = int32(readback[offset + 2])
    return values[winner] >= values[loserA] + margin
      && values[winner] >= values[loserB] + margin
  }

private unsafe func YellowCenter(
  readback * uint8,
  width uint32,
  x int32,
  y int32) bool{
    let offset = PixelOffset(width, x, y)
    let red = int32(readback[offset])
    let green = int32(readback[offset + 1])
    let blue = int32(readback[offset + 2])
    return red >= blue + 32 && green >= blue + 32
  }

private func PixelOffset(width uint32, x int32, y int32) int32 {
  let cells = uint64(y) * uint64(width) + uint64(x)
  return int32(cells * 4uL)
}
