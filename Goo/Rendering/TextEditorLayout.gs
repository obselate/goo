package Goo

import System
import System.Collections.Generic
import Facebook.Yoga

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

internal sealed class TextEditorRenderState : IDisposable {
  private let node Node
  private let document TextDocument
  private let controller TextEditorController
  private let retainedInvalidated Action[ReconcileEffects]?
  private var layers []TextPresentationLayer
  private let paragraphs List[TextEditorParagraphLayout]
  private let analyses List[TextEditorAnalysisCacheEntry]
  private let layoutScratch TextEditorVisualLayout
  private let paragraphLayoutScratch TextEditorVisualLayout
  private let projectionScratch List[TextEditorProjection]
  private let styleScratch List[TextEditorPresentationStyle]
  private let paragraphProjectionScratch List[TextEditorProjection]
  private let paragraphStyleScratch List[TextEditorPresentationStyle]
  private let usedParagraphScratch List[TextEditorParagraphLayout]
  private let usedParagraphSet HashSet[TextEditorParagraphLayout]
  private var placeholderText string
  private var placeholderFingerprint int32
  private var baseStyle TextResolvedStyle?
  private var baseStyleFingerprint int32
  private var composition TextComposition?
  private var scrollTargetX float64
  private var scrollTargetY float64
  private var disposed bool

  internal prop ReadOnly bool{ get; set; }
  internal prop Layout TextEditorVisualLayout? { get; set; }
  internal prop Dirty bool{ get; set; }
  internal prop PlaceholderShape ShapedText? { get; set; }

  internal init(node Node, document TextDocument, controller TextEditorController,
    layers []TextPresentationLayer, readOnly bool, retainedInvalidated Action[ReconcileEffects]?) {
      this.node = node
      this.document = document
      this.controller = controller
      this.retainedInvalidated = retainedInvalidated
      this.layers = copyEditorLayers(layers)
      paragraphs = List[TextEditorParagraphLayout]()
      analyses = List[TextEditorAnalysisCacheEntry]()
      layoutScratch = TextEditorVisualLayout()
      paragraphLayoutScratch = TextEditorVisualLayout()
      projectionScratch = List[TextEditorProjection]()
      styleScratch = List[TextEditorPresentationStyle]()
      paragraphProjectionScratch = List[TextEditorProjection]()
      paragraphStyleScratch = List[TextEditorPresentationStyle]()
      usedParagraphScratch = List[TextEditorParagraphLayout]()
      usedParagraphSet = HashSet[TextEditorParagraphLayout]()
      placeholderText = ""
      composition = controller.Composition
      scrollTargetX = controller.ScrollTargetX
      scrollTargetY = controller.ScrollTargetY
      ReadOnly = readOnly
      Dirty = true
      document.Changed += onDocumentChanged
      controller.Changed = onControllerChanged
      controller.Submitted = onSubmitted
      TextEditorLayerBindings.Register(this)
    }

  internal prop Document TextDocument{ get -> document }
  internal prop Controller TextEditorController{ get -> controller }
  internal prop LayerCount int32{ get -> layers.Length }
  internal func Layer(index int32) TextPresentationLayer -> layers[index]
  internal func MatchesLayers(values []TextPresentationLayer) bool -> sameArray(layers, values)
  internal prop ParagraphCacheCount int32{ get -> paragraphs.Count }

  internal func BaseStyle(n Node, fingerprint int32) TextResolvedStyle {
    if let current = baseStyle {
      if baseStyleFingerprint == fingerprint { return current }
    }
    let next = TextResolvedStyles.Base(n)
    baseStyle = next
    baseStyleFingerprint = fingerprint
    return next
  }

  internal func BeginLayout() TextEditorVisualLayout -> beginLayout(layoutScratch)

  internal func BeginParagraphLayout() TextEditorVisualLayout -> beginLayout(paragraphLayoutScratch)

  internal func BeginProjections() List[TextEditorProjection] -> beginScratch(projectionScratch)

  internal func BeginStyles() List[TextEditorPresentationStyle] -> beginScratch(styleScratch)

  internal func BeginParagraphProjections() List[TextEditorProjection] -> beginScratch(paragraphProjectionScratch)

  internal func BeginParagraphStyles() List[TextEditorPresentationStyle] -> beginScratch(paragraphStyleScratch)

  internal func BeginUsedParagraphs() List[TextEditorParagraphLayout] -> beginScratch(usedParagraphScratch)

  private func beginLayout(scratch TextEditorVisualLayout) TextEditorVisualLayout {
    scratch.Lines.Clear()
    return scratch
  }

  private func beginScratch[T](scratch List[T]) List[T] {
    scratch.Clear()
    return scratch
  }

  internal func Paragraph(source TextRange, width float32, fingerprint int32,
    lineHeight float32, ascent float32, descent float32) TextEditorParagraphLayout? {
      for i in 0 ... paragraphs.Count {
        let value = paragraphs[i]
        if value.Source == source
          && matchesLayoutConstraint(value, width, fingerprint, lineHeight, ascent, descent) {
            paragraphs.RemoveAt(i)
            paragraphs.Add(value)
            return value
          }
      }
      return nil
    }

  internal func ParagraphHeight(source TextRange, width float32, fingerprint int32,
    lineHeight float32, ascent float32, descent float32) float32? {
      if let value = Paragraph(source, width, fingerprint, lineHeight, ascent, descent) {
        return value.Height
      }
      return nil
    }

  internal func ParagraphHeightForLine(snapshot TextSnapshot, line int32, width float32,
    fingerprint int32, lineHeight float32, ascent float32, descent float32) float32? {
      for value in paragraphs {
        if !matchesLayoutConstraint(value, width, fingerprint, lineHeight, ascent, descent) { continue }
        if snapshot.GetLineIndex(value.Source.Start) == line { return value.Height }
      }
      return nil
    }

  internal func HeightAdjustmentBefore(snapshot TextSnapshot, target int32, width float32,
    fingerprint int32, lineHeight float32, ascent float32, descent float32) float32{
      var adjustment = 0.0F
      for value in paragraphs {
        if !matchesLayoutConstraint(value, width, fingerprint, lineHeight, ascent, descent) { continue }
        if snapshot.GetLineIndex(value.Source.Start) < target {
          adjustment = adjustment + value.Height - lineHeight
        }
      }
      return adjustment
    }

  private func matchesLayoutConstraint(value TextEditorParagraphLayout, width float32,
    fingerprint int32, lineHeight float32, ascent float32, descent float32) bool -> value.ConstraintWidth == width && value.FontFingerprint == fingerprint
    && value.LineHeight == lineHeight && value.Ascent == ascent && value.Descent == descent

  internal func AddParagraph(value TextEditorParagraphLayout) { paragraphs.Add(value) }

  internal func ParagraphResolution(n Node, content string, fingerprint int32) BidiResolution? {
    for i in 0 ... analyses.Count {
      let value = analyses[i]
      if value.Content == content && value.Fingerprint == fingerprint {
        analyses.RemoveAt(i)
        analyses.Add(value)
        return value.Resolution
      }
    }
    let value = if analyses.Count == 64 { analyses[0] } else { TextEditorAnalysisCacheEntry() }
    if analyses.Count == 64 { analyses.RemoveAt(0) }
    value.Content = content
    value.Fingerprint = fingerprint
    value.Resolution = TextShaping.ResolveParagraph(content, int32(n.Direction))
    analyses.Add(value)
    return value.Resolution
  }

  internal func TrimParagraphs(used List[TextEditorParagraphLayout]) {
    let limit = used.Count + 64
    usedParagraphSet.Clear()
    for value in used { usedParagraphSet.Add(value) }
    var i int32 = 0
    while paragraphs.Count > limit && i < paragraphs.Count {
      let value = paragraphs[i]
      if usedParagraphSet.Contains(value) {
        i++
      } else {
        paragraphs.RemoveAt(i)
        TextEditorLayouts.disposeParagraph(value)
      }
    }
  }

  internal func InvalidateParagraphs(textRange TextRange) {
    for var i = paragraphs.Count - 1; i >= 0; i-- {
      if rangesEditorTouch(paragraphs[i].Source, textRange) {
        TextEditorLayouts.disposeParagraph(paragraphs[i])
        paragraphs.RemoveAt(i)
      }
    }
  }

  internal func RebaseParagraphs(change TextDocumentChange) {
    for var i = paragraphs.Count - 1; i >= 0; i-- {
      let paragraph = paragraphs[i]
      if paragraphChanged(paragraph.Source, change.Changes) {
        TextEditorLayouts.disposeParagraph(paragraph)
        paragraphs.RemoveAt(i)
      } else {
        paragraph.Source = rebaseTextRange(paragraph.Source, change.Changes)
      }
    }
  }

  internal func ClearParagraphs() {
    for paragraph in paragraphs { TextEditorLayouts.disposeParagraph(paragraph) }
    paragraphs.Clear()
  }

  internal func Placeholder(n Node) ShapedText? {
    if n.Placeholder == "" { return nil }
    let spacing = n.LetterSpacing.Px
    let fingerprint = n.Placeholder.GetHashCode() ^ n.FontFamily.GetHashCode()
    ^int32(TextLayouts.fontSize(n)) ^ int32(n.FontWeight) ^ int32(n.FontStyle)
    ^int32(spacing) ^ int32(n.Direction)
    if PlaceholderShape == nil || placeholderText != n.Placeholder || placeholderFingerprint != fingerprint {
      PlaceholderShape?.Dispose()
      PlaceholderShape = TextAnalyses.ShapeEntry(n, n.Placeholder)
      placeholderText = n.Placeholder
      placeholderFingerprint = fingerprint
    }
    return PlaceholderShape
  }

  internal func SlotSize(key string, width float32) Rect {
    for child in node.Children {
      if child.EditorSlotKey != key { continue }
      guard let yoga = child.Yoga else { break }
      let availableWidth = child.EditorSlotBlock ? width : Single.NaN
      YGNodeAPI.YGNodeCalculateLayout(yoga, availableWidth, Single.NaN,
        yogaDirection(node.Direction))
      return Rect{ W: YGNodeLayoutAPI.YGNodeLayoutGetWidth(yoga),
        H: YGNodeLayoutAPI.YGNodeLayoutGetHeight(yoga) }
    }
    return Rect{}
  }

