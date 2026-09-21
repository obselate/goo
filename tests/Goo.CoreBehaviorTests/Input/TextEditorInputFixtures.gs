package Goo

import System.Diagnostics

internal class TextEditorInputFixtures {
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
      driver.Update()
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
      driver.Update()
      driver.Input.Step(driver.Window.Tree, driver.Resolver, 1.0, startTicks + delayTicks)
      if controller.Selection.Active.Offset != firstOffset { return false }
      driver.Input.QueueKeyRelease(key)
      driver.Drain()
      driver.Input.Step(driver.Window.Tree, driver.Resolver, 1.0, startTicks + delayTicks * 2)
      return controller.Selection.Active.Offset == firstOffset
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

  override func Build() Blob -> TextEditor(Controller) {
    Key = "editor",
    Width = 300.0,
    Height = 100.0,
    FontSize = 16.0,
    OnSubmit = () -> { Submits++ },
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
    TextEditor(Controller) {
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
