package GooGallery

import System
import System.Diagnostics
import System.IO
import System.Threading
import Goo

class CategoryGateAccessibility : AccessibilityAdapter {
  internal var Tree AccessibilityTree?

  public init() {
    Tree = nil
  }

  /// Retains the latest tree used by deterministic gate assertions.
  public func Update(next AccessibilityTree) {
    Tree = next
  }

  internal func Contains(value string) bool {
    guard let current = Tree else { return false }
    guard let root = current.Root else { return false }
    return contains(root, value)
  }

  internal func FindExact(value string) AccessibilityNode? {
    guard let current = Tree else { return nil }
    guard let root = current.Root else { return nil }
    return findExact(root, value)
  }

  internal func FindContaining(value string) AccessibilityNode? {
    guard let current = Tree else { return nil }
    guard let root = current.Root else { return nil }
    return findContaining(root, value)
  }

  internal func FindTextValue(value string) AccessibilityNode? {
    guard let current = Tree else { return nil }
    guard let root = current.Root else { return nil }
    return findTextValue(root, value)
  }

  internal func FindActionableSize(width float64, height float64,
    ordinal int32) AccessibilityNode? {
      guard let current = Tree else { return nil }
      guard let root = current.Root else { return nil }
      var seen int32 = 0
      return findActionableSize(root, width, height, ordinal, ref seen)
    }

  private func contains(node AccessibilityNode, value string) bool {
    if node.Name.IndexOf(value, StringComparison.OrdinalIgnoreCase) >= 0
      || node.Value.IndexOf(value, StringComparison.OrdinalIgnoreCase) >= 0 {
        return true
      }
    for child in node.Children {
      if contains(child, value) { return true }
    }
    return false
  }

  private func findExact(node AccessibilityNode, value string) AccessibilityNode? {
    if String.Equals(node.Name, value, StringComparison.OrdinalIgnoreCase) {
      return node
    }
    for child in node.Children {
      if let found = findExact(child, value) { return found }
    }
    return nil
  }

  private func findContaining(node AccessibilityNode, value string) AccessibilityNode? {
    if node.Name.IndexOf(value, StringComparison.OrdinalIgnoreCase) >= 0
      || node.Value.IndexOf(value, StringComparison.OrdinalIgnoreCase) >= 0 {
        return node
      }
    for child in node.Children {
      if let found = findContaining(child, value) { return found }
    }
    return nil
  }

  private func findTextValue(node AccessibilityNode, value string) AccessibilityNode? {
    if node.Role == AccessibilityRole.TextInput && node.Value == value {
      return node
    }
    for child in node.Children {
      if let found = findTextValue(child, value) { return found }
    }
    return nil
  }

  private func hasAction(node AccessibilityNode, action AccessibilityAction) bool {
    for value in node.Actions {
      if value == action { return true }
    }
    return false
  }

  private func findActionableSize(node AccessibilityNode, width float64,
    height float64, ordinal int32, ref seen int32) AccessibilityNode? {
      if node.Role == AccessibilityRole.Generic
        && hasAction(node, AccessibilityAction.Activate)
        && Math.Abs(node.Bounds.Width - width) <= 1.0
        && Math.Abs(node.Bounds.Height - height) <= 1.0 {
          if seen == ordinal { return node }
          seen = seen + 1
        }
      for child in node.Children {
        if let found = findActionableSize(child, width, height, ordinal, ref seen) {
          return found
        }
      }
      return nil
    }
}

func CategoryGateRequire(condition bool, message string) {
  if !condition { throw InvalidOperationException("category-gate: " + message) }
}

func CategoryGatePump(window Window, count int32) {
  var index int32 = 0
  while index < count {
    window.Pump(1.0 / 60.0)
    index = index + 1
  }
}

func CategoryGateAdvance(window Window, count int32) {
  var index int32 = 0
  while index < count {
    WindowReadbackTestFixture.ForceRender(window, 1.0 / 60.0)
    index = index + 1
  }
}

