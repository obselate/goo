package Goo

import System
import System.Runtime.InteropServices

internal unsafe sealed class VulkanCompositionPresentation : IDisposable {
  internal let Root WindowsCompositionDevice
  internal var Image VkImage
  private var semaphore VkSemaphore
  private let runtime VulkanSharedLease
  private var memory VkDeviceMemory
  private let extent VkExtent2D
  private var stagingBuffer VkBuffer
  private var stagingMemory VkDeviceMemory
  private var stagingCoherent bool
  private var stagingPointer nint
  private var interopContext nint
  private var texture nint
  private var fence nint
  private var swapchain nint
  private var backbuffer nint
  private var readyValue uint64
  private var nextValue uint64 = 1uL
  private let vsync bool
  private var disposed bool
  private var attached bool
  private let accounting VulkanObjectAccounting?
  private var accountedObjects int32

  internal prop CpuCopy bool { get -> stagingBuffer != 0uL }

  private init(active VulkanSharedLease, root WindowsCompositionDevice, extent VkExtent2D,
    sync bool, objectAccounting VulkanObjectAccounting?) {
    runtime = active
    Root = root
    this.extent = extent
    vsync = sync
    accounting = objectAccounting
    try {
      CreateSwapchain()
      if root.AdapterMatched && CanInterop(active, extent) {
        try { CreateSharedTexture() }
        catch (error Exception) when (!IsDeviceLoss(error)) { ReleaseImageAndInterop() }
      }
      if Image == 0uL {
        CreateImage(nint(0))
        CreateStaging()
      }
      if let objects = accounting {
        let count = if CpuCopy { 5 } else { 4 }
        for index in 0 ... count {
          objects.Allocate()
          accountedObjects++
        }
      }
    } catch {
      Dispose()
      rethrow
    }
  }

  shared {
    internal func Create(runtime VulkanSharedLease, hwnd nint, extent VkExtent2D,
      vsync bool, previous VulkanCompositionPresentation?,
      accounting VulkanObjectAccounting?) VulkanCompositionPresentation {
      try {
        let root = if let old = previous { old.Root.Retain() }
          else { WindowsCompositionDevice(hwnd, DeviceLuid(runtime)) }
        return VulkanCompositionPresentation(runtime, root, extent, vsync, accounting)
      } catch (error COMException) when (IsDeviceLoss(error)) {
        throw ExternalException(error.Message, int32(VkConstants.VK_ERROR_DEVICE_LOST))
      }
    }

    private func IsDeviceLoss(error Exception) bool {
      if error is ExternalException {
        let code = error.ErrorCode
        if code == int32(VkConstants.VK_ERROR_DEVICE_LOST) { return true }
        return error is COMException && uint32(code) >= 0x887A0005u && uint32(code) <= 0x887A0007u
      }
      return false
    }

    private func DeviceLuid(runtime VulkanSharedLease) uint64? {
      var identity = VkPhysicalDeviceIDProperties{ sType: 1000071004 }
      var properties = VkPhysicalDeviceProperties2{ sType: 1000059001, pNext: *void(&identity) }
      let getProperties = runtime.InstanceDispatch.vkGetPhysicalDeviceProperties2
      getProperties(runtime.PhysicalDevice, &properties)
      if identity.deviceLUIDValid == 0u { return nil }
      var luid uint64
      for index in 0 ... 8 { luid |= uint64(identity.deviceLUID[index]) << (index * 8) }
      return luid
    }

    private func CanInterop(runtime VulkanSharedLease, extent VkExtent2D) bool {
      let dispatch = runtime.Dispatch
      if (dispatch.ExternalMemoryKinds & 8u) == 0u || (dispatch.ExternalSemaphoreKinds & 8u) == 0u { return false }
      var externalInfo = VkPhysicalDeviceExternalImageFormatInfo{ sType: 1000071000, handleType: 8u }
      var queryInfo = VkPhysicalDeviceImageFormatInfo2{
        sType: 1000059004, pNext: *void(&externalInfo), format: VkConstants.VK_FORMAT_B8G8R8A8_UNORM,
        imageType: VkConstants.VK_IMAGE_TYPE_2D, tiling: VkConstants.VK_IMAGE_TILING_OPTIMAL,
        usage: uint32(VkConstants.VK_IMAGE_USAGE_COLOR_ATTACHMENT_BIT) | uint32(VkConstants.VK_IMAGE_USAGE_TRANSFER_SRC_BIT) }
      var externalProperties = VkExternalImageFormatProperties{ sType: 1000071001 }
      var imageProperties = VkImageFormatProperties2{ sType: 1000059003, pNext: *void(&externalProperties) }
      let query = runtime.InstanceDispatch.vkGetPhysicalDeviceImageFormatProperties2
      if query(runtime.PhysicalDevice, &queryInfo, &imageProperties) != VkConstants.VK_SUCCESS
        || (externalProperties.externalMemoryProperties.externalMemoryFeatures & 4u) == 0u
        || extent.width > imageProperties.maxExtent.width || extent.height > imageProperties.maxExtent.height { return false }
      var semaphoreType = VkSemaphoreTypeCreateInfo{ sType: VkConstants.VK_STRUCTURE_TYPE_SEMAPHORE_TYPE_CREATE_INFO,
        semaphoreType: VkConstants.VK_SEMAPHORE_TYPE_TIMELINE }
      var semaphoreInfo = VkPhysicalDeviceExternalSemaphoreInfo{ sType: 1000076000, pNext: *void(&semaphoreType), handleType: 8u }
      var semaphoreProperties = VkExternalSemaphoreProperties{ sType: 1000076001 }
      let querySemaphore = runtime.InstanceDispatch.vkGetPhysicalDeviceExternalSemaphoreProperties
      querySemaphore(runtime.PhysicalDevice, &semaphoreInfo, &semaphoreProperties)
      return (semaphoreProperties.externalSemaphoreFeatures & 2u) != 0u
    }

    private func Check(result VkResult, operation string) {
      if result != VkConstants.VK_SUCCESS { throw ExternalException(operation + ": " + result.ToString(), int32(result)) }
    }
  }

