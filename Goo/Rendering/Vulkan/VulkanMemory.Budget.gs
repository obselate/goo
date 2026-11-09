package Goo

internal unsafe sealed class VulkanMemoryBudgetState {
  private const MaximumHeapCount int32 = 16
  private let physicalDevice VkPhysicalDevice
  private let instanceDispatch VkInstanceDispatch
  private let heapCount uint32
  private let extensionAvailable bool
  private let heapBudgets []VkDeviceSize
  private let heapUsages []VkDeviceSize
  private var available bool

  internal prop Available bool{ get -> available }

  internal func HeapBudget(index uint32) uint64? ->
    if available && index < heapCount { heapBudgets[int32(index)] } else { nil }

  internal func HeapUsage(index uint32) uint64? ->
    if available && index < heapCount { heapUsages[int32(index)] } else { nil }

  internal init(nativePhysicalDevice VkPhysicalDevice, nativeInstanceDispatch VkInstanceDispatch,
    nativeHeapCount uint32, nativeExtensionAvailable bool) {
      if nativePhysicalDevice == nint(0) {
        throw ArgumentException("nativePhysicalDevice")
      }
      if nativeHeapCount == 0u || nativeHeapCount > uint32(MaximumHeapCount) {
        throw ArgumentOutOfRangeException("nativeHeapCount")
      }
      physicalDevice = nativePhysicalDevice
      instanceDispatch = nativeInstanceDispatch
      heapCount = nativeHeapCount
      extensionAvailable = nativeExtensionAvailable
      heapBudgets = [MaximumHeapCount]VkDeviceSize
      heapUsages = [MaximumHeapCount]VkDeviceSize
    }

  internal func Refresh() {
    var index int32 = 0
    while index < MaximumHeapCount {
      heapBudgets[index] = 0uL
      heapUsages[index] = 0uL
      index = index + 1
    }
    if !extensionAvailable {
      available = false
      return
    }
    var budgetProperties = VkPhysicalDeviceMemoryBudgetPropertiesEXT{
      sType: VkConstants.VK_STRUCTURE_TYPE_PHYSICAL_DEVICE_MEMORY_BUDGET_PROPERTIES_EXT,
      pNext: nil,
    }
    var properties = VkPhysicalDeviceMemoryProperties2{
      sType: VkConstants.VK_STRUCTURE_TYPE_PHYSICAL_DEVICE_MEMORY_PROPERTIES_2,
      pNext: *void(&budgetProperties),
      memoryProperties: VkPhysicalDeviceMemoryProperties{},
    }
    let getProperties = instanceDispatch.vkGetPhysicalDeviceMemoryProperties2
    getProperties(physicalDevice, &properties)
    let budgetPointer * VkDeviceSize = budgetProperties.heapBudget
    let usagePointer * VkDeviceSize = budgetProperties.heapUsage
    index = 0
    while index < int32(heapCount) {
      heapBudgets[index] = budgetPointer[index]
      heapUsages[index] = usagePointer[index]
      index = index + 1
    }
    available = true
  }
}

internal unsafe partial class VulkanMemoryAllocator : IDisposable {
  /// <summary>Divisor of a heap's size that gives its budget when the driver reports none.</summary>
  private const FallbackHeapShare VkDeviceSize = 2uL

  private let sampledHeapResidentBytes []VkDeviceSize = [int32(VkConstants.VK_MAX_MEMORY_HEAPS)]VkDeviceSize
  private let sampledHeapHeadroom []VkDeviceSize = [int32(VkConstants.VK_MAX_MEMORY_HEAPS)]VkDeviceSize
  private let heapReleaseGenerations []uint64 = [int32(VkConstants.VK_MAX_MEMORY_HEAPS)]uint64
  private let heapRefusalPending []bool = [int32(VkConstants.VK_MAX_MEMORY_HEAPS)]bool
  private var testHeapBudgets []VkDeviceSize = [0]VkDeviceSize
  private var failingAllocationCount int32
  private var lastPolledSerial uint64 = uint64.MaxValue
  private var pressureDeficit VkDeviceSize
  private var evictionCount uint64
  private var allocationRetryCount uint64
  private var pressureCount uint64
  private var cacheGrowthDepth int32
  private var budgetBypass bool

  /// <summary>Heap that holds device-local images.</summary>
  internal prop DeviceLocalHeap uint32{ get -> deviceLocalHeap }

