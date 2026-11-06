package Goo

import System.Runtime.CompilerServices

internal class TextStroking {
  shared {
    private var values ConditionalWeakTable[Node, TextStrokeValue]?

    internal func Remove(n Node) {
      values?.Remove(n)
      n.HasTextStrokeState = false
    }

    internal func Get(n Node) TextStrokeValue? {
      if !n.HasTextStrokeState { return nil }
      if let existing = values {
        if existing.TryGetValue(n, out var value) { return value }
      }
      n.HasTextStrokeState = false
      return nil
    }

    internal func GetWidth(n Node) Length {
      if let value = Get(n) { return value.Width }
      return Length{}
    }

    internal func GetColor(n Node) Color {
      if let value = Get(n) { return value.Color }
      return Color.Transparent
    }

    internal func Visible(n Node) TextStrokeValue? {
      if let value = Get(n) {
        if value.Width.Unit == LengthUnit.Px && value.Width.Value > 0.0F
          && value.Color.A > 0.0F {
            return value
          }
      }
      return nil
    }

    internal func SetWidth(n Node, width Length) {
      let normalized = width.Unit == LengthUnit.Px && width.Value == 0.0F ? Length{} : width
      if let value = Get(n) {
        value.Width = normalized
        prune(n, value)
        return
      }
      if normalized.Unit == LengthUnit.Unset {
        return
      }
      add(n, TextStrokeValue{ Width: normalized, Color: Color.Transparent })
    }

    internal func SetColor(n Node, color Color) {
      if let value = Get(n) {
        value.Color = color
        prune(n, value)
        return
      }
      if transparent(color) {
        return
      }
      add(n, TextStrokeValue{ Color: color })
    }

    private func add(n Node, value TextStrokeValue) {
      if values == nil { values = ConditionalWeakTable[Node, TextStrokeValue]() }
      values?.Add(n, value)
      n.HasTextStrokeState = true
    }

    private func prune(n Node, value TextStrokeValue) {
      if value.Width.Unit != LengthUnit.Unset || !transparent(value.Color) {
        return
      }
      values?.Remove(n)
      n.HasTextStrokeState = false
    }
  }
}

internal class TextStrokeValue {
  internal var Width Length
  internal var Color Color
}
