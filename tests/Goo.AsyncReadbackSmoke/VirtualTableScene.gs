package GooAsyncReadbackSmoke

import Goo
import System
import System.Collections.Generic
import System.Diagnostics
import System.Globalization

data struct VirtualTableItem {
  internal var Symbol string
  internal var PreviousPrice float64
  internal var CurrentPrice float64
  internal var IsUp bool
}

class VirtualTableDataSource {
  shared {
    const DefaultTotalItems int32 = 4900
  }

  private let random Random
  private let items []VirtualTableItem
  private let columns int32
  private let rows int32
  private let totalItems int32
  private let changesPerFrame int32

  prop Items []VirtualTableItem { get -> items }
  prop Columns int32 { get -> columns }
  prop Rows int32 { get -> rows }
  prop TotalItems int32 { get -> totalItems }
  prop ChangesPerFrame int32 { get -> changesPerFrame }

  init(totalItems int32) {
    random = Random(42)
    this.totalItems = totalItems
    columns = int32(Math.Ceiling(Math.Sqrt(float64(totalItems))))
    rows = (totalItems + columns - 1) / columns
    let tenth = totalItems / 10
    changesPerFrame = tenth > 0 ? tenth : 1
    items = [totalItems]VirtualTableItem
    var index int32 = 0
    while index < totalItems {
      let row = index / columns
      let column = index % columns
      let symbol = Convert.ToChar(65 + row % 26).ToString()
      +Convert.ToChar(65 + column / 3 % 26).ToString()
      +Convert.ToChar(65 + column % 26).ToString()
      let price = Math.Round(10.0 + random.NextDouble() * 990.0, 2)
      items[index] = VirtualTableItem{
        Symbol: symbol,
        PreviousPrice: price,
        CurrentPrice: price,
        IsUp: true,
      }
      index = index + 1
    }
  }

  func Update(root VirtualTableRootCell) int32 {
    let changed = List[int32](changesPerFrame)
    var index int32 = 0
    while index < changesPerFrame {
      let itemIndex = random.Next(totalItems)
      let item = items[itemIndex]
      let delta = ((random.NextDouble() - 0.48) * 2.0) * item.CurrentPrice * 0.02
      let price = Math.Max(0.01, Math.Round(item.CurrentPrice + delta, 2))
      items[itemIndex] = VirtualTableItem{
        Symbol: item.Symbol,
        PreviousPrice: item.CurrentPrice,
        CurrentPrice: price,
        IsUp: price >= item.CurrentPrice,
      }
      changed.Add(itemIndex)
      index = index + 1
    }
    index = 0
    while index < changed.Count {
      let itemIndex = changed[index]
      root.Apply(itemIndex, items[itemIndex])
      index = index + 1
    }
    return changed.Count
  }
  func MutateAt(root VirtualTableRootCell, index int32) VirtualTableItem {
    if index < 0 || index >= totalItems {
      throw InvalidOperationException("Retained StocksGrid mutation index is outside the model")
    }
    let item = items[index]
    let price = Math.Max(0.01, Math.Round(item.CurrentPrice + 1.0, 2))
    items[index] = VirtualTableItem{
      Symbol: item.Symbol,
      PreviousPrice: item.CurrentPrice,
      CurrentPrice: price,
      IsUp: price >= item.CurrentPrice,
    }
    root.Apply(index, items[index])
    return items[index]
  }
}

data struct VirtualTableCellInput {
  internal var Slot int32
  internal var Active bool
  internal var Index int32
  internal var Item VirtualTableItem
  internal var ExplicitClip bool
  internal var Root VirtualTableRootCell
}

class VirtualTableRootCell : Cell {
  shared {
    const CellWidth float64 = 64.0
    const CellHeight float64 = 18.0
  }

  private let items []VirtualTableItem
  private let columns int32
  private let rows int32
  private let treeMode string
  private let virtualized bool
  private let explicitClip bool
  private let overscan int32
  private var viewportWidth float64
  private var viewportHeight float64
  private var scrollX float64
  private var scrollY float64
  private var poolRows int32
  private var poolColumns int32
  private var poolCapacity int32
  private var mountedCellCount int32
  private var peakMountedCellCount int32
  private var slotReassignmentCount int64
  private var visibleMutationCount int64
  private var offscreenMutationSuppressionCount int64
  private var staleSlotRejectionCount int64
  private var cellBuildCount int64
  private var poolCapacityGrowthCount int32
  private var visibleItemCount int32
  private var activeFirstRow int32
  private var activeLastRow int32
  private var activeFirstColumn int32
  private var activeLastColumn int32
  private var logicalToSlot []int32
  private var nextLogicalToSlot []int32
  private var slotToLogical []int32
  private var previousSlotToLogical []int32
  private var slotKeys []string
  private var slotCells []VirtualTableCell?

