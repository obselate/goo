package Goo.VulkanProof

import System
import System.Threading
import Goo

internal class VulkanLegacyProofCell : Cell {
  override func Build() Blob -> Container {
    Width: Length.Percent(100),
    Height: Length.Percent(100),
    BackgroundColor: Color.Rgb(8, 10, 20),
  }
}

internal func OpenVulkanLegacyProofWindow(width int32, height int32) Window {
  let window = Window{
    Title: "Goo Vulkan production presentation proof",
    Width: width,
    Height: height,
    VSync: false,
    Root: VulkanLegacyProofCell{},
  }
  window.Open()
  VulkanLegacyProofFixture.Render(window, 0.0)
  return window
}

internal func CloseVulkanLegacyProofWindow(window Window) {
  if !window.IsOpen { return }
  window.RequestClose()
  let deadline = Environment.TickCount64 + 5000L
  while window.IsOpen && Environment.TickCount64 < deadline {
    WindowReadbackTestFixture.PumpNativeEvents()
    window.Pump(0.0)
    Thread.Yield()
  }
  if window.IsOpen {
    throw InvalidOperationException("Vulkan proof window did not close")
  }
}

internal func AwaitInjectedVulkanLegacyClose(window Window) {
  let windowId = WindowReadbackTestFixture.SdlWindowId(window)
  let deadline = Environment.TickCount64 + 5000L
  while window.IsOpen && Environment.TickCount64 < deadline {
    WindowReadbackTestFixture.PumpNativeEvents()
    window.Pump(0.0)
    Thread.Yield()
  }
  if window.IsOpen {
    throw InvalidOperationException("SDL close request did not close the Vulkan proof window")
  }
  if VulkanLegacyProofFixture.NativeWindowExists(windowId) {
    throw InvalidOperationException("SDL close request did not destroy the native window")
  }
}

internal func RequireVulkanLegacyCapabilities(
  snapshot VulkanLegacyPresentationSnapshot) {
    if snapshot.ApiVersion < VkConstants.VK_API_VERSION_1_3 {
      throw InvalidOperationException("Vulkan 1.3 is required")
    }
    if !snapshot.TimelineSemaphore || !snapshot.Synchronization2
      || !snapshot.DynamicRendering || !snapshot.MaintenanceFeature
      || !snapshot.SdlPresentationSupported{
        throw InvalidOperationException("Vulkan production capability requirements are unavailable")
      }
    if snapshot.GraphicsFamily != snapshot.PresentFamily
      || snapshot.GraphicsQueue == nint(0)
      || snapshot.GraphicsQueue != snapshot.PresentQueue{
        throw InvalidOperationException("Vulkan shared graphics/present queue is unavailable")
      }
    if snapshot.ColorSpace != VkConstants.VK_COLOR_SPACE_SRGB_NONLINEAR_KHR
      || (snapshot.SurfaceFormat != VkConstants.VK_FORMAT_B8G8R8A8_SRGB
          && snapshot.SurfaceFormat != VkConstants.VK_FORMAT_R8G8B8A8_SRGB)
      || !snapshot.SurfaceBlendSupported{
        throw InvalidOperationException("Vulkan sRGB blend surface is unavailable")
      }
    if !snapshot.TextTexelBufferSupported {
      throw InvalidOperationException("Vulkan R16G16B16A16_SINT texel buffers are unavailable")
    }
    if snapshot.InstanceMaintenance == VulkanSwapchainMaintenanceVariant.None
      || snapshot.SwapchainMaintenance == VulkanSwapchainMaintenanceVariant.None{
        throw InvalidOperationException("Vulkan swapchain maintenance is unavailable")
      }
    if Environment.GetEnvironmentVariable("GOO_VK_REQUIRE_EXT_MAINTENANCE") == "1"
      && !snapshot.ExtMaintenanceSupported{
        throw InvalidOperationException("Vulkan EXT maintenance compatibility is unavailable")
      }
  }

