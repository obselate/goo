package Goo

import System
import System.Runtime.InteropServices

@StructLayout(LayoutKind.Sequential)
internal unsafe struct VkExportMemoryAllocateInfo {
    var sType int32
    var pNext * void
    var handleTypes uint32
}

@StructLayout(LayoutKind.Sequential)
internal unsafe struct VkMemoryGetFdInfoKHR {
    var sType int32
    var pNext * void
    var memory VkDeviceMemory
    var handleType uint32
}

@StructLayout(LayoutKind.Sequential)
internal unsafe struct VkExportSemaphoreCreateInfo {
    var sType int32
    var pNext * void
    var handleTypes uint32
}

@StructLayout(LayoutKind.Sequential)
internal unsafe struct VkSemaphoreGetFdInfoKHR {
    var sType int32
    var pNext * void
    var semaphore VkSemaphore
    var handleType uint32
}

internal unsafe partial class VulkanWindowTarget {
    internal func CreateExternalProducerForProof(timeline bool, dma bool = false, syncFd bool = false) VulkanExternalProducer {
        let savedDevice = device
        let savedDispatch = dispatch
        let savedIdle = deviceWaitIdleAddress
        SdlRuntime.Acquire()
        if !SdlRuntime.AcquireVulkan() {
            SdlRuntime.Release()
            throw InvalidOperationException("External producer loader acquisition failed")
        }
        guard let lease = VulkanSharedRuntime.TryAcquire() else {
            SdlRuntime.ReleaseVulkan()
            SdlRuntime.Release()
            throw InvalidOperationException("External producer runtime is unavailable")
        }
        var transferred bool = false
        try {
            CreateDevice()
            LoadDeviceDispatch()
            let getFd = ResolveDeviceProc("vkGetMemoryFdKHR") as (unmanaged[Cdecl](VkDevice, *VkMemoryGetFdInfoKHR, *int32) -> VkResult)?
            if getFd == nil { throw NotSupportedException("External memory FD export is unavailable") }
            let semaphoreFd = if timeline || syncFd { ResolveDeviceProc("vkGetSemaphoreFdKHR") } else { nint(0) }
            let signal = if syncFd { ResolveDeviceProc("vkSignalSemaphore") } else { nint(0) }
            let layout = if dma { ResolveDeviceProc("vkGetImageSubresourceLayout") } else { nint(0) }
            let producer = VulkanExternalProducer(device, dispatch, instanceDispatch, physicalDevice,
                queueFamilyIndex, getFd, semaphoreFd, lease, sharedObjectAccounting, dma, syncFd, signal, layout)
            transferred = true
            try {
                producer.Initialize()
                return producer
            } catch (error Exception) {
                producer.Dispose()
                throw error
            }
        } finally {
            if !transferred && device != savedDevice {
                let destroyDevice = savedDispatch.vkDestroyDevice
                destroyDevice(device, nil)
                sharedObjectAccounting?.Release()
            }
            device = savedDevice
            dispatch = savedDispatch
            deviceWaitIdleAddress = savedIdle
            if !transferred {
                lease.Release()
                SdlRuntime.ReleaseVulkan()
                SdlRuntime.Release()
            }
        }
    }
}

internal unsafe sealed partial class VulkanExternalProducer : IDisposable {
    private let device VkDevice
    private let dispatch VkDeviceDispatch
    private let runtime VulkanSharedLease
    private let accounting VulkanObjectAccounting?
    private let getFd unmanaged[Cdecl](VkDevice, *VkMemoryGetFdInfoKHR, *int32) -> VkResult
    private let family uint32
    private var memoryProperties VkPhysicalDeviceMemoryProperties
    private var image VkImage
    private var memory VkDeviceMemory
    private var staging VkBuffer
    private var stagingMemory VkDeviceMemory
    private var pool VkCommandPool
    private var command VkCommandBuffer
    private var completion VkSemaphore
    private var queue VkQueue
    private var allocationSize uint64
    private var memoryType uint32
    private var handle ExternalNativeHandle?
    private var semaphoreHandle ExternalNativeHandle?
    private let semaphoreFdAddress nint
    private var submitted bool
    private var disposed bool

