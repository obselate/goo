package GooDevTools

import System
import System.Collections.Generic
import System.Threading
import Goo

class DevToolsCell : Cell {
  private let session DiagnosticSession
  private var window Window?
  private var wakePending int32
  private var showCaptures bool
  private var showActivity bool
  private var showOverrides bool
  private var showAdvanced bool
  private var compact bool
  private var showProperties bool
  private var detailsHidden bool
  private var windowPickerOpen bool
  private var detailsWidth float64 = 420.0
  private var layoutWidth float64 = 1540.0
  private var resizing bool
  private var resizePointer int64
  private var resizeStartX float64
  private var resizeStartWidth float64
  private let collapsed HashSet[string] = HashSet[string]()

  public init() {
    session = DiagnosticSession{}
    wakePending = 0
    showCaptures = false
  }

  public init(sessionValue DiagnosticSession) {
    session = sessionValue
    wakePending = 0
    showCaptures = false
  }

  internal func AttachWindow(window Window) {
    this.window = window
    layoutWidth = float64(window.Width)
    compact = window.Width < 760
    window.MetricsChanged += (metrics WindowMetrics) -> {
      let nextWidth = float64(metrics.LogicalWidth)
      if nextWidth != layoutWidth {
        layoutWidth = nextWidth
        compact = nextWidth < 760.0
        Rebuild()
      }
    }
    session.BindWake(() -> {
      if Interlocked.Exchange(&wakePending, 1) != 0 {
        return
      }
      try {
        window.Post(() -> {
          Interlocked.Exchange(&wakePending, 0)
          if session.Pump() {
            Rebuild()
          }
        })
      } catch (_ Exception) {
        Interlocked.Exchange(&wakePending, 0)
      }
    })
  }

  override func Build() Blob {
    session.Pump()
    return BuildRoot()
  }

  private func BuildRoot() Container -> Container {
    Key: "devtools-root", Width: Length.Percent(100), Height: Length.Percent(100),
    FlexDirection: FlexDirection.Column, BorderRadius: 8, Overflow: Overflow.Hidden,
    BorderTopWidth: 1, BorderRightWidth: 1, BorderBottomWidth: 1, BorderLeftWidth: 1,
    BorderTopColor: DevToolsTheme.Border, BorderRightColor: DevToolsTheme.Border,
    BorderBottomColor: DevToolsTheme.Border, BorderLeftColor: DevToolsTheme.Border,
    BackgroundColor: DevToolsTheme.Background,
    Children: { BuildTopbar(), BuildBody() },
  }

  private func BuildTopbar() Container {
    let children = List[Blob]()
    children.Add(Text{
      Key: "brand", Content: "Goo Inspector", FontSize: 14, FontWeight: 600,
      Color: DevToolsTheme.Ink, MinWidth: 0, FlexShrink: 1.0,
    })
    children.Add(Container{ Key: "title-spacer", FlexGrow: 1.0 })
    children.Add(Container{
      Key: "window-controls", FlexDirection: FlexDirection.Row, Gap: 2,
      Children: {
        WindowControl("minimize", DevToolsIcons.Minimize, () -> { if let win = window { win.State = WindowState.Minimized } }),
        WindowControl("maximize", DevToolsIcons.Maximize, () -> {
          if let win = window {
            win.State = if win.State == WindowState.Maximized { WindowState.Normal } else { WindowState.Maximized }
          }
        }),
        WindowControl("close", DevToolsIcons.Close, () -> { window?.RequestClose() }),
      },
    })
    return Window.DragRegion(Container{
      Key: "topbar", Width: Length.Percent(100), Height: 36, FlexShrink: 0.0,
      PaddingLeft: 16, PaddingRight: 8, FlexDirection: FlexDirection.Row,
      AlignItems: AlignItems.Center, Gap: 10, BackgroundColor: DevToolsTheme.Surface,
      BorderBottomWidth: 1, BorderBottomColor: DevToolsTheme.Border, Children: children,
    })
  }

  private func WindowControl(key string, icon VectorAsset, action Action) Button -> Button {
    Key: "window-" + key, Width: 28, Height: 28, Padding: 0, Margin: 0,
    FlexDirection: FlexDirection.Row, AlignItems: AlignItems.Center, JustifyContent: JustifyContent.Center,
    BorderRadius: 4, Cursor: Cursor.Pointer,
    Hover: Style{ BackgroundColor: if key == "close" { DevToolsTheme.CloseHover } else { DevToolsTheme.SurfaceRaised } },
    OnClick: action,
    Children: {
      DevToolsIcons.View("window-icon", icon),
    },
  }

