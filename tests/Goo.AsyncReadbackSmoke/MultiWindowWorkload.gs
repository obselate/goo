package GooAsyncReadbackSmoke

import Goo
import System

class PerformanceThreeWindowRoot : Cell {
  shared {
    const ManifestSeed uint64 = 1274126177uL
    const WindowCount int32 = 3
    const PrimaryWidth int32 = 1280
    const PrimaryHeight int32 = 800
    const SecondaryWidth int32 = 960
    const SecondaryHeight int32 = 640
    const LogicalNodeCount int64 = 3L
    const MutationTotal int32 = 1
  }

  internal let Leaf ElementHandle
  internal let Control ElementHandle
  internal let Entry ElementHandle

  private let seed uint64
  private let windowIndex int32
  private let width int32
  private let height int32
  private let leafKey string
  private let controlKey string
  private let entryKey string
  private let entryValue string
  private var generation int32
  private var callbackOrder int32
  private var pointerCount int32
  private var keyCount int32
  private var textCount int32
  private var pointerOrder int32
  private var keyOrder int32
  private var textOrder int32
  private var latencyMutations bool

  internal prop Seed uint64{ get -> seed }
  internal prop WindowIndex int32{ get -> windowIndex }
  internal prop LogicalCount int64{ get -> LogicalNodeCount }
  internal prop LogicalEdges int32{ get -> 0 }
  internal prop VisibleEdges int32{ get -> 0 }
  internal prop VisibleCount int32{ get -> int32(LogicalNodeCount) }
  internal prop MountedCount int32{ get -> int32(LogicalNodeCount) }
  internal prop MountedBound int32{ get -> int32(LogicalNodeCount) }
  internal prop Width int32{ get -> width }
  internal prop Height int32{ get -> height }
  internal prop MutationCount int32{ get -> MutationTotal }
  internal prop Generation int32{ get -> generation }
  internal prop CallbackOrder int32{ get -> callbackOrder }
  internal prop PointerCallbackCount int32{ get -> pointerCount }
  internal prop KeyCallbackCount int32{ get -> keyCount }
  internal prop TextCallbackCount int32{ get -> textCount }
  internal prop PointerCallbackOrder int32{ get -> pointerOrder }
  internal prop KeyCallbackOrder int32{ get -> keyOrder }
  internal prop TextCallbackOrder int32{ get -> textOrder }
  internal prop PointerCount int32{ get -> pointerCount }
  internal prop KeyCount int32{ get -> keyCount }
  internal prop TextCount int32{ get -> textCount }
  internal prop PointerOrder int32{ get -> pointerOrder }
  internal prop KeyOrder int32{ get -> keyOrder }
  internal prop TextOrder int32{ get -> textOrder }

  init(initialSeed uint64, initialWindowIndex int32, exactWidth int32, exactHeight int32) {
    seed = initialSeed
    windowIndex = initialWindowIndex
    width = exactWidth
    height = exactHeight
    Leaf = ElementHandle{}
    Control = ElementHandle{}
    Entry = ElementHandle{}
    leafKey = "perf-three-window-" + initialWindowIndex.ToString() + "-leaf"
    controlKey = "perf-three-window-" + initialWindowIndex.ToString() + "-control"
    entryKey = "perf-three-window-" + initialWindowIndex.ToString() + "-entry"
    entryValue = "window-" + initialWindowIndex.ToString()
    generation = 0
    callbackOrder = 0
    pointerCount = 0
    keyCount = 0
    textCount = 0
    pointerOrder = 0
    keyOrder = 0
    textOrder = 0
    latencyMutations = false
  }

  private func LeafColor() Color {
    let phase = (seed
      +uint64(windowIndex) * 2246822519uL
      +uint64(generation) * 3266489917uL) % 192uL
    return Color.Rgb(
      32 + int32(phase % 96uL),
      64 + int32((phase * 3uL) % 112uL),
      112 + int32((phase * 5uL) % 112uL))
  }

