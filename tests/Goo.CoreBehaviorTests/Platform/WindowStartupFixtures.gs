package Goo

internal class WindowStartupFixtures {
  func InitialBoundsContract() bool {
    let usable = ElementRect{ X: -1366, Y: 24, Width: 1366, Height: 720 }
    let oversized = SdlHost.ConstrainInitialBounds(ElementRect{ Width: 1824, Height: 1026 }, 0, 0, false, usable)
    let centered = SdlHost.ConstrainInitialBounds(ElementRect{ Width: 800, Height: 600 }, 0, 0, false, usable)
    let positioned = SdlHost.ConstrainInitialBounds(ElementRect{ X: 100, Y: -100, Width: 800, Height: 600 }, 0, 0, true, usable)
    let contained = SdlHost.ConstrainInitialBounds(ElementRect{ X: -1200, Y: 50, Width: 800, Height: 600 }, 0, 0, true, usable)
    let minimum = SdlHost.ConstrainInitialBounds(ElementRect{ Width: 800, Height: 600 }, 1824, 1026, false, usable)
    return oversized.X == -1366 && oversized.Y == 24 && oversized.Width == 1366 && oversized.Height == 720
      && centered.X == -1083 && centered.Y == 84 && centered.Width == 800 && centered.Height == 600
      && positioned.X == -800 && positioned.Y == 24 && positioned.Width == 800 && positioned.Height == 600
      && contained.X == -1200 && contained.Y == 50 && contained.Width == 800 && contained.Height == 600
      && minimum.X == -1366 && minimum.Y == 24 && minimum.Width == 1824 && minimum.Height == 1026
  }

  func PresentModesContract() bool {
    var selected VkPresentModeKHR
    return VulkanPresentModeSelector.TrySelect(true, true, true, true, out selected)
      && selected == VkConstants.VK_PRESENT_MODE_FIFO_KHR
      && !VulkanPresentModeSelector.TrySelect(true, true, true, false, out selected)
      && VulkanPresentModeSelector.TrySelect(false, true, true, true, out selected)
      && selected == VkConstants.VK_PRESENT_MODE_IMMEDIATE_KHR
      && VulkanPresentModeSelector.TrySelect(false, false, true, true, out selected)
      && selected == VkConstants.VK_PRESENT_MODE_MAILBOX_KHR
      && VulkanPresentModeSelector.TrySelect(false, false, false, true, out selected)
      && selected == VkConstants.VK_PRESENT_MODE_FIFO_KHR
      && !VulkanPresentModeSelector.TrySelect(false, false, false, false, out selected)
  }
}
