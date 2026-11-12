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

  func WindowLayoutSizeContract() bool {
    let window = Window{Size: LayoutSize(101.25, 80.5), UiScale: 1.5F,
      MinSize: LayoutSize(10.25, 20.5), MaxSize: LayoutSize(400.5, 300.25)}
    window.UpdateTree()
    if window.NativeWidth != 152 || window.NativeHeight != 121 { return false }
    if window.Size != LayoutSize(152.0 / 1.5, 121.0 / 1.5) { return false }
    try {
      window.MinSize = LayoutSize(15, 400)
      return false
    } catch (error System.ArgumentOutOfRangeException) {
      return window.MinSize == LayoutSize(10.25, 20.5)
        && window.MaxSize == LayoutSize(400.5, 300.25)
    } finally { window.Close() }
  }

  func SizeToContentContract() bool {
    for index in 0 ... 4 {
      let root = WindowSizeCell{Percentage: index == 1,
        ContentWidth: if index == 2 { 900.0 } else { 120.0 },
        ContentHeight: if index == 2 { 800.0 } else { 80.0 }}
      let window = Window{Root: root, InitiallyVisible: false, UiScale: 1.5F,
        Size: LayoutSize(400, 300), SizeToContent: SizeToContent.Both,
        MinSize: if index == 3 { LayoutSize(150, 120) } else { LayoutSize(0, 0) },
        MaxSize: if index == 2 { LayoutSize(240, 160) } else { LayoutSize(0, 0) }}
      window.Open()
      try {
        let expected = if index == 1 { LayoutSize(400, 80) }
          else if index == 2 { LayoutSize(240, 160) }
          else if index == 3 { LayoutSize(150, 120) }
          else { LayoutSize(120, 80) }
        if window.IsVisible || window.Size != expected { return false }
        root.ContentWidth = 200
        root.ContentHeight = 200
        root.Rebuild()
        window.UpdateTree()
        if window.Size != expected { return false }
      } finally { window.Close() }
    }
    return true
  }
}

internal class WindowSizeCell : Cell {
  internal var Percentage bool
  internal var ContentWidth float64
  internal var ContentHeight float64

  protected override func Build() Blob -> Container{
    Width: if Percentage { Percent(100) } else { ContentWidth },
    Height: ContentHeight}
}
