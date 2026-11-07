package Goo

internal class VulkanPresentModeSelector {
  shared {
    internal func TrySelect(
      vsync bool,
      hasImmediate bool,
      hasMailbox bool,
      hasFifo bool,
      out selected VkPresentModeKHR) bool{
        selected = VkPresentModeKHR(0)
        if vsync {
          if !hasFifo {
            return false
          }
          selected = VkConstants.VK_PRESENT_MODE_FIFO_KHR
          return true
        }
        if hasImmediate {
          selected = VkConstants.VK_PRESENT_MODE_IMMEDIATE_KHR
          return true
        }
        if hasMailbox {
          selected = VkConstants.VK_PRESENT_MODE_MAILBOX_KHR
          return true
        }
        if hasFifo {
          selected = VkConstants.VK_PRESENT_MODE_FIFO_KHR
          return true
        }
        return false
      }
  }
}
