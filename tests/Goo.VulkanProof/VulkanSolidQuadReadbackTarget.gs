package Goo.VulkanProof

import System
import System.Threading
import Goo

internal unsafe sealed class VulkanSolidQuadReadbackTarget : IDisposable {
  private const ByteSize VkDeviceSize = 64uL * 64uL * 4uL
  private let lease VulkanSharedLease
  private let device VkDevice
  private let dispatch VkDeviceDispatch
  private let allocator VulkanMemoryAllocator
  private let readbackDispatch VulkanReadbackDispatch
  private let accounting VulkanObjectAccounting?
  private let mailbox VulkanQueueMailbox
  private let extent VkExtent2D
  private let acceptSubmission Action[uint64]
  private var image VkImage
  private var imageView VkImageView
  private var imageAllocation VulkanMemoryAllocation? = nil
  private var stagingBuffer VkBuffer
  private var stagingAllocation VulkanMemoryAllocation? = nil
  private var commandPool VkCommandPool
  private var commandBuffer VkCommandBuffer
  private var solidQuad VulkanSolidQuad? = nil
  private var commandPoolAccounted bool

  private var recorded bool

  private var queuePending bool
  private var acceptedSerial uint64
  private var complete bool
  private var failure VkResult = VkConstants.VK_SUCCESS
  private var disposed bool

  internal prop AcceptedSerial uint64{ get -> acceptedSerial }
  internal prop Extent VkExtent2D{ get -> extent }
  internal prop LiveObjectCount uint32{
    get {
      var count uint32
      if image != 0uL { count++ }
      if imageView != 0uL { count++ }
      if stagingBuffer != 0uL { count++ }
      if commandPool != 0uL { count++ }
      if commandBuffer != nint(0) { count++ }
      if solidQuad != nil { count = count + 2u }
      return count
    }
  }
  internal prop ReadbackPointer * void{
    get {
      if disposed { throw ObjectDisposedException("VulkanSolidQuadReadbackTarget") }
      if !complete {
        throw InvalidOperationException("Vulkan direct UNORM readback is incomplete")
      }
      guard let allocation = stagingAllocation else {
        throw InvalidOperationException("Vulkan direct UNORM staging allocation is unavailable")
      }
      return allocation.mapped
    }
  }

  internal init(
    nativeLease VulkanSharedLease,
    nativeReadbackDispatch VulkanReadbackDispatch) {
      if nativeLease == nil { throw ArgumentNullException("nativeLease") }
      if nativeReadbackDispatch == nil {
        throw ArgumentNullException("nativeReadbackDispatch")
      }
      lease = nativeLease
      device = nativeLease.Device
      dispatch = nativeLease.Dispatch
      allocator = nativeLease.MemoryAllocator
      readbackDispatch = nativeReadbackDispatch
      accounting = nativeLease.ObjectAccounting
      mailbox = nativeLease.QueueWorker.CreateMailbox(nil)
      extent = VkExtent2D{ width: 64u, height: 64u }
      acceptSubmission = AcceptSubmission
      Create()
    }

