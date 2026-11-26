package Goo

import System
import System.Collections.Generic

/// Selects how a Grid track determines its size.
public enum GridUnit {
  /// Sizes the track to fit its content between Minimum and Maximum.
  Auto;
  /// Reserves a fixed size in layout units, clamped to Minimum and Maximum.
  Fixed;
  /// Allocates a proportional share of remaining space above Minimum up to Maximum.
  Fraction;
  /// Sizes the track to the minimum intrinsic content size of its items.
  MinContent;
  /// Sizes the track to the maximum intrinsic content size of its items.
  MaxContent
}

/// Selects the primary auto-placement direction for Grid items without explicit coordinates.
public enum GridFlow {
  /// Places items left-to-right across each row before advancing to the next row.
  Row;
  /// Places items top-to-bottom down each column before advancing to the next column.
  Column
}

/// Defines a single row or column track in a Grid layout.
public data struct GridTrack {
  /// Gets or sets the track sizing rule. Defaults to Auto.
  public prop Unit GridUnit { get; init }
  /// Gets or sets the fixed size in layout units or the positive fractional weight.
  public prop Value float64 { get; init }
  /// Gets or sets the minimum track size in layout units. Defaults to zero.
  public prop Minimum float64 { get; init }
  /// Gets or sets the optional maximum track size in layout units. Nil means unbounded.
  public prop Maximum float64? { get; init }

  internal func Validate(paramName string) {
    if !Enum.IsDefined(Unit) { throw ArgumentOutOfRangeException(paramName) }
    if !Double.IsFinite(Minimum) || Minimum < 0.0 { throw ArgumentOutOfRangeException(paramName) }
    if let max = Maximum {
      if Double.IsNaN(max) || max < Minimum { throw ArgumentOutOfRangeException(paramName) }
    }
    if !Double.IsFinite(Value) || Value < 0.0 { throw ArgumentOutOfRangeException(paramName) }
    if Unit == GridUnit.Fraction && Value <= 0.0 { throw ArgumentOutOfRangeException(paramName) }
  }

  shared {
    /// Creates an Auto track that fits content within optional minimum and maximum bounds.
    /// @param minimum Minimum track size in layout units.
    /// @param maximum Optional maximum track size in layout units.
    /// @returns A configured GridTrack.
    /// @exception ArgumentOutOfRangeException Thrown when bounds are invalid.
    public func Auto(minimum float64 = 0.0, maximum float64? = nil) GridTrack {
      let track = GridTrack{ Unit: GridUnit.Auto, Minimum: minimum, Maximum: maximum }
      track.Validate("minimum")
      return track
    }

    /// Creates a Fixed-size track in layout units.
    /// @param size The fixed size in layout units.
    /// @returns A configured GridTrack.
    /// @exception ArgumentOutOfRangeException Thrown when size is negative or non-finite.
    public func Fixed(size float64) GridTrack {
      let track = GridTrack{ Unit: GridUnit.Fixed, Value: size }
      track.Validate("size")
      return track
    }

    /// Creates a fractional track that shares remaining space proportionally by weight.
    /// @param weight Positive fractional weight. Defaults to 1.
    /// @param minimum Minimum track size in layout units.
    /// @param maximum Optional maximum track size in layout units.
    /// @returns A configured GridTrack.
    /// @exception ArgumentOutOfRangeException Thrown when weight or bounds are invalid.
    public func Fr(weight float64 = 1.0, minimum float64 = 0.0, maximum float64? = nil) GridTrack {
      let track = GridTrack{ Unit: GridUnit.Fraction, Value: weight, Minimum: minimum, Maximum: maximum }
      track.Validate("weight")
      return track
    }

    /// Creates a MinContent track that sizes to its items' minimum intrinsic size.
    /// @param minimum Minimum track size in layout units.
    /// @param maximum Optional maximum track size in layout units.
    /// @returns A configured GridTrack.
    /// @exception ArgumentOutOfRangeException Thrown when bounds are invalid.
    public func MinContent(minimum float64 = 0.0, maximum float64? = nil) GridTrack {
      let track = GridTrack{ Unit: GridUnit.MinContent, Minimum: minimum, Maximum: maximum }
      track.Validate("minimum")
      return track
    }

    /// Creates a MaxContent track that sizes to its items' unconstrained content size.
    /// @param minimum Minimum track size in layout units.
    /// @param maximum Optional maximum track size in layout units.
    /// @returns A configured GridTrack.
    /// @exception ArgumentOutOfRangeException Thrown when bounds are invalid.
    public func MaxContent(minimum float64 = 0.0, maximum float64? = nil) GridTrack {
      let track = GridTrack{ Unit: GridUnit.MaxContent, Minimum: minimum, Maximum: maximum }
      track.Validate("minimum")
      return track
    }

    /// Creates an array containing count copies of the given track.
    /// @param count Nonnegative number of tracks to create.
    /// @param track The track definition to repeat.
    /// @returns An array of count GridTrack values.
    /// @exception ArgumentOutOfRangeException Thrown when count is negative or track is invalid.
    public func Repeat(count int32, track GridTrack) []GridTrack {
      if count < 0 { throw ArgumentOutOfRangeException("count") }
      track.Validate("track")
      if count == 0 { return Array.Empty[GridTrack]() }
      let result = [count]GridTrack
      for i in 0 ... count {
        result[i] = track
      }
      return result
    }
  }
}