  private func NextCallbackOrder() int32 {
    callbackOrder = callbackOrder + 1
    return callbackOrder
  }
  private func RecordLatencyMutation() {
    if !latencyMutations {
      return
    }
    generation = generation + 1
    Rebuild()
  }

  private func RecordPointer() {
    pointerCount = pointerCount + 1
    pointerOrder = NextCallbackOrder()
    RecordLatencyMutation()
  }

  private func RecordKey() {
    keyCount = keyCount + 1
    keyOrder = NextCallbackOrder()
    RecordLatencyMutation()
  }

  private func RecordText() {
    textCount = textCount + 1
    textOrder = NextCallbackOrder()
    RecordLatencyMutation()
  }

  func Advance(frame int32) {
    generation = generation + 1
    Rebuild()
  }

  func FocusEntry() bool -> Entry.Focus()
  func EnableLatencyMutations() {
    latencyMutations = true
  }

  func Invariant() bool {
    let sizeMatchesManifest = if windowIndex == 0 {
      width == PrimaryWidth && height == PrimaryHeight
    } else if windowIndex == 1 || windowIndex == 2 {
      width == SecondaryWidth && height == SecondaryHeight
    } else {
      false
    }
    let pointerState = pointerCount == 0 ? pointerOrder == 0 : pointerOrder > 0
    let keyState = keyCount == 0 ? keyOrder == 0 : keyOrder > 0
    let textState = textCount == 0 ? textOrder == 0 : textOrder > 0
    return seed == ManifestSeed
      && windowIndex >= 0
      && windowIndex < WindowCount
      && sizeMatchesManifest
      && width > 0
      && height > 0
      && generation >= 0
      && callbackOrder >= 0
      && pointerCount >= 0
      && keyCount >= 0
      && textCount >= 0
      && pointerOrder >= 0
      && keyOrder >= 0
      && textOrder >= 0
      && pointerOrder <= callbackOrder
      && keyOrder <= callbackOrder
      && textOrder <= callbackOrder
      && pointerState
      && keyState
      && textState
  }

  override func Build() Blob -> Container() {.Width: width,.Height: height,.Position: PositionType.Relative,.OverflowX: Overflow.Hidden,.OverflowY: Overflow.Hidden,.BackgroundColor: Color.Rgb(8, 13, 22),
    Container{
        Key: leafKey,
        Handle: Leaf,
        Position: PositionType.Absolute,
        Left: 24,
        Top: 24,
        Width: 176,
        Height: 64,
        BorderRadius: 8,
        BackgroundColor: LeafColor(),
      },
      Button{
        Key: controlKey,
        Handle: Control,
        Position: PositionType.Absolute,
        Left: 24,
        Top: 120,
        Width: 192,
        Height: 48,
        Focusable: true,
        BackgroundColor: Color.Rgb(48, 96, 160),
        BorderWidth: 2,
        BorderColor: Color.Rgb(120, 168, 224),
        Focus: Style{ BorderColor: Color.Rgb(255, 220, 120) },
        OnPointerDown: func(value PointerEvent) {
          RecordPointer()
          Entry.Focus()
          value.PreventDefault()
        },
        OnKeyDown: func(value KeyEvent) { RecordKey() },
      },
      TextEntry{
        Key: entryKey,
        Handle: Entry,
        Position: PositionType.Absolute,
        Left: 24,
        Top: 192,
        Width: 320,
        Height: 44,
        Padding: 6,
        Focusable: true,
        Value: entryValue,
        BackgroundColor: Color.Rgb(20, 30, 44),
        Color: Color.Rgb(224, 232, 244),
        SelectionColor: Color.Rgba(48, 96, 160, 180),
        OnKeyDown: func(value KeyEvent) { RecordKey() },
        OnTextInput: func(value string) { RecordText() },
      },
    }
}
