package GooDevTools

import System
import System.Collections.Generic
import System.Globalization
import System.Text.Json

internal data struct ProfilerRecord {
    var Sequence int64
    var Kind string
    var Ticks int64
    var EndTicks int64
    var Window string
    var Thread uint64?
    var Pump uint64?
    var Frame uint64?
    var Submission uint64?
    var Device uint64?
    var DeviceGeneration uint64?
    var Scene uint64?
    var Generation uint64?
    var ImageIndex uint64?
    var Event int32
    var Category int32
    var Resource uint64?
    var Parent uint64?
    var ResourceGeneration uint64?
    var ResourceKind uint64?
    var Owner uint64?
    var Result int32
    var Allocated uint64?
    var Value uint64?
    var Value1 uint64?
    var GpuNs uint64?
    var Payload uint64?
    var Requirement uint64?
    var Placement uint64?
    var Block uint64?
    var Width uint64?
    var Height uint64?
    var X int64?
    var Y int64?
    var MemoryType uint64?
    var Heap uint64?
    var HeapFlags uint64?
    var Dedicated bool?
    var SampleTicks int64?
    var GcIndex int64?
    var Name string
    var Source string
    var Unit string
    var Validity string
}

internal class ProfilerLane {
    internal let Name string
    internal let Group string
    internal let Window string
    internal let Records List[int32] = List[int32]()
    internal let PrefixEnd List[int64] = List[int64]()
    internal var Dirty bool

    internal init(name string, group string, window string) {
        Name = name
        Group = group
        Window = window
    }

    internal func Prepare(records List[ProfilerRecord]) {
        if !Dirty {
            return
        }
        Records.Sort((a int32, b int32) -> records[a].Ticks.CompareTo(records[b].Ticks))
        PrefixEnd.Clear()
        var end int64 = 0L
        for index in Records {
            end = Math.Max(end, records[index].EndTicks)
            PrefixEnd.Add(end)
        }
        Dirty = false
    }

    internal func FirstVisible(start int64) int32 {
        var lo = 0
        var hi = PrefixEnd.Count
        while lo < hi {
            let mid = lo + (hi - lo) / 2
            if PrefixEnd[mid] < start {
                lo = mid + 1
            } else {
                hi = mid
            }
        }
        return lo
    }
}

internal class ProfilerTrace {
    internal const BudgetBytes int64 = 128L * 1024L * 1024L
    internal let Records List[ProfilerRecord] = List[ProfilerRecord]()
    internal let Lanes List[ProfilerLane] = List[ProfilerLane]()
    private let lanesByKey Dictionary[string, ProfilerLane] = Dictionary[string, ProfilerLane]()
    private let strings Dictionary[string, string] = Dictionary[string, string]()
    internal let Phases List[string] = List[string]()
    internal let Owners List[string] = List[string]()
    internal let Resources List[string] = List[string]()
    internal let DeviceIds List[uint64] = List[uint64]()
    internal let ResourceNames Dictionary[uint64, string] = Dictionary[uint64, string]()
    internal let ResourceReleased Dictionary[uint64, int64] = Dictionary[uint64, int64]()
    internal let ResourceRetired Dictionary[uint64, int64] = Dictionary[uint64, int64]()
    internal var Id string = ""
    internal var State string = "Starting"
    internal var Reason string = ""
    internal var Process string = ""
    internal var Devices string = ""
    internal var Frequency int64 = 1L
    internal var Origin int64
    internal var Next int64
    internal var LastSequence int64
    internal var End int64
    internal var Dropped uint64
    internal var Partial bool
    internal var BudgetFull bool
    internal var Revision int32
    internal var RetainedBytes int64

    internal prop Active bool {
        get -> State == "Starting" || State == "Recording" || State == "Stopping"
    }

    internal func Start(root JsonElement) {
        Id = Text(root, "traceId")
        State = Text(root, "state")
        if Id == "" || Number(root, "schemaVersion") != 1uL {
            throw InvalidOperationException(
                State == "Busy" ? "Another client is recording this target": "Unsupported profiler trace schema"
            )
        }
        Origin = Int64.Parse(Text(root, "originTicks"), CultureInfo.InvariantCulture)
        Frequency = Int64.Parse(Text(root, "frequency"), CultureInfo.InvariantCulture)
        if Frequency <= 0L {
            throw InvalidOperationException("Invalid profiler clock frequency")
        }
        Process = Text(root, "pid") + " / " + Text(root, "sessionId")
        Devices = root.GetProperty("devices").GetRawText()
        for device in root.GetProperty("devices").EnumerateArray() {
            if let id = Number(device, "id") {
                DeviceIds.Add(id)
            }
        }
        Names(root, "phaseNames", Phases)
        Names(root, "ownerKinds", Owners)
        Names(root, "resourceKinds", Resources)
        Revision++
    }