/// Configures explicit cell placement, track spans, and per-cell alignment for a Grid child.
public data struct GridPlacement {
  /// Gets or sets the optional zero-based starting column index.
  public prop Column int32? { get; init }
  /// Gets or sets the optional zero-based starting row index.
  public prop Row int32? { get; init }
  /// Gets or sets the number of columns spanned. Nil resolves to 1.
  public prop ColumnSpan int32? { get; init }
  /// Gets or sets the number of rows spanned. Nil resolves to 1.
  public prop RowSpan int32? { get; init }
  /// Gets or sets the horizontal alignment override inside the cell, or nil to inherit Grid.HorizontalAlign.
  public prop HorizontalAlign LayoutAlign? { get; init }
  /// Gets or sets the vertical alignment override inside the cell, or nil to inherit Grid.VerticalAlign.
  public prop VerticalAlign LayoutAlign? { get; init }
}

internal struct GridResolvedItem {
  internal var ChildIndex int32
  internal var Column int32
  internal var Row int32
  internal var ColumnSpan int32
  internal var RowSpan int32
  internal var HAlign LayoutAlign
  internal var VAlign LayoutAlign
  internal var Kind int32
}

internal sealed class GridScratch {
  internal var Items []GridResolvedItem = Array.Empty[GridResolvedItem]()
  internal var Order []int32 = Array.Empty[int32]()
  internal var ColSizes []float64 = Array.Empty[float64]()
  internal var RowSizes []float64 = Array.Empty[float64]()
  internal var MinSizes []float64 = Array.Empty[float64]()
  internal var Occupied []uint64 = Array.Empty[uint64]()

  internal func EnsureItems(count int32) {
    if Items.Length < count { Items = [Math.Max(count, Items.Length * 2)]GridResolvedItem }
    if Order.Length < count { Order = [Math.Max(count, Order.Length * 2)]int32 }
  }

  internal func EnsureColSizes(count int32) {
    if ColSizes.Length < count { ColSizes = [Math.Max(count, ColSizes.Length * 2)]float64 }
  }

  internal func EnsureRowSizes(count int32) {
    if RowSizes.Length < count { RowSizes = [Math.Max(count, RowSizes.Length * 2)]float64 }
  }

  internal func EnsureMinSizes(count int32) {
    if MinSizes.Length < count { MinSizes = [Math.Max(count, MinSizes.Length * 2)]float64 }
  }

  internal func ClearOccupied(cellCount int32) {
    let words = (cellCount + 63) >> 6
    if Occupied.Length < words {
      Occupied = [Math.Max(words, Math.Max(8, Occupied.Length * 2))]uint64
    }
    Array.Clear(Occupied, 0, words)
  }

  internal func EnsureOccupied(cellCount int32, usedWords int32) int32 {
    let neededWords = (cellCount + 63) >> 6
    if Occupied.Length < neededWords {
      let next = [Math.Max(neededWords, Occupied.Length * 2)]uint64
      Array.Copy(Occupied, next, Math.Min(usedWords, Occupied.Length))
      Occupied = next
    } else if neededWords > usedWords {
      Array.Clear(Occupied, usedWords, neededWords - usedWords)
    }
    return neededWords
  }

  internal func IsOccupied(index int32) bool -> (Occupied[index >> 6] & (1uL << (index & 63))) != 0uL

  internal func SetOccupied(index int32) {
    Occupied[index >> 6] = Occupied[index >> 6] | (1uL << (index & 63))
  }
}

internal class GridScratchPool {
  shared {
    @ThreadStatic
    private var frames List[GridScratch]?
    @ThreadStatic
    private var depth int32

    internal func Acquire() GridScratch {
      frames ??= List[GridScratch](4)
      while frames!!.Count <= depth {
        frames!!.Add(GridScratch())
      }
      let frame = frames!![depth]
      depth++
      return frame
    }

    internal func Release() {
      if depth > 0 { depth-- }
    }
  }
}

