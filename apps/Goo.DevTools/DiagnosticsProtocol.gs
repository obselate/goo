package GooDevTools

import Goo
import System
import System.Collections.Generic

enum DiagnosticConnectionState {
    Disconnected;
    Connecting;
    Connected;
    Reconnecting;
    Faulted
}

enum DiagnosticMessageKind {
    Unknown;
    Hello;
    Snapshot;
    TreeDelta;
    Selection;
    Hover;
    PropertyOverride;
    InputTrace;
    Log;
    Screenshot;
    WindowAdded;
    WindowRemoved;
    HotReload;
    Error;
}

enum DiagnosticDetailsTab {
    Configuration;
    Computed;
    Layout;
    State;
    Events;
    Accessibility;
    Changes;
}

data struct DiagnosticProtocolVersion {
    var Major int32
    var Minor int32
}

data struct DiagnosticCapabilities {
    var TreeSnapshots bool
    var TreeDeltas bool
    var Properties bool
    var Layout bool
    var Events bool
    var Logs bool
    var RuntimeOverrides bool
    var Screenshots bool
    var InputTrace bool
    var Accessibility bool
    var SourceNavigation bool
    var HotReload bool
}

data struct DiagnosticEndpoint {
    var ProcessId int32
    var ProcessName string
    var PipeName string
    var Protocol DiagnosticProtocolVersion
    var Transport string
    var DescriptorPath string
    var ApplicationName string
    var WindowTitle string
    var StartedAt string
}

class DiagnosticMessage {
    var Protocol DiagnosticProtocolVersion
    var Kind DiagnosticMessageKind
    var Sequence int64
    var SessionId string
    var WindowId string
    var Payload string
    var Raw string
    var TypeName string
    var RequestId string
    var Command string
    var CapabilitiesText string
    var IsResponse bool
    var Succeeded bool
    var ErrorText string

    init(
        protocolVersion DiagnosticProtocolVersion,
        kind DiagnosticMessageKind,
        sequenceNumber int64,
        sessionId string,
        windowId string,
        payload string
    ) {
        Protocol = protocolVersion
        Kind = kind
        Sequence = sequenceNumber
        SessionId = sessionId
        WindowId = windowId
        Payload = payload
        Raw = ""
        TypeName = ""
        RequestId = ""
        Command = ""
        CapabilitiesText = ""
        IsResponse = false
        Succeeded = true
        ErrorText = ""
    }
}

interface DiagnosticTransport {
    prop State DiagnosticConnectionState {
        get;
    }
    prop Endpoint DiagnosticEndpoint {
        get;
    }
    prop Capabilities DiagnosticCapabilities {
        get;
    }
    prop IsSample bool {
        get;
    }
    func Connect() bool;

    func Disconnect();

    func Poll() List[DiagnosticMessage];

    func Send(message DiagnosticMessage) bool;

    func SetWake(callback Action?);
}

class SampleDiagnosticTransport : DiagnosticTransport {
    private var state DiagnosticConnectionState
    private let endpoint DiagnosticEndpoint
    private let capabilities DiagnosticCapabilities
    private let pending List[DiagnosticMessage]
    private var sequenceNumber int64
    private var wake Action?

    init() {
        endpoint = DiagnosticEndpoint{
            ProcessId: 42160,
            ProcessName: "Goo.SampleApp",
            PipeName: "goo-diagnostics-42160",
            Protocol: DiagnosticProtocolVersion{Major: 1, Minor: 0},
            Transport: "sample",
            DescriptorPath: "",
            ApplicationName: "Goo Sample App",
            WindowTitle: "Main Window",
            StartedAt: "",
        }
        capabilities = DiagnosticCapabilities{
            TreeSnapshots: true,
            TreeDeltas: true,
            Properties: true,
            Layout: true,
            Events: true,
            Logs: true,
            RuntimeOverrides: true,
            Screenshots: true,
            InputTrace: true,
            Accessibility: true,
            SourceNavigation: true,
            HotReload: true,
        }
        pending = List[DiagnosticMessage]()
        state = DiagnosticConnectionState.Disconnected
        sequenceNumber = 0
        wake = nil
    }

    prop State DiagnosticConnectionState {
        get -> state
    }
    prop Endpoint DiagnosticEndpoint {
        get -> endpoint
    }
    prop Capabilities DiagnosticCapabilities {
        get -> capabilities
    }
    prop IsSample bool {
        get -> true
    }

    func Connect() bool {
        state = DiagnosticConnectionState.Connected
        sequenceNumber = sequenceNumber + 1
        pending.Add(
            DiagnosticMessage(
                endpoint.Protocol,
                DiagnosticMessageKind.Hello,
                sequenceNumber,
                "sample-session",
                "main-window",
                "{\"agent\":\"Goo.SampleApp\",\"mode\":\"sample\"}"
            )
        )
        sequenceNumber = sequenceNumber + 1
        pending.Add(
            DiagnosticMessage(
                endpoint.Protocol,
                DiagnosticMessageKind.Snapshot,
                sequenceNumber,
                "sample-session",
                "main-window",
                "{\"nodes\":12,\"windows\":2}"
            )
        )
        Signal()
        return true
    }

    func Disconnect() {
        state = DiagnosticConnectionState.Disconnected
        pending.Clear()
        Signal()
    }

    func Poll() List[DiagnosticMessage] {
        let result = List[DiagnosticMessage](pending.Count)
        for message in pending {
            result.Add(message)
        }
        pending.Clear()
        return result
    }

    func Send(message DiagnosticMessage) bool {
        if state != DiagnosticConnectionState.Connected {
            return false
        }
        sequenceNumber = sequenceNumber + 1
        pending.Add(
            DiagnosticMessage(
                endpoint.Protocol,
                DiagnosticMessageKind.Selection,
                sequenceNumber,
                message.SessionId,
                message.WindowId,
                message.Payload
            )
        )
        Signal()
        return true
    }

    func SetWake(callback Action?) {
        wake = callback
    }

    private func Signal() {
        if let callback = wake {
            callback()
        }
    }
}

class DiagnosticTreeNode {
    var Id string
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
    let Children List[DiagnosticTreeNode]

