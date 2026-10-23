package Goo

import System
import System.Collections.Generic
import System.Runtime.InteropServices

internal unsafe partial class VulkanWindowTarget {
    private const ExternalExtensionCount int32 = 6
    private const DeviceExtensionCapacity int32 = 4 + ExternalExtensionCount
    private var externalMemoryExtension string = ""
    private var externalSemaphoreExtension string = ""
    private var externalDmaExtension string = ""
    private var externalModifierExtension string = ""
    private var externalForeignExtension string = ""
    private var externalAndroidExtension string = ""
    private var samplerYcbcrSupported bool
    private var maintenance6Supported bool
    private var formatModifierQueryAvailable bool
    private var externalSessions List[ExternalImageSession]?
    private var externalCloseError Exception?

    private func DiscoverExternalExtension(extension *VkExtensionProperties) {
        let memoryName = if OperatingSystem.IsWindows() { "VK_KHR_external_memory_win32" } else { "VK_KHR_external_memory_fd" }
        let semaphoreName = if OperatingSystem.IsWindows() { "VK_KHR_external_semaphore_win32" } else { "VK_KHR_external_semaphore_fd" }
        if !OperatingSystem.IsWindows() && !OperatingSystem.IsLinux() && !OperatingSystem.IsAndroid() { return }
        if ExtensionNameEquals(extension, memoryName) { externalMemoryExtension = memoryName }
        if ExtensionNameEquals(extension, semaphoreName) { externalSemaphoreExtension = semaphoreName }
        if OperatingSystem.IsLinux() {
            if ExtensionNameEquals(extension, "VK_EXT_external_memory_dma_buf") { externalDmaExtension = "VK_EXT_external_memory_dma_buf" }
            if ExtensionNameEquals(extension, "VK_EXT_image_drm_format_modifier") { externalModifierExtension = "VK_EXT_image_drm_format_modifier" }
            if ExtensionNameEquals(extension, "VK_EXT_queue_family_foreign") { externalForeignExtension = "VK_EXT_queue_family_foreign" }
        }
        if OperatingSystem.IsAndroid() {
            if ExtensionNameEquals(extension, "VK_ANDROID_external_memory_android_hardware_buffer") {
                externalAndroidExtension = "VK_ANDROID_external_memory_android_hardware_buffer"
            }
            if ExtensionNameEquals(extension, "VK_EXT_queue_family_foreign") { externalForeignExtension = "VK_EXT_queue_family_foreign" }
            if ExtensionNameEquals(extension, "VK_KHR_maintenance6") { maintenance6Supported = true }
        }
    }

    private func ResolveExternalInstanceDispatch() {
        let properties = ResolveGlobalProc(instance, "vkGetPhysicalDeviceProperties2") as (unmanaged[Cdecl](VkPhysicalDevice, *VkPhysicalDeviceProperties2) -> void)?
        if properties != nil { instanceDispatch.vkGetPhysicalDeviceProperties2 = properties }
        let formats = ResolveGlobalProc(instance, "vkGetPhysicalDeviceImageFormatProperties2") as (unmanaged[Cdecl](VkPhysicalDevice, *VkPhysicalDeviceImageFormatInfo2, *VkImageFormatProperties2) -> VkResult)?
        if formats != nil { instanceDispatch.vkGetPhysicalDeviceImageFormatProperties2 = formats }
        let modifierFormats = ResolveGlobalProc(instance, "vkGetPhysicalDeviceFormatProperties2") as (unmanaged[Cdecl](VkPhysicalDevice, VkFormat, *VkFormatProperties2) -> void)?
        formatModifierQueryAvailable = modifierFormats != nil
        if modifierFormats != nil { instanceDispatch.vkGetPhysicalDeviceFormatProperties2 = modifierFormats }
        let semaphores = ResolveGlobalProc(instance, "vkGetPhysicalDeviceExternalSemaphoreProperties") as (unmanaged[Cdecl](VkPhysicalDevice, *VkPhysicalDeviceExternalSemaphoreInfo, *VkExternalSemaphoreProperties) -> void)?
        if semaphores != nil { instanceDispatch.vkGetPhysicalDeviceExternalSemaphoreProperties = semaphores }
    }

