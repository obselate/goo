package GooDevTools

import System
import System.Collections.Generic
import System.Diagnostics
import System.Globalization
import System.IO
import System.IO.Pipes
import System.Text
import System.Text.Json
import System.Threading

class DiagnosticWire {
  shared {
    func Clock() string -> DateTime.Now.ToString("HH:mm:ss", CultureInfo.InvariantCulture)

    func Escape(value string) string {
      if value == nil { return "" }
      return value.Replace("\\", "\\\\").Replace("\"", "\\\"").Replace("\r", "\\r").Replace("\n", "\\n").Replace("\t", "\\t")
    }

    func Request(command string, payload string) string -> "{\"type\":\"request\",\"id\":\"goo-devtools-"
    +Guid.NewGuid().ToString("N") + "\",\"command\":\""
    +Escape(command) + "\",\"payload\":" + payload + "}"

    func ParseMessage(line string) DiagnosticMessage? {
      if line == nil || line.Trim().Length == 0 { return nil }
      try {
        using let document = JsonDocument.Parse(line)
        let root = document.RootElement
        if root.ValueKind != JsonValueKind.Object { return nil }
        let protocol = ParseProtocol(root)
        let messageType = Text(root, []string{"type", "event", "kind"})
        let command = Text(root, []string{"command", "method"})
        let payload = Raw(root, "payload")
        let payloadRoot = if payload == "" { root } else { ParseElement(payload) }
        let effectiveCommand = if command == "" { Text(payloadRoot, []string{"command", "method"}) } else { command }
        let kind = MessageKind(messageType, effectiveCommand, payloadRoot)
        let revision = Number(root, []string{"sequence", "seq", "revision"})
        let sessionId = Text(root, []string{"sessionId", "session", "connectionId"})
        let windowId = Text(root, []string{"windowId", "window", "targetWindowId"})
        let message = DiagnosticMessage(protocol, kind, revision, sessionId, windowId,
          if payload == "" { line } else { payload })
        message.Raw = line
        message.TypeName = messageType
        message.RequestId = Text(root, []string{"id", "requestId"})
        message.Command = effectiveCommand
        message.CapabilitiesText = CapabilityText(root, payloadRoot)
        message.IsResponse = messageType.Equals("response", StringComparison.OrdinalIgnoreCase)
        message.Succeeded = Bool(root, "ok", true)
        if !message.Succeeded {
          message.ErrorText = Text(root, []string{"error", "message"})
          if message.ErrorText == "" {
            message.ErrorText = Text(payloadRoot, []string{"error", "message"})
          }
        }
        return message
      } catch (_ JsonException) {
        return nil
      } catch (_ Exception) {
        return nil
      }
    }

    func ParseSnapshot(payload string, fallbackWindowId string, fullDefault bool) DiagnosticWireSnapshot? {
      if payload == nil || payload.Trim().Length == 0 { return nil }
      try {
        using let document = JsonDocument.Parse(payload)
        let root = document.RootElement
        if root.ValueKind != JsonValueKind.Object { return nil }
        return Snapshot(root, fallbackWindowId, fullDefault)
      } catch (_ JsonException) {
        return nil
      } catch (_ Exception) {
        return nil
      }
    }

    func ParseSelection(payload string) DiagnosticWireSelection {
      try {
        using let document = JsonDocument.Parse(payload)
        let root = document.RootElement
        return DiagnosticWireSelection{
          SelectedId: Text(root, []string{"selectedId", "selectedNodeId", "nodeId", "id"}),
          HoveredId: Text(root, []string{"hoveredId", "hoveredNodeId", "hoverId"}),
        }
      } catch (_ Exception) {
        return DiagnosticWireSelection{ SelectedId: "", HoveredId: "" }
      }
    }

    func ParseLog(payload string, kind DiagnosticMessageKind) DiagnosticWireLog {
      try {
        using let document = JsonDocument.Parse(payload)
        let root = document.RootElement
        let level = Text(root, []string{"level", "severity"})
        let source = Text(root, []string{"source", "logger", "category"})
        let message = Text(root, []string{"message", "text", "content"})
        return DiagnosticWireLog{
          Timestamp: Text(root, []string{"timestamp", "time", "createdAt"}),
          Level: if level == "" { if kind == DiagnosticMessageKind.InputTrace { "debug" } else { "info" } } else { level },
          Source: if source == "" { if kind == DiagnosticMessageKind.InputTrace { "input" } else { "runtime" } } else { source },
          Message: if message == "" { root.GetRawText() } else { message },
        }
      } catch (_ Exception) {
        return DiagnosticWireLog{ Timestamp: "", Level: "info", Source: "runtime", Message: payload }
      }
    }

    func ParseLogs(payload string, kind DiagnosticMessageKind) List[DiagnosticWireLog] {
      let result = List[DiagnosticWireLog]()
      try {
        using let document = JsonDocument.Parse(payload)
        let root = document.RootElement
        if root.ValueKind == JsonValueKind.Array {
          for value in root.EnumerateArray() {
            result.Add(ParseLog(value.GetRawText(), kind))
          }
          return result
        }
        let values = Element(root, []string{"logs", "events", "items"})
        if let actual = values {
          if actual.ValueKind == JsonValueKind.Array {
            for value in actual.EnumerateArray() {
              result.Add(ParseLog(value.GetRawText(), kind))
            }
            return result
          }
        }
      } catch (_ Exception) {
      }
      result.Add(ParseLog(payload, kind))
      return result
    }

    func ParseCapture(payload string) DiagnosticWireCapture {
      try {
        using let document = JsonDocument.Parse(payload)
        let root = document.RootElement
        let data = Text(root, []string{"contentBase64", "base64", "data", "path"})
        let width = Text(root, []string{"width"})
        let height = Text(root, []string{"height"})
        let dimensions = Text(root, []string{"dimensions", "size"})
        let resolvedDimensions = if dimensions != "" { dimensions } else if width != "" && height != "" {
          width + " × " + height
        } else { "" }
        let bytes = if data == "" { "capture received" } else {
          if Text(root, []string {"path"}) == data{ "file: " + data } else { data.Length.ToString() + " base64 chars" }
        }
        return DiagnosticWireCapture{
          WindowName: Text(root, []string{"windowName", "windowTitle", "window"}),
          CapturedAt: Text(root, []string{"capturedAt", "timestamp", "createdAt"}),
          Dimensions: resolvedDimensions,
          Bytes: bytes,
          Pending: Bool(root, "pending", false),
        }
      } catch (_ Exception) {
        return DiagnosticWireCapture{
          WindowName: "",
          CapturedAt: "",
          Dimensions: "",
          Bytes: "capture received",
          Pending: false,
        }
      }
    }

    func ParseProtocol(root JsonElement) DiagnosticProtocolVersion {
      let value = Element(root, []string{"protocol", "protocolVersion"})
      if let actual = value {
        if actual.ValueKind == JsonValueKind.String {
          return ProtocolString(actual.GetString() ?? "")
        }
        if actual.ValueKind == JsonValueKind.Object {
          return DiagnosticProtocolVersion{
            Major: int32(Number(actual, []string{"major"})),
            Minor: int32(Number(actual, []string{"minor"})),
          }
        }
      }
      return DiagnosticProtocolVersion{ Major: 0, Minor: 0 }
    }

    private func ProtocolString(value string) DiagnosticProtocolVersion {
      if value == nil { return DiagnosticProtocolVersion{} }
      let slash = value.LastIndexOf("/")
      let version = if slash >= 0 { value.Substring(slash + 1) } else { value }
      let dot = version.IndexOf(".")
      let majorText = if dot >= 0 { version.Substring(0, dot) } else { version }
      let minorText = if dot >= 0 { version.Substring(dot + 1) } else { "0" }
      if Int32.TryParse(majorText, NumberStyles.Integer, CultureInfo.InvariantCulture, out var major)
        && Int32.TryParse(minorText, NumberStyles.Integer, CultureInfo.InvariantCulture, out var minor) {
          return DiagnosticProtocolVersion{ Major: major, Minor: minor }
        }
      return DiagnosticProtocolVersion{}
    }

    private func MessageKind(messageType string, command string, payload JsonElement) DiagnosticMessageKind {
      let value = if messageType == "" { command } else { messageType }
      if value.Equals("hello", StringComparison.OrdinalIgnoreCase) { return DiagnosticMessageKind.Hello }
      if value.Equals("snapshot", StringComparison.OrdinalIgnoreCase)
        || value.Equals("tree.snapshot", StringComparison.OrdinalIgnoreCase) { return DiagnosticMessageKind.Snapshot }
      if value.Equals("tree", StringComparison.OrdinalIgnoreCase)
        || value.Equals("delta", StringComparison.OrdinalIgnoreCase)
        || value.Equals("tree.delta", StringComparison.OrdinalIgnoreCase) {
          return if Bool(payload, "full", false) { DiagnosticMessageKind.Snapshot } else { DiagnosticMessageKind.TreeDelta }
        }
      if value.Equals("selection", StringComparison.OrdinalIgnoreCase)
        || value.Equals("select", StringComparison.OrdinalIgnoreCase)
        || value.Equals("inspect.select", StringComparison.OrdinalIgnoreCase) { return DiagnosticMessageKind.Selection }
      if value.Equals("hover", StringComparison.OrdinalIgnoreCase)
        || value.Equals("inspect.hover", StringComparison.OrdinalIgnoreCase) { return DiagnosticMessageKind.Hover }
      if value.Equals("override", StringComparison.OrdinalIgnoreCase)
        || value.Equals("property.override", StringComparison.OrdinalIgnoreCase) { return DiagnosticMessageKind.PropertyOverride }
      if value.Equals("input", StringComparison.OrdinalIgnoreCase)
        || value.Equals("input.trace", StringComparison.OrdinalIgnoreCase) { return DiagnosticMessageKind.InputTrace }
      if value.Equals("log", StringComparison.OrdinalIgnoreCase)
        || value.Equals("logs", StringComparison.OrdinalIgnoreCase) { return DiagnosticMessageKind.Log }
      if value.Equals("capture", StringComparison.OrdinalIgnoreCase)
        || value.Equals("screenshot", StringComparison.OrdinalIgnoreCase) { return DiagnosticMessageKind.Screenshot }
      if value.Equals("window.added", StringComparison.OrdinalIgnoreCase) { return DiagnosticMessageKind.WindowAdded }
      if value.Equals("window.removed", StringComparison.OrdinalIgnoreCase) { return DiagnosticMessageKind.WindowRemoved }
      if value.Equals("hot-reload", StringComparison.OrdinalIgnoreCase)
        || value.Equals("hotReload", StringComparison.OrdinalIgnoreCase) { return DiagnosticMessageKind.HotReload }
      if value.Equals("error", StringComparison.OrdinalIgnoreCase) { return DiagnosticMessageKind.Error }
      return DiagnosticMessageKind.Unknown
    }

    private func Snapshot(root JsonElement, fallbackWindowId string, fullDefault bool) DiagnosticWireSnapshot {
      let result = DiagnosticWireSnapshot(
        Bool(root, "full", fullDefault),
        Text(root, []string{"windowId", "window", "targetWindowId"}),
        Text(root, []string{"rootId", "root"}),
        Text(root, []string{"hoveredId", "hoveredNodeId"}),
        Text(root, []string{"selectedId", "selectedNodeId"}),
        Text(root, []string{"title", "windowTitle"}),
        Text(root, []string{"dimensions", "size"}),
        Text(root, []string{"scale", "displayScale"}))
      if result.WindowId == "" { result.WindowId = fallbackWindowId }
      let windows = Element(root, []string{"windows", "targets"})
      if let values = windows {
        if values.ValueKind == JsonValueKind.Array {
          for value in values.EnumerateArray() {
            let parsed = Window(value)
            if let actual = parsed { result.Windows.Add(actual) }
          }
        }
      }
      AddNodes(root, "nodes", result.Nodes)
      AddNodes(root, "added", result.Added)
      AddNodes(root, "updated", result.Updated)
      let removed = Element(root, []string{"removed", "removedIds"})
      if let values = removed {
        if values.ValueKind == JsonValueKind.Array {
          for value in values.EnumerateArray() {
            let id = Scalar(value)
            if id != "" { result.Removed.Add(id) }
          }
        }
      }
      if result.Nodes.Count == 0 && result.Added.Count == 0 {
        let rootValue = Element(root, []string{"root", "node"})
        if let actual = rootValue {
          let node = Node(actual, "")
          if let actualNode = node { result.Nodes.Add(actualNode) }
        } else {
          let node = Node(root, "")
          if let actualNode = node {
            if actualNode.Id != "" { result.Nodes.Add(actualNode) }
          }
        }
      }
      if result.RootId == "" && result.Nodes.Count != 0 {
        for node in result.Nodes {
          if node.ParentId == "" {
            result.RootId = node.Id
            break
          }
        }
      }
      if result.Full && result.Nodes.Count == 0 && result.Added.Count != 0 {
        result.Nodes.AddRange(result.Added)
      }
      return result
    }

    private func Window(value JsonElement) DiagnosticWireWindow? {
      if value.ValueKind != JsonValueKind.Object { return nil }
      let result = DiagnosticWireWindow(
        Text(value, []string{"id", "windowId"}),
        Text(value, []string{"title", "windowTitle", "name"}),
        Text(value, []string{"dimensions", "size"}),
        Text(value, []string{"scale", "displayScale"}))
      let root = Element(value, []string{"root", "node"})
      if let actual = root {
        result.Root = Node(actual, "")
      }
      let nodes = Element(value, []string{"nodes", "added"})
      if let values = nodes {
        if values.ValueKind == JsonValueKind.Array {
          for nodeValue in values.EnumerateArray() {
            let node = Node(nodeValue, "")
            if let actual = node { result.Nodes.Add(actual) }
          }
        }
      }
      if result.Id == "" { result.Id = "remote-window" }
      return result
    }

    private func AddNodes(root JsonElement, name string, destination List[DiagnosticWireNode]) {
      let values = Element(root, []string{name})
      if let actual = values {
        if actual.ValueKind == JsonValueKind.Array {
          for value in actual.EnumerateArray() {
            let node = Node(value, "")
            if let actual = node { destination.Add(actual) }
          }
        }
      }
    }

    private func Node(value JsonElement, parentId string) DiagnosticWireNode? {
      if value.ValueKind != JsonValueKind.Object { return nil }
      let id = ScalarField(value, []string{"id", "nodeId", "uid"})
      if id == "" { return nil }
      let result = DiagnosticWireNode(
        id,
        ScalarField(value, []string{"parentId", "parent"}),
        int32(Number(value, []string{"childIndex", "index"})),
        ScalarField(value, []string{"kind", "type", "typeName", "class"}),
        ScalarField(value, []string{"content", "displayName", "name", "text", "label"}),
        ScalarField(value, []string{"ownerType", "cellName", "owner"}),
        ScalarField(value, []string{"key", "idKey"}),
        FormatBounds(value),
        PreferText(ConfigurationText(value), ObjectText(value, []string{"properties", "configuration"})),
        PreferText(ComputedText(value), ObjectText(value, []string{"computed"})),
        PreferText(LayoutText(value), ObjectText(value, []string{"layout"})),
        PreferText(StateText(value), ObjectText(value, []string{"state"})),
        PreferText(EventsText(value), ObjectText(value, []string{"events"})),
        PreferText(AccessibilityText(value), ObjectText(value, []string{"accessibility", "accessibilityState"})),
        ObjectText(value, []string{"changes", "change"}))
      if result.ParentId == "" { result.ParentId = parentId }
      if result.TypeName == "" { result.TypeName = "Node" }
      if result.DisplayName == "" { result.DisplayName = result.TypeName }
      let childValues = Element(value, []string{"children"})
      if let children = childValues {
        if children.ValueKind == JsonValueKind.Array {
          for childValue in children.EnumerateArray() {
            if childValue.ValueKind == JsonValueKind.Object {
              let child = Node(childValue, result.Id)
              if let actual = child { result.Children.Add(actual) }
            } else {
              let childId = Scalar(childValue)
              if childId != "" { result.ChildIds.Add(childId) }
            }
          }
        }
      }
      let childIds = Element(value, []string{"childIds", "childrenIds"})
      if let ids = childIds {
        if ids.ValueKind == JsonValueKind.Array {
          for childValue in ids.EnumerateArray() {
            let childId = Scalar(childValue)
            if childId != "" && !result.ChildIds.Contains(childId) { result.ChildIds.Add(childId) }
          }
        }
      }
      return result
    }

    private func PreferText(synthesized string, provided string) string -> if synthesized == "" { provided } else { synthesized }

    private func ConfigurationText(root JsonElement) string {
      let builder = StringBuilder()
      AppendField(builder, "width", ScalarField(root, []string{"width"}))
      AppendField(builder, "height", ScalarField(root, []string{"height"}))
      AppendField(builder, "minWidth", ScalarField(root, []string{"minWidth"}))
      AppendField(builder, "minHeight", ScalarField(root, []string{"minHeight"}))
      AppendField(builder, "maxWidth", ScalarField(root, []string{"maxWidth"}))
      AppendField(builder, "maxHeight", ScalarField(root, []string{"maxHeight"}))
      AppendField(builder, "padding", ScalarField(root, []string{"padding"}))
      AppendField(builder, "paddingLeft", ScalarField(root, []string{"paddingLeft"}))
      AppendField(builder, "paddingTop", ScalarField(root, []string{"paddingTop"}))
      AppendField(builder, "paddingRight", ScalarField(root, []string{"paddingRight"}))
      AppendField(builder, "paddingBottom", ScalarField(root, []string{"paddingBottom"}))
      AppendField(builder, "margin", ScalarField(root, []string{"margin"}))
      AppendField(builder, "marginLeft", ScalarField(root, []string{"marginLeft"}))
      AppendField(builder, "marginTop", ScalarField(root, []string{"marginTop"}))
      AppendField(builder, "marginRight", ScalarField(root, []string{"marginRight"}))
      AppendField(builder, "marginBottom", ScalarField(root, []string{"marginBottom"}))
      AppendField(builder, "gap", ScalarField(root, []string{"gap"}))
      AppendField(builder, "rowGap", ScalarField(root, []string{"rowGap"}))
      AppendField(builder, "columnGap", ScalarField(root, []string{"columnGap"}))
      AppendField(builder, "flexBasis", ScalarField(root, []string{"flexBasis"}))
      AppendField(builder, "left", ScalarField(root, []string{"left"}))
      AppendField(builder, "top", ScalarField(root, []string{"top"}))
      AppendField(builder, "right", ScalarField(root, []string{"right"}))
      AppendField(builder, "bottom", ScalarField(root, []string{"bottom"}))
      AppendField(builder, "flexDirection", ScalarField(root, []string{"flexDirection"}))
      AppendField(builder, "flexWrap", ScalarField(root, []string{"flexWrap"}))
      AppendField(builder, "justifyContent", ScalarField(root, []string{"justifyContent"}))
      AppendField(builder, "alignItems", ScalarField(root, []string{"alignItems"}))
      AppendField(builder, "alignSelf", ScalarField(root, []string{"alignSelf"}))
      AppendField(builder, "alignContent", ScalarField(root, []string{"alignContent"}))
      AppendField(builder, "position", ScalarField(root, []string{"position"}))
      AppendField(builder, "flexGrow", ScalarField(root, []string{"flexGrow"}))
      AppendField(builder, "flexShrink", ScalarField(root, []string{"flexShrink"}))
      AppendField(builder, "aspectRatio", ScalarField(root, []string{"aspectRatio"}))
      return builder.ToString()
    }

    private func ComputedText(root JsonElement) string {
      let builder = StringBuilder()
      AppendField(builder, "display", ScalarField(root, []string{"display"}))
      AppendField(builder, "direction", ScalarField(root, []string{"direction"}))
      AppendField(builder, "overflowX", ScalarField(root, []string{"overflowX"}))
      AppendField(builder, "overflowY", ScalarField(root, []string{"overflowY"}))
      AppendField(builder, "opacity", ScalarField(root, []string{"opacity"}))
      AppendField(builder, "backgroundColor", ScalarField(root, []string{"backgroundColor"}))
      AppendField(builder, "borderColor", ScalarField(root, []string{"borderColor"}))
      AppendField(builder, "borderWidth", ScalarField(root, []string{"borderWidth"}))
      AppendField(builder, "borderRadius", ScalarField(root, []string{"borderRadius"}))
      AppendField(builder, "fontFamily", ScalarField(root, []string{"fontFamily"}))
      AppendField(builder, "fontSize", ScalarField(root, []string{"fontSize"}))
      AppendField(builder, "fontWeight", ScalarField(root, []string{"fontWeight"}))
      AppendField(builder, "fontStyle", ScalarField(root, []string{"fontStyle"}))
      AppendField(builder, "color", ScalarField(root, []string{"color"}))
      AppendField(builder, "textAlign", ScalarField(root, []string{"textAlign"}))
      AppendField(builder, "textWrap", ScalarField(root, []string{"textWrap"}))
      AppendField(builder, "textTrimming", ScalarField(root, []string{"textTrimming"}))
      return builder.ToString()
    }

    private func LayoutText(root JsonElement) string {
      let builder = StringBuilder()
      AppendBox(builder, "borderBox", root, []string{"borderBox", "bounds", "rect"})
      AppendBox(builder, "paddingBox", root, []string{"paddingBox"})
      AppendBox(builder, "contentBox", root, []string{"contentBox"})
      AppendBox(builder, "marginBox", root, []string{"marginBox"})
      AppendBox(builder, "clipBox", root, []string{"clipBox"})
      AppendField(builder, "width", ScalarField(root, []string{"width"}))
      AppendField(builder, "height", ScalarField(root, []string{"height"}))
      AppendField(builder, "padding", ScalarField(root, []string{"padding"}))
      AppendField(builder, "paddingLeft", ScalarField(root, []string{"paddingLeft"}))
      AppendField(builder, "paddingTop", ScalarField(root, []string{"paddingTop"}))
      AppendField(builder, "paddingRight", ScalarField(root, []string{"paddingRight"}))
      AppendField(builder, "paddingBottom", ScalarField(root, []string{"paddingBottom"}))
      AppendField(builder, "margin", ScalarField(root, []string{"margin"}))
      AppendField(builder, "marginLeft", ScalarField(root, []string{"marginLeft"}))
      AppendField(builder, "marginTop", ScalarField(root, []string{"marginTop"}))
      AppendField(builder, "marginRight", ScalarField(root, []string{"marginRight"}))
      AppendField(builder, "marginBottom", ScalarField(root, []string{"marginBottom"}))
      AppendField(builder, "gap", ScalarField(root, []string{"gap"}))
      AppendField(builder, "rowGap", ScalarField(root, []string{"rowGap"}))
      AppendField(builder, "columnGap", ScalarField(root, []string{"columnGap"}))
      AppendField(builder, "scrollOffset", ObjectText(root, []string{"scrollOffset"}))
      AppendField(builder, "contentSize", ObjectText(root, []string{"contentSize"}))
      return builder.ToString()
    }

    private func StateText(root JsonElement) string {
      let builder = StringBuilder()
      AppendField(builder, "hovered", ScalarField(root, []string{"hovered"}))
      AppendField(builder, "pressed", ScalarField(root, []string{"pressed"}))
      AppendField(builder, "focused", ScalarField(root, []string{"focused"}))
      AppendField(builder, "disabled", ScalarField(root, []string{"disabled"}))
      AppendField(builder, "focusable", ScalarField(root, []string{"focusable"}))
      AppendField(builder, "hitTestSelf", ScalarField(root, []string{"hitTestSelf"}))
      return builder.ToString()
    }

    private func EventsText(root JsonElement) string {
      let builder = StringBuilder()
      AppendField(builder, "hasClickHandler", ScalarField(root, []string{"hasClickHandler"}))
      AppendField(builder, "hasPointerHandlers", ScalarField(root, []string{"hasPointerHandlers"}))
      AppendField(builder, "hasKeyboardHandlers", ScalarField(root, []string{"hasKeyboardHandlers"}))
      return builder.ToString()
    }

    private func AccessibilityText(root JsonElement) string {
      let builder = StringBuilder()
      AppendField(builder, "role", ScalarField(root, []string{"accessibilityRole"}))
      AppendField(builder, "customRole", ScalarField(root, []string{"accessibilityCustomRole"}))
      AppendField(builder, "name", ScalarField(root, []string{"accessibilityName"}))
      AppendField(builder, "description", ScalarField(root, []string{"accessibilityDescription"}))
      AppendField(builder, "value", ScalarField(root, []string{"accessibilityValue"}))
      AppendField(builder, "hidden", ScalarField(root, []string{"accessibilityHidden"}))
      AppendField(builder, "checked", ScalarField(root, []string{"accessibilityChecked"}))
      AppendField(builder, "selected", ScalarField(root, []string{"accessibilitySelected"}))
      AppendField(builder, "expanded", ScalarField(root, []string{"accessibilityExpanded"}))
      AppendField(builder, "readOnly", ScalarField(root, []string{"accessibilityReadOnly"}))
      AppendField(builder, "required", ScalarField(root, []string{"accessibilityRequired"}))
      AppendField(builder, "invalid", ScalarField(root, []string{"accessibilityInvalid"}))
      AppendField(builder, "busy", ScalarField(root, []string{"accessibilityBusy"}))
      AppendField(builder, "state", ScalarField(root, []string{"accessibilityState"}))
      return builder.ToString()
    }

    private func AppendBox(builder StringBuilder, label string, root JsonElement, names []string) {
      let box = BoxText(root, names)
      AppendField(builder, label, box)
    }

    private func BoxText(root JsonElement, names []string) string {
      let value = Element(root, names)
      if let actual = value {
        if actual.ValueKind == JsonValueKind.String { return actual.GetString() ?? "" }
        if actual.ValueKind == JsonValueKind.Object { return FormatBounds(actual) }
      }
      return ""
    }

    private func AppendField(builder StringBuilder, label string, value string) {
      if value == "" { return }
      if builder.Length != 0 { builder.Append("; ") }
      builder.Append(label).Append(" = ").Append(value)
    }

    private func FormatBounds(root JsonElement) string {
      let value = Element(root, []string{"bounds", "borderBox", "rect"})
      if let actual = value {
        if actual.ValueKind == JsonValueKind.String { return actual.GetString() ?? "" }
        if actual.ValueKind == JsonValueKind.Object {
          let x = MetricField(actual, []string{"x", "left"})
          let y = MetricField(actual, []string{"y", "top"})
          let width = MetricField(actual, []string{"width", "w"})
          let height = MetricField(actual, []string{"height", "h"})
          return x + ", " + y + " · " + width + " × " + height
        }
      }
      let x = MetricField(root, []string{"x", "left"})
      let y = MetricField(root, []string{"y", "top"})
      let width = MetricField(root, []string{"width", "w"})
      let height = MetricField(root, []string{"height", "h"})
      if x != "" || y != "" || width != "" || height != "" {
        return x + ", " + y + " · " + width + " × " + height
      }
      return ""
    }

    private func ObjectText(root JsonElement, names []string) string {
      let value = Element(root, names)
      if let actual = value {
        if actual.ValueKind == JsonValueKind.String { return actual.GetString() ?? "" }
        if actual.ValueKind != JsonValueKind.Null && actual.ValueKind != JsonValueKind.Undefined {
          return actual.GetRawText()
        }
      }
      return ""
    }

    private func CapabilityText(root JsonElement, payload JsonElement) string {
      var values = Element(root, []string{"capabilities", "features"})
      if values == nil { values = Element(payload, []string{"capabilities", "features"}) }
      if let actual = values {
        if actual.ValueKind == JsonValueKind.Array {
          var result = ""
          for value in actual.EnumerateArray() {
            let item = Scalar(value)
            if item == "" { continue }
            if result != "" { result = result + "," }
            result = result + item
          }
          return result
        }
        return Scalar(actual)
      }
      return ""
    }

    private func ParseElement(value string) JsonElement {
      try {
        using let document = JsonDocument.Parse(value)
        return document.RootElement.Clone()
      } catch (_ Exception) {
        return JsonDocument.Parse("{}").RootElement.Clone()
      }
    }

    private func Element(root JsonElement, names []string) JsonElement? {
      if root.ValueKind != JsonValueKind.Object { return nil }
      for name in names {
        if root.TryGetProperty(name, out var value) { return value }
      }
      return nil
    }

    private func Raw(root JsonElement, name string) string {
      let value = Element(root, []string{name})
      if let actual = value { return actual.GetRawText() }
      return ""
    }

    private func Text(root JsonElement, names []string) string {
      let value = Element(root, names)
      if let actual = value {
        if actual.ValueKind == JsonValueKind.String { return actual.GetString() ?? "" }
        if actual.ValueKind == JsonValueKind.Number || actual.ValueKind == JsonValueKind.True
          || actual.ValueKind == JsonValueKind.False{ return actual.ToString() }
        if actual.ValueKind == JsonValueKind.Object && names.Contains("error") {
          return Text(actual, []string{"message", "detail"})
        }
      }
      return ""
    }

    private func ScalarField(root JsonElement, names []string) string -> Text(root, names)

    private func MetricField(root JsonElement, names []string) string {
      let value = Element(root, names)
      if let actual = value {
        if actual.ValueKind == JsonValueKind.Number && actual.TryGetDouble(out var number) {
          return number.ToString("0.#", CultureInfo.InvariantCulture)
        }
      }
      return ScalarField(root, names)
    }

    private func Scalar(value JsonElement) string {
      if value.ValueKind == JsonValueKind.String { return value.GetString() ?? "" }
      if value.ValueKind == JsonValueKind.Number || value.ValueKind == JsonValueKind.True
        || value.ValueKind == JsonValueKind.False{ return value.ToString() }
      return ""
    }

    private func Number(root JsonElement, names []string) int64 {
      let value = Element(root, names)
      if let actual = value {
        if actual.ValueKind == JsonValueKind.Number {
          if actual.TryGetInt64(out var number) { return number }
        }
        if actual.ValueKind == JsonValueKind.String {
          if Int64.TryParse(actual.GetString(), NumberStyles.Integer, CultureInfo.InvariantCulture, out var parsed) {
            return parsed
          }
        }
      }
      return 0
    }

    private func Bool(root JsonElement, name string, fallback bool) bool {
      let value = Element(root, []string{name})
      if let actual = value {
        if actual.ValueKind == JsonValueKind.True || actual.ValueKind == JsonValueKind.False {
          return actual.GetBoolean()
        }
        if actual.ValueKind == JsonValueKind.String {
          if Boolean.TryParse(actual.GetString(), out var parsed) { return parsed }
        }
      }
      return fallback
    }
  }
}

