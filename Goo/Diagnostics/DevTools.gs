package Goo

import System
import System.Collections.Generic
import System.Globalization
import System.Text.Json

public class DevTools {
  private init() {
  }

  shared {
    private let gate object = Object()
    private let sessions List[DevToolsSession] = List[DevToolsSession]()

    public func Attach(window Window) IDisposable {
      if window == nil { throw ArgumentNullException("window") }
      return window.AttachDiagnostics()
    }

    internal func Register(session DevToolsSession) {
      lock gate {
        if !sessions.Contains(session) { sessions.Add(session) }
      }
    }

    internal func Unregister(session DevToolsSession) {
      lock gate { sessions.Remove(session) }
    }

    internal func MetadataUpdated() {
      let pending = List[DevToolsSession]()
      lock gate { pending.AddRange(sessions) }
      for session in pending { session.MetadataUpdated() }
    }
  }
}

internal enum DiagnosticCapturePhase { Idle; WaitingForFrame; Accepted }

internal class DiagnosticCaptureTracker {
  private var phase DiagnosticCapturePhase

  internal init() {
    phase = DiagnosticCapturePhase.Idle
  }

  internal prop NeedsRequest bool{ get -> phase != DiagnosticCapturePhase.Accepted }

  internal func Observe(status WindowReadbackRequestStatus) {
    if status == WindowReadbackRequestStatus.Accepted {
      phase = DiagnosticCapturePhase.Accepted
    } else if status == WindowReadbackRequestStatus.NotReady
      || status == WindowReadbackRequestStatus.Busy{
        phase = DiagnosticCapturePhase.WaitingForFrame
      }
  }

  internal func Complete() {
    phase = DiagnosticCapturePhase.Idle
  }

  internal func Reset() {
    phase = DiagnosticCapturePhase.Idle
  }
}

internal class DevToolsSession : IDisposable {
  private let owner Window
  private let identity DiagnosticTreeState
  private let endpoint DiagnosticEndpoint
  private let windowId string
  private var snapshot DiagnosticSnapshot?
  private var inspecting bool
  private var clickLocked bool
  private var disposed bool
  private var pending bool
  private var hovered Node?
  private var selected Node?
  private var selectionBeforeInspect Node?
  private var pointerX float32
  private var pointerY float32
  private var pointerValid bool
  private let captureTracker DiagnosticCaptureTracker
  private let overrideStore DiagnosticOverrideStore
  private let debugNodes Dictionary[int64, Node]
  private let snapshotChanged List[Action[DiagnosticSnapshot]]
  private var pipe DiagnosticPipeHost?

  internal prop Endpoint DiagnosticEndpoint{ get -> endpoint }
  internal prop IsInspecting bool{ get -> inspecting }
  internal prop IsAttached bool{ get -> !disposed && owner.DiagnosticsSession == this }
  internal prop CurrentSnapshot DiagnosticSnapshot? {
    get {
      owner.RequireElementHandleThread("DevToolsSession.CurrentSnapshot")
      return captureIfNeeded()
    }
  }
  internal prop Overlay DiagnosticOverlay{
    get {
      owner.RequireElementHandleThread("DevToolsSession.Overlay")
      let current = captureIfNeeded()
      return makeOverlay(current)
    }
  }
  internal prop SelectedNodeId int64? {
    get {
      owner.RequireElementHandleThread("DevToolsSession.SelectedNodeId")
      guard let current = captureIfNeeded() else { return nil }
      return current.SelectedId
    }
  }
  internal prop OverrideStore DiagnosticOverrideStore{ get -> overrideStore }

  internal event SnapshotChanged Action[DiagnosticSnapshot]{
    add{ if !snapshotChanged.Contains(value) { snapshotChanged.Add(value) } }
    remove{ snapshotChanged.Remove(value) }
  }

  internal init(window Window) {
    owner = window
    identity = DiagnosticTreeState()
    endpoint = DiagnosticEndpointDiscovery.Create(window)
    windowId = endpoint.WindowId
    overrideStore = DiagnosticOverrideStore()
    debugNodes = Dictionary[int64, Node]()
    snapshotChanged = List[Action[DiagnosticSnapshot]]()
    pipe = nil
    selectionBeforeInspect = nil
    captureTracker = DiagnosticCaptureTracker()
    pending = true
    pipe = DiagnosticPipeHost(this, endpoint)
  }

