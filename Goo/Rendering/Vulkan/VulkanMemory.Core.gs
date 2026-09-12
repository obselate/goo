package Goo

import System

internal unsafe partial class VulkanMemoryAllocator : IDisposable {
  private const MaxTrackedAllocations uint64 = 1048576uL
  private const InitialActiveCapacity int32 = 32
  private const InitialBlockCapacity int32 = 4
  private const BufferBlockSize VkDeviceSize = 1048576uL
  private const ImageBlockSize VkDeviceSize = 4194304uL
  private const BufferDedicatedThreshold VkDeviceSize = 524288uL
  private const ImageDedicatedThreshold VkDeviceSize = 2097152uL

  private let device VkDevice
  private let deviceDispatch VkDeviceDispatch
  private let memoryProperties VkPhysicalDeviceMemoryProperties
  private let maxAllocationCount uint64
  private let nonCoherentAtomSize VkDeviceSize
  private let budget VulkanMemoryBudgetState
  private let objectAccounting VulkanObjectAccounting?
  private let heapResidentBytes []VkDeviceSize
  private var activeAllocations []VulkanMemoryAllocation?
  private var blocks []VulkanMemoryBlock?
  private var activeCount int32
  private var blockCount int32
  private var allocationEvents uint64
  private var liveBytes VkDeviceSize
  private var liveAllocations uint64
  private var retiredBytes VkDeviceSize
  private var retiredAllocations uint64
  private var residentBytes VkDeviceSize
  private var residentAllocations uint64
  private var lastResult VkResult = VkConstants.VK_SUCCESS
  private var disposed bool

  internal prop LiveBytes VkDeviceSize{ get -> liveBytes }
  internal prop LiveAllocationCount uint64{ get -> liveAllocations }
  internal prop RetiredBytes VkDeviceSize{ get -> retiredBytes }
  internal prop RetiredAllocationCount uint64{ get -> retiredAllocations }
  internal prop ResidentBytes VkDeviceSize{ get -> residentBytes }
  internal prop ResidentAllocationCount uint64{ get -> residentAllocations }
  internal prop BudgetSampleAvailable bool{ get -> budget.Available }
  internal prop BudgetSampleCurrent bool{ get -> !disposed && budget.Available }
  internal prop DriverHeapBudget VkDeviceSize{ get -> budget.TotalBudget() }
  internal prop DriverHeapUsage VkDeviceSize{ get -> budget.TotalUsage() }
  internal prop LastResult VkResult{ get -> lastResult }

  internal func RefreshBudget() {
    if !disposed {
      budget.Refresh()
    }
  }

  internal init(nativeDevice VkDevice, nativeDispatch VkDeviceDispatch,
    physicalProperties VkPhysicalDeviceMemoryProperties, allocationLimit uint32,
    physicalNonCoherentAtomSize VkDeviceSize,
    physicalBufferImageGranularity VkDeviceSize,
    nativeBudget VulkanMemoryBudgetState,
    nativeObjectAccounting VulkanObjectAccounting?) {
      if physicalProperties.memoryTypeCount == 0u || physicalProperties.memoryTypeCount > VkConstants.VK_MAX_MEMORY_TYPES {
        throw ArgumentOutOfRangeException("memoryTypeCount")
      }
      if physicalProperties.memoryHeapCount == 0u || physicalProperties.memoryHeapCount > VkConstants.VK_MAX_MEMORY_HEAPS {
        throw ArgumentOutOfRangeException("memoryHeapCount")
      }
      if allocationLimit == 0u {
        throw ArgumentOutOfRangeException("maxAllocationCount")
      }
      if physicalNonCoherentAtomSize == 0uL {
        throw ArgumentOutOfRangeException("nonCoherentAtomSize")
      }
      if physicalBufferImageGranularity == 0uL {
        throw ArgumentOutOfRangeException("bufferImageGranularity")
      }
      if nativeBudget == nil {
        throw ArgumentNullException("nativeBudget")
      }
      this.device = nativeDevice
      this.deviceDispatch = nativeDispatch
      this.memoryProperties = physicalProperties
      this.nonCoherentAtomSize = physicalNonCoherentAtomSize
      budget = nativeBudget
      objectAccounting = nativeObjectAccounting
      let requestedMaximum = uint64(allocationLimit)
      if requestedMaximum > MaxTrackedAllocations {
        this.maxAllocationCount = MaxTrackedAllocations
      } else {
        this.maxAllocationCount = requestedMaximum
      }
      heapResidentBytes = [int32(VkConstants.VK_MAX_MEMORY_HEAPS)]VkDeviceSize
      activeAllocations = [InitialActiveCapacity]VulkanMemoryAllocation?
      let initialBlockCapacity = if this.maxAllocationCount < uint64(InitialBlockCapacity) {
        int32(this.maxAllocationCount)
      } else {
        InitialBlockCapacity
      }
      blocks = [initialBlockCapacity]VulkanMemoryBlock?
    }

