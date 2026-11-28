package Goo

import System
import System.Collections.Generic
import System.Diagnostics
import System.Threading

internal unsafe partial class VulkanDiagnostics {
  private const TraceCapacity int32 = 4096
  private const ResultCapacity int32 = 128
  private const ValidationCapacity int32 = 64
  private const ValidationTextCapacity int32 = 512
  private const FatalNameCapacity int32 = 256
  private const WriterOpen int32 = 0
  private const WriterFreezing int32 = 1
  private const WriterFrozen int32 = 2
  private const WriterSealing int32 = 3
  private const WriterSealed int32 = 4

  private let trace [] ? VulkanDiagnosticTraceRecord
  private let results [] ? VulkanDiagnosticResultRecord
  private let validation [] ? VulkanDiagnosticValidationRecord
  private let validationText [] ? uint8
  private let fatalDeviceName [] ? uint8
  private let counters VulkanDiagnosticCounters
  private let textAtlasContributionGate object
  private let textAtlasContributions List[VulkanDiagnosticTextAtlasContribution]
  private var nextTextAtlasContributionId uint64 = 1uL
  private var textAtlasContributionAtlasCount uint64
  private var textAtlasContributionResidentBytes uint64
  private var textAtlasContributionLiveObjectCount uint64
  private var traceWrite int64
  private var traceDropped int64
  private var resultWrite int64
  private var resultDropped int64
  private var validationWrite int64
  private var validationDropped int64
  private var validationErrors int64
  private var fatalCode int32
  private var fatalValue uint64
  private var fatalSnapshotCaptured int32
  private var fatalTraceWrite int64
  private var fatalValidationWrite int64
  private var fatalResultWrite int64
  private var fatalInstanceApiVersion uint32
  private var fatalPhysicalApiVersion uint32
  private var fatalDriverVersion uint32
  private var fatalVendorId uint32
  private var fatalDeviceId uint32
  private var fatalDeviceType int32
  private var fatalTimelineSemaphore uint32
  private var fatalSynchronization2 uint32
  private var fatalDynamicRendering uint32
  private var fatalDebugUtilsAvailable uint32
  private var fatalInstanceExtensionCount uint32
  private var fatalDeviceExtensionCount uint32
  private var fatalWindow uint64
  private var fatalSurface uint64
  private var fatalSwapchain uint64
  private var fatalFrame uint64
  private var fatalGeneration uint64
  private var fatalHeapBudgetAvailable uint32
  private var fatalHeapBudgetSampleCurrent uint32
  private var fatalHeapBudget uint64
  private var fatalDriverHeapUsage uint64
  private var fatalHeapAllocated uint64
  private var fatalRetiredBytes uint64
  private var fatalLiveObjects uint64
  private var fatalLastSubmission uint64
  private var fatalLastQueue uint64
  private var fatalLastFence uint64
  private var fatalLastResultEvent uint64
  private var fatalLastResult int32
  private var fatalCounters VulkanDiagnosticCounterSnapshot
  private var writerState int32 = WriterOpen
  private var activeWriters int32
  private var originTicks uint64
  private var originFrequency uint64
  private var liveFirstPresent VulkanDiagnosticLiveSnapshot
  private var livePreTeardown VulkanDiagnosticLiveSnapshot
  private var liveFirstPresentClaimed int32
  private var livePreTeardownClaimed int32

  shared {
    private var openOriginTicks uint64
    private var openOriginFrequency uint64
    internal var StartupReportPath string? = Environment.GetEnvironmentVariable("GOO_VK_STARTUP_REPORT")
    internal var StartupReportEnabled bool = !string.IsNullOrEmpty(StartupReportPath) && StartupReportPath != "0"

    func Create(enabled bool) VulkanDiagnostics? {
      if !enabled {
        return nil
      }
      let created = VulkanDiagnostics()
      if created.originTicks != 0uL {
        created.Record(
          0uL, 0uL, 0uL, 0uL, 0uL, 0uL, 0uL, 0uL, 0uL, 0uL,
          VulkanDiagnosticEventIds.StartupOrigin,
          VulkanDiagnosticCategories.Runtime,
          0uL, 0, created.originFrequency, created.originTicks)
      }
      return created
    }

    internal func BindOpenOrigin(ticks uint64) {
      if ticks == 0uL {
        return
      }
      if openOriginFrequency == 0uL {
        openOriginFrequency = uint64(Stopwatch.Frequency)
      }
      Interlocked.Exchange(ref openOriginTicks, ticks)
    }
  }

