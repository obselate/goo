package Goo

import System
import System.Runtime.InteropServices

internal unsafe sealed partial class VulkanExternalImage {
    shared {
        internal func ImportMetal(runtime VulkanSharedLease, value nint, surface bool) ExternalImageResult {
            if !OperatingSystem.IsMacOS() || !runtime.Dispatch.MetalObjects {
                return ExternalImageResult(ExternalImageStatus.Unsupported, detail: "VK_EXT_metal_objects is unavailable")
            }
            let retained = MetalObjectHandle(value, surface)
            var image VulkanExternalImage?
            var succeeded bool = false
            try {
                let width = if surface { MetalObjectHandle.SurfaceWidth(value) } else { MetalObjectHandle.Integer(value, "width") }
                let height = if surface { MetalObjectHandle.SurfaceHeight(value) } else { MetalObjectHandle.Integer(value, "height") }
                if width == 0uL || height == 0uL || width > uint64(Int32.MaxValue) || height > uint64(Int32.MaxValue) {
                    return ExternalImageResult(ExternalImageStatus.UnsupportedFormat)
                }
                var format int32
                if surface {
                    if MetalObjectHandle.SurfacePlaneCount(value) > 1uL || MetalObjectHandle.SurfaceElementBytes(value) != 4uL {
                        return ExternalImageResult(ExternalImageStatus.UnsupportedFormat)
                    }
                    format = switch MetalObjectHandle.SurfaceFormat(value) {
                        case 0x42475241u: VkConstants.VK_FORMAT_B8G8R8A8_SRGB
                        case 0x52474241u: VkConstants.VK_FORMAT_R8G8B8A8_SRGB
                        default: 0
                    }
                } else {
                    if !MetalObjectHandle.SameDevice(value, runtime.Dispatch.MetalDevice) {
                        return ExternalImageResult(ExternalImageStatus.WrongDevice)
                    }
                    let usage = MetalObjectHandle.Integer(value, "usage")
                    if MetalObjectHandle.Integer(value, "textureType") != 2uL
                        || MetalObjectHandle.Integer(value, "depth") != 1uL
                        || MetalObjectHandle.Integer(value, "mipmapLevelCount") != 1uL
                        || MetalObjectHandle.Integer(value, "arrayLength") != 1uL
                        || MetalObjectHandle.Integer(value, "sampleCount") != 1uL
                        || MetalObjectHandle.Integer(value, "storageMode") == 3uL
                        || (usage != 0uL && (usage & 1uL) == 0uL) {
                        return ExternalImageResult(ExternalImageStatus.UnsupportedFormat)
                    }
                    format = switch MetalObjectHandle.Integer(value, "pixelFormat") {
                        case 71uL: VkConstants.VK_FORMAT_R8G8B8A8_SRGB
                        case 81uL: VkConstants.VK_FORMAT_B8G8R8A8_SRGB
                        default: 0
                    }
                }
                if format == 0 { return ExternalImageResult(ExternalImageStatus.UnsupportedFormat) }
                var request = VkPhysicalDeviceImageFormatInfo2{ sType: 1000059004, format: format,
                    imageType: VkConstants.VK_IMAGE_TYPE_2D, tiling: VkConstants.VK_IMAGE_TILING_OPTIMAL,
                    usage: uint32(VkConstants.VK_IMAGE_USAGE_SAMPLED_BIT) }
                var properties = VkImageFormatProperties2{ sType: 1000059003 }
                let query = runtime.InstanceDispatch.vkGetPhysicalDeviceImageFormatProperties2
                if query(runtime.PhysicalDevice, &request, &properties) != VkConstants.VK_SUCCESS
                    || width > uint64(properties.maxExtent.width) || height > uint64(properties.maxExtent.height) {
                    return ExternalImageResult(ExternalImageStatus.UnsupportedFormat)
                }
                let imported = VulkanExternalImage(runtime, int32(width), int32(height), format)
                image = imported
                imported.storage = retained
                imported.CreateMetal(value, surface)
                succeeded = true
                return ExternalImageResult(ExternalImageStatus.Success, ExternalImage(imported))
            } catch (error ExternalException) {
                return ExternalImageResult(if error.ErrorCode == int32(VkConstants.VK_ERROR_DEVICE_LOST) {
                    ExternalImageStatus.DeviceLost
                } else { ExternalImageStatus.Failed }, detail: error.Message)
            } catch (error InvalidOperationException) {
                return ExternalImageResult(ExternalImageStatus.Failed, detail: error.Message)
            } finally {
                if !succeeded {
                    if let imported = image { imported.Dispose() } else { retained.Dispose() }
                }
            }
        }
    }

