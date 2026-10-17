package Goo

import System
import System.Diagnostics
import System.Threading

internal enum FrameTraceKind {
    Duration;
    Instant;
    Counter;
    ResourceBaseline;
    ResourceLifecycle;
    Metadata;
    Gap;
    End
}

internal data struct FrameTraceContext {
    internal var WindowId string?
    internal var PumpId uint64
    internal var FrameId uint64
    internal var SubmissionId uint64
    internal var SceneVersion uint64
    internal var DeviceId uint64
    internal var DeviceGeneration uint64
    internal var Generation uint64
    internal var ImageIndex uint32?
}

internal data struct FrameTraceRecord {
    internal var Seq int64
    internal var Kind FrameTraceKind
    internal var Ticks int64
    internal var EndTicks int64
    internal var ThreadId int32?
    internal var Context FrameTraceContext
    internal var EventId uint64
    internal var Category uint64
    internal var ResourceId uint64
    internal var ParentId uint64
    internal var ResourceGeneration uint64
    internal var ResourceKind int32?
    internal var OwnerKind int32?
    internal var Result int32
    internal var AllocatedBytes int64?
    internal var Value0 uint64?
    internal var Value1 uint64?
    internal var GpuElapsedNs uint64?
    internal var PayloadBytes uint64?
    internal var RequirementBytes uint64?
    internal var PlacementBytes uint64?
    internal var BlockBytes uint64?
    internal var X int32?
    internal var Y int32?
    internal var Width int32?
    internal var Height int32?
    internal var MemoryType int32?
    internal var HeapIndex int32?
    internal var HeapFlags uint64?
    internal var Dedicated bool?
    internal var SampleTicks int64?
    internal var GcIndex int64?
    internal var Source string?
    internal var Validity string?
    internal var Name string?
    internal var Unit string?
}

internal partial class FrameRecorder {
    internal const DefaultBufferBytes int32 = 16 * 1024 * 1024
    internal const MaxBatchBytes int32 = 256 * 1024
    internal const RecordBudgetBytes int32 = 512
    internal const WireRecordBudgetBytes int32 = 4096
    private let gate object = Object()
    private let records[]FrameTraceRecord
    internal let TraceId string = Guid.NewGuid().ToString("N")
    internal let Origin int64 = Stopwatch.GetTimestamp()
    internal let StartedUtc string = DateTime.UtcNow.ToString("O")
    internal let BufferBytes int32
    private var owner Guid
    private var head int32
    private var count int32
    private var nextSequence int64
    private var pumpId int64
    private var lost int64
    private var dropped int64
    private var complete bool
    private var partial bool
    private var delivered int64
    private var acknowledged int64

    shared {
        private var current FrameRecorder? = if Environment.GetEnvironmentVariable("GOO_PROFILE_START") == "1" {
            FrameRecorder(Guid.Empty, DefaultBufferBytes)
        } else {
            nil
        }

        internal prop Current FrameRecorder? {
            get -> Volatile.Read(&current)
        }

        internal func Start(client Guid, bufferBytes int32) FrameRecorder? {
            lock typeof(FrameRecorder) {
                if let current = Current {
                    if current.owner != Guid.Empty {
                        return nil
                    }
                    current.owner = client
                    return current
                }
                let created = FrameRecorder(client, bufferBytes)
                Volatile.Write(&current, created)
                return created
            }
        }
    }

    private init(client Guid, bufferBytes int32) {
        owner = client
        BufferBytes = Math.Clamp(bufferBytes, 64 * 1024, DefaultBufferBytes)
        records = [BufferBytes / RecordBudgetBytes]FrameTraceRecord
        Publish(
            FrameTraceRecord{
                Kind: FrameTraceKind.Metadata,
                Name: "cpu.stopwatch",
                Source: "Stopwatch",
                Validity: "available",
                Value0: uint64(Stopwatch.Frequency)
            }
        )
        StartSamples()
    }

    internal func Owns(client Guid) bool -> owner == client

    internal func NextPump() uint64 -> uint64(Interlocked.Increment(&pumpId))

    internal func Duration(
        eventId uint64,
        category uint64,
        context FrameTraceContext,
        start int64,
        end int64,
        bytes int64? = nil,
        result int32 = 0,
        source string? = nil
    ) {
        if start < Origin || end < start {
            return
        }
        if !Object.ReferenceEquals(Current, this) {
            return
        }
        Publish(
            FrameTraceRecord{
                Kind: FrameTraceKind.Duration,
                Ticks: start - Origin,
                EndTicks: end - Origin,
                ThreadId: Environment.CurrentManagedThreadId,
                Context: context,
                EventId: eventId,
                Category: category,
                AllocatedBytes: bytes,
                Result: result,
                Source: source
            }
        )
    }

