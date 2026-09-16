package Goo

import System
import System.Collections.Generic
import System.Globalization
import System.IO
import System.IO.Pipes
import System.Text
import System.Text.Json
import System.Threading

internal class DiagnosticPipeCompletion {
  internal let Done ManualResetEventSlim
  internal var Result string
  internal var Error string?
  internal var ErrorCode string = "command"
  private var state int32
  private var references int32 = 2

  internal init() {
    Done = ManualResetEventSlim(false)
    Result = "{}"
    Error = nil
  }

  internal func Begin() bool -> Interlocked.CompareExchange(&state, 1, 0) == 0
  internal func CancelQueued() { Interlocked.CompareExchange(&state, 3, 0) }
  internal func Release() { if Interlocked.Decrement(&references) == 0 { Done.Dispose() } }
}

internal class DiagnosticPipeClient {
  private const InactivityMs int64 = 30000
  internal let Stream NamedPipeServerStream
  internal let Capture DiagnosticCaptureTracker
  internal var Worker Thread?
  private var deadline int64
  private var watchdog Timer?
  private var closed int32

  internal init(stream NamedPipeServerStream) {
    Stream = stream
    Capture = DiagnosticCaptureTracker()
    Worker = nil
    deadline = Environment.TickCount64 + InactivityMs
    watchdog = Timer(_ -> {
      if Environment.TickCount64 >= Volatile.Read(&deadline) {
        try { Stream.Dispose() } catch (_ Exception) { }
      }
    }, nil, 1000, 1000)
  }

  internal func Touch() { Volatile.Write(&deadline, Environment.TickCount64 + InactivityMs) }

  internal func Close() {
    if Interlocked.Exchange(&closed, 1) != 0 { return }
    watchdog?.Dispose()
    watchdog = nil
    Stream.Dispose()
  }
}

internal class DiagnosticPipeHost : IDisposable {
  private const MaxClients int32 = 8
  private let session DevToolsSession
  private let endpoint DiagnosticEndpoint
  private let stopped ManualResetEventSlim
  private let gate object
  private let clients List[DiagnosticPipeClient]
  private var listener NamedPipeServerStream?
  private var worker Thread?
  private var disposed bool
  private var queuedRequests int32

  internal init(owner DevToolsSession, value DiagnosticEndpoint) {
    session = owner
    endpoint = value
    stopped = ManualResetEventSlim(false)
    gate = Object()
    clients = List[DiagnosticPipeClient]()
    listener = nil
    worker = nil
    disposed = false
    try {
      let created = Thread(() -> { run() })
      created.IsBackground = true
      worker = created
      created.Start()
    } catch (_ Exception) {
      worker = nil
    }
  }

  public func Dispose() {
    let pending = List[DiagnosticPipeClient]()
    var acceptor Thread?
    lock gate {
      if disposed { return }
      disposed = true
      acceptor = worker
      listener?.Dispose()
      listener = nil
      pending.AddRange(clients)
    }
    stopped.Set()
    for client in pending { client.Close() }
    var joined = true
    if let thread = acceptor {
      joined = thread.Join(250) && joined
    }
    let deadline = Environment.TickCount64 + 750
    for client in pending {
      if let thread = client.Worker {
        let remaining = deadline - Environment.TickCount64
        joined = remaining > 0 && thread.Join(int32(remaining)) && joined
      }
    }
    if joined { stopped.Dispose() }
  }

