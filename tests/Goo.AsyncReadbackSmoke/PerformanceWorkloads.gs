package GooAsyncReadbackSmoke

import Goo
import System
import System.Collections.Generic
import System.Diagnostics
import System.IO

func PerformanceTableText(row int32, column int32, mutated bool) string {
  if mutated {
    return "M"
  }
  let value = (int64(row) * 131L + int64(column) * 17L
    +int64(2654435761uL % 997uL)) % 26L
  return Convert.ToChar(65 + int32(value)).ToString()
}

data struct PerformanceTableCellInput {
  internal var Row int32
  internal var MutationMask uint32
}

class PerformanceTableRoot : Cell {
  shared {
    const PerformanceTableRows int32 = 100000
    const PerformanceTableColumns int32 = 12
    const PerformanceTableRowHeight float64 = 32.0
    const PerformanceTableOverscanRows int32 = 8
    const PerformanceTableWidth int32 = 1440
    const PerformanceTableHeight int32 = 900
  }

  private let seed uint64
  private let poolRows int32
  private let viewportRows int32
  private let maxScrollRow int32
  private let rowKeys []string
  private var scrollRow int32
  private var scrollDirection int32
  private let mutationRows []int32
  private let mutationColumns []int32

  prop LogicalCount int64 {
    get -> int64(PerformanceTableRows) * int64(PerformanceTableColumns)
  }
  prop VisibleCount int32 { get -> viewportRows }
  prop MountedCount int32 { get -> poolRows }
  prop MountedBound int32 { get -> poolRows }
  prop Width int32 { get -> PerformanceTableWidth }
  prop Height int32 { get -> PerformanceTableHeight }
  prop MutationCount int32 { get -> 10 }

  init(initialSeed uint64) {
    seed = initialSeed
    mutationRows = [10]int32
    mutationColumns = [10]int32
    viewportRows = 29
    poolRows = 45
    maxScrollRow = PerformanceTableRows - viewportRows
    rowKeys = [poolRows]string
    var rowIndex int32 = 0
    while rowIndex < poolRows {
      rowKeys[rowIndex] = "perf-table-row-" + rowIndex.ToString()
      rowIndex = rowIndex + 1
    }
    scrollDirection = 1
    var mutationIndex int32 = 0
    while mutationIndex < 10 {
      mutationRows[mutationIndex] = mutationIndex
      mutationColumns[mutationIndex] = mutationIndex % PerformanceTableColumns
      mutationIndex = mutationIndex + 1
    }
  }

  func Advance(frame int32) {
    var next = scrollRow + scrollDirection * 17
    if next >= maxScrollRow {
      next = maxScrollRow
      scrollDirection = -1
    } else if next <= 0 {
      next = 0
      scrollDirection = 1
    }
    scrollRow = next
    var index int32 = 0
    while index < 10 {
      let visible = (frame * 13 + index * 7 + int32(seed % 31uL)) % viewportRows
      mutationRows[index] = scrollRow + visible
      mutationColumns[index] =
      (frame * 5 + index * 3 + int32(seed % 11uL)) % PerformanceTableColumns
      index = index + 1
    }
  }

  private func MutationMask(row int32) uint32 {
    var result uint32 = 0u
    var index int32 = 0
    while index < 10 {
      if mutationRows[index] == row {
        result = result | (1u << mutationColumns[index])
      }
      index = index + 1
    }
    return result
  }

  override func Build() Blob {
    var firstRow = scrollRow - PerformanceTableOverscanRows
    if firstRow < 0 {
      firstRow = 0
    }
    let lastStart = PerformanceTableRows - poolRows
    if firstRow > lastStart {
      firstRow = lastStart
    }
    let canvas = Container() {.Key: "perf-table-canvas",.Position: PositionType.Absolute,.Left: 0.0,.Top: -float64(scrollRow) * PerformanceTableRowHeight,.Width: PerformanceTableWidth,.Height: float64(PerformanceTableRows) * PerformanceTableRowHeight,
    }
    var offset int32 = 0
    while offset < poolRows {
      let row = firstRow + offset
      let slot = row % poolRows
      canvas.Children.Add(Cell.Mount[PerformanceTableCellInput, PerformanceTableCell](
        rowKeys[slot],
        PerformanceTableCellInput{
          Row: row,
          MutationMask: MutationMask(row),
        }))
      offset = offset + 1
    }
    return Container() {.Width: PerformanceTableWidth,.Height: PerformanceTableHeight,.Position: PositionType.Relative,.OverflowX: Overflow.Hidden,.OverflowY: Overflow.Hidden,.BackgroundColor: Color.Rgb(10, 15, 24),
      canvas,
    }
  }
}

open class PerformanceTableCell : Cell[PerformanceTableCellInput] {
  protected override func Build(input PerformanceTableCellInput) Blob {
    let result = Container{
      Position: PositionType.Absolute,
      Left: 0.0,
      Top: float64(input.Row) * 32.0,
      Width: 1440,
      Height: 32,
      BackgroundColor: (input.Row & 1) == 0
      ? Color.Rgb(16, 24, 36) : Color.Rgb(20, 30, 44),
    }
    var column int32 = 0
    while column < 12 {
      let mutated = (input.MutationMask & (1u << column)) != 0u
      if column % 4 == 0 {
        result.Children.Add(Text{
          Content: PerformanceTableText(input.Row, column, mutated),
          Position: PositionType.Absolute,
          Left: float64(column) * 120.0 + 6.0,
          Top: 0.0,
          Width: 16.0,
          Height: 32.0,
          PaddingTop: 6.0,
          FontSize: 10.0,
          TextWrap: TextWrap.NoWrap,
          Color: mutated ? Color.Rgb(255, 232, 160) : Color.Rgb(208, 220, 236),
        })
      }
      if mutated {
        result.Children.Add(Container{
          Position: PositionType.Absolute,
          Left: float64(column) * 120.0 + 108.0,
          Top: 13.0,
          Width: 6.0,
          Height: 6.0,
          BorderRadius: 3.0,
          BackgroundColor: Color.Rgb(255, 196, 72),
        })
      }
      column = column + 1
    }
    return result
  }
}

data struct PerformanceTopologyCellInput {
  internal var Node int32
  internal var Group int32
  internal var Mutated bool
  internal var Labeled bool
}

class PerformanceTopologyRoot : Cell {
  shared {
    const PerformanceTopologyNodes int32 = 5000
    const PerformanceTopologyEdges int32 = 15000
    const PerformanceTopologyGroups int32 = 32
    const PerformanceTopologyVisibleTarget int32 = 400
    const PerformanceTopologyWidth int32 = 1920
    const PerformanceTopologyHeight int32 = 1080
  }

  private let seed uint64
  private let nodeKeys []string
  private let edgeKeys []string
  private let visibleNodes []int32
  private let visibleMap []bool
  private let mutatedNodes []int32
  private var visibleCount int32
  private var visibleEdgeCount int32
  private var panX float64
  private var panY float64
  private var zoom float64

  prop LogicalCount int64 { get -> int64(PerformanceTopologyNodes) }
  prop LogicalEdges int32 { get -> PerformanceTopologyEdges }
  prop VisibleCount int32 { get -> visibleCount }
  prop VisibleEdgeCount int32 { get -> visibleEdgeCount }
  prop MountedCount int32 { get -> visibleCount }
  prop MountedBound int32 { get -> PerformanceTopologyVisibleTarget }
  prop Width int32 { get -> PerformanceTopologyWidth }
  prop Height int32 { get -> PerformanceTopologyHeight }
  prop MutationCount int32 { get -> 16 }

  init(initialSeed uint64) {
    seed = initialSeed
    mutatedNodes = [16]int32
    nodeKeys = [PerformanceTopologyNodes]string
    edgeKeys = [PerformanceTopologyEdges]string
    visibleNodes = [PerformanceTopologyVisibleTarget]int32
    visibleMap = [PerformanceTopologyNodes]bool
    var index int32 = 0
    while index < PerformanceTopologyNodes {
      nodeKeys[index] = "perf-topology-node-" + index.ToString()
      index = index + 1
    }
    index = 0
    while index < PerformanceTopologyEdges {
      edgeKeys[index] = "perf-topology-edge-" + index.ToString()
      index = index + 1
    }
    index = 0
    while index < PerformanceTopologyVisibleTarget {
      visibleNodes[index] = -1
      index = index + 1
    }
    index = 0
    while index < 16 {
      mutatedNodes[index] = -1
      index = index + 1
    }
    panX = 1800.0
    panY = 990.0
    zoom = 1.0
    RefreshVisible()
  }

