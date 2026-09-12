package Goo

import System

internal enum VulkanResourceState {
  Empty;
  Logical;
  Resident;
  Retiring;
}

internal data struct VulkanResourceSource {
  var ProviderId uint64
  var SourceId uint64
  var Version uint64
  var Bytes VkDeviceSize

  internal prop IsValid bool{
    get {
      return ProviderId != 0uL && SourceId != 0uL && Version != 0uL && Bytes != 0uL
    }
  }
}

internal data struct VulkanResourceEntry {
  var Id ResourceId
  var Source VulkanResourceSource
  var State VulkanResourceState
  var Bytes VkDeviceSize
  var GpuGeneration uint64
  var GpuHandle uint64
  var DescriptorSlot int32
  var UploadedVersion uint64
  var LastUseFence uint64
  var RetireFence uint64
  var Cacheable bool
}

internal data struct VulkanResourceRegistration {
  var Accepted bool
  var Existing bool
  var Index int32
}

internal data struct VulkanResourceLookup {
  var Found bool
  var Id ResourceId
  var Source VulkanResourceSource
  var State VulkanResourceState
  var Bytes VkDeviceSize
  var GpuGeneration uint64
  var GpuHandle uint64
  var DescriptorSlot int32
  var UploadedVersion uint64
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

internal unsafe class VulkanResourceRegistry {
  private const MaxCapacity int32 = 1048576

  private var entries []VulkanResourceEntry
  private let byteBudget VkDeviceSize
  private let logicalSourceBudget VkDeviceSize
  private var entryCount int32
  private var logicalCount int32
  private var residentCount int32
  private var retiringCount int32
  private var logicalBytes VkDeviceSize
  private var residentBytes VkDeviceSize
  private var retiredBytes VkDeviceSize
  private var logicalSourceBytes VkDeviceSize
  private var gpuGeneration uint64
  private var disposed bool

  internal prop GpuGeneration uint64{ get -> gpuGeneration }
  internal prop ByteBudget VkDeviceSize{ get -> byteBudget }
  internal prop LogicalSourceBudget VkDeviceSize{ get -> logicalSourceBudget }
  internal prop Stats VulkanResourceRegistryStats{
    get {
      return VulkanResourceRegistryStats{
        EntryCount: entryCount,
        LogicalCount: logicalCount,
        ResidentCount: residentCount,
        RetiringCount: retiringCount,
        LogicalBytes: logicalBytes,
        ResidentBytes: residentBytes,
        RetiredBytes: retiredBytes,
        LogicalSourceBytes: logicalSourceBytes,
        LogicalSourceBudget: logicalSourceBudget,
      }
    }
  }

  internal init(capacity int32, maximumResidentBytes VkDeviceSize,
    maximumLogicalSourceBytes VkDeviceSize) {
      if capacity <= 0 || capacity > MaxCapacity {
        throw ArgumentOutOfRangeException("capacity")
      }
      if maximumResidentBytes == 0uL {
        throw ArgumentOutOfRangeException("maximumResidentBytes")
      }
      if maximumLogicalSourceBytes == 0uL {
        throw ArgumentOutOfRangeException("maximumLogicalSourceBytes")
      }
      entries = [capacity]VulkanResourceEntry
      byteBudget = maximumResidentBytes
      logicalSourceBudget = maximumLogicalSourceBytes
    }

  internal func SetGpuGeneration(nextGeneration uint64) int32 {
    EnsureOpen()
    if nextGeneration == 0uL {
      throw ArgumentOutOfRangeException("nextGeneration")
    }
    if gpuGeneration == nextGeneration {
      return 0
    }
    if gpuGeneration != 0uL && nextGeneration < gpuGeneration {
      throw InvalidOperationException("Vulkan GPU generation must increase")
    }
    let invalidated = InvalidateResidentEntries()
    gpuGeneration = nextGeneration
    return invalidated
  }

