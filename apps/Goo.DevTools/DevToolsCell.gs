package GooDevTools

import Goo
import Goo.Widgets
import Goo.Widgets.Actions
import Goo.Widgets.Data
import Goo.Widgets.Feedback
import Goo.Widgets.Icons
import Goo.Widgets.Inputs
import Goo.Widgets.Layout
import Goo.Widgets.Navigation
import System
import System.Collections.Generic
import System.Globalization
import System.Threading

class DevToolsCell : Cell {
    private let session DiagnosticSession
    private let logRow((DiagnosticLogEntry) -> Blob)
    private let captureRow((DiagnosticScreenshot) -> Blob)
    private let collapsed HashSet[string] = HashSet[string]()
    private let collapsedSections HashSet[string] = HashSet[string]()
    private var showDefaults bool
    private const LayoutNames string = "width height minWidth minHeight maxWidth maxHeight flexBasis flexGrow flexShrink aspectRatio position left top right bottom display flexDirection flexWrap justifyContent alignItems alignSelf alignContent gap rowGap columnGap overflowX overflowY direction"
    private const StyleNames string = "opacity backgroundColor borderColor borderWidth borderRadius fontFamily fontSize fontWeight fontStyle color textAlign textWrap textTrimming"
    private const TextNames string = ";fontFamily;fontSize;fontWeight;fontStyle;color;textAlign;textWrap;textTrimming;"
    private const DefaultValues string = ";flexDirection=Column;flexWrap=NoWrap;justifyContent=FlexStart;alignItems=Stretch;alignSelf=Auto;alignContent=FlexStart;position=Relative;flexGrow=0;flexShrink=0;aspectRatio=0;display=Flex;direction=Auto;overflowX=Visible;overflowY=Visible;opacity=1;backgroundColor=0,0,0,0;borderColor=0,0,0,0;fontFamily=;fontStyle=Normal;fontWeight=400;fontSize=16px;textAlign=Start;textWrap=Wrap;textTrimming=None;"
    private let typeNames Dictionary[string, string] = Dictionary[string, string]()
    private var treeNodes[]TreeNode = []TreeNode{}
    private var expandedIds[]string = []string{}
    private var elementCount int32
    private var window Window?
    private var wakePending int32
    private var showProfiler bool
    private var showCaptures bool
    private var showActivity bool
    private var showOverrides bool
    private var detailsHidden bool
    private var detailsWidth float64
    private var layoutWidth float64 = 1540.0

    public init(sessionValue DiagnosticSession) {
        session = sessionValue
        logRow = (entry DiagnosticLogEntry) -> BuildLogRow(entry)
        captureRow = (capture DiagnosticScreenshot) -> BuildCaptureRow(capture)
    }

    internal func AttachWindow(window Window) {
        this.window = window
        layoutWidth = window.Size.Width
        window.MetricsChanged += (metrics WindowMetrics) -> {
            let nextWidth = float64(metrics.LogicalWidth) / float64(metrics.UiScale)
            if nextWidth != layoutWidth {
                layoutWidth = nextWidth
                Rebuild()
            }
        }
        session.BindWake(
            () -> {
                if Interlocked.Exchange(&wakePending, 1) != 0 {
                    return
                }
                try {
                    window.Post(
                        () -> {
                            Interlocked.Exchange(&wakePending, 0)
                            let previousState = session.State
                            let previousProfiler = session.Profiler?.Revision ?? -1
                            let previousCapability = session.Capabilities.ProfilerTrace
                            if session.Pump() {
                                if !showProfiler || previousState != session.State
                                || previousProfiler != (session.Profiler?.Revision ?? -1)
                                || previousCapability != session.Capabilities.ProfilerTrace {
                                    Rebuild()
                                }
                            }
                        }
                    )
                } catch (_ Exception) {
                    Interlocked.Exchange(&wakePending, 0)
                }
            }
        )
    }

    override func Build() Blob {
        session.Pump()
        let theme = Theme.Read()
        let body Blob = if showProfiler {
            BuildProfiler()
        } else {
            BuildElements(theme)
        }
        return Container{
            Key: "devtools-root",
            Width: Percent(100),
            Height: Percent(100),
            FlexDirection: FlexDirection.Column,
            BorderRadius: theme.PanelRadius!!,
            BorderWidth: theme.BorderWidth,
            BorderColor: theme.BorderColor,
            Overflow: Overflow.Hidden,
            BackgroundColor: theme.CanvasColor,
            FontFamily: theme.FontFamily,
            FontSize: theme.FontSize,
            LineHeight: theme.LineHeight,
            Color: theme.TextColor,
            Container{
                Key: "chrome",
                WindowChrome{Host: window, EnableDoubleClick: true, LeadingContent: BuildMainTabs()}.Build(),
            },
            body,
        }
    }