  private func run() {
    while !stopped.IsSet {
      var current NamedPipeServerStream?
      try {
        let created = NamedPipeServerStream(endpoint.PipeName, PipeDirection.InOut, MaxClients,
          PipeTransmissionMode.Byte, PipeOptions.Asynchronous)
        current = created
        var listening = false
        lock gate {
          if !disposed {
            listener = created
            listening = true
          }
        }
        if !listening { return }
        created.WaitForConnection()
        lock gate {
          if let attached = listener {
            if Object.ReferenceEquals(created, attached) { listener = nil }
          }
        }
        if !stopped.IsSet {
          let client = DiagnosticPipeClient(created)
          var admitted = false
          lock gate {
            if !disposed && clients.Count < MaxClients {
              clients.Add(client)
              admitted = true
            }
          }
          if admitted {
            try {
              let thread = Thread(() -> { serve(client) })
              thread.IsBackground = true
              lock gate {
                if disposed { throw ObjectDisposedException("DiagnosticPipeHost") }
                thread.Start()
                client.Worker = thread
                current = nil
              }
            } catch (_ Exception) {
              lock gate { clients.Remove(client) }
              client.Close()
            }
          } else {
            client.Close()
          }
        }
      } catch (_ IOException) {
        if !stopped.IsSet { stopped.Wait(100) }
      } catch (_ Exception) {
        if !stopped.IsSet { stopped.Wait(100) }
      } finally {
        lock gate {
          if let created = current {
            if let attached = listener {
              if Object.ReferenceEquals(created, attached) { listener = nil }
            }
          }
        }
        current?.Dispose()
      }
    }
  }

  private func serve(client DiagnosticPipeClient) {
    let server = client.Stream
    let utf8 = UTF8Encoding(false)
    try {
      using let reader = StreamReader(server, utf8, false, 16 * 1024, true)
      using let writer = StreamWriter(server, utf8, 16 * 1024, true)
      writer.AutoFlush = true
      writer.NewLine = "\n"
      client.Touch()
      writer.WriteLine(hello())
      while !stopped.IsSet {
        guard let line = readRequest(reader) else { return }
        client.Touch()
        let result = dispatch(client, line)
        if result != "" {
          client.Touch()
          writer.WriteLine(result)
        }
      }
    } catch (_ InvalidDataException) {
    } catch (_ IOException) {
    } catch (_ ObjectDisposedException) {
    } finally {
      lock gate { clients.Remove(client) }
      client.Close()
    }
  }

  private func readRequest(reader StreamReader) string? {
    let result = StringBuilder()
    while true {
      let next = reader.Read()
      if next < 0 { return if result.Length == 0 { nil } else { result.ToString() } }
      if next == 10 { return result.ToString() }
      if result.Length >= 65536 { throw InvalidDataException("DevTools requests are limited to 65536 characters.") }
      result.Append(char(next))
    }
  }

  private func dispatch(client DiagnosticPipeClient, line string) string {
    try {
      using let document = JsonDocument.Parse(line)
      let root = document.RootElement
      let kind = text(root, "type")
      if kind == "hello" {
        return ""
      }
      if kind != "request" {
        return errorResponse("", "protocol", "Expected a request message.")
      }
      let id = text(root, "id")
      if id == "" {
        return errorResponse("", "protocol", "Request id is required.")
      }
      let commandValue = text(root, "command")
      let command = if commandValue == "" { text(root, "method") } else { commandValue }
      if command == "" {
        return errorResponse(id, "protocol", "Request command is required.")
      }
      let payload = if root.TryGetProperty("payload", out var body) { body } else { root }
      return dispatchOnUi(client, id, command, payload)
    } catch (error JsonException) {
      return errorResponse("", "invalid-json", error.Message)
    } catch (error Exception) {
      return errorResponse("", "protocol", error.Message)
    }
  }

  private func dispatchOnUi(client DiagnosticPipeClient, id string, command string, payload JsonElement) string {
    if Interlocked.Increment(&queuedRequests) > 32 {
      Interlocked.Decrement(&queuedRequests)
      return errorResponse(id, "busy", "The Goo UI request queue is full.")
    }
    let completion = DiagnosticPipeCompletion()
    // Own the JSON beyond a timeout; the request document belongs to dispatch().
    let ownedPayload = payload.Clone()
    try {
      session.Post(() -> {
        try {
          if !completion.Begin() { return }
          try {
            completion.Result = execute(client, command, ownedPayload)
          } catch (error Exception) {
            completion.Error = error.Message
            completion.ErrorCode = if error is UnauthorizedAccessException { "input-disabled" }
            else if error is DiagnosticGestureException { error.Code }
            else if error is DiagnosticInputException { error.Code }
            else if error is KeyNotFoundException { "stale-target" }
            else if error is ObjectDisposedException { "closed" }
            else if error is ArgumentException { "invalid-input" } else { "command" }
          }
          completion.Done.Set()
        } finally {
          Interlocked.Decrement(&queuedRequests)
          completion.Release()
        }
      })
    } catch (error Exception) {
      Interlocked.Decrement(&queuedRequests)
      completion.Release()
      completion.Release()
      return errorResponse(id, "closed", error.Message)
    }
    try {
      let deadline = Environment.TickCount64 + 5000
      while !completion.Done.Wait(50) {
        if stopped.IsSet || Environment.TickCount64 >= deadline {
          completion.CancelQueued()
          return errorResponse(id, if stopped.IsSet { "closed" } else { "timeout" },
            "The request did not complete. Queued work was cancelled; an already running handler may have applied input.")
        }
      }
      if let error = completion.Error { return errorResponse(id, completion.ErrorCode, error) }
      return response(id, completion.Result)
    } finally {
      completion.Release()
    }
  }