internal func RequireVulkanPresentationState(
  snapshot VulkanLegacyPresentationSnapshot) {
    if snapshot.RuntimeGeneration == 0uL || snapshot.Instance == nint(0)
      || snapshot.Device == nint(0) || snapshot.ImageCount == 0u
      || !snapshot.LastImageValid
      || snapshot.LastImageIndex >= snapshot.ImageCount
      || snapshot.LastImageLayout != VkConstants.VK_IMAGE_LAYOUT_PRESENT_SRC_KHR{
        throw InvalidOperationException("Vulkan presented image state is invalid")
      }
    if snapshot.ValidationErrors != 0L || snapshot.ResultFailures != 0uL
      || snapshot.ResultOverflow{
        throw InvalidOperationException("Vulkan diagnostics captured a failure: validation="
          +snapshot.ValidationErrors.ToString() + " results="
          +snapshot.ResultFailures.ToString() + " overflow=" + snapshot.ResultOverflow.ToString())
      }
  }

internal func RunVulkanFivePresentProof(window Window)
VulkanLegacyPresentationSnapshot{
  let baseline = VulkanLegacyProofFixture.Snapshot(window)
  RequireVulkanLegacyCapabilities(baseline)
  var prior = baseline
  var slot0Used = false
  var slot1Used = false
  var priorSameImageBound = false
  var timestampObserved = false
  var timestamp = VulkanDiagnosticTimestampSnapshot{}
  WindowReadbackTestFixture.SetMainPassTimestampSink(window,
    func(value VulkanDiagnosticTimestampSnapshot) {
      timestamp = value
      timestampObserved = true
    })
  var accepted uint32 = 0u
  while accepted < 5u {
    WindowReadbackTestFixture.ForceRenderNonblocking(window, 0.0166666666666667)
    let deadline = Environment.TickCount64 + 5000L
    while Environment.TickCount64 < deadline {
      WindowReadbackTestFixture.PumpNativeEvents()
      let live = VulkanLegacyProofFixture.PollPresentation(window)
      if live.BoundPresentationCount > 0
        && live.BoundGeneration == live.PresentGeneration
        && live.BoundImageIndex < live.ImageCount
        && live.BoundCompletionSlot < 2u
        && live.BoundCompletionSerial != 0uL
        && ((live.BoundCompletionSlot == 0u
            && live.BoundCompletionSerial <= live.Slot0Serial)
            || (live.BoundCompletionSlot == 1u
                && live.BoundCompletionSerial <= live.Slot1Serial)) {
                  priorSameImageBound = true
                }
      let submitted = live.Slot0Serial != prior.Slot0Serial
        || live.Slot1Serial != prior.Slot1Serial
      let pending = WindowReadbackTestFixture.RuntimeQueueWorkPending(window)
      if submitted && !pending { break }
      if !submitted && !pending {
        WindowReadbackTestFixture.ForceRenderNonblocking(window, 0.0)
      }
      Thread.Yield()
    }
    if WindowReadbackTestFixture.RuntimeQueueWorkPending(window) {
      throw InvalidOperationException("Vulkan production queue did not drain")
    }
    let current = VulkanLegacyProofFixture.Snapshot(window)
    if current.Slot0Serial != prior.Slot0Serial {
      slot0Used = true
      accepted++
    } else if current.Slot1Serial != prior.Slot1Serial {
      slot1Used = true
      accepted++
    } else {
      throw InvalidOperationException("Vulkan production frame was not accepted")
    }
    RequireVulkanPresentationState(current)
    prior = current
  }
  if !slot0Used || !slot1Used {
    throw InvalidOperationException("Vulkan production frame slots did not alternate")
  }
  if !priorSameImageBound {
    throw InvalidOperationException("Vulkan live prior same-image retirement was not observed")
  }
  if prior.AcquireSuccesses < baseline.AcquireSuccesses + 5uL
    || prior.PresentSuccesses != baseline.PresentSuccesses + 5uL {
      throw InvalidOperationException("Vulkan presentation result accounting is invalid")
    }
  if WindowReadbackTestFixture.TimestampSupported(window) {
    let timeline = WindowReadbackTestFixture.GraphicsTimeline(window)
    if !timeline.Available || timeline.CompletedResult != VkConstants.VK_SUCCESS
      || timeline.CompletedSerial < prior.Slot0GlobalSerial
      || timeline.CompletedSerial < prior.Slot1GlobalSerial
      || prior.TimestampSuccesses <= baseline.TimestampSuccesses
      || !timestampObserved || timestamp.submission == 0uL
      || timestamp.scopeCount <= 0 || timestamp.droppedScopeCount != 0 {
        throw InvalidOperationException("Vulkan timestamp/timeline completion is invalid")
      }
  }
  WindowReadbackTestFixture.SetMainPassTimestampSink(window, nil)
  return prior
}