func CategoryGateClick(window Window, windowId uint32, bounds ElementRect) {
  GalleryPushClick(windowId, bounds)
  WindowReadbackTestFixture.PumpNativeEventsForTest()
  CategoryGatePump(window, 4)
  WindowReadbackTestFixture.ForceRender(window, 0.0)
}

func CategoryGateClickNamed(window Window, windowId uint32,
  accessibility CategoryGateAccessibility, name string) AccessibilityNode{
    guard let target = accessibility.FindExact(name) else {
      throw InvalidOperationException("category-gate: missing control " + name)
    }
    let bounds = target.Bounds
    CategoryGateClick(window, windowId, bounds)
    guard let updated = accessibility.FindExact(name) else {
      throw InvalidOperationException("category-gate: control disappeared " + name)
    }
    return updated
  }

func CategoryGateClickCategory(window Window, windowId uint32,
  accessibility CategoryGateAccessibility, name string) AccessibilityNode{
    let updated = CategoryGateClickNamed(window, windowId, accessibility, name)
    CategoryGateRequire(updated.Focused,
      "native click did not leave focus on " + name)
    return updated
  }

func CategoryGateRequireCategoryMatrix(accessibility CategoryGateAccessibility,
  category int32) {
    let titles = []string{
      "Text Inputs & Steppers",
      "Switches, checks & radios",
      "Buttons, actions & identity",
      "Range, progress & feedback",
    }
    let expected = []bool{
      category == 0 || category == 1,
      category == 0 || category == 2,
      category == 0 || category == 3,
      category == 0 || category == 4,
    }
    var index int32 = 0
    while index < titles.Length {
      let present = accessibility.Contains(titles[index])
      CategoryGateRequire(present == expected[index],
        "category " + category.ToString() + " visibility mismatch for " + titles[index])
      index = index + 1
    }
  }

func CategoryGateRequireFit(root GalleryCell, logicalWidth float64,
  logicalHeight float64) {
    let rootBounds = root.RootView().BorderBox
    let showcaseBounds = root.ShowcaseView().BorderBox
    CategoryGateRequire(root.RootView().IsMounted && root.ShowcaseView().IsMounted,
      "Gallery root or showcase is not mounted after resize")
    CategoryGateRequire(rootBounds.Width >= logicalWidth - 2.0
        && rootBounds.Height >= logicalHeight - 2.0,
      "Gallery root does not fit resized window")
    CategoryGateRequire(showcaseBounds.Width >= rootBounds.Width - 2.0
        && showcaseBounds.Height > 0.0
        && showcaseBounds.Y >= rootBounds.Y
        && showcaseBounds.Y + showcaseBounds.Height
      <= rootBounds.Y + rootBounds.Height + 1.0,
      "Gallery showcase does not fit resized window")
  }

func CategoryGateReadbackAwait(window Window, timeoutMs int32) {
  let timeoutTicks = int64(float64(Stopwatch.Frequency) * float64(timeoutMs) / 1000.0)
  let start = Stopwatch.GetTimestamp()
  while Stopwatch.GetTimestamp() - start < timeoutTicks {
    let status = WindowReadbackTestFixture.Poll(window)
    if status == VkConstants.VK_SUCCESS { return }
    CategoryGateRequire(status == VkConstants.VK_NOT_READY,
      "pixel readback completion failed: " + status.ToString())
    Thread.Yield()
  }
  throw InvalidOperationException("category-gate: pixel readback timed out")
}

func CategoryGateReadbackRequest(window Window, width uint32, height uint32) {
  let timeoutTicks = Stopwatch.Frequency
  let start = Stopwatch.GetTimestamp()
  var status = WindowReadbackTestFixture.Request(window, width, height)
  while status == WindowReadbackRequestStatus.Busy
    || status == WindowReadbackRequestStatus.NotReady{
      CategoryGateRequire(Stopwatch.GetTimestamp() - start < timeoutTicks,
        "pixel readback request was not accepted")
      WindowReadbackTestFixture.Pump(window, 0.0)
      Thread.Yield()
      status = WindowReadbackTestFixture.Request(window, width, height)
    }
  CategoryGateRequire(status == WindowReadbackRequestStatus.Accepted,
    "pixel readback request failed: " + status.ToString())
}

