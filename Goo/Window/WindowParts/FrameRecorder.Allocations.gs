package Goo

import System
import System.Collections.Generic
import System.Diagnostics
import System.Diagnostics.Tracing
import System.Threading

internal partial class FrameRecorder {
    private var allocationCapture AllocationCapture?

    internal func CaptureAllocations(seconds int32) {
        if AppContext.TryGetSwitch("System.Diagnostics.Tracing.EventSource.IsSupported", out var supported) && !supported {
            Counter("allocation.samples", "unavailable: EventSourceSupport is off", nil,
                Stopwatch.GetTimestamp(), "unavailable", unit: "samples")
            return
        }
        allocationCapture = AllocationCapture(this, Math.Clamp(seconds, 2, 60))
    }
}

internal class AllocationCapture : EventListener {
    private let gate object = Object()
    private let samples Dictionary[string, (uint64, uint64)] = Dictionary[string, (uint64, uint64)]()
    private var recorder FrameRecorder?
    private var timer Timer?
    private var untracked uint64
    private let deadline int64

    internal init(owner FrameRecorder, seconds int32) {
        deadline = Stopwatch.GetTimestamp() + Stopwatch.Frequency * int64(seconds)
        recorder = owner
        timer = Timer(_ -> Dispose(), nil, seconds * 1000, Timeout.Infinite)
    }

    protected override func OnEventSourceCreated(source EventSource) {
        if source.Name == "Microsoft-Windows-DotNETRuntime" {
            EnableEvents(source, EventLevel.Verbose, EventKeywords(1))
        }
    }

    protected override func OnEventWritten(eventData EventWrittenEventArgs) {
        if recorder == nil || Stopwatch.GetTimestamp() > deadline { return }
        if eventData.EventName == "GCStart_V2" {
            guard let owner = recorder, let values = eventData.Payload, let fields = eventData.PayloadNames else { return }
            var generation uint64
            var reason uint64
            for i in 0 ... fields.Count {
                if fields[i] == "Depth" { generation = Convert.ToUInt64(values[i]) }
                if fields[i] == "Reason" { reason = Convert.ToUInt64(values[i]) }
            }
            owner.Publish(FrameTraceRecord{
                Kind: FrameTraceKind.Counter, Ticks: Stopwatch.GetTimestamp() - owner.Origin,
                Name: "gc.start", Source: "GCStart_V2", Unit: "generation,reason",
                Value0: generation, Value1: reason, Validity: "runtime-event",
            })
        }
        if eventData.EventName != "GCAllocationTick_V4" { return }
        guard let payload = eventData.Payload else { return }
        guard let names = eventData.PayloadNames else { return }
        var name string? = nil
        var bytes uint64 = 0uL
        for i in 0 ... names.Count {
            if names[i] == "TypeName" { name = payload[i] as string }
            if names[i] == "AllocationAmount64" { bytes = Convert.ToUInt64(payload[i]) }
        }
        guard let typeName = name else { return }
        lock gate {
            if recorder == nil { return }
            if samples.TryGetValue(typeName, out var value) {
                samples[typeName] = (value.Item1 + bytes, value.Item2 + 1uL)
            } else if samples.Count < 500 {
                samples.Add(typeName, (bytes, 1uL))
            } else {
                untracked++
            }
        }
    }

    public override func Dispose() {
        lock gate {
            if let owner = recorder {
                recorder = nil
                let ticks = Stopwatch.GetTimestamp()
                for pair in samples {
                    owner.Publish(FrameTraceRecord{
                        Kind: FrameTraceKind.Counter, Ticks: ticks - owner.Origin,
                        Name: pair.Key, Source: "GCAllocationTick_V4 samples",
                        Unit: "samples", Validity: "sampled-not-exact",
                        Value0: pair.Value.Item2, Value1: pair.Value.Item1,
                    })
                }
                owner.Counter("allocation.untracked.samples", "500-type bound", untracked, ticks, unit: "samples")
                samples.Clear()
            }
        }
        timer?.Dispose()
        base.Dispose()
    }
}
