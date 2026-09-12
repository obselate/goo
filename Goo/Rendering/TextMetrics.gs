package Goo

import Facebook.Yoga

/// Specifies the visual side of a text position at a directional boundary.
public enum TextAffinity { Upstream; Downstream }

internal class EntryShapeState {
  internal prop Content string{ get; init; }
  internal prop Display string{ get; init; }
  internal prop SourceStarts []int32{ get; init; }
  internal prop FontFamily string{ get; init; }
  internal prop FontSize float32{ get; init; }
  internal prop FontWeight float64{ get; init; }
  internal prop Italic bool{ get; init; }
  internal prop Spacing float32{ get; init; }
  internal prop Direction int32{ get; init; }
  internal prop Password bool{ get; init; }
  internal prop Shape ShapedText? { get; init; }
  internal var Placeholder string
  internal var PlaceholderShape ShapedText?

  internal init() {
    Content = ""
    Display = ""
    SourceStarts = []int32{}
    FontFamily = ""
    Placeholder = ""
  }
}

internal class EntryLayouts {
  shared {
    internal func Measure(yoga Facebook.Yoga.Node, width float32, widthMode MeasureMode,
      height float32, heightMode MeasureMode) YGSize{
        let n = nodeFromYoga(yoga)
        var measuredWidth = 0.0F
        var measuredHeight = TextLayouts.resolvedLineHeight(n)
        if widthMode == MeasureMode.Exactly {
          measuredWidth = width
        }
        if heightMode == MeasureMode.Exactly {
          measuredHeight = height
        } else if heightMode == MeasureMode.AtMost && measuredHeight > height {
          measuredHeight = height
        }
        return YGSize{ Width: measuredWidth, Height: measuredHeight }
      }
  }
}

internal func protectedTextMask(value string) string -> String('•', UnicodeGraphemes.Starts(value).Length)

internal func protectedTextDisplayOffset(value string, source int32,
  affinity TextAffinity) int32 -> mappedDisplayOffset(value, UnicodeGraphemes.Starts(value), source, affinity)

internal func protectedTextSourceOffset(value string, display int32) int32 -> mappedSourceOffset(value, UnicodeGraphemes.Starts(value), display)

internal func entryDisplayOffset(state EntryShapeState, source int32,
  affinity TextAffinity) int32{
    if !state.Password { return source }
    return mappedDisplayOffset(state.Content, state.SourceStarts, source, affinity)
  }

internal func entrySourceOffset(state EntryShapeState, display int32) int32 {
  if !state.Password { return display }
  return mappedSourceOffset(state.Content, state.SourceStarts, display)
}

private func mappedDisplayOffset(value string, starts []int32, source int32,
  affinity TextAffinity) int32{
    if source <= 0 { return 0 }
    if source >= value.Length { return starts.Length }
    for index in 0 ... starts.Length {
      if starts[index] == source { return index }
      if starts[index] > source {
        return affinity == TextAffinity.Upstream ? index - 1 : index
      }
    }
    return starts.Length
  }

private func mappedSourceOffset(value string, starts []int32, display int32) int32 {
  if display <= 0 { return 0 }
  if display >= starts.Length { return value.Length }
  return starts[display]
}

internal class TextMetrics {
  internal func Spacing(n Node) float32 -> n.LetterSpacing.Unit == LengthUnit.Px ? n.LetterSpacing.Value : 0.0F

  internal func Shape(n Node, text string) ShapedText -> TextAnalyses.ShapeEntry(n, text)

  internal func BufferShape(n Node) ShapedText {
    if let cached = n.EntryShape {
      if let shape = cached.Shape {
        if cached.Content == n.Buffer && cached.FontFamily == n.FontFamily
          && cached.FontSize == TextLayouts.fontSize(n) && cached.FontWeight == n.FontWeight
          && cached.Italic == (n.FontStyle == FontStyle.Italic)
          && cached.Spacing == Spacing(n) && cached.Direction == int32(n.Direction)
          && cached.Password == n.Password{
            if n.HasElementHandle {
              shape.PrepareGeometry()
            }
            return shape
          }
        shape.Dispose()
      }
      cached.PlaceholderShape?.Dispose()
      n.EntryShape = nil
    }
    let starts = n.Password ? UnicodeGraphemes.Starts(n.Buffer) : []int32{}
    let display = n.Password ? String('•', starts.Length) : n.Buffer
    let shaped = Shape(n, display)
    n.EntryShape = EntryShapeState{
      Content: n.Buffer, Display: display, SourceStarts: starts,
      FontFamily: n.FontFamily, FontSize: TextLayouts.fontSize(n),
      FontWeight: n.FontWeight, Italic: n.FontStyle == FontStyle.Italic,
      Spacing: Spacing(n), Direction: int32(n.Direction), Password: n.Password, Shape: shaped,
    }
    if n.HasElementHandle {
      shaped.PrepareGeometry()
    }
    return shaped
  }

