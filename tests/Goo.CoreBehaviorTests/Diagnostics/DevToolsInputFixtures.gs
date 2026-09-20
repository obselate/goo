package Goo

import System
import System.Collections.Generic
import System.Text.Json

internal class DevToolsInputCell : Cell {
  internal var Clicks int32
  internal var Value string = ""
  internal var Show bool = true
  internal var Moves int32
  internal var Cancels int32
  internal var Backspace Action?

  public override func Build() Blob -> Container() {.Width: 320,.Height: 220,
    if Show { Button() {.Key: "action",.Width: 100,.Height: 40,.OnClick: () -> { Clicks++ },
        Text{Content: "Count " + Clicks.ToString()}} } else { Container{Key: "placeholder"} },
    TextEntry{Key: "entry", KeyBindings: []KeyBinding{
      KeyBinding{ Key: Key.Backspace, Repeat: true, Action: () -> { Backspace?.Invoke() } } }, Width: 200, Height: 40, Value: Value, OnChange: (value string) -> { Value = value }},
    Container{Key: "drag", Width: 100, Height: 40,
      OnPointerDown: (event PointerEvent) -> { event.Capture() },
      OnPointerMove: (event PointerEvent) -> { if event.Buttons != PointerButtons.None { Moves++ } },
      OnPointerCancel: (event PointerEvent) -> { Cancels++ }
    }}
}

internal class DevToolsInputFixtures {
  private func send(session DevToolsSession, json string) string {
    using let document = JsonDocument.Parse(json)
    return session.InputPayload(document.RootElement)
  }

  private func find(session DevToolsSession, key string) int64 {
    let snapshot = session.CaptureSnapshot()
    for node in snapshot.Added { if node.Key == key { return node.Id } }
    for node in snapshot.Updated { if node.Key == key { return node.Id } }
    return 0
  }

  private func findTarget(session DevToolsSession, key string) string {
    let snapshot = session.CaptureSnapshot(true)
    for node in snapshot.Added { if node.Key == key { return node.Target } }
    return ""
  }

  func OpaqueTargetsRejectOtherWindowsAndRemounts() bool {
    let firstRoot = DevToolsInputCell{}
    let secondRoot = DevToolsInputCell{}
    let firstWindow = Window{Root: firstRoot, Width: 320, Height: 220}
    let secondWindow = Window{Root: secondRoot, Width: 320, Height: 220}
    firstWindow.Open()
    secondWindow.Open()
    let first = firstWindow.AttachDiagnostics(true)
    let second = secondWindow.AttachDiagnostics(true)
    try {
      firstWindow.UpdateTree()
      secondWindow.UpdateTree()
      let firstTarget = findTarget(first, "action")
      let secondTarget = findTarget(second, "action")
      if firstTarget == "" || secondTarget == "" || firstTarget == secondTarget { return false }
      var wrongWindow = false
      try { send(second, "{\"event\":\"click\",\"target\":\"" + firstTarget + "\"}") }
      catch (_ KeyNotFoundException) { wrongWindow = true }
      if !wrongWindow || secondRoot.Clicks != 0 { return false }
      send(first, "{\"event\":\"click\",\"target\":\"" + firstTarget + "\"}")
      if firstRoot.Clicks != 1 { return false }
      firstRoot.Show = false
      firstRoot.Rebuild()
      var stale = false
      try { send(first, "{\"event\":\"click\",\"target\":\"" + firstTarget + "\"}") }
      catch (_ KeyNotFoundException) { stale = true }
      return stale && firstRoot.Clicks == 1
    } finally {
      first.Dispose()
      second.Dispose()
      firstWindow.Close()
      secondWindow.Close()
    }
  }