  private func BuildBody() Container {
    let panes = List[Blob]()
    if !compact || !showProperties { panes.Add(BuildCenter()) }
    if compact && showProperties || !compact && !detailsHidden {
      if !compact { panes.Add(BuildDivider()) }
      panes.Add(BuildInspector())
    }
    let children = List[Blob]()
    children.Add(BuildActions())
    if windowPickerOpen { children.Add(BuildWindowPicker()) }
    children.Add(Container{
      Key: "panes", Width: Length.Percent(100), Height: 0, MinHeight: 0,
      FlexGrow: 1.0, FlexDirection: FlexDirection.Row, Children: panes,
    })
    if showActivity { children.Add(BuildBottomPanel()) }
    return Container{
      Key: "body", Width: Length.Percent(100), Height: 0, FlexGrow: 1.0,
      MinHeight: 0, FlexDirection: FlexDirection.Column, Children: children,
      OnKeyDown: (e KeyEvent) -> {
        if e.Key == Key.Escape && windowPickerOpen {
          windowPickerOpen = false
          e.PreventDefault()
          Rebuild()
        }
      },
    }
  }

  private func InspectorWidth() float64 -> Math.Clamp(detailsWidth, 280.0, Math.Max(280.0, layoutWidth - 266.0))

  private func BuildDivider() Container -> Container {
    Key: "details-divider", Width: 6, Height: Length.Percent(100), FlexShrink: 0.0,
    Focusable: true, Cursor: Cursor.ResizeHorizontal,
    BackgroundColor: if resizing { DevToolsTheme.Accent } else { DevToolsTheme.Background },
    Hover: Style{ BackgroundColor: DevToolsTheme.BorderStrong },
    OnPointerDown: (e PointerEvent) -> {
      if e.Button != PointerButton.Primary || resizing { return }
      e.Capture()
      e.PreventDefault()
      resizing = true
      resizePointer = e.PointerId
      resizeStartX = e.WindowPosition.X
      resizeStartWidth = InspectorWidth()
    },
    OnPointerMove: (e PointerEvent) -> {
      if resizing && e.PointerId == resizePointer {
        detailsWidth = Math.Clamp(resizeStartWidth + resizeStartX - e.WindowPosition.X, 280.0, Math.Max(280.0, layoutWidth - 266.0))
        Rebuild()
      }
    },
    OnPointerUp: (e PointerEvent) -> {
      if e.PointerId == resizePointer {
        e.ReleaseCapture()
        resizing = false
        Rebuild()
      }
    },
    OnPointerCancel: (e PointerEvent) -> {
      if e.PointerId == resizePointer {
        e.ReleaseCapture()
        resizing = false
        Rebuild()
      }
    },
    OnKeyDown: (e KeyEvent) -> {
      if e.Key == Key.Left || e.Key == Key.Right {
        detailsWidth = Math.Clamp(InspectorWidth() + if e.Key == Key.Left { 16.0 } else { -16.0 }, 280.0, Math.Max(280.0, layoutWidth - 266.0))
        e.PreventDefault()
        Rebuild()
      }
    },
  }

  private func BuildActions() Container {
    let children = List[Blob]()
    children.Add(Button{
      Key: "window-picker-toggle", Width: 0, FlexGrow: 1.0, MinWidth: 180, MaxWidth: 340,
      Height: 28, PaddingLeft: 8, PaddingRight: 8,
      FlexDirection: FlexDirection.Row, AlignItems: AlignItems.Center, Gap: 8,
      BackgroundColor: DevToolsTheme.Surface, Hover: Style{ BackgroundColor: DevToolsTheme.SurfaceRaised }, Cursor: Cursor.Pointer,
      OnClick: () -> { windowPickerOpen = !windowPickerOpen
        Rebuild() },
      Children: {
        Text{ Key: "window-picker-label", Content: "Inspect window", FontSize: 12, Color: DevToolsTheme.InkMuted },
        Text{ Key: "window-picker-current", Content: session.SelectedWindow().Title,
          Width: 0, MinWidth: 0, FlexGrow: 1.0, FontSize: 12, Color: DevToolsTheme.Ink,
          TextWrap: TextWrap.NoWrap, TextTrimming: TextTrimming.Ellipsis },
        DevToolsIcons.View("window-picker-arrow", DevToolsIcons.Expand),
      },
    })
    if !session.IsSample {
      children.Add(ActionButton("inspect-toggle", if session.Inspecting { "Stop picking" } else { "Pick element" },
        DevToolsTheme.Selection, DevToolsTheme.Ink, () -> { session.ToggleInspect()
          Rebuild() }))
    }
    children.Add(Container{ Key: "toolbar-space", FlexGrow: 1.0 })
    children.Add(ActionButton("activity-toggle", "Activity",
      if showActivity { DevToolsTheme.SurfaceStrong } else { DevToolsTheme.Background }, DevToolsTheme.InkMuted,
      () -> { showActivity = !showActivity
        Rebuild() }))
    children.Add(ActionButton("details-toggle", if compact && showProperties { "Elements" } else { "Details" },
      if !compact && !detailsHidden || compact && showProperties { DevToolsTheme.SurfaceStrong } else { DevToolsTheme.Background },
      DevToolsTheme.InkMuted, () -> {
        if compact { showProperties = !showProperties } else { detailsHidden = !detailsHidden }
        Rebuild()
      }))
    return Container{
      Key: "actions", Width: Length.Percent(100), MinHeight: 36, Padding: 4,
      FlexDirection: FlexDirection.Row, FlexWrap: FlexWrap.Wrap, AlignItems: AlignItems.Center, Gap: 4,
      BorderBottomWidth: 1, BorderBottomColor: DevToolsTheme.Border, Children: children,
    }
  }