    private func BuildMainTabs() Blob -> Cell.Mount[TabBarInput, TabBar](
        "main-tabs",
        TabBarInput{
            Items: []NavigationItem{
                NavigationItem{Id: "tab-elements", Label: "Elements"},
                NavigationItem{Id: "tab-profiler", Label: "Profiler"},
            },
            SelectedId: showProfiler ? "tab-profiler": "tab-elements",
            OnSelect: (id string) -> {
                showProfiler = id == "tab-profiler"
                Rebuild()
            },
            Width: Length.Auto,
            AccessibilityName: "View",
        }
    )

    private func BuildProfiler() Blob -> Cell.Mount[ProfilerCell](
        "profiler",
        (panel ProfilerCell) -> {
            panel.session = session
            panel.owner = window
            panel.Refresh(layoutWidth)
        }
    )

    private func BuildElements(theme Theme) Container {
        UpdateTree()
        let tree = BuildTree(theme)
        let panes Blob = if detailsHidden {
            tree
        } else {
            Cell.Mount[SplitPaneInput, SplitPane](
                "details-split",
                SplitPaneInput{
                    First: tree,
                    Second: BuildInspector(theme),
                    Value: layoutWidth - (detailsWidth > 0.0 ? detailsWidth: Math.Max(440.0, layoutWidth * 0.35)),
                    Unit: SplitUnit.Pixels,
                    MinimumFirst: 280.0,
                    MinimumSecond: 320.0,
                    AccessibilityName: "Resize details",
                    OnChange: (value float64) -> {
                        detailsWidth = layoutWidth - value
                        Rebuild()
                    },
                }
            )
        }
        let children = List[Blob]()
        children.Add(BuildToolbar(theme))
        let state = session.State
        if !session.IsSample && state != DiagnosticConnectionState.Connected
        && state != DiagnosticConnectionState.Connecting {
            let connect = ActionButton{
                Content: "Connect",
                OnClick: () -> {
                    session.ToggleConnection()
                    Rebuild()
                },
            }.Build()
            connect.Key = "connection-toggle"
            let banner = Banner{
                Tone: state == DiagnosticConnectionState.Faulted ? Tone.Danger: Tone.Warning,
                Content: state == DiagnosticConnectionState.Faulted ? "Connection failed": state.ToString(),
                Action: state == DiagnosticConnectionState.Reconnecting ? nil: connect,
                BorderRadius: 0.0,
            }.Build()
            banner.Key = "connection-banner"
            children.Add(banner)
        }
        children.Add(Container{Key: "panes", Width: Percent(100), Height: 0, MinHeight: 0, FlexGrow: 7.0, panes})
        if showActivity {
            children.Add(BuildActivity(theme))
        }
        return Container{
            Key: "elements",
            Width: Percent(100),
            Height: 0,
            MinHeight: 0,
            FlexGrow: 1.0,
            FlexDirection: FlexDirection.Column,
            Children: children,
        }
    }

