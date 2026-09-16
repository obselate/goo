package Goo

import System
import System.Collections.Generic
import System.Threading

internal unsafe partial class VulkanDiagnostics {
  private const TraceCapacity int32 = 4096
  private const ResultCapacity int32 = 128
  private const ValidationCapacity int32 = 64
  private const ValidationTextCapacity int32 = 512
  private const FatalNameCapacity int32 = 256
  private const FatalExtensionCapacity int32 = 32
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
  private let fatalExtensions [] ? VulkanDiagnosticFatalExtensionRecord
  private let fatalExtensionText [] ? uint8
  private let counters VulkanDiagnosticCounters
  private let textAtlasContributionGate object
  private let textAtlasContributions List[VulkanDiagnosticTextAtlasContribution]
  private var nextTextAtlasContributionId uint64 = 1uL
  private var textAtlasContributionAtlasCount uint64
  private var textAtlasContributionByteBudget uint64
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
  private var fatalExtensionCount int32
  private var fatalExtensionDropped int32
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

  shared {
    func Create(enabled bool) VulkanDiagnostics? -> if !enabled { nil } else { VulkanDiagnostics() }
  }

  internal prop ValidationErrorCount int64{ get -> Interlocked.Read(ref validationErrors) }
  internal prop TraceWriteCount int64{ get -> Interlocked.Read(ref traceWrite) }
  internal prop ResultWriteCount int64{ get -> Interlocked.Read(ref resultWrite) }
  internal prop ValidationWriteCount int64{ get -> Interlocked.Read(ref validationWrite) }
  internal prop IsSealed bool{ get -> Volatile.Read(ref writerState) == WriterSealed }
  internal prop Counters VulkanDiagnosticCounterSnapshot{ get -> counters.Snapshot }
  internal prop Fatal VulkanDiagnosticFatalSnapshot{
    get {
      return VulkanDiagnosticFatalSnapshot{
        captured: Volatile.Read(ref fatalSnapshotCaptured) != 0,
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
        extensionCount: uint32(fatalExtensionCount),
        extensionDropped: uint32(fatalExtensionDropped),
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
    fatalExtensions = [FatalExtensionCapacity]VulkanDiagnosticFatalExtensionRecord
    fatalExtensionText = [FatalExtensionCapacity * FatalNameCapacity]uint8
    counters = VulkanDiagnosticCounters()
    textAtlasContributionGate = Object()
    textAtlasContributions = List[VulkanDiagnosticTextAtlasContribution]()
  }

  internal func Record(run uint64, workload uint64, process uint64, window uint64,
    frame uint64, sample uint64, queue uint64, submission uint64, fence uint64,
    query uint64, eventId uint64, category uint64, severity uint64, result int32,
    value0 uint64, value1 uint64) {
      if !EnterWriter() {
        return
      }
      try {
        RecordCore(run, workload, process, window, frame, sample, queue, submission, fence,
          query, eventId, category, severity, result, value0, value1)
      } finally {
        ExitWriter()
      }
    }

  private func RecordCore(run uint64, workload uint64, process uint64, window uint64,
    frame uint64, sample uint64, queue uint64, submission uint64, fence uint64,
    query uint64, eventId uint64, category uint64, severity uint64, result int32,
    value0 uint64, value1 uint64) {
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
        }
      }
    }

  private func EnterWriter() bool {
    if Volatile.Read(ref writerState) != WriterOpen {
      return false
    }
    Interlocked.Increment(ref activeWriters)
    if Volatile.Read(ref writerState) == WriterOpen {
      return true
    }
    Interlocked.Decrement(ref activeWriters)
    return false
  }

  private func ExitWriter() {
    Interlocked.Decrement(ref activeWriters)
  }

  private func WaitForWriters() {
    while Volatile.Read(ref activeWriters) != 0 {
    }
  }

  internal func Seal() bool {
    while true {
      let state = Volatile.Read(ref writerState)
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
      while Volatile.Read(ref writerState) == WriterFreezing
        || Volatile.Read(ref writerState) == WriterSealing{
        }
    }
  }