  internal func Register(id ResourceId, bytes VkDeviceSize,
    source VulkanResourceSource, cacheable bool) VulkanResourceRegistration{
      EnsureOpen()
      ValidateId(id)
      if bytes == 0uL {
        throw ArgumentOutOfRangeException("bytes")
      }
      ValidateSource(id, source)
      let existingIndex = FindIndex(id)
      if existingIndex >= 0 {
        let existing = entries[existingIndex]
        if id.Version < existing.Id.Version {
          throw InvalidOperationException("Vulkan resource version must increase")
        }
        if existing.Id.Version != id.Version && existing.State != VulkanResourceState.Logical {
          throw InvalidOperationException("Vulkan resource version change requires retirement")
        }
        if existing.Bytes != bytes && existing.State != VulkanResourceState.Logical {
          throw InvalidOperationException("Resident Vulkan resource byte charge cannot change")
        }
        if !SameSource(existing.Source, source) && existing.State != VulkanResourceState.Logical {
          throw InvalidOperationException("Resident Vulkan resource source cannot change")
        }
        if !SameSource(existing.Source, source) {
          ValidateSourceCharge(existing.Source.Bytes, source.Bytes)
        }
        if existing.Bytes != bytes {
          logicalBytes -= existing.Bytes
          logicalBytes += bytes
        }
        if !SameSource(existing.Source, source) {
          ReplaceSourceCharge(existing.Source.Bytes, source.Bytes)
        }
        let updated = VulkanResourceEntry{
          Id: id,
          Source: source,
          State: existing.State,
          Bytes: bytes,
          GpuGeneration: existing.GpuGeneration,
          GpuHandle: existing.GpuHandle,
          DescriptorSlot: existing.DescriptorSlot,
          UploadedVersion: if existing.Id.Version == id.Version { existing.UploadedVersion } else { 0uL },
          LastUseFence: existing.LastUseFence,
          RetireFence: existing.RetireFence,
          Cacheable: cacheable,
        }
        entries[existingIndex] = updated
        return VulkanResourceRegistration{ Accepted: true, Existing: true, Index: existingIndex }
      }
      var freeIndex int32 = -1
      var index int32 = 0
      while index < entries.Length {
        if entries[index].State == VulkanResourceState.Empty {
          freeIndex = index
          break
        }
        index++
      }
      if freeIndex < 0 {
        freeIndex = entries.Length
        EnsureEntryCapacity(freeIndex + 1)
      }
      AddSourceCharge(source.Bytes)
      entries[freeIndex] = VulkanResourceEntry{
        Id: id,
        Source: source,
        State: VulkanResourceState.Logical,
        Bytes: bytes,
        GpuGeneration: 0uL,
        GpuHandle: 0uL,
        DescriptorSlot: -1,
        UploadedVersion: 0uL,
        LastUseFence: 0uL,
        RetireFence: 0uL,
        Cacheable: cacheable,
      }
      entryCount++
      logicalCount++
      logicalBytes += bytes
      return VulkanResourceRegistration{ Accepted: true, Existing: false, Index: freeIndex }
    }

  internal func PublishGpu(id ResourceId, generation uint64, gpuHandle uint64,
    descriptorSlot int32) {
      EnsureOpen()
      ValidateId(id)
      if generation == 0uL || generation != gpuGeneration {
        throw InvalidOperationException("Vulkan resource generation is stale")
      }
      if gpuHandle == 0uL {
        throw ArgumentOutOfRangeException("gpuHandle")
      }
      let index = FindIndex(id)
      if index < 0 {
        throw InvalidOperationException("Vulkan resource is not registered")
      }
      var entry = entries[index]
      if entry.State == VulkanResourceState.Retiring {
        throw InvalidOperationException("Vulkan resource is retiring")
      }
      if entry.State == VulkanResourceState.Resident {
        if entry.GpuGeneration != generation
          || entry.GpuHandle != gpuHandle
          || entry.DescriptorSlot != descriptorSlot{
            throw InvalidOperationException("Vulkan resource GPU publication conflicts with resident binding")
          }
        return
      }
      if entry.Bytes > byteBudget || residentBytes > byteBudget - entry.Bytes {
        throw InvalidOperationException("Vulkan resource byte budget exceeded")
      }
      entry.State = VulkanResourceState.Resident
      entry.GpuGeneration = generation
      entry.GpuHandle = gpuHandle
      entry.DescriptorSlot = descriptorSlot
      entry.UploadedVersion = 0uL
      entries[index] = entry
      logicalCount--
      residentCount++
      logicalBytes -= entry.Bytes
      residentBytes += entry.Bytes
    }

  internal func MarkUploaded(id ResourceId, generation uint64) {
    EnsureOpen()
    let index = FindIndex(id)
    if index < 0 {
      throw InvalidOperationException("Vulkan resource is not registered")
    }
    var entry = entries[index]
    if entry.State != VulkanResourceState.Resident
      || entry.GpuGeneration != generation
      || generation != gpuGeneration{
        throw InvalidOperationException("Vulkan resource is not resident in the requested generation")
      }
    entry.UploadedVersion = id.Version
    entries[index] = entry
  }