func CategoryGateReadback(window Window) VulkanReadbackResult {
  let metrics = WindowReadbackTestFixture.Metrics(window)
  CategoryGateRequire(metrics.FramebufferWidth > 0 && metrics.FramebufferHeight > 0,
    "pixel readback framebuffer metrics are invalid")
  let width = uint32(metrics.FramebufferWidth)
  let height = uint32(metrics.FramebufferHeight)
  CategoryGateReadbackRequest(window, width, height)
  CategoryGateReadbackAwait(window, 10000)
  guard let result = WindowReadbackTestFixture.Take(window) else {
    throw InvalidOperationException("category-gate: pixel readback result was unavailable")
  }
  CategoryGateRequire(result.Width == width && result.Height == height
      && uint64(result.Pixels.Length) == uint64(width) * uint64(height) * 4uL,
    "pixel readback extent or byte count is invalid")
  return result
}

func CategoryGateLogicalPixel(result VulkanReadbackResult, metrics WindowMetrics,
  x float64, y float64) []uint8{
    let scaleX = if metrics.DisplayScaleX > 0.0 { metrics.DisplayScaleX } else { 1.0 }
    let scaleY = if metrics.DisplayScaleY > 0.0 { metrics.DisplayScaleY } else { 1.0 }
    let px = Math.Clamp(int32(Math.Floor(x * scaleX)), 0, int32(result.Width) - 1)
    let py = Math.Clamp(int32(Math.Floor(y * scaleY)), 0, int32(result.Height) - 1)
    let index = int32((uint32(py) * result.Width + uint32(px)) * 4u)
    return []uint8{
      result.Pixels[index],
      result.Pixels[index + 1],
      result.Pixels[index + 2],
      result.Pixels[index + 3],
    }
  }

func CategoryGatePixelDelta(left []uint8, right []uint8) int32 {
  var value int32 = 0
  var index int32 = 0
  while index < 3 {
    value = value + Math.Abs(int32(left[index]) - int32(right[index]))
    index = index + 1
  }
  return value
}

func CategoryGateMaybeCapture(window Window, result VulkanReadbackResult,
  label string) {
    guard let captureDirectory = Environment.GetEnvironmentVariable("GOO_CATEGORY_GATE_CAPTURE_DIR") else {
      return
    }
    if captureDirectory == "" { return }
    Directory.CreateDirectory(captureDirectory)
    let rawPath = Path.Combine(captureDirectory, label + ".rgba")
    let metadataPath = Path.Combine(captureDirectory, label + ".txt")
    File.WriteAllBytes(rawPath, result.Pixels)
    let metrics = WindowReadbackTestFixture.Metrics(window)
    File.WriteAllText(metadataPath,
      "width=" + result.Width.ToString()
      +" height=" + result.Height.ToString()
      +" display_scale_x=" + metrics.DisplayScaleX.ToString("F4")
      +" display_scale_y=" + metrics.DisplayScaleY.ToString("F4") + "\n")
  }

func CategoryGateResize(window Window, logicalWidth int32, logicalHeight int32) {
  let before = WindowReadbackTestFixture.Metrics(window)
  let scaleX = if before.DisplayScaleX > 0.0 { before.DisplayScaleX } else { 1.0 }
  let scaleY = if before.DisplayScaleY > 0.0 { before.DisplayScaleY } else { 1.0 }
  let framebufferWidth = int32(Math.Round(float64(logicalWidth) * scaleX))
  let framebufferHeight = int32(Math.Round(float64(logicalHeight) * scaleY))
  CategoryGateRequire(WindowReadbackTestFixture.Resize(window,
    logicalWidth, logicalHeight, framebufferWidth, framebufferHeight),
    "native resize was rejected")
  CategoryGatePump(window, 12)
  WindowReadbackTestFixture.ForceRender(window, 0.0)
}

