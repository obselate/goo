package Goo

import System
import System.Threading

internal data struct VulkanSharedDeviceFacts {
  var ApiVersion uint32
  var DriverVersion uint32
  var VendorId uint32
  var DeviceId uint32
  var DeviceType int32
  var TimestampValidBits uint32
  var TimestampPeriod float32
  var TimestampComputeAndGraphics VkBool32
}

internal data struct VulkanGraphicsQueueCore(Timeline VkSemaphore, Worker VulkanQueueWorker) { }

internal unsafe sealed class VulkanSharedRuntime : IDisposable {
  private let instance VkInstance
  private let instanceDispatch VkInstanceDispatch
  private let physicalDevice VkPhysicalDevice
  private let device VkDevice
  private let dispatch VkDeviceDispatch
  private let graphicsQueue VkQueue
  private let presentQueue VkQueue
  private let graphicsTimeline VkSemaphore
  private let queueWorker VulkanQueueWorker
  private let graphicsFamilyIndex uint32
  private let presentFamilyIndex uint32
  private let deviceWaitIdleAddress nint
  private let instanceMaintenanceVariant VulkanSwapchainMaintenanceVariant
  private let swapchainMaintenanceVariant VulkanSwapchainMaintenanceVariant
  private let facts VulkanSharedDeviceFacts
  private let maxStorageBufferRange VkDeviceSize
  private let resourcePolicy VulkanResourcePolicy
  private let memoryAllocator VulkanMemoryAllocator
  private let imageResources VulkanImageResources
  private let pipelineCache VulkanPipelineCache
  private let primitiveState VulkanSharedPrimitiveState
  private let imageIdentityRegistry VulkanImageIdentityRegistry
  private let pathResources VulkanPathResources
  private let pathIdentityRegistry VulkanPathIdentityRegistry
  private let objectAccounting VulkanObjectAccounting?
  private let sharedObjectAccounting VulkanObjectAccounting?
  private let diagnostics VulkanDiagnostics?
  private let debugUtilsEnabled bool
  private let validation VulkanDiagnosticsValidation?
  private let validationMessenger VkDebugUtilsMessengerEXT
  private let validationMessengerCreated bool
  private let instanceDestroyAvailable bool
  private let deviceDestroyAvailable bool
  private let generation uint64
  private var references int32
  private var deviceLost bool
  private var terminal bool
  private var terminalIdleResult VkResult = VkConstants.VK_SUCCESS
  private var disposed bool

