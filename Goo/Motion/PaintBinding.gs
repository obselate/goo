package Goo

import System
import System.Collections.Generic

internal class PaintBinding {
  internal let Field StyleField
  private let number Anim[float64]?
  private let colour Anim[Color]?
  private let translation Anim[Point]?

  internal init(field StyleField, number Anim[float64]? = nil,
    colour Anim[Color]? = nil, translation Anim[Point]? = nil) {
    Field = field
    this.number = number
    this.colour = colour
    this.translation = translation
  }

  internal prop Disposed bool {
    get -> number?.IsDisposed == true || colour?.IsDisposed == true || translation?.IsDisposed == true
  }

  internal func Same(other PaintBinding?) bool -> other != nil
    && number == other?.number && colour == other?.colour && translation == other?.translation

  internal func Validate(pump MotionPump) {
    if (number?.PaintPump ?? colour?.PaintPump ?? translation?.PaintPump) != pump {
      throw InvalidOperationException("A paint animation must belong to the element's window")
    }
  }

  internal func Bind(pump MotionPump) {
    number?.BindPaint(pump)
    colour?.BindPaint(pump)
    translation?.BindPaint(pump)
  }

  internal func Unbind() {
    number?.UnbindPaint()
    colour?.UnbindPaint()
    translation?.UnbindPaint()
  }

  internal func Read(field StyleField) StyleEntry {
    if let source = colour {
      let value = source.Value
      return StyleEntry{ Field: field, A: value.R, B: value.G, C: value.B, D: value.A }
    }
    if let source = translation {
      let value = source.Value
      return StyleEntry{ Field: field,
        A: float32(if field == StyleField.TransformTranslateX { value.X } else { value.Y }),
        B: float32(int32(LengthUnit.Px)) }
    }
    return StyleEntry{ Field: field, A: float32(number!!.Value) }
  }
}

internal partial class Resolver {
  private let paintNodes List[Node] = List[Node]()
  private let paintWinners []PaintBinding? = [StyleFields.Count]PaintBinding?

  private func collectPaintBindings(n Node, entries StyleEntries?) {
    guard let values = entries else { return }
    var cursor = values.Cursor()
    while cursor.MoveNext() {
      let entry = cursor.Current
      if let binding = entry.Payload as PaintBinding? {
        if !binding.Disposed && styleFieldApplies(n, entry.Field) {
          paintWinners[int32(styleFieldForNode(n, entry.Field))] = binding
        }
      }
    }
  }

  private func updatePaintBindings(n Node) StyleMask {
    for i in 0 ... paintWinners.Length { paintWinners[i] = nil }
    collectPaintBindings(n, n.BaseStyle)
    if !n.Disabled && n.Hovered { collectPaintBindings(n, n.HoverStyle) }
    if !n.Disabled && n.FocusVisible { collectPaintBindings(n, n.FocusStyle) }
    if !n.Disabled && n.Pressed { collectPaintBindings(n, n.ActiveStyle) }
    if n.Disabled { collectPaintBindings(n, n.DisabledStyle) }
    guard let owner = Owner else { return StyleMask{} }
    for binding in paintWinners { binding?.Validate(owner.PaintMotionPump) }
    var mask = StyleMask{}
    if let bindings = n.PaintBindings {
      for var i = bindings.Count; i > 0; i-- {
        let current = bindings[i - 1]
        let field = styleFieldForNode(n, current.Field)
        if !current.Disposed && current.Same(paintWinners[int32(field)]) {
          paintWinners[int32(field)] = nil
          mask = styleMaskWith(mask, field)
        } else {
          current.Unbind()
          bindings.RemoveAt(i - 1)
        }
      }
    }
    for i in 0 ... paintWinners.Length {
      guard let binding = paintWinners[i] else { continue }
      paintWinners[i] = nil
      if n.PaintBindings == nil {
        n.PaintBindings = List[PaintBinding]()
        n.PaintBindingResolver = this
        paintNodes.Add(n)
      }
      binding.Bind(owner.PaintMotionPump)
      n.PaintBindings?.Add(binding)
      mask = styleMaskWith(mask, StyleField(i))
    }
    if n.PaintBindings?.Count == 0 { ForgetPaintBindings(n) }
    return mask
  }

  internal func ForgetPaintBindings(n Node) {
    if let bindings = n.PaintBindings {
      for binding in bindings { binding.Unbind() }
    }
    n.PaintBindings = nil
    n.PaintBindingResolver = nil
    paintNodes.Remove(n)
  }

  private func hasPaintBinding(n Node, field StyleField) bool {
    guard let bindings = n.PaintBindings else { return false }
    for binding in bindings {
      if !binding.Disposed && styleFieldForNode(n, binding.Field) == field { return true }
    }
    return false
  }

  private func samplePaintBindings(n Node) {
    guard let bindings = n.PaintBindings else { return }
    for i in 0 ... bindings.Count {
      let binding = bindings[i]
      if binding.Disposed {
        Invalidate(n, false)
        continue
      }
      let field = styleFieldForNode(n, binding.Field)
      finishTransition(n, field)
      if writeDirectWithInvalidation(n, binding.Read(field), PaintResourceInvalidated, Owner) {
        recordResolvedChange(field)
        if inheritable(field) { propagateInherited(n, field) }
      }
    }
  }

  private func advancePaintBindings() {
    for var i = paintNodes.Count; i > 0; i-- {
      let n = paintNodes[i - 1]
      if n.Retired {
        ForgetPaintBindings(n)
        continue
      }
      samplePaintBindings(n)
    }
    Flush()
  }
}

