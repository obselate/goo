package Goo

import System.Diagnostics
import System.Text

internal class TextEditorInputFixtures {
  func PageNavigationUsesViewportAndVisualLineGeometry() bool {
    let text = StringBuilder()
    for i in 0 ... 80 { text.Append("alpha beta gamma delta epsilon\n") }
    for wrap in []TextWrap{ TextWrap.NoWrap, TextWrap.Wrap } {
      for height in []int32{ 60, 400 } {
        let document = TextDocument(text.ToString())
        using let controller = TextEditorController(document)
        using let layer = TextPresentationLayer(document)
        layer.SetStyle("large", TextRange(0, 30), Style{ FontSize: 30 })
        let node = Reconciler{ Res: Resolver{} }.Mount(TextEditor(){Controller = controller, Layers = []TextPresentationLayer{layer},
          Width = 160, Height = float64(height), FontSize = 14, LineHeight = 1.5,
          TextWrap = wrap, OverscanLines = 40,
        })
        Layout{}.Calculate(node, 160.0F, float32(height))
        let layout = TextEditorLayouts.For(node, BoxGeometry.ContentWidth(node), BoxGeometry.ContentHeight(node))
        let first = layout.Lines[0]
        let y = first.Top + first.Height * 0.5F + BoxGeometry.ViewportHeight(node)
        var expected = first
        for line in layout.Lines {
          if line.Top <= y { expected = line }
        }
        controller.Execute(TextCommand{ Kind: TextCommandKind.PageDown, ExtendSelection: true })
        let offset = controller.Selection.Active.Offset
        if offset < expected.SourceStart || offset > expected.SourceEnd
          || controller.Selection.Anchor.Offset != 0 { return false }
        node.EditorOverscanLines = 0
        controller.ScrollTo(0, float64(expected.Top))
        TextEditorLayouts.Invalidate(node)
        TextEditorLayouts.For(node, BoxGeometry.ContentWidth(node), BoxGeometry.ContentHeight(node))
        controller.Execute(TextCommand{ Kind: TextCommandKind.PageUp })
        if controller.Selection.Active.Offset != 0 { return false }
      }
    }
    let document = TextDocument(text.ToString())
    using let controller = TextEditorController(document)
    controller.Execute(TextCommand{ Kind: TextCommandKind.PageDown })
    if document.GetLineIndex(controller.Selection.Active.Offset) != 10 { return false }
    controller.Execute(TextCommand{ Kind: TextCommandKind.PageUp })
    return controller.Selection.Active.Offset == 0
  }

  func CompositionCancelWithoutPreeditIssuesNoCommand() bool {
    let document = TextDocument("ab")
    using let controller = TextEditorController(document)
    let cell = TextEditorInputCell(document, controller)
    let driver = InputFixtureDriver(cell, 320, 120)
    let start = editorPoint(driver.Window.Tree!!,
      TextPosition{ Offset: 0, Affinity: TextAffinity.Upstream })
    driver.Press(start.X, start.Y)
    if !controller.IsFocused { return false }
    var commands = 0
    controller.OnCommand = _ -> { commands++ }
    driver.Input.QueueCompositionCancel()
    driver.Drain()
    if commands != 0 { return false }
    driver.Input.QueueComposition("a\u0301", 1, 0)
    driver.Drain()
    if controller.Composition == nil || commands != 1 { return false }
    driver.Input.QueueCompositionCancel()
    driver.Drain()
    return commands == 2 && controller.Composition == nil && document.GetText() == "ab"
  }

