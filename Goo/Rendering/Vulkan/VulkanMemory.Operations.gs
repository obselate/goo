package Goo

import System

internal unsafe partial class VulkanMemoryAllocator : IDisposable {
  private func AllocateImageMemory(image VkImage, requirements VkMemoryRequirements,
    dedicatedRequirements VkMemoryDedicatedRequirements,
    memoryPolicy VulkanMemoryPolicy) VulkanMemoryAllocation{
      ValidateRequirements(requirements)
      let selection = SelectMemoryType(requirements.memoryTypeBits, memoryPolicy)
      let dedicated = IsDedicated(requirements, dedicatedRequirements, VulkanMemoryResourceClass.Image)
      EnsureLiveCapacity(requirements.size)
      EnsureActiveCapacity()
      let placement = AcquirePlacement(requirements, selection, VulkanMemoryResourceClass.Image, dedicated,
        image, 0uL)
      let allocation = VulkanMemoryAllocation{}
      InitializeAllocation(allocation, placement, requirements, selection, dedicated)
      TrackLive(allocation)
      var bindInfo = VkBindImageMemoryInfo{
        sType: VkConstants.VK_STRUCTURE_TYPE_BIND_IMAGE_MEMORY_INFO,
        pNext: nil,
        image: image,
        memory: allocation.memory,
        memoryOffset: allocation.offset,
      }
      let bindImageMemory2 = deviceDispatch.vkBindImageMemory2
      let bindResult = bindImageMemory2(device, 1u, &bindInfo)
      lastResult = bindResult
      if bindResult != VkConstants.VK_SUCCESS {
        Release(allocation)
        throw InvalidOperationException("vkBindImageMemory2 failed")
      }
      allocation.pendingBind = false
      return allocation
    }

  private func AllocateBufferMemory(buffer VkBuffer, requirements VkMemoryRequirements,
    dedicatedRequirements VkMemoryDedicatedRequirements,
    memoryPolicy VulkanMemoryPolicy) VulkanMemoryAllocation{
      ValidateRequirements(requirements)
      let selection = SelectMemoryType(requirements.memoryTypeBits, memoryPolicy)
      let dedicated = IsDedicated(requirements, dedicatedRequirements, VulkanMemoryResourceClass.Buffer)
      EnsureLiveCapacity(requirements.size)
      EnsureActiveCapacity()
      let placement = AcquirePlacement(requirements, selection, VulkanMemoryResourceClass.Buffer, dedicated,
        0uL, buffer)
      let allocation = VulkanMemoryAllocation{}
      InitializeAllocation(allocation, placement, requirements, selection, dedicated)
      TrackLive(allocation)
      var bindInfo = VkBindBufferMemoryInfo{
        sType: VkConstants.VK_STRUCTURE_TYPE_BIND_BUFFER_MEMORY_INFO,
        pNext: nil,
        buffer: buffer,
        memory: allocation.memory,
        memoryOffset: allocation.offset,
      }
      let bindBufferMemory2 = deviceDispatch.vkBindBufferMemory2
      let bindResult = bindBufferMemory2(device, 1u, &bindInfo)
      lastResult = bindResult
      if bindResult != VkConstants.VK_SUCCESS {
        Release(allocation)
        throw InvalidOperationException("vkBindBufferMemory2 failed")
      }
      allocation.pendingBind = false
      return allocation
    }

  private func ValidateRequirements(requirements VkMemoryRequirements) {
    if requirements.size == 0uL {
      throw InvalidOperationException("Vulkan memory requirements have zero size")
    }
    if requirements.alignment == 0uL {
      throw InvalidOperationException("Vulkan memory requirements have zero alignment")
    }
    if requirements.memoryTypeBits == 0u {
      throw InvalidOperationException("Vulkan memory requirements have no memory types")
    }
  }

  private func IsDedicated(requirements VkMemoryRequirements,
    dedicatedRequirements VkMemoryDedicatedRequirements,
    resourceClass VulkanMemoryResourceClass) bool{
      let threshold = if resourceClass == VulkanMemoryResourceClass.Image {
        ImageDedicatedThreshold
      } else {
        BufferDedicatedThreshold
      }
      return dedicatedRequirements.requiresDedicatedAllocation != 0u
        || dedicatedRequirements.prefersDedicatedAllocation != 0u
        || requirements.size >= threshold
    }