    init(
        id string,
        typeName string,
        displayName string,
        cellName string,
        key string,
        bounds string,
        properties string,
        computed string,
        layout string,
        state string,
        events string,
        accessibility string,
        changes string
    ) {
        Id = id
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
        Children = List[DiagnosticTreeNode]()
    }
}

class DiagnosticTreeRow {
    var Node DiagnosticTreeNode
    var Depth int32

    init(node DiagnosticTreeNode, depth int32) {
        Node = node
        Depth = depth
    }
}

class DiagnosticLogEntry {
    var Timestamp string
    var Level string
    var Source string
    var Message string

    init(timestamp string, level string, source string, message string) {
        Timestamp = timestamp
        Level = level
        Source = source
        Message = message
    }
}

class DiagnosticScreenshot {
    var Id string
    var WindowName string
    var CapturedAt string
    var Dimensions string
    var Bytes string

    init(id string, windowName string, capturedAt string, dimensions string, bytes string) {
        Id = id
        WindowName = windowName
        CapturedAt = capturedAt
        Dimensions = dimensions
        Bytes = bytes
    }
}

class DiagnosticWindow {
    var Id string
    var Title string
    var Dimensions string
    var Scale string
    var Root DiagnosticTreeNode

    init(id string, title string, dimensions string, scale string, root DiagnosticTreeNode) {
        Id = id
        Title = title
        Dimensions = dimensions
        Scale = scale
        Root = root
    }
}

class DiagnosticSession {
    private let transport DiagnosticTransport
    private let windows List[DiagnosticWindow]
    private let logs List[DiagnosticLogEntry]
    private let screenshots List[DiagnosticScreenshot]
    private var state DiagnosticConnectionState
    private var selectedWindowId string
    private var selectedNodeId string
    private var query string
    private var inspecting bool
    private var activeTab DiagnosticDetailsTab
    private var screenshotSequence int32
    private var overrideText string
    private var overrideActive bool
    private var pendingOverrideAction string
    private var hoveredNodeId string
    private var captureRequestInFlight bool

    init() {
        transport = SampleDiagnosticTransport{}
        windows = List[DiagnosticWindow]()
        logs = List[DiagnosticLogEntry]()
        screenshots = List[DiagnosticScreenshot]()
        state = DiagnosticConnectionState.Disconnected
        selectedWindowId = "main-window"
        selectedNodeId = "root"
        query = ""
        inspecting = false
        activeTab = DiagnosticDetailsTab.Configuration
        screenshotSequence = 0
        overrideText = "BackgroundColor = #18212A"
        overrideActive = false
        pendingOverrideAction = ""
        hoveredNodeId = ""
        captureRequestInFlight = false
        seedWindows()
        seedLogs()
        seedScreenshots()
    }

    init(selectedTransport DiagnosticTransport, seedSample bool) {
        transport = selectedTransport
        windows = List[DiagnosticWindow]()
        logs = List[DiagnosticLogEntry]()
        screenshots = List[DiagnosticScreenshot]()
        state = DiagnosticConnectionState.Disconnected
        selectedWindowId = ""
        selectedNodeId = ""
        query = ""
        inspecting = false
        activeTab = DiagnosticDetailsTab.Configuration
        screenshotSequence = 0
        overrideText = "BackgroundColor = #18212A"
        overrideActive = false
        pendingOverrideAction = ""
        hoveredNodeId = ""
        captureRequestInFlight = false
        if seedSample {
            seedWindows()
            seedLogs()
            seedScreenshots()
        } else {
            seedDisconnectedWindow()
        }
    }

    prop State DiagnosticConnectionState {
        get -> state
    }
    prop Endpoint DiagnosticEndpoint {
        get -> transport.Endpoint
    }
    prop Capabilities DiagnosticCapabilities {
        get -> transport.Capabilities
    }
    prop Query string {
        get -> query
    }
    prop Inspecting bool {
        get -> inspecting
    }
    prop ActiveTab DiagnosticDetailsTab {
        get -> activeTab
    }
    prop SelectedWindowId string {
        get -> selectedWindowId
    }
    prop SelectedNodeId string {
        get -> selectedNodeId
    }
    prop HoveredNodeId string {
        get -> hoveredNodeId
    }
    prop OverrideText string {
        get -> overrideText
    }
    prop OverrideActive bool {
        get -> overrideActive
    }
    prop Windows IReadOnlyList[DiagnosticWindow] {
        get -> windows
    }
    prop Logs IReadOnlyList[DiagnosticLogEntry] {
        get -> logs
    }
    prop Screenshots IReadOnlyList[DiagnosticScreenshot] {
        get -> screenshots
    }

    internal func Connect() bool {
        state = DiagnosticConnectionState.Connecting
        let started = transport.Connect()
        state = transport.State
        if !started {
            if state == DiagnosticConnectionState.Connecting {
                state = DiagnosticConnectionState.Faulted
            }
            AppendLog(DiagnosticWire.Clock(), "error", "transport", "Could not start the local diagnostics connection")
        } else {
            AppendLog(DiagnosticWire.Clock(), "info", "transport", "Connecting to " + transport.Endpoint.PipeName)
        }
        return started
    }

    func Disconnect() {
        transport.Disconnect()
        state = transport.State
        inspecting = false
        AppendLog(DiagnosticWire.Clock(), "info", "transport", "Detached from target")
    }

    func ToggleConnection() {
        if state == DiagnosticConnectionState.Connected {
            Disconnect()
        } else {
            Connect()
        }
    }

    func ToggleInspect() {
        inspecting = !inspecting
        let command = if inspecting {
            "inspect.enter"
        } else {
            "inspect.exit"
        }
        let sent = SendRequest(command, "{}")
        let message = if inspecting {
            "Inspect mode enabled"
        } else {
            "Inspect mode paused"
        }
        AppendLog(
            DiagnosticWire.Clock(),
            if sent {
                "info"
            } else {
                "debug"
            },
            "inspector",
            message
        )
    }

    func SetQuery(value string) {
        query = if value == nil {
            ""
        } else {
            value
        }
    }

