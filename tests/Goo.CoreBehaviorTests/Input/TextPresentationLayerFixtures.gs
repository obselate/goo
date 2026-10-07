package Goo

import System
import System.Diagnostics
import System.Text

internal class TextPresentationLayerFixtures {
  func InlineTextSlotsShareProseBaselineAfterWrapping() bool {
    let document = TextDocument("before code after")
    using let controller = TextEditorController(document)
    using let layer = TextPresentationLayer(document)
    let code = Container{Padding: 3, BorderWidth: 1}
    code.Children.Add(Text{Content: "code", FontFamily: "monospace", FontSize: 11, LineHeight: 1.0})
    layer.SetInlineSlot("code", TextRange(7, 4), code)
    let cell = TextInlineBaselineCell(controller, layer)
    let driver = InputFixtureDriver(cell, 320, 160)
    for width in []int32{300, 70} {
      cell.Width = width
      cell.Rebuild()
      driver.Update()
      let editor = driver.Window.Tree!!
      let slot = editor.Children[0]
      let text = slot.Children[0].Children[0]
      guard let shape = text.TextLayout else { throw InvalidOperationException("Inline text has no layout") }
      let baseline = BoxGeometry.ContentTop(text)
        + (TextLayouts.resolvedLineHeight(text) - (shape.Descent - shape.Ascent)) * 0.5F - shape.Ascent
      let layout = TextEditorLayouts.For(editor, BoxGeometry.ContentWidth(editor), BoxGeometry.ContentHeight(editor))
      var found bool
      for line in layout.Lines {
        if line.Slots.Count == 0 { continue }
        let proseBaseline = BoxGeometry.ContentTop(editor) + line.Top
          + (line.Height - (line.Descent - line.Ascent)) * 0.5F - line.Ascent
        if Math.Abs(proseBaseline - baseline) > 0.01F
          || slot.Rect.Y < BoxGeometry.ContentTop(editor) + line.Top - 0.01F
          || slot.Rect.Y + slot.Rect.H > BoxGeometry.ContentTop(editor) + line.Top + line.Height + 0.01F {
          throw InvalidOperationException("Inline baseline=" + baseline.ToString() + " prose=" + proseBaseline.ToString()
            + " slot=" + slot.Rect.ToString() + " lineTop=" + line.Top.ToString() + " lineHeight=" + line.Height.ToString())
        }
        found = true
      }
      if !found || (width == 70 && layout.Lines.Count < 2) { throw InvalidOperationException("Missing wrapped slot: width=" + editor.Rect.W.ToString() + " lines=" + layout.Lines.Count.ToString()) }
    }
    return true
  }

  func BulkStyleReplacementIsAtomicAndPreservesProjections() bool {
    let document = TextDocument("alpha beta")
    using let layer = TextPresentationLayer(document)
    layer.SetStyle("old", TextRange(0, 5), Style{ Color: Color.Parse("#ff0000") })
    layer.SetReplacement("projection", TextRange(6, 4), "B")
    let first = TextStyleSpan("first", TextRange(0, 5), Style{ Color: Color.Parse("#00ff00") })
    let second = TextStyleSpan("second", TextRange(6, 4), Style{ Color: Color.Parse("#0000ff") })
    let before = layer.Revision
    layer.ReplaceStyles([]TextStyleSpan{ first, second })
    if layer.Revision != before + 1 || layer.ReadStyleSpans().Length != 2
      || layer.ReadStyleSpans()[0].Key != "first" || layer.ReadProjections().Length != 1 {
      return false
    }
    let replaced = layer.Revision
    try {
      layer.ReplaceStyles([]TextStyleSpan{ first, second with{Key = "first"} })
      return false
    } catch (ArgumentException) { }
    try {
      layer.ReplaceStyles([]TextStyleSpan{ first, second with{Range = TextRange(99, 1)} })
      return false
    } catch (ArgumentOutOfRangeException) { }
    if layer.Revision != replaced || layer.ReadStyleSpans().Length != 2
      || layer.ReadStyleSpans()[1].Range != second.Range || layer.ReadProjections().Length != 1 {
      return false
    }
    document.Apply(TextChange(TextRange(0, 1), ""))
    if layer.ReadStyleSpans()[1].Range.Start != 5 { return false }
    document.Undo()
    if layer.ReadStyleSpans()[1].Range != second.Range { return false }
    layer.ReplaceStyles([]TextStyleSpan{})
    return layer.ReadStyleSpans().Length == 0 && layer.ReadProjections().Length == 1
  }

