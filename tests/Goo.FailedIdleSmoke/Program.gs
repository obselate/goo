package GooFailedIdleSmoke

import System
import System.IO
import System.Threading
import Goo

func Require(condition bool, message string) {
  if !condition {
    throw InvalidOperationException(message)
  }
}

func DiagnosticEventLine(
  diagnostics string, eventId uint64, category uint64, startIndex int32) string? {
    if startIndex < 0 {
      return nil
    }
    let eventMarker = "\"event\":" + eventId.ToString()
    +",\"category\":" + category.ToString() + ","
    var offset int32 = startIndex
    if offset > 0 {
      let prefix = diagnostics.Substring(0, offset)
      let previousLineEnd = prefix.LastIndexOf("\n")
      offset = if previousLineEnd < 0 { 0 } else { previousLineEnd + 1 }
    }
    while offset < diagnostics.Length {
      let remaining = diagnostics.Substring(offset)
      let lineEnd = remaining.IndexOf("\n")
      let lineLength = lineEnd < 0 ? remaining.Length : lineEnd
      let line = remaining.Substring(0, lineLength)
      if line.IndexOf(eventMarker) >= 0 {
        return line
      }
      if lineEnd < 0 {
        return nil
      }
      offset = offset + lineEnd + 1
    }
    return nil
  }

func DiagnosticField(line string, field string) uint64? {
  let marker = "\"" + field + "\":"
  let fieldIndex = line.IndexOf(marker)
  if fieldIndex < 0 {
    return nil
  }
  let valueStart = fieldIndex + marker.Length
  let remaining = line.Substring(valueStart)
  let commaIndex = remaining.IndexOf(",")
  let valueText = if commaIndex < 0 {
    remaining.TrimEnd('}')
  } else {
    remaining.Substring(0, commaIndex)
  }
  try {
    return UInt64.Parse(valueText)
  } catch (error Exception) {
    return nil
  }
}

func SuccessfulDiagnosticEventIndex(
  diagnostics string, eventId uint64, category uint64, startIndex int32) int32{
    let eventMarker = "\"event\":" + eventId.ToString()
    +",\"category\":" + category.ToString() + ","
    let successMarker = "\"result\":0,"
    var offset int32 = startIndex
    while offset < diagnostics.Length {
      let remaining = diagnostics.Substring(offset)
      let lineEnd = remaining.IndexOf("\n")
      let lineLength = lineEnd < 0 ? remaining.Length : lineEnd
      let line = remaining.Substring(0, lineLength)
      let localEvent = line.IndexOf(eventMarker)
      let eventIndex = offset + localEvent
      if localEvent >= 0 && line.Contains(successMarker) {
        return eventIndex
      }
      if lineEnd < 0 {
        return -1
      }
      offset = offset + lineEnd + 1
    }
    return -1
  }

func SuccessfulDiagnosticEventIndexForWindow(
  diagnostics string,
  eventId uint64,
  category uint64,
  window uint64,
  startIndex int32) int32{
    let eventMarker = "\"event\":" + eventId.ToString()
    +",\"category\":" + category.ToString() + ","
    let windowMarker = "\"window\":" + window.ToString() + ","
    let successMarker = "\"result\":0,"
    var offset int32 = startIndex
    while offset < diagnostics.Length {
      let remaining = diagnostics.Substring(offset)
      let lineEnd = remaining.IndexOf("\n")
      let lineLength = lineEnd < 0 ? remaining.Length : lineEnd
      let line = remaining.Substring(0, lineLength)
      let localEvent = line.IndexOf(eventMarker)
      let eventIndex = offset + localEvent
      if localEvent >= 0 && line.Contains(windowMarker) && line.Contains(successMarker) {
        return eventIndex
      }
      if lineEnd < 0 {
        return -1
      }
      offset = offset + lineEnd + 1
    }
    return -1
  }

func PositiveDiagnosticEventIndexForWindow(
  diagnostics string,
  eventId uint64,
  category uint64,
  window uint64,
  startIndex int32) int32{
    var eventIndex = SuccessfulDiagnosticEventIndexForWindow(
      diagnostics, eventId, category, window, startIndex)
    while eventIndex >= 0 {
      let line = DiagnosticEventLine(
        diagnostics, eventId, category, eventIndex)
      let ticks = if let current = line {
        DiagnosticField(current, "value0")
      } else { nil }
      let nanoseconds = if let current = line {
        DiagnosticField(current, "value1")
      } else { nil }
      if ticks != nil && nanoseconds != nil
        && ticks!! > 0uL && nanoseconds!! > 0uL {
          return eventIndex
        }
      eventIndex = SuccessfulDiagnosticEventIndexForWindow(
        diagnostics, eventId, category, window, eventIndex + 1)
    }
    return -1
  }

func DiagnosticCounterValue(diagnostics string, field string) uint64 {
  let marker = "\"kind\":\"counters\""
  let countersIndex = diagnostics.LastIndexOf(marker)
  if countersIndex < 0 {
    return 0uL
  }
  let lineEnd = diagnostics.IndexOf("\n", countersIndex)
  let line = if lineEnd < 0 {
    diagnostics.Substring(countersIndex)
  } else {
    diagnostics.Substring(countersIndex, lineEnd - countersIndex)
  }
  let value = DiagnosticField(line, field)
  return if let result = value { result } else { 0uL }
}

class RecoveryCell : Cell {
  shared {
    let Source ImageSource = ImageSource(2, 2, []uint8{
      255, 72, 72, 255,
      72, 224, 128, 255,
      72, 128, 224, 255,
      236, 196, 72, 255,
    })
  }

  internal let TextHandle ElementHandle
  internal var TextRevision int32

  init() {
    TextHandle = ElementHandle()
    TextRevision = 0
  }

  internal func ShowPostRecoveryText() {
    TextRevision = 1
    Rebuild()
  }

  internal prop CurrentText string{
    get {
      return TextRevision == 0
      ? "Goo Vulkan recovery" : "Post-recovery glyph Z9"
    }
  }

  override func Build() Blob -> Container {
    Width: Length.Percent(100),
    Height: Length.Percent(100),
    Padding: 12,
    Gap: 8,
    BackgroundColor: Color.Rgb(12, 20, 32),
    Children: {
      Text{
        Content: CurrentText,
        Handle: TextHandle,
        FontSize: 24,
        Color: Color.White,
      },
      Image{
        Width: 128,
        Height: 96,
        Source: RecoveryCell.Source,
        Fit: ImageFit.Contain,
      },
      Container{
        Position: PositionType.Absolute,
        Left: 176,
        Top: 12,
        Width: 112,
        Height: 64,
        Opacity: 0.86,
        Children: {
          Container{
            Width: Length.Percent(100),
            Height: Length.Percent(100),
            Opacity: 0.84,
            BackgroundColor: Color.Rgb(36, 116, 84),
          },
        },
      },
    },
  }
}

