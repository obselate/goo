package Goo

import System

internal unsafe partial class VulkanImageResources : IDisposable {
  private func DescriptorSlot(index int32, samplerMode VulkanImageSamplerMode) int32 {
    if index < 0 || index >= capacity {
      return -1
    }
    let modeOffset = if samplerMode == VulkanImageSamplerMode.Nearest { 0 } else { 1 }
    return index + index + modeOffset
  }

  private func EnsureDescriptorSlots(index int32) {
    let nearestSlot = DescriptorSlot(index, VulkanImageSamplerMode.Nearest)
    let linearSlot = DescriptorSlot(index, VulkanImageSamplerMode.Linear)
    if nearestSlot < 0 || nearestSlot >= descriptorCapacity
      || linearSlot < 0 || linearSlot >= descriptorCapacity
      || descriptorSets[nearestSlot] == 0uL
      || descriptorSets[linearSlot] == 0uL {
        throw InvalidOperationException("Vulkan image descriptor capacity reached")
      }
    if entries[index].State != VulkanImageResourceState.Empty {
      throw InvalidOperationException("Vulkan image descriptor slot is still in use")
    }
  }

  private func DescriptorFor(
    entry VulkanImageResourceEntry,
    samplerId ResourceId,
    samplerMode VulkanImageSamplerMode) VulkanImageDescriptorBinding{
      let binding = if samplerMode == VulkanImageSamplerMode.Nearest {
        entry.NearestDescriptor
      } else {
        entry.LinearDescriptor
      }
      if !entry.GpuPublished
        || binding.State == VulkanImageDescriptorState.Empty
        || binding.Generation != generation
        || !SameSource(binding.ImageId, entry.Id)
        || !SameSource(binding.SamplerId, samplerId)
        || binding.SamplerMode != samplerMode
        || binding.DescriptorToken != uint64(entry.ImageView)
        || binding.Slot < 0 || binding.Slot >= descriptorCapacity
        || descriptorSets[binding.Slot] == 0uL {
          return VulkanImageDescriptorBinding{}
        }
      return binding
    }

  private func RetireDescriptors(
    entry VulkanImageResourceEntry,
    fence uint64) VulkanImageResourceEntry{
      var updated = entry
      updated.NearestDescriptor = RetireDescriptor(
        entry.NearestDescriptor, entry.Id, entry.SamplerId,
        VulkanImageSamplerMode.Nearest, entry.ImageView, fence)
      updated.LinearDescriptor = RetireDescriptor(
        entry.LinearDescriptor, entry.Id, entry.SamplerId,
        VulkanImageSamplerMode.Linear, entry.ImageView, fence)
      return updated
    }

  private func RetireDescriptor(
    binding VulkanImageDescriptorBinding,
    imageId ResourceId,
    samplerId ResourceId,
    samplerMode VulkanImageSamplerMode,
    imageView VkImageView,
    fence uint64) VulkanImageDescriptorBinding{
      if binding.State == VulkanImageDescriptorState.Empty
        || binding.Generation != generation
        || !SameSource(binding.ImageId, imageId)
        || !SameSource(binding.SamplerId, samplerId)
        || binding.SamplerMode != samplerMode
        || binding.DescriptorToken != uint64(imageView)
        || binding.Slot < 0 || binding.Slot >= descriptorCapacity
        || descriptorSets[binding.Slot] == 0uL {
          throw InvalidOperationException("Vulkan image descriptor is stale")
        }
      var updated = binding
      if binding.State == VulkanImageDescriptorState.Retiring {
        if fence > updated.RetireFence {
          updated.RetireFence = fence
        }
        return updated
      }
      if binding.State != VulkanImageDescriptorState.Bound {
        throw InvalidOperationException("Vulkan image descriptor is not bound")
      }
      updated.State = VulkanImageDescriptorState.Retiring
      updated.RetireFence = fence
      return updated
    }

  private func CurrentBoundDescriptorCount() int32 {
    var count int32 = 0
    var index int32 = 0
    while index < entries.Length {
      let entry = entries[index]
      if entry.NearestDescriptor.State == VulkanImageDescriptorState.Bound {
        count++
      }
      if entry.LinearDescriptor.State == VulkanImageDescriptorState.Bound {
        count++
      }
      index++
    }
    return count
  }

  private func CurrentRetiringDescriptorCount() int32 {
    var count int32 = 0
    var index int32 = 0
    while index < entries.Length {
      let entry = entries[index]
      if entry.NearestDescriptor.State == VulkanImageDescriptorState.Retiring {
        count++
      }
      if entry.LinearDescriptor.State == VulkanImageDescriptorState.Retiring {
        count++
      }
      index++
    }
    return count
  }

