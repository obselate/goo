package Goo

import System
import System.Diagnostics
import System.Globalization
import System.IO
import System.Threading

internal partial class FrameRecorder {
    private let sampleWake AutoResetEvent = AutoResetEvent(false)
    private var stopping int32
    private var resourceIdentity int64
    private var baselineVersion int64

    internal prop BaselineVersion int64 { get -> Volatile.Read(&baselineVersion) }
    internal func ResourceIdentity() uint64 -> uint64(Interlocked.Increment(&resourceIdentity))

    private func StartSamples() {
        let worker = Thread(SampleLoop)
        worker.IsBackground = true
        worker.Start()
    }

    internal func Counter(name string, source string, value uint64?, ticks int64,
        validity string = "available", gcIndex int64? = nil, unit string = "bytes") {
        Publish(FrameTraceRecord{
            Kind: FrameTraceKind.Counter, Ticks: ticks - Origin,
            EventId: VulkanDiagnosticEventIds.LiveMemory, Category: VulkanDiagnosticCategories.Runtime,
            ThreadId: Environment.CurrentManagedThreadId, Name: name, Source: source,
            Value0: value, SampleTicks: ticks - Origin, GcIndex: gcIndex,
            Validity: validity, Unit: unit,
        })
    }

    private func SampleLoop() {
        try {
            var nextProcess int64 = 0L
            while true {
                SampleManaged()
                let now = Stopwatch.GetTimestamp()
                if now >= nextProcess || Volatile.Read(&stopping) != 0 {
                    SampleProcess()
                    nextProcess = now + Stopwatch.Frequency / 2L
                }
                if Volatile.Read(&stopping) != 0 {
                    let deadline = Stopwatch.GetTimestamp() + Stopwatch.Frequency / 2L
                    while PendingGpuCount > 0 && Stopwatch.GetTimestamp() < deadline {
                        sampleWake.WaitOne(10)
                    }
                    break
                }
                sampleWake.WaitOne(100)
            }
        } catch (_ Exception) {
            Stop(true)
        } finally {
            FinishStop()
            sampleWake.Dispose()
        }
    }

    private func SampleManaged() {
        let ticks = Stopwatch.GetTimestamp()
        Counter("managed.allocated.total", "GC.GetTotalAllocatedBytes(false)",
            uint64(GC.GetTotalAllocatedBytes(false)), ticks)
        Counter("managed.heap.estimate", "GC.GetTotalMemory(false)", uint64(GC.GetTotalMemory(false)), ticks)
        let info = GC.GetGCMemoryInfo()
        let known = info.Index != 0L
        let index int64? = if known { info.Index } else { nil }
        let validity = if known { "last-gc" } else { "unavailable" }
        Counter("managed.heap.last_gc", "GC.GetGCMemoryInfo", if known { uint64(info.HeapSizeBytes) } else { nil }, ticks, validity, index)
        Counter("managed.committed.last_gc", "GC.GetGCMemoryInfo", if known { uint64(info.TotalCommittedBytes) } else { nil }, ticks, validity, index)
        Counter("managed.fragmented.last_gc", "GC.GetGCMemoryInfo", if known { uint64(info.FragmentedBytes) } else { nil }, ticks, validity, index)
        for generation in 0 ... 3 {
            let name = switch generation {
                case 0: "gc.gen0.collections"
                case 1: "gc.gen1.collections"
                default: "gc.gen2.collections"
            }
            Publish(FrameTraceRecord{
                Kind: FrameTraceKind.Counter, Ticks: ticks - Origin,
                EventId: VulkanDiagnosticEventIds.LiveMemory, Category: VulkanDiagnosticCategories.Runtime,
                ThreadId: Environment.CurrentManagedThreadId, Name: name, Source: "GC.CollectionCount",
                Value0: uint64(GC.CollectionCount(generation)), SampleTicks: ticks - Origin,
                GcIndex: index, Validity: "observed-total", Unit: "count",
            })
        }
        let generations = info.GenerationInfo
        for generation in 0 ... 5 {
            let name = switch generation {
                case 0: "gc.gen0.size.last_gc"
                case 1: "gc.gen1.size.last_gc"
                case 2: "gc.gen2.size.last_gc"
                case 3: "gc.loh.size.last_gc"
                default: "gc.poh.size.last_gc"
            }
            Counter(name, "GC.GetGCMemoryInfo.GenerationInfo", if known && generation < generations.Length {
                uint64(generations[generation].SizeAfterBytes)
            } else { nil }, ticks, validity, index)
        }
        Counter("profiler.buffer.budget", "recorder", uint64(BufferBytes), ticks)
        Counter("profiler.record.storage", "Unsafe.SizeOf(FrameTraceRecord)",
            uint64(System.Runtime.CompilerServices.Unsafe.SizeOf[FrameTraceRecord]()) * uint64(records.Length), ticks)
        lock gate {
            Counter("profiler.metadata.managed.registered", "recorder", uint64(managedIdentityCount), ticks, unit: "count")
            Counter("profiler.metadata.native.entries", "recorder", uint64(nativeResources.Count), ticks, unit: "count")
            Counter("profiler.metadata.resource.entries", "recorder", uint64(resourceRecords.Count), ticks, unit: "count")
            Counter("profiler.metadata.gpu.entries", "recorder", uint64(pendingGpu.Count), ticks, unit: "count")
            Counter("profiler.metadata.gpu.capacity", "recorder", uint64(pendingGpu.EnsureCapacity(0)), ticks, unit: "count")
        }
    }

    private func SampleProcess() {
        let ticks = Stopwatch.GetTimestamp()
        if OperatingSystem.IsLinux() {
            try {
                var rss uint64? = nil
                var pss uint64? = nil
                for line in File.ReadAllLines("/proc/self/smaps_rollup") {
                    if line.StartsWith("Rss:", StringComparison.Ordinal) { rss = RollupBytes(line) }
                    if line.StartsWith("Pss:", StringComparison.Ordinal) { pss = RollupBytes(line) }
                }
                Counter("process.rss", "/proc/self/smaps_rollup:Rss", rss, ticks,
                    if rss != nil { "available" } else { "unavailable" })
                Counter("process.pss", "/proc/self/smaps_rollup:Pss", pss, ticks,
                    if pss != nil { "available" } else { "unavailable" })
            } catch (_ IOException) {
                ProcessUnavailable(ticks)
            } catch (_ UnauthorizedAccessException) {
                ProcessUnavailable(ticks)
            }
            return
        }
        using let process = Process.GetCurrentProcess()
        Counter("process.working_set", "Process.WorkingSet64", uint64(process.WorkingSet64), ticks)
        Counter("process.pss", "unsupported", nil, ticks, "unavailable")
    }

    shared {
        internal func RollupBytes(line string) uint64? {
            let fields = line.Split(' ', StringSplitOptions.RemoveEmptyEntries)
            if fields.Length != 3 || fields[2] != "kB"
                || !UInt64.TryParse(fields[1], NumberStyles.None, CultureInfo.InvariantCulture, out var kib)
                || kib > uint64.MaxValue / 1024uL { return nil }
            return kib * 1024uL
        }
    }

    private func ProcessUnavailable(ticks int64) {
        Counter("process.rss", "/proc/self/smaps_rollup:Rss", nil, ticks, "unavailable")
        Counter("process.pss", "/proc/self/smaps_rollup:Pss", nil, ticks, "unavailable")
    }
}