class DiagnosticWireNode {
  var Id string
  var ParentId string
  var ChildIndex int32
  var TypeName string
  var DisplayName string
  var CellName string
  var Key string
  var Bounds string
  var Properties string
  var Computed string
  var Layout string
  var State string
  var Events string
  var Accessibility string
  var Changes string
  let ChildIds List[string]
  let Children List[DiagnosticWireNode]

  init(id string, parentId string, childIndex int32, typeName string, displayName string, cellName string,
    key string, bounds string, properties string, computed string, layout string,
    state string, events string, accessibility string, changes string) {
      Id = id
      ParentId = parentId
      ChildIndex = childIndex
      TypeName = typeName
      DisplayName = displayName
      CellName = cellName
      Key = key
      Bounds = bounds
      Properties = properties
      Computed = computed
      Layout = layout
      State = state
      Events = events
      Accessibility = accessibility
      Changes = changes
      ChildIds = List[string]()
      Children = List[DiagnosticWireNode]()
    }
}

class DiagnosticWireWindow {
  var Id string
  var Title string
  var Dimensions string
  var Scale string
  var Root DiagnosticWireNode?
  let Nodes List[DiagnosticWireNode]

  init(id string, title string, dimensions string, scale string) {
    Id = id
    Title = title
    Dimensions = dimensions
    Scale = scale
    Root = nil
    Nodes = List[DiagnosticWireNode]()
  }
}

