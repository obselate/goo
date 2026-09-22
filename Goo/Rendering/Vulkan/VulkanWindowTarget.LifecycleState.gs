package Goo

import System
import System.Collections.Generic
import System.Diagnostics
import System.Numerics
import System.Threading

internal unsafe partial class VulkanWindowTarget : IDisposable, FrameProfileSink, WindowRenderTarget {
  shared {
    private var terminalTargets List[VulkanWindowTarget]? = nil
    internal func RetainTerminalTarget(target VulkanWindowTarget) {
      if terminalTargets == nil {
        terminalTargets = List[VulkanWindowTarget]()
      }
      terminalTargets!!.Add(target)
    }

  }

  private let host VulkanSurfaceHost
  private let diagnosticWindowHandle uint64
  private var diagnostics VulkanDiagnostics? = nil
  private var timestampState VulkanDiagnosticTimestampState? = nil
  private var validation VulkanDiagnosticsValidation? = nil
  private let sceneCompiler VulkanSceneCompiler
  private let presentationRetirement VulkanPresentationRetirement
  private var runtime VulkanSharedLease? = nil
  private var queueMailbox VulkanQueueMailbox? = nil
  private let validateGraphicsSubmission Action[uint64]
  private var completedGraphicsSubmissionSerial uint64
  private var objectAccounting VulkanObjectAccounting? = nil
  private var sharedObjectAccounting VulkanObjectAccounting? = nil
  private var windowObjectAccounting VulkanObjectAccounting? = nil
  private var memoryAllocator VulkanMemoryAllocator? = nil
  private var imageResources VulkanImageResources? = nil
  private var imageScene VulkanImageScene? = nil
  private var pathResources VulkanPathResources? = nil
  private var pathScene VulkanPathScene? = nil
  private var textAtlas VulkanTextAtlasSet? = nil
  private var textScene VulkanTextScene? = nil
  private var textAtlasDiagnosticsToken uint64
  private var clipMaskAtlas VulkanClipMaskAtlas? = nil
  private var clipMaskRedrawPending bool
  private var clipMaskFrameStarted bool
  private var clipMaskFramePrepared bool
  private var clipMaskAtlasAbandoned bool
  private var clipMaskFrameStats VulkanClipMaskFrameStats
  private var clipMaskFrameTotals VulkanClipMaskFrameTotals
  private var instance VkInstance = nint(0)
  private var instanceDispatch VkInstanceDispatch = VkInstanceDispatch{}
  private var getProcAddress nint = nint(0)
  private var instanceMaintenanceVariant VulkanSwapchainMaintenanceVariant
  private var swapchainMaintenanceVariant VulkanSwapchainMaintenanceVariant
  private var portabilitySubsetSupported bool
  private var memoryBudgetSupported bool
  private var clipMaskFormatSupport VulkanClipMaskFormatSupport
  private var physicalDevice VkPhysicalDevice = nint(0)
  private var device VkDevice = nint(0)
  private var dispatch VkDeviceDispatch = VkDeviceDispatch{}
  private var instanceDestroyAvailable bool
  private var deviceDestroyAvailable bool
  private var debugUtilsEnabled bool
  private var validationMessenger VkDebugUtilsMessengerEXT = 0uL
  private var validationMessengerCreated bool
  private var timestampValidBits uint32
  private var timestampPeriod float32
  private var timestampComputeAndGraphics VkBool32 = VkConstants.VK_FALSE
  private var deviceFacts VulkanSharedDeviceFacts
  private var queue VkQueue = nint(0)
  private var queueFamilyIndex uint32 = 0u
  private var surface VkSurfaceKHR = 0uL
  private var surfaceCreated bool
  private var vulkanLoaded bool
  private var deviceWaitIdleAddress nint = nint(0)
  private var commandPool VkCommandPool = 0uL
  private var commandBufferObjectCount int32
  private var frameSlots VulkanFrameSlotRing
  private var generation VulkanSwapchainGeneration? = nil
  private let retiredSwapchains VulkanRetiredSwapchainSet
  private var primitiveRenderer VulkanPrimitiveRenderer? = nil
  private var layerPool VulkanOffscreenLayerPool? = nil
  private var framebufferWidth int32
  private var framebufferHeight int32
  private var requestedWidth int32
  private var requestedHeight int32
  private var nextFrameId uint64
  private var activeFrameId uint64
  private var activeFrameSlot VulkanFrameSlot? = nil
  private var activeFrameSlotIndex uint32
  private var activeImageIndex uint32
  private var activeImageLayout VkImageLayout
  private var frameBegun bool
  private var renderingBegun bool
  private var frameRendered bool
  private var frameRenderDeferred bool
  private var activeDamageRegion VulkanDamageRegion
  private var activePartialRedraw bool
  private var activeSceneVersion uint64
  private var activeAppliedSceneVersion uint64
  private var lastFrameSubmitted bool
  private var activeImagePromoted bool
  private var lastPresentedImageStateValid bool
  private var lastPresentedImageIndex uint32
  private var lastPresentedAppliedSceneVersion uint64
  private var lastPresentedPendingSceneVersion uint64
  private var lastPresentedImagePromoted bool
  private var frameFailed bool
  private var frameFailureRetryable bool
  private var textRedrawPending bool
  private var imageRedrawPending bool
  private var pathRedrawPending bool
  private var recreatePending bool = true
  private var vsync bool
  private var surfaceLost bool
  private var disposed bool
  private const QueueStageIdle int32 = 0
  private const QueueStageSubmit int32 = 1
  private const QueueStagePresentPrepare int32 = 2
  private const QueueStagePresent int32 = 3
  private const QueueStageSubmitRetry int32 = 4
  private var queueStage int32
  private var pendingGlobalSubmissionSerial uint64
  private var pendingSubmitStart uint64
  private var pendingPresentStart uint64
  private var pendingPresentFence VkFence
  private var startupRendererStart uint64
  private var startupFirstSwapchainRecorded bool
  private var startupFirstRendererRecorded bool
  private var startupFirstSceneRecorded bool
  private var startupFirstSubmitRecorded bool
  private var startupFirstPresentRecorded bool
  private var startupFirstPresentTicks uint64