  private func CreateSwapchain() {
    var description = WindowsCompositionSwapchainDescription{
      Width: extent.width, Height: extent.height, Format: 87, SampleCount: 1u,
      Usage: 0x20u, BufferCount: 2u, SwapEffect: 3, AlphaMode: 1 }
    let createSwapchain = cast[unmanaged[Stdcall](nint, nint, *WindowsCompositionSwapchainDescription, nint, *nint) -> int32](
      WindowsCompositionDevice.Method(Root.Factory, 24))
    WindowsCompositionDevice.Check(createSwapchain(Root.Factory, Root.Device, &description, nint(0), &swapchain), "CreateSwapChainForComposition")
    var identifier = Guid("6f15aaf2-d208-4e89-9ab4-489535d34f9c")
    let getBuffer = cast[unmanaged[Stdcall](nint, uint32, *Guid, *nint) -> int32](WindowsCompositionDevice.Method(swapchain, 9))
    WindowsCompositionDevice.Check(getBuffer(swapchain, 0u, &identifier, &backbuffer), "GetBuffer")
  }

  private func CreateSharedTexture() {
    var textureDescription = WindowsCompositionTextureDescription{
      Width: extent.width, Height: extent.height, MipLevels: 1u, ArraySize: 1u, Format: 87,
      SampleCount: 1u, BindFlags: 0x20u, MiscFlags: 0x802u }
    let createTexture = cast[unmanaged[Stdcall](nint, *WindowsCompositionTextureDescription, nint, *nint) -> int32](
      WindowsCompositionDevice.Method(Root.Device, 5))
    WindowsCompositionDevice.Check(createTexture(Root.Device, &textureDescription, nint(0), &texture), "CreateTexture2D")
    let resource = WindowsCompositionDevice.Query(texture, "30961379-4609-4a41-998e-54fe567ee0c1")
    var sharedTexture nint
    try {
      let share = cast[unmanaged[Stdcall](nint, nint, uint32, nint, *nint) -> int32](WindowsCompositionDevice.Method(resource, 13))
      WindowsCompositionDevice.Check(share(resource, nint(0), 0x80000001u, nint(0), &sharedTexture), "CreateSharedHandle(texture)")
      CreateImage(sharedTexture)
    } finally {
      if sharedTexture != nint(0) { using let handle = ExternalNativeHandle(sharedTexture, true) }
      WindowsCompositionDevice.Release(resource)
    }
    interopContext = WindowsCompositionDevice.Query(Root.Context, "917600da-f58c-4c33-98d8-3e15b390fa24")
    let fenceDevice = WindowsCompositionDevice.Query(Root.Device, "8ffde202-a0e7-45df-9e01-e837801b5ea0")
    try {
      var identifier = Guid("affde9d1-1df7-4bb7-8a34-0f46251dab80")
      let createFence = cast[unmanaged[Stdcall](nint, uint64, uint32, *Guid, *nint) -> int32](
        WindowsCompositionDevice.Method(fenceDevice, 68))
      WindowsCompositionDevice.Check(createFence(fenceDevice, 0uL, 2u, &identifier, &fence), "CreateFence")
    } finally { WindowsCompositionDevice.Release(fenceDevice) }
    var sharedFence nint
    try {
      let share = cast[unmanaged[Stdcall](nint, nint, uint32, nint, *nint) -> int32](WindowsCompositionDevice.Method(fence, 7))
      WindowsCompositionDevice.Check(share(fence, nint(0), 0x10000000u, nint(0), &sharedFence), "CreateSharedHandle(fence)")
      var typeInfo = VkSemaphoreTypeCreateInfo{ sType: VkConstants.VK_STRUCTURE_TYPE_SEMAPHORE_TYPE_CREATE_INFO,
        semaphoreType: VkConstants.VK_SEMAPHORE_TYPE_TIMELINE }
      var info = VkSemaphoreCreateInfo{ sType: VkConstants.VK_STRUCTURE_TYPE_SEMAPHORE_CREATE_INFO, pNext: *void(&typeInfo) }
      let create = runtime.Dispatch.vkCreateSemaphore
      Check(create(runtime.Device, &info, nil, &semaphore), "Composition semaphore creation failed")
      var importInfo = VkImportSemaphoreWin32HandleInfoKHR{ sType: 1000078000, semaphore: semaphore, handleType: 8u, handle: sharedFence }
      let importSemaphore = runtime.Dispatch.vkImportSemaphoreWin32HandleKHR
      Check(importSemaphore(runtime.Device, &importInfo), "Composition fence import failed")
    } finally {
      if sharedFence != nint(0) { using let handle = ExternalNativeHandle(sharedFence, true) }
    }
  }