  private func TryAcquirePlacement(requirements VkMemoryRequirements,
    selection VulkanMemoryTypeSelection, resourceClass VulkanMemoryResourceClass,
    dedicated bool, dedicatedImage VkImage, dedicatedBuffer VkBuffer,
    placementSpan VkDeviceSize, placementAlignment VkDeviceSize) VulkanMemoryPlacement?{
      if dedicated {
        guard let block = CreateBlock(requirements.size, selection, resourceClass, true,
          dedicatedImage, dedicatedBuffer) else { return nil }
        return VulkanMemoryPlacement{ block: block, offset: 0uL, span: placementSpan, newBlock: true }
      }
      var offset VkDeviceSize = 0uL
      if let block = FindPooledBlock(selection, resourceClass, placementSpan, placementAlignment, ref offset) {
        return VulkanMemoryPlacement{ block: block, offset: offset, span: placementSpan, newBlock: false }
      }
      let blockSize = BlockSize(requirements, resourceClass, selection)
      guard let newBlock = CreateBlock(blockSize, selection, resourceClass, false,
        dedicatedImage, dedicatedBuffer) else { return nil }
      if !TryFindOffset(newBlock, placementSpan, placementAlignment, ref offset) {
        RemoveBlock(newBlock)
        throw InvalidOperationException("Vulkan memory block cannot satisfy requirements")
      }
      return VulkanMemoryPlacement{ block: newBlock, offset: offset, span: placementSpan, newBlock: true }
    }

  private func FindPooledBlock(selection VulkanMemoryTypeSelection, resourceClass VulkanMemoryResourceClass,
    placementSpan VkDeviceSize, placementAlignment VkDeviceSize, ref offset VkDeviceSize) VulkanMemoryBlock?{
      for blockIndex in 0 ... blockCount {
        if let block = blocks[blockIndex] {
          if CanSharePooledBlock(block, selection, resourceClass)
            && TryFindOffset(block, placementSpan, placementAlignment, ref offset) {
              return block
            }
        }
      }
      return nil
    }

  private func CanSharePooledBlock(block VulkanMemoryBlock,
    selection VulkanMemoryTypeSelection, resourceClass VulkanMemoryResourceClass) bool -> !block.dedicated
    && block.memoryTypeIndex == selection.memoryTypeIndex
    && block.resourceClass == resourceClass

  private func BlockSize(requirements VkMemoryRequirements,
    resourceClass VulkanMemoryResourceClass, selection VulkanMemoryTypeSelection) VkDeviceSize{
      var baseSize = BufferBlockSize
      if resourceClass == VulkanMemoryResourceClass.Image {
        baseSize = ImageInitialBlockSize
        for blockIndex in 0 ... blockCount {
          if let block = blocks[blockIndex] {
            if CanSharePooledBlock(block, selection, resourceClass) && block.size >= baseSize {
              baseSize = if block.size < ImageBlockSize / 2uL { block.size * 2uL } else { ImageBlockSize }
            }
          }
        }
        while baseSize < requirements.size && baseSize < ImageBlockSize {
          baseSize *= 2uL
        }
      }
      let placementAlignment = PlacementAlignment(requirements.alignment, selection.propertyFlags)
      let placementSpan = PlacementSpan(requirements.size, selection.propertyFlags)
      let alignedBaseSize = AlignUp(baseSize, placementAlignment)
      let padding = placementAlignment - 1uL
      if placementSpan > uint64.MaxValue - padding {
        throw OverflowException("Vulkan memory block size overflow")
      }
      let minimumSize = placementSpan + padding
      let remaining = Headroom(selection.heapIndex)
      return if minimumSize > remaining || remaining < alignedBaseSize { minimumSize } else { alignedBaseSize }
    }

