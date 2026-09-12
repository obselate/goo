package Goo

import System
import System.Threading
import Goo.VulkanProof
import Hexa.NET.SDL3

internal partial class SdlRuntime {
  shared {
    internal func AcquireX11ForLegacyProof() {
      lock (sync) {
        if references != 0 || SDL.WasInit(requiredSubsystems) != 0u {
          throw InvalidOperationException("X11 lifecycle proof requires an uninitialized SDL runtime")
        }
        if !SDL.SetHintWithPriority(SDL.SDL_HINT_VIDEO_DRIVER,
          "x11", SDLHintPriority.Override) || !SDL.InitSubSystem(requiredSubsystems) {
            throw InvalidOperationException("X11 lifecycle proof could not initialize SDL: " + SDL.GetErrorS())
          }
        if SDL.GetCurrentVideoDriverS() != "x11" {
          SDL.QuitSubSystem(requiredSubsystems)
          throw InvalidOperationException("X11 lifecycle proof selected the wrong SDL driver")
        }
        mainThreadId = Environment.CurrentManagedThreadId
        wakeEventType = SDL.RegisterEvents(1)
        if wakeEventType == 0u || wakeEventType == uint32.MaxValue {
          SDL.QuitSubSystem(requiredSubsystems)
          throw InvalidOperationException("X11 lifecycle proof could not register its wake event")
        }
        references = 1
      }
    }
  }
}

internal data struct VulkanLegacyPresentationSnapshot {
  internal var RuntimeGeneration uint64
  internal var PresentGeneration uint64
  internal var Instance VkInstance
  internal var Device VkDevice
  internal var GraphicsQueue VkQueue
  internal var PresentQueue VkQueue
  internal var GraphicsFamily uint32
  internal var PresentFamily uint32
  internal var ApiVersion uint32
  internal var TimelineSemaphore bool
  internal var Synchronization2 bool
  internal var DynamicRendering bool
  internal var MaintenanceFeature bool
  internal var ExtMaintenanceSupported bool
  internal var SdlPresentationSupported bool
  internal var RuntimeDeviceLost bool
  internal var RuntimeTerminal bool
  internal var InstanceMaintenance VulkanSwapchainMaintenanceVariant
  internal var SwapchainMaintenance VulkanSwapchainMaintenanceVariant
  internal var SurfaceFormat VkFormat
  internal var ColorSpace VkColorSpaceKHR
  internal var ImageCount uint32
  internal var LastImageIndex uint32
  internal var LastImageLayout VkImageLayout
  internal var LastImageValid bool
  internal var Slot0Serial uint64
  internal var Slot1Serial uint64
  internal var Slot0GlobalSerial uint64
  internal var Slot1GlobalSerial uint64
  internal var ValidationErrors int64
  internal var ResultFailures uint64
  internal var AcquireResults uint64
  internal var AcquireSuccesses uint64
  internal var PresentResults uint64
  internal var PresentSuccesses uint64
  internal var ResultOverflow bool
  internal var TextTexelBufferSupported bool
  internal var SurfaceBlendSupported bool
  internal var TimestampResults uint64
  internal var TimestampSuccesses uint64
  internal var LivePresentationCount int32
  internal var BoundPresentationCount int32
  internal var BoundGeneration uint64
  internal var BoundImageIndex uint32
  internal var BoundCompletionSlot uint32
  internal var BoundCompletionSerial uint64
  internal var RetiredGenerationCount int32
  internal var AnchoredRetiredGenerationCount int32
  internal var CompletedRetiredGenerationCount int32
  internal var TargetRetiredSwapchainCount int32
}

internal partial class VulkanDiagnostics {
  private var legacyResultRead int64 = -1L
  private var legacyAcquireResults uint64
  private var legacyAcquireSuccesses uint64
  private var legacyPresentResults uint64
  private var legacyPresentSuccesses uint64
  private var legacyTimestampResults uint64
  private var legacyTimestampSuccesses uint64
  private var legacyResultOverflow bool
  private var legacyLifecycleOutOfDateResults uint64

  internal prop LegacyUnexpectedResultFailuresForProof uint64{
    get -> Counters.resultFailureCount - legacyLifecycleOutOfDateResults
  }

