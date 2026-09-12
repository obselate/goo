package Goo

import System
import System.Runtime.InteropServices

internal unsafe partial class VulkanWindowTarget {
  private func ResolveGlobalProc(nativeInstance VkInstance, name string) nint {
    let storage = Marshal.StringToCoTaskMemUTF8(name)
    try {
      let nullable = getProcAddress as (unmanaged[Cdecl](VkInstance, *int8) -> unmanaged[Cdecl]() -> void)?
      if nullable == nil {
        throw InvalidOperationException("Vulkan global procedure lookup has an invalid address")
      }
      let getProcAddressFunction = nullable
      let result = getProcAddressFunction(nativeInstance, *int8(storage))
      let address = result as nint?
      if address == nil {
        return nint(0)
      }
      return address
    } finally {
      Marshal.FreeCoTaskMem(storage)
    }
  }

  private func ResolveDeviceProc(name string) nint {
    let storage = Marshal.StringToCoTaskMemUTF8(name)
    try {
      let getDeviceProcAddr = instanceDispatch.vkGetDeviceProcAddr
      let result = getDeviceProcAddr(device, *int8(storage))
      let address = result as nint?
      if address == nil {
        return nint(0)
      }
      return address
    } finally {
      Marshal.FreeCoTaskMem(storage)
    }
  }

  private func ExtensionNameEquals(property * VkExtensionProperties, expected string) bool {
    let expectedStorage = Marshal.StringToCoTaskMemUTF8(expected)
    try {
      let expectedPointer = *int8(expectedStorage)
      let actualPointer = property -> extensionName
      var index uint32 = 0u
      while index < VkConstants.VK_MAX_EXTENSION_NAME_SIZE {
        let actual = actualPointer[index]
        let wanted = expectedPointer[index]
        if actual != wanted {
          return false
        }
        if actual == 0 {
          return true
        }
        index = index + 1u
      }
      return false
    } finally {
      Marshal.FreeCoTaskMem(expectedStorage)
    }
  }