  private func BuildWindowPicker() Container {
    let buttons = List[Blob]()
    buttons.Add(Text{
      Key: "window-picker-help", FontSize: 12, Color: DevToolsTheme.InkMuted, TextWrap: TextWrap.Wrap,
      Content: if session.IsSample { "Example windows. Choose one to explore its element tree." } else { "Choose the app window whose elements you want to inspect." },
    })
    var ordinal int32
    for target in session.Windows {
      let selected = target.Id == session.SelectedWindowId
      buttons.Add(Button{
        Key: "window-" + ordinal.ToString() + "-" + target.Id,
        Width: Length.Percent(100), Height: 30, PaddingLeft: 8, PaddingRight: 8,
        FlexDirection: FlexDirection.Row, AlignItems: AlignItems.Center, Gap: 12,
        BackgroundColor: if selected { DevToolsTheme.Selection } else { DevToolsTheme.Surface },
        Hover: Style{ BackgroundColor: DevToolsTheme.SurfaceRaised }, Cursor: Cursor.Pointer,
        OnClick: () -> { session.SelectWindow(target.Id)
          windowPickerOpen = false
          Rebuild() },
        Children: {
          Text{ Key: "window-title", Content: target.Title, Width: 0, MinWidth: 0, FlexGrow: 1.0,
            FontSize: 12, Color: DevToolsTheme.Ink, TextTrimming: TextTrimming.Ellipsis },
          Text{ Key: "window-size", Content: target.Dimensions, FontSize: 11, Color: DevToolsTheme.InkMuted },
        },
      })
      ordinal = ordinal + 1
    }
    if !session.IsSample {
      buttons.Add(ActionButton("connection-toggle", if session.State == DiagnosticConnectionState.Connected { "Disconnect from app" } else { "Connect to app" },
        DevToolsTheme.SurfaceRaised, DevToolsTheme.Ink, () -> { session.ToggleConnection()
          Rebuild() }))
    }
    return Container{
      Key: "window-picker", Width: Length.Percent(100), MaxHeight: 220, Padding: 8, Gap: 4,
      FlexDirection: FlexDirection.Column, OverflowY: Overflow.Scroll, BackgroundColor: DevToolsTheme.Surface,
      BorderBottomWidth: 1, BorderBottomColor: DevToolsTheme.Border, Children: buttons,
    }
  }

  private func BuildCenter() Container {
    let children = List[Blob]()
    if session.Inspecting { children.Add(BuildInspectBanner()) }
    children.Add(BuildTreeSection())
    return Container{
      Key: "tree-pane", Width: 0, Height: Length.Percent(100), FlexGrow: 1.0,
      MinWidth: 0, MinHeight: 0, Padding: 12, Gap: 8,
      FlexDirection: FlexDirection.Column, BackgroundColor: DevToolsTheme.Background,
      Children: children,
    }
  }

  private func BuildInspectBanner() Container -> Container {
    Key: "inspect-banner", Width: Length.Percent(100), Padding: 10,
    BackgroundColor: DevToolsTheme.Selection,
    Children: { Text{ Key: "inspect-help", FontSize: 12, Color: DevToolsTheme.Ink,
      TextWrap: TextWrap.Wrap, Content: if session.IsSample { "Select an element below to inspect the sample." } else { "Click an element in the app window to inspect it." } } },
  }