/// Arranges children into a shared two-dimensional grid of columns and rows with auto-placement and spans.
public sealed class Grid : LayoutAlgorithm {
  shared {
    /// Identifies the per-child GridPlacement trait.
    public let Placement LayoutKey[GridPlacement] = LayoutKey[GridPlacement]()

    private func validateAlign(align LayoutAlign?, paramName string) {
      if let value = align {
        if !Enum.IsDefined(value) { throw ArgumentOutOfRangeException(paramName) }
      }
    }

    private func copyTracks(source IReadOnlyList[GridTrack]?, paramName string) []GridTrack {
      if source == nil || source.Count == 0 { return Array.Empty[GridTrack]() }
      let count = source.Count
      let result = [count]GridTrack
      for i in 0 ... count {
        let track = source[i]
        track.Validate(paramName)
        result[i] = track
      }
      return result
    }

    /// Attaches explicit coordinates, spans, or alignment to a child blob and returns it for fluent composition.
    /// @param child The child blob to configure.
    /// @param column Optional zero-based starting column index.
    /// @param row Optional zero-based starting row index.
    /// @param columnSpan Number of columns spanned. Must be at least 1.
    /// @param rowSpan Number of rows spanned. Must be at least 1.
    /// @param horizontal Optional horizontal alignment override within the cell.
    /// @param vertical Optional vertical alignment override within the cell.
    /// @returns The configured child blob.
    /// @exception ArgumentNullException Thrown when child is nil.
    /// @exception ArgumentOutOfRangeException Thrown when coordinates are negative, spans are less than 1, or alignments are invalid.
    public func Place(
      child Blob,
      column int32? = nil,
      row int32? = nil,
      columnSpan int32 = 1,
      rowSpan int32 = 1,
      horizontal LayoutAlign? = nil,
      vertical LayoutAlign? = nil
    ) Blob {
      if child == nil { throw ArgumentNullException("child") }
      if let c = column {
        if c < 0 { throw ArgumentOutOfRangeException("column") }
      }
      if let r = row {
        if r < 0 { throw ArgumentOutOfRangeException("row") }
      }
      if columnSpan < 1 { throw ArgumentOutOfRangeException("columnSpan") }
      if rowSpan < 1 { throw ArgumentOutOfRangeException("rowSpan") }
      validateAlign(horizontal, "horizontal")
      validateAlign(vertical, "vertical")
      return child.WithLayoutTrait(
        Placement,
        GridPlacement{
          Column: column,
          Row: row,
          ColumnSpan: columnSpan,
          RowSpan: rowSpan,
          HorizontalAlign: horizontal,
          VerticalAlign: vertical
        }
      )
    }

    /// Attaches column and row spans to an auto-placed child blob and returns it for fluent composition.
    /// @param child The child blob to configure.
    /// @param columns Number of columns spanned. Must be at least 1.
    /// @param rows Number of rows spanned. Must be at least 1.
    /// @returns The configured child blob.
    /// @exception ArgumentNullException Thrown when child is nil.
    /// @exception ArgumentOutOfRangeException Thrown when columns or rows is less than 1.
    public func Span(child Blob, columns int32 = 1, rows int32 = 1) Blob ->
      Place(child, columnSpan: columns, rowSpan: rows)

    /// Updates cell alignment on a child blob while preserving any existing Grid placement coordinates and spans.
    /// @param child The child blob to configure.
    /// @param horizontal Optional horizontal alignment override.
    /// @param vertical Optional vertical alignment override.
    /// @returns The configured child blob.
    /// @exception ArgumentNullException Thrown when child is nil.
    /// @exception ArgumentOutOfRangeException Thrown when an alignment is not a defined LayoutAlign.
    public func Align(child Blob, horizontal LayoutAlign? = nil, vertical LayoutAlign? = nil) Blob {
      if child == nil { throw ArgumentNullException("child") }
      validateAlign(horizontal, "horizontal")
      validateAlign(vertical, "vertical")
      child.TryGetLayoutTrait(Placement, out var existing)
      return child.WithLayoutTrait(
        Placement,
        existing with {
          HorizontalAlign = horizontal ?? existing.HorizontalAlign,
          VerticalAlign = vertical ?? existing.VerticalAlign
        }
      )
    }
  }

  private var columns []GridTrack = Array.Empty[GridTrack]()
  private var rows []GridTrack = Array.Empty[GridTrack]()
  private var columnsView IReadOnlyList[GridTrack] = Array.AsReadOnly(Array.Empty[GridTrack]())
  private var rowsView IReadOnlyList[GridTrack] = Array.AsReadOnly(Array.Empty[GridTrack]())
  private var autoColumns GridTrack = GridTrack.Auto()
  private var autoRows GridTrack = GridTrack.Auto()
  private var flow GridFlow = GridFlow.Row
  private var dense bool
  private var horizontalAlign LayoutAlign = LayoutAlign.Stretch
  private var verticalAlign LayoutAlign = LayoutAlign.Stretch

  /// Gets or sets the explicit column track definitions. Empty uses implicit AutoColumns tracks.
  public prop Columns IReadOnlyList[GridTrack] {
    get -> columnsView
    init {
      columns = copyTracks(value, "Columns")
      columnsView = Array.AsReadOnly(columns)
    }
  }

  /// Gets or sets the explicit row track definitions. Empty uses implicit AutoRows tracks.
  public prop Rows IReadOnlyList[GridTrack] {
    get -> rowsView
    init {
      rows = copyTracks(value, "Rows")
      rowsView = Array.AsReadOnly(rows)
    }
  }

  /// Gets or sets the sizing rule for implicitly created columns. Defaults to Auto.
  public prop AutoColumns GridTrack {
    get -> autoColumns
    init {
      value.Validate("AutoColumns")
      autoColumns = value
    }
  }

  /// Gets or sets the sizing rule for implicitly created rows. Defaults to Auto.
  public prop AutoRows GridTrack {
    get -> autoRows
    init {
      value.Validate("AutoRows")
      autoRows = value
    }
  }