  internal prop ValidationErrorCount int64{ get -> Interlocked.Read(in validationErrors) }
  internal prop TraceWriteCount int64{ get -> Interlocked.Read(in traceWrite) }
  internal prop ResultWriteCount int64{ get -> Interlocked.Read(in resultWrite) }
  internal prop ValidationWriteCount int64{ get -> Interlocked.Read(in validationWrite) }
  internal prop IsSealed bool{ get -> Volatile.Read(in writerState) == WriterSealed }
  internal prop OriginTicks uint64{ get -> originTicks }
  internal prop Counters VulkanDiagnosticCounterSnapshot{ get -> counters.Snapshot }
  internal prop Fatal VulkanDiagnosticFatalSnapshot{
    get {
      return VulkanDiagnosticFatalSnapshot{
        captured: Volatile.Read(in fatalSnapshotCaptured) != 0,
        code: fatalCode,
        value: fatalValue,
        traceAtCapture: uint64(fatalTraceWrite),
        validationAtCapture: uint64(fatalValidationWrite),
        resultAtCapture: uint64(fatalResultWrite),
        instanceApiVersion: fatalInstanceApiVersion,
        physicalApiVersion: fatalPhysicalApiVersion,
        driverVersion: fatalDriverVersion,
        vendorId: fatalVendorId,
        deviceId: fatalDeviceId,
        deviceType: fatalDeviceType,
        timelineSemaphore: fatalTimelineSemaphore,
        synchronization2: fatalSynchronization2,
        dynamicRendering: fatalDynamicRendering,
        debugUtilsAvailable: fatalDebugUtilsAvailable,
        instanceExtensionCount: fatalInstanceExtensionCount,
        deviceExtensionCount: fatalDeviceExtensionCount,
        window: fatalWindow,
        surface: fatalSurface,
        swapchain: fatalSwapchain,
        frame: fatalFrame,
        generation: fatalGeneration,
        heapBudgetAvailable: fatalHeapBudgetAvailable,
        heapBudgetSampleCurrent: fatalHeapBudgetSampleCurrent,
        heapBudget: fatalHeapBudget,
        driverHeapUsage: fatalDriverHeapUsage,
        heapAllocated: fatalHeapAllocated,
        retiredBytes: fatalRetiredBytes,
        liveObjects: fatalLiveObjects,
        lastSubmission: fatalLastSubmission,
        lastQueue: fatalLastQueue,
        lastFence: fatalLastFence,
        lastResultEvent: fatalLastResultEvent,
        lastResult: fatalLastResult,
        counters: fatalCounters,
      }
    }
  }

  internal init() {
    trace = [TraceCapacity]VulkanDiagnosticTraceRecord
    results = [ResultCapacity]VulkanDiagnosticResultRecord
    validation = [ValidationCapacity]VulkanDiagnosticValidationRecord
    validationText = [ValidationCapacity * ValidationTextCapacity]uint8
    fatalDeviceName = [FatalNameCapacity]uint8
    counters = VulkanDiagnosticCounters()
    textAtlasContributionGate = Object()
    textAtlasContributions = List[VulkanDiagnosticTextAtlasContribution]()
    originTicks = Interlocked.Exchange(ref openOriginTicks, 0uL)
    originFrequency = openOriginFrequency
  }

  internal func Record(run uint64, workload uint64, process uint64, window uint64,
    frame uint64, sample uint64, queue uint64, submission uint64, fence uint64,
    query uint64, eventId uint64, category uint64, severity uint64, result int32,
    value0 uint64, value1 uint64, requestedWidth uint32 = 0u, requestedHeight uint32 = 0u) {
      if !EnterWriter() {
        return
      }
      try {
        RecordCore(run, workload, process, window, frame, sample, queue, submission, fence,
          query, eventId, category, severity, result, value0, value1, requestedWidth, requestedHeight)
      } finally {
        ExitWriter()
      }
    }