  private func SameSource(left ResourceId, right ResourceId) bool -> left.Kind == right.Kind
    && left.LogicalId == right.LogicalId
    && left.Version == right.Version

  private func SameLogical(left ResourceId, right ResourceId) bool -> left.Kind == right.Kind && left.LogicalId == right.LogicalId

  private func SameSource(entry VulkanImageResourceEntry, source VulkanResourceSource) bool {
    let registered = registry.Lookup(entry.Id, generation)
    if registered.Found {
      return registered.Source.ProviderId == source.ProviderId
        && registered.Source.SourceId == source.SourceId
        && registered.Source.Version == source.Version
        && registered.Source.Bytes == source.Bytes
    }
    let count = CopyLogicalResources()
    var index int32 = 0
    while index < count {
      let logical = logicalRecords[index]
      if SameSource(logical.Id, entry.Id) {
        return logical.Source.ProviderId == source.ProviderId
          && logical.Source.SourceId == source.SourceId
          && logical.Source.Version == source.Version
          && logical.Source.Bytes == source.Bytes
      }
      index++
    }
    return false
  }

  private func CopyLogicalResources() int32 {
    let required = registry.Stats.LogicalCount
    if logicalRecords.Length < required {
      var capacity = logicalRecords.Length
      while capacity < required {
        if capacity > Int32.MaxValue / 2 {
          capacity = required
        } else {
          capacity = capacity * 2
        }
      }
      logicalRecords = [capacity]VulkanLogicalResource
    }
    return registry.CopyLogicalResources(logicalRecords)
  }

  private func RetireFence(entry VulkanImageResourceEntry, fence uint64) uint64 {
    var safeFence = fence
    if entry.LastUseFence > safeFence {
      safeFence = entry.LastUseFence
    }
    if entry.UploadSubmitted && entry.UploadFence > safeFence {
      safeFence = entry.UploadFence
    }
    if entry.RetireFence > safeFence {
      safeFence = entry.RetireFence
    }
    return safeFence
  }

  private func TouchValue() uint64 {
    let value = nextTouch
    if nextTouch == uint64.MaxValue {
      nextTouch = 1uL
    } else {
      nextTouch++
    }
    return value
  }

  private func CurrentLiveObjectHandleCount() uint64 {
    var count uint64 = uint64(liveCount) * 2uL
    if stagingBuffer != 0uL {
      count++
    }
    if descriptorPools.Count > 0 {
      count += uint64(descriptorPools.Count) + uint64(trackedDescriptorSetCount)
    }
    if descriptorSetLayout != 0uL {
      count++
    }
    if nearestSampler != 0uL {
      count++
    }
    if linearSampler != 0uL {
      count++
    }
    return count
  }

  private func Unpremultiply(value uint8, alpha uint8) uint8 {
    let numerator = uint32(value) * 255u + uint32(alpha) / 2u
    let result = numerator / uint32(alpha)
    if result > 255u {
      return uint8(255)
    }
    return uint8(result)
  }

  private func FindExactIndex(id ResourceId) int32 {
    var index int32 = 0
    while index < entries.Length {
      let entry = entries[index]
      if entry.State != VulkanImageResourceState.Empty
        && entry.Id.Kind == id.Kind && entry.Id.LogicalId == id.LogicalId
        && entry.Id.Version == id.Version{
          return index
        }
      index++
    }
    return -1
  }

  private func ImageBytes(width uint32, height uint32) VkDeviceSize {
    if width == 0u || height == 0u {
      throw ArgumentOutOfRangeException("width")
    }
    let widthBytes = uint64(width) * 4uL
    if uint64(height) > uint64.MaxValue / widthBytes {
      throw OverflowException("Vulkan image byte size overflow")
    }
    let bytes = widthBytes * uint64(height)
    if bytes > MaxStagingBytes {
      throw ArgumentOutOfRangeException("height")
    }
    return VkDeviceSize(bytes)
  }

  private func ValidateImageId(id ResourceId) {
    if !id.IsValid || id.Kind != SceneResourceKind.Image {
      throw ArgumentException("ResourceId is not an image", "id")
    }
  }

  private func ValidateSamplerId(id ResourceId) {
    if !id.IsValid || id.Kind != SceneResourceKind.Sampler {
      throw ArgumentException("ResourceId is not a sampler", "samplerId")
    }
  }

  private func ValidateGeneration(expectedGeneration uint64) {
    if expectedGeneration == 0uL || expectedGeneration != generation {
      throw InvalidOperationException("Vulkan image generation is stale")
    }
  }

  private func EnsureOpen() {
    if disposed {
      throw ObjectDisposedException("VulkanImageResources")
    }
  }
}