  func KeyboardCompositionClipboardAndSubmit() bool {
    let savedMac = InputPolicy.Mac
    InputPolicy.Mac = false
    try {
      let document = TextDocument("ab")
      using let controller = TextEditorController(document)
      let cell = TextEditorInputCell(document, controller)
      let driver = InputFixtureDriver(cell, 320, 120)
      driver.UseBindings()
      let start = editorPoint(driver.Window.Tree!!,
        TextPosition{ Offset: 0, Affinity: TextAffinity.Upstream })
      driver.Press(start.X, start.Y)
      if !controller.IsFocused { return false }

      driver.Char("X")
      if document.GetText() != "Xab" { return false }
      driver.Input.QueueComposition("a\u0301", 1, 0)
      driver.Drain()
      if controller.Composition == nil || controller.Composition!!.Text != "a\u0301"
        || controller.Composition!!.SelectionStart != 0
        || controller.Composition!!.SelectionLength != 0 {
          return false
        }
      driver.Input.QueueComposition("yz", -1, -1)
      driver.Drain()
      if document.GetText() != "Xab" || controller.Composition == nil
        || controller.Composition!!.Text != "yz" || controller.Composition!!.SelectionStart != 0 {
          return false
        }
      driver.Input.QueueCompositionCandidates([]string{ "yz", "yx" }, 0, false)
      driver.Input.QueueText("yz")
      driver.Drain()
      if document.GetText() != "Xyzab" || controller.Composition != nil { return false }

      driver.Key(Key.A, KeyModifiers{ Ctrl: true })
      driver.Key(Key.C, KeyModifiers{ Ctrl: true })
      driver.Key(Key.X, KeyModifiers{ Ctrl: true })
      if document.GetText() != "" { return false }
      driver.Key(Key.Z, KeyModifiers{ Ctrl: true })
      if document.GetText() != "Xyzab" { return false }
      driver.Key(Key.Enter, KeyModifiers{ Ctrl: true })
      if cell.Submits != 1 || document.GetText() != "Xyzab" { return false }
      driver.Key(Key.Enter, KeyModifiers{})
      return document.GetText() == "Xyzab\n"
    } finally {
      InputPolicy.Mac = savedMac
    }
  }

  func PointerSelectsWordLineShiftAndFocusesController() bool {
    let document = TextDocument("one two\nthree")
    using let controller = TextEditorController(document)
    let cell = TextEditorInputCell(document, controller)
    let driver = InputFixtureDriver(cell, 320, 120)
    driver.UseBindings()
    let editor = driver.Window.Tree!!
    let word = editorPoint(editor, TextPosition{ Offset: 1, Affinity: TextAffinity.Downstream })

    driver.Press(word.X, word.Y)
    driver.Release(word.X, word.Y)
    driver.Press(word.X, word.Y)
    driver.Release(word.X, word.Y)
    if controller.Selection.Anchor.Offset != 0 || controller.Selection.Active.Offset != 3 {
      return false
    }
    driver.Press(word.X, word.Y)
    driver.Release(word.X, word.Y)
    if controller.Selection.Anchor.Offset != 0 || controller.Selection.Active.Offset != 8 {
      return false
    }

    controller.Selection = TextSelection{
      Anchor: TextPosition{ Offset: 0, Affinity: TextAffinity.Upstream },
      Active: TextPosition{ Offset: 0, Affinity: TextAffinity.Upstream },
    }
    let end = editorPoint(editor, TextPosition{ Offset: 7, Affinity: TextAffinity.Downstream })
    driver.Input.QueuePointerPress(end.X, end.Y, PointerButton.Primary, KeyModifiers{ Shift: true })
    driver.Drain()
    driver.Input.QueuePointerRelease(end.X, end.Y, PointerButton.Primary, KeyModifiers{ Shift: true })
    driver.Drain()
    if controller.Selection.Anchor.Offset != 0 || controller.Selection.Active.Offset != 7 {
      return false
    }

    driver.Press(word.X, word.Y)
    driver.Move(end.X, end.Y)
    driver.Release(end.X, end.Y)
    if controller.Selection.Anchor.Offset != 1 || controller.Selection.Active.Offset != 7 {
      return false
    }
    driver.Press(319.0F, 119.0F)
    return !controller.IsFocused
  }