  internal func Record(
    clearColor VkClearColorValue,
    pushConstants SolidQuadPushConstants) VkResult{
      EnsureOpen()
      if queuePending || acceptedSerial != 0uL || complete {
        return VkConstants.VK_NOT_READY
      }
      let resetCommandBuffer = dispatch.vkResetCommandBuffer
      let reset = resetCommandBuffer(
        commandBuffer, VkCommandBufferResetFlags(0u))
      if reset != VkConstants.VK_SUCCESS { return reset }
      var beginInfo = VkCommandBufferBeginInfo{
        sType: VkConstants.VK_STRUCTURE_TYPE_COMMAND_BUFFER_BEGIN_INFO,
        flags: uint32(VkConstants.VK_COMMAND_BUFFER_USAGE_ONE_TIME_SUBMIT_BIT),
      }
      let beginCommandBuffer = dispatch.vkBeginCommandBuffer
      let begin = beginCommandBuffer(commandBuffer, &beginInfo)
      if begin != VkConstants.VK_SUCCESS { return begin }
      VulkanTransitions.RecordImage(
        commandBuffer,
        dispatch.vkCmdPipelineBarrier2,
        image,
        VulkanTransitions.ColorSubresourceRange(),
        VkConstants.VK_IMAGE_LAYOUT_UNDEFINED,
        VkConstants.VK_IMAGE_LAYOUT_COLOR_ATTACHMENT_OPTIMAL,
        VkConstants.VK_PIPELINE_STAGE_2_TOP_OF_PIPE_BIT,
        VkConstants.VK_ACCESS_2_NONE,
        VkConstants.VK_PIPELINE_STAGE_2_COLOR_ATTACHMENT_OUTPUT_BIT,
        VkConstants.VK_ACCESS_2_COLOR_ATTACHMENT_WRITE_BIT)
      guard let quad = solidQuad else {
        throw InvalidOperationException("Vulkan direct UNORM pipeline is unavailable")
      }
      quad.Record(commandBuffer, imageView, extent, clearColor, pushConstants)
      VulkanTransitions.RecordImage(
        commandBuffer,
        dispatch.vkCmdPipelineBarrier2,
        image,
        VulkanTransitions.ColorSubresourceRange(),
        VkConstants.VK_IMAGE_LAYOUT_COLOR_ATTACHMENT_OPTIMAL,
        VkConstants.VK_IMAGE_LAYOUT_TRANSFER_SRC_OPTIMAL,
        VkConstants.VK_PIPELINE_STAGE_2_COLOR_ATTACHMENT_OUTPUT_BIT,
        VkConstants.VK_ACCESS_2_COLOR_ATTACHMENT_WRITE_BIT,
        VkConstants.VK_PIPELINE_STAGE_2_COPY_BIT,
        VkConstants.VK_ACCESS_2_TRANSFER_READ_BIT)
      let copyRegion = VkBufferImageCopy{
        bufferOffset: 0uL,
        imageSubresource: VkImageSubresourceLayers{
          aspectMask: uint32(VkConstants.VK_IMAGE_ASPECT_COLOR_BIT),
          layerCount: 1u,
        },
        imageExtent: VkExtent3D{ width: 64u, height: 64u, depth: 1u },
      }
      readbackDispatch.CopyImageToBuffer(commandBuffer, image,
        VkConstants.VK_IMAGE_LAYOUT_TRANSFER_SRC_OPTIMAL, stagingBuffer, copyRegion)
      let endCommandBuffer = dispatch.vkEndCommandBuffer
      let end = endCommandBuffer(commandBuffer)
      if end == VkConstants.VK_SUCCESS { recorded = true }
      return end
    }

  internal func Submit() VkResult {
    EnsureOpen()
    if !recorded { throw InvalidOperationException("Vulkan direct UNORM commands are not recorded") }
    mailbox.PrepareSubmit(commandBuffer, 0uL, 0uL)
    if !mailbox.BeginSubmit() { return VkConstants.VK_NOT_READY }
    if !lease.EnqueueGraphicsSubmission(mailbox, acceptSubmission) {
      mailbox.CancelSubmit()
      return VkConstants.VK_NOT_READY
    }
    queuePending = true
    return VkConstants.VK_SUCCESS
  }