  internal prop Counters VulkanMemoryCounters{
    get {
      return VulkanMemoryCounters{
        allocationEvents: allocationEvents,
        liveBytes: liveBytes,
        liveAllocations: liveAllocations,
        retiredBytes: retiredBytes,
        retiredAllocations: retiredAllocations,
        residentBytes: residentBytes,
        residentAllocations: residentAllocations,
      }
    }
  }

  internal func SelectMemoryType(typeBits uint32,
    memoryPolicy VulkanMemoryPolicy) VulkanMemoryTypeSelection{
      EnsureOpen()
      var found bool = false
      var bestIndex uint32 = 0u
      var bestScore int32 = -1
      var index uint32 = 0u
      var bit uint32 = 1u
      while index < memoryProperties.memoryTypeCount {
        if (typeBits & bit) != 0u {
          let memoryType = MemoryType(memoryProperties, index)
          if (memoryType.propertyFlags & memoryPolicy.Required) == memoryPolicy.Required {
            let score = BitCount(memoryType.propertyFlags & memoryPolicy.Preferred)
            if !found || score > bestScore {
              found = true
              bestIndex = index
              bestScore = score
            }
          }
        }
        index++
        bit = bit << 1
      }
      if !found {
        throw InvalidOperationException("No compatible Vulkan memory type")
      }
      let selected = MemoryType(memoryProperties, bestIndex)
      if selected.heapIndex >= memoryProperties.memoryHeapCount {
        throw InvalidOperationException("Vulkan memory type references an invalid heap")
      }
      return VulkanMemoryTypeSelection{
        memoryTypeIndex: bestIndex,
        heapIndex: selected.heapIndex,
        propertyFlags: selected.propertyFlags,
      }
    }

  internal func AllocateImage(image VkImage,
    memoryPolicy VulkanMemoryPolicy) VulkanMemoryAllocation{
      if image == 0uL {
        throw ArgumentOutOfRangeException("image")
      }
      EnsureOpen()
      lastResult = VkConstants.VK_SUCCESS
      var dedicatedRequirements = VkMemoryDedicatedRequirements{
        sType: VkConstants.VK_STRUCTURE_TYPE_MEMORY_DEDICATED_REQUIREMENTS,
        pNext: nil,
        prefersDedicatedAllocation: 0u,
        requiresDedicatedAllocation: 0u,
      }
      var requirements = VkMemoryRequirements2{
        sType: VkConstants.VK_STRUCTURE_TYPE_MEMORY_REQUIREMENTS_2,
        pNext: *void(&dedicatedRequirements),
        memoryRequirements: VkMemoryRequirements{},
      }
      var requirementsInfo = VkImageMemoryRequirementsInfo2{
        sType: VkConstants.VK_STRUCTURE_TYPE_IMAGE_MEMORY_REQUIREMENTS_INFO_2,
        pNext: nil,
        image: image,
      }
      let getImageMemoryRequirements2 = deviceDispatch.vkGetImageMemoryRequirements2
      getImageMemoryRequirements2(device, &requirementsInfo, &requirements)
      return AllocateImageMemory(image, requirements.memoryRequirements, dedicatedRequirements,
        memoryPolicy)
    }

  internal func AllocateBuffer(buffer VkBuffer,
    memoryPolicy VulkanMemoryPolicy) VulkanMemoryAllocation{
      if buffer == 0uL {
        throw ArgumentOutOfRangeException("buffer")
      }
      EnsureOpen()
      lastResult = VkConstants.VK_SUCCESS
      var dedicatedRequirements = VkMemoryDedicatedRequirements{
        sType: VkConstants.VK_STRUCTURE_TYPE_MEMORY_DEDICATED_REQUIREMENTS,
        pNext: nil,
        prefersDedicatedAllocation: 0u,
        requiresDedicatedAllocation: 0u,
      }
      var requirements = VkMemoryRequirements2{
        sType: VkConstants.VK_STRUCTURE_TYPE_MEMORY_REQUIREMENTS_2,
        pNext: *void(&dedicatedRequirements),
        memoryRequirements: VkMemoryRequirements{},
      }
      var requirementsInfo = VkBufferMemoryRequirementsInfo2{
        sType: VkConstants.VK_STRUCTURE_TYPE_BUFFER_MEMORY_REQUIREMENTS_INFO_2,
        pNext: nil,
        buffer: buffer,
      }
      let getBufferMemoryRequirements2 = deviceDispatch.vkGetBufferMemoryRequirements2
      getBufferMemoryRequirements2(device, &requirementsInfo, &requirements)
      return AllocateBufferMemory(buffer, requirements.memoryRequirements, dedicatedRequirements,
        memoryPolicy)
    }

