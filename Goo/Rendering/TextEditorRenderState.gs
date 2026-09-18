package Goo

import Facebook.Yoga
import System
import System.Collections.Generic

internal sealed class TextEditorRenderState : IDisposable {
  private let node Node
  private let document TextDocument
  private let controller TextEditorController
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
  private var disposed bool

  internal prop ReadOnly bool{ get; set; }
  internal prop Layout TextEditorVisualLayout? { get; set; }
  internal prop Dirty bool{ get; set; }
  internal prop PlaceholderShape ShapedText? { get; set; }

  internal init(node Node, document TextDocument, controller TextEditorController,
    layers []TextPresentationLayer, readOnly bool) {
      this.node = node
      this.document = document
      this.controller = controller
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
      ReadOnly = readOnly
      Dirty = true
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
      layers = copyEditorLayers(nextLayers)
      ClearParagraphs()
      Invalidate(true)
    }
    ReadOnly = readOnly
  }

  public func Dispose() {
    if disposed {
      return
    }
    disposed = true
    ClearParagraphs()
    analyses.Clear()
    PlaceholderShape?.Dispose()
    PlaceholderShape = nil
    Layout = nil
  }

  internal func DocumentChanged(change TextDocumentChange) {
    RebaseParagraphs(change)
    if !retainLayoutAfter(change) {
      Invalidate(true) }
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

  internal func Invalidate(intrinsic bool) {
    Dirty = true
    Layout = nil
    if intrinsic && !(node.Width.HasMagnitude && node.Height.HasMagnitude) {
      if let yoga = node.Yoga { YGNodeAPI.YGNodeMarkDirty(yoga) }
    }
  }
}