    private func BuildToolbar(theme Theme) Container {
        let windows = List[ComboBoxOption]()
        for target in session.Windows {
            windows.Add(ComboBoxOption{Id: target.Id, Label: target.Title})
        }
        let children = List[Blob]()
        children.Add(
            Cell.Mount[ComboBoxInput, ComboBox](
                "window-picker",
                ComboBoxInput{
                    Items: windows.ToArray(),
                    SelectedId: session.SelectedWindowId,
                    OnSelect: (id string) -> {
                        session.SelectWindow(id)
                        Rebuild()
                    },
                    AccessibilityName: "Window",
                    Width: 220.0,
                }
            )
        )
        if !session.IsSample {
            let pick = ActionButton{
                Content: session.Inspecting ? "Stop picking": "Pick element",
                Leading: MaterialIcons.Create("arrow_selector_tool", 18.0),
                Pressed: session.Inspecting,
                Disabled: session.State != DiagnosticConnectionState.Connected,
                OnClick: () -> {
                    session.ToggleInspect()
                    Rebuild()
                },
            }.Build()
            pick.Key = "inspect-toggle"
            children.Add(pick)
            if session.State == DiagnosticConnectionState.Connected {
                children.Add(
                    ToolButton("connection-toggle", "link_off", "Disconnect", false, () -> session.ToggleConnection())
                )
            }
        }
        children.Add(Container{Key: "toolbar-space", FlexGrow: 1.0})
        children.Add(
            Container{
                Key: "tree-search",
                FlexGrow: 1.0,
                MinWidth: 120.0,
                MaxWidth: 320.0,
                TextField{
                    Value: session.Query,
                    Controlled: true,
                    Placeholder: "Find element",
                    AccessibilityName: "Find element",
                    Leading: MaterialIcons.Create("search", 18.0, theme.MutedTextColor),
                    Clearable: true,
                    Width: Percent(100),
                    OnChange: (value string) -> {
                        session.SetQuery(value)
                        collapsed.Clear()
                        Rebuild()
                    },
                }.Build(),
            }
        )
        children.Add(
            Text{
                Key: "tree-count",
                Content: elementCount == 1 ? "1 element": elementCount.ToString() + " elements",
                Color: theme.MutedTextColor,
                TextWrap: TextWrap.NoWrap,
            }
        )
        children.Add(
            ToolButton(
                "activity-toggle",
                "bottom_panel_open",
                "Activity",
                showActivity,
                () -> {
                    showActivity = !showActivity
                }
            )
        )
        children.Add(
            ToolButton(
                "details-toggle",
                "right_panel_open",
                "Details",
                !detailsHidden,
                () -> {
                    detailsHidden = !detailsHidden
                }
            )
        )
        return Container{
            Key: "toolbar",
            Width: Percent(100),
            FlexDirection: FlexDirection.Row,
            AlignItems: AlignItems.Center,
            Gap: theme.ControlGap,
            Padding: theme.Spacing * 2.0,
            BackgroundColor: theme.PanelColor,
            BorderWidth: Edges{Bottom: theme.BorderWidth},
            BorderColor: Edges[Color]{Bottom: theme.BorderColor},
            Children: children,
        }
    }

    private func ToolButton(key string, icon string, name string, active bool, action Action) Blob {
        let theme = Theme.Read()
        let button = IconButton{
            Icon: MaterialIcons.Create(icon, 18.0, active ? theme.LinkColor: theme.MutedTextColor),
            AccessibilityName: name,
            Active: active,
            OnClick: () -> {
                action()
                Rebuild()
            },
        }.Build()
        button.Key = key
        return Cell.Mount[TooltipInput, Tooltip](
            key + "-tooltip",
            TooltipInput{Window: window, Text: name, Target: button, Placement: PortalPlacement.Bottom}
        )
    }

    private func UpdateTree() {
        let rows = session.VisibleRows()
        elementCount = rows.Count
        typeNames.Clear()
        let expanded = List[string]()
        let path = List[DiagnosticTreeNode]()
        let levels = List[List[TreeNode]]()
        levels.Add(List[TreeNode]())
        for row in rows {
            while path.Count > row.Depth {
                CloseTreeNode(path, levels, expanded)
            }
            path.Add(row.Node)
            levels.Add(List[TreeNode]())
            let parts = List[string]()
            if row.Node.TypeName != row.Node.DisplayName {
                parts.Add(row.Node.TypeName)
            }
            if row.Node.Key != "" {
                parts.Add("#" + row.Node.Key)
            }
            if parts.Count > 0 {
                typeNames[row.Node.Id] = String.Join(" ", parts)
            }
        }
        while path.Count > 0 {
            CloseTreeNode(path, levels, expanded)
        }
        treeNodes = levels[0].ToArray()
        expandedIds = expanded.ToArray()
    }

    private func CloseTreeNode(path List[DiagnosticTreeNode], levels List[List[TreeNode]], expanded List[string]) {
        let node = path[path.Count - 1]
        let children = levels[levels.Count - 1]
        path.RemoveAt(path.Count - 1)
        levels.RemoveAt(levels.Count - 1)
        if children.Count > 0 && !collapsed.Contains(node.Id) {
            expanded.Add(node.Id)
        }
        levels[levels.Count - 1].Add(TreeNode{Id: node.Id, Label: node.DisplayName, Children: children.ToArray()})
    }