  internal func Apply(nextLayers []TextPresentationLayer, readOnly bool) {
    if !sameArray(layers, nextLayers) {
      TextEditorLayerBindings.Unregister(this)
      layers = copyEditorLayers(nextLayers)
      TextEditorLayerBindings.Register(this)
      ClearParagraphs()
      invalidate(true)
    }
    ReadOnly = readOnly
  }

  public func Dispose() {
    if disposed {
      return
    }
    disposed = true
    document.Changed -= onDocumentChanged
    controller.Changed = nil
    controller.Submitted = nil
    TextEditorLayerBindings.Unregister(this)
    ClearParagraphs()
    analyses.Clear()
    PlaceholderShape?.Dispose()
    PlaceholderShape = nil
    Layout = nil
    controller.Detach(node)
  }

  private func onDocumentChanged(change TextDocumentChange) {
    node.EditorOnChange?.Invoke(change)
    RebaseParagraphs(change)
    if !retainLayoutAfter(change) { invalidate(true) }
    requestIntrinsicInvalidation()
  }

  private func retainLayoutAfter(change TextDocumentChange) bool {
    guard let layout = Layout else { return false }
    if Dirty || layout.HeightConstraint < 0.0F || layout.Lines.Count == 0 { return false }
    var sourceEnd int32 = 0
    for line in layout.Lines {
      if line.SourceEnd > sourceEnd { sourceEnd = line.SourceEnd }
    }
    for item in change.Changes {
      if item.Range.Start <= sourceEnd { return false }
    }
    let lineCount = document.LineCount
    layout.ContentHeight = layout.ContentHeight
    +float32(lineCount - layout.DocumentLineCount) * layout.LineHeight
    layout.DocumentLineCount = lineCount
    layout.Version = change.AfterVersion
    return true
  }

  internal func LayerChanged(change TextPresentationLayerChange) {
    if change.All { ClearParagraphs() }
    else { InvalidateParagraphs(change.Range) }
    refreshSlotMetadata()
    invalidate(true)
    if change.SlotChildrenChanged { requestRebuild() }
    requestIntrinsicInvalidation()
  }

  private func refreshSlotMetadata() {
    for child in node.Children {
      if child.EditorSlotKey == "" { continue }
      if !refreshSlotMetadata(child) { child.Visibility = Visibility.Hidden }
    }
  }

  private func refreshSlotMetadata(child Node) bool {
    for layerIndex in 0 ... layers.Length {
      let layer = layers[layerIndex]
      for projection in layer.ReadProjections() {
        if projection.Kind != TextProjectionKind.InlineSlot
          && projection.Kind != TextProjectionKind.BlockSlot{ continue }
        if child.EditorSlotKey != textEditorSlotKey(layer, projection) { continue }
        child.EditorSlotRange = projection.Range
        child.EditorSlotBlock = projection.Kind == TextProjectionKind.BlockSlot
        return true
      }
    }
    return false
  }

  private func onControllerChanged() {
    let current = controller.Composition
    let intrinsic = !sameEditorComposition(composition, current)
    let scrollChanged = scrollTargetX != controller.ScrollTargetX
      || scrollTargetY != controller.ScrollTargetY
    if intrinsic {
      if let previous = composition { InvalidateParagraphs(previous.Range) }
      if let next = current { InvalidateParagraphs(next.Range) }
    }
    composition = current
    scrollTargetX = controller.ScrollTargetX
    scrollTargetY = controller.ScrollTargetY
    node.BlinkT = 0.0
    if intrinsic {
      invalidate(true)
      requestIntrinsicInvalidation()
    } else if scrollChanged {
      invalidate(false)
      requestInvalidation(ReconcileEffects.Paint | ReconcileEffects.Input | ReconcileEffects.Rect)
    } else {
      requestInvalidation(ReconcileEffects.Paint | ReconcileEffects.Input)
    }
  }

  private func onSubmitted() {
    node.EditorOnSubmit?.Invoke()
  }

  private func invalidate(intrinsic bool) {
    Dirty = true
    Layout = nil
    if intrinsic && !(node.Width.HasMagnitude && node.Height.HasMagnitude) {
      if let yoga = node.Yoga { YGNodeAPI.YGNodeMarkDirty(yoga) }
    }
  }

  private func requestIntrinsicInvalidation() {
    var effects = ReconcileEffects.Content | ReconcileEffects.Paint
    | ReconcileEffects.Input | ReconcileEffects.Rect
    if !(node.Width.HasMagnitude && node.Height.HasMagnitude) {
      effects = ReconcileEffects(int32(effects) | int32(ReconcileEffects.Layout))
    }
    requestInvalidation(effects)
  }

  private func requestInvalidation(e ReconcileEffects) {
    if let callback = retainedInvalidated {
      callback(e)
      return
    }
    requestRebuild()
  }

  private func requestRebuild() {
    var current Node? = node
    while current != nil {
      let value = current!!
      if let cell = value.Fiber {
        cell.Rebuild()
        return
      }
      current = value.Parent
    }
  }
}