  public prop ProfileSink FrameProfileSink{ get -> this }

  public prop NeedsRender bool{
    get {
      if let activeRuntime = runtime {
        if activeRuntime.DeviceLost {
          return true
        }
      }
      return textRedrawPending || imageRedrawPending || pathRedrawPending
        || clipMaskRedrawPending
        || forceFullRedraw
        || sceneCompiler.Frame.ShaderPlaybackActive
        || (recreatePending && framebufferWidth > 0 && framebufferHeight > 0)
    }
  }

  public prop LastFrameSubmitted bool{ get -> lastFrameSubmitted }
  public prop QueueWorkPending bool{ get -> queueStage != QueueStageIdle }

  public func PrepareClose() bool {
    PollQueueCompletion()
    if queueStage != QueueStageIdle || frameBegun {
      return false
    }
    if let activeRuntime = runtime {
      if activeRuntime.Terminal {
        return true
      }
      if activeRuntime.QueueWorker.HasOutstandingWork {
        host.Wake()
        return false
      }
    }
    var ready = true
    if let slot = frameSlots.Slot(0u) {
      let result = slot.PollForCompletion()
      RecordDiagnosticResult(VulkanDiagnosticEventIds.PresentWait, result)
      if result == VkConstants.VK_ERROR_DEVICE_LOST {
        runtime?.MarkDeviceLost()
      } else if result != VkConstants.VK_SUCCESS {
        ready = false
      } else {
        presentationRetirement.CollectCompleted(0u, slot.LastCompletedSerial)
      }
    }
    if let slot = frameSlots.Slot(1u) {
      let result = slot.PollForCompletion()
      RecordDiagnosticResult(VulkanDiagnosticEventIds.PresentWait, result)
      if result == VkConstants.VK_ERROR_DEVICE_LOST {
        runtime?.MarkDeviceLost()
      } else if result != VkConstants.VK_SUCCESS {
        ready = false
      } else {
        presentationRetirement.CollectCompleted(1u, slot.LastCompletedSerial)
      }
    }
    if let current = generation {
      let result = current.PollForPresentCompletion(presentationRetirement)
      RecordDiagnosticResult(VulkanDiagnosticEventIds.PresentWait, result)
      if result == VkConstants.VK_ERROR_DEVICE_LOST {
        runtime?.MarkDeviceLost()
      } else if result != VkConstants.VK_SUCCESS {
        ready = false
      }
    }
    var retiredIndex int32 = 0
    while retiredIndex < retiredSwapchains.Count {
      let result = retiredSwapchains.Generation(retiredIndex).PollForPresentCompletion(presentationRetirement)
      RecordDiagnosticResult(VulkanDiagnosticEventIds.PresentWait, result)
      if result == VkConstants.VK_ERROR_DEVICE_LOST {
        runtime?.MarkDeviceLost()
      } else if result != VkConstants.VK_SUCCESS {
        ready = false
      }
      retiredIndex = retiredIndex + 1
    }
    CollectRetiredSwapchains()
    if let request = readbackRequest {
      let result = request.PollTargetCompletionForClose()
      if result == VkConstants.VK_ERROR_DEVICE_LOST {
        runtime?.MarkDeviceLost()
      } else if result == VkConstants.VK_NOT_READY || result == VkConstants.VK_TIMEOUT {
        ready = false
      } else if result != VkConstants.VK_SUCCESS {
        throw InvalidOperationException("Vulkan readback close poll failed: " + result.ToString())
      }
    }
    return if ready { true } else { VulkanDeviceRecoveryCoordinator.Count <= 1 }
  }