  shared {
    private var current VulkanSharedRuntime?
    private var generationSeed uint64
    private var logicalImageIdentityRegistry VulkanImageIdentityRegistry?
    private var logicalPathIdentityRegistry VulkanPathIdentityRegistry?
    private var terminalFailure bool
    private var terminalFailureResult VkResult = VkConstants.VK_SUCCESS
    private var testFailNextDeviceIdle int32
    private var testFailNextGraphicsSubmission int32
    private var testDeviceIdleCallCount int64

    private func CreateGraphicsQueueCore(device VkDevice, dispatch VkDeviceDispatch,
      queue VkQueue, accounting VulkanObjectAccounting?) VulkanGraphicsQueueCore{
        var timeline VkSemaphore
        var accounted bool
        var typeInfo = VkSemaphoreTypeCreateInfo{
          sType: VkConstants.VK_STRUCTURE_TYPE_SEMAPHORE_TYPE_CREATE_INFO,
          pNext: nil,
          semaphoreType: VkConstants.VK_SEMAPHORE_TYPE_TIMELINE,
          initialValue: 0uL,
        }
        var createInfo = VkSemaphoreCreateInfo{
          sType: VkConstants.VK_STRUCTURE_TYPE_SEMAPHORE_CREATE_INFO,
          pNext: *void(&typeInfo),
          flags: 0u,
        }
        try {
          let createSemaphore = dispatch.vkCreateSemaphore
          let result = createSemaphore(device, &createInfo, nil, &timeline)
          if result != VkConstants.VK_SUCCESS || timeline == 0uL {
            throw InvalidOperationException("vkCreateSemaphore failed for graphics timeline: "
              +result.ToString())
          }
          if let objects = accounting {
            objects.Allocate()
            accounted = true
          }
          return VulkanGraphicsQueueCore(timeline,
            VulkanQueueWorker(queue, dispatch, timeline))
        } catch (error Exception) {
          if timeline != 0uL {
            let destroySemaphore = dispatch.vkDestroySemaphore
            try { destroySemaphore(device, timeline, nil) } catch (cleanup Exception) { }
          }
          if accounted {
            if let objects = accounting {
              try { objects.Release() } catch (cleanup Exception) { }
            }
          }
          throw error
        }
      }

    internal prop DeviceIdleCallCountForTest int64{
      get -> Interlocked.Read(ref testDeviceIdleCallCount)
    }

    internal func FailNextDeviceIdleForTest() {
      Interlocked.Exchange(ref testFailNextDeviceIdle, 1)
    }

    internal func FailNextGraphicsSubmissionForTest() {
      Interlocked.Exchange(ref testFailNextGraphicsSubmission, 1)
    }

    private func TakeTestDeviceIdleFailure() bool -> Interlocked.Exchange(ref testFailNextDeviceIdle, 0) != 0

    internal func TakeTestGraphicsSubmissionFailure() bool -> Interlocked.Exchange(ref testFailNextGraphicsSubmission, 0) != 0

    internal func DrainTestGraphicsSubmissionFailure() VkResult {
      if let owner = current {
        return owner.WaitDeviceIdleResult()
      }
      return VkConstants.VK_ERROR_INITIALIZATION_FAILED
    }

    internal func HoldNextQueueSubmitForTest() {
      VulkanQueueWorker.HoldNextSubmitForTest()
    }

    internal func HoldNextQueuePresentForTest() {
      VulkanQueueWorker.HoldNextPresentForTest()
    }

    internal func HoldQueueSubmitForMailboxForTest(mailbox VulkanQueueMailbox) {
      VulkanQueueWorker.HoldSubmitForMailboxForTest(mailbox)
    }

    internal func HoldQueuePresentForMailboxForTest(mailbox VulkanQueueMailbox) {
      VulkanQueueWorker.HoldPresentForMailboxForTest(mailbox)
    }

    internal func ReleaseHeldQueueCallForTest() {
      VulkanQueueWorker.ReleaseHeldQueueCallForTest()
    }

    internal func WaitForHeldQueueCallForTest(timeoutMs int32) bool -> VulkanQueueWorker.WaitForHeldQueueCallForTest(timeoutMs)

    internal func DeferNextQueueEnqueueForTest() {
      VulkanQueueWorker.DeferNextEnqueueForTest()
    }

    internal prop QueueEnqueueDeferralCountForTest int64{
      get -> VulkanQueueWorker.EnqueueDeferralCountForTest
    }

    internal func TryAcquire() VulkanSharedLease? {
      if let owner = current {
        if owner.DeviceLost {
          throw InvalidOperationException("Vulkan shared runtime device is lost")
        }
        if owner.Terminal {
          throw InvalidOperationException("Vulkan shared runtime is terminal after idle failure")
        }
        return owner.AcquireLease()
      }
      if terminalFailure {
        throw InvalidOperationException(
          "Vulkan shared runtime is terminal after idle failure: "
          +int32(terminalFailureResult).ToString())
      }
      return nil
    }

    internal func Publish(nativeInstance VkInstance, nativeInstanceDispatch VkInstanceDispatch,
      nativePhysicalDevice VkPhysicalDevice, nativeDevice VkDevice,
      nativeDispatch VkDeviceDispatch, nativeGraphicsQueue VkQueue,
      nativePresentQueue VkQueue, nativeGraphicsFamilyIndex uint32,
      nativePresentFamilyIndex uint32, nativeDeviceWaitIdleAddress nint,
      nativeInstanceMaintenanceVariant VulkanSwapchainMaintenanceVariant,
      nativeSwapchainMaintenanceVariant VulkanSwapchainMaintenanceVariant,
      nativeFacts VulkanSharedDeviceFacts,
      nativePipelineCacheUuid * uint8,
      nativeMemoryProperties VkPhysicalDeviceMemoryProperties,
      nativeMaxMemoryAllocationCount uint32,
      nativeMaxStorageBufferRange uint32,
      nativeNonCoherentAtomSize VkDeviceSize,
      nativeBufferImageGranularity VkDeviceSize,
      nativeMemoryBudgetAvailable bool,
      nativeDiagnostics VulkanDiagnostics?,
      nativeDebugUtilsEnabled bool,
      nativeValidation VulkanDiagnosticsValidation?,
      nativeValidationMessenger VkDebugUtilsMessengerEXT,
      nativeValidationMessengerCreated bool,
      nativeInstanceDestroyAvailable bool,
      nativeDeviceDestroyAvailable bool,
      nativeObjectAccounting VulkanObjectAccounting?,
      nativeSharedObjectAccounting VulkanObjectAccounting?) VulkanSharedLease{
        if current != nil {
          throw InvalidOperationException("Vulkan shared runtime is already published")
        }
        if terminalFailure {
          throw InvalidOperationException(
            "Vulkan shared runtime is terminal after idle failure: "
            +int32(terminalFailureResult).ToString())
        }
        if generationSeed == uint64.MaxValue {
          throw OverflowException("Vulkan shared runtime generation overflow")
        }
        if nativeMaxStorageBufferRange == 0u {
          throw ArgumentOutOfRangeException("nativeMaxStorageBufferRange")
        }
        generationSeed = generationSeed + 1uL
        var allocator VulkanMemoryAllocator? = nil
        var imageResources VulkanImageResources? = nil
        var pipelineCache VulkanPipelineCache? = nil
        var primitiveState VulkanSharedPrimitiveState? = nil
        var imageIdentityRegistry VulkanImageIdentityRegistry? = nil
        var pathResources VulkanPathResources? = nil
        var pathIdentityRegistry VulkanPathIdentityRegistry? = nil
        var createdImageIdentityRegistry bool = false
        var createdPathIdentityRegistry bool = false
        try {
          let createdBudget = VulkanMemoryBudgetState(
            nativePhysicalDevice,
            nativeInstanceDispatch,
            nativeMemoryProperties.memoryHeapCount,
            nativeMemoryBudgetAvailable)
          let createdAllocator = VulkanMemoryAllocator(
            nativeDevice,
            nativeDispatch,
            nativeMemoryProperties,
            nativeMaxMemoryAllocationCount,
            nativeNonCoherentAtomSize,
            nativeBufferImageGranularity,
            createdBudget,
            nativeSharedObjectAccounting)
          allocator = createdAllocator
          createdAllocator.RefreshBudget()
          let createdResourcePolicy = CreateVulkanResourcePolicy(
            nativeMemoryProperties,
            createdAllocator.DriverHeapBudget,
            nativeMaxStorageBufferRange)
          let createdImageResources = VulkanImageResources(
            nativeDevice,
            nativeDispatch,
            createdAllocator,
            createdResourcePolicy.ImageInitialResourceCapacity,
            createdResourcePolicy.ImageInitialLogicalCapacity,
            createdResourcePolicy.ImageResidentHardBytes,
            createdResourcePolicy.ImageLogicalSourceHardBytes,
            createdResourcePolicy.ImageStagingInitialBytes,
            createdResourcePolicy.ImageStagingHardBytes,
            createdResourcePolicy.ImageUploadInitialRangeCapacity,
            nativeDiagnostics,
            generationSeed,
            nativeSharedObjectAccounting)
          imageResources = createdImageResources
          let createdPipelineCache = VulkanPipelineCache(
            nativeDevice,
            nativeDispatch,
            nativeFacts.VendorId,
            nativeFacts.DeviceId,
            nativeFacts.DriverVersion,
            nativePipelineCacheUuid,
            nativeSharedObjectAccounting)
          pipelineCache = createdPipelineCache
          let createdPrimitiveState = VulkanSharedPrimitiveState(
            nativeDevice,
            nativeDispatch,
            createdPipelineCache,
            createdImageResources,
            generationSeed,
            nativeFacts.DeviceType == int32(VkConstants.VK_PHYSICAL_DEVICE_TYPE_CPU),
            nativeSharedObjectAccounting)
          primitiveState = createdPrimitiveState
          let retainedPathIdentities = if let retained = logicalPathIdentityRegistry {
            retained
          } else {
            let created = VulkanPathIdentityRegistry()
            logicalPathIdentityRegistry = created
            createdPathIdentityRegistry = true
            created
          }
          pathIdentityRegistry = retainedPathIdentities
          let pathAtlasByteSize = if createdResourcePolicy.PathAtlasHardBytes
          < createdResourcePolicy.PathAtlasInitialBytes{
            createdResourcePolicy.PathAtlasHardBytes
          } else {
            createdResourcePolicy.PathAtlasInitialBytes
          }
          if pathAtlasByteSize < 4096uL {
            throw InvalidOperationException("Vulkan path atlas capacity is too small")
          }
          let pathAtlas = VulkanPathAtlas(
            nativeDevice,
            nativeDispatch,
            createdAllocator,
            pathAtlasByteSize,
            nativeMaxStorageBufferRange,
            createdPrimitiveState.PathDescriptorSetLayout,
            nativeSharedObjectAccounting)
          let createdPathResources = VulkanPathResources(pathAtlas, retainedPathIdentities)
          pathResources = createdPathResources
          let identityRegistry = if let retained = logicalImageIdentityRegistry {
            retained
          } else {
            let created = VulkanImageIdentityRegistry(createdResourcePolicy.ImageIdentityInitialCapacity)
            logicalImageIdentityRegistry = created
            createdImageIdentityRegistry = true
            created
          }
          imageIdentityRegistry = identityRegistry
          let owner = VulkanSharedRuntime(
            nativeInstance,
            nativeInstanceDispatch,
            nativePhysicalDevice,
            nativeDevice,
            nativeDispatch,
            nativeGraphicsQueue,
            nativePresentQueue,
            nativeGraphicsFamilyIndex,
            nativePresentFamilyIndex,
            nativeDeviceWaitIdleAddress,
            nativeInstanceMaintenanceVariant,
            nativeSwapchainMaintenanceVariant,
            nativeFacts,
            nativeMaxStorageBufferRange,
            createdResourcePolicy,
            createdAllocator,
            createdImageResources,
            createdPipelineCache,
            createdPrimitiveState,
            identityRegistry,
            createdPathResources,
            retainedPathIdentities,
            nativeDiagnostics,
            nativeDebugUtilsEnabled,
            nativeValidation,
            nativeValidationMessenger,
            nativeValidationMessengerCreated,
            nativeInstanceDestroyAvailable,
            nativeDeviceDestroyAvailable,
            generationSeed,
            nativeObjectAccounting,
            nativeSharedObjectAccounting)
          let lease = VulkanSharedLease(owner)
          current = owner
          return lease
        } catch (error Exception) {
          if createdImageIdentityRegistry {
            if let createdIdentityRegistry = imageIdentityRegistry {
              try { createdIdentityRegistry.Dispose() } catch (cleanup Exception) { }
            }
            logicalImageIdentityRegistry = nil
          }
          if let createdPathResources = pathResources {
            try { createdPathResources.Dispose() } catch (cleanup Exception) { }
          }
          if createdPathIdentityRegistry {
            if let createdIdentityRegistry = pathIdentityRegistry {
              try { createdIdentityRegistry.Dispose() } catch (cleanup Exception) { }
            }
            logicalPathIdentityRegistry = nil
          }
          if let createdPrimitiveState = primitiveState {
            try { createdPrimitiveState.Dispose() } catch (cleanup Exception) { }
          }
          if let createdPipelineCache = pipelineCache {
            try { createdPipelineCache.Dispose() } catch (cleanup Exception) { }
          }
          if let createdImageResources = imageResources {
            try { createdImageResources.Dispose() } catch (cleanup Exception) { }
          }
          if let createdAllocator = allocator {
            try { createdAllocator.Dispose() } catch (cleanup Exception) { }
          }
          throw error
        }
      }

    internal func MarkGlobalTerminalFailure(result VkResult) {
      terminalFailure = true
      terminalFailureResult = result
      if current == nil {
        DisposeRetainedLogicalImageIdentityRegistry()
        DisposeRetainedLogicalPathIdentityRegistry()
      }
    }

    private func DisposeRetainedLogicalImageIdentityRegistry() {
      let retained = logicalImageIdentityRegistry
      logicalImageIdentityRegistry = nil
      if let registry = retained {
        try { registry.Dispose() } catch (cleanup Exception) { }
      }
    }

    private func DisposeRetainedLogicalPathIdentityRegistry() {
      let retained = logicalPathIdentityRegistry
      logicalPathIdentityRegistry = nil
      if let registry = retained {
        try { registry.Dispose() } catch (cleanup Exception) { }
      }
    }

    internal func DiscardAfterDeviceLoss() {
      if let owner = current {
        owner.DisposeAfterDeviceLoss()
        current = nil
      }
    }
  }

