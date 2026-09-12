package Goo

import System

internal data struct VulkanResourceSource {
  var ProviderId uint64
  var SourceId uint64
  var Version uint64
  var Bytes VkDeviceSize

  internal prop IsValid bool{
    get -> ProviderId != 0uL && SourceId != 0uL && Version != 0uL && Bytes != 0uL
  }
}

internal data struct VulkanLogicalResource {
  var Id ResourceId
  var Source VulkanResourceSource
  var Bytes VkDeviceSize
  var Cacheable bool
}

internal data struct VulkanResourceRegistryStats {
  var EntryCount int32
  var LogicalCount int32
  var ResidentCount int32
  var RetiringCount int32
  var LogicalBytes VkDeviceSize
  var ResidentBytes VkDeviceSize
  var RetiredBytes VkDeviceSize
  var LogicalSourceBytes VkDeviceSize
  var LogicalSourceBudget VkDeviceSize
}

internal data struct VulkanImageLogicalRecord {
  var Id ResourceId
  var ProviderId uint64
  var SourceId uint64
  var Bytes VkDeviceSize
  var PhysicalSlot int32
  var Cacheable bool
}

internal unsafe partial class VulkanImageResources : IDisposable {
  private func PrepareLogicalRegistration(
    id ResourceId,
    source VulkanResourceSource) int32{
      if !source.IsValid || source.Version != id.Version {
        throw ArgumentException("Vulkan resource source is invalid", "source")
      }
      let existingIndex = FindLogicalIndex(id)
      if existingIndex >= 0 {
        let existing = logicalRecords[existingIndex]
        if existing.PhysicalSlot >= 0 {
          throw InvalidOperationException("Vulkan image logical resource already has a physical slot")
        }
        ValidateLogicalSourceCharge(existing.Bytes, source.Bytes)
        return existingIndex
      }
      let index = FindEmptyLogicalIndex()
      ValidateLogicalSourceCharge(0uL, source.Bytes)
      return index
    }

  private func CommitLogicalRegistration(
    logicalIndex int32,
    physicalIndex int32,
    id ResourceId,
    bytes VkDeviceSize,
    source VulkanResourceSource,
    cacheable bool) {
      let existing = logicalRecords[logicalIndex]
      if existing.Id.IsValid {
        logicalStats.LogicalBytes = logicalStats.LogicalBytes - existing.Bytes + bytes
        logicalStats.LogicalSourceBytes = logicalStats.LogicalSourceBytes - existing.Bytes + source.Bytes
      } else {
        logicalStats.EntryCount++
        logicalStats.LogicalCount++
        logicalStats.LogicalBytes += bytes
        logicalStats.LogicalSourceBytes += source.Bytes
      }
      logicalRecords[logicalIndex] = VulkanImageLogicalRecord{
        Id: id,
        ProviderId: source.ProviderId,
        SourceId: source.SourceId,
        Bytes: bytes,
        PhysicalSlot: physicalIndex,
        Cacheable: cacheable,
      }
    }

  private func LogicalIndexForPhysical(
    physicalIndex int32,
    entry VulkanImageResourceEntry) int32{
      let logicalIndex = FindLogicalIndex(entry.Id)
      if logicalIndex < 0 {
        throw InvalidOperationException("Vulkan image logical resource is missing")
      }
      let logical = logicalRecords[logicalIndex]
      if logical.PhysicalSlot != physicalIndex
        || logical.Bytes != entry.Bytes
        || logical.ProviderId != entry.ProviderId
        || logical.SourceId != entry.SourceId
        || logical.Cacheable != entry.Cacheable{
          throw InvalidOperationException("Vulkan image logical resource attachment is stale")
        }
      return logicalIndex
    }

  private func PublishLogical(logicalIndex int32) {
    let logical = logicalRecords[logicalIndex]
    logicalStats.LogicalCount--
    logicalStats.ResidentCount++
    logicalStats.LogicalBytes -= logical.Bytes
    logicalStats.ResidentBytes += logical.Bytes
  }