func RequireTextGeometry(cell RecoveryCell, label string) {
  Require(cell.TextHandle.IsMounted, label + " text handle is not mounted")
  let box = cell.TextHandle.BorderBox
  Require(
    box.Width > 0.0 && box.Height > 0.0,
    label + " text border box is empty")
  var caret ElementRect
  Require(
    cell.TextHandle.TryGetTextCaretRect(
      TextPosition{ Offset: 0, Affinity: TextAffinity.Downstream },
      TextCoordinateSpace.Window,
      out caret),
    label + " text caret geometry is unavailable")
  Require(caret.Height > 0.0, label + " text caret geometry is empty")
  let values = [8]ElementRect
  let destination = values.AsSpan()
  var required int32
  Require(
    cell.TextHandle.TryCopyTextRangeRects(
      TextRange{ Start: 0, Length: cell.CurrentText.Length },
      TextCoordinateSpace.Window,
      destination,
      out required) && required > 0,
    label + " text range geometry is unavailable")
}

func PumpRecoveryWindows(first Window, second Window, third Window, count int32) {
  var pump int32
  while pump < count {
    FailedIdleTestFixture.ForcePump(first)
    FailedIdleTestFixture.ForcePump(second)
    FailedIdleTestFixture.ForcePump(third)
    DrainCanonicalRecoveryQueues(first, second, third)
    pump = pump + 1
  }
}

func AwaitWindowClose(closing Window, first Window, second Window) {
  var attempt int32
  while closing.IsOpen && attempt < 5000 {
    closing.Pump(0.0)
    if first.IsOpen {
      FailedIdleTestFixture.PumpQueue(first)
    }
    if second.IsOpen {
      FailedIdleTestFixture.PumpQueue(second)
    }
    FailedIdleTestFixture.PumpQueue(closing)
    Thread.Sleep(1)
    attempt = attempt + 1
  }
  Require(!closing.IsOpen, "window close did not settle async queue work")
}

func LifecycleCountersMatch(
  before VulkanDiagnosticCounterSnapshot,
  after VulkanDiagnosticCounterSnapshot) bool -> after.vulkanObjectCount == before.vulkanObjectCount
  && after.vulkanDeviceMemoryBytes == before.vulkanDeviceMemoryBytes
  && after.imageResidentBytes == before.imageResidentBytes
  && after.imageLiveObjectCount == before.imageLiveObjectCount
  && after.textAtlasCount == before.textAtlasCount
  && after.textAtlasResidentBytes == before.textAtlasResidentBytes
  && after.textAtlasLiveObjectCount == before.textAtlasLiveObjectCount
  && after.pathAtlasResidentWords == before.pathAtlasResidentWords
  && after.layerPoolResidentBytes == before.layerPoolResidentBytes
  && after.layerPoolTargetCount == before.layerPoolTargetCount
  && after.layerPoolLeasedCount == before.layerPoolLeasedCount

func DrainCanonicalRecoveryQueues(first Window, second Window, third Window) {
  var attempt int32
  while attempt < 5000 {
    let firstReady = FailedIdleTestFixture.PumpQueue(first)
    let secondReady = FailedIdleTestFixture.PumpQueue(second)
    let thirdReady = FailedIdleTestFixture.PumpQueue(third)
    if firstReady && secondReady && thirdReady {
      return
    }
    if !firstReady && FailedIdleTestFixture.NeedsRender(first) {
      FailedIdleTestFixture.ForcePump(first)
    }
    if !secondReady && FailedIdleTestFixture.NeedsRender(second) {
      FailedIdleTestFixture.ForcePump(second)
    }
    if !thirdReady && FailedIdleTestFixture.NeedsRender(third) {
      FailedIdleTestFixture.ForcePump(third)
    }
    Thread.Sleep(1)
    attempt = attempt + 1
  }
  Require(false, "canonical lifecycle dimensions did not settle async queue work")
}

func CanonicalizeRecoveryWindows(first Window, second Window, third Window) {
  first.Width = 320
  first.Height = 180
  second.Width = 240
  second.Height = 140
  third.Width = 200
  third.Height = 120
  var attempt int32
  var stablePasses int32
  var havePrevious bool
  var previous VulkanDiagnosticCounterSnapshot
  while attempt < 12 {
    FailedIdleTestFixture.ForcePump(first)
    FailedIdleTestFixture.ForcePump(second)
    FailedIdleTestFixture.ForcePump(third)
    DrainCanonicalRecoveryQueues(first, second, third)
    Thread.Sleep(1)
    attempt = attempt + 1
  }
  attempt = 0
  while attempt < 500 && stablePasses < 3 {
    FailedIdleTestFixture.ForcePump(first)
    FailedIdleTestFixture.ForcePump(second)
    FailedIdleTestFixture.ForcePump(third)
    DrainCanonicalRecoveryQueues(first, second, third)
    let current = FailedIdleTestFixture.Counters(first)
    if havePrevious && LifecycleCountersMatch(previous, current) {
      stablePasses = stablePasses + 1
    } else {
      stablePasses = 0
    }
    previous = current
    havePrevious = true
    Thread.Sleep(1)
    attempt = attempt + 1
  }
  Require(stablePasses == 3,
    "canonical lifecycle dimensions did not settle resource residency")
}

func AwaitSurfaceRecovery(
  first Window, second Window, third Window, before uint64) {
    var attempt int32
    var submitted bool
    var counters = FailedIdleTestFixture.Counters(first)
    while (counters.surfaceRecoveryCount <= before || !submitted) && attempt < 5000 {
      submitted = FailedIdleTestFixture.ForcePump(first) || submitted
      FailedIdleTestFixture.ForcePump(second)
      FailedIdleTestFixture.ForcePump(third)
      Thread.Sleep(1)
      counters = FailedIdleTestFixture.Counters(first)
      attempt = attempt + 1
    }
    Require(counters.surfaceRecoveryCount > before && submitted,
      "surface loss did not recover within the bounded retry window")
  }

func AwaitDeviceRecovery(
  first Window, second Window, third Window, recoveryBefore uint64) {
    var attempt int32
    var submitted bool
    var counters = FailedIdleTestFixture.Counters(first)
    while (counters.deviceRecoveryCount <= recoveryBefore || !submitted) && attempt < 5000 {
      submitted = FailedIdleTestFixture.ForcePump(first) || submitted
      FailedIdleTestFixture.ForcePump(second)
      FailedIdleTestFixture.ForcePump(third)
      Thread.Sleep(1)
      counters = FailedIdleTestFixture.Counters(first)
      attempt = attempt + 1
    }
    Require(counters.deviceRecoveryCount > recoveryBefore && submitted,
      "device loss did not recover, upload, and present within the bounded retry window")
  }