  private func execute(client DiagnosticPipeClient, command string, payload JsonElement) string {
    if command == "input" { return session.InputPayload(payload) }
    if command == "snapshot" || command == "tree.snapshot" {
      return snapshotPayload(session.CaptureSnapshot(true))
    }
    if command == "capture" {
      return session.CapturePayload(client.Capture)
    }
    session.RequireNoInputGesture()
    if command == "inspect.enter" || command == "inspect.start" {
      session.EnterInspectMode()
      return statePayload("inspect.enter", session.IsInspecting, session.SelectedNodeId)
    }
    if command == "inspect.exit" || command == "inspect.stop" {
      session.ExitInspectMode()
      return statePayload("inspect.exit", session.IsInspecting, session.SelectedNodeId)
    }
    if command == "inspect.clear" || command == "clear" {
      session.ClearSelection()
      return statePayload("inspect.clear", session.IsInspecting, session.SelectedNodeId)
    }
    if command == "inspect.select" || command == "select" {
      let hasTarget = payload.TryGetProperty("target", out var targetValue)
      let hasNode = payload.TryGetProperty("nodeId", out var nodeIdValue)
      if hasTarget && hasNode { throw ArgumentException("Use target or nodeId, not both.") }
      if hasTarget {
        if targetValue.ValueKind != JsonValueKind.String {
          throw ArgumentException("target must be text.")
        }
        let target = targetValue.GetString() ?? ""
        if target.Length == 0 || target.Length > 128 {
          throw ArgumentException("target must contain 1-128 characters.")
        }
        let selected = session.SelectTarget(target)
        return selectPayload(selected, session.SelectedNodeId)
      }
      if hasNode {
        let selected = session.SelectNode(integer(nodeIdValue, "nodeId"))
        return selectPayload(selected, session.SelectedNodeId)
      }
      let point = if payload.TryGetProperty("point", out var nested) { nested } else { payload }
      let selected = session.SelectAt(number(point, "x"), number(point, "y"))
      return selectPayload(selected, session.SelectedNodeId)
    }
    if command == "override" || command == "property.override" {
      return session.OverridePayload(payload)
    }
    if command == "reset" || command == "property.reset" {
      return session.ResetPayload(payload)
    }
    throw InvalidOperationException("Unsupported Goo DevTools command: " + command)
  }

  private func hello() string {
    let builder = StringBuilder()
    builder.Append("{\"type\":\"hello\",\"protocol\":").Append(quote(endpoint.Protocol)).Append(",\"version\":").Append(endpoint.Version).Append(",\"pid\":").Append(endpoint.ProcessId).Append(",\"windowId\":").Append(quote(endpoint.WindowId)).Append(",\"sessionId\":").Append(quote(endpoint.SessionId)).Append(",\"capabilities\":[\"tree.snapshot\",\"tree.resolved-semantics\",\"target.handles\",\"inspect.enter\",\"inspect.exit\",\"inspect.select\",\"inspect.clear\",\"capture.rgba8\",\"runtime-overrides\"")
    if session.AllowsInput { builder.Append(",\"input\",\"input.gesture-lease\"") }
    builder.Append("]}")
    return builder.ToString()
  }

  private func response(id string, payload string) string -> "{\"type\":\"response\",\"id\":" + quote(id)
  +",\"ok\":true,\"payload\":" + payload + "}"