    func SelectWindow(id string) {
        for window in windows {
            if window.Id == id {
                selectedWindowId = id
                selectedNodeId = window.Root.Id
                if selectedNodeId != "" {
                    SendRequest("select", "{\"nodeId\":\"" + DiagnosticWire.Escape(selectedNodeId) + "\"}")
                }
                AppendLog(DiagnosticWire.Clock(), "debug", "window", "Selected " + window.Title)
                return
            }
        }
    }

    func SelectNode(id string) {
        let node = FindNode(id)
        if node == nil {
            return
        }
        selectedNodeId = id
        SendRequest(
            "select",
            "{\"nodeId\":\"" + DiagnosticWire.Escape(id)
            + "\",\"windowId\":\"" + DiagnosticWire.Escape(selectedWindowId) + "\"}"
        )
    }

    func ClearSelection() {
        selectedNodeId = ""
        hoveredNodeId = ""
        SendRequest("clear", "{}")
        AppendLog(DiagnosticWire.Clock(), "debug", "inspector", "Cleared remote selection")
    }

    func SetTab(tab DiagnosticDetailsTab) {
        activeTab = tab
    }

    func SetOverrideText(value string) {
        overrideText = if value == nil {
            ""
        } else {
            value
        }
    }

    func ApplyOverride() {
        if overrideText.Length == 0 {
            return
        }
        if state != DiagnosticConnectionState.Connected {
            AppendLog(DiagnosticWire.Clock(), "error", "override", "Cannot apply an override while disconnected")
            return
        }
        if state == DiagnosticConnectionState.Connected && !transport.Capabilities.RuntimeOverrides {
            AppendLog(DiagnosticWire.Clock(), "debug", "override", "Target does not advertise runtime overrides")
            return
        }
        let nodeId = DiagnosticWire.Escape(selectedNodeId)
        let value = DiagnosticWire.Escape(overrideText)
        let sent = SendRequest("override", "{\"nodeId\":\"" + nodeId + "\",\"value\":\"" + value + "\"}")
        if !sent {
            AppendLog(DiagnosticWire.Clock(), "error", "override", "Override request could not be sent")
            return
        }
        if transport.IsSample {
            overrideActive = true
            AppendLog(DiagnosticWire.Clock(), "debug", "override", "Applied temporary runtime style")
        } else {
            pendingOverrideAction = "override"
            AppendLog(DiagnosticWire.Clock(), "debug", "override", "Override request sent")
        }
    }

    func ResetOverride() {
        if state != DiagnosticConnectionState.Connected {
            AppendLog(DiagnosticWire.Clock(), "error", "override", "Cannot reset an override while disconnected")
            return
        }
        if state == DiagnosticConnectionState.Connected && !transport.Capabilities.RuntimeOverrides {
            AppendLog(DiagnosticWire.Clock(), "debug", "override", "Target does not advertise runtime overrides")
            return
        }
        let sent = SendRequest("reset", "{\"nodeId\":\"" + DiagnosticWire.Escape(selectedNodeId) + "\"}")
        if !sent {
            AppendLog(DiagnosticWire.Clock(), "error", "override", "Reset request could not be sent")
            return
        }
        if transport.IsSample {
            overrideActive = false
            overrideText = "BackgroundColor = #18212A"
            AppendLog(DiagnosticWire.Clock(), "debug", "override", "Cleared temporary runtime style")
        } else {
            pendingOverrideAction = "reset"
            AppendLog(DiagnosticWire.Clock(), "debug", "override", "Reset request sent")
        }
    }

    func CaptureScreenshot() {
        if state == DiagnosticConnectionState.Connected && !transport.Capabilities.Screenshots {
            AppendLog(DiagnosticWire.Clock(), "debug", "capture", "Capture is not advertised by the target")
            return
        }
        if state == DiagnosticConnectionState.Connected && !transport.IsSample {
            captureRequestInFlight = true
            SendRequest(
                "capture",
                "{\"windowId\":\"" + DiagnosticWire.Escape(selectedWindowId) + "\",\"format\":\"png\"}"
            )
            AppendLog(DiagnosticWire.Clock(), "info", "capture", "Capture requested from " + SelectedWindow().Title)
            return
        }
        screenshotSequence = screenshotSequence + 1
        let id = "capture-" + screenshotSequence.ToString()
        screenshots.Add(
            DiagnosticScreenshot(
                id,
                SelectedWindow().Title,
                DiagnosticWire.Clock(),
                SelectedWindow().Dimensions,
                if state == DiagnosticConnectionState.Connected {
                    "2.8 MB"
                } else {
                    "preview"
                }
            )
        )
        AppendLog(DiagnosticWire.Clock(), "info", "capture", "Captured " + SelectedWindow().Title)
    }

    func ClearLogs() {
        logs.Clear()
    }

    internal func Pump() bool {
        var changed = false
        let currentState = transport.State
        if state != currentState {
            state = currentState
            changed = true
        }
        let messages = transport.Poll()
        for message in messages {
            Apply(message)
            changed = true
        }
        return changed
    }

    func BindWake(callback Action?) {
        transport.SetWake(callback)
    }

    prop IsSample bool {
        get -> transport.IsSample
    }

    private func SendRequest(command string, payload string) bool {
        let message = DiagnosticMessage(
            transport.Endpoint.Protocol,
            DiagnosticMessageKind.Unknown,
            0,
            "",
            selectedWindowId,
            payload
        )
        message.Command = command
        message.Raw = DiagnosticWire.Request(command, payload)
        return transport.Send(message)
    }