    internal init(nativeDevice VkDevice, nativeDispatch VkDeviceDispatch, instanceDispatch VkInstanceDispatch,
        physical VkPhysicalDevice, queueFamily uint32,
        nativeGetFd unmanaged[Cdecl](VkDevice, *VkMemoryGetFdInfoKHR, *int32) -> VkResult, semaphoreFd nint,
        sharedRuntime VulkanSharedLease, nativeAccounting VulkanObjectAccounting?,
        useDma bool, useSyncFd bool, nativeSignal nint, nativeLayout nint) {
        device = nativeDevice
        dispatch = nativeDispatch
        family = queueFamily
        getFd = nativeGetFd
        semaphoreFdAddress = semaphoreFd
        runtime = sharedRuntime
        accounting = nativeAccounting
        dma = useDma
        syncFd = useSyncFd
        signalAddress = nativeSignal
        layoutAddress = nativeLayout
        ReadProperties(instanceDispatch, physical)
    }

    private func ReadProperties(instanceDispatch VkInstanceDispatch, physical VkPhysicalDevice) {
        let getProperties = instanceDispatch.vkGetPhysicalDeviceMemoryProperties
        var properties = VkPhysicalDeviceMemoryProperties{}
        getProperties(physical, &properties)
        memoryProperties = properties
    }

    internal func Initialize() {
        let getQueue = dispatch.vkGetDeviceQueue
        getQueue(device, family, 0u, &queue)
        CreateImage()
        CreateStaging()
        Record()
    }

    private func Check(result VkResult) {
        if result != VkConstants.VK_SUCCESS { throw InvalidOperationException("External producer Vulkan result " + int32(result).ToString()) }
    }

    private func CreateImage() {
        let handleType = if dma { 0x200u } else { 1u }
        var external = VkExternalMemoryImageCreateInfo{ sType: 1000072001, handleTypes: handleType }
        var modifier uint64 = 0uL
        var modifierInfo = VkImageDrmFormatModifierListCreateInfoEXT{ sType: 1000158003,
            pNext: *void(&external), drmFormatModifierCount: 1u, pDrmFormatModifiers: &modifier }
        var info = VkImageCreateInfo{ sType: VkConstants.VK_STRUCTURE_TYPE_IMAGE_CREATE_INFO,
            pNext: *void(&external), imageType: VkConstants.VK_IMAGE_TYPE_2D,
            format: VkConstants.VK_FORMAT_R8G8B8A8_UNORM,
            extent: VkExtent3D{ width: 8u, height: 4u, depth: 1u }, mipLevels: 1u, arrayLayers: 1u,
            samples: VkConstants.VK_SAMPLE_COUNT_1_BIT, tiling: if dma { 1000158000 } else { VkConstants.VK_IMAGE_TILING_OPTIMAL },
            usage: uint32(VkConstants.VK_IMAGE_USAGE_SAMPLED_BIT) | uint32(VkConstants.VK_IMAGE_USAGE_TRANSFER_DST_BIT),
            sharingMode: VkConstants.VK_SHARING_MODE_EXCLUSIVE }
        if dma { info.pNext = *void(&modifierInfo) }
        let create = dispatch.vkCreateImage
        Check(create(device, &info, nil, &image))
        var requirements = VkMemoryRequirements2{ sType: VkConstants.VK_STRUCTURE_TYPE_MEMORY_REQUIREMENTS_2 }
        var request = VkImageMemoryRequirementsInfo2{ sType: VkConstants.VK_STRUCTURE_TYPE_IMAGE_MEMORY_REQUIREMENTS_INFO_2, image: image }
        let getRequirements = dispatch.vkGetImageMemoryRequirements2
        getRequirements(device, &request, &requirements)
        memoryType = 32u
        for index in 0 ... int32(memoryProperties.memoryTypeCount) {
            if (requirements.memoryRequirements.memoryTypeBits & (1u << index)) != 0u {
                memoryType = uint32(index)
                break
            }
        }
        if memoryType == 32u { throw InvalidOperationException("External producer memory type is unavailable") }
        allocationSize = requirements.memoryRequirements.size
        var dedicated = VkMemoryDedicatedAllocateInfo{ sType: VkConstants.VK_STRUCTURE_TYPE_MEMORY_DEDICATED_ALLOCATE_INFO, image: image }
        var exportInfo = VkExportMemoryAllocateInfo{ sType: 1000072002, pNext: *void(&dedicated), handleTypes: handleType }
        var allocation = VkMemoryAllocateInfo{ sType: VkConstants.VK_STRUCTURE_TYPE_MEMORY_ALLOCATE_INFO,
            pNext: *void(&exportInfo), allocationSize: allocationSize, memoryTypeIndex: memoryType }
        let allocate = dispatch.vkAllocateMemory
        Check(allocate(device, &allocation, nil, &memory))
        var bindInfo = VkBindImageMemoryInfo{ sType: VkConstants.VK_STRUCTURE_TYPE_BIND_IMAGE_MEMORY_INFO, image: image, memory: memory }
        let bind = dispatch.vkBindImageMemory2
        Check(bind(device, 1u, &bindInfo))
        if dma { ReadDmaLayout() }
        var exportFd = VkMemoryGetFdInfoKHR{ sType: 1000074002, memory: memory, handleType: handleType }
        var fd int32 = -1
        Check(getFd(device, &exportFd, &fd))
        handle = ExternalNativeHandle(nint(fd), false)
    }