  private func BuildTreeSection() Container {
    let rowChildren = List[Blob](2)
    rowChildren.Add(Text{
      Key: "tree-title",
      Content: "Elements",
      FontSize: 12,
      FontWeight: 600,
      LetterSpacing: 0,
      Color: DevToolsTheme.InkSubtle,
    })
    rowChildren.Add(Text{
      Key: "tree-count",
      Content: session.VisibleRows().Count.ToString() + " elements",
      FontSize: 12,
      Color: DevToolsTheme.InkSubtle,
      FlexGrow: 1.0,
      TextAlign: TextAlign.Right,
    })
    let rows = List[Blob]()
    let visible = session.VisibleRows()
    var rowIndex int32
    var hiddenDepth = -1
    for row in visible {
      if session.Query == "" && hiddenDepth >= 0 && row.Depth > hiddenDepth { continue }
      hiddenDepth = -1
      rows.Add(BuildTreeRow(row, rowIndex))
      if session.Query == "" && collapsed.Contains(row.Node.Id) { hiddenDepth = row.Depth }
      rowIndex = rowIndex + 1
    }
    if rows.Count == 0 {
      rows.Add(Container{
        Key: "tree-empty",
        Width: Length.Percent(100),
        Height: 56,
        Padding: 14,
        Children: {
          Text{
            Key: "tree-empty-text",
            Content: if session.State != DiagnosticConnectionState.Connected { "Connect to an app to see its elements." } else { "No elements match your search." },
            FontSize: 12,
            Color: DevToolsTheme.InkMuted,
          },
        },
      })
    }
    let viewport = Container{
      Key: "tree-viewport",
      Width: Length.Percent(100),
      Height: 0,
      FlexGrow: 1.0,
      FlexShrink: 1.0,
      MinHeight: 0,
      OverflowY: Overflow.Scroll,
      OverflowX: Overflow.Hidden,
      ScrollbarVisibility: ScrollbarVisibility.Auto,
      FlexDirection: FlexDirection.Column,
      Children: rows,
    }
    return Container{
      Key: "tree-section",
      Width: Length.Percent(100),
      Height: 0,
      FlexGrow: 1.0,
      FlexShrink: 1.0,
      MinHeight: 0,
      FlexDirection: FlexDirection.Column,
      Gap: 8,
      Children: {
        Container{
          Key: "tree-toolbar",
          Width: Length.Percent(100),
          Height: 54,
          MinHeight: 54,
          FlexDirection: FlexDirection.Column,
          AlignItems: AlignItems.Center,
          Gap: 10,
          Children: {
            Container{
              Key: "tree-heading",
              Width: Length.Percent(100),
              FlexDirection: FlexDirection.Row,
              AlignItems: AlignItems.Center,
              Children: rowChildren,
            },
            TextEntry{
              Key: "tree-search",
              Width: Length.Percent(100),
              Height: 30,
              PaddingLeft: 9,
              PaddingRight: 9,
              Value: session.Query,
              Placeholder: "Find an element...",
              Color: DevToolsTheme.Ink,
              FontSize: 11,
              BackgroundColor: DevToolsTheme.Surface,
              BorderRadius: 4,
              BorderWidth: 1,
              BorderColor: DevToolsTheme.Border,
              SelectionColor: DevToolsTheme.Selection,
              OnChange: (value string) -> {
                session.SetQuery(value)
                Rebuild()
              },
            },
          },
        },
        viewport,
      },
    }
  }

  private func BuildTreeRow(row DiagnosticTreeRow, ordinal int32) Container {
    let node = row.Node
    let selected = node.Id == session.SelectedNodeId
    let children = List[Blob]()
    if node.Children.Count > 0 {
      children.Add(Button{
        Key: "expand-" + node.Id, Width: 26, Height: 32,
        FlexDirection: FlexDirection.Row, AlignItems: AlignItems.Center,
        JustifyContent: JustifyContent.Center, Cursor: Cursor.Pointer,
        OnClick: () -> {
          if !collapsed.Remove(node.Id) { collapsed.Add(node.Id) }
          Rebuild()
        },
        Children: {
          DevToolsIcons.View("disclosure-icon", if collapsed.Contains(node.Id) { DevToolsIcons.Chevron } else { DevToolsIcons.Expand }),
        },
      })
    } else { children.Add(Container{ Key: "leaf-space", Width: 26 }) }
    children.Add(Button{
      Key: "select-" + node.Id, Width: 0, FlexGrow: 1.0, MinWidth: 0, Height: 32,
      FlexDirection: FlexDirection.Row, AlignItems: AlignItems.Center, Gap: 8, Cursor: Cursor.Pointer,
      OnClick: () -> { session.SelectNode(node.Id)
        if compact { showProperties = true }
        Rebuild() },
      Children: {
        Text{ Key: "tree-name", Content: node.DisplayName, Width: 0, FlexGrow: 1.0, MinWidth: 0,
          FontSize: 12, FontWeight: if selected { 600 } else { 400 }, Color: DevToolsTheme.Ink,
          TextWrap: TextWrap.NoWrap, TextTrimming: TextTrimming.Ellipsis },
        Text{ Key: "tree-type", Content: if node.TypeName == node.DisplayName { "" } else { node.TypeName },
          Width: Length.Percent(32), FontSize: 11, Color: DevToolsTheme.InkSubtle,
          TextWrap: TextWrap.NoWrap, TextTrimming: TextTrimming.Ellipsis },
      },
    })
    return Container{
      Key: "tree-row-" + ordinal.ToString() + "-" + node.Id,
      Width: Length.Percent(100), Height: 34, MinHeight: 34,
      PaddingLeft: Math.Min(float64(row.Depth) * 12.0, 72.0), PaddingRight: 6,
      FlexDirection: FlexDirection.Row, AlignItems: AlignItems.Center,
      BackgroundColor: if selected { DevToolsTheme.Selection } else if node.Id == session.HoveredNodeId { DevToolsTheme.SurfaceRaised } else { DevToolsTheme.Background },
      Hover: Style{ BackgroundColor: if selected { DevToolsTheme.Selection } else { DevToolsTheme.SurfaceRaised } },
      Children: children,
    }
  }