  internal init(nativeInstance VkInstance, nativeInstanceDispatch VkInstanceDispatch,
    nativePhysicalDevice VkPhysicalDevice, nativeDevice VkDevice,
    nativeDispatch VkDeviceDispatch, nativeGraphicsQueue VkQueue,
    nativePresentQueue VkQueue, nativeGraphicsFamilyIndex uint32,
    nativePresentFamilyIndex uint32, nativeDeviceWaitIdleAddress nint,
    nativeInstanceMaintenanceVariant VulkanSwapchainMaintenanceVariant,
    nativeSwapchainMaintenanceVariant VulkanSwapchainMaintenanceVariant,
    nativeFacts VulkanSharedDeviceFacts, nativeMaxStorageBufferRange uint32,
    nativeResourcePolicy VulkanResourcePolicy,
    nativeAllocator VulkanMemoryAllocator,
    nativeImageResources VulkanImageResources,
    nativePipelineCache VulkanPipelineCache,
    nativePrimitiveState VulkanSharedPrimitiveState,
    nativeImageIdentityRegistry VulkanImageIdentityRegistry,
    nativePathResources VulkanPathResources,
    nativePathIdentityRegistry VulkanPathIdentityRegistry,
    nativeDiagnostics VulkanDiagnostics?,
    nativeDebugUtilsEnabled bool,
    nativeValidation VulkanDiagnosticsValidation?,
    nativeValidationMessenger VkDebugUtilsMessengerEXT,
    nativeValidationMessengerCreated bool,
    nativeInstanceDestroyAvailable bool,
    nativeDeviceDestroyAvailable bool, nativeGeneration uint64,
    nativeObjectAccounting VulkanObjectAccounting?,
    nativeSharedObjectAccounting VulkanObjectAccounting?) {
      if nativeInstance == nint(0) || nativePhysicalDevice == nint(0) || nativeDevice == nint(0) {
        throw ArgumentException("Vulkan shared runtime handles cannot be null")
      }
      if nativeMaxStorageBufferRange == 0u {
        throw ArgumentOutOfRangeException("nativeMaxStorageBufferRange")
      }
      if nativeGraphicsQueue == nint(0) || nativePresentQueue == nint(0) {
        throw ArgumentException("Vulkan shared runtime queues cannot be null")
      }
      if nativeImageResources == nil {
        throw ArgumentNullException("nativeImageResources")
      }
      if nativePrimitiveState == nil {
        throw ArgumentNullException("nativePrimitiveState")
      }
      if nativePipelineCache == nil {
        throw ArgumentNullException("nativePipelineCache")
      }
      if nativePrimitiveState.Generation != nativeImageResources.Generation
        || nativePrimitiveState.Generation == 0uL {
          throw ArgumentOutOfRangeException("nativePrimitiveState")
        }
      if nativeImageIdentityRegistry == nil {
        throw ArgumentNullException("nativeImageIdentityRegistry")
      }
      if nativePathResources == nil {
        throw ArgumentNullException("nativePathResources")
      }
      if nativePathIdentityRegistry == nil {
        throw ArgumentNullException("nativePathIdentityRegistry")
      }
      if nativeObjectAccounting == nil && nativeSharedObjectAccounting != nil {
        throw ArgumentException("Vulkan shared object accounting parent is unavailable")
      }
      instance = nativeInstance
      instanceDispatch = nativeInstanceDispatch
      physicalDevice = nativePhysicalDevice
      device = nativeDevice
      dispatch = nativeDispatch
      graphicsQueue = nativeGraphicsQueue
      presentQueue = nativePresentQueue
      let queueCore = VulkanSharedRuntime.CreateGraphicsQueueCore(
        nativeDevice, nativeDispatch, nativeGraphicsQueue, nativeSharedObjectAccounting)
      graphicsTimeline = queueCore.Timeline
      queueWorker = queueCore.Worker
      graphicsFamilyIndex = nativeGraphicsFamilyIndex
      presentFamilyIndex = nativePresentFamilyIndex
      deviceWaitIdleAddress = nativeDeviceWaitIdleAddress
      instanceMaintenanceVariant = nativeInstanceMaintenanceVariant
      swapchainMaintenanceVariant = nativeSwapchainMaintenanceVariant
      facts = nativeFacts
      maxStorageBufferRange = VkDeviceSize(nativeMaxStorageBufferRange)
      resourcePolicy = nativeResourcePolicy
      memoryAllocator = nativeAllocator
      imageResources = nativeImageResources
      pipelineCache = nativePipelineCache
      primitiveState = nativePrimitiveState
      imageIdentityRegistry = nativeImageIdentityRegistry
      pathResources = nativePathResources
      pathIdentityRegistry = nativePathIdentityRegistry
      objectAccounting = nativeObjectAccounting
      sharedObjectAccounting = nativeSharedObjectAccounting
      diagnostics = nativeDiagnostics
      debugUtilsEnabled = nativeDebugUtilsEnabled
      validation = nativeValidation
      validationMessenger = nativeValidationMessenger
      validationMessengerCreated = nativeValidationMessengerCreated
      instanceDestroyAvailable = nativeInstanceDestroyAvailable
      deviceDestroyAvailable = nativeDeviceDestroyAvailable
      generation = nativeGeneration
      references = 1
    }

