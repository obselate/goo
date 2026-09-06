package Goo.VulkanProof

import System
import System.IO
import System.Text
import System.Threading
import Goo

internal data struct VulkanTraceRecord {
  var run uint64
  var workload uint64
  var process uint64
  var window uint64
  var frame uint64
  var sample uint64
  var queue uint64
  var submission uint64
  var fence uint64
  var query uint64
  var eventId uint64
  var category uint64
  var severity uint64
  var result int32
  var value0 uint64
  var value1 uint64
}

internal data struct VulkanValidationRecord {
  var severity uint32
  var types uint32
  var messageId int32
  var messageHash uint32
  var messageLength uint32
  var messageOffset uint32
  var messageTruncated uint32
}

internal data struct VulkanFatalExtensionRecord {
  var extensionKind uint32
  var hash uint32
  var length uint32
  var offset uint32
  var truncated uint32
}

internal unsafe class VulkanDiagnostics {
  private const TraceCapacity int32 = 1024
  private const ValidationCapacity int32 = 64
  private const ValidationTextCapacity int32 = 512
  private const FatalNameCapacity int32 = 256
  private const FatalExtensionCapacity int32 = 32

  private let trace [] ? VulkanTraceRecord
  private let validation [] ? VulkanValidationRecord
  private let validationText [] ? uint8
  private let fatalDeviceName [] ? uint8
  private let fatalExtensions [] ? VulkanFatalExtensionRecord
  private let fatalExtensionText [] ? uint8
  private var traceWrite int32
  private var traceDropped int32
  private var validationWrite int32
  private var validationDropped int32
  private var validationErrors int32
  private var fatalCode int32
  private var fatalValue uint64
  private var fatalSnapshotCaptured bool
  private var fatalTraceWrite int32
  private var fatalValidationWrite int32
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
  private var fatalHeapBudget uint64
  private var fatalHeapAllocated uint64
  private var fatalRetiredBytes uint64
  private var fatalLiveObjects uint64
  private var fatalLastSubmission uint64
  private var fatalLastQueue uint64
  private var fatalLastFence uint64
  private var fatalLastResultEvent uint64
  private var fatalLastResult int32

  internal prop TraceCapacityValue int32{ get -> TraceCapacity }
  internal prop ValidationCapacityValue int32{ get -> ValidationCapacity }
  internal prop ValidationErrorCount int32{ get -> validationErrors }
  internal prop TraceDroppedCount int32{ get -> traceDropped }
  internal prop ValidationDroppedCount int32{ get -> validationDropped }

  internal init() {
    trace = [TraceCapacity]VulkanTraceRecord
    validation = [ValidationCapacity]VulkanValidationRecord
    validationText = [ValidationCapacity * ValidationTextCapacity]uint8
    fatalDeviceName = [FatalNameCapacity]uint8
    fatalExtensions = [FatalExtensionCapacity]VulkanFatalExtensionRecord
    fatalExtensionText = [FatalExtensionCapacity * FatalNameCapacity]uint8
  }