  func ViewportScrollReusesStyleSpansUntilRevisionChanges() bool {
    let text = StringBuilder()
    let spans = [2000]TextStyleSpan
    let style = Style{ Color: Color.Parse("#aabbcc") }
    for i in 0 ... spans.Length {
      text.Append("alpha\n")
      spans[i] = TextStyleSpan(i.ToString(), TextRange(i * 6, 5), style)
    }
    let document = TextDocument(text.ToString())
    using let controller = TextEditorController(document)
    using let layer = TextPresentationLayer(document)
    layer.ReplaceStyles(spans)
    let driver = InputFixtureDriver(TextPresentationCacheCell(controller, layer), 320, 120)
    let node = driver.Window.Tree!!
    let revision = int64(17 * 31) + layer.Revision
    let initial = node.EditorState!!.CachedStyles(revision)
    if initial == nil || initial.Count != spans.Length { return false }
    let first = initial[0]
    let start = Stopwatch.GetTimestamp()
    for i in 1 ... 101 {
      controller.ScrollTo(0.0, float64(i * 15))
      driver.Update()
      let current = driver.Window.Tree!!.EditorState!!.CachedStyles(revision)
      if current == nil || !Object.ReferenceEquals(first, current[0]) { return false }
    }
    Console.WriteLine("100 styled viewport scroll updates: "
      + Stopwatch.GetElapsedTime(start).TotalMilliseconds.ToString("F2") + " ms")
    layer.ReplaceStyles([]TextStyleSpan{ spans[0] })
    driver.Update()
    let changed = driver.Window.Tree!!.EditorState!!.CachedStyles(int64(17 * 31) + layer.Revision)
    return changed != nil && changed.Count == 1 && !Object.ReferenceEquals(first, changed[0])
  }

  func AbsolutePreviewEditorAvoidsFullDocumentInitialMeasure() bool {
    let text = StringBuilder()
    for i in 0 ... 2000 { text.Append("alpha\n") }
    let document = TextDocument(text.ToString())
    using let controller = TextEditorController(document)
    let driver = InputFixtureDriver(TextPreviewMeasureCell(controller), 320, 120)
    let editor = driver.Window.Tree!!.Children[1].Children[0]
    let count = editor.EditorState!!.ParagraphBuildCount
    Console.WriteLine("Absolute preview initial paragraphs: " + count.ToString())
    return count > 0 && count < 100
  }
}

internal class TextPreviewMeasureCell : Cell {
  private let controller TextEditorController

  internal init(controller TextEditorController) { this.controller = controller }

  override func Build() Blob {
    let root = Container{ Width: 320, Height: 120, FlexDirection: FlexDirection.Column }
    root.Children.Add(Container{ Height: 20 })
    let wrapper = Container{ FlexGrow: 1, FlexBasis: 0, MinWidth: 0, MinHeight: 0 }
    wrapper.Children.Add(TextEditor(controller) {
      Position = PositionType.Absolute,
      Left = 0,
      Right = 0,
      Top = 0,
      Bottom = 0,
      ReadOnly = true,
      TextWrap = TextWrap.NoWrap,
      OverscanLines = 3,
    })
    root.Children.Add(wrapper)
    return root
  }
}

internal class TextPresentationCacheCell : Cell {
  private let controller TextEditorController
  private let layer TextPresentationLayer

  internal init(controller TextEditorController, layer TextPresentationLayer) {
    this.controller = controller
    this.layer = layer
  }

  override func Build() Blob -> TextEditor(controller, []TextPresentationLayer{ layer }) {
    Width = 300,
    Height = 100,
    ReadOnly = true,
    TextWrap = TextWrap.NoWrap,
  }
}

internal class TextInlineBaselineCell : Cell {
  private let controller TextEditorController
  private let layer TextPresentationLayer
  internal var Width int32 = 300

  internal init(controller TextEditorController, layer TextPresentationLayer) {
    this.controller = controller
    this.layer = layer
  }

  override func Build() Blob -> TextEditor(controller, []TextPresentationLayer{layer}) {
    Width = float64(this.Width),
    Height = 150,
    ReadOnly = true,
    FontSize = 14,
    LineHeight = 1.5,
  }
}
