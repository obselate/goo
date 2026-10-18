package GooDevTools

import System
import System.Collections.Generic
import System.Globalization
import System.IO
import System.Text.Json
import System.Text.Json.Serialization

internal partial class ProfilerTrace {
    internal const FileLimit int64 = 256L * 1024L * 1024L
    private const EventLimit int32 = 524288
    private const NameLimit int32 = 4096
    private const ArgumentLimit int32 = 65536

    internal func SaveFile(path string) {
        if Active {
            throw InvalidOperationException("Stop recording before exporting a trace")
        }
        let destination = Path.GetFullPath(path)
        let temporary = destination + "." + Guid.NewGuid().ToString("N") + ".tmp"
        try {
            {
                using let stream = FileStream(temporary, FileMode.CreateNew, FileAccess.Write, FileShare.None)
                using let writer = Utf8JsonWriter(stream)
                let options = RecordOptions()
                let tracks = [Records.Count]int32
                let names = List[string]()
                for lane in Lanes {
                    let byThread = Dictionary[uint64, List[List[int64]]]()
                    let trackNumbers = Dictionary[uint64, List[int32]]()
                    for index in lane.Records {
                        let record = Records[index]
                        let thread = record.Thread ?? 0uL
                        if !byThread.TryGetValue(thread, out var stacks) {
                            stacks = List[List[int64]]()
                            byThread.Add(thread, stacks)
                            trackNumbers.Add(thread, List[int32]())
                        }
                        var slot = 0
                        if IsSlice(record) {
                            while slot < stacks.Count {
                                let stack = stacks[slot]
                                while stack.Count > 0 && stack[stack.Count - 1] <= record.Ticks {
                                    stack.RemoveAt(stack.Count - 1)
                                }
                                if stack.Count == 0 || record.EndTicks <= stack[stack.Count - 1] {
                                    break
                                }
                                slot++
                            }
                        }
                        if slot == stacks.Count {
                            stacks.Add(List[int64]())
                            names.Add(
                                (lane.Window == "" ? "": WindowName(lane.Window) + " · ") + lane.Name
                                + (slot == 0 ? "": " · overlap " + (slot + 1).ToString(CultureInfo.InvariantCulture))
                            )
                            trackNumbers[thread].Add(names.Count)
                        }
                        tracks[index] = trackNumbers[thread][slot]
                        if IsSlice(record) {
                            stacks[slot].Add(record.EndTicks)
                        }
                    }
                }
                writer.WriteStartObject()
                writer.WriteString("displayTimeUnit", "ms")
                writer.WritePropertyName("traceEvents")
                writer.WriteStartArray()
                WriteName(
                    writer,
                    "process_name",
                    0,
                    Process == "" ? "Imported Chrome trace": "Goo profiler · " + Process
                )
                for index in 0 ... names.Count {
                    WriteName(writer, "thread_name", index + 1, names[index])
                }
                let flowIds = Dictionary[string, int64]()
                var flowSerial = 0L
                for index in 0 ... Records.Count {
                    let record = Records[index]
                    let counter = record.FloatingValue ?? (record.Value == nil ? nil: float64(record.Value ?? 0uL))
                    let gpu = record.Source.StartsWith("vulkan.timestamp", StringComparison.Ordinal)
                    let value = gpu ? (record.GpuNs == nil ? nil: float64(record.GpuNs ?? 0uL)): counter
                    var phase = IsSlice(record) ? "X": (record.Kind == "counter" || gpu) && value != nil ? "C": "i"
                    var category = record.Source
                    var flowId = 0L
                    var binding = ""
                    if record.Source == "chrome.flow" {
                        using let original = JsonDocument.Parse(record.Chrome)
                        let flow = original.RootElement[0]
                        phase = Text(flow, "ph")
                        category = Text(flow, "cat")
                        let key = record.Window + ":" + category + ":" + Text(flow, "id")
                        if !flowIds.TryGetValue(key, out flowId) {
                            flowSerial++
                            flowId = flowSerial
                            flowIds.Add(key, flowId)
                        }
                        binding = Text(flow, "bp")
                    }
                    var name = EventName(record)
                    if gpu {
                        name = GpuStage(record.Event) + (record.GpuNs == nil ? " · " + record.Source: " elapsed (ns)")
                        + " / device " + record.Device.ToString()
                        + " generation " + record.DeviceGeneration.ToString()
                    } else if phase == "C" {
                        name = names[tracks[index] - 1]
                    }
                    WriteHeader(writer, phase, name, tracks[index], record.Ticks)
                    if phase == "X" {
                        writer.WriteNumber("dur", Microseconds(record.EndTicks - record.Ticks))
                    }
                    if phase == "i" {
                        writer.WriteString("s", "t")
                    }
                    writer.WriteString("cat", category)
                    if flowId > 0L {
                        writer.WriteNumber("id", flowId)
                    }
                    if binding != "" {
                        writer.WriteString("bp", binding)
                    }
                    writer.WritePropertyName("args")
                    writer.WriteStartObject()
                    if phase == "C" {
                        writer.WriteNumber(gpu ? "elapsed_ns": record.Unit == "" ? "value": record.Unit, value ?? 0.0)
                    } else {
                        writer.WriteString("source", record.Source)
                        writer.WriteString("validity", record.Validity)
                        writer.WriteString("sequence", record.Sequence.ToString(CultureInfo.InvariantCulture))
                        if let submission = record.Submission {
                            writer.WriteString("submissionId", submission.ToString(CultureInfo.InvariantCulture))
                        }
                        if let resource = record.Resource {
                            writer.WriteString("resourceId", resource.ToString(CultureInfo.InvariantCulture))
                        }
                        if let parent = record.Parent {
                            writer.WriteString("parentId", parent.ToString(CultureInfo.InvariantCulture))
                        }
                        if let pump = record.Pump {
                            writer.WriteString("pumpId", pump.ToString(CultureInfo.InvariantCulture))
                        }
                        if let elapsed = record.GpuNs {
                            writer.WriteString("gpuElapsedNs", elapsed.ToString(CultureInfo.InvariantCulture))
                        }
                        if !record.Source.StartsWith("chrome.", StringComparison.Ordinal) {
                            writer.WriteNumber("result", record.Result)
                        }
                        writer.WriteString("unit", record.Unit)
                        if let payload = record.Payload {
                            writer.WriteString("payloadBytes", payload.ToString(CultureInfo.InvariantCulture))
                        }
                        if let requirement = record.Requirement {
                            writer.WriteString("requirementBytes", requirement.ToString(CultureInfo.InvariantCulture))
                        }
                        if record.ResourceKind != nil {
                            writer.WriteString("resourceKind", ResourceName(record.ResourceKind))
                        }
                        if record.Owner != nil {
                            writer.WriteString("ownerKind", OwnerName(record.Owner))
                        }
                        if record.Chrome != "" {
                            writer.WritePropertyName("original")
                            using let original = JsonDocument.Parse(record.Chrome)
                            original.RootElement.WriteTo(writer)
                        }
                    }
                    writer.WriteEndObject()
                    writer.WritePropertyName("goo")
                    JsonSerializer.Serialize[ProfilerRecord](writer, record, options)
                    writer.WriteEndObject()
                }
                let submissions = Dictionary[string, int32]()
                let resources = Dictionary[uint64, int32]()
                for index in 0 ... Records.Count {
                    let record = Records[index]
                    if !IsSlice(record) || record.EndTicks <= record.Ticks {
                        continue
                    }
                    if let submission = record.Submission {
                        let key = record.Device.ToString() + ":" + record.DeviceGeneration.ToString() +
                            ":" +
                            submission.ToString(CultureInfo.InvariantCulture)
                        if submissions.TryGetValue(key, out var previous) {
                            flowSerial++
                            WriteFlow(writer, flowSerial, previous, index, tracks)
                        }
                        submissions[key] = index
                    }
                    if let parent = record.Parent {
                        if resources.TryGetValue(parent, out var previous) {
                            flowSerial++
                            WriteFlow(writer, flowSerial, previous, index, tracks)
                        }
                    }
                    if let resource = record.Resource {
                        resources[resource] = index
                    }
                }
                writer.WriteEndArray()
                writer.WritePropertyName("goo")
                writer.WriteStartObject()
                writer.WriteString("format", "goo.profiler/1")
                writer.WriteString("traceId", Id)
                writer.WriteString("frequency", Frequency.ToString(CultureInfo.InvariantCulture))
                writer.WriteString("originTicks", Origin.ToString(CultureInfo.InvariantCulture))
                writer.WriteString("nextSeq", Next.ToString(CultureInfo.InvariantCulture))
                writer.WriteString("lastSequence", LastSequence.ToString(CultureInfo.InvariantCulture))
                writer.WriteString("endTicks", End.ToString(CultureInfo.InvariantCulture))
                writer.WriteString("dropped", Dropped.ToString(CultureInfo.InvariantCulture))
                writer.WriteString("state", State)
                writer.WriteString("reason", Reason)
                writer.WriteString("process", Process)
                writer.WriteString("devices", Devices)
                writer.WriteBoolean("partial", Partial)
                writer.WriteBoolean("budgetFull", BudgetFull)
                writer.WritePropertyName("phaseNames")
                JsonSerializer.Serialize[List[string]](writer, Phases)
                writer.WritePropertyName("ownerKinds")
                JsonSerializer.Serialize[List[string]](writer, Owners)
                writer.WritePropertyName("resourceKinds")
                JsonSerializer.Serialize[List[string]](writer, Resources)
                writer.WritePropertyName("deviceIds")
                JsonSerializer.Serialize[List[uint64]](writer, DeviceIds, options)
                writer.WritePropertyName("windowNames")
                JsonSerializer.Serialize[Dictionary[string, string]](writer, WindowNames)
                writer.WritePropertyName("threadNames")
                JsonSerializer.Serialize[Dictionary[uint64, string]](writer, ThreadNames)
                writer.WritePropertyName("start")
                writer.WriteRawValue(StartMetadata)
                writer.WriteEndObject()
                writer.WriteEndObject()
                writer.Flush()
                if stream.Length > FileLimit {
                    throw InvalidOperationException("Trace export exceeds the 256 MiB file limit")
                }
            }
            File.Move(temporary, destination, true)
        } finally {
            if File.Exists(temporary) {
                File.Delete(temporary)
            }
        }
    }

