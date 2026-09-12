package Goo.VulkanProof

import Goo

internal class ShadowPixelSceneContract {
  const Width uint32 = 64u
  const Height uint32 = 64u
  const ExpectedDigest uint64 = 17773420855745740137uL
  const ClearColor uint32 = 0x0000FFFFu
  const FillColor uint32 = 0xE09040FFu
}

internal func BuildShadowPixelScene(frame SceneFrame, version uint64) {
  if frame == nil {
    throw ArgumentNullException("frame")
  }
  if version == 0uL {
    throw ArgumentOutOfRangeException("version")
  }
  frame.ResetForReuse()
  let bounds = ConservativeBounds{
    X: 20.0F,
    Y: 20.0F,
    Width: 24.0F,
    Height: 20.0F,
  }
  let sceneBounds = ConservativeBounds{
    X: 0.0F,
    Y: 0.0F,
    Width: float32(ShadowPixelSceneContract.Width),
    Height: float32(ShadowPixelSceneContract.Height),
  }
  frame.BeginChunk(0x534841444F575049uL, version, sceneBounds, true)
  frame.AddShadow(ShadowRecord{
    Bounds: bounds,
    RadiusTopLeft: 6.0F,
    RadiusTopRight: 6.0F,
    RadiusBottomRight: 6.0F,
    RadiusBottomLeft: 6.0F,
    OffsetX: 3.0F,
    OffsetY: 4.0F,
    Spread: 2.0F,
    Blur: 4.0F,
    Color: 0x000000C0u,
    MaskId: ResourceId{ Kind: SceneResourceKind.None, LogicalId: 0uL, Version: 0uL },
    MaskIndex: -1,
    Inset: false,
    TransformIndex: -1,
  })
  frame.AddRoundedBox(RoundedBoxRecord{
    Bounds: bounds,
    RadiusTopLeft: 6.0F,
    RadiusTopRight: 6.0F,
    RadiusBottomRight: 6.0F,
    RadiusBottomLeft: 6.0F,
    Color: ShadowPixelSceneContract.FillColor,
    Opacity: 1.0F,
    TransformIndex: -1,
  })
  frame.EndChunk()
}

internal func ShadowPixelSceneSemanticDigest(frame SceneFrame) uint64 {
  if frame == nil {
    throw ArgumentNullException("frame")
  }
  return frame.SemanticDigest()
}

internal unsafe func VerifyShadowPixelSceneReadback(
  readback * uint8,
  width uint32,
  height uint32) bool{
    if readback == nil || width < ShadowPixelSceneContract.Width || height < ShadowPixelSceneContract.Height {
      return false
    }
    if !ShadowPixelSceneFill(readback, width, 32, 30) {
      return false
    }
    if !ShadowPixelSceneHalo(readback, width, 47, 30) {
      return false
    }
    if !ShadowPixelSceneHalo(readback, width, 32, 44) {
      return false
    }
    if !ShadowPixelSceneClear(readback, width, 17, 17) {
      return false
    }
    if !ShadowPixelSceneClear(readback, width, 10, 10) {
      return false
    }
    return true
  }

private unsafe func ShadowPixelSceneFill(
  readback * uint8,
  width uint32,
  x int32,
  y int32) bool{
    let offset = ShadowPixelOffset(width, x, y)
    let red = int32(readback[offset])
    let green = int32(readback[offset + 1])
    let blue = int32(readback[offset + 2])
    return red >= 160 && red >= green + 24 && red >= blue + 64
  }

private unsafe func ShadowPixelSceneHalo(
  readback * uint8,
  width uint32,
  x int32,
  y int32) bool{
    let offset = ShadowPixelOffset(width, x, y)
    let blue = int32(readback[offset + 2])
    return blue <= 224 && readback[offset + 3] >= 240u
  }

private unsafe func ShadowPixelSceneClear(
  readback * uint8,
  width uint32,
  x int32,
  y int32) bool{
    let offset = ShadowPixelOffset(width, x, y)
    return readback[offset] <= 8u
      && readback[offset + 1] <= 8u
      && readback[offset + 2] >= 247u
      && readback[offset + 3] >= 247u
  }

private func ShadowPixelOffset(width uint32, x int32, y int32) int32 {
  let cells = uint64(y) * uint64(width) + uint64(x)
  return int32(cells * 4uL)
}