    private func CreateStaging() {
        var info = VkBufferCreateInfo{ sType: VkConstants.VK_STRUCTURE_TYPE_BUFFER_CREATE_INFO,
            size: 128uL, usage: uint32(VkConstants.VK_BUFFER_USAGE_TRANSFER_SRC_BIT),
            sharingMode: VkConstants.VK_SHARING_MODE_EXCLUSIVE }
        let create = dispatch.vkCreateBuffer
        Check(create(device, &info, nil, &staging))
        var request = VkBufferMemoryRequirementsInfo2{ sType: VkConstants.VK_STRUCTURE_TYPE_BUFFER_MEMORY_REQUIREMENTS_INFO_2, buffer: staging }
        var requirements = VkMemoryRequirements2{ sType: VkConstants.VK_STRUCTURE_TYPE_MEMORY_REQUIREMENTS_2 }
        let getRequirements = dispatch.vkGetBufferMemoryRequirements2
        getRequirements(device, &request, &requirements)
        let types = *VkMemoryType(&memoryProperties.memoryTypes_0)
        var hostType uint32 = 32u
        for index in 0 ... int32(memoryProperties.memoryTypeCount) {
            if (requirements.memoryRequirements.memoryTypeBits & (1u << index)) != 0u && (types[index].propertyFlags & 6u) == 6u {
                hostType = uint32(index)
                break
            }
        }
        RequireHostType(hostType)
        var allocation = VkMemoryAllocateInfo{ sType: VkConstants.VK_STRUCTURE_TYPE_MEMORY_ALLOCATE_INFO,
            allocationSize: requirements.memoryRequirements.size, memoryTypeIndex: hostType }
        let allocate = dispatch.vkAllocateMemory
        Check(allocate(device, &allocation, nil, &stagingMemory))
        var bindInfo = VkBindBufferMemoryInfo{ sType: VkConstants.VK_STRUCTURE_TYPE_BIND_BUFFER_MEMORY_INFO,
            buffer: staging, memory: stagingMemory }
        let bind = dispatch.vkBindBufferMemory2
        Check(bind(device, 1u, &bindInfo))
        var mapped * void = nil
        let mapMemory = dispatch.vkMapMemory
        Check(mapMemory(device, stagingMemory, 0uL, 128uL, 0u, *void(&mapped)))
        let pixels = *uint8(mapped)
        for y in 0 ... 4 {
            for x in 0 ... 8 {
                let offset = (y * 8 + x) * 4
                pixels[offset] = if (y < 2 && x < 4) || (y >= 2 && x >= 4) { uint8(255) } else { uint8(0) }
                pixels[offset + 1] = if x >= 4 { uint8(255) } else { uint8(0) }
                pixels[offset + 2] = if y >= 2 && x < 4 { uint8(255) } else { uint8(0) }
                pixels[offset + 3] = uint8(0)
            }
        }
        let unmap = dispatch.vkUnmapMemory
        unmap(device, stagingMemory)
    }