  internal func LegacyResultCountsForProof(out acquireResults uint64,
    out acquireSuccesses uint64, out presentResults uint64,
    out presentSuccesses uint64, out timestampResults uint64,
    out timestampSuccesses uint64, out overflow bool) {
      if let storage = results {
        let written = resultWrite
        if legacyResultRead < 0L { legacyResultRead = written }
        if written - legacyResultRead > int64(storage.Length) {
          legacyResultOverflow = true
          legacyResultRead = written - int64(storage.Length)
        }
        while legacyResultRead < written {
          let record = storage[int32(legacyResultRead % int64(storage.Length))]
          if record.ordinal != uint64(legacyResultRead) {
            legacyResultOverflow = true
          }
          if record.result == int32(VkConstants.VK_ERROR_OUT_OF_DATE_KHR)
            && (record.eventId == VulkanDiagnosticEventIds.SwapchainAcquire
                || record.eventId == VulkanDiagnosticEventIds.SwapchainPresent)
            && Environment.GetEnvironmentVariable("GOO_VK_LIFECYCLE") == "1" {
              legacyLifecycleOutOfDateResults++
              Console.WriteLine("Lifecycle recoverable OUT_OF_DATE: " + record.eventId.ToString())
            }
          if record.eventId == VulkanDiagnosticEventIds.SwapchainAcquire {
            legacyAcquireResults++
            if record.result == int32(VkConstants.VK_SUCCESS)
              || record.result == int32(VkConstants.VK_SUBOPTIMAL_KHR) {
                legacyAcquireSuccesses++
              }
          } else if record.eventId == VulkanDiagnosticEventIds.SwapchainPresent {
            legacyPresentResults++
            if record.result == int32(VkConstants.VK_SUCCESS)
              || record.result == int32(VkConstants.VK_SUBOPTIMAL_KHR) {
                legacyPresentSuccesses++
              }
          } else if record.eventId == VulkanDiagnosticEventIds.GpuTimestamp {
            legacyTimestampResults++
            if record.result == int32(VkConstants.VK_SUCCESS) {
              legacyTimestampSuccesses++
            }
          }
          legacyResultRead++
        }
      }
      acquireResults = legacyAcquireResults
      acquireSuccesses = legacyAcquireSuccesses
      presentResults = legacyPresentResults
      presentSuccesses = legacyPresentSuccesses
      timestampResults = legacyTimestampResults
      timestampSuccesses = legacyTimestampSuccesses
      overflow = legacyResultOverflow
    }
}

internal data struct VulkanLegacyRetirementSnapshot {
  internal var PresentationCount int32
  internal var BoundPresentationCount int32
  internal var BoundGeneration uint64
  internal var BoundImageIndex uint32
  internal var BoundCompletionSlot uint32
  internal var BoundCompletionSerial uint64
  internal var RetiredGenerationCount int32
  internal var AnchoredRetiredGenerationCount int32
  internal var CompletedRetiredGenerationCount int32
}

internal partial class VulkanPresentationRetirement {
  internal func LegacySnapshotForProof() VulkanLegacyRetirementSnapshot {
    var bound int32
    var boundGeneration uint64
    var boundImageIndex uint32
    var boundCompletionSlot uint32
    var boundCompletionSerial uint64
    if let storage = presentations {
      var index int32
      while index < presentationCount {
        if storage[index].hasCompletion {
          bound++
          boundGeneration = storage[index].generation
          boundImageIndex = storage[index].imageIndex
          boundCompletionSlot = storage[index].completionSlot
          boundCompletionSerial = storage[index].completionSerial
        }
        index++
      }
    }
    var anchored int32
    var completed int32
    if let retired = retiredGenerations {
      var index int32
      while index < retiredGenerationCount {
        if retired[index].hasAnchor {
          anchored++
          if retired[index].anchorCompleted { completed++ }
        }
        index++
      }
    }
    return VulkanLegacyRetirementSnapshot{
      PresentationCount: presentationCount,
      BoundPresentationCount: bound,
      BoundGeneration: boundGeneration,
      BoundImageIndex: boundImageIndex,
      BoundCompletionSlot: boundCompletionSlot,
      BoundCompletionSerial: boundCompletionSerial,
      RetiredGenerationCount: retiredGenerationCount,
      AnchoredRetiredGenerationCount: anchored,
      CompletedRetiredGenerationCount: completed,
    }
  }
}