    private func BuildTree(theme Theme) Blob {
        if treeNodes.Length == 0 {
            return EmptyState{Title: session.Query == "" ? "No elements": "No matches"}.Build()
        }
        return Cell.Mount[TreeViewInput, TreeView](
            "element-tree",
            TreeViewInput{
                Nodes: treeNodes,
                ExpandedIds: expandedIds,
                OnExpandedChange: (id string, expanded bool) -> {
                    if expanded {
                        collapsed.Remove(id)
                    } else {
                        collapsed.Add(id)
                    }
                    Rebuild()
                },
                SelectedId: session.SelectedNode().Id,
                OnSelect: (id string) -> {
                    session.SelectNode(id)
                    Rebuild()
                },
                Height: Percent(100),
                Indent: theme.Spacing * 3.0,
                AccessibilityName: "Elements",
                BackgroundColor: theme.CanvasColor,
                CreateContent: (input TreeViewInput, row TreeViewRow, label Blob) -> {
                    if !typeNames.TryGetValue(row.Node.Id!!, out var typeName) {
                        return label
                    }
                    return Container{
                        FlexDirection: FlexDirection.Row,
                        AlignItems: AlignItems.Center,
                        Gap: theme.ControlGap,
                        label,
                        Text{
                            Content: typeName,
                            FontFamily: theme.MonoFontFamily,
                            FontSize: theme.CodeFontSize,
                            Color: theme.MutedTextColor,
                            TextWrap: TextWrap.NoWrap,
                        },
                    }
                },
                CreateRow: (input TreeViewInput, row TreeViewRow, root Container) -> {
                    if !row.Selected && row.Node.Id == session.HoveredNodeId {
                        root.BackgroundColor = theme.HoverColor
                    }
                    return root
                },
            }
        )
    }

    private func BuildInspector(theme Theme) Blob {
        let node = session.SelectedNode()
        if node.Id == "" {
            return EmptyState{Title: "No root"}.Build()
        }
        let fields = Fields(node)
        let items = List[PropertyGridItem]()
        let details = List[Blob]()
        let text = node.TypeName == "Text"
        details.Add(BoxDiagram(fields, theme))
        let border = Box(fields, "borderBox")
        AddValue(items, "Layout", "Position", Number(border[0]) + ", " + Number(border[1]), false, theme)
        AddValue(items, "Layout", "Size", Number(border[2]) + " × " + Number(border[3]), false, theme)
        if (fields.GetValueOrDefault("overflowX", "") + fields.GetValueOrDefault("overflowY", "")).Contains("Scroll") {
            AddValue(
                items,
                "Layout",
                "Scroll",
                fields.GetValueOrDefault("scrollOffset", "") + " of " + fields.GetValueOrDefault("contentSize", ""),
                false,
                theme
            )
        }
        AddSet(items, "Layout", fields, LayoutNames, text, theme)
        AddSet(items, "Style", fields, StyleNames, text, theme)
        AddValue(
            items,
            "Interaction",
            "State",
            Flags(fields, []string{"hovered", "pressed", "focused", "disabled", "focusable"}),
            false,
            theme
        )
        AddValue(
            items,
            "Interaction",
            "Handles",
            Flags(fields, []string{"hasClickHandler", "hasPointerHandlers", "hasKeyboardHandlers"}),
            false,
            theme
        )
        AddValue(items, "Interaction", "Accessible as", Accessible(fields), false, theme)
        AddFields(items, "Changes", node.Changes, theme)
        let sections = List[string]()
        for item in items {
            if !sections.Contains(item.Section) && !collapsedSections.Contains(item.Section) {
                sections.Add(item.Section)
            }
        }
        details.Add(
            PropertyGrid{
                Items: items.ToArray(),
                Layout: PropertyGridLayout.Compact,
                ExpandedSectionIds: sections.ToArray(),
                OnSectionExpandedChange: (section string, expanded bool) -> {
                    collapsedSections.Remove(section)
                    if !expanded {
                        collapsedSections.Add(section)
                    }
                    Rebuild()
                },
            }.Build()
        )
        details.Add(
            ActionButton{
                Content: showDefaults ? "Hide defaults": "Show defaults",
                OnClick: () -> {
                    showDefaults = !showDefaults
                    Rebuild()
                },
            }.Build()
        )
        details.Add(BuildOverrides(theme))
        return Container{
            Key: "inspector",
            Width: Percent(100),
            Height: Percent(100),
            FlexDirection: FlexDirection.Column,
            BackgroundColor: theme.PanelColor,
            Container{
                Key: "inspector-header",
                Width: Percent(100),
                FlexDirection: FlexDirection.Row,
                AlignItems: AlignItems.Center,
                Gap: theme.ControlGap,
                Padding: Edges{
                    Left: theme.PanelPadding,
                    Right: theme.Spacing * 2.0,
                    Top: theme.Spacing * 2.0,
                    Bottom: theme.Spacing * 2.0
                },
                Container{
                    Key: "inspector-node-name",
                    FlexGrow: 1.0,
                    MinWidth: 0,
                    Typography{
                        Content: node.DisplayName,
                        Variant: TextVariant.H6,
                        MaxLines: 1,
                        Trimming: TextTrimming.Ellipsis,
                    }.Build(),
                    Typography{
                        Content: Subtitle(node),
                        Variant: TextVariant.Caption,
                        Color: theme.MutedTextColor,
                        MaxLines: 1,
                        Trimming: TextTrimming.Ellipsis,
                    }.Build(),
                },
            },
            Container{
                Key: "details-viewport",
                Width: Percent(100),
                Height: 0,
                FlexGrow: 1.0,
                MinHeight: 0,
                Padding: Edges{Left: theme.PanelPadding, Right: theme.PanelPadding, Bottom: theme.PanelPadding},
                FlexDirection: FlexDirection.Column,
                Gap: theme.ControlGap * 2.0,
                OverflowY: Overflow.Scroll,
                OverflowX: Overflow.Hidden,
                ScrollbarY: theme.Scrollbar,
                Children: details,
            },
        }
    }