  private func CreateBlock(blockSize VkDeviceSize, selection VulkanMemoryTypeSelection,
    resourceClass VulkanMemoryResourceClass, dedicated bool,
    dedicatedImage VkImage, dedicatedBuffer VkBuffer) VulkanMemoryBlock?{
      EnsureBlockCapacity(selection.heapIndex, blockSize)
      let headroom = Headroom(selection.heapIndex)
      if blockSize > headroom && !budgetBypass {
        pressureDeficit = blockSize - headroom
        return nil
      }
      var dedicatedInfo = VkMemoryDedicatedAllocateInfo{
        sType: VkConstants.VK_STRUCTURE_TYPE_MEMORY_DEDICATED_ALLOCATE_INFO,
        pNext: nil,
        image: dedicatedImage,
        buffer: dedicatedBuffer,
      }
      var allocateInfo = VkMemoryAllocateInfo{
        sType: VkConstants.VK_STRUCTURE_TYPE_MEMORY_ALLOCATE_INFO,
        pNext: nil,
        allocationSize: blockSize,
        memoryTypeIndex: selection.memoryTypeIndex,
      }
      if dedicated {
        allocateInfo.pNext = *void(&dedicatedInfo)
      }
      var memory VkDeviceMemory = 0uL
      var allocateResult = VkConstants.VK_ERROR_OUT_OF_DEVICE_MEMORY
      if failingAllocationCount > 0 {
        failingAllocationCount--
      } else {
        let allocateMemory = deviceDispatch.vkAllocateMemory
        allocateResult = allocateMemory(device, &allocateInfo, nil, &memory)
      }
      lastResult = allocateResult
      if allocateResult == VkConstants.VK_ERROR_OUT_OF_DEVICE_MEMORY
        || allocateResult == VkConstants.VK_ERROR_OUT_OF_HOST_MEMORY {
          pressureDeficit = blockSize
          return nil
        }
      if allocateResult != VkConstants.VK_SUCCESS || memory == 0uL {
        throw InvalidOperationException("vkAllocateMemory failed: result=" + allocateResult.ToString()
          +", blockBytes=" + blockSize.ToString()
          +", memoryTypeIndex=" + selection.memoryTypeIndex.ToString()
          +", heapIndex=" + selection.heapIndex.ToString()
          +", resourceClass=" + resourceClass.ToString()
          +", dedicated=" + dedicated.ToString()
          +", residentBytes=" + residentBytes.ToString()
          +", liveBytes=" + liveBytes.ToString())
      }
      try {
        if let accounting = objectAccounting {
          accounting.Allocate()
        }
      } catch (error Exception) {
        let freeMemory = deviceDispatch.vkFreeMemory
        freeMemory(device, memory, nil)
        rethrow
      }
      allocationEvents++
      if operationLimitActive {
        operationBytesRemaining -= blockSize
      }
      let hostVisible = (selection.propertyFlags & uint32(VkConstants.VK_MEMORY_PROPERTY_HOST_VISIBLE_BIT)) != 0u
      let hostCoherent = (selection.propertyFlags & uint32(VkConstants.VK_MEMORY_PROPERTY_HOST_COHERENT_BIT)) != 0u
      var mapped * void = nil
      if hostVisible {
        let mapMemory = deviceDispatch.vkMapMemory
        let mapResult = mapMemory(device, memory, 0uL, VkConstants.VK_WHOLE_SIZE, 0u, *void(&mapped))
        lastResult = mapResult
        if mapResult != VkConstants.VK_SUCCESS || mapped == nil {
          let freeMemory = deviceDispatch.vkFreeMemory
          freeMemory(device, memory, nil)
          if let accounting = objectAccounting {
            accounting.Release()
          }
          throw InvalidOperationException("vkMapMemory failed")
        }
      }
      let block = VulkanMemoryBlock{
        memory: memory,
        size: blockSize,
        memoryTypeIndex: selection.memoryTypeIndex,
        heapIndex: selection.heapIndex,
        propertyFlags: selection.propertyFlags,
        hostVisible: hostVisible,
        hostCoherent: hostCoherent,
        resourceClass: resourceClass,
        dedicated: dedicated,
        mapped: mapped,
        allocationCount: 0u,
      }
      blocks[blockCount] = block
      blockCount = blockCount + 1
      residentBytes += blockSize
      residentAllocations++
      heapResidentBytes[int32(selection.heapIndex)] += blockSize
      if let recorder = FrameRecorder.Current {
        ProfileBlock(recorder, block, FrameTraceKind.ResourceLifecycle, VulkanDiagnosticEventIds.ResourceCreate)
      }
      return block
    }

  private func TryFindOffset(block VulkanMemoryBlock, size VkDeviceSize,
    alignment VkDeviceSize, ref offset VkDeviceSize) bool{
      var cursor VkDeviceSize = 0uL
      while true {
        let remainder = cursor % alignment
        let padding = if remainder == 0uL { 0uL } else { alignment - remainder }
        if cursor > uint64.MaxValue - padding {
          return false
        }
        let aligned = cursor + padding
        if aligned > block.size {
          return false
        }
        var overlapping bool = false
        var overlapEnd VkDeviceSize = aligned
        var nextStart VkDeviceSize = uint64.MaxValue
        var nextEnd VkDeviceSize = uint64.MaxValue
        var allocationIndex int32 = 0
        while allocationIndex < activeCount {
          if let allocation = activeAllocations[allocationIndex] {
            if allocation.state != VulkanMemoryAllocationState.Empty
              && allocation.block != nil && allocation.block!! == block{
                if allocation.offset > uint64.MaxValue - allocation.placementSpan {
                  throw OverflowException("Vulkan memory allocation placement overflow")
                }
                let allocationEnd = allocation.offset + allocation.placementSpan
                if allocation.offset < aligned && allocationEnd > aligned {
                  overlapping = true
                  if allocationEnd > overlapEnd {
                    overlapEnd = allocationEnd
                  }
                } else if allocation.offset >= aligned && allocation.offset < nextStart {
                  nextStart = allocation.offset
                  nextEnd = allocationEnd
                }
              }
          }
          allocationIndex = allocationIndex + 1
        }
        if overlapping {
          cursor = overlapEnd
        } else if nextStart == uint64.MaxValue {
          if size <= block.size - aligned {
            offset = aligned
            return true
          }
          return false
        } else if size <= nextStart - aligned {
          offset = aligned
          return true
        } else {
          cursor = nextEnd
        }
      }
    }