  internal func Map(allocation VulkanMemoryAllocation) VkResult {
    lastResult = VkConstants.VK_SUCCESS
    EnsureUsable(allocation)
    if !allocation.hostVisible {
      throw InvalidOperationException("Vulkan memory is not host visible")
    }
    if allocation.mapped != nil {
      return VkConstants.VK_SUCCESS
    }
    let block = allocation.block!!
    if block.mapped == nil {
      lastResult = VkConstants.VK_ERROR_MEMORY_MAP_FAILED
      return lastResult
    }
    allocation.mapped = PointerAt(block.mapped, allocation.offset)
    if allocation.mapped == nil {
      lastResult = VkConstants.VK_ERROR_MEMORY_MAP_FAILED
      return lastResult
    }
    lastResult = VkConstants.VK_SUCCESS
    return VkConstants.VK_SUCCESS
  }

  internal func Unmap(allocation VulkanMemoryAllocation) {
    EnsureUsable(allocation)
    allocation.mapped = nil
  }

  internal func InvalidateAfterFence(allocation VulkanMemoryAllocation,
    relativeOffset VkDeviceSize, byteCount VkDeviceSize) VkResult{
      lastResult = VkConstants.VK_SUCCESS
      EnsureUsable(allocation)
      ValidateMappedRangeArguments(allocation, relativeOffset, byteCount)
      if allocation.hostCoherent {
        return VkConstants.VK_SUCCESS
      }
      if !allocation.hostVisible {
        throw InvalidOperationException("Vulkan memory is not host visible")
      }
      if allocation.mapped == nil {
        throw InvalidOperationException("Vulkan memory must be mapped before invalidation")
      }
      var mappedRange = CreateMappedRange(allocation, relativeOffset, byteCount)
      let invalidateMappedMemoryRanges = deviceDispatch.vkInvalidateMappedMemoryRanges
      lastResult = invalidateMappedMemoryRanges(device, 1u, &mappedRange)
      return lastResult
    }

  internal func FlushBeforeSubmit(allocation VulkanMemoryAllocation,
    relativeOffset VkDeviceSize, byteCount VkDeviceSize) VkResult ->
  FlushBeforeSubmit(allocation, relativeOffset, byteCount, out var nativeCall)

  internal func FlushBeforeSubmit(allocation VulkanMemoryAllocation,
    relativeOffset VkDeviceSize, byteCount VkDeviceSize, out nativeCall bool) VkResult{
      nativeCall = false
      lastResult = VkConstants.VK_SUCCESS
      EnsureUsable(allocation)
      ValidateMappedRangeArguments(allocation, relativeOffset, byteCount)
      if allocation.hostCoherent {
        return VkConstants.VK_SUCCESS
      }
      if !allocation.hostVisible {
        throw InvalidOperationException("Vulkan memory is not host visible")
      }
      if allocation.mapped == nil {
        throw InvalidOperationException("Vulkan memory must be mapped before flushing")
      }
      var mappedRange = CreateMappedRange(allocation, relativeOffset, byteCount)
      let flushMappedMemoryRanges = deviceDispatch.vkFlushMappedMemoryRanges
      nativeCall = true
      lastResult = flushMappedMemoryRanges(device, 1u, &mappedRange)
      return lastResult
    }

  private func ValidateMappedRangeArguments(allocation VulkanMemoryAllocation,
    relativeOffset VkDeviceSize, byteCount VkDeviceSize) {
      if byteCount == 0uL || relativeOffset > allocation.size
        || byteCount > allocation.size - relativeOffset{
          throw ArgumentOutOfRangeException("mapped range")
        }
      let block = allocation.block!!
      if allocation.offset > block.size
        || allocation.placementSpan == 0uL
        || allocation.placementSpan > block.size - allocation.offset{
          throw InvalidOperationException("Vulkan memory allocation placement is invalid")
        }
      if allocation.offset > uint64.MaxValue - relativeOffset {
        throw OverflowException("Vulkan mapped range offset overflow")
      }
      let absoluteOffset = allocation.offset + relativeOffset
      if absoluteOffset > uint64.MaxValue - byteCount {
        throw OverflowException("Vulkan mapped range size overflow")
      }
    }