  internal func Record(run uint64, workload uint64, process uint64, window uint64,
    frame uint64, sample uint64, queue uint64, submission uint64, fence uint64,
    query uint64, eventId uint64, category uint64, severity uint64, result int32,
    value0 uint64, value1 uint64) {
      let writeIndex = Interlocked.Increment(ref traceWrite) - 1
      if writeIndex < 0 { return }
      if let storage = trace {
        let slot = writeIndex % storage.Length
        if writeIndex >= storage.Length {
          Interlocked.Increment(ref traceDropped)
        }
        storage[slot] = VulkanTraceRecord{
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

  internal func RecordResult(eventId uint64, result int32) {
    fatalLastResultEvent = eventId
    fatalLastResult = result
    Record(0uL, 0uL, 0uL, 0uL, 0uL, 0uL, 0uL, 0uL, 0uL, 0uL,
      eventId, 2uL, 0uL, result, 0uL, 0uL)
  }

  internal func CaptureInstanceFacts(apiVersion uint32, extensionCount uint32, debugUtilsAvailable uint32) {
    fatalInstanceApiVersion = apiVersion
    fatalInstanceExtensionCount = extensionCount
    fatalDebugUtilsAvailable = debugUtilsAvailable
  }

  internal func CaptureDeviceExtensionCount(extensionCount uint32) {
    fatalDeviceExtensionCount = extensionCount
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
          if value == int8(0) { break }
          target[index] = uint8(value)
          index++
        }
      }
      fatalPhysicalApiVersion = apiVersion
    }

  internal func CaptureExtension(kind uint32, name * int8) {
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
          if value == int8(0) { break }
          let byte = uint8(value)
          bytes[offset + int32(length)] = byte
          hash = (hash ^ uint32(byte)) * 16777619u
          length++
        }
        var truncated uint32 = 0u
        if name != nil && length == uint32(FatalNameCapacity) && name[length] != int8(0) {
          truncated = 1u
        }
        records[slot] = VulkanFatalExtensionRecord{
          extensionKind: kind,
          hash: hash,
          length: length,
          offset: uint32(offset),
          truncated: truncated,
        }
      }
    }
  }

  internal func CaptureWsiFacts(window uint64, surface uint64, swapchain uint64, frame uint64, generation uint64) {
    fatalWindow = window
    fatalSurface = surface
    fatalSwapchain = swapchain
    fatalFrame = frame
    fatalGeneration = generation
  }

  internal func CaptureResourceFacts(heapBudget uint64, heapAllocated uint64, retiredBytes uint64, liveObjects uint64) {
    fatalHeapBudget = heapBudget
    fatalHeapAllocated = heapAllocated
    fatalRetiredBytes = retiredBytes
    fatalLiveObjects = liveObjects
  }

  internal func CaptureSubmission(submission uint64, queue uint64, fence uint64) {
    fatalLastSubmission = submission
    fatalLastQueue = queue
    fatalLastFence = fence
  }

  internal func CaptureValidation(severity uint32, types uint32, messageId int32, message * int8) {
    if let records = validation {
      if let bytes = validationText {
        let writeIndex = Interlocked.Increment(ref validationWrite) - 1
        if writeIndex < 0 { return }
        let slot = writeIndex % records.Length
        if writeIndex >= records.Length {
          Interlocked.Increment(ref validationDropped)
        }
        var length uint32 = 0u
        var hash uint32 = 2166136261u
        while message != nil && length < uint32(ValidationTextCapacity) {
          let current = message[length]
          if current == int8(0) { break }
          let value = uint8(current)
          bytes[slot * ValidationTextCapacity + int32(length)] = value
          hash = (hash ^ uint32(value)) * 16777619u
          length++
        }
        var truncated uint32 = 0u
        if message != nil && length == uint32(ValidationTextCapacity) && message[length] != int8(0) {
          truncated = 1u
        }
        let messageLength = length
        let record = VulkanValidationRecord{
          severity: severity,
          types: types,
          messageId: messageId,
          messageHash: hash,
          messageLength: messageLength,
          messageOffset: uint32(slot * ValidationTextCapacity),
          messageTruncated: truncated,
        }
        records[slot] = record
        if (severity & uint32(VkConstants.VK_DEBUG_UTILS_MESSAGE_SEVERITY_ERROR_BIT_EXT)) != 0u {
          Interlocked.Increment(ref validationErrors)
        }
      }
    }
  }

  internal func CaptureFatal(code int32, value uint64) {
    if !fatalSnapshotCaptured {
      fatalCode = code
      fatalValue = value
      fatalTraceWrite = traceWrite
      fatalValidationWrite = validationWrite
      fatalSnapshotCaptured = true
    }
    Record(0uL, 0uL, 0uL, 0uL, 0uL, 0uL, 0uL, 0uL, 0uL, 0uL,
      0xFFFFuL, 2uL, 0uL, code, 0uL, 0uL)
  }

  private func Hex(buffer [] ? uint8, offset int32, length uint32) string {
    let text = StringBuilder()
    if let bytes = buffer {
      var index uint32 = 0u
      while index < length {
        text.Append(bytes[offset + int32(index)].ToString("x2"))
        index++
      }
    }
    return text.ToString()
  }

  internal func FlushNdjson(writer TextWriter) {
    if let storage = trace {
      let total = traceWrite
      let start = total > storage.Length ? total - storage.Length : 0
      var index = start
      while index < total {
        let record = storage[index % storage.Length]
        writer.WriteLine("{\"kind\":\"trace\",\"run\":${record.run},\"workload\":${record.workload},\"process\":${record.process},\"window\":${record.window},\"frame\":${record.frame},\"sample\":${record.sample},\"queue\":${record.queue},\"submission\":${record.submission},\"fence\":${record.fence},\"query\":${record.query},\"event\":${record.eventId},\"category\":${record.category},\"severity\":${record.severity},\"result\":${record.result},\"value0\":${record.value0},\"value1\":${record.value1}}")
        index++
      }
    }
    if let records = validation {
      if let bytes = validationText {
        let total = validationWrite
        let start = total > records.Length ? total - records.Length : 0
        var index = start
        while index < total {
          let record = records[index % records.Length]
          let text = StringBuilder()
          var byteIndex int32 = 0
          while byteIndex < int32(record.messageLength) && byteIndex < ValidationTextCapacity {
            text.Append(bytes[int32(record.messageOffset) + byteIndex].ToString("x2"))
            byteIndex++
          }
          writer.WriteLine("{\"kind\":\"validation\",\"severity\":${record.severity},\"types\":${record.types},\"messageId\":${record.messageId},\"messageHash\":${record.messageHash},\"messageLength\":${record.messageLength},\"messageTruncated\":${record.messageTruncated},\"messageHex\":\"${text}\"}")
          index++
        }
      }
    }
    if fatalSnapshotCaptured {
      let deviceName = Hex(fatalDeviceName, 0, uint32(FatalNameCapacity))
      writer.WriteLine("{\"kind\":\"fatal\",\"code\":${fatalCode},\"value\":${fatalValue},\"traceAtCapture\":${fatalTraceWrite},\"validationAtCapture\":${fatalValidationWrite},\"instanceApiVersion\":${fatalInstanceApiVersion},\"physicalApiVersion\":${fatalPhysicalApiVersion},\"driverVersion\":${fatalDriverVersion},\"vendorId\":${fatalVendorId},\"deviceId\":${fatalDeviceId},\"deviceType\":${fatalDeviceType},\"timelineSemaphore\":${fatalTimelineSemaphore},\"synchronization2\":${fatalSynchronization2},\"dynamicRendering\":${fatalDynamicRendering},\"debugUtilsAvailable\":${fatalDebugUtilsAvailable},\"instanceExtensionCount\":${fatalInstanceExtensionCount},\"deviceExtensionCount\":${fatalDeviceExtensionCount},\"extensionDropped\":${fatalExtensionDropped},\"window\":${fatalWindow},\"surface\":${fatalSurface},\"swapchain\":${fatalSwapchain},\"frame\":${fatalFrame},\"generation\":${fatalGeneration},\"heapBudget\":${fatalHeapBudget},\"heapAllocated\":${fatalHeapAllocated},\"retiredBytes\":${fatalRetiredBytes},\"liveObjects\":${fatalLiveObjects},\"lastSubmission\":${fatalLastSubmission},\"lastQueue\":${fatalLastQueue},\"lastFence\":${fatalLastFence},\"lastResultEvent\":${fatalLastResultEvent},\"lastResult\":${fatalLastResult},\"deviceNameHex\":\"${deviceName}\"}")
      if let records = fatalExtensions {
        var index int32 = 0
        while index < fatalExtensionCount {
          let record = records[index]
          let name = Hex(fatalExtensionText, int32(record.offset), record.length)
          writer.WriteLine("{\"kind\":\"fatal_extension\",\"scope\":${record.extensionKind},\"hash\":${record.hash},\"length\":${record.length},\"truncated\":${record.truncated},\"nameHex\":\"${name}\"}")
          index++
        }
      }
    }
    writer.WriteLine("{\"kind\":\"summary\",\"traceDropped\":${traceDropped},\"validationDropped\":${validationDropped},\"validationErrors\":${validationErrors},\"fatalCode\":${fatalCode},\"fatalValue\":${fatalValue}}")
  }
}
