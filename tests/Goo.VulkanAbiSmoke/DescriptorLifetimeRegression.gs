package Goo

import Goo
import System
import System.Runtime.CompilerServices
import System.Runtime.InteropServices

internal unsafe shared class DescriptorLifetimeRegression {
    private const Layout uint64 = uint64(0x12345678)
    private const Pool uint64 = uint64(0x23456789)
    private const FirstSet uint64 = uint64(0x34567890)
    private var valid bool
    private var allocations int32

    internal func Run() {
        valid = true
        allocations = 0
        let dispatch = VkDeviceDispatch{
            vkCreateDescriptorSetLayout: cast[
                unmanaged[Cdecl](nint, *VkDescriptorSetLayoutCreateInfo, *VkAllocationCallbacks, *uint64) -> int32
            ](nint(&CreateLayout)),
            vkDestroyDescriptorSetLayout: cast[unmanaged[Cdecl](nint, uint64, *VkAllocationCallbacks) -> void](
                nint(&DestroyLayout)
            ),
            vkCreateDescriptorPool: cast[
                unmanaged[Cdecl](nint, *VkDescriptorPoolCreateInfo, *VkAllocationCallbacks, *uint64) -> int32
            ](nint(&CreatePool)),
            vkDestroyDescriptorPool: cast[unmanaged[Cdecl](nint, uint64, *VkAllocationCallbacks) -> void](
                nint(&DestroyPool)
            ),
            vkAllocateDescriptorSets: cast[unmanaged[Cdecl](nint, *VkDescriptorSetAllocateInfo, *uint64) -> int32](
                nint(&AllocateSets)
            ),
            vkCreateSampler: cast[
                unmanaged[Cdecl](nint, *VkSamplerCreateInfo, *VkAllocationCallbacks, *uint64) -> int32
            ](nint(&CreateSampler)),
            vkDestroySampler: cast[unmanaged[Cdecl](nint, uint64, *VkAllocationCallbacks) -> void](
                nint(&DestroySampler)
            )
        }
        using let resources = VulkanImageResources(1, dispatch, nil, 256, 256, 4096, 4096, 4096, 4096, 16, nil, 1, nil)
        let sets = resources.DescriptorSetsForTests
        for var index = 0; index < sets.Length; index++ {
            valid &= sets[index] == FirstSet + uint64(index)
        }
        if !valid || allocations != 1 || sets.Length != 512 {
            throw InvalidOperationException("Descriptor inputs or outputs changed during compacting GC")
        }
        Console.WriteLine("DESCRIPTOR_GC_GATE sets=512 compactingCollections=2 stableInputs=1 stableOutputs=1")
    }

    @UnmanagedCallersOnly(CallConvs = []Type{typeof(CallConvCdecl)})
    private func CreateLayout(
        device nint,
        info *VkDescriptorSetLayoutCreateInfo,
        callbacks *VkAllocationCallbacks,
        layout *uint64
    ) int32 {
        *layout = DescriptorLifetimeRegression.Layout
        return 0
    }

    @UnmanagedCallersOnly(CallConvs = []Type{typeof(CallConvCdecl)})
    private func CreatePool(
        device nint,
        info *VkDescriptorPoolCreateInfo,
        callbacks *VkAllocationCallbacks,
        pool *uint64
    ) int32 {
        GC.Collect(GC.MaxGeneration, GCCollectionMode.Forced, true, true)
        valid &= info -> maxSets == uint32(512) &&
            info -> poolSizeCount == uint32(1) &&
            info -> pPoolSizes[0].descriptorCount == uint32(512)
        *pool = Pool
        return 0
    }

    @UnmanagedCallersOnly(CallConvs = []Type{typeof(CallConvCdecl)})
    private func AllocateSets(device nint, info *VkDescriptorSetAllocateInfo, sets *uint64) int32 {
        var sets = sets
        GC.Collect(GC.MaxGeneration, GCCollectionMode.Forced, true, true)
        valid &= info -> descriptorPool == Pool && info -> descriptorSetCount == uint32(512)
        for var index = 0; int64(index) < int64(info -> descriptorSetCount); index++ {
            valid &= info -> pSetLayouts[index] == DescriptorLifetimeRegression.Layout
            sets[index] = FirstSet + uint64(index)
        }
        allocations++
        return 0
    }

    @UnmanagedCallersOnly(CallConvs = []Type{typeof(CallConvCdecl)})
    private func CreateSampler(
        device nint,
        info *VkSamplerCreateInfo,
        callbacks *VkAllocationCallbacks,
        sampler *uint64
    ) int32 {
        *sampler = uint64(1)
        return 0
    }

    @UnmanagedCallersOnly(CallConvs = []Type{typeof(CallConvCdecl)})
    private func DestroyLayout(device nint, layout uint64, callbacks *VkAllocationCallbacks) { }

    @UnmanagedCallersOnly(CallConvs = []Type{typeof(CallConvCdecl)})
    private func DestroyPool(device nint, pool uint64, callbacks *VkAllocationCallbacks) { }

    @UnmanagedCallersOnly(CallConvs = []Type{typeof(CallConvCdecl)})
    private func DestroySampler(device nint, sampler uint64, callbacks *VkAllocationCallbacks) { }
}