  func OptInRoutingSettlementAndStaleTargets() bool {
    let root = DevToolsInputCell{}
    let window = Window{Root: root, Width: 320, Height: 220}
    root.Backspace = () -> { window.PlatformInput.Execute(TextCommand{ Kind: TextCommandKind.DeleteBackward }) }
    window.Open()
    let session = window.AttachDiagnostics()
    try {
      window.UpdateTree()
      var disabled = false
      try { send(session, "{\"event\":\"click\",\"x\":10,\"y\":10}") }
      catch (_ UnauthorizedAccessException) { disabled = true }
      if !disabled || root.Clicks != 0 || session.AllowsInput { return false }
      window.AttachDiagnostics(true)
      let action = find(session, "action")
      let entry = find(session, "entry")
      if action == 0 || entry == 0 { return false }
      send(session, "{\"event\":\"click\",\"nodeId\":" + action.ToString() + "}")
      if root.Clicks != 1 { return false }
      guard let tree = window.Tree else { return false }
      if tree.Children[0].Children[0].Content != "Count 1" { return false }
      send(session, "{\"event\":\"click\",\"nodeId\":" + entry.ToString() + "}")
      send(session, "{\"event\":\"text\",\"text\":\"hello\"}")
      if root.Value != "hello" { return false }
      send(session, "{\"event\":\"key.down\",\"gestureId\":\"key-gesture\",\"key\":\"Backspace\"}")
      send(session, "{\"event\":\"key.up\",\"gestureId\":\"key-gesture\",\"key\":\"Backspace\"}")
      if root.Value != "hell" { return false }
      root.Show = false
      root.Rebuild()
      var stale = false
      try { send(session, "{\"event\":\"click\",\"nodeId\":" + action.ToString() + "}") }
      catch (_ KeyNotFoundException) { stale = true }
      return stale && root.Clicks == 1
    } finally { session.Dispose()
      window.Close() }
  }

  func CaptureCancelAndValidation() bool {
    let root = DevToolsInputCell{}
    let window = Window{Root: root, Width: 320, Height: 220}
    window.Open()
    let session = window.AttachDiagnostics(true)
    try {
      window.UpdateTree()
      let action = find(session, "action")
      let drag = find(session, "drag")
      let gesture = "test-gesture"
      send(session, "{\"event\":\"pointer.down\",\"gestureId\":\"" + gesture
        +"\",\"nodeId\":" + action.ToString() + "}")
      let pressed = session.CaptureSnapshot(true)
      var pressedState = false
      for node in pressed.Added { if node.Id == action { pressedState = node.Pressed } }
      if !pressedState { return false }
      send(session, "{\"event\":\"pointer.cancel\",\"gestureId\":\"" + gesture + "\"}")
      let cancelled = session.CaptureSnapshot(true)
      for node in cancelled.Added { if node.Id == action && node.Pressed { return false } }
      let dragGesture = "drag-gesture"
      send(session, "{\"event\":\"pointer.down\",\"gestureId\":\"" + dragGesture
        +"\",\"nodeId\":" + drag.ToString() + "}")
      var rejectedOwner = false
      try { send(session, "{\"event\":\"pointer.move\",\"gestureId\":\"other\",\"x\":300,\"y\":200}") }
      catch (error DiagnosticGestureException) { rejectedOwner = error.Code == "gesture-owned" }
      if !rejectedOwner || root.Moves != 0 { return false }
      send(session, "{\"event\":\"pointer.move\",\"gestureId\":\"" + dragGesture
        +"\",\"x\":300,\"y\":200}")
      if root.Moves != 1 { return false }
      send(session, "{\"event\":\"pointer.cancel\",\"gestureId\":\"" + dragGesture + "\"}")
      if root.Cancels != 1 || root.Clicks != 0 { return false }
      var rejected int32
      for json in []string {"{\"event\":\"click\",\"x\":1}", "{\"event\":\"key.down\",\"key\":\"999\"}",
        "{\"event\":\"wheel\",\"x\":1,\"y\":1,\"deltaY\":1e100}",
        "{\"event\":\"text\",\"text\":\"ignored\",\"target\":\"foreign\"}"} {
          try { send(session, json) } catch (_ ArgumentException) { rejected++ }
        }
      return rejected == 4
    } finally { session.Dispose()
      window.Close() }
  }

  func QueuedTimeoutCannotExecuteLater() bool {
    let cancelled = DiagnosticPipeCompletion()
    cancelled.CancelQueued()
    let rejected = !cancelled.Begin()
    cancelled.Release()
    cancelled.Release()
    let started = DiagnosticPipeCompletion()
    let accepted = started.Begin()
    started.CancelQueued()
    started.Done.Set()
    let retained = started.Done.Wait(0)
    started.Release()
    started.Release()
    return rejected && accepted && retained
  }
}
