package Goo

import System
import System.Threading

/// Imports GPU images for one device generation. Open, import and Dispose require the window owner thread.
public unsafe sealed partial class ExternalImageSession {
    private var commandPool VkCommandPool
    private let releaseCommands []VkCommandBuffer = [FrameCapacity]VkCommandBuffer
    private let releaseMailboxes []VulkanQueueMailbox? = [FrameCapacity]VulkanQueueMailbox?

    private func ReadDeviceIdentity() {
        var identity = VkPhysicalDeviceIDProperties{ sType: 1000071004 }
        var properties = VkPhysicalDeviceProperties2{ sType: 1000059001, pNext: *void(&identity) }
        let getProperties = Runtime.InstanceDispatch.vkGetPhysicalDeviceProperties2
        getProperties(Runtime.PhysicalDevice, &properties)
        for index in 0 ... 16 {
            deviceUuid[index] = identity.deviceUUID[index]
            driverUuid[index] = identity.driverUUID[index]
        }
        if OperatingSystem.IsWindows() && identity.deviceLUIDValid != 0u {
            let luid = [8]uint8
            for index in 0 ... 8 { luid[index] = identity.deviceLUID[index] }
            windowsDevice = ExternalImageWindowsDevice(ReadOnlyMemory[uint8](luid), identity.deviceNodeMask)
        }
    }

    private func ImportReady(frame ExternalFrameLease) ExternalImageStatus {
        let sync = frame.Sync
        if sync.ImageLayout != VkConstants.VK_IMAGE_LAYOUT_GENERAL && sync.ImageLayout != VkConstants.VK_IMAGE_LAYOUT_SHADER_READ_ONLY_OPTIMAL {
            return ExternalImageStatus.UnsupportedSynchronization
        }
        if sync.QueueFamily != 0xFFFFFFFEu
            && (sync.QueueFamily != 0xFFFFFFFDu || !Runtime.Dispatch.ForeignQueueFamily) {
            return ExternalImageStatus.UnsupportedSynchronization
        }
        if sync.Kind == ExternalImageSyncKind.AlreadyComplete {
            frame.Ready = true
            return ExternalImageStatus.Success
        }
        let syncFd = sync.Kind == ExternalImageSyncKind.SyncFd
        if (!syncFd && !sync.Timeline) || (syncFd && (sync.Timeline || sync.Value != 0uL)) {
            return ExternalImageStatus.UnsupportedSynchronization
        }
        let handleType = switch sync.Kind {
            case ExternalImageSyncKind.OpaqueFdSemaphore: 1u
            case ExternalImageSyncKind.SyncFd: 16u
            case ExternalImageSyncKind.OpaqueWin32Semaphore: 2u
            case ExternalImageSyncKind.D3D12Fence: 8u
            default: 0u
        }
        if handleType == 0u || (Runtime.Dispatch.ExternalSemaphoreKinds & handleType) == 0u {
            return ExternalImageStatus.UnsupportedSynchronization
        }
        guard let original = sync.Handle else { throw ArgumentException("A synchronization handle is required", "ready") }
        guard let duplicate = ExternalNativeHandle.Duplicate(original, OperatingSystem.IsWindows()) else {
            return ExternalImageStatus.Failed
        }
        using let handle = duplicate
        let dispatch = Runtime.Dispatch
        var typeInfo = VkSemaphoreTypeCreateInfo{ sType: VkConstants.VK_STRUCTURE_TYPE_SEMAPHORE_TYPE_CREATE_INFO,
            semaphoreType: if syncFd { 0 } else { VkConstants.VK_SEMAPHORE_TYPE_TIMELINE } }
        var externalInfo = VkPhysicalDeviceExternalSemaphoreInfo{ sType: 1000076000, pNext: *void(&typeInfo), handleType: handleType }
        var properties = VkExternalSemaphoreProperties{ sType: 1000076001 }
        let getProperties = Runtime.InstanceDispatch.vkGetPhysicalDeviceExternalSemaphoreProperties
        getProperties(Runtime.PhysicalDevice, &externalInfo, &properties)
        if (properties.externalSemaphoreFeatures & 2u) == 0u { return ExternalImageStatus.UnsupportedSynchronization }
        var semaphore VkSemaphore
        var dependency ExternalNativeHandle?
        var accepted bool = false
        try {
            dependency = ExternalNativeHandle.Duplicate(original, OperatingSystem.IsWindows())
            if dependency == nil { return ExternalImageStatus.Failed }
            var createInfo = VkSemaphoreCreateInfo{ sType: VkConstants.VK_STRUCTURE_TYPE_SEMAPHORE_CREATE_INFO, pNext: *void(&typeInfo) }
            let createSemaphore = dispatch.vkCreateSemaphore
            var result = createSemaphore(Runtime.Device, &createInfo, nil, &semaphore)
            if result != VkConstants.VK_SUCCESS { return ExternalImageStatus.Failed }
            if OperatingSystem.IsWindows() {
                var importInfo = VkImportSemaphoreWin32HandleInfoKHR{ sType: 1000078000, semaphore: semaphore,
                    handleType: handleType, handle: handle.DangerousGetHandle() }
                let importSemaphore = dispatch.vkImportSemaphoreWin32HandleKHR
                result = importSemaphore(Runtime.Device, &importInfo)
            } else {
                var importInfo = VkImportSemaphoreFdInfoKHR{ sType: 1000079000, semaphore: semaphore,
                    flags: if syncFd { 1u } else { 0u }, handleType: handleType, fd: int32(handle.DangerousGetHandle()) }
                let importSemaphore = dispatch.vkImportSemaphoreFdKHR
                result = importSemaphore(Runtime.Device, &importInfo)
                if result == VkConstants.VK_SUCCESS { handle.SetHandleAsInvalid() }
            }
            if result != VkConstants.VK_SUCCESS {
                return if result == VkConstants.VK_ERROR_DEVICE_LOST { ExternalImageStatus.DeviceLost } else { ExternalImageStatus.Failed }
            }
            frame.ReadySemaphore = semaphore
            frame.ReadyHandle = dependency
            accepted = true
            return ExternalImageStatus.Success
        } finally {
            if !accepted {
                dependency?.Dispose()
                if semaphore != 0uL {
                    let destroy = dispatch.vkDestroySemaphore
                    destroy(Runtime.Device, semaphore, nil)
                }
            }
        }
    }

