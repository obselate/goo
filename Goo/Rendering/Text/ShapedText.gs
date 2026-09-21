package Goo

import System
import System.Collections.Generic

internal sealed class ShapedText : IDisposable {
  private let runs List[ShapedRun]
  private let text string
  private var geometry TextGeometry?
  private var disposed bool

  internal prop Width float32{ get; set; }
  internal prop Ascent float32{ get; set; }
  internal prop Descent float32{ get; set; }
  internal prop RightToLeft bool{ get; set; }
  internal prop HasRightToLeftRun bool{ get; set; }
  internal prop InkTop float32{ get; set; }
  internal prop InkBottom float32{ get; set; }
  internal prop Runs IReadOnlyList[ShapedRun]{ get -> runs }
  internal prop HasMissingGlyph bool{
    get {
      for run in runs {
        for glyph in run.Glyphs {
          if glyph == 0u { return true }
        }
      }
      return false
    }
  }
  internal prop GlyphCount int32{
    get {
      var result int32 = 0
      for run in runs { result = result + run.Glyphs.Length }
      return result
    }
  }

  internal init(text string, runs List[ShapedRun], width float32, ascent float32,
    descent float32, rightToLeft bool) {
      this.text = text
      this.runs = runs
      Width = width
      Ascent = ascent
      Descent = descent
      RightToLeft = rightToLeft
      var hasRtl = false
      let inkTop = Ascent
      let inkBottom = Descent
      for run in runs {
        if run.RightToLeft { hasRtl = true }
        if run.Glyphs.Length == 0 { continue }
      }
      HasRightToLeftRun = hasRtl
      InkTop = inkTop
      InkBottom = inkBottom
    }

  internal func Slice(start int32, end int32) ShapedText {
    let from = Math.Clamp(start, 0, text.Length)
    let to = Math.Clamp(end, from, text.Length)
    let selected = List[ShapedRun]()
    for run in runs {
      if let slice = run.Slice(from, to) { selected.Add(slice) }
    }
    return ShapedText(text, selected, Width, Ascent, Descent, RightToLeft)
  }

  internal func CaretX(index int32, affinity int32) float32 {
    lock (this) {
      if let current = geometry { return current.CaretX(index, affinity) }
      return TextGeometry.CaretX(text, runs, Width, RightToLeft, index, affinity)
    }
  }

  internal func HitTest(x float32, inside bool = false) TextHit -> Geometry().HitTest(x, inside)

  internal func PrepareGeometry() {
    let prepared = Geometry()
  }

  internal func MoveCaret(index int32, affinity int32, delta int32) TextHit -> Geometry().Move(index, affinity, delta)

  internal func LineEdge(end bool) TextHit -> Geometry().LineEdge(end)

  internal func Collapse(index int32, affinity int32, anchorIndex int32, anchorAffinity int32,
    delta int32) TextHit -> Geometry().Collapse(index, affinity, anchorIndex, anchorAffinity, delta)

  internal func SelectionRects(start int32, end int32) []float32 -> Geometry().SelectionRects(start, end)

  internal func SelectionRectCount(start int32, end int32) int32 -> Geometry().SelectionRectCount(start, end)

  internal func CopySelectionRects(start int32, end int32, rectOffset int32,
    destination Span[float32]) int32 -> Geometry().CopySelectionRects(start, end, rectOffset, destination)

  public func Dispose() {
    if disposed { return }
    disposed = true
    for run in runs { run.Dispose() }
  }

  private func Geometry() TextGeometry {
    lock (this) {
      if let current = geometry { return current }
      let built = TextGeometry.Build(text, runs, Width, RightToLeft)
      geometry = built
      return built
    }
  }
}
