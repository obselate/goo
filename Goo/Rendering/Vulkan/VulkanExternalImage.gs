package Goo

import System

internal unsafe sealed class VulkanExternalImage : IDisposable {
    internal let Runtime VulkanSharedLease
    internal let Width int32
    internal let Height int32
    internal let Format int32
    internal var Image VkImage
    internal var View VkImageView
    internal var OpaqueView VkImageView
    private var memory VkDeviceMemory
    internal var Busy bool
    internal var Closed bool

    private init(runtime VulkanSharedLease, description VulkanExternalImageDescription) {
        Runtime = runtime
        Width = description.Width
        Height = description.Height
        Format = description.Format
    }

    shared {
        internal func Import(runtime VulkanSharedLease, description VulkanExternalImageDescription) ExternalImageResult {
            if description.KeyedMutex { return ExternalImageResult(ExternalImageStatus.UnsupportedSynchronization) }
            let handleType = switch description.HandleKind {
                case ExternalImageHandleKind.OpaqueFd: 1u
                case ExternalImageHandleKind.OpaqueWin32: 2u
                case ExternalImageHandleKind.D3D11TextureNt: 8u
                case ExternalImageHandleKind.D3D12Resource: 128u
                default: 0u
            }
            if handleType == 0u || (runtime.Dispatch.ExternalMemoryKinds & handleType) == 0u {
                return ExternalImageResult(ExternalImageStatus.Unsupported, detail: "External memory handle type is unavailable")
            }
            if description.Format != VkConstants.VK_FORMAT_R8G8B8A8_SRGB
                && description.Format != VkConstants.VK_FORMAT_B8G8R8A8_SRGB {
                return ExternalImageResult(ExternalImageStatus.UnsupportedFormat)
            }
            if description.Tiling != VkConstants.VK_IMAGE_TILING_OPTIMAL || description.ImageCreateFlags != 0u {
                return ExternalImageResult(ExternalImageStatus.UnsupportedFormat, detail: "Import requires optimal tiling and no image create flags")
            }
            if (description.ImageUsage & uint32(VkConstants.VK_IMAGE_USAGE_SAMPLED_BIT)) == 0u {
                throw ArgumentException("External image usage must include sampled usage", "description")
            }
            let query = runtime.InstanceDispatch.vkGetPhysicalDeviceImageFormatProperties2
            var externalInfo = VkPhysicalDeviceExternalImageFormatInfo{ sType: 1000071000, handleType: handleType }
            var queryInfo = VkPhysicalDeviceImageFormatInfo2{
                sType: 1000059004, pNext: *void(&externalInfo), format: description.Format,
                imageType: VkConstants.VK_IMAGE_TYPE_2D, tiling: description.Tiling,
                usage: description.ImageUsage, flags: description.ImageCreateFlags,
            }
            var externalProperties = VkExternalImageFormatProperties{ sType: 1000071001 }
            var properties = VkImageFormatProperties2{ sType: 1000059003, pNext: *void(&externalProperties) }
            let result = query(runtime.PhysicalDevice, &queryInfo, &properties)
            if result != VkConstants.VK_SUCCESS || (externalProperties.externalMemoryProperties.externalMemoryFeatures & 4u) == 0u {
                return ExternalImageResult(ExternalImageStatus.Unsupported, detail: "Driver cannot import this external image")
            }
            if uint32(description.Width) > properties.maxExtent.width || uint32(description.Height) > properties.maxExtent.height {
                return ExternalImageResult(ExternalImageStatus.UnsupportedFormat)
            }
            let imported = VulkanExternalImage(runtime, description)
            var succeeded bool = false
            try {
                imported.Create(description, handleType,
                    (externalProperties.externalMemoryProperties.externalMemoryFeatures & 1u) != 0u)
                let result = ExternalImageResult(ExternalImageStatus.Success, ExternalImage(imported))
                succeeded = true
                return result
            } catch (error System.Runtime.InteropServices.ExternalException) {
                return ExternalImageResult(if error.ErrorCode == int32(VkConstants.VK_ERROR_DEVICE_LOST) {
                    ExternalImageStatus.DeviceLost
                } else { ExternalImageStatus.Failed }, detail: error.Message)
            } catch (error InvalidOperationException) {
                return ExternalImageResult(ExternalImageStatus.Failed, detail: error.Message)
            } finally {
                if !succeeded { imported.Dispose() }
            }
        }
    }

