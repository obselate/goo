package Goo

import System

internal partial class SceneFrame {
  internal prop ViewportBounds ConservativeBounds{ get; set; }

  private func LayerCaptureReference(index int32) int32 {
    let value = layers[index]
    if value.ReferenceIndex >= 0 { return value.ReferenceIndex }
    for candidateIndex in Math.Max(0, index - 1) ... Math.Min(layerCount, index + 2) {
      let candidate = layers[candidateIndex]
      if (candidate.Flags & uint32(LayerRecordFlags.BorrowsParentBackdrop)) != 0u
        && candidate.OffscreenTargetId.LogicalId == value.OffscreenTargetId.LogicalId
        && candidate.OriginX == value.OriginX && candidate.OriginY == value.OriginY
        && candidate.ExtentWidth == value.ExtentWidth && candidate.ExtentHeight == value.ExtentHeight {
          return candidate.ReferenceIndex
        }
    }
    return -1
  }

  private func PlaceLayer(index int32, value LayerRecord) LayerRecord {
    let scroll = ScrollOffset(value.TransformIndex)
    if scroll.X == 0.0F && scroll.Y == 0.0F { return value }
    var result = value
    let referenceIndex = LayerCaptureReference(index)
    let paint = referenceIndex >= 0 ? layerCoverage[referenceIndex].PaintBounds : value.Bounds
    result.Bounds = paint
    result.Bounds.X -= scroll.X
    result.Bounds.Y -= scroll.Y
    var left = result.Bounds.X
    var top = result.Bounds.Y
    var right = result.Bounds.Right
    var bottom = result.Bounds.Bottom
    if !ViewportBounds.IsEmpty {
      left = MathF.Max(left, ViewportBounds.X)
      top = MathF.Max(top, ViewportBounds.Y)
      right = MathF.Max(left, MathF.Min(right, ViewportBounds.Right))
      bottom = MathF.Max(top, MathF.Min(bottom, ViewportBounds.Bottom))
    }
    if referenceIndex >= 0 {
      let reference = layerCoverage[referenceIndex].Bounds
      left -= MathF.Max(0.0F, reference.X - value.OriginX)
      top -= MathF.Max(0.0F, reference.Y - value.OriginY)
      right += MathF.Max(0.0F, value.OriginX + float32(value.ExtentWidth) - reference.Right)
      bottom += MathF.Max(0.0F, value.OriginY + float32(value.ExtentHeight) - reference.Bottom)
    }
    result.OriginX = MathF.Floor(left)
    result.OriginY = MathF.Floor(top)
    result.ExtentWidth = uint32(MathF.Max(1.0F, MathF.Ceiling(right) - result.OriginX))
    result.ExtentHeight = uint32(MathF.Max(1.0F, MathF.Ceiling(bottom) - result.OriginY))
    return result
  }

  internal func SetTransformNodeLimit(nodes int32) {
    transformCapacityLimit = int32(Math.Min(int64(Int32.MaxValue), int64(nodes) * 3L))
  }

  internal func TrimTransformCapacity(nodes int32) {
    SetTransformNodeLimit(nodes)
    if transformCount > transformCapacityLimit {
      throw InvalidOperationException("Scene transform count exceeds the live-node bound")
    }
    if transforms.Length <= transformCapacityLimit { return }
    let values = transformCapacityLimit == 0
      ? Array.Empty[TransformRecord]() : [transformCapacityLimit]TransformRecord
    Array.Copy(transforms, values, transformCount)
    transforms = values
  }

  private func GrowTransforms(required int32) {
    if required > transformCapacityLimit {
      throw InvalidOperationException("Scene transform growth exceeds the live-node bound")
    }
    if required <= transforms.Length { return }
    let capacity = Math.Min(transformCapacityLimit,
      ArrayGrowthCapacity(transforms.Length, required, 1))
    let values = [capacity]TransformRecord
    Array.Copy(transforms, values, transformCount)
    transforms = values
    growthOperations++
  }

  internal func ScrollOffset(index int32) ScrollTranslation {
    var result ScrollTranslation
    var steps int32
    var current = index
    while current >= 0 {
      if current >= transformCount || steps >= transformCount {
        throw InvalidOperationException("Vulkan scene transform chain is invalid")
      }
      let value = transforms[current]
      if value.IsScrollPlacement {
        result.X += value.TX
        result.Y += value.TY
        result.PixelX += value.ScrollPixelX
        result.PixelY += value.ScrollPixelY
      }
      current = value.ParentIndex
      steps++
    }
    if current != -1 {
      throw InvalidOperationException("Vulkan scene transform parent is invalid")
    }
    return result
  }
}