  private func RecordCore(run uint64, workload uint64, process uint64, window uint64,
    frame uint64, sample uint64, queue uint64, submission uint64, fence uint64,
    query uint64, eventId uint64, category uint64, severity uint64, result int32,
    value0 uint64, value1 uint64, requestedWidth uint32 = 0u, requestedHeight uint32 = 0u) {
      let writeIndex = Interlocked.Increment(ref traceWrite) - 1L
      if writeIndex < 0L {
        return
      }
      if let storage = trace {
        let slot = int32(writeIndex % int64(storage.Length))
        if writeIndex >= int64(storage.Length) {
          Interlocked.Increment(ref traceDropped)
        }
        storage[slot] = VulkanDiagnosticTraceRecord{
          run: run,
          workload: workload,
          process: process,
          window: window,
          frame: frame,
          sample: sample,
          queue: queue,
          submission: submission,
          fence: fence,
          query: query,
          eventId: eventId,
          category: category,
          severity: severity,
          result: result,
          value0: value0,
          value1: value1,
          requestedWidth: requestedWidth,
          requestedHeight: requestedHeight,
        }
      }
    }

  private func EnterWriter() bool {
    if Volatile.Read(in writerState) != WriterOpen {
      return false
    }
    Interlocked.Increment(ref activeWriters)
    if Volatile.Read(in writerState) == WriterOpen {
      return true
    }
    Interlocked.Decrement(ref activeWriters)
    return false
  }

  private func ExitWriter() {
    Interlocked.Decrement(ref activeWriters)
  }

  private func WaitForWriters() {
    while Volatile.Read(in activeWriters) != 0 {
    }
  }

  internal func Seal() bool {
    while true {
      let state = Volatile.Read(in writerState)
      if state == WriterSealed {
        return true
      }
      if state == WriterFrozen {
        if Interlocked.CompareExchange(ref writerState, WriterSealed, WriterFrozen) == WriterFrozen {
          return true
        }
        continue
      }
      if state == WriterOpen {
        if Interlocked.CompareExchange(ref writerState, WriterSealing, WriterOpen) != WriterOpen {
          continue
        }
        WaitForWriters()
        if Interlocked.CompareExchange(ref writerState, WriterSealed, WriterSealing) == WriterSealing {
          return true
        }
        continue
      }
      while Volatile.Read(in writerState) == WriterFreezing
        || Volatile.Read(in writerState) == WriterSealing{
        }
    }
  }

  internal func RecordStage(run uint64, workload uint64, process uint64, window uint64,
    frame uint64, sample uint64, queue uint64, submission uint64, fence uint64,
    eventId uint64, category uint64, startTicks uint64, endTicks uint64) {
      Record(run, workload, process, window, frame, sample, queue, submission, fence,
        0uL, eventId, category, 0uL, 0, startTicks, endTicks)
    }

