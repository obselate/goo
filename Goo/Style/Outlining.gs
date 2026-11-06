package Goo

internal class Outlining {
  shared {
    internal func Get(n Node) OutlineValue? {
      if !n.HasOutlineState { return nil }
      if let value = n.ShapeState?.Outline { return value }
      n.HasOutlineState = false
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

    internal func GetOffset(n Node) Length {
      if let value = Get(n) { return value.Offset }
      return Length{}
    }

    internal func SetWidth(n Node, width Length) {
      if let value = Get(n) {
        value.Width = width
        prune(n, value)
        return
      }
      if emptyLength(width) {
        return
      }
      let value = OutlineValue{ Width: width, Color: Color.Transparent }
      add(n, value)
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
      let value = OutlineValue{ Color: color }
      add(n, value)
    }

    internal func SetOffset(n Node, offset Length) {
      if let value = Get(n) {
        value.Offset = offset
        prune(n, value)
        return
      }
      if emptyLength(offset) {
        return
      }
      let value = OutlineValue{ Offset: offset, Color: Color.Transparent }
      add(n, value)
    }

    private func add(n Node, value OutlineValue) {
      n.EnsureShapeState().Outline = value
      n.HasOutlineState = true
    }

    private func prune(n Node, value OutlineValue) {
      if !emptyLength(value.Width) || !transparent(value.Color) || !emptyLength(value.Offset) {
        return
      }
      if let state = n.ShapeState { state.Outline = nil }
      n.HasOutlineState = false
    }

    private func emptyLength(value Length) bool -> value.Unit == LengthUnit.Unset
  }
}

internal class OutlineValue {
  internal var Width Length
  internal var Color Color
  internal var Offset Length
}