  private func BuildBottomPanel() Container {
    let logRows = List[Blob]()
    var logIndex int32
    for entry in session.Logs {
      logRows.Add(BuildLogRow(entry, logIndex))
      logIndex = logIndex + 1
    }
    let captureCards = List[Blob]()
    var captureIndex int32
    for screenshot in session.Screenshots {
      captureCards.Add(BuildCaptureCard(screenshot, captureIndex))
      captureIndex = captureIndex + 1
    }
    if captureCards.Count == 0 {
      captureCards.Add(Container{
        Key: "captures-empty",
        Width: Length.Percent(100),
        Height: 44,
        Padding: 10,
        Children: {
          Text{
            Key: "captures-empty-label",
            Content: "No captured frames",
            FontSize: 12,
            Color: DevToolsTheme.InkSubtle,
          },
        },
      })
    }
    let panelRows = if showCaptures { captureCards } else { logRows }
    return Container{
      Key: "bottom-panel",
      Width: Length.Percent(100),
      Height: 148,
      MinHeight: 148,
      FlexDirection: FlexDirection.Column,
      BackgroundColor: DevToolsTheme.Surface,
      BorderWidth: 1,
      BorderColor: DevToolsTheme.Border,
      Children: {
        Container{
          Key: "bottom-header",
          Width: Length.Percent(100),
          Height: 38,
          MinHeight: 38,
          PaddingLeft: 6,
          PaddingRight: 8,
          FlexDirection: FlexDirection.Row,
          AlignItems: AlignItems.Center,
          Gap: 5,
          BorderBottomWidth: 1,
          BorderBottomColor: DevToolsTheme.Border,
          Children: {
            ActionButton(
              "drawer-console",
              "Console " + session.Logs.Count.ToString(),
              if !showCaptures { DevToolsTheme.SurfaceStrong } else { DevToolsTheme.Surface },
              if !showCaptures { DevToolsTheme.Ink } else { DevToolsTheme.InkMuted },
              () -> {
                showCaptures = false
                Rebuild()
              }),
            ActionButton(
              "drawer-captures",
              "Captures " + session.Screenshots.Count.ToString(),
              if showCaptures { DevToolsTheme.SurfaceStrong } else { DevToolsTheme.Surface },
              if showCaptures { DevToolsTheme.Ink } else { DevToolsTheme.InkMuted },
              () -> {
                showCaptures = true
                Rebuild()
              }),
            Container{ Key: "logs-spacer", FlexGrow: 1.0 },
            ActionButton(
              "clear-logs",
              "Clear",
              DevToolsTheme.SurfaceRaised,
              DevToolsTheme.InkMuted,
              () -> {
                session.ClearLogs()
                Rebuild()
              }),
            ActionButton(
              "capture-bottom",
              "Capture",
              DevToolsTheme.Selection,
              DevToolsTheme.Ink,
              () -> {
                session.CaptureScreenshot()
                Rebuild()
              }),
          },
        },
        Container{
          Key: "bottom-content",
          Width: Length.Percent(100),
          Height: 0,
          FlexGrow: 1.0,
          MinHeight: 0,
          Padding: 6,
          FlexDirection: FlexDirection.Column,
          OverflowY: Overflow.Scroll,
          OverflowX: Overflow.Hidden,
          ScrollbarVisibility: ScrollbarVisibility.Auto,
          Children: panelRows,
        },
      },
    }
  }

  private func BuildLogRow(entry DiagnosticLogEntry, ordinal int32) Container {
    let levelColor = if entry.Level == "error" {
      DevToolsTheme.Red
    } else if entry.Level == "info" {
      DevToolsTheme.Accent
    } else {
      DevToolsTheme.InkSubtle
    }
    return Container{
      Key: "log-" + ordinal.ToString() + "-" + entry.Timestamp + "-" + entry.Source + "-" + entry.Message,
      Width: Length.Percent(100),
      Height: 23,
      MinHeight: 23,
      PaddingLeft: 6,
      PaddingRight: 6,
      FlexDirection: FlexDirection.Row,
      AlignItems: AlignItems.Center,
      Gap: 8,
      BackgroundColor: DevToolsTheme.Surface,
      Children: {
        Text{
          Key: "log-time",
          Content: entry.Timestamp,
          Width: 68,
          FontSize: 12,
          Color: DevToolsTheme.InkSubtle,
        },
        Text{
          Key: "log-level",
          Content: entry.Level,
          Width: 48,
          FontSize: 12,
          FontWeight: 600,
          Color: levelColor,
          TextTransform: TextTransform.Uppercase,
        },
        Text{
          Key: "log-source",
          Content: entry.Source,
          Width: 64,
          FontSize: 12,
          Color: DevToolsTheme.InkMuted,
          TextTrimming: TextTrimming.Ellipsis,
        },
        Text{
          Key: "log-message",
          Content: entry.Message,
          Width: 0,
          MinWidth: 0,
          FlexGrow: 1.0,
          FontSize: 12,
          Color: DevToolsTheme.InkMuted,
          TextTrimming: TextTrimming.Ellipsis,
        },
      },
    }
  }

