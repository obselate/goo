package Goo

import System
import System.Collections.Generic
import System.Diagnostics
import System.Globalization
import System.IO
import System.IO.Pipes
import System.Text
import System.Text.Json
import System.Threading

internal class ProfilerSmokeCell : Cell {
    internal var Frame int32
    internal var Source ImageSource?
    internal var Effect ShaderEffect?

    override func Build() Blob -> Container() {
        .Width: 24 + Frame % 2,
        .Height: 24,
        .BackgroundColor: Color.Rgb(Frame % 255, 80, 120),
        .ShaderEffect: Effect,
        Text{Content: "Profiler"},
        Image{Source: Source, Width: 8, Height: 8},
    }
}

internal class ProfilerSmokeClient : IDisposable {
    private let pipe NamedPipeClientStream
    private let reader StreamReader
    private let writer StreamWriter
    private var requestId int32

    internal init(name string) {
        pipe = NamedPipeClientStream(".", name, PipeDirection.InOut, PipeOptions.Asynchronous)
        pipe.Connect(5000)
        reader = StreamReader(pipe, Encoding.UTF8)
        writer = StreamWriter(pipe, UTF8Encoding(false))
        writer.AutoFlush = true
        using let hello = JsonDocument.Parse(reader.ReadLine() ?? "{}")
        ProfilerSmoke.Require(
            hello
                .RootElement
                .GetProperty("capabilities")
                .GetRawText()
                .Contains("profiler.trace.v1", StringComparison.Ordinal),
            "Missing profiler capability"
        )
    }

    internal func Request(command string, payload string = "{}") JsonDocument {
        requestId++
        writer.WriteLine(
            "{\"type\":\"request\",\"id\":\"" + requestId.ToString(CultureInfo.InvariantCulture)
            + "\",\"command\":\"" + command + "\",\"payload\":" + payload + "}"
        )
        let line = reader.ReadLine() ?? "{}"
        ProfilerSmoke.Require(
            Encoding.UTF8.GetByteCount(line) <= FrameRecorder.MaxBatchBytes,
            "Unbounded trace response"
        )
        let response = JsonDocument.Parse(line)
        ProfilerSmoke.Require(response.RootElement.GetProperty("ok").GetBoolean(), line)
        return response
    }

    public func Dispose() {
        pipe.Dispose()
    }
}

internal data struct ProfilerSmokeAllocation(Owner int32, Bytes uint64, Retired bool) { }

internal class ProfilerSmokeTrace {
    internal let WindowId string
    internal let Phases HashSet[int32] = HashSet[int32]()
    internal let FramePhases HashSet[string] = HashSet[string]()
    internal let Sources HashSet[string] = HashSet[string]()
    internal let Providers HashSet[string] = HashSet[string]()
    internal let Builds Dictionary[string, int64] = Dictionary[string, int64]()
    internal let Paints Dictionary[string, int64] = Dictionary[string, int64]()
    internal let FramePumps Dictionary[string, string] = Dictionary[string, string]()
    internal let Submitted HashSet[string] = HashSet[string]()
    internal var Sequence int64
    internal var LastCompletion uint64
    internal let Counters HashSet[string] = HashSet[string]()
    internal let BaselineKinds HashSet[int32] = HashSet[int32]()
    internal var Uploaded bool
    internal var Gpu bool
    internal var GpuSupported bool
    internal var GpuAvailable bool
    internal let Allocations Dictionary[string, ProfilerSmokeAllocation] = Dictionary[string, ProfilerSmokeAllocation]()
    internal let BaselineIds HashSet[string] = HashSet[string]()
    internal var AccountsValid bool = true
    internal var Cutoff int64 = -1L
    internal var LastCpuEnd int64
    internal let CreatedKinds HashSet[int32] = HashSet[int32]()
    internal let PreparedImages HashSet[string] = HashSet[string]()
    internal let UploadSubmissions Dictionary[string, string] = Dictionary[string, string]()

    internal init(windowId string) { WindowId = windowId }