internal unsafe func RunVulkanDirectUnormProof(window Window) {
  let target = VulkanLegacyProofFixture.OpenDirectReadback(window)
  try {
    var clearColor = VkClearColorValue{}
    clearColor.float32.values[0] = 0.03F
    clearColor.float32.values[1] = 0.04F
    clearColor.float32.values[2] = 0.08F
    clearColor.float32.values[3] = 1.0F
    var pushConstants = SolidQuadPushConstants{}
    pushConstants.rect_x = -0.72F
    pushConstants.rect_y = -0.62F
    pushConstants.rect_z = 1.44F
    pushConstants.rect_w = 1.24F
    pushConstants.color_x = 0.88F
    pushConstants.color_y = 0.18F
    pushConstants.color_z = 0.65F
    pushConstants.color_w = 1.0F
    let record = target.Record(clearColor, pushConstants)
    if record != VkConstants.VK_SUCCESS {
      throw InvalidOperationException("Vulkan direct UNORM recording failed: "
        +record.ToString())
    }
    let submit = target.Submit()
    if submit != VkConstants.VK_SUCCESS {
      throw InvalidOperationException("Vulkan direct UNORM submission failed: "
        +submit.ToString())
    }
    let deadline = Environment.TickCount64 + 5000L
    var completion = target.PollCompletion()
    while completion == VkConstants.VK_NOT_READY
      && Environment.TickCount64 < deadline{
        Thread.Yield()
        completion = target.PollCompletion()
      }
    if completion != VkConstants.VK_SUCCESS {
      throw InvalidOperationException("Vulkan direct UNORM completion failed: "
        +completion.ToString())
    }
    let readback = *uint8(target.ReadbackPointer)
    let center = int32((32u * target.Extent.width + 32u) * 4u)
    if !VulkanLegacyByteNear(readback[0], 8)
      || !VulkanLegacyByteNear(readback[1], 10)
      || !VulkanLegacyByteNear(readback[2], 20)
      || !VulkanLegacyByteNear(readback[3], 255)
      || !VulkanLegacyByteNear(readback[center], 224)
      || !VulkanLegacyByteNear(readback[center + 1], 46)
      || !VulkanLegacyByteNear(readback[center + 2], 166)
      || !VulkanLegacyByteNear(readback[center + 3], 255) {
        throw InvalidOperationException("Vulkan direct UNORM pixels are invalid")
      }
  } finally {
    target.Dispose()
  }
  if target.LiveObjectCount != 0u {
    throw InvalidOperationException("Vulkan direct UNORM resources were not released")
  }
  Console.WriteLine("Offscreen clear/quad readback: true")
}

internal func VulkanLegacyByteNear(actual uint8, expected int32) bool {
  let delta = int32(actual) - expected
  return delta >= -3 && delta <= 3
}

internal func WaitForVulkanMetrics(window Window, width int32, height int32)
WindowMetrics{
  let deadline = Environment.TickCount64 + 5000L
  var metrics = WindowReadbackTestFixture.Metrics(window)
  while (metrics.LogicalWidth != width || metrics.LogicalHeight != height)
    && Environment.TickCount64 < deadline{
      WindowReadbackTestFixture.PumpNativeEvents()
      window.Pump(0.0)
      VulkanLegacyProofFixture.Snapshot(window)
      Thread.Yield()
      metrics = WindowReadbackTestFixture.Metrics(window)
    }
  if metrics.LogicalWidth != width || metrics.LogicalHeight != height
    || metrics.FramebufferWidth <= 0 || metrics.FramebufferHeight <= 0 {
      throw InvalidOperationException("Vulkan lifecycle resize metrics are invalid")
    }
  return metrics
}

