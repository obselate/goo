package Goo

import System

internal data struct VulkanTextAtlasSetStats {
  var AtlasCount int32
  var ByteSize VkDeviceSize
  var ResidentByteSize VkDeviceSize
  var MaxAtlasCount int32
  var LiveObjectCount uint64
  var UploadPending bool
  var UploadRecorded bool
  var UploadSubmitted bool
  var UploadByteCount VkDeviceSize
  var EvictionCount uint64
  var RetirementCount uint64
}

internal unsafe sealed partial class VulkanTextAtlasSet : IDisposable {
  internal const InitialAtlasSlotCount int32 = 32
  private let device VkDevice
  private let dispatch VkDeviceDispatch
  private let allocator VulkanMemoryAllocator
  private let atlasByteSize VkDeviceSize
  private let generation uint64
  private let maxTexelBufferElements uint32
  private let descriptorSetLayout VkDescriptorSetLayout
  private let objectAccounting VulkanObjectAccounting?
  private let diagnostics VulkanDiagnostics?
  private var atlases []VulkanTextAtlas?
  private var identities []ResourceId
  private var lastUseSerial []uint64
  private var lastTouch []uint64
  private var active []bool
  private var atlasCount int32
  private var currentAtlasIndex int32
  private var nextLogicalId uint64 = 1uL
  private var nextVersion uint64 = 1uL
  private var nextTouch uint64 = 1uL
  private var residentByteSize VkDeviceSize
  private var uploadByteCount VkDeviceSize
  private var publishedVersion uint64
  private var evictionCount uint64
  private var retirementCount uint64
  private var disposed bool
  private var cache VulkanGpuCache? = nil

  internal prop AtlasSlotCapacity int32{ get -> atlases.Length }
  internal prop AtlasCount int32{ get -> atlasCount }
  internal prop CurrentAtlasIndex int32{ get -> currentAtlasIndex }
  internal prop ResidentByteSize VkDeviceSize{ get -> residentByteSize }
  internal prop Generation uint64{ get -> generation }
  internal prop DescriptorSetLayout VkDescriptorSetLayout{
    get -> descriptorSetLayout
  }
  internal prop Stats VulkanTextAtlasSetStats{
    get {
      var byteSize VkDeviceSize = 0uL
      var liveObjectCount uint64 = 0uL
      var uploadPending bool = false
      var uploadRecorded bool = false
      var uploadSubmitted bool = false
      var index int32 = 0
      while index < atlases.Length {
        if active[index] {
          let stats = AtlasAt(index).Stats
          if stats.ByteSize > uint64.MaxValue - byteSize {
            throw OverflowException("Vulkan text atlas byte size overflow")
          }
          if stats.LiveObjectCount > uint64.MaxValue - liveObjectCount {
            throw OverflowException("Vulkan text atlas object count overflow")
          }
          byteSize = byteSize + stats.ByteSize
          liveObjectCount = liveObjectCount + stats.LiveObjectCount
          uploadPending = uploadPending || stats.UploadPending
          uploadRecorded = uploadRecorded || stats.UploadRecorded
          uploadSubmitted = uploadSubmitted || stats.UploadSubmitted
        }
        index++
      }
      return VulkanTextAtlasSetStats{
        AtlasCount: atlasCount,
        ByteSize: byteSize,
        ResidentByteSize: residentByteSize,
        MaxAtlasCount: atlases.Length,
        LiveObjectCount: liveObjectCount,
        UploadPending: uploadPending,
        UploadRecorded: uploadRecorded,
        UploadSubmitted: uploadSubmitted,
        UploadByteCount: uploadByteCount,
        EvictionCount: evictionCount,
        RetirementCount: retirementCount,
      }
    }
  }