  private func BuildCaptureCard(screenshot DiagnosticScreenshot, ordinal int32) Container -> Container {
    Key: "capture-" + ordinal.ToString() + "-" + screenshot.Id,
    Width: Length.Percent(100),
    MinHeight: 62,
    Padding: 8,
    FlexDirection: FlexDirection.Column,
    Gap: 3,
    BackgroundColor: DevToolsTheme.SurfaceRaised,
    BorderRadius: 4,
    BorderWidth: 1,
    BorderColor: DevToolsTheme.Border,
    Children: {
      Container{
        Key: "capture-title-row",
        Width: Length.Percent(100),
        FlexDirection: FlexDirection.Row,
        Children: {
          Text{
            Key: "capture-window",
            Content: screenshot.WindowName,
            FontSize: 12,
            FontWeight: 600,
            Color: DevToolsTheme.Ink,
            FlexGrow: 1.0,
          },
          Text{
            Key: "capture-id",
            Content: screenshot.Id,
            FontSize: 11,
            Color: DevToolsTheme.InkSubtle,
          },
        },
      },
      Text{
        Key: "capture-dimensions",
        Content: screenshot.Dimensions,
        FontSize: 12,
        Color: DevToolsTheme.Accent,
      },
      Text{
        Key: "capture-time",
        Content: screenshot.CapturedAt + " · " + screenshot.Bytes,
        FontSize: 11,
        Color: DevToolsTheme.InkSubtle,
      },
    },
  }

  private func BuildInspector() Container {
    let tabButtons = List[Blob]()
    tabButtons.Add(BuildTabButton(DiagnosticDetailsTab.Configuration, "Properties"))
    tabButtons.Add(BuildTabButton(DiagnosticDetailsTab.Layout, "Layout"))
    let node = session.SelectedNode()
    let details = List[Blob]()
    details.Add(BuildDetails(node))
    if session.ActiveTab == DiagnosticDetailsTab.Configuration {
      details.Add(Container{
        Key: "style-editor-toggle", FlexDirection: FlexDirection.Row, PaddingTop: 6,
        Children: { ActionButton("overrides-toggle", if showOverrides { "Hide style editor" } else { "Edit style..." },
          DevToolsTheme.SurfaceRaised, DevToolsTheme.Ink, () -> {
            showOverrides = !showOverrides
            Rebuild()
          }) },
      })
      if showOverrides { details.Add(BuildOverridePanel()) }
    }
    details.Add(Container{
      Key: "advanced-section", Width: Length.Percent(100), MarginTop: 16, Gap: 8,
      BorderTopWidth: 1, BorderTopColor: DevToolsTheme.Border, PaddingTop: 8,
      FlexDirection: FlexDirection.Column,
      Children: {
        ActionButton("advanced-toggle", if showAdvanced { "Hide advanced details" } else { "Advanced details..." },
          DevToolsTheme.Surface, DevToolsTheme.InkMuted, () -> { showAdvanced = !showAdvanced
            Rebuild() }),
      },
    })
    if showAdvanced {
      details.Add(DetailRow("computed", "Computed style", ReadableReport(node.Computed)))
      details.Add(DetailRow("state", "State", Reported(node.State)))
      details.Add(DetailRow("events", "Events", Reported(node.Events)))
      details.Add(DetailRow("accessibility", "Accessibility", Reported(node.Accessibility)))
      details.Add(DetailRow("changes", "Changes", Reported(node.Changes)))
    }
    return Container{
      Key: "inspector",
      Width: if compact { Length.Percent(100) } else { Length(InspectorWidth()) },
      MinWidth: 0,
      MinHeight: 0,
      Height: Length.Percent(100),
      FlexShrink: 0.0,
      FlexDirection: FlexDirection.Column,
      BackgroundColor: DevToolsTheme.Surface,
      BorderLeftWidth: 1,
      BorderLeftColor: DevToolsTheme.Border,
      Children: {
        Container{
          Key: "inspector-header", Width: Length.Percent(100), Height: 40, MinHeight: 40,
          PaddingLeft: 12, PaddingRight: 6, FlexDirection: FlexDirection.Row, AlignItems: AlignItems.Center, Gap: 8,
          BorderBottomWidth: 1, BorderBottomColor: DevToolsTheme.Border,
          Children: {
            Text{ Key: "inspector-node-name", Content: node.DisplayName, Width: 0, MinWidth: 0,
              FlexGrow: 1.0, FontSize: 14, FontWeight: 600, Color: DevToolsTheme.Ink, TextTrimming: TextTrimming.Ellipsis },
            ActionButton("hide-details", "Hide", DevToolsTheme.Surface, DevToolsTheme.InkMuted,
              () -> { detailsHidden = true
                showProperties = false
                Rebuild() }),
          },
        },
        Container{
          Key: "inspector-tabs",
          Width: Length.Percent(100),
          MinHeight: 36,
          Padding: 4,
          Gap: 4,
          FlexDirection: FlexDirection.Row,
          FlexWrap: FlexWrap.Wrap,
          Children: tabButtons,
        },
        Container{
          Key: "details-viewport",
          Width: Length.Percent(100),
          Height: 0,
          FlexGrow: 1.0,
          FlexShrink: 1.0,
          MinHeight: 0,
          PaddingLeft: 10,
          PaddingRight: 10,
          FlexDirection: FlexDirection.Column,
          OverflowY: Overflow.Scroll,
          OverflowX: Overflow.Hidden,
          ScrollbarVisibility: ScrollbarVisibility.Auto,
          Children: details,
        },
      },
    }
  }