class DiagnosticWireSnapshot {
  var Full bool
  var WindowId string
  var RootId string
  var HoveredId string
  var SelectedId string
  var Title string
  var Dimensions string
  var Scale string
  let Windows List[DiagnosticWireWindow]
  let Nodes List[DiagnosticWireNode]
  let Added List[DiagnosticWireNode]
  let Updated List[DiagnosticWireNode]
  let Removed List[string]

  init(full bool, windowId string, rootId string, hoveredId string, selectedId string,
    title string, dimensions string, scale string) {
      Full = full
      WindowId = windowId
      RootId = rootId
      HoveredId = hoveredId
      SelectedId = selectedId
      Title = title
      Dimensions = dimensions
      Scale = scale
      Windows = List[DiagnosticWireWindow]()
      Nodes = List[DiagnosticWireNode]()
      Added = List[DiagnosticWireNode]()
      Updated = List[DiagnosticWireNode]()
      Removed = List[string]()
    }
}

data struct DiagnosticWireSelection {
  var SelectedId string
  var HoveredId string
}

data struct DiagnosticWireLog {
  var Timestamp string
  var Level string
  var Source string
  var Message string
}

data struct DiagnosticWireCapture {
  var WindowName string
  var CapturedAt string
  var Dimensions string
  var Bytes string
  var Pending bool
}