  prop MountedCellCount int32 { get -> mountedCellCount }
  prop PeakMountedCellCount int32 { get -> peakMountedCellCount }
  prop Columns int32 { get -> columns }
  prop Rows int32 { get -> rows }
  prop TreeMode string { get -> treeMode }
  prop Overscan int32 { get -> overscan }
  prop ViewportWidth float64 { get -> viewportWidth }
  prop ViewportHeight float64 { get -> viewportHeight }
  prop ScrollX float64 { get -> scrollX }
  prop ScrollY float64 { get -> scrollY }
  prop VisibleItemCount int32 { get -> visibleItemCount }
  prop ActiveFirstRow int32 { get -> activeFirstRow }
  prop ActiveLastRow int32 { get -> activeLastRow }
  prop ActiveFirstColumn int32 { get -> activeFirstColumn }
  prop ActiveLastColumn int32 { get -> activeLastColumn }
  prop PoolRows int32 { get -> poolRows }
  prop PoolColumns int32 { get -> poolColumns }
  prop PoolCapacity int32 { get -> poolCapacity }
  prop PoolCapacityGrowthCount int32 { get -> poolCapacityGrowthCount }
  prop SlotReassignmentCount int64 { get -> slotReassignmentCount }
  prop VisibleMutationCount int64 { get -> visibleMutationCount }
  prop OffscreenMutationSuppressionCount int64 { get -> offscreenMutationSuppressionCount }
  prop StaleSlotRejectionCount int64 { get -> staleSlotRejectionCount }
  prop CellBuildCount int64 { get -> cellBuildCount }

  init(initialItems []VirtualTableItem, columns int32, rows int32,
    treeMode string, viewportWidth float64, viewportHeight float64,
    overscan int32, explicitClip bool) {
      items = initialItems
      this.columns = columns
      this.rows = rows
      this.treeMode = treeMode
      virtualized = treeMode == "virtualized"
      this.viewportWidth = viewportWidth
      this.viewportHeight = viewportHeight
      this.overscan = overscan
      this.explicitClip = explicitClip
      logicalToSlot = [initialItems.Length]int32
      nextLogicalToSlot = [initialItems.Length]int32
      var logicalIndex int32 = 0
      while logicalIndex < initialItems.Length {
        logicalToSlot[logicalIndex] = -1
        nextLogicalToSlot[logicalIndex] = -1
        logicalIndex = logicalIndex + 1
      }
      slotToLogical = [0]int32
      previousSlotToLogical = [0]int32
      slotKeys = [0]string
      slotCells = [0]VirtualTableCell?
      if virtualized {
        EnsureVirtualPoolCapacity()
        RecomputeVirtualRange()
      } else {
        poolRows = rows
        poolColumns = columns
        poolCapacity = initialItems.Length
        slotToLogical = [poolCapacity]int32
        previousSlotToLogical = [poolCapacity]int32
        var previousSlot int32 = 0
        while previousSlot < poolCapacity {
          previousSlotToLogical[previousSlot] = -1
          previousSlot = previousSlot + 1
        }
        slotCells = [poolCapacity]VirtualTableCell?
        var slot int32 = 0
        while slot < poolCapacity {
          slotToLogical[slot] = slot
          logicalToSlot[slot] = slot
          slot = slot + 1
        }
        let visible = VisibleRange()
        activeFirstRow = visible[0]
        activeLastRow = visible[1] - 1
        activeFirstColumn = visible[2]
        activeLastColumn = visible[3] - 1
        visibleItemCount = CountRange(visible[0], visible[1], visible[2], visible[3])
      }
    }

  func RecordCellBuild() {
    cellBuildCount = cellBuildCount + 1L
  }

  func Bind(slot int32, cell VirtualTableCell) {
    if slot < 0 || slot >= slotCells.Length {
      throw InvalidOperationException("Retained StocksGrid slot is outside the physical pool")
    }
    if slotCells[slot] == nil {
      slotCells[slot] = cell
      mountedCellCount = mountedCellCount + 1
      if mountedCellCount > peakMountedCellCount {
        peakMountedCellCount = mountedCellCount
      }
    } else if !Object.ReferenceEquals(slotCells[slot], cell) {
      throw InvalidOperationException("Retained StocksGrid physical slot changed Cell identity")
    }
  }