internal func RunVulkanLifecycleProof(window Window,
  initial VulkanLegacyPresentationSnapshot) VulkanLegacyPresentationSnapshot{
    let idleBefore = VulkanLegacyProofFixture.Snapshot(window)
    WindowReadbackTestFixture.PumpNativeEvents()
    window.Pump(0.0)
    let idleAfter = VulkanLegacyProofFixture.Snapshot(window)
    if idleAfter.Slot0Serial != idleBefore.Slot0Serial
      || idleAfter.Slot1Serial != idleBefore.Slot1Serial
      || idleAfter.AcquireResults != idleBefore.AcquireResults
      || idleAfter.PresentResults != idleBefore.PresentResults{
        throw InvalidOperationException("Vulkan idle wait submitted presentation work")
      }

    let runtimeBeforeResize = initial.RuntimeGeneration
    let generationBeforeResize = initial.PresentGeneration
    window.Width = 800
    window.Height = 600
    window.Width = 900
    window.Height = 700
    window.Width = 960
    window.Height = 720
    let resizedMetrics = WaitForVulkanMetrics(window, 960, 720)
    VulkanLegacyProofFixture.Render(window, 0.0)
    let resized = VulkanLegacyProofFixture.Snapshot(window)
    RequireVulkanPresentationState(resized)
    if resized.RuntimeGeneration != runtimeBeforeResize
      || resized.PresentGeneration <= generationBeforeResize
      || resized.RetiredGenerationCount == 0
      || resized.AnchoredRetiredGenerationCount == 0
      || resized.CompletedRetiredGenerationCount != 0
      || resized.TargetRetiredSwapchainCount == 0
      || resizedMetrics.FramebufferWidth <= 0 || resizedMetrics.FramebufferHeight <= 0 {
        throw InvalidOperationException("Vulkan lifecycle runtime changed during resize")
      }
    var collected = resized
    let collectionDeadline = Environment.TickCount64 + 5000L
    while (collected.RetiredGenerationCount >= resized.RetiredGenerationCount
        || collected.TargetRetiredSwapchainCount >= resized.TargetRetiredSwapchainCount)
      && Environment.TickCount64 < collectionDeadline{
        VulkanLegacyProofFixture.Render(window, 0.0)
        collected = VulkanLegacyProofFixture.Snapshot(window)
      }
    if collected.RetiredGenerationCount >= resized.RetiredGenerationCount
      || collected.TargetRetiredSwapchainCount >= resized.TargetRetiredSwapchainCount{
        throw InvalidOperationException("Vulkan live retired generation did not collect")
      }

    if Environment.GetEnvironmentVariable("GOO_VK_SKIP_DPI") == "1" {
      Console.WriteLine("Lifecycle E2E display-scale proof: deferred")
    } else {
      let beforeScale = resizedMetrics
      let generationBeforeScale = resized.PresentGeneration
      window.X = window.X + resizedMetrics.LogicalWidth + 64
      let scaleDeadline = Environment.TickCount64 + 5000L
      var afterScale = WindowReadbackTestFixture.Metrics(window)
      while afterScale.DisplayScaleX == beforeScale.DisplayScaleX
        && afterScale.DisplayScaleY == beforeScale.DisplayScaleY
        && Environment.TickCount64 < scaleDeadline{
          WindowReadbackTestFixture.PumpNativeEvents()
          window.Pump(0.0)
          VulkanLegacyProofFixture.Snapshot(window)
          Thread.Yield()
          afterScale = WindowReadbackTestFixture.Metrics(window)
        }
      if afterScale.DisplayScaleX == beforeScale.DisplayScaleX
        && afterScale.DisplayScaleY == beforeScale.DisplayScaleY{
          throw InvalidOperationException("Vulkan lifecycle display scale did not change")
        }
      VulkanLegacyProofFixture.Render(window, 0.0)
      let scaled = VulkanLegacyProofFixture.Snapshot(window)
      if scaled.PresentGeneration <= generationBeforeScale
        || (afterScale.FramebufferWidth == beforeScale.FramebufferWidth
            && afterScale.FramebufferHeight == beforeScale.FramebufferHeight) {
              throw InvalidOperationException("Vulkan DPI change did not recreate the framebuffer")
            }
      Console.WriteLine("Lifecycle E2E display-scale proof: true")
    }

    if Environment.GetEnvironmentVariable("GOO_VK_SKIP_MINIMIZE") == "1" {
      Console.WriteLine("Lifecycle E2E minimize/restore proof: deferred")
    } else {
      VulkanLegacyProofFixture.DrainQueue(window)
      window.State = WindowState.Minimized
      let minimizeDeadline = Environment.TickCount64 + 5000L
      while !VulkanLegacyProofFixture.NativeMinimized(window)
        && Environment.TickCount64 < minimizeDeadline{
          WindowReadbackTestFixture.PumpNativeEvents()
          VulkanLegacyProofFixture.PumpScheduled(window)
          VulkanLegacyProofFixture.Snapshot(window)
          Thread.Yield()
        }
      if !VulkanLegacyProofFixture.NativeMinimized(window) {
        throw InvalidOperationException("Vulkan window did not enter native minimized state")
      }
      VulkanLegacyProofFixture.DrainQueue(window)
      let minimizedBefore = VulkanLegacyProofFixture.Snapshot(window)
      WindowReadbackTestFixture.PumpNativeEvents()
      VulkanLegacyProofFixture.PumpScheduled(window)
      let minimizedAfter = VulkanLegacyProofFixture.Snapshot(window)
      if minimizedAfter.Slot0Serial != minimizedBefore.Slot0Serial
        || minimizedAfter.Slot1Serial != minimizedBefore.Slot1Serial
        || minimizedAfter.AcquireResults != minimizedBefore.AcquireResults
        || minimizedAfter.PresentResults != minimizedBefore.PresentResults{
          throw InvalidOperationException("Vulkan minimized window submitted work")
        }
      window.State = WindowState.Normal
      let restoreDeadline = Environment.TickCount64 + 5000L
      while VulkanLegacyProofFixture.NativeMinimized(window)
        && Environment.TickCount64 < restoreDeadline{
          WindowReadbackTestFixture.PumpNativeEvents()
          VulkanLegacyProofFixture.PumpScheduled(window)
          VulkanLegacyProofFixture.Snapshot(window)
          Thread.Yield()
        }
      if VulkanLegacyProofFixture.NativeMinimized(window) {
        throw InvalidOperationException("Vulkan window did not restore from native minimized state")
      }
      let restoreBefore = VulkanLegacyProofFixture.Snapshot(window)
      VulkanLegacyProofFixture.Render(window, 0.0)
      let restored = VulkanLegacyProofFixture.Snapshot(window)
      let restoredMetrics = WaitForVulkanMetrics(window, 960, 720)
      RequireVulkanPresentationState(restored)
      if restored.Slot0Serial == restoreBefore.Slot0Serial
        && restored.Slot1Serial == restoreBefore.Slot1Serial{
          throw InvalidOperationException("Vulkan restore did not accept a new presentation")
        }
      if restoredMetrics.LogicalWidth != 960 || restoredMetrics.LogicalHeight != 720
        || restoredMetrics.FramebufferWidth <= 0 || restoredMetrics.FramebufferHeight <= 0 {
          throw InvalidOperationException("Vulkan restore dimensions are invalid")
        }
      Console.WriteLine("Lifecycle E2E minimize/restore proof: true")
    }
    return VulkanLegacyProofFixture.Snapshot(window)
  }