    private func PollReady(frame ExternalFrameLease) VkResult {
        if frame.Ready { return VkConstants.VK_SUCCESS }
        if frame.Sync.Kind == ExternalImageSyncKind.SyncFd {
            let result = ExternalNativeHandle.PollReady(frame.ReadyHandle!!)
            if result == VkConstants.VK_SUCCESS {
                frame.ReadyHandle!!.Dispose()
                frame.ReadyHandle = nil
            }
            return result
        }
        var value uint64
        let counter = Runtime.Dispatch.vkGetSemaphoreCounterValue
        let result = counter(Runtime.Device, frame.ReadySemaphore, &value)
        if result == VkConstants.VK_SUCCESS && value >= frame.Sync.Value {
            frame.ReadyHandle?.Dispose()
            frame.ReadyHandle = nil
        }
        return if result != VkConstants.VK_SUCCESS { result } else if value >= frame.Sync.Value {
            VkConstants.VK_SUCCESS
        } else { VkConstants.VK_NOT_READY }
    }

    private func CreateReleaseCommands() {
        let dispatch = Runtime.Dispatch
        var poolInfo = VkCommandPoolCreateInfo{ sType: VkConstants.VK_STRUCTURE_TYPE_COMMAND_POOL_CREATE_INFO,
            flags: uint32(VkConstants.VK_COMMAND_POOL_CREATE_RESET_COMMAND_BUFFER_BIT), queueFamilyIndex: Runtime.GraphicsFamilyIndex }
        let create = dispatch.vkCreateCommandPool
        if create(Runtime.Device, &poolInfo, nil, &commandPool) != VkConstants.VK_SUCCESS {
            throw InvalidOperationException("External release command pool creation failed")
        }
        var allocation = VkCommandBufferAllocateInfo{ sType: VkConstants.VK_STRUCTURE_TYPE_COMMAND_BUFFER_ALLOCATE_INFO,
            commandPool: commandPool, level: VkConstants.VK_COMMAND_BUFFER_LEVEL_PRIMARY, commandBufferCount: uint32(FrameCapacity) }
        let allocate = dispatch.vkAllocateCommandBuffers
        fixed commands *VkCommandBuffer = releaseCommands {
            if allocate(Runtime.Device, &allocation, commands) != VkConstants.VK_SUCCESS {
                DestroyReleaseCommands()
                throw InvalidOperationException("External release command allocation failed")
            }
        }
        for index in 0 ... FrameCapacity { releaseMailboxes[index] = VulkanQueueMailbox(nil) }
    }