  func Apply(index int32, item VirtualTableItem) {
    if index < 0 || index >= items.Length {
      throw InvalidOperationException("Retained StocksGrid logical index is outside the model")
    }
    let slot = logicalToSlot[index]
    if slot < 0 {
      offscreenMutationSuppressionCount = offscreenMutationSuppressionCount + 1L
      return
    }
    TryApplySlot(slot, index, item)
  }

  func TryApplySlot(slot int32, index int32, item VirtualTableItem) bool {
    if slot < 0 || slot >= slotToLogical.Length || slotToLogical[slot] != index
      || index < 0 || index >= logicalToSlot.Length || logicalToSlot[index] != slot{
        staleSlotRejectionCount = staleSlotRejectionCount + 1L
        return false
      }
    guard let cell = slotCells[slot] else {
      staleSlotRejectionCount = staleSlotRejectionCount + 1L
      return false
    }
    if !cell.Apply(slot, index, item) {
      staleSlotRejectionCount = staleSlotRejectionCount + 1L
      return false
    }
    visibleMutationCount = visibleMutationCount + 1L
    return true
  }

  func ScrollTo(x float64, y float64) {
    let maxX = Math.Max(0.0, float64(columns) * CellWidth - viewportWidth)
    let maxY = Math.Max(0.0, float64(rows) * CellHeight - viewportHeight)
    scrollX = Math.Max(0.0, Math.Min(maxX, x))
    scrollY = Math.Max(0.0, Math.Min(maxY, y))
    if virtualized {
      RecomputeVirtualRange()
    }
    Rebuild()
  }

  func SetViewport(width float64, height float64) {
    if width <= 0.0 || height <= 0.0 {
      throw InvalidOperationException("Retained StocksGrid viewport dimensions must be positive")
    }
    viewportWidth = width
    viewportHeight = height
    let maxX = Math.Max(0.0, float64(columns) * CellWidth - viewportWidth)
    let maxY = Math.Max(0.0, float64(rows) * CellHeight - viewportHeight)
    scrollX = Math.Max(0.0, Math.Min(maxX, scrollX))
    scrollY = Math.Max(0.0, Math.Min(maxY, scrollY))
    if virtualized {
      EnsureVirtualPoolCapacity()
      RecomputeVirtualRange()
    }
    Rebuild()
  }

  func AssertVirtualState() {
    if !virtualized {
      return
    }
    let active = [items.Length]bool
    var slot int32 = 0
    while slot < slotToLogical.Length {
      let logical = slotToLogical[slot]
      if logical >= 0 {
        if logical >= items.Length || active[logical]
          || logicalToSlot[logical] != slot{
            throw InvalidOperationException("Retained StocksGrid virtual mapping is not unique")
          }
        active[logical] = true
        let row = logical / columns
        let column = logical % columns
        if row < activeFirstRow || row > activeLastRow
          || column < activeFirstColumn || column > activeLastColumn{
            throw InvalidOperationException("Retained StocksGrid virtual mapping exceeds active range")
          }
      }
      slot = slot + 1
    }
    var row = activeFirstRow
    while row <= activeLastRow {
      var column = activeFirstColumn
      while column <= activeLastColumn {
        let logical = row * columns + column
        if logical < items.Length && logicalToSlot[logical] < 0 {
          throw InvalidOperationException("Retained StocksGrid visible logical cell is not mounted")
        }
        column = column + 1
      }
      row = row + 1
    }
  }
  func SlotForLogical(index int32) int32 -> if index < 0 || index >= logicalToSlot.Length { -1 } else { logicalToSlot[index] }

  func LogicalForSlot(slot int32) int32 -> if slot < 0 || slot >= slotToLogical.Length { -1 } else { slotToLogical[slot] }

  override func Build() Blob {
    let canvas = Container{
      Width: float64(columns) * CellWidth,
      Height: float64(rows) * CellHeight,
      Position: PositionType.Absolute,
      Left: -scrollX,
      Top: -scrollY,
    }
    if virtualized {
      var slot int32 = 0
      while slot < poolCapacity {
        let logical = slotToLogical[slot]
        let input = if logical >= 0 {
          VirtualTableCellInput{
            Slot: slot,
            Active: true,
            Index: logical,
            Item: items[logical],
            ExplicitClip: explicitClip,
            Root: this,
          }
        } else {
          VirtualTableCellInput{
            Slot: slot,
            Active: false,
            Index: -1,
            Item: VirtualTableItem{},
            ExplicitClip: explicitClip,
            Root: this,
          }
        }
        canvas.Children.Add(Cell.Mount[VirtualTableCellInput, VirtualTableCell](slotKeys[slot], input))
        slot = slot + 1
      }
    } else {
      var logical int32 = 0
      while logical < items.Length {
        canvas.Children.Add(Cell.Mount[VirtualTableCellInput, VirtualTableCell](nil,
          VirtualTableCellInput{
            Slot: logical,
            Active: true,
            Index: logical,
            Item: items[logical],
            ExplicitClip: explicitClip,
            Root: this,
          }))
        logical = logical + 1
      }
    }
    return Container() {.Width: viewportWidth,.Height: viewportHeight,.Position: PositionType.Relative,.OverflowX: Overflow.Hidden,.OverflowY: Overflow.Hidden,
      canvas,
    }
  }