    private func Apply(message DiagnosticMessage) {
        if message.IsResponse {
            ApplyResponse(message)
            return
        }
        if message.Kind == DiagnosticMessageKind.Hello {
            state = DiagnosticConnectionState.Connected
            AppendLog(DiagnosticWire.Clock(), "info", "protocol", "Diagnostics hello accepted")
            if transport.Capabilities.Logs {
                SendRequest("logs", "{}")
            }
            if transport.Capabilities.Events {
                SendRequest("events", "{}")
            }
            return
        }
        if message.Kind == DiagnosticMessageKind.Snapshot {
            let snapshot = DiagnosticWire.ParseSnapshot(message.Payload, message.WindowId, false)
            if let value = snapshot {
                if value.Full {
                    ApplySnapshot(value)
                } else {
                    ApplyDelta(value)
                }
            }
            return
        }
        if message.Kind == DiagnosticMessageKind.TreeDelta {
            let snapshot = DiagnosticWire.ParseSnapshot(message.Payload, message.WindowId, false)
            if let value = snapshot {
                ApplyDelta(value)
            }
            return
        }
        if message.Kind == DiagnosticMessageKind.Selection {
            let selection = DiagnosticWire.ParseSelection(message.Payload)
            if selection.SelectedId != "" {
                let selected = selection.SelectedId
                selectedNodeId = selected
            }
            if selection.HoveredId != "" {
                let hovered = selection.HoveredId
                hoveredNodeId = hovered
            }
            return
        }
        if message.Kind == DiagnosticMessageKind.Hover {
            let selection = DiagnosticWire.ParseSelection(message.Payload)
            if selection.HoveredId != "" {
                let hovered = selection.HoveredId
                hoveredNodeId = hovered
            }
            return
        }
        if message.Kind == DiagnosticMessageKind.Log || message.Kind == DiagnosticMessageKind.InputTrace {
            let entry = DiagnosticWire.ParseLog(message.Payload, message.Kind)
            AppendLog(entry.Timestamp, entry.Level, entry.Source, entry.Message)
            return
        }
        if message.Kind == DiagnosticMessageKind.Screenshot {
            AddScreenshot(message.Payload)
            return
        }
        if message.Kind == DiagnosticMessageKind.Error {
            AppendLog(DiagnosticWire.Clock(), "error", "protocol", message.ErrorText)
            return
        }
        if message.Kind == DiagnosticMessageKind.HotReload {
            AppendLog(DiagnosticWire.Clock(), "info", "hot-reload", "Target reported a UI reload")
        }
    }

    private func ApplyResponse(message DiagnosticMessage) {
        if !message.Succeeded {
            if message.Command == "override" || message.Command == "property.override"
            || message.Command == "reset" || message.Command == "property.reset" {
                pendingOverrideAction = ""
            }
            AppendLog(DiagnosticWire.Clock(), "error", "protocol", message.ErrorText)
            return
        }
        if message.Command == "snapshot" || message.Command == "tree.snapshot" {
            let snapshot = DiagnosticWire.ParseSnapshot(message.Payload, message.WindowId, false)
            if let value = snapshot {
                if value.Full {
                    ApplySnapshot(value)
                } else {
                    ApplyDelta(value)
                }
            }
            return
        }
        if message.Command == "capture" {
            captureRequestInFlight = false
            let capture = DiagnosticWire.ParseCapture(message.Payload)
            if capture.Pending {
                AppendLog(DiagnosticWire.Clock(), "debug", "capture", "Capture pending")
                captureRequestInFlight = true
                SendRequest(
                    "capture",
                    "{\"windowId\":\"" + DiagnosticWire.Escape(selectedWindowId) + "\",\"format\":\"png\"}"
                )
            } else {
                AddScreenshot(message.Payload)
            }
            return
        }
        if message.Command == "logs" || message.Command == "events" {
            let kind = if message.Command == "events" {
                DiagnosticMessageKind.InputTrace
            } else {
                DiagnosticMessageKind.Log
            }
            for entry in DiagnosticWire.ParseLogs(message.Payload, kind) {
                AppendLog(
                    if entry.Timestamp == "" {
                        DiagnosticWire.Clock()
                    } else {
                        entry.Timestamp
                    },
                    entry.Level,
                    entry.Source,
                    entry.Message
                )
            }
            return
        }
        if message.Command == "select" || message.Command == "inspect.select" {
            let selection = DiagnosticWire.ParseSelection(message.Payload)
            if selection.SelectedId != "" {
                selectedNodeId = selection.SelectedId
            }
            if selection.HoveredId != "" {
                hoveredNodeId = selection.HoveredId
            }
            return
        }
        if message.Command == "clear" || message.Command == "inspect.clear" {
            selectedNodeId = ""
            hoveredNodeId = ""
            return
        }
        if message.Command == "override" || message.Command == "property.override" {
            pendingOverrideAction = ""
            overrideActive = true
            AppendLog(DiagnosticWire.Clock(), "debug", "override", "Applied temporary runtime style")
            return
        }
        if message.Command == "reset" || message.Command == "property.reset" {
            pendingOverrideAction = ""
            overrideActive = false
            overrideText = "BackgroundColor = #18212A"
            AppendLog(DiagnosticWire.Clock(), "debug", "override", "Cleared temporary runtime style")
            return
        }
        if message.Command == "inspect.enter" {
            inspecting = true
        } else if message.Command == "inspect.exit" {
            inspecting = false
        }
    }

    private func ApplySnapshot(snapshot DiagnosticWireSnapshot) {
        let fallbackTitle = if transport.Endpoint.WindowTitle != "" {
            transport.Endpoint.WindowTitle
        } else if transport.Endpoint.ProcessName != "" {
            transport.Endpoint.ProcessName
        } else {
            "Remote target"
        }
        if snapshot.Windows.Count != 0 {
            windows.Clear()
            for wireWindow in snapshot.Windows {
                if let root = wireWindow.Root {
                    windows.Add(
                        DiagnosticWindow(
                            wireWindow.Id,
                            if wireWindow.Title == "" {
                                fallbackTitle
                            } else {
                                wireWindow.Title
                            },
                            wireWindow.Dimensions,
                            wireWindow.Scale,
                            ToNode(root)
                        )
                    )
                }
            }
        } else if snapshot.Nodes.Count != 0 {
            let window = BuildWindow(snapshot, fallbackTitle)
            windows.Clear()
            windows.Add(window)
        }
        if snapshot.WindowId != "" {
            selectedWindowId = snapshot.WindowId
        }
        if snapshot.SelectedId != "" {
            let selected = snapshot.SelectedId
            selectedNodeId = selected
        }
        if snapshot.HoveredId != "" {
            let hovered = snapshot.HoveredId
            hoveredNodeId = hovered
        }
        EnsureSelection()
        AppendLog(
            DiagnosticWire.Clock(),
            "info",
            "protocol",
            "Snapshot received: "
            + CountNodes().ToString() + " nodes, " + windows.Count.ToString() + " windows"
        )
    }