    internal func Append(root JsonElement) {
        if Text(root, "traceId") != Id {
            throw InvalidOperationException("Trace identity changed")
        }
        for item in root.GetProperty("records").EnumerateArray() {
            let seq = Int64.Parse(Text(item, "seq"), CultureInfo.InvariantCulture)
            if seq <= LastSequence {
                throw InvalidOperationException("Repeated or unordered profiler record")
            }
            LastSequence = seq
            if BudgetFull {
                continue
            }
            if RetainedBytes + 1536L > BudgetBytes || strings.Count >= 8192 {
                BudgetFull = true
                Partial = true
                Reason = "UI trace budget reached. Recording stopped. The retained prefix is partial."
                continue
            }
            let ticks = Int64.Parse(Text(item, "ticks"), CultureInfo.InvariantCulture)
            let record = ProfilerRecord{
                Sequence: seq,
                Kind: Intern(Text(item, "kind")),
                Ticks: ticks,
                EndTicks: Text(item, "endTicks") == "" ? ticks: Int64.Parse(
                    Text(item, "endTicks"),
                    CultureInfo.InvariantCulture
                ),
                Window: Intern(Text(item, "windowId")),
                Thread: Number(item, "threadId"),
                Pump: Number(item, "pumpId"),
                Frame: Number(item, "frameId"),
                Submission: Number(item, "submissionId"),
                Device: Number(item, "deviceId"),
                DeviceGeneration: Number(item, "deviceGeneration"),
                Scene: Number(item, "sceneVersion"),
                Generation: Number(item, "generation"),
                ImageIndex: Number(item, "imageIndex"),
                Event: Int32.Parse(Text(item, "eventId"), CultureInfo.InvariantCulture),
                Category: Int32.Parse(Text(item, "category"), CultureInfo.InvariantCulture),
                Resource: Number(item, "resourceId"),
                Parent: Number(item, "parentId"),
                ResourceGeneration: Number(item, "resourceGeneration"),
                ResourceKind: Number(item, "resourceKind"),
                Owner: Number(item, "ownerKind"),
                Result: item.GetProperty("result").GetInt32(),
                Allocated: Number(item, "allocatedBytes"),
                Value: Number(item, "value0"),
                Value1: Number(item, "value1"),
                GpuNs: Number(item, "gpuElapsedNs"),
                Payload: Number(item, "payloadBytes"),
                Requirement: Number(item, "requirementBytes"),
                Placement: Number(item, "placementBytes"),
                Block: Number(item, "blockBytes"),
                Width: Number(item, "width"),
                Height: Number(item, "height"),
                X: Signed(item, "x"),
                Y: Signed(item, "y"),
                MemoryType: Number(item, "memoryType"),
                Heap: Number(item, "heapIndex"),
                HeapFlags: Number(item, "heapFlags"),
                Dedicated: item.GetProperty("dedicated").ValueKind == JsonValueKind.Null ? nil: item.GetProperty(
                    "dedicated"
                )
                    .GetBoolean(),
                SampleTicks: Signed(item, "sampleTicks"),
                GcIndex: Signed(item, "gcIndex"),
                Name: Intern(Text(item, "name")),
                Source: Intern(Text(item, "source")),
                Unit: Intern(Text(item, "unit")),
                Validity: Intern(Text(item, "validity")),
            }
            if record.Ticks < 0L || record.EndTicks < record.Ticks {
                throw InvalidOperationException("Invalid profiler interval")
            }
            let index = Records.Count
            Records.Add(record)
            RetainedBytes += 1536L
            End = Math.Max(End, record.EndTicks)
            if let resource = record.Resource {
                if record.Name != "" {
                    ResourceNames[resource] = record.Name
                }
                if record.Kind == "resourcelifecycle" {
                    if record.Event == 203 || record.Event == 221 || record.Event == 121 {
                        ResourceReleased[resource] = record.Ticks
                    }
                    if record.Event == 202 {
                        ResourceRetired[resource] = record.Ticks
                    }
                }
            }
            AddLane(index, record)
            if record.Kind == "gap" {
                Partial = true
            }
        }
        Next = Int64.Parse(Text(root, "nextSeq"), CultureInfo.InvariantCulture)
        State = Text(root, "state")
        Dropped = Number(root, "dropped") ?? 0uL
        Partial = Partial || root.GetProperty("partial").GetBoolean()
        for lane in Lanes {
            lane.Prepare(Records)
        }
        Revision++
    }

