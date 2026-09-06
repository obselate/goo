package Goo.VulkanProof

import System
import Goo

internal class VulkanImageE2EContract {
  const Width uint32 = 64u
  const Height uint32 = 64u
  const ImageLogicalId uint64 = 7771uL
  const SamplerLogicalId uint64 = 7772uL
  const OpaqueBackdropColor uint32 = 0x204080FFu
}

internal func VulkanImageResourceIdVersion(version uint64) ResourceId -> ResourceId {
  Kind: SceneResourceKind.Image,
  LogicalId: VulkanImageE2EContract.ImageLogicalId,
  Version: version,
}

internal func VulkanImageResourceId() ResourceId -> VulkanImageResourceIdVersion(2uL)

internal func VulkanImageSamplerId() ResourceId -> ResourceId {
  Kind: SceneResourceKind.Sampler,
  LogicalId: VulkanImageE2EContract.SamplerLogicalId,
  Version: 1uL,
}

internal func BuildVulkanImageScene(frame SceneFrame, sampling uint32) {
  if frame == nil {
    throw ArgumentNullException("frame")
  }
  if sampling > 1u {
    throw ArgumentOutOfRangeException("sampling")
  }
  frame.ResetForReuse()
  frame.BeginChunk(0x494D414745454E44uL, 1uL, ConservativeBounds{
    X: 0.0F,
    Y: 0.0F,
    Width: float32(VulkanImageE2EContract.Width),
    Height: float32(VulkanImageE2EContract.Height),
  }, true)
  frame.AddSolidBox(SolidBoxRecord{
    Bounds: ConservativeBounds{ X: 40.0F, Y: 16.0F, Width: 4.0F, Height: 16.0F },
    Color: VulkanImageE2EContract.OpaqueBackdropColor,
    Opacity: 1.0F,
    TransformIndex: -1,
  })
  frame.AddCachedImage(CachedImageRefRecord{
    Bounds: ConservativeBounds{ X: 16.0F, Y: 16.0F, Width: 32.0F, Height: 32.0F },
    ImageId: VulkanImageResourceId(),
    SamplerId: VulkanImageSamplerId(),
    SourceX: 0.0F,
    SourceY: 0.0F,
    SourceWidth: 1.0F,
    SourceHeight: 1.0F,
    Opacity: 1.0F,
    Sampling: sampling,
    TransformIndex: -1,
  })
  frame.EndChunk()
}

internal unsafe func VulkanImageReadbackDigest(readback * uint8, width uint32, height uint32) uint64 {
  if readback == nil || width < VulkanImageE2EContract.Width || height < VulkanImageE2EContract.Height {
    throw ArgumentException("invalid Vulkan image readback")
  }
  var hash uint64 = 14695981039346656037uL
  var y uint32 = 0u
  while y < VulkanImageE2EContract.Height {
    var x uint32 = 0u
    while x < VulkanImageE2EContract.Width {
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

internal unsafe func VerifyVulkanImageReadback(readback * uint8, width uint32, height uint32) bool {
  if readback == nil || width < VulkanImageE2EContract.Width || height < VulkanImageE2EContract.Height {
    return false
  }
  if !VulkanImageNearRegion(readback, width, 0, 0, 16, 64, 0, 0, 0, 0, 0)
    || !VulkanImageNearRegion(readback, width, 48, 0, 16, 64, 0, 0, 0, 0, 0)
    || !VulkanImageNearRegion(readback, width, 16, 0, 32, 16, 0, 0, 0, 0, 0)
    || !VulkanImageNearRegion(readback, width, 16, 48, 32, 16, 0, 0, 0, 0, 0) {
      return false
    }
  if !VulkanImageNearRegion(readback, width, 16, 16, 15, 15, 0, 0, 255, 255, 4)
    || !VulkanImageNearRegion(readback, width, 16, 33, 15, 15, 0, 255, 0, 255, 4)
    || !VulkanImageNearRegion(readback, width, 33, 33, 15, 15, 0, 0, 0, 0, 0) {
      return false
    }
  if !VulkanImageNearRegion(readback, width, 33, 16, 7, 15, 188, 92, 0, 128, 4)
    || !VulkanImageNearRegion(readback, width, 44, 16, 4, 15, 188, 92, 0, 128, 4) {
      return false
    }
  if !VulkanImageNearRegion(readback, width, 40, 16, 4, 15, 189, 102, 92, 255, 4) {
    return false
  }
  return true
}

internal unsafe func VerifyVulkanImageLinearReadback(
  readback * uint8,
  width uint32,
  height uint32) bool{
    if readback == nil || width < VulkanImageE2EContract.Width
      || height < VulkanImageE2EContract.Height{
        return false
      }
    if !VulkanImageNearRegion(readback, width, 0, 0, 16, 64, 0, 0, 0, 0, 0)
      || !VulkanImageNearRegion(readback, width, 48, 0, 16, 64, 0, 0, 0, 0, 0)
      || !VulkanImageNearRegion(readback, width, 16, 0, 32, 16, 0, 0, 0, 0, 0)
      || !VulkanImageNearRegion(readback, width, 16, 48, 32, 16, 0, 0, 0, 0, 0) {
        return false
      }
    if !VulkanImageNearRegion(readback, width, 16, 16, 8, 8, 0, 0, 255, 255, 4)
      || !VulkanImageNearRegion(readback, width, 16, 40, 8, 8, 0, 255, 0, 255, 4)
      || !VulkanImageNearRegion(readback, width, 40, 40, 8, 8, 0, 0, 0, 0, 0) {
        return false
      }
    if !VulkanImageNearRegion(readback, width, 44, 16, 4, 8, 188, 92, 0, 128, 4)
      || !VulkanImageNearRegion(readback, width, 40, 16, 4, 8, 189, 102, 92, 255, 4) {
        return false
      }
    return true
  }

private unsafe func VulkanImageNearPixel(
  readback * uint8,
  width uint32,
  x int32,
  y int32,
  red int32,
  green int32,
  blue int32,
  alpha int32,
  tolerance int32) bool{
    let offset = uint64(y) * uint64(width) * 4uL + uint64(x) * 4uL
    let redDelta = int32(readback[offset]) - red
    let greenDelta = int32(readback[offset + 1uL]) - green
    let blueDelta = int32(readback[offset + 2uL]) - blue
    let alphaDelta = int32(readback[offset + 3uL]) - alpha
    return redDelta >= -tolerance && redDelta <= tolerance
      && greenDelta >= -tolerance && greenDelta <= tolerance
      && blueDelta >= -tolerance && blueDelta <= tolerance
      && alphaDelta >= -tolerance && alphaDelta <= tolerance
  }

private unsafe func VulkanImageNearRegion(
  readback * uint8,
  width uint32,
  x int32,
  y int32,
  regionWidth int32,
  regionHeight int32,
  red int32,
  green int32,
  blue int32,
  alpha int32,
  tolerance int32) bool{
    var currentY = y
    while currentY < y + regionHeight {
      var currentX = x
      while currentX < x + regionWidth {
        if !VulkanImageNearPixel(readback, width, currentX, currentY,
          red, green, blue, alpha, tolerance) {
            return false
          }
        currentX++
      }
      currentY++
    }
    return true
  }