  private func LoadDeviceDispatch() {
    let destroyDevice = ResolveDeviceProc("vkDestroyDevice") as (unmanaged[Cdecl](VkDevice, *VkAllocationCallbacks) -> void)?
    if destroyDevice == nil { throw InvalidOperationException("vkDestroyDevice is unavailable") }
    dispatch.vkDestroyDevice = destroyDevice
    deviceDestroyAvailable = true
    let getDeviceQueue = ResolveDeviceProc("vkGetDeviceQueue") as (unmanaged[Cdecl](VkDevice, uint32, uint32, *VkQueue) -> void)?
    if getDeviceQueue == nil { throw InvalidOperationException("vkGetDeviceQueue is unavailable") }
    dispatch.vkGetDeviceQueue = getDeviceQueue
    let createSwapchain = ResolveDeviceProc("vkCreateSwapchainKHR") as (unmanaged[Cdecl](VkDevice, *VkSwapchainCreateInfoKHR, *VkAllocationCallbacks, *VkSwapchainKHR) -> VkResult)?
    if createSwapchain == nil { throw InvalidOperationException("vkCreateSwapchainKHR is unavailable") }
    dispatch.vkCreateSwapchainKHR = createSwapchain
    let destroySwapchain = ResolveDeviceProc("vkDestroySwapchainKHR") as (unmanaged[Cdecl](VkDevice, VkSwapchainKHR, *VkAllocationCallbacks) -> void)?
    if destroySwapchain == nil { throw InvalidOperationException("vkDestroySwapchainKHR is unavailable") }
    dispatch.vkDestroySwapchainKHR = destroySwapchain
    let getSwapchainImages = ResolveDeviceProc("vkGetSwapchainImagesKHR") as (unmanaged[Cdecl](VkDevice, VkSwapchainKHR, *uint32, *VkImage) -> VkResult)?
    if getSwapchainImages == nil { throw InvalidOperationException("vkGetSwapchainImagesKHR is unavailable") }
    dispatch.vkGetSwapchainImagesKHR = getSwapchainImages
    let createCommandPool = ResolveDeviceProc("vkCreateCommandPool") as (unmanaged[Cdecl](VkDevice, *VkCommandPoolCreateInfo, *VkAllocationCallbacks, *VkCommandPool) -> VkResult)?
    if createCommandPool == nil { throw InvalidOperationException("vkCreateCommandPool is unavailable") }
    dispatch.vkCreateCommandPool = createCommandPool
    let destroyCommandPool = ResolveDeviceProc("vkDestroyCommandPool") as (unmanaged[Cdecl](VkDevice, VkCommandPool, *VkAllocationCallbacks) -> void)?
    if destroyCommandPool == nil { throw InvalidOperationException("vkDestroyCommandPool is unavailable") }
    dispatch.vkDestroyCommandPool = destroyCommandPool
    let allocateCommandBuffers = ResolveDeviceProc("vkAllocateCommandBuffers") as (unmanaged[Cdecl](VkDevice, *VkCommandBufferAllocateInfo, *VkCommandBuffer) -> VkResult)?
    if allocateCommandBuffers == nil { throw InvalidOperationException("vkAllocateCommandBuffers is unavailable") }
    dispatch.vkAllocateCommandBuffers = allocateCommandBuffers
    let freeCommandBuffers = ResolveDeviceProc("vkFreeCommandBuffers") as (unmanaged[Cdecl](VkDevice, VkCommandPool, uint32, *VkCommandBuffer) -> void)?
    if freeCommandBuffers == nil { throw InvalidOperationException("vkFreeCommandBuffers is unavailable") }
    dispatch.vkFreeCommandBuffers = freeCommandBuffers
    let resetCommandBuffer = ResolveDeviceProc("vkResetCommandBuffer") as (unmanaged[Cdecl](VkCommandBuffer, VkCommandBufferResetFlags) -> VkResult)?
    if resetCommandBuffer == nil { throw InvalidOperationException("vkResetCommandBuffer is unavailable") }
    dispatch.vkResetCommandBuffer = resetCommandBuffer
    let createSemaphore = ResolveDeviceProc("vkCreateSemaphore") as (unmanaged[Cdecl](VkDevice, *VkSemaphoreCreateInfo, *VkAllocationCallbacks, *VkSemaphore) -> VkResult)?
    if createSemaphore == nil { throw InvalidOperationException("vkCreateSemaphore is unavailable") }
    dispatch.vkCreateSemaphore = createSemaphore
    let destroySemaphore = ResolveDeviceProc("vkDestroySemaphore") as (unmanaged[Cdecl](VkDevice, VkSemaphore, *VkAllocationCallbacks) -> void)?
    if destroySemaphore == nil { throw InvalidOperationException("vkDestroySemaphore is unavailable") }
    dispatch.vkDestroySemaphore = destroySemaphore
    let getSemaphoreCounterValue = ResolveDeviceProc("vkGetSemaphoreCounterValue") as (unmanaged[Cdecl](VkDevice, VkSemaphore, *uint64) -> VkResult)?
    if getSemaphoreCounterValue == nil { throw InvalidOperationException("vkGetSemaphoreCounterValue is unavailable") }
    dispatch.vkGetSemaphoreCounterValue = getSemaphoreCounterValue
    let waitSemaphores = ResolveDeviceProc("vkWaitSemaphores") as (unmanaged[Cdecl](VkDevice, *VkSemaphoreWaitInfo, uint64) -> VkResult)?
    if waitSemaphores == nil { throw InvalidOperationException("vkWaitSemaphores is unavailable") }
    dispatch.vkWaitSemaphores = waitSemaphores
    let createFence = ResolveDeviceProc("vkCreateFence") as (unmanaged[Cdecl](VkDevice, *VkFenceCreateInfo, *VkAllocationCallbacks, *VkFence) -> VkResult)?
    if createFence == nil { throw InvalidOperationException("vkCreateFence is unavailable") }
    dispatch.vkCreateFence = createFence
    let destroyFence = ResolveDeviceProc("vkDestroyFence") as (unmanaged[Cdecl](VkDevice, VkFence, *VkAllocationCallbacks) -> void)?
    if destroyFence == nil { throw InvalidOperationException("vkDestroyFence is unavailable") }
    dispatch.vkDestroyFence = destroyFence
    let waitForFences = ResolveDeviceProc("vkWaitForFences") as (unmanaged[Cdecl](VkDevice, uint32, *VkFence, VkBool32, uint64) -> VkResult)?
    if waitForFences == nil { throw InvalidOperationException("vkWaitForFences is unavailable") }
    dispatch.vkWaitForFences = waitForFences
    let getFenceStatus = ResolveDeviceProc("vkGetFenceStatus") as (unmanaged[Cdecl](VkDevice, VkFence) -> VkResult)?
    if getFenceStatus == nil { throw InvalidOperationException("vkGetFenceStatus is unavailable") }
    dispatch.vkGetFenceStatus = getFenceStatus
    let resetFences = ResolveDeviceProc("vkResetFences") as (unmanaged[Cdecl](VkDevice, uint32, *VkFence) -> VkResult)?
    if resetFences == nil { throw InvalidOperationException("vkResetFences is unavailable") }
    dispatch.vkResetFences = resetFences
    let acquireNextImage = ResolveDeviceProc("vkAcquireNextImageKHR") as (unmanaged[Cdecl](VkDevice, VkSwapchainKHR, uint64, VkSemaphore, VkFence, *uint32) -> VkResult)?
    if acquireNextImage == nil { throw InvalidOperationException("vkAcquireNextImageKHR is unavailable") }
    dispatch.vkAcquireNextImageKHR = acquireNextImage
    let beginCommandBuffer = ResolveDeviceProc("vkBeginCommandBuffer") as (unmanaged[Cdecl](VkCommandBuffer, *VkCommandBufferBeginInfo) -> VkResult)?
    if beginCommandBuffer == nil { throw InvalidOperationException("vkBeginCommandBuffer is unavailable") }
    dispatch.vkBeginCommandBuffer = beginCommandBuffer
    let endCommandBuffer = ResolveDeviceProc("vkEndCommandBuffer") as (unmanaged[Cdecl](VkCommandBuffer) -> VkResult)?
    if endCommandBuffer == nil { throw InvalidOperationException("vkEndCommandBuffer is unavailable") }
    dispatch.vkEndCommandBuffer = endCommandBuffer
    let pipelineBarrier = ResolveDeviceProc("vkCmdPipelineBarrier2") as (unmanaged[Cdecl](VkCommandBuffer, *VkDependencyInfo) -> void)?
    if pipelineBarrier == nil { throw InvalidOperationException("vkCmdPipelineBarrier2 is unavailable") }
    dispatch.vkCmdPipelineBarrier2 = pipelineBarrier
    let clearColorImage = ResolveDeviceProc("vkCmdClearColorImage") as (unmanaged[Cdecl](VkCommandBuffer, VkImage, VkImageLayout, *VkClearColorValue, uint32, *VkImageSubresourceRange) -> void)?
    if clearColorImage == nil { throw InvalidOperationException("vkCmdClearColorImage is unavailable") }
    dispatch.vkCmdClearColorImage = clearColorImage
    let copyImage = ResolveDeviceProc("vkCmdCopyImage") as (unmanaged[Cdecl](VkCommandBuffer, VkImage, VkImageLayout, VkImage, VkImageLayout, uint32, *VkImageCopy) -> void)?
    if copyImage == nil { throw InvalidOperationException("vkCmdCopyImage is unavailable") }
    dispatch.vkCmdCopyImage = copyImage
    let queueSubmit = ResolveDeviceProc("vkQueueSubmit2") as (unmanaged[Cdecl](VkQueue, uint32, *VkSubmitInfo2, VkFence) -> VkResult)?
    if queueSubmit == nil { throw InvalidOperationException("vkQueueSubmit2 is unavailable") }
    dispatch.vkQueueSubmit2 = queueSubmit
    let queuePresent = ResolveDeviceProc("vkQueuePresentKHR") as (unmanaged[Cdecl](VkQueue, *VkPresentInfoKHR) -> VkResult)?
    if queuePresent == nil { throw InvalidOperationException("vkQueuePresentKHR is unavailable") }
    dispatch.vkQueuePresentKHR = queuePresent
    if diagnostics != nil {
      let createQueryPool = ResolveDeviceProc("vkCreateQueryPool") as (unmanaged[Cdecl](VkDevice, *VkQueryPoolCreateInfo, *VkAllocationCallbacks, *VkQueryPool) -> VkResult)?
      if createQueryPool == nil { throw InvalidOperationException("vkCreateQueryPool is unavailable") }
      dispatch.vkCreateQueryPool = createQueryPool
      let destroyQueryPool = ResolveDeviceProc("vkDestroyQueryPool") as (unmanaged[Cdecl](VkDevice, VkQueryPool, *VkAllocationCallbacks) -> void)?
      if destroyQueryPool == nil { throw InvalidOperationException("vkDestroyQueryPool is unavailable") }
      dispatch.vkDestroyQueryPool = destroyQueryPool
      let getQueryPoolResults = ResolveDeviceProc("vkGetQueryPoolResults") as (unmanaged[Cdecl](VkDevice, VkQueryPool, uint32, uint32, nuint, *void, VkDeviceSize, VkQueryResultFlags) -> VkResult)?
      if getQueryPoolResults == nil { throw InvalidOperationException("vkGetQueryPoolResults is unavailable") }
      dispatch.vkGetQueryPoolResults = getQueryPoolResults
      let resetQueryPool = ResolveDeviceProc("vkCmdResetQueryPool") as (unmanaged[Cdecl](VkCommandBuffer, VkQueryPool, uint32, uint32) -> void)?
      if resetQueryPool == nil { throw InvalidOperationException("vkCmdResetQueryPool is unavailable") }
      dispatch.vkCmdResetQueryPool = resetQueryPool
      let writeTimestamp = ResolveDeviceProc("vkCmdWriteTimestamp2") as (unmanaged[Cdecl](VkCommandBuffer, VkPipelineStageFlags2, VkQueryPool, uint32) -> void)?
      if writeTimestamp == nil { throw InvalidOperationException("vkCmdWriteTimestamp2 is unavailable") }
      dispatch.vkCmdWriteTimestamp2 = writeTimestamp
    }
    let createImageView = ResolveDeviceProc("vkCreateImageView") as (unmanaged[Cdecl](VkDevice, *VkImageViewCreateInfo, *VkAllocationCallbacks, *VkImageView) -> VkResult)?
    if createImageView == nil { throw InvalidOperationException("vkCreateImageView is unavailable") }
    dispatch.vkCreateImageView = createImageView
    let destroyImageView = ResolveDeviceProc("vkDestroyImageView") as (unmanaged[Cdecl](VkDevice, VkImageView, *VkAllocationCallbacks) -> void)?
    if destroyImageView == nil { throw InvalidOperationException("vkDestroyImageView is unavailable") }
    dispatch.vkDestroyImageView = destroyImageView
    let createShaderModule = ResolveDeviceProc("vkCreateShaderModule") as (unmanaged[Cdecl](VkDevice, *VkShaderModuleCreateInfo, *VkAllocationCallbacks, *VkShaderModule) -> VkResult)?
    if createShaderModule == nil { throw InvalidOperationException("vkCreateShaderModule is unavailable") }
    dispatch.vkCreateShaderModule = createShaderModule
    let destroyShaderModule = ResolveDeviceProc("vkDestroyShaderModule") as (unmanaged[Cdecl](VkDevice, VkShaderModule, *VkAllocationCallbacks) -> void)?
    if destroyShaderModule == nil { throw InvalidOperationException("vkDestroyShaderModule is unavailable") }
    dispatch.vkDestroyShaderModule = destroyShaderModule
    let createPipelineLayout = ResolveDeviceProc("vkCreatePipelineLayout") as (unmanaged[Cdecl](VkDevice, *VkPipelineLayoutCreateInfo, *VkAllocationCallbacks, *VkPipelineLayout) -> VkResult)?
    if createPipelineLayout == nil { throw InvalidOperationException("vkCreatePipelineLayout is unavailable") }
    dispatch.vkCreatePipelineLayout = createPipelineLayout
    let destroyPipelineLayout = ResolveDeviceProc("vkDestroyPipelineLayout") as (unmanaged[Cdecl](VkDevice, VkPipelineLayout, *VkAllocationCallbacks) -> void)?
    if destroyPipelineLayout == nil { throw InvalidOperationException("vkDestroyPipelineLayout is unavailable") }
    dispatch.vkDestroyPipelineLayout = destroyPipelineLayout
    let createPipelineCache = ResolveDeviceProc("vkCreatePipelineCache") as (unmanaged[Cdecl](VkDevice, *VkPipelineCacheCreateInfo, *VkAllocationCallbacks, *VkPipelineCache) -> VkResult)?
    if createPipelineCache == nil { throw InvalidOperationException("vkCreatePipelineCache is unavailable") }
    dispatch.vkCreatePipelineCache = createPipelineCache
    let destroyPipelineCache = ResolveDeviceProc("vkDestroyPipelineCache") as (unmanaged[Cdecl](VkDevice, VkPipelineCache, *VkAllocationCallbacks) -> void)?
    if destroyPipelineCache == nil { throw InvalidOperationException("vkDestroyPipelineCache is unavailable") }
    dispatch.vkDestroyPipelineCache = destroyPipelineCache
    let getPipelineCacheData = ResolveDeviceProc("vkGetPipelineCacheData") as (unmanaged[Cdecl](VkDevice, VkPipelineCache, *nuint, *void) -> VkResult)?
    if getPipelineCacheData == nil { throw InvalidOperationException("vkGetPipelineCacheData is unavailable") }
    dispatch.vkGetPipelineCacheData = getPipelineCacheData
    let createGraphicsPipelines = ResolveDeviceProc("vkCreateGraphicsPipelines") as (unmanaged[Cdecl](VkDevice, VkPipelineCache, uint32, *VkGraphicsPipelineCreateInfo, *VkAllocationCallbacks, *VkPipeline) -> VkResult)?
    if createGraphicsPipelines == nil { throw InvalidOperationException("vkCreateGraphicsPipelines is unavailable") }
    dispatch.vkCreateGraphicsPipelines = createGraphicsPipelines
    let destroyPipeline = ResolveDeviceProc("vkDestroyPipeline") as (unmanaged[Cdecl](VkDevice, VkPipeline, *VkAllocationCallbacks) -> void)?
    if destroyPipeline == nil { throw InvalidOperationException("vkDestroyPipeline is unavailable") }
    dispatch.vkDestroyPipeline = destroyPipeline
    let beginRendering = ResolveDeviceProc("vkCmdBeginRendering") as (unmanaged[Cdecl](VkCommandBuffer, *VkRenderingInfo) -> void)?
    if beginRendering == nil { throw InvalidOperationException("vkCmdBeginRendering is unavailable") }
    dispatch.vkCmdBeginRendering = beginRendering
    let endRendering = ResolveDeviceProc("vkCmdEndRendering") as (unmanaged[Cdecl](VkCommandBuffer) -> void)?
    if endRendering == nil { throw InvalidOperationException("vkCmdEndRendering is unavailable") }
    dispatch.vkCmdEndRendering = endRendering
    let bindPipeline = ResolveDeviceProc("vkCmdBindPipeline") as (unmanaged[Cdecl](VkCommandBuffer, VkPipelineBindPoint, VkPipeline) -> void)?
    if bindPipeline == nil { throw InvalidOperationException("vkCmdBindPipeline is unavailable") }
    dispatch.vkCmdBindPipeline = bindPipeline
    let pushConstants = ResolveDeviceProc("vkCmdPushConstants") as (unmanaged[Cdecl](VkCommandBuffer, VkPipelineLayout, VkShaderStageFlags, uint32, uint32, *void) -> void)?
    if pushConstants == nil { throw InvalidOperationException("vkCmdPushConstants is unavailable") }
    dispatch.vkCmdPushConstants = pushConstants
    let draw = ResolveDeviceProc("vkCmdDraw") as (unmanaged[Cdecl](VkCommandBuffer, uint32, uint32, uint32, uint32) -> void)?
    if draw == nil { throw InvalidOperationException("vkCmdDraw is unavailable") }
    dispatch.vkCmdDraw = draw
    let setViewport = ResolveDeviceProc("vkCmdSetViewport") as (unmanaged[Cdecl](VkCommandBuffer, uint32, uint32, *VkViewport) -> void)?
    if setViewport == nil { throw InvalidOperationException("vkCmdSetViewport is unavailable") }
    dispatch.vkCmdSetViewport = setViewport
    let setScissor = ResolveDeviceProc("vkCmdSetScissor") as (unmanaged[Cdecl](VkCommandBuffer, uint32, uint32, *VkRect2D) -> void)?
    if setScissor == nil { throw InvalidOperationException("vkCmdSetScissor is unavailable") }
    dispatch.vkCmdSetScissor = setScissor
    let createImage = ResolveDeviceProc("vkCreateImage") as (unmanaged[Cdecl](VkDevice, *VkImageCreateInfo, *VkAllocationCallbacks, *VkImage) -> VkResult)?
    if createImage == nil { throw InvalidOperationException("vkCreateImage is unavailable") }
    dispatch.vkCreateImage = createImage
    let destroyImage = ResolveDeviceProc("vkDestroyImage") as (unmanaged[Cdecl](VkDevice, VkImage, *VkAllocationCallbacks) -> void)?
    if destroyImage == nil { throw InvalidOperationException("vkDestroyImage is unavailable") }
    dispatch.vkDestroyImage = destroyImage
    let getImageMemoryRequirements2 = ResolveDeviceProc("vkGetImageMemoryRequirements2") as (unmanaged[Cdecl](VkDevice, *VkImageMemoryRequirementsInfo2, *VkMemoryRequirements2) -> void)?
    if getImageMemoryRequirements2 == nil { throw InvalidOperationException("vkGetImageMemoryRequirements2 is unavailable") }
    dispatch.vkGetImageMemoryRequirements2 = getImageMemoryRequirements2
    let bindImageMemory2 = ResolveDeviceProc("vkBindImageMemory2") as (unmanaged[Cdecl](VkDevice, uint32, *VkBindImageMemoryInfo) -> VkResult)?
    if bindImageMemory2 == nil { throw InvalidOperationException("vkBindImageMemory2 is unavailable") }
    dispatch.vkBindImageMemory2 = bindImageMemory2
    let createBuffer = ResolveDeviceProc("vkCreateBuffer") as (unmanaged[Cdecl](VkDevice, *VkBufferCreateInfo, *VkAllocationCallbacks, *VkBuffer) -> VkResult)?
    if createBuffer == nil { throw InvalidOperationException("vkCreateBuffer is unavailable") }
    dispatch.vkCreateBuffer = createBuffer
    let destroyBuffer = ResolveDeviceProc("vkDestroyBuffer") as (unmanaged[Cdecl](VkDevice, VkBuffer, *VkAllocationCallbacks) -> void)?
    if destroyBuffer == nil { throw InvalidOperationException("vkDestroyBuffer is unavailable") }
    dispatch.vkDestroyBuffer = destroyBuffer
    let getBufferMemoryRequirements2 = ResolveDeviceProc("vkGetBufferMemoryRequirements2") as (unmanaged[Cdecl](VkDevice, *VkBufferMemoryRequirementsInfo2, *VkMemoryRequirements2) -> void)?
    if getBufferMemoryRequirements2 == nil { throw InvalidOperationException("vkGetBufferMemoryRequirements2 is unavailable") }
    dispatch.vkGetBufferMemoryRequirements2 = getBufferMemoryRequirements2
    let allocateMemory = ResolveDeviceProc("vkAllocateMemory") as (unmanaged[Cdecl](VkDevice, *VkMemoryAllocateInfo, *VkAllocationCallbacks, *VkDeviceMemory) -> VkResult)?
    if allocateMemory == nil { throw InvalidOperationException("vkAllocateMemory is unavailable") }
    dispatch.vkAllocateMemory = allocateMemory
    let freeMemory = ResolveDeviceProc("vkFreeMemory") as (unmanaged[Cdecl](VkDevice, VkDeviceMemory, *VkAllocationCallbacks) -> void)?
    if freeMemory == nil { throw InvalidOperationException("vkFreeMemory is unavailable") }
    dispatch.vkFreeMemory = freeMemory
    let bindBufferMemory2 = ResolveDeviceProc("vkBindBufferMemory2") as (unmanaged[Cdecl](VkDevice, uint32, *VkBindBufferMemoryInfo) -> VkResult)?
    if bindBufferMemory2 == nil { throw InvalidOperationException("vkBindBufferMemory2 is unavailable") }
    dispatch.vkBindBufferMemory2 = bindBufferMemory2
    let mapMemory = ResolveDeviceProc("vkMapMemory") as (unmanaged[Cdecl](VkDevice, VkDeviceMemory, VkDeviceSize, VkDeviceSize, VkMemoryMapFlags, *void) -> VkResult)?
    if mapMemory == nil { throw InvalidOperationException("vkMapMemory is unavailable") }
    dispatch.vkMapMemory = mapMemory
    let unmapMemory = ResolveDeviceProc("vkUnmapMemory") as (unmanaged[Cdecl](VkDevice, VkDeviceMemory) -> void)?
    if unmapMemory == nil { throw InvalidOperationException("vkUnmapMemory is unavailable") }
    dispatch.vkUnmapMemory = unmapMemory
    let invalidateMappedMemoryRanges = ResolveDeviceProc("vkInvalidateMappedMemoryRanges") as (unmanaged[Cdecl](VkDevice, uint32, *VkMappedMemoryRange) -> VkResult)?
    if invalidateMappedMemoryRanges == nil { throw InvalidOperationException("vkInvalidateMappedMemoryRanges is unavailable") }
    dispatch.vkInvalidateMappedMemoryRanges = invalidateMappedMemoryRanges
    let flushMappedMemoryRanges = ResolveDeviceProc("vkFlushMappedMemoryRanges") as (unmanaged[Cdecl](VkDevice, uint32, *VkMappedMemoryRange) -> VkResult)?
    if flushMappedMemoryRanges == nil { throw InvalidOperationException("vkFlushMappedMemoryRanges is unavailable") }
    dispatch.vkFlushMappedMemoryRanges = flushMappedMemoryRanges
    let copyBuffer = ResolveDeviceProc("vkCmdCopyBuffer") as (unmanaged[Cdecl](VkCommandBuffer, VkBuffer, VkBuffer, uint32, *VkBufferCopy) -> void)?
    if copyBuffer == nil { throw InvalidOperationException("vkCmdCopyBuffer is unavailable") }
    dispatch.vkCmdCopyBuffer = copyBuffer
    let copyBufferToImage = ResolveDeviceProc("vkCmdCopyBufferToImage") as (unmanaged[Cdecl](VkCommandBuffer, VkBuffer, VkImage, VkImageLayout, uint32, *VkBufferImageCopy) -> void)?
    if copyBufferToImage == nil { throw InvalidOperationException("vkCmdCopyBufferToImage is unavailable") }
    dispatch.vkCmdCopyBufferToImage = copyBufferToImage
    let createBufferView = ResolveDeviceProc("vkCreateBufferView") as (unmanaged[Cdecl](VkDevice, *VkBufferViewCreateInfo, *VkAllocationCallbacks, *VkBufferView) -> VkResult)?
    if createBufferView == nil { throw InvalidOperationException("vkCreateBufferView is unavailable") }
    dispatch.vkCreateBufferView = createBufferView
    let destroyBufferView = ResolveDeviceProc("vkDestroyBufferView") as (unmanaged[Cdecl](VkDevice, VkBufferView, *VkAllocationCallbacks) -> void)?
    if destroyBufferView == nil { throw InvalidOperationException("vkDestroyBufferView is unavailable") }
    dispatch.vkDestroyBufferView = destroyBufferView
    let createSampler = ResolveDeviceProc("vkCreateSampler") as (unmanaged[Cdecl](VkDevice, *VkSamplerCreateInfo, *VkAllocationCallbacks, *VkSampler) -> VkResult)?
    if createSampler == nil { throw InvalidOperationException("vkCreateSampler is unavailable") }
    dispatch.vkCreateSampler = createSampler
    let destroySampler = ResolveDeviceProc("vkDestroySampler") as (unmanaged[Cdecl](VkDevice, VkSampler, *VkAllocationCallbacks) -> void)?
    if destroySampler == nil { throw InvalidOperationException("vkDestroySampler is unavailable") }
    dispatch.vkDestroySampler = destroySampler
    let createDescriptorSetLayout = ResolveDeviceProc("vkCreateDescriptorSetLayout") as (unmanaged[Cdecl](VkDevice, *VkDescriptorSetLayoutCreateInfo, *VkAllocationCallbacks, *VkDescriptorSetLayout) -> VkResult)?
    if createDescriptorSetLayout == nil { throw InvalidOperationException("vkCreateDescriptorSetLayout is unavailable") }
    dispatch.vkCreateDescriptorSetLayout = createDescriptorSetLayout
    let destroyDescriptorSetLayout = ResolveDeviceProc("vkDestroyDescriptorSetLayout") as (unmanaged[Cdecl](VkDevice, VkDescriptorSetLayout, *VkAllocationCallbacks) -> void)?
    if destroyDescriptorSetLayout == nil { throw InvalidOperationException("vkDestroyDescriptorSetLayout is unavailable") }
    dispatch.vkDestroyDescriptorSetLayout = destroyDescriptorSetLayout
    let createDescriptorPool = ResolveDeviceProc("vkCreateDescriptorPool") as (unmanaged[Cdecl](VkDevice, *VkDescriptorPoolCreateInfo, *VkAllocationCallbacks, *VkDescriptorPool) -> VkResult)?
    if createDescriptorPool == nil { throw InvalidOperationException("vkCreateDescriptorPool is unavailable") }
    dispatch.vkCreateDescriptorPool = createDescriptorPool
    let destroyDescriptorPool = ResolveDeviceProc("vkDestroyDescriptorPool") as (unmanaged[Cdecl](VkDevice, VkDescriptorPool, *VkAllocationCallbacks) -> void)?
    if destroyDescriptorPool == nil { throw InvalidOperationException("vkDestroyDescriptorPool is unavailable") }
    dispatch.vkDestroyDescriptorPool = destroyDescriptorPool
    let allocateDescriptorSets = ResolveDeviceProc("vkAllocateDescriptorSets") as (unmanaged[Cdecl](VkDevice, *VkDescriptorSetAllocateInfo, *VkDescriptorSet) -> VkResult)?
    if allocateDescriptorSets == nil { throw InvalidOperationException("vkAllocateDescriptorSets is unavailable") }
    dispatch.vkAllocateDescriptorSets = allocateDescriptorSets
    let updateDescriptorSets = ResolveDeviceProc("vkUpdateDescriptorSets") as (unmanaged[Cdecl](VkDevice, uint32, *VkWriteDescriptorSet, uint32, *VkCopyDescriptorSet) -> void)?
    if updateDescriptorSets == nil { throw InvalidOperationException("vkUpdateDescriptorSets is unavailable") }
    dispatch.vkUpdateDescriptorSets = updateDescriptorSets
    let bindDescriptorSets = ResolveDeviceProc("vkCmdBindDescriptorSets") as (unmanaged[Cdecl](VkCommandBuffer, VkPipelineBindPoint, VkPipelineLayout, uint32, uint32, *VkDescriptorSet, uint32, *uint32) -> void)?
    if bindDescriptorSets == nil { throw InvalidOperationException("vkCmdBindDescriptorSets is unavailable") }
    dispatch.vkCmdBindDescriptorSets = bindDescriptorSets
    deviceWaitIdleAddress = ResolveDeviceProc("vkDeviceWaitIdle")
    if deviceWaitIdleAddress == nint(0) {
      throw InvalidOperationException("vkDeviceWaitIdle is unavailable")
    }
  }
}