    private func AddFields(items List[PropertyGridItem], section string, text string, theme Theme) {
        for field in text.Split("; ") {
            let separator = field.IndexOf(" = ")
            if separator <= 0 {
                AddValue(items, section, section, field, false, theme)
            } else {
                let label = Char.ToUpperInvariant(field[0]).ToString() + field.Substring(1, separator - 1)
                AddValue(items, section, label, field.Substring(separator + 3), false, theme)
            }
        }
    }

    private func Fields(node DiagnosticTreeNode) Dictionary[string, string] {
        let fields = Dictionary[string, string]()
        for text in[]string{node.Properties, node.Computed, node.Layout, node.State, node.Events, node.Accessibility} {
            for field in text.Split("; ") {
                let separator = field.IndexOf(" = ")
                if separator > 0 {
                    fields[field.Substring(0, separator)] = field.Substring(separator + 3)
                }
            }
        }
        return fields
    }

    private func Subtitle(node DiagnosticTreeNode) string {
        let parts = List[string]()
        if node.TypeName != node.DisplayName {
            parts.Add(node.TypeName)
        }
        if node.Key != "" {
            parts.Add("#" + node.Key)
        }
        if node.CellName != "" {
            parts.Add(node.CellName)
        }
        return String.Join(" · ", parts)
    }

    private func AddSet(
        items List[PropertyGridItem],
        section string,
        fields Dictionary[string, string],
        names string,
        text bool,
        theme Theme
    ) {
        for name in names.Split(' ') {
            let value = fields.GetValueOrDefault(name, "")
            let unset = value == "" || value.Replace("unset", "").Replace(",", "") == ""
            let muted = unset || DefaultValues.Contains(";" + name + "=" + value + ";")
            if (showDefaults || !muted) && (text || !TextNames.Contains(";" + name + ";")) {
                let label = Char.ToUpperInvariant(name[0]).ToString() + name.Substring(1)
                let shown = unset ? "unset": name.EndsWith("Color") ? Hex(value): Compact(value)
                AddValue(items, section, label, shown, muted, theme)
            }
        }
    }

    private func AddValue(
        items List[PropertyGridItem],
        section string,
        label string,
        value string,
        muted bool,
        theme Theme
    ) {
        if value == "" || items.Exists((item PropertyGridItem) -> item.Id == section + ":" + label) {
            return
        }
        let content = Text{
            Content: value,
            FontFamily: theme.MonoFontFamily,
            FontSize: theme.CodeFontSize,
            Color: muted ? theme.FaintTextColor: theme.TextColor,
            TextWrap: TextWrap.Wrap,
        }
        items.Add(
            PropertyGridItem{
                Id: section + ":" + label,
                Label: label,
                Section: section,
                Editor: value.StartsWith("#") ? Container{
                    FlexDirection: FlexDirection.Row,
                    AlignItems: AlignItems.Center,
                    Gap: theme.Spacing,
                    Container{
                        Width: theme.CodeFontSize,
                        Height: theme.CodeFontSize,
                        BorderRadius: theme.RadiusSm!!,
                        BorderWidth: theme.BorderWidth,
                        BorderColor: theme.StrongBorderColor,
                        BackgroundColor: Swatch(value),
                    },
                    content,
                }: content,
            }
        )
    }

