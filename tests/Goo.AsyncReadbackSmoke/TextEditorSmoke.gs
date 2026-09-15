package GooAsyncReadbackSmoke

import Goo
import System
import System.IO

class TextEditorSmokeCell : Cell {
  shared {
    let Editor ElementHandle = ElementHandle{}
    let InlineSlot ElementHandle = ElementHandle{}
    let BlockSlot ElementHandle = ElementHandle{}
  }

  internal let Document TextDocument
  internal let Controller TextEditorController
  private let presentation TextPresentationLayer

  init() {
    Document = TextDocument("A [[inline]] Z\n[[block]]\nline 3\nline 4\nline 5\nline 6")
    Controller = TextEditorController(Document)
    presentation = TextPresentationLayer(Document)
    presentation.SetInlineSlot("inline", TextRange(2, 10), Container{
      Handle: TextEditorSmokeCell.InlineSlot,
      Width: 56,
      Height: 20,
      BackgroundColor: Color.Rgb(52, 204, 112),
    })
    presentation.SetBlockSlot("block", TextRange(15, 9), Container{
      Handle: TextEditorSmokeCell.BlockSlot,
      Width: 220,
      Height: 32,
      BackgroundColor: Color.Rgb(232, 152, 48),
    })
  }

  override func Build() Blob ->
  Container() {.Width: Length.Percent(100),.Height: Length.Percent(100),.Position: PositionType.Relative,.BackgroundColor: Color.Rgb(12, 20, 32),
    TextEditor(Controller, []TextPresentationLayer{ presentation }) {
        Handle = TextEditorSmokeCell.Editor,
        Position = PositionType.Absolute,
        Left = 24,
        Top = 20,
        Width = 260,
        Height = 92,
        Padding = 12,
        FontFamily = "TextEditorSmokeFont",
        FontSize = 18,
        LineHeight = 1.0,
        OverscanLines = 0,
        BackgroundColor = Color.Rgb(24, 40, 64),
        Color = Color.Rgb(232, 238, 248),
    },
  }

  internal func DisposeOwned() {
    presentation.Dispose()
    Controller.Dispose()
  }
}