  private func CreateMappedRange(allocation VulkanMemoryAllocation,
    relativeOffset VkDeviceSize, byteCount VkDeviceSize) VkMappedMemoryRange{
      let block = allocation.block!!
      let absoluteOffset = allocation.offset + relativeOffset
      let requestedEnd = absoluteOffset + byteCount
      let alignedStart = absoluteOffset - (absoluteOffset % nonCoherentAtomSize)
      let alignedEnd = AlignUp(requestedEnd, nonCoherentAtomSize)
      let placementEnd = allocation.offset + allocation.placementSpan
      let backingEnd = block.size
      let rangeEnd = if alignedEnd < placementEnd {
        if alignedEnd < backingEnd { alignedEnd } else { backingEnd }
      } else {
        if placementEnd < backingEnd { placementEnd } else { backingEnd }
      }
      if rangeEnd <= alignedStart {
        throw InvalidOperationException("Vulkan mapped range is empty")
      }
      return VkMappedMemoryRange{
        sType: VkConstants.VK_STRUCTURE_TYPE_MAPPED_MEMORY_RANGE,
        pNext: nil,
        memory: block.memory,
        offset: alignedStart,
        size: rangeEnd - alignedStart,
      }
    }

  internal func Retire(allocation VulkanMemoryAllocation) {
    if allocation.state != VulkanMemoryAllocationState.Live {
      return
    }
    if allocation.size > uint64.MaxValue - retiredBytes {
      throw OverflowException("Vulkan retired memory counter overflow")
    }
    liveBytes -= allocation.size
    liveAllocations--
    retiredBytes += allocation.size
    retiredAllocations++
    allocation.state = VulkanMemoryAllocationState.Retired
  }

  internal func Release(allocation VulkanMemoryAllocation) {
    if allocation.state == VulkanMemoryAllocationState.Empty {
      return
    }
    let block = allocation.block
    let removeBlock = allocation.dedicated || (allocation.pendingBind && allocation.blockFresh)
    if block != nil {
      let owningBlock = block
      if owningBlock.allocationCount == 0u {
        throw InvalidOperationException("Vulkan memory block allocation count underflow")
      }
      owningBlock.allocationCount--
    }
    if allocation.state == VulkanMemoryAllocationState.Live {
      liveBytes -= allocation.size
      liveAllocations--
    } else if allocation.state == VulkanMemoryAllocationState.Retired {
      retiredBytes -= allocation.size
      retiredAllocations--
    }
    RemoveActive(allocation)
    allocation.mapped = nil
    ResetAllocation(allocation)
    if removeBlock && block != nil {
      RemoveBlock(block)
    } else if block != nil && block.allocationCount == 0u {
      TrimEmptyPooledBlocks(block)
    }
  }

  public func Dispose() {
    if disposed {
      return
    }
    disposed = true
    var allocationIndex int32 = 0
    while allocationIndex < activeCount {
      if let allocation = activeAllocations[allocationIndex] {
        ResetAllocation(allocation)
        activeAllocations[allocationIndex] = nil
      }
      allocationIndex = allocationIndex + 1
    }
    activeCount = 0
    var blockIndex int32 = 0
    let unmapMemory = deviceDispatch.vkUnmapMemory
    let freeMemory = deviceDispatch.vkFreeMemory
    while blockIndex < blockCount {
      if let block = blocks[blockIndex] {
        if block.mapped != nil {
          unmapMemory(device, block.memory)
          block.mapped = nil
        }
        if block.memory != 0uL {
          freeMemory(device, block.memory, nil)
          if let accounting = objectAccounting {
            accounting.Release()
          }
          block.memory = 0uL
        }
      }
      blocks[blockIndex] = nil
      blockIndex = blockIndex + 1
    }
    var heapIndex int32 = 0
    while heapIndex < heapResidentBytes.Length {
      heapResidentBytes[heapIndex] = 0uL
      heapIndex = heapIndex + 1
    }
    liveBytes = 0uL
    liveAllocations = 0uL
    retiredBytes = 0uL
    retiredAllocations = 0uL
    residentBytes = 0uL
    residentAllocations = 0uL
    blockCount = 0
  }

}