  func ReadOnlyTabEscapesAndCommandsCanCancel() bool {
    let readOnlyDocument = TextDocument("read only")
    using let readOnlyController = TextEditorController(readOnlyDocument)
    let readOnlyDriver = InputFixtureDriver(
      TextEditorInputReadOnlyCell(readOnlyDocument, readOnlyController), 320, 120)
      readOnlyDriver.UseBindings()
    readOnlyDriver.Press(6.0F, 6.0F)
    if !readOnlyController.IsFocused { return false }
    readOnlyDriver.Key(Key.Tab, KeyModifiers{})
    if readOnlyController.IsFocused || !readOnlyDriver.Window.Tree!!.Children[1].Focused {
      return false
    }

    let document = TextDocument("a")
    using let controller = TextEditorController(document)
    let cancel Action[TextCommandEvent] = (args TextCommandEvent) -> {
      args.Cancel = args.Command.Kind == TextCommandKind.CommitComposition
        || args.Command.Kind == TextCommandKind.Insert
    }
    controller.OnCommand = cancel
    let driver = InputFixtureDriver(TextEditorInputCell(document, controller), 320, 120)
    driver.UseBindings()
    driver.Press(6.0F, 6.0F)
    driver.Char("x")
    driver.Key(Key.Enter, KeyModifiers{})
    return document.GetText() == "a"
  }

  func WheelScrollAndCaretBlinkUseEditorState() bool {
    let savedMac = InputPolicy.Mac
    InputPolicy.Mac = false
    try {
      let document = TextDocument("one\ntwo\nthree\nfour\nfive\nsix\nseven\neight")
      using let controller = TextEditorController(document)
      let driver = InputFixtureDriver(TextEditorInputCell(document, controller), 320, 120)
      driver.UseBindings()
      driver.Press(6.0F, 6.0F)
      if driver.Input.NextTickDeadlineSeconds() > 0.51 { return false }
      let before = driver.Window.Tree!!.BlinkT
      driver.Step(0.6)
      if driver.Window.Tree!!.BlinkT <= before { return false }
      driver.Wheel(6.0F, 6.0F, 0.0F, -1.0F)
      return controller.ScrollTargetY > 0.0
    } finally {
      InputPolicy.Mac = savedMac
    }
  }

  func NewVerticalRepeatDoesNotUsePreInputTime() bool -> verticalRepeatWaits(Key.Down, 0, 2, 4)
    && verticalRepeatWaits(Key.Up, 4, 2, 0)
    && stalledVerticalTapDoesNotRepeat(Key.Down, 0, 2)
    && stalledVerticalTapDoesNotRepeat(Key.Up, 4, 2)

  private func verticalRepeatWaits(key Key, startOffset int32, firstOffset int32,
    repeatOffset int32) bool{
      let document = TextDocument("a\nb\nc")
      using let controller = TextEditorController(document)
      let driver = InputFixtureDriver(TextEditorInputCell(document, controller), 320, 120)
      driver.UseBindings()
      let start = editorPoint(driver.Window.Tree!!,
        TextPosition{ Offset: startOffset, Affinity: TextAffinity.Upstream })
      driver.Press(start.X, start.Y)

      driver.Input.QueueKeyPress(key, KeyModifiers{})
      let startTicks = Stopwatch.GetTimestamp()
      driver.Input.Drain(driver.Window.Tree, driver.Resolver, driver.Time,
        driver.Window.KeyPressedCallbacksForTest, startTicks)
      if controller.Selection.Active.Offset != firstOffset { return false }

      let delayTicks = int64(Math.Ceiling(0.4 * float64(Stopwatch.Frequency)))
      driver.Input.Step(driver.Window.Tree, driver.Resolver, 1.0, startTicks)
      if controller.Selection.Active.Offset != firstOffset { return false }
      driver.Input.Step(driver.Window.Tree, driver.Resolver, 1.0, startTicks + delayTicks - 1)
      if controller.Selection.Active.Offset != firstOffset { return false }
      driver.Input.Step(driver.Window.Tree, driver.Resolver, 0.0, startTicks + delayTicks)
      return controller.Selection.Active.Offset == repeatOffset
    }

