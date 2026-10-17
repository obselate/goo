package Goo

import System
import System.Collections.Generic
import System.Diagnostics
import System.IO
import System.Runtime.CompilerServices

internal sealed class FrameResourceIdentity {
    internal let Value uint64
    internal var PayloadBytes uint64?
    internal var Width int32?
    internal var Height int32?
    internal init(value uint64) { Value = value }
}

internal data struct FrameNativeResourceKey(Device uint64, Kind FrameResourceKind, Handle uint64) { }
internal data struct FrameGpuStageKey(Device uint64, Generation uint64, Submission uint64, Event uint64) { }

internal partial class FrameRecorder {
    private const MaximumResourceIdentities int32 = 8192
    private let managedResources ConditionalWeakTable[object, FrameResourceIdentity] = ConditionalWeakTable[object, FrameResourceIdentity]()
    private let nativeResources Dictionary[FrameNativeResourceKey, uint64] = Dictionary[FrameNativeResourceKey, uint64]()
    private var managedIdentityCount int32
    private let pendingGpu Dictionary[FrameGpuStageKey, FrameTraceRecord] = Dictionary[FrameGpuStageKey, FrameTraceRecord]()
    internal prop AcceptsGpu bool { get -> !System.Threading.Volatile.Read(&complete) }
    private prop PendingGpuCount int32 { get { lock gate { return pendingGpu.Count } } }

    internal func AddGpuStage(context FrameTraceContext, eventId uint64) {
        lock gate {
            if complete { return }
            if pendingGpu.Count >= MaximumResourceIdentities {
                lost++
                return
            }
            pendingGpu[FrameGpuStageKey(context.DeviceId, context.DeviceGeneration, context.SubmissionId, eventId)] = FrameTraceRecord{
                Kind: FrameTraceKind.Counter, Context: context, EventId: eventId,
                Category: VulkanDiagnosticCategories.Timing, Source: "vulkan.timestamp.elapsed",
                Validity: "unavailable", Unit: "ns",
            }
            Publish(FrameTraceRecord{
                Kind: FrameTraceKind.Instant, Ticks: Stopwatch.GetTimestamp() - Origin,
                ThreadId: Environment.CurrentManagedThreadId, Context: context,
                EventId: eventId, Category: VulkanDiagnosticCategories.Timing,
                Source: "vulkan.timestamp.submitted",
            })
        }
    }

    internal func CompleteGpuStage(value FrameTraceRecord) {
        lock gate {
            if complete { return }
            let context = value.Context
            pendingGpu.Remove(FrameGpuStageKey(context.DeviceId, context.DeviceGeneration, context.SubmissionId, value.EventId))
            Publish(value)
        }
    }

    internal func ManagedResource(value object) uint64 -> ManagedResource(value, out var created)

    internal func ManagedResource(value object, out created bool) uint64 -> ManagedIdentity(value, out created)?.Value ?? 0uL

    internal func ManagedIdentity(value object, out created bool) FrameResourceIdentity? {
        created = false
        if !Object.ReferenceEquals(Current, this) { return nil }
        lock gate {
            if managedResources.TryGetValue(value, out var found) { return found }
            if managedIdentityCount >= MaximumResourceIdentities {
                lost++
                return nil
            }
            let identity = FrameResourceIdentity(ResourceIdentity())
            managedResources.Add(value, identity)
            managedIdentityCount++
            created = true
            return identity
        }
    }

    internal func NativeResource(kind FrameResourceKind, device uint64, handle uint64, remove bool = false) uint64 {
        if handle == 0uL || !Object.ReferenceEquals(Current, this) { return 0uL }
        lock gate {
            let key = FrameNativeResourceKey(device, kind, handle)
            if nativeResources.TryGetValue(key, out var identity) {
                if remove { nativeResources.Remove(key) }
                return identity
            }
            if nativeResources.Count >= MaximumResourceIdentities {
                lost++
                return 0uL
            }
            let created = ResourceIdentity()
            if !remove { nativeResources.Add(key, created) }
            return created
        }
    }

    internal func Resource(kind FrameResourceKind, id uint64, eventId uint64, source string,
        name string? = nil, bytes uint64? = nil, width int32? = nil, height int32? = nil,
        device uint64 = 0uL, parent uint64 = 0uL, baseline bool = false, result int32 = 0,
        deviceGeneration uint64 = 0uL, submission uint64 = 0uL) {
        if !Object.ReferenceEquals(Current, this) || id == 0uL { return }
        let ticks = Stopwatch.GetTimestamp() - Origin
        if let label = name {
            let basename = Path.GetFileName(label)
            Publish(FrameTraceRecord{
                Kind: FrameTraceKind.Metadata, Ticks: ticks, ResourceId: id,
                ResourceGeneration: 1uL, ResourceKind: int32(kind),
                Name: if basename.Length > 128 { basename.Substring(0, 128) } else { basename },
                Source: "resource.name", Validity: "available",
            })
        }
        Publish(FrameTraceRecord{
            Kind: if baseline { FrameTraceKind.ResourceBaseline } else { FrameTraceKind.ResourceLifecycle },
            Ticks: ticks, ThreadId: Environment.CurrentManagedThreadId,
            Context: FrameTraceContext{DeviceId: device, DeviceGeneration: deviceGeneration, SubmissionId: submission}, EventId: eventId,
            Category: VulkanDiagnosticCategories.Resource, ResourceId: id, ParentId: parent,
            ResourceGeneration: 1uL, ResourceKind: int32(kind),
            PayloadBytes: bytes, Width: width, Height: height, Source: source,
            Validity: if baseline { "already-live" } else { "available" }, Result: result,
        })
    }

    internal func ResourceDuration(kind FrameResourceKind, id uint64, source string, start int64,
        eventId uint64 = 0uL, bytes uint64? = nil,
        device uint64 = 0uL, result int32 = 0, end int64 = 0L) {
        if !Object.ReferenceEquals(Current, this) || start < Origin { return }
        Publish(FrameTraceRecord{
            Kind: FrameTraceKind.Duration, Ticks: start - Origin, EndTicks: (if end == 0L { Stopwatch.GetTimestamp() } else { end }) - Origin,
            ThreadId: Environment.CurrentManagedThreadId, Context: FrameTraceContext{DeviceId: device},
            EventId: if eventId == 0uL { VulkanDiagnosticEventIds.ResourceCreate } else { eventId }, Category: VulkanDiagnosticCategories.Resource,
            ResourceId: id, ResourceGeneration: if id != 0uL { 1uL } else { 0uL }, ResourceKind: int32(kind),
            Source: source, PayloadBytes: bytes, Result: result, Validity: if result == 0 { "available" } else { "failed" },
        })
    }
}