  internal prop Instance VkInstance{ get -> instance }
  internal prop ResourcePolicy VulkanResourcePolicy{ get -> resourcePolicy }
  internal prop InstanceDispatch VkInstanceDispatch{ get -> instanceDispatch }
  internal prop PhysicalDevice VkPhysicalDevice{ get -> physicalDevice }
  internal prop Device VkDevice{ get -> device }
  internal prop Dispatch VkDeviceDispatch{ get -> dispatch }
  internal prop GraphicsQueue VkQueue{ get -> graphicsQueue }
  internal prop PresentQueue VkQueue{ get -> presentQueue }
  internal prop GraphicsTimeline VkSemaphore{ get -> graphicsTimeline }
  internal prop QueueWorker VulkanQueueWorker{ get -> queueWorker }
  internal prop GraphicsFamilyIndex uint32{ get -> graphicsFamilyIndex }
  internal prop PresentFamilyIndex uint32{ get -> presentFamilyIndex }
  internal prop DeviceWaitIdleAddress nint{ get -> deviceWaitIdleAddress }
  internal prop InstanceMaintenanceVariant VulkanSwapchainMaintenanceVariant{
    get -> instanceMaintenanceVariant
  }
  internal prop SwapchainMaintenanceVariant VulkanSwapchainMaintenanceVariant{
    get -> swapchainMaintenanceVariant
  }
  internal prop Facts VulkanSharedDeviceFacts{ get -> facts }
  internal prop MaxStorageBufferRange VkDeviceSize{ get -> maxStorageBufferRange }
  internal prop MemoryAllocator VulkanMemoryAllocator{ get -> memoryAllocator }
  internal prop ImageResources VulkanImageResources{ get -> imageResources }
  internal prop PipelineCache VulkanPipelineCache{ get -> pipelineCache }
  internal prop PrimitiveState VulkanSharedPrimitiveState{ get -> primitiveState }
  internal prop ImageIdentityRegistry VulkanImageIdentityRegistry{
    get -> imageIdentityRegistry
  }
  internal prop PathResources VulkanPathResources{ get -> pathResources }
  internal prop PathIdentityRegistry VulkanPathIdentityRegistry{
    get -> pathIdentityRegistry
  }
  internal prop ObjectAccounting VulkanObjectAccounting? { get -> objectAccounting }
  internal prop Diagnostics VulkanDiagnostics? { get -> diagnostics }
  internal prop DebugUtilsEnabled bool{ get -> debugUtilsEnabled }
  internal prop DeviceLost bool{ get -> deviceLost }
  internal prop Terminal bool{ get -> terminal }
  internal prop TerminalIdleResult VkResult{ get -> terminalIdleResult }
  internal prop Generation uint64{ get -> generation }