  private func CreateImage(handle nint) {
    let dispatch = runtime.Dispatch
    var externalInfo = VkExternalMemoryImageCreateInfo{ sType: 1000072001, handleTypes: 8u }
    var imageInfo = VkImageCreateInfo{
      sType: VkConstants.VK_STRUCTURE_TYPE_IMAGE_CREATE_INFO,
      pNext: if handle != nint(0) { *void(&externalInfo) } else { nil },
      imageType: VkConstants.VK_IMAGE_TYPE_2D, format: VkConstants.VK_FORMAT_B8G8R8A8_UNORM,
      extent: VkExtent3D{ width: extent.width, height: extent.height, depth: 1u }, mipLevels: 1u, arrayLayers: 1u,
      samples: VkConstants.VK_SAMPLE_COUNT_1_BIT, tiling: VkConstants.VK_IMAGE_TILING_OPTIMAL,
      usage: uint32(VkConstants.VK_IMAGE_USAGE_COLOR_ATTACHMENT_BIT) | uint32(VkConstants.VK_IMAGE_USAGE_TRANSFER_SRC_BIT),
      sharingMode: VkConstants.VK_SHARING_MODE_EXCLUSIVE }
    let create = dispatch.vkCreateImage
    Check(create(runtime.Device, &imageInfo, nil, &Image), "Composition image creation failed")
    var requirements = VkMemoryRequirements2{ sType: VkConstants.VK_STRUCTURE_TYPE_MEMORY_REQUIREMENTS_2 }
    var requirementsInfo = VkImageMemoryRequirementsInfo2{ sType: VkConstants.VK_STRUCTURE_TYPE_IMAGE_MEMORY_REQUIREMENTS_INFO_2, image: Image }
    let getRequirements = dispatch.vkGetImageMemoryRequirements2
    getRequirements(runtime.Device, &requirementsInfo, &requirements)
    var bits = requirements.memoryRequirements.memoryTypeBits
    var memoryType uint32
    if handle != nint(0) {
      var properties = VkMemoryWin32HandlePropertiesKHR{ sType: 1000073002 }
      let getProperties = dispatch.vkGetMemoryWin32HandlePropertiesKHR
      Check(getProperties(runtime.Device, 8u, handle, &properties), "Composition memory handle query failed")
      bits &= properties.memoryTypeBits
      if bits == 0u { throw InvalidOperationException("Composition image has no compatible memory type") }
      while (bits & (1u << int32(memoryType))) == 0u { memoryType++ }
    } else {
      memoryType = runtime.MemoryAllocator.SelectMemoryType(bits, VulkanMemoryPolicy.DeviceLocalRequired).memoryTypeIndex
    }
    var dedicated = VkMemoryDedicatedAllocateInfo{ sType: VkConstants.VK_STRUCTURE_TYPE_MEMORY_DEDICATED_ALLOCATE_INFO, image: Image }
    var importInfo = VkImportMemoryWin32HandleInfoKHR{ sType: 1000073000, pNext: *void(&dedicated), handleType: 8u, handle: handle }
    var allocation = VkMemoryAllocateInfo{ sType: VkConstants.VK_STRUCTURE_TYPE_MEMORY_ALLOCATE_INFO,
      pNext: if handle != nint(0) { *void(&importInfo) } else { *void(&dedicated) },
      allocationSize: requirements.memoryRequirements.size, memoryTypeIndex: memoryType }
    let allocate = dispatch.vkAllocateMemory
    Check(allocate(runtime.Device, &allocation, nil, &memory), "Composition memory import failed")
    var bindInfo = VkBindImageMemoryInfo{ sType: VkConstants.VK_STRUCTURE_TYPE_BIND_IMAGE_MEMORY_INFO, image: Image, memory: memory }
    let bind = dispatch.vkBindImageMemory2
    Check(bind(runtime.Device, 1u, &bindInfo), "Composition image binding failed")
  }