  /// Gets or sets the auto-placement direction for items without explicit coordinates. Defaults to Row.
  public prop Flow GridFlow {
    get -> flow
    init {
      if !Enum.IsDefined(value) { throw ArgumentOutOfRangeException("Flow") }
      flow = value
    }
  }

  /// Gets or sets whether auto-placement backfills earlier holes left by spanning items. Defaults to false.
  public prop Dense bool {
    get -> dense
    init -> dense = value
  }

  /// Gets or sets the default horizontal cell alignment. Defaults to Stretch.
  public prop HorizontalAlign LayoutAlign {
    get -> horizontalAlign
    init {
      if !Enum.IsDefined(value) { throw ArgumentOutOfRangeException("HorizontalAlign") }
      horizontalAlign = value
    }
  }

  /// Gets or sets the default vertical cell alignment. Defaults to Stretch.
  public prop VerticalAlign LayoutAlign {
    get -> verticalAlign
    init {
      if !Enum.IsDefined(value) { throw ArgumentOutOfRangeException("VerticalAlign") }
      verticalAlign = value
    }
  }

  /// Initializes a Grid layout with a single auto-sized column flow and Stretch alignment.
  public init() { }

  private func columnTrack(index int32) GridTrack -> index < columns.Length ? columns[index] : autoColumns
  private func rowTrack(index int32) GridTrack -> index < rows.Length ? rows[index] : autoRows

  private func placeItems(
    context LayoutContext,
    scratch GridScratch,
    out itemCount int32,
    out colCount int32,
    out rowCount int32
  ) {
    let childCount = context.ChildCount
    scratch.EnsureItems(childCount)
    itemCount = 0

    let rowFlow = flow == GridFlow.Row
    var minorStride = Math.Max(1, rowFlow ? columns.Length : rows.Length)
    var maxMajor = rowFlow ? rows.Length : columns.Length

    for i in 0 ... childCount {
      if context.ChildDisplay(i) == Display.None { continue }
      let p = context.ChildTrait(i, Placement)
      let cSpan = p.ColumnSpan ?? 1
      let rSpan = p.RowSpan ?? 1
      if cSpan < 1 || rSpan < 1 { throw ArgumentOutOfRangeException("GridPlacement") }
      if let c = p.Column {
        if c < 0 { throw ArgumentOutOfRangeException("GridPlacement.Column") }
      }
      if let r = p.Row {
        if r < 0 { throw ArgumentOutOfRangeException("GridPlacement.Row") }
      }
      let h = p.HorizontalAlign ?? horizontalAlign
      let v = p.VerticalAlign ?? verticalAlign
      if !Enum.IsDefined(h) || !Enum.IsDefined(v) { throw ArgumentOutOfRangeException("GridPlacement") }

      let kind = if p.Column != nil && p.Row != nil {
        0
      } else if (rowFlow && p.Row != nil) || (!rowFlow && p.Column != nil) {
        1
      } else if p.Column != nil || p.Row != nil {
        2
      } else {
        3
      }

      let col = p.Column ?? 0
      let row = p.Row ?? 0
      if rowFlow {
        if p.Column != nil { minorStride = Math.Max(minorStride, col + cSpan) }
        else { minorStride = Math.Max(minorStride, cSpan) }
        if p.Row != nil { maxMajor = Math.Max(maxMajor, row + rSpan) }
      } else {
        if p.Row != nil { minorStride = Math.Max(minorStride, row + rSpan) }
        else { minorStride = Math.Max(minorStride, rSpan) }
        if p.Column != nil { maxMajor = Math.Max(maxMajor, col + cSpan) }
      }

      scratch.Items[itemCount] = GridResolvedItem{
        ChildIndex: i,
        Column: col,
        Row: row,
        ColumnSpan: cSpan,
        RowSpan: rSpan,
        HAlign: h,
        VAlign: v,
        Kind: kind
      }
      itemCount++
    }

    if itemCount == 0 {
      colCount = columns.Length
      rowCount = rows.Length
      return
    }

    var majorCap = Math.Max(1, maxMajor)
    var usedWords = (majorCap * minorStride + 63) >> 6
    scratch.ClearOccupied(majorCap * minorStride)

    // Pass 1: explicit (Column, Row)
    for idx in 0 ... itemCount {
      let item = scratch.Items[idx]
      if item.Kind != 0 { continue }
      let maj = rowFlow ? item.Row : item.Column
      let min = rowFlow ? item.Column : item.Row
      let majSpan = rowFlow ? item.RowSpan : item.ColumnSpan
      let minSpan = rowFlow ? item.ColumnSpan : item.RowSpan
      markOccupied(scratch, minorStride, ref majorCap, ref usedWords, maj, min, majSpan, minSpan)
    }

    // Pass 2: locked major track (Row in Row flow, Column in Column flow)
    for idx in 0 ... itemCount {
      var item = scratch.Items[idx]
      if item.Kind != 1 { continue }
      let maj = rowFlow ? item.Row : item.Column
      let majSpan = rowFlow ? item.RowSpan : item.ColumnSpan
      let minSpan = rowFlow ? item.ColumnSpan : item.RowSpan
      var min = 0
      while min + minSpan <= minorStride && !fits(scratch, minorStride, majorCap, maj, min, majSpan, minSpan) {
        min++
      }
      if min + minSpan > minorStride {
        repackStride(scratch, minorStride, min + minSpan, majorCap, ref usedWords)
        minorStride = min + minSpan
      }
      markOccupied(scratch, minorStride, ref majorCap, ref usedWords, maj, min, majSpan, minSpan)
      if rowFlow { item.Column = min } else { item.Row = min }
      scratch.Items[idx] = item
    }

    // Pass 3: locked minor + auto items
    var cursorMaj = 0
    var cursorMin = 0
    for idx in 0 ... itemCount {
      var item = scratch.Items[idx]
      if item.Kind != 2 && item.Kind != 3 { continue }
      let majSpan = rowFlow ? item.RowSpan : item.ColumnSpan
      let minSpan = rowFlow ? item.ColumnSpan : item.RowSpan
      if item.Kind == 2 {
        let lockedMin = rowFlow ? item.Column : item.Row
        var maj = dense ? 0 : cursorMaj
        if !dense && lockedMin < cursorMin { maj++ }
        while !fits(scratch, minorStride, majorCap, maj, lockedMin, majSpan, minSpan) {
          maj++
        }
        markOccupied(scratch, minorStride, ref majorCap, ref usedWords, maj, lockedMin, majSpan, minSpan)
        if rowFlow { item.Row = maj } else { item.Column = maj }
        if !dense {
          cursorMaj = maj
          cursorMin = lockedMin + minSpan
          if cursorMin >= minorStride {
            cursorMaj++
            cursorMin = 0
          }
        }
      } else {
        var maj = dense ? 0 : cursorMaj
        var min = dense ? 0 : cursorMin
        while true {
          if min + minSpan > minorStride {
            maj++
            min = 0
            continue
          }
          if fits(scratch, minorStride, majorCap, maj, min, majSpan, minSpan) { break }
          min++
        }
        markOccupied(scratch, minorStride, ref majorCap, ref usedWords, maj, min, majSpan, minSpan)
        if rowFlow {
          item.Row = maj
          item.Column = min
        } else {
          item.Column = maj
          item.Row = min
        }
        if !dense {
          cursorMaj = maj
          cursorMin = min + minSpan
          if cursorMin >= minorStride {
            cursorMaj++
            cursorMin = 0
          }
        }
      }
      scratch.Items[idx] = item
    }

    var actualMaxMaj = maxMajor
    for idx in 0 ... itemCount {
      let item = scratch.Items[idx]
      let endMaj = rowFlow ? item.Row + item.RowSpan : item.Column + item.ColumnSpan
      if endMaj > actualMaxMaj { actualMaxMaj = endMaj }
    }
    if rowFlow {
      colCount = minorStride
      rowCount = Math.Max(1, actualMaxMaj)
    } else {
      rowCount = minorStride
      colCount = Math.Max(1, actualMaxMaj)
    }
  }

