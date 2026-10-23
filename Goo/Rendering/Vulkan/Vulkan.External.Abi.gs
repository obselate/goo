package Goo

import System
import System.Runtime.InteropServices

@StructLayout(LayoutKind.Sequential)
internal unsafe struct VkExternalMemoryImageCreateInfo {
    var sType int32
    var pNext *void
    var handleTypes uint32
}

@StructLayout(LayoutKind.Sequential)
internal unsafe struct VkImportMemoryFdInfoKHR {
    var sType int32
    var pNext *void
    var handleType uint32
    var fd int32
}

@StructLayout(LayoutKind.Sequential)
internal unsafe struct VkImportMemoryWin32HandleInfoKHR {
    var sType int32
    var pNext *void
    var handleType uint32
    var handle nint
    var name *uint16
}

@StructLayout(LayoutKind.Sequential)
internal unsafe struct VkPhysicalDeviceExternalImageFormatInfo {
    var sType int32
    var pNext *void
    var handleType uint32
}

@StructLayout(LayoutKind.Sequential)
internal unsafe struct VkPhysicalDeviceImageFormatInfo2 {
    var sType int32
    var pNext *void
    var format int32
    var imageType int32
    var tiling int32
    var usage uint32
    var flags uint32
}

@StructLayout(LayoutKind.Sequential)
internal struct VkExternalMemoryProperties {
    var externalMemoryFeatures uint32
    var exportFromImportedHandleTypes uint32
    var compatibleHandleTypes uint32
}

@StructLayout(LayoutKind.Sequential)
internal unsafe struct VkExternalImageFormatProperties {
    var sType int32
    var pNext *void
    var externalMemoryProperties VkExternalMemoryProperties
}

@StructLayout(LayoutKind.Sequential)
internal unsafe struct VkImageFormatProperties2 {
    var sType int32
    var pNext *void
    var maxExtent VkExtent3D
    var maxMipLevels uint32
    var maxArrayLayers uint32
    var sampleCounts uint32
    var maxResourceSize uint64
}

@StructLayout(LayoutKind.Sequential)
internal unsafe struct VkPhysicalDeviceProperties2 {
    var sType int32
    var pNext *void
    var properties VkPhysicalDeviceProperties
}

@StructLayout(LayoutKind.Sequential)
internal unsafe struct VkPhysicalDeviceIDProperties {
    var sType int32
    var pNext *void
    fixed deviceUUID[16]uint8
    fixed driverUUID[16]uint8
    fixed deviceLUID[8]uint8
    var deviceNodeMask uint32
    var deviceLUIDValid uint32
}

@StructLayout(LayoutKind.Sequential)
internal unsafe struct VkImportSemaphoreFdInfoKHR {
    var sType int32
    var pNext *void
    var semaphore VkSemaphore
    var flags uint32
    var handleType uint32
    var fd int32
}

@StructLayout(LayoutKind.Sequential)
internal unsafe struct VkImportSemaphoreWin32HandleInfoKHR {
    var sType int32
    var pNext *void
    var semaphore VkSemaphore
    var flags uint32
    var handleType uint32
    var handle nint
    var name *uint16
}

@StructLayout(LayoutKind.Sequential)
internal unsafe struct VkPhysicalDeviceExternalSemaphoreInfo {
    var sType int32
    var pNext *void
    var handleType uint32
}

@StructLayout(LayoutKind.Sequential)
internal unsafe struct VkExternalSemaphoreProperties {
    var sType int32
    var pNext *void
    var exportFromImportedHandleTypes uint32
    var compatibleHandleTypes uint32
    var externalSemaphoreFeatures uint32
}

@StructLayout(LayoutKind.Sequential)
internal unsafe struct VkMemoryWin32HandlePropertiesKHR {
    var sType int32
    var pNext * void
    var memoryTypeBits uint32
}

@StructLayout(LayoutKind.Sequential)
internal unsafe struct VkFormatProperties2 {
    var sType int32
    var pNext *void
    var formatProperties VkFormatProperties
}

@StructLayout(LayoutKind.Sequential)
internal struct VkDrmFormatModifierPropertiesEXT {
    var drmFormatModifier uint64
    var drmFormatModifierPlaneCount uint32
    var drmFormatModifierTilingFeatures uint32
}