  private func EnsureVirtualPoolCapacity() {
    let requiredColumns = int32(Math.Ceiling(viewportWidth / CellWidth))
    +1 + overscan * 2
    let requiredRows = int32(Math.Ceiling(viewportHeight / CellHeight))
    +1 + overscan * 2
    let requestedColumns = Math.Min(columns, requiredColumns)
    let requestedRows = Math.Min(rows, requiredRows)
    let nextColumns = Math.Max(poolColumns, requestedColumns)
    let nextRows = Math.Max(poolRows, requestedRows)
    if nextColumns <= poolColumns && nextRows <= poolRows {
      return
    }
    let oldCapacity = poolCapacity
    let nextCapacity = nextColumns * nextRows
    let nextSlots = [nextCapacity]int32
    let nextPrevious = [nextCapacity]int32
    let nextCells = [nextCapacity]VirtualTableCell?
    let nextKeys = [nextCapacity]string
    var slot int32 = 0
    while slot < nextCapacity {
      nextPrevious[slot] = if slot < oldCapacity { previousSlotToLogical[slot] } else { -1 }
      nextSlots[slot] = if slot < oldCapacity { slotToLogical[slot] } else { -1 }
      nextCells[slot] = if slot < oldCapacity { slotCells[slot] } else { nil }
      nextKeys[slot] = if slot < oldCapacity {
        slotKeys[slot]
      } else {
        "retained-slot-" + slot.ToString()
      }
      slot = slot + 1
    }
    poolColumns = nextColumns
    poolRows = nextRows
    poolCapacity = nextCapacity
    slotToLogical = nextSlots
    previousSlotToLogical = nextPrevious
    slotCells = nextCells
    slotKeys = nextKeys
    poolCapacityGrowthCount = poolCapacityGrowthCount + 1
  }

  private func VisibleRange() []int32 {
    let firstColumn = ClampIndex(int32(Math.Floor(scrollX / CellWidth)), columns)
    let lastColumn = ClampExclusive(int32(Math.Ceiling((scrollX + viewportWidth) / CellWidth)), columns)
    let firstRow = ClampIndex(int32(Math.Floor(scrollY / CellHeight)), rows)
    let lastRow = ClampExclusive(int32(Math.Ceiling((scrollY + viewportHeight) / CellHeight)), rows)
    return []int32{ firstRow, lastRow, firstColumn, lastColumn }
  }

  private func RecomputeVirtualRange() {
    var firstColumn = int32(Math.Floor(scrollX / CellWidth)) - overscan
    var lastColumn = int32(Math.Ceiling((scrollX + viewportWidth) / CellWidth)) + overscan
    var firstRow = int32(Math.Floor(scrollY / CellHeight)) - overscan
    var lastRow = int32(Math.Ceiling((scrollY + viewportHeight) / CellHeight)) + overscan
    if firstColumn < 0 { firstColumn = 0 }
    if firstRow < 0 { firstRow = 0 }
    if lastColumn > columns { lastColumn = columns }
    if lastRow > rows { lastRow = rows }
    let visible = VisibleRange()
    activeFirstRow = firstRow
    activeLastRow = lastRow - 1
    activeFirstColumn = firstColumn
    activeLastColumn = lastColumn - 1
    visibleItemCount = CountRange(visible[0], visible[1], visible[2], visible[3])
    var logical int32 = 0
    while logical < nextLogicalToSlot.Length {
      nextLogicalToSlot[logical] = -1
      logical = logical + 1
    }
    var slot int32 = 0
    while slot < slotToLogical.Length {
      previousSlotToLogical[slot] = slotToLogical[slot]
      slotToLogical[slot] = -1
      slot = slot + 1
    }
    var row int32 = firstRow
    while row < lastRow {
      var column int32 = firstColumn
      while column < lastColumn {
        let logicalIndex = row * columns + column
        if logicalIndex < items.Length {
          let slotRow = row % poolRows
          let slotColumn = column % poolColumns
          let mappedSlot = slotRow * poolColumns + slotColumn
          if slotToLogical[mappedSlot] >= 0 {
            throw InvalidOperationException("Retained StocksGrid ring mapping collided")
          }
          slotToLogical[mappedSlot] = logicalIndex
          nextLogicalToSlot[logicalIndex] = mappedSlot
        }
        column = column + 1
      }
      row = row + 1
    }
    slot = 0
    while slot < slotToLogical.Length {
      if previousSlotToLogical[slot] >= 0
        && previousSlotToLogical[slot] != slotToLogical[slot]{
          slotReassignmentCount = slotReassignmentCount + 1L
        }
      slot = slot + 1
    }
    let previous = logicalToSlot
    logicalToSlot = nextLogicalToSlot
    nextLogicalToSlot = previous
  }