  private func fits(
    scratch GridScratch,
    minorStride int32,
    majorCap int32,
    maj int32,
    min int32,
    majSpan int32,
    minSpan int32
  ) bool {
    if min + minSpan > minorStride { return false }
    let majEnd = Math.Min(majorCap, maj + majSpan)
    for r in maj ... majEnd {
      let rowBase = r * minorStride
      for c in min ... min + minSpan {
        if scratch.IsOccupied(rowBase + c) { return false }
      }
    }
    return true
  }

  private func markOccupied(
    scratch GridScratch,
    minorStride int32,
    ref majorCap int32,
    ref usedWords int32,
    maj int32,
    min int32,
    majSpan int32,
    minSpan int32
  ) {
    let neededMaj = maj + majSpan
    if neededMaj > majorCap {
      majorCap = Math.Max(neededMaj, majorCap * 2)
      usedWords = scratch.EnsureOccupied(majorCap * minorStride, usedWords)
    }
    for r in maj ... neededMaj {
      let rowBase = r * minorStride
      for c in min ... min + minSpan {
        scratch.SetOccupied(rowBase + c)
      }
    }
  }

  private func repackStride(
    scratch GridScratch,
    oldStride int32,
    newStride int32,
    majorCap int32,
    ref usedWords int32
  ) {
    let neededWords = (majorCap * newStride + 63) >> 6
    usedWords = scratch.EnsureOccupied(majorCap * newStride, usedWords)
    var r = majorCap - 1
    while r >= 0 {
      var c = oldStride - 1
      while c >= 0 {
        let oldBit = r * oldStride + c
        if scratch.IsOccupied(oldBit) {
          let w = oldBit >> 6
          scratch.Occupied[w] = scratch.Occupied[w] & ~(1uL << (oldBit & 63))
          scratch.SetOccupied(r * newStride + c)
        }
        c--
      }
      r--
    }
    usedWords = neededWords
  }