  internal func CaptureLiveMemory(eventId uint64, ticks uint64) {
    let firstPresent = eventId == VulkanDiagnosticEventIds.FirstSuccessfulPresent
    if firstPresent {
      if Interlocked.CompareExchange(ref liveFirstPresentClaimed, 1, 0) != 0 {
        return
      }
    } else if Interlocked.CompareExchange(ref livePreTeardownClaimed, 1, 0) != 0 {
      return
    }
    var managed uint64 = 0uL
    var privateBytes uint64 = 0uL
    var workingSet uint64 = 0uL
    try {
      let total = GC.GetTotalMemory(false)
      if total > 0L {
        managed = uint64(total)
      }
    } catch (cleanup Exception) { }
    try {
      using let process = Process.GetCurrentProcess()
      process.Refresh()
      let privateValue = process.PrivateMemorySize64
      let workingValue = process.WorkingSet64
      if privateValue > 0L {
        privateBytes = uint64(privateValue)
      }
      if workingValue > 0L {
        workingSet = uint64(workingValue)
      }
    } catch (cleanup Exception) { }
    if !EnterWriter() {
      return
    }
    try {
      if managed != 0uL {
        counters.Set(VulkanCounterId.ManagedAllocatedBytes, managed)
      }
      let snapshot = counters.Snapshot
      let liveTicks = if ticks != 0uL { ticks } else { uint64(Stopwatch.GetTimestamp()) }
      let live = VulkanDiagnosticLiveSnapshot{
        eventId: eventId,
        ticks: liveTicks,
        managedAllocatedBytes: managed,
        privateBytes: privateBytes,
        workingSetBytes: workingSet,
        vulkanObjectCount: snapshot[VulkanCounterId.VulkanObjectCount],
        vulkanDeviceMemoryBytes: snapshot[VulkanCounterId.VulkanDeviceMemoryBytes],
        heapAllocated: snapshot[VulkanCounterId.VulkanDeviceMemoryBytes],
        driverHeapUsage: snapshot[VulkanCounterId.DriverHeapUsage],
        heapBudget: snapshot[VulkanCounterId.HeapBudget],
        allocatorBytes: snapshot[VulkanCounterId.AllocatorBytes],
        cacheBytes: snapshot[VulkanCounterId.CacheBytes],
      }
      if firstPresent {
        liveFirstPresent = live
      } else {
        livePreTeardown = live
      }
      RecordCore(0uL, 0uL, 0uL, 0uL, 0uL, 0uL, 0uL, 0uL, 0uL, 0uL,
        VulkanDiagnosticEventIds.LiveMemory, VulkanDiagnosticCategories.Timing,
        0uL, 0, managed, workingSet)
    } finally {
      ExitWriter()
    }
  }

  internal func RecordResult(eventId uint64, result int32) {
    RecordResult(eventId, result, 0uL, 0uL, 0uL, 0uL)
  }

  internal func RecordResult(eventId uint64, result int32, frame uint64,
    queue uint64, submission uint64, fence uint64) {
      if !EnterWriter() {
        return
      }
      try {
        let resultClass = VulkanDiagnosticResultClassifier.Classify(VkResult(result))
        let writeIndex = Interlocked.Increment(ref resultWrite) - 1L
        if writeIndex >= 0L {
          if let storage = results {
            let slot = int32(writeIndex % int64(storage.Length))
            if writeIndex >= int64(storage.Length) {
              Interlocked.Increment(ref resultDropped)
            }
            storage[slot] = VulkanDiagnosticResultRecord{
              ordinal: uint64(writeIndex),
              eventId: eventId,
              classification: uint32(resultClass),
              frame: frame,
              queue: queue,
              submission: submission,
              fence: fence,
              result: result,
            }
          }
        }
        fatalLastResultEvent = eventId
        fatalLastResult = result
        counters.AddResult(resultClass == VulkanDiagnosticResultClass.NonSuccess)
        RecordCore(0uL, 0uL, 0uL, 0uL, frame, 0uL, queue, submission, fence, 0uL,
          eventId, VulkanDiagnosticCategories.Result,
          if resultClass == VulkanDiagnosticResultClass.NonSuccess { 1uL } else { 0uL },
          result, 0uL, 0uL)
      } finally {
        ExitWriter()
      }
    }

  internal func CaptureInstanceFacts(apiVersion uint32, extensionCount uint32, debugUtilsAvailable uint32) {
    if !EnterWriter() {
      return
    }
    try {
      fatalInstanceApiVersion = apiVersion
      fatalInstanceExtensionCount = extensionCount
      fatalDebugUtilsAvailable = debugUtilsAvailable
    } finally {
      ExitWriter()
    }
  }

  internal func CaptureDeviceFacts(
    apiVersion uint32,
    driverVersion uint32,
    vendorId uint32,
    deviceId uint32,
    deviceType int32,
    deviceName * int8,
    timelineSemaphore uint32,
    synchronization2 uint32,
    dynamicRendering uint32) {
      if !EnterWriter() {
        return
      }
      try {
        fatalDriverVersion = driverVersion
        fatalVendorId = vendorId
        fatalDeviceId = deviceId
        fatalDeviceType = deviceType
        fatalTimelineSemaphore = timelineSemaphore
        fatalSynchronization2 = synchronization2
        fatalDynamicRendering = dynamicRendering
        if let target = fatalDeviceName {
          var index int32 = 0
          while deviceName != nil && index < FatalNameCapacity {
            let value = deviceName[index]
            if value == int8(0) {
              break
            }
            target[index] = uint8(value)
            index++
          }
        }
        fatalPhysicalApiVersion = apiVersion
      } finally {
        ExitWriter()
      }
    }