  internal func PollCompletion() VkResult {
    EnsureOpen()
    if queuePending {
      var submitResult VkResult
      if !mailbox.TakeSubmitCompletion(out submitResult) {
        return VkConstants.VK_NOT_READY
      }
      queuePending = false
      mailbox.ResetSubmitCompletion()
      if submitResult != VkConstants.VK_SUCCESS {
        failure = submitResult
        if submitResult == VkConstants.VK_ERROR_DEVICE_LOST {
          lease.MarkDeviceLost()
          lease.QuiesceQueueAfterDeviceLoss()
        }
        return submitResult
      }
    }
    if complete { return VkConstants.VK_SUCCESS }
    if acceptedSerial == 0uL { return VkConstants.VK_NOT_READY }
    let status = lease.PollGraphicsSubmission(acceptedSerial)
    if status != VkConstants.VK_SUCCESS {
      if status != VkConstants.VK_NOT_READY { failure = status }
      if status == VkConstants.VK_ERROR_DEVICE_LOST {
        lease.MarkDeviceLost()
        lease.QuiesceQueueAfterDeviceLoss()
      }
      return status
    }
    guard let allocation = stagingAllocation else {
      throw InvalidOperationException("Vulkan direct UNORM staging allocation is unavailable")
    }
    let invalidated = allocator.InvalidateAfterFence(allocation, 0uL, ByteSize)
    if invalidated == VkConstants.VK_SUCCESS { complete = true }
    else { failure = invalidated }
    return invalidated
  }

  /// Releases the direct readback target after its accepted submission completes.
  public func Dispose() {
    if disposed { return }
    while failure == VkConstants.VK_SUCCESS
      && (queuePending || (acceptedSerial != 0uL && !complete)) {
        let result = PollCompletion()
        if result == VkConstants.VK_NOT_READY {
          Thread.Yield()
        }
      }
    if failure != VkConstants.VK_SUCCESS {
      let idle = lease.WaitDeviceIdleResult()
      if idle != VkConstants.VK_SUCCESS {
        lease.MarkTeardownFailed(idle)
        if idle == VkConstants.VK_ERROR_DEVICE_LOST {
          lease.QuiesceQueueAfterDeviceLoss()
        } else {
          throw InvalidOperationException("Vulkan direct UNORM cleanup could not prove device idle")
        }
      }
      DestroyResources(idle != VkConstants.VK_SUCCESS)
      return
    }
    if recorded && acceptedSerial == 0uL {
      let resetCommandBuffer = dispatch.vkResetCommandBuffer
      let reset = resetCommandBuffer(commandBuffer, VkCommandBufferResetFlags(0u))
      if reset != VkConstants.VK_SUCCESS {
        throw InvalidOperationException("Vulkan direct UNORM command reset failed")
      }
    }
    DestroyResources(false)
  }

  deinit{
    if !disposed {
      try { Dispose() } catch (cleanup Exception) {
        if lease.DeviceLost {
          try { lease.QuiesceQueueAfterDeviceLoss() } catch (quiesce Exception) { }
          try { DestroyResources(true) } catch (destroy Exception) { }
        }
      }
    }
  }

  private func AcceptSubmission(serial uint64) {
    if serial == 0uL { throw ArgumentOutOfRangeException("serial") }
    acceptedSerial = serial
  }

  private func Create() {
    try {
      let commands * VkCommandBuffer = stackalloc[1]VkCommandBuffer
      let commandAllocation = VulkanCommandFactory.CreatePoolAndAllocate(
        device,
        dispatch,
        accounting,
        lease.GraphicsFamilyIndex,
        uint32(VkConstants.VK_COMMAND_POOL_CREATE_TRANSIENT_BIT)
        | uint32(VkConstants.VK_COMMAND_POOL_CREATE_RESET_COMMAND_BUFFER_BIT),
        VkConstants.VK_COMMAND_BUFFER_LEVEL_PRIMARY,
        1u,
        commands)
      commandPool = commandAllocation.Pool
      commandBuffer = commands[0]
      commandPoolAccounted = accounting != nil
      let imageCreation = VulkanImageFactory.Create2D(
        device,
        dispatch,
        allocator,
        accounting,
        extent,
        VkConstants.VK_FORMAT_R8G8B8A8_UNORM,
        uint32(VkConstants.VK_IMAGE_USAGE_COLOR_ATTACHMENT_BIT)
        | uint32(VkConstants.VK_IMAGE_USAGE_TRANSFER_SRC_BIT),
        uint32(VkConstants.VK_IMAGE_ASPECT_COLOR_BIT),
        VulkanMemoryPolicy.DeviceLocalRequiredPreferred)
      image = imageCreation.Image
      imageView = imageCreation.ImageView
      imageAllocation = imageCreation.Allocation
      let stagingCreation = VulkanBufferFactory.CreateMapped(
        device,
        dispatch,
        allocator,
        accounting,
        ByteSize,
        uint32(VkConstants.VK_BUFFER_USAGE_TRANSFER_DST_BIT),
        VulkanMemoryPolicy.HostVisibleCoherentCached)
      stagingBuffer = stagingCreation.Buffer
      stagingAllocation = stagingCreation.Allocation
      solidQuad = VulkanSolidQuad(
        device, dispatch, VkConstants.VK_FORMAT_R8G8B8A8_UNORM)
    } catch (error Exception) {
      try { DestroyResources(true) } catch (cleanup Exception) { }
      throw error
    }
  }