  private func BuildTabButton(tab DiagnosticDetailsTab, label string) Button {
    let selected = session.ActiveTab == tab
    return Button{
      Key: "tab-" + label, Height: 30, PaddingLeft: 10, PaddingRight: 10,
      FlexDirection: FlexDirection.Row, AlignItems: AlignItems.Center,
      BackgroundColor: DevToolsTheme.Surface,
      BorderBottomWidth: if selected { 2 } else { 0 }, BorderBottomColor: DevToolsTheme.Accent,
      Hover: Style{ BackgroundColor: DevToolsTheme.SurfaceRaised }, Cursor: Cursor.Pointer,
      OnClick: () -> { session.SetTab(tab)
        Rebuild() },
      Children: { Text{ Key: "tab-label", Content: label, FontSize: 12,
        FontWeight: if selected { 600 } else { 400 },
        Color: if selected { DevToolsTheme.Ink } else { DevToolsTheme.InkMuted } },
      },
    }
  }

  private func BuildDetails(node DiagnosticTreeNode) Container {
    let rows = List[Blob]()
    if session.ActiveTab == DiagnosticDetailsTab.Configuration {
      rows.Add(DetailRow("type", "Type", node.TypeName))
      rows.Add(DetailRow("owner", "Component", Reported(node.CellName)))
      rows.Add(DetailRow("key", "Key", Reported(node.Key)))
      rows.Add(DetailRow("declared", "Style", ReadableReport(node.Properties)))
      rows.Add(DetailRow("bounds", "Bounds", Reported(node.Bounds)))
    } else if session.ActiveTab == DiagnosticDetailsTab.Layout {
      rows.Add(DetailRow("bounds", "Border box", Reported(node.Bounds)))
      rows.Add(DetailRow("content", "Content box", SampleOrReported("", "content origin follows padding")))
      rows.Add(DetailRow("layout", "Layout values", ReadableReport(node.Layout)))
      rows.Add(DetailRow("box-model", "Box model", SampleOrReported("", "margin 0 · border 1 · padding 16")))
      rows.Add(DetailRow("clip", "Clip and scroll", SampleOrReported("", "visible · viewport inherited")))
      rows.Add(DetailRow("scale", "Display scale", Reported(session.SelectedWindow().Scale)))
    }
    return Container{
      Key: "details-" + session.ActiveTab.ToString(),
      Width: Length.Percent(100),
      FlexDirection: FlexDirection.Column,
      Gap: 5,
      PaddingBottom: 14,
      Children: rows,
    }
  }

  private func Reported(value string) string -> if value == "" { "not reported by target" } else { value }

  private func ReadableReport(value string) string -> Reported(value).Replace("; ", "\n")

  private func SampleOrReported(value string, sample string) string -> if session.IsSample { sample } else { Reported(value) }