  private func errorResponse(id string, code string, message string) string -> "{\"type\":\"response\",\"id\":" + quote(id)
  +",\"ok\":false,\"error\":{\"code\":" + quote(code)
  +",\"message\":" + quote(message) + "}}"

  private func statePayload(command string, inspecting bool, selected int64?) string -> "{\"command\":" + quote(command) + ",\"inspecting\":"
  +boolText(inspecting) + ",\"selectedId\":" + optional(selected) + "}"

  private func selectPayload(selected bool, selectedId int64?) string -> "{\"command\":\"inspect.select\",\"selected\":" + boolText(selected)
  +",\"selectedId\":" + optional(selectedId) + "}"

  private func snapshotPayload(value DiagnosticSnapshot) string {
    let builder = StringBuilder()
    builder.Append("{\"command\":\"snapshot\",\"sequence\":").Append(value.Sequence).Append(",\"full\":").Append(boolText(value.IsFull)).Append(",\"hasChanges\":").Append(boolText(value.HasChanges)).Append(",\"windowId\":").Append(quote(value.WindowId)).Append(",\"targetIdentity\":{\"pid\":").Append(endpoint.ProcessId).Append(",\"windowId\":").Append(quote(endpoint.WindowId)).Append(",\"sessionId\":").Append(quote(endpoint.SessionId)).Append("},\"rootId\":").Append(optional(value.RootId)).Append(",\"hoveredId\":").Append(optional(value.HoveredId)).Append(",\"selectedId\":").Append(optional(value.SelectedId)).Append(",\"added\":[")
    appendNodes(builder, value.Added)
    builder.Append("],\"updated\":[")
    appendNodes(builder, value.Updated)
    builder.Append("],\"removed\":[")
    var first = true
    for id in value.Removed {
      if !first { builder.Append(",") }
      first = false
      builder.Append(id)
    }
    builder.Append("]}")
    return builder.ToString()
  }

  private func appendNodes(builder StringBuilder, values System.Collections.Generic.IReadOnlyList[DiagnosticNodeSnapshot]) {
    var first = true
    for value in values {
      if !first { builder.Append(",") }
      first = false
      builder.Append(nodePayload(value))
    }
  }