func RunTextEditorSmoke() {
  Require(Environment.GetEnvironmentVariable("GOO_VK_DIAGNOSTICS") == "1",
    "GOO_VK_DIAGNOSTICS=1 is required")
  let fontPath = Path.Combine(AppContext.BaseDirectory, "VendSans-VariableFont_wght.ttf")
  Require(File.Exists(fontPath), "Text editor slot font asset is missing")
  let font = FontSource("TextEditorSmokeFont", 400, false, File.ReadAllBytes(fontPath))
  font.Register()
  let cell = TextEditorSmokeCell{}
  let capturedError = StringWriter()
  let originalError = Console.Error
  var window Window? = nil
  try {
    let opened = Window{
      Title: "Goo text editor slots gate",
      Width: 320,
      Height: 150,
      VSync: false,
      Root: cell,
    }
    window = opened
    Console.SetError(capturedError)
    opened.Open()
    var frame int32
    while frame < 8 {
      WindowReadbackTestFixture.ForceRender(opened, 0.0166666666666667)
      frame++
    }
    let metrics = WindowReadbackTestFixture.Metrics(opened)
    Require(metrics.LogicalWidth == 320 && metrics.LogicalHeight == 150,
      "Text editor slot window metrics are incorrect")
    Require(TextEditorSmokeCell.Editor.IsMounted
        && TextEditorSmokeCell.InlineSlot.IsMounted
        && TextEditorSmokeCell.BlockSlot.IsMounted,
      "Text editor slot gate did not mount all handles")
    let editorContent = TextEditorSmokeCell.Editor.ContentBox
    let inlineBefore = TextEditorSmokeCell.InlineSlot.BorderBox
    let blockBefore = TextEditorSmokeCell.BlockSlot.BorderBox
    Require(inlineBefore.X >= editorContent.X
        && inlineBefore.X + inlineBefore.Width <= editorContent.X + editorContent.Width
        && inlineBefore.Y >= editorContent.Y
        && inlineBefore.Y + inlineBefore.Height <= editorContent.Y + editorContent.Height,
      "Inline editor slot is outside the initial content bounds")
    Require(blockBefore.X >= editorContent.X
        && blockBefore.X + blockBefore.Width <= editorContent.X + editorContent.Width
        && blockBefore.Y >= editorContent.Y
        && blockBefore.Y + blockBefore.Height <= editorContent.Y + editorContent.Height,
      "Block editor slot is outside the initial content bounds")
    let initial = PrimitiveReadback(opened, metrics)
    PrimitiveRequirePixelNear(initial.Pixels, initial.Width, metrics,
      inlineBefore.X + inlineBefore.Width * 0.5,
      inlineBefore.Y + inlineBefore.Height * 0.5,
      uint8(52), uint8(204), uint8(112), 8, "text_editor_inline_slot")
    PrimitiveRequirePixelNear(initial.Pixels, initial.Width, metrics,
      blockBefore.X + blockBefore.Width * 0.5,
      blockBefore.Y + blockBefore.Height * 0.5,
      uint8(232), uint8(152), uint8(48), 8, "text_editor_block_slot")
    Require(WindowReadbackTestFixture.SceneRetention(opened).TextSegmentCount > 0,
      "Text editor slot scene did not retain editor text")

    var warmScroll int32
    while warmScroll < 8 {
      cell.Controller.ScrollTo(0.0, (warmScroll & 1) == 0 ? 12.0 : 0.0)
      WindowReadbackTestFixture.ForceRender(opened, 0.0166666666666667)
      warmScroll++
    }
    let countersBeforeScroll = WindowReadbackTestFixture.DiagnosticCounters(opened)
    cell.Controller.ScrollTo(0.0, 12.0)
    WindowReadbackTestFixture.ForceRender(opened, 0.0166666666666667)
    let countersAfterScroll = WindowReadbackTestFixture.DiagnosticCounters(opened)
    Require(countersAfterScroll.vulkanObjectAllocationCount
      == countersBeforeScroll.vulkanObjectAllocationCount
        && countersAfterScroll.vulkanDeviceMemoryAllocationCount
      == countersBeforeScroll.vulkanDeviceMemoryAllocationCount,
      "Text editor slot scroll created Vulkan resources")
    let inlineAfter = TextEditorSmokeCell.InlineSlot.BorderBox
    Require(inlineAfter.Y < editorContent.Y
        && inlineAfter.Y + inlineAfter.Height > editorContent.Y,
      "Scrolled inline editor slot does not cross the content boundary")
    let scrolled = PrimitiveReadback(opened, metrics)
    let inlineSampleX = inlineAfter.X + inlineAfter.Width * 0.5
    PrimitiveRequirePixelNear(scrolled.Pixels, scrolled.Width, metrics,
      inlineSampleX, editorContent.Y - 4.0,
      uint8(24), uint8(40), uint8(64), 8, "text_editor_slot_clipped")
    PrimitiveRequirePixelNear(scrolled.Pixels, scrolled.Width, metrics,
      inlineSampleX, editorContent.Y + 4.0,
      uint8(52), uint8(204), uint8(112), 8, "text_editor_slot_visible")

    opened.RequestClose()
    WindowReadbackTestFixture.ForceRender(opened, 0.0)
    Require(!opened.IsOpen, "Text editor slot gate window did not close")
    Require(WindowReadbackTestFixture.ResidentResourceBytes(opened) == 0uL,
      "Text editor slot resources remain resident after close")
  } finally {
    Console.SetError(originalError)
    if let active = window {
      if active.IsOpen {
        active.RequestClose()
        WindowReadbackTestFixture.ForceRender(active, 0.0)
      }
    }
    cell.DisposeOwned()
    font.Dispose()
  }
  let diagnostics = capturedError.ToString()
  ReadbackValidateCommonDiagnostics(diagnostics)
  Require(!diagnostics.Contains("\"event\":325")
      && !diagnostics.Contains("\"event\":326"),
    "Text editor slot gate emitted unsupported-scene diagnostics")
  Console.WriteLine("text-editor-smoke: inline=1 block=1 clip=1 text=1"
    +" warmVkAlloc=0 close=1")
}