internal func RunVulkanProductionLegacyProof(readback bool, lifecycle bool) int32 {
  let x11 = lifecycle && Environment.GetEnvironmentVariable("GOO_VK_LIFECYCLE_X11") == "1"
  if x11 { SdlRuntime.AcquireX11ForLegacyProof() }
  Environment.SetEnvironmentVariable("GOO_VK_DIAGNOSTICS", "1")
  var window Window? = nil
  var reopened Window? = nil
  var heldRuntime VulkanSharedLease? = nil
  var diagnostics VulkanDiagnostics? = nil
  var accounting VulkanObjectAccounting? = nil
  var allocator VulkanMemoryAllocator? = nil
  var sdlHeld = false
  var loaderHeld = false
  try {
    let opened = OpenVulkanLegacyProofWindow(if lifecycle { 640 } else { 64 },
      if lifecycle { 480 } else { 64 })
    window = opened
    SdlRuntime.Acquire()
    sdlHeld = true
    loaderHeld = SdlRuntime.AcquireVulkan()
    if !loaderHeld { throw InvalidOperationException("Vulkan proof could not retain the SDL loader") }
    var snapshot = RunVulkanFivePresentProof(opened)
    heldRuntime = VulkanLegacyProofFixture.RetainRuntime(opened)
    diagnostics = VulkanLegacyProofFixture.RetainDiagnostics(opened)
    accounting = heldRuntime?.ObjectAccounting
    allocator = heldRuntime?.MemoryAllocator
    if readback {
      RunVulkanDirectUnormProof(opened)
    }
    if lifecycle {
      snapshot = RunVulkanLifecycleProof(opened, snapshot)
      if !VulkanLegacyProofFixture.PushCloseRequest(opened) {
        throw InvalidOperationException("SDL close request was not accepted")
      }
      AwaitInjectedVulkanLegacyClose(opened)
      window = nil
      let next = OpenVulkanLegacyProofWindow(640, 480)
      reopened = next
      let reopenedSnapshot = VulkanLegacyProofFixture.Snapshot(next)
      RequireVulkanLegacyCapabilities(reopenedSnapshot)
      if reopenedSnapshot.RuntimeGeneration != snapshot.RuntimeGeneration
        || reopenedSnapshot.Instance != snapshot.Instance
        || reopenedSnapshot.Device != snapshot.Device
        || reopenedSnapshot.GraphicsQueue != snapshot.GraphicsQueue
        || heldRuntime?.DeviceLost != false || heldRuntime?.Terminal != false
        || heldRuntime?.PresentQueue != snapshot.PresentQueue
        || heldRuntime?.GraphicsFamilyIndex != snapshot.GraphicsFamily
        || heldRuntime?.PresentFamilyIndex != snapshot.PresentFamily{
          throw InvalidOperationException("Vulkan runtime identity changed across reopen")
        }
      Console.WriteLine("Lifecycle close event handled: true")
    }
    if let active = reopened { CloseVulkanLegacyProofWindow(active) }
    reopened = nil
    if let active = window { CloseVulkanLegacyProofWindow(active) }
    window = nil
    heldRuntime?.Dispose()
    heldRuntime = nil
    if diagnostics?.ValidationErrorCount != 0L
      || diagnostics?.LegacyUnexpectedResultFailuresForProof != 0uL
      || accounting?.LiveCount != 0uL
      || allocator?.LiveBytes != 0uL || allocator?.LiveAllocationCount != 0uL {
        throw InvalidOperationException("Vulkan teardown diagnostics captured a failure")
      }
    Console.WriteLine(if lifecycle {
      "Lifecycle persistent solid quad/present: true"
    } else {
      "Persistent 5-frame solid quad/present: true"
    })
    return 0
  } finally {
    if let active = reopened {
      try { CloseVulkanLegacyProofWindow(active) } catch (cleanup Exception) { }
    }
    if let active = window {
      try { CloseVulkanLegacyProofWindow(active) } catch (cleanup Exception) { }
    }
    if let active = heldRuntime {
      try { active.Dispose() } catch (cleanup Exception) { }
    }
    if loaderHeld { SdlRuntime.ReleaseVulkan() }
    if sdlHeld { SdlRuntime.Release() }
    if x11 { SdlRuntime.Release() }
  }
}