  private func CreateStaging() {
    let dispatch = runtime.Dispatch
    let device = runtime.Device
    var info = VkBufferCreateInfo{ sType: VkConstants.VK_STRUCTURE_TYPE_BUFFER_CREATE_INFO,
      size: uint64(extent.width) * uint64(extent.height) * 4uL,
      usage: uint32(VkConstants.VK_BUFFER_USAGE_TRANSFER_DST_BIT), sharingMode: VkConstants.VK_SHARING_MODE_EXCLUSIVE }
    let create = dispatch.vkCreateBuffer
    Check(create(device, &info, nil, &stagingBuffer), "Composition staging buffer creation failed")
    var requirements = VkMemoryRequirements2{ sType: VkConstants.VK_STRUCTURE_TYPE_MEMORY_REQUIREMENTS_2 }
    var requirementsInfo = VkBufferMemoryRequirementsInfo2{
      sType: VkConstants.VK_STRUCTURE_TYPE_BUFFER_MEMORY_REQUIREMENTS_INFO_2, buffer: stagingBuffer }
    let getRequirements = dispatch.vkGetBufferMemoryRequirements2
    getRequirements(device, &requirementsInfo, &requirements)
    let selected = runtime.MemoryAllocator.SelectMemoryType(requirements.memoryRequirements.memoryTypeBits,
      VulkanMemoryPolicy.HostVisibleCoherentCached)
    stagingCoherent = (selected.propertyFlags & uint32(VkConstants.VK_MEMORY_PROPERTY_HOST_COHERENT_BIT)) != 0u
    var dedicated = VkMemoryDedicatedAllocateInfo{
      sType: VkConstants.VK_STRUCTURE_TYPE_MEMORY_DEDICATED_ALLOCATE_INFO, buffer: stagingBuffer }
    var allocation = VkMemoryAllocateInfo{ sType: VkConstants.VK_STRUCTURE_TYPE_MEMORY_ALLOCATE_INFO,
      pNext: *void(&dedicated), allocationSize: requirements.memoryRequirements.size,
      memoryTypeIndex: selected.memoryTypeIndex }
    let allocate = dispatch.vkAllocateMemory
    Check(allocate(device, &allocation, nil, &stagingMemory), "Composition staging allocation failed")
    var bindInfo = VkBindBufferMemoryInfo{
      sType: VkConstants.VK_STRUCTURE_TYPE_BIND_BUFFER_MEMORY_INFO, buffer: stagingBuffer, memory: stagingMemory }
    let bind = dispatch.vkBindBufferMemory2
    Check(bind(device, 1u, &bindInfo), "Composition staging binding failed")
    let mapStaging = dispatch.vkMapMemory
    Check(mapStaging(device, stagingMemory, 0uL, VkConstants.VK_WHOLE_SIZE, 0u, *void(&stagingPointer)),
      "Composition staging map failed")
  }