  internal func RecordStage(run uint64, workload uint64, process uint64, window uint64,
    frame uint64, sample uint64, queue uint64, submission uint64, fence uint64,
    eventId uint64, category uint64, startTicks uint64, endTicks uint64) {
      Record(run, workload, process, window, frame, sample, queue, submission, fence,
        0uL, eventId, category, 0uL, 0, startTicks, endTicks)
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

  internal func CaptureDeviceExtensionCount(extensionCount uint32) {
    if !EnterWriter() {
      return
    }
    try {
      fatalDeviceExtensionCount = extensionCount
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

  internal func CaptureExtension(kind uint32, name * int8) {
    if !EnterWriter() {
      return
    }
    try {
      if let records = fatalExtensions {
        if let bytes = fatalExtensionText {
          if fatalExtensionCount >= FatalExtensionCapacity {
            fatalExtensionDropped++
            return
          }
          let slot = fatalExtensionCount
          fatalExtensionCount++
          var length uint32 = 0u
          var hash uint32 = 2166136261u
          let offset = slot * FatalNameCapacity
          while name != nil && length < uint32(FatalNameCapacity) {
            let value = name[length]
            if value == int8(0) {
              break
            }
            let byte = uint8(value)
            bytes[offset + int32(length)] = byte
            hash = (hash ^ uint32(byte)) * 16777619u
            length++
          }
          let truncated uint32 = if length == uint32(FatalNameCapacity) { 1u } else { 0u }
          records[slot] = VulkanDiagnosticFatalExtensionRecord{
            extensionKind: kind,
            hash: hash,
            length: length,
            offset: uint32(offset),
            truncated: truncated,
          }
        }
      }
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
        counters.SetHeapBudgetAvailable(heapBudgetAvailable)
        counters.SetHeapBudgetSampleCurrent(heapBudgetSampleCurrent)
        counters.SetHeapBudget(heapBudget)
        counters.SetDriverHeapUsage(driverHeapUsage)
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
              counters.AddValidationError(1uL)
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
      let state = Volatile.Read(ref writerState)
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
    fatalTraceWrite = Interlocked.Read(ref traceWrite)
    fatalValidationWrite = Interlocked.Read(ref validationWrite)
    fatalResultWrite = Interlocked.Read(ref resultWrite)
    fatalCounters = counters.Snapshot
    Volatile.Write(ref fatalSnapshotCaptured, 1)
    Volatile.Write(ref writerState, WriterFrozen)
  }

  internal func AddRebuild(value uint64) {
    if !EnterWriter() { return }
    try { counters.AddRebuild(value) } finally { ExitWriter() }
  }
  internal func AddLayout(value uint64) {
    if !EnterWriter() { return }
    try { counters.AddLayout(value) } finally { ExitWriter() }
  }
  internal func AddPlanCompile(value uint64) {
    if !EnterWriter() { return }
    try { counters.AddPlanCompile(value) } finally { ExitWriter() }
  }
  internal func AddUpload(value uint64) {
    if !EnterWriter() { return }
    try { counters.AddUpload(value) } finally { ExitWriter() }
  }
  internal func AddRecord(value uint64) {
    if !EnterWriter() { return }
    try { counters.AddRecord(value) } finally { ExitWriter() }
  }
  internal func AddSubmit(value uint64) {
    if !EnterWriter() { return }
    try { counters.AddSubmit(value) } finally { ExitWriter() }
  }
  internal func AddPresent(value uint64) {
    if !EnterWriter() { return }
    try { counters.AddPresent(value) } finally { ExitWriter() }
  }
  internal func AddReadback(value uint64) {
    if !EnterWriter() { return }
    try { counters.AddReadback(value) } finally { ExitWriter() }
  }
  internal func AddManagedAllocatedBytes(value uint64) {
    if !EnterWriter() { return }
    try { counters.AddManagedAllocatedBytes(value) } finally { ExitWriter() }
  }
  internal func AddVulkanObjectAllocation(value uint64) {
    if !EnterWriter() { return }
    try { counters.AddVulkanObjectAllocation(value) } finally { ExitWriter() }
  }
  internal func AddVulkanDeviceMemoryAllocation(value uint64) {
    if !EnterWriter() { return }
    try { counters.AddVulkanDeviceMemoryAllocation(value) } finally { ExitWriter() }
  }
  internal func AddUploadBytes(value uint64) {
    if !EnterWriter() { return }
    try { counters.AddUploadBytes(value) } finally { ExitWriter() }
  }
  internal func SetImageByteBudget(value uint64) {
    if !EnterWriter() { return }
    try { counters.SetImageByteBudget(value) } finally { ExitWriter() }
  }
  internal func SetImageResidentBytes(value uint64) {
    if !EnterWriter() { return }
    try { counters.SetImageResidentBytes(value) } finally { ExitWriter() }
  }
  internal func SetImageLiveObjectCount(value uint64) {
    if !EnterWriter() { return }
    try { counters.SetImageLiveObjectCount(value) } finally { ExitWriter() }
  }
  internal func SetImagePeakResidentBytes(value uint64) {
    if !EnterWriter() { return }
    try { counters.SetImagePeakResidentBytes(value) } finally { ExitWriter() }
  }
  internal func SetImagePeakLiveObjectCount(value uint64) {
    if !EnterWriter() { return }
    try { counters.SetImagePeakLiveObjectCount(value) } finally { ExitWriter() }
  }

  internal func AddImageUploadChunk(value uint64) {
    if !EnterWriter() { return }
    try { counters.AddImageUploadChunk(value) } finally { ExitWriter() }
  }

  internal func AddImageUploadDeferred(value uint64) {
    if !EnterWriter() { return }
    try { counters.AddImageUploadDeferred(value) } finally { ExitWriter() }
  }

  internal func AddImageUploadCompleted(value uint64) {
    if !EnterWriter() { return }
    try { counters.AddImageUploadCompleted(value) } finally { ExitWriter() }
  }
  internal func SetTextAtlasCount(value uint64) {
    if !EnterWriter() { return }
    try { counters.SetTextAtlasCount(value) } finally { ExitWriter() }
  }
  internal func SetTextAtlasByteBudget(value uint64) {
    if !EnterWriter() { return }
    try { counters.SetTextAtlasByteBudget(value) } finally { ExitWriter() }
  }
  internal func SetTextAtlasResidentBytes(value uint64) {
    if !EnterWriter() { return }
    try { counters.SetTextAtlasResidentBytes(value) } finally { ExitWriter() }
  }
  internal func SetTextAtlasLiveObjectCount(value uint64) {
    if !EnterWriter() { return }
    try { counters.SetTextAtlasLiveObjectCount(value) } finally { ExitWriter() }
  }
  internal func SetTextAtlasPeakCount(value uint64) {
    if !EnterWriter() { return }
    try { counters.SetTextAtlasPeakCount(value) } finally { ExitWriter() }
  }
  internal func SetTextAtlasPeakByteBudget(value uint64) {
    if !EnterWriter() { return }
    try { counters.SetTextAtlasPeakByteBudget(value) } finally { ExitWriter() }
  }
  internal func SetTextAtlasPeakResidentBytes(value uint64) {
    if !EnterWriter() { return }
    try { counters.SetTextAtlasPeakResidentBytes(value) } finally { ExitWriter() }
  }
  internal func SetTextAtlasPeakLiveObjectCount(value uint64) {
    if !EnterWriter() { return }
    try { counters.SetTextAtlasPeakLiveObjectCount(value) } finally { ExitWriter() }
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
  internal func ClearPathAtlasCurrentState() {
    if !EnterWriter() { return }
    try { counters.ClearPathAtlasCurrentState() } finally { ExitWriter() }
  }
  internal func AddTextAtlasRecordedUploadBytes(value uint64) {
    if !EnterWriter() { return }
    try { counters.AddTextAtlasRecordedUploadBytes(value) } finally { ExitWriter() }
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

  internal func SetTextAtlasContribution(id uint64, atlasCount uint64, byteBudget uint64,
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
            let nextByteBudget = ReplaceTextAtlasContribution(
              textAtlasContributionByteBudget, current.ByteBudget, byteBudget)
            let nextResidentBytes = ReplaceTextAtlasContribution(
              textAtlasContributionResidentBytes, current.ResidentBytes, residentBytes)
            let nextLiveObjectCount = ReplaceTextAtlasContribution(
              textAtlasContributionLiveObjectCount, current.LiveObjectCount, liveObjectCount)
            textAtlasContributionAtlasCount = nextAtlasCount
            textAtlasContributionByteBudget = nextByteBudget
            textAtlasContributionResidentBytes = nextResidentBytes
            textAtlasContributionLiveObjectCount = nextLiveObjectCount
            textAtlasContributions[index] = VulkanDiagnosticTextAtlasContribution{
              Id: id,
              AtlasCount: atlasCount,
              ByteBudget: byteBudget,
              ResidentBytes: residentBytes,
              LiveObjectCount: liveObjectCount,
            }
            counters.SetTextAtlasCount(nextAtlasCount)
            counters.SetTextAtlasByteBudget(nextByteBudget)
            counters.SetTextAtlasResidentBytes(nextResidentBytes)
            counters.SetTextAtlasLiveObjectCount(nextLiveObjectCount)
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
          let nextByteBudget = ReplaceTextAtlasContribution(
            textAtlasContributionByteBudget, current.ByteBudget, 0uL)
          let nextResidentBytes = ReplaceTextAtlasContribution(
            textAtlasContributionResidentBytes, current.ResidentBytes, 0uL)
          let nextLiveObjectCount = ReplaceTextAtlasContribution(
            textAtlasContributionLiveObjectCount, current.LiveObjectCount, 0uL)
          textAtlasContributionAtlasCount = nextAtlasCount
          textAtlasContributionByteBudget = nextByteBudget
          textAtlasContributionResidentBytes = nextResidentBytes
          textAtlasContributionLiveObjectCount = nextLiveObjectCount
          textAtlasContributions.RemoveAt(index)
          counters.SetTextAtlasCount(nextAtlasCount)
          counters.SetTextAtlasByteBudget(nextByteBudget)
          counters.SetTextAtlasResidentBytes(nextResidentBytes)
          counters.SetTextAtlasLiveObjectCount(nextLiveObjectCount)
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
  internal func AddTextAtlasEviction(value uint64) {
    if !EnterWriter() { return }
    try { counters.AddTextAtlasEviction(value) } finally { ExitWriter() }
  }
  internal func AddTextAtlasRetirement(value uint64) {
    if !EnterWriter() { return }
    try { counters.AddTextAtlasRetirement(value) } finally { ExitWriter() }
  }
  internal func AddImageEviction(value uint64) {
    if !EnterWriter() { return }
    try { counters.AddImageEviction(value) } finally { ExitWriter() }
  }
  internal func AddImageRetirement(value uint64) {
    if !EnterWriter() { return }
    try { counters.AddImageRetirement(value) } finally { ExitWriter() }
  }
  internal func AddDraw(value uint64) {
    if !EnterWriter() { return }
    try { counters.AddDraw(value) } finally { ExitWriter() }
  }
  internal func AddPipelineChange(value uint64) {
    if !EnterWriter() { return }
    try { counters.AddPipelineChange(value) } finally { ExitWriter() }
  }
  internal func AddDescriptorChange(value uint64) {
    if !EnterWriter() { return }
    try { counters.AddDescriptorChange(value) } finally { ExitWriter() }
  }
  internal func AddPass(value uint64) {
    if !EnterWriter() { return }
    try { counters.AddPass(value) } finally { ExitWriter() }
  }
  internal func AddBarrier(value uint64) {
    if !EnterWriter() { return }
    try { counters.AddBarrier(value) } finally { ExitWriter() }
  }
  internal func AddDamage(count uint64, area uint64) {
    if !EnterWriter() { return }
    try { counters.AddDamage(count, area) } finally { ExitWriter() }
  }
  internal func AddSurfaceRecovery(value uint64) {
    if !EnterWriter() { return }
    try { counters.AddSurfaceRecovery(value) } finally { ExitWriter() }
  }
  internal func AddDeviceRecovery(value uint64) {
    if !EnterWriter() { return }
    try { counters.AddDeviceRecovery(value) } finally { ExitWriter() }
  }
  internal func SetLayerPoolStats(byteBudget uint64, residentBytes uint64,
    targetCount uint64, leasedCount uint64) {
      if !EnterWriter() { return }
      try {
        counters.SetLayerPoolByteBudget(byteBudget)
        counters.SetLayerPoolResidentBytes(residentBytes)
        counters.SetLayerPoolTargetCount(targetCount)
        counters.SetLayerPoolLeasedCount(leasedCount)
      } finally { ExitWriter() }
    }
  internal func AddLayerPoolCreate(value uint64) {
    if !EnterWriter() { return }
    try { counters.AddLayerPoolCreate(value) } finally { ExitWriter() }
  }
  internal func AddLayerPoolReuse(value uint64) {
    if !EnterWriter() { return }
    try { counters.AddLayerPoolReuse(value) } finally { ExitWriter() }
  }
  internal func AddLayerPoolCommandReuse(value uint64) {
    if !EnterWriter() { return }
    try { counters.AddLayerPoolCommandReuse(value) } finally { ExitWriter() }
  }
  internal func AddLayerPoolEviction(value uint64) {
    if !EnterWriter() { return }
    try { counters.AddLayerPoolEviction(value) } finally { ExitWriter() }
  }
  internal func AddLayerPoolPressure(value uint64) {
    if !EnterWriter() { return }
    try { counters.AddLayerPoolPressure(value) } finally { ExitWriter() }
  }
  internal func AddLayerPoolPressureFailure(value uint64) {
    if !EnterWriter() { return }
    try { counters.AddLayerPoolPressureFailure(value) } finally { ExitWriter() }
  }
  internal func AddLayerPoolFailure(value uint64) {
    if !EnterWriter() { return }
    try { counters.AddLayerPoolFailure(value) } finally { ExitWriter() }
  }
  internal func AddLayerPoolPass(value uint64) {
    if !EnterWriter() { return }
    try { counters.AddLayerPoolPass(value) } finally { ExitWriter() }
  }
  internal func AddLayerPoolComposite(value uint64) {
    if !EnterWriter() { return }
    try { counters.AddLayerPoolComposite(value) } finally { ExitWriter() }
  }
  internal func SetManagedAllocatedBytes(value uint64) {
    if !EnterWriter() { return }
    try { counters.SetManagedAllocatedBytes(value) } finally { ExitWriter() }
  }
  internal func SetVulkanObjectCount(value uint64) {
    if !EnterWriter() { return }
    try { counters.SetVulkanObjectCount(value) } finally { ExitWriter() }
  }
  internal func SetVulkanObjectAllocationCount(value uint64) {
    if !EnterWriter() { return }
    try { counters.SetVulkanObjectAllocationCount(value) } finally { ExitWriter() }
  }
  internal func SetVulkanDeviceMemoryAllocationCount(value uint64) {
    if !EnterWriter() { return }
    try { counters.SetVulkanDeviceMemoryAllocationCount(value) } finally { ExitWriter() }
  }
  internal func SetVulkanDeviceMemoryBytes(value uint64) {
    if !EnterWriter() { return }
    try { counters.SetVulkanDeviceMemoryBytes(value) } finally { ExitWriter() }
  }
  internal func SetCacheBytes(value uint64) {
    if !EnterWriter() { return }
    try { counters.SetCacheBytes(value) } finally { ExitWriter() }
  }
  internal func SetAllocatorBytes(value uint64) {
    if !EnterWriter() { return }
    try { counters.SetAllocatorBytes(value) } finally { ExitWriter() }
  }
  internal func SetDirtyChunkCount(value uint64) {
    if !EnterWriter() { return }
    try { counters.SetDirtyChunkCount(value) } finally { ExitWriter() }
  }
  internal func SetReusedChunkCount(value uint64) {
    if !EnterWriter() { return }
    try { counters.SetReusedChunkCount(value) } finally { ExitWriter() }
  }
  internal func AddVulkanObjects(value uint64) {
    if !EnterWriter() { return }
    try { counters.AddVulkanObjects(value) } finally { ExitWriter() }
  }
  internal func RemoveVulkanObjects(value uint64) {
    if !EnterWriter() { return }
    try { counters.RemoveVulkanObjects(value) } finally { ExitWriter() }
  }
  internal func AddVulkanDeviceMemoryBytes(value uint64) {
    if !EnterWriter() { return }
    try { counters.AddVulkanDeviceMemoryBytes(value) } finally { ExitWriter() }
  }
  internal func RemoveVulkanDeviceMemoryBytes(value uint64) {
    if !EnterWriter() { return }
    try { counters.RemoveVulkanDeviceMemoryBytes(value) } finally { ExitWriter() }
  }
}