    internal func Instant(
        eventId uint64,
        category uint64,
        context FrameTraceContext,
        result int32 = 0,
        value0 uint64? = nil,
        value1 uint64? = nil,
        source string? = nil
    ) {
        if !Object.ReferenceEquals(Current, this) {
            return
        }
        Publish(
            FrameTraceRecord{
                Kind: FrameTraceKind.Instant,
                Ticks: Stopwatch.GetTimestamp() - Origin,
                ThreadId: Environment.CurrentManagedThreadId,
                Context: context,
                EventId: eventId,
                Category: category,
                Result: result,
                Value0: value0,
                Value1: value1,
                Source: source
            }
        )
    }

    internal func Publish(value FrameTraceRecord) {
        lock gate {
            if complete || (stopping != 0 && value.Kind != FrameTraceKind.Counter) {
                return
            }
            flushGap()
            if count >= records.Length - 2 {
                lost++
                return
            }
            put(value)
        }
    }

    private func put(value FrameTraceRecord) {
        nextSequence++
        var record = value
        record.Seq = nextSequence
        records[(head + count) % records.Length] = record
        count++
    }

    private func flushGap() {
        if count >= records.Length - 2 {
            return
        }
        let missing = lost
        lost = 0L
        if missing == 0L {
            return
        }
        dropped = dropped + missing
        baselineVersion++
        put(
            FrameTraceRecord{
                Kind: FrameTraceKind.Gap,
                Ticks: Stopwatch.GetTimestamp() - Origin,
                Value0: uint64(missing),
                Validity: "unknown-after-gap"
            }
        )
    }

    internal func Stop(isPartial bool) {
        lock typeof(FrameRecorder) {
            lock gate {
                if complete || stopping != 0 { return }
                if Object.ReferenceEquals(Current, this) {
                    Instant(VulkanDiagnosticEventIds.None, VulkanDiagnosticCategories.Runtime,
                        FrameTraceContext{}, source: "recording.stop")
                    Volatile.Write(&current, nil)
                }
                partial = isPartial
                Volatile.Write(&stopping, 1)
                sampleWake.Set()
            }
        }
    }

    private func FinishStop() {
        lock gate {
            if complete { return }
            for pending in pendingGpu.Values {
                var unavailable = pending
                unavailable.Ticks = Stopwatch.GetTimestamp() - Origin
                Publish(unavailable)
            }
            pendingGpu.Clear()
            complete = true
            let missing = lost
            lost = 0L
            dropped = dropped + missing
            if missing > 0L {
                put(FrameTraceRecord{
                    Kind: FrameTraceKind.Gap, Ticks: Stopwatch.GetTimestamp() - Origin,
                    Value0: uint64(missing), Validity: "unknown-after-gap",
                })
            }
            put(FrameTraceRecord{
                Kind: FrameTraceKind.End, Ticks: Stopwatch.GetTimestamp() - Origin,
                Validity: if partial { "partial" } else { "complete" },
            })
        }
    }

    internal func Read(
        afterSeq int64,
        maxRecords int32,
        out nextSeq int64,
        out more bool,
        out state string,
        out droppedCount int64
    )[]FrameTraceRecord {
        lock gate {
            if afterSeq < acknowledged || afterSeq > delivered {
                throw ArgumentException("afterSeq must acknowledge a previously delivered sequence.")
            }
            acknowledged = afterSeq
            while count > 0 && records[head].Seq <= afterSeq {
                records[head] = FrameTraceRecord{}
                head = (head + 1) % records.Length
                count--
            }
            if !complete {
                flushGap()
            }
            let length = Math.Min(count, maxRecords)
            let result = [length]FrameTraceRecord
            for i in 0 ... Math.Min(count, maxRecords) {
                result[i] = records[(head + i) % records.Length]
            }
            nextSeq = if length > 0 {
                result[length - 1].Seq
            } else {
                afterSeq
            }
            delivered = Math.Max(delivered, nextSeq)
            more = count > maxRecords
            state = if complete {
                if partial {
                    "Partial"
                } else {
                    "Complete"
                }
            } else {
                if stopping != 0 { "Stopping" } else { "Recording" }
            }
            droppedCount = dropped + if complete {
                0L
            } else {
                lost
            }
            return result
        }
    }
}