  private func nodePayload(value DiagnosticNodeSnapshot) string {
    let builder = StringBuilder()
    builder.Append("{\"id\":").Append(value.Id).Append(",\"target\":").Append(quote(value.Target))
      .Append(",\"visible\":").Append(boolText(value.Visible))
      .Append(",\"clipped\":").Append(boolText(value.Clipped))
      .Append(",\"clipApproximate\":").Append(boolText(value.ClipApproximate))
      .Append(",\"actionable\":").Append(boolText(value.Actionable))
      .Append(",\"actionStatus\":").Append(quote(value.ActionStatus))
      .Append(",\"actionPoint\":").Append(optionalPoint(value.ActionPoint))
      .Append(",\"accessibilityId\":").Append(optional(value.AccessibilityId))
      .Append(",\"text\":").Append(quote(value.Text))
      .Append(",\"textLength\":").Append(value.TextLength)
      .Append(",\"textTruncated\":").Append(boolText(value.TextTruncated))
      .Append(",\"selectionStart\":").Append(optional(value.SelectionStart))
      .Append(",\"selectionLength\":").Append(optional(value.SelectionLength))
      .Append(",\"caret\":").Append(optional(value.Caret))
      .Append(",\"parentId\":").Append(optional(value.ParentId)).Append(",\"childIndex\":").Append(value.ChildIndex).Append(",\"childIds\":[")
    var first = true
    for id in value.ChildIds {
      if !first { builder.Append(",") }
      first = false
      builder.Append(id)
    }
    builder.Append("]").Append(",\"kind\":").Append(quote(value.Kind)).Append(",\"key\":").Append(quote(value.Key)).Append(",\"content\":").Append(quote(value.Content)).Append(",\"ownerType\":").Append(quote(value.OwnerType)).Append(",\"bounds\":").Append(rect(value.Bounds)).Append(",\"borderBox\":").Append(rect(value.BorderBox)).Append(",\"paddingBox\":").Append(rect(value.PaddingBox)).Append(",\"contentBox\":").Append(rect(value.ContentBox)).Append(",\"marginBox\":").Append(rect(value.MarginBox)).Append(",\"clipBox\":").Append(rect(value.ClipBox)).Append(",\"scrollOffset\":").Append(point(value.ScrollOffset)).Append(",\"contentSize\":").Append(point(value.ContentSize)).Append(",\"width\":").Append(quote(value.Width)).Append(",\"height\":").Append(quote(value.Height)).Append(",\"minWidth\":").Append(quote(value.MinWidth)).Append(",\"minHeight\":").Append(quote(value.MinHeight)).Append(",\"maxWidth\":").Append(quote(value.MaxWidth)).Append(",\"maxHeight\":").Append(quote(value.MaxHeight)).Append(",\"padding\":").Append(quote(value.Padding)).Append(",\"paddingLeft\":").Append(quote(value.PaddingLeft)).Append(",\"paddingTop\":").Append(quote(value.PaddingTop)).Append(",\"paddingRight\":").Append(quote(value.PaddingRight)).Append(",\"paddingBottom\":").Append(quote(value.PaddingBottom)).Append(",\"margin\":").Append(quote(value.Margin)).Append(",\"marginLeft\":").Append(quote(value.MarginLeft)).Append(",\"marginTop\":").Append(quote(value.MarginTop)).Append(",\"marginRight\":").Append(quote(value.MarginRight)).Append(",\"marginBottom\":").Append(quote(value.MarginBottom)).Append(",\"gap\":").Append(quote(value.Gap)).Append(",\"rowGap\":").Append(quote(value.RowGap)).Append(",\"columnGap\":").Append(quote(value.ColumnGap)).Append(",\"flexBasis\":").Append(quote(value.FlexBasis)).Append(",\"left\":").Append(quote(value.Left)).Append(",\"top\":").Append(quote(value.Top)).Append(",\"right\":").Append(quote(value.Right)).Append(",\"bottom\":").Append(quote(value.Bottom)).Append(",\"flexDirection\":").Append(quote(value.FlexDirection)).Append(",\"flexWrap\":").Append(quote(value.FlexWrap)).Append(",\"justifyContent\":").Append(quote(value.JustifyContent)).Append(",\"alignItems\":").Append(quote(value.AlignItems)).Append(",\"alignSelf\":").Append(quote(value.AlignSelf)).Append(",\"alignContent\":").Append(quote(value.AlignContent)).Append(",\"position\":").Append(quote(value.Position)).Append(",\"display\":").Append(quote(value.Display)).Append(",\"direction\":").Append(quote(value.Direction)).Append(",\"overflowX\":").Append(quote(value.OverflowX)).Append(",\"overflowY\":").Append(quote(value.OverflowY)).Append(",\"flexGrow\":").Append(numberText(value.FlexGrow)).Append(",\"flexShrink\":").Append(numberText(value.FlexShrink)).Append(",\"aspectRatio\":").Append(numberText(value.AspectRatio)).Append(",\"opacity\":").Append(numberText(value.Opacity)).Append(",\"backgroundColor\":").Append(quote(value.BackgroundColor)).Append(",\"borderColor\":").Append(quote(value.BorderColor)).Append(",\"borderWidth\":").Append(quote(value.BorderWidth)).Append(",\"borderRadius\":").Append(quote(value.BorderRadius)).Append(",\"fontFamily\":").Append(quote(value.FontFamily)).Append(",\"fontSize\":").Append(quote(value.FontSize)).Append(",\"fontWeight\":").Append(numberText(value.FontWeight)).Append(",\"fontStyle\":").Append(quote(value.FontStyle)).Append(",\"color\":").Append(quote(value.Color)).Append(",\"textAlign\":").Append(quote(value.TextAlign)).Append(",\"textWrap\":").Append(quote(value.TextWrap)).Append(",\"textTrimming\":").Append(quote(value.TextTrimming)).Append(",\"hovered\":").Append(boolText(value.Hovered)).Append(",\"pressed\":").Append(boolText(value.Pressed)).Append(",\"focused\":").Append(boolText(value.Focused)).Append(",\"disabled\":").Append(boolText(value.Disabled)).Append(",\"focusable\":").Append(boolText(value.Focusable)).Append(",\"hitTestSelf\":").Append(boolText(value.HitTestSelf)).Append(",\"hasClickHandler\":").Append(boolText(value.HasClickHandler)).Append(",\"hasPointerHandlers\":").Append(boolText(value.HasPointerHandlers)).Append(",\"hasKeyboardHandlers\":").Append(boolText(value.HasKeyboardHandlers)).Append(",\"accessibilityRole\":").Append(quote(value.AccessibilityRole)).Append(",\"accessibilityCustomRole\":").Append(quote(value.AccessibilityCustomRole)).Append(",\"accessibilityName\":").Append(quote(value.AccessibilityName)).Append(",\"accessibilityDescription\":").Append(quote(value.AccessibilityDescription)).Append(",\"accessibilityValue\":").Append(quote(value.AccessibilityValue)).Append(",\"accessibilityHidden\":").Append(boolText(value.AccessibilityHidden)).Append(",\"accessibilityChecked\":").Append(quote(value.AccessibilityChecked)).Append(",\"accessibilitySelected\":").Append(optional(value.AccessibilitySelected)).Append(",\"accessibilityExpanded\":").Append(optional(value.AccessibilityExpanded)).Append(",\"accessibilityReadOnly\":").Append(optional(value.AccessibilityReadOnly)).Append(",\"accessibilityRequired\":").Append(optional(value.AccessibilityRequired)).Append(",\"accessibilityInvalid\":").Append(optional(value.AccessibilityInvalid)).Append(",\"accessibilityBusy\":").Append(optional(value.AccessibilityBusy)).Append(",\"accessibilityState\":").Append(quote(value.AccessibilityState)).Append(",\"configuration\":").Append(quote(value.Configuration)).Append(",\"computed\":").Append(quote(value.Computed)).Append(",\"state\":").Append(quote(value.State)).Append(",\"events\":").Append(quote(value.Events)).Append("}")
    return builder.ToString()
  }