func RequireLifecyclePlateau(
  before VulkanDiagnosticCounterSnapshot,
  after VulkanDiagnosticCounterSnapshot) {
    Require(after.vulkanObjectCount == before.vulkanObjectCount,
      "lifecycle stress did not plateau Vulkan object count: before="
      +before.vulkanObjectCount.ToString() + " after="
      +after.vulkanObjectCount.ToString() + " deviceMemory="
      +before.vulkanDeviceMemoryBytes.ToString() + "/"
      +after.vulkanDeviceMemoryBytes.ToString() + " image="
      +before.imageResidentBytes.ToString() + "/"
      +after.imageResidentBytes.ToString() + " text="
      +before.textAtlasResidentBytes.ToString() + "/"
      +after.textAtlasResidentBytes.ToString() + " path="
      +before.pathAtlasResidentWords.ToString() + "/"
      +after.pathAtlasResidentWords.ToString() + " layer="
      +before.layerPoolResidentBytes.ToString() + "/"
      +after.layerPoolResidentBytes.ToString())
    Require(after.vulkanDeviceMemoryBytes == before.vulkanDeviceMemoryBytes,
      "lifecycle stress did not plateau Vulkan device memory")
    Require(after.imageResidentBytes == before.imageResidentBytes
        && after.imageLiveObjectCount == before.imageLiveObjectCount,
      "lifecycle stress did not plateau image residency")
    Require(after.textAtlasCount == before.textAtlasCount
        && after.textAtlasResidentBytes == before.textAtlasResidentBytes
        && after.textAtlasLiveObjectCount == before.textAtlasLiveObjectCount,
      "lifecycle stress did not plateau text atlas residency")
    Require(after.pathAtlasResidentWords == before.pathAtlasResidentWords,
      "lifecycle stress did not plateau path atlas residency")
    Require(after.layerPoolResidentBytes == before.layerPoolResidentBytes
        && after.layerPoolTargetCount == before.layerPoolTargetCount
        && after.layerPoolLeasedCount == before.layerPoolLeasedCount,
      "lifecycle stress did not plateau layer pool residency: before="
      +before.layerPoolResidentBytes.ToString() + ","
      +before.layerPoolTargetCount.ToString() + ","
      +before.layerPoolLeasedCount.ToString() + " after="
      +after.layerPoolResidentBytes.ToString() + ","
      +after.layerPoolTargetCount.ToString() + ","
      +after.layerPoolLeasedCount.ToString())
  }
func RequireFailedIdleCompleteRebuild(
  primitive FailedIdlePrimitiveFrameTestSnapshot,
  text FailedIdleTextFrameTestSnapshot,
  label string) {
    if primitive.RecordCount > 0 {
      Require(
        primitive.SlotIndex == 0 || primitive.SlotIndex == 1,
        label + " primitive rebuild used an invalid slot")
      Require(
        primitive.ByteCount > 0uL
          && primitive.BufferGeneration > 0uL
          && primitive.FullUpload
          && primitive.PlannedTransferBytes == primitive.ByteCount
          && primitive.SkippedTransferBytes == 0uL
          && primitive.DirtyRecordCount == primitive.RecordCount
          && primitive.CpuWriteOperations > 0uL
          && primitive.FlushRequests > 0uL
          && primitive.NativeFlushCalls <= primitive.FlushRequests,
        label + " primitive rebuild did not reconstruct every record")
    }
    if text.RecordCount > 0 {
      Require(
        text.SlotIndex == 0 || text.SlotIndex == 1,
        label + " text rebuild used an invalid slot")
      Require(
        text.ByteCount > 0uL
          && text.BufferGeneration > 0uL
          && text.FullUpload
          && text.WrittenBytes == text.ByteCount
          && text.SkippedBytes == 0uL
          && text.DirtySegmentCount == text.SegmentCount
          && text.MappedWrites > 0uL
          && text.Flushes > 0uL,
        label + " text rebuild did not reconstruct every record")
    }
  }

func RequireFailedIdleWarmReuse(
  primitive FailedIdlePrimitiveFrameTestSnapshot,
  text FailedIdleTextFrameTestSnapshot,
  label string) {
    if primitive.RecordCount > 0 {
      Require(
        primitive.SlotIndex == 0 || primitive.SlotIndex == 1,
        label + " primitive reuse used an invalid slot")
      Require(
        !primitive.FullUpload
          && primitive.PlannedTransferBytes == 0uL
          && primitive.SkippedTransferBytes == primitive.ByteCount
          && primitive.DirtyRecordCount == 0
          && primitive.UploadRangeCount == 0
          && primitive.CpuWriteOperations == uint64(primitive.RecordCount)
          && primitive.NativeFlushCalls == 0uL
          && primitive.RetainedReuse == uint64(primitive.RecordCount),
        label + " primitive reuse wrote unchanged bytes")
    }
    if text.RecordCount > 0 {
      Require(
        text.SlotIndex == 0 || text.SlotIndex == 1,
        label + " text reuse used an invalid slot")
      Require(
        !text.FullUpload
          && text.WrittenBytes == 0uL
          && text.SkippedBytes == text.ByteCount
          && text.DirtySegmentCount == 0
          && text.UploadRangeCount == 0
          && text.MappedWrites == 0uL
          && text.Flushes == 0uL
          && text.RetainedReuse == uint64(text.RecordCount),
        label + " text reuse wrote unchanged bytes")
    }
  }

func RequireFailedIdleSurfaceRebuild(
  beforePrimitive FailedIdlePrimitiveFrameTestSnapshot,
  afterPrimitive FailedIdlePrimitiveFrameTestSnapshot,
  beforeText FailedIdleTextFrameTestSnapshot,
  afterText FailedIdleTextFrameTestSnapshot,
  label string) {
    if beforePrimitive.RecordCount > 0 {
      let reconstructed = afterPrimitive.FullUpload
        && afterPrimitive.PlannedTransferBytes == afterPrimitive.ByteCount
        && afterPrimitive.SkippedTransferBytes == 0uL
      let retained = afterPrimitive.BufferGeneration == beforePrimitive.BufferGeneration
        && afterPrimitive.LastUseSerial != beforePrimitive.LastUseSerial
      Require(
        afterPrimitive.RecordCount == beforePrimitive.RecordCount
          && afterPrimitive.LastUseSerial > 0uL
          && (reconstructed || retained),
        label + " left primitive history stale")
    }
    if beforeText.RecordCount > 0 {
      let reconstructed = afterText.FullUpload
        && afterText.WrittenBytes == afterText.ByteCount
        && afterText.SkippedBytes == 0uL
      let retained = afterText.BufferGeneration == beforeText.BufferGeneration
        && afterText.LastUseSerial != beforeText.LastUseSerial
      Require(
        afterText.RecordCount == beforeText.RecordCount
          && afterText.LastUseSerial > 0uL
          && (reconstructed || retained),
        label + " left text history stale")
    }
  }

func RequireFailedIdleFreshSerials(
  before FailedIdleSubmissionSerialTestSnapshot,
  after FailedIdleSubmissionSerialTestSnapshot,
  primitiveBefore FailedIdlePrimitiveFrameTestSnapshot,
  primitiveAfter FailedIdlePrimitiveFrameTestSnapshot,
  textBefore FailedIdleTextFrameTestSnapshot,
  textAfter FailedIdleTextFrameTestSnapshot,
  label string) {
    let generationChanged = after.RuntimeGeneration > before.RuntimeGeneration
    let serialChanged = after.Slot0Serial != before.Slot0Serial
      || after.Slot1Serial != before.Slot1Serial
    Require(
      after.RuntimeGeneration > 0uL
        && (generationChanged || serialChanged)
        && (after.Slot0Serial > 0uL || after.Slot1Serial > 0uL),
      label + " reused stale frame submission state")
    if primitiveAfter.RecordCount > 0 {
      Require(
        primitiveAfter.LastUseSerial > 0uL
          && (generationChanged
              || primitiveAfter.LastUseSerial != primitiveBefore.LastUseSerial),
        label + " reused a stale primitive submission serial")
    }
    if textAfter.RecordCount > 0 {
      Require(
        textAfter.LastUseSerial > 0uL
          && (generationChanged || textAfter.LastUseSerial != textBefore.LastUseSerial),
        label + " reused a stale text submission serial")
    }
  }