    private func Compact(value string) string {
        let parts = value.Replace("px", "").Split(",")
        return Array.TrueForAll(parts, (part string) -> part == parts[0]) ? parts[0]: String.Join(" ", parts)
    }

    private func Flags(fields Dictionary[string, string], names[]string) string {
        let labels = List[string]()
        for name in names {
            if fields.GetValueOrDefault(name, "").Equals("true", StringComparison.OrdinalIgnoreCase) {
                labels.Add(
                    name.StartsWith("has") ? name
                        .Substring(3)
                        .Replace("Handlers", "")
                        .Replace("Handler", ""): Char
                        .ToUpperInvariant(name[0]).ToString() + name.Substring(1)
                )
            }
        }
        return String.Join(", ", labels)
    }

    private func Accessible(fields Dictionary[string, string]) string {
        let role = fields.GetValueOrDefault("role", "")
        if role == "" {
            return ""
        }
        if fields.GetValueOrDefault("hidden", "").Equals("true", StringComparison.OrdinalIgnoreCase) {
            return role + ", hidden"
        }
        let name = fields.GetValueOrDefault("name", "")
        let parts = List[string]([]string{name == "" ? role: role + " \"" + name + "\""})
        for key in[]string{"description", "value", "checked", "selected", "expanded", "required", "invalid", "busy"} {
            let value = fields.GetValueOrDefault(key, "")
            if value != "" && value != "Unspecified" && !value.Equals("false", StringComparison.OrdinalIgnoreCase) {
                parts.Add(key + " " + value)
            }
        }
        return String.Join(", ", parts)
    }

    private func Hex(value string) string {
        let parts = value.Split(",")
        if parts.Length != 4 {
            return value
        }
        var text = "#"
        for i in 0 ... (parts[3] == "1" ? 3: 4) {
            text += Channel(parts[i]).ToString("X2")
        }
        return text
    }

    private func Swatch(hex string) Color {
        let value = Convert.ToUInt32(hex.Substring(1).PadRight(8, 'F'), 16)
        return Color.Rgba(
            int32(value >> 24),
            int32((value >> 16) & 255u),
            int32((value >> 8) & 255u),
            int32(value & 255u)
        )
    }

    private func Channel(text string) int32 -> int32(
        Math.Round(Double.Parse(text, CultureInfo.InvariantCulture) * 255.0)
    )

    private func Box(fields Dictionary[string, string], name string)[]float64 {
        let result = [4]float64
        let parts = fields
            .GetValueOrDefault(name, "")
            .Replace("·", " ")
            .Replace("×", " ")
            .Replace(",", " ")
            .Split(" ", StringSplitOptions.RemoveEmptyEntries)
        for i in 0 ... Math.Min(4, parts.Length) {
            result[i] = Double.Parse(parts[i], CultureInfo.InvariantCulture)
        }
        return result
    }

    private func Number(value float64) string -> Math.Round(value, 1).ToString(CultureInfo.InvariantCulture)

    private func BoxDiagram(fields Dictionary[string, string], theme Theme) Blob {
        let content = Box(fields, "contentBox")
        let paddingBox = Box(fields, "paddingBox")
        let borderBox = Box(fields, "borderBox")
        let size = Container{
            AlignItems: AlignItems.Center,
            Padding: theme.Spacing,
            BackgroundColor: theme.InfoFillColor,
            BorderRadius: theme.RadiusSm!!,
        }
        size.Add(
            Text{
                Content: Number(content[2]) + " × " + Number(content[3]),
                FontFamily: theme.MonoFontFamily,
                FontSize: theme.CodeFontSize,
                Color: theme.TextColor,
            }
        )
        let padding = BoxLayer("padding", paddingBox, content, size, theme.SuccessFillColor, theme)
        let border = BoxLayer("border", borderBox, paddingBox, padding, theme.SunkenColor, theme)
        let margin = BoxLayer("margin", Box(fields, "marginBox"), borderBox, border, theme.WarningFillColor, theme)
        margin.Key = "box-diagram"
        return margin
    }

