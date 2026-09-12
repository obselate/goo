package Goo

import System

internal unsafe data struct VulkanFrameBuffers {
  internal let Device VkDevice
  internal let Dispatch VkDeviceDispatch
  internal let Allocator VulkanMemoryAllocator
  internal let ObjectAccounting VulkanObjectAccounting?
  internal var Buffer VkBuffer
  internal var Allocation VulkanMemoryAllocation?
  internal var StagingBuffer VkBuffer
  internal var StagingAllocation VulkanMemoryAllocation?
  internal var BufferAccounted bool
  internal var StagingAccounted bool
  internal var Capacity VkDeviceSize
  internal var Generation uint64

  internal prop Mapped * void{
    get {
      let candidate = StagingAllocation ?? Allocation
      guard let allocation = candidate else {
        throw InvalidOperationException("Vulkan frame buffer is not allocated")
      }
      if allocation.mapped == nil {
        throw InvalidOperationException("Vulkan frame buffer is not mapped")
      }
      return allocation.mapped
    }
  }

  internal prop LiveObjectCount uint64{
    get -> (Buffer != 0uL ? 1uL : 0uL) + (StagingBuffer != 0uL ? 1uL : 0uL)
  }

  internal func Flush(offset VkDeviceSize, byteCount VkDeviceSize) VkResult {
    let candidate = StagingAllocation ?? Allocation
    guard let allocation = candidate else {
      throw InvalidOperationException("Vulkan frame buffer is not allocated")
    }
    return Allocator.FlushBeforeSubmit(allocation, offset, byteCount)
  }

  internal func Flush(offset VkDeviceSize, byteCount VkDeviceSize,
    out nativeCall bool) VkResult{
      let candidate = StagingAllocation ?? Allocation
      guard let allocation = candidate else {
        throw InvalidOperationException("Vulkan frame buffer is not allocated")
      }
      return Allocator.FlushBeforeSubmit(allocation, offset, byteCount, out nativeCall)
    }

  internal func EnsureStagedCapacity(required VkDeviceSize,
    initialCapacity VkDeviceSize) bool{
      if required == 0uL {
        throw ArgumentOutOfRangeException("required")
      }
      if required <= Capacity && Buffer != 0uL && StagingBuffer != 0uL
        && Allocation != nil && StagingAllocation != nil {
          return false
        }
      if Generation == uint64.MaxValue {
        throw OverflowException("Vulkan frame buffer generation overflow")
      }
      let next = GrowthCapacity(required, initialCapacity)
      Destroy()
      try {
        let deviceCreation = VulkanBufferFactory.Create(Device, Dispatch, Allocator,
          ObjectAccounting, next,
          uint32(VkConstants.VK_BUFFER_USAGE_TRANSFER_DST_BIT)
          | uint32(VkConstants.VK_BUFFER_USAGE_STORAGE_BUFFER_BIT),
          VulkanMemoryPolicy.DeviceLocalRequired)
        Buffer = deviceCreation.Buffer
        Allocation = deviceCreation.Allocation
        BufferAccounted = ObjectAccounting != nil
        let stagingCreation = VulkanBufferFactory.CreateMapped(Device, Dispatch, Allocator,
          ObjectAccounting, next, uint32(VkConstants.VK_BUFFER_USAGE_TRANSFER_SRC_BIT),
          VulkanMemoryPolicy.HostVisibleCoherentCached)
        StagingBuffer = stagingCreation.Buffer
        StagingAllocation = stagingCreation.Allocation
        StagingAccounted = ObjectAccounting != nil
        Capacity = next
        Generation = Generation + 1uL
        return true
      } catch (error Exception) {
        Destroy()
        throw error
      }
    }

  internal func EnsureMappedCapacity(required VkDeviceSize,
    initialCapacity VkDeviceSize, usage VkBufferUsageFlags) bool{
      if required == 0uL {
        throw ArgumentOutOfRangeException("required")
      }
      if required <= Capacity && Buffer != 0uL && Allocation != nil {
        return false
      }
      if Generation == uint64.MaxValue {
        throw OverflowException("Vulkan frame buffer generation overflow")
      }
      let next = GrowthCapacity(required, initialCapacity)
      Destroy()
      let creation = VulkanBufferFactory.CreateMapped(Device, Dispatch, Allocator,
        ObjectAccounting, next, usage, VulkanMemoryPolicy.HostVisibleCoherentCached)
      Buffer = creation.Buffer
      Allocation = creation.Allocation
      BufferAccounted = ObjectAccounting != nil
      Capacity = next
      Generation++
      return true
    }