@StructLayout(LayoutKind.Sequential)
internal unsafe struct VkDrmFormatModifierPropertiesListEXT {
    var sType int32
    var pNext *void
    var drmFormatModifierCount uint32
    var pDrmFormatModifierProperties *VkDrmFormatModifierPropertiesEXT
}

@StructLayout(LayoutKind.Sequential)
internal unsafe struct VkPhysicalDeviceImageDrmFormatModifierInfoEXT {
    var sType int32
    var pNext *void
    var drmFormatModifier uint64
    var sharingMode int32
    var queueFamilyIndexCount uint32
    var pQueueFamilyIndices *uint32
}

@StructLayout(LayoutKind.Sequential)
internal struct VkSubresourceLayout {
    var offset uint64
    var size uint64
    var rowPitch uint64
    var arrayPitch uint64
    var depthPitch uint64
}

@StructLayout(LayoutKind.Sequential)
internal unsafe struct VkImageDrmFormatModifierExplicitCreateInfoEXT {
    var sType int32
    var pNext *void
    var drmFormatModifier uint64
    var drmFormatModifierPlaneCount uint32
    var pPlaneLayouts *VkSubresourceLayout
}

@StructLayout(LayoutKind.Sequential)
internal unsafe struct VkMemoryFdPropertiesKHR {
    var sType int32
    var pNext *void
    var memoryTypeBits uint32
}

@StructLayout(LayoutKind.Sequential)
internal struct ExternalPollFd {
    var fd int32
    var events int16
    var revents int16
}

internal unsafe sealed class ExternalNativeHandle : SafeHandle {
    private let windows bool

    internal init(value nint, isWindows bool) : base(nint(-1), true) {
        windows = isWindows
        SetHandle(value)
    }

    public override prop IsInvalid bool { get -> handle == nint(-1) || (windows && handle == nint(0)) }

    protected override func ReleaseHandle() bool -> if windows { CloseHandle(handle) != 0 } else { CloseFd(int32(handle)) == 0 }

    shared {
        @DllImport("libc", EntryPoint: "poll", SetLastError: true)
        private func Poll(descriptors *ExternalPollFd, count uint64, timeout int32) int32;

        internal func PollReady(source ExternalNativeHandle) VkResult {
            var descriptor = ExternalPollFd{ fd: int32(source.DangerousGetHandle()), events: int16(1) }
            let result = Poll(&descriptor, 1uL, 0)
            if result < 0 && Marshal.GetLastPInvokeError() == 4 { return VkConstants.VK_NOT_READY }
            if result < 0 || (descriptor.revents & int16(8 | 16 | 32)) != 0 { return VkConstants.VK_ERROR_UNKNOWN }
            return if result != 0 && (descriptor.revents & int16(1)) != 0 {
                VkConstants.VK_SUCCESS
            } else { VkConstants.VK_NOT_READY }
        }

        @DllImport("libc", EntryPoint: "fcntl", SetLastError: true)
        private func Fcntl(fd int32, command int32, value int32) int32;
        @DllImport("libc", EntryPoint: "close")
        private func CloseFd(fd int32) int32;
        @DllImport("kernel32.dll")
        private func GetCurrentProcess() nint;
        @DllImport("kernel32.dll", SetLastError: true)
        private func DuplicateHandle(sourceProcess nint, source nint, targetProcess nint,
            out target nint, access uint32, inherit int32, options uint32) int32;
        @DllImport("kernel32.dll")
        private func CloseHandle(value nint) int32;

        internal func Duplicate(source SafeHandle, windows bool) ExternalNativeHandle? {
            var retained bool = false
            try {
                source.DangerousAddRef(ref retained)
                if source.IsInvalid || source.IsClosed { throw ObjectDisposedException("handle") }
                let value = source.DangerousGetHandle()
                if windows {
                    let process = GetCurrentProcess()
                    if DuplicateHandle(process, value, process, out var duplicate, 0u, 0, 2u) == 0 { return nil }
                    return ExternalNativeHandle(duplicate, true)
                }
                let duplicate = Fcntl(int32(value), 1030, 0)
                return if duplicate < 0 { nil } else { ExternalNativeHandle(nint(duplicate), false) }
            } finally {
                if retained { source.DangerousRelease() }
            }
        }
    }
}