    internal func RequireHeld(submission string, pump string, frame string) {
        ProfilerSmoke.Require(submission != "", "Held submit has no enqueue record")
        ProfilerSmoke.Require(!Submitted.Contains(submission), "Held submit completed before release")
        ProfilerSmoke.Require(FramePumps.TryGetValue(frame, out var framePump) && framePump == pump,
            "Held submission has no matching native frame/pump")
        ProfilerSmoke.Require(Paints.TryGetValue(pump, out var paintStart), "Held submission has no matching paint")
        var builtBeforePaint = false
        for end in Builds.Values {
            if end <= paintStart {
                builtBeforePaint = true
                break
            }
        }
        ProfilerSmoke.Require(builtBeforePaint, "No recorded build preceded the held submission's paint")
    }
}

internal class ProfilerSmoke {
    shared {
        internal func Require(condition bool, message string) {
            if !condition {
                throw InvalidOperationException(message)
            }
        }

        internal func Run() {
            let startup = FrameRecorder.Current
            let root = ProfilerSmokeCell{}
            let window = Window{Title: "Goo profiler pipe smoke", Width: 64, Height: 64, Root: root}.Open()
            WindowReadbackTestFixture.ForceRender(window, 0.0)
            using let session = window.AttachDiagnostics()
            if Environment.GetEnvironmentVariable("GOO_FRAME_PROFILE") == "1" {
                for i in 0 ... 320 {
                    root.Frame++
                    root.Rebuild()
                    window.Pump(1.0 / 60.0)
                }
            }
            var failure Exception?
            var detached FrameRecorder?
            let done = ManualResetEventSlim(false)
            using let readOnly = ManualResetEventSlim(false)
            using let allowPump = ManualResetEventSlim(false)
            let thread = Thread(
                () -> {
                    try {
                        detached = RecordThroughPipe(
                            window,
                            root,
                            session.Endpoint.PipeName,
                            startup,
                            readOnly,
                            allowPump
                        )
                    } catch (error Exception) {
                        failure = error
                    } finally {
                        allowPump.Set()
                        done.Set()
                    }
                }
            )
            thread.IsBackground = true
            thread.Start()
            try {
                let deadline = Stopwatch.GetTimestamp() + Stopwatch.Frequency * 30L
                while !done.IsSet && Stopwatch.GetTimestamp() < deadline {
                    window.Pump(1.0 / 60.0)
                    if readOnly.IsSet {
                        Require(allowPump.Wait(5000), "Trace read blocked on the UI thread")
                    }
                    Thread.Yield()
                }
                Require(done.IsSet, "Profiler pipe smoke timed out")
                thread.Join()
                if let error = failure {
                    throw error
                }
                Require(
                    SpinWait.SpinUntil(() -> FrameRecorder.Current == nil, 2000),
                    "Disconnect did not detach the recorder"
                )
                guard let partial = detached else {
                    throw InvalidOperationException("Disconnected trace is missing")
                }
                Require(SpinWait.SpinUntil(() -> {
                    partial.Read(0L, 1, out var next, out var more, out var state, out var dropped)
                    return state == "Partial"
                }, 2000), "Disconnect marked a pending queue trace complete")
                Console.WriteLine(
                    "profiler-pipe: real_phases=verified queue_links=verified busy=verified stop=verified gaps=verified disconnect=verified startup="
                    + (startup != nil).ToString()
                )
            } finally {
                WindowReadbackTestFixture.RuntimeReleaseHeldQueueCall()
                FrameRecorder.Current?.Stop(true)
                window.RequestClose()
                let deadline = Stopwatch.GetTimestamp() + Stopwatch.Frequency * 5L
                while window.IsOpen && Stopwatch.GetTimestamp() < deadline {
                    window.Pump(0.0)
                }
                root.Source?.Dispose()
                if done.IsSet {
                    done.Dispose()
                }
            }
        }

        private func RecordThroughPipe(window Window, root ProfilerSmokeCell, name string, startup FrameRecorder?,
            readOnly ManualResetEventSlim, allowPump ManualResetEventSlim) FrameRecorder {
            let boundary = Stopwatch.GetTimestamp()
            using let client = ProfilerSmokeClient(name)
            using let started = client.Request("profiler.start")
            let metadata = started.RootElement.GetProperty("payload")
            let traceId = metadata.GetProperty("traceId").GetString() ?? ""
            let origin = Int64.Parse(
                metadata.GetProperty("originTicks").GetString() ?? "0",
                CultureInfo.InvariantCulture
            )
            if let armed = startup {
                Require(traceId == armed.TraceId, "Startup trace was replaced")
            }
            let identity = "\"traceId\":\"" + traceId + "\""
            using let second = ProfilerSmokeClient(name)
            using let busy = second.Request("profiler.start")
            Require(
                busy.RootElement.GetProperty("payload").GetProperty("state").GetString() == "Busy",
                "Second client did not receive Busy"
            )
            window.Post(
                () -> {
                    WindowReadbackTestFixture.RuntimeHoldNextQueueSubmit(window)
                    using let cache = ImageSourceCache()
                    root.Source = cache.LoadAsync(Path.Combine(AppContext.BaseDirectory, "local-rgba.png")).GetAwaiter().GetResult()
                    root.Effect = ShaderEffect(ShaderEffectProgram.Load(
                        Path.Combine(AppContext.BaseDirectory, "control_effect.frag.goo-effect")), true, 2.0F)
                    root.Frame++
                    root.Rebuild()
                }
            )
            Require(
                WindowReadbackTestFixture.RuntimeWaitForHeldQueueCall(window, 5000),
                "No real queue submission was held"
            )
            readOnly.Set()
            var after = "0"
            let trace = ProfilerSmokeTrace(metadata.GetProperty("windowId").GetString() ?? "")
            var remaining = true
            var queued = ""
            var queuedPump = ""
            var queuedFrame = ""
            var sawStartup = false
            while remaining {
                using let batch = client.Request("profiler.read", "{" + identity + ",\"afterSeq\":\"" + after + "\"}")
                let payload = batch.RootElement.GetProperty("payload")
                ValidateBatch(payload, trace)
                for record in payload.GetProperty("records").EnumerateArray() {
                    if record.GetProperty("kind").GetString() == "duration" {
                        let end = Int64.Parse(
                            record.GetProperty("endTicks").GetString() ?? "0",
                            CultureInfo.InvariantCulture
                        )
                        sawStartup = sawStartup || origin + end < boundary
                    }
                    let source = record.GetProperty("source").GetString() ?? ""
                    let submission = record.GetProperty("submissionId").GetString() ?? ""
                    if source == "submit.enqueue" {
                        queued = submission
                        queuedPump = record.GetProperty("pumpId").GetString() ?? ""
                        queuedFrame = record.GetProperty("frameId").GetString() ?? ""
                    }
                }
                after = payload.GetProperty("nextSeq").GetString() ?? after
                remaining = payload.GetProperty("more").GetBoolean()
            }
            trace.RequireHeld(queued, queuedPump, queuedFrame)
            Require(startup == nil || sawStartup, "Startup recording lost its pre-attachment phases")
            trace.Sources.Clear()
            allowPump.Set()
            WindowReadbackTestFixture.RuntimeReleaseHeldQueueCall()
            let deadline = Stopwatch.GetTimestamp() + Stopwatch.Frequency * 10L
            while (!trace.Sources.Contains("present.accepted") || !trace.Submitted.Contains(queued)) && Stopwatch.GetTimestamp() < deadline {
                using let batch = client.Request("profiler.read", "{" + identity + ",\"afterSeq\":\"" + after + "\"}")
                let payload = batch.RootElement.GetProperty("payload")
                ValidateBatch(payload, trace)
                after = payload.GetProperty("nextSeq").GetString() ?? after
            }
            Require(
                trace.Phases.Contains(int32(FrameProfileStage.Build)) && trace.Phases.Contains(
                    int32(FrameProfileStage.StyleResolve)
                )
                && trace.Phases.Contains(int32(FrameProfileStage.Layout)) && trace.Phases.Contains(int32(FrameProfileStage.Paint))
                && trace.Phases.Contains(int32(FrameProfileStage.Frame)),
                "Real frame phases did not reach the pipe"
            )
            Require(
                trace.Sources.Contains("vkQueueSubmit2") && trace.Sources.Contains("vkQueuePresentKHR")
                && trace.Sources.Contains("present.accepted") && trace.Submitted.Contains(queued),
                "Queue API and acceptance records are missing"
            )
            let gpuDeadline = Stopwatch.GetTimestamp() + Stopwatch.Frequency * 10L
            var gpuFrames int32 = 0
            var submittedCount = trace.Submitted.Count
            while trace.GpuSupported && !trace.GpuAvailable && Stopwatch.GetTimestamp() < gpuDeadline {
                if gpuFrames < 3 && trace.Submitted.Count >= submittedCount {
                    window.Post(() -> {
                        root.Frame++
                        root.Rebuild()
                    })
                    gpuFrames++
                    submittedCount = trace.Submitted.Count + 1
                }
                using let batch = client.Request("profiler.read", "{" + identity + ",\"afterSeq\":\"" + after + "\"}")
                let payload = batch.RootElement.GetProperty("payload")
                ValidateBatch(payload, trace)
                after = payload.GetProperty("nextSeq").GetString() ?? after
            }
            Require(!trace.GpuSupported || trace.GpuAvailable, "Supported GPU timestamps did not resolve")
            using let stopped = client.Request("profiler.stop", "{" + identity + "}")
            var ended = false
            while !ended {
                using let batch = client.Request("profiler.read", "{" + identity + ",\"afterSeq\":\"" + after + "\"}")
                let payload = batch.RootElement.GetProperty("payload")
                ValidateBatch(payload, trace)
                for record in payload.GetProperty("records").EnumerateArray() {
                    if record.GetProperty("kind").GetString() == "end" {
                        ended = true
                    }
                }
                after = payload.GetProperty("nextSeq").GetString() ?? after
                Require(ended || payload.GetProperty("more").GetBoolean(), "Stopped trace has no End")
            }
            Require(trace.Cutoff >= trace.LastCpuEnd, "CPU recording did not stop at its cutoff")
            for name in []string{"managed.allocated.total", "managed.heap.estimate", "gc.gen0.collections",
                "gc.gen1.collections", "gc.gen2.collections", "process.rss", "process.pss",
                "vulkan.live.requirements", "vulkan.retired.requirements", "vulkan.blocks",
                "driver.heap.usage.estimate", "driver.heap.budget"} {
                Require(trace.Counters.Contains(name), "Missing memory counter: " + name)
            }
            for resource in []FrameResourceKind{FrameResourceKind.MemoryBlock, FrameResourceKind.Buffer,
                FrameResourceKind.Shader, FrameResourceKind.Pipeline, FrameResourceKind.Swapchain,
                FrameResourceKind.Font, FrameResourceKind.FontFace} {
                Require(trace.BaselineKinds.Contains(int32(resource))
                    || (startup != nil && trace.CreatedKinds.Contains(int32(resource))),
                    "Missing resource baseline: " + resource.ToString())
            }
            Require(trace.Uploaded, "Image upload has no decoded-source linkage")
            var linkedUploads = trace.UploadSubmissions.Count != 0
            for upload in trace.UploadSubmissions {
                linkedUploads = linkedUploads && trace.PreparedImages.Contains(upload.Key)
                    && trace.Submitted.Contains(upload.Value)
            }
            Require(linkedUploads, "Image upload submission linkage is missing")
            Require(trace.Providers.Contains("shader.create") && trace.Providers.Contains("shader.destroy")
                && trace.Providers.Contains("pipeline.create"), "Shader/pipeline lifetimes are missing")
            Require(trace.Gpu || trace.Providers.Contains("vulkan.timestamp"), "GPU provider has no availability record")
            Console.WriteLine("profiler-memory: counters=" + trace.Counters.Count.ToString()
                + " baseline_kinds=" + trace.BaselineKinds.Count.ToString()
                + " image_upload_link=" + trace.Uploaded.ToString() + " gpu_elapsed=" + trace.Gpu.ToString())
            Console.WriteLine(
                "profiler-trace: trace_id=" + traceId + " records=" + trace.Sequence.ToString()
                + " pumps=" + trace.Builds.Count.ToString() + " held_submission=" + queued
                + " held_pump=" + queuedPump + " same_pump_build=" + trace.Builds.ContainsKey(queuedPump).ToString()
                + " device=" + (metadata.GetProperty("devices")[0].GetProperty("name").GetString() ?? "unavailable")
            )
            return VerifyOverflowAndDisconnect(client, window, root)
        }

        private func VerifyOverflowAndDisconnect(
            client ProfilerSmokeClient,
            window Window,
            root ProfilerSmokeCell
        ) FrameRecorder {
            using let restarted = client.Request("profiler.start", "{\"bufferBytes\":65536}")
            let overflowId = restarted.RootElement.GetProperty("payload").GetProperty("traceId").GetString() ?? ""
            guard let recorder = FrameRecorder.Current else {
                throw InvalidOperationException("Recorder is absent")
            }
            for i in 0 ... 1000 {
                recorder.Instant(0uL, 0uL, FrameTraceContext{})
            }
            using let stopOverflow = client.Request("profiler.stop", "{\"traceId\":\"" + overflowId + "\"}")
            var gap = false
            var after = "0"
            var more = true
            while more {
                using let batch = client.Request(
                    "profiler.read",
                    "{\"traceId\":\"" + overflowId
                    + "\",\"afterSeq\":\"" + after + "\",\"maxBytes\":8192}"
                )
                let payload = batch.RootElement.GetProperty("payload")
                for record in payload.GetProperty("records").EnumerateArray() {
                    if record.GetProperty("kind").GetString() == "gap" {
                        gap = true
                    }
                }
                after = payload.GetProperty("nextSeq").GetString() ?? after
                more = payload.GetProperty("more").GetBoolean()
            }
            Require(gap, "Overflow did not produce a gap")
            using let disconnected = client.Request("profiler.start")
            guard let closing = FrameRecorder.Current else {
                throw InvalidOperationException("Disconnect trace is absent")
            }
            window.Post(
                () -> {
                    WindowReadbackTestFixture.RuntimeHoldNextQueueSubmit(window)
                    root.Frame++
                    root.Rebuild()
                }
            )
            Require(
                WindowReadbackTestFixture.RuntimeWaitForHeldQueueCall(window, 5000),
                "Disconnect did not hold a real queue submission"
            )
            return closing
        }

        private func ValidateBatch(payload JsonElement, trace ProfilerSmokeTrace) {
            for record in payload.GetProperty("records").EnumerateArray() {
                let seq = Int64.Parse(record.GetProperty("seq").GetString() ?? "0", CultureInfo.InvariantCulture)
                Require(seq > trace.Sequence, "Trace publication order is invalid")
                trace.Sequence = seq
                let ticks = Int64.Parse(record.GetProperty("ticks").GetString() ?? "-1", CultureInfo.InvariantCulture)
                Require(ticks >= 0L, "Negative trace timestamp")
                let kind = record.GetProperty("kind").GetString() ?? ""
                if kind == "gap" {
                    trace.BaselineIds.Clear()
                    trace.Allocations.Clear()
                    trace.AccountsValid = false
                }
                if kind != "resourcebaseline" && kind != "resourcelifecycle"
                    && record.GetProperty("resourceId").ValueKind == JsonValueKind.Null
                    && record.GetProperty("category").GetString() != VulkanDiagnosticCategories.Resource.ToString(CultureInfo.InvariantCulture)
                    && record.GetProperty("category").GetString() != VulkanDiagnosticCategories.Allocator.ToString(CultureInfo.InvariantCulture) {
                    Require(record.GetProperty("resourceKind").ValueKind == JsonValueKind.Null
                        && record.GetProperty("ownerKind").ValueKind == JsonValueKind.Null,
                        "Unmeasured resource classification is not null")
                }
                let resourceSource = record.GetProperty("source").GetString() ?? ""
                if resourceSource == "recording.stop" {
                    trace.Cutoff = ticks
                } else if kind != "duration" && kind != "counter" && kind != "gap" && kind != "end" {
                    trace.LastCpuEnd = Math.Max(trace.LastCpuEnd, ticks)
                }
                if kind == "counter" {
                    trace.Counters.Add(record.GetProperty("name").GetString() ?? "")
                    if record.GetProperty("validity").GetString() == "unavailable" {
                        Require(record.GetProperty("value0").ValueKind == JsonValueKind.Null,
                            "Unavailable counter is not null")
                    }
                }
                if kind == "resourcelifecycle" {
                    let eventId = record.GetProperty("eventId").GetString() ?? ""
                    if eventId == VulkanDiagnosticEventIds.ResourceCreate.ToString(CultureInfo.InvariantCulture)
                        || eventId == VulkanDiagnosticEventIds.PipelineCreate.ToString(CultureInfo.InvariantCulture)
                        || eventId == VulkanDiagnosticEventIds.SwapchainCreate.ToString(CultureInfo.InvariantCulture) {
                        trace.CreatedKinds.Add(record.GetProperty("resourceKind").GetInt32())
                    }
                }
                if kind == "resourcebaseline" {
                    trace.BaselineKinds.Add(record.GetProperty("resourceKind").GetInt32())
                    let id = record.GetProperty("resourceId").GetString() ?? ""
                    Require(trace.BaselineIds.Add(id), "A resource baseline was duplicated")
                    Require(record.GetProperty("resourceId").ValueKind == JsonValueKind.String,
                        "Baseline resource identity is missing")
                }
                if resourceSource == "image.upload.prepare" {
                    trace.Uploaded = true
                    trace.PreparedImages.Add(record.GetProperty("resourceId").GetString() ?? "")
                    Require(record.GetProperty("parentId").ValueKind == JsonValueKind.String,
                        "Upload has no decoded source")
                }
                if resourceSource == "image.upload.submit" {
                    trace.UploadSubmissions[record.GetProperty("resourceId").GetString() ?? ""] =
                        record.GetProperty("submissionId").GetString() ?? ""
                }
                if resourceSource == "vulkan.timestamp" {
                    trace.GpuSupported = record.GetProperty("validity").GetString() == "available"
                }
                if resourceSource == "vulkan.timestamp.elapsed" {
                    trace.Gpu = true
                    trace.GpuAvailable = trace.GpuAvailable || record.GetProperty("validity").GetString() == "available"
                    Require(record.GetProperty("submissionId").ValueKind == JsonValueKind.String,
                        "GPU elapsed time has no submission")
                    Require(record.GetProperty("validity").GetString() == "unavailable"
                        || record.GetProperty("gpuElapsedNs").ValueKind == JsonValueKind.Number,
                        "GPU elapsed time is missing")
                }
                if record.GetProperty("requirementBytes").ValueKind == JsonValueKind.Number {
                    let id = record.GetProperty("resourceId").GetString() ?? ""
                    if record.GetProperty("eventId").GetString() == VulkanDiagnosticEventIds.ResourceEvict.ToString(CultureInfo.InvariantCulture) {
                        trace.Allocations.Remove(id)
                    } else {
                        trace.Allocations[id] = ProfilerSmokeAllocation(record.GetProperty("ownerKind").GetInt32(),
                            record.GetProperty("requirementBytes").GetUInt64(), resourceSource == "vulkan.retired")
                    }
                }
                let counterName = record.GetProperty("name").GetString() ?? ""
                if trace.AccountsValid && (counterName == "vulkan.live.requirements" || counterName == "vulkan.retired.requirements") {
                    let owner = record.GetProperty("ownerKind").GetInt32()
                    let retired = counterName == "vulkan.retired.requirements"
                    var bytes uint64 = 0uL
                    var count uint64 = 0uL
                    for allocation in trace.Allocations.Values {
                        if allocation.Owner == owner && allocation.Retired == retired {
                            bytes += allocation.Bytes
                            count++
                        }
                    }
                    Require(record.GetProperty("value0").GetUInt64() == bytes
                        && record.GetProperty("value1").GetUInt64() == count, "Allocator lifecycle does not reconcile")
                }
                if counterName == "vulkan.retired.placement"
                    && record.GetProperty("ownerKind").GetInt32() == int32(VulkanMemoryOwnerKind.Buffer) {
                    trace.AccountsValid = true
                }
                if kind != "duration" {
                    Require(record.GetProperty("endTicks").ValueKind == JsonValueKind.Null,
                        "Non-duration record has an end timestamp")
                }
                if kind == "metadata" || kind == "gap" || kind == "end" {
                    Require(record.GetProperty("threadId").ValueKind == JsonValueKind.Null,
                        "Unmeasured thread identity is not null")
                }
                let category = record.GetProperty("category").GetString() ?? ""
                if kind == "duration" {
                    let end = Int64.Parse(
                        record.GetProperty("endTicks").GetString() ?? "-1",
                        CultureInfo.InvariantCulture
                    )
                    Require(end >= ticks, "Phase ends before it starts")
                    trace.LastCpuEnd = Math.Max(trace.LastCpuEnd, end)
                    let pump = record.GetProperty("pumpId").GetString() ?? "0"
                    Require(
                        pump == "0" ? record.GetProperty("frameId").ValueKind == JsonValueKind.Null
                        : record.GetProperty("windowId").GetString() == trace.WindowId,
                        "Phase has invalid pump/window correlation"
                    )
                    if category == "0" {
                        Require(record.GetProperty("imageIndex").ValueKind == JsonValueKind.Null,
                            "CPU phase has an unmeasured image index")
                        let stage = Int32.Parse(record.GetProperty("eventId").GetString() ?? "-1", CultureInfo.InvariantCulture)
                        trace.Phases.Add(stage)
                        if stage == int32(FrameProfileStage.Frame) { Require(trace.FramePhases.Add(pump), "Pump ID repeated") }
                        if stage == int32(FrameProfileStage.Build) { trace.Builds[pump] = end }
                        if stage == int32(FrameProfileStage.Paint) { trace.Paints[pump] = ticks }
                    }
                }
                if kind == "instant" && category == VulkanDiagnosticCategories.Timing.ToString(CultureInfo.InvariantCulture)
                    && record.GetProperty("eventId").GetString() == VulkanDiagnosticEventIds.FrameBegin.ToString(CultureInfo.InvariantCulture) {
                    Require(record.GetProperty("windowId").GetString() == trace.WindowId,
                        "Native frame has the wrong window")
                    Require(record.GetProperty("frameId").ValueKind == JsonValueKind.String
                        && record.GetProperty("pumpId").ValueKind == JsonValueKind.String,
                        "Native frame has invalid correlation IDs")
                    trace.FramePumps[record.GetProperty("frameId").GetString() ?? ""] = record.GetProperty("pumpId").GetString() ?? ""
                    Require(record.GetProperty("imageIndex").ValueKind == JsonValueKind.Null,
                        "Pre-acquire frame has an image index")
                }
                if record.GetProperty("source").ValueKind == JsonValueKind.String {
                    let source = record.GetProperty("source").GetString() ?? ""
                    trace.Sources.Add(source)
                    trace.Providers.Add(source)
                    if source == "vulkan.library" {
                        Require(record.GetProperty("imageIndex").ValueKind == JsonValueKind.Null,
                            "Startup library load has an image index")
                    }
                    if source == "graphics.completion-observed" {
                        let serial = UInt64.Parse(record.GetProperty("submissionId").GetString() ?? "0", CultureInfo.InvariantCulture)
                        Require(serial > trace.LastCompletion, "Graphics completion serial did not advance")
                        trace.LastCompletion = serial
                    }
                    if source == "vkQueueSubmit2" {
                        trace.Submitted.Add(record.GetProperty("submissionId").GetString() ?? "")
                    }
                    if source == "vkQueueSubmit2" || source == "vkQueuePresentKHR" || source == "submit.enqueue" {
                        Require(
                            record.GetProperty("submissionId").ValueKind == JsonValueKind.String
                            && record.GetProperty("frameId").ValueKind == JsonValueKind.String
                            && record.GetProperty("windowId").GetString() == trace.WindowId
                            && trace.FramePumps.TryGetValue(record.GetProperty("frameId").GetString() ?? "", out var framePump)
                            && framePump == record.GetProperty("pumpId").GetString()
                            && record.GetProperty("imageIndex").ValueKind == JsonValueKind.Number,
                            "Queue frame/pump/window/image correlation is missing"
                        )
                    }
                }
                Require(
                    record.TryGetProperty("requirementBytes", out var requirement)
                    && record.TryGetProperty("resourceGeneration", out var generation)
                    && record.TryGetProperty("validity", out var validity),
                    "Wire envelope lacks resource/sample fields"
                )
            }
        }
    }
}