  internal prop HasUnsubmittedRecordedSharedUpload bool{
    get {
      return imageResources.HasUnsubmittedRecordedUpload
        || (pathResources.UploadRecorded && !pathResources.UploadSubmitted)
    }
  }

  internal func EnqueueGraphicsSubmission(mailbox VulkanQueueMailbox,
    validate Action[uint64]) bool{
      if Object.ReferenceEquals(validate, nil) { throw ArgumentNullException("validate") }
      if disposed {
        throw ObjectDisposedException("VulkanSharedRuntime")
      }
      if deviceLost {
        throw InvalidOperationException("Vulkan shared runtime device is lost")
      }
      if terminal {
        throw InvalidOperationException("Vulkan shared runtime is terminal after idle failure")
      }
      return queueWorker.EnqueueSubmit(mailbox, validate)
    }

  internal func DrainAcquiredSemaphore(semaphore VkSemaphore) VkResult {
    if semaphore == 0uL {
      throw ArgumentException("semaphore")
    }
    if disposed {
      return VkConstants.VK_ERROR_INITIALIZATION_FAILED
    }
    if deviceLost {
      return VkConstants.VK_ERROR_DEVICE_LOST
    }
    if terminal {
      return terminalIdleResult
    }
    let mailbox = queueWorker.CreateMailbox(nil)
    mailbox.PrepareSubmit(nint(0), semaphore, 0uL)
    if !mailbox.BeginSubmit() {
      throw InvalidOperationException("Vulkan acquire drain mailbox was not idle")
    }
    var serial uint64
    while !queueWorker.EnqueueSubmit(mailbox, (value uint64) -> { serial = value }) {
      if disposed {
        mailbox.CancelSubmit()
        return VkConstants.VK_ERROR_INITIALIZATION_FAILED
      }
      if deviceLost {
        mailbox.CancelSubmit()
        return VkConstants.VK_ERROR_DEVICE_LOST
      }
      if terminal {
        mailbox.CancelSubmit()
        return terminalIdleResult
      }
      Thread.Yield()
    }
    var submitResult VkResult
    while !mailbox.TakeSubmitCompletion(out submitResult) {
      Thread.Yield()
    }
    mailbox.ResetSubmitCompletion()
    if submitResult != VkConstants.VK_SUCCESS {
      if submitResult == VkConstants.VK_ERROR_DEVICE_LOST {
        MarkDeviceLost()
      }
      return submitResult
    }
    return WaitGraphicsSubmission(serial, VkConstants.VK_WHOLE_SIZE)
  }