    private func ApplyDelta(snapshot DiagnosticWireSnapshot) {
        if windows.Count == 0 || IsPlaceholderWindow(SelectedWindow()) {
            if snapshot.Nodes.Count == 0 {
                snapshot.Nodes.AddRange(snapshot.Added)
                snapshot.Nodes.AddRange(snapshot.Updated)
            }
            if snapshot.Nodes.Count != 0 {
                ApplySnapshot(snapshot)
            }
            return
        }

        let window = SelectedWindow()
        var rootRemoved = false
        for id in snapshot.Removed {
            if id == window.Root.Id {
                rootRemoved = true
                break
            }
        }
        let detached = Dictionary[string, DiagnosticTreeNode]()
        if rootRemoved {
            var replacement DiagnosticWireNode?
            for wireNode in snapshot.Added {
                if wireNode.ParentId == "" {
                    replacement = wireNode
                    break
                }
            }
            if let next = replacement {
                let root = ToNode(next)
                window.Root = root
                CollectDetached(root, detached)
            } else {
                window.Root = DiagnosticTreeNode(
                    "remote-root",
                    "Target",
                    "No live root reported",
                    "",
                    "",
                    "",
                    "",
                    "",
                    "",
                    "",
                    "",
                    "",
                    ""
                )
            }
        }
        for id in snapshot.Removed {
            if !rootRemoved || id != window.Root.Id {
                RemoveNode(id)
            }
        }
        let pending = List[DiagnosticWireNode]()
        for wireNode in snapshot.Updated {
            var current DiagnosticTreeNode?
            if detached.TryGetValue(wireNode.Id, out var detachedNode) {
                current = detachedNode
            } else {
                current = FindNode(wireNode.Id)
            }
            if let target = current {
                CollectDetached(target, detached)
                if target.Id != window.Root.Id {
                    DetachNode(window.Root, target.Id)
                }
                CopyNode(target, wireNode)
            } else {
                let node = ToNode(wireNode)
                CollectDetached(node, detached)
            }
            pending.Add(wireNode)
        }
        for wireNode in snapshot.Added {
            if !detached.ContainsKey(wireNode.Id) {
                let current = FindNode(wireNode.Id)
                if let existing = current {
                    CollectDetached(existing, detached)
                    if existing.Id != window.Root.Id {
                        DetachNode(window.Root, existing.Id)
                    }
                    CopyNode(existing, wireNode)
                } else {
                    let node = ToNode(wireNode)
                    CollectDetached(node, detached)
                }
            }
            pending.Add(wireNode)
        }
        var index int32
        while index < pending.Count {
            let wireNode = pending[index]
            let node = EnsureDetachedNode(wireNode, detached)
            var parent DiagnosticTreeNode?
            if wireNode.ParentId == "" {
                parent = window.Root
            } else if detached.TryGetValue(wireNode.ParentId, out var detachedParent) {
                parent = detachedParent
            } else {
                parent = FindNode(wireNode.ParentId)
            }
            if let actualParent = parent {
                if actualParent.Id != node.Id {
                    InsertChild(actualParent, node, wireNode.ChildIndex)
                }
                pending.RemoveAt(index)
            } else {
                index = index + 1
            }
        }
        if index == pending.Count {
            for wireNode in pending {
                if detached.TryGetValue(wireNode.Id, out var node) {
                    if node.Id != window.Root.Id {
                        InsertChild(window.Root, node, wireNode.ChildIndex)
                    }
                }
            }
        }
        if snapshot.SelectedId != "" {
            let selected = snapshot.SelectedId
            selectedNodeId = selected
        }
        if snapshot.HoveredId != "" {
            let hovered = snapshot.HoveredId
            hoveredNodeId = hovered
        }
        EnsureSelection()
        AppendLog(DiagnosticWire.Clock(), "debug", "reconcile", "Applied remote tree delta")
    }

    private func IsPlaceholderWindow(window DiagnosticWindow) bool -> window.Id == "disconnected"
    || window.Root.Id == "disconnected-root"

    private func EnsureDetachedNode(
        wireNode DiagnosticWireNode,
        detached Dictionary[string, DiagnosticTreeNode]
    ) DiagnosticTreeNode {
        if detached.TryGetValue(wireNode.Id, out var node) {
            return node
        }
        let created = ToNode(wireNode)
        CollectDetached(created, detached)
        return created
    }

    private func BuildWindow(snapshot DiagnosticWireSnapshot, fallbackTitle string) DiagnosticWindow {
        let nodes = Dictionary[string, DiagnosticTreeNode]()
        for wireNode in snapshot.Nodes {
            if wireNode.Id != "" {
                nodes[wireNode.Id] = ToNode(wireNode)
            }
        }
        for wireNode in snapshot.Nodes {
            if !nodes.ContainsKey(wireNode.Id) {
                continue
            }
            let current = nodes[wireNode.Id]
            for childId in wireNode.ChildIds {
                if nodes.ContainsKey(childId) && !current.Children.Contains(nodes[childId]) {
                    current.Children.Add(nodes[childId])
                }
            }
            if wireNode.ParentId != "" && nodes.ContainsKey(wireNode.ParentId) {
                let parent = nodes[wireNode.ParentId]
                if !parent.Children.Contains(current) {
                    parent.Children.Add(current)
                }
            }
        }
        var root DiagnosticTreeNode?
        if snapshot.RootId != "" && nodes.ContainsKey(snapshot.RootId) {
            root = nodes[snapshot.RootId]
        }
        if root == nil {
            for wireNode in snapshot.Nodes {
                if wireNode.ParentId == "" && nodes.ContainsKey(wireNode.Id) {
                    root = nodes[wireNode.Id]
                    break
                }
            }
        }
        if root == nil && snapshot.Nodes.Count != 0 {
            root = nodes[snapshot.Nodes[0].Id]
        }
        let actualRoot = root ?? DiagnosticTreeNode(
            "root",
            "ScreenPanel",
            "Remote root",
            "",
            "",
            "",
            "",
            "",
            "",
            "",
            "",
            "",
            ""
        )
        return DiagnosticWindow(
            if snapshot.WindowId == "" {
                "remote-window"
            } else {
                snapshot.WindowId
            },
            if snapshot.Title == "" {
                fallbackTitle
            } else {
                snapshot.Title
            },
            if snapshot.Dimensions == "" {
                "unknown size"
            } else {
                snapshot.Dimensions
            },
            if snapshot.Scale == "" {
                "1.0x"
            } else {
                snapshot.Scale
            },
            actualRoot
        )
    }