  internal func PrepareSubmit(mailbox VulkanQueueMailbox) {
    if CpuCopy { return }
    if nextValue > uint64.MaxValue - 2uL { throw OverflowException("Composition fence value overflow") }
    mailbox.SubmitWaitSemaphore = semaphore
    mailbox.SubmitWaitValue = readyValue
    mailbox.SubmitHasWait = true
    mailbox.SubmitSignalSemaphore = semaphore
    mailbox.SubmitHasSignal = true
    mailbox.SubmitSignalValue = nextValue
    nextValue += 2uL
  }

  internal func Present(value uint64, serial uint64) VkResult {
    let context = Root.Context
    if CpuCopy {
      let ready = runtime.WaitGraphicsSubmission(serial, VkConstants.VK_WHOLE_SIZE)
      if ready != VkConstants.VK_SUCCESS { return ready }
      if !stagingCoherent {
        var mappedRange = VkMappedMemoryRange{ sType: VkConstants.VK_STRUCTURE_TYPE_MAPPED_MEMORY_RANGE,
          memory: stagingMemory, size: VkConstants.VK_WHOLE_SIZE }
        let invalidate = runtime.Dispatch.vkInvalidateMappedMemoryRanges
        let result = invalidate(runtime.Device, 1u, &mappedRange)
        if result != VkConstants.VK_SUCCESS { return result }
      }
      let update = cast[unmanaged[Stdcall](nint, nint, uint32, nint, nint, uint32, uint32) -> void](
        WindowsCompositionDevice.Method(context, 48))
      update(context, backbuffer, 0u, nint(0), stagingPointer, extent.width * 4u, 0u)
    } else {
      let wait = cast[unmanaged[Stdcall](nint, nint, uint64) -> int32](WindowsCompositionDevice.Method(interopContext, 148))
      let signal = cast[unmanaged[Stdcall](nint, nint, uint64) -> int32](WindowsCompositionDevice.Method(interopContext, 147))
      let copy = cast[unmanaged[Stdcall](nint, nint, nint) -> void](WindowsCompositionDevice.Method(context, 47))
      let flush = cast[unmanaged[Stdcall](nint) -> void](WindowsCompositionDevice.Method(context, 111))
      if wait(interopContext, fence, value) < 0 { return VkConstants.VK_ERROR_DEVICE_LOST }
      copy(context, backbuffer, texture)
      if signal(interopContext, fence, value + 1uL) < 0 { return VkConstants.VK_ERROR_DEVICE_LOST }
      readyValue = value + 1uL
      flush(context)
    }
    let present = cast[unmanaged[Stdcall](nint, uint32, uint32) -> int32](WindowsCompositionDevice.Method(swapchain, 8))
    if present(swapchain, if vsync { 1u } else { 0u }, 0u) < 0 { return VkConstants.VK_ERROR_DEVICE_LOST }
    if !attached {
      if Root.Commit(swapchain) < 0 { return VkConstants.VK_ERROR_DEVICE_LOST }
      attached = true
    }
    return VkConstants.VK_SUCCESS
  }