  private func stalledVerticalTapDoesNotRepeat(key Key, startOffset int32,
    firstOffset int32) bool{
      let document = TextDocument("a\nb\nc")
      using let controller = TextEditorController(document)
      let driver = InputFixtureDriver(TextEditorInputCell(document, controller), 320, 120)
      driver.UseBindings()
      let start = editorPoint(driver.Window.Tree!!,
        TextPosition{ Offset: startOffset, Affinity: TextAffinity.Upstream })
      driver.Press(start.X, start.Y)
      let startTicks = Stopwatch.GetTimestamp()
      let delayTicks = int64(Math.Ceiling(0.4 * float64(Stopwatch.Frequency)))
      driver.Input.QueueKeyPress(key, KeyModifiers{})
      driver.Input.Drain(driver.Window.Tree, driver.Resolver, driver.Time,
        driver.Window.KeyPressedCallbacksForTest, startTicks)
      driver.Input.Step(driver.Window.Tree, driver.Resolver, 1.0, startTicks + delayTicks)
      if controller.Selection.Active.Offset != firstOffset { return false }
      driver.Input.QueueKeyRelease(key)
      driver.Drain()
      driver.Input.Step(driver.Window.Tree, driver.Resolver, 1.0, startTicks + delayTicks * 2)
      return controller.Selection.Active.Offset == firstOffset
    }

  func LineNumbersRemainOutsideInputAcrossRebuilds() bool {
    let document = TextDocument("abcdefghij\nabcdefghij\nabcdefghij")
    using let controller = TextEditorController(document)
    let cell = TextEditorGutterCell(controller)
    let driver = InputFixtureDriver(cell, 640, 400)
    driver.UseBindings()
    let node = driver.Window.Tree!!
    let start = editorPoint(node, TextPosition{ Offset: 2, Affinity: TextAffinity.Downstream })
    driver.Press(start.X, start.Y)
    driver.Release(start.X, start.Y)
    if controller.Selection.Active.Offset != 2 { return false }
    driver.Key(Key.Down, KeyModifiers{})
    if controller.Selection.Active.Offset != 13 { return false }
    driver.Key(Key.Up, KeyModifiers{})
    if controller.Selection.Active.Offset != 2 { return false }
    let gutterX = BoxGeometry.ContentLeft(node) - node.Rect.X + 2.0F
    let gutterY = start.Y - node.Rect.Y
    var ignored TextPosition
    if TextEditorLayouts.TryHitTestForGeometry(node, gutterX, gutterY, out ignored) { return false }
    driver.Press(gutterX + node.Rect.X, start.Y)
    driver.Release(gutterX + node.Rect.X, start.Y)
    if controller.Selection.Active.Offset != 2 { return false }
    let selected = controller.Selection
    cell.ShowNumbers = false
    cell.Rebuild()
    driver.Update()
    if driver.Window.Tree != node || controller.Selection != selected
      || TextEditorLayouts.GutterWidth(node) != 0.0F { return false }
    cell.ShowNumbers = true
    cell.Wrap = true
    cell.Rebuild()
    driver.Update()
    if driver.Window.Tree != node || controller.Selection != selected
      || node.EditorController != controller || TextEditorLayouts.GutterWidth(node) <= 0.0F { return false }
    controller.Selection = TextSelection{
      Anchor: TextPosition{ Offset: 0, Affinity: TextAffinity.Downstream },
      Active: TextPosition{ Offset: 10, Affinity: TextAffinity.Upstream },
    }
    return controller.Copy() == "abcdefghij"
  }

