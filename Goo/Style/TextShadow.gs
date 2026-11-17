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
    private var values ConditionalWeakTable[Node, BoxShadowStack]?

    internal func Get(n Node) BoxShadowStack? {
      if !n.HasTextShadowState { return nil }
      if let existing = values {
        if existing.TryGetValue(n, out var value) { return value }
      }
      n.HasTextShadowState = false
      return nil
    }

    internal func Set(n Node, value BoxShadowStack?) {
      if textShadowCount(value) == 0 {
        values?.Remove(n)
        n.HasTextShadowState = false
        return
      }
      let current = Get(n)
      if Object.ReferenceEquals(current, value) {
        return
      }
      if current != nil { values?.Remove(n) }
      if values == nil { values = ConditionalWeakTable[Node, BoxShadowStack]() }
      guard let stack = value else {
        return
      }
      values?.Add(n, stack)
      n.HasTextShadowState = true
    }
  }
}

internal func copyTextShadows(values []TextShadow) BoxShadowStack {
  let items = [values.Length]BoxShadow
  for i in 0 ... values.Length {
    items[i] = textShadowPayload(normalizeTextShadow(values[i]))
  }
  return BoxShadowStack(items)
}

internal func singleTextShadow(value TextShadow) BoxShadowStack ->
  BoxShadowStack([]BoxShadow{textShadowPayload(normalizeTextShadow(value))})

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

