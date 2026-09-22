package Goo

import System
import System.Runtime.CompilerServices

internal data struct VectorViewport {
  internal let NativeWidth float64
  internal let NativeHeight float64
  internal let Fit ShapeFit
}

internal class Transforming {
  shared {
    private var values ConditionalWeakTable[Node, TransformValue]?

    internal func Get(n Node) TransformValue? {
      if !n.HasTransformState { return nil }
      if let existing = values {
        if existing.TryGetValue(n, out var value) { return value }
      }
      n.HasTransformState = false
      n.HasVisualTransform = false
      return nil
    }

    internal func TranslateX(n Node) Length {
      if let value = Get(n) { return value.TranslateX }
      return Length{ Unit: LengthUnit.Px }
    }

    internal func TranslateY(n Node) Length {
      if let value = Get(n) { return value.TranslateY }
      return Length{ Unit: LengthUnit.Px }
    }

    internal func Rotate(n Node) float32 {
      if let value = Get(n) { return value.Rotate }
      return 0.0F
    }

    internal func Scale(n Node) float32 {
      if let value = Get(n) { return value.Scale }
      return 1.0F
    }

    internal func ScaleX(n Node) float32 {
      if let value = Get(n) { return value.ScaleX }
      return 1.0F
    }

    internal func ScaleY(n Node) float32 {
      if let value = Get(n) { return value.ScaleY }
      return 1.0F
    }

    internal func SkewX(n Node) float32 {
      if let value = Get(n) { return value.SkewX }
      return 0.0F
    }

    internal func SkewY(n Node) float32 {
      if let value = Get(n) { return value.SkewY }
      return 0.0F
    }

    internal func OriginX(n Node) Length {
      if let value = Get(n) { return value.OriginX }
      return Percent(50.0)
    }

    internal func OriginY(n Node) Length {
      if let value = Get(n) { return value.OriginY }
      return Percent(50.0)
    }

    internal func GetVectorViewport(n Node) VectorViewport? {
      if let value = Get(n) { return value.Viewport }
      return nil
    }

    internal func SameVectorViewport(left VectorViewport?, right VectorViewport?) bool {
      if let leftValue = left {
        if let rightValue = right {
          return leftValue.NativeWidth == rightValue.NativeWidth
            && leftValue.NativeHeight == rightValue.NativeHeight
            && leftValue.Fit == rightValue.Fit
        }
        return false
      }
      if let rightValue = right { return false }
      return true
    }

    internal func SetVectorViewport(n Node, next VectorViewport?) {
      if let viewport = next {
        validateViewport(viewport)
        if let value = Get(n) {
          value.Viewport = next
          update(n, value)
        } else if let value = getOrAdd(n, false) {
          value.Viewport = next
          update(n, value)
        }
        return
      }
      if let value = Get(n) {
        value.Viewport = nil
        update(n, value)
      }
    }

    internal func SetTranslateX(n Node, next Length) {
      if let value = getOrAdd(n, isDefaultTranslation(next)) {
        value.TranslateX = next
        update(n, value)
      }
    }

    internal func SetTranslateY(n Node, next Length) {
      if let value = getOrAdd(n, isDefaultTranslation(next)) {
        value.TranslateY = next
        update(n, value)
      }
    }

    internal func SetRotate(n Node, next float32) {
      if let value = getOrAdd(n, next == 0.0F) {
        value.Rotate = next
        let radians = (next % 360.0F) * MathF.PI / 180.0F
        value.Cos = MathF.Cos(radians)
        value.Sin = MathF.Sin(radians)
        update(n, value)
      }
    }

    internal func SetScale(n Node, next float32) {
      if let value = getOrAdd(n, next == 1.0F) {
        value.Scale = next
        update(n, value)
      }
    }

    internal func SetScaleX(n Node, next float32) {
      if let value = getOrAdd(n, next == 1.0F) {
        value.ScaleX = next
        update(n, value)
      }
    }

    internal func SetScaleY(n Node, next float32) {
      if let value = getOrAdd(n, next == 1.0F) {
        value.ScaleY = next
        update(n, value)
      }
    }

    internal func SetSkewX(n Node, next float32) {
      if let value = getOrAdd(n, next == 0.0F) {
        value.SkewX = next
        value.TanX = MathF.Tan((next % 360.0F) * MathF.PI / 180.0F)
        update(n, value)
      }
    }

    internal func SetSkewY(n Node, next float32) {
      if let value = getOrAdd(n, next == 0.0F) {
        value.SkewY = next
        value.TanY = MathF.Tan((next % 360.0F) * MathF.PI / 180.0F)
        update(n, value)
      }
    }

    internal func SetOriginX(n Node, next Length) {
      if let value = getOrAdd(n, isDefaultOrigin(next)) {
        value.OriginX = next
        update(n, value)
      }
    }

    internal func SetOriginY(n Node, next Length) {
      if let value = getOrAdd(n, isDefaultOrigin(next)) {
        value.OriginY = next
        update(n, value)
      }
    }

    private func getOrAdd(n Node, settingDefault bool) TransformValue? {
      if let value = Get(n) { return value }
      if settingDefault { return nil }
      let value = TransformValue()
      if values == nil { values = ConditionalWeakTable[Node, TransformValue]() }
      values?.Add(n, value)
      n.HasTransformState = true
      return value
    }

    private func update(n Node, state TransformValue) {
      let visual = !isZeroLength(state.TranslateX) || !isZeroLength(state.TranslateY)
        || state.Rotate != 0.0F || state.Scale != 1.0F
        || state.ScaleX != 1.0F || state.ScaleY != 1.0F
        || state.SkewX != 0.0F || state.SkewY != 0.0F || state.Viewport != nil
      n.HasVisualTransform = visual
      if visual || !isDefaultTranslation(state.TranslateX)
        || !isDefaultTranslation(state.TranslateY)
        || !isDefaultOrigin(state.OriginX) || !isDefaultOrigin(state.OriginY) {
          return
        }
      values?.Remove(n)
      n.HasTransformState = false
    }

    private func isZeroLength(value Length) bool -> value.Value == 0.0F

    private func isDefaultTranslation(value Length) bool -> value.Unit == LengthUnit.Px && value.Value == 0.0F

    private func isDefaultOrigin(value Length) bool -> value.Unit == LengthUnit.Percent && value.Value == 50.0F

    private func validateViewport(value VectorViewport) {
      if Double.IsNaN(value.NativeWidth) || Double.IsInfinity(value.NativeWidth)
        || value.NativeWidth <= 0.0 {
          throw ArgumentOutOfRangeException("VectorViewport.NativeWidth")
        }
      if Double.IsNaN(value.NativeHeight) || Double.IsInfinity(value.NativeHeight)
        || value.NativeHeight <= 0.0 {
          throw ArgumentOutOfRangeException("VectorViewport.NativeHeight")
        }
      let fit = int32(value.Fit)
      if fit < int32(ShapeFit.Contain) || fit > int32(ShapeFit.None) {
        throw ArgumentOutOfRangeException("VectorViewport.Fit")
      }
    }
  }
}

internal class TransformValue {
  internal var TranslateX Length
  internal var TranslateY Length
  internal var Rotate float32
  internal var Scale float32
  internal var ScaleX float32
  internal var ScaleY float32
  internal var SkewX float32
  internal var SkewY float32
  internal var OriginX Length
  internal var OriginY Length
  internal var Cos float32
  internal var Sin float32
  internal var TanX float32
  internal var TanY float32
  internal var Viewport VectorViewport?

  internal init() {
    TranslateX = Length{ Unit: LengthUnit.Px }
    TranslateY = Length{ Unit: LengthUnit.Px }
    Scale = 1.0F
    ScaleX = 1.0F
    ScaleY = 1.0F
    OriginX = Percent(50.0)
    OriginY = Percent(50.0)
    Cos = 1.0F
  }
}