func Main() {
  Require(
    Environment.GetEnvironmentVariable("GOO_VK_DIAGNOSTICS") == "1",
    "GOO_VK_DIAGNOSTICS=1 is required")
  let maintenanceDisabled = Environment.GetEnvironmentVariable(
    "GOO_VK_DISABLE_SWAPCHAIN_MAINTENANCE") == "1"
  Window.ConfigureApplication("Goo failed idle smoke", "0.2.0", "io.github.obselate.goo.failed-idle")
  let capturedError = StringWriter()
  let originalError = Console.Error
  Console.SetError(capturedError)
  var window Window? = nil
  var otherWindow Window? = nil
  var normalCloseWindow Window? = nil
  var thirdWindow Window? = nil
  var failedIdleWindow Window? = nil
  try {
    let root = RecoveryCell{}
    let opened = Window{
      Title: "Goo failed idle smoke",
      Width: 320,
      Height: 180,
      VSync: false,
      Root: root,
    }
    window = opened
    opened.Open()
    opened.Pump(0.0)
    Require(opened.IsOpen, "failed idle smoke did not warm a window")
    let otherRoot = RecoveryCell{}
    let other = Window{
      Title: "Goo surface loss other window",
      Width: 240,
      Height: 140,
      VSync: false,
      Root: otherRoot,
    }
    otherWindow = other
    other.Open()
    other.Pump(0.0)
    Require(other.IsOpen, "surface loss smoke did not warm the other window")
    let normalClose = Window{
      Title: "Goo normal close sibling",
      Width: 200,
      Height: 120,
      VSync: false,
      Root: Cell{},
    }
    normalCloseWindow = normalClose
    normalClose.Open()
    normalClose.Pump(0.0)
    Require(normalClose.IsOpen, "normal close sibling did not warm")
    let idleCallsBeforeSiblingClose = VulkanSharedRuntime.DeviceIdleCallCountForTest
    normalClose.RequestClose()
    AwaitWindowClose(normalClose, opened, other)
    let idleCallsAfterSiblingClose = VulkanSharedRuntime.DeviceIdleCallCountForTest
    if maintenanceDisabled {
      Require(idleCallsAfterSiblingClose > idleCallsBeforeSiblingClose,
        "compatibility sibling close did not call vkDeviceWaitIdle")
    } else {
      Require(idleCallsAfterSiblingClose == idleCallsBeforeSiblingClose,
        "normal sibling close called vkDeviceWaitIdle")
    }
    Require(opened.IsOpen && other.IsOpen,
      "normal sibling close stalled or closed a live window")
    let thirdRoot = RecoveryCell{}
    let third = Window{
      Title: "Goo lifecycle third window",
      Width: 200,
      Height: 120,
      VSync: false,
      Root: thirdRoot,
    }
    thirdWindow = third
    third.Open()
    third.Pump(0.0)
    Require(opened.IsOpen && other.IsOpen && third.IsOpen,
      "lifecycle stress did not warm three windows")
    var sawPrimitiveSlot0 bool = false
    var sawPrimitiveSlot1 bool = false
    var sawTextSlot0 bool = false
    var sawTextSlot1 bool = false
    var warmPrimitive FailedIdlePrimitiveFrameTestSnapshot{}
    var warmText FailedIdleTextFrameTestSnapshot{}
    var warmSerials FailedIdleSubmissionSerialTestSnapshot{}
    var surfaceBeforePrimitive FailedIdlePrimitiveFrameTestSnapshot{}
    var surfaceAfterPrimitive FailedIdlePrimitiveFrameTestSnapshot{}
    var surfaceBeforeText FailedIdleTextFrameTestSnapshot{}
    var surfaceAfterText FailedIdleTextFrameTestSnapshot{}
    var surfaceBeforeSerials FailedIdleSubmissionSerialTestSnapshot{}
    var surfaceAfterSerials FailedIdleSubmissionSerialTestSnapshot{}
    var firstDeviceAfterPrimitive FailedIdlePrimitiveFrameTestSnapshot{}
    var firstDeviceAfterText FailedIdleTextFrameTestSnapshot{}
    var firstDeviceAfterSerials FailedIdleSubmissionSerialTestSnapshot{}
    var postRecoveryOtherText FailedIdleTextFrameTestSnapshot{}
    var postRecoveryThirdText FailedIdleTextFrameTestSnapshot{}

    var lifecycleOperation int32
    var plateauStart VulkanDiagnosticCounterSnapshot
    while lifecycleOperation < 1000 {
      let phase = lifecycleOperation % 3
      let alternate = (lifecycleOperation / 3) % 2
      if phase == 0 {
        opened.Width = 320 + alternate
      } else if phase == 1 {
        other.Height = 140 + alternate
      } else {
        third.Width = 200 + alternate
      }
      FailedIdleTestFixture.Pump(opened)
      FailedIdleTestFixture.Pump(other)
      FailedIdleTestFixture.Pump(third)
      let operationPrimitive = FailedIdleTestFixture.PrimitiveFrame(opened)
      let operationText = FailedIdleTestFixture.TextFrame(opened)
      if operationPrimitive.RecordCount > 0 {
        if operationPrimitive.SlotIndex == 0 {
          sawPrimitiveSlot0 = true
        } else if operationPrimitive.SlotIndex == 1 {
          sawPrimitiveSlot1 = true
        }
      }
      if operationText.RecordCount > 0 {
        if operationText.SlotIndex == 0 {
          sawTextSlot0 = true
        } else if operationText.SlotIndex == 1 {
          sawTextSlot1 = true
        }
      }
      lifecycleOperation = lifecycleOperation + 1
      if lifecycleOperation == 500 {
        CanonicalizeRecoveryWindows(opened, other, third)
        plateauStart = FailedIdleTestFixture.Counters(opened)
      }
    }
    CanonicalizeRecoveryWindows(opened, other, third)
    warmPrimitive = FailedIdleTestFixture.PrimitiveFrame(opened)
    warmText = FailedIdleTestFixture.TextFrame(opened)
    warmSerials = FailedIdleTestFixture.SubmissionSerials(opened)
    Require(
      sawPrimitiveSlot0 && sawPrimitiveSlot1 && sawTextSlot0 && sawTextSlot1,
      "Retained warm operation did not observe independent primitive and text frame slots")
    Require(
      warmSerials.Slot0Serial > 0uL && warmSerials.Slot1Serial > 0uL,
      "Retained warm operation did not accept submissions into both frame slots")
    RequireFailedIdleWarmReuse(warmPrimitive, warmText, "Retained warm operation")
    let plateauEnd = FailedIdleTestFixture.Counters(opened)
    RequireLifecyclePlateau(plateauStart, plateauEnd)
    Require(opened.IsOpen && other.IsOpen && third.IsOpen,
      "lifecycle stress closed a live window")
    var surfaceLoss int32
    while surfaceLoss < 10 {
      let beforePrimitive = FailedIdleTestFixture.PrimitiveFrame(opened)
      let beforeText = FailedIdleTestFixture.TextFrame(opened)
      let beforeSerials = FailedIdleTestFixture.SubmissionSerials(opened)
      if surfaceLoss == 0 {
        surfaceBeforePrimitive = beforePrimitive
        surfaceBeforeText = beforeText
        surfaceBeforeSerials = beforeSerials
      }
      let recoveriesBefore = FailedIdleTestFixture.Counters(opened).surfaceRecoveryCount
      VulkanWindowTarget.FailNextSurfaceLostForTest()
      opened.Width = 323 + surfaceLoss % 2
      opened.Height = 181 + surfaceLoss % 2
      AwaitSurfaceRecovery(opened, other, third, recoveriesBefore)
      Require(opened.IsOpen && other.IsOpen && third.IsOpen,
        "surface loss stalled or closed a live window")
      let afterPrimitive = FailedIdleTestFixture.PrimitiveFrame(opened)
      let afterText = FailedIdleTestFixture.TextFrame(opened)
      let afterSerials = FailedIdleTestFixture.SubmissionSerials(opened)
      if surfaceLoss == 0 {
        surfaceAfterPrimitive = afterPrimitive
        surfaceAfterText = afterText
        surfaceAfterSerials = afterSerials
      }
      surfaceLoss = surfaceLoss + 1
    }
    RequireFailedIdleSurfaceRebuild(
      surfaceBeforePrimitive,
      surfaceAfterPrimitive,
      surfaceBeforeText,
      surfaceAfterText,
      "Retained surface rebuild")
    RequireFailedIdleFreshSerials(
      surfaceBeforeSerials,
      surfaceAfterSerials,
      surfaceBeforePrimitive,
      surfaceAfterPrimitive,
      surfaceBeforeText,
      surfaceAfterText,
      "Retained surface rebuild")

    let layerPoolCreateCountBeforeDeviceLoss =
    FailedIdleTestFixture.Counters(opened).layerPoolCreateCount
    var deviceLoss int32
    while deviceLoss < 3 {
      let beforePrimitive = FailedIdleTestFixture.PrimitiveFrame(opened)
      let beforeText = FailedIdleTestFixture.TextFrame(opened)
      let beforeSerials = FailedIdleTestFixture.SubmissionSerials(opened)
      let countersBefore = FailedIdleTestFixture.Counters(opened)
      VulkanSharedRuntime.FailNextGraphicsSubmissionForTest()
      opened.Width = 326 + deviceLoss
      AwaitDeviceRecovery(opened, other, third, countersBefore.deviceRecoveryCount)
      Require(opened.IsOpen && other.IsOpen && third.IsOpen,
        "device recovery stalled or closed a live window")
      let afterPrimitive = FailedIdleTestFixture.PrimitiveFrame(opened)
      let afterText = FailedIdleTestFixture.TextFrame(opened)
      let afterSerials = FailedIdleTestFixture.SubmissionSerials(opened)
      RequireFailedIdleCompleteRebuild(
        afterPrimitive,
        afterText,
        "Retained device rebuild")
      RequireFailedIdleFreshSerials(
        beforeSerials,
        afterSerials,
        beforePrimitive,
        afterPrimitive,
        beforeText,
        afterText,
        "Retained device rebuild")
      if deviceLoss == 0 {
        firstDeviceAfterPrimitive = afterPrimitive
        firstDeviceAfterText = afterText
        firstDeviceAfterSerials = afterSerials
      }
      deviceLoss = deviceLoss + 1
    }

    otherRoot.ShowPostRecoveryText()
    thirdRoot.ShowPostRecoveryText()
    FailedIdleTestFixture.ForcePump(other)
    postRecoveryOtherText = FailedIdleTestFixture.TextFrame(other)
    FailedIdleTestFixture.ForcePump(third)
    postRecoveryThirdText = FailedIdleTestFixture.TextFrame(third)
    Require(
      (postRecoveryOtherText.RecordCount == 0
          || (postRecoveryOtherText.WrittenBytes > 0uL
              && postRecoveryOtherText.DirtySegmentCount > 0
              && postRecoveryOtherText.MappedWrites > 0uL))
        && (postRecoveryThirdText.RecordCount == 0
            || (postRecoveryThirdText.WrittenBytes > 0uL
                && postRecoveryThirdText.DirtySegmentCount > 0
                && postRecoveryThirdText.MappedWrites > 0uL)),
      "Retained post-recovery unseen text did not upload changed records")
    PumpRecoveryWindows(opened, other, third, 12)
    Require(otherRoot.TextRevision == 1 && thirdRoot.TextRevision == 1,
      "post-recovery text state did not update")
    RequireTextGeometry(otherRoot, "post-recovery second window")
    RequireTextGeometry(thirdRoot, "post-recovery third window")
    let idleCallsBeforeRecoveredClose = VulkanSharedRuntime.DeviceIdleCallCountForTest
    opened.RequestClose()
    AwaitWindowClose(opened, other, third)
    let idleCallsAfterRecoveredClose = VulkanSharedRuntime.DeviceIdleCallCountForTest
    if maintenanceDisabled {
      Require(idleCallsAfterRecoveredClose > idleCallsBeforeRecoveredClose,
        "compatibility recovered close did not call vkDeviceWaitIdle")
    } else {
      Require(idleCallsAfterRecoveredClose == idleCallsBeforeRecoveredClose,
        "recovered sibling close called vkDeviceWaitIdle")
    }
    other.Pump(0.0)
    third.Pump(0.0)
    Require(other.IsOpen && third.IsOpen,
      "surviving windows were unusable after sibling close")
    third.RequestClose()
    AwaitWindowClose(third, other, opened)
    Require(other.IsOpen, "third recovered window did not close independently")
    other.RequestClose()
    AwaitWindowClose(other, third, opened)
    let finalPrimitive = FailedIdleTestFixture.PrimitiveFrame(other)
    let finalText = FailedIdleTestFixture.TextFrame(other)
    let finalSerials = FailedIdleTestFixture.SubmissionSerials(other)
    Require(
      finalPrimitive.SlotIndex == 0
        && finalPrimitive.RecordCount == 0
        && finalPrimitive.ByteCount == 0uL
        && finalPrimitive.BufferGeneration == 0uL
        && finalPrimitive.PlannedTransferBytes == 0uL
        && finalPrimitive.SkippedTransferBytes == 0uL
        && finalPrimitive.DirtyRecordCount == 0
        && finalPrimitive.UploadRangeCount == 0
        && !finalPrimitive.FullUpload
        && finalPrimitive.CpuWriteOperations == 0uL
        && finalPrimitive.NativeFlushCalls == 0uL
        && finalPrimitive.RetainedReuse == 0uL
        && finalPrimitive.LastUseSerial == 0uL
        && finalText.SlotIndex == 0
        && finalText.RecordCount == 0
        && finalText.ByteCount == 0uL
        && finalText.BufferGeneration == 0uL
        && finalText.WrittenBytes == 0uL
        && finalText.SkippedBytes == 0uL
        && finalText.DirtySegmentCount == 0
        && finalText.UploadRangeCount == 0
        && !finalText.FullUpload
        && finalText.MappedWrites == 0uL
        && finalText.Flushes == 0uL
        && finalText.RetainedReuse == 0uL
        && finalText.LastUseSerial == 0uL
        && finalSerials.Slot0Serial == 0uL
        && finalSerials.Slot1Serial == 0uL,
      "Retained final close did not return frame state to zero")
    let imageDiagnostics = capturedError.ToString()

    let failedIdle = Window{
      Title: "Goo failed idle terminal",
      Width: 160,
      Height: 90,
      VSync: false,
      Root: Cell{},
    }
    failedIdleWindow = failedIdle
    failedIdle.Open()
    failedIdle.Pump(0.0)
    Require(failedIdle.IsOpen, "failed idle smoke did not warm the terminal probe")
    VulkanSharedRuntime.FailNextDeviceIdleForTest()
    failedIdle.RequestClose()
    AwaitWindowClose(failedIdle, other, third)

    let rejected = Window{
      Title: "Goo terminal rejection",
      Width: 160,
      Height: 90,
      VSync: false,
      Root: Cell{},
    }
    var rejectionMessage string? = nil
    try {
      rejected.Open()
    } catch (error Exception) {
      rejectionMessage = error.Message
    }
    Require(
      rejectionMessage == "Vulkan shared runtime device is lost",
      "second open rejection was not terminal device-loss rejection")

    let diagnostics = capturedError.ToString()
    let textAtlasRecordedUploadBytes = DiagnosticCounterValue(
      imageDiagnostics, "textAtlasRecordedUploadBytes")
    let textAtlasPeakCount = DiagnosticCounterValue(imageDiagnostics, "textAtlasPeakCount")
    let drawCount = DiagnosticCounterValue(imageDiagnostics, "drawCount")
    let presentCount = DiagnosticCounterValue(imageDiagnostics, "presentCount")
    let validationErrorCount = DiagnosticCounterValue(
      imageDiagnostics, "validationErrorCount")
    let imageResidentBytes = DiagnosticCounterValue(
      imageDiagnostics, "imageResidentBytes")
    let imageLiveObjectCount = DiagnosticCounterValue(
      imageDiagnostics, "imageLiveObjectCount")
    let imagePeakResidentBytes = DiagnosticCounterValue(
      imageDiagnostics, "imagePeakResidentBytes")
    let imagePeakLiveObjectCount = DiagnosticCounterValue(
      imageDiagnostics, "imagePeakLiveObjectCount")
    let layerPoolResidentBytes = DiagnosticCounterValue(
      imageDiagnostics, "layerPoolResidentBytes")
    let layerPoolTargetCount = DiagnosticCounterValue(
      imageDiagnostics, "layerPoolTargetCount")
    let layerPoolLeasedCount = DiagnosticCounterValue(
      imageDiagnostics, "layerPoolLeasedCount")
    let layerPoolCreateCount = DiagnosticCounterValue(
      imageDiagnostics, "layerPoolCreateCount")
    let layerPoolFailureCount = DiagnosticCounterValue(
      imageDiagnostics, "layerPoolFailureCount")
    let layerPoolPressureFailureCount = DiagnosticCounterValue(
      imageDiagnostics, "layerPoolPressureFailureCount")
    let layerPoolPassCount = DiagnosticCounterValue(
      imageDiagnostics, "layerPoolPassCount")
    let layerPoolCompositeCount = DiagnosticCounterValue(
      imageDiagnostics, "layerPoolCompositeCount")
    let deviceLostLine = DiagnosticEventLine(
      imageDiagnostics, VulkanDiagnosticEventIds.RuntimeDeviceLost,
      VulkanDiagnosticCategories.Recovery, 0)
    var recoveryEvent = SuccessfulDiagnosticEventIndex(
      imageDiagnostics, VulkanDiagnosticEventIds.RuntimeRecovery,
      VulkanDiagnosticCategories.Recovery, 0)
    while recoveryEvent >= 0 {
      let nextRecoveryEvent = SuccessfulDiagnosticEventIndex(
        imageDiagnostics, VulkanDiagnosticEventIds.RuntimeRecovery,
        VulkanDiagnosticCategories.Recovery, recoveryEvent + 1)
      if nextRecoveryEvent < 0 {
        break
      }
      recoveryEvent = nextRecoveryEvent
    }
    let recoveryLine = DiagnosticEventLine(
      imageDiagnostics, VulkanDiagnosticEventIds.RuntimeRecovery,
      VulkanDiagnosticCategories.Recovery, recoveryEvent)
    let recoveryWindowValue = if let line = recoveryLine {
      DiagnosticField(line, "window")
    } else { nil }
    let uploadEvent = if recoveryWindowValue != nil {
      SuccessfulDiagnosticEventIndexForWindow(
        imageDiagnostics, VulkanDiagnosticEventIds.UploadStage,
        VulkanDiagnosticCategories.Timing, recoveryWindowValue, recoveryEvent + 1)
    } else { -1 }
    let presentEvent = if recoveryWindowValue != nil {
      SuccessfulDiagnosticEventIndexForWindow(
        imageDiagnostics, VulkanDiagnosticEventIds.SwapchainPresent,
        VulkanDiagnosticCategories.Timing, recoveryWindowValue, uploadEvent + 1)
    } else { -1 }
    let effectsEvent = if recoveryWindowValue != nil {
      PositiveDiagnosticEventIndexForWindow(
        imageDiagnostics, VulkanDiagnosticEventIds.EffectsPass,
        VulkanDiagnosticCategories.Timing, recoveryWindowValue, recoveryEvent + 1)
    } else { -1 }
    let offscreenEvent = if recoveryWindowValue != nil {
      SuccessfulDiagnosticEventIndexForWindow(
        imageDiagnostics, VulkanDiagnosticEventIds.OffscreenPass,
        VulkanDiagnosticCategories.Timing, recoveryWindowValue, recoveryEvent + 1)
    } else { -1 }
    let effectsLine = DiagnosticEventLine(
      imageDiagnostics, VulkanDiagnosticEventIds.EffectsPass,
      VulkanDiagnosticCategories.Timing, effectsEvent)
    let offscreenLine = DiagnosticEventLine(
      imageDiagnostics, VulkanDiagnosticEventIds.OffscreenPass,
      VulkanDiagnosticCategories.Timing, offscreenEvent)
    let imageUploadEvent = SuccessfulDiagnosticEventIndex(
      imageDiagnostics, VulkanDiagnosticEventIds.ResourceUpload,
      VulkanDiagnosticCategories.Image, recoveryEvent + 1)
    let uploadLine = DiagnosticEventLine(
      imageDiagnostics, VulkanDiagnosticEventIds.UploadStage,
      VulkanDiagnosticCategories.Timing, uploadEvent)
    let presentLine = DiagnosticEventLine(
      imageDiagnostics, VulkanDiagnosticEventIds.SwapchainPresent,
      VulkanDiagnosticCategories.Timing, presentEvent)
    let imageUploadLine = DiagnosticEventLine(
      imageDiagnostics, VulkanDiagnosticEventIds.ResourceUpload,
      VulkanDiagnosticCategories.Image, imageUploadEvent)
    let recoveryOrdered = deviceLostLine != nil && recoveryLine != nil
      && recoveryEvent > 0 && recoveryEvent > imageDiagnostics.IndexOf(deviceLostLine)
    if !recoveryOrdered {
      Console.SetError(originalError)
      Console.Error.Write(imageDiagnostics)
    }
    Require(
      recoveryOrdered,
      "failed idle diagnostics did not record device loss before recovery")
    Require(
      deviceLostLine!!.Contains("\"result\":-4,")
        && recoveryLine!!.Contains("\"result\":0,"),
      "failed idle diagnostics did not record successful recovery transition")
    let oldGenerationValue = if let line = deviceLostLine {
      DiagnosticField(line, "value0")
    } else { nil }
    let newGenerationValue = if let line = recoveryLine {
      DiagnosticField(line, "value0")
    } else { nil }
    Require(
      oldGenerationValue != nil && newGenerationValue != nil,
      "failed idle diagnostics did not record recovery generations")
    let oldGeneration = oldGenerationValue!!
    let newGeneration = newGenerationValue!!
    Require(
      oldGeneration != 0uL && newGeneration > oldGeneration,
      "failed idle diagnostics did not advance the Vulkan generation")
    Require(
      layerPoolCreateCount >= layerPoolCreateCountBeforeDeviceLoss + 3uL,
      "failed idle diagnostics did not prove layer pool abandonment and reconstruction")
    let uploadWindowValue = if let line = uploadLine {
      DiagnosticField(line, "window")
    } else { nil }
    let presentWindowValue = if let line = presentLine {
      DiagnosticField(line, "window")
    } else { nil }
    let uploadFrameValue = if let line = uploadLine {
      DiagnosticField(line, "frame")
    } else { nil }
    let presentFrameValue = if let line = presentLine {
      DiagnosticField(line, "frame")
    } else { nil }
    let recoveredPresentation = uploadLine != nil && presentLine != nil
      && recoveryWindowValue != nil && uploadWindowValue != nil
      && presentWindowValue != nil && uploadFrameValue != nil
      && presentFrameValue != nil
      && recoveryWindowValue!! != 0uL
      && uploadWindowValue!! == recoveryWindowValue!!
      && presentWindowValue!! == recoveryWindowValue!!
      && uploadFrameValue!! != 0uL && presentFrameValue!! == uploadFrameValue!!
    if !recoveredPresentation {
      Console.SetError(originalError)
      Console.Error.Write(imageDiagnostics)
    }
    Require(
      recoveredPresentation,
      "failed idle diagnostics did not tie recovered upload and present to the recovery window")
    let effectsWindowValue = if let line = effectsLine {
      DiagnosticField(line, "window")
    } else { nil }
    let offscreenWindowValue = if let line = offscreenLine {
      DiagnosticField(line, "window")
    } else { nil }
    let effectsFrameValue = if let line = effectsLine {
      DiagnosticField(line, "frame")
    } else { nil }
    let offscreenFrameValue = if let line = offscreenLine {
      DiagnosticField(line, "frame")
    } else { nil }
    let effectsTicksValue = if let line = effectsLine {
      DiagnosticField(line, "value0")
    } else { nil }
    let offscreenTicksValue = if let line = offscreenLine {
      DiagnosticField(line, "value0")
    } else { nil }
    let effectsNanosecondsValue = if let line = effectsLine {
      DiagnosticField(line, "value1")
    } else { nil }
    let offscreenNanosecondsValue = if let line = offscreenLine {
      DiagnosticField(line, "value1")
    } else { nil }
    let recoveredStageTimestamps = effectsEvent > recoveryEvent
      && offscreenEvent > recoveryEvent
      && effectsLine != nil && offscreenLine != nil
      && recoveryWindowValue != nil
      && effectsWindowValue != nil && offscreenWindowValue != nil
      && effectsFrameValue != nil && offscreenFrameValue != nil
      && effectsTicksValue != nil && offscreenTicksValue != nil
      && effectsNanosecondsValue != nil && offscreenNanosecondsValue != nil
      && effectsLine.Contains("\"result\":0,")
      && offscreenLine.Contains("\"result\":0,")
      && effectsWindowValue!! == recoveryWindowValue!!
      && offscreenWindowValue!! == recoveryWindowValue!!
      && effectsFrameValue!! != 0uL && offscreenFrameValue!! != 0uL
      && effectsTicksValue!! > 0uL
      && effectsNanosecondsValue!! > 0uL
    if !recoveredStageTimestamps {
      Console.SetError(originalError)
      Console.Error.Write(imageDiagnostics)
    }
    Require(
      recoveredStageTimestamps,
      "failed idle diagnostics did not prove recovered effects and offscreen timestamps")
    let imageUploadBytesValue = if let line = imageUploadLine {
      DiagnosticField(line, "value0")
    } else { nil }
    let imageUploadGenerationValue = if let line = imageUploadLine {
      DiagnosticField(line, "value1")
    } else { nil }
    Require(
      imageUploadEvent > recoveryEvent && imageUploadLine != nil
        && imageUploadBytesValue != nil && imageUploadGenerationValue != nil
        && imageUploadBytesValue!! > 0uL
        && imageUploadGenerationValue!! == newGeneration
        && imagePeakResidentBytes > 0uL
        && imagePeakLiveObjectCount > 0uL
        && imageResidentBytes == 0uL
        && imageLiveObjectCount == 0uL,
      "failed idle diagnostics did not prove recovered image upload and final image release: event="
      +imageUploadEvent.ToString() + " recovery=" + recoveryEvent.ToString()
      +" line=" + (imageUploadLine != nil).ToString()
      +" bytes=" + (if imageUploadBytesValue != nil {
        imageUploadBytesValue.ToString()
      } else { "missing" })
      +" uploadGeneration=" + (if imageUploadGenerationValue != nil {
        imageUploadGenerationValue.ToString()
      } else { "missing" })
      +" recoveryGeneration=" + newGeneration.ToString()
      +" residentPeak=" + imagePeakResidentBytes.ToString()
      +" livePeak=" + imagePeakLiveObjectCount.ToString()
      +" residentFinal=" + imageResidentBytes.ToString()
      +" liveFinal=" + imageLiveObjectCount.ToString())
    Require(
      layerPoolCreateCount > 0uL
        && layerPoolPassCount > 0uL
        && layerPoolCompositeCount > 0uL
        && layerPoolResidentBytes == 0uL
        && layerPoolTargetCount == 0uL
        && layerPoolLeasedCount == 0uL
        && layerPoolFailureCount == 0uL
        && layerPoolPressureFailureCount == 0uL,
      "failed idle diagnostics did not prove layer pool cleanup and zero stale leases")
    let surfaceRecoveryCount = DiagnosticCounterValue(
      imageDiagnostics, "surfaceRecoveryCount")
    let deviceRecoveryCount = DiagnosticCounterValue(
      imageDiagnostics, "deviceRecoveryCount")
    let terminalDeviceLost = diagnostics.Contains("\"event\":322")
      && diagnostics.Contains("\"event\":101")
      && diagnostics.Contains("\"result\":-4")
      && diagnostics.Contains("\"value0\":1")
      && surfaceRecoveryCount >= 10uL
      && deviceRecoveryCount == 3uL
      && diagnostics.Contains("\"event\":5")
      && !diagnostics.Contains("\"kind\":\"fatal\"")
    if !terminalDeviceLost {
      Console.SetError(originalError)
      Console.Error.Write(diagnostics)
    }
    Require(
      terminalDeviceLost,
      "failed idle diagnostics did not record terminal VK_ERROR_DEVICE_LOST: event322="
      +diagnostics.Contains("\"event\":322").ToString()
      +" event101=" + diagnostics.Contains("\"event\":101").ToString()
      +" result=-4=" + diagnostics.Contains("\"result\":-4").ToString()
      +" value0=1=" + diagnostics.Contains("\"value0\":1").ToString()
      +" surfaceRecovery=" + surfaceRecoveryCount.ToString()
      +" deviceRecovery=" + deviceRecoveryCount.ToString()
      +" event5=" + diagnostics.Contains("\"event\":5").ToString()
      +" fatal=" + diagnostics.Contains("\"kind\":\"fatal\"").ToString()
      +" fatalCode=" + DiagnosticCounterValue(diagnostics, "fatalCode").ToString()
      +" fatalValue=" + DiagnosticCounterValue(diagnostics, "fatalValue").ToString()
      +" resultFailures="
      +DiagnosticCounterValue(diagnostics, "resultFailureCount").ToString())
    Require(
      recoveryEvent >= 0 && uploadEvent > recoveryEvent && presentEvent > uploadEvent,
      "failed idle diagnostics did not record ordered recovery upload and present: "
      +recoveryEvent.ToString() + "," + uploadEvent.ToString() + ","
      +presentEvent.ToString())
    Require(
      textAtlasRecordedUploadBytes > 0uL && textAtlasPeakCount > 0uL
        && drawCount > 0uL && presentCount > 0uL
        && validationErrorCount == 0uL,
      "failed idle diagnostics did not record recovered text atlas upload and draw")
    Console.SetError(originalError)
    Console.WriteLine("retained_slots=primitive0="
      +sawPrimitiveSlot0.ToString() + " primitive1="
      +sawPrimitiveSlot1.ToString() + " text0=" + sawTextSlot0.ToString()
      +" text1=" + sawTextSlot1.ToString() + " serial0="
      +warmSerials.Slot0Serial.ToString() + " serial1="
      +warmSerials.Slot1Serial.ToString())
    Console.WriteLine("retained_surface_rebuild=1 primitive_generation="
      +surfaceAfterPrimitive.BufferGeneration.ToString() + " text_generation="
      +surfaceAfterText.BufferGeneration.ToString() + " serial0="
      +surfaceAfterSerials.Slot0Serial.ToString() + " serial1="
      +surfaceAfterSerials.Slot1Serial.ToString())
    Console.WriteLine("retained_device_rebuild=1 primitive_full="
      +firstDeviceAfterPrimitive.FullUpload.ToString() + " text_full="
      +firstDeviceAfterText.FullUpload.ToString() + " primitive_generation="
      +firstDeviceAfterPrimitive.BufferGeneration.ToString() + " text_generation="
      +firstDeviceAfterText.BufferGeneration.ToString() + " serial0="
      +firstDeviceAfterSerials.Slot0Serial.ToString() + " serial1="
      +firstDeviceAfterSerials.Slot1Serial.ToString())
    Console.WriteLine("retained_warm_reuse=1 primitive_skipped_transfer="
      +warmPrimitive.SkippedTransferBytes.ToString() + " primitive_cpu_write_operations="
      +warmPrimitive.CpuWriteOperations.ToString() + " primitive_native_flush_calls="
      +warmPrimitive.NativeFlushCalls.ToString() + " text_skipped="
      +warmText.SkippedBytes.ToString() + " text_mapped="
      +warmText.MappedWrites.ToString() + " text_flushes="
      +warmText.Flushes.ToString())
    Console.WriteLine("retained_close=1 frame_zero=1 resource_zero=1")
    Console.WriteLine("normal-close: three-windows=1 device-idle-path="
      +(if maintenanceDisabled { "compatibility" } else { "present-fence" })
      +" siblings-usable=1")
    Console.WriteLine("lifecycle: windows=3 operations=1000 plateau=1 independent=1")
    Console.WriteLine("surface-loss: injected=10 observed="
      +surfaceRecoveryCount.ToString() + " siblings-usable=1")
    Console.WriteLine("device-loss: count=3 recovered=3 siblings-usable=1")
    Console.WriteLine("failed-idle: warm=1 close=1 second-open=terminal")
    Console.WriteLine("failed-idle: event322=-4 event101=-4 value0=1")
    Console.WriteLine("failed-idle: text=recovered atlasRecordedUploadBytes="
      +textAtlasRecordedUploadBytes.ToString() + " atlasPeakCount="
      +textAtlasPeakCount.ToString()
      +" drawCount=" + drawCount.ToString() + " presentCount="
      +presentCount.ToString() + " geometry=1")
    Console.WriteLine("failed-idle: image=reuploaded uploadBytes="
      +imageUploadBytesValue!!.ToString() + " uploadGeneration="
      +imageUploadGenerationValue!!.ToString() + " residentPeak="
      +imagePeakResidentBytes.ToString() + " livePeak="
      +imagePeakLiveObjectCount.ToString() + " residentFinal="
      +imageResidentBytes.ToString() + " liveFinal="
      +imageLiveObjectCount.ToString())
    Console.WriteLine("failed-idle: layers=create=" + layerPoolCreateCount.ToString()
      +" pass=" + layerPoolPassCount.ToString() + " composite="
      +layerPoolCompositeCount.ToString() + " residentFinal="
      +layerPoolResidentBytes.ToString() + " targetsFinal="
      +layerPoolTargetCount.ToString() + " leasedFinal="
      +layerPoolLeasedCount.ToString() + " failures="
      +layerPoolFailureCount.ToString() + " pressureFailures="
      +layerPoolPressureFailureCount.ToString())
    Console.WriteLine("failed-idle: diagnostics=" + diagnostics.Length.ToString()
      +" stage_timestamps=1")
  } finally {
    Console.SetError(originalError)
    if let activeFailedIdle = failedIdleWindow {
      if activeFailedIdle.IsOpen {
        activeFailedIdle.RequestClose()
        activeFailedIdle.Pump(0.0)
      }
    }
    if let activeNormalClose = normalCloseWindow {
      if activeNormalClose.IsOpen {
        activeNormalClose.RequestClose()
        activeNormalClose.Pump(0.0)
      }
    }
    if let activeThird = thirdWindow {
      if activeThird.IsOpen {
        activeThird.RequestClose()
        activeThird.Pump(0.0)
      }
    }
    if let activeOther = otherWindow {
      if activeOther.IsOpen {
        activeOther.RequestClose()
        activeOther.Pump(0.0)
      }
    }
    if let activeWindow = window {
      if activeWindow.IsOpen {
        activeWindow.RequestClose()
        activeWindow.Pump(0.0)
      }
    }
  }
}