  internal func GetCompletedGraphicsSubmissionSerial(out value uint64) VkResult {
    value = 0uL
    if disposed {
      return VkConstants.VK_ERROR_INITIALIZATION_FAILED
    }
    if deviceLost {
      return VkConstants.VK_ERROR_DEVICE_LOST
    }
    if terminal {
      return terminalIdleResult
    }
    let getCounter = dispatch.vkGetSemaphoreCounterValue
    let result = getCounter(device, graphicsTimeline, &value)
    if result == VkConstants.VK_ERROR_DEVICE_LOST {
      MarkDeviceLost()
    }
    return result
  }

  internal func PollGraphicsSubmission(serial uint64) VkResult {
    if serial == 0uL { throw ArgumentOutOfRangeException("serial") }
    let result = GetCompletedGraphicsSubmissionSerial(out var completed)
    if result != VkConstants.VK_SUCCESS { return result }
    return if completed >= serial { VkConstants.VK_SUCCESS } else { VkConstants.VK_NOT_READY }
  }

  internal func WaitGraphicsSubmission(serial uint64, timeout uint64) VkResult {
    if serial == 0uL { throw ArgumentOutOfRangeException("serial") }
    if disposed { return VkConstants.VK_ERROR_INITIALIZATION_FAILED }
    if deviceLost { return VkConstants.VK_ERROR_DEVICE_LOST }
    if terminal { return terminalIdleResult }
    var semaphore = graphicsTimeline
    var value = serial
    var waitInfo = VkSemaphoreWaitInfo{
      sType: VkConstants.VK_STRUCTURE_TYPE_SEMAPHORE_WAIT_INFO,
      pNext: nil,
      flags: 0u,
      semaphoreCount: 1u,
      pSemaphores: &semaphore,
      pValues: &value,
    }
    let waitSemaphores = dispatch.vkWaitSemaphores
    let result = waitSemaphores(device, &waitInfo, timeout)
    if result == VkConstants.VK_ERROR_DEVICE_LOST { MarkDeviceLost() }
    return result
  }

  private func AcquireLease() VulkanSharedLease {
    if disposed {
      throw ObjectDisposedException("VulkanSharedRuntime")
    }
    if deviceLost {
      throw InvalidOperationException("Vulkan shared runtime device is lost")
    }
    if terminal {
      throw InvalidOperationException("Vulkan shared runtime is terminal after idle failure")
    }
    if references == Int32.MaxValue {
      throw OverflowException("Vulkan shared runtime reference count overflow")
    }
    references = references + 1
    return VulkanSharedLease(this)
  }

  private func ReleaseLeaseCore(alreadyIdle bool) bool {
    if disposed {
      return false
    }
    if references <= 0 {
      throw InvalidOperationException("Vulkan shared runtime lease count is invalid")
    }
    references = references - 1
    if references == 0 {
      DisposeWithIdleState(alreadyIdle)
      if disposed {
        current = nil
        return true
      }
      return false
    }
    return false
  }

  internal func ReleaseLease() bool -> ReleaseLeaseCore(false)

  internal func ReleaseLeaseAfterIdle() bool -> ReleaseLeaseCore(true)

  internal func AbandonLeaseAfterDeviceLoss() {
    if disposed {
      return
    }
    if references <= 0 {
      throw InvalidOperationException("Vulkan shared runtime lease count is invalid")
    }
    references = references - 1
  }

  internal func MarkDeviceLost() {
    if !disposed {
      deviceLost = true
      queueWorker.MarkFaulted()
    }
  }

  internal func QuiesceQueueAfterDeviceLoss() {
    queueWorker.QuiesceAfterDeviceLoss()
  }

  internal func MarkTeardownFailed(result VkResult) {
    if disposed {
      return
    }
    terminal = true
    terminalIdleResult = result
    terminalFailure = true
    terminalFailureResult = result
    queueWorker.MarkFaulted()
    VulkanSharedRuntime.DisposeRetainedLogicalImageIdentityRegistry()
    if result == VkConstants.VK_ERROR_DEVICE_LOST {
      deviceLost = true
    }
  }