    private func Check(result VkResult, operation string) {
        if result != VkConstants.VK_SUCCESS { throw System.Runtime.InteropServices.ExternalException(operation, int32(result)) }
    }

    private func Create(description VulkanExternalImageDescription, handleType uint32, dedicatedOnly bool) {
        let dispatch = Runtime.Dispatch
        let device = Runtime.Device
        var externalInfo = VkExternalMemoryImageCreateInfo{ sType: 1000072001, handleTypes: handleType }
        var imageInfo = VkImageCreateInfo{
            sType: VkConstants.VK_STRUCTURE_TYPE_IMAGE_CREATE_INFO, pNext: *void(&externalInfo),
            imageType: VkConstants.VK_IMAGE_TYPE_2D, format: Format,
            extent: VkExtent3D{ width: uint32(Width), height: uint32(Height), depth: 1u },
            mipLevels: 1u, arrayLayers: 1u, samples: VkConstants.VK_SAMPLE_COUNT_1_BIT,
            tiling: description.Tiling, usage: description.ImageUsage,
            sharingMode: VkConstants.VK_SHARING_MODE_EXCLUSIVE, initialLayout: VkConstants.VK_IMAGE_LAYOUT_UNDEFINED,
        }
        let createImage = dispatch.vkCreateImage
        Check(createImage(device, &imageInfo, nil, &Image), "External image creation failed")
        var dedicated = VkMemoryDedicatedRequirements{ sType: VkConstants.VK_STRUCTURE_TYPE_MEMORY_DEDICATED_REQUIREMENTS }
        var requirements = VkMemoryRequirements2{ sType: VkConstants.VK_STRUCTURE_TYPE_MEMORY_REQUIREMENTS_2, pNext: *void(&dedicated) }
        var requirementsInfo = VkImageMemoryRequirementsInfo2{ sType: VkConstants.VK_STRUCTURE_TYPE_IMAGE_MEMORY_REQUIREMENTS_INFO_2, image: Image }
        let getRequirements = dispatch.vkGetImageMemoryRequirements2
        getRequirements(device, &requirementsInfo, &requirements)
        let needed = requirements.memoryRequirements
        if description.MemoryTypeIndex >= 32u || (needed.memoryTypeBits & (1u << int32(description.MemoryTypeIndex))) == 0u
            || description.MemoryOffset > description.AllocationSize || needed.size > description.AllocationSize - description.MemoryOffset
            || description.MemoryOffset % needed.alignment != 0uL {
            throw InvalidOperationException("External allocation metadata does not match the image")
        }
        let useDedicated = description.DedicatedAllocation || dedicatedOnly || dedicated.requiresDedicatedAllocation != 0u
        if useDedicated && description.MemoryOffset != 0uL { throw InvalidOperationException("Dedicated imports require a zero memory offset") }
        guard let duplicate = ExternalNativeHandle.Duplicate(description.Memory, OperatingSystem.IsWindows()) else {
            throw InvalidOperationException("External memory handle duplication failed")
        }
        using let handle = duplicate
        if OperatingSystem.IsWindows() && handleType != 2u {
            var properties = VkMemoryWin32HandlePropertiesKHR{ sType: 1000073002 }
            let getProperties = dispatch.vkGetMemoryWin32HandlePropertiesKHR
            Check(getProperties(device, handleType, handle.DangerousGetHandle(), &properties), "External Win32 handle properties failed")
            if (properties.memoryTypeBits & (1u << int32(description.MemoryTypeIndex))) == 0u {
                throw InvalidOperationException("External Win32 allocation memory type does not match the handle")
            }
        }
        var dedicatedInfo = VkMemoryDedicatedAllocateInfo{ sType: VkConstants.VK_STRUCTURE_TYPE_MEMORY_DEDICATED_ALLOCATE_INFO, image: Image }
        var fdInfo = VkImportMemoryFdInfoKHR{ sType: 1000074000, handleType: handleType, fd: int32(handle.DangerousGetHandle()) }
        var winInfo = VkImportMemoryWin32HandleInfoKHR{ sType: 1000073000, handleType: handleType, handle: handle.DangerousGetHandle() }
        if useDedicated {
            fdInfo.pNext = *void(&dedicatedInfo)
            winInfo.pNext = *void(&dedicatedInfo)
        }
        var allocationInfo = VkMemoryAllocateInfo{
            sType: VkConstants.VK_STRUCTURE_TYPE_MEMORY_ALLOCATE_INFO,
            pNext: if OperatingSystem.IsWindows() { *void(&winInfo) } else { *void(&fdInfo) },
            allocationSize: description.AllocationSize, memoryTypeIndex: description.MemoryTypeIndex,
        }
        let allocate = dispatch.vkAllocateMemory
        Check(allocate(device, &allocationInfo, nil, &memory), "External memory import failed")
        if !OperatingSystem.IsWindows() { handle.SetHandleAsInvalid() }
        var bindInfo = VkBindImageMemoryInfo{ sType: VkConstants.VK_STRUCTURE_TYPE_BIND_IMAGE_MEMORY_INFO,
            image: Image, memory: memory, memoryOffset: description.MemoryOffset }
        let bind = dispatch.vkBindImageMemory2
        Check(bind(device, 1u, &bindInfo), "External memory binding failed")
        var viewInfo = VkImageViewCreateInfo{
            sType: VkConstants.VK_STRUCTURE_TYPE_IMAGE_VIEW_CREATE_INFO, image: Image,
            viewType: VkConstants.VK_IMAGE_VIEW_TYPE_2D, format: Format,
            subresourceRange: VulkanTransitions.ColorSubresourceRange(),
        }
        let createView = dispatch.vkCreateImageView
        Check(createView(device, &viewInfo, nil, &View), "External image view creation failed")
    }