class DiagnosticPipeTransport : DiagnosticTransport {
  private let endpoint DiagnosticEndpoint
  private let gate object
  private let pending Queue[DiagnosticMessage]
  private var state DiagnosticConnectionState
  private var capabilities DiagnosticCapabilities
  private var wake Action?
  private var worker Thread?
  private var stream NamedPipeClientStream?
  private var reader StreamReader?
  private var writer StreamWriter?
  private var stopRequested bool
  private var requestSequence int64

  init(value DiagnosticEndpoint) {
    endpoint = value
    gate = Object()
    pending = Queue[DiagnosticMessage]()
    state = DiagnosticConnectionState.Disconnected
    capabilities = DiagnosticCapabilities{}
    wake = nil
    worker = nil
    stream = nil
    reader = nil
    writer = nil
    stopRequested = false
    requestSequence = 0
  }

  prop State DiagnosticConnectionState {
    get { lock gate { return state } }
  }

  prop Endpoint DiagnosticEndpoint { get -> endpoint }

  prop Capabilities DiagnosticCapabilities {
    get { lock gate { return capabilities } }
  }

  prop IsSample bool { get -> false }

  func Connect() bool {
    lock gate {
      if state == DiagnosticConnectionState.Connected || state == DiagnosticConnectionState.Connecting {
        return true
      }
      stopRequested = false
      state = DiagnosticConnectionState.Connecting
    }
    try {
      let created = Thread(func() { Run() })
      created.IsBackground = true
      lock gate { worker = created }
      created.Start()
      Signal()
      return true
    } catch (error Exception) {
      lock gate { state = DiagnosticConnectionState.Faulted }
      Enqueue(DiagnosticMessage(endpoint.Protocol, DiagnosticMessageKind.Error, 0, "", "", error.Message))
      return false
    }
  }

