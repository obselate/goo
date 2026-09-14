package GooAsyncReadbackSmoke

import System
import System.IO
import System.Threading
import Goo

class NativeAccessibilitySmokeCell : Cell {
  internal let EditorHandle ElementHandle = ElementHandle()
  internal let LabelHandle ElementHandle = ElementHandle()
  internal let DialogHandle ElementHandle = ElementHandle()
  internal var DialogFocused bool
  internal let Controller TextEditorController = TextEditorController(TextDocument("Hello 😀 world\nSecond line"))
  internal var Clicks int32
  internal var Selected bool = true
  internal var Modal bool
  internal var Removed bool

  public override func Build() Blob {
    let editor = TextEditor(Controller) {
      Handle = EditorHandle, Width = 480, Height = 110, FontSize = 18,
      Padding = 12, BackgroundColor = Color.Rgb(31, 43, 60), BorderRadius = 8,
      Accessibility = Accessibility{Relationships: AccessibilityRelationships{LabelledBy: []ElementHandle{LabelHandle}}},
    }
    return Container{Padding: 24, Gap: 14, BackgroundColor: Color.Rgb(16, 23, 33), Color: Color.Rgb(230, 236, 244), Children: {
      Text{Content: "Native accessibility", FontSize: 27},
      Text{Content: "AT-SPI · retained nodes · native actions", FontSize: 14, Color: Color.Rgb(145, 171, 194)},
      Container{Disabled: Modal, Opacity: if Modal {0.25} else {1.0}, Accessibility: Accessibility{Hidden: Modal}, Gap: 12, Children: {
        Text{Handle: LabelHandle, Content: "Message", FontSize: 16},
        editor,
        Button{Children: {Text("Save message")}, OnClick: () -> Clicks++, Height: 40,
          BackgroundColor: Color.Rgb(34, 99, 143), BorderRadius: 7},
        Text{Content: "Saved " + Clicks.ToString() + " times", FontSize: 15, Accessibility: Accessibility{Role: AccessibilityRole.Status, Live: AccessibilityLive.Polite}},
        Container{Accessibility: Accessibility{Role: AccessibilityRole.List, Name: "Conversations"}, Children: {
          Button{Children: {Text("Selected conversation")}, Display: if Removed { Display.None } else { Display.Flex }, Height: 38,
            BackgroundColor: Color.Rgb(36, 67, 82), Accessibility: Accessibility{
              Role: AccessibilityRole.ListItem, Name: "Selected conversation", Selected: Selected, Actions: []AccessibilityAction{AccessibilityAction.Select, AccessibilityAction.Deselect},
              OnAction: (request AccessibilityActionRequest) -> {Selected = request.Action == AccessibilityAction.Select
                return true},
            }},
        }},
        Button{Children: {Text("Open dialog")}, OnClick: () -> Modal = true, Height: 38},
      }},
      Container{Display: if Modal { Display.Flex } else { Display.None }, Position: PositionType.Absolute, Left: 24, Top: 180, Width: 512, Height: 210, Padding: 22, Gap: 16,
        BackgroundColor: Color.Rgb(43, 53, 78), BorderRadius: 10,
        Accessibility: Accessibility{Role: AccessibilityRole.Dialog, Name: "Review message", Modal: true}, Children: {
          Text("Review message") {FontSize = 23},
          Text("This dialog is exposed as a native modal scope."),
          Button{Handle: DialogHandle, Children: {Text("Close dialog")}, OnClick: () -> Modal = false, Height: 38},
        }},
    }}
  }
}

func RunNativeAccessibilitySmoke() {
  let directory = Environment.GetEnvironmentVariable("GOO_NATIVE_ACCESSIBILITY_PROOF") ?? ""
  Require(directory != "" && NativeAccessibilityAdapter.IsAvailable, "Native accessibility runtime is unavailable")
  let adapter = NativeAccessibilityAdapter()
  let root = NativeAccessibilitySmokeCell()
  let window = Window{Title: "Goo Native Accessibility Proof", Width: 560, Height: 550, Root: root, AccessibilityAdapter: adapter}.Open()
  try {
    OwnershipSettle([]Window{window})
    root.EditorHandle.Focus()
    File.WriteAllText(Path.Combine(directory, "ready"), Environment.ProcessId.ToString())
    let deadline = Environment.TickCount64 + 120000
    while !File.Exists(Path.Combine(directory, "done")) && Environment.TickCount64 < deadline {
      window.Pump(0.016)
      if root.Modal && !root.DialogFocused && root.DialogHandle.Focus() {root.DialogFocused = true}
      if !root.Modal && root.DialogFocused && root.EditorHandle.Focus() {root.DialogFocused = false}
      if File.Exists(Path.Combine(directory, "remove")) && !root.Removed {root.Removed = true
        root.Rebuild()}
      if root.Controller.Selection.Anchor.Offset == 6 && root.Controller.Selection.Active.Offset == 8 { File.WriteAllText(Path.Combine(directory, "selected"), "utf16=6:8") }
      if root.Clicks > 0 { File.WriteAllText(Path.Combine(directory, "clicked"), root.Clicks.ToString()) }
      if root.Controller.Document.GetText().StartsWith("Updated", StringComparison.Ordinal) { File.WriteAllText(Path.Combine(directory, "edited"), root.Controller.Document.GetText()) }
      Require(window.LastAccessibilityError == nil, "Native accessibility delivery failed: " + (window.LastAccessibilityError?.ToString() ?? ""))
      Thread.Sleep(8)
    }
    Require(File.Exists(Path.Combine(directory, "done")) && root.Clicks == 1, "Native accessibility inspector did not complete actions")
    window.RequestClose()
    OwnershipSettle([]Window{window})
    Require(!window.IsOpen && WindowReadbackTestFixture.ResidentResourceBytes(window) == 0uL, "Native accessibility close leaked resources")
    adapter.Dispose()
    Console.WriteLine("native-accessibility: inspector=1 button=1 text=1 selection=1 row=1 modal=1 removal=1 close=1")
  } finally {if window.IsOpen {window.RequestClose()
    OwnershipSettle([]Window{window})}
    adapter.Dispose()
    root.Controller.Dispose()}
}