    private func ToNode(wire DiagnosticWireNode) DiagnosticTreeNode {
        let node = DiagnosticTreeNode(
            wire.Id,
            wire.TypeName,
            wire.DisplayName,
            wire.CellName,
            wire.Key,
            wire.Bounds,
            wire.Properties,
            wire.Computed,
            wire.Layout,
            wire.State,
            wire.Events,
            wire.Accessibility,
            wire.Changes
        )
        for child in wire.Children {
            let next = ToNode(child)
            var duplicate = false
            for existing in node.Children {
                if existing.Id == next.Id {
                    duplicate = true
                    break
                }
            }
            if !duplicate {
                node.Children.Add(next)
            }
        }
        return node
    }

    private func CopyNode(target DiagnosticTreeNode, source DiagnosticWireNode) {
        target.TypeName = source.TypeName
        target.DisplayName = source.DisplayName
        target.CellName = source.CellName
        target.Key = source.Key
        target.Bounds = source.Bounds
        target.Properties = source.Properties
        target.Computed = source.Computed
        target.Layout = source.Layout
        target.State = source.State
        target.Events = source.Events
        target.Accessibility = source.Accessibility
        target.Changes = source.Changes
    }

    private func CollectDetached(node DiagnosticTreeNode, destination Dictionary[string, DiagnosticTreeNode]) {
        let visited = HashSet[string]()
        CollectDetached(node, destination, visited)
    }

    private func CollectDetached(
        node DiagnosticTreeNode,
        destination Dictionary[string, DiagnosticTreeNode],
        visited HashSet[string]
    ) {
        if node.Id != "" {
            if visited.Contains(node.Id) {
                return
            }
            visited.Add(node.Id)
            destination[node.Id] = node
        }
        for child in node.Children {
            CollectDetached(child, destination, visited)
        }
    }

    private func DetachNode(parent DiagnosticTreeNode, id string) DiagnosticTreeNode? {
        let visited = HashSet[string]()
        return DetachNode(parent, id, visited)
    }

    private func DetachNode(parent DiagnosticTreeNode, id string, visited HashSet[string]) DiagnosticTreeNode? {
        if parent.Id != "" {
            if visited.Contains(parent.Id) {
                return nil
            }
            visited.Add(parent.Id)
        }
        for child in parent.Children {
            if child.Id == id {
                parent.Children.Remove(child)
                return child
            }
            let detached = DetachNode(child, id, visited)
            if let result = detached {
                return result
            }
        }
        return nil
    }

    private func InsertChild(parent DiagnosticTreeNode, node DiagnosticTreeNode, childIndex int32) {
        if Object.ReferenceEquals(parent, node) || parent.Id == node.Id {
            return
        }
        if parent.Id != "" && findNode(node, parent.Id) != nil {
            return
        }
        for child in parent.Children {
            if child.Id == node.Id {
                parent.Children.Remove(child)
                break
            }
        }
        if childIndex < 0 || childIndex > parent.Children.Count {
            parent.Children.Add(node)
        } else {
            parent.Children.Insert(childIndex, node)
        }
    }

    private func RemoveNode(id string) bool {
        for window in windows {
            if RemoveChild(window.Root, id) {
                return true
            }
            if window.Root.Id == id {
                return false
            }
        }
        return false
    }

    private func RemoveChild(parent DiagnosticTreeNode, id string) bool {
        let visited = HashSet[string]()
        return RemoveChild(parent, id, visited)
    }

    private func RemoveChild(parent DiagnosticTreeNode, id string, visited HashSet[string]) bool {
        if parent.Id != "" {
            if visited.Contains(parent.Id) {
                return false
            }
            visited.Add(parent.Id)
        }
        for child in parent.Children {
            if child.Id == id {
                parent.Children.Remove(child)
                return true
            }
            if RemoveChild(child, id, visited) {
                return true
            }
        }
        return false
    }

    private func AddScreenshot(payload string) {
        let capture = DiagnosticWire.ParseCapture(payload)
        screenshotSequence = screenshotSequence + 1
        screenshots.Add(
            DiagnosticScreenshot(
                "capture-" + screenshotSequence.ToString(),
                if capture.WindowName == "" {
                    SelectedWindow().Title
                } else {
                    capture.WindowName
                },
                if capture.CapturedAt == "" {
                    DiagnosticWire.Clock()
                } else {
                    capture.CapturedAt
                },
                if capture.Dimensions == "" {
                    SelectedWindow().Dimensions
                } else {
                    capture.Dimensions
                },
                capture.Bytes
            )
        )
        AppendLog(DiagnosticWire.Clock(), "info", "capture", "Received target capture")
    }

    private func EnsureSelection() {
        if windows.Count == 0 {
            seedDisconnectedWindow()
            return
        }
        var hasWindow = false
        for window in windows {
            if window.Id == selectedWindowId {
                hasWindow = true
                break
            }
        }
        if !hasWindow {
            selectedWindowId = windows[0].Id
        }
        if FindNode(selectedNodeId) == nil {
            selectedNodeId = SelectedWindow().Root.Id
        }
    }

    private func CountNodes() int32 {
        var count int32
        for window in windows {
            count = count + CountNodesIn(window.Root)
        }
        return count
    }

    private func CountNodesIn(node DiagnosticTreeNode) int32 {
        let visited = HashSet[string]()
        return CountNodesIn(node, visited)
    }