    internal func EnsureAlphaView(alpha ExternalImageAlphaMode) ExternalImageStatus {
        if alpha != ExternalImageAlphaMode.Opaque || OpaqueView != 0uL { return ExternalImageStatus.Success }
        var info = VkImageViewCreateInfo{
            sType: VkConstants.VK_STRUCTURE_TYPE_IMAGE_VIEW_CREATE_INFO, image: Image,
            viewType: VkConstants.VK_IMAGE_VIEW_TYPE_2D, format: Format,
            components: VkComponentMapping{ a: VkConstants.VK_COMPONENT_SWIZZLE_ONE },
            subresourceRange: VulkanTransitions.ColorSubresourceRange(),
        }
        let create = Runtime.Dispatch.vkCreateImageView
        let result = create(Runtime.Device, &info, nil, &OpaqueView)
        return if result == VkConstants.VK_SUCCESS { ExternalImageStatus.Success }
            else if result == VkConstants.VK_ERROR_DEVICE_LOST { ExternalImageStatus.DeviceLost }
            else { ExternalImageStatus.Failed }
    }

    public func Dispose() {
        let dispatch = Runtime.Dispatch
        let device = Runtime.Device
        if OpaqueView != 0uL {
            let destroy = dispatch.vkDestroyImageView
            destroy(device, OpaqueView, nil)
            OpaqueView = 0uL
        }
        if View != 0uL {
            let destroy = dispatch.vkDestroyImageView
            destroy(device, View, nil)
            View = 0uL
        }
        if Image != 0uL {
            let destroy = dispatch.vkDestroyImage
            destroy(device, Image, nil)
            Image = 0uL
        }
        if memory != 0uL {
            let free = dispatch.vkFreeMemory
            free(device, memory, nil)
            memory = 0uL
        }
    }
}
