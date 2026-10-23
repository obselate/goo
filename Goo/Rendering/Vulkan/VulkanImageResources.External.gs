package Goo

import System
import System.Collections.Generic
import System.Threading

internal unsafe partial class VulkanImageResources {
    private var externalFrameCount int32
    private var externalSlots List[int32]?

    internal func ReserveExternalFrame() bool {
        if Interlocked.Increment(ref externalFrameCount) <= ExternalImageSession.FrameCapacity { return true }
        Interlocked.Decrement(ref externalFrameCount)
        return false
    }

    internal func ReleaseExternalFrame() { Interlocked.Decrement(ref externalFrameCount) }

    internal func RegisterExternal(id ResourceId, source VulkanResourceSource, samplerId ResourceId,
        frame ExternalFrameLease) VulkanImageResourceLookup {
        EnsureOpen()
        ValidateImageId(id)
        ValidateSamplerId(samplerId)
        if frame.Terminal || frame.Source.Session.IsClosed || frame.Image.Native.Runtime.Generation != generation {
            return VulkanImageResourceLookup{}
        }
        let existing = FindExactIndex(id)
        if existing >= 0 {
            if !entries[existing].GpuPublished { entries[existing] = PublishCompletedImage(existing, entries[existing]) }
            return Lookup(existing, samplerId, VulkanImageSamplerMode.Linear)
        }
        let bytes = uint64(frame.Image.Width) * uint64(frame.Image.Height) * 4uL
        if !TryEnsureResidentCapacity(bytes) || !TryEnsureLogicalSourceCapacity(id, bytes) {
            return VulkanImageResourceLookup{}
        }
        let index = FindEmptyIndex()
        EnsureDescriptorSlots(index)
        let logical = PrepareLogicalRegistration(id, source)
        frame.Retain()
        var entry = VulkanImageResourceEntry{
            Id: id, ProviderId: source.ProviderId, SourceId: source.SourceId,
            Width: uint32(frame.Width), Height: uint32(frame.Height), Bytes: bytes,
            SamplerId: samplerId, SamplerMode: VulkanImageSamplerMode.Linear,
            State: VulkanImageResourceState.Resident, Image: frame.Image.Native.Normalization?.Image ?? frame.Image.Native.Image,
            ImageView: frame.Image.Native.Normalization?.View
                ?? (if frame.Description.AlphaMode == ExternalImageAlphaMode.Opaque { frame.Image.Native.OpaqueView } else { frame.Image.Native.View }),
            External: frame,
            ImageLayout: VkConstants.VK_IMAGE_LAYOUT_SHADER_READ_ONLY_OPTIMAL, LastTouch: TouchValue(),
        }
        CommitLogicalRegistration(logical, index, id, bytes, source, false)
        entries[index] = entry
        externalSlots ??= List[int32](ExternalImageSession.FrameCapacity)
        externalSlots?.Add(index)
        if index >= entryLimit { entryLimit = index + 1 }
        liveCount++
        residentBytes += bytes
        entry = PublishCompletedImage(index, entry)
        entries[index] = entry
        return Lookup(index, samplerId, VulkanImageSamplerMode.Linear)
    }

    internal func RecordExternalAcquires(command VkCommandBuffer) {
        guard let slots = externalSlots else { return }
        for position in 0 ... slots.Count {
            let entry = entries[slots[position]]
            if entry.RecordingUseCount == 0 { continue }
            guard let frame = entry.External else { continue }
            if frame.Acquired || frame.AcquireCommand == command { continue }
            ExternalImageSession.RecordOwnership(command, dispatch, frame,
                frame.Image.Native.Runtime.GraphicsFamilyIndex, true)
            frame.Image.Native.Normalization?.Record(command)
            frame.AcquireCommand = command
        }
    }

    internal func AppendExternalWaits(mailbox VulkanQueueMailbox, command VkCommandBuffer) {
        guard let slots = externalSlots else { return }
        for position in 0 ... slots.Count {
            let entry = entries[slots[position]]
            guard let frame = entry.External else { continue }
            if frame.AcquireCommand == command && !frame.Acquired && frame.ReadySemaphore != 0uL {
                mailbox.AddExternalWait(frame.ReadySemaphore, frame.Sync.Value, frame)
            }
        }
    }

    internal func AcceptExternalAcquires(command VkCommandBuffer, serial uint64) {
        guard let slots = externalSlots else { return }
        for position in 0 ... slots.Count {
            let entry = entries[slots[position]]
            guard let frame = entry.External else { continue }
            if frame.AcquireCommand == command && !frame.Acquired {
                frame.Acquired = true
                frame.LastUse = serial
            }
        }
    }

    internal func CollectCompletedExternal() {
        var runtime VulkanSharedLease?
        guard let slots = externalSlots else { return }
        for position in 0 ... slots.Count {
            let entry = entries[slots[position]]
            if let frame = entry.External {
                runtime = frame.Image.Native.Runtime
                if frame.Retiring && !entry.PendingRetire && entry.State != VulkanImageResourceState.Retiring {
                    Retire(entry.Id, generation, highestCompletedFence)
                }
            }
        }
        if let current = runtime {
            if current.GetCompletedGraphicsSubmissionSerial(out var completed) == VkConstants.VK_SUCCESS { Collect(completed) }
        }
    }

    internal func RemoveExternalSession(session ExternalImageSession, lost bool) {
        for index in 0 ... entries.Length {
            let entry = entries[index]
            guard let frame = entry.External else { continue }
            if !Object.ReferenceEquals(frame.Source.Session, session) { continue }
            if entry.RecordingUseCount != 0 && !lost { throw InvalidOperationException("External image still has an unsubmitted recording") }
            let logical = LogicalIndexForPhysical(index, entry)
            if entry.State != VulkanImageResourceState.Retiring {
                RetireDescriptors(entry, entry.LastUseFence)
                RetireLogical(logical)
            }
            frame.Release()
            externalSlots?.Remove(index)
            CompleteLogicalRetirement(logical, entry)
            currentReferenceCounts[index] = 0
            entries[index] = VulkanImageResourceEntry{}
            liveCount--
            residentBytes -= entry.Bytes
        }
    }
}