    private func AddLane(index int32, record ProfilerRecord) {
        let group = record.Source.StartsWith("vulkan.timestamp", StringComparison.Ordinal) ? "GPU"
        : record.Kind == "counter" ? "Memory"
        : record.Kind == "resourcebaseline" ||
            record.Kind == "resourcelifecycle" ||
            record.Resource != nil ? "Resources"
        : record.Source.StartsWith("submit.", StringComparison.Ordinal) || record.Source.StartsWith(
            "present.",
            StringComparison.Ordinal
        )
        || record.Source.StartsWith("graphics.", StringComparison.Ordinal) || record.Source.StartsWith(
            "vkQueue",
            StringComparison.Ordinal
        ) ? "Queue"
        : record.Category == 0 ? (record.Event == 0 ? "Frames": "CPU")
        : record.Kind == "duration" ? "CPU": "Frames"
        let name = group == "Memory" ? record.Name + (record.Owner == nil ? "": " / " + OwnerName(record.Owner))
        + (record.Device == nil ? "": " / device " + record.Device.ToString())
        + (record.Heap == nil ? "": " / heap " + record.Heap.ToString())
        : group == "GPU" ? "GPU stages (unaligned, per submission)"
        : group == "Resources" ? ResourceName(record.ResourceKind) + " / " + OwnerName(record.Owner)
        : record.Category == 0 ? PhaseName(record.Event)
        : group == "CPU" ? record.Source + " / event " + record.Event.ToString()
        : group == "Queue" ? record.Source: record.Source == "" ? record.Kind: record.Source
        let window = group == "Memory" || group == "Resources" ? "": record.Window
        let key = group + ":" + name + ":" + window
        if !lanesByKey.TryGetValue(key, out var lane) {
            lane = ProfilerLane(name, group, window)
            lanesByKey.Add(key, lane)
            Lanes.Add(lane)
        }
        lane.Records.Add(index)
        lane.Dirty = true
    }

    internal func PhaseName(index int32) string -> index >= 0 &&
        index < Phases.Count ? Phases[index]: "Phase " +
        index.ToString(CultureInfo.InvariantCulture)

    internal func OwnerName(index uint64?) string {
        guard let value = index else {
            return "Unknown owner"
        }
        return value < uint64(Owners.Count) ? Owners[int32(value)]: "Unknown owner"
    }

    internal func ResourceName(index uint64?) string {
        guard let value = index else {
            return "Resource"
        }
        return value < uint64(Resources.Count) ? Resources[int32(value)]: "Resource"
    }

    internal func Milliseconds(ticks int64) float64 -> float64(ticks) * 1000.0 / float64(Frequency)

    private func Intern(value string) string {
        if strings.TryGetValue(value, out var existing) {
            return existing
        }
        strings.Add(value, value)
        RetainedBytes += int64(value.Length) * 2L + 64L
        return value
    }

    shared {
        internal func Text(root JsonElement, name string) string {
            if !root.TryGetProperty(name, out var value) || value.ValueKind == JsonValueKind.Null {
                return ""
            }
            return value.ValueKind == JsonValueKind.String ? value.GetString() ?? "": value.GetRawText()
        }

        internal func Number(root JsonElement, name string) uint64? {
            let value = Text(root, name)
            return value == "" ? nil: UInt64.Parse(value, CultureInfo.InvariantCulture)
        }

        private func Signed(root JsonElement, name string) int64? {
            let value = Text(root, name)
            return value == "" ? nil: Int64.Parse(value, CultureInfo.InvariantCulture)
        }

        private func Names(root JsonElement, name string, output List[string]) {
            for item in root.GetProperty(name).EnumerateArray() {
                output.Add(item.GetString() ?? "")
            }
        }
    }
}