  internal func EnterInspectMode() {
    owner.RequireElementHandleThread("DevToolsSession.EnterInspectMode")
    if disposed { throw ObjectDisposedException("DevToolsSession") }
    if inspecting { return }
    selectionBeforeInspect = selected
    owner.ResetInputForDiagnostics()
    inspecting = true
    clickLocked = false
    pending = true
    owner.RequestDiagnosticsFrame()
  }

  internal func ExitInspectMode() {
    owner.RequireElementHandleThread("DevToolsSession.ExitInspectMode")
    if disposed { return }
    if !inspecting && hovered == nil { return }
    inspecting = false
    clickLocked = false
    hovered = nil
    selectionBeforeInspect = nil
    pending = true
    owner.RequestDiagnosticsFrame()
  }

  internal func ClearSelection() {
    owner.RequireElementHandleThread("DevToolsSession.ClearSelection")
    selected = nil
    selectionBeforeInspect = nil
    clickLocked = false
    pending = true
    owner.RequestDiagnosticsFrame()
  }

  internal func SelectAt(x float64, y float64) bool {
    owner.RequireElementHandleThread("DevToolsSession.SelectAt")
    if !finite(x) || !finite(y) { throw ArgumentOutOfRangeException("point") }
    guard let tree = owner.Tree else {
      selected = nil
      pending = true
      return false
    }
    let target = hitTopmost(tree, float32(x), float32(y))
    selected = target
    clickLocked = true
    pending = true
    owner.RequestDiagnosticsFrame()
    return target != nil
  }

  internal func SelectNode(id int64) bool {
    owner.RequireElementHandleThread("DevToolsSession.SelectNode")
    if disposed { throw ObjectDisposedException("DevToolsSession") }
    captureIfNeeded()
    guard let target = identity.FindNode(id) else { return false }
    selected = target
    clickLocked = true
    pending = true
    owner.RequestDiagnosticsFrame()
    return true
  }

  internal func CaptureSnapshot() DiagnosticSnapshot {
    owner.RequireElementHandleThread("DevToolsSession.CaptureSnapshot")
    if disposed { throw ObjectDisposedException("DevToolsSession") }
    guard let current = captureIfNeeded() else {
      throw InvalidOperationException("The diagnostics snapshot is unavailable.")
    }
    return current
  }

  internal func PointerEvent(root Node?, kind PointerEventKind, x float32, y float32,
    button PointerButton) bool{
      if disposed || !inspecting { return false }
      if kind == PointerEventKind.Move {
        pointerX = x
        pointerY = y
        pointerValid = true
        updateHover(root, x, y)
        return false
      }
      if kind == PointerEventKind.Cancel {
        if clickLocked {
          clickLocked = false
          return true
        }
        return false
      }
      if button != PointerButton.Primary {
        return false
      }
      if kind == PointerEventKind.Press {
        pointerX = x
        pointerY = y
        pointerValid = true
        clickLocked = true
        updateHover(root, x, y)
        selected = hovered
        pending = true
        owner.RequestDiagnosticsFrame()
        return true
      }
      if kind == PointerEventKind.Release && clickLocked {
        inspecting = false
        clickLocked = false
        hovered = nil
        selectionBeforeInspect = nil
        pending = true
        owner.RequestDiagnosticsFrame()
        return true
      }
      return false
    }

  internal func KeyEvent(key Key) bool {
    if disposed || !inspecting || key != Key.Escape { return false }
    owner.RequireElementHandleThread("DevToolsSession.EscapeInspectMode")
    inspecting = false
    clickLocked = false
    hovered = nil
    selected = selectionBeforeInspect
    selectionBeforeInspect = nil
    pending = true
    owner.RequestDiagnosticsFrame()
    return true
  }

  internal func OnTreeUpdated(root Node?, effects ReconcileEffects, layoutChanged bool,
    changed bool) {
      if disposed { return }
      if inspecting && pointerValid { updateHover(root, pointerX, pointerY) }
      if !pending && int32(effects) == 0 && !layoutChanged && !changed { return }
      pending = false
      let next = identity.Capture(root, windowId, hovered, selected)
      snapshot = next
      clearRemovedOverrides(next.Removed)
      if next.HasChanges {
        let callbacks = List[Action[DiagnosticSnapshot]](snapshotChanged)
        for callback in callbacks { callback(next) }
      }
    }