    private func DestroyReleaseCommands() {
        if commandPool == 0uL { return }
        let destroy = Runtime.Dispatch.vkDestroyCommandPool
        destroy(Runtime.Device, commandPool, nil)
        commandPool = 0uL
    }

    private func RecordRelease(index int32, frame ExternalFrameLease) {
        let dispatch = Runtime.Dispatch
        let command = releaseCommands[index]
        let reset = dispatch.vkResetCommandBuffer
        CheckRelease(reset(command, 0u))
        var beginInfo = VkCommandBufferBeginInfo{ sType: VkConstants.VK_STRUCTURE_TYPE_COMMAND_BUFFER_BEGIN_INFO,
            flags: uint32(VkConstants.VK_COMMAND_BUFFER_USAGE_ONE_TIME_SUBMIT_BIT) }
        let begin = dispatch.vkBeginCommandBuffer
        CheckRelease(begin(command, &beginInfo))
        RecordOwnership(command, dispatch, frame, Runtime.GraphicsFamilyIndex, false)
        let end = dispatch.vkEndCommandBuffer
        CheckRelease(end(command))
    }

    private func CheckRelease(result VkResult) {
        if result != VkConstants.VK_SUCCESS { throw System.Runtime.InteropServices.ExternalException("External release recording failed", int32(result)) }
    }

    shared {
    internal func RecordOwnership(command VkCommandBuffer, dispatch VkDeviceDispatch,
        frame ExternalFrameLease, family uint32, acquire bool) {
        var barrier = VkImageMemoryBarrier2{
            sType: VkConstants.VK_STRUCTURE_TYPE_IMAGE_MEMORY_BARRIER_2,
            srcStageMask: if acquire { 0uL } else { VkConstants.VK_PIPELINE_STAGE_2_FRAGMENT_SHADER_BIT },
            srcAccessMask: if acquire { 0uL } else { VkConstants.VK_ACCESS_2_SHADER_SAMPLED_READ_BIT },
            dstStageMask: if acquire { VkConstants.VK_PIPELINE_STAGE_2_FRAGMENT_SHADER_BIT } else { 0uL },
            dstAccessMask: if acquire { VkConstants.VK_ACCESS_2_SHADER_SAMPLED_READ_BIT } else { 0uL },
            oldLayout: if acquire { frame.Sync.ImageLayout } else { VkConstants.VK_IMAGE_LAYOUT_SHADER_READ_ONLY_OPTIMAL },
            newLayout: if acquire { VkConstants.VK_IMAGE_LAYOUT_SHADER_READ_ONLY_OPTIMAL } else { frame.Sync.ImageLayout },
            srcQueueFamilyIndex: if acquire { frame.Sync.QueueFamily } else { family },
            dstQueueFamilyIndex: if acquire { family } else { frame.Sync.QueueFamily },
            image: frame.Image.Native.Image, subresourceRange: VulkanTransitions.ColorSubresourceRange(),
        }
        var dependency = VkDependencyInfo{ sType: VkConstants.VK_STRUCTURE_TYPE_DEPENDENCY_INFO,
            imageMemoryBarrierCount: 1u, pImageMemoryBarriers: &barrier }
        let record = dispatch.vkCmdPipelineBarrier2
        record(command, &dependency)
    }
    }