func CategoryGateRequireClosedDiagnostics(window Window) {
  let counters = WindowReadbackTestFixture.DiagnosticCounters(window)
  CategoryGateRequire(counters.vulkanObjectCount == 0uL
      && counters.vulkanObjectAllocationCount == 0uL
      && counters.vulkanDeviceMemoryAllocationCount == 0uL
      && counters.vulkanDeviceMemoryBytes == 0uL
      && counters.imageResidentBytes == 0uL
      && counters.imageLiveObjectCount == 0uL
      && counters.textAtlasResidentBytes == 0uL
      && counters.textAtlasLiveObjectCount == 0uL
      && counters.pathAtlasResidentWords == 0uL
      && counters.pathAtlasLiveObjectCount == 0uL
      && counters.layerPoolResidentBytes == 0uL
      && counters.layerPoolTargetCount == 0uL
      && counters.layerPoolLeasedCount == 0uL,
    "closed Gallery left Vulkan objects or atlas/layer resources resident")
  CategoryGateRequire(counters.validationErrorCount == 0uL
      && counters.resultFailureCount == 0uL
      && counters.deviceRecoveryCount == 0uL
      && counters.layerPoolFailureCount == 0uL
      && counters.layerPoolPressureFailureCount == 0uL,
    "closed Gallery reported Vulkan validation, recovery, or result errors")
}

func CategoryGateCloseClean(window Window) {
  window.RequestClose()
  WindowReadbackTestFixture.ForceRender(window, 0.0)
  CategoryGateRequire(!window.IsOpen, "category gate window did not close")
  CategoryGateRequireClosedDiagnostics(window)
  CategoryGateRequire(WindowReadbackTestFixture.ResidentResourceBytes(window) == 0uL,
    "category gate left readback resources resident")
}