  internal func RecordUpload(commandBuffer VkCommandBuffer,
    dispatch VkDeviceDispatch, ranges []VkBufferCopy, rangeCount int32,
    barrierBytes VkDeviceSize, destinationStages VkPipelineStageFlags2) {
      if rangeCount <= 0 {
        return
      }
      let copyBuffer = dispatch.vkCmdCopyBuffer
      copyBuffer(commandBuffer, StagingBuffer, Buffer,
        uint32(rangeCount), &ranges[0])
      VulkanTransitions.RecordBuffer(
        commandBuffer,
        dispatch.vkCmdPipelineBarrier2,
        Buffer,
        0uL,
        barrierBytes,
        VkConstants.VK_PIPELINE_STAGE_2_TRANSFER_BIT,
        VkConstants.VK_ACCESS_2_TRANSFER_WRITE_BIT,
        destinationStages,
        VkConstants.VK_ACCESS_2_SHADER_STORAGE_READ_BIT)
    }

  internal func Destroy() {
    DestroyBuffer(ref StagingBuffer, ref StagingAllocation, ref StagingAccounted)
    DestroyBuffer(ref Buffer, ref Allocation, ref BufferAccounted)
    Capacity = 0uL
  }

  private func GrowthCapacity(required VkDeviceSize,
    initialCapacity VkDeviceSize) VkDeviceSize{
      var next = if Capacity == 0uL { initialCapacity } else { Capacity }
      while next < required {
        if next > uint64.MaxValue / 2uL {
          return required
        }
        next *= 2uL
      }
      return next
    }

  private func DestroyBuffer(ref buffer VkBuffer,
    ref allocation VulkanMemoryAllocation?, ref accounted bool) {
      if buffer != 0uL {
        let stale = buffer
        buffer = 0uL
        let destroyBuffer = Dispatch.vkDestroyBuffer
        try { destroyBuffer(Device, stale, nil) } catch (cleanup Exception) { }
        if accounted {
          if let objectAccounting = ObjectAccounting {
            try { objectAccounting.Release() } catch (cleanup Exception) { }
          }
          accounted = false
        }
      }
      if let ownedAllocation = allocation {
        allocation = nil
        try { Allocator.Release(ownedAllocation) } catch (cleanup Exception) { }
      }
    }
}

internal data struct VulkanFrameSlotLifecycle {
  internal var LastUseSerial uint64
  internal var Prepared bool
  internal var Recorded bool
  internal var Submitted bool
  internal var RecordedCommandBuffer VkCommandBuffer
  internal var FlushPrepared bool

  internal func Begin() {
    Prepared = true
    Recorded = false
    Submitted = false
    RecordedCommandBuffer = nint(0)
    FlushPrepared = false
  }

  internal func Record(commandBuffer VkCommandBuffer) {
    Recorded = true
    RecordedCommandBuffer = commandBuffer
  }

  internal func AcceptSubmission(submissionSerial uint64) {
    Prepared = false
    Recorded = false
    RecordedCommandBuffer = nint(0)
    Submitted = true
    LastUseSerial = submissionSerial
  }

  internal func Collect(completedSubmissionSerial uint64) bool {
    if Submitted && LastUseSerial != 0uL
      && LastUseSerial <= completedSubmissionSerial{
        Submitted = false
        LastUseSerial = 0uL
        return true
      }
    return false
  }

  internal func Abort() {
    Prepared = false
    Recorded = false
    RecordedCommandBuffer = nint(0)
    FlushPrepared = false
  }

  internal func Reset() {
    Abort()
    Submitted = false
    LastUseSerial = 0uL
  }
}

internal unsafe data struct VulkanFrameDescriptorOwner {
  internal let Device VkDevice
  internal let Dispatch VkDeviceDispatch
  internal let ObjectAccounting VulkanObjectAccounting?
  internal let Sets []VkDescriptorSet
  internal var Pool VkDescriptorPool
  internal var PoolAccounted bool
  internal var SetsAccounted int32

  internal prop LiveObjectCount uint64{
    get -> (Pool != 0uL ? 1uL : 0uL) + uint64(SetsAccounted)
  }

  internal func Adopt(allocation VulkanDescriptorAllocation) {
    Pool = allocation.Pool
    if ObjectAccounting != nil {
      PoolAccounted = true
      SetsAccounted = int32(allocation.SetCount)
    }
  }

  internal func Bind(index int32, commandBuffer VkCommandBuffer,
    pipelineLayout VkPipelineLayout, setIndex uint32) {
      var descriptorSet = Sets[index]
      let bindDescriptorSets = Dispatch.vkCmdBindDescriptorSets
      bindDescriptorSets(commandBuffer, VkConstants.VK_PIPELINE_BIND_POINT_GRAPHICS,
        pipelineLayout, setIndex, 1u, &descriptorSet, 0u, nil)
    }

  internal func Destroy() {
    if Pool != 0uL {
      let stale = Pool
      Pool = 0uL
      let destroyPool = Dispatch.vkDestroyDescriptorPool
      try { destroyPool(Device, stale, nil) } catch (cleanup Exception) { }
      if let accounting = ObjectAccounting {
        while SetsAccounted > 0 {
          try { accounting.Release() } catch (cleanup Exception) { }
          SetsAccounted--
        }
        if PoolAccounted {
          try { accounting.Release() } catch (cleanup Exception) { }
          PoolAccounted = false
        }
      }
    }
    var index int32 = 0
    while index < Sets.Length {
      Sets[index] = 0uL
      index++
    }
  }
}