  /// <summary>Counter of a heap that advances when Goo frees memory there, the heap's headroom grows, or a refused heap gains an eviction candidate.</summary>
  internal func ReleaseGeneration(heapIndex uint32) uint64 -> heapReleaseGenerations[int32(heapIndex)]

  /// <summary>Starts cache growth. Until the matching EndCacheGrowth, an allocation that does not fit its heap budget after eviction fails with VulkanMemoryPressureException. Other allocations then go to the driver above the budget.</summary>
  internal func BeginCacheGrowth() { cacheGrowthDepth++ }

  /// <summary>Ends the cache growth that the matching BeginCacheGrowth started.</summary>
  internal func EndCacheGrowth() { cacheGrowthDepth-- }

  /// <summary>Bytes the process may hold in a heap: the driver budget, or a share of the heap size without one.</summary>
  internal func HeapBudget(heapIndex uint32) VkDeviceSize {
    if testHeapBudgets.Length > 0 {
      return testHeapBudgets[int32(heapIndex)]
    }
    let size = MemoryHeap(memoryProperties, heapIndex).size
    let sampled = budget.HeapBudget(heapIndex) ?? 0uL
    return if sampled == 0uL { size / FallbackHeapShare } else { Math.Min(sampled, size) }
  }

  /// <summary>Bytes the process holds in a heap: the last driver sample corrected by Goo's block changes since it.</summary>
  internal func HeapUsage(heapIndex uint32) VkDeviceSize {
    let resident = heapResidentBytes[int32(heapIndex)]
    if testHeapBudgets.Length > 0 || (budget.HeapBudget(heapIndex) ?? 0uL) == 0uL {
      return resident
    }
    let usage = budget.HeapUsage(heapIndex)!! + resident
    let sampledResident = sampledHeapResidentBytes[int32(heapIndex)]
    return if usage > sampledResident { usage - sampledResident } else { 0uL }
  }

  /// <summary>Bytes a heap can still accept before it reaches its budget.</summary>
  internal func Headroom(heapIndex uint32) VkDeviceSize {
    let budgetBytes = HeapBudget(heapIndex)
    let usage = HeapUsage(heapIndex)
    return if usage >= budgetBytes { 0uL } else { budgetBytes - usage }
  }

  /// <summary>Registers an allocation as an evictable item of a cache.</summary>
  internal func Track(allocation VulkanMemoryAllocation, cache VulkanGpuCache, handle int32) {
    allocation.cache = cache
    allocation.cacheHandle = handle
  }

  internal func RefreshBudget() {
    if !disposed {
      for heap in 0 ... int32(memoryProperties.memoryHeapCount) {
        sampledHeapHeadroom[heap] = Headroom(uint32(heap))
      }
      budget.Refresh()
      Array.Copy(heapResidentBytes, sampledHeapResidentBytes, heapResidentBytes.Length)
      for heap in 0 ... int32(memoryProperties.memoryHeapCount) {
        if Headroom(uint32(heap)) > sampledHeapHeadroom[heap] {
          heapReleaseGenerations[heap]++
        }
      }
    }
  }

  /// <summary>Samples the driver budget once per completed submission, evicts until each heap fits its budget, and advances the release generation of a refused heap that has an eviction candidate.</summary>
  internal func BeginFrame(completedSerial uint64) {
    if disposed || completedSerial == lastPolledSerial {
      return
    }
    lastPolledSerial = completedSerial
    RefreshBudget()
    for heap in 0 ... int32(memoryProperties.memoryHeapCount) {
      let budgetBytes = HeapBudget(uint32(heap))
      let usage = HeapUsage(uint32(heap))
      if usage > budgetBytes {
        EvictFor(VulkanMemoryTypeSelection{ heapIndex: uint32(heap) }, VulkanMemoryResourceClass.Image,
          0uL, 1uL, usage - budgetBytes, true)
      }
      if heapRefusalPending[heap] && LeastRecentlyUsed(uint32(heap), false) != nil {
        heapRefusalPending[heap] = false
        heapReleaseGenerations[heap]++
      }
    }
  }