    private func BoxLayer(label string, outer[]float64, inner[]float64, child Blob, fill Color, theme Theme) Container {
        let edge = (value float64) -> Text{
            Content: Math.Abs(value) < 0.05 ? "–": Number(value),
            FontFamily: theme.MonoFontFamily,
            FontSize: theme.CodeFontSize,
            Color: theme.MutedTextColor,
        }
        return Container{
            Padding: Edges{Left: theme.Spacing, Right: theme.Spacing, Bottom: theme.Spacing / 2.0},
            BackgroundColor: fill,
            BorderWidth: theme.BorderWidth,
            BorderColor: theme.StrongBorderColor,
            BorderRadius: theme.RadiusSm!!,
            Container{
                FlexDirection: FlexDirection.Row,
                Container{
                    FlexGrow: 1.0,
                    FlexBasis: 0,
                    Text{Content: label, FontSize: theme.CodeFontSize, Color: theme.MutedTextColor},
                },
                edge(inner[1] - outer[1]),
                Container{FlexGrow: 1.0, FlexBasis: 0},
            },
            Container{
                FlexDirection: FlexDirection.Row,
                AlignItems: AlignItems.Center,
                Gap: theme.Spacing,
                edge(inner[0] - outer[0]),
                Container{FlexGrow: 1.0, child},
                edge(outer[0] + outer[2] - inner[0] - inner[2]),
            },
            Container{AlignItems: AlignItems.Center, edge(outer[1] + outer[3] - inner[1] - inner[3])},
        }
    }

    private func BuildOverrides(theme Theme) Blob {
        let entry = TextField{
            Value: session.OverrideText,
            Controlled: true,
            Placeholder: "BackgroundColor = #18212A",
            AccessibilityName: "Style override",
            Width: Percent(100),
            OnChange: (value string) -> {
                session.SetOverrideText(value)
                Rebuild()
            },
        }.Build()
        entry.Key = "override-entry"
        let apply = ActionButton{
            Content: "Apply",
            Disabled: session.OverrideText == "" || !session.IsSample && !session.Capabilities.RuntimeOverrides,
            OnClick: () -> {
                session.ApplyOverride()
                Rebuild()
            },
        }.Build()
        apply.Key = "override-apply"
        let reset = ActionButton{
            Content: "Reset",
            OnClick: () -> {
                session.ResetOverride()
                Rebuild()
            },
        }.Build()
        reset.Key = "override-reset"
        let overrides = Disclosure{
            Label: "Edit style",
            Expanded: showOverrides,
            OnExpandedChange: (value bool) -> {
                showOverrides = value
                Rebuild()
            },
            TextColor: session.OverrideActive ? theme.LinkColor: theme.TextColor,
            Content: Container{
                Gap: theme.ControlGap,
                entry,
                Container{
                    Key: "override-actions",
                    FlexDirection: FlexDirection.Row,
                    Gap: theme.ControlGap,
                    apply,
                    reset
                },
            },
        }.Build()
        overrides.Key = "overrides"
        return overrides
    }

    private func BuildActivity(theme Theme) Container {
        let header = List[Blob]()
        header.Add(
            Cell.Mount[ToggleGroupInput, ToggleGroup](
                "activity-view",
                ToggleGroupInput{
                    Items: []ToggleOption{
                        ToggleOption{Id: "drawer-console", Label: "Console " + session.Logs.Count.ToString()},
                        ToggleOption{Id: "drawer-captures", Label: "Captures " + session.Screenshots.Count.ToString()},
                    },
                    SelectedIds: []string{showCaptures ? "drawer-captures": "drawer-console"},
                    OnSelectionChange: (ids[]string) -> {
                        showCaptures = ids.Length > 0 && ids[0] == "drawer-captures"
                        Rebuild()
                    },
                    AccessibilityName: "Activity view",
                }
            )
        )
        header.Add(Container{Key: "activity-space", FlexGrow: 1.0})
        if !showCaptures {
            let clear = ActionButton{
                Content: "Clear",
                Leading: MaterialIcons.Create("clear_all", 18.0),
                OnClick: () -> {
                    session.ClearLogs()
                    Rebuild()
                },
            }.Build()
            clear.Key = "clear-logs"
            header.Add(clear)
        }
        let capture = ActionButton{
            Content: "Capture",
            Leading: MaterialIcons.Create("screenshot_monitor", 18.0),
            Disabled: !session.IsSample && session.State != DiagnosticConnectionState.Connected,
            OnClick: () -> {
                session.CaptureScreenshot()
                Rebuild()
            },
        }.Build()
        capture.Key = "capture-bottom"
        header.Add(capture)
        let rows = if showCaptures {
            VirtualRows(session.Screenshots, theme.ControlHeight, (shot DiagnosticScreenshot) -> shot.Id, captureRow)
        } else {
            VirtualRows(
                session.Logs,
                theme.ControlHeight,
                (entry DiagnosticLogEntry) -> entry.Id,
                logRow,
                followEnd: true
            )
        }
        rows.Key = showCaptures ? "capture-rows": "log-rows"
        rows.Width = Percent(100)
        rows.Height = 0
        rows.MinHeight = 0
        rows.FlexGrow = 1.0
        rows.OverflowY = Overflow.Scroll
        let body Blob = if showCaptures && session.Screenshots.Count == 0 {
            Container{
                Key: "captures-empty",
                Height: 0,
                MinHeight: 0,
                FlexGrow: 1.0,
                AlignItems: AlignItems.Center,
                JustifyContent: JustifyContent.Center,
                EmptyState{Title: "No captures", Description: "Select Capture to record the selected window."}.Build(),
            }
        } else {
            rows
        }
        return Container{
            Key: "activity",
            Width: Percent(100),
            Height: 0,
            MinHeight: 0,
            FlexGrow: 3.0,
            FlexDirection: FlexDirection.Column,
            BackgroundColor: theme.PanelColor,
            BorderWidth: Edges{Top: theme.BorderWidth},
            BorderColor: Edges[Color]{Top: theme.BorderColor},
            Container{
                Key: "activity-header",
                Width: Percent(100),
                FlexDirection: FlexDirection.Row,
                AlignItems: AlignItems.Center,
                Gap: theme.ControlGap,
                Padding: theme.Spacing * 2.0,
                Children: header,
            },
            body,
        }
    }