  private func InitializeAllocation(allocation VulkanMemoryAllocation,
    placement VulkanMemoryPlacement, requirements VkMemoryRequirements,
    selection VulkanMemoryTypeSelection, dedicated bool) {
      let block = placement.block!!
      allocation.memory = block.memory
      allocation.size = requirements.size
      allocation.placementSpan = placement.span
      allocation.offset = placement.offset
      allocation.memoryTypeIndex = selection.memoryTypeIndex
      allocation.heapIndex = selection.heapIndex
      allocation.propertyFlags = selection.propertyFlags
      allocation.hostVisible = block.hostVisible
      allocation.hostCoherent = block.hostCoherent
      allocation.dedicated = dedicated
      allocation.mapped = nil
      allocation.block = block
      allocation.activeIndex = -1
      allocation.blockFresh = placement.newBlock
      allocation.pendingBind = true
      allocation.state = VulkanMemoryAllocationState.Live
    }

  private func TrackLive(allocation VulkanMemoryAllocation) {
    let block = allocation.block!!
    block.allocationCount++
    allocation.activeIndex = activeCount
    activeAllocations[activeCount] = allocation
    activeCount = activeCount + 1
    liveBytes += allocation.size
    liveAllocations++
  }

  private func EnsureActiveCapacity() {
    if activeCount < activeAllocations.Length {
      return
    }
    let maximum = int32(MaxTrackedAllocations)
    if activeAllocations.Length >= maximum {
      throw InvalidOperationException("Vulkan tracked allocation limit reached")
    }
    var nextCapacity = activeAllocations.Length * 2
    if nextCapacity > maximum {
      nextCapacity = maximum
    }
    let expanded = [nextCapacity]VulkanMemoryAllocation?
    Array.Copy(activeAllocations, expanded, activeAllocations.Length)
    activeAllocations = expanded
  }

  private func EnsureBlockMetadataCapacity() {
    let maximum = int32(maxAllocationCount)
    if blockCount < blocks.Length {
      return
    }
    if blocks.Length >= maximum {
      throw InvalidOperationException("Vulkan memory block tracking limit reached")
    }
    var nextCapacity = blocks.Length * 2
    if nextCapacity > maximum {
      nextCapacity = maximum
    }
    let expanded = [nextCapacity]VulkanMemoryBlock?
    Array.Copy(blocks, expanded, blocks.Length)
    blocks = expanded
  }

  private func PlacementAlignment(requirementAlignment VkDeviceSize,
    propertyFlags VkMemoryPropertyFlags) VkDeviceSize{
      if IsNonCoherentHostVisible(propertyFlags)
        && requirementAlignment < nonCoherentAtomSize{
          return nonCoherentAtomSize
        }
      return requirementAlignment
    }

  private func PlacementSpan(size VkDeviceSize,
    propertyFlags VkMemoryPropertyFlags) VkDeviceSize-> if IsNonCoherentHostVisible(propertyFlags) { AlignUp(size, nonCoherentAtomSize) } else { size }

  private func IsNonCoherentHostVisible(propertyFlags VkMemoryPropertyFlags) bool -> (propertyFlags & uint32(VkConstants.VK_MEMORY_PROPERTY_HOST_VISIBLE_BIT)) != 0u
    && (propertyFlags & uint32(VkConstants.VK_MEMORY_PROPERTY_HOST_COHERENT_BIT)) == 0u

  private func AlignUp(value VkDeviceSize, alignment VkDeviceSize) VkDeviceSize {
    if alignment == 0uL {
      throw ArgumentOutOfRangeException("alignment")
    }
    let remainder = value % alignment
    if remainder == 0uL {
      return value
    }
    let padding = alignment - remainder
    if value > uint64.MaxValue - padding {
      throw OverflowException("Vulkan memory alignment overflow")
    }
    return value + padding
  }

}