    private func WriteHeader(writer Utf8JsonWriter, phase string, name string, thread int32, ticks int64) {
        writer.WriteStartObject()
        writer.WriteString("ph", phase)
        writer.WriteString("name", name)
        writer.WriteNumber("pid", 1)
        writer.WriteNumber("tid", thread)
        writer.WriteNumber("ts", Microseconds(ticks))
    }

    private func Microseconds(ticks int64) float64 -> float64(ticks) * 1000000.0 / float64(Frequency)

    private func WriteFlow(writer Utf8JsonWriter, id int64, first int32, last int32, tracks[]int32) {
        if Records[first].Ticks > Records[last].Ticks || tracks[first] == tracks[last] {
            return
        }
        WriteHeader(writer, "s", "Goo correlation", tracks[first], Records[first].Ticks)
        writer.WriteString("cat", "goo.correlation")
        writer.WriteNumber("id", id)
        writer.WriteEndObject()
        WriteHeader(writer, "f", "Goo correlation", tracks[last], Records[last].Ticks)
        writer.WriteString("cat", "goo.correlation")
        writer.WriteNumber("id", id)
        writer.WriteString("bp", "e")
        writer.WriteEndObject()
    }

    internal func WindowName(id string) string {
        if !WindowNames.TryGetValue(id, out var title) {
            return "Window " + id
        }
        var ordinal = 0
        for pair in WindowNames {
            if pair.Value == title {
                ordinal++
            }
            if pair.Key == id {
                break
            }
        }
        return ordinal > 1 ? title + " #" + ordinal.ToString(CultureInfo.InvariantCulture): title
    }