  func Advance(frame int32) {
    let phase = frame % 120
    let triangle = if phase <= 60 { phase } else { 120 - phase }
    let zoomPhase = frame % 300
    let zoomTriangle = if zoomPhase <= 150 { zoomPhase } else { 300 - zoomPhase }
    panX = 1740.0 + float64(triangle) * 3.0
    panY = 900.0 + float64((frame * 5) % 121)
    zoom = 0.75 + float64(zoomTriangle) * 0.005
    RefreshVisible()
    var index int32 = 0
    while index < 16 {
      if visibleCount > 0 {
        mutatedNodes[index] =
        visibleNodes[(frame * 11 + index * 17 + int32(seed % 29uL)) % visibleCount]
      } else {
        mutatedNodes[index] = -1
      }
      index = index + 1
    }
  }

  private func IsMutated(node int32) bool {
    var index int32 = 0
    while index < 16 {
      if mutatedNodes[index] == node {
        return true
      }
      index = index + 1
    }
    return false
  }

  private func NodeX(node int32) float64 -> float64((node * 97 + int32(seed % 5760uL)) % 5760)

  private func NodeY(node int32) float64 -> float64((node * 193 + int32(seed % 3240uL)) % 3240)

  private func ScreenX(node int32) float64 -> (NodeX(node) - panX) * zoom

  private func ScreenY(node int32) float64 -> (NodeY(node) - panY) * zoom

  private func RefreshVisible() {
    var node int32 = 0
    while node < visibleMap.Length {
      visibleMap[node] = false
      node = node + 1
    }
    visibleCount = 0
    node = 0
    while node < PerformanceTopologyNodes && visibleCount < PerformanceTopologyVisibleTarget {
      let x = ScreenX(node)
      let y = ScreenY(node)
      if x >= -20.0 && x < float64(PerformanceTopologyWidth) + 20.0
        && y >= -20.0 && y < float64(PerformanceTopologyHeight) + 20.0 {
          visibleNodes[visibleCount] = node
          visibleMap[node] = true
          visibleCount = visibleCount + 1
        }
      node = node + 1
    }
    while visibleCount < PerformanceTopologyVisibleTarget {
      visibleNodes[visibleCount] = -1
      visibleCount = visibleCount + 1
    }
    var active int32 = 0
    while active < PerformanceTopologyVisibleTarget && visibleNodes[active] >= 0 {
      active = active + 1
    }
    visibleCount = active
  }

  override func Build() Blob {
    let canvas = Container() {.Key: "perf-topology-canvas",.Position: PositionType.Absolute,.Left: -panX,.Top: -panY,.Width: 5760,.Height: 3240,.Transform: PanelTransform{ Scale: zoom },.TransformOriginX: Length.Percent(0),.TransformOriginY: Length.Percent(0),.BackgroundColor: Color.Rgb(8, 13, 22),
    }
    visibleEdgeCount = 0
    var visibleSlot int32 = 0
    while visibleSlot < visibleCount {
      let from = visibleNodes[visibleSlot]
      var edgeGroup int32 = 0
      while edgeGroup < 3 {
        let edge = from + edgeGroup * PerformanceTopologyNodes
        let to = (edge * 37 + 17) % PerformanceTopologyNodes
        if visibleMap[to] {
          let fromX = NodeX(from) + 7.0
          let fromY = NodeY(from) + 7.0
          let dx = NodeX(to) + 7.0 - fromX
          let dy = NodeY(to) + 7.0 - fromY
          let length = Math.Sqrt(dx * dx + dy * dy)
          if length > 0.0 {
            canvas.Children.Add(Container{
              Key: edgeKeys[edge],
              Position: PositionType.Absolute,
              Left: fromX,
              Top: fromY,
              Width: length,
              Height: 1.0,
              Transform: PanelTransform{
                Rotate: Math.Atan2(dy, dx) * 180.0 / Math.PI,
              },
              TransformOriginX: Length.Percent(0),
              TransformOriginY: Length.Percent(0),
              BackgroundColor: Color.Rgb(42, 62, 86),
            })
            visibleEdgeCount = visibleEdgeCount + 1
          }
        }
        edgeGroup = edgeGroup + 1
      }
      visibleSlot = visibleSlot + 1
    }
    var slot int32 = 0
    while slot < visibleCount {
      let node = visibleNodes[slot]
      canvas.Children.Add(Cell.Mount[PerformanceTopologyCellInput, PerformanceTopologyCell](
        nodeKeys[node],
        PerformanceTopologyCellInput{
          Node: node,
          Group: node % PerformanceTopologyGroups,
          Mutated: IsMutated(node),
          Labeled: (node & 31) == 0,
        }))
      slot = slot + 1
    }
    return Container() {.Width: PerformanceTopologyWidth,.Height: PerformanceTopologyHeight,.Position: PositionType.Relative,.OverflowX: Overflow.Hidden,.OverflowY: Overflow.Hidden,
      canvas,
    }
  }
}

open class PerformanceTopologyCell : Cell[PerformanceTopologyCellInput] {
  protected override func Build(input PerformanceTopologyCellInput) Blob {
    let base = 24 + (input.Group * 29) % 160
    let green = if input.Mutated { 232 } else { 72 + (input.Group * 17) % 120 }
    let blue = 128 + (input.Group * 11) % 112
    let result = Container{
      Position: PositionType.Absolute,
      Left: float64((input.Node * 97 + int32(2246822519uL % 5760uL)) % 5760),
      Top: float64((input.Node * 193 + int32(2246822519uL % 3240uL)) % 3240),
      Width: 14.0,
      Height: 14.0,
      BorderRadius: 3.0,
      BackgroundColor: Color.Rgb(if input.Mutated { 255 } else { base }, green, blue),
    }
    if input.Labeled {
      result.Children.Add(Text{
        Content: Convert.ToChar(65 + input.Node % 26).ToString(),
        Position: PositionType.Absolute,
        Left: 16.0,
        Top: 0.0,
        Width: 16.0,
        Height: 14.0,
        FontSize: 8.0,
        Color: Color.Rgb(220, 230, 242),
      })
    }
    return result
  }
}

func PerformanceBox(index int32, color Color, key string? = nil) Blob {
  let row = index / 25
  let column = index % 25
  return Container{
    Key: key,
    Position: PositionType.Absolute,
    Left: float64(column) * 40.0,
    Top: float64(row) * 16.0,
    Width: 40.0,
    Height: 16.0,
    BorderRadius: if (index & 1) == 0 { 0.0 } else { 3.0 },
    BackgroundColor: color,
  }
}

class PerformanceBoxCell : Cell {
  private var index int32
  private var color Color

  func Initialize(boxIndex int32, initialColor Color) {
    index = boxIndex
    color = initialColor
  }

  func SetColor(value Color) {
    if color == value {
      return
    }
    color = value
    Rebuild()
  }

  override func Build() Blob -> PerformanceBox(index, color)
}

class PerformanceBoxesRoot : Cell {
  shared {
    const PerformanceBoxes int32 = 1000
  }

  private let seed uint64
  private let full bool
  private let keys []string
  private let cells []PerformanceBoxCell?
  private var generation int32
  private var changedIndex int32

  prop LogicalCount int64 { get -> int64(PerformanceBoxes) }
  prop LogicalEdges int32 { get -> 0 }
  prop VisibleCount int32 { get -> PerformanceBoxes }
  prop MountedCount int32 { get -> PerformanceBoxes }
  prop MountedBound int32 { get -> PerformanceBoxes }
  prop Width int32 { get -> 1000 }
  prop Height int32 { get -> 640 }
  prop MutationCount int32 { get -> if full { PerformanceBoxes } else { 1 } }
  prop RetainedChildUpdates bool { get -> !full }
  prop DirtyCell Cell {
    get {
      if changedIndex >= 0 {
        if let current = cells[changedIndex] { return current }
      }
      return this
    }
  }

  init(initialSeed uint64, mutateAll bool) {
    seed = initialSeed
    full = mutateAll
    keys = [PerformanceBoxes]string
    cells = [PerformanceBoxes]PerformanceBoxCell?
    var index int32 = 0
    while index < PerformanceBoxes {
      keys[index] = "perf-box-" + index.ToString()
      index = index + 1
    }
    changedIndex = -1
  }

  func Advance(frame int32) {
    let previous = changedIndex
    generation = generation + 1
    changedIndex = if full { -1 } else { (frame * 17 + int32(seed % 997uL)) % PerformanceBoxes }
    if full {
      return
    }
    if previous >= 0 && previous != changedIndex {
      SetBoxColor(previous)
    }
    SetBoxColor(changedIndex)
  }

  private func SetBoxColor(index int32) {
    guard let cell = cells[index] else {
      throw InvalidOperationException("Performance box cell is not mounted")
    }
    cell.SetColor(BoxColor(index))
  }

  private func BoxColor(index int32) Color {
    let base = 24 + (index % 8) * 12
    let green = 56 + (index % 5) * 18
    let blue = 112 + (index / 25 % 6) * 16
    if full || changedIndex == index {
      return Color.Rgb(
        (base + generation * 13 + index) % 220 + 24,
        (green + generation * 7 + index * 3) % 180 + 40,
        (blue + generation * 5 + index * 5) % 160 + 72)
    }
    return Color.Rgb(base, green, blue)
  }