  func Disconnect() {
    var current NamedPipeClientStream?
    lock gate {
      stopRequested = true
      state = DiagnosticConnectionState.Disconnected
      current = stream
      stream = nil
      reader = nil
      writer = nil
    }
    if let pipe = current { pipe.Dispose() }
    Signal()
  }

  func Poll() List[DiagnosticMessage] {
    let result = List[DiagnosticMessage]()
    lock gate {
      while pending.Count != 0 {
        result.Add(pending.Dequeue())
      }
    }
    return result
  }

  func Send(message DiagnosticMessage) bool {
    let line = if message.Raw == "" { DiagnosticWire.Request(message.Command, message.Payload) } else { message.Raw }
    try {
      lock gate {
        if state != DiagnosticConnectionState.Connected || writer == nil { return false }
        if let active = writer { active.WriteLine(line) }
      }
      return true
    } catch (error Exception) {
      lock gate { state = DiagnosticConnectionState.Faulted }
      Enqueue(DiagnosticMessage(endpoint.Protocol, DiagnosticMessageKind.Error, 0, "", "", error.Message))
      return false
    }
  }

  func SetWake(callback Action?) {
    lock gate { wake = callback }
  }

  private func Run() {
    var current NamedPipeClientStream?
    try {
      let pipeName = NormalizePipe(endpoint.PipeName)
      let created = NamedPipeClientStream(".", pipeName, PipeDirection.InOut, PipeOptions.Asynchronous)
      current = created
      lock gate {
        if stopRequested {
          created.Dispose()
          return
        }
        stream = created
      }
      created.Connect(3000)
      using let localReader = StreamReader(created, Encoding.UTF8, false, 16 * 1024, true)
      using let localWriter = StreamWriter(created, Encoding.UTF8, 16 * 1024, true)
      localWriter.AutoFlush = true
      localWriter.NewLine = "\n"
      lock gate {
        if stopRequested { return }
        reader = localReader
        writer = localWriter
        state = DiagnosticConnectionState.Connected
      }
      localWriter.WriteLine(Handshake())
      localWriter.WriteLine(RequestLine("snapshot", "{}"))
      Signal()
      while true {
        lock gate {
          if stopRequested { return }
        }
        let line = localReader.ReadLine()
        if line == nil { return }
        let message = DiagnosticWire.ParseMessage(line)
        var pollSnapshot = false
        if let value = message {
          UpdateCapabilities(value)
          Enqueue(value)
          pollSnapshot = value.IsResponse && value.Succeeded && (value.Command == "snapshot" || value.Command == "tree.snapshot")
        }
        if pollSnapshot {
          Thread.Sleep(100)
          lock gate {
            if stopRequested || state != DiagnosticConnectionState.Connected { return }
            localWriter.WriteLine(RequestLine("snapshot", "{}"))
          }
        }
      }
    } catch (error Exception) {
      lock gate {
        if !stopRequested { state = DiagnosticConnectionState.Faulted }
      }
      if !stopRequested {
        Enqueue(DiagnosticMessage(endpoint.Protocol, DiagnosticMessageKind.Error, 0, "", "", error.Message))
      }
    } finally {
      lock gate {
        if let attached = stream {
          if current == nil || Object.ReferenceEquals(attached, current) { stream = nil }
        }
        reader = nil
        writer = nil
      }
      Signal()
    }
  }