    private func ReleaseFrame(index int32, frame ExternalFrameLease) bool {
        if frame.Acquired {
            if !frame.ReleaseQueued {
                if Runtime.PollGraphicsSubmission(frame.LastUse) == VkConstants.VK_NOT_READY { return false }
                RecordRelease(index, frame)
                let mailbox = releaseMailboxes[index]!!
                mailbox.PrepareSubmit(releaseCommands[index], 0uL, 0uL)
                if !mailbox.BeginSubmit() { throw InvalidOperationException("External release mailbox is not idle") }
                if !Runtime.EnqueueGraphicsSubmission(mailbox, (serial uint64) -> { frame.ReleaseSerial = serial }) {
                    mailbox.CancelSubmit()
                    return false
                }
                frame.ReleaseQueued = true
                return false
            }
            let mailbox = releaseMailboxes[index]!!
            if !mailbox.TakeSubmitCompletion(out var submitted) { return false }
            if submitted != VkConstants.VK_SUCCESS {
                Runtime.MarkDeviceLost()
                return false
            }
            if Runtime.PollGraphicsSubmission(frame.ReleaseSerial) != VkConstants.VK_SUCCESS { return false }
            mailbox.ResetSubmitCompletion()
        }
        FinishFrame(index, frame, if frame.Sampled { ExternalFrameStatus.Released } else { ExternalFrameStatus.Dropped })
        return true
    }

    private func FinishFrame(index int32, frame ExternalFrameLease, status ExternalFrameStatus) {
        if frame.Terminal { return }
        Runtime.ImageResources.ReleaseExternalFrame()
        frame.Terminal = true
        let dependency = if !frame.Ready { frame.ReadyHandle } else { nil }
        if dependency == nil { frame.ReadyHandle?.Dispose() }
        frame.ReadyHandle = nil
        frames[index] = nil
        if frame.ReadySemaphore != 0uL {
            let destroy = Runtime.Dispatch.vkDestroySemaphore
            destroy(Runtime.Device, frame.ReadySemaphore, nil)
            frame.ReadySemaphore = 0uL
        }
        frame.Image.Native.Busy = false
        if frame.Image.Native.Closed { frame.Image.Native.Dispose() }
        try {
            frame.Released(ExternalFrameResult(status, dependency, if dependency != nil { frame.Sync.Value } else { 0uL }))
        } catch (error Exception) { callbackError ??= error }
    }

    private func CloseFrames(status ExternalImageStatus) {
        var lost = status == ExternalImageStatus.DeviceLost || Runtime.DeviceLost
        if lost { Runtime.QuiesceQueueAfterDeviceLoss() }
        if !lost {
            let serial = Runtime.QueueWorker.LastEnqueuedGraphicsSubmissionSerial
            if serial != 0uL { CheckRelease(Runtime.WaitGraphicsSubmission(serial, uint64.MaxValue)) }
            VulkanDeviceRecoveryCoordinator.ServiceExternalImageCompletions()
        }
        Runtime.ImageResources.RemoveExternalSession(this, lost)
        for index in 0 ... FrameCapacity {
            guard let frame = frames[index] else { continue }
            if !lost && frame.Acquired {
                while !ReleaseFrame(index, frame) {
                    if Runtime.DeviceLost {
                        lost = true
                        Runtime.QuiesceQueueAfterDeviceLoss()
                        FinishFrame(index, frame, ExternalFrameStatus.DeviceLost)
                        break
                    }
                    Thread.Yield()
                }
            } else {
                FinishFrame(index, frame, if lost { ExternalFrameStatus.DeviceLost } else { ExternalFrameStatus.Closed })
            }
        }
    }
}