  private func RetireLogical(logicalIndex int32) {
    let logical = logicalRecords[logicalIndex]
    logicalStats.ResidentCount--
    logicalStats.RetiringCount++
    logicalStats.ResidentBytes -= logical.Bytes
    logicalStats.RetiredBytes += logical.Bytes
  }

  private func CompleteLogicalRetirement(
    logicalIndex int32,
    entry VulkanImageResourceEntry) {
      let logical = logicalRecords[logicalIndex]
      let retain = entry.Cacheable && !entry.DropLogicalOnRetire
      if entry.GpuPublished {
        logicalStats.RetiringCount--
        logicalStats.RetiredBytes -= logical.Bytes
        if retain {
          logicalStats.LogicalCount++
          logicalStats.LogicalBytes += logical.Bytes
        }
      } else if !retain {
        logicalStats.LogicalCount--
        logicalStats.LogicalBytes -= logical.Bytes
      }
      if retain {
        var retained = logical
        retained.PhysicalSlot = -1
        logicalRecords[logicalIndex] = retained
      } else {
        logicalStats.EntryCount--
        logicalStats.LogicalSourceBytes -= logical.Bytes
        logicalRecords[logicalIndex] = VulkanImageLogicalRecord{}
      }
    }

  private func ValidateLogicalAttachments() {
    for index in 0 ... logicalRecords.Length {
      let logical = logicalRecords[index]
      if logical.Id.IsValid && logical.PhysicalSlot >= 0 {
        let physicalIndex = logical.PhysicalSlot
        if physicalIndex >= entries.Length {
          throw InvalidOperationException("Vulkan image logical resource attachment is stale")
        }
        let entry = entries[physicalIndex]
        if !SameSource(entry.Id, logical.Id)
          || entry.Bytes != logical.Bytes
          || entry.ProviderId != logical.ProviderId
          || entry.SourceId != logical.SourceId
          || entry.Cacheable != logical.Cacheable{
            throw InvalidOperationException("Vulkan image logical resource attachment is stale")
          }
      }
    }
  }

  private func DetachLogicalResources() {
    var totalBytes VkDeviceSize = 0uL
    for index in 0 ... logicalRecords.Length {
      var logical = logicalRecords[index]
      if logical.Id.IsValid {
        logical.PhysicalSlot = -1
        logicalRecords[index] = logical
        totalBytes += logical.Bytes
      }
    }
    logicalStats.LogicalCount = logicalStats.EntryCount
    logicalStats.ResidentCount = 0
    logicalStats.RetiringCount = 0
    logicalStats.LogicalBytes = totalBytes
    logicalStats.ResidentBytes = 0uL
    logicalStats.RetiredBytes = 0uL
  }

  private func ClearLogicalResources() {
    Array.Clear(logicalRecords, 0, logicalRecords.Length)
    logicalStats = VulkanResourceRegistryStats{
      LogicalSourceBudget: logicalStats.LogicalSourceBudget,
    }
  }

  private func FindLogicalIndex(id ResourceId) int32 {
    if !id.IsValid {
      return -1
    }
    for index in 0 ... logicalRecords.Length {
      if SameSource(logicalRecords[index].Id, id) {
        return index
      }
    }
    return -1
  }

  private func FindEmptyLogicalIndex() int32 {
    for index in 0 ... logicalRecords.Length {
      if !logicalRecords[index].Id.IsValid {
        return index
      }
    }
    let empty = logicalRecords.Length
    if empty == MaxCapacity {
      throw InvalidOperationException("Vulkan logical resource metadata hard limit exceeded")
    }
    let capacity = if empty > MaxCapacity / 2 {
      MaxCapacity
    } else {
      empty * 2
    }
    let next = [capacity]VulkanImageLogicalRecord
    Array.Copy(logicalRecords, next, empty)
    logicalRecords = next
    return empty
  }

  private func ValidateLogicalSourceCharge(oldBytes VkDeviceSize, newBytes VkDeviceSize) {
    let withoutOld = logicalStats.LogicalSourceBytes - oldBytes
    if newBytes > logicalStats.LogicalSourceBudget
      || withoutOld > logicalStats.LogicalSourceBudget - newBytes{
        throw InvalidOperationException("Vulkan logical source byte budget exceeded")
      }
  }
}