  internal func CaptureWsiFacts(window uint64, surface uint64, swapchain uint64,
    frame uint64, generation uint64) {
      if !EnterWriter() {
        return
      }
      try {
        fatalWindow = window
        fatalSurface = surface
        fatalSwapchain = swapchain
        fatalFrame = frame
        fatalGeneration = generation
      } finally {
        ExitWriter()
      }
    }

  internal func CaptureResourceFacts(heapBudgetAvailable uint32, heapBudgetSampleCurrent uint32,
    heapBudget uint64,
    driverHeapUsage uint64, heapAllocated uint64, retiredBytes uint64, liveObjects uint64) {
      if !EnterWriter() {
        return
      }
      try {
        fatalHeapBudgetAvailable = heapBudgetAvailable
        fatalHeapBudgetSampleCurrent = heapBudgetSampleCurrent
        fatalHeapBudget = heapBudget
        fatalDriverHeapUsage = driverHeapUsage
        fatalHeapAllocated = heapAllocated
        fatalRetiredBytes = retiredBytes
        fatalLiveObjects = liveObjects
        counters.Set(VulkanCounterId.HeapBudgetAvailable, uint64(heapBudgetAvailable))
        counters.Set(VulkanCounterId.HeapBudgetSampleCurrent, uint64(heapBudgetSampleCurrent))
        counters.Set(VulkanCounterId.HeapBudget, heapBudget)
        counters.Set(VulkanCounterId.DriverHeapUsage, driverHeapUsage)
      } finally {
        ExitWriter()
      }
    }

  internal func CaptureSubmission(submission uint64, queue uint64, fence uint64) {
    if !EnterWriter() {
      return
    }
    try {
      fatalLastSubmission = submission
      fatalLastQueue = queue
      fatalLastFence = fence
    } finally {
      ExitWriter()
    }
  }

  internal func CaptureValidation(severity uint32, types uint32, messageId int32,
    message * int8) {
      if !EnterWriter() {
        return
      }
      try {
        if let records = validation {
          if let bytes = validationText {
            let writeIndex = Interlocked.Increment(ref validationWrite) - 1L
            if writeIndex < 0L {
              return
            }
            let slot = int32(writeIndex % int64(records.Length))
            if writeIndex >= int64(records.Length) {
              Interlocked.Increment(ref validationDropped)
            }
            var length uint32 = 0u
            var hash uint32 = 2166136261u
            while message != nil && length < uint32(ValidationTextCapacity) {
              let current = message[length]
              if current == int8(0) {
                break
              }
              let value = uint8(current)
              bytes[slot * ValidationTextCapacity + int32(length)] = value
              hash = (hash ^ uint32(value)) * 16777619u
              length++
            }
            let truncated uint32 = if length == uint32(ValidationTextCapacity) { 1u } else { 0u }
            records[slot] = VulkanDiagnosticValidationRecord{
              severity: severity,
              types: types,
              messageId: messageId,
              messageHash: hash,
              messageLength: length,
              messageOffset: uint32(slot * ValidationTextCapacity),
              messageTruncated: truncated,
            }
            let isError = (severity & uint32(VkConstants.VK_DEBUG_UTILS_MESSAGE_SEVERITY_ERROR_BIT_EXT)) != 0u
            if isError {
              Interlocked.Increment(ref validationErrors)
              counters.Add(VulkanCounterId.ValidationErrorCount, 1uL)
            }
            RecordCore(0uL, 0uL, 0uL, 0uL, 0uL, 0uL, 0uL, 0uL, 0uL, 0uL,
              VulkanDiagnosticEventIds.ValidationMessage, VulkanDiagnosticCategories.Validation,
              if isError { 1uL } else { 0uL }, messageId, uint64(hash), uint64(length))
          }
        }
      } finally {
        ExitWriter()
      }
    }

