using System;
using System.Runtime.CompilerServices;
using System.Runtime.InteropServices;
using Goo;

internal static unsafe class DescriptorLifetimeRegression
{
    private const ulong Layout = 0x12345678;
    private const ulong Pool = 0x23456789;
    private const ulong FirstSet = 0x34567890;
    private static bool valid;
    private static int allocations;

    internal static void Run()
    {
        valid = true;
        allocations = 0;
        var dispatch = new VkDeviceDispatch
        {
            vkCreateDescriptorSetLayout = &CreateLayout,
            vkDestroyDescriptorSetLayout = &DestroyLayout,
            vkCreateDescriptorPool = &CreatePool,
            vkDestroyDescriptorPool = &DestroyPool,
            vkAllocateDescriptorSets = &AllocateSets,
            vkCreateSampler = &CreateSampler,
            vkDestroySampler = &DestroySampler
        };
        using var resources = new VulkanImageResources(
            1, dispatch, null!, 256, 256, 4096, 4096, 4096, 4096, 16, null, 1, null);
        var sets = resources.DescriptorSetsForTests;
        for (var index = 0; index < sets.Length; index++)
            valid &= sets[index] == FirstSet + (ulong)index;
        if (!valid || allocations != 1 || sets.Length != 512)
            throw new InvalidOperationException("Descriptor inputs or outputs changed during compacting GC");
        Console.WriteLine("DESCRIPTOR_GC_GATE sets=512 compactingCollections=2 stableInputs=1 stableOutputs=1");
    }

    [UnmanagedCallersOnly(CallConvs = [typeof(CallConvCdecl)])]
    private static int CreateLayout(nint device, VkDescriptorSetLayoutCreateInfo* info,
        VkAllocationCallbacks* callbacks, ulong* layout)
    {
        *layout = Layout;
        return 0;
    }

    [UnmanagedCallersOnly(CallConvs = [typeof(CallConvCdecl)])]
    private static int CreatePool(nint device, VkDescriptorPoolCreateInfo* info,
        VkAllocationCallbacks* callbacks, ulong* pool)
    {
        GC.Collect(GC.MaxGeneration, GCCollectionMode.Forced, true, true);
        valid &= info->maxSets == 512 && info->poolSizeCount == 1
            && info->pPoolSizes[0].descriptorCount == 512;
        *pool = Pool;
        return 0;
    }

    [UnmanagedCallersOnly(CallConvs = [typeof(CallConvCdecl)])]
    private static int AllocateSets(nint device, VkDescriptorSetAllocateInfo* info, ulong* sets)
    {
        GC.Collect(GC.MaxGeneration, GCCollectionMode.Forced, true, true);
        valid &= info->descriptorPool == Pool && info->descriptorSetCount == 512;
        for (var index = 0; index < info->descriptorSetCount; index++)
        {
            valid &= info->pSetLayouts[index] == Layout;
            sets[index] = FirstSet + (ulong)index;
        }
        allocations++;
        return 0;
    }

    [UnmanagedCallersOnly(CallConvs = [typeof(CallConvCdecl)])]
    private static int CreateSampler(nint device, VkSamplerCreateInfo* info,
        VkAllocationCallbacks* callbacks, ulong* sampler)
    {
        *sampler = 1;
        return 0;
    }

    [UnmanagedCallersOnly(CallConvs = [typeof(CallConvCdecl)])]
    private static void DestroyLayout(nint device, ulong layout, VkAllocationCallbacks* callbacks) { }

    [UnmanagedCallersOnly(CallConvs = [typeof(CallConvCdecl)])]
    private static void DestroyPool(nint device, ulong pool, VkAllocationCallbacks* callbacks) { }

    [UnmanagedCallersOnly(CallConvs = [typeof(CallConvCdecl)])]
    private static void DestroySampler(nint device, ulong sampler, VkAllocationCallbacks* callbacks) { }
}