  internal init(
    nativeDevice VkDevice,
    nativeDispatch VkDeviceDispatch,
    nativeAllocator VulkanMemoryAllocator,
    nativeAtlasByteSize VkDeviceSize,
    nativeMaxTexelBufferElements uint32,
    nativeDescriptorSetLayout VkDescriptorSetLayout,
    nativeObjectAccounting VulkanObjectAccounting?,
    nativeDiagnostics VulkanDiagnostics?,
    nativeGeneration uint64) {
      if nativeDevice == nint(0) {
        throw ArgumentException("Vulkan device is null", "nativeDevice")
      }
      if nativeAtlasByteSize == 0uL || nativeMaxTexelBufferElements == 0u
        || nativeGeneration == 0uL {
          throw ArgumentOutOfRangeException("nativeAtlasByteSize")
        }
      if nativeDescriptorSetLayout == 0uL {
        throw ArgumentException("Vulkan text atlas descriptor layout is null", "nativeDescriptorSetLayout")
      }
      device = nativeDevice
      dispatch = nativeDispatch
      allocator = nativeAllocator
      objectAccounting = nativeObjectAccounting
      diagnostics = nativeDiagnostics
      atlasByteSize = nativeAtlasByteSize
      generation = nativeGeneration
      maxTexelBufferElements = nativeMaxTexelBufferElements
      descriptorSetLayout = nativeDescriptorSetLayout
      atlases = [InitialAtlasSlotCount]VulkanTextAtlas?
      identities = [InitialAtlasSlotCount]ResourceId
      lastUseSerial = [InitialAtlasSlotCount]uint64
      lastTouch = [InitialAtlasSlotCount]uint64
      active = [InitialAtlasSlotCount]bool
      currentAtlasIndex = -1
      CreateAtlas()
    }

  internal func AtlasAt(index int32) VulkanTextAtlas {
    EnsureOpen()
    if index < 0 || index >= atlases.Length || !active[index] {
      throw ArgumentOutOfRangeException("index")
    }
    guard let value = atlases[index] else {
      throw InvalidOperationException("Vulkan text atlas slot is empty")
    }
    return value
  }

  internal func IdentityAt(index int32) ResourceId {
    EnsureOpen()
    if index < 0 || index >= atlases.Length || !active[index] {
      throw ArgumentOutOfRangeException("index")
    }
    return identities[index]
  }

  internal func IsActive(index int32) bool {
    EnsureOpen()
    if index < 0 || index >= atlases.Length {
      throw ArgumentOutOfRangeException("index")
    }
    return active[index]
  }

  internal func CreateAtlas() int32 {
    EnsureOpen()
    var index int32 = 0
    while index < atlases.Length && active[index] {
      index = index + 1
    }
    if index >= atlases.Length {
      let capacity = checked(atlases.Length * 2)
      Array.Resize(ref atlases, capacity)
      Array.Resize(ref identities, capacity)
      Array.Resize(ref lastUseSerial, capacity)
      Array.Resize(ref lastTouch, capacity)
      Array.Resize(ref active, capacity)
    }
    let touch = TouchValue()
    let identity = NextIdentity()
    let created = VulkanTextAtlas(device, dispatch, allocator, atlasByteSize,
      maxTexelBufferElements, descriptorSetLayout, objectAccounting)
    atlases[index] = created
    if let current = cache { created.Track(current, index) }
    identities[index] = identity
    lastUseSerial[index] = 0uL
    lastTouch[index] = touch
    active[index] = true
    if atlasCount == Int32.MaxValue {
      active[index] = false
      identities[index] = ResourceId{}
      lastUseSerial[index] = 0uL
      lastTouch[index] = 0uL
      created.Dispose()
      throw OverflowException("Vulkan text atlas count overflow")
    }
    if residentByteSize > uint64.MaxValue - atlasByteSize {
      active[index] = false
      identities[index] = ResourceId{}
      lastUseSerial[index] = 0uL
      lastTouch[index] = 0uL
      created.Dispose()
      throw OverflowException("Vulkan text atlas resident byte size overflow")
    }
    atlasCount = atlasCount + 1
    residentByteSize = residentByteSize + atlasByteSize
    currentAtlasIndex = index
    return index
  }

  internal func FindReclaimable(completedSerial uint64, protectedSlots []bool) int32 {
    EnsureOpen()
    if protectedSlots.Length < atlases.Length {
      throw ArgumentException("protectedSlots")
    }
    var candidate int32 = -1
    var candidateTouch uint64 = uint64.MaxValue
    var index int32 = 0
    while index < atlases.Length {
      if active[index] && index != currentAtlasIndex && !protectedSlots[index]
        && lastUseSerial[index] <= completedSerial{
          let stats = atlases[index]!!.Stats
          if !stats.UploadPending && !stats.UploadRecorded && !stats.UploadSubmitted
            && lastTouch[index] < candidateTouch{
              candidate = index
              candidateTouch = lastTouch[index]
            }
        }
      index = index + 1
    }
    return candidate
  }

