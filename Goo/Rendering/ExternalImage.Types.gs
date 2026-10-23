package Goo

import System
import System.Runtime.InteropServices

/// Reports external image operations.
public enum ExternalImageStatus { Success; Unsupported; UnsupportedFormat; UnsupportedSynchronization; WrongDevice; StaleGeneration; Busy; DeviceLost; Closed; Failed }

/// Identifies an exported Vulkan memory handle.
public enum ExternalImageHandleKind { OpaqueFd; DmaBuf; OpaqueWin32; D3D11TextureNt; D3D12Resource }

/// Identifies a producer completion dependency.
public enum ExternalImageSyncKind { OpaqueFdSemaphore; SyncFd; OpaqueWin32Semaphore; D3D12Fence; MetalSharedEvent; AlreadyComplete }

/// Identifies the source sample encoding.
public enum ExternalImageColorEncoding { Unsupported; Srgb }

/// Identifies source alpha storage.
public enum ExternalImageAlphaMode { Premultiplied; Opaque }

/// Reports the end of a frame read lease.
public enum ExternalFrameStatus { Released; Dropped; DeviceLost; Closed }

/// Describes one explicit memory plane.
public data struct ExternalImagePlane {
    /// Gets the byte offset of this plane.
    public prop Offset uint64 { get; init; }
    /// Gets the row stride in bytes.
    public prop RowPitch uint64 { get; init; }
}

/// Describes a borrowed exportable 2D Vulkan allocation. Goo duplicates Memory before import.
public sealed class VulkanExternalImageDescription {
    /// Creates allocation metadata. Set all required image and allocation fields before import.
    public init() { }

    /// Gets the native memory handle type.
    public prop HandleKind ExternalImageHandleKind { get; init; }
    /// Gets the borrowed memory handle. The caller retains ownership.
    public prop Memory SafeHandle { get; init; }
    /// Gets the producer physical device UUID, exactly 16 bytes.
    public prop DeviceUuid ReadOnlyMemory[uint8] { get; init; }
    /// Gets the producer driver UUID, exactly 16 bytes.
    public prop DriverUuid ReadOnlyMemory[uint8] { get; init; }
    /// Gets the allocation width in pixels.
    public prop Width int32 { get; init; }
    /// Gets the allocation height in pixels.
    public prop Height int32 { get; init; }
    /// Gets the numeric VkFormat. Supported opaque imports use sRGB RGBA8 or BGRA8.
    public prop Format int32 { get; init; }
    /// Gets the numeric VkImageTiling.
    public prop Tiling int32 { get; init; }
    /// Gets the exported allocation size in bytes.
    public prop AllocationSize uint64 { get; init; }
    /// Gets the image binding offset in bytes.
    public prop MemoryOffset uint64 { get; init; }
    /// Gets the producer allocation memory type index.
    public prop MemoryTypeIndex uint32 { get; init; }
    /// Gets the matching numeric VkImageCreateFlags.
    public prop ImageCreateFlags uint32 { get; init; }
    /// Gets the exact numeric VkImageUsageFlags, including sampled usage.
    public prop ImageUsage uint32 { get; init; }
    /// Gets whether the producer used a dedicated image allocation.
    public prop DedicatedAllocation bool { get; init; }
    /// Gets whether the producer allocation requires keyed-mutex sharing. This route is unsupported.
    public prop KeyedMutex bool { get; init; }
    /// Gets the explicit DRM format modifier for DMA-BUF import.
    public prop DrmModifier uint64 { get; init; }
    /// Gets the explicit DRM plane layouts.
    public prop Planes ReadOnlyMemory[ExternalImagePlane] { get; init; }
}

/// Describes visible source pixels. Orientation uses EXIF values 1 through 8.
public data struct ExternalFrameDescription {
    /// Gets the crop left edge in pixels.
    public prop X int32 { get; init; }
    /// Gets the crop top edge in pixels.
    public prop Y int32 { get; init; }
    /// Gets the crop width in pixels.
    public prop Width int32 { get; init; }
    /// Gets the crop height in pixels.
    public prop Height int32 { get; init; }
    /// Gets the EXIF orientation, from 1 through 8.
    public prop Orientation int32 { get; init; }
    /// Gets the source alpha storage.
    public prop AlphaMode ExternalImageAlphaMode { get; init; }
    /// Gets the source color encoding. HDR samples are not supported.
    public prop ColorEncoding ExternalImageColorEncoding { get; init; }
}

/// Describes borrowed producer synchronization. AlreadyComplete requires producer completion before Publish.
public sealed class ExternalImageSync {
    /// Creates synchronization metadata. Set the kind, layout and queue family before publication.
    public init() { }

    /// Gets the producer completion kind.
    public prop Kind ExternalImageSyncKind { get; init; }
    /// Gets the borrowed semaphore or fence handle.
    public prop Handle SafeHandle? { get; init; }
    /// Gets whether the payload is a timeline semaphore.
    public prop Timeline bool { get; init; }
    /// Gets the required timeline value.
    public prop Value uint64 { get; init; }
    /// Gets the producer's released numeric VkImageLayout.
    public prop ImageLayout int32 { get; init; }
    /// Gets the released external or foreign queue family index.
    public prop QueueFamily uint32 { get; init; }
}

/// Reports a completed frame lease. CPU notification follows the final completed GPU use.
public sealed class ExternalFrameResult {
    /// Gets the terminal frame status.
    public prop Status ExternalFrameStatus { get; }
    /// Gets an optional owned release handle. The receiver must dispose it.
    public prop ReleaseSync SafeHandle? { get; }
    /// Gets the release timeline value, when present.
    public prop Value uint64 { get; }

    internal init(status ExternalFrameStatus) { Status = status }
}

/// Reports an external image import.
public sealed class ExternalImageResult {
    /// Gets the import status.
    public prop Status ExternalImageStatus { get; }
    /// Gets the caller-owned image, only on Success.
    public prop Image ExternalImage? { get; }
    /// Gets a bounded failure description.
    public prop Detail string { get; }

    internal init(status ExternalImageStatus, image ExternalImage? = nil, detail string = "") {
        Status = status
        Image = image
        Detail = detail.Length > 256 ? detail.Substring(0, 256) : detail
    }
}

/// Reports opening an external image session.
public sealed class ExternalImageSessionResult {
    /// Gets the session status.
    public prop Status ExternalImageStatus { get; }
    /// Gets the caller-owned session, only on Success.
    public prop Session ExternalImageSession? { get; }
    /// Gets a bounded failure description.
    public prop Detail string { get; }

    internal init(status ExternalImageStatus, session ExternalImageSession? = nil, detail string = "") {
        Status = status
        Session = session
        Detail = detail.Length > 256 ? detail.Substring(0, 256) : detail
    }
}

/// Identifies a Windows adapter for a D3D external image producer.
public sealed class ExternalImageWindowsDevice {
    /// Gets the eight-byte adapter LUID.
    public prop Luid ReadOnlyMemory[uint8] { get; }
    /// Gets the physical device node mask.
    public prop NodeMask uint32 { get; }

    internal init(luid ReadOnlyMemory[uint8], nodeMask uint32) {
        Luid = luid
        NodeMask = nodeMask
    }
}