    private func CountNodesIn(node DiagnosticTreeNode, visited HashSet[string]) int32 {
        if node.Id != "" {
            if visited.Contains(node.Id) {
                return 0
            }
            visited.Add(node.Id)
        }
        var count int32 = 1
        for child in node.Children {
            count = count + CountNodesIn(child, visited)
        }
        return count
    }

    func SelectedWindow() DiagnosticWindow {
        for window in windows {
            if window.Id == selectedWindowId {
                return window
            }
        }
        return windows[0]
    }

    func SelectedNode() DiagnosticTreeNode {
        let selected = FindNode(selectedNodeId)
        if let node = selected {
            return node
        }
        return SelectedWindow().Root
    }

    func VisibleRows() List[DiagnosticTreeRow] {
        let result = List[DiagnosticTreeRow]()
        appendRows(SelectedWindow().Root, 0, result)
        return result
    }

    private func appendRows(node DiagnosticTreeNode, depth int32, result List[DiagnosticTreeRow]) {
        let visited = HashSet[string]()
        appendRows(node, depth, result, visited)
    }

    private func appendRows(
        node DiagnosticTreeNode,
        depth int32,
        result List[DiagnosticTreeRow],
        visited HashSet[string]
    ) {
        if node.Id != "" {
            if visited.Contains(node.Id) {
                return
            }
            visited.Add(node.Id)
        }
        if query.Length == 0 || matchesNode(node) || hasMatchingChild(node) {
            result.Add(DiagnosticTreeRow(node, depth))
            for child in node.Children {
                appendRows(child, depth + 1, result, visited)
            }
        }
    }

    private func matchesNode(node DiagnosticTreeNode) bool {
        let needle = query.ToLowerInvariant()
        return node.DisplayName.ToLowerInvariant().Contains(needle)
        || node.TypeName.ToLowerInvariant().Contains(needle)
        || node.CellName.ToLowerInvariant().Contains(needle)
        || node.Key.ToLowerInvariant().Contains(needle)
    }

    private func hasMatchingChild(node DiagnosticTreeNode) bool {
        let visited = HashSet[string]()
        return hasMatchingChild(node, visited)
    }

    private func hasMatchingChild(node DiagnosticTreeNode, visited HashSet[string]) bool {
        if node.Id != "" {
            if visited.Contains(node.Id) {
                return false
            }
            visited.Add(node.Id)
        }
        for child in node.Children {
            if matchesNode(child) || hasMatchingChild(child, visited) {
                return true
            }
        }
        return false
    }

    private func FindNode(id string) DiagnosticTreeNode? {
        for window in windows {
            let found = findNode(window.Root, id)
            if let node = found {
                return node
            }
        }
        return nil
    }

    private func findNode(node DiagnosticTreeNode, id string) DiagnosticTreeNode? {
        let visited = HashSet[string]()
        return findNode(node, id, visited)
    }

    private func findNode(node DiagnosticTreeNode, id string, visited HashSet[string]) DiagnosticTreeNode? {
        if node.Id != "" {
            if visited.Contains(node.Id) {
                return nil
            }
            visited.Add(node.Id)
        }
        if node.Id == id {
            return node
        }
        for child in node.Children {
            let found = findNode(child, id, visited)
            if let result = found {
                return result
            }
        }
        return nil
    }

    private func AppendLog(timestamp string, level string, source string, message string) {
        logs.Add(DiagnosticLogEntry(timestamp, level, source, message))
        while logs.Count > 24 {
            logs.RemoveAt(0)
        }
    }

    private func seedLogs() {
        AppendLog("04:17:51", "info", "watch", "dotnet watch is waiting for a target")
        AppendLog("04:17:54", "debug", "reconcile", "Mounted root Cell WorkspaceCell")
        AppendLog("04:17:55", "debug", "layout", "Layout settled in 0.42 ms")
        AppendLog("04:17:58", "info", "accessibility", "Published 12 semantic nodes")
    }

    private func seedScreenshots() {
        screenshots.Add(DiagnosticScreenshot("capture-0", "Main Window", "04:17:59", "1280 × 800 @ 1.0x", "baseline"))
    }

    private func seedDisconnectedWindow() {
        let root = DiagnosticTreeNode(
            "disconnected-root",
            "Target",
            "No live target",
            "",
            "",
            "",
            "Waiting for a goo.devtools/1 descriptor",
            "",
            "",
            "",
            "",
            "",
            "Connect a running Goo process or launch with --sample"
        )
        windows.Add(DiagnosticWindow("disconnected", "No live target", "", "", root))
        selectedWindowId = "disconnected"
        selectedNodeId = root.Id
    }