  internal func RecycleAtlas(index int32, completedSerial uint64) ResourceId {
    EnsureOpen()
    if index < 0 || index >= atlases.Length || !active[index]
      || index == currentAtlasIndex{
        throw ArgumentOutOfRangeException("index")
      }
    if lastUseSerial[index] > completedSerial {
      throw InvalidOperationException("Vulkan text atlas is still in use")
    }
    let oldAtlas = atlases[index]!!
    let oldStats = oldAtlas.Stats
    if oldStats.UploadPending || oldStats.UploadRecorded || oldStats.UploadSubmitted {
      throw InvalidOperationException("Vulkan text atlas has pending work")
    }
    if evictionCount == uint64.MaxValue || retirementCount == uint64.MaxValue {
      throw OverflowException("Vulkan text atlas lifecycle counter overflow")
    }
    let touch = TouchValue()
    let identity = NextReplacementIdentity(identities[index])
    oldAtlas.Dispose()
    atlases[index] = nil
    active[index] = false
    try {
      let replacement = VulkanTextAtlas(device, dispatch, allocator, atlasByteSize,
        maxTexelBufferElements, descriptorSetLayout, objectAccounting)
      atlases[index] = replacement
      if let current = cache { replacement.Track(current, index) }
    } catch (error Exception) {
      identities[index] = ResourceId{}
      lastUseSerial[index] = 0uL
      lastTouch[index] = 0uL
      if atlasCount <= 0 || residentByteSize < atlasByteSize {
        throw InvalidOperationException("Vulkan text atlas accounting underflow")
      }
      atlasCount = atlasCount - 1
      residentByteSize = residentByteSize - atlasByteSize
      currentAtlasIndex = FindCurrentIndex()
      throw error
    }
    identities[index] = identity
    lastUseSerial[index] = 0uL
    lastTouch[index] = touch
    active[index] = true
    currentAtlasIndex = index
    evictionCount = evictionCount + 1uL
    retirementCount = retirementCount + 1uL
    if let currentDiagnostics = diagnostics {
      currentDiagnostics.AddTextAtlasEviction(1uL)
      currentDiagnostics.AddTextAtlasRetirement(1uL)
    }
    return identity
  }

  /// <summary>Registers every page with the cache that evicts it. Pages created later register on creation.</summary>
  internal func TrackAtlases(nativeCache VulkanGpuCache) {
    cache = nativeCache
    for index in 0 ... atlases.Length {
      if active[index] { atlases[index]!!.Track(nativeCache, index) }
    }
  }

  internal func LastUseSerial(index int32) uint64 -> lastUseSerial[index]

  internal func RecordPressureFailure() {
    diagnostics?.AddTextAtlasPressureFailure(1uL)
  }

  internal func CanRetireAtlas(index int32, completedSerial uint64) bool {
    let stats = AtlasAt(index).Stats
    return atlasCount > 1 && lastUseSerial[index] <= completedSerial
      && !stats.UploadPending && !stats.UploadRecorded && !stats.UploadSubmitted
  }

  internal func TryRetireAtlas(index int32, completedSerial uint64) bool {
    if !CanRetireAtlas(index, completedSerial) {
      return false
    }
    let atlas = AtlasAt(index)
    if evictionCount == uint64.MaxValue || retirementCount == uint64.MaxValue {
      throw OverflowException("Vulkan text atlas lifecycle counter overflow")
    }
    atlas.Dispose()
    atlases[index] = nil
    active[index] = false
    identities[index] = ResourceId{}
    lastUseSerial[index] = 0uL
    lastTouch[index] = 0uL
    atlasCount--
    residentByteSize -= atlasByteSize
    if currentAtlasIndex == index { currentAtlasIndex = FindCurrentIndex() }
    evictionCount++
    retirementCount++
    if let currentDiagnostics = diagnostics {
      currentDiagnostics.AddTextAtlasEviction(1uL)
      currentDiagnostics.AddTextAtlasRetirement(1uL)
    }
    return true
  }