internal partial class VulkanWindowTarget {
  internal func TryCaptureLegacyBindingForProof(out snapshot VulkanLegacyPresentationSnapshot) bool {
    snapshot = VulkanLegacyPresentationSnapshot{}
    if queueStage != QueueStageSubmit
      || activeImageLayout != VkConstants.VK_IMAGE_LAYOUT_PRESENT_SRC_KHR{
        return false
      }
    guard let activeRuntime = runtime, let frameMailbox = queueMailbox else { return false }
    if frameMailbox.Phase != VulkanQueueMailboxPhase.SubmitComplete
      || activeRuntime.QueueWorker.HasOutstandingWork{
        snapshot = LegacyPresentationSnapshotForProof()
        return true
      }
    if frameMailbox.SubmitResult != VkConstants.VK_SUCCESS { return false }
    let blocker = activeRuntime.QueueWorker.CreateMailbox(nil)
    blocker.PrepareSubmit(nint(0), 0uL, 0uL)
    if !blocker.BeginSubmit() {
      throw InvalidOperationException("Vulkan retirement probe could not prepare its queue hold")
    }
    VulkanSharedRuntime.HoldQueueSubmitForMailboxForTest(blocker)
    var enqueued = false
    try {
      enqueued = activeRuntime.EnqueueGraphicsSubmission(blocker, (serial) -> {
        if serial == 0uL { throw InvalidOperationException("Vulkan retirement probe serial is invalid") }
      })
      if !enqueued || !VulkanSharedRuntime.WaitForHeldQueueCallForTest(5000) {
        throw InvalidOperationException("Vulkan retirement probe did not hold the queue")
      }
      PollQueueCompletion()
      snapshot = LegacyPresentationSnapshotForProof()
      return true
    } finally {
      VulkanSharedRuntime.ReleaseHeldQueueCallForTest()
      if enqueued {
        let deadline = Environment.TickCount64 + 5000L
        while blocker.Phase != VulkanQueueMailboxPhase.SubmitComplete
          && Environment.TickCount64 < deadline{
            Thread.Yield()
          }
        if blocker.Phase != VulkanQueueMailboxPhase.SubmitComplete
          || blocker.SubmitResult != VkConstants.VK_SUCCESS
          || activeRuntime.WaitGraphicsSubmission(blocker.SubmitSerial, 5000000000uL) != VkConstants.VK_SUCCESS{
            throw InvalidOperationException("Vulkan retirement probe queue hold did not complete")
          }
        blocker.ResetSubmitCompletion()
      } else {
        blocker.CancelSubmit()
      }
    }
  }

  private func LegacyExtMaintenanceSupportedForProof() bool {
    if !HasInstanceExtensionName(VulkanWindowTargetExtensionNames.SurfaceMaintenanceExt)
      || !HasInstanceExtensionName(VkConstants.VK_KHR_GET_SURFACE_CAPABILITIES_2_EXTENSION_NAME) {
        return false
      }
    let enumerate = instanceDispatch.vkEnumerateDeviceExtensionProperties
    var count uint32
    if enumerate(physicalDevice, nil, &count, nil) != VkConstants.VK_SUCCESS || count == 0u {
      return false
    }
    let extensions * VkExtensionProperties = stackalloc[int32(count)]VkExtensionProperties
    if enumerate(physicalDevice, nil, &count, extensions) != VkConstants.VK_SUCCESS {
      return false
    }
    var index uint32
    while index < count {
      if ExtensionNameEquals(&extensions[index], VulkanWindowTargetExtensionNames.SwapchainMaintenanceExt) {
        return true
      }
      index++
    }
    return false
  }

