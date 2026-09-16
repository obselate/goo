package Goo

import Facebook.Yoga
import System
import System.Collections.Generic

internal class TextEditorResolvedSegment {
  internal prop Source TextRange{ get; init; }
  internal prop DisplayStart int32{ get; init; }
  internal prop DisplayLength int32{ get; init; }
  internal prop CompositionSelectionStart int32{ get; init; }
  internal prop CompositionSelectionEnd int32{ get; init; }
  internal prop Atomic bool{ get; init; }
  internal prop Composition bool{ get; init; }
  internal prop Slot bool{ get; init; }
  internal prop BlockSlot bool{ get; init; }
  internal prop SlotKey string{ get; init; }
  internal prop SlotWidth float32{ get; init; }
  internal prop SlotHeight float32{ get; init; }
  internal prop Style TextResolvedStyle{ get; init; }

  internal init(source TextRange, displayStart int32, displayLength int32,
    atomic bool, style TextResolvedStyle) {
      Source = source
      DisplayStart = displayStart
      DisplayLength = displayLength
      Atomic = atomic
      Style = style
    }

  internal init(source TextRange, displayStart int32, displayLength int32,
    compositionSelectionStart int32, compositionSelectionEnd int32,
    atomic bool, composition bool, slot bool, blockSlot bool, slotKey string,
    slotWidth float32, slotHeight float32, style TextResolvedStyle) {
      Source = source
      DisplayStart = displayStart
      DisplayLength = displayLength
      CompositionSelectionStart = compositionSelectionStart
      CompositionSelectionEnd = compositionSelectionEnd
      Atomic = atomic
      Composition = composition
      Slot = slot
      BlockSlot = blockSlot
      SlotKey = slotKey
      SlotWidth = slotWidth
      SlotHeight = slotHeight
      Style = style
    }
}

internal class TextEditorResolvedParagraph {
  internal prop Source TextRange{ get; init; }
  internal prop Text string{ get; set; }
  internal prop Resolution BidiResolution? { get; set; }
  internal prop BaseStyle TextResolvedStyle? { get; set; }
  internal prop Segments List[TextEditorResolvedSegment]{ get; init; }

  internal init() {
    Text = ""
    Segments = List[TextEditorResolvedSegment]()
  }
}

internal class TextEditorProjection {
  internal prop Range TextRange{ get; init; }
  internal prop Text string{ get; init; }
  internal prop Atomic bool{ get; init; }
  internal prop Composition bool{ get; init; }
  internal prop CompositionSelectionStart int32{ get; init; }
  internal prop CompositionSelectionLength int32{ get; init; }
  internal prop Slot bool{ get; init; }
  internal prop BlockSlot bool{ get; init; }
  internal prop SlotKey string{ get; init; }
  internal prop SlotWidth float32{ get; init; }
  internal prop SlotHeight float32{ get; init; }

  internal init() {
    Text = ""
  }
}

internal class TextEditorVisualLine {
  private var selectionRects List[float32]?
  internal prop Paragraph TextEditorResolvedParagraph{ get; init; }
  internal prop DisplayStart int32{ get; init; }
  internal prop DisplayLength int32{ get; init; }
  internal prop SourceStart int32{ get; init; }
  internal prop SourceEnd int32{ get; init; }
  internal prop Top float32{ get; set; }
  internal prop RelativeTop float32{ get; init; }
  internal prop Height float32{ get; init; }
  internal prop Ascent float32{ get; init; }
  internal prop Descent float32{ get; init; }
  internal prop Shape ShapedText? { get; init; }
  internal prop Runs List[TextPaintRun]{ get; init; }
  internal prop Slots List[TextEditorSlotGeometry]{ get; init; }
  internal prop StyleWidthCorrection float32{ get; set; }

