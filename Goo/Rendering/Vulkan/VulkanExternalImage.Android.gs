package Goo

import System
import System.Runtime.InteropServices

internal unsafe sealed partial class VulkanExternalImage {
    shared {
        internal func ImportAndroid(runtime VulkanSharedLease, buffer nint) ExternalImageResult {
            if !OperatingSystem.IsAndroid() || !runtime.Dispatch.AndroidHardwareBuffer {
                return ExternalImageResult(ExternalImageStatus.Unsupported)
            }
            var description AndroidHardwareBufferDescription
            AndroidHardwareBuffer.Describe(buffer, &description)
            if description.width == 0u || description.height == 0u || description.layers != 1u
                || description.width > uint32(int32.MaxValue) || description.height > uint32(int32.MaxValue)
                || (description.usage & 0x100uL) == 0uL || (description.usage & 0x4000uL) != 0uL {
                return ExternalImageResult(ExternalImageStatus.UnsupportedFormat)
            }
            var format = VkAndroidHardwareBufferFormatPropertiesANDROID{ sType: 1000129002 }
            var properties = VkAndroidHardwareBufferPropertiesANDROID{ sType: 1000129001, pNext: *void(&format) }
            let query = runtime.Dispatch.vkGetAndroidHardwareBufferPropertiesANDROID
            let status = query(runtime.Device, buffer, &properties)
            if status != VkConstants.VK_SUCCESS {
                return ExternalImageResult(if status == VkConstants.VK_ERROR_DEVICE_LOST {
                    ExternalImageStatus.DeviceLost
                } else { ExternalImageStatus.Failed })
            }
            if (format.formatFeatures & 1u) == 0u || (format.format == 0 && format.externalFormat == 0uL) {
                return ExternalImageResult(ExternalImageStatus.UnsupportedFormat)
            }
            let imageFormat = if description.format == 0x23u || description.format == 0x36u { 0 } else { format.format }
            if imageFormat != 0 && imageFormat != 37 && imageFormat != 43 && imageFormat != 44 && imageFormat != 50 {
                return ExternalImageResult(ExternalImageStatus.UnsupportedFormat)
            }
            let imported = VulkanExternalImage(runtime, int32(description.width), int32(description.height), imageFormat)
            var succeeded bool
            try {
                imported.AndroidFormat = format
                AndroidHardwareBuffer.Acquire(buffer)
                imported.AndroidBuffer = buffer
                imported.CreateAndroid(properties)
                succeeded = true
                return ExternalImageResult(ExternalImageStatus.Success, ExternalImage(imported))
            } catch (error ExternalException) {
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

    private func CreateAndroid(properties VkAndroidHardwareBufferPropertiesANDROID) {
        let dispatch = Runtime.Dispatch
        var externalFormat = VkExternalFormatANDROID{ sType: 1000129005,
            externalFormat: if Format == 0 { AndroidFormat.externalFormat } else { 0uL } }
        var external = VkExternalMemoryImageCreateInfo{ sType: 1000072001,
            pNext: *void(&externalFormat), handleTypes: 0x400u }
        var info = VkImageCreateInfo{ sType: VkConstants.VK_STRUCTURE_TYPE_IMAGE_CREATE_INFO,
            pNext: *void(&external), imageType: VkConstants.VK_IMAGE_TYPE_2D, format: Format,
            extent: VkExtent3D{ width: uint32(Width), height: uint32(Height), depth: 1u },
            mipLevels: 1u, arrayLayers: 1u, samples: VkConstants.VK_SAMPLE_COUNT_1_BIT,
            tiling: VkConstants.VK_IMAGE_TILING_OPTIMAL, usage: uint32(VkConstants.VK_IMAGE_USAGE_SAMPLED_BIT),
            sharingMode: VkConstants.VK_SHARING_MODE_EXCLUSIVE }
        let create = dispatch.vkCreateImage
        Check(create(Runtime.Device, &info, nil, &Image), "Android image creation failed")
        var typeIndex uint32
        while typeIndex < 32u && (properties.memoryTypeBits & (1u << int32(typeIndex))) == 0u { typeIndex++ }
        if typeIndex == 32u { throw InvalidOperationException("Android buffer has no import memory type") }
        var dedicated = VkMemoryDedicatedAllocateInfo{ sType: VkConstants.VK_STRUCTURE_TYPE_MEMORY_DEDICATED_ALLOCATE_INFO,
            image: Image }
        var importInfo = VkImportAndroidHardwareBufferInfoANDROID{ sType: 1000129003,
            pNext: *void(&dedicated), buffer: AndroidBuffer }
        var allocation = VkMemoryAllocateInfo{ sType: VkConstants.VK_STRUCTURE_TYPE_MEMORY_ALLOCATE_INFO,
            pNext: *void(&importInfo), allocationSize: properties.allocationSize, memoryTypeIndex: typeIndex }
        let allocate = dispatch.vkAllocateMemory
        Check(allocate(Runtime.Device, &allocation, nil, &memory), "Android buffer import failed")
        var bindInfo = VkBindImageMemoryInfo{ sType: VkConstants.VK_STRUCTURE_TYPE_BIND_IMAGE_MEMORY_INFO,
            image: Image, memory: memory }
        let bind = dispatch.vkBindImageMemory2
        Check(bind(Runtime.Device, 1u, &bindInfo), "Android buffer binding failed")
    }

    internal func PrepareFrame(frame ExternalFrameDescription) ExternalImageStatus {
        if frame.AlphaMode != ExternalImageAlphaMode.Opaque && frame.AlphaMode != ExternalImageAlphaMode.Premultiplied {
            return ExternalImageStatus.UnsupportedFormat
        }
        if AndroidBuffer == nint(0) {
            return if frame.ColorEncoding == ExternalImageColorEncoding.Srgb {
                EnsureAlphaView(frame.AlphaMode)
            } else { ExternalImageStatus.UnsupportedFormat }
        }
        let yuv = Format == 0
        if yuv && frame.AlphaMode != ExternalImageAlphaMode.Opaque { return ExternalImageStatus.UnsupportedFormat }
        if (yuv && (frame.ColorEncoding < ExternalImageColorEncoding.AndroidBt709Limited
            || frame.ColorEncoding > ExternalImageColorEncoding.AndroidBt601_525Full))
            || (!yuv && frame.ColorEncoding != ExternalImageColorEncoding.Srgb) {
            return ExternalImageStatus.UnsupportedFormat
        }
        if let current = Normalization {
            if current.Encoding == frame.ColorEncoding && current.AlphaMode == frame.AlphaMode {
                return ExternalImageStatus.Success
            }
            current.Dispose()
            Normalization = nil
        }
        try {
            Normalization = VulkanAndroidImageNormalization(this, frame.ColorEncoding, frame.AlphaMode)
            return ExternalImageStatus.Success
        } catch (error ExternalException) {
            return if error.ErrorCode == int32(VkConstants.VK_ERROR_DEVICE_LOST) {
                ExternalImageStatus.DeviceLost
            } else { ExternalImageStatus.Failed }
        } catch (error InvalidOperationException) {
            return ExternalImageStatus.Failed
        }
    }
}
