package Goo

import System
import System.Runtime.CompilerServices

/// Specifies one immutable text shadow.
public data struct TextShadow {
  private var offsetX Length
  private var offsetY Length
  private var blur Length
  private var color Color

  /// Gets the horizontal offset in pixels.
  public prop OffsetX Length{
    get -> normalizedDefault(offsetX)
    init -> offsetX = validateShadowGeometry("TextShadow", value, "OffsetX")
  }

  /// Gets the vertical offset in pixels.
  public prop OffsetY Length{
    get -> normalizedDefault(offsetY)
    init -> offsetY = validateShadowGeometry("TextShadow", value, "OffsetY")
  }

  /// Gets the non-negative blur radius in pixels.
  public prop Blur Length{
    get -> normalizedDefault(blur)
    init -> blur = normalizeShadowBlur("TextShadow", value)
  }

  /// Gets the shadow color.
  public prop Color Color{
    get -> color
    init -> color = value
  }
}

internal class TextShadowing {
  shared {
    internal func Get(n Node) BoxShadowStack? {
      if !n.HasTextShadowState { return nil }
      if let value = n.TextState?.Shadow { return value }
      n.HasTextShadowState = false
      return nil
    }

    internal func Set(n Node, value BoxShadowStack?) {
      if textShadowCount(value) == 0 {
        if let state = n.TextState { state.Shadow = nil }
        n.HasTextShadowState = false
        return
      }
      let current = Get(n)
      if sameTextShadows(current, value) {
        return
      }
      guard let stack = value else {
        return
      }
      n.EnsureTextState().Shadow = stack
      n.HasTextShadowState = true
    }
  }
}

internal func copyTextShadows(values []TextShadow) BoxShadowStack {
  var visible int32 = 0
  for i in 0 ... values.Length {
    if !transparentTextShadow(values[i]) { visible++ }
  }
  let items = [visible]BoxShadow
  var target int32 = 0
  for i in 0 ... values.Length {
    let normalized = normalizeTextShadow(values[i])
    if normalized.Color.A == 0.0F { continue }
    items[target] = textShadowPayload(normalized)
    target++
  }
  return BoxShadowStack(items)
}

internal func singleTextShadow(value TextShadow) BoxShadowStack {
  let normalized = normalizeTextShadow(value)
  if normalized.Color.A == 0.0F {
    return BoxShadowStack([0]BoxShadow)
  }
  let items = [1]BoxShadow
  items[0] = textShadowPayload(normalized)
  return BoxShadowStack(items)
}

internal func normalizeTextShadow(value TextShadow) TextShadow -> TextShadow {
  OffsetX: value.OffsetX,
  OffsetY: value.OffsetY,
  Blur: value.Blur,
  Color: value.Color,
}

internal func textShadowCount(value BoxShadowStack?) int32 -> boxShadowCount(value)

internal func textShadowAt(value BoxShadowStack?, index int32) TextShadow {
  let shadow = boxShadowAt(value, index)
  return TextShadow{
    OffsetX: shadow.OffsetX,
    OffsetY: shadow.OffsetY,
    Blur: shadow.Blur,
    Color: shadow.Color,
  }
}

internal func sameTextShadows(left BoxShadowStack?, right BoxShadowStack?) bool -> sameBoxShadows(left, right)

private func textShadowPayload(value TextShadow) BoxShadow -> BoxShadow {
  OffsetX: value.OffsetX,
  OffsetY: value.OffsetY,
  Blur: value.Blur,
  Color: value.Color,
}

private func transparentTextShadow(value TextShadow) bool -> normalizeTextShadow(value).Color.A == 0.0F
