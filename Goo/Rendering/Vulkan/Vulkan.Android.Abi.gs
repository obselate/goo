package Goo

import System.Runtime.InteropServices

@StructLayout(LayoutKind.Sequential)
internal unsafe struct VkPhysicalDeviceMaintenance6Properties {
    var sType int32
    var pNext *void
    var blockTexelViewCompatibleMultipleLayers uint32
    var maxCombinedImageSamplerDescriptorCount uint32
    var fragmentShadingRateClampCombinerInputs uint32
}

@StructLayout(LayoutKind.Sequential)
internal unsafe struct VkPhysicalDeviceSamplerYcbcrConversionFeatures {
    var sType int32
    var pNext *void
    var samplerYcbcrConversion uint32
}

@StructLayout(LayoutKind.Sequential)
internal unsafe struct VkAndroidHardwareBufferPropertiesANDROID {
    var sType int32
    var pNext *void
    var allocationSize uint64
    var memoryTypeBits uint32
}

@StructLayout(LayoutKind.Sequential)
internal unsafe struct VkAndroidHardwareBufferFormatPropertiesANDROID {
    var sType int32
    var pNext *void
    var format int32
    var externalFormat uint64
    var formatFeatures uint32
    var samplerYcbcrConversionComponents VkComponentMapping
    var suggestedYcbcrModel int32
    var suggestedYcbcrRange int32
    var suggestedXChromaOffset int32
    var suggestedYChromaOffset int32
}

@StructLayout(LayoutKind.Sequential)
internal unsafe struct VkExternalFormatANDROID {
    var sType int32
    var pNext *void
    var externalFormat uint64
}

@StructLayout(LayoutKind.Sequential)
internal unsafe struct VkImportAndroidHardwareBufferInfoANDROID {
    var sType int32
    var pNext *void
    var buffer nint
}

@StructLayout(LayoutKind.Sequential)
internal unsafe struct VkSamplerYcbcrConversionCreateInfo {
    var sType int32
    var pNext *void
    var format int32
    var ycbcrModel int32
    var ycbcrRange int32
    var components VkComponentMapping
    var xChromaOffset int32
    var yChromaOffset int32
    var chromaFilter int32
    var forceExplicitReconstruction uint32
}

@StructLayout(LayoutKind.Sequential)
internal unsafe struct VkSamplerYcbcrConversionInfo {
    var sType int32
    var pNext *void
    var conversion uint64
}

@StructLayout(LayoutKind.Sequential)
internal struct AndroidHardwareBufferDescription {
    var width uint32
    var height uint32
    var layers uint32
    var format uint32
    var usage uint64
    var stride uint32
    var reserved0 uint32
    var reserved1 uint64
}

internal unsafe class AndroidHardwareBuffer {
    shared {
        @DllImport("libandroid.so", EntryPoint: "AHardwareBuffer_describe")
        internal func Describe(buffer nint, description *AndroidHardwareBufferDescription);

        @DllImport("libandroid.so", EntryPoint: "AHardwareBuffer_acquire")
        internal func Acquire(buffer nint);

        @DllImport("libandroid.so", EntryPoint: "AHardwareBuffer_release")
        internal func Release(buffer nint);
    }
}
