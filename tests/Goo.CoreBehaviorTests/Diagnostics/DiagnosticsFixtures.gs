package Goo

import System
import System.IO
import System.Text.Json

internal class DiagnosticsFixtures {
  func SnapshotIdentityAndDeltaContract() bool {
    let root = Node()
    root.Kind = NodeKind.Container
    root.Rect = Rect{ X: 0.0F, Y: 0.0F, W: 100.0F, H: 60.0F }
    let child = Node()
    child.Kind = NodeKind.Text
    child.Rect = Rect{ X: 0.0F, Y: 0.0F, W: 50.0F, H: 20.0F }
    child.Content = "before"
    child.Parent = root
    root.Children.Add(child)
    let state = DiagnosticTreeState()
    let first = state.Capture(root, "window-1", nil, nil)
    if !first.IsFull || first.Added.Count != 2 { return false }
    var childId int64 = 0
    for value in first.Added {
      if value.Content == "before" { childId = value.Id }
    }
    if childId == 0 { return false }
    child.Content = "after"
    let second = state.Capture(root, "window-1", nil, nil)
    if second.IsFull || second.Added.Count != 0 || second.Updated.Count != 1 {
      return false
    }
    if second.Updated[0].Id != childId { return false }
    root.Children.Remove(child)
    child.Parent = nil
    let third = state.Capture(root, "window-1", nil, nil)
    if third.RootId != first.RootId || third.Removed.Count != 1 { return false }
    if third.Removed[0] != childId { return false }
    root.Children.Add(child)
    child.Parent = root
    child.Content = "again"
    let fourth = state.Capture(root, "window-1", nil, nil)
    let full = state.FullSnapshot(fourth)
    if !full.IsFull || full.Added.Count != 2 || full.Updated.Count != 0 { return false }
    child.Content = "final"
    let fifth = state.Capture(root, "window-1", nil, nil)
    return !fifth.IsFull && fifth.Added.Count == 0 && fifth.Updated.Count == 1
      && fifth.Updated[0].Content == "final"
  }

  func CaptureRequestRetriesAfterNotReady() bool {
    let tracker = DiagnosticCaptureTracker()
    if !tracker.NeedsRequest { return false }
    tracker.Observe(WindowReadbackRequestStatus.NotReady)
    if !tracker.NeedsRequest { return false }
    tracker.Observe(WindowReadbackRequestStatus.Accepted)
    if tracker.NeedsRequest { return false }
    tracker.Reset()
    return tracker.NeedsRequest
  }

  func ResolvedSemanticsAndEditorPrivacyContract() bool {
    let secret = "synthetic-password-secret"
    let document = TextDocument(String('x', 20012))
    using let controller = TextEditorController(document)
    controller.Selection = TextSelection{
      Anchor: TextPosition{Offset: 3, Affinity: TextAffinity.Upstream},
      Active: TextPosition{Offset: 9, Affinity: TextAffinity.Downstream},
    }
    let window = Window{Root: DiagnosticsSemanticsCell(secret, controller), Width: 420, Height: 260}
    window.UpdateTree()
    let session = window.AttachDiagnostics()
    try {
      let snapshot = session.CaptureSnapshot(true)
      var entry DiagnosticNodeSnapshot?
      var password DiagnosticNodeSnapshot?
      var button DiagnosticNodeSnapshot?
      var editor DiagnosticNodeSnapshot?
      for node in snapshot.Added {
        if node.Key == "entry" { entry = node }
        if node.Key == "password" { password = node }
        if node.Key == "button" { button = node }
        if node.Key == "editor" { editor = node }
      }
      guard let normal = entry, let secureNode = password, let action = button,
        let textEditor = editor else { return false }
      return window.AccessibilityAdapter == nil
        && normal.AccessibilityRole == "TextInput" && normal.Text == "agent value"
        && normal.AccessibilityValue == "agent value" && normal.AccessibilityId != nil
        && action.AccessibilityRole == "Button" && action.AccessibilityName == "Save"
        && secureNode.AccessibilityValue != secret && secureNode.Text != secret
        && secureNode.Content != secret && secureNode.AccessibilityName != secret
        && secureNode.AccessibilityDescription != secret
        && textEditor.AccessibilityRole == "TextEditor" && textEditor.Text.Length == 16384
        && textEditor.TextLength == 20012 && textEditor.TextTruncated
        && textEditor.SelectionStart == 3 && textEditor.SelectionLength == 6
        && textEditor.Caret == 9
    } finally {
      session.Dispose()
    }
  }

  func InspectClickAndEscapeContract() bool {
    let window = Window{ Root: DiagnosticsInteractionCell{}, Width: 200, Height: 100 }
    window.UpdateTree()
    let session = window.AttachDiagnostics()
    try {
      guard let tree = window.Tree else { return false }
      let snapshot = session.CaptureSnapshot(true)
      var target = ""
      var targetId int64 = 0
      for node in snapshot.Added {
        if node.Key == "target" {
          target = node.Target
          targetId = node.Id
        }
      }
      if target == "" || !session.SelectTarget(target) || session.SelectedNodeId != targetId {
        return false
      }
      session.EnterInspectMode()
      if !session.PointerEvent(tree, PointerEventKind.Press, 20.0F, 20.0F,
        PointerButton.Primary) {
          return false
        }
      if !session.PointerEvent(tree, PointerEventKind.Release, 20.0F, 20.0F,
        PointerButton.Primary) {
          return false
        }
      if session.IsInspecting || session.SelectedNodeId == nil { return false }
      let selectedBeforePick = session.SelectedNodeId
      session.EnterInspectMode()
      guard let currentTree = window.Tree else { return false }
      if !session.PointerEvent(currentTree, PointerEventKind.Press, 500.0F, 500.0F,
        PointerButton.Primary) {
          return false
        }
      return if !session.KeyEvent(Key.Escape) { false } else { !session.IsInspecting && session.SelectedNodeId == selectedBeforePick }
    } finally {
      session.Dispose()
    }
  }