  internal func CaptureFatal(code int32, value uint64) {
    var won bool = false
    while !won {
      let state = Volatile.Read(in writerState)
      if state == WriterOpen {
        won = Interlocked.CompareExchange(ref writerState, WriterFreezing, WriterOpen) == WriterOpen
      } else if state == WriterSealing {
        won = Interlocked.CompareExchange(ref writerState, WriterFreezing, WriterSealing) == WriterSealing
      } else {
        return
      }
    }
    WaitForWriters()
    RecordCore(0uL, 0uL, 0uL, 0uL, 0uL, 0uL, 0uL, 0uL, 0uL, 0uL,
      VulkanDiagnosticEventIds.FatalSnapshot, VulkanDiagnosticCategories.Fatal,
      1uL, code, value, 0uL)
    fatalCode = code
    fatalValue = value
    fatalTraceWrite = Interlocked.Read(in traceWrite)
    fatalValidationWrite = Interlocked.Read(in validationWrite)
    fatalResultWrite = Interlocked.Read(in resultWrite)
    fatalCounters = counters.Snapshot
    Volatile.Write(ref fatalSnapshotCaptured, 1)
    Volatile.Write(ref writerState, WriterFrozen)
  }

  internal func AddCounter(id VulkanCounterId, delta uint64 = 1uL) {
    if !EnterWriter() { return }
    try { counters.Add(id, delta) } finally { ExitWriter() }
  }

  internal func SetCounter(id VulkanCounterId, value uint64) {
    if !EnterWriter() { return }
    try { counters.Set(id, value) } finally { ExitWriter() }
  }

  internal func SetPeakCounter(id VulkanCounterId, value uint64) {
    if !EnterWriter() { return }
    try { counters.SetPeak(id, value) } finally { ExitWriter() }
  }

  internal func SetMemoryPolicy(headroom uint64, evictions uint64, retries uint64, pressure uint64) {
    if !EnterWriter() { return }
    try { counters.SetMemoryPolicy(headroom, evictions, retries, pressure) } finally { ExitWriter() }
  }

  internal func SetPathAtlasStats(stats VulkanPathResourcesStats, liveObjectCount uint64) {
    if !EnterWriter() { return }
    try { counters.SetPathAtlasStats(stats, liveObjectCount) } finally { ExitWriter() }
  }

  internal func SetClipMaskAtlasStats(stats VulkanClipMaskAtlasStats) {
    if !EnterWriter() { return }
    try { counters.SetClipMaskAtlasStats(stats) } finally { ExitWriter() }
  }

  internal func ClearClipMaskAtlasCurrentState() {
    if !EnterWriter() { return }
    try { counters.ClearClipMaskAtlasCurrentState() } finally { ExitWriter() }
  }

  internal func SetClipMaskFrameStats(stats VulkanClipMaskFrameStats,
    totals VulkanClipMaskFrameTotals) {
      if !EnterWriter() { return }
      try { counters.SetClipMaskFrameStats(stats, totals) } finally { ExitWriter() }
    }

  internal func SetTextFrameStats(stats VulkanTextFrameStats) {
    if !EnterWriter() { return }
    try { counters.SetTextFrameStats(stats) } finally { ExitWriter() }
  }

  internal func SetTextCacheStats(layoutStats TextCacheStats, runStats TextCacheStats) {
    if !EnterWriter() { return }
    try { counters.SetTextCacheStats(layoutStats, runStats) } finally { ExitWriter() }
  }

  internal func ClearPathAtlasCurrentState() {
    if !EnterWriter() { return }
    try { counters.ClearPathAtlasCurrentState() } finally { ExitWriter() }
  }

  internal func AddDamage(count uint64, area uint64) {
    if !EnterWriter() { return }
    try { counters.AddDamage(count, area) } finally { ExitWriter() }
  }

  internal func SetLayerPoolStats(residentBytes uint64,
    targetCount uint64, leasedCount uint64, resolutionShift uint64) {
      if !EnterWriter() { return }
      try {
        counters.SetLayerPoolStats(residentBytes, targetCount, leasedCount, resolutionShift)
      } finally { ExitWriter() }
    }