    private func RequireHostType(index uint32) {
        if index == 32u { throw NotSupportedException("External producer needs coherent host-visible staging memory") }
    }

    internal func Description(session ExternalImageSession, format int32 = 0) VulkanExternalImageDescription -> VulkanExternalImageDescription{
        HandleKind: if dma { ExternalImageHandleKind.DmaBuf } else { ExternalImageHandleKind.OpaqueFd }, Memory: handle!!,
        DeviceUuid: session.DeviceUuid, DriverUuid: session.DriverUuid,
        Width: 8, Height: 4, Format: if format == 0 { VkConstants.VK_FORMAT_R8G8B8A8_UNORM } else { format },
        Tiling: if dma { 1000158000 } else { VkConstants.VK_IMAGE_TILING_OPTIMAL }, AllocationSize: allocationSize,
        MemoryTypeIndex: memoryType, DedicatedAllocation: true,
        ImageUsage: uint32(VkConstants.VK_IMAGE_USAGE_SAMPLED_BIT) | uint32(VkConstants.VK_IMAGE_USAGE_TRANSFER_DST_BIT),
        DrmModifier: 0uL, Planes: DescribePlanes(),
    }

    internal prop OriginalHandleOpen bool { get -> handle?.IsClosed == false }

    private func Record() {
        var poolInfo = VkCommandPoolCreateInfo{ sType: VkConstants.VK_STRUCTURE_TYPE_COMMAND_POOL_CREATE_INFO, queueFamilyIndex: family }
        let createPool = dispatch.vkCreateCommandPool
        Check(createPool(device, &poolInfo, nil, &pool))
        var allocation = VkCommandBufferAllocateInfo{ sType: VkConstants.VK_STRUCTURE_TYPE_COMMAND_BUFFER_ALLOCATE_INFO,
            commandPool: pool, level: VkConstants.VK_COMMAND_BUFFER_LEVEL_PRIMARY, commandBufferCount: 1u }
        let allocate = dispatch.vkAllocateCommandBuffers
        Check(allocate(device, &allocation, &command))
        var beginInfo = VkCommandBufferBeginInfo{ sType: VkConstants.VK_STRUCTURE_TYPE_COMMAND_BUFFER_BEGIN_INFO }
        let begin = dispatch.vkBeginCommandBuffer
        Check(begin(command, &beginInfo))
        VulkanTransitions.RecordImage(command, dispatch.vkCmdPipelineBarrier2, image,
            VulkanTransitions.ColorSubresourceRange(), VkConstants.VK_IMAGE_LAYOUT_UNDEFINED,
            VkConstants.VK_IMAGE_LAYOUT_TRANSFER_DST_OPTIMAL, 0uL, 0uL,
            VkConstants.VK_PIPELINE_STAGE_2_TRANSFER_BIT, VkConstants.VK_ACCESS_2_TRANSFER_WRITE_BIT)
        let subresources = VulkanTransitions.ColorSubresourceRange()
        var copy = VkBufferImageCopy{ imageSubresource: VkImageSubresourceLayers{
            aspectMask: uint32(VkConstants.VK_IMAGE_ASPECT_COLOR_BIT), layerCount: 1u },
            imageExtent: VkExtent3D{ width: 8u, height: 4u, depth: 1u } }
        let upload = dispatch.vkCmdCopyBufferToImage
        upload(command, staging, image, VkConstants.VK_IMAGE_LAYOUT_TRANSFER_DST_OPTIMAL, 1u, &copy)
        var barrier = VkImageMemoryBarrier2{ sType: VkConstants.VK_STRUCTURE_TYPE_IMAGE_MEMORY_BARRIER_2,
            srcStageMask: VkConstants.VK_PIPELINE_STAGE_2_TRANSFER_BIT, srcAccessMask: VkConstants.VK_ACCESS_2_TRANSFER_WRITE_BIT,
            oldLayout: VkConstants.VK_IMAGE_LAYOUT_TRANSFER_DST_OPTIMAL, newLayout: VkConstants.VK_IMAGE_LAYOUT_GENERAL,
            srcQueueFamilyIndex: family, dstQueueFamilyIndex: 0xFFFFFFFEu,
            image: image, subresourceRange: subresources }
        var dependency = VkDependencyInfo{ sType: VkConstants.VK_STRUCTURE_TYPE_DEPENDENCY_INFO,
            imageMemoryBarrierCount: 1u, pImageMemoryBarriers: &barrier }
        let pipelineBarrier = dispatch.vkCmdPipelineBarrier2
        pipelineBarrier(command, &dependency)
        let end = dispatch.vkEndCommandBuffer
        Check(end(command))
        var typeInfo = VkSemaphoreTypeCreateInfo{ sType: VkConstants.VK_STRUCTURE_TYPE_SEMAPHORE_TYPE_CREATE_INFO,
            semaphoreType: VkConstants.VK_SEMAPHORE_TYPE_TIMELINE }
        var semaphoreInfo = VkSemaphoreCreateInfo{ sType: VkConstants.VK_STRUCTURE_TYPE_SEMAPHORE_CREATE_INFO, pNext: *void(&typeInfo) }
        var exportSemaphore = VkExportSemaphoreCreateInfo{ sType: 1000077000, handleTypes: 1u }
        if semaphoreFdAddress != nint(0) && !syncFd { typeInfo.pNext = *void(&exportSemaphore) }
        let createSemaphore = dispatch.vkCreateSemaphore
        Check(createSemaphore(device, &semaphoreInfo, nil, &completion))
        if syncFd {
            PrepareSyncFd()
        } else if semaphoreFdAddress != nint(0) {
            let exportFd = semaphoreFdAddress as (unmanaged[Cdecl](VkDevice, *VkSemaphoreGetFdInfoKHR, *int32) -> VkResult)?
            if exportFd == nil { throw InvalidOperationException("External semaphore export is unavailable") }
            var info = VkSemaphoreGetFdInfoKHR{ sType: 1000079001, semaphore: completion, handleType: 1u }
            var fd int32 = -1
            Check(exportFd(device, &info, &fd))
            semaphoreHandle = ExternalNativeHandle(nint(fd), false)
        }
    }