    private func seedWindows() {
        let root = DiagnosticTreeNode(
            "root",
            "ScreenPanel",
            "MainWindow",
            "WorkspaceCell",
            "main",
            "0, 0 · 1280 × 800",
            "Background = #0D1117; Padding = 24",
            "Width = 1280; Height = 800; Display = Flex",
            "0, 0 · 1280 × 800 · content 1232 × 752",
            "focused=false; hovered=false; enabled=true",
            "pointerdown → WorkspaceCell → MainWindow",
            "role=application; name=Goo Sample App",
            "rebuilt 18 ms ago; layout clean; paint clean"
        )
        let shell = DiagnosticTreeNode(
            "shell",
            "Container",
            "Shell",
            "WorkspaceCell",
            "shell",
            "24, 24 · 1232 × 752",
            "FlexDirection = Row; Gap = 20",
            "Width = 1232; Height = 752; FlexGrow = 1",
            "24, 24 · 1232 × 752 · content 1212 × 732",
            "hovered=false; focusable=false",
            "capture route: Shell → MainWindow",
            "role=group; name=Workspace",
            "rebuilt 18 ms ago; diff retained"
        )
        let rail = DiagnosticTreeNode(
            "rail",
            "Container",
            "NavigationRail",
            "NavigationCell",
            "rail",
            "24, 24 · 224 × 752",
            "Width = 224; Background = #121820; Padding = 16",
            "Width = 224; Height = 752",
            "24, 24 · 224 × 752 · content 192 × 720",
            "hovered=false; focusable=false",
            "none",
            "role=navigation; name=Primary",
            "style changed 42 ms ago"
        )
        let content = DiagnosticTreeNode(
            "content",
            "Container",
            "ContentColumn",
            "ContentCell",
            "content",
            "268, 24 · 988 × 752",
            "FlexDirection = Column; Gap = 16; FlexGrow = 1",
            "Width = 988; Height = 752; FlexGrow = 1",
            "268, 24 · 988 × 752 · content 988 × 752",
            "hovered=true; focusable=false",
            "pointermove → ContentColumn",
            "role=region; name=Content",
            "layout invalidated by width"
        )
        let header = DiagnosticTreeNode(
            "header",
            "Container",
            "Toolbar",
            "ToolbarCell",
            "toolbar",
            "268, 24 · 988 × 56",
            "FlexDirection = Row; AlignItems = Center",
            "Width = 988; Height = 56",
            "268, 24 · 988 × 56 · content 956 × 40",
            "hovered=false; focusable=false",
            "pointerdown → Toolbar",
            "role=toolbar; name=Actions",
            "paint retained"
        )
        let search = DiagnosticTreeNode(
            "search",
            "TextEntry",
            "SearchNodes",
            "ToolbarCell",
            "search",
            "284, 36 · 360 × 32",
            "Placeholder = Filter by type, Cell, or key",
            "Width = 360; Height = 32",
            "284, 36 · 360 × 32 · content 344 × 16",
            "focused=true; hovered=false; enabled=true",
            "keydown → TextEntry → ToolbarCell",
            "role=searchbox; name=Filter visual tree",
            "value changed 3 ms ago"
        )
        let inspector = DiagnosticTreeNode(
            "inspector",
            "Container",
            "InspectorSurface",
            "InspectorCell",
            "inspector",
            "268, 96 · 988 × 412",
            "Background = #18212A; BorderRadius = 8; Padding = 16",
            "Width = 988; Height = 412",
            "268, 96 · 988 × 412 · content 956 × 380",
            "hovered=false; focusable=false",
            "pointerdown → InspectorSurface",
            "role=region; name=Rendered target",
            "last paint 1.6 ms"
        )
        let card = DiagnosticTreeNode(
            "card",
            "Container",
            "ResultCard",
            "ResultCell",
            "card-1",
            "292, 132 · 420 × 156",
            "Background = #202B36; Padding = 16; BorderRadius = 6",
            "Width = 420; Height = 156",
            "292, 132 · 420 × 156 · content 388 × 124",
            "hovered=true; pressed=false; enabled=true",
            "pointerdown → ResultCard → InspectorSurface",
            "role=article; name=Selected result",
            "reconciled 12 ms ago; paint invalidated"
        )
        let title = DiagnosticTreeNode(
            "title",
            "Text",
            "ResultTitle",
            "ResultCell",
            "title",
            "308, 148 · 388 × 24",
            "Content = Hello Goo; FontSize = 18",
            "Width = 388; Height = 24",
            "308, 148 · 388 × 24 · content 388 × 24",
            "hovered=false; focusable=false",
            "none",
            "role=text; name=Hello Goo",
            "text atlas reused"
        )
        let action = DiagnosticTreeNode(
            "action",
            "Button",
            "PrimaryAction",
            "ResultCell",
            "primary",
            "308, 220 · 132 × 32",
            "Content = Continue; Background = #56D6C0",
            "Width = 132; Height = 32",
            "308, 220 · 132 × 32 · content 108 × 16",
            "hovered=false; focused=false; enabled=true",
            "click → ResultCell → InspectorSurface",
            "role=button; name=Continue; action=activate",
            "event handler unchanged"
        )
        let footer = DiagnosticTreeNode(
            "footer",
            "Container",
            "StatusBar",
            "StatusCell",
            "status",
            "268, 524 · 988 × 252",
            "FlexDirection = Column; Gap = 8",
            "Width = 988; Height = 252",
            "268, 524 · 988 × 252 · content 988 × 252",
            "hovered=false; focusable=false",
            "none",
            "role=status; name=Runtime status",
            "repaint skipped"
        )
        let statusText = DiagnosticTreeNode(
            "status-text",
            "Text",
            "RuntimeStatus",
            "StatusCell",
            "status-text",
            "268, 524 · 988 × 20",
            "Content = Connected",
            "Width = 988; Height = 20",
            "268, 524 · 988 × 20 · content 988 × 20",
            "hovered=false; focusable=false",
            "none",
            "role=status; name=Connected",
            "updated 22 ms ago"
        )

        root.Children.Add(shell)
        shell.Children.Add(rail)
        shell.Children.Add(content)
        content.Children.Add(header)
        content.Children.Add(inspector)
        content.Children.Add(footer)
        header.Children.Add(search)
        inspector.Children.Add(card)
        card.Children.Add(title)
        card.Children.Add(action)
        footer.Children.Add(statusText)

        let popupRoot = DiagnosticTreeNode(
            "popup-root",
            "ScreenPanel",
            "OverlayWindow",
            "OverlayCell",
            "overlay",
            "0, 0 · 480 × 280",
            "Background = #0D1117; Padding = 16",
            "Width = 480; Height = 280",
            "0, 0 · 480 × 280 · content 448 × 248",
            "hovered=false; focused=false; enabled=true",
            "pointerdown → OverlayWindow",
            "role=dialog; name=Overlay preview",
            "mounted 2.1 s ago; layout clean"
        )
        let popup = DiagnosticTreeNode(
            "popup-card",
            "Container",
            "OverlayCard",
            "OverlayCell",
            "dialog",
            "16, 16 · 448 × 248",
            "Background = #202B36; BorderRadius = 8; Padding = 20",
            "Width = 448; Height = 248",
            "16, 16 · 448 × 248 · content 408 × 208",
            "hovered=false; focusable=false",
            "pointerdown → OverlayCard",
            "role=dialog; name=Overlay preview",
            "reconciled 2.1 s ago"
        )
        popupRoot.Children.Add(popup)
        windows.Add(DiagnosticWindow("main-window", "Main Window", "1280 × 800", "1.0x", root))
        windows.Add(DiagnosticWindow("overlay-window", "Overlay Window", "480 × 280", "1.0x", popupRoot))
    }
}