  func WrappedPreviewResizeAtEndDoesNotInventHorizontalScrollbar() bool {
    let text = StringBuilder("package sample\n\nfunc preview() {\n    let words = \"")
    for i in 0 ... 12 {
      text.Append("Readable preview words keep their spacing across narrow panes. ")
    }
    text.Append("\"\n    let unicode = \"Résumé 東京 alpha beta gamma delta epsilon\"\n}\n")
    let document = TextDocument(text.ToString())
    using let controller = TextEditorController(document)
    let cell = TextEditorGutterCell(controller)
    cell.Wrap = true
    cell.ShowNumbers = false
    cell.EditorWidth = 283.5
    let driver = InputFixtureDriver(cell, 640, 400)
    driver.UseBindings()
    let initial = driver.Window.Tree!!
    var initialHorizontal ScrollThumbGeometry
    if maxScrollX(initial) != 0.0F || horizontalScrollThumb(initial, out initialHorizontal)
      || initial.ContentW > BoxGeometry.ViewportWidth(initial) + 0.01F { return false }
    cell.EditorWidth = 500.0
    cell.Rebuild()
    driver.Update()
    driver.Press(20.0F, 10.0F)
    driver.Key(Key.End, KeyModifiers{ Ctrl: true })
    cell.EditorWidth = 283.5
    cell.Rebuild()
    driver.Update()
    driver.Key(Key.End, KeyModifiers{ Ctrl: true })
    var horizontal ScrollThumbGeometry
    for showNumbers in []bool{ false, true } {
      cell.Align = showNumbers ? TextAlign.End : TextAlign.Start
      cell.ShowNumbers = showNumbers
      cell.Rebuild()
      driver.Update()
      driver.Key(Key.End, KeyModifiers{ Ctrl: true })
      let node = driver.Window.Tree!!
      let layout = TextEditorLayouts.For(node, BoxGeometry.ContentWidth(node), BoxGeometry.ContentHeight(node))
      if controller.Selection.Active.Offset != document.Length || maxScrollX(node) != 0.0F
        || horizontalScrollThumb(node, out horizontal)
        || node.ContentW > BoxGeometry.ViewportWidth(node) + 0.01F { return false }
      let caret = TextEditorLayouts.CaretRect(node, controller.Selection.Active)
      if caret.X + caret.W > BoxGeometry.ContentLeft(node) - node.Rect.X + BoxGeometry.ViewportWidth(node) + 0.01F {
        return false
      }
      var previousNumber int32 = 0
      for line in layout.Lines {
        if line.LineNumberShape == nil { continue }
        if line.DisplayStart != 0 || line.LineNumber <= previousNumber { return false }
        previousNumber = line.LineNumber
      }
    }
    return true
  }

  func LineNumberWidthUpdatesForOffscreenDigitBoundary() bool {
    let text = StringBuilder()
    for i in 0 ... 98 { text.Append("x\n") }
    let document = TextDocument(text.ToString())
    using let controller = TextEditorController(document)
    let driver = InputFixtureDriver(TextEditorGutterCell(controller), 640, 400)
    let node = driver.Window.Tree!!
    let before = TextEditorLayouts.GutterWidth(node)
    let offscreen = TextEditorLayouts.CaretRect(node,
      TextPosition{ Offset: document.Length, Affinity: TextAffinity.Downstream })
    if offscreen.X < BoxGeometry.ContentLeft(node) - node.Rect.X + before { return false }
    document.Apply(TextChange(TextRange(document.Length, 0), "x\n"))
    driver.Update()
    return document.LineCount == 100 && TextEditorLayouts.GutterWidth(node) > before
      && node.EditorState!!.ParagraphCacheCount < 100
  }

  func ScrollToEndBeforeMountReachesMeasuredEnd() bool {
    using let controller = TextEditorController(TextDocument(wrappedParagraphs()))
    controller.ScrollTo(0.0, 10000000.0)
    let driver = InputFixtureDriver(TextEditorWrappedCell(controller), 400, 300)
    driver.Update()
    let node = driver.Window.Tree!!
    let layout = TextEditorLayouts.For(node, BoxGeometry.ContentWidth(node), BoxGeometry.ContentHeight(node))
    let last = layout.Lines[layout.Lines.Count - 1]
    return last.SourceEnd == controller.Document.Length
      && last.Top + last.Height <= float32(controller.ScrollTargetY) + BoxGeometry.ViewportHeight(node) + 0.01F
  }