internal class TextEditorLayouts {
  shared {
    private let projectionSortKey Func[TextEditorProjection, float64] =
    (value TextEditorProjection) -> float64(value.Range.Start)
    private let styleSortKey Func[TextEditorPresentationStyle, float64] =
    (value TextEditorPresentationStyle) -> float64(value.Range.Start)
    private let slotSortKey Func[TextEditorSlotGeometry, float64] =
    (value TextEditorSlotGeometry) -> float64(value.NaturalLeft)
    private let caretSortKey Func[TextEditorVisualCaret, float64] =
    (value TextEditorVisualCaret) -> float64(value.X)
    private let orderSortKey Func[TextEditorPresentationStyle, float64] =
    (value TextEditorPresentationStyle) -> float64(value.Order)

    private func sortEditorItems[T any](values List[T], key Func[T, float64]) {
      for var i = 1; i < values.Count; i++ {
        let value = values[i]
        let valueKey = key(value)
        var j = i
        while j > 0 && key(values[j - 1]) > valueKey {
          values[j] = values[j - 1]
          j--
        }
        values[j] = value
      }
    }

    internal func ExpandAtomicRange(n Node, textRange TextRange) TextRange {
      if textRange.Length == 0 { return textRange }
      guard let state = n.EditorState else { return textRange }
      var start = textRange.Start
      var end = textRange.Start + textRange.Length
      var expanded = true
      while expanded {
        expanded = false
        for layerIndex in 0 ... state.LayerCount {
          for projection in state.Layer(layerIndex).ReadProjections() {
            let projectionEnd = projection.Range.Start + projection.Range.Length
            if start >= projectionEnd || projection.Range.Start >= end { continue }
            if projection.Range.Start < start {
              start = projection.Range.Start
              expanded = true
            }
            if projectionEnd > end {
              end = projectionEnd
              expanded = true
            }
          }
        }
      }
      return TextRange{ Start: start, Length: end - start }
    }

    internal func For(n Node, width float32, height float32) TextEditorVisualLayout {
      guard let state = n.EditorState else {
        throw InvalidOperationException("Text editor node has no render state")
      }
      let revision = editorLayerRevision(state)
      if let cached = state.Layout {
        if !state.Dirty && cached.Version == state.Document.Version && cached.LayerRevision == revision
          && cached.ConstraintWidth == width && cached.HeightConstraint == height{
            return cached
          }
      }
      let fingerprint = editorFontFingerprint(n)
      let snapshot = state.Document.Snapshot()
      let layout = build(n, state, snapshot, width, height, revision, fingerprint)
      state.Layout = layout
      state.Dirty = false
      if n.HasElementHandle {
        warmGeometry(layout)
      }
      return layout
    }

    private func warmGeometry(layout TextEditorVisualLayout) {
      for line in layout.Lines {
        line.Shape?.PrepareGeometry()
        for run in line.Runs {
          run.Shape?.PrepareGeometry()
        }
      }
    }

    internal func Invalidate(n Node) {
      if let state = n.EditorState {
        state.Dirty = true
        state.Layout = nil
      }
      if !(n.Width.Unit == LengthUnit.Px && n.Height.Unit == LengthUnit.Px) {
        if let yoga = n.Yoga { YGNodeAPI.YGNodeMarkDirty(yoga) }
      }
    }

    internal func Dispose(n Node) {
      if let state = n.EditorState {
        n.EditorState = nil
        state.Dispose()
      }
      n.EditorController = nil
    }

    internal func dispose(layout TextEditorVisualLayout?) {
      if let value = layout { disposeLines(value.Lines) }
    }

    internal func disposeParagraph(value TextEditorParagraphLayout) {
      disposeLines(value.Lines)
    }

    private func disposeLines(lines List[TextEditorVisualLine]) {
      for line in lines {
        line.Shape?.Dispose()
        for run in line.Runs { run.Shape?.Dispose() }
      }
    }

    internal func Measure(yoga Facebook.Yoga.Node, width float32, widthMode MeasureMode,
      height float32, heightMode MeasureMode) YGSize{
        let n = nodeFromYoga(yoga)
        let constraint = widthMode == MeasureMode.Undefined ? -1.0F : width
        let heightConstraint = heightMode == MeasureMode.Undefined ? -1.0F : height
        let layout = For(n, constraint, heightConstraint)
        return TextLayouts.clampMeasuredSize(layout.Width, layout.Height, width, widthMode, height, heightMode)
      }

    internal func CaretRect(n Node, position TextPosition) Rect {
      let width = TextLayouts.ContentWidth(n)
      let height = TextLayouts.ContentHeight(n)
      let layout = For(n, width, height)
      return CaretRect(n, layout, position)
    }

    internal func TryCaretRectForGeometry(n Node, position TextPosition,
      out rect Rect) bool{
        rect = Rect{}
        if position.Offset < 0 || !validTextAffinity(position.Affinity) { return false }
        guard let state = n.EditorState else { return false }
        if position.Offset > state.Document.Length { return false }
        guard let layout = CurrentForGeometry(n) else { return false }
        guard let line = LineForPosition(layout, position) else { return false }
        if position.Offset < line.SourceStart || position.Offset > line.SourceEnd { return false }
        rect = CaretRect(n, layout, position)
        return true
      }

    private func CaretRect(n Node, layout TextEditorVisualLayout,
      position TextPosition) Rect{
        let width = TextLayouts.ContentWidth(n)
        let contentLeft = TextLayouts.ContentLeft(n) - n.Rect.X
        let contentTop = TextLayouts.ContentTop(n) - n.Rect.Y
        let scroll = if let state = n.EditorState { float32(state.Controller.ScrollTargetY) } else { 0.0F }
        let line = LineForPosition(layout, position)
        guard let visual = line else {
          return Rect{ X: contentLeft, Y: contentTop, W: 1.5F, H: layout.LineHeight }
        }
        let index = DisplayOffsetForSource(visual.Paragraph, position.Offset, position.Affinity)
        -visual.DisplayStart
        let x = CaretX(visual, index, position.Affinity)
        let aligned = editorLineOffset(n, visual, width)
        let scrollX = if let state = n.EditorState { float32(state.Controller.ScrollTargetX) } else { 0.0F }
        return Rect{ X: contentLeft + aligned + x - scrollX, Y: contentTop + visual.Top - scroll,
          W: 1.5F, H: visual.Height }
      }

    internal func CompositionCaretRect(n Node, composition TextComposition) Rect {
      if let selected = composition.EffectiveSelection {
        let offset = selected.Active.Offset
        let end = composition.Range.Start + composition.Text.Length
        if offset < composition.Range.Start || offset > end {
          let source = offset <= composition.Range.Start ? offset : offset - composition.Text.Length + composition.Range.Length
          return CaretRect(n, TextPosition{ Offset: source, Affinity: selected.Active.Affinity })
        }
      }
      let width = TextLayouts.ContentWidth(n)
      let height = TextLayouts.ContentHeight(n)
      let layout = For(n, width, height)
      let contentLeft = TextLayouts.ContentLeft(n) - n.Rect.X
      let contentTop = TextLayouts.ContentTop(n) - n.Rect.Y
      let scrollY = if let state = n.EditorState { float32(state.Controller.ScrollTargetY) } else { 0.0F }
      let scrollX = if let state = n.EditorState { float32(state.Controller.ScrollTargetX) } else { 0.0F }
      var lineIndex int32 = 0
      while lineIndex < layout.Lines.Count {
        let line = layout.Lines[lineIndex]
        var caret int32 = 0
        if !CompositionCaretDisplayIndex(line, composition, out caret) {
          lineIndex = lineIndex + 1
          continue
        }
        if caret == line.DisplayLength && lineIndex + 1 < layout.Lines.Count {
          let next = layout.Lines[lineIndex + 1]
          if next.Paragraph == line.Paragraph && next.DisplayStart == line.DisplayStart + line.DisplayLength {
            lineIndex = lineIndex + 1
            continue
          }
        }
        let x = CaretX(line, caret, TextAffinity.Downstream)
        let aligned = editorLineOffset(n, line, width)
        return Rect{ X: contentLeft + aligned + x - scrollX,
          Y: contentTop + line.Top - scrollY, W: 1.5F, H: line.Height }
      }
      return CaretRect(n, TextPosition{ Offset: composition.Range.Start,
        Affinity: TextAffinity.Downstream })
    }

    private func CompositionCaretDisplayIndex(line TextEditorVisualLine,
      composition TextComposition, out index int32) bool{
        index = 0
        for segment in line.Paragraph.Segments {
          if !segment.Composition || segment.Source.Start != composition.Range.Start
            || segment.Source.Length != composition.Range.Length{ continue }
          let caretOffset = if let selected = composition.EffectiveSelection {
            transformedCompositionOffset(composition.Text,
              selected.Active.Offset - composition.Range.Start, segment.Style.Transform)
          } else { segment.CompositionSelectionStart }
          let absolute = segment.DisplayStart + caretOffset
          if absolute < line.DisplayStart
            || absolute > line.DisplayStart + line.DisplayLength{ return false }
          index = absolute - line.DisplayStart
          return true
        }
        return false
      }

    internal func CompositionDisplayRange(line TextEditorVisualLine,
      composition TextComposition, out start int32, out end int32) bool{
        start = 0
        end = 0
        for segment in line.Paragraph.Segments {
          if !segment.Composition || segment.Source.Start != composition.Range.Start
            || segment.Source.Length != composition.Range.Length{ continue }
          var displayStart = segment.DisplayStart + segment.CompositionSelectionStart
          var displayEnd = segment.DisplayStart + segment.CompositionSelectionEnd
          let segmentEnd = segment.DisplayStart + segment.DisplayLength
          if displayStart < segment.DisplayStart { displayStart = segment.DisplayStart }
          if displayStart > segmentEnd { displayStart = segmentEnd }
          if displayEnd < displayStart { displayEnd = displayStart }
          if displayEnd > segmentEnd { displayEnd = segmentEnd }
          start = displayStart - line.DisplayStart
          end = displayEnd - line.DisplayStart
          if start < 0 { start = 0 }
          if end < 0 { end = 0 }
          if start > line.DisplayLength { start = line.DisplayLength }
          if end > line.DisplayLength { end = line.DisplayLength }
          return true
        }
        return false
      }

    internal func SyncScroll(n Node) {
      if let state = n.EditorState {
        let layout = For(n, TextLayouts.ContentWidth(n), TextLayouts.ContentHeight(n))
        n.ContentW = layout.ContentWidth > n.Rect.W ? layout.ContentWidth : n.Rect.W
        n.ContentH = layout.ContentHeight > n.Rect.H ? layout.ContentHeight : n.Rect.H
        let current = state.Controller.State()
        let maxX = n.ContentW - n.Rect.W
        let maxY = n.ContentH - n.Rect.H
        let x = clampOffset(float32(current.ScrollTargetX), maxX)
        let y = clampOffset(float32(current.ScrollTargetY), maxY)
        n.ScrollTargetX = x
        n.ScrollTargetY = y
        n.ScrollX = x
        n.ScrollY = y
        if x != float32(current.ScrollTargetX) || y != float32(current.ScrollTargetY) {
          state.Controller.ScrollTo(float64(x), float64(y))
        }
      }
    }

    internal func ScrollBy(n Node, dx float32, dy float32) bool {
      guard let state = n.EditorState else { return false }
      SyncScroll(n)
      let current = state.Controller.State()
      let x = clampOffset(float32(current.ScrollTargetX) + dx, maxScrollX(n))
      let y = clampOffset(float32(current.ScrollTargetY) + dy, maxScrollY(n))
      if x == float32(current.ScrollTargetX) && y == float32(current.ScrollTargetY) { return false }
      state.Controller.ScrollTo(float64(x), float64(y))
      n.ScrollTargetX = x
      n.ScrollTargetY = y
      n.ScrollX = x
      n.ScrollY = y
      return true
    }

    internal func FollowCaret(n Node, position TextPosition) {
      if let state = n.EditorState {
        var current = state.Controller.State()
        let initial = For(n, TextLayouts.ContentWidth(n), TextLayouts.ContentHeight(n))
        var visible = false
        for line in initial.Lines {
          if position.Offset >= line.SourceStart && position.Offset <= line.SourceEnd {
            visible = true
            break
          }
        }
        if !visible {
          let snapshot = state.Document.Snapshot()
          let line = snapshot.GetLineIndex(position.Offset)
          let y = verticalOffsetForLine(state, snapshot, line, initial.ConstraintWidth,
            initial.FontFingerprint, initial.LineHeight, initial.Ascent, initial.Descent)
          state.Controller.ScrollTo(current.ScrollTargetX, float64(y))
          current = state.Controller.State()
        }
        let rect = CaretRect(n, position)
        let left = TextLayouts.ContentLeft(n) - n.Rect.X
        let top = TextLayouts.ContentTop(n) - n.Rect.Y
        let right = left + TextLayouts.ContentWidth(n)
        let bottom = top + TextLayouts.ContentHeight(n)
        let logicalLeft = rect.X + float32(current.ScrollTargetX)
        let logicalTop = rect.Y + float32(current.ScrollTargetY)
        var x = float32(current.ScrollTargetX)
        var y = float32(current.ScrollTargetY)
        if logicalLeft < x + left { x = logicalLeft - left }
        else if logicalLeft + rect.W > x + right { x = logicalLeft + rect.W - right }
        if logicalTop < y + top { y = logicalTop - top }
        else if logicalTop + rect.H > y + bottom { y = logicalTop + rect.H - bottom }
        SyncScroll(n)
        x = clampOffset(x, maxScrollX(n))
        y = clampOffset(y, maxScrollY(n))
        if x != float32(current.ScrollTargetX) || y != float32(current.ScrollTargetY) {
          state.Controller.ScrollTo(float64(x), float64(y))
        }
      }
    }

    internal func SlotOrigin(n Node, key string) Rect? {
      let width = TextLayouts.ContentWidth(n)
      let layout = For(n, width, TextLayouts.ContentHeight(n))
      let left = TextLayouts.ContentLeft(n) - n.Rect.X
      let top = TextLayouts.ContentTop(n) - n.Rect.Y
      let scrollX = if let state = n.EditorState { float32(state.Controller.ScrollTargetX) } else { 0.0F }
      let scrollY = if let state = n.EditorState { float32(state.Controller.ScrollTargetY) } else { 0.0F }
      for line in layout.Lines {
        for slot in line.Slots {
          if slot.Key != key { continue }
          let x = slot.Block ? left : left + editorLineOffset(n, line, width) + slot.X - scrollX
          let y = top + line.Top - scrollY
          let contentHeight = TextLayouts.ContentHeight(n)
          if x + slot.Width <= left || x >= left + width
            || y + slot.Height <= top || y >= top + contentHeight{ return nil }
          return Rect{ X: x, Y: y, W: slot.Width, H: slot.Height }
        }
      }
      return nil
    }

    internal func HitTest(n Node, localX float32, localY float32) TextPosition {
      let width = TextLayouts.ContentWidth(n)
      let height = TextLayouts.ContentHeight(n)
      let layout = For(n, width, height)
      return HitTest(n, layout, localX, localY)
    }

    internal func TryHitTestForGeometry(n Node, localX float32, localY float32,
      out position TextPosition) bool{
        position = TextPosition{}
        guard let layout = CurrentForGeometry(n) else { return false }
        position = HitTest(n, layout, localX, localY)
        return true
      }

    internal func CurrentForGeometry(n Node) TextEditorVisualLayout? {
      guard let state = n.EditorState, let layout = state.Layout else { return nil }
      if state.Dirty || layout.Version != state.Document.Version
        || layout.ConstraintWidth != TextLayouts.ContentWidth(n)
        || layout.HeightConstraint != TextLayouts.ContentHeight(n) {
          return nil
        }
      return layout
    }

    internal func PrepareCurrentGeometry(n Node) {
      if let layout = CurrentForGeometry(n) {
        warmGeometry(layout)
      }
    }

    private func validTextAffinity(value TextAffinity) bool -> value == TextAffinity.Upstream || value == TextAffinity.Downstream

    private func HitTest(n Node, layout TextEditorVisualLayout, localX float32,
      localY float32) TextPosition{
        let width = TextLayouts.ContentWidth(n)
        let contentLeft = TextLayouts.ContentLeft(n) - n.Rect.X
        let contentTop = TextLayouts.ContentTop(n) - n.Rect.Y
        let state = n.EditorState!!
        let x = localX - contentLeft + float32(state.Controller.ScrollTargetX)
        let y = localY - contentTop + float32(state.Controller.ScrollTargetY)
        var selected TextEditorVisualLine? = nil
        for i in 0 ... layout.Lines.Count {
          let line = layout.Lines[i]
          if y >= line.Top && y < line.Top + line.Height {
            selected = line
            break
          }
        }
        if selected == nil && layout.Lines.Count > 0 {
          selected = y < layout.Lines[0].Top ? layout.Lines[0] : layout.Lines[layout.Lines.Count - 1]
        }
        guard let line = selected else {
          return TextPosition{ Offset: 0, Affinity: TextAffinity.Downstream }
        }
        let hitX = x - editorLineOffset(n, line, width)
        let hit = HitTest(line, hitX)
        let display = line.DisplayStart + hit.Index
        return TextPosition{ Offset: SourceOffsetForDisplay(line.Paragraph, display,
          TextAffinity(hit.Affinity)), Affinity: TextAffinity(hit.Affinity) }
      }

    internal func MoveVertical(n Node, position TextPosition, desiredX float32,
      delta int32) TextPosition? {
        let layout = For(n, TextLayouts.ContentWidth(n), TextLayouts.ContentHeight(n))
        let current = lineIndexForPosition(layout, position)
        if current < 0 || layout.Lines.Count == 0 { return nil }
        var target = current + delta
        if target < 0 { target = 0 }
        if target >= layout.Lines.Count { target = layout.Lines.Count - 1 }
        let line = layout.Lines[target]
        let hit = HitTest(line, desiredX)
        return TextPosition{ Offset: SourceOffsetForDisplay(line.Paragraph,
          line.DisplayStart + hit.Index, TextAffinity(hit.Affinity)),
          Affinity: TextAffinity(hit.Affinity) }
      }

    internal func MoveHorizontal(n Node, position TextPosition, direction int32) TextPosition? {
      let layout = For(n, TextLayouts.ContentWidth(n), TextLayouts.ContentHeight(n))
      if layout.Lines.Count == 0 || direction == 0 { return nil }
      let lineIndex = lineIndexForPosition(layout, position)
      if lineIndex < 0 { return nil }
      let candidates = visualCarets(layout.Lines[lineIndex])
      if candidates.Count == 0 { return nil }
      let current = visualCaretIndex(candidates, position)
      let currentX = candidates[current].X
      if direction < 0 {
        for var i = current; i > 0; i-- {
          let candidate = candidates[i - 1]
          if candidate.X < currentX - 0.01F { return candidate.Position }
        }
      } else {
        for i in current + 1 ... candidates.Count {
          let candidate = candidates[i]
          if candidate.X > currentX + 0.01F { return candidate.Position }
        }
      }
      if direction < 0 && lineIndex > 0 {
        let prior = visualCarets(layout.Lines[lineIndex - 1])
        return prior.Count == 0 ? nil : prior[prior.Count - 1].Position
      }
      if direction > 0 && lineIndex + 1 < layout.Lines.Count {
        let next = visualCarets(layout.Lines[lineIndex + 1])
        return next.Count == 0 ? nil : next[0].Position
      }
      return candidates[current].Position
    }

    private func build(n Node, state TextEditorRenderState, snapshot TextSnapshot,
      width float32, height float32, revision int64, fingerprint int32) TextEditorVisualLayout{
        let metrics = TextShaping.Metrics(n.FontFamily, TextLayouts.fontSize(n), int32(n.FontWeight),
          n.FontStyle == FontStyle.Italic)
        var lineHeight = TextLayouts.resolvedLineHeight(n)
        if lineHeight <= 0.0F { lineHeight = metrics.Descent - metrics.Ascent }
        if lineHeight <= 0.0F { lineHeight = 1.0F }
        let result = state.BeginLayout()
        result.Version = snapshot.Version
        result.DocumentLineCount = snapshot.LineCount
        result.LayerRevision = revision
        result.Width = width
        result.ConstraintWidth = width
        result.HeightConstraint = height
        result.FontFingerprint = fingerprint
        result.LineHeight = lineHeight
        result.Ascent = metrics.Ascent
        result.Descent = metrics.Descent
        let projections = editorProjections(state, width, height)
        let styles = editorStyles(state)
        let used = state.BeginUsedParagraphs()
        let bounded = height >= 0.0F
        var firstLine int32 = 0
        var lastLine = snapshot.LineCount
        if bounded {
          let scrollLine = lineForVerticalOffset(state, snapshot,
            float32(state.Controller.ScrollTargetY), width, fingerprint, lineHeight,
            metrics.Ascent, metrics.Descent)
          let overscan = n.EditorOverscanLines
          firstLine = scrollLine - overscan
          if firstLine < 0 { firstLine = 0 }
          let visible = int32(height / lineHeight) + 1 + overscan * 2
          lastLine = firstLine + visible
          if lastLine > snapshot.LineCount { lastLine = snapshot.LineCount }
        }
        var top = verticalOffsetForLine(state, snapshot, firstLine, width, fingerprint,
          lineHeight, metrics.Ascent, metrics.Descent)
        var widest = 0.0F
        for lineIndex in firstLine ... lastLine {
          let source = snapshot.GetLineRange(lineIndex)
          var cached = state.Paragraph(source, width, fingerprint, lineHeight, metrics.Ascent,
            metrics.Descent)
          if cached == nil {
            let value = paragraphLayout(n, state, snapshot, lineIndex, projections, styles, width,
              fingerprint, lineHeight, metrics.Ascent, metrics.Descent)
            state.AddParagraph(value)
            cached = value
          }
          let paragraphCache = cached!!
          used.Add(paragraphCache)
          for visual in paragraphCache.Lines {
            visual.Top = top + visual.RelativeTop
            result.Lines.Add(visual)
          }
          top = top + paragraphCache.Height
          if paragraphCache.Width > widest { widest = paragraphCache.Width }
        }
        if result.Lines.Count == 0 {
          let empty = TextEditorResolvedParagraph{ Source: TextRange{ Start: 0, Length: 0 },
            BaseStyle: state.BaseStyle(n, fingerprint) }
          appendVisualLine(result, n, empty, 0, 0, 0.0F)
          top = lineHeight
        }
        result.Width = widest
        if bounded {
          result.Height = height > lineHeight ? height : lineHeight
          result.ContentWidth = widest
          result.ContentHeight = top + float32(snapshot.LineCount - lastLine) * lineHeight
        } else {
          result.Height = top
          result.ContentWidth = widest
          result.ContentHeight = top
        }
        if bounded { state.TrimParagraphs(used) }
        return result
      }

    private func paragraphLayout(n Node, state TextEditorRenderState, snapshot TextSnapshot, lineIndex int32,
      projections List[TextEditorProjection], styles List[TextEditorPresentationStyle],
      width float32, fingerprint int32, lineHeight float32, ascent float32, descent float32)
    TextEditorParagraphLayout{
      let temporary = state.BeginParagraphLayout()
      temporary.ConstraintWidth = width
      temporary.FontFingerprint = fingerprint
      temporary.LineHeight = lineHeight
      temporary.Ascent = ascent
      temporary.Descent = descent
      let source = snapshot.GetLineRange(lineIndex)
      let paragraphProjections = state.BeginParagraphProjections()
      let paragraphStyles = state.BeginParagraphStyles()
      filterParagraphProjections(projections, source, paragraphProjections)
      filterParagraphStyles(styles, source, paragraphStyles)
      let paragraph = resolveParagraph(snapshot, lineIndex, paragraphProjections,
        paragraphStyles, n, state, fingerprint)
      let height = appendParagraph(temporary, n, paragraph, width, 0.0F)
      var widest = 0.0F
      for line in temporary.Lines {
        if line.Width > widest { widest = line.Width }
      }
      let result = TextEditorParagraphLayout{ Source: paragraph.Source, ConstraintWidth: width,
        FontFingerprint: fingerprint, LineHeight: lineHeight, Ascent: ascent, Descent: descent,
        Width: widest, Height: height }
      for line in temporary.Lines { result.Lines.Add(line) }
      return result
    }

    private func lineForVerticalOffset(state TextEditorRenderState, snapshot TextSnapshot,
      offset float32, width float32, fingerprint int32, lineHeight float32,
      ascent float32, descent float32) int32{
        if offset <= 0.0F { return 0 }
        var low int32 = 0
        var high = snapshot.LineCount - 1
        while low <= high {
          let line = low + (high - low) / 2
          let top = verticalOffsetForLine(state, snapshot, line, width, fingerprint,
            lineHeight, ascent, descent)
          let height = state.ParagraphHeightForLine(snapshot, line, width, fingerprint,
            lineHeight, ascent, descent) ?? lineHeight
          if offset < top {
            high = line - 1
          } else if offset >= top + height {
            low = line + 1
          } else {
            return line
          }
        }
        if low >= snapshot.LineCount { return snapshot.LineCount - 1 }
        return low < 0 ? 0 : low
      }

    private func verticalOffsetForLine(state TextEditorRenderState, snapshot TextSnapshot,
      target int32, width float32, fingerprint int32, lineHeight float32,
      ascent float32, descent float32) float32 -> float32(target) * lineHeight + state.HeightAdjustmentBefore(snapshot, target,
        width, fingerprint, lineHeight, ascent, descent)

    private func appendParagraph(layout TextEditorVisualLayout, n Node,
      paragraph TextEditorResolvedParagraph, width float32, top float32) float32{
        if paragraph.Text.Length == 0 {
          let visual = appendVisualLine(layout, n, paragraph, 0, 0, top)
          return top + visual.Height
        }
        var cursor int32 = 0
        var lineTop = top
        for segment in paragraph.Segments {
          if !segment.Slot || !segment.BlockSlot { continue }
          if segment.DisplayStart > cursor {
            lineTop = appendInlineParagraph(layout, n, paragraph, cursor, segment.DisplayStart,
              width, lineTop)
          }
          let block = appendVisualLine(layout, n, paragraph, segment.DisplayStart,
            segment.DisplayStart + segment.DisplayLength, lineTop)
          lineTop = lineTop + block.Height
          cursor = segment.DisplayStart + segment.DisplayLength
        }
        if cursor < paragraph.Text.Length {
          lineTop = appendInlineParagraph(layout, n, paragraph, cursor, paragraph.Text.Length,
            width, lineTop)
        }
        return lineTop
      }

    private func appendInlineParagraph(layout TextEditorVisualLayout, n Node,
      paragraph TextEditorResolvedParagraph, start int32, limit int32, width float32,
      top float32) float32{
        if n.TextWrap == TextWrap.NoWrap || width < 0.0F {
          let visual = appendVisualLine(layout, n, paragraph, start, limit, top)
          return top + visual.Height
        }
        if !hasWidthOverrides(n, paragraph, start, limit) {
          using let measure = shapeEditorLine(n, paragraph, start, limit, paragraph.BaseStyle!!)
          if !measure.HasRightToLeftRun {
            return appendWrappedInlineParagraph(layout, n, paragraph, start, limit, width, top, measure)
          }
        }
        return appendWrappedInlineParagraph(layout, n, paragraph, start, limit, width, top, nil)
      }

    private func appendWrappedInlineParagraph(layout TextEditorVisualLayout, n Node,
      paragraph TextEditorResolvedParagraph, start int32, limit int32, width float32,
      top float32, measure ShapedText?) float32{
        let breakMap = LineBreakOpportunities.Resolve(paragraph.Text)
        let elements = UnicodeGraphemes.Starts(paragraph.Text)
        var cursor = start
        var lineTop = top
        while cursor < limit {
          let origin = if let shaped = measure {
            shaped.CaretX(cursor - start, int32(TextAffinity.Downstream))
          } else {
            0.0F
          }
          var fit = cursor
          var preferred = -1
          var overflowed = false
          for i in 0 ... elements.Length {
            let end = i + 1 < elements.Length ? elements[i + 1] : paragraph.Text.Length
            if end <= cursor { continue }
            if end > limit { break }
            var measured = if let shaped = measure {
              shaped.CaretX(end - start, int32(TextAffinity.Downstream)) - origin
            } else {
              MeasureRange(n, paragraph, cursor, end)
            }
            if measure != nil && measured < 0.0F { measured = -measured }
            let decision = TextFlow.Consider(cursor, fit, preferred, overflowed, end, measured,
              width, breakMap.CanBreak(end))
            fit = decision.Fit
            preferred = decision.Preferred
            overflowed = decision.Overflowed
            if decision.Stop || decision.Overflowed { break }
          }
          var end = TextFlow.Resolve(cursor, fit, preferred, overflowed)
          if end <= cursor { end = nextEditorGrapheme(paragraph.Text, cursor) }
          if end > limit { end = limit }
          let visual = appendVisualLine(layout, n, paragraph, cursor, end, lineTop)
          cursor = end
          lineTop = lineTop + visual.Height
        }
        return lineTop
      }

    private func hasWidthOverrides(n Node, paragraph TextEditorResolvedParagraph,
      start int32, limit int32) bool{
        let baseStyle = paragraph.BaseStyle!!
        for segment in paragraph.Segments {
          let end = segment.DisplayStart + segment.DisplayLength
          if end <= start || segment.DisplayStart >= limit { continue }
          if segment.Slot || segment.Style != baseStyle { return true }
        }
        return false
      }

    private func appendVisualLine(layout TextEditorVisualLayout, n Node,
      paragraph TextEditorResolvedParagraph, displayStart int32, displayEnd int32,
      top float32) TextEditorVisualLine{
        let shape = shapeEditorLine(n, paragraph, displayStart, displayEnd, paragraph.BaseStyle!!)
        var visualHeight = layout.LineHeight
        var visualAscent = layout.Ascent
        var visualDescent = layout.Descent
        for segment in paragraph.Segments {
          if segment.DisplayStart >= displayEnd || segment.DisplayStart + segment.DisplayLength <= displayStart {
            continue
          }
          let metrics = TextShaping.Metrics(segment.Style.FontFamily, segment.Style.FontSize,
            int32(segment.Style.FontWeight), segment.Style.FontStyle == FontStyle.Italic)
          if metrics.Ascent < visualAscent { visualAscent = metrics.Ascent }
          if metrics.Descent > visualDescent { visualDescent = metrics.Descent }
          let styledHeight = (metrics.Descent - metrics.Ascent) * segment.Style.LineHeight
          if styledHeight > visualHeight { visualHeight = styledHeight }
          if segment.Slot && segment.BlockSlot && segment.SlotHeight > visualHeight {
            visualHeight = segment.SlotHeight
          }
        }
        let firstSource = SourceOffsetForDisplay(paragraph, displayStart, TextAffinity.Downstream)
        let lastSource = SourceOffsetForDisplay(paragraph, displayEnd, TextAffinity.Upstream)
        let line = TextEditorVisualLine(paragraph, displayStart,
          displayEnd - displayStart,
          firstSource < lastSource ? firstSource : lastSource,
          firstSource > lastSource ? firstSource : lastSource,
          top, visualHeight, visualAscent, visualDescent, shape)
        appendSlotGeometry(line, layout, paragraph, displayStart, displayEnd, shape)
        appendPaintRuns(line, n, paragraph, displayStart, displayEnd, shape)
        layout.Lines.Add(line)
        return line
      }

    private func shapeEditorLine(n Node, paragraph TextEditorResolvedParagraph,
      start int32, end int32, style TextResolvedStyle) ShapedText -> TextLineShaper.Styled(paragraph.Text, paragraph.Resolution,
        paragraph.BaseStyle!!.Direction, start, end, style)

    private func appendSlotGeometry(line TextEditorVisualLine, layout TextEditorVisualLayout,
      paragraph TextEditorResolvedParagraph, displayStart int32, displayEnd int32,
      shape ShapedText) {
        for segment in paragraph.Segments {
          let segmentEnd = segment.DisplayStart + segment.DisplayLength
          if !segment.Slot || segment.DisplayStart < displayStart || segmentEnd > displayEnd { continue }
          let start = segment.DisplayStart - displayStart
          let end = segmentEnd - displayStart
          let naturalStart = shape.CaretX(start, int32(TextAffinity.Downstream))
          let naturalEnd = shape.CaretX(end, int32(TextAffinity.Downstream))
          var natural = naturalEnd - naturalStart
          if natural < 0.0F { natural = -natural }
          let naturalLeft = naturalStart < naturalEnd ? naturalStart : naturalEnd
          let naturalRight = naturalStart > naturalEnd ? naturalStart : naturalEnd
          let width = segment.BlockSlot && layout.ConstraintWidth > 0.0F
          ? layout.ConstraintWidth : (segment.SlotWidth > 0.0F ? segment.SlotWidth : natural)
          line.Slots.Add(TextEditorSlotGeometry{
            Range: segment.Source,
            Key: segment.SlotKey,
            DisplayStart: segment.DisplayStart,
            DisplayLength: segment.DisplayLength,
            X: naturalLeft,
            Width: width,
            NaturalWidth: natural,
            NaturalLeft: naturalLeft,
            NaturalRight: naturalRight,
            NaturalStart: naturalStart,
            NaturalEnd: naturalEnd,
            Height: segment.SlotHeight > 0.0F ? segment.SlotHeight : layout.LineHeight,
            Block: segment.BlockSlot,
          })
        }
        sortEditorItems(line.Slots, slotSortKey)
        var correction = 0.0F
        for slot in line.Slots {
          slot.X = slot.NaturalLeft + correction
          slot.LogicalStart = slot.NaturalStart == slot.NaturalLeft ? slot.X : slot.X + slot.Width
          slot.LogicalEnd = slot.NaturalEnd == slot.NaturalLeft ? slot.X : slot.X + slot.Width
          correction = correction + slot.Width - slot.NaturalWidth
        }
      }

    private func appendPaintRuns(line TextEditorVisualLine, n Node,
      paragraph TextEditorResolvedParagraph, displayStart int32, displayEnd int32,
      shape ShapedText) {
        let baseStyle = paragraph.BaseStyle!!
        var special = line.Slots.Count != 0
        for segment in paragraph.Segments {
          if segment.Style != baseStyle && segment.DisplayStart < displayEnd
            && segment.DisplayStart + segment.DisplayLength > displayStart{
              special = true
              break
            }
        }
        if !special {
          return
        }
        var cursor = displayStart
        var correction = 0.0F
        for segment in paragraph.Segments {
          let end = segment.DisplayStart + segment.DisplayLength
          if end <= displayStart || segment.DisplayStart >= displayEnd { continue }
          let start = segment.DisplayStart > displayStart ? segment.DisplayStart : displayStart
          let clippedEnd = end < displayEnd ? end : displayEnd
          if start > cursor {
            correction = correction + appendPaintRun(line, n, paragraph, cursor, start,
              displayStart, shape, correction, baseStyle)
          }
          if segment.Slot {
            for slot in line.Slots {
              if slot.DisplayStart == segment.DisplayStart { correction = correction + slot.Width - slot.NaturalWidth }
            }
          } else if clippedEnd > start {
            correction = correction + appendPaintRun(line, n, paragraph, start, clippedEnd,
              displayStart, shape, correction, segment.Style)
          }
          cursor = clippedEnd
        }
        if cursor < displayEnd {
          correction = correction + appendPaintRun(line, n, paragraph, cursor, displayEnd,
            displayStart, shape, correction, baseStyle)
        }
        line.StyleWidthCorrection = correction - slotWidthCorrection(line)
      }

    private func appendPaintRun(line TextEditorVisualLine, n Node,
      paragraph TextEditorResolvedParagraph, start int32, end int32, displayStart int32,
      shape ShapedText, correction float32, style TextResolvedStyle) float32{
        let run = shapeEditorLine(n, paragraph, start, end, style)
        var natural = shape.CaretX(end - displayStart, int32(TextAffinity.Downstream))
        -shape.CaretX(start - displayStart, int32(TextAffinity.Downstream))
        if natural < 0.0F { natural = -natural }
        let retained = TextPaintRun{ Shape: run,
          X: shape.CaretX(start - displayStart, int32(TextAffinity.Downstream)) + correction,
          DisplayStart: start,
          DisplayLength: end - start,
          Style: style }
        if style.Decoration != TextDecoration.None && TextShaping.GlyphCount(run) > 0 {
          let segments = run.SelectionRects(0, end - start)
          if segments.Length > 0 { retained.DecorationSegments = segments }
        }
        line.Runs.Add(retained)
        return run.Width - natural
      }

    private func resolveParagraph(snapshot TextSnapshot, line int32,
      projections List[TextEditorProjection], styles List[TextEditorPresentationStyle], n Node,
      state TextEditorRenderState, fingerprint int32)
    TextEditorResolvedParagraph{
      let source = snapshot.GetLineRange(line)
      let text = snapshot.GetText(source)
      let baseStyle = state.BaseStyle(n, fingerprint)
      let result = TextEditorResolvedParagraph{ Source: source, BaseStyle: baseStyle }
      var display = ""
      var cursor = source.Start
      let sourceEnd = source.Start + source.Length
      for projection in projections {
        let end = projection.Range.Start + projection.Range.Length
        let insertion = projection.Composition && projection.Range.Length == 0
        if insertion {
          if projection.Range.Start < source.Start || projection.Range.Start > sourceEnd { continue }
        } else if end <= source.Start || projection.Range.Start >= sourceEnd {
          continue
        }
        let start = projection.Range.Start > cursor ? projection.Range.Start : cursor
        if start > cursor {
          appendSourceSegment(result, ref display, snapshot.GetText(TextRange{ Start: cursor,
            Length: start - cursor }), cursor, styles, baseStyle)
        }
        if projection.Range.Start >= source.Start && (projection.Range.Start < sourceEnd || insertion) {
          let style = editorStyleAt(styles, projection.Range.Start, baseStyle)
          let projectionText = TextLayouts.transformText(projection.Text, style.Transform)
          let displayStart = display.Length
          display = display + projectionText
          var compositionSelectionStart int32 = 0
          var compositionSelectionEnd int32 = 0
          if projection.Composition {
            var selectionStart = projection.CompositionSelectionStart
            if selectionStart < 0 { selectionStart = 0 }
            if selectionStart > projection.Text.Length { selectionStart = projection.Text.Length }
            var selectionEnd = selectionStart + projection.CompositionSelectionLength
            if selectionEnd > projection.Text.Length { selectionEnd = projection.Text.Length }
            if selectionEnd < selectionStart { selectionEnd = selectionStart }
            compositionSelectionStart = transformedCompositionOffset(projection.Text,
              selectionStart, style.Transform)
            compositionSelectionEnd = transformedCompositionOffset(projection.Text,
              selectionEnd, style.Transform)
          }
          result.Segments.Add(TextEditorResolvedSegment(projection.Range,
            displayStart, projectionText.Length, compositionSelectionStart,
            compositionSelectionEnd, projection.Atomic, projection.Composition,
            projection.Slot, projection.BlockSlot, projection.SlotKey,
            projection.SlotWidth, projection.SlotHeight, style))
        }
        if end > cursor { cursor = end }
        if cursor > sourceEnd { cursor = sourceEnd }
      }
      if cursor < sourceEnd {
        appendSourceSegment(result, ref display, snapshot.GetText(TextRange{ Start: cursor,
          Length: sourceEnd - cursor }), cursor, styles, baseStyle)
      }
      result.Text = display
      result.Resolution = state.ParagraphResolution(n, display, fingerprint)
      return result
    }

    private func transformedCompositionOffset(text string, offset int32,
      transform TextTransform) int32{
        if transform == TextTransform.None { return offset }
        return TextLayouts.transformText(text.Substring(0, offset), transform).Length
      }

    private func appendSourceSegment(result TextEditorResolvedParagraph, ref display string,
      text string, start int32, styles List[TextEditorPresentationStyle], baseStyle TextResolvedStyle) {
        var cursor int32 = 0
        while cursor < text.Length {
          let absolute = start + cursor
          let style = editorStyleAt(styles, absolute, baseStyle)
          var end = text.Length
          let boundary = nextStyleBoundary(styles, absolute, start + text.Length)
          if boundary > absolute { end = boundary - start }
          if end <= cursor { end = cursor + 1 }
          appendTransformedSource(result, ref display, text.Substring(cursor, end - cursor),
            absolute, style)
          cursor = end
        }
      }

    private func appendTransformedSource(result TextEditorResolvedParagraph, ref display string,
      text string, start int32, style TextResolvedStyle) {
        if style.Transform == TextTransform.None {
          appendResolvedSource(result, ref display, text, start, text.Length, style, false)
          return
        }
        let starts = UnicodeGraphemes.Starts(text)
        var runStart int32 = 0
        for i in 0 ... starts.Length {
          let clusterStart = starts[i]
          let clusterEnd = i + 1 < starts.Length ? starts[i + 1] : text.Length
          let source = text.Substring(clusterStart, clusterEnd - clusterStart)
          let transformed = TextLayouts.transformText(source, style.Transform)
          if transformed.Length == source.Length { continue }
          if clusterStart > runStart {
            let run = text.Substring(runStart, clusterStart - runStart)
            appendResolvedSource(result, ref display, TextLayouts.transformText(run, style.Transform),
              start + runStart, run.Length, style, false)
          }
          appendResolvedSource(result, ref display, transformed, start + clusterStart,
            source.Length, style, true)
          runStart = clusterEnd
        }
        if runStart < text.Length {
          let run = text.Substring(runStart)
          appendResolvedSource(result, ref display, TextLayouts.transformText(run, style.Transform),
            start + runStart, run.Length, style, false)
        }
      }

    private func appendResolvedSource(result TextEditorResolvedParagraph, ref display string,
      text string, sourceStart int32, sourceLength int32, style TextResolvedStyle,
      atomic bool) {
        let displayStart = display.Length
        display = display + text
        result.Segments.Add(TextEditorResolvedSegment(
          TextRange{ Start: sourceStart, Length: sourceLength },
          displayStart, text.Length, atomic, style))
      }

    private func editorProjections(state TextEditorRenderState, width float32,
      height float32) List[TextEditorProjection]{
        let values = state.BeginProjections()
        for layerIndex in 0 ... state.LayerCount {
          let layer = state.Layer(layerIndex)
          for projection in layer.ReadProjections() {
            let slot = projection.Kind == TextProjectionKind.InlineSlot
              || projection.Kind == TextProjectionKind.BlockSlot
            let key = textEditorSlotKey(layer, projection)
            let size = slot ? state.SlotSize(key, width) : Rect{}
            values.Add(TextEditorProjection{
              Range: projection.Range,
              Text: projection.Kind == TextProjectionKind.Replacement ? projection.Text : (slot ? "\uFFFC" : ""),
              Atomic: true,
              Slot: slot,
              BlockSlot: projection.Kind == TextProjectionKind.BlockSlot,
              SlotKey: key,
              SlotWidth: size.W,
              SlotHeight: size.H,
            })
          }
        }
        if let composition = state.Controller.Composition {
          values.Add(TextEditorProjection{ Range: composition.Range, Text: composition.Text,
            Atomic: true, Composition: true,
            CompositionSelectionStart: composition.SelectionStart,
            CompositionSelectionLength: composition.SelectionLength })
        }
        sortEditorItems(values, projectionSortKey)
        return values
      }

    private func editorStyles(state TextEditorRenderState) List[TextEditorPresentationStyle] {
      let values = state.BeginStyles()
      var order int32 = 0
      for layerIndex in 0 ... state.LayerCount {
        let layer = state.Layer(layerIndex)
        for span in layer.ReadStyleSpans() {
          values.Add(TextEditorPresentationStyle{ Range: span.Range,
            Declaration: span.Style, Order: order })
          order++
        }
      }
      sortEditorItems(values, styleSortKey)
      var maximum = Int32.MinValue
      for value in values {
        let end = value.Range.Start + value.Range.Length
        if end > maximum { maximum = end }
        value.PrefixMaxEnd = maximum
      }
      return values
    }

    private func filterParagraphProjections(values List[TextEditorProjection],
      source TextRange, result List[TextEditorProjection]) {
        var low int32 = 0
        var high = values.Count
        while low < high {
          let middle = low + (high - low) / 2
          if values[middle].Range.Start < source.Start { low = middle + 1 }
          else { high = middle }
        }
        while low > 0 {
          let prior = values[low - 1]
          if prior.Range.Start + prior.Range.Length <= source.Start { break }
          low--
        }
        let sourceEnd = source.Start + source.Length
        for i in low ... values.Count {
          let value = values[i]
          if value.Range.Start > sourceEnd { break }
          let end = value.Range.Start + value.Range.Length
          let insertion = value.Composition && value.Range.Length == 0
          if insertion {
            if value.Range.Start >= source.Start && value.Range.Start <= sourceEnd { result.Add(value) }
          } else if end > source.Start && value.Range.Start < sourceEnd {
            result.Add(value)
          }
        }
      }

    private func filterParagraphStyles(values List[TextEditorPresentationStyle],
      source TextRange, result List[TextEditorPresentationStyle]) {
        var low int32 = 0
        var high = values.Count
        while low < high {
          let middle = low + (high - low) / 2
          if values[middle].PrefixMaxEnd <= source.Start { low = middle + 1 }
          else { high = middle }
        }
        let sourceEnd = source.Start + source.Length
        for i in low ... values.Count {
          let value = values[i]
          if value.Range.Start > sourceEnd { break }
          if value.Range.Start + value.Range.Length > source.Start { result.Add(value) }
        }
        sortEditorItems(result, orderSortKey)
      }

    private func editorStyleAt(styles List[TextEditorPresentationStyle], offset int32,
      baseStyle TextResolvedStyle) TextResolvedStyle{
        var result = baseStyle
        var overridden = false
        for item in styles {
          if offset < item.Range.Start || offset >= item.Range.Start + item.Range.Length { continue }
          if !overridden {
            result = TextResolvedStyles.Copy(baseStyle)
            overridden = true
          }
          TextResolvedStyles.Apply(result, item.Declaration)
        }
        return result
      }

    private func nextStyleBoundary(styles List[TextEditorPresentationStyle], offset int32,
      limit int32) int32{
        var result = limit
        for item in styles {
          let start = item.Range.Start
          let end = item.Range.Start + item.Range.Length
          if start > offset && start < result { result = start }
          if end > offset && end < result { result = end }
        }
        return result
      }

    internal func DisplayOffsetForSource(paragraph TextEditorResolvedParagraph, source int32,
      affinity TextAffinity) int32{
        for i in 0 ... paragraph.Segments.Count {
          let segment = paragraph.Segments[i]
          let end = segment.Source.Start + segment.Source.Length
          if source < segment.Source.Start || source > end { continue }
          if !segment.Atomic {
            let relative = source - segment.Source.Start
            let length = relative > segment.DisplayLength ? segment.DisplayLength : relative
            return segment.DisplayStart + length
          }
          if segment.Source.Length != 0 {
            if source == segment.Source.Start { return segment.DisplayStart }
            if source == end { return segment.DisplayStart + segment.DisplayLength }
          }
          return affinity == TextAffinity.Upstream ? segment.DisplayStart : segment.DisplayStart + segment.DisplayLength
        }
        return source <= paragraph.Source.Start ? 0 : paragraph.Text.Length
      }

    internal func SourceOffsetForDisplay(paragraph TextEditorResolvedParagraph, display int32,
      affinity TextAffinity) int32{
        for i in 0 ... paragraph.Segments.Count {
          let segment = paragraph.Segments[i]
          let end = segment.DisplayStart + segment.DisplayLength
          if display < segment.DisplayStart || display > end { continue }
          if !segment.Atomic {
            let relative = display - segment.DisplayStart
            let length = relative > segment.Source.Length ? segment.Source.Length : relative
            return segment.Source.Start + length
          }
          if segment.DisplayLength == 0 && display == segment.DisplayStart {
            return affinity == TextAffinity.Upstream ? segment.Source.Start : segment.Source.Start + segment.Source.Length
          }
          if display == segment.DisplayStart { return segment.Source.Start }
          if display == end { return segment.Source.Start + segment.Source.Length }
          return affinity == TextAffinity.Upstream ? segment.Source.Start : segment.Source.Start + segment.Source.Length
        }
        return display <= 0 ? paragraph.Source.Start : paragraph.Source.Start + paragraph.Source.Length
      }

    internal func LineForPosition(layout TextEditorVisualLayout,
      position TextPosition) TextEditorVisualLine? {
        let index = lineIndexForPosition(layout, position)
        return index < 0 ? nil : layout.Lines[index]
      }

    private func lineIndexForPosition(layout TextEditorVisualLayout,
      position TextPosition) int32{
        var fallback = -1
        for i in 0 ... layout.Lines.Count {
          let line = layout.Lines[i]
          if position.Offset < line.SourceStart || position.Offset > line.SourceEnd { continue }
          fallback = i
          if position.Offset > line.SourceStart && position.Offset < line.SourceEnd { return i }
          if position.Offset == line.SourceStart && position.Affinity == TextAffinity.Downstream {
            return i
          }
          if position.Offset == line.SourceEnd && position.Affinity == TextAffinity.Upstream {
            return i
          }
        }
        if fallback >= 0 { return fallback }
        return layout.Lines.Count == 0 ? -1 : layout.Lines.Count - 1
      }

    private func editorLayerRevision(state TextEditorRenderState) int64 {
      var result int64 = 17
      for i in 0 ... state.LayerCount { result = result * 31 + state.Layer(i).Revision }
      return result
    }

    private func editorFontFingerprint(n Node) int32 {
      var result int32 = 17
      result = result * 31 + n.FontFamily.GetHashCode()
      result = result * 31 + TextLayouts.fontSize(n).GetHashCode()
      result = result * 31 + n.FontWeight.GetHashCode()
      result = result * 31 + int32(n.FontStyle)
      result = result * 31 + TextLayouts.letterSpacing(n).GetHashCode()
      result = result * 31 + n.LineHeight.GetHashCode()
      result = result * 31 + int32(n.Direction)
      result = result * 31 + int32(n.TextWrap)
      result = result * 31 + int32(n.TextTransform)
      result = result * 31 + n.Color.GetHashCode()
      result = result * 31 + int32(n.TextDecoration)
      result = result * 31 + n.TextStrokeWidth.Value.GetHashCode()
      result = result * 31 + int32(n.TextStrokeWidth.Unit)
      result = result * 31 + n.TextStrokeColor.GetHashCode()
      result = result * 31 + (n.TextShadows?.GetHashCode() ?? 0)
      return result
    }

    internal func editorLineOffset(n Node, line TextEditorVisualLine, width float32) float32 {
      let rtl = if let shape = line.Shape { shape.RightToLeft } else { false }
      return TextLayouts.lineOffset(n, line.Width, rtl, width)
    }

    internal func CaretX(line TextEditorVisualLine, index int32, affinity TextAffinity) float32 {
      let value = if let shape = line.Shape { shape.CaretX(index, int32(affinity)) } else { 0.0F }
      let display = line.DisplayStart + index
      for i in 0 ... line.Slots.Count {
        let slot = line.Slots[i]
        let end = slot.DisplayStart + slot.DisplayLength
        if display == slot.DisplayStart { return slot.LogicalStart }
        if display == end { return slot.LogicalEnd }
        if display > slot.DisplayStart && display < end {
          return affinity == TextAffinity.Upstream ? slot.LogicalStart : slot.LogicalEnd
        }
      }
      for i in 0 ... line.Runs.Count {
        let run = line.Runs[i]
        let end = run.DisplayStart + run.DisplayLength
        if display < run.DisplayStart || display > end { continue }
        if let shape = run.Shape {
          return run.X + shape.CaretX(display - run.DisplayStart, int32(affinity))
        }
      }
      return expandedSlotX(line, value)
    }

    private func visualCarets(line TextEditorVisualLine) List[TextEditorVisualCaret] {
      let values = List[TextEditorVisualCaret]()
      let starts = UnicodeGraphemes.Starts(line.Paragraph.Text)
      for i in 0 ... starts.Length + 1 {
        let display = i == starts.Length ? line.Paragraph.Text.Length : starts[i]
        if display < line.DisplayStart || display > line.DisplayStart + line.DisplayLength { continue }
        if atomicDisplayInterior(line.Paragraph, display) { continue }
        let local = display - line.DisplayStart
        for affinityValue in 0 ... 2 {
          let affinity = TextAffinity(affinityValue)
          let position = TextPosition{ Offset: SourceOffsetForDisplay(line.Paragraph, display, affinity),
            Affinity: affinity }
          let x = CaretX(line, local, affinity)
          var duplicate = false
          for value in values {
            if value.X == x && value.Position.Offset == position.Offset
              && value.Position.Affinity == position.Affinity{
                duplicate = true
                break
              }
          }
          if !duplicate { values.Add(TextEditorVisualCaret{ X: x, Position: position }) }
        }
      }
      sortEditorItems(values, caretSortKey)
      return values
    }

    private func atomicDisplayInterior(paragraph TextEditorResolvedParagraph,
      display int32) bool{
        for segment in paragraph.Segments {
          if segment.Atomic && display > segment.DisplayStart
            && display < segment.DisplayStart + segment.DisplayLength{
              return true
            }
        }
        return false
      }

    private func visualCaretIndex(values List[TextEditorVisualCaret], position TextPosition) int32 {
      for i in 0 ... values.Count {
        if values[i].Position.Offset == position.Offset && values[i].Position.Affinity == position.Affinity {
          return i
        }
      }
      var result int32 = 0
      var distance = Single.MaxValue
      for i in 0 ... values.Count {
        let current = values[i]
        if current.Position.Offset != position.Offset { continue }
        let candidate = current.X < 0.0F ? -current.X : current.X
        if candidate < distance {
          distance = candidate
          result = i
        }
      }
      return result
    }

    internal func HitTest(line TextEditorVisualLine, x float32) TextHit {
      var adjusted = x
      for i in 0 ... line.Slots.Count {
        let slot = line.Slots[i]
        if x >= slot.X && x <= slot.X + slot.Width {
          let towardEnd = x - slot.X > slot.Width * 0.5F
          return TextHit{
            Index: slot.DisplayStart - line.DisplayStart
            +(towardEnd ? slot.DisplayLength : 0),
            Affinity: towardEnd ? int32(TextAffinity.Downstream) : int32(TextAffinity.Upstream),
          }
        }
        if x > slot.X + slot.Width {
          adjusted = adjusted - slot.Width + slot.NaturalWidth
        }
      }
      if line.Runs.Count != 0 {
        var nearest = TextHit{}
        var nearestDistance = Single.MaxValue
        for i in 0 ... line.Runs.Count {
          let run = line.Runs[i]
          guard let shape = run.Shape else { continue }
          let local = x - run.X
          let clamped = if local < 0.0F { 0.0F }
          else if local > shape.Width { shape.Width } else { local }
          let distance = local - clamped < 0.0F ? clamped - local : local - clamped
          let hit = shape.HitTest(clamped)
          if distance < nearestDistance {
            nearestDistance = distance
            nearest = TextHit{
              Index: run.DisplayStart - line.DisplayStart + hit.Index,
              Affinity: hit.Affinity,
            }
          }
          if distance == 0.0F { return nearest }
        }
        return nearest
      }
      return if let shape = line.Shape { shape.HitTest(adjusted) } else { TextHit{} }
    }

    internal func CopySelectionRectsForGeometry(line TextEditorVisualLine, start int32,
      end int32, rectOffset int32, destination Span[float32], out required int32) int32{
        required = 0
        if start >= end || rectOffset < 0 { return 0 }
        guard let shape = line.Shape else { return 0 }
        if line.Runs.Count == 0 && line.Slots.Count == 0 {
          required = shape.SelectionRectCount(start, end)
          return shape.CopySelectionRects(start, end, rectOffset, destination)
        }
        return TraverseSelectionRects(line, start, end, rectOffset, destination, nil,
          out required)
      }

    private func TraverseSelectionRects(line TextEditorVisualLine, start int32,
      end int32, rectOffset int32, destination Span[float32], result List[float32]?,
      out required int32) int32{
        guard let shape = line.Shape else {
          required = 0
          return 0
        }
        var cursor TextEditorSelectionCursor
        let values = stackalloc[64]float32
        if line.Runs.Count != 0 {
          let absoluteStart = line.DisplayStart + start
          let absoluteEnd = line.DisplayStart + end
          for i in 0 ... line.Runs.Count {
            let run = line.Runs[i]
            guard let runShape = run.Shape else { continue }
            let runEnd = run.DisplayStart + run.DisplayLength
            let selectedStart = absoluteStart > run.DisplayStart ? absoluteStart : run.DisplayStart
            let selectedEnd = absoluteEnd < runEnd ? absoluteEnd : runEnd
            if selectedEnd <= selectedStart { continue }
            let localStart = selectedStart - run.DisplayStart
            let localEnd = selectedEnd - run.DisplayStart
            let rectCount = runShape.SelectionRectCount(localStart, localEnd)
            var sourceOffset int32 = 0
            while sourceOffset < rectCount {
              let copied = runShape.CopySelectionRects(localStart, localEnd, sourceOffset, values)
              var value int32 = 0
              while value + 1 < copied {
                cursor = appendGeometryRect(cursor, values[value] + run.X,
                  values[value + 1] + run.X, rectOffset, destination, result)
                value = value + 2
              }
              if copied == 0 { break }
              sourceOffset = sourceOffset + copied / 2
            }
          }
        } else {
          let rectCount = shape.SelectionRectCount(start, end)
          var sourceOffset int32 = 0
          while sourceOffset < rectCount {
            let copied = shape.CopySelectionRects(start, end, sourceOffset, values)
            var value int32 = 0
            while value + 1 < copied {
              var left = values[value]
              let right = values[value + 1]
              for i in 0 ... line.Slots.Count {
                let slot = line.Slots[i]
                if slot.NaturalRight <= left || slot.NaturalLeft >= right { continue }
                if left < slot.NaturalLeft {
                  cursor = appendGeometryRect(cursor, expandedSlotX(line, left), slot.X,
                    rectOffset, destination, result)
                }
                left = slot.NaturalRight
              }
              if left < right {
                cursor = appendGeometryRect(cursor, expandedSlotX(line, left),
                  expandedSlotX(line, right), rectOffset, destination, result)
              }
              value = value + 2
            }
            if copied == 0 { break }
            sourceOffset = sourceOffset + copied / 2
          }
        }
        for i in 0 ... line.Slots.Count {
          let slot = line.Slots[i]
          let slotEnd = slot.DisplayStart + slot.DisplayLength - line.DisplayStart
          let slotStart = slot.DisplayStart - line.DisplayStart
          if start < slotEnd && end > slotStart {
            cursor = appendGeometryRect(cursor, slot.X, slot.X + slot.Width, rectOffset,
              destination, result)
          }
        }
        required = cursor.Index
        return cursor.Written
      }

    private func appendGeometryRect(cursor TextEditorSelectionCursor, left float32,
      right float32, rectOffset int32, destination Span[float32], result List[float32]?) TextEditorSelectionCursor{
        var written = cursor.Written
        if cursor.Index >= rectOffset {
          if let values = result {
            values.Add(left)
            values.Add(right)
            written = written + 2
          } else if written + 1 < destination.Length {
            destination[written] = left
            destination[written + 1] = right
            written = written + 2
          }
        }
        return TextEditorSelectionCursor{ Index: cursor.Index + 1, Written: written }
      }

    internal func SelectionRects(line TextEditorVisualLine, start int32,
      end int32) IReadOnlyList[float32]{
        guard let shape = line.Shape else { return []float32{} }
        if line.Slots.Count == 0 && line.Runs.Count == 0 {
          return shape.SelectionRects(start, end)
        }
        let result = line.BeginSelectionRects()
        let empty = stackalloc[0]float32
        var required int32
        TraverseSelectionRects(line, start, end, 0, empty, result, out required)
        return result
      }

    private func expandedSlotX(line TextEditorVisualLine, x float32) float32 {
      var value = x
      for i in 0 ... line.Slots.Count {
        let slot = line.Slots[i]
        if x >= slot.NaturalRight { value = value + slot.Width - slot.NaturalWidth }
      }
      return value
    }

    private func slotWidthCorrection(line TextEditorVisualLine) float32 {
      var result = 0.0F
      for slot in line.Slots { result = result + slot.Width - slot.NaturalWidth }
      return result
    }

    private func MeasureRange(n Node, paragraph TextEditorResolvedParagraph, start int32,
      end int32) float32{
        let baseStyle = paragraph.BaseStyle!!
        using let shape = shapeEditorLine(n, paragraph, start, end, baseStyle)
        var width = shape.Width
        for segment in paragraph.Segments {
          let segmentEnd = segment.DisplayStart + segment.DisplayLength
          let selectedStart = segment.DisplayStart > start ? segment.DisplayStart : start
          let selectedEnd = segmentEnd < end ? segmentEnd : end
          if selectedEnd <= selectedStart { continue }
          var natural = shape.CaretX(selectedEnd - start, int32(TextAffinity.Downstream))
          -shape.CaretX(selectedStart - start, int32(TextAffinity.Downstream))
          if natural < 0.0F { natural = -natural }
          var actual = natural
          if segment.Slot {
            actual = segment.BlockSlot && end - start > 0 ? width : (segment.SlotWidth > 0.0F ? segment.SlotWidth : natural)
          } else if segment.Style != baseStyle {
            using let styled = shapeEditorLine(n, paragraph, selectedStart, selectedEnd,
              segment.Style)
            actual = styled.Width
          }
          width = width + actual - natural
        }
        return width
      }

    private func nextEditorGrapheme(text string, start int32) int32 {
      let starts = UnicodeGraphemes.Starts(text)
      for i in 0 ... starts.Length {
        if starts[i] > start { return starts[i] }
      }
      return text.Length
    }
  }
}