  private func sortOrder(scratch GridScratch, itemCount int32, horizontal bool) {
    for i in 0 ... itemCount {
      scratch.Order[i] = i
    }
    for i in 1 ... itemCount {
      let key = scratch.Order[i]
      let keySpan = horizontal ? scratch.Items[key].ColumnSpan : scratch.Items[key].RowSpan
      var j = i - 1
      while j >= 0 {
        let cur = scratch.Order[j]
        let curSpan = horizontal ? scratch.Items[cur].ColumnSpan : scratch.Items[cur].RowSpan
        if curSpan <= keySpan { break }
        scratch.Order[j + 1] = cur
        j--
      }
      scratch.Order[j + 1] = key
    }
  }

  private func resolveColumns(
    context LayoutContext,
    scratch GridScratch,
    itemCount int32,
    colCount int32,
    availableWidth float64,
    colGap float64
  ) {
    scratch.EnsureColSizes(colCount)
    let sizes = scratch.ColSizes
    for i in 0 ... colCount {
      let track = columnTrack(i)
      sizes[i] = track.Unit == GridUnit.Fixed
        ? Math.Clamp(track.Value, track.Minimum, track.Maximum ?? Double.PositiveInfinity)
        : track.Minimum
    }

    sortOrder(scratch, itemCount, true)
    let finite = Double.IsFinite(availableWidth)

    for oi in 0 ... itemCount {
      let item = scratch.Items[scratch.Order[oi]]
      if finite && hasFraction(true, item.Column, item.ColumnSpan) { continue }
      let minOnly = allEligibleMinContent(true, sizes, item.Column, item.ColumnSpan)
      let wConstraint = minOnly ? LayoutConstraint.MinContent : LayoutConstraint.Unbounded
      let measured = context.MeasureChild(item.ChildIndex, wConstraint, LayoutConstraint.Unbounded)
      growTracks(true, sizes, item.Column, item.ColumnSpan, measured.Width, colGap, !finite)
    }

    if finite {
      var overflow = spanSize(sizes, 0, colCount, colGap) - availableWidth
      if overflow > 0.001 {
        var anyAuto = false
        for i in 0 ... colCount {
          if columnTrack(i).Unit == GridUnit.Auto {
            anyAuto = true
            break
          }
        }
        if anyAuto {
          scratch.EnsureMinSizes(colCount)
          let minSizes = scratch.MinSizes
          for i in 0 ... colCount {
            let track = columnTrack(i)
            minSizes[i] = track.Unit == GridUnit.Auto ? track.Minimum : sizes[i]
          }
          for oi in 0 ... itemCount {
            let item = scratch.Items[scratch.Order[oi]]
            if hasFraction(true, item.Column, item.ColumnSpan) { continue }
            var spansAuto = false
            for c in item.Column ... item.Column + item.ColumnSpan {
              if columnTrack(c).Unit == GridUnit.Auto {
                spansAuto = true
                break
              }
            }
            if !spansAuto { continue }
            let minMeasured = context.MeasureChild(item.ChildIndex, LayoutConstraint.MinContent, LayoutConstraint.Unbounded)
            var deficit = minMeasured.Width - spanSize(minSizes, item.Column, item.ColumnSpan, colGap)
            for pass in 0 ... item.ColumnSpan {
              if deficit <= 0.001 { break }
              var eligible = 0
              for c in item.Column ... item.Column + item.ColumnSpan {
                if columnTrack(c).Unit == GridUnit.Auto && minSizes[c] < sizes[c] { eligible++ }
              }
              if eligible == 0 { break }
              let share = deficit / float64(eligible)
              var added = 0.0
              for c in item.Column ... item.Column + item.ColumnSpan {
                if columnTrack(c).Unit != GridUnit.Auto || minSizes[c] >= sizes[c] { continue }
                let delta = Math.Min(share, sizes[c] - minSizes[c])
                minSizes[c] += delta
                added += delta
              }
              if added <= 0.0 { break }
              deficit -= added
            }
          }
          for pass in 0 ... colCount {
            if overflow <= 0.001 { break }
            var totalSlack = 0.0
            for i in 0 ... colCount {
              if columnTrack(i).Unit == GridUnit.Auto && sizes[i] > minSizes[i] {
                totalSlack += sizes[i] - minSizes[i]
              }
            }
            if totalSlack <= 0.001 { break }
            let ratio = Math.Min(1.0, overflow / totalSlack)
            var reduced = 0.0
            for i in 0 ... colCount {
              if columnTrack(i).Unit != GridUnit.Auto || sizes[i] <= minSizes[i] { continue }
              let delta = (sizes[i] - minSizes[i]) * ratio
              sizes[i] -= delta
              reduced += delta
            }
            if reduced <= 0.0 { break }
            overflow -= reduced
          }
        }
      }
    }

    distributeFractions(true, sizes, colCount, availableWidth, colGap)
  }