    private func BuildLogRow(entry DiagnosticLogEntry) Blob {
        let theme = Theme.Read()
        let tone = if entry.Level == "error" {
            Tone.Danger
        } else if entry.Level == "warn" || entry.Level == "warning" {
            Tone.Warning
        } else if entry.Level == "info" {
            Tone.Info
        } else {
            Tone.Neutral
        }
        return Container{
            Width: Percent(100),
            FlexDirection: FlexDirection.Row,
            AlignItems: AlignItems.Center,
            Gap: theme.ControlGap,
            Padding: Edges{
                Left: theme.ControlPadding,
                Right: theme.ControlPadding,
                Top: theme.Spacing,
                Bottom: theme.Spacing
            },
            Text{
                Key: "log-time",
                Content: entry.Timestamp,
                FontFamily: theme.MonoFontFamily,
                FontSize: theme.CodeFontSize,
                Color: theme.MutedTextColor,
                TextWrap: TextWrap.NoWrap,
            },
            Container{
                Key: "log-level",
                Width: theme.ControlHeight * 2.0,
                FlexShrink: 0.0,
                AlignItems: AlignItems.FlexStart,
                Badge{Content: entry.Level.ToUpperInvariant(), Tone: tone}.Build(),
            },
            Text{
                Key: "log-source",
                Content: entry.Source,
                Width: theme.ControlHeight * 3.0,
                FlexShrink: 0.0,
                Color: theme.MutedTextColor,
                TextWrap: TextWrap.NoWrap,
                TextTrimming: TextTrimming.Ellipsis,
            },
            Text{
                Key: "log-message",
                Content: entry.Message,
                Width: 0,
                MinWidth: 0,
                FlexGrow: 1.0,
                TextWrap: TextWrap.NoWrap,
                TextTrimming: TextTrimming.Ellipsis,
            },
        }
    }

    private func BuildCaptureRow(capture DiagnosticScreenshot) Blob {
        let theme = Theme.Read()
        return Container{
            Width: Percent(100),
            FlexDirection: FlexDirection.Row,
            AlignItems: AlignItems.Center,
            Gap: theme.ControlGap,
            Padding: Edges{
                Left: theme.ControlPadding,
                Right: theme.ControlPadding,
                Top: theme.Spacing,
                Bottom: theme.Spacing
            },
            Text{
                Key: "capture-time",
                Content: capture.CapturedAt,
                FontFamily: theme.MonoFontFamily,
                FontSize: theme.CodeFontSize,
                Color: theme.MutedTextColor,
                TextWrap: TextWrap.NoWrap,
            },
            Text{
                Key: "capture-window",
                Content: capture.WindowName,
                Width: 0,
                MinWidth: 0,
                FlexGrow: 1.0,
                TextWrap: TextWrap.NoWrap,
                TextTrimming: TextTrimming.Ellipsis,
            },
            Text{
                Key: "capture-dimensions",
                Content: capture.Dimensions,
                FontFamily: theme.MonoFontFamily,
                FontSize: theme.CodeFontSize,
                TextWrap: TextWrap.NoWrap,
            },
        }
    }
}