  internal func LegacyPresentationSnapshotForProof()
  VulkanLegacyPresentationSnapshot{
    guard let activeRuntime = runtime, let current = generation else {
      return VulkanLegacyPresentationSnapshot{}
    }
    var lastLayout = VkConstants.VK_IMAGE_LAYOUT_UNDEFINED
    if lastPresentedImageStateValid && lastPresentedImageIndex < current.ImageCount {
      lastLayout = current.CurrentLayout(lastPresentedImageIndex)
    }
    var acquireResults uint64
    var acquireSuccesses uint64
    var presentResults uint64
    var presentSuccesses uint64
    var timestampResults uint64
    var timestampSuccesses uint64
    var overflow bool
    if let currentDiagnostics = diagnostics {
      currentDiagnostics.LegacyResultCountsForProof(out acquireResults,
        out acquireSuccesses, out presentResults, out presentSuccesses,
        out timestampResults, out timestampSuccesses, out overflow)
    }
    let retirement = presentationRetirement.LegacySnapshotForProof()
    var textProperties = VkFormatProperties{}
    let getFormatProperties = instanceDispatch.vkGetPhysicalDeviceFormatProperties
    getFormatProperties(physicalDevice, VkConstants.VK_FORMAT_R16G16B16A16_SINT,
      &textProperties)
    var surfaceProperties = VkFormatProperties{}
    getFormatProperties(physicalDevice, current.SurfaceFormat.format,
      &surfaceProperties)
    let blendFeatures = uint32(VkConstants.VK_FORMAT_FEATURE_COLOR_ATTACHMENT_BIT)
    | uint32(VkConstants.VK_FORMAT_FEATURE_COLOR_ATTACHMENT_BLEND_BIT)
    var features2 = VkPhysicalDeviceFeatures2{
      sType: VkConstants.VK_STRUCTURE_TYPE_PHYSICAL_DEVICE_FEATURES_2,
    }
    var features12 = VkPhysicalDeviceVulkan12Features{
      sType: VkConstants.VK_STRUCTURE_TYPE_PHYSICAL_DEVICE_VULKAN_1_2_FEATURES,
    }
    var features13 = VkPhysicalDeviceVulkan13Features{
      sType: VkConstants.VK_STRUCTURE_TYPE_PHYSICAL_DEVICE_VULKAN_1_3_FEATURES,
    }
    var maintenance = VkPhysicalDeviceSwapchainMaintenance1FeaturesEXT{
      sType: VkConstants.VK_STRUCTURE_TYPE_PHYSICAL_DEVICE_SWAPCHAIN_MAINTENANCE_1_FEATURES_EXT,
    }
    features2.pNext = *void(&features12)
    features12.pNext = *void(&features13)
    features13.pNext = *void(&maintenance)
    let getFeatures = instanceDispatch.vkGetPhysicalDeviceFeatures2
    getFeatures(physicalDevice, &features2)
    return VulkanLegacyPresentationSnapshot{
      RuntimeGeneration: activeRuntime.Generation,
      PresentGeneration: current.Generation,
      Instance: activeRuntime.Instance,
      Device: activeRuntime.Device,
      GraphicsQueue: activeRuntime.GraphicsQueue,
      PresentQueue: activeRuntime.PresentQueue,
      GraphicsFamily: activeRuntime.GraphicsFamilyIndex,
      PresentFamily: activeRuntime.PresentFamilyIndex,
      ApiVersion: activeRuntime.Facts.ApiVersion,
      TimelineSemaphore: features12.timelineSemaphore == VkConstants.VK_TRUE,
      Synchronization2: features13.synchronization2 == VkConstants.VK_TRUE,
      DynamicRendering: features13.dynamicRendering == VkConstants.VK_TRUE,
      MaintenanceFeature: maintenance.swapchainMaintenance1 == VkConstants.VK_TRUE,
      ExtMaintenanceSupported: Environment.GetEnvironmentVariable("GOO_VK_REQUIRE_EXT_MAINTENANCE") == "1"
        && LegacyExtMaintenanceSupportedForProof(),
      SdlPresentationSupported: SDL.VulkanGetPresentationSupport(
        activeRuntime.Instance, physicalDevice, activeRuntime.PresentFamilyIndex),
      RuntimeDeviceLost: activeRuntime.DeviceLost,
      RuntimeTerminal: activeRuntime.Terminal,
      InstanceMaintenance: activeRuntime.InstanceMaintenanceVariant,
      SwapchainMaintenance: activeRuntime.SwapchainMaintenanceVariant,
      SurfaceFormat: current.SurfaceFormat.format,
      ColorSpace: current.SurfaceFormat.colorSpace,
      ImageCount: current.ImageCount,
      LastImageIndex: lastPresentedImageIndex,
      LastImageLayout: lastLayout,
      LastImageValid: lastPresentedImageStateValid,
      Slot0Serial: frameSlots.Slot(0u)?.SubmissionSerial ?? 0uL,
      Slot1Serial: frameSlots.Slot(1u)?.SubmissionSerial ?? 0uL,
      Slot0GlobalSerial: frameSlots.Slot(0u)?.GlobalSubmissionSerial ?? 0uL,
      Slot1GlobalSerial: frameSlots.Slot(1u)?.GlobalSubmissionSerial ?? 0uL,
      ValidationErrors: diagnostics?.ValidationErrorCount ?? 0L,
      ResultFailures: diagnostics?.LegacyUnexpectedResultFailuresForProof ?? 0uL,
      AcquireResults: acquireResults,
      AcquireSuccesses: acquireSuccesses,
      PresentResults: presentResults,
      PresentSuccesses: presentSuccesses,
      ResultOverflow: overflow,
      TextTexelBufferSupported: (textProperties.bufferFeatures
        &uint32(VkConstants.VK_FORMAT_FEATURE_UNIFORM_TEXEL_BUFFER_BIT)) != 0u,
      SurfaceBlendSupported: (surfaceProperties.optimalTilingFeatures
        &blendFeatures) == blendFeatures,
      TimestampResults: timestampResults,
      TimestampSuccesses: timestampSuccesses,
      LivePresentationCount: retirement.PresentationCount,
      BoundPresentationCount: retirement.BoundPresentationCount,
      BoundGeneration: retirement.BoundGeneration,
      BoundImageIndex: retirement.BoundImageIndex,
      BoundCompletionSlot: retirement.BoundCompletionSlot,
      BoundCompletionSerial: retirement.BoundCompletionSerial,
      RetiredGenerationCount: retirement.RetiredGenerationCount,
      AnchoredRetiredGenerationCount: retirement.AnchoredRetiredGenerationCount,
      CompletedRetiredGenerationCount: retirement.CompletedRetiredGenerationCount,
      TargetRetiredSwapchainCount: retiredSwapchains.Count,
    }
  }