  internal func MetadataUpdated() {
    if disposed { return }
    try {
      owner.Post(() -> {
        if disposed { return }
        clearOverrides()
        identity.Invalidate()
        snapshot = nil
        pending = true
        owner.RequestDiagnosticsRebuild()
      })
    } catch (_ Exception) {
    }
  }

  internal func Post(action Action) {
    if disposed { throw ObjectDisposedException("DevToolsSession") }
    owner.Post(action)
  }

  internal func CapturePayload() string {
    owner.RequireElementHandleThread("DevToolsSession.CapturePayload")
    if disposed { throw ObjectDisposedException("DevToolsSession") }
    if captureTracker.NeedsRequest {
      let status = owner.RequestDiagnosticsCapture()
      if status != WindowReadbackRequestStatus.Accepted
        && status != WindowReadbackRequestStatus.NotReady
        && status != WindowReadbackRequestStatus.Busy{
          captureTracker.Reset()
          throw InvalidOperationException("Goo capture request was not accepted: " + status.ToString())
        }
      captureTracker.Observe(status)
      if captureTracker.NeedsRequest {
        owner.RequestDiagnosticsFrame()
        return "{\"command\":\"capture\",\"pending\":true}"
      }
    }
    guard let result = owner.PollDiagnosticsCapture() else {
      owner.RequestDiagnosticsFrame()
      return "{\"command\":\"capture\",\"pending\":true}"
    }
    captureTracker.Complete()
    let pixels = result.Pixels
    return "{\"command\":\"capture\",\"pending\":false,\"format\":\"rgba8-srgb-premultiplied\","
    +"\"origin\":\"top-left\",\"width\":" + result.Width.ToString()
    +",\"height\":" + result.Height.ToString()
    +",\"stride\":" + result.RowBytes.ToString()
    +",\"rgbaBase64\":" + quote(Convert.ToBase64String(pixels)) + "}"
  }

  internal func OverridePayload(payload JsonElement) string {
    owner.RequireElementHandleThread("DevToolsSession.OverridePayload")
    if disposed { throw ObjectDisposedException("DevToolsSession") }
    let request = parseDiagnosticOverride(payload)
    let spec = diagnosticOverrideSpec(request.Property)
    captureIfNeeded()
    guard let target = identity.FindNode(request.NodeId) else {
      throw KeyNotFoundException("Runtime override node was not found: " + request.NodeId.ToString())
    }
    let entries = diagnosticOverrideEntries(spec, request.Value)
    for entry in entries { overrideStore.Set(target, entry) }
    debugNodes[request.NodeId] = target
    owner.InvalidateDiagnosticsOverride(target)
    pending = true
    owner.RequestDiagnosticsRebuild()
    return overrideResponse(request.NodeId, spec.Name, request.Value)
  }

  internal func ResetPayload(payload JsonElement) string {
    owner.RequireElementHandleThread("DevToolsSession.ResetPayload")
    if disposed { throw ObjectDisposedException("DevToolsSession") }
    let nodeId = diagnosticResetNodeId(payload)
    captureIfNeeded()
    guard let target = identity.FindNode(nodeId) else {
      throw KeyNotFoundException("Runtime override node was not found: " + nodeId.ToString())
    }
    let property = diagnosticText(payload, "property").Trim()
    var resetProperty string?
    var restored bool
    if property == "" {
      let fields = overrideFields(target)
      restored = overrideStore.Clear(target)
      resetProperty = nil
      debugNodes.Remove(nodeId)
      if restored { owner.CompleteDiagnosticsOverrideReset(target, fields) }
    } else {
      let spec = diagnosticOverrideSpec(property)
      restored = overrideStore.ClearFields(target, spec.Fields)
      resetProperty = spec.Name
      if let state = overrideStore.State(target) {
        if state.Values.Count == 0 { debugNodes.Remove(nodeId) }
      } else {
        debugNodes.Remove(nodeId)
      }
      if restored { owner.CompleteDiagnosticsOverrideReset(target, spec.Fields) }
    }
    if restored {
      pending = true
      owner.RequestDiagnosticsRebuild()
    }
    return resetResponse(nodeId, resetProperty, restored)
  }

