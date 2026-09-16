package Goo

import System.Runtime.InteropServices

@StructLayout(LayoutKind.Sequential)
internal unsafe struct VkInstanceDispatch {
  var vkDestroyInstance unmanaged[Cdecl](VkInstance, *VkAllocationCallbacks) -> void
  var vkEnumeratePhysicalDevices unmanaged[Cdecl](VkInstance, *uint32, *VkPhysicalDevice) -> VkResult
  var vkGetPhysicalDeviceQueueFamilyProperties unmanaged[Cdecl](VkPhysicalDevice, *uint32, *VkQueueFamilyProperties) -> void
  var vkGetPhysicalDeviceProperties unmanaged[Cdecl](VkPhysicalDevice, *VkPhysicalDeviceProperties) -> void
  var vkDestroySurfaceKHR unmanaged[Cdecl](VkInstance, VkSurfaceKHR, *VkAllocationCallbacks) -> void
  var vkGetPhysicalDeviceSurfaceSupportKHR unmanaged[Cdecl](VkPhysicalDevice, uint32, VkSurfaceKHR, *VkBool32) -> VkResult
  var vkGetDeviceProcAddr unmanaged[Cdecl](VkDevice, *int8) -> unmanaged[Cdecl]() -> void
  var vkGetPhysicalDeviceFeatures2 unmanaged[Cdecl](VkPhysicalDevice, *VkPhysicalDeviceFeatures2) -> void
  var vkEnumerateDeviceExtensionProperties unmanaged[Cdecl](VkPhysicalDevice, *int8, *uint32, *VkExtensionProperties) -> VkResult
  var vkGetPhysicalDeviceSurfaceCapabilitiesKHR unmanaged[Cdecl](VkPhysicalDevice, VkSurfaceKHR, *VkSurfaceCapabilitiesKHR) -> VkResult
  var vkGetPhysicalDeviceSurfaceFormatsKHR unmanaged[Cdecl](VkPhysicalDevice, VkSurfaceKHR, *uint32, *VkSurfaceFormatKHR) -> VkResult
  var vkGetPhysicalDeviceSurfacePresentModesKHR unmanaged[Cdecl](VkPhysicalDevice, VkSurfaceKHR, *uint32, *VkPresentModeKHR) -> VkResult
  var vkGetPhysicalDeviceMemoryProperties unmanaged[Cdecl](VkPhysicalDevice, *VkPhysicalDeviceMemoryProperties) -> void
  var vkGetPhysicalDeviceMemoryProperties2 unmanaged[Cdecl](VkPhysicalDevice, *VkPhysicalDeviceMemoryProperties2) -> void
  var vkGetPhysicalDeviceFormatProperties unmanaged[Cdecl](VkPhysicalDevice, VkFormat, *VkFormatProperties) -> void
  var vkCreateDevice unmanaged[Cdecl](VkPhysicalDevice, *VkDeviceCreateInfo, *VkAllocationCallbacks, *VkDevice) -> VkResult
  var vkCreateDebugUtilsMessengerEXT unmanaged[Cdecl](VkInstance, *VkDebugUtilsMessengerCreateInfoEXT, *VkAllocationCallbacks, *VkDebugUtilsMessengerEXT) -> VkResult
  var vkDestroyDebugUtilsMessengerEXT unmanaged[Cdecl](VkInstance, VkDebugUtilsMessengerEXT, *VkAllocationCallbacks) -> void
}
@StructLayout(LayoutKind.Sequential)
internal unsafe struct VkDeviceDispatch {
  var vkDestroyDevice unmanaged[Cdecl](VkDevice, *VkAllocationCallbacks) -> void
  var vkGetDeviceQueue unmanaged[Cdecl](VkDevice, uint32, uint32, *VkQueue) -> void
  var vkCreateSwapchainKHR unmanaged[Cdecl](VkDevice, *VkSwapchainCreateInfoKHR, *VkAllocationCallbacks, *VkSwapchainKHR) -> VkResult
  var vkDestroySwapchainKHR unmanaged[Cdecl](VkDevice, VkSwapchainKHR, *VkAllocationCallbacks) -> void
  var vkGetSwapchainImagesKHR unmanaged[Cdecl](VkDevice, VkSwapchainKHR, *uint32, *VkImage) -> VkResult
  var vkCreateCommandPool unmanaged[Cdecl](VkDevice, *VkCommandPoolCreateInfo, *VkAllocationCallbacks, *VkCommandPool) -> VkResult
  var vkDestroyCommandPool unmanaged[Cdecl](VkDevice, VkCommandPool, *VkAllocationCallbacks) -> void
  var vkAllocateCommandBuffers unmanaged[Cdecl](VkDevice, *VkCommandBufferAllocateInfo, *VkCommandBuffer) -> VkResult
  var vkFreeCommandBuffers unmanaged[Cdecl](VkDevice, VkCommandPool, uint32, *VkCommandBuffer) -> void
  var vkResetCommandBuffer unmanaged[Cdecl](VkCommandBuffer, VkCommandBufferResetFlags) -> VkResult
  var vkCreateSemaphore unmanaged[Cdecl](VkDevice, *VkSemaphoreCreateInfo, *VkAllocationCallbacks, *VkSemaphore) -> VkResult
  var vkDestroySemaphore unmanaged[Cdecl](VkDevice, VkSemaphore, *VkAllocationCallbacks) -> void
  var vkGetSemaphoreCounterValue unmanaged[Cdecl](VkDevice, VkSemaphore, *uint64) -> VkResult
  var vkWaitSemaphores unmanaged[Cdecl](VkDevice, *VkSemaphoreWaitInfo, uint64) -> VkResult
  var vkCreateFence unmanaged[Cdecl](VkDevice, *VkFenceCreateInfo, *VkAllocationCallbacks, *VkFence) -> VkResult
  var vkDestroyFence unmanaged[Cdecl](VkDevice, VkFence, *VkAllocationCallbacks) -> void
  var vkWaitForFences unmanaged[Cdecl](VkDevice, uint32, *VkFence, VkBool32, uint64) -> VkResult
  var vkGetFenceStatus unmanaged[Cdecl](VkDevice, VkFence) -> VkResult
  var vkResetFences unmanaged[Cdecl](VkDevice, uint32, *VkFence) -> VkResult
  var vkAcquireNextImageKHR unmanaged[Cdecl](VkDevice, VkSwapchainKHR, uint64, VkSemaphore, VkFence, *uint32) -> VkResult
  var vkBeginCommandBuffer unmanaged[Cdecl](VkCommandBuffer, *VkCommandBufferBeginInfo) -> VkResult
  var vkEndCommandBuffer unmanaged[Cdecl](VkCommandBuffer) -> VkResult
  var vkCmdPipelineBarrier2 unmanaged[Cdecl](VkCommandBuffer, *VkDependencyInfo) -> void
  var vkCmdClearColorImage unmanaged[Cdecl](VkCommandBuffer, VkImage, VkImageLayout, *VkClearColorValue, uint32, *VkImageSubresourceRange) -> void
  var vkQueueSubmit2 unmanaged[Cdecl](VkQueue, uint32, *VkSubmitInfo2, VkFence) -> VkResult
  var vkQueuePresentKHR unmanaged[Cdecl](VkQueue, *VkPresentInfoKHR) -> VkResult
  var vkCreateQueryPool unmanaged[Cdecl](VkDevice, *VkQueryPoolCreateInfo, *VkAllocationCallbacks, *VkQueryPool) -> VkResult
  var vkDestroyQueryPool unmanaged[Cdecl](VkDevice, VkQueryPool, *VkAllocationCallbacks) -> void
  var vkGetQueryPoolResults unmanaged[Cdecl](VkDevice, VkQueryPool, uint32, uint32, nuint, *void, VkDeviceSize, VkQueryResultFlags) -> VkResult
  var vkCmdResetQueryPool unmanaged[Cdecl](VkCommandBuffer, VkQueryPool, uint32, uint32) -> void
  var vkCmdWriteTimestamp2 unmanaged[Cdecl](VkCommandBuffer, VkPipelineStageFlags2, VkQueryPool, uint32) -> void
  var vkCreateImageView unmanaged[Cdecl](VkDevice, *VkImageViewCreateInfo, *VkAllocationCallbacks, *VkImageView) -> VkResult
  var vkDestroyImageView unmanaged[Cdecl](VkDevice, VkImageView, *VkAllocationCallbacks) -> void
  var vkCreateShaderModule unmanaged[Cdecl](VkDevice, *VkShaderModuleCreateInfo, *VkAllocationCallbacks, *VkShaderModule) -> VkResult
  var vkDestroyShaderModule unmanaged[Cdecl](VkDevice, VkShaderModule, *VkAllocationCallbacks) -> void
  var vkCreatePipelineLayout unmanaged[Cdecl](VkDevice, *VkPipelineLayoutCreateInfo, *VkAllocationCallbacks, *VkPipelineLayout) -> VkResult
  var vkDestroyPipelineLayout unmanaged[Cdecl](VkDevice, VkPipelineLayout, *VkAllocationCallbacks) -> void
  var vkCreatePipelineCache unmanaged[Cdecl](VkDevice, *VkPipelineCacheCreateInfo, *VkAllocationCallbacks, *VkPipelineCache) -> VkResult
  var vkDestroyPipelineCache unmanaged[Cdecl](VkDevice, VkPipelineCache, *VkAllocationCallbacks) -> void
  var vkGetPipelineCacheData unmanaged[Cdecl](VkDevice, VkPipelineCache, *nuint, *void) -> VkResult
  var vkCreateGraphicsPipelines unmanaged[Cdecl](VkDevice, VkPipelineCache, uint32, *VkGraphicsPipelineCreateInfo, *VkAllocationCallbacks, *VkPipeline) -> VkResult
  var vkDestroyPipeline unmanaged[Cdecl](VkDevice, VkPipeline, *VkAllocationCallbacks) -> void
  var vkCmdBeginRendering unmanaged[Cdecl](VkCommandBuffer, *VkRenderingInfo) -> void
  var vkCmdEndRendering unmanaged[Cdecl](VkCommandBuffer) -> void
  var vkCmdBindPipeline unmanaged[Cdecl](VkCommandBuffer, VkPipelineBindPoint, VkPipeline) -> void
  var vkCmdPushConstants unmanaged[Cdecl](VkCommandBuffer, VkPipelineLayout, VkShaderStageFlags, uint32, uint32, *void) -> void
  var vkCmdDraw unmanaged[Cdecl](VkCommandBuffer, uint32, uint32, uint32, uint32) -> void
  var vkCmdSetViewport unmanaged[Cdecl](VkCommandBuffer, uint32, uint32, *VkViewport) -> void
  var vkCmdSetScissor unmanaged[Cdecl](VkCommandBuffer, uint32, uint32, *VkRect2D) -> void
  var vkCreateImage unmanaged[Cdecl](VkDevice, *VkImageCreateInfo, *VkAllocationCallbacks, *VkImage) -> VkResult
  var vkDestroyImage unmanaged[Cdecl](VkDevice, VkImage, *VkAllocationCallbacks) -> void
  var vkGetImageMemoryRequirements2 unmanaged[Cdecl](VkDevice, *VkImageMemoryRequirementsInfo2, *VkMemoryRequirements2) -> void
  var vkAllocateMemory unmanaged[Cdecl](VkDevice, *VkMemoryAllocateInfo, *VkAllocationCallbacks, *VkDeviceMemory) -> VkResult
  var vkFreeMemory unmanaged[Cdecl](VkDevice, VkDeviceMemory, *VkAllocationCallbacks) -> void
  var vkBindImageMemory2 unmanaged[Cdecl](VkDevice, uint32, *VkBindImageMemoryInfo) -> VkResult
  var vkCreateBuffer unmanaged[Cdecl](VkDevice, *VkBufferCreateInfo, *VkAllocationCallbacks, *VkBuffer) -> VkResult
  var vkDestroyBuffer unmanaged[Cdecl](VkDevice, VkBuffer, *VkAllocationCallbacks) -> void
  var vkGetBufferMemoryRequirements2 unmanaged[Cdecl](VkDevice, *VkBufferMemoryRequirementsInfo2, *VkMemoryRequirements2) -> void
  var vkBindBufferMemory2 unmanaged[Cdecl](VkDevice, uint32, *VkBindBufferMemoryInfo) -> VkResult
  var vkMapMemory unmanaged[Cdecl](VkDevice, VkDeviceMemory, VkDeviceSize, VkDeviceSize, VkMemoryMapFlags, *void) -> VkResult
  var vkUnmapMemory unmanaged[Cdecl](VkDevice, VkDeviceMemory) -> void
  var vkInvalidateMappedMemoryRanges unmanaged[Cdecl](VkDevice, uint32, *VkMappedMemoryRange) -> VkResult
  var vkFlushMappedMemoryRanges unmanaged[Cdecl](VkDevice, uint32, *VkMappedMemoryRange) -> VkResult
  var vkCmdCopyBuffer unmanaged[Cdecl](VkCommandBuffer, VkBuffer, VkBuffer, uint32, *VkBufferCopy) -> void
  var vkCmdCopyBufferToImage unmanaged[Cdecl](VkCommandBuffer, VkBuffer, VkImage, VkImageLayout, uint32, *VkBufferImageCopy) -> void
  var vkCmdCopyImage unmanaged[Cdecl](VkCommandBuffer, VkImage, VkImageLayout, VkImage, VkImageLayout, uint32, *VkImageCopy) -> void
  var vkCreateBufferView unmanaged[Cdecl](VkDevice, *VkBufferViewCreateInfo, *VkAllocationCallbacks, *VkBufferView) -> VkResult
  var vkDestroyBufferView unmanaged[Cdecl](VkDevice, VkBufferView, *VkAllocationCallbacks) -> void
  var vkCreateSampler unmanaged[Cdecl](VkDevice, *VkSamplerCreateInfo, *VkAllocationCallbacks, *VkSampler) -> VkResult
  var vkDestroySampler unmanaged[Cdecl](VkDevice, VkSampler, *VkAllocationCallbacks) -> void
  var vkCreateDescriptorSetLayout unmanaged[Cdecl](VkDevice, *VkDescriptorSetLayoutCreateInfo, *VkAllocationCallbacks, *VkDescriptorSetLayout) -> VkResult
  var vkDestroyDescriptorSetLayout unmanaged[Cdecl](VkDevice, VkDescriptorSetLayout, *VkAllocationCallbacks) -> void
  var vkCreateDescriptorPool unmanaged[Cdecl](VkDevice, *VkDescriptorPoolCreateInfo, *VkAllocationCallbacks, *VkDescriptorPool) -> VkResult
  var vkDestroyDescriptorPool unmanaged[Cdecl](VkDevice, VkDescriptorPool, *VkAllocationCallbacks) -> void
  var vkAllocateDescriptorSets unmanaged[Cdecl](VkDevice, *VkDescriptorSetAllocateInfo, *VkDescriptorSet) -> VkResult
  var vkUpdateDescriptorSets unmanaged[Cdecl](VkDevice, uint32, *VkWriteDescriptorSet, uint32, *VkCopyDescriptorSet) -> void
  var vkCmdBindDescriptorSets unmanaged[Cdecl](VkCommandBuffer, VkPipelineBindPoint, VkPipelineLayout, uint32, uint32, *VkDescriptorSet, uint32, *uint32) -> void
}
