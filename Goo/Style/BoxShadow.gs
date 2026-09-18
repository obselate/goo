package Goo

import System

/// Specifies one immutable outer or inset shadow.
/// Shapes shadow their painted fill and stroke geometry.
public data struct BoxShadow {
  private var offsetX Length
  private var offsetY Length
  private var blur Length
  private var spread Length
  private var color Color
  private var inset bool

  /// Gets the horizontal offset in pixels.
  public prop OffsetX Length{
    get -> normalizedDefault(offsetX)
    init -> offsetX = validateShadowGeometry("BoxShadow", value, "OffsetX")
  }

  /// Gets the vertical offset in pixels.
  public prop OffsetY Length{
    get -> normalizedDefault(offsetY)
    init -> offsetY = validateShadowGeometry("BoxShadow", value, "OffsetY")
  }

  /// Gets the non-negative blur radius in pixels.
  public prop Blur Length{
    get -> normalizedDefault(blur)
    init -> blur = normalizeShadowBlur("BoxShadow", value)
  }

  /// Gets the spread radius in pixels.
  public prop Spread Length{
    get -> normalizedDefault(spread)
    init -> spread = validateShadowGeometry("BoxShadow", value, "Spread")
  }

  /// Gets the shadow color.
  public prop Color Color{
    get -> color
    init -> color = value
  }

  /// Gets whether the shadow is clipped inside the painted box or Shape silhouette.
  public prop Inset bool{
    get -> inset
    init -> inset = value
  }
}

internal class BoxShadowStack {
  internal let Items []BoxShadow

  internal prop Count int32{ get -> Items.Length }

  internal init(items []BoxShadow) {
    Items = items
  }
}

internal func copyBoxShadows(values []BoxShadow) BoxShadowStack {
  let copy = [values.Length]BoxShadow
  for i in 0 ... values.Length {
    copy[i] = normalizeBoxShadow(values[i])
  }
  return BoxShadowStack(copy)
}

internal func singleBoxShadow(value BoxShadow) BoxShadowStack {
  let copy = [1]BoxShadow
  copy[0] = normalizeBoxShadow(value)
  return BoxShadowStack(copy)
}

internal func normalizeBoxShadow(value BoxShadow) BoxShadow -> BoxShadow {
  OffsetX: value.OffsetX,
  OffsetY: value.OffsetY,
  Blur: value.Blur,
  Spread: value.Spread,
  Color: value.Color,
  Inset: value.Inset,
}

internal func sameBoxShadows(left BoxShadowStack?, right BoxShadowStack?) bool {
  let leftCount = boxShadowCount(left)
  let rightCount = boxShadowCount(right)
  if leftCount != rightCount {
    return false
  }
  for i in 0 ... leftCount {
    if boxShadowAt(left, i) != boxShadowAt(right, i) {
      return false
    }
  }
  return true
}

internal func boxShadowCount(value BoxShadowStack?) int32 {
  guard let stack = value else { return 0 }
  return stack.Count
}

internal func boxShadowAt(value BoxShadowStack?, index int32) BoxShadow {
  guard let stack = value else { return BoxShadow{} }
  return stack.Items[index]
}

internal func boxShadowListsCompatible(left BoxShadowStack?, right BoxShadowStack?) bool {
  let leftCount = boxShadowCount(left)
  let rightCount = boxShadowCount(right)
  let count = Math.Max(leftCount, rightCount)
  for i in 0 ... count {
    if i < leftCount && i < rightCount
      && boxShadowAt(left, i).Inset != boxShadowAt(right, i).Inset{
        return false
      }
  }
  return true
}

internal func paddedBoxShadows(value BoxShadowStack?, counterpart BoxShadowStack?, count int32) BoxShadowStack {
  let items = [count]BoxShadow
  let ownCount = boxShadowCount(value)
  let counterpartCount = boxShadowCount(counterpart)
  for i in 0 ... count {
    if i < ownCount {
      items[i] = boxShadowAt(value, i)
    } else {
      let inset = i < counterpartCount ? boxShadowAt(counterpart, i).Inset : false
      items[i] = BoxShadow{ Color: Color.Transparent, Inset: inset }
    }
  }
  return BoxShadowStack(items)
}

internal func newBoxShadowWork(count int32) BoxShadowStack -> BoxShadowStack([count]BoxShadow)

internal func lerpBoxShadows(from BoxShadowStack, to BoxShadowStack, work BoxShadowStack, t float32) {
  for i in 0 ... work.Count {
    let a = from.Items[i]
    let b = to.Items[i]
    work.Items[i] = BoxShadow{
      OffsetX: lerpShadowLength(a.OffsetX, b.OffsetX, t),
      OffsetY: lerpShadowLength(a.OffsetY, b.OffsetY, t),
      Blur: lerpShadowLength(a.Blur, b.Blur, t),
      Spread: lerpShadowLength(a.Spread, b.Spread, t),
      Color: Color.FromNormalized(
        a.Color.R + (b.Color.R - a.Color.R) * t,
        a.Color.G + (b.Color.G - a.Color.G) * t,
        a.Color.B + (b.Color.B - a.Color.B) * t,
        a.Color.A + (b.Color.A - a.Color.A) * t),
      Inset: a.Inset,
    }
  }
}

internal func lerpShadowLength(from Length, to Length, t float32) Length -> Length { Unit: LengthUnit.Px, Value: from.Value + (to.Value - from.Value) * t }

internal func normalizedDefault(value Length) Length -> if value.Unit == LengthUnit.Unset { 0 } else { value }

internal func validateShadowGeometry(typeName string, value Length, name string) Length {
  if value.Unit == LengthUnit.Unset {
    return 0
  }
  if value.Unit == LengthUnit.Auto || value.Unit == LengthUnit.Percent {
    throw ArgumentException(typeName + "." + name + " must use pixel units", name)
  }
  if Double.IsNaN(float64(value.Value)) || Double.IsInfinity(float64(value.Value)) {
    throw ArgumentOutOfRangeException(name)
  }
  return value
}

internal func normalizeShadowBlur(typeName string, value Length) Length {
  let geometry = validateShadowGeometry(typeName, value, "Blur")
  return if geometry.Value < 0.0F { 0 } else { geometry }
}