  override func Build() Blob {
    let children = List[Blob](PerformanceBoxes)
    var index int32 = 0
    while index < PerformanceBoxes {
      if full {
        children.Add(PerformanceBox(index, BoxColor(index), keys[index]))
      } else {
        let boxIndex = index
        let initialColor = BoxColor(index)
        children.Add(Cell.MountSeeded[PerformanceBoxCell](keys[index],
          (cell PerformanceBoxCell) -> {
            cell.Initialize(boxIndex, initialColor)
            cells[boxIndex] = cell
          }, nil))
      }
      index = index + 1
    }
    return Container{
      Width: 1000,
      Height: 640,
      Position: PositionType.Relative,
      BackgroundColor: Color.Transparent,
      Children: children,
    }
  }
}

class PerformanceTextEditorCell : Cell, IDisposable {
  private let controller TextEditorController
  private var index int32
  private var color Color

  init() {
    controller = TextEditorController(TextDocument("x"))
  }

  func Initialize(editorIndex int32, initialColor Color) {
    index = editorIndex
    color = initialColor
  }

  func SetColor(value Color) {
    if color == value {
      return
    }
    color = value
    Rebuild()
  }

  override func Build() Blob {
    let row = index / 25
    let column = index % 25
    return TextEditor(controller) {
      Position = PositionType.Absolute,
      Left = float64(column) * 40.0,
      Top = float64(row) * 16.0,
      Width = 40.0,
      Height = 16.0,
      FontSize = 10.0,
      LineHeight = 1.0,
      TextWrap = TextWrap.NoWrap,
      BackgroundColor = color,
      Color = Color.Rgb(224, 232, 244),
      OverscanLines = 0,
    }
  }

  /// Releases the editor controller.
  public func Dispose() {
    controller.Dispose()
  }
}

class PerformanceTextEditorsRoot : Cell {
  shared {
    const PerformanceTextEditors int32 = 1000
  }

  private let seed uint64
  private let cells []PerformanceTextEditorCell?
  private var generation int32
  private var changedIndex int32

  prop LogicalCount int64 { get -> int64(PerformanceTextEditors) }
  prop VisibleCount int32 { get -> PerformanceTextEditors }
  prop MountedCount int32 { get -> PerformanceTextEditors }
  prop MountedBound int32 { get -> PerformanceTextEditors }
  prop Width int32 { get -> 1000 }
  prop Height int32 { get -> 640 }
  prop MutationCount int32 { get -> 1 }
  prop DirtyCell Cell {
    get {
      if changedIndex >= 0 {
        if let current = cells[changedIndex] { return current }
      }
      return this
    }
  }

  init(initialSeed uint64) {
    seed = initialSeed
    cells = [PerformanceTextEditors]PerformanceTextEditorCell?
    changedIndex = -1
  }

  func Advance(frame int32) {
    let previous = changedIndex
    generation = generation + 1
    changedIndex = (frame * 17 + int32(seed % 997uL)) % PerformanceTextEditors
    if previous >= 0 && previous != changedIndex {
      SetEditorColor(previous)
    }
    SetEditorColor(changedIndex)
  }

  private func SetEditorColor(index int32) {
    guard let cell = cells[index] else {
      throw InvalidOperationException("Performance text editor cell is not mounted")
    }
    cell.SetColor(EditorColor(index))
  }

  private func EditorColor(index int32) Color {
    if changedIndex == index {
      return Color.Rgb(
        (48 + generation * 13 + index) % 160 + 48,
        (72 + generation * 7 + index * 3) % 128 + 72,
        (112 + generation * 5 + index * 5) % 112 + 112)
    }
    return Color.Rgb(8, 13, 22)
  }

  override func Build() Blob {
    let children = List[Blob](PerformanceTextEditors)
    var index int32 = 0
    while index < PerformanceTextEditors {
      let editorIndex = index
      let initialColor = EditorColor(index)
      children.Add(Cell.MountSeeded[PerformanceTextEditorCell](
        "perf-text-editor-" + index.ToString(),
        (cell PerformanceTextEditorCell) -> {
          cell.Initialize(editorIndex, initialColor)
          cells[editorIndex] = cell
        }, nil))
      index = index + 1
    }
    return Container{
      Width: 1000,
      Height: 640,
      Position: PositionType.Relative,
      BackgroundColor: Color.Transparent,
      Children: children,
    }
  }
}

class PerformanceScenario : Cell {
  private let workload string
  private let seed uint64
  private var table PerformanceTableRoot?
  private var topology PerformanceTopologyRoot?
  private var boxes PerformanceBoxesRoot?
  private var textEditors PerformanceTextEditorsRoot?
  private var smallAnimation PerformanceSmallAnimationRoot?
  private var textEditing PerformanceTextEditingRoot?
  private var imageEffects PerformanceImageEffectsRoot?
  private var resizeDpi PerformanceResizeDpiRoot?

  private var revision int32

  prop Workload string { get -> workload }
  prop InitialSettlementFrames int32 {
    get {
      return if workload == "image-effects" { 2 } else { 0 }
    }
  }
  prop Seed uint64 { get -> seed }
  prop Root Cell { get -> this }
  prop DirtyCell Cell {
    get {
      if let current = boxes {
        if current.RetainedChildUpdates { return current.DirtyCell }
      }
      if let current = textEditors { return current.DirtyCell }
      return this
    }
  }
  prop LogicalCount int64 {
    get {
      if let current = table { return current.LogicalCount }
      if let current = topology { return current.LogicalCount }
      if let current = boxes { return current.LogicalCount }
      if let current = textEditors { return current.LogicalCount }
      if let current = smallAnimation { return current.LogicalCount }
      if let current = textEditing { return current.LogicalCount }
      if let current = imageEffects { return current.LogicalCount }
      if let current = resizeDpi { return current.LogicalCount }
      return 0L
    }
  }
  prop LogicalEdges int32 {
    get {
      if let current = topology { return current.LogicalEdges }
      if let current = smallAnimation { return current.LogicalEdges }
      if let current = textEditing { return current.LogicalEdges }
      if let current = imageEffects { return current.LogicalEdges }
      if let current = resizeDpi { return current.LogicalEdges }
      return 0
    }
  }
  prop VisibleEdges int32 {
    get {
      if let current = topology { return current.VisibleEdgeCount }
      if let current = resizeDpi { return current.VisibleEdges }
      return 0
    }
  }
  prop VisibleCount int32 {
    get {
      if let current = table { return current.VisibleCount }
      if let current = topology { return current.VisibleCount }
      if let current = boxes { return current.VisibleCount }
      if let current = textEditors { return current.VisibleCount }
      if let current = smallAnimation { return current.VisibleCount }
      if let current = textEditing { return current.VisibleCount }
      if let current = imageEffects { return current.VisibleCount }
      if let current = resizeDpi { return current.VisibleCount }
      return 0
    }
  }
  prop MountedCount int32 {
    get {
      if let current = table { return current.MountedCount }
      if let current = topology { return current.MountedCount }
      if let current = boxes { return current.MountedCount }
      if let current = textEditors { return current.MountedCount }
      if let current = smallAnimation { return current.MountedCount }
      if let current = textEditing { return current.MountedCount }
      if let current = imageEffects { return current.MountedCount }
      if let current = resizeDpi { return current.MountedCount }
      return 0
    }
  }
  prop MountedBound int32 {
    get {
      if let current = table { return current.MountedBound }
      if let current = topology { return current.MountedBound }
      if let current = boxes { return current.MountedBound }
      if let current = textEditors { return current.MountedBound }
      if let current = smallAnimation { return current.MountedBound }
      if let current = textEditing { return current.MountedBound }
      if let current = imageEffects { return current.MountedBound }
      if let current = resizeDpi { return current.MountedBound }
      return 0
    }
  }
  prop MutationCount int32 {
    get {
      if let current = table { return current.MutationCount }
      if let current = topology { return current.MutationCount }
      if let current = boxes { return current.MutationCount }
      if let current = textEditors { return current.MutationCount }
      if let current = smallAnimation { return current.MutationCount }
      if let current = textEditing { return current.MutationCount }
      if let current = imageEffects { return current.MutationCount }
      if let current = resizeDpi { return current.MutationCount }
      return 0
    }
  }
  prop Width int32 {
    get {
      if let current = table { return current.Width }
      if let current = topology { return current.Width }
      if let current = boxes { return current.Width }
      if let current = textEditors { return current.Width }
      if let current = smallAnimation { return current.Width }
      if let current = textEditing { return current.Width }
      if let current = imageEffects { return current.Width }
      if let current = resizeDpi { return current.Width }
      return 0
    }
  }
  prop Height int32 {
    get {
      if let current = table { return current.Height }
      if let current = topology { return current.Height }
      if let current = boxes { return current.Height }
      if let current = textEditors { return current.Height }
      if let current = smallAnimation { return current.Height }
      if let current = textEditing { return current.Height }
      if let current = imageEffects { return current.Height }
      if let current = resizeDpi { return current.Height }
      return 0
    }
  }