  internal func OpenLegacyDirectReadbackForProof()
  VulkanSolidQuadReadbackTarget{
    PollQueueCompletion()
    if disposed || frameFailed || frameBegun || queueStage != QueueStageIdle {
      throw InvalidOperationException("Vulkan direct readback requires an idle window target")
    }
    if !ReadbackFormatSupported(VkConstants.VK_FORMAT_R8G8B8A8_UNORM) {
      throw NotSupportedException("Vulkan direct UNORM readback format is unavailable")
    }
    guard let directLease = VulkanSharedRuntime.TryAcquire() else {
      throw InvalidOperationException("Vulkan shared runtime lease is unavailable")
    }
    try {
      return VulkanSolidQuadReadbackTarget(directLease, EnsureReadbackDispatch())
    } catch (error Exception) {
      try { directLease.Release() } catch (cleanup Exception) { }
      throw error
    }
  }

  internal func RetainRuntimeForProof() VulkanSharedLease {
    guard let held = VulkanSharedRuntime.TryAcquire() else {
      throw InvalidOperationException("Vulkan shared runtime lease is unavailable")
    }
    return held
  }

  internal func RetainDiagnosticsForProof() VulkanDiagnostics ? -> diagnostics
}

internal partial class SdlHost {
  internal func LegacyNativeMinimizedForProof() bool {
    if window.IsNull { return false }
    return (SDL.GetWindowFlags(window) & uint64(SDLWindowFlags.Minimized)) != 0uL
  }
}

public partial class Window {
  internal func LegacyNativeMinimizedForProof() bool ->
  SdlHostForTest()?.LegacyNativeMinimizedForProof() == true
}