  internal func WindowClosed() {
    if disposed { return }
    clearOverrides()
    owner.ClearDiagnostics(this)
    pipe?.Dispose()
    pipe = nil
    disposed = true
    DevTools.Unregister(this)
    DiagnosticEndpointDiscovery.Release(endpoint)
    snapshotChanged.Clear()
    hovered = nil
    selected = nil
    selectionBeforeInspect = nil
  }

  public func Dispose() {
    if disposed { return }
    owner.RequireElementHandleThread("DevToolsSession.Dispose")
    clearOverrides()
    owner.RequestDiagnosticsRebuild()
    owner.ClearDiagnostics(this)
    pipe?.Dispose()
    pipe = nil
    disposed = true
    DevTools.Unregister(this)
    DiagnosticEndpointDiscovery.Release(endpoint)
    snapshotChanged.Clear()
    hovered = nil
    selected = nil
    selectionBeforeInspect = nil
  }

  private func captureIfNeeded() DiagnosticSnapshot? {
    if disposed { return nil }
    if let current = snapshot {
      if !pending { return current }
    }
    let next = identity.Capture(owner.Tree, windowId, hovered, selected)
    snapshot = next
    pending = false
    return next
  }

  private func makeOverlay(current DiagnosticSnapshot?) DiagnosticOverlay {
    guard let snapshot = current else { return DiagnosticOverlay(0, nil, nil, nil, nil, "") }
    let hoveredBox = if let id = snapshot.HoveredId { identity.Find(id)?.BorderBox } else { nil }
    let selectedBox = if let id = snapshot.SelectedId { identity.Find(id)?.BorderBox } else { nil }
    let details = if let selectedId = snapshot.SelectedId {
      identity.Find(selectedId)
    } else if let hoveredId = snapshot.HoveredId {
      identity.Find(hoveredId)
    } else { nil }
    let tooltip = if let value = details {
      value.Kind + " " + value.Bounds.Width.ToString("0.##", CultureInfo.InvariantCulture)
      +" × " + value.Bounds.Height.ToString("0.##", CultureInfo.InvariantCulture)
    } else { "" }
    return DiagnosticOverlay(snapshot.Sequence, hoveredBox, selectedBox, hovered, selected, tooltip)
  }

  private func updateHover(root Node?, x float32, y float32) {
    guard let tree = root else {
      if hovered != nil {
        hovered = nil
        pending = true
        owner.RequestDiagnosticsFrame()
      }
      return
    }
    let next = hitTopmost(tree, x, y)
    if hovered == next { return }
    hovered = next
    pending = true
    owner.RequestDiagnosticsFrame()
  }

  private func finite(value float64) bool -> !Double.IsNaN(value) && !Double.IsInfinity(value)

  private func clearOverrides() {
    let nodes = List[Node]()
    for pair in debugNodes { nodes.Add(pair.Value) }
    debugNodes.Clear()
    for node in nodes {
      if node.Retired {
        overrideStore.Drop(node)
      } else {
        let fields = overrideFields(node)
        if overrideStore.Clear(node) { owner.CompleteDiagnosticsOverrideReset(node, fields) }
      }
    }
  }

  private func overrideFields(n Node) List[StyleField] {
    let result = List[StyleField]()
    guard let state = overrideStore.State(n) else { return result }
    for pair in state.Values { result.Add(pair.Key) }
    return result
  }

  private func clearRemovedOverrides(ids IReadOnlyList[int64]) {
    for id in ids {
      if debugNodes.TryGetValue(id, out var node) {
        overrideStore.Drop(node)
        debugNodes.Remove(id)
      }
    }
  }

  private func overrideResponse(nodeId int64, property string, value string) string -> "{\"command\":\"override\",\"nodeId\":" + nodeId.ToString()
  +",\"property\":" + quote(property) + ",\"value\":" + quote(value) + "}"

  private func resetResponse(nodeId int64, property string?, restored bool) string -> "{\"command\":\"reset\",\"nodeId\":" + nodeId.ToString()
  +",\"property\":" + optionalText(property) + ",\"restored\":"
  +(restored ? "true" : "false") + "}"

  private func optionalText(value string?) string {
    guard let actual = value else { return "null" }
    return quote(actual)
  }

  private func quote(value string) string -> "\"" + value.Replace("\\", "\\\\").Replace("\"", "\\\"") + "\""
}