  private func DetailRow(key string, label string, value string) Container -> Container {
    Key: "detail-row-" + key,
    Width: Length.Percent(100),
    MinHeight: 42,
    PaddingLeft: 8,
    PaddingRight: 8,
    PaddingTop: 6,
    PaddingBottom: 6,
    FlexDirection: FlexDirection.Row,
    AlignItems: AlignItems.FlexStart,
    Gap: 10,
    BackgroundColor: DevToolsTheme.Surface,
    BorderBottomWidth: 1,
    BorderBottomColor: DevToolsTheme.Border,
    Children: {
      Text{
        Key: "detail-label",
        Content: label,
        Width: Length.Percent(28),
        MinWidth: 0,
        FontSize: 12,
        FontWeight: 600,
        Color: DevToolsTheme.InkSubtle,
        TextTrimming: TextTrimming.Ellipsis,
      },
      Text{
        Key: "detail-value",
        Content: value,
        Width: 0,
        MinWidth: 0,
        FlexGrow: 1.0,
        FontSize: 12,
        Color: DevToolsTheme.InkMuted,
        TextWrap: TextWrap.Wrap,
      },
    },
  }

  private func BuildOverridePanel() Container -> Container {
    Key: "override-panel",
    Width: Length.Percent(100),
    Padding: 10,
    MarginTop: 4,
    MarginBottom: 12,
    FlexDirection: FlexDirection.Column,
    Gap: 7,
    BackgroundColor: DevToolsTheme.SurfaceRaised,
    BorderRadius: 5,
    BorderWidth: 1,
    BorderColor: if session.OverrideActive { DevToolsTheme.Accent } else { DevToolsTheme.Border },
    Children: {
      Container{
        Key: "override-heading",
        Width: Length.Percent(100),
        FlexDirection: FlexDirection.Row,
        AlignItems: AlignItems.Center,
        Children: {
          Text{
            Key: "override-title",
            Content: "Temporary style",
            FontSize: 12,
            FontWeight: 600,
            LetterSpacing: 0,
            Color: if session.OverrideActive { DevToolsTheme.Accent } else { DevToolsTheme.InkSubtle },
            FlexGrow: 1.0,
          },
          Text{
            Key: "override-status",
            Content: if session.OverrideActive { "active" } else { "temporary" },
            FontSize: 11,
            Color: if session.OverrideActive { DevToolsTheme.Accent } else { DevToolsTheme.InkSubtle },
          },
        },
      },
      Text{
        Key: "override-help",
        Content: if session.IsSample {
          "Experiment without rewriting source. Hot reload clears this layer."
        } else if session.Capabilities.RuntimeOverrides {
          "Temporary target override. Reset sends the target reset command."
        } else {
          "Target does not advertise runtime overrides."
        },
        FontSize: 12,
        Color: DevToolsTheme.InkMuted,
        TextWrap: TextWrap.Wrap,
      },
      TextEntry{
        Key: "override-entry",
        Width: Length.Percent(100),
        Height: 32,
        PaddingLeft: 8,
        PaddingRight: 8,
        Value: session.OverrideText,
        Color: DevToolsTheme.Ink,
        FontSize: 12,
        BackgroundColor: DevToolsTheme.Background,
        BorderRadius: 4,
        BorderWidth: 1,
        BorderColor: DevToolsTheme.Border,
        SelectionColor: DevToolsTheme.Selection,
        OnChange: (value string) -> {
          session.SetOverrideText(value)
          Rebuild()
        },
      },
      Container{
        Key: "override-actions",
        Width: Length.Percent(100),
        FlexDirection: FlexDirection.Row,
        Gap: 6,
        Children: {
          ActionButton(
            "override-apply",
            "Apply",
            DevToolsTheme.Selection,
            DevToolsTheme.Ink,
            () -> {
              session.ApplyOverride()
              Rebuild()
            }),
          ActionButton(
            "override-reset",
            "Reset",
            DevToolsTheme.Surface,
            DevToolsTheme.InkMuted,
            () -> {
              session.ResetOverride()
              Rebuild()
            }),
        },
      },
    },
  }

  private func ActionButton(key string, label string, background Color,
    foreground Color, onClick Action) Button -> Button{
      Key: key,
      Height: 26,
      PaddingLeft: 10,
      PaddingRight: 10,
      FlexDirection: FlexDirection.Row,
      AlignItems: AlignItems.Center,
      JustifyContent: JustifyContent.Center,
      BackgroundColor: background,
      BorderRadius: 3,
      Hover: Style{ BackgroundColor: DevToolsTheme.SurfaceStrong },
      Active: Style{ BackgroundColor: DevToolsTheme.BorderStrong },
      Cursor: Cursor.Pointer,
      OnClick: onClick,
      Children: {
        Text{
          Key: "button-label",
          Content: label,
          FontSize: 12,
          FontWeight: 600,
          Color: foreground,
        },
      },
    }

  private func ConnectionColor(value DiagnosticConnectionState) Color {
    if value == DiagnosticConnectionState.Connected {
      return DevToolsTheme.Green
    }
    if value == DiagnosticConnectionState.Faulted {
      return DevToolsTheme.Red
    }
    if value == DiagnosticConnectionState.Connecting {
      return DevToolsTheme.Amber
    }
    return DevToolsTheme.InkSubtle
  }

}