    shared {
        private func RecordOptions() JsonSerializerOptions -> JsonSerializerOptions{
            IncludeFields: true,
            NumberHandling: JsonNumberHandling.WriteAsString | JsonNumberHandling.AllowReadingFromString,
        }

        private func IsSlice(record ProfilerRecord) bool -> record.Kind == "duration" && record.GpuNs == nil
        && !record.Source.StartsWith("vulkan.timestamp", StringComparison.Ordinal)
        && !record.Source.Contains("derived", StringComparison.Ordinal)

        private func GpuStage(eventId int32) string -> eventId == 316 ? "Upload"
        : eventId == 318 ? "Main": eventId == 319 ? "Effects"
        : eventId == 320 ? "Offscreen": "GPU event " + eventId.ToString(CultureInfo.InvariantCulture)

        private func WriteName(writer Utf8JsonWriter, kind string, thread int32, name string) {
            writer.WriteStartObject()
            writer.WriteString("ph", "M")
            writer.WriteString("name", kind)
            writer.WriteNumber("pid", 1)
            writer.WriteNumber("tid", thread)
            writer.WritePropertyName("args")
            writer.WriteStartObject()
            writer.WriteString("name", name)
            writer.WriteEndObject()
            writer.WriteEndObject()
        }

        internal func LoadFile(path string) ProfilerTrace {
            let file = FileInfo(path)
            if (file.Attributes & (FileAttributes.Directory | FileAttributes.Device)) != 0 || file.Length <= 0L {
                throw InvalidDataException("Trace input must be a nonempty regular file")
            }
            using let stream = FileStream(path, FileMode.Open, FileAccess.Read, FileShare.Read)
            if stream.Length > FileLimit {
                throw InvalidDataException("Trace file exceeds the 256 MiB limit")
            }
            using let document = JsonDocument.Parse(stream, JsonDocumentOptions{MaxDepth: 32})
            let root = document.RootElement
            let events = root.ValueKind == JsonValueKind.Array ? root: root.GetProperty("traceEvents")
            if events.ValueKind != JsonValueKind.Array || events.GetArrayLength() > EventLimit {
                throw InvalidDataException("Trace event array is invalid or exceeds 524288 events")
            }
            let trace = ProfilerTrace()
            if root.ValueKind == JsonValueKind.Object && root.TryGetProperty("goo", out var metadata)
            && Text(metadata, "format").StartsWith("goo.profiler/", StringComparison.Ordinal) {
                if Text(metadata, "format") != "goo.profiler/1" {
                    throw InvalidDataException("Unsupported Goo trace file version")
                }
                trace.LoadGoo(metadata, events)
            } else {
                trace.LoadChrome(events)
            }
            trace.FileName = Path.GetFileName(path)
            trace.PrepareLanes()
            return trace
        }

        private func CheckedText(root JsonElement, name string) string {
            let value = Text(root, name)
            if value.Length > NameLimit {
                throw InvalidDataException("Trace field exceeds its size limit: " + name)
            }
            return value
        }

        private func ChromeNumber(root JsonElement, name string) float64 {
            if !root.TryGetProperty(name, out var value) || value.ValueKind != JsonValueKind.Number {
                throw InvalidDataException("Chrome event requires a numeric " + name)
            }
            let number = value.GetDouble()
            if !Double.IsFinite(number) || Math.Abs(number) > 9000000000000000.0 {
                throw InvalidDataException("Chrome timestamp or duration is out of range")
            }
            return number
        }

        private func ChromeIdentity(root JsonElement, name string) {
            let value = CheckedText(root, name)
            if value == "" || !Int64.TryParse(value, NumberStyles.Integer, CultureInfo.InvariantCulture, out var id) {
                throw InvalidDataException("Chrome event requires an integer " + name)
            }
        }
    }