  internal func WaitDeviceIdleResult() VkResult {
    Interlocked.Increment(ref testDeviceIdleCallCount)
    if terminal {
      return terminalIdleResult
    }
    if deviceLost {
      return VkConstants.VK_ERROR_DEVICE_LOST
    }
    if VulkanSharedRuntime.TakeTestDeviceIdleFailure() {
      MarkDeviceLost()
      return VkConstants.VK_ERROR_DEVICE_LOST
    }
    if disposed || device == nint(0) || deviceWaitIdleAddress == nint(0) {
      return VkConstants.VK_ERROR_INITIALIZATION_FAILED
    }
    let nullable = deviceWaitIdleAddress as (unmanaged[Cdecl](VkDevice) -> VkResult)?
    if nullable == nil {
      return VkConstants.VK_ERROR_INITIALIZATION_FAILED
    }
    let deviceWaitIdleFunction = nullable
    let result = deviceWaitIdleFunction(device)
    if result == VkConstants.VK_ERROR_DEVICE_LOST {
      MarkDeviceLost()
    }
    return result
  }

  internal func WaitDeviceIdle() bool -> WaitDeviceIdleResult() == VkConstants.VK_SUCCESS

  private func DisposeWithIdleState(alreadyIdle bool) {
    if disposed || terminal {
      return
    }
    var idleResult VkResult = VkConstants.VK_SUCCESS
    if !alreadyIdle {
      idleResult = WaitDeviceIdleResult()
    }
    if idleResult != VkConstants.VK_SUCCESS {
      MarkTeardownFailed(idleResult)
      return
    }
    disposed = true
    try { queueWorker.Dispose() } catch (cleanup Exception) { }
    try { pathResources.Collect(uint64.MaxValue) } catch (cleanup Exception) { }
    try { pathResources.Dispose() } catch (cleanup Exception) { }
    if let currentDiagnostics = diagnostics {
      currentDiagnostics.ClearPathAtlasCurrentState()
    }
    try { primitiveState.Dispose() } catch (cleanup Exception) { }
    try { pipelineCache.Dispose() } catch (cleanup Exception) { }
    try { imageResources.Collect(uint64.MaxValue) } catch (cleanup Exception) { }
    try { imageResources.Dispose() } catch (cleanup Exception) { }
    try { imageIdentityRegistry.Dispose() } catch (cleanup Exception) { }
    if Object.ReferenceEquals(logicalImageIdentityRegistry, imageIdentityRegistry) {
      logicalImageIdentityRegistry = nil
    }
    try { pathIdentityRegistry.Dispose() } catch (cleanup Exception) { }
    if Object.ReferenceEquals(logicalPathIdentityRegistry, pathIdentityRegistry) {
      logicalPathIdentityRegistry = nil
    }
    try { memoryAllocator.Dispose() } catch (cleanup Exception) { }
    DestroyNativeResources()
  }

  internal func DisposeAfterDeviceLoss() {
    if disposed {
      return
    }
    disposed = true
    references = 0
    try { queueWorker.Dispose() } catch (cleanup Exception) { }
    try { pathResources.DisposeAfterDeviceLoss() } catch (cleanup Exception) { }
    if let currentDiagnostics = diagnostics {
      currentDiagnostics.ClearPathAtlasCurrentState()
    }
    try { primitiveState.Dispose() } catch (cleanup Exception) { }
    try { pipelineCache.DisposeAfterDeviceLoss() } catch (cleanup Exception) { }
    try { imageResources.DisposeAfterDeviceLoss() } catch (cleanup Exception) { }
    try { memoryAllocator.Dispose() } catch (cleanup Exception) { }
    DestroyNativeResources()
  }

  private func DestroyNativeResources() {
    if graphicsTimeline != 0uL {
      let destroySemaphore = dispatch.vkDestroySemaphore
      try { destroySemaphore(device, graphicsTimeline, nil) } catch (cleanup Exception) { }
      if let accounting = sharedObjectAccounting {
        try { accounting.Release() } catch (cleanup Exception) { }
      }
    }
    if device != nint(0) && deviceDestroyAvailable {
      let destroyDevice = dispatch.vkDestroyDevice
      destroyDevice(device, nil)
      if let accounting = sharedObjectAccounting {
        accounting.Release()
      }
    }
    if validationMessengerCreated && instance != nint(0)
      && instanceDispatch.vkDestroyDebugUtilsMessengerEXT != nil {
        let destroyMessenger = instanceDispatch.vkDestroyDebugUtilsMessengerEXT
        destroyMessenger(instance, validationMessenger, nil)
        if let accounting = sharedObjectAccounting {
          accounting.Release()
        }
      }
    if instance != nint(0) && instanceDestroyAvailable {
      let destroyInstance = instanceDispatch.vkDestroyInstance
      destroyInstance(instance, nil)
      if let accounting = sharedObjectAccounting {
        accounting.Release()
      }
    }
    if let currentValidation = validation {
      currentValidation.KeepAlive()
    }
  }

  public func Dispose() {
    DisposeWithIdleState(false)
  }

}