  init(selected string) {
    workload = selected
    seed = if selected == "table" {
      2654435761uL
    } else if selected == "topology" {
      2246822519uL
    } else if selected == "small-animation" {
      1103515245uL
    } else if selected == "text-editor-sparse" || selected == "text-editing" {
      3266489917uL
    } else if selected == "image-effects" {
      668265263uL
    } else if selected == "resize-dpi" {
      374761393uL
    } else {
      668265263uL
    }
    if selected == "table" {
      let value = PerformanceTableRoot(seed)
      table = value
    } else if selected == "topology" {
      let value = PerformanceTopologyRoot(seed)
      topology = value
    } else if selected == "boxes-sparse" {
      let value = PerformanceBoxesRoot(seed, false)
      boxes = value
    } else if selected == "boxes-full" {
      let value = PerformanceBoxesRoot(seed, true)
      boxes = value
    } else if selected == "text-editor-sparse" {
      let value = PerformanceTextEditorsRoot(seed)
      textEditors = value
    } else if selected == "small-animation" {
      let value = PerformanceSmallAnimationRoot(seed)
      smallAnimation = value
    } else if selected == "text-editing" {
      let value = PerformanceTextEditingRoot(seed)
      textEditing = value
    } else if selected == "image-effects" {
      let value = PerformanceImageEffectsRoot()
      imageEffects = value
    } else if selected == "resize-dpi" {
      let value = PerformanceResizeDpiRoot(seed)
      resizeDpi = value
    } else {
      let value = PerformanceBoxesRoot(seed, true)
      boxes = value
    }
  }

  func Advance(frame int32) {
    if let current = table {
      current.Advance(frame)
    } else if let current = topology {
      current.Advance(frame)
    } else if let current = boxes {
      current.Advance(frame)
    } else if let current = textEditors {
      current.Advance(frame)
    } else if let current = smallAnimation {
      current.Advance(frame)
    } else if let current = textEditing {
      current.Advance(frame)
    } else if let current = imageEffects {
      current.Advance(frame)
    } else if let current = resizeDpi {
      current.Advance(frame)
    }
    revision = revision + 1
    var rebuildScenario = true
    if let current = boxes {
      rebuildScenario = !current.RetainedChildUpdates
    }
    if textEditors != nil {
      rebuildScenario = false
    }
    if rebuildScenario {
      Rebuild()
    }
  }

  func PrepareWindow(window Window, frame int32) {
    if let current = resizeDpi {
      current.Transition(frame)
      var metrics = WindowReadbackTestFixture.Metrics(window)
      if metrics.LogicalWidth != current.Width
        || metrics.LogicalHeight != current.Height
        || metrics.FramebufferWidth != current.FramebufferWidth
        || metrics.FramebufferHeight != current.FramebufferHeight{
          let resized = WindowReadbackTestFixture.Resize(window, current.Width,
            current.Height, current.FramebufferWidth, current.FramebufferHeight)
          Require(resized,
            "Retained performance resize-dpi native resize failed at frame " + frame.ToString())
          metrics = WindowReadbackTestFixture.Metrics(window)
        }
      Require(metrics.LogicalWidth == current.Width
          && metrics.LogicalHeight == current.Height
          && metrics.FramebufferWidth == current.FramebufferWidth
          && metrics.FramebufferHeight == current.FramebufferHeight,
        "Retained performance resize-dpi metrics did not match root at frame "
        +frame.ToString())
    }
  }

  func AdvanceForWindow(frame int32, window Window) {
    PrepareWindow(window, frame)
    Advance(frame)
  }

  func DisposeOwnedResources() {
    if let current = imageEffects {
      current.DisposeSources()
    }
    if let current = resizeDpi {
      current.DisposeSource()
    }
  }

  override func Build() Blob {
    let currentRevision = revision
    if let current = table { return current.Build() }
    if let current = topology { return current.Build() }
    if let current = boxes { return current.Build() }
    if let current = textEditors { return current.Build() }
    if let current = smallAnimation { return current.Build() }
    if let current = textEditing { return current.Build() }
    if let current = imageEffects { return current.Build() }
    if let current = resizeDpi { return current.Build() }
    return Container{}
  }

  func Invariant() bool {
    let common = MountedCount >= 0 && MountedCount <= MountedBound
      && VisibleCount >= 0 && VisibleCount <= MountedBound
      && (LogicalEdges == 0 || VisibleEdges > 0)
    if let current = smallAnimation { return common && current.Invariant() }
    if let current = textEditing { return common && current.Invariant() }
    if let current = imageEffects { return common && current.Invariant() }
    if let current = resizeDpi { return common && current.Invariant() }
    return common
  }
}

data struct PerformanceGpuStats {
  internal var Count int32
  internal var P50 int64
  internal var P95 int64
  internal var P99 int64
  internal var P999 int64
  internal var Worst int64
}

func PerformanceValue(value int64) uint64 -> if value < 0L { 0uL } else { uint64(value) }

func PerformanceDelta(after uint64, before uint64) uint64 -> if after >= before { after - before } else { 0uL }

func PerformanceMaxCount(values []int64, count int32) int64 {
  var maximum int64 = 0L
  var index int32 = 0
  while index < count {
    if values[index] > maximum {
      maximum = values[index]
    }
    index = index + 1
  }
  return maximum
}

func PerformancePercentileCount(values []int64, count int32, percentile float64) int64 {
  if count <= 0 {
    return 0L
  }
  if count == values.Length {
    return Percentile(values, percentile)
  }
  let subset = [count]int64
  Array.Copy(values, subset, count)
  return Percentile(subset, percentile)
}

func PerformanceGpuStats(values []int64, count int32) PerformanceGpuStats -> PerformanceGpuStats {
  Count: count,
  P50: PerformancePercentileCount(values, count, 0.50),
  P95: PerformancePercentileCount(values, count, 0.95),
  P99: PerformancePercentileCount(values, count, 0.99),
  P999: PerformancePercentileCount(values, count, 0.999),
  Worst: PerformanceMaxCount(values, count),
}

func PerformanceWorkload() string {
  guard let value = Environment.GetEnvironmentVariable("GOO_PERF_WORKLOAD") else {
    throw InvalidOperationException(
      "GOO_PERF_WORKLOAD must select a retained performance workload")
  }
  if value == "table" || value == "topology" || value == "boxes-sparse"
    || value == "boxes-full" || value == "small-animation"
    || value == "text-editor-sparse" || value == "text-editing" || value == "image-effects"
    || value == "resize-dpi" || value == "three-window"
    || value == "true-idle" {
      return value
    }
  throw InvalidOperationException(
    "GOO_PERF_WORKLOAD must be table, topology, boxes-sparse, boxes-full, "
    +"small-animation, text-editor-sparse, text-editing, image-effects, resize-dpi, "
    +"three-window, or true-idle")
}

func PerformanceProcessWorkingSet(process Process) uint64 {
  process.Refresh()
  return PerformanceValue(process.WorkingSet64)
}

func PerformanceProcessPrivateMemory(process Process) uint64 {
  process.Refresh()
  return PerformanceValue(process.PrivateMemorySize64)
}

func PerformanceManagedLive() uint64 -> PerformanceValue(GC.GetTotalMemory(false))
func PerformanceManagedRetained() uint64 -> PerformanceValue(GC.GetTotalMemory(true))

func PerformancePrivateDirty() uint64 {
  let path = "/proc/self/smaps_rollup"
  if !File.Exists(path) {
    return 0uL
  }
  for line in File.ReadLines(path) {
    if line.StartsWith("Private_Dirty:") {
      var value = line.Substring(14).Trim()
      let separator = value.IndexOf(" ")
      if separator >= 0 {
        value = value.Substring(0, separator)
      }
      return UInt64.Parse(value) * 1024uL
    }
  }
  return 0uL
}

