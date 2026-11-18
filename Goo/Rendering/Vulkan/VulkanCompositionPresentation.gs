package Goo

import System
import System.Runtime.InteropServices

internal unsafe sealed class VulkanCompositionPresentation : IDisposable {
  internal let Root WindowsCompositionDevice
  internal var Image VkImage
  internal var Semaphore VkSemaphore
  private let runtime VulkanSharedLease
  private var memory VkDeviceMemory
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

  private init(active VulkanSharedLease, root WindowsCompositionDevice, width uint32, height uint32,
    sync bool, objectAccounting VulkanObjectAccounting?) {
    runtime = active
    Root = root
    vsync = sync
    accounting = objectAccounting
    try {
      Create(width, height)
      if let objects = accounting {
        for index in 0 ... 3 {
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
    internal func TryCreate(runtime VulkanSharedLease, hwnd nint, extent VkExtent2D,
      vsync bool, previous VulkanCompositionPresentation?,
      accounting VulkanObjectAccounting?) VulkanCompositionPresentation? {
      if !OperatingSystem.IsWindows() || hwnd == nint(0) { return nil }
      let dispatch = runtime.Dispatch
      if (dispatch.ExternalMemoryKinds & 8u) == 0u || (dispatch.ExternalSemaphoreKinds & 8u) == 0u { return nil }
      var identity = VkPhysicalDeviceIDProperties{ sType: 1000071004 }
      var properties = VkPhysicalDeviceProperties2{ sType: 1000059001, pNext: *void(&identity) }
      let getProperties = runtime.InstanceDispatch.vkGetPhysicalDeviceProperties2
      getProperties(runtime.PhysicalDevice, &properties)
      if identity.deviceLUIDValid == 0u { return nil }
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
        || extent.width > imageProperties.maxExtent.width || extent.height > imageProperties.maxExtent.height { return nil }
      var semaphoreType = VkSemaphoreTypeCreateInfo{ sType: VkConstants.VK_STRUCTURE_TYPE_SEMAPHORE_TYPE_CREATE_INFO,
        semaphoreType: VkConstants.VK_SEMAPHORE_TYPE_TIMELINE }
      var semaphoreInfo = VkPhysicalDeviceExternalSemaphoreInfo{ sType: 1000076000, pNext: *void(&semaphoreType), handleType: 8u }
      var semaphoreProperties = VkExternalSemaphoreProperties{ sType: 1000076001 }
      let querySemaphore = runtime.InstanceDispatch.vkGetPhysicalDeviceExternalSemaphoreProperties
      querySemaphore(runtime.PhysicalDevice, &semaphoreInfo, &semaphoreProperties)
      if (semaphoreProperties.externalSemaphoreFeatures & 2u) == 0u { return nil }
      var luid uint64
      for index in 0 ... 8 { luid |= uint64(identity.deviceLUID[index]) << (index * 8) }
      try {
        let root = if let old = previous { old.Root.Retain() }
          else { WindowsCompositionDevice(hwnd, luid) }
        return VulkanCompositionPresentation(runtime, root, extent.width, extent.height, vsync, accounting)
      } catch (error ExternalException) {
        if error.ErrorCode == int32(VkConstants.VK_ERROR_DEVICE_LOST) {
          runtime.MarkDeviceLost()
          rethrow
        }
        if Environment.GetEnvironmentVariable("GOO_VK_DIAGNOSTICS") == "1" {
          Console.Error.WriteLine("Goo Windows presentation: Vulkan fallback, " + error.Message)
        }
        return nil
      } catch (error InvalidOperationException) {
        if Environment.GetEnvironmentVariable("GOO_VK_DIAGNOSTICS") == "1" {
          Console.Error.WriteLine("Goo Windows presentation: Vulkan fallback, " + error.Message)
        }
        return nil
      } catch (error DllNotFoundException) { return nil }
      catch (error EntryPointNotFoundException) { return nil }
    }

    private func Check(result VkResult, operation string) {
      if result != VkConstants.VK_SUCCESS { throw ExternalException(operation + ": " + result.ToString(), int32(result)) }
    }
  }

  private func Create(width uint32, height uint32) {
    var description = WindowsCompositionSwapchainDescription{
      Width: width, Height: height, Format: 87, SampleCount: 1u,
      Usage: 0x20u, BufferCount: 2u, SwapEffect: 3, AlphaMode: 1 }
    let createSwapchain = cast[unmanaged[Stdcall](nint, nint, *WindowsCompositionSwapchainDescription, nint, *nint) -> int32](
      WindowsCompositionDevice.Method(Root.Factory, 24))
    WindowsCompositionDevice.Check(createSwapchain(Root.Factory, Root.Device, &description, nint(0), &swapchain), "CreateSwapChainForComposition")
    var identifier = Guid("6f15aaf2-d208-4e89-9ab4-489535d34f9c")
    let getBuffer = cast[unmanaged[Stdcall](nint, uint32, *Guid, *nint) -> int32](WindowsCompositionDevice.Method(swapchain, 9))
    WindowsCompositionDevice.Check(getBuffer(swapchain, 0u, &identifier, &backbuffer), "GetBuffer")
    var textureDescription = WindowsCompositionTextureDescription{
      Width: width, Height: height, MipLevels: 1u, ArraySize: 1u, Format: 87,
      SampleCount: 1u, BindFlags: 0x20u, MiscFlags: 0x802u }
    let createTexture = cast[unmanaged[Stdcall](nint, *WindowsCompositionTextureDescription, nint, *nint) -> int32](
      WindowsCompositionDevice.Method(Root.Device, 5))
    WindowsCompositionDevice.Check(createTexture(Root.Device, &textureDescription, nint(0), &texture), "CreateTexture2D")
    let resource = WindowsCompositionDevice.Query(texture, "30961379-4609-4a41-998e-54fe567ee0c1")
    var sharedTexture nint
    try {
      let share = cast[unmanaged[Stdcall](nint, nint, uint32, nint, *nint) -> int32](WindowsCompositionDevice.Method(resource, 13))
      WindowsCompositionDevice.Check(share(resource, nint(0), 0x80000001u, nint(0), &sharedTexture), "CreateSharedHandle(texture)")
      ImportImage(sharedTexture, width, height)
    } finally {
      if sharedTexture != nint(0) { using let handle = ExternalNativeHandle(sharedTexture, true) }
      WindowsCompositionDevice.Release(resource)
    }
    identifier = Guid("affde9d1-1df7-4bb7-8a34-0f46251dab80")
    let createFence = cast[unmanaged[Stdcall](nint, uint64, uint32, *Guid, *nint) -> int32](WindowsCompositionDevice.Method(Root.Device, 68))
    WindowsCompositionDevice.Check(createFence(Root.Device, 0uL, 2u, &identifier, &fence), "CreateFence")
    var sharedFence nint
    try {
      let share = cast[unmanaged[Stdcall](nint, nint, uint32, nint, *nint) -> int32](WindowsCompositionDevice.Method(fence, 7))
      WindowsCompositionDevice.Check(share(fence, nint(0), 0x10000000u, nint(0), &sharedFence), "CreateSharedHandle(fence)")
      var typeInfo = VkSemaphoreTypeCreateInfo{ sType: VkConstants.VK_STRUCTURE_TYPE_SEMAPHORE_TYPE_CREATE_INFO,
        semaphoreType: VkConstants.VK_SEMAPHORE_TYPE_TIMELINE }
      var info = VkSemaphoreCreateInfo{ sType: VkConstants.VK_STRUCTURE_TYPE_SEMAPHORE_CREATE_INFO, pNext: *void(&typeInfo) }
      let create = runtime.Dispatch.vkCreateSemaphore
      Check(create(runtime.Device, &info, nil, &Semaphore), "Composition semaphore creation failed")
      var importInfo = VkImportSemaphoreWin32HandleInfoKHR{ sType: 1000078000, semaphore: Semaphore, handleType: 8u, handle: sharedFence }
      let importSemaphore = runtime.Dispatch.vkImportSemaphoreWin32HandleKHR
      Check(importSemaphore(runtime.Device, &importInfo), "Composition fence import failed")
    } finally {
      if sharedFence != nint(0) { using let handle = ExternalNativeHandle(sharedFence, true) }
    }
  }

  private func ImportImage(handle nint, width uint32, height uint32) {
    let dispatch = runtime.Dispatch
    var externalInfo = VkExternalMemoryImageCreateInfo{ sType: 1000072001, handleTypes: 8u }
    var imageInfo = VkImageCreateInfo{
      sType: VkConstants.VK_STRUCTURE_TYPE_IMAGE_CREATE_INFO, pNext: *void(&externalInfo),
      imageType: VkConstants.VK_IMAGE_TYPE_2D, format: VkConstants.VK_FORMAT_B8G8R8A8_UNORM,
      extent: VkExtent3D{ width: width, height: height, depth: 1u }, mipLevels: 1u, arrayLayers: 1u,
      samples: VkConstants.VK_SAMPLE_COUNT_1_BIT, tiling: VkConstants.VK_IMAGE_TILING_OPTIMAL,
      usage: uint32(VkConstants.VK_IMAGE_USAGE_COLOR_ATTACHMENT_BIT) | uint32(VkConstants.VK_IMAGE_USAGE_TRANSFER_SRC_BIT),
      sharingMode: VkConstants.VK_SHARING_MODE_EXCLUSIVE }
    let create = dispatch.vkCreateImage
    Check(create(runtime.Device, &imageInfo, nil, &Image), "Composition image creation failed")
    var requirements = VkMemoryRequirements2{ sType: VkConstants.VK_STRUCTURE_TYPE_MEMORY_REQUIREMENTS_2 }
    var requirementsInfo = VkImageMemoryRequirementsInfo2{ sType: VkConstants.VK_STRUCTURE_TYPE_IMAGE_MEMORY_REQUIREMENTS_INFO_2, image: Image }
    let getRequirements = dispatch.vkGetImageMemoryRequirements2
    getRequirements(runtime.Device, &requirementsInfo, &requirements)
    var properties = VkMemoryWin32HandlePropertiesKHR{ sType: 1000073002 }
    let getProperties = dispatch.vkGetMemoryWin32HandlePropertiesKHR
    Check(getProperties(runtime.Device, 8u, handle, &properties), "Composition memory handle query failed")
    let bits = properties.memoryTypeBits & requirements.memoryRequirements.memoryTypeBits
    if bits == 0u { throw InvalidOperationException("Composition image has no compatible memory type") }
    var memoryType uint32
    while (bits & (1u << int32(memoryType))) == 0u { memoryType++ }
    var dedicated = VkMemoryDedicatedAllocateInfo{ sType: VkConstants.VK_STRUCTURE_TYPE_MEMORY_DEDICATED_ALLOCATE_INFO, image: Image }
    var importInfo = VkImportMemoryWin32HandleInfoKHR{ sType: 1000073000, pNext: *void(&dedicated), handleType: 8u, handle: handle }
    var allocation = VkMemoryAllocateInfo{ sType: VkConstants.VK_STRUCTURE_TYPE_MEMORY_ALLOCATE_INFO,
      pNext: *void(&importInfo), allocationSize: requirements.memoryRequirements.size, memoryTypeIndex: memoryType }
    let allocate = dispatch.vkAllocateMemory
    Check(allocate(runtime.Device, &allocation, nil, &memory), "Composition memory import failed")
    var bindInfo = VkBindImageMemoryInfo{ sType: VkConstants.VK_STRUCTURE_TYPE_BIND_IMAGE_MEMORY_INFO, image: Image, memory: memory }
    let bind = dispatch.vkBindImageMemory2
    Check(bind(runtime.Device, 1u, &bindInfo), "Composition image binding failed")
  }

  internal func PrepareSubmit(mailbox VulkanQueueMailbox) {
    if nextValue > uint64.MaxValue - 2uL { throw OverflowException("Composition fence value overflow") }
    mailbox.AddExternalWait(Semaphore, readyValue, this)
    mailbox.SubmitSignalSemaphore = Semaphore
    mailbox.SubmitHasSignal = true
    mailbox.SubmitSignalValue = nextValue
    nextValue += 2uL
  }

  internal func Present(value uint64) VkResult {
    let context = Root.Context
    let wait = cast[unmanaged[Stdcall](nint, nint, uint64) -> int32](WindowsCompositionDevice.Method(context, 148))
    let signal = cast[unmanaged[Stdcall](nint, nint, uint64) -> int32](WindowsCompositionDevice.Method(context, 147))
    let copy = cast[unmanaged[Stdcall](nint, nint, nint) -> void](WindowsCompositionDevice.Method(context, 47))
    let flush = cast[unmanaged[Stdcall](nint) -> void](WindowsCompositionDevice.Method(context, 111))
    let present = cast[unmanaged[Stdcall](nint, uint32, uint32) -> int32](WindowsCompositionDevice.Method(swapchain, 8))
    if wait(context, fence, value) < 0 { return VkConstants.VK_ERROR_DEVICE_LOST }
    copy(context, backbuffer, texture)
    if signal(context, fence, value + 1uL) < 0 { return VkConstants.VK_ERROR_DEVICE_LOST }
    readyValue = value + 1uL
    flush(context)
    let result = present(swapchain, if vsync { 1u } else { 0u }, 0u)
    if result >= 0 && !attached {
      Root.Attach(swapchain)
      attached = true
    }
    return if result < 0 { VkConstants.VK_ERROR_DEVICE_LOST } else { VkConstants.VK_SUCCESS }
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

  public func Dispose() {
    if disposed { return }
    disposed = true
    if readyValue != 0uL && !runtime.DeviceLost {
      var semaphore = Semaphore
      var value = readyValue
      var waitInfo = VkSemaphoreWaitInfo{ sType: VkConstants.VK_STRUCTURE_TYPE_SEMAPHORE_WAIT_INFO,
        semaphoreCount: 1u, pSemaphores: &semaphore, pValues: &value }
      let wait = runtime.Dispatch.vkWaitSemaphores
      let result = wait(runtime.Device, &waitInfo, uint64.MaxValue)
      if result == VkConstants.VK_ERROR_DEVICE_LOST { runtime.MarkDeviceLost() }
      else { Check(result, "Composition copy retirement failed") }
    }
    if Semaphore != 0uL {
      let destroy = runtime.Dispatch.vkDestroySemaphore
      destroy(runtime.Device, Semaphore, nil)
    }
    if Image != 0uL {
      let destroy = runtime.Dispatch.vkDestroyImage
      destroy(runtime.Device, Image, nil)
    }
    if memory != 0uL {
      let free = runtime.Dispatch.vkFreeMemory
      free(runtime.Device, memory, nil)
    }
    WindowsCompositionDevice.Release(backbuffer)
    WindowsCompositionDevice.Release(swapchain)
    WindowsCompositionDevice.Release(fence)
    WindowsCompositionDevice.Release(texture)
    if let objects = accounting {
      for index in 0 ... accountedObjects { objects.Release() }
    }
    Root.ReleaseReference()
  }
}
