using System;
using System.Reflection;
using System.Runtime.CompilerServices;
using System.Runtime.InteropServices;
using Goo;
using Xunit;

public sealed class VulkanTextFrameDataCopyTests
{
    [Fact]
    public void CopySegmentRecordsCopiesRequestedBytesAndPreservesGuard()
    {
        const int recordBytes = 112;
        const int targetBytes = 128;
        const byte guard = 0xCC;

        var frameData = (VulkanTextFrameData)RuntimeHelpers.GetUninitializedObject(typeof(VulkanTextFrameData));
        var slot = (VulkanTextFrameSlot)RuntimeHelpers.GetUninitializedObject(typeof(VulkanTextFrameSlot));
        var allocation = (VulkanMemoryAllocation)RuntimeHelpers.GetUninitializedObject(typeof(VulkanMemoryAllocation));
        var segment = new VulkanRetainedTextSegment(2);
        var recordsField = typeof(VulkanRetainedTextSegment).GetField(
            "Records", BindingFlags.Instance | BindingFlags.Public | BindingFlags.NonPublic)!;
        var records = (Array)recordsField.GetValue(segment)!;
        var buffersField = typeof(VulkanTextFrameSlot).GetField(
            "Buffers", BindingFlags.Instance | BindingFlags.Public | BindingFlags.NonPublic)!;
        var allocationField = buffersField.FieldType.GetField(
            "StagingAllocation", BindingFlags.Instance | BindingFlags.Public | BindingFlags.NonPublic)!;
        var mappedField = typeof(VulkanMemoryAllocation).GetField(
            "mapped", BindingFlags.Instance | BindingFlags.Public | BindingFlags.NonPublic)!;
        var copyMethod = typeof(VulkanTextFrameData).GetMethod(
            "CopySegmentRecords", BindingFlags.Instance | BindingFlags.NonPublic)!;
        var firstRecord = Pattern(recordBytes, 0x10);
        var secondRecord = Pattern(recordBytes, 0xA0);
        var target = Marshal.AllocHGlobal(targetBytes);
        var recordsHandle = GCHandle.Alloc(records, GCHandleType.Pinned);
        try
        {
            var source = recordsHandle.AddrOfPinnedObject();
            Marshal.Copy(firstRecord, 0, source, recordBytes);
            Marshal.Copy(secondRecord, 0, IntPtr.Add(source, recordBytes), recordBytes);
            mappedField.SetValue(allocation, target);
            var buffers = buffersField.GetValue(slot)!;
            allocationField.SetValue(buffers, allocation);
            buffersField.SetValue(slot, buffers);
            Marshal.Copy(new byte[targetBytes], 0, target, targetBytes);
            for (var index = recordBytes; index < targetBytes; index++)
            {
                Marshal.WriteByte(target, index, guard);
            }

            copyMethod.Invoke(frameData, new object[] { slot, segment, 0, 1 });

            var copied = new byte[targetBytes];
            Marshal.Copy(target, copied, 0, targetBytes);
            for (var index = 0; index < recordBytes; index++)
            {
                Assert.Equal(firstRecord[index], copied[index]);
            }
            for (var index = recordBytes; index < targetBytes; index++)
            {
                Assert.Equal(guard, copied[index]);
            }
        }
        finally
        {
            recordsHandle.Free();
            Marshal.FreeHGlobal(target);
            GC.SuppressFinalize(frameData);
            GC.SuppressFinalize(slot);
        }
    }

    private static byte[] Pattern(int length, byte seed)
    {
        var result = new byte[length];
        for (var index = 0; index < length; index++)
        {
            result[index] = (byte)(seed + index);
        }
        return result;
    }
}