    private func ResolveExternalDeviceDispatch() {
        dispatch.ExternalMemoryKinds = if externalMemoryExtension == "" { 0u } else if OperatingSystem.IsWindows() { 2u | 8u | 128u } else { 1u }
        dispatch.ForeignQueueFamily = externalForeignExtension != ""
        if externalAndroidExtension != "" && samplerYcbcrSupported && dispatch.ForeignQueueFamily {
            let properties = ResolveDeviceProc("vkGetAndroidHardwareBufferPropertiesANDROID") as (unmanaged[Cdecl](VkDevice, nint, *VkAndroidHardwareBufferPropertiesANDROID) -> VkResult)?
            let create = ResolveDeviceProc("vkCreateSamplerYcbcrConversion") as (unmanaged[Cdecl](VkDevice, *VkSamplerYcbcrConversionCreateInfo, *VkAllocationCallbacks, *uint64) -> VkResult)?
            let destroy = ResolveDeviceProc("vkDestroySamplerYcbcrConversion") as (unmanaged[Cdecl](VkDevice, uint64, *VkAllocationCallbacks) -> void)?
            if properties != nil && create != nil && destroy != nil {
                dispatch.vkGetAndroidHardwareBufferPropertiesANDROID = properties
                dispatch.vkCreateSamplerYcbcrConversion = create
                dispatch.vkDestroySamplerYcbcrConversion = destroy
                dispatch.AndroidHardwareBuffer = true
                dispatch.ExternalMemoryKinds |= 0x400u
                var conversion = VkPhysicalDeviceMaintenance6Properties{ sType: 1000545001 }
                var limits = VkPhysicalDeviceProperties2{ sType: 1000059001,
                    pNext: if maintenance6Supported { *void(&conversion) } else { nil } }
                let query = instanceDispatch.vkGetPhysicalDeviceProperties2
                query(physicalDevice, &limits)
                dispatch.AndroidDescriptorCount = if maintenance6Supported {
                    conversion.maxCombinedImageSamplerDescriptorCount
                } else { 3u }
            }
        }
        if externalMemoryExtension != "" && externalDmaExtension != "" && externalModifierExtension != "" && formatModifierQueryAvailable {
            let properties = ResolveDeviceProc("vkGetMemoryFdPropertiesKHR") as (unmanaged[Cdecl](VkDevice, uint32, int32, *VkMemoryFdPropertiesKHR) -> VkResult)?
            if properties != nil {
                dispatch.vkGetMemoryFdPropertiesKHR = properties
                dispatch.ExternalMemoryKinds |= 0x200u
            }
        }
        if OperatingSystem.IsWindows() && externalMemoryExtension != "" {
            let properties = ResolveDeviceProc("vkGetMemoryWin32HandlePropertiesKHR") as (unmanaged[Cdecl](VkDevice, uint32, nint, *VkMemoryWin32HandlePropertiesKHR) -> VkResult)?
            if properties != nil { dispatch.vkGetMemoryWin32HandlePropertiesKHR = properties }
            else { dispatch.ExternalMemoryKinds = 2u }
        }
        if externalSemaphoreExtension == "" { return }
        if OperatingSystem.IsWindows() {
            let importSemaphore = ResolveDeviceProc("vkImportSemaphoreWin32HandleKHR") as (unmanaged[Cdecl](VkDevice, *VkImportSemaphoreWin32HandleInfoKHR) -> VkResult)?
            if importSemaphore != nil {
                dispatch.vkImportSemaphoreWin32HandleKHR = importSemaphore
                dispatch.ExternalSemaphoreKinds = 2u | 8u
            }
        } else {
            let importSemaphore = ResolveDeviceProc("vkImportSemaphoreFdKHR") as (unmanaged[Cdecl](VkDevice, *VkImportSemaphoreFdInfoKHR) -> VkResult)?
            if importSemaphore != nil {
                dispatch.vkImportSemaphoreFdKHR = importSemaphore
                dispatch.ExternalSemaphoreKinds = 1u | 16u
            }
        }
    }

    internal func OpenExternalSession(window Window) ExternalImageSessionResult {
        if disposed { return ExternalImageSessionResult(ExternalImageStatus.Closed) }
        guard let active = runtime else { return ExternalImageSessionResult(ExternalImageStatus.Busy) }
        if active.DeviceLost { return ExternalImageSessionResult(ExternalImageStatus.DeviceLost) }
        if active.Dispatch.ExternalMemoryKinds == 0u {
            return ExternalImageSessionResult(ExternalImageStatus.Unsupported, detail: "External memory extension is unavailable")
        }
        if let sessions = externalSessions {
            var index = sessions.Count - 1
            while index >= 0 {
                if sessions[index].NativeDisposed { sessions.RemoveAt(index) }
                index--
            }
        }
        guard let lease = VulkanSharedRuntime.TryAcquire() else {
            return ExternalImageSessionResult(ExternalImageStatus.Closed)
        }
        try {
            let session = ExternalImageSession(window, lease)
            externalSessions ??= List[ExternalImageSession]()
            externalSessions?.Add(session)
            return ExternalImageSessionResult(ExternalImageStatus.Success, session)
        } catch (error InvalidOperationException) {
            lease.Release()
            return ExternalImageSessionResult(ExternalImageStatus.Failed, detail: error.Message)
        }
    }

    private func CloseExternalSessions(status ExternalImageStatus) {
        guard let sessions = externalSessions else { return }
        for session in sessions {
            let error = session.Close(status)
            externalCloseError ??= error
        }
        externalSessions = nil
    }

    internal func ServiceExternalImageCompletion() {
        ServiceRecoveryQueueCompletion()
        if let request = readbackRequest { request.PollCompletion() }
    }
}