  func CaretRevealLandsAfterNearbyParagraphsAreMeasured() bool {
    using let controller = TextEditorController(TextDocument(wrappedParagraphs()))
    let driver = InputFixtureDriver(TextEditorWrappedCell(controller), 400, 300)
    let node = driver.Window.Tree!!
    let start = controller.Document.GetLineRange(2000).Start
    let caret = TextPosition{ Offset: start, Affinity: TextAffinity.Downstream }
    controller.Selection = TextSelection{ Anchor: caret, Active: caret }
    driver.Update()
    let rect = TextEditorLayouts.CaretRect(node, caret)
    let top = BoxGeometry.ContentTop(node) - node.Rect.Y
    return rect.Y >= top && rect.Y + rect.H <= top + BoxGeometry.ViewportHeight(node)
  }

  func CaretRevealInViewportShorterThanCaretIsStable() bool {
    using let controller = TextEditorController(TextDocument("one\ntwo\nthree\nfour"))
    let driver = InputFixtureDriver(TextEditorShortCell(controller), 400, 300)
    driver.Update()
    let node = driver.Window.Tree!!
    let caret = TextPosition{ Offset: controller.Document.GetLineRange(2).Start, Affinity: TextAffinity.Downstream }
    let first = TextEditorLayouts.RevealOffset(node, caret)
    ScrollState.To(node, float32(first.X), float32(first.Y), true)
    let second = TextEditorLayouts.RevealOffset(node, caret)
    if second != first { throw InvalidOperationException("first=${first.Y}, second=${second.Y}") }
    return true
  }

  func ContentHeightKeepsMeasuredParagraphsAfterEviction() bool {
    using let controller = TextEditorController(TextDocument(wrappedParagraphs()))
    let driver = InputFixtureDriver(TextEditorWrappedCell(controller), 400, 300)
    let node = driver.Window.Tree!!
    var previous = node.ContentH
    for step in 0 ... 80 {
      controller.ScrollTo(0.0, float64(if step < 40 { step } else { 80 - step }) * 150.0)
      driver.Update()
      if node.ContentH < previous { return false }
      previous = node.ContentH
    }
    return node.EditorState!!.ParagraphCacheCount < 200
  }

  func MeasuringLinesAboveViewportKeepsVisibleLinesInPlace() bool {
    using let controller = TextEditorController(TextDocument(wrappedParagraphs()))
    controller.ScrollTo(0.0, 30000.0)
    let driver = InputFixtureDriver(TextEditorWrappedCell(controller), 400, 300)
    driver.Update()
    let node = driver.Window.Tree!!
    let builds = node.EditorState!!.ParagraphBuildCount
    for step in 0 ... 20 {
      let layout = TextEditorLayouts.For(node, BoxGeometry.ContentWidth(node), BoxGeometry.ContentHeight(node))
      var anchor = layout.Lines[layout.Lines.Count - 1]
      for line in layout.Lines {
        if line.Top >= float32(controller.ScrollTargetY) {
          anchor = line
          break
        }
      }
      let before = anchor.Top - float32(controller.ScrollTargetY)
      ScrollState.By(node, 0.0F, -30.0F, true)
      driver.Update()
      let next = TextEditorLayouts.For(node, BoxGeometry.ContentWidth(node), BoxGeometry.ContentHeight(node))
      var found = false
      for line in next.Lines {
        if line.SourceStart == anchor.SourceStart && line.DisplayStart == anchor.DisplayStart {
          found = MathF.Abs(line.Top - float32(controller.ScrollTargetY) - before - 30.0F) <= 0.01F
        }
      }
      if !found { return false }
    }
    return node.EditorState!!.ParagraphBuildCount > builds
  }