func RunPerformanceBenchmark() {
  Require(Environment.GetEnvironmentVariable("GOO_VK_DIAGNOSTICS") == "1",
    "GOO_VK_DIAGNOSTICS=1 is required")
  let workload = PerformanceWorkload()
  if workload == "three-window" {
    RunPerformanceThreeWindowBenchmark()
    return
  }
  if workload == "true-idle" {
    RunIdleSmoke()
    return
  }
  let warmup = EnvironmentCount("GOO_PERF_WARMUP", 300, 300)
  let samples = EnvironmentCount("GOO_PERF_SAMPLES", 2000, 2000)
  Require(samples > 0, "GOO_PERF_SAMPLES must be positive")
  let scenario = PerformanceScenario(workload)
  let frameNs = [samples]int64
  let frameAllocations = [samples]int64
  let gpuNs = [samples]int64
  let process = Process.GetCurrentProcess()
  var sawSlot0 bool = false
  var sawSlot1 bool = false
  var gpuCount int32 = 0
  var timestampSupported bool = false
  var measurementStartFrame uint64 = 0uL
  var measurementEndFrame uint64 = 0uL
  var collectGpu bool = false
  var finalCounters VulkanDiagnosticCounterSnapshot
  var beforeCounters VulkanDiagnosticCounterSnapshot
  var finalScene VulkanSceneRetentionTestSnapshot
  var finalPrimitive VulkanPrimitiveFrameRetentionTestSnapshot
  var finalText VulkanTextFrameRetentionTestSnapshot
  var window Window? = nil
  var managedLiveStart uint64 = 0uL
  var managedLiveEnd uint64 = 0uL
  var managedLivePeak uint64 = 0uL
  var managedRetainedStart uint64 = 0uL
  var managedRetainedEnd uint64 = 0uL
  var workingSetStart uint64 = 0uL
  var workingSetEnd uint64 = 0uL
  var workingSetPeak uint64 = 0uL
  var privateMemoryStart uint64 = 0uL
  var privateMemoryEnd uint64 = 0uL
  var privateMemoryPeak uint64 = 0uL
  var privateDirtyStart uint64 = 0uL
  var privateDirtyEnd uint64 = 0uL
  var allocatorPeak uint64 = 0uL
  var vulkanMemoryPeak uint64 = 0uL
  var cachePeak uint64 = 0uL
  var imagePeak uint64 = 0uL
  var textAtlasPeak uint64 = 0uL
  var gen0Before int32 = 0
  var gen1Before int32 = 0
  var gen2Before int32 = 0
  var gen0After int32 = 0
  var gen1After int32 = 0
  var gen2After int32 = 0
  var pauseTicksBefore int64 = 0L
  var pauseTicksAfter int64 = 0L
  try {
    let opened = Window{
      Title: "Goo Retained performance " + workload,
      Width: scenario.Width,
      Height: scenario.Height,
      VSync: false,
      Root: scenario.Root,
    }
    window = opened
    opened.Open()
    WindowReadbackTestFixture.SetMainPassTimestampSink(opened,
      func(snapshot VulkanDiagnosticTimestampSnapshot) {
        if collectGpu && snapshot.frame > measurementStartFrame
          && (measurementEndFrame == 0uL || snapshot.frame <= measurementEndFrame)
          && gpuCount < gpuNs.Length{
            gpuNs[gpuCount] = int64(snapshot.elapsedNanoseconds)
            gpuCount = gpuCount + 1
          }
      })
    WindowReadbackTestFixture.ForceRender(opened, 0.0)

    Require(WindowReadbackTestFixture.CellMounted(scenario),
      "Retained performance scenario root is not mounted")
    var settlementIndex int32 = 0
    while settlementIndex < scenario.InitialSettlementFrames {
      WindowReadbackTestFixture.PumpNativeEvents()
      WindowReadbackTestFixture.ForceRender(opened, 0.0166666666666667)
      settlementIndex = settlementIndex + 1
    }
    timestampSupported = WindowReadbackTestFixture.TimestampSupported(opened)
    var warmIndex int32 = 0
    while warmIndex < warmup {
      WindowReadbackTestFixture.PumpNativeEvents()
      scenario.AdvanceForWindow(warmIndex, opened)

      WindowReadbackTestFixture.ForceRender(opened, 0.0166666666666667)
      warmIndex = warmIndex + 1
    }
    measurementStartFrame = WindowReadbackTestFixture.DiagnosticFrameId(opened)
    collectGpu = true
    beforeCounters = WindowReadbackTestFixture.DiagnosticCounters(opened)
    managedRetainedStart = PerformanceManagedRetained()
    managedLiveStart = PerformanceManagedLive()
    workingSetStart = PerformanceProcessWorkingSet(process)
    privateMemoryStart = PerformanceProcessPrivateMemory(process)
    privateDirtyStart = PerformancePrivateDirty()
    allocatorPeak = beforeCounters.allocatorBytes
    vulkanMemoryPeak = beforeCounters.vulkanDeviceMemoryBytes
    cachePeak = beforeCounters.cacheBytes
    imagePeak = beforeCounters.imagePeakResidentBytes
    textAtlasPeak = beforeCounters.textAtlasPeakResidentBytes
    gen0Before = GC.CollectionCount(0)
    gen1Before = GC.CollectionCount(1)
    gen2Before = GC.CollectionCount(2)
    pauseTicksBefore = GC.GetTotalPauseDuration().Ticks
    managedLivePeak = managedLiveStart
    workingSetPeak = workingSetStart
    privateMemoryPeak = privateMemoryStart
    var sampleIndex int32 = 0
    while sampleIndex < samples {
      WindowReadbackTestFixture.PumpNativeEvents()
      let countersBefore = WindowReadbackTestFixture.DiagnosticCounters(opened)
      let submissionsBefore = countersBefore.submitCount
      let presentsBefore = countersBefore.presentCount
      let allocatedBefore = GC.GetAllocatedBytesForCurrentThread()
      let start = Stopwatch.GetTimestamp()
      scenario.AdvanceForWindow(warmup + sampleIndex, opened)

      Require(WindowReadbackTestFixture.CellDirty(scenario.DirtyCell),
        "Retained performance scenario root was not dirtied")
      var counters = WindowReadbackTestFixture.DiagnosticCounters(opened)
      var end int64 = 0L
      var allocatedAfter int64 = 0L
      var submitAttempt int32 = 0
      while counters.submitCount == submissionsBefore && submitAttempt < 1000 {
        WindowReadbackTestFixture.ForceRenderNonblocking(
          opened, submitAttempt == 0 ? 0.0166666666666667 : 0.0)
        end = Stopwatch.GetTimestamp()
        allocatedAfter = GC.GetAllocatedBytesForCurrentThread()
        WindowReadbackTestFixture.DrainWindowQueue(opened, 2000)
        counters = WindowReadbackTestFixture.DiagnosticCounters(opened)
        if counters.submitCount == submissionsBefore {
          WindowReadbackTestFixture.PumpNativeEvents()
        }
        submitAttempt = submitAttempt + 1
      }
      Require(counters.submitCount == submissionsBefore + 1uL,
        "Retained performance measured frame did not submit exactly once at sample "
        +sampleIndex.ToString())
      Require(counters.presentCount == presentsBefore + 1uL,
        "Retained performance measured frame did not present exactly once at sample "
        +sampleIndex.ToString())

      frameNs[sampleIndex] = TicksToNanoseconds(end - start)
      frameAllocations[sampleIndex] = allocatedAfter - allocatedBefore
      let live = PerformanceManagedLive()
      let working = PerformanceProcessWorkingSet(process)
      let privateMemory = PerformanceProcessPrivateMemory(process)
      managedLiveEnd = live
      workingSetEnd = working
      privateMemoryEnd = privateMemory
      if live > managedLivePeak { managedLivePeak = live }
      if working > workingSetPeak { workingSetPeak = working }
      if privateMemory > privateMemoryPeak { privateMemoryPeak = privateMemory }
      let primitive = WindowReadbackTestFixture.PrimitiveFrameRetention(opened)
      let text = WindowReadbackTestFixture.TextFrameRetention(opened)
      if primitive.SlotIndex == 0 { sawSlot0 = true }
      if primitive.SlotIndex == 1 { sawSlot1 = true }
      finalPrimitive = primitive
      finalText = text
      finalScene = WindowReadbackTestFixture.SceneRetention(opened)
      finalCounters = counters
      if finalCounters.allocatorBytes > allocatorPeak {
        allocatorPeak = finalCounters.allocatorBytes
      }
      if finalCounters.vulkanDeviceMemoryBytes > vulkanMemoryPeak {
        vulkanMemoryPeak = finalCounters.vulkanDeviceMemoryBytes
      }
      if finalCounters.cacheBytes > cachePeak {
        cachePeak = finalCounters.cacheBytes
      }
      if finalCounters.imagePeakResidentBytes > imagePeak {
        imagePeak = finalCounters.imagePeakResidentBytes
      }
      if finalCounters.textAtlasPeakResidentBytes > textAtlasPeak {
        textAtlasPeak = finalCounters.textAtlasPeakResidentBytes
      }
      sampleIndex = sampleIndex + 1
    }
    measurementEndFrame = WindowReadbackTestFixture.DiagnosticFrameId(opened)
    var resolveIndex int32 = 0
    while resolveIndex < 2 {
      WindowReadbackTestFixture.PumpNativeEvents()
      WindowReadbackTestFixture.ForceRender(opened, 0.0166666666666667)
      resolveIndex = resolveIndex + 1
    }
    collectGpu = false
    WindowReadbackTestFixture.SetMainPassTimestampSink(opened, nil)
    Require(sampleIndex == samples, "Retained performance sample count is incorrect")
    managedLiveEnd = PerformanceManagedLive()
    workingSetEnd = PerformanceProcessWorkingSet(process)
    privateMemoryEnd = PerformanceProcessPrivateMemory(process)
    privateDirtyEnd = PerformancePrivateDirty()
    managedRetainedEnd = PerformanceManagedRetained()
    gen0After = GC.CollectionCount(0)
    gen1After = GC.CollectionCount(1)
    gen2After = GC.CollectionCount(2)
    pauseTicksAfter = GC.GetTotalPauseDuration().Ticks
    if managedLiveEnd > managedLivePeak { managedLivePeak = managedLiveEnd }
    if workingSetEnd > workingSetPeak { workingSetPeak = workingSetEnd }
    if privateMemoryEnd > privateMemoryPeak { privateMemoryPeak = privateMemoryEnd }
    Require(scenario.Invariant(), "Retained performance mounted bounds invariant failed")
    Require(sawSlot0 && sawSlot1, "Retained performance did not exercise both frame slots")
    if timestampSupported {
      Require(gpuCount == samples,
        "Retained performance did not resolve every measured GPU sample")
    }
    opened.RequestClose()
    WindowReadbackTestFixture.ForceRender(opened, 0.0)
    Require(!opened.IsOpen, "Retained performance benchmark window did not close")
  } finally {
    collectGpu = false
    try {
      if let active = window {
        WindowReadbackTestFixture.SetMainPassTimestampSink(active, nil)
        if active.IsOpen {
          active.RequestClose()
          WindowReadbackTestFixture.ForceRender(active, 0.0)
        }
      }
    } finally {
      scenario.DisposeOwnedResources()
    }
  }
  let gpu = PerformanceGpuStats(gpuNs, gpuCount)
  var allocationSum int64 = 0L
  var index int32 = 0
  while index < samples {
    allocationSum = allocationSum + frameAllocations[index]
    index = index + 1
  }
  let allocationP50 = PerformancePercentileCount(frameAllocations, samples, 0.50)
  let allocationP95 = PerformancePercentileCount(frameAllocations, samples, 0.95)
  let allocationP99 = PerformancePercentileCount(frameAllocations, samples, 0.99)
  let allocationP999 = PerformancePercentileCount(frameAllocations, samples, 0.999)
  let allocationWorst = PerformanceMaxCount(frameAllocations, samples)
  if workload == "boxes-sparse" && warmup > 0 {
    Require(allocationP95 <= 2048L,
      "Retained sparse boxes exceeded the 2 KiB managed allocation budget")
  }
  if workload == "text-editor-sparse" && warmup > 0 {
    Require(allocationP95 <= 4096L,
      "Retained sparse text editors exceeded the 4 KiB managed allocation budget")
  }
  let planDelta = PerformanceDelta(finalCounters.planCompileCount, beforeCounters.planCompileCount)
  let recordDelta = PerformanceDelta(finalCounters.recordCount, beforeCounters.recordCount)
  let drawDelta = PerformanceDelta(finalCounters.drawCount, beforeCounters.drawCount)
  let submitDelta = PerformanceDelta(finalCounters.submitCount, beforeCounters.submitCount)
  let presentDelta = PerformanceDelta(finalCounters.presentCount, beforeCounters.presentCount)
  let damageDelta = PerformanceDelta(finalCounters.damageCount, beforeCounters.damageCount)
  let damageAreaDelta = PerformanceDelta(finalCounters.damageArea, beforeCounters.damageArea)
  Console.WriteLine("performance: workload=" + workload
    +" seed=" + scenario.Seed.ToString()
    +" logical=" + scenario.LogicalCount.ToString()
    +" logical_edges=" + scenario.LogicalEdges.ToString()
    +" visible_edges=" + scenario.VisibleEdges.ToString()
    +" visible=" + scenario.VisibleCount.ToString()
    +" mounted=" + scenario.MountedCount.ToString()
    +" mounted_bound=" + scenario.MountedBound.ToString()
    +" mutations=" + scenario.MutationCount.ToString()
    +" warmup=" + warmup.ToString()
    +" samples=" + samples.ToString()
    +" cpu_p50_ns=" + Percentile(frameNs, 0.50).ToString()
    +" cpu_p95_ns=" + Percentile(frameNs, 0.95).ToString()
    +" cpu_p99_ns=" + Percentile(frameNs, 0.99).ToString()
    +" cpu_p999_ns=" + Percentile(frameNs, 0.999).ToString()
    +" cpu_worst_ns=" + Maximum(frameNs).ToString()
    +" managed_alloc_p50_B=" + allocationP50.ToString()
    +" managed_alloc_p95_B=" + allocationP95.ToString()
    +" managed_alloc_p99_B=" + allocationP99.ToString()
    +" managed_alloc_p999_B=" + allocationP999.ToString()
    +" managed_alloc_worst_B=" + allocationWorst.ToString()
    +" managed_alloc_total_B=" + allocationSum.ToString()
    +" managed_live_start_B=" + managedLiveStart.ToString()
    +" managed_live_end_B=" + managedLiveEnd.ToString()
    +" managed_live_peak_B=" + managedLivePeak.ToString()
    +" managed_retained_start_B=" + managedRetainedStart.ToString()
    +" managed_retained_end_B=" + managedRetainedEnd.ToString()
    +" working_set_start_B=" + workingSetStart.ToString()
    +" working_set_end_B=" + workingSetEnd.ToString()
    +" working_set_peak_B=" + workingSetPeak.ToString()
    +" private_memory_start_B=" + privateMemoryStart.ToString()
    +" private_memory_end_B=" + privateMemoryEnd.ToString()
    +" private_memory_peak_B=" + privateMemoryPeak.ToString()
    +" private_dirty_start_B=" + privateDirtyStart.ToString()
    +" private_dirty_end_B=" + privateDirtyEnd.ToString()
    +" allocator_current_B=" + finalCounters.allocatorBytes.ToString()
    +" allocator_peak_B=" + allocatorPeak.ToString()
    +" vk_memory_current_B=" + finalCounters.vulkanDeviceMemoryBytes.ToString()
    +" vk_memory_peak_B=" + vulkanMemoryPeak.ToString()
    +" image_current_B=" + finalCounters.imageResidentBytes.ToString()
    +" text_atlas_current_B=" + finalCounters.textAtlasResidentBytes.ToString()
    +" cache_current_B=" + finalCounters.cacheBytes.ToString()
    +" cache_peak_B=" + cachePeak.ToString()
    +" image_peak_B=" + imagePeak.ToString()
    +" text_atlas_peak_B=" + textAtlasPeak.ToString()
    +" gc_gen0_delta=" + (gen0After - gen0Before).ToString()
    +" gc_gen1_delta=" + (gen1After - gen1Before).ToString()
    +" gc_gen2_delta=" + (gen2After - gen2Before).ToString()
    +" gc_pause_ns=" + ((pauseTicksAfter - pauseTicksBefore) * 100L).ToString()
    +" managed_diagnostic_B=" + finalCounters.managedAllocatedBytes.ToString()
    +" vk_object_alloc_delta=" + PerformanceDelta(finalCounters.vulkanObjectAllocationCount,
      beforeCounters.vulkanObjectAllocationCount).ToString()
    +" vk_device_alloc_delta=" + PerformanceDelta(finalCounters.vulkanDeviceMemoryAllocationCount,
      beforeCounters.vulkanDeviceMemoryAllocationCount).ToString()
    +" plan_delta=" + planDelta.ToString()
    +" record_delta=" + recordDelta.ToString()
    +" draw_delta=" + drawDelta.ToString()
    +" submit_delta=" + submitDelta.ToString()
    +" present_delta=" + presentDelta.ToString()
    +" damage_delta=" + damageDelta.ToString()
    +" damage_area_delta=" + damageAreaDelta.ToString()
    +" damage_x=" + finalScene.DamageX.ToString()
    +" damage_y=" + finalScene.DamageY.ToString()
    +" damage_width=" + finalScene.DamageWidth.ToString()
    +" damage_height=" + finalScene.DamageHeight.ToString()
    +" primitive_planned_transfer_B=" + finalPrimitive.TotalPlannedTransferBytes.ToString()
    +" primitive_skipped_transfer_B=" + finalPrimitive.TotalSkippedTransferBytes.ToString()
    +" primitive_dirty=" + finalPrimitive.TotalDirtyRecordCount.ToString()
    +" primitive_ranges=" + finalPrimitive.TotalUploadRangeCount.ToString()
    +" primitive_full_uploads=" + finalPrimitive.TotalFullUploads.ToString()
    +" primitive_cpu_write_operations=" + finalPrimitive.TotalCpuWriteOperations.ToString()
    +" primitive_native_flush_calls=" + finalPrimitive.TotalNativeFlushCalls.ToString()
    +" primitive_retained_reuse=" + finalPrimitive.TotalRetainedReuse.ToString()
    +" text_written_B=" + finalText.TotalWrittenBytes.ToString()
    +" text_skipped_B=" + finalText.TotalSkippedBytes.ToString()
    +" text_dirty=" + finalText.TotalDirtySegmentCount.ToString()
    +" text_ranges=" + finalText.TotalUploadRangeCount.ToString()
    +" text_full_uploads=" + finalText.TotalFullUploads.ToString()
    +" text_mapped_writes=" + finalText.TotalMappedWrites.ToString()
    +" text_flushes=" + finalText.TotalFlushes.ToString()
    +" text_retained_reuse=" + finalText.TotalRetainedReuse.ToString()
    +" gpu_supported=" + (timestampSupported ? "1" : "0")
    +" gpu_samples=" + gpu.Count.ToString()
    +" gpu_main_p50_ns=" + gpu.P50.ToString()
    +" gpu_main_p95_ns=" + gpu.P95.ToString()
    +" gpu_main_p99_ns=" + gpu.P99.ToString()
    +" gpu_main_p999_ns=" + gpu.P999.ToString()
    +" gpu_main_worst_ns=" + gpu.Worst.ToString()
    +" power_proxy=external"
    +" both_slots=" + (sawSlot0 && sawSlot1 ? "1" : "0")
    +" close=1")
}