  internal init(paragraph TextEditorResolvedParagraph, displayStart int32,
    displayLength int32, sourceStart int32, sourceEnd int32, top float32,
    height float32, ascent float32, descent float32, shape ShapedText?) {
      Paragraph = paragraph
      DisplayStart = displayStart
      DisplayLength = displayLength
      SourceStart = sourceStart
      SourceEnd = sourceEnd
      Top = top
      RelativeTop = top
      Height = height
      Ascent = ascent
      Descent = descent
      Shape = shape
      Runs = List[TextPaintRun]()
      Slots = List[TextEditorSlotGeometry]()
    }

  internal prop Width float32{
    get {
      var width = if let shape = Shape { shape.Width } else { 0.0F }
      for i in 0 ... Slots.Count {
        let slot = Slots[i]
        width = width + slot.Width - slot.NaturalWidth
      }
      return width + StyleWidthCorrection
    }
  }

  internal func BeginSelectionRects() List[float32] {
    if selectionRects == nil { selectionRects = List[float32]() }
    selectionRects!!.Clear()
    return selectionRects!!
  }
}

internal class TextEditorParagraphLayout {
  internal prop Source TextRange{ get; set; }
  internal prop ConstraintWidth float32{ get; init; }
  internal prop FontFingerprint int32{ get; init; }
  internal prop LineHeight float32{ get; init; }
  internal prop Ascent float32{ get; init; }
  internal prop Descent float32{ get; init; }
  internal prop Width float32{ get; init; }
  internal prop Height float32{ get; init; }
  internal prop Lines List[TextEditorVisualLine]{ get; init; }

  internal init() {
    Lines = List[TextEditorVisualLine]()
  }
}
internal class TextEditorAnalysisCacheEntry {
  internal prop Content string{ get; set; }
  internal prop Fingerprint int32{ get; set; }
  internal prop Resolution BidiResolution? { get; set; }

  internal init() {
    Content = ""
  }
}

internal class TextEditorPresentationStyle {
  internal prop Range TextRange{ get; init; }
  internal prop Declaration Style{ get; init; }
  internal prop Order int32{ get; init; }
  internal prop PrefixMaxEnd int32{ get; set; }
}

internal class TextEditorSlotGeometry {
  internal prop Range TextRange{ get; init; }
  internal prop Key string{ get; init; }
  internal prop DisplayStart int32{ get; init; }
  internal prop DisplayLength int32{ get; init; }
  internal prop X float32{ get; set; }
  internal prop Width float32{ get; init; }
  internal prop NaturalWidth float32{ get; init; }
  internal prop NaturalLeft float32{ get; init; }
  internal prop NaturalRight float32{ get; init; }
  internal prop NaturalStart float32{ get; init; }
  internal prop NaturalEnd float32{ get; init; }
  internal prop LogicalStart float32{ get; set; }
  internal prop LogicalEnd float32{ get; set; }
  internal prop Height float32{ get; init; }
  internal prop Block bool{ get; init; }
}

internal struct TextEditorVisualCaret {
  internal prop X float32{ get; init; }
  internal prop Position TextPosition{ get; init; }
}

internal data struct TextEditorSelectionCursor {
  internal prop Index int32{ get; init; }
  internal prop Written int32{ get; init; }
}

internal class TextEditorVisualLayout {
  internal prop Version int64{ get; set; }
  internal prop DocumentLineCount int32{ get; set; }
  internal prop LayerRevision int64{ get; set; }
  internal prop Width float32{ get; set; }
  internal prop ConstraintWidth float32{ get; set; }
  internal prop HeightConstraint float32{ get; set; }
  internal prop FontFingerprint int32{ get; set; }
  internal prop LineHeight float32{ get; set; }
  internal prop Ascent float32{ get; set; }
  internal prop Descent float32{ get; set; }
  internal prop Height float32{ get; set; }
  internal prop ContentWidth float32{ get; set; }
  internal prop ContentHeight float32{ get; set; }
  internal prop Lines List[TextEditorVisualLine]{ get; init; }

  internal init() {
    Lines = List[TextEditorVisualLine]()
  }
}