    private func LoadGoo(metadata JsonElement, events JsonElement) {
        Id = CheckedText(metadata, "traceId")
        Frequency = Int64.Parse(CheckedText(metadata, "frequency"), CultureInfo.InvariantCulture)
        Origin = Int64.Parse(CheckedText(metadata, "originTicks"), CultureInfo.InvariantCulture)
        Next = Int64.Parse(CheckedText(metadata, "nextSeq"), CultureInfo.InvariantCulture)
        let last = Int64.Parse(CheckedText(metadata, "lastSequence"), CultureInfo.InvariantCulture)
        let end = Int64.Parse(CheckedText(metadata, "endTicks"), CultureInfo.InvariantCulture)
        Dropped = UInt64.Parse(CheckedText(metadata, "dropped"), CultureInfo.InvariantCulture)
        State = CheckedText(metadata, "state")
        Reason = CheckedText(metadata, "reason")
        Process = CheckedText(metadata, "process")
        Devices = CheckedText(metadata, "devices")
        Partial = metadata.GetProperty("partial").GetBoolean()
        BudgetFull = metadata.GetProperty("budgetFull").GetBoolean()
        if Id == "" || Frequency <= 0L || Frequency > 1000000000000L || Active
        || end < 0L || end > Int64.MaxValue / 1024L || Next < last || last < 0L {
            throw InvalidDataException("Invalid or unfinished Goo trace metadata")
        }
        for key in[]string{"phaseNames", "ownerKinds", "resourceKinds"} {
            let values = metadata.GetProperty(key)
            if values.GetArrayLength() > 512 {
                throw InvalidDataException("Too many trace names")
            }
            let output = key == "phaseNames" ? Phases: key == "ownerKinds" ? Owners: Resources
            for value in values.EnumerateArray() {
                let text = value.GetString() ?? ""
                if text.Length > NameLimit {
                    throw InvalidDataException("Trace name is too long")
                }
                output.Add(text)
            }
        }
        for value in metadata.GetProperty("deviceIds").EnumerateArray() {
            if DeviceIds.Count >= 128 {
                throw InvalidDataException("Too many trace devices")
            }
            DeviceIds.Add(UInt64.Parse(value.GetString() ?? "", CultureInfo.InvariantCulture))
        }
        for value in metadata.GetProperty("windowNames").EnumerateObject() {
            if WindowNames.Count >= 512 ||
                value
                .Name
                .Length > NameLimit ||
                (value.Value.GetString() ?? "").Length > NameLimit {
                throw InvalidDataException("Invalid trace window names")
            }
            WindowNames.Add(value.Name, value.Value.GetString() ?? "")
        }
        for value in metadata.GetProperty("threadNames").EnumerateObject() {
            if ThreadNames.Count >= 8192 || (value.Value.GetString() ?? "").Length > NameLimit {
                throw InvalidDataException("Invalid trace thread names")
            }
            ThreadNames.Add(
                UInt64.Parse(value.Name, CultureInfo.InvariantCulture),
                Intern(value.Value.GetString() ?? "")
            )
        }
        StartMetadata = metadata.GetProperty("start").GetRawText()
        if StartMetadata.Length > ArgumentLimit {
            throw InvalidDataException("Trace start metadata is too large")
        }
        RetainedBytes += int64(StartMetadata.Length) * 2L
        if RetainedBytes > BudgetBytes || strings.Count >= 8192 {
            throw InvalidDataException("Imported metadata exceeds the retention budget")
        }
        let options = RecordOptions()
        for item in events.EnumerateArray() {
            if !item.TryGetProperty("goo", out var value) {
                continue
            }
            let record = value.Deserialize[ProfilerRecord](options)
            if record.Sequence <= LastSequence {
                throw InvalidDataException("Repeated or unordered imported record")
            }
            LastSequence = record.Sequence
            ImportRecord(record)
        }
        if LastSequence > last || (!BudgetFull && LastSequence != last) || End > end {
            throw InvalidDataException("Goo trace metadata does not match its records")
        }
        LastSequence = last
        End = end
    }