internal unsafe sealed class VulkanSharedLease : IDisposable {
  private let owner VulkanSharedRuntime
  private var disposed bool

  internal init(nativeOwner VulkanSharedRuntime) {
    owner = nativeOwner
  }

  internal prop Instance VkInstance{ get -> owner.Instance }
  internal prop InstanceDispatch VkInstanceDispatch{ get -> owner.InstanceDispatch }
  internal prop PhysicalDevice VkPhysicalDevice{ get -> owner.PhysicalDevice }
  internal prop Device VkDevice{ get -> owner.Device }
  internal prop Dispatch VkDeviceDispatch{ get -> owner.Dispatch }
  internal prop GraphicsQueue VkQueue{ get -> owner.GraphicsQueue }
  internal prop PresentQueue VkQueue{ get -> owner.PresentQueue }
  internal prop GraphicsTimeline VkSemaphore{ get -> owner.GraphicsTimeline }
  internal prop QueueWorker VulkanQueueWorker{ get -> owner.QueueWorker }
  internal prop GraphicsFamilyIndex uint32{ get -> owner.GraphicsFamilyIndex }
  internal prop PresentFamilyIndex uint32{ get -> owner.PresentFamilyIndex }
  internal prop DeviceWaitIdleAddress nint{ get -> owner.DeviceWaitIdleAddress }
  internal prop InstanceMaintenanceVariant VulkanSwapchainMaintenanceVariant{
    get -> owner.InstanceMaintenanceVariant
  }
  internal prop SwapchainMaintenanceVariant VulkanSwapchainMaintenanceVariant{
    get -> owner.SwapchainMaintenanceVariant
  }
  internal prop Facts VulkanSharedDeviceFacts{ get -> owner.Facts }
  internal prop MaxStorageBufferRange VkDeviceSize{ get -> owner.MaxStorageBufferRange }
  internal prop ResourcePolicy VulkanResourcePolicy{ get -> owner.ResourcePolicy }
  internal prop MemoryAllocator VulkanMemoryAllocator{ get -> owner.MemoryAllocator }
  internal prop ImageResources VulkanImageResources{ get -> owner.ImageResources }
  internal prop PipelineCache VulkanPipelineCache{ get -> owner.PipelineCache }
  internal prop PrimitiveState VulkanSharedPrimitiveState{ get -> owner.PrimitiveState }
  internal prop ImageIdentityRegistry VulkanImageIdentityRegistry{
    get -> owner.ImageIdentityRegistry
  }
  internal prop PathResources VulkanPathResources{ get -> owner.PathResources }
  internal prop PathIdentityRegistry VulkanPathIdentityRegistry{
    get -> owner.PathIdentityRegistry
  }
  internal prop ObjectAccounting VulkanObjectAccounting? { get -> owner.ObjectAccounting }
  internal prop Diagnostics VulkanDiagnostics? { get -> owner.Diagnostics }
  internal prop DebugUtilsEnabled bool{ get -> owner.DebugUtilsEnabled }
  internal prop DeviceLost bool{ get -> owner.DeviceLost }
  internal prop Terminal bool{ get -> owner.Terminal }
  internal prop TerminalIdleResult VkResult{ get -> owner.TerminalIdleResult }
  internal prop Generation uint64{ get -> owner.Generation }
  internal prop HasUnsubmittedRecordedSharedUpload bool{
    get -> owner.HasUnsubmittedRecordedSharedUpload
  }

  internal func EnqueueGraphicsSubmission(mailbox VulkanQueueMailbox,
    validate Action[uint64]) bool -> owner.EnqueueGraphicsSubmission(mailbox, validate)

  internal func DrainAcquiredSemaphore(semaphore VkSemaphore) VkResult ->
  owner.DrainAcquiredSemaphore(semaphore)

  internal func GetCompletedGraphicsSubmissionSerial(out value uint64) VkResult ->
  owner.GetCompletedGraphicsSubmissionSerial(out value)

  internal func PollGraphicsSubmission(serial uint64) VkResult ->
  owner.PollGraphicsSubmission(serial)

  internal func WaitGraphicsSubmission(serial uint64, timeout uint64) VkResult ->
  owner.WaitGraphicsSubmission(serial, timeout)

  internal func MarkDeviceLost() {
    owner.MarkDeviceLost()
  }

  internal func QuiesceQueueAfterDeviceLoss() {
    owner.QuiesceQueueAfterDeviceLoss()
  }

  internal func MarkTeardownFailed(result VkResult) {
    owner.MarkTeardownFailed(result)
  }

  internal func WaitDeviceIdle() bool -> owner.WaitDeviceIdle()

  internal func WaitDeviceIdleResult() VkResult -> owner.WaitDeviceIdleResult()

  private func ReleaseCore(alreadyIdle bool) bool {
    if disposed {
      return false
    }
    disposed = true
    if alreadyIdle {
      return owner.ReleaseLeaseAfterIdle()
    }
    return owner.ReleaseLease()
  }

  internal func Release() bool -> ReleaseCore(false)

  internal func ReleaseAfterIdle() bool -> ReleaseCore(true)

  internal func AbandonAfterDeviceLoss() {
    if disposed {
      return
    }
    disposed = true
    owner.AbandonLeaseAfterDeviceLoss()
  }

  public func Dispose() {
    Release()
  }
}