  private func Handshake() string -> "{\"type\":\"hello\",\"protocol\":\"goo.devtools/1\",\"client\":\"goo-devtools\",\"version\":\"0.5.2\",\"capabilities\":[\"tree\",\"properties\",\"layout\",\"events\",\"logs\",\"accessibility\",\"capture\",\"source-navigation\",\"hot-reload\"]}"

  private func RequestLine(command string, payload string) string {
    requestSequence = requestSequence + 1
    return "{\"type\":\"request\",\"id\":\"goo-devtools-"
    +requestSequence.ToString(CultureInfo.InvariantCulture) + "\",\"command\":\""
    +DiagnosticWire.Escape(command) + "\",\"payload\":" + payload + "}"
  }

  private func NormalizePipe(value string) string {
    let prefix = "\\\\.\\pipe\\"
    if value.StartsWith(prefix, StringComparison.OrdinalIgnoreCase) {
      return value.Substring(prefix.Length)
    }
    return value
  }

  private func UpdateCapabilities(message DiagnosticMessage) {
    if message.CapabilitiesText == "" { return }
    let values = message.CapabilitiesText.Split(",", StringSplitOptions.RemoveEmptyEntries)
    lock gate {
      var next = capabilities
      for value in values {
        let item = value.Trim().ToLowerInvariant()
        if item == "tree" || item == "tree.snapshot" {
          next.TreeSnapshots = true
          next.TreeDeltas = true
        }
        if item == "tree.delta" || item == "deltas" { next.TreeDeltas = true }
        if item == "properties" { next.Properties = true }
        if item == "layout" { next.Layout = true }
        if item == "events" { next.Events = true }
        if item == "logs" || item == "log" { next.Logs = true }
        if item == "runtime-overrides" || item == "override" { next.RuntimeOverrides = true }
        if item == "capture" || item == "capture.rgba8" || item == "screenshots" { next.Screenshots = true }
        if item == "input" || item == "input-trace" { next.InputTrace = true }
        if item == "accessibility" { next.Accessibility = true }
        if item == "source-navigation" { next.SourceNavigation = true }
        if item == "hot-reload" { next.HotReload = true }
      }
      capabilities = next
    }
  }