  internal func HoldNextQueueSubmitForTest() {
    guard let mailbox = queueMailbox else { return }
    VulkanSharedRuntime.HoldQueueSubmitForMailboxForTest(mailbox)
  }

  internal func HoldNextQueuePresentForTest() {
    guard let mailbox = queueMailbox else { return }
    VulkanSharedRuntime.HoldQueuePresentForMailboxForTest(mailbox)
  }

  internal func SetPresentationLatencySink(
    sink Action[VulkanPresentationLatencySample]?) {
      if sink == nil {
        presentationRetirement.ClearPresentationLatency()
        return
      }
      presentationRetirement.SetPresentationLatencySink(sink)
    }

  internal func BeginPresentationLatency(
    token uint64, kind int32, startTimestamp int64) {
      presentationRetirement.BeginPresentationLatency(token, kind, startTimestamp)
    }

  internal prop PresentFenceSupported bool{
    get {
      if let current = generation {
        return current.PresentFenceEnabled
      }
      return false
    }
  }

  internal prop CurrentPresentMode VkPresentModeKHR{
    get {
      if let current = generation {
        return current.PresentMode
      }
      return VkPresentModeKHR(-1)
    }
  }

  internal prop CurrentPresentGeneration uint64{
    get {
      if let current = generation {
        return current.Generation
      }
      return 0uL
    }
  }

  public func SetVSync(value bool) {
    if disposed || vsync == value {
      return
    }
    vsync = value
    recreatePending = true
    forceFullRedraw = true
    host.RefreshDisplayPacing(true)
    host.Wake()
  }

  internal init(nativeHost VulkanSurfaceHost) {
    if nativeHost == nil {
      throw ArgumentNullException("nativeHost")
    }
    host = nativeHost
    validateGraphicsSubmission = (serial uint64) -> { ValidateGraphicsSubmission(serial) }
    diagnosticWindowHandle = uint64(nativeHost.WindowHandle)
    vsync = host.VSync
    sceneCompiler = VulkanSceneCompiler()
    presentationRetirement = VulkanPresentationRetirement(64u, 8u)
    retiredSwapchains = VulkanRetiredSwapchainSet(8)
    try {
      Bootstrap()
      if let resources = textScene {
        sceneCompiler.SetTextScene(resources)
      }
      sceneCompiler.SetImageScene(imageScene)
      sceneCompiler.SetPathScene(pathScene)
      RecordDiagnosticEvent(
        VulkanDiagnosticEventIds.WindowCreate,
        VulkanDiagnosticCategories.Window,
        0uL,
        0,
        uint64(framebufferWidth),
        uint64(framebufferHeight))
      CaptureDiagnosticWsi()
      VulkanDeviceRecoveryCoordinator.Register(this)
    } catch (error Exception) {
      CaptureDiagnosticFatal(-1, VulkanDiagnosticEventIds.RuntimeStart)
      try { Dispose() } catch (cleanup Exception) { }
      throw error
    }
  }

}
