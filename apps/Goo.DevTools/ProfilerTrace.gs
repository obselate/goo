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
    var GcPauseTicks uint64?
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
    var FloatingValue float64?
    var Chrome string
}

internal class ProfilerLane {
    internal let Name string
    internal let Group string
    internal let Window string
    internal let Records List[int32] = List[int32]()
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
        Records.Sort(
            (a int32, b int32) -> {
                let order = records[a].Ticks.CompareTo(records[b].Ticks)
                return order != 0 ? order: records[b].EndTicks.CompareTo(records[a].EndTicks)
            }
        )
        Dirty = false
    }
}

internal class ProfilerFrame {
    internal let Record int32
    internal let Phases[]int32
    internal let Ticks[]int64
    internal let Other int64
    internal var Wait int64

    internal init(record int32, phases[]int32, ticks[]int64, other int64) {
        Record = record
        Phases = phases
        Ticks = ticks
        Other = other
    }
}

internal partial class ProfilerTrace {
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
    internal let ResourceInfo Dictionary[uint64, int32] = Dictionary[uint64, int32]()
    internal let ResourceCreated Dictionary[uint64, int64] = Dictionary[uint64, int64]()
    internal let PositiveOwners Dictionary[uint64, uint64] = Dictionary[uint64, uint64]()
    internal let WindowNames Dictionary[string, string] = Dictionary[string, string]()
    internal let ThreadNames Dictionary[uint64, string] = Dictionary[uint64, string]()
    internal let Frames List[ProfilerFrame] = List[ProfilerFrame]()
    internal let FramePhases List[string] = List[string]()
    internal let PumpGpu Dictionary[string, List[int32]] = Dictionary[string, List[int32]]()
    private let framePhaseIds Dictionary[string, int32] = Dictionary[string, int32]()
    private let pumpScopes Dictionary[string, List[int32]] = Dictionary[string, List[int32]]()
    internal let PumpFrames Dictionary[string, int32] = Dictionary[string, int32]()
    internal var StartMetadata string = "{}"
    internal var FileName string = ""
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
        let deviceNames = List[string]()
        for device in root.GetProperty("devices").EnumerateArray() {
            deviceNames.Add(Text(device, "name"))
        }
        Devices = String.Join(", ", deviceNames)
        for device in root.GetProperty("devices").EnumerateArray() {
            if let id = Number(device, "id") {
                DeviceIds.Add(id)
            }
        }
        Names(root, "phaseNames", Phases)
        Names(root, "ownerKinds", Owners)
        Names(root, "resourceKinds", Resources)
        Revision++
        StartMetadata = root.GetRawText()
        RetainedBytes += int64(StartMetadata.Length) * 2L
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
                Kind: Text(item, "kind"),
                Ticks: ticks,
                EndTicks: Text(item, "endTicks") == "" ? ticks: Int64.Parse(
                    Text(item, "endTicks"),
                    CultureInfo.InvariantCulture
                ),
                Window: Text(item, "windowId"),
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
                GcPauseTicks: Number(item, "gcPauseTicks"),
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
                Name: Text(item, "name"),
                Source: Text(item, "source"),
                Unit: Text(item, "unit"),
                Validity: Text(item, "validity"),
            }
            Store(record)
        }
        Next = Int64.Parse(Text(root, "nextSeq"), CultureInfo.InvariantCulture)
        State = Text(root, "state")
        Dropped = Number(root, "dropped") ?? 0uL
        Partial = Partial || root.GetProperty("partial").GetBoolean()
        PrepareLanes()
    }

    internal func Store(value ProfilerRecord) {
        if value.Ticks < 0L || value.EndTicks < value.Ticks {
            throw InvalidOperationException("Invalid profiler interval")
        }
        var record = value
        record.Kind = Intern(value.Kind ?? "")
        record.Window = Intern(value.Window ?? "")
        record.Name = Intern(value.Name ?? "")
        record.Source = Intern(value.Source ?? "")
        record.Unit = Intern(value.Unit ?? "")
        record.Validity = Intern(value.Validity ?? "")
        record.Chrome = value.Chrome ?? ""
        let index = Records.Count
        Records.Add(record)
        RetainedBytes += 1536L + int64(record.Chrome.Length) * 2L
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
                if record.Event == 200 || record.Event == 220 || record.Event == 120 {
                    ResourceCreated[resource] = record.Ticks
                }
            }
            if !ResourceInfo.ContainsKey(resource) || record.Parent != nil || record.Owner != nil {
                ResourceInfo[resource] = index
            }
        }
        if record.Kind == "counter" {
            if let number = record.Value {
                if let device = record.Device {
                    if let owner = record.Owner {
                        if number > 0uL && owner < 8uL {
                            PositiveOwners[device] = (PositiveOwners.TryGetValue(device, out var mask) ? mask: 0uL)
                            | (1uL << int32(owner))
                        }
                    }
                }
            }
        }
        AddLane(index, record)
        if let pump = record.Pump {
            Attribute(index, record, record.Window + ":" + pump.ToString())
        }
        if record.Kind == "gap" {
            Partial = true
        }
    }

    internal func PrepareLanes() {
        for lane in Lanes {
            lane.Prepare(Records)
        }
        Revision++
    }

    private func Attribute(index int32, record ProfilerRecord, key string) {
        if record.GpuNs != nil {
            if !PumpGpu.TryGetValue(key, out var gpu) {
                gpu = List[int32]()
                PumpGpu.Add(key, gpu)
            }
            gpu.Add(index)
            return
        }
        if record.Kind != "duration" || record.Source == "cpu.instrumented"
        || record.Source.Contains("derived", StringComparison.Ordinal) || record.Source.EndsWith(
            "-observed",
            StringComparison.Ordinal
        ) {
            return
        }
        if record.Category == 0 && record.Event == 0 {
            AddFrame(index, record, key)
        } else if record.Category == 0 && PhaseName(record.Event) == "CapWait" {
            if PumpFrames.TryGetValue(key, out var frame) {
                let target = Frames[frame]
                target.Wait += record.EndTicks - record.Ticks
            }
        } else {
            if !pumpScopes.TryGetValue(key, out var scopes) {
                scopes = List[int32]()
                pumpScopes.Add(key, scopes)
            }
            scopes.Add(index)
        }
    }

    private func AddFrame(index int32, frame ProfilerRecord, key string) {
        let scopes = List[int32]()
        if pumpScopes.Remove(key, out var pending) {
            for item in pending {
                let r = Records[item]
                if r.Thread == frame.Thread && r.Ticks >= frame.Ticks && r.EndTicks <= frame.EndTicks {
                    scopes.Add(item)
                }
            }
        }
        scopes.Sort(
            (a int32, b int32) -> {
                let order = Records[a].Ticks.CompareTo(Records[b].Ticks)
                return order != 0 ? order: Records[b].EndTicks.CompareTo(Records[a].EndTicks)
            }
        )
        let totals = Dictionary[int32, int64]()
        let phases = List[int32]()
        let ends = List[int64]()
        var other = 0L
        var cursor = frame.Ticks
        for item in scopes {
            let r = Records[item]
            while ends.Count > 0 && ends[ends.Count - 1] <= r.Ticks {
                cursor = Credit(totals, phases, ends, cursor)
            }
            if ends.Count > 0 {
                totals[phases[phases.Count - 1]] += r.Ticks - cursor
            } else {
                other += r.Ticks - cursor
            }
            cursor = r.Ticks
            let name = r.Category == 0 ? PhaseName(r.Event): r.Source
            if !framePhaseIds.TryGetValue(name, out var phase) {
                phase = FramePhases.Count
                FramePhases.Add(name)
                framePhaseIds.Add(name, phase)
            }
            phases.Add(phase)
            ends.Add(ends.Count > 0 ? Math.Min(r.EndTicks, ends[ends.Count - 1]): r.EndTicks)
            if !totals.ContainsKey(phase) {
                totals.Add(phase, 0L)
            }
        }
        while ends.Count > 0 {
            cursor = Credit(totals, phases, ends, cursor)
        }
        other += frame.EndTicks - cursor
        let ids = List[int32](totals.Keys)
        ids.Sort()
        let ticks = [ids.Count]int64
        for i in 0 ... ids.Count {
            ticks[i] = totals[ids[i]]
        }
        let result = ProfilerFrame(index, ids.ToArray(), ticks, other)
        PumpFrames[key] = Frames.Count
        Frames.Add(result)
    }

    private func Credit(totals Dictionary[int32, int64], phases List[int32], ends List[int64], cursor int64) int64 {
        let last = ends.Count - 1
        totals[phases[last]] += ends[last] - cursor
        let next = ends[last]
        phases.RemoveAt(last)
        ends.RemoveAt(last)
        return next
    }

    internal func FirstFrame(tick int64) int32 {
        var lo = 0
        var hi = Frames.Count
        while lo < hi {
            let mid = lo + (hi - lo) / 2
            let frame = Frames[mid]
            if tick > Records[frame.Record].EndTicks {
                lo = mid + 1
            } else {
                hi = mid
            }
        }
        return lo
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
        : record.Source.StartsWith("capture.", StringComparison.Ordinal) ||
            record.Source == "recording.stop" ? "Markers"
        : record.Category == 0 || record.Source.StartsWith("chrome.", StringComparison.Ordinal) ? "CPU"
        : record.Kind == "duration" ? "CPU": "Frames"
        let name = group == "Memory" ? record.Name + (record.Owner == nil ? "": " / " + OwnerName(record.Owner))
        + (record.Device == nil ? "": " / device " + record.Device.ToString())
        + (record.Heap == nil ? "": " / heap " + record.Heap.ToString())
        : group == "GPU" ? "GPU stages"
        : group == "Resources" ? ResourceLaneName(record)
        : group == "CPU" ? (
            ThreadNames.TryGetValue(record.Thread ?? 0uL, out var title) ? title
            : "CPU thread " + record.Thread.ToString()
        )
        : group == "Queue" ? (
            record.Source.StartsWith("present.", StringComparison.Ordinal)
            || record.Source == "vkQueuePresentKHR" ? "Present": "Submit"
        )
        : group == "Markers" ? "Markers": "Frame"
        let window = group == "Frames" || group == "CPU" || group == "Queue" ? record.Window: ""
        let key = group + ":" + name + ":" + window
        if !lanesByKey.TryGetValue(key, out var lane) {
            lane = ProfilerLane(name, group, window)
            lanesByKey.Add(key, lane)
            Lanes.Add(lane)
        }
        lane.Records.Add(index)
        lane.Dirty = true
    }

    private func ResourceLaneName(record ProfilerRecord) string {
        if record.Owner != nil {
            return ResourceName(record.ResourceKind) + " / " + OwnerName(record.Owner)
        }
        let kind = ResourceName(record.ResourceKind)
        return kind == "MemoryBlock" ? "Allocator blocks": kind == "Font" ? "Font files (CPU)"
        : kind == "FontFace" ? "Font faces": kind == "ImageSource" ? "Decoded images"
        : kind == "Image" ? "Image uploads": kind == "Shader" ? "Shaders"
        : kind == "Pipeline" ? "Pipelines": kind == "PipelineCache" ? "Pipeline caches"
        : kind == "Swapchain" ? "Swapchain (WSI, estimated payload)": kind
    }

    internal func OwnerChain(record ProfilerRecord) string {
        let names = List[string]()
        var current = record
        let seen = HashSet[uint64]()
        if current.Owner != nil {
            names.Add(OwnerName(current.Owner))
        }
        for depth in 0 ... 16 {
            guard let parent = current.Parent else {
                break
            }
            if !seen.Add(parent) {
                break
            }
            if ResourceNames.TryGetValue(parent, out var name) && name != ""
            && !name.StartsWith("vulkan.", StringComparison.Ordinal) {
                names.Add(name)
            }
            if !ResourceInfo.TryGetValue(parent, out var index) {
                break
            }
            current = Records[index]
            if current.Owner != nil {
                names.Add(OwnerName(current.Owner))
            }
        }
        return String.Join(" ← ", names)
    }

    internal func EventName(record ProfilerRecord) string {
        if let resource = record.Resource {
            if ResourceNames.TryGetValue(resource, out var name) && name != ""
            && !name.StartsWith("vulkan.", StringComparison.Ordinal) {
                return name
            }
            return ResourceName(record.ResourceKind)
        }
        return record.Name != "" ? record.Name: record.Category == 0 ? PhaseName(record.Event): record.Source
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