internal func rangesEditorTouch(left TextRange, right TextRange) bool {
  let leftEnd = left.Start + left.Length
  let rightEnd = right.Start + right.Length
  return left.Start <= rightEnd && right.Start <= leftEnd
}

internal func paragraphChanged(paragraph TextRange, changes IReadOnlyList[TextChange]) bool {
  for change in changes {
    if rangesEditorTouch(paragraph, change.Range) { return true }
  }
  return false
}

internal func sameEditorComposition(left TextComposition?, right TextComposition?) bool {
  guard let leftValue = left, let rightValue = right else { return left == nil && right == nil }
  return leftValue.Range == rightValue.Range && leftValue.Text == rightValue.Text
    && leftValue.SelectionStart == rightValue.SelectionStart
    && leftValue.SelectionLength == rightValue.SelectionLength
}

internal class TextEditorLayerBindings {
  shared {
    private let states List[TextEditorRenderState] = List[TextEditorRenderState]()

    internal func Register(state TextEditorRenderState) {
      if !states.Contains(state) { states.Add(state) }
    }

    internal func Unregister(state TextEditorRenderState) {
      states.Remove(state)
    }

    internal func Changed(layer TextPresentationLayer, change TextPresentationLayerChange) {
      for state in states {
        for index in 0 ... state.LayerCount {
          if state.Layer(index) == layer {
            state.LayerChanged(change)
            break
          }
        }
      }
    }

    private func hasLayerOverlap(layer TextPresentationLayer, textRange TextRange) bool {
      for state in states {
        var contains = false
        for layerIndex in 0 ... state.LayerCount {
          if state.Layer(layerIndex) == layer {
            contains = true
            break
          }
        }
        if !contains { continue }
        for layerIndex in 0 ... state.LayerCount {
          let candidate = state.Layer(layerIndex)
          if candidate == layer { continue }
          for projection in candidate.ReadProjections() {
            if rangesEditorOverlap(textRange, projection.Range) { return true }
          }
        }
      }
      return false
    }

    internal func EnsureNonOverlapping(layer TextPresentationLayer, textRange TextRange) {
      if hasLayerOverlap(layer, textRange) {
        throw ArgumentException("Layout-affecting projections cannot overlap", "range")
      }
    }

    internal func CanRestoreNonOverlapping(layer TextPresentationLayer,
      textRange TextRange) bool -> !hasLayerOverlap(layer, textRange)
  }
}