    internal func Ready() ExternalImageSync -> ExternalImageSync{
        Kind: if syncFd { ExternalImageSyncKind.SyncFd } else if semaphoreHandle != nil {
            ExternalImageSyncKind.OpaqueFdSemaphore } else { ExternalImageSyncKind.AlreadyComplete },
        Handle: semaphoreHandle, Timeline: !syncFd && semaphoreHandle != nil, Value: if syncFd { 0uL } else { 1uL },
        ImageLayout: VkConstants.VK_IMAGE_LAYOUT_GENERAL, QueueFamily: 0xFFFFFFFEu,
    }

    private func Submit() {
        var commandInfo = VkCommandBufferSubmitInfo{ sType: VkConstants.VK_STRUCTURE_TYPE_COMMAND_BUFFER_SUBMIT_INFO, commandBuffer: command }
        let signals *VkSemaphoreSubmitInfo = stackalloc[2]VkSemaphoreSubmitInfo
        signals[0] = VkSemaphoreSubmitInfo{ sType: VkConstants.VK_STRUCTURE_TYPE_SEMAPHORE_SUBMIT_INFO,
            semaphore: completion, value: 1uL, stageMask: VkConstants.VK_PIPELINE_STAGE_2_ALL_COMMANDS_BIT }
        signals[1] = VkSemaphoreSubmitInfo{ sType: VkConstants.VK_STRUCTURE_TYPE_SEMAPHORE_SUBMIT_INFO,
            semaphore: readyBinary, stageMask: VkConstants.VK_PIPELINE_STAGE_2_ALL_COMMANDS_BIT }
        var wait = VkSemaphoreSubmitInfo{ sType: VkConstants.VK_STRUCTURE_TYPE_SEMAPHORE_SUBMIT_INFO,
            semaphore: gate, value: 1uL, stageMask: VkConstants.VK_PIPELINE_STAGE_2_ALL_COMMANDS_BIT }
        var submit = VkSubmitInfo2{ sType: VkConstants.VK_STRUCTURE_TYPE_SUBMIT_INFO_2,
            commandBufferInfoCount: 1u, pCommandBufferInfos: &commandInfo,
            signalSemaphoreInfoCount: if syncFd { 2u } else { 1u }, pSignalSemaphoreInfos: signals,
            waitSemaphoreInfoCount: if syncFd { 1u } else { 0u }, pWaitSemaphoreInfos: &wait }
        let queueSubmit = dispatch.vkQueueSubmit2
        Check(queueSubmit(queue, 1u, &submit, 0uL))
        submitted = true
    }