  internal func Lookup(id ResourceId, generation uint64) VulkanResourceLookup {
    if disposed || !id.IsValid || generation == 0uL {
      return VulkanResourceLookup{ Found: false }
    }
    let index = FindIndex(id)
    if index < 0 {
      return VulkanResourceLookup{ Found: false }
    }
    let entry = entries[index]
    if entry.State != VulkanResourceState.Resident
      || entry.GpuGeneration != generation
      || generation != gpuGeneration{
        return VulkanResourceLookup{ Found: false }
      }
    return VulkanResourceLookup{
      Found: true,
      Id: entry.Id,
      Source: entry.Source,
      State: entry.State,
      Bytes: entry.Bytes,
      GpuGeneration: entry.GpuGeneration,
      GpuHandle: entry.GpuHandle,
      DescriptorSlot: entry.DescriptorSlot,
      UploadedVersion: entry.UploadedVersion,
    }
  }

  internal func CopyLogicalResources(destination []VulkanLogicalResource) int32 {
    EnsureOpen()
    var count int32 = 0
    var index int32 = 0
    while index < entries.Length {
      if entries[index].State == VulkanResourceState.Logical {
        count++
      }
      index++
    }
    if destination.Length < count {
      throw ArgumentException("Logical resource destination is too small", "destination")
    }
    var output int32 = 0
    index = 0
    while index < entries.Length {
      let entry = entries[index]
      if entry.State == VulkanResourceState.Logical {
        destination[output] = VulkanLogicalResource{
          Id: entry.Id,
          Source: entry.Source,
          Bytes: entry.Bytes,
          Cacheable: entry.Cacheable,
        }
        output++
      }
      index++
    }
    return count
  }

  internal func MarkUsed(id ResourceId, generation uint64, fence uint64) {
    EnsureOpen()
    let index = FindIndex(id)
    if index < 0 {
      throw InvalidOperationException("Vulkan resource is not registered")
    }
    var entry = entries[index]
    if entry.State != VulkanResourceState.Resident
      || entry.GpuGeneration != generation
      || generation != gpuGeneration{
        throw InvalidOperationException("Vulkan resource is not resident in the requested generation")
      }
    if fence > entry.LastUseFence {
      entry.LastUseFence = fence
    }
    entries[index] = entry
  }

  internal func Retire(id ResourceId, fence uint64) bool {
    EnsureOpen()
    let index = FindIndex(id)
    if index < 0 {
      return false
    }
    var entry = entries[index]
    if entry.State == VulkanResourceState.Retiring {
      if fence > entry.RetireFence {
        entry.RetireFence = fence
        entries[index] = entry
      }
      return true
    }
    if entry.State != VulkanResourceState.Resident {
      return false
    }
    let retireFence = if fence > entry.LastUseFence { fence } else { entry.LastUseFence }
    entry.State = VulkanResourceState.Retiring
    entry.RetireFence = retireFence
    entries[index] = entry
    residentCount--
    retiringCount++
    residentBytes -= entry.Bytes
    retiredBytes += entry.Bytes
    return true
  }

  internal func Collect(completedFence uint64) int32 {
    EnsureOpen()
    var collected int32 = 0
    var index int32 = 0
    while index < entries.Length {
      let entry = entries[index]
      if entry.State == VulkanResourceState.Retiring && entry.RetireFence <= completedFence {
        if entry.Cacheable {
          retiringCount--
          retiredBytes -= entry.Bytes
          entries[index] = VulkanResourceEntry{
            Id: entry.Id,
            Source: entry.Source,
            State: VulkanResourceState.Logical,
            Bytes: entry.Bytes,
            GpuGeneration: 0uL,
            GpuHandle: 0uL,
            DescriptorSlot: -1,
            UploadedVersion: 0uL,
            LastUseFence: 0uL,
            RetireFence: 0uL,
            Cacheable: entry.Cacheable,
          }
          logicalCount++
          logicalBytes += entry.Bytes
        } else {
          ClearEntry(index, entry)
        }
        collected++
      }
      index++
    }
    return collected
  }

  internal func DropLogical(id ResourceId) bool {
    EnsureOpen()
    let index = FindIndex(id)
    if index < 0 {
      return false
    }
    let entry = entries[index]
    if entry.State != VulkanResourceState.Logical {
      return false
    }
    ClearEntry(index, entry)
    return true
  }

  public func Dispose() {
    if disposed {
      return
    }
    disposed = true
    var index int32 = 0
    while index < entries.Length {
      entries[index] = VulkanResourceEntry{}
      index++
    }
    entryCount = 0
    logicalCount = 0
    residentCount = 0
    retiringCount = 0
    logicalBytes = 0uL
    residentBytes = 0uL
    retiredBytes = 0uL
    logicalSourceBytes = 0uL
  }

  deinit{
    Dispose()
  }