  internal func Resolve(identity ResourceId) VulkanTextAtlas {
    EnsureOpen()
    let index = FindIndex(identity)
    if index < 0 {
      throw InvalidOperationException("Vulkan text atlas identity is not resident")
    }
    return AtlasAt(index)
  }

  internal func FindIndex(identity ResourceId) int32 {
    if !identity.IsValid || identity.Kind != SceneResourceKind.Atlas {
      return -1
    }
    var index int32 = 0
    while index < atlases.Length {
      if active[index] {
        let current = identities[index]
        if current.Kind == identity.Kind && current.LogicalId == identity.LogicalId
          && current.Version == identity.Version{
            return index
          }
      }
      index++
    }
    return -1
  }

  internal func RecordUploads(commandBuffer VkCommandBuffer, out recordedBytes VkDeviceSize,
    out recordedBarriers int32) int32{
      EnsureOpen()
      if commandBuffer == nint(0) {
        throw ArgumentException("Command buffer is null", "commandBuffer")
      }
      recordedBytes = 0uL
      recordedBarriers = 0
      var recorded int32 = 0
      var index int32 = 0
      while index < atlases.Length {
        if !active[index] {
          index = index + 1
          continue
        }
        let atlas = AtlasAt(index)
        let stats = atlas.Stats
        if stats.UploadPending && !stats.UploadRecorded {
          atlas.RecordUpload(commandBuffer)
          if stats.UploadByteCount > uint64.MaxValue - recordedBytes {
            throw OverflowException("Vulkan text atlas recorded byte count overflow")
          }
          if uploadByteCount > uint64.MaxValue - stats.UploadByteCount {
            throw OverflowException("Vulkan text atlas upload byte counter overflow")
          }
          if recordedBarriers == Int32.MaxValue || recorded == Int32.MaxValue {
            throw OverflowException("Vulkan text atlas upload count overflow")
          }
          recordedBytes = recordedBytes + stats.UploadByteCount
          uploadByteCount = uploadByteCount + stats.UploadByteCount
          if let currentDiagnostics = diagnostics {
            currentDiagnostics.AddTextAtlasRecordedUploadBytes(uint64(stats.UploadByteCount))
          }
          recordedBarriers = recordedBarriers + 1
          recorded = recorded + 1
        }
        index++
      }
      return recorded
    }

  internal func FlushBeforeSubmit() VkResult {
    EnsureOpen()
    var result VkResult = VkConstants.VK_SUCCESS
    var index int32 = 0
    while index < atlases.Length {
      if !active[index] {
        index = index + 1
        continue
      }
      let flushResult = AtlasAt(index).FlushBeforeSubmit()
      if result == VkConstants.VK_SUCCESS && flushResult != VkConstants.VK_SUCCESS {
        result = flushResult
      }
      index++
    }
    return result
  }

  internal func MarkSubmitted(commandBuffer VkCommandBuffer, submissionSerial uint64) {
    EnsureOpen()
    if commandBuffer == nint(0) || submissionSerial == 0uL {
      throw ArgumentException("Text atlas submission arguments are invalid")
    }
    var index int32 = 0
    while index < atlases.Length {
      if !active[index] {
        index = index + 1
        continue
      }
      let atlas = AtlasAt(index)
      let stats = atlas.Stats
      if stats.UploadPending && stats.UploadRecorded && !stats.UploadSubmitted {
        atlas.MarkSubmitted(commandBuffer, submissionSerial)
        if submissionSerial > lastUseSerial[index] {
          lastUseSerial[index] = submissionSerial
        }
        lastTouch[index] = TouchValue()
      }
      index++
    }
  }

  internal func MarkUsed(identity ResourceId, submissionSerial uint64) {
    EnsureOpen()
    if submissionSerial == 0uL {
      throw ArgumentOutOfRangeException("submissionSerial")
    }
    let index = FindIndex(identity)
    if index < 0 {
      throw InvalidOperationException("Vulkan text atlas identity is not resident")
    }
    if submissionSerial > lastUseSerial[index] {
      lastUseSerial[index] = submissionSerial
    }
    lastTouch[index] = TouchValue()
  }

