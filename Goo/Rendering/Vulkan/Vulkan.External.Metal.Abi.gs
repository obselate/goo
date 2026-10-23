package Goo

import System
import System.Runtime.InteropServices

@StructLayout(LayoutKind.Sequential)
internal unsafe struct VkExportMetalObjectCreateInfoEXT {
    var sType int32
    var pNext *void
    var exportObjectType uint32
}

@StructLayout(LayoutKind.Sequential)
internal unsafe struct VkExportMetalObjectsInfoEXT {
    var sType int32
    var pNext *void
}

@StructLayout(LayoutKind.Sequential)
internal unsafe struct VkExportMetalDeviceInfoEXT {
    var sType int32
    var pNext *void
    var mtlDevice nint
}

@StructLayout(LayoutKind.Sequential)
internal unsafe struct VkImportMetalTextureInfoEXT {
    var sType int32
    var pNext *void
    var plane uint32
    var mtlTexture nint
}

@StructLayout(LayoutKind.Sequential)
internal unsafe struct VkImportMetalIOSurfaceInfoEXT {
    var sType int32
    var pNext *void
    var ioSurface nint
}

@StructLayout(LayoutKind.Sequential)
internal unsafe struct VkImportMetalSharedEventInfoEXT {
    var sType int32
    var pNext *void
    var mtlSharedEvent nint
}

@StructLayout(LayoutKind.Sequential)
internal unsafe struct VkPhysicalDevicePortabilitySubsetFeaturesKHR {
    var sType int32
    var pNext *void
    var constantAlphaColorBlendFactors uint32
    var events uint32
    var imageViewFormatReinterpretation uint32
    var imageViewFormatSwizzle uint32
    var imageView2DOn3DImage uint32
    var multisampleArrayImage uint32
    var mutableComparisonSamplers uint32
    var pointPolygons uint32
    var samplerMipLodBias uint32
    var separateStencilMaskRef uint32
    var shaderSampleRateInterpolationFunctions uint32
    var tessellationIsolines uint32
    var tessellationPointMode uint32
    var triangleFans uint32
    var vertexAttributeAccessBeyondStride uint32
}

internal sealed class MetalObjectHandle : SafeHandle {
    private let cf bool

    internal init(value nint, isSurface bool = false) : base(nint(0), true) {
        cf = isSurface
        SetHandle(if cf { RetainCf(value) } else { RetainObjc(value) })
    }

    public override prop IsInvalid bool { get -> handle == nint(0) }

    protected override func ReleaseHandle() bool {
        if cf { ReleaseCf(handle) } else { ReleaseObjc(handle) }
        return true
    }

    shared {
        @DllImport("/usr/lib/libobjc.A.dylib", EntryPoint: "objc_retain")
        private func RetainObjc(value nint) nint;
        @DllImport("/usr/lib/libobjc.A.dylib", EntryPoint: "objc_release")
        private func ReleaseObjc(value nint);
        @DllImport("/System/Library/Frameworks/CoreFoundation.framework/CoreFoundation", EntryPoint: "CFRetain")
        private func RetainCf(value nint) nint;
        @DllImport("/System/Library/Frameworks/CoreFoundation.framework/CoreFoundation", EntryPoint: "CFRelease")
        private func ReleaseCf(value nint);
        @DllImport("/usr/lib/libobjc.A.dylib", EntryPoint: "sel_registerName")
        private func Selector(name string) nint;
        @DllImport("/usr/lib/libobjc.A.dylib", EntryPoint: "objc_msgSend")
        private func SendPointer(value nint, selector nint) nint;
        @DllImport("/usr/lib/libobjc.A.dylib", EntryPoint: "objc_msgSend")
        private func SendInteger(value nint, selector nint) uint64;
        @DllImport("/System/Library/Frameworks/IOSurface.framework/IOSurface", EntryPoint: "IOSurfaceGetWidth")
        internal func SurfaceWidth(value nint) uint64;
        @DllImport("/System/Library/Frameworks/IOSurface.framework/IOSurface", EntryPoint: "IOSurfaceGetHeight")
        internal func SurfaceHeight(value nint) uint64;
        @DllImport("/System/Library/Frameworks/IOSurface.framework/IOSurface", EntryPoint: "IOSurfaceGetPlaneCount")
        internal func SurfacePlaneCount(value nint) uint64;
        @DllImport("/System/Library/Frameworks/IOSurface.framework/IOSurface", EntryPoint: "IOSurfaceGetPixelFormat")
        internal func SurfaceFormat(value nint) uint32;
        @DllImport("/System/Library/Frameworks/IOSurface.framework/IOSurface", EntryPoint: "IOSurfaceGetBytesPerElement")
        internal func SurfaceElementBytes(value nint) uint64;

        internal func Pointer(value nint, selector string) nint -> SendPointer(value, Selector(selector))
        internal func Integer(value nint, selector string) uint64 -> SendInteger(value, Selector(selector))
        internal func SameDevice(value nint, device nint) bool ->
            Integer(Pointer(value, "device"), "registryID") == Integer(device, "registryID")
    }
}