  private func InvalidateResidentEntries() int32 {
    var invalidated int32 = 0
    var index int32 = 0
    while index < entries.Length {
      let entry = entries[index]
      if entry.State == VulkanResourceState.Resident {
        residentCount--
        residentBytes -= entry.Bytes
        logicalCount++
        logicalBytes += entry.Bytes
        entries[index] = VulkanResourceEntry{
          Id: entry.Id,
          Source: entry.Source,
          State: VulkanResourceState.Logical,
          Bytes: entry.Bytes,
          GpuGeneration: 0uL,
          GpuHandle: 0uL,
          DescriptorSlot: -1,
          UploadedVersion: 0uL,
          LastUseFence: 0uL,
          RetireFence: 0uL,
          Cacheable: entry.Cacheable,
        }
        invalidated++
      } else if entry.State == VulkanResourceState.Retiring {
        retiringCount--
        retiredBytes -= entry.Bytes
        logicalCount++
        logicalBytes += entry.Bytes
        entries[index] = VulkanResourceEntry{
          Id: entry.Id,
          Source: entry.Source,
          State: VulkanResourceState.Logical,
          Bytes: entry.Bytes,
          GpuGeneration: 0uL,
          GpuHandle: 0uL,
          DescriptorSlot: -1,
          UploadedVersion: 0uL,
          LastUseFence: 0uL,
          RetireFence: 0uL,
          Cacheable: entry.Cacheable,
        }
        invalidated++
      }
      index++
    }
    return invalidated
  }

  private func ClearEntry(index int32, entry VulkanResourceEntry) {
    if entry.State == VulkanResourceState.Logical {
      logicalCount--
      logicalBytes -= entry.Bytes
    } else if entry.State == VulkanResourceState.Resident {
      residentCount--
      residentBytes -= entry.Bytes
    } else if entry.State == VulkanResourceState.Retiring {
      retiringCount--
      retiredBytes -= entry.Bytes
    }
    logicalSourceBytes -= entry.Source.Bytes
    entryCount--
    entries[index] = VulkanResourceEntry{}
  }

  private func FindIndex(id ResourceId) int32 {
    if !id.IsValid {
      return -1
    }
    var index int32 = 0
    while index < entries.Length {
      let entry = entries[index]
      if entry.State != VulkanResourceState.Empty
        && entry.Id.Kind == id.Kind
        && entry.Id.LogicalId == id.LogicalId
        && entry.Id.Version == id.Version{
          return index
        }
      index++
    }
    return -1
  }

  private func EnsureEntryCapacity(required int32) {
    if required <= entries.Length {
      return
    }
    if required > MaxCapacity {
      throw InvalidOperationException("Vulkan logical resource metadata hard limit exceeded")
    }
    var capacity = entries.Length
    while capacity < required {
      if capacity > MaxCapacity / 2 {
        capacity = MaxCapacity
      } else {
        capacity = capacity * 2
      }
    }
    let next = [capacity]VulkanResourceEntry
    Array.Copy(entries, next, entries.Length)
    entries = next
  }

  private func ValidateId(id ResourceId) {
    if !id.IsValid {
      throw ArgumentException("ResourceId is invalid", "id")
    }
  }

  private func ValidateSource(id ResourceId, source VulkanResourceSource) {
    if !source.IsValid || source.Version != id.Version {
      throw ArgumentException("Vulkan resource source is invalid", "source")
    }
  }

  private func SameSource(left VulkanResourceSource, right VulkanResourceSource) bool -> left.ProviderId == right.ProviderId
    && left.SourceId == right.SourceId
    && left.Version == right.Version
    && left.Bytes == right.Bytes

  private func AddSourceCharge(bytes VkDeviceSize) {
    if bytes > logicalSourceBudget || logicalSourceBytes > logicalSourceBudget - bytes {
      throw InvalidOperationException("Vulkan logical source byte budget exceeded")
    }
    logicalSourceBytes += bytes
  }

  private func ReplaceSourceCharge(oldBytes VkDeviceSize, newBytes VkDeviceSize) {
    let withoutOld = logicalSourceBytes - oldBytes
    logicalSourceBytes = withoutOld + newBytes
  }

  private func ValidateSourceCharge(oldBytes VkDeviceSize, newBytes VkDeviceSize) {
    let withoutOld = logicalSourceBytes - oldBytes
    if newBytes > logicalSourceBudget || withoutOld > logicalSourceBudget - newBytes {
      throw InvalidOperationException("Vulkan logical source byte budget exceeded")
    }
  }

  private func EnsureOpen() {
    if disposed {
      throw ObjectDisposedException("VulkanResourceRegistry")
    }
  }
}