  internal func RegisterTextAtlasContribution() uint64 {
    if IsSealed {
      return 0uL
    }
    lock (textAtlasContributionGate) {
      if nextTextAtlasContributionId == uint64.MaxValue {
        throw OverflowException("Vulkan text atlas diagnostic contribution id overflow")
      }
      let id = nextTextAtlasContributionId
      nextTextAtlasContributionId = nextTextAtlasContributionId + 1uL
      textAtlasContributions.Add(VulkanDiagnosticTextAtlasContribution{ Id: id })
      return id
    }
  }

  internal func SetTextAtlasContribution(id uint64, atlasCount uint64,
    residentBytes uint64, liveObjectCount uint64) {
      if id == 0uL || IsSealed {
        return
      }
      lock (textAtlasContributionGate) {
        var index int32 = 0
        while index < textAtlasContributions.Count {
          let current = textAtlasContributions[index]
          if current.Id == id {
            let nextAtlasCount = ReplaceTextAtlasContribution(
              textAtlasContributionAtlasCount, current.AtlasCount, atlasCount)
            let nextResidentBytes = ReplaceTextAtlasContribution(
              textAtlasContributionResidentBytes, current.ResidentBytes, residentBytes)
            let nextLiveObjectCount = ReplaceTextAtlasContribution(
              textAtlasContributionLiveObjectCount, current.LiveObjectCount, liveObjectCount)
            textAtlasContributionAtlasCount = nextAtlasCount
            textAtlasContributionResidentBytes = nextResidentBytes
            textAtlasContributionLiveObjectCount = nextLiveObjectCount
            textAtlasContributions[index] = VulkanDiagnosticTextAtlasContribution{
              Id: id,
              AtlasCount: atlasCount,
              ResidentBytes: residentBytes,
              LiveObjectCount: liveObjectCount,
            }
            counters.Set(VulkanCounterId.TextAtlasCount, nextAtlasCount)
            counters.Set(VulkanCounterId.TextAtlasResidentBytes, nextResidentBytes)
            counters.Set(VulkanCounterId.TextAtlasLiveObjectCount, nextLiveObjectCount)
            return
          }
          index = index + 1
        }
      }
    }

  internal func RemoveTextAtlasContribution(id uint64) {
    if id == 0uL {
      return
    }
    lock (textAtlasContributionGate) {
      var index int32 = 0
      while index < textAtlasContributions.Count {
        let current = textAtlasContributions[index]
        if current.Id == id {
          let nextAtlasCount = ReplaceTextAtlasContribution(
            textAtlasContributionAtlasCount, current.AtlasCount, 0uL)
          let nextResidentBytes = ReplaceTextAtlasContribution(
            textAtlasContributionResidentBytes, current.ResidentBytes, 0uL)
          let nextLiveObjectCount = ReplaceTextAtlasContribution(
            textAtlasContributionLiveObjectCount, current.LiveObjectCount, 0uL)
          textAtlasContributionAtlasCount = nextAtlasCount
          textAtlasContributionResidentBytes = nextResidentBytes
          textAtlasContributionLiveObjectCount = nextLiveObjectCount
          textAtlasContributions.RemoveAt(index)
          counters.Set(VulkanCounterId.TextAtlasCount, nextAtlasCount)
          counters.Set(VulkanCounterId.TextAtlasResidentBytes, nextResidentBytes)
          counters.Set(VulkanCounterId.TextAtlasLiveObjectCount, nextLiveObjectCount)
          return
        }
        index = index + 1
      }
    }
  }

  private func ReplaceTextAtlasContribution(total uint64, previous uint64,
    next uint64) uint64{
      if next >= previous {
        let delta = next - previous
        if total > uint64.MaxValue - delta {
          throw OverflowException("Vulkan text atlas diagnostic counter overflow")
        }
        return total + delta
      }
      let delta = previous - next
      if delta > total {
        throw InvalidOperationException("Vulkan text atlas diagnostic counter underflow")
      }
      return total - delta
    }
}