  private func wrappedParagraphs() string {
    let text = StringBuilder()
    for i in 0 ... 3000 {
      if i > 0 { text.Append('\n') }
      for word in 0 ... (i * 7) % 23 + 1 { text.Append("word").Append(word).Append(' ') }
    }
    return text.ToString()
  }

  private func editorPoint(editor Node, position TextPosition) TextEditorInputPoint {
    let rect = TextEditorLayouts.CaretRect(editor, position)
    return TextEditorInputPoint{
      X: editor.Rect.X + rect.X,
      Y: editor.Rect.Y + rect.Y + rect.H * 0.5F,
    }
  }
}

internal class TextEditorInputCell : Cell {
  internal let Document TextDocument
  internal let Controller TextEditorController
  internal var Submits int32

  internal init(document TextDocument, controller TextEditorController) {
    Document = document
    Controller = controller
  }

  override func Build() Blob -> TextEditor(){ Controller = Controller,
    Key = "editor",
    Width = 300.0,
    Height = 100.0,
    FontSize = 16.0,
    OnSubmit = () -> { Submits++ },
  }
}

internal class TextEditorShortCell : Cell {
  private let controller TextEditorController

  internal init(controller TextEditorController) { this.controller = controller }

  override func Build() Blob -> TextEditor(){ Controller = controller, Width = 200.0, Height = 12.0, FontSize = 14.0 }
}

internal class TextEditorWrappedCell : Cell {
  private let controller TextEditorController

  internal init(controller TextEditorController) { this.controller = controller }

  override func Build() Blob -> TextEditor(){ Controller = controller,
    Width = 220.0, Height = 200.0, FontSize = 14.0, TextWrap = TextWrap.Wrap,
  }
}

internal class TextEditorInputReadOnlyCell : Cell {
  internal let Document TextDocument
  internal let Controller TextEditorController

  internal init(document TextDocument, controller TextEditorController) {
    Document = document
    Controller = controller
  }

  override func Build() Blob -> Container() {.Width: 320.0,.Height: 120.0,.FlexDirection: FlexDirection.Row,
    TextEditor(){ Controller = Controller,
        Key = "editor",
        Width = 250.0,
        Height = 100.0,
        ReadOnly = true,
      },
      Container{ Key: "after", Width: 40.0, Height: 40.0, Focusable: true },
    }
}

internal data struct TextEditorInputPoint {
  internal var X float32
  internal var Y float32
}

internal class TextEditorGutterCell : Cell {
  private let controller TextEditorController
  internal var ShowNumbers bool = true
  internal var Wrap bool
  internal var Align TextAlign = TextAlign.Start
  internal var EditorWidth float64 = 300.0

  internal init(controller TextEditorController) { this.controller = controller }

  override func Build() Blob -> TextEditor(){ Controller = controller,
    Key = "gutter-editor",
    Width = EditorWidth,
    Height = 278.0,
    FontFamily = "monospace, Noto Sans CJK",
    FontSize = 13.0,
    LineHeight = 1.5,
    TextWrap = Wrap ? TextWrap.Wrap : TextWrap.NoWrap,
    TextAlign = Align,
    ShowLineNumbers = ShowNumbers,
    LineNumberColor = Color.Rgb(80, 180, 80),
    OverflowX = Overflow.Scroll,
    OverflowY = Overflow.Scroll,
    ScrollbarX = Scrollbar{ Thickness: 6.0, Inset: 2.0, ReserveSpace: true,
      Track: Container{ BackgroundColor: Color.Rgb(40, 44, 48) },
      Thumb: Container{ BackgroundColor: Color.Rgb(120, 124, 128) } },
    ScrollbarY = Scrollbar{ Thickness: 6.0, Inset: 2.0, ReserveSpace: true,
      Track: Container{ BackgroundColor: Color.Rgb(40, 44, 48) },
      Thumb: Container{ BackgroundColor: Color.Rgb(120, 124, 128) } },
    ScrollbarVisibilityX = ScrollbarVisibility.Always,
    ScrollbarVisibilityY = ScrollbarVisibility.Always,
  }
}