  private func Enqueue(message DiagnosticMessage) {
    lock gate { pending.Enqueue(message) }
    Signal()
  }

  private func Signal() {
    var callback Action?
    lock gate { callback = wake }
    if let action = callback { action() }
  }
}

class DiagnosticDisconnectedTransport : DiagnosticTransport {
  private let endpoint DiagnosticEndpoint
  private var wake Action?

  init() {
    endpoint = DiagnosticEndpoint{
      ProcessId: 0,
      ProcessName: "No live target",
      PipeName: "discovery pending",
      Protocol: DiagnosticProtocolVersion{ Major: 1, Minor: 0 },
      Transport: "disconnected",
      DescriptorPath: "",
      ApplicationName: "",
      WindowTitle: "",
      StartedAt: "",
    }
    wake = nil
  }

  prop State DiagnosticConnectionState { get -> DiagnosticConnectionState.Disconnected }
  prop Endpoint DiagnosticEndpoint { get -> endpoint }
  prop Capabilities DiagnosticCapabilities { get -> DiagnosticCapabilities {} }
  prop IsSample bool { get -> false }
  func Connect() bool -> false
  func Disconnect() { }
  func Poll() List[DiagnosticMessage] -> List[DiagnosticMessage]()
  func Send(message DiagnosticMessage) bool -> false
  func SetWake(callback Action?) { wake = callback }
}