func RunGpuTimestampSmoke() {
  const EffectsScopeCount int32 = 16
  const OffscreenScopeCount int32 = 8
  Require(Environment.GetEnvironmentVariable("GOO_VK_DIAGNOSTICS") == "1",
    "GOO_VK_DIAGNOSTICS=1 is required")
  let warmup = EnvironmentCount("GOO_PERF_WARMUP", 300, 300)
  let samples = EnvironmentCount("GOO_PERF_SAMPLES", 2000, 2000)
  Require(samples > 0, "GOO_PERF_SAMPLES must be positive")
  let scenario = PerformanceScenario("image-effects")
  let expectedFrames = [samples]uint64
  let effectsSamples = [samples]int64
  let offscreenSamples = [samples]int64
  let captureCapacity = samples + 8
  let capturedEffectsFrames = [captureCapacity]uint64
  let capturedEffectsTicks = [captureCapacity]uint64
  let capturedEffectsNanoseconds = [captureCapacity]int64
  let capturedEffectsScopes = [captureCapacity]int32
  let capturedEffectsDrops = [captureCapacity]int32
  let capturedEffectsMatched = [captureCapacity]bool
  let capturedOffscreenFrames = [captureCapacity]uint64
  let capturedOffscreenTicks = [captureCapacity]uint64
  let capturedOffscreenNanoseconds = [captureCapacity]int64
  let capturedOffscreenScopes = [captureCapacity]int32
  let capturedOffscreenDrops = [captureCapacity]int32
  let capturedOffscreenMatched = [captureCapacity]bool
  var capturedEffectsCount int32 = 0
  var capturedOffscreenCount int32 = 0
  var captureOverflow bool = false
  var collectTimestamp bool = false
  var measurementStartFrame uint64 = 0uL
  var measurementEndFrame uint64 = 0uL
  var beforeCounters VulkanDiagnosticCounterSnapshot{}
  var finalCounters VulkanDiagnosticCounterSnapshot{}
  let capturedError = StringWriter()
  let originalError = Console.Error
  var window Window? = nil
  try {
    let opened = Window{
      Title: "Goo Retained performance stage timestamps",
      Width: scenario.Width,
      Height: scenario.Height,
      VSync: false,
      Root: scenario.Root,
    }
    window = opened
    Console.SetError(capturedError)
    opened.Open()
    WindowReadbackTestFixture.SetAllTimestampSink(opened,
      func(snapshot VulkanDiagnosticTimestampSnapshot) {
        if !collectTimestamp || snapshot.frame <= measurementStartFrame
          || (measurementEndFrame != 0uL
              && snapshot.frame > measurementEndFrame) {
                return
              }
        if snapshot.stage == VulkanDiagnosticTimestampStage.Effects {
          if capturedEffectsCount >= capturedEffectsFrames.Length {
            captureOverflow = true
            return
          }
          capturedEffectsFrames[capturedEffectsCount] = snapshot.frame
          capturedEffectsTicks[capturedEffectsCount] = snapshot.elapsedTicks
          capturedEffectsNanoseconds[capturedEffectsCount] =
          int64(snapshot.elapsedNanoseconds)
          capturedEffectsScopes[capturedEffectsCount] = snapshot.scopeCount
          capturedEffectsDrops[capturedEffectsCount] =
          snapshot.droppedScopeCount
          capturedEffectsCount = capturedEffectsCount + 1
        } else if snapshot.stage == VulkanDiagnosticTimestampStage.Offscreen {
          if capturedOffscreenCount >= capturedOffscreenFrames.Length {
            captureOverflow = true
            return
          }
          capturedOffscreenFrames[capturedOffscreenCount] = snapshot.frame
          capturedOffscreenTicks[capturedOffscreenCount] = snapshot.elapsedTicks
          capturedOffscreenNanoseconds[capturedOffscreenCount] =
          int64(snapshot.elapsedNanoseconds)
          capturedOffscreenScopes[capturedOffscreenCount] = snapshot.scopeCount
          capturedOffscreenDrops[capturedOffscreenCount] =
          snapshot.droppedScopeCount
          capturedOffscreenCount = capturedOffscreenCount + 1
        }
      })
    scenario.AdvanceForWindow(0, opened)
    WindowReadbackTestFixture.ForceRender(opened, 0.0, 30.0)
    Require(WindowReadbackTestFixture.CellMounted(scenario),
      "Retained performance stage timestamp scenario root is not mounted")
    var settlementIndex int32 = 0
    while settlementIndex < scenario.InitialSettlementFrames {
      WindowReadbackTestFixture.PumpNativeEvents()
      WindowReadbackTestFixture.ForceRender(opened, 0.0166666666666667)
      settlementIndex = settlementIndex + 1
    }
    Require(WindowReadbackTestFixture.TimestampSupported(opened),
      "Retained performance stage timestamps are unsupported")
    var warmIndex int32 = 0
    while warmIndex < warmup {
      WindowReadbackTestFixture.PumpNativeEvents()
      WindowReadbackTestFixture.ForceRender(opened, 0.0166666666666667)
      warmIndex = warmIndex + 1
    }
    measurementStartFrame = WindowReadbackTestFixture.DiagnosticFrameId(opened)
    beforeCounters = WindowReadbackTestFixture.DiagnosticCounters(opened)
    collectTimestamp = true
    var sampleIndex int32 = 0
    while sampleIndex < samples {
      WindowReadbackTestFixture.PumpNativeEvents()
      let countersBefore = WindowReadbackTestFixture.DiagnosticCounters(opened)
      let primitiveBefore = WindowReadbackTestFixture.PrimitiveFrameRetention(opened)
      let textBefore = WindowReadbackTestFixture.TextFrameRetention(opened)
      let submissionsBefore = countersBefore.submitCount
      let presentsBefore = countersBefore.presentCount
      var counters = countersBefore
      var submitAttempt int32 = 0
      while counters.submitCount == submissionsBefore && submitAttempt < 1000 {
        WindowReadbackTestFixture.ForceRenderNonblocking(
          opened, submitAttempt == 0 ? 0.0166666666666667 : 0.0)
        WindowReadbackTestFixture.DrainWindowQueue(opened, 2000)
        counters = WindowReadbackTestFixture.DiagnosticCounters(opened)
        if counters.submitCount == submissionsBefore {
          WindowReadbackTestFixture.PumpNativeEvents()
        }
        submitAttempt = submitAttempt + 1
      }
      Require(counters.submitCount == submissionsBefore + 1uL,
        "Retained performance stage timestamp frame did not submit exactly once")
      Require(counters.presentCount == presentsBefore + 1uL,
        "Retained performance stage timestamp frame did not present exactly once")
      let primitive = WindowReadbackTestFixture.PrimitiveFrameRetention(opened)
      let text = WindowReadbackTestFixture.TextFrameRetention(opened)
      let objectAllocationDelta = PerformanceDelta(
        counters.vulkanObjectAllocationCount,
        countersBefore.vulkanObjectAllocationCount)
      if objectAllocationDelta != 0uL {
        originalError.Write(capturedError.ToString())
        Require(false,
          "Retained performance stage timestamp frame created a Vulkan object at sample "
          +sampleIndex.ToString() + ": allocation_delta="
          +objectAllocationDelta.ToString() + " live_before="
          +countersBefore.vulkanObjectCount.ToString() + " live_after="
          +counters.vulkanObjectCount.ToString() + " device_memory_allocation_delta="
          +PerformanceDelta(counters.vulkanDeviceMemoryAllocationCount,
            countersBefore.vulkanDeviceMemoryAllocationCount).ToString()
          +" layer_create_delta="
          +PerformanceDelta(counters.layerPoolCreateCount,
            countersBefore.layerPoolCreateCount).ToString() + " layer_reuse_delta="
          +PerformanceDelta(counters.layerPoolReuseCount,
            countersBefore.layerPoolReuseCount).ToString() + " layer_resident_before="
          +countersBefore.layerPoolResidentBytes.ToString() + " layer_resident_after="
          +counters.layerPoolResidentBytes.ToString() + " layer_targets_before="
          +countersBefore.layerPoolTargetCount.ToString() + " layer_targets_after="
          +counters.layerPoolTargetCount.ToString() + " layer_leased_before="
          +countersBefore.layerPoolLeasedCount.ToString() + " layer_leased_after="
          +counters.layerPoolLeasedCount.ToString() + " clip_generation_before="
          +countersBefore.clipFrameBufferGeneration.ToString()
          +" clip_generation_after=" + counters.clipFrameBufferGeneration.ToString()
          +" clip_capacity_before=" + countersBefore.clipFrameCapacity.ToString()
          +" clip_capacity_after=" + counters.clipFrameCapacity.ToString()
          +" primitive_slot=" + primitive.SlotIndex.ToString()
          +" primitive_generation_before=" + primitiveBefore.BufferGeneration.ToString()
          +" primitive_generation_after=" + primitive.BufferGeneration.ToString()
          +" primitive_capacity_before=" + primitiveBefore.Capacity.ToString()
          +" primitive_capacity_after=" + primitive.Capacity.ToString()
          +" primitive_last_use_before=" + primitiveBefore.LastUseSerial.ToString()
          +" primitive_last_use_after=" + primitive.LastUseSerial.ToString()
          +" text_slot=" + text.SlotIndex.ToString() + " text_generation_before="
          +textBefore.BufferGeneration.ToString() + " text_generation_after="
          +text.BufferGeneration.ToString() + " text_capacity_before="
          +textBefore.Capacity.ToString() + " text_capacity_after="
          +text.Capacity.ToString() + " text_last_use_before="
          +textBefore.LastUseSerial.ToString() + " text_last_use_after="
          +text.LastUseSerial.ToString())
      }
      Require(PerformanceDelta(counters.vulkanDeviceMemoryAllocationCount,
        countersBefore.vulkanDeviceMemoryAllocationCount) == 0uL,
        "Retained performance stage timestamp frame allocated Vulkan device memory")
      expectedFrames[sampleIndex] =
      WindowReadbackTestFixture.DiagnosticFrameId(opened)
      if sampleIndex > 0 {
        Require(expectedFrames[sampleIndex] > expectedFrames[sampleIndex - 1],
          "Retained performance stage timestamp completed-frame ids are not strictly ordered")
      }
      sampleIndex = sampleIndex + 1
    }
    measurementEndFrame = WindowReadbackTestFixture.DiagnosticFrameId(opened)
    var resolveIndex int32 = 0
    while resolveIndex < 8
      && (capturedEffectsCount < samples
          || capturedOffscreenCount < samples) {
            WindowReadbackTestFixture.PumpNativeEvents()
            WindowReadbackTestFixture.ForceRender(opened, 0.0166666666666667)
            resolveIndex = resolveIndex + 1
          }
    collectTimestamp = false
    WindowReadbackTestFixture.SetAllTimestampSink(opened, nil)
    Require(!captureOverflow,
      "Retained performance stage timestamp capture buffer overflowed")
    Require(capturedEffectsCount == samples
        && capturedOffscreenCount == samples,
      "Retained performance stage timestamp did not resolve every measured stage sample")
    var matchedIndex int32 = 0
    while matchedIndex < samples {
      var effectsMatches int32 = 0
      var offscreenMatches int32 = 0
      var capturedIndex int32 = 0
      while capturedIndex < capturedEffectsCount {
        if !capturedEffectsMatched[capturedIndex]
          && capturedEffectsFrames[capturedIndex] == expectedFrames[matchedIndex]{
            Require(capturedEffectsTicks[capturedIndex] > 0uL
                && capturedEffectsNanoseconds[capturedIndex] > 0L
                && capturedEffectsScopes[capturedIndex] == EffectsScopeCount
                && capturedEffectsDrops[capturedIndex] == 0,
              "Retained performance stage timestamp Effects aggregate is invalid at frame "
              +expectedFrames[matchedIndex].ToString())
            effectsSamples[matchedIndex] =
            capturedEffectsNanoseconds[capturedIndex]
            capturedEffectsMatched[capturedIndex] = true
            effectsMatches = effectsMatches + 1
          }
        capturedIndex = capturedIndex + 1
      }
      capturedIndex = 0
      while capturedIndex < capturedOffscreenCount {
        if !capturedOffscreenMatched[capturedIndex]
          && capturedOffscreenFrames[capturedIndex]
        == expectedFrames[matchedIndex]{
          Require(capturedOffscreenTicks[capturedIndex] > 0uL
              && capturedOffscreenNanoseconds[capturedIndex] > 0L
              && capturedOffscreenScopes[capturedIndex] == OffscreenScopeCount
              && capturedOffscreenDrops[capturedIndex] == 0,
            "Retained performance stage timestamp Offscreen aggregate is invalid at frame "
            +expectedFrames[matchedIndex].ToString())
          offscreenSamples[matchedIndex] =
          capturedOffscreenNanoseconds[capturedIndex]
          capturedOffscreenMatched[capturedIndex] = true
          offscreenMatches = offscreenMatches + 1
        }
        capturedIndex = capturedIndex + 1
      }
      Require(effectsMatches == 1 && offscreenMatches == 1,
        "Retained performance stage timestamp frame did not match exactly once at frame "
        +expectedFrames[matchedIndex].ToString())
      matchedIndex = matchedIndex + 1
    }
    finalCounters = WindowReadbackTestFixture.DiagnosticCounters(opened)
    Require(PerformanceDelta(finalCounters.vulkanObjectAllocationCount,
      beforeCounters.vulkanObjectAllocationCount) == 0uL,
      "Retained performance stage timestamp warm frames created a Vulkan object")
    Require(PerformanceDelta(finalCounters.vulkanDeviceMemoryAllocationCount,
      beforeCounters.vulkanDeviceMemoryAllocationCount) == 0uL,
      "Retained performance stage timestamp warm frames allocated Vulkan device memory")
    Require(scenario.Invariant(),
      "Retained performance stage timestamp scenario invariant failed")
    opened.RequestClose()
    WindowReadbackTestFixture.ForceRender(opened, 0.0)
    Require(!opened.IsOpen,
      "Retained performance stage timestamp gate window did not close")
  } finally {
    collectTimestamp = false
    try {
      if let active = window {
        WindowReadbackTestFixture.SetAllTimestampSink(active, nil)
        if active.IsOpen {
          active.RequestClose()
          WindowReadbackTestFixture.ForceRender(active, 0.0)
        }
      }
    } finally {
      try {
        scenario.DisposeOwnedResources()
      } finally {
        Console.SetError(originalError)
      }
    }
  }
  let diagnostics = capturedError.ToString()
  ReadbackValidateCommonDiagnostics(diagnostics)
  let effects = PerformanceGpuStats(effectsSamples, samples)
  let offscreen = PerformanceGpuStats(offscreenSamples, samples)
  let warmObjectAllocations = PerformanceDelta(
    finalCounters.vulkanObjectAllocationCount,
    beforeCounters.vulkanObjectAllocationCount)
  let warmDeviceMemoryAllocations = PerformanceDelta(
    finalCounters.vulkanDeviceMemoryAllocationCount,
    beforeCounters.vulkanDeviceMemoryAllocationCount)
  Console.WriteLine("performance-stage-timestamp: workload=image-effects"
    +" seed=" + scenario.Seed.ToString()
    +" warmup=" + warmup.ToString()
    +" samples=" + samples.ToString()
    +" effects_p50_ns=" + effects.P50.ToString()
    +" effects_p95_ns=" + effects.P95.ToString()
    +" effects_p99_ns=" + effects.P99.ToString()
    +" effects_worst_ns=" + effects.Worst.ToString()
    +" effects_scope_count=" + EffectsScopeCount.ToString()
    +" effects_dropped_scope_count=0"
    +" offscreen_p50_ns=" + offscreen.P50.ToString()
    +" offscreen_p95_ns=" + offscreen.P95.ToString()
    +" offscreen_p99_ns=" + offscreen.P99.ToString()
    +" offscreen_worst_ns=" + offscreen.Worst.ToString()
    +" offscreen_scope_count=" + OffscreenScopeCount.ToString()
    +" offscreen_dropped_scope_count=0"
    +" exact_completed_frames=1"
    +" timestamp_supported=1"
    +" validation_clean=1"
    +" warm_vk_object_alloc_delta=" + warmObjectAllocations.ToString()
    +" warm_vk_device_memory_alloc_delta="
    +warmDeviceMemoryAllocations.ToString()
    +" close=1")
}