  func RuntimeOverrideInheritanceAndResetContract() bool {
    let originalColor = Color.Rgb(210, 48, 42)
    let overrideColor = Color.Rgb(25, 210, 120)
    let window = Window{ Root: DiagnosticsOverrideCell{}, Width: 200, Height: 100 }
    window.UpdateTree()
    let session = window.AttachDiagnostics()
    try {
      let snapshot = session.CaptureSnapshot()
      guard let nodeId = snapshot.RootId else { return false }
      var target = ""
      for node in snapshot.Added {
        if node.Id == nodeId { target = node.Target }
      }
      if target == "" { return false }
      using let invalidDocument = JsonDocument.Parse("{\"target\":\"" + target
        + "\",\"nodeId\":0,\"value\":\"Color = #19D278\"}")
      var rejectedBoth bool = false
      try { session.OverridePayload(invalidDocument.RootElement) }
      catch (_ ArgumentException) { rejectedBoth = true }
      if !rejectedBoth { return false }
      using let colorDocument = JsonDocument.Parse("{\"target\":\"" + target + "\""
        +",\"value\":\"Color = #19D278\"}")
      session.OverridePayload(colorDocument.RootElement)
      using let sizeDocument = JsonDocument.Parse("{\"nodeId\":" + nodeId.ToString()
        +",\"value\":\"FontSize = 22px\"}")
      session.OverridePayload(sizeDocument.RootElement)
      using let widthDocument = JsonDocument.Parse("{\"nodeId\":" + nodeId.ToString()
        +",\"property\":\"Width\",\"value\":\"100\\t\"}")
      let response = session.OverridePayload(widthDocument.RootElement)
      using let parsedResponse = JsonDocument.Parse(response)
      if parsedResponse.RootElement.GetProperty("value").GetString() != "100\t" { return false }
      window.UpdateTree()
      guard let overridden = window.Tree else { return false }
      if overridden.Color != overrideColor || overridden.FontSize.Value != 22.0F
        || overridden.Width.Value != 100.0F
        || overridden.Children.Count != 1 || overridden.Children[0].Color != overrideColor
        || overridden.Children[0].FontSize.Value != 22.0F {
          return false
        }
      using let resetDocument = JsonDocument.Parse("{\"nodeId\":" + nodeId.ToString() + "}")
      session.ResetPayload(resetDocument.RootElement)
      window.UpdateTree()
      guard let restored = window.Tree else { return false }
      return restored.Color == originalColor && restored.FontSize.Value == 14.0F
        && restored.Width.Value == 200.0F
        && restored.Children.Count == 1 && restored.Children[0].Color == originalColor
        && restored.Children[0].FontSize.Value == 14.0F
    } finally {
      session.Dispose()
    }
  }

  func AutomaticAttachOnOpenIsIdempotentAndCloses() bool {
    let previousEnabled = Environment.GetEnvironmentVariable("GOO_DEVTOOLS")
    let previousDirectory = Environment.GetEnvironmentVariable("GOO_DEVTOOLS_DIR")
    let directory = Path.Combine(Path.GetTempPath(), "goo-devtools-auto-" + Guid.NewGuid().ToString("N"))
    let window = Window{ Root: DiagnosticsInteractionCell{}, Width: 200, Height: 100 }
    try {
      Directory.CreateDirectory(directory)
      Environment.SetEnvironmentVariable("GOO_DEVTOOLS", "1")
      Environment.SetEnvironmentVariable("GOO_DEVTOOLS_DIR", directory)
      window.Open()
      guard let automatic = window.DiagnosticsSession else { return false }
      DevTools.Attach(window)
      if window.DiagnosticsSession != automatic { return false }
      window.Close()
      return window.DiagnosticsSession == nil && !automatic.IsAttached
    } finally {
      if window.IsOpen { window.Close() }
      Environment.SetEnvironmentVariable("GOO_DEVTOOLS", previousEnabled)
      Environment.SetEnvironmentVariable("GOO_DEVTOOLS_DIR", previousDirectory)
      if Directory.Exists(directory) { Directory.Delete(directory, true) }
    }
  }
}

internal class DiagnosticsInteractionCell : Cell {
  override func Build() Blob -> Container() {.Width: 200.0,.Height: 100.0,
    Container{
      Key: "target", Width: 100.0, Height: 100.0,
      BackgroundColor: Color.Rgb(51, 102, 204), HitTestSelf: true,
    }
  }
}

internal class DiagnosticsOverrideCell : Cell {
  override func Build() Blob -> Container() {.Width: 200.0,.Height: 100.0,.Color: Color.Rgb(210, 48, 42),.FontSize: 14.0,
    Text{ Content: "inherited" },
  }
}

internal class DiagnosticsSemanticsCell(secret string, controller TextEditorController) : Cell {
  override func Build() Blob -> Container() {.Width: 420,.Height: 260,
    TextEntry{Key: "entry", Width: 180, Height: 32, Value: "agent value"},
    TextEntry{Key: "password", Width: 180, Height: 32, Value: secret, Password: true,
      Accessibility: Accessibility{Value: secret, Name: "Password"}},
    Button() {.Key: "button",.Width: 100,.Height: 32, Text{Content: "Save"}},
    TextEditor(controller) {.Key: "editor",.Width: 300,.Height: 100},
  }
}