  internal func RecordBegin(command VkCommandBuffer, family uint32, undefined bool) {
    if !CpuCopy {
      RecordOwnership(command, family, true, undefined)
      return
    }
    VulkanTransitions.RecordImage(command, runtime.Dispatch.vkCmdPipelineBarrier2, Image,
      VulkanTransitions.ColorSubresourceRange(),
      if undefined { VkConstants.VK_IMAGE_LAYOUT_UNDEFINED } else { VkConstants.VK_IMAGE_LAYOUT_TRANSFER_SRC_OPTIMAL },
      VkConstants.VK_IMAGE_LAYOUT_COLOR_ATTACHMENT_OPTIMAL,
      if undefined { VkConstants.VK_PIPELINE_STAGE_2_TOP_OF_PIPE_BIT } else { VkConstants.VK_PIPELINE_STAGE_2_COPY_BIT },
      if undefined { VkConstants.VK_ACCESS_2_NONE } else { VkConstants.VK_ACCESS_2_TRANSFER_READ_BIT },
      VkConstants.VK_PIPELINE_STAGE_2_COLOR_ATTACHMENT_OUTPUT_BIT, VkConstants.VK_ACCESS_2_COLOR_ATTACHMENT_WRITE_BIT)
  }

  internal func RecordReadback(command VkCommandBuffer, readback VulkanReadbackDispatch) {
    let barrier = runtime.Dispatch.vkCmdPipelineBarrier2
    VulkanTransitions.RecordImage(command, barrier, Image, VulkanTransitions.ColorSubresourceRange(),
      VkConstants.VK_IMAGE_LAYOUT_COLOR_ATTACHMENT_OPTIMAL, VkConstants.VK_IMAGE_LAYOUT_TRANSFER_SRC_OPTIMAL,
      VkConstants.VK_PIPELINE_STAGE_2_COLOR_ATTACHMENT_OUTPUT_BIT, VkConstants.VK_ACCESS_2_COLOR_ATTACHMENT_WRITE_BIT,
      VkConstants.VK_PIPELINE_STAGE_2_COPY_BIT, VkConstants.VK_ACCESS_2_TRANSFER_READ_BIT)
    let region = VkBufferImageCopy{
      imageSubresource: VkImageSubresourceLayers{
        aspectMask: uint32(VkConstants.VK_IMAGE_ASPECT_COLOR_BIT), layerCount: 1u },
      imageExtent: VkExtent3D{ width: extent.width, height: extent.height, depth: 1u } }
    readback.CopyImageToBuffer(command, Image, VkConstants.VK_IMAGE_LAYOUT_TRANSFER_SRC_OPTIMAL, stagingBuffer, region)
    VulkanTransitions.RecordBuffer(command, barrier, stagingBuffer, 0uL, VkConstants.VK_WHOLE_SIZE,
      VkConstants.VK_PIPELINE_STAGE_2_COPY_BIT, VkConstants.VK_ACCESS_2_TRANSFER_WRITE_BIT,
      VkConstants.VK_PIPELINE_STAGE_2_HOST_BIT, VkConstants.VK_ACCESS_2_HOST_READ_BIT)
  }