  internal func PlaceholderShape(n Node) ShapedText? {
    if n.Placeholder == "" {
      if let cached = n.EntryShape {
        cached.PlaceholderShape?.Dispose()
        cached.PlaceholderShape = nil
        cached.Placeholder = ""
      }
      return nil
    }
    BufferShape(n)
    guard let cached = n.EntryShape else { return nil }
    if cached.PlaceholderShape == nil || cached.Placeholder != n.Placeholder {
      cached.PlaceholderShape?.Dispose()
      cached.PlaceholderShape = Shape(n, n.Placeholder)
      cached.Placeholder = n.Placeholder
      if n.HasElementHandle { cached.PlaceholderShape!!.PrepareGeometry() }
    }
    return cached.PlaceholderShape
  }

  internal func EntryOffset(n Node, shaped ShapedText) float32 {
    let free = TextLayouts.ContentWidth(n) - shaped.Width
    if free <= 0.0F { return 0.0F }
    return switch n.TextAlign {
      case TextAlign.Center: free * 0.5F
      case TextAlign.Right: free
      case TextAlign.Start: shaped.RightToLeft ? free : 0.0F
      case TextAlign.End: shaped.RightToLeft ? 0.0F : free
      default: 0.0F
    }
  }

  internal func EntryOriginX(n Node, shaped ShapedText) float32 -> TextLayouts.ContentLeft(n) + EntryOffset(n, shaped) - n.EditScrollX

  internal func CaretX(n Node, index int32) float32 {
    let shaped = BufferShape(n)
    return shaped.CaretX(entryDisplayOffset(n.EntryShape!!, index, n.CaretAffinity),
      int32(n.CaretAffinity))
  }

  internal func HitAt(n Node, localX float32) TextHit {
    let shaped = BufferShape(n)
    let contentX = localX - EntryOffset(n, shaped) + n.EditScrollX
    let hit = shaped.HitTest(contentX)
    return TextHit{ Index: entrySourceOffset(n.EntryShape!!, hit.Index), Affinity: hit.Affinity }
  }

  internal func MoveCaret(n Node, delta int32) TextHit {
    let shaped = BufferShape(n)
    let hit = shaped.MoveCaret(entryDisplayOffset(n.EntryShape!!, n.Caret, n.CaretAffinity),
      int32(n.CaretAffinity), delta)
    return TextHit{ Index: entrySourceOffset(n.EntryShape!!, hit.Index), Affinity: hit.Affinity }
  }

  internal func LineEdge(n Node, end bool) TextHit {
    let shaped = BufferShape(n)
    let hit = shaped.LineEdge(end)
    return TextHit{ Index: entrySourceOffset(n.EntryShape!!, hit.Index), Affinity: hit.Affinity }
  }

  internal func Collapse(n Node, delta int32) TextHit {
    let shaped = BufferShape(n)
    let state = n.EntryShape!!
    let hit = shaped.Collapse(entryDisplayOffset(state, n.Caret, n.CaretAffinity),
      int32(n.CaretAffinity), entryDisplayOffset(state, n.Anchor, n.AnchorAffinity),
      int32(n.AnchorAffinity), delta)
    return TextHit{ Index: entrySourceOffset(state, hit.Index), Affinity: hit.Affinity }
  }

  internal func SelectionRects(n Node) []float32 {
    let shaped = BufferShape(n)
    let state = n.EntryShape!!
    return shaped.SelectionRects(entryDisplayOffset(state, n.Caret, n.CaretAffinity),
      entryDisplayOffset(state, n.Anchor, n.AnchorAffinity))
  }
}

// Keeps the caret inside the padded view with a 2px margin.
internal func FollowCaret(n Node) {
  let m = TextMetrics()
  let viewW = TextLayouts.ContentWidth(n)
  if viewW <= 0.0F {
    return
  }
  let shaped = m.BufferShape(n)
  if shaped.Width <= viewW {
    n.EditScrollX = 0.0F
    return
  }
  let caretX = m.CaretX(n, n.Caret)
  var sx = n.EditScrollX
  if caretX - sx > viewW - 2.0F { sx = caretX - viewW + 2.0F }
  if caretX - sx < 2.0F { sx = caretX - 2.0F }
  if sx < 0.0F { sx = 0.0F }
  n.EditScrollX = sx
}