internal unsafe class VulkanLegacyProofFixture {
  shared {
    internal func Render(window Window, dt float64) {
      let baseline = Snapshot(window)
      WindowReadbackTestFixture.ForceRenderNonblocking(window, dt)
      let deadline = Environment.TickCount64 + 5000L
      while Environment.TickCount64 < deadline {
        WindowReadbackTestFixture.PumpNativeEvents()
        WindowReadbackTestFixture.PollQueueCompletion(window)
        let current = Snapshot(window)
        let accepted = current.Slot0Serial != baseline.Slot0Serial
          || current.Slot1Serial != baseline.Slot1Serial
        let pending = WindowReadbackTestFixture.RuntimeQueueWorkPending(window)
        if accepted && !pending { return }
        if !accepted && !pending {
          WindowReadbackTestFixture.ForceRenderNonblocking(window, 0.0)
        }
        Thread.Yield()
      }
      throw InvalidOperationException("Vulkan lifecycle frame did not accept and drain queue work")
    }

    internal func DrainQueue(window Window) {
      let deadline = Environment.TickCount64 + 5000L
      while WindowReadbackTestFixture.RuntimeQueueWorkPending(window) {
        WindowReadbackTestFixture.PumpNativeEvents()
        WindowReadbackTestFixture.PollQueueCompletion(window)
        Snapshot(window)
        if Environment.TickCount64 >= deadline {
          throw InvalidOperationException("Vulkan lifecycle queue did not drain")
        }
        Thread.Yield()
      }
    }

    internal func PumpScheduled(window Window) {
      window.RefreshSchedulerMetrics()
      let now = float64(System.Diagnostics.Stopwatch.GetTimestamp())
      window.SchedulerPump(now, window.SchedulerFrameDue(now))
    }

    internal func PollPresentation(window Window) VulkanLegacyPresentationSnapshot {
      guard let target = WindowReadbackTestFixture.CaptureTarget(window) else {
        throw InvalidOperationException("Vulkan retirement probe target is unavailable")
      }
      var snapshot VulkanLegacyPresentationSnapshot
      if target.TryCaptureLegacyBindingForProof(out snapshot) { return snapshot }
      WindowReadbackTestFixture.PollQueueCompletion(window)
      return target.LegacyPresentationSnapshotForProof()
    }

    internal func NativeWindowExists(windowId uint32) bool ->
    !SDL.GetWindowFromID(windowId).IsNull

    internal func Snapshot(window Window) VulkanLegacyPresentationSnapshot {
      guard let target = WindowReadbackTestFixture.CaptureTarget(window) else {
        throw InvalidOperationException("Vulkan window target is unavailable")
      }
      return target.LegacyPresentationSnapshotForProof()
    }

    internal func OpenDirectReadback(window Window)
    VulkanSolidQuadReadbackTarget{
      guard let target = WindowReadbackTestFixture.CaptureTarget(window) else {
        throw InvalidOperationException("Vulkan window target is unavailable")
      }
      return target.OpenLegacyDirectReadbackForProof()
    }

    internal func RetainRuntime(window Window) VulkanSharedLease {
      guard let target = WindowReadbackTestFixture.CaptureTarget(window) else {
        throw InvalidOperationException("Vulkan window target is unavailable")
      }
      return target.RetainRuntimeForProof()
    }

    internal func RetainDiagnostics(window Window) VulkanDiagnostics? {
      guard let target = WindowReadbackTestFixture.CaptureTarget(window) else {
        throw InvalidOperationException("Vulkan window target is unavailable")
      }
      return target.RetainDiagnosticsForProof()
    }

    internal func PushCloseRequest(window Window) bool {
      let windowId = WindowReadbackTestFixture.SdlWindowId(window)
      if windowId == 0u { return false }
      var nativeEvent = SDLEvent{
        Type: uint32(SDLEventType.WindowCloseRequested),
        Window: SDLWindowEvent{
          Type: SDLEventType.WindowCloseRequested,
          WindowID: windowId,
        },
      }
      return SDL.PushEvent(&nativeEvent)
    }

    internal func NativeMinimized(window Window) bool ->
    window.LegacyNativeMinimizedForProof()
  }
}