class DiagnosticEndpointDiscovery {
  shared {
    func RuntimeDirectories(projectDirectory string) List[string] {
      let result = List[string]()
      if let configured = Environment.GetEnvironmentVariable("GOO_DEVTOOLS_DIR") {
        Add(result, configured)
      }
      if projectDirectory != "" {
        Add(result, Path.Combine(projectDirectory, ".goo", "devtools"))
      }
      let runtime = Environment.GetEnvironmentVariable("XDG_RUNTIME_DIR")
      if runtime != nil && runtime != "" {
        Add(result, Path.Combine(runtime, "goo"))
        Add(result, Path.Combine(runtime, "goo-devtools"))
      }
      if OperatingSystem.IsWindows() {
        let local = Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData)
        if local != "" {
          Add(result, Path.Combine(local, "Goo"))
          Add(result, Path.Combine(local, "Goo", "DevTools"))
        }
      }
      Add(result, Path.Combine(Path.GetTempPath(), "goo-devtools"))
      Add(result, Path.Combine(Path.GetTempPath(), "goo"))
      return result
    }

    func Scan(projectDirectory string) List[DiagnosticEndpoint] {
      let result = List[DiagnosticEndpoint]()
      let directories = RuntimeDirectories(projectDirectory)
      for directory in directories {
        if !Directory.Exists(directory) { continue }
        try {
          for path in Directory.EnumerateFiles(directory, "*.json", SearchOption.TopDirectoryOnly) {
            let endpoint = Read(path)
            if let actual = endpoint {
              if !Alive(actual.ProcessId) { continue }
              var duplicate = false
              for prior in result {
                if prior.DescriptorPath == actual.DescriptorPath {
                  duplicate = true
                  break
                }
              }
              if !duplicate { result.Add(actual) }
            }
          }
        } catch (_ IOException) {
        } catch (_ UnauthorizedAccessException) {
        }
      }
      return result
    }

    private func Add(result List[string], value string) {
      if value == nil || value == "" { return }
      let full = Path.GetFullPath(value)
      if !result.Contains(full) { result.Add(full) }
    }

    private func Read(path string) DiagnosticEndpoint? {
      try {
        using let document = JsonDocument.Parse(File.ReadAllText(path))
        let root = document.RootElement
        if root.ValueKind != JsonValueKind.Object { return nil }
        let protocol = Text(root, []string{"protocol", "protocolVersion"})
        if !protocol.Equals("goo.devtools/1", StringComparison.OrdinalIgnoreCase)
          && !protocol.Equals("1", StringComparison.OrdinalIgnoreCase) { return nil }
        let pipe = Text(root, []string{"pipe", "pipeName", "endpoint", "socket", "address"})
        if pipe == "" { return nil }
        let pid = Int(root, []string{"pid", "processId"})
        let process = Text(root, []string{"process", "processName", "name"})
        let app = Text(root, []string{"app", "application", "applicationName"})
        var title = Text(root, []string{"window", "windowTitle", "title"})
        if title == "" {
          let windows = Element(root, []string{"windows"})
          if let values = windows {
            if values.ValueKind == JsonValueKind.Array {
              for value in values.EnumerateArray() {
                let candidate = Text(value, []string{"title", "windowTitle", "name"})
                if candidate != "" {
                  title = candidate
                  break
                }
              }
            }
          }
        }
        let started = Text(root, []string{"startedAt", "startTime", "createdUtc"})
        let transport = Text(root, []string{"transport", "pipeTransport"})
        return DiagnosticEndpoint{
          ProcessId: pid,
          ProcessName: process,
          PipeName: pipe,
          Protocol: DiagnosticProtocolVersion{ Major: 1, Minor: 0 },
          Transport: if transport == "" { "named-pipe" } else { transport },
          DescriptorPath: Path.GetFullPath(path),
          ApplicationName: app,
          WindowTitle: title,
          StartedAt: started,
        }
      } catch (_ JsonException) {
        return nil
      } catch (_ IOException) {
        return nil
      } catch (_ UnauthorizedAccessException) {
        return nil
      }
    }

    private func Alive(pid int32) bool {
      if pid <= 0 { return true }
      try {
        using let process = Process.GetProcessById(pid)
        return !process.HasExited
      } catch (_ ArgumentException) {
        return false
      } catch (_ InvalidOperationException) {
        return false
      }
    }

    private func Text(root JsonElement, names []string) string {
      if root.ValueKind != JsonValueKind.Object { return "" }
      for name in names {
        if !root.TryGetProperty(name, out var value) { continue }
        if value.ValueKind == JsonValueKind.String { return value.GetString() ?? "" }
        if value.ValueKind == JsonValueKind.Number { return value.ToString() }
      }
      return ""
    }

    private func Int(root JsonElement, names []string) int32 {
      let value = Text(root, names)
      if Int32.TryParse(value, NumberStyles.Integer, CultureInfo.InvariantCulture, out var result) {
        return result
      }
      return 0
    }

    private func Element(root JsonElement, names []string) JsonElement? {
      if root.ValueKind != JsonValueKind.Object { return nil }
      for name in names {
        if root.TryGetProperty(name, out var value) { return value }
      }
      return nil
    }
  }
}