  internal func Collect(completedSerial uint64) bool {
    EnsureOpen()
    var collected bool = false
    var index int32 = 0
    while index < atlases.Length {
      if active[index] {
        let atlas = AtlasAt(index)
        if atlas.Collect(completedSerial) {
          if identities[index].Version > publishedVersion {
            publishedVersion = identities[index].Version
          }
          collected = true
        }
      }
      index++
    }
    return collected
  }

  internal func AbortUploads() bool {
    EnsureOpen()
    var aborted bool = false
    var index int32 = 0
    while index < atlases.Length {
      if !active[index] {
        index = index + 1
        continue
      }
      let atlas = AtlasAt(index)
      let stats = atlas.Stats
      if stats.UploadPending && !stats.UploadSubmitted {
        if atlas.AbortUpload(stats.UploadCommandBuffer) {
          aborted = true
        }
      }
      index++
    }
    return aborted
  }

  internal func RetireAll(completedSerial uint64) {
    EnsureOpen()
    var index int32 = 0
    while index < atlases.Length {
      if !active[index] {
        index = index + 1
        continue
      }
      if lastUseSerial[index] > completedSerial {
        throw InvalidOperationException("Vulkan text atlas is still in use")
      }
      let atlas = AtlasAt(index)
      let stats = atlas.Stats
      if stats.UploadPending {
        if stats.UploadSubmitted {
          if !atlas.Collect(completedSerial) {
            throw InvalidOperationException("Vulkan text atlas upload is still in flight")
          }
        } else {
          atlas.AbortUpload(stats.UploadCommandBuffer)
        }
      }
      atlas.Dispose()
      atlases[index] = nil
      active[index] = false
      identities[index] = ResourceId{}
      lastUseSerial[index] = 0uL
      lastTouch[index] = 0uL
      index++
    }
    atlasCount = 0
    currentAtlasIndex = -1
    residentByteSize = 0uL
  }

  public func Dispose() {
    if disposed {
      return
    }
    disposed = true
    var index int32 = 0
    while index < atlases.Length {
      if let atlas = atlases[index] {
        let stats = atlas.Stats
        if stats.UploadPending && !stats.UploadSubmitted {
          try { atlas.AbortUpload(stats.UploadCommandBuffer) } catch (cleanup Exception) { }
        }
        try { atlas.Collect(uint64.MaxValue) } catch (cleanup Exception) { }
        try { atlas.Dispose() } catch (cleanup Exception) { }
        atlases[index] = nil
      }
      active[index] = false
      identities[index] = ResourceId{}
      lastUseSerial[index] = 0uL
      lastTouch[index] = 0uL
      index++
    }
    atlasCount = 0
    currentAtlasIndex = -1
    residentByteSize = 0uL
    publishedVersion = 0uL
  }

  deinit{
    try {
      Dispose()
    } catch (error Exception) {
    }
  }

  private func EnsureOpen() {
    if disposed {
      throw ObjectDisposedException("VulkanTextAtlasSet")
    }
  }

  private func NextIdentity() ResourceId {
    if nextLogicalId == uint64.MaxValue || nextVersion == uint64.MaxValue {
      throw OverflowException("Vulkan text atlas identity overflow")
    }
    let identity = ResourceId{
      Kind: SceneResourceKind.Atlas,
      LogicalId: nextLogicalId,
      Version: nextVersion,
    }
    nextLogicalId = nextLogicalId + 1uL
    nextVersion = nextVersion + 1uL
    return identity
  }

  private func NextReplacementIdentity(previous ResourceId) ResourceId {
    if !previous.IsValid || previous.Kind != SceneResourceKind.Atlas {
      throw ArgumentException("previous")
    }
    if nextVersion == uint64.MaxValue {
      throw OverflowException("Vulkan text atlas identity overflow")
    }
    let identity = ResourceId{
      Kind: SceneResourceKind.Atlas,
      LogicalId: previous.LogicalId,
      Version: nextVersion,
    }
    nextVersion = nextVersion + 1uL
    return identity
  }

  private func TouchValue() uint64 {
    if nextTouch == uint64.MaxValue {
      throw OverflowException("Vulkan text atlas LRU counter overflow")
    }
    let value = nextTouch
    nextTouch = nextTouch + 1uL
    return value
  }

  private func FindCurrentIndex() int32 {
    var index int32 = 0
    while index < atlases.Length {
      if active[index] {
        return index
      }
      index = index + 1
    }
    return -1
  }
}