  internal func RecordOwnership(command VkCommandBuffer, family uint32, acquire bool, undefined bool = false) {
    var barrier = VkImageMemoryBarrier2{
      sType: VkConstants.VK_STRUCTURE_TYPE_IMAGE_MEMORY_BARRIER_2,
      srcStageMask: if acquire { 0uL } else { VkConstants.VK_PIPELINE_STAGE_2_COLOR_ATTACHMENT_OUTPUT_BIT },
      srcAccessMask: if acquire { 0uL } else { VkConstants.VK_ACCESS_2_COLOR_ATTACHMENT_WRITE_BIT },
      dstStageMask: if acquire { VkConstants.VK_PIPELINE_STAGE_2_COLOR_ATTACHMENT_OUTPUT_BIT } else { 0uL },
      dstAccessMask: if acquire { VkConstants.VK_ACCESS_2_COLOR_ATTACHMENT_WRITE_BIT } else { 0uL },
      oldLayout: if acquire { if undefined { VkConstants.VK_IMAGE_LAYOUT_UNDEFINED } else { VkConstants.VK_IMAGE_LAYOUT_GENERAL } }
        else { VkConstants.VK_IMAGE_LAYOUT_COLOR_ATTACHMENT_OPTIMAL },
      newLayout: if acquire { VkConstants.VK_IMAGE_LAYOUT_COLOR_ATTACHMENT_OPTIMAL } else { VkConstants.VK_IMAGE_LAYOUT_GENERAL },
      srcQueueFamilyIndex: if acquire { 0xFFFFFFFEu } else { family },
      dstQueueFamilyIndex: if acquire { family } else { 0xFFFFFFFEu },
      image: Image, subresourceRange: VulkanTransitions.ColorSubresourceRange() }
    var dependency = VkDependencyInfo{ sType: VkConstants.VK_STRUCTURE_TYPE_DEPENDENCY_INFO,
      imageMemoryBarrierCount: 1u, pImageMemoryBarriers: &barrier }
    let record = runtime.Dispatch.vkCmdPipelineBarrier2
    record(command, &dependency)
  }

  private func ReleaseImageAndInterop() {
    if semaphore != 0uL {
      let destroy = runtime.Dispatch.vkDestroySemaphore
      destroy(runtime.Device, semaphore, nil)
      semaphore = 0uL
    }
    if Image != 0uL {
      let destroy = runtime.Dispatch.vkDestroyImage
      destroy(runtime.Device, Image, nil)
      Image = 0uL
    }
    if memory != 0uL {
      let free = runtime.Dispatch.vkFreeMemory
      free(runtime.Device, memory, nil)
      memory = 0uL
    }
    WindowsCompositionDevice.Release(fence)
    WindowsCompositionDevice.Release(texture)
    WindowsCompositionDevice.Release(interopContext)
    fence = nint(0)
    texture = nint(0)
    interopContext = nint(0)
  }

  public func Dispose() {
    if disposed { return }
    disposed = true
    if readyValue != 0uL && !runtime.DeviceLost {
      var nativeSemaphore = semaphore
      var value = readyValue
      var waitInfo = VkSemaphoreWaitInfo{ sType: VkConstants.VK_STRUCTURE_TYPE_SEMAPHORE_WAIT_INFO,
        semaphoreCount: 1u, pSemaphores: &nativeSemaphore, pValues: &value }
      let wait = runtime.Dispatch.vkWaitSemaphores
      let result = wait(runtime.Device, &waitInfo, uint64.MaxValue)
      if result == VkConstants.VK_ERROR_DEVICE_LOST { runtime.MarkDeviceLost() }
      else { Check(result, "Composition copy retirement failed") }
    }
    if stagingPointer != nint(0) {
      let unmap = runtime.Dispatch.vkUnmapMemory
      unmap(runtime.Device, stagingMemory)
    }
    if stagingBuffer != 0uL {
      let destroy = runtime.Dispatch.vkDestroyBuffer
      destroy(runtime.Device, stagingBuffer, nil)
    }
    if stagingMemory != 0uL {
      let free = runtime.Dispatch.vkFreeMemory
      free(runtime.Device, stagingMemory, nil)
    }
    ReleaseImageAndInterop()
    WindowsCompositionDevice.Release(backbuffer)
    WindowsCompositionDevice.Release(swapchain)
    if let objects = accounting {
      for index in 0 ... accountedObjects { objects.Release() }
    }
    Root.ReleaseReference()
  }
}