  private func resolveRows(
    context LayoutContext,
    scratch GridScratch,
    itemCount int32,
    rowCount int32,
    availableHeight float64,
    colGap float64,
    rowGap float64
  ) {
    scratch.EnsureRowSizes(rowCount)
    let sizes = scratch.RowSizes
    for i in 0 ... rowCount {
      let track = rowTrack(i)
      sizes[i] = track.Unit == GridUnit.Fixed
        ? Math.Clamp(track.Value, track.Minimum, track.Maximum ?? Double.PositiveInfinity)
        : track.Minimum
    }

    sortOrder(scratch, itemCount, false)
    let finite = Double.IsFinite(availableHeight)
    let colSizes = scratch.ColSizes

    for oi in 0 ... itemCount {
      let item = scratch.Items[scratch.Order[oi]]
      if finite && hasFraction(false, item.Row, item.RowSpan) { continue }
      let cellW = spanSize(colSizes, item.Column, item.ColumnSpan, colGap)
      let wConstraint = item.HAlign == LayoutAlign.Stretch
        ? LayoutConstraint.Exactly(cellW) : LayoutConstraint.AtMost(cellW)
      let minOnly = allEligibleMinContent(false, sizes, item.Row, item.RowSpan)
      let hConstraint = minOnly ? LayoutConstraint.MinContent : LayoutConstraint.Unbounded
      let measured = context.MeasureChild(item.ChildIndex, wConstraint, hConstraint)
      growTracks(false, sizes, item.Row, item.RowSpan, measured.Height, rowGap, !finite)
    }

    distributeFractions(false, sizes, rowCount, availableHeight, rowGap)
  }

  private func hasFraction(horizontal bool, start int32, count int32) bool {
    for i in start ... start + count {
      let track = horizontal ? columnTrack(i) : rowTrack(i)
      if track.Unit == GridUnit.Fraction { return true }
    }
    return false
  }

  private func isGrowEligible(track GridTrack, currentSize float64, intrinsicFractions bool) bool {
    let max = track.Maximum ?? Double.PositiveInfinity
    if currentSize >= max { return false }
    return track.Unit == GridUnit.Auto
      || track.Unit == GridUnit.MinContent
      || track.Unit == GridUnit.MaxContent
      || (intrinsicFractions && track.Unit == GridUnit.Fraction)
  }

  private func allEligibleMinContent(horizontal bool, sizes []float64, start int32, count int32) bool {
    var anyMin = false
    for i in start ... start + count {
      let track = horizontal ? columnTrack(i) : rowTrack(i)
      if track.Unit == GridUnit.MinContent {
        anyMin = true
      } else if isGrowEligible(track, sizes[i], true) {
        return false
      }
    }
    return anyMin
  }

  private func growTracks(
    horizontal bool,
    sizes []float64,
    start int32,
    count int32,
    desired float64,
    gap float64,
    intrinsicFractions bool
  ) {
    var remaining = desired - spanSize(sizes, start, count, gap)
    for pass in 0 ... count {
      if remaining <= 0.001 { break }
      var eligible = 0
      for i in start ... start + count {
        let track = horizontal ? columnTrack(i) : rowTrack(i)
        if isGrowEligible(track, sizes[i], intrinsicFractions) { eligible++ }
      }
      if eligible == 0 { break }
      let share = remaining / float64(eligible)
      var added = 0.0
      for i in start ... start + count {
        let track = horizontal ? columnTrack(i) : rowTrack(i)
        if !isGrowEligible(track, sizes[i], intrinsicFractions) { continue }
        let max = track.Maximum ?? Double.PositiveInfinity
        let delta = Math.Min(share, max - sizes[i])
        sizes[i] += delta
        added += delta
      }
      if added <= 0.0 { break }
      remaining -= added
    }
  }

  private func distributeFractions(
    horizontal bool,
    sizes []float64,
    trackCount int32,
    available float64,
    gap float64
  ) {
    if !Double.IsFinite(available) || trackCount <= 0 { return }
    var remaining = available - spanSize(sizes, 0, trackCount, gap)
    for pass in 0 ... trackCount {
      if remaining <= 0.001 { break }
      var maxWeight = 0.0
      for i in 0 ... trackCount {
        let track = horizontal ? columnTrack(i) : rowTrack(i)
        let max = track.Maximum ?? Double.PositiveInfinity
        if track.Unit == GridUnit.Fraction && sizes[i] < max && track.Value > maxWeight {
          maxWeight = track.Value
        }
      }
      if maxWeight <= 0.0 { break }
      var totalWeight = 0.0
      for i in 0 ... trackCount {
        let track = horizontal ? columnTrack(i) : rowTrack(i)
        let max = track.Maximum ?? Double.PositiveInfinity
        if track.Unit == GridUnit.Fraction && sizes[i] < max {
          totalWeight += track.Value / maxWeight
        }
      }
      if totalWeight <= 0.0 { break }
      var added = 0.0
      for i in 0 ... trackCount {
        let track = horizontal ? columnTrack(i) : rowTrack(i)
        if track.Unit != GridUnit.Fraction { continue }
        let max = track.Maximum ?? Double.PositiveInfinity
        if sizes[i] >= max { continue }
        let delta = Math.Min(remaining * (track.Value / maxWeight) / totalWeight, max - sizes[i])
        sizes[i] += delta
        added += delta
      }
      if added <= 0.0 { break }
      remaining -= added
    }
  }