    internal func Complete() {
        if completed { throw InvalidOperationException("External producer was already completed") }
        if syncFd { SignalGate() } else { Submit() }
        WaitCompletion()
    }

    private func WaitCompletion() {
        var value uint64 = 1uL
        var waitInfo = VkSemaphoreWaitInfo{ sType: VkConstants.VK_STRUCTURE_TYPE_SEMAPHORE_WAIT_INFO,
            semaphoreCount: 1u, pSemaphores: &completion, pValues: &value }
        let wait = dispatch.vkWaitSemaphores
        Check(wait(device, &waitInfo, uint64(CompletionTimeoutMilliseconds) * 1000000uL))
        if syncFd && semaphoreHandle?.IsInvalid == false { WaitSyncFd() }
        completed = true
    }

    public func Dispose() {
        if disposed { return }
        if syncFd && submitted && !completed { Complete() }
        disposed = true
        handle?.Dispose()
        semaphoreHandle?.Dispose()
        if device == nint(0) { return }
        DestroySyncFd()
        if completion != 0uL {
            let destroy = dispatch.vkDestroySemaphore
            destroy(device, completion, nil)
        }
        if pool != 0uL {
            let destroy = dispatch.vkDestroyCommandPool
            destroy(device, pool, nil)
        }
        if image != 0uL {
            let destroy = dispatch.vkDestroyImage
            destroy(device, image, nil)
        }
        if memory != 0uL {
            let free = dispatch.vkFreeMemory
            free(device, memory, nil)
        }
        if staging != 0uL {
            let destroy = dispatch.vkDestroyBuffer
            destroy(device, staging, nil)
        }
        if stagingMemory != 0uL {
            let free = dispatch.vkFreeMemory
            free(device, stagingMemory, nil)
        }
        let destroyDevice = dispatch.vkDestroyDevice
        destroyDevice(device, nil)
        accounting?.Release()
        runtime.Release()
        SdlRuntime.ReleaseVulkan()
        SdlRuntime.Release()
    }
}