func RunCategoryGate() {
  let root = GalleryCell{}
  let accessibility = CategoryGateAccessibility{}
  let window = Window{
    Title: "Goo Gallery category correctness gate",
    Width: 1440,
    Height: 900,
    Decorated: false,
    Transparent: true,
    Resizable: true,
    ResizeBand: 8.0F,
    VSync: false,
    Background: Color.Transparent,
    Root: root,
  }
  root.AttachWindow(window)
  window.AccessibilityAdapter = accessibility
  var activeWindow Window? = nil
  try {
    activeWindow = window
    window.Open()
    CategoryGatePump(window, 8)
    WindowReadbackTestFixture.ForceRender(window, 0.0)
    CategoryGateRequire(root.OpenShowcase(5), "component gallery showcase did not open")
    CategoryGatePump(window, 8)
    WindowReadbackTestFixture.ForceRender(window, 0.0)
    CategoryGateRequire(root.CurrentShowcase() == 5,
      "component gallery opened the wrong showcase")
    CategoryGateRequireCategoryMatrix(accessibility, 0)

    let windowId = GallerySdlWindowId()
    let visualOnly = Environment.GetEnvironmentVariable("GOO_CATEGORY_GATE_VISUAL_ONLY") == "1"
    if visualOnly { CategoryGateAdvance(window, 120) }
    let initial = CategoryGateReadback(window)
    CategoryGateMaybeCapture(window, initial, "all-default")

    let categories = []string{
      "Forms & Inputs", "Selection", "Buttons", "Display & Feedback", "All Categories",
    }
    let categoryValues = []int32{ 1, 2, 3, 4, 0 }
    let visualLabels = []string{
      "forms-inputs-stable", "selection-stable", "buttons-stable",
      "display-feedback-stable", "all-categories-stable",
    }
    var categoryIndex int32 = 0
    while categoryIndex < categories.Length {
      CategoryGateClickCategory(window, windowId, accessibility, categories[categoryIndex])
      CategoryGateRequireCategoryMatrix(accessibility, categoryValues[categoryIndex])
      if visualOnly {
        CategoryGateAdvance(window, 120)
        let stable = CategoryGateReadback(window)
        CategoryGateMaybeCapture(window, stable, visualLabels[categoryIndex])
      }
      categoryIndex = categoryIndex + 1
    }

    if visualOnly {
      CategoryGateCloseClean(window)
      Console.WriteLine("category-gate: visual-only captures=all-default,forms-inputs-stable,selection-stable,buttons-stable,display-feedback-stable,all-categories-stable close=1")
      return
    }

    CategoryGateClickCategory(window, windowId, accessibility, "Forms & Inputs")
    guard let entry = accessibility.FindTextValue("@goo_developer") else {
      throw InvalidOperationException("category-gate: User Handle text input is missing")
    }
    CategoryGateClick(window, windowId, entry.Bounds)
    guard let focusedEntry = accessibility.FindTextValue("@goo_developer") else {
      throw InvalidOperationException("category-gate: User Handle input disappeared after focus")
    }
    CategoryGateRequire(focusedEntry.Focused,
      "User Handle input did not receive native focus")
    WindowReadbackTestFixture.InputQueueKeyPress(window, Key.End)
    WindowReadbackTestFixture.InputQueueKeyRelease(window, Key.End)
    WindowReadbackTestFixture.QueueText(window, "@dev")
    WindowReadbackTestFixture.ForceRender(window, 0.0)
    guard let typed = accessibility.FindTextValue("@goo_developer@dev") else {
      throw InvalidOperationException("category-gate: queued text was not committed")
    }
    CategoryGateRequire(window.PerformAccessibilityAction(typed.Id,
      AccessibilityActionRequest.SetValue("@dev")),
      "accessibility text value action was not accepted")
    WindowReadbackTestFixture.ForceRender(window, 0.0)
    CategoryGateRequire(accessibility.FindTextValue("@dev") != nil,
      "User Handle did not accept the canonical @dev value")

    CategoryGateClickCategory(window, windowId, accessibility, "Selection")
    CategoryGateRequire(accessibility.FindTextValue("@dev") == nil,
      "hidden Forms & Inputs content remained visible")
    CategoryGateClickCategory(window, windowId, accessibility, "Forms & Inputs")
    CategoryGateRequire(accessibility.FindTextValue("@dev") != nil,
      "User Handle text was not retained across category hide/revisit")

    CategoryGateClickNamed(window, windowId, accessibility, "Reset defaults")
    CategoryGateRequireCategoryMatrix(accessibility, 0)
    CategoryGateRequire(accessibility.FindTextValue("@goo_developer") != nil
        && accessibility.FindTextValue("@dev") == nil,
      "Reset defaults did not restore User Handle")

    CategoryGateClickCategory(window, windowId, accessibility, "Selection")
    guard let telemetry = accessibility.FindActionableSize(44.0, 24.0, 2) else {
      throw InvalidOperationException("category-gate: telemetry switch control is missing")
    }
    let selectionMetrics = WindowReadbackTestFixture.Metrics(window)
    let beforeSwitch = CategoryGateReadback(window)
    let beforePixel = CategoryGateLogicalPixel(beforeSwitch, selectionMetrics,
      telemetry.Bounds.X + 6.0, telemetry.Bounds.Y + telemetry.Bounds.Height * 0.5)
    CategoryGateClick(window, windowId, telemetry.Bounds)
    CategoryGateAdvance(window, 3)
    let midSwitch = CategoryGateReadback(window)
    let midPixel = CategoryGateLogicalPixel(midSwitch, selectionMetrics,
      telemetry.Bounds.X + 6.0, telemetry.Bounds.Y + telemetry.Bounds.Height * 0.5)
    CategoryGateAdvance(window, 120)
    let settledSwitch = CategoryGateReadback(window)
    let settledPixel = CategoryGateLogicalPixel(settledSwitch, selectionMetrics,
      telemetry.Bounds.X + 6.0, telemetry.Bounds.Y + telemetry.Bounds.Height * 0.5)
    CategoryGateRequire(accessibility.Contains("Telemetry: ON"),
      "telemetry switch did not publish its ON feedback")
    CategoryGateRequire(CategoryGatePixelDelta(beforePixel, midPixel) > 3
        && CategoryGatePixelDelta(beforePixel, settledPixel) > 8,
      "telemetry switch did not animate to a visibly different state")
    CategoryGateMaybeCapture(window, settledSwitch, "selection-telemetry-on")

    CategoryGateClickNamed(window, windowId, accessibility, "Reset defaults")
    CategoryGateAdvance(window, 120)
    CategoryGateRequireCategoryMatrix(accessibility, 0)

    CategoryGateClickCategory(window, windowId, accessibility, "Display & Feedback")
    CategoryGateRequireCategoryMatrix(accessibility, 4)
    let displayStable = CategoryGateReadback(window)
    CategoryGateMaybeCapture(window, displayStable, "display-stable")
    CategoryGateClickNamed(window, windowId, accessibility, "100%")
    CategoryGateRequire(accessibility.Contains("Scale set to 100%"),
      "slider preset did not update feedback")
    guard let accordion = accessibility.FindContaining("System Architecture & Pipeline") else {
      throw InvalidOperationException("category-gate: accordion control is missing")
    }
    CategoryGateClick(window, windowId, accordion.Bounds)
    CategoryGateRequire(accessibility.Contains("Architecture: Goo Declarative Retained Layout System"),
      "accordion did not expand its details")
    let expanded = CategoryGateReadback(window)
    CategoryGateMaybeCapture(window, expanded, "display-accordion-expanded")
    guard let expandedAccordion = accessibility.FindContaining("System Architecture & Pipeline") else {
      throw InvalidOperationException("category-gate: expanded accordion control disappeared")
    }
    CategoryGateClick(window, windowId, expandedAccordion.Bounds)
    CategoryGateRequire(!accessibility.Contains("Architecture: Goo Declarative Retained Layout System"),
      "accordion did not collapse its details")

    CategoryGateClickCategory(window, windowId, accessibility, "All Categories")
    CategoryGateRequireCategoryMatrix(accessibility, 0)
    CategoryGateResize(window, 960, 600)
    CategoryGateRequireFit(root, 960.0, 600.0)
    guard let beforeScrollNode = accessibility.FindContaining("Text Inputs & Steppers") else {
      throw InvalidOperationException("category-gate: scroll content title is missing before wheel input")
    }
    let beforeScrollY = beforeScrollNode.Bounds.Y
    WindowReadbackTestFixture.InputQueueWheel(window,
      beforeScrollNode.Bounds.X + 24.0,
      beforeScrollNode.Bounds.Y + 24.0,
      0.0, -1.0)
    WindowReadbackTestFixture.ForceRender(window, 0.0)
    CategoryGatePump(window, 4)
    guard let afterScrollNode = accessibility.FindContaining("Text Inputs & Steppers") else {
      throw InvalidOperationException("category-gate: scroll content title disappeared after wheel input")
    }
    CategoryGateRequire(afterScrollNode.Bounds.Y < beforeScrollY - 1.0,
      "wheel input did not move the resized scroll content")
    let resized = CategoryGateReadback(window)
    CategoryGateMaybeCapture(window, resized, "all-resized-scrolled")
    CategoryGateResize(window, 1440, 900)
    CategoryGateRequireFit(root, 1440.0, 900.0)
    CategoryGateClickNamed(window, windowId, accessibility, "Reset defaults")
    CategoryGateRequireCategoryMatrix(accessibility, 0)
    let finalFrame = CategoryGateReadback(window)
    CategoryGateMaybeCapture(window, finalFrame, "all-reset-final")

    CategoryGateCloseClean(window)
    Console.WriteLine("category-gate: matrix=5 text=keyboard+queue+hide-revisit reset=1"
      +" switch-animation=1 accordion=1 slider=1 resize-scroll=1 readback=1 close=1")
  } finally {
    if let current = activeWindow {
      if current.IsOpen {
        current.RequestClose()
        WindowReadbackTestFixture.ForceRender(current, 0.0)
      }
    }
  }
}