  private func rect(value DiagnosticRect) string -> "{\"x\":" + numberText(value.X) + ",\"y\":" + numberText(value.Y)
  +",\"width\":" + numberText(value.Width) + ",\"height\":" + numberText(value.Height) + "}"

  private func point(value DiagnosticPoint) string -> "{\"x\":" + numberText(value.X) + ",\"y\":" + numberText(value.Y) + "}"

  private func optionalPoint(value DiagnosticPoint?) string {
    guard let actual = value else { return "null" }
    return point(actual)
  }

  private func optional(value int32?) string {
    guard let actual = value else { return "null" }
    return actual.ToString(CultureInfo.InvariantCulture)
  }

  private func number(root JsonElement, name string) float64 {
    if !root.TryGetProperty(name, out var value) { return 0.0 }
    try { return value.GetDouble() } catch (_ Exception) { return 0.0 }
  }

  private func integer(root JsonElement, name string) int64 {
    if root.ValueKind == JsonValueKind.Number {
      try { return root.GetInt64() } catch (_ Exception) { return 0 }
    }
    if root.ValueKind == JsonValueKind.String {
      let textValue = root.GetString()
      if let actual = textValue {
        if Int64.TryParse(actual, NumberStyles.Integer, CultureInfo.InvariantCulture,
          out var parsed) {
            return parsed
          }
      }
    }
    if root.TryGetProperty(name, out var value) {
      return integer(value, "")
    }
    return 0
  }

  private func text(root JsonElement, name string) string {
    if !root.TryGetProperty(name, out var value) { return "" }
    if value.ValueKind != JsonValueKind.String { return "" }
    let result = value.GetString()
    return result ?? ""
  }

  private func optional(value int64?) string {
    guard let actual = value else { return "null" }
    return actual.ToString(CultureInfo.InvariantCulture)
  }

  private func optional(value bool?) string {
    guard let actual = value else { return "null" }
    return boolText(actual)
  }

  private func boolText(value bool) string -> value ? "true" : "false"

  private func numberText(value float64) string -> value.ToString("R", CultureInfo.InvariantCulture)

  private func quote(value string) string -> DiagnosticJson.Quote(value)
}
