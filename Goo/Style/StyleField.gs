package Goo

// Members stay in field-table order. Each ordinal is a StyleMask bit.
internal enum StyleField {
  Width; Height; MinWidth; MinHeight; MaxWidth; MaxHeight; AspectRatio;
  Padding; PaddingLeft; PaddingTop; PaddingRight; PaddingBottom;
  Margin; MarginLeft; MarginTop; MarginRight; MarginBottom;
  Gap; RowGap; ColumnGap;
  FlexDirection; FlexWrap; JustifyContent; AlignItems; AlignSelf; AlignContent;
  FlexGrow; FlexShrink; FlexBasis;
  Position; Left; Top; Right; Bottom;
  Display; OverflowX; OverflowY;
  BackgroundColor; BorderRadius; BorderTopLeftRadius; BorderTopRightRadius;
  BorderBottomLeftRadius; BorderBottomRightRadius;
  BorderLeftWidth; BorderTopWidth; BorderRightWidth; BorderBottomWidth;
  BorderLeftColor; BorderTopColor; BorderRightColor; BorderBottomColor;
  Opacity;
  BoxShadows;
  Color; FontFamily; FontSize; FontStyle; FontWeight; LetterSpacing; LineHeight; TextAlign;
  BackgroundGradient;
  Cursor;
  ZIndex;
  TextWrap; TextTrimming; TextTransform;
  OutlineWidth; OutlineColor; OutlineOffset;
  Visibility;
  TextDecoration;
  TransformTranslateX; TransformTranslateY; TransformRotate; TransformScale;
  TransformOriginX; TransformOriginY;
  TextShadows;
  ShapeStrokeWidth; ShapeStrokeColor;
  TextMaxLines;
  TextStrokeWidth; TextStrokeColor;
  Direction;
  MarginStart; MarginEnd;
  PaddingStart; PaddingEnd;
  Start; End;
  BorderStartWidth; BorderEndWidth;
  BorderStartColor; BorderEndColor;
  BackgroundImage; BackgroundImageFit;
  ClipPath; ClipPathFit;
  BorderStyle; BlendMode;
  TransformScaleX; TransformScaleY; TransformSkewX; TransformSkewY;
  BackgroundImageSource;
  ClipPathFillRule;
  ShaderEffect
}

internal data struct StyleMask {
  internal var Low uint64
  internal var High uint64
}

private func styleMaskOrdinal(field StyleField) int32 {
  let ordinal = int32(field)
  let styleMaskCapacity int32 = 128
  if ordinal < 0 || ordinal >= styleMaskCapacity {
    throw ArgumentOutOfRangeException("field")
  }
  return ordinal
}

internal func styleMaskWith(mask StyleMask, field StyleField) StyleMask {
  let ordinal = styleMaskOrdinal(field)
  if ordinal < 64 {
    return StyleMask{ Low: mask.Low | (uint64(1) << ordinal), High: mask.High }
  }
  return StyleMask{ Low: mask.Low, High: mask.High | (uint64(1) << (ordinal - 64)) }
}

internal func styleMaskWithout(mask StyleMask, field StyleField) StyleMask {
  let ordinal = styleMaskOrdinal(field)
  if ordinal < 64 {
    return StyleMask{ Low: mask.Low & ^(uint64(1) << ordinal), High: mask.High }
  }
  return StyleMask{ Low: mask.Low, High: mask.High & ^(uint64(1) << (ordinal - 64)) }
}

internal func styleMaskHas(mask StyleMask, field StyleField) bool {
  let ordinal = styleMaskOrdinal(field)
  return if ordinal < 64 { (mask.Low & (uint64(1) << ordinal)) != uint64(0) } else { (mask.High & (uint64(1) << (ordinal - 64))) != uint64(0) }
}

internal func styleMaskUnion(left StyleMask, right StyleMask) StyleMask -> StyleMask { Low: left.Low | right.Low, High: left.High | right.High }

internal func styleMaskExcept(left StyleMask, right StyleMask) StyleMask -> StyleMask { Low: left.Low & ^right.Low, High: left.High & ^right.High }

internal func styleMaskEmpty(mask StyleMask) bool -> mask.Low == uint64(0) && mask.High == uint64(0)