  private func spanSize(sizes []float64, start int32, count int32, gap float64) float64 {
    var total = count > 1 ? float64(count - 1) * gap : 0.0
    for i in start ... start + count {
      total += sizes[i]
    }
    return total
  }

  private func trackOffset(sizes []float64, index int32, gap float64) float64 {
    var offset = float64(index) * gap
    for i in 0 ... index {
      offset += sizes[i]
    }
    return offset
  }

  /// Measures the grid's columns and rows under the available constraints.
  /// @param context The bounded layout context for the current measure pass.
  /// @param available The maximum available content size.
  /// @returns The desired content size spanning all resolved tracks and gaps.
  public func Measure(context LayoutContext, available LayoutSize) LayoutSize {
    if context.ChildCount == 0 { return LayoutSize{} }
    let scratch = GridScratchPool.Acquire()
    try {
      placeItems(context, scratch, out var itemCount, out var colCount, out var rowCount)
      if itemCount == 0 { return LayoutSize{} }
      let colGap = context.ColumnGap
      let rowGap = context.RowGap
      resolveColumns(context, scratch, itemCount, colCount, available.Width, colGap)
      resolveRows(context, scratch, itemCount, rowCount, available.Height, colGap, rowGap)
      let totalW = spanSize(scratch.ColSizes, 0, colCount, colGap)
      let totalH = spanSize(scratch.RowSizes, 0, rowCount, rowGap)
      return LayoutSize(totalW, totalH)
    } finally {
      GridScratchPool.Release()
    }
  }

  /// Arranges every child into its resolved grid cell with alignment and reading-direction support.
  /// @param context The bounded layout context for the current arrange pass.
  /// @param finalSize The resolved content size.
  public func Arrange(context LayoutContext, finalSize LayoutSize) {
    let childCount = context.ChildCount
    if childCount == 0 { return }
    let scratch = GridScratchPool.Acquire()
    try {
      placeItems(context, scratch, out var itemCount, out var colCount, out var rowCount)
      if itemCount == 0 {
        for i in 0 ... childCount {
          context.ArrangeChild(i, ElementRect{})
        }
        return
      }
      let colGap = context.ColumnGap
      let rowGap = context.RowGap
      resolveColumns(context, scratch, itemCount, colCount, finalSize.Width, colGap)
      resolveRows(context, scratch, itemCount, rowCount, finalSize.Height, colGap, rowGap)

      let rtl = context.Direction == Direction.RightToLeft
      let mirrorWidth = rtl ? Math.Max(finalSize.Width, spanSize(scratch.ColSizes, 0, colCount, colGap)) : 0.0
      var itemCursor = 0
      for i in 0 ... childCount {
        if itemCursor >= itemCount || scratch.Items[itemCursor].ChildIndex != i {
          context.ArrangeChild(i, ElementRect{})
          continue
        }
        let item = scratch.Items[itemCursor]
        itemCursor++
        let cellW = spanSize(scratch.ColSizes, item.Column, item.ColumnSpan, colGap)
        let cellH = spanSize(scratch.RowSizes, item.Row, item.RowSpan, rowGap)
        let rawX = trackOffset(scratch.ColSizes, item.Column, colGap)
        let cellX = rtl ? mirrorWidth - rawX - cellW : rawX
        let cellY = trackOffset(scratch.RowSizes, item.Row, rowGap)

        if item.HAlign == LayoutAlign.Stretch && item.VAlign == LayoutAlign.Stretch {
          context.ArrangeChild(i, ElementRect{ X: cellX, Y: cellY, Width: cellW, Height: cellH })
          continue
        }
        let wConstraint = item.HAlign == LayoutAlign.Stretch
          ? LayoutConstraint.Exactly(cellW) : LayoutConstraint.AtMost(cellW)
        let hConstraint = item.VAlign == LayoutAlign.Stretch
          ? LayoutConstraint.Exactly(cellH) : LayoutConstraint.AtMost(cellH)
        let measured = context.MeasureChild(i, wConstraint, hConstraint)
        let w = item.HAlign == LayoutAlign.Stretch ? cellW : Math.Min(measured.Width, cellW)
        let h = item.VAlign == LayoutAlign.Stretch ? cellH : Math.Min(measured.Height, cellH)
        let x = cellX + Overlay.AlignOffset(item.HAlign, cellW, w, rtl)
        let y = cellY + Overlay.AlignOffset(item.VAlign, cellH, h, false)
        context.ArrangeChild(i, ElementRect{ X: x, Y: y, Width: w, Height: h })
      }
    } finally {
      GridScratchPool.Release()
    }
  }

  private func tracksEqual(a []GridTrack, b []GridTrack) bool {
    if a.Length != b.Length { return false }
    for i in 0 ... a.Length {
      if a[i] != b[i] { return false }
    }
    return true
  }

  internal func MatchesLayout(other Grid) bool ->
    flow == other.flow && dense == other.dense
      && horizontalAlign == other.horizontalAlign && verticalAlign == other.verticalAlign
      && autoColumns == other.autoColumns && autoRows == other.autoRows
      && tracksEqual(columns, other.columns) && tracksEqual(rows, other.rows)
}