  /// <summary>Releases empty pooled image blocks, then sets every heap budget to Goo's current usage there plus bytes, which may be negative, or restores driver budgets with nil.</summary>
  internal func SetHeadroomForTest(bytes int64?) {
    testHeapBudgets = [0]VkDeviceSize
    for heap in 0 ... heapReleaseGenerations.Length {
      heapReleaseGenerations[heap]++
    }
    var blockIndex int32 = 0
    while blockIndex < blockCount {
      let block = blocks[blockIndex]!!
      if !block.dedicated && block.resourceClass == VulkanMemoryResourceClass.Image && block.allocationCount == 0u {
        RemoveBlock(block)
        continue
      }
      blockIndex++
    }
    if let headroom = bytes {
      let testBudgets = [heapResidentBytes.Length]VkDeviceSize
      for heap in 0 ... testBudgets.Length {
        testBudgets[heap] = uint64(Math.Max(0L, int64(heapResidentBytes[heap]) + headroom))
      }
      testHeapBudgets = testBudgets
    }
  }

  /// <summary>Makes the next device memory allocations fail with VK_ERROR_OUT_OF_DEVICE_MEMORY.</summary>
  internal func FailAllocationsForTest(count int32) {
    failingAllocationCount = count
  }

  private func AcquirePlacement(requirements VkMemoryRequirements,
    selection VulkanMemoryTypeSelection, resourceClass VulkanMemoryResourceClass,
    dedicated bool, dedicatedImage VkImage, dedicatedBuffer VkBuffer) VulkanMemoryPlacement{
      let placementAlignment = PlacementAlignment(requirements.alignment, selection.propertyFlags)
      let placementSpan = if dedicated { requirements.size } else { PlacementSpan(requirements.size, selection.propertyFlags) }
      if let placement = TryAcquirePlacement(requirements, selection, resourceClass, dedicated,
        dedicatedImage, dedicatedBuffer, placementSpan, placementAlignment) {
          return placement
        }
      allocationRetryCount++
      EvictFor(selection, resourceClass, if dedicated { 0uL } else { placementSpan }, placementAlignment,
        pressureDeficit, false)
      budgetBypass = cacheGrowthDepth == 0
      var retried VulkanMemoryPlacement? = nil
      try {
        retried = TryAcquirePlacement(requirements, selection, resourceClass, dedicated,
          dedicatedImage, dedicatedBuffer, placementSpan, placementAlignment)
      } finally {
        budgetBypass = false
      }
      if let placement = retried {
        return placement
      }
      pressureCount++
      heapRefusalPending[int32(selection.heapIndex)] = true
      throw VulkanMemoryPressureException(selection.heapIndex, requirements.size)
    }

  private func EvictFor(selection VulkanMemoryTypeSelection, resourceClass VulkanMemoryResourceClass,
    placementSpan VkDeviceSize, placementAlignment VkDeviceSize, deficit VkDeviceSize, blockReleaseOnly bool) {
      let heap = int32(selection.heapIndex)
      let startBytes = heapResidentBytes[heap]
      var offset VkDeviceSize = 0uL
      while placementSpan == 0uL
        || FindPooledBlock(selection, resourceClass, placementSpan, placementAlignment, ref offset) == nil {
          ReleaseEmptyBlocks(selection.heapIndex)
          if startBytes >= deficit && heapResidentBytes[heap] <= startBytes - deficit {
            return
          }
          guard let victim = LeastRecentlyUsed(selection.heapIndex, blockReleaseOnly) else {
            return
          }
          victim.cache!!.Evict(victim.cacheHandle)
          evictionCount++
        }
    }

  private func LeastRecentlyUsed(heapIndex uint32, blockReleaseOnly bool) VulkanMemoryAllocation? {
    var victim VulkanMemoryAllocation? = nil
    var victimSerial uint64 = 0uL
    for i in 0 ... activeCount {
      guard let allocation = activeAllocations[i] else { continue }
      guard let cache = allocation.cache else { continue }
      if allocation.heapIndex != heapIndex || allocation.state != VulkanMemoryAllocationState.Live
        || blockReleaseOnly && !allocation.dedicated && allocation.block!!.allocationCount != 1u {
          continue
        }
      guard let serial = cache.EvictionSerial(allocation.cacheHandle) else { continue }
      if victim == nil || serial < victimSerial
        || serial == victimSerial && int32(allocation.ownerKind) < int32(victim.ownerKind) {
          victim = allocation
          victimSerial = serial
        }
    }
    return victim
  }

  private func ReleaseEmptyBlocks(heapIndex uint32) {
    var blockIndex int32 = 0
    while blockIndex < blockCount {
      let block = blocks[blockIndex]!!
      if !block.dedicated && block.heapIndex == heapIndex && block.allocationCount == 0u {
        RemoveBlock(block)
        continue
      }
      blockIndex++
    }
  }
}