internal data struct StyleEntry {
  internal var Field StyleField
  internal var A float32
  internal var B float32
  internal var C float32
  internal var D float32
  internal var Payload object?
}

internal class StyleEntryBlock {
  private var first StyleEntry
  private var second StyleEntry
  private var third StyleEntry
  private var fourth StyleEntry
  internal var Next StyleEntryBlock?

  internal func Add(index int32, value StyleEntry) {
    switch index {
      case 0 { first = value }
      case 1 { second = value }
      case 2 { third = value }
      case 3 { fourth = value }
      default { throw ArgumentOutOfRangeException("index") }
    }
  }

  internal func At(index int32) StyleEntry -> switch index {
    case 0: first
    case 1: second
    case 2: third
    case 3: fourth
    default: throw ArgumentOutOfRangeException("index")
  }
}

internal class StyleEntries {
  private var first StyleEntry
  private var second StyleEntry
  private var third StyleEntry
  private var fourth StyleEntry
  private var spillLast StyleEntryBlock?
  private var count int32

  internal prop Count int32{ get -> count }

  internal func Add(value StyleEntry) {
    switch count {
      case 0 { first = value }
      case 1 { second = value }
      case 2 { third = value }
      case 3 { fourth = value }
      default {
        let spillIndex = count - 4
        let slot = spillIndex % 4
        if slot == 0 {
          let block = StyleEntryBlock{}
          if spillLast == nil {
            block.Next = block
          } else {
            block.Next = spillLast!!.Next
            spillLast!!.Next = block
          }
          spillLast = block
        }
        guard let block = spillLast else { throw InvalidOperationException("missing style spill") }
        block.Add(slot, value)
      }
    }
    count++
  }

  internal func AddRange(values StyleEntries) {
    let sourceCount = values.Count
    for i in 0 ... sourceCount {
      Add(values.At(i))
    }
  }

  internal func At(index int32) StyleEntry {
    if index < 0 || index >= count { throw ArgumentOutOfRangeException("index") }
    switch index {
      case 0 { return first }
      case 1 { return second }
      case 2 { return third }
      case 3 { return fourth }
      default {
        var blockIndex = (index - 4) / 4
        guard let tail = spillLast else { throw InvalidOperationException("missing style spill") }
        var block = tail.Next
        while blockIndex > 0 {
          guard let current = block else { throw InvalidOperationException("missing style spill") }
          block = current.Next
          blockIndex--
        }
        guard let current = block else { throw InvalidOperationException("missing style spill") }
        return current.At((index - 4) % 4)
      }
    }
  }
}

internal func entryText(entry StyleEntry) string ? -> entry.Payload as string?

internal func entryGradient(entry StyleEntry) Gradient ? -> switch entry.Payload {
  case value is Gradient: value
  case _: nil
}

internal func entryShadows(entry StyleEntry) BoxShadowStack ? -> switch entry.Payload {
  case value is BoxShadowStack: value
  case _: nil
}

internal func entryPath(entry StyleEntry) VectorPath -> switch entry.Payload {
  case value is VectorPathData: VectorPath { payload: value }
  case _: VectorPath.Empty
}

internal func entryImageSource(entry StyleEntry) ImageSourceProvider ? -> entry.Payload as ImageSourceProvider?

internal func entryShaderEffect(entry StyleEntry) ShaderEffect ? -> entry.Payload as ShaderEffect?

internal func sameStyleEntry(left StyleEntry, right StyleEntry) bool {
  if left.A != right.A || left.B != right.B || left.C != right.C || left.D != right.D {
    return false
  }
  if Object.ReferenceEquals(left.Payload, right.Payload) { return true }
  return entryText(left) == entryText(right)
    && sameGradient(entryGradient(left), entryGradient(right))
    && sameBoxShadows(entryShadows(left), entryShadows(right))
    && samePath(entryPath(left), entryPath(right))
    && entryImageSource(left) == entryImageSource(right)
    && entryShaderEffect(left) == entryShaderEffect(right)
}

internal func samePath(left VectorPath, right VectorPath) bool {
  if left.payload == right.payload { return true }
  guard let data = left.payload else { return false }
  return data.Equals(right.payload)
}