  private func DestroyResources(bestEffort bool) {
    if disposed { return }
    disposed = true
    if let quad = solidQuad {
      if bestEffort { try { quad.Dispose() } catch (cleanup Exception) { } }
      else { quad.Dispose() }
      solidQuad = nil
    }
    if stagingBuffer != 0uL {
      let stale = stagingBuffer
      stagingBuffer = 0uL
      let destroyBuffer = dispatch.vkDestroyBuffer
      if bestEffort { try { destroyBuffer(device, stale, nil) } catch (cleanup Exception) { } }
      else { destroyBuffer(device, stale, nil) }
      ReleaseAccounting(bestEffort)
    }
    if let allocation = stagingAllocation {
      stagingAllocation = nil
      if bestEffort { try { allocator.Release(allocation) } catch (cleanup Exception) { } }
      else { allocator.Release(allocation) }
    }
    if imageView != 0uL {
      let stale = imageView
      imageView = 0uL
      let destroyImageView = dispatch.vkDestroyImageView
      if bestEffort { try { destroyImageView(device, stale, nil) } catch (cleanup Exception) { } }
      else { destroyImageView(device, stale, nil) }
      ReleaseAccounting(bestEffort)
    }
    if image != 0uL {
      let stale = image
      image = 0uL
      let destroyImage = dispatch.vkDestroyImage
      if bestEffort { try { destroyImage(device, stale, nil) } catch (cleanup Exception) { } }
      else { destroyImage(device, stale, nil) }
      ReleaseAccounting(bestEffort)
    }
    if let allocation = imageAllocation {
      imageAllocation = nil
      if bestEffort { try { allocator.Release(allocation) } catch (cleanup Exception) { } }
      else { allocator.Release(allocation) }
    }
    if commandBuffer != nint(0) {
      var stale = commandBuffer
      commandBuffer = nint(0)
      if commandPool != 0uL {
        let freeCommandBuffers = dispatch.vkFreeCommandBuffers
        if bestEffort { try { freeCommandBuffers(device, commandPool, 1u, &stale) } catch (cleanup Exception) { } }
        else { freeCommandBuffers(device, commandPool, 1u, &stale) }
      }
      ReleaseAccounting(bestEffort)
    }
    if commandPool != 0uL {
      let stale = commandPool
      commandPool = 0uL
      let destroyCommandPool = dispatch.vkDestroyCommandPool
      if bestEffort { try { destroyCommandPool(device, stale, nil) } catch (cleanup Exception) { } }
      else { destroyCommandPool(device, stale, nil) }
      if commandPoolAccounted {
        ReleaseAccounting(bestEffort)
        commandPoolAccounted = false
      }
    }
    if bestEffort { try { lease.Release() } catch (cleanup Exception) { } }
    else { lease.Release() }
  }

  private func ReleaseAccounting(bestEffort bool) {
    if let current = accounting {
      if bestEffort { try { current.Release() } catch (cleanup Exception) { } }
      else { current.Release() }
    }
  }

  private func EnsureOpen() {
    if disposed { throw ObjectDisposedException("VulkanSolidQuadReadbackTarget") }
  }
}