    private func ImportRecord(record ProfilerRecord) {
        for value in[]string{
            record.Kind ?? "",
            record.Window ?? "",
            record.Name ?? "",
            record.Source ?? "",
            record.Unit ?? "",
            record.Validity ?? ""
        } {
            if value.Length > NameLimit {
                throw InvalidDataException("Imported trace label is too long")
            }
        }
        if (record.Chrome ?? "").Length > ArgumentLimit ||
            RetainedBytes +
            1536L +
            int64((record.Chrome ?? "").Length) * 2L > BudgetBytes ||
            strings.Count >= 8192 {
            throw InvalidDataException("Imported trace exceeds the 128 MiB retention budget")
        }
        if record.FloatingValue != nil && !Double.IsFinite(record.FloatingValue ?? 0.0) {
            throw InvalidDataException("Imported counter is not finite")
        }
        if record.Kind != "duration" && record.Kind != "instant" && record.Kind != "counter"
        && record.Kind != "resourcebaseline" && record.Kind != "resourcelifecycle" && record.Kind != "metadata"
        && record.Kind != "gap" && record.Kind != "end" {
            throw InvalidDataException("Unsupported Goo record kind")
        }
        Store(record)
    }

    private func LoadChrome(events JsonElement) {
        Id = Guid.NewGuid().ToString("N")
        State = "Complete"
        Frequency = 1000000000L
        Process = ""
        var origin = Double.PositiveInfinity
        let processNames = Dictionary[string, string]()
        let threadNames = Dictionary[string, string]()
        for item in events.EnumerateArray() {
            let phase = CheckedText(item, "ph")
            ChromeIdentity(item, "pid")
            if phase != "M" {
                ChromeIdentity(item, "tid")
            }
            for key in[]string{"name", "cat"} {
                if item.TryGetProperty(key, out var label) && label.ValueKind != JsonValueKind.String {
                    throw InvalidDataException("Chrome event label is not a string")
                }
            }
            CheckedText(item, "name")
            CheckedText(item, "cat")
            if (phase == "s" || phase == "t" || phase == "f") && CheckedText(item, "id") == "" {
                throw InvalidDataException("Chrome flow requires an id")
            }
            if item.GetRawText().Length > ArgumentLimit / 2 {
                throw InvalidDataException("Chrome event arguments are too large")
            }
            if phase != "M" {
                origin = Math.Min(origin, ChromeNumber(item, "ts"))
            }
            if phase == "M" && item.TryGetProperty("args", out var args) {
                let pid = CheckedText(item, "pid")
                let name = CheckedText(args, "name")
                if Text(item, "name") == "process_name" {
                    processNames[pid] = name
                }
                if Text(item, "name") == "thread_name" {
                    threadNames[pid + ":" + CheckedText(item, "tid")] = name
                }
            }
        }
        if !Double.IsFinite(origin) {
            origin = 0.0
        }
        let threads = Dictionary[string, uint64]()
        let begins = Dictionary[string, List[JsonElement]]()
        var unsupported = 0
        for item in events.EnumerateArray() {
            let phase = Text(item, "ph")
            if phase == "M" {
                continue
            }
            let pid = CheckedText(item, "pid")
            let tid = CheckedText(item, "tid")
            let key = pid + ":" + tid
            let window = "chrome:" + pid
            let process = (processNames.TryGetValue(pid, out var processName) ? processName: "Process") +
                " (pid " +
                pid +
                ")"
            WindowNames[Intern(window)] = Intern(process)
            if !threads.TryGetValue(key, out var thread) {
                thread = uint64(threads.Count + 1)
                threads.Add(key, thread)
                ThreadNames[thread] = Intern(threadNames.TryGetValue(key, out var title) ? title: "Thread " + tid)
            }
            if RetainedBytes > BudgetBytes || strings.Count >= 8192 {
                throw InvalidDataException("Imported metadata exceeds the retention budget")
            }
            if phase == "B" {
                if !begins.TryGetValue(key, out var stack) {
                    stack = List[JsonElement]()
                    begins.Add(key, stack)
                }
                stack.Add(item)
                continue
            }
            let ticks = phase == "M" ? 0L: ChromeTicks(item, "ts", origin)
            var source = item
            var chrome = "[" + item.GetRawText() + "]"
            var end = ticks
            if phase == "E" {
                if !begins.TryGetValue(key, out var stack) || stack.Count == 0 {
                    throw InvalidDataException("Unmatched Chrome end event")
                }
                source = stack[stack.Count - 1]
                stack.RemoveAt(stack.Count - 1)
                if ticks < ChromeTicks(source, "ts", origin) {
                    throw InvalidDataException("Chrome end precedes begin")
                }
                end = ticks
                chrome = "[" + source.GetRawText() + "," + item.GetRawText() + "]"
            } else if phase == "X" {
                let duration = ChromeNumber(item, "dur")
                if duration < 0.0 || duration * 1000.0 > float64(Int64.MaxValue / 1024L - ticks) {
                    throw InvalidDataException("Invalid Chrome duration")
                }
                end = ticks + int64(Math.Round(duration * 1000.0))
            }
            var record = ProfilerRecord{
                Sequence: LastSequence + 1L,
                Kind: phase == "X" ||
                    phase == "E" ? "duration": phase == "C" ? "counter": phase == "M" ? "metadata": "instant",
                Ticks: phase == "E" ? ChromeTicks(source, "ts", origin): ticks,
                EndTicks: end,
                Window: window,
                Thread: thread,
                Category: -1,
                Name: CheckedText(source, "name"),
                Source: "chrome." + (phase == "s" || phase == "t" || phase == "f" ? "flow": CheckedText(source, "cat")),
                Unit: "",
                Validity: "imported",
                Chrome: chrome,
            }
            if phase == "C" {
                var count = 0
                for value in item.GetProperty("args").EnumerateObject() {
                    if value.Value.ValueKind != JsonValueKind.Number {
                        unsupported++
                        continue
                    }
                    let number = value.Value.GetDouble()
                    if !Double.IsFinite(number) {
                        throw InvalidDataException("Chrome counter is not finite")
                    }
                    record.Name = process + " / " + CheckedText(item, "name") + " / " + value.Name
                    record.FloatingValue = number
                    record.Chrome = count == 0 ? chrome: ""
                    record.Sequence = LastSequence + 1L
                    LastSequence = record.Sequence
                    ImportRecord(record)
                    count++
                }
                if count > 0 {
                    continue
                }
                record.Kind = "instant"
            }
            if phase != "M" && phase != "X" && phase != "E" && phase != "i" && phase != "I"
            && phase != "C" && phase != "s" && phase != "t" && phase != "f" {
                unsupported++
                record.Name = "Unsupported " + phase + ": " + record.Name
            }
            LastSequence = record.Sequence
            ImportRecord(record)
        }
        for pair in begins {
            if pair.Value.Count != 0 {
                throw InvalidDataException("Unmatched Chrome begin event")
            }
        }
        Next = LastSequence
        if unsupported > 0 {
            Reason = unsupported.ToString(CultureInfo.InvariantCulture) +
                " unsupported Chrome events or counter arguments retained as generic data."
        }
    }

    private func ChromeTicks(item JsonElement, name string, origin float64) int64 {
        let value = (ChromeNumber(item, name) - origin) * 1000.0
        if value < 0.0 || value >= float64(Int64.MaxValue / 1024L) {
            throw InvalidDataException("Chrome timestamp span is out of range")
        }
        return int64(Math.Round(value))
    }
}