  private func CountRange(firstRow int32, lastRow int32,
    firstColumn int32, lastColumn int32) int32{
      var count int32 = 0
      var row int32 = firstRow
      while row < lastRow {
        var column int32 = firstColumn
        while column < lastColumn {
          if row * columns + column < items.Length {
            count = count + 1
          }
          column = column + 1
        }
        row = row + 1
      }
      return count
    }

  private func ClampIndex(value int32, limit int32) int32 {
    if value < 0 { return 0 }
    return if value >= limit { limit - 1 } else { value }
  }

  private func ClampExclusive(value int32, limit int32) int32 {
    if value < 1 { return 1 }
    return if value > limit { limit } else { value }
  }
}

open class VirtualTableCell : Cell[VirtualTableCellInput] {
  private var boundSlot int32
  private var boundLogical int32
  private var boundActive bool
  private var current VirtualTableItem
  private var hasCurrent bool

  init() {
    boundSlot = -1
    boundLogical = -1
  }

  func Apply(slot int32, index int32, item VirtualTableItem) bool {
    if !boundActive || boundSlot != slot || boundLogical != index {
      return false
    }
    current = item
    hasCurrent = true
    Rebuild()
    return true
  }

  protected override func Build(input VirtualTableCellInput) Blob {
    let identityChanged = boundSlot != input.Slot
      || boundLogical != input.Index || boundActive != input.Active
    if identityChanged {
      hasCurrent = false
    }
    boundSlot = input.Slot
    boundLogical = input.Index
    boundActive = input.Active
    input.Root.Bind(input.Slot, this)
    input.Root.RecordCellBuild()
    if !input.Active {
      return Container{}
    }
    let item = hasCurrent ? current : input.Item
    current = item
    hasCurrent = false
    let row = input.Index / input.Root.Columns
    let column = input.Index % input.Root.Columns
    return VirtualTableText(item, column, row, input.ExplicitClip)
  }
}
func VirtualTableText(item VirtualTableItem, column int32, row int32,
  explicitClip bool) Blob{
    if explicitClip {
      return Text{
        Content: item.Symbol + " "
        +item.CurrentPrice.ToString("F2", CultureInfo.InvariantCulture),
        Position: PositionType.Absolute,
        Left: float64(column) * VirtualTableRootCell.CellWidth,
        Top: float64(row) * VirtualTableRootCell.CellHeight,
        Width: VirtualTableRootCell.CellWidth,
        Height: VirtualTableRootCell.CellHeight,
        PaddingLeft: 2.0,
        PaddingTop: 1.0,
        PaddingRight: 2.0,
        PaddingBottom: 1.0,
        FontSize: 8.0,
        TextWrap: TextWrap.NoWrap,
        TextTrimming: TextTrimming.Ellipsis,
        OverflowX: Overflow.Hidden,
        OverflowY: Overflow.Hidden,
        Color: item.IsUp ? Color.Rgb(0, 128, 0) : Color.Rgb(255, 0, 0),
      }
    }
    return Text{
      Content: item.Symbol + " "
      +item.CurrentPrice.ToString("F2", CultureInfo.InvariantCulture),
      Position: PositionType.Absolute,
      Left: float64(column) * VirtualTableRootCell.CellWidth,
      Top: float64(row) * VirtualTableRootCell.CellHeight,
      Width: VirtualTableRootCell.CellWidth,
      Height: VirtualTableRootCell.CellHeight,
      PaddingLeft: 2.0,
      PaddingTop: 1.0,
      PaddingRight: 2.0,
      PaddingBottom: 1.0,
      FontSize: 8.0,
      TextWrap: TextWrap.NoWrap,
      TextTrimming: TextTrimming.Ellipsis,
      Color: item.IsUp ? Color.Rgb(0, 128, 0) : Color.Rgb(255, 0, 0),
    }
  }

