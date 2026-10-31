package Goo

internal enum VulkanWindowStartupState { None; Pending; Ready; Closing }

internal unsafe data struct VulkanWindowTargetExtensionPointer {
  var Value * int8
}

internal enum VulkanSwapchainMaintenanceVariant {
  None = 0;
  Ext = 1;
  Khr = 2;
}

internal class VulkanWindowTargetExtensionNames {
  internal const SurfaceMaintenanceExt string = "VK_EXT_surface_maintenance1"
  internal const SurfaceMaintenanceKhr string = "VK_KHR_surface_maintenance1"
  internal const SwapchainMaintenanceExt string = "VK_EXT_swapchain_maintenance1"
  internal const SwapchainMaintenanceKhr string = "VK_KHR_swapchain_maintenance1"
  internal const SwapchainMutableFormat string = "VK_KHR_swapchain_mutable_format"
}

internal data struct VulkanWindowTargetSelection {
  var Capabilities VkSurfaceCapabilitiesKHR
  var Format VkSurfaceFormatKHR
  var PresentMode VkPresentModeKHR
  var CompositeAlpha VkCompositeAlphaFlagBitsKHR
}
