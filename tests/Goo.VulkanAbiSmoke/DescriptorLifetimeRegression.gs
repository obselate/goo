package Goo

import Goo
import System
import System.Runtime.CompilerServices
import System.Runtime.InteropServices

internal unsafe shared class DescriptorLifetimeRegression {
    private let Layout VkDescriptorSetLayout = VkDescriptorSetLayout(uint64(0x12345678))
    private let Pool VkDescriptorPool = VkDescriptorPool(uint64(0x23456789))
    private const FirstSet uint64 = uint64(0x34567890)
    private var valid bool
    private var allocations int32

    internal func Run() {
        valid = true
        allocations = 0
        let dispatch = VkDeviceDispatch{
            vkCreateDescriptorSetLayout: cast[
                unmanaged[Cdecl](
                    VkDevice,
                    *VkDescriptorSetLayoutCreateInfo,
                    *VkAllocationCallbacks,
                    *VkDescriptorSetLayout
                ) -> VkResult
            ](nint(&CreateLayout)),
            vkDestroyDescriptorSetLayout: cast[
                unmanaged[Cdecl](VkDevice, VkDescriptorSetLayout, *VkAllocationCallbacks) -> void
            ](nint(&DestroyLayout)),
            vkCreateDescriptorPool: cast[
                unmanaged[Cdecl](VkDevice, *VkDescriptorPoolCreateInfo, *VkAllocationCallbacks, *VkDescriptorPool) ->
                VkResult
            ](nint(&CreatePool)),
            vkDestroyDescriptorPool: cast[unmanaged[Cdecl](VkDevice, VkDescriptorPool, *VkAllocationCallbacks) -> void](
                nint(&DestroyPool)
            ),
            vkAllocateDescriptorSets: cast[
                unmanaged[Cdecl](VkDevice, *VkDescriptorSetAllocateInfo, *VkDescriptorSet) -> VkResult
            ](nint(&AllocateSets)),
            vkCreateSampler: cast[
                unmanaged[Cdecl](VkDevice, *VkSamplerCreateInfo, *VkAllocationCallbacks, *VkSampler) -> VkResult
            ](nint(&CreateSampler)),
            vkDestroySampler: cast[unmanaged[Cdecl](VkDevice, VkSampler, *VkAllocationCallbacks) -> void](
                nint(&DestroySampler)
            )
        }
        let memory = VkPhysicalDeviceMemoryProperties{
            memoryTypeCount: 1u, memoryTypes_0: VkMemoryType{propertyFlags: VkConstants.VK_MEMORY_PROPERTY_DEVICE_LOCAL_BIT},
            memoryHeapCount: 1u, memoryHeaps_0: VkMemoryHeap{size: 16777216uL, flags: 1u},
        }
        let budget = VulkanMemoryBudgetState(VkPhysicalDevice(nint(1)), VkInstanceDispatch{}, 1u, false)
        using let allocator = VulkanMemoryAllocator(
            VkDevice(nint(1)),
            dispatch,
            memory,
            1u,
            1uL,
            1uL,
            budget,
            nil
        )
        using let resources = VulkanImageResources(
            VkDevice(nint(1)),
            dispatch,
            allocator,
            256,
            256,
            4096,
            4096,
            16,
            nil,
            1,
            nil
        )
        let sets = resources.DescriptorSetsForTests
        for var index = 0; index < sets.Length; index++ {
            valid &= sets[index].Raw == FirstSet + uint64(index)
        }
        if !valid || allocations != 1 || sets.Length != 512 {
            throw InvalidOperationException("Descriptor inputs or outputs changed during compacting GC")
        }
        Console.WriteLine("DESCRIPTOR_GC_GATE sets=512 compactingCollections=2 stableInputs=1 stableOutputs=1")
    }

    @UnmanagedCallersOnly(CallConvs = []Type{typeof(CallConvCdecl)})
    private func CreateLayout(
        device VkDevice,
        info *VkDescriptorSetLayoutCreateInfo,
        callbacks *VkAllocationCallbacks,
        layout *VkDescriptorSetLayout
    ) VkResult {
        *layout = DescriptorLifetimeRegression.Layout
        return VkConstants.VK_SUCCESS
    }

    @UnmanagedCallersOnly(CallConvs = []Type{typeof(CallConvCdecl)})
    private func CreatePool(
        device VkDevice,
        info *VkDescriptorPoolCreateInfo,
        callbacks *VkAllocationCallbacks,
        pool *VkDescriptorPool
    ) VkResult {
        GC.Collect(GC.MaxGeneration, GCCollectionMode.Forced, true, true)
        valid &= info -> maxSets == uint32(512) &&
            info -> poolSizeCount == uint32(1) &&
            info -> pPoolSizes[0].descriptorCount == uint32(512)
        *pool = Pool
        return VkConstants.VK_SUCCESS
    }

    @UnmanagedCallersOnly(CallConvs = []Type{typeof(CallConvCdecl)})
    private func AllocateSets(device VkDevice, info *VkDescriptorSetAllocateInfo, sets *VkDescriptorSet) VkResult {
        var sets = sets
        GC.Collect(GC.MaxGeneration, GCCollectionMode.Forced, true, true)
        valid &= info -> descriptorPool == Pool && info -> descriptorSetCount == uint32(512)
        for var index = 0; int64(index) < int64(info -> descriptorSetCount); index++ {
            valid &= info -> pSetLayouts[index] == DescriptorLifetimeRegression.Layout
            sets[index] = VkDescriptorSet(FirstSet + uint64(index))
        }
        allocations++
        return VkConstants.VK_SUCCESS
    }

    @UnmanagedCallersOnly(CallConvs = []Type{typeof(CallConvCdecl)})
    private func CreateSampler(
        device VkDevice,
        info *VkSamplerCreateInfo,
        callbacks *VkAllocationCallbacks,
        sampler *VkSampler
    ) VkResult {
        *sampler = VkSampler(uint64(1))
        return VkConstants.VK_SUCCESS
    }

    @UnmanagedCallersOnly(CallConvs = []Type{typeof(CallConvCdecl)})
    private func DestroyLayout(device VkDevice, layout VkDescriptorSetLayout, callbacks *VkAllocationCallbacks) { }

    @UnmanagedCallersOnly(CallConvs = []Type{typeof(CallConvCdecl)})
    private func DestroyPool(device VkDevice, pool VkDescriptorPool, callbacks *VkAllocationCallbacks) { }

    @UnmanagedCallersOnly(CallConvs = []Type{typeof(CallConvCdecl)})
    private func DestroySampler(device VkDevice, sampler VkSampler, callbacks *VkAllocationCallbacks) { }
}