    private func CreateMetal(value nint, surface bool) {
        var textureInfo = VkImportMetalTextureInfoEXT{ sType: 1000311007, plane: 0x10u, mtlTexture: value }
        var surfaceInfo = VkImportMetalIOSurfaceInfoEXT{ sType: 1000311009, ioSurface: value }
        var info = VkImageCreateInfo{ sType: VkConstants.VK_STRUCTURE_TYPE_IMAGE_CREATE_INFO,
            pNext: if surface { *void(&surfaceInfo) } else { *void(&textureInfo) },
            imageType: VkConstants.VK_IMAGE_TYPE_2D, format: Format,
            extent: VkExtent3D{ width: uint32(Width), height: uint32(Height), depth: 1u },
            mipLevels: 1u, arrayLayers: 1u, samples: VkConstants.VK_SAMPLE_COUNT_1_BIT,
            tiling: VkConstants.VK_IMAGE_TILING_OPTIMAL, usage: uint32(VkConstants.VK_IMAGE_USAGE_SAMPLED_BIT),
            sharingMode: VkConstants.VK_SHARING_MODE_EXCLUSIVE, initialLayout: VkConstants.VK_IMAGE_LAYOUT_UNDEFINED }
        let create = Runtime.Dispatch.vkCreateImage
        var createdImage VkImage
        let result = create(Runtime.Device, &info, nil, &createdImage)
        Image = createdImage
        Check(result, "Metal image import failed")
        if surface { BindSurfaceMemory() }
        CreateView()
    }

    private func BindSurfaceMemory() {
        var request = VkImageMemoryRequirementsInfo2{ sType: VkConstants.VK_STRUCTURE_TYPE_IMAGE_MEMORY_REQUIREMENTS_INFO_2, image: Image }
        var requirements = VkMemoryRequirements2{ sType: VkConstants.VK_STRUCTURE_TYPE_MEMORY_REQUIREMENTS_2 }
        let getRequirements = Runtime.Dispatch.vkGetImageMemoryRequirements2
        getRequirements(Runtime.Device, &request, &requirements)
        var memoryType uint32 = 0u
        while memoryType < 32u && (requirements.memoryRequirements.memoryTypeBits & (1u << int32(memoryType))) == 0u { memoryType++ }
        if memoryType == 32u { throw InvalidOperationException("IOSurface memory type is unavailable") }
        var dedicated = VkMemoryDedicatedAllocateInfo{ sType: VkConstants.VK_STRUCTURE_TYPE_MEMORY_DEDICATED_ALLOCATE_INFO, image: Image }
        var allocation = VkMemoryAllocateInfo{ sType: VkConstants.VK_STRUCTURE_TYPE_MEMORY_ALLOCATE_INFO,
            pNext: *void(&dedicated), allocationSize: requirements.memoryRequirements.size, memoryTypeIndex: memoryType }
        let allocate = Runtime.Dispatch.vkAllocateMemory
        var importedMemory VkDeviceMemory
        let result = allocate(Runtime.Device, &allocation, nil, &importedMemory)
        memory = importedMemory
        Check(result, "IOSurface memory binding allocation failed")
        var bind = VkBindImageMemoryInfo{ sType: VkConstants.VK_STRUCTURE_TYPE_BIND_IMAGE_MEMORY_INFO, image: Image, memory: memory }
        let bindMemory = Runtime.Dispatch.vkBindImageMemory2
        Check(bindMemory(Runtime.Device, 1u, &bind), "IOSurface memory binding failed")
    }
}
