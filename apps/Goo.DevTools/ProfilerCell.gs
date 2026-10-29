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

internal class ProfilerTableRow {
    internal let Cells[]string
    internal let Values[]float64
    internal let Id string
    internal init(cells[]string, values[]float64, id string) {
        Cells = cells
        Values = values
        Id = id
    }
}

internal partial class ProfilerCell : Cell, IDisposable {
    private const Pad float64 = 8.0
    private const Span float64 = 1000.0
    internal var session DiagnosticSession
    private var width float64 = 1400.0
    private var start int64
    private var end int64 = 1L
    private var selectionStart int64
    private var selectionEnd int64
    private var selected int32 = -1
    private var selectedFrame int32 = -1
    private var selectedIds[]string = []string{}
    private var hovered int32 = -1
    private var hoverX float64
    private var pressX float64
    private var anchor int64
    private var selecting bool
    private var filterWindow string = ""
    private var follow bool = true
    private var allocationSamples bool
    private var revision int32 = -1
    private var tab string = "Phases"
    private var sortColumn int32 = 2
    private var descending bool = true
    private var tableKey string = ""
    private var tableRows[]DataGridRow = []DataGridRow{}
    private var tableColumns[]DataGridColumn = []DataGridColumn{}
    private var columns[]int32 = []int32{}
    private var scale float64 = 1.0
    private let paths Dictionary[string, VectorPath] = Dictionary[string, VectorPath]()
    private var detailsWidth float64 = 380.0
    private var resizing bool
    private var resizePointer int64
    private var resizeStartX float64
    private var resizeStartWidth float64

    internal func Refresh(value float64) {
        var changed = width != value
        width = value
        if let trace = session.Profiler {
            if revision != trace.Revision {
                revision = trace.Revision
                changed = true
                if follow {
                    let span = Math.Max(end - start, trace.Frequency * 2L)
                    end = Math.Max(1L, trace.End)
                    start = Math.Max(0L, end - span)
                }
            }
        }
        if changed {
            paths.Clear()
            Rebuild()
        }
    }

    override func Build() Blob {
        let theme = Theme.Read()
        let children = List[Blob]()
        children.Add(Toolbar(theme))
        if fileAction != "" {
            children.Add(FilePanel())
        }
        if fileStatus != "" && !fileStatus.StartsWith("Exported ", StringComparison.Ordinal) {
            children.Add(
                Container{
                    Key: "profiler-file-status",
                    FlexShrink: 0.0,
                    Padding: Edges{Left: Pad, Right: Pad, Top: 4},
                    Banner{Tone: Tone.Danger, Content: fileStatus, Live: true}.Build()
                }
            )
        }
        let problem = Problem()
        if problem != "" {
            children.Add(
                Container{
                    Key: "profiler-problem",
                    FlexShrink: 0.0,
                    Padding: Edges{Left: Pad, Right: Pad, Top: 4},
                    Banner{Tone: Tone.Warning, Content: problem, Live: false}.Build()
                }
            )
        }
        guard let trace = session.Profiler else {
            children.Add(
                Container{
                    Key: "profiler-empty",
                    Height: 0,
                    FlexGrow: 1.0,
                    AlignItems: AlignItems.Center,
                    JustifyContent: JustifyContent.Center,
                    EmptyState{
                        Illustration: MaterialIcons.Create("monitoring", 32.0, theme.FaintTextColor),
                        Title: "No trace"
                    }.Build()
                }
            )
            return Column(children)
        }
        children.Add(Ruler(trace, theme))
        children.Add(FrameChart(trace, theme))
        children.Add(Legend(trace, theme))
        children.Add(Analysis(trace, theme))
        return Column(children)
    }

    private func Toolbar(theme Theme) Container {
        let trace = session.Profiler
        let active = trace?.Active == true
        let idle = !active && !fileBusy
        let controls = List[Blob]()
        let record = ActionButton{
            Content: active ? "Stop": "Record",
            Leading: MaterialIcons.Create(active ? "stop": "fiber_manual_record", 18.0, theme.DangerColor),
            Disabled: fileBusy ||
                session.State != DiagnosticConnectionState.Connected ||
                !session
                .Capabilities
                .ProfilerTrace,
            OnClick: () -> ToggleRecording(active),
        }.Build()
        record.Key = "profiler-record"
        controls.Add(record)
        controls.Add(
            Tool(
                "profiler-allocation-samples",
                "category",
                "Allocation types (10 s)",
                () -> {
                    allocationSamples = !allocationSamples
                },
                true,
                allocationSamples
            )
        )
        controls.Add(Tool("profiler-clear", "delete_sweep", "Clear", () -> ClearTrace(), idle))
        controls.Add(Tool("profiler-import", "file_open", "Import", () -> ShowFile("Import"), idle))
        controls.Add(
            Tool("profiler-export", "save", "Export", () -> ShowFile("Export"), idle && (trace?.Records.Count ?? 0) > 0)
        )
        let windows = WindowOptions()
        if windows.Length > 2 {
            controls.Add(
                Cell.Mount[ComboBoxInput, ComboBox](
                    "profiler-window",
                    ComboBoxInput{
                        Items: windows,
                        SelectedId: filterWindow == "" ? "all": filterWindow,
                        OnSelect: (id string) -> PickWindow(id == "all" ? "": id),
                        Width: 180.0,
                        AccessibilityName: "Window",
                    }
                )
            )
        }
        controls.Add(Tool("profiler-fit", "fit_screen", "Fit", () -> Fit()))
        controls.Add(
            Tool(
                "profiler-zoom-selection",
                "zoom_in_map",
                "Zoom to selection",
                () -> {
                    start = selectionStart
                    end = selectionEnd
                    selectionStart = 0L
                    selectionEnd = 0L
                    Changed()
                },
                selectionEnd > selectionStart
            )
        )
        controls.Add(Tool("profiler-zoom-out", "zoom_out", "Zoom out", () -> Zoom(2.0, 0.5)))
        controls.Add(Tool("profiler-zoom-in", "zoom_in", "Zoom in", () -> Zoom(0.5, 0.5)))
        controls.Add(
            Tool(
                "profiler-follow",
                "last_page",
                "Follow",
                () -> {
                    follow = !follow
                },
                true,
                follow
            )
        )
        if let current = trace {
            controls.Add(
                Text{
                    Key: "profiler-status",
                    Content: Status(current),
                    Width: 0,
                    FlexGrow: 1.0,
                    MinWidth: 0,
                    Margin: Edges{Left: Pad},
                    TextAlign: TextAlign.Right,
                    FontFamily: theme.FontFamily,
                    FontSize: theme.CaptionFontSize,
                    Color: current.Active ? theme.DangerColor: theme.MutedTextColor,
                    TextWrap: TextWrap.NoWrap,
                    TextTrimming: TextTrimming.Ellipsis
                }
            )
        }
        return Container{
            Key: "profiler-toolbar",
            Width: Percent(100),
            Height: theme.ControlHeight + 12.0,
            FlexShrink: 0.0,
            FlexDirection: FlexDirection.Row,
            AlignItems: AlignItems.Center,
            Gap: 4,
            Padding: Edges{Left: Pad, Right: Pad},
            BorderWidth: Edges{Bottom: 1},
            BorderColor: theme.BorderColor,
            OverflowX: Overflow.Hidden,
            Children: controls
        }
    }

    private func Tool(
        key string,
        icon string,
        tip string,
        action Action,
        enabled bool = true,
        active bool = false
    ) Blob {
        let theme = Theme.Read()
        let button = IconButton{
            Icon: MaterialIcons.Create(icon, 18.0, active ? theme.LinkColor: theme.MutedTextColor),
            AccessibilityName: tip,
            Disabled: !enabled,
            Active: active,
            OnClick: () -> {
                action()
                Rebuild()
            },
        }.Build()
        button.Key = key
        guard let window = owner else {
            return button
        }
        return Cell.Mount[TooltipInput, Tooltip](
            key + "-tooltip",
            TooltipInput{Window: window, Text: tip, Placement: PortalPlacement.Bottom, Target: button}
        )
    }

    private func ToggleRecording(active bool) {
        if active {
            session.StopProfiler()
        } else {
            session.StartProfiler(allocationSamples)
            Select(-1)
            selectionStart = 0L
            selectionEnd = 0L
            revision = -1
            follow = true
            paths.Clear()
        }
        Rebuild()
    }

    private func ClearTrace() {
        session.ClearProfiler()
        Select(-1)
        selectionStart = 0L
        selectionEnd = 0L
        tableRows = []DataGridRow{}
        tableKey = ""
        paths.Clear()
    }

    private func WindowOptions()[]ComboBoxOption {
        let options = List[ComboBoxOption]()
        options.Add(ComboBoxOption{Id: "all", Label: "All windows"})
        if let trace = session.Profiler {
            for id in trace.WindowNames.Keys {
                options.Add(ComboBoxOption{Id: id, Label: WindowTitle(id)})
            }
        } else {
            for window in session.Windows {
                options.Add(ComboBoxOption{Id: window.Id, Label: WindowTitle(window.Id)})
            }
        }
        return options.ToArray()
    }

    private func PickWindow(id string) {
        filterWindow = id
        tableKey = ""
        paths.Clear()
        Rebuild()
    }

    private func Problem() string {
        guard let trace = session.Profiler else {
            let unavailable = session.State == DiagnosticConnectionState.Connected &&
                !session
                .Capabilities
                .ProfilerTrace
            return unavailable ? "Recording is not available for this target": ""
        }
        let parts = List[string]()
        if trace.Reason != "" {
            parts.Add(trace.Reason)
        } else if trace.Partial {
            parts.Add("Partial trace")
        }
        if trace.Dropped > 0uL {
            parts.Add(trace.Dropped.ToString() + " dropped")
        }
        return String.Join(" · ", parts)
    }

    private func Status(trace ProfilerTrace) string {
        let name = trace.FileName != "" ? "Imported " + trace.FileName
        : session.Endpoint.ApplicationName == "" ? "Target": session.Endpoint.ApplicationName
        let pid = trace.Process.Split(" / ")[0]
        return trace.State + " · " + trace.Records.Count.ToString() + " records · " + Time(trace, trace.End)
        + " · " + name + (pid == "" ? "": " (pid " + pid + ")")
        + (fileStatus.StartsWith("Exported ", StringComparison.Ordinal) ? " · " + fileStatus: "")
    }

    private func WindowTitle(id string) string {
        if let trace = session.Profiler {
            if trace.WindowNames.ContainsKey(id) {
                return trace.WindowName(id)
            }
        }
        var title = "Window"
        for window in session.Windows {
            if window.Id == id {
                title = window.Title
            }
        }
        var same = 0
        for window in session.Windows {
            if window.Title == title {
                same++
            }
            if window.Id == id {
                break
            }
        }
        return same > 1 ? title + " #" + same.ToString(): title
    }

    private func Ruler(trace ProfilerTrace, theme Theme) Container {
        let ticks = List[Blob]()
        let target = float64(Math.Max(1L, end - start)) / 7.0
        let power = Math.Pow(10.0, Math.Floor(Math.Log10(target)))
        let normalized = target / power
        let step = int64(
            Math.Max(1.0, (normalized <= 1.0 ? 1.0: normalized <= 2.0 ? 2.0: normalized <= 5.0 ? 5.0: 10.0) * power)
        )
        let stepMs = trace.Milliseconds(step)
        let unitScale = stepMs >= 1000.0 ? 0.001: stepMs >= 1.0 ? 1.0: 1000.0
        let unit = stepMs >= 1000.0 ? "s": stepMs >= 1.0 ? "ms": "µs"
        let decimals = Math.Clamp(int32(Math.Ceiling(-Math.Log10(stepMs * unitScale))), 0, 6)
        let baseDecimals = Math.Clamp(int32(Math.Ceiling(-Math.Log10(stepMs / 1000.0))) + 2, 0, 9)
        ticks.Add(
            RulerLabel(
                "ruler-base",
                (trace.Milliseconds(start) / 1000.0).ToString(
                    "F" + baseDecimals.ToString(),
                    CultureInfo.InvariantCulture
                )
                + " s",
                0.0,
                theme
            )
        )
        var tick = start + step
        while tick <= end {
            if X(tick) >= 100.0 && X(tick) < PlotWidth() - 60.0 {
                ticks.Add(
                    RulerLabel(
                        "ruler-" + tick.ToString(),
                        "+" + (trace.Milliseconds(tick - start) * unitScale).ToString(
                            "F" + decimals.ToString(),
                            CultureInfo.InvariantCulture
                        )
                        + " " + unit,
                        X(tick),
                        theme
                    )
                )
            }
            tick += step
        }
        return Container{
            Key: "profiler-ruler",
            Width: PlotWidth(),
            Height: 22,
            FlexShrink: 0.0,
            Margin: Edges{Left: Pad, Top: 4},
            Position: PositionType.Relative,
            Children: ticks,
            OnPointerDown: (e PointerEvent) -> BeginSelection(e),
            OnPointerMove: (e PointerEvent) -> MoveSelection(e),
            OnPointerUp: (e PointerEvent) -> {
                selecting = false
                e.ReleaseCapture()
                Rebuild()
            },
            OnPointerCancel: (e PointerEvent) -> {
                selecting = false
                e.ReleaseCapture()
            },
        }
    }

    private func FrameChart(trace ProfilerTrace, theme Theme) Container {
        let w = PlotWidth()
        if !paths.ContainsKey("other") {
            DrawFrames(trace, w)
        }
        let shapes = List[Blob]()
        let selection = PathBuilder(0.0, 0.0, w, Span)
        if selectionEnd > selectionStart && selectionEnd > start && selectionStart < end {
            let left = Math.Max(0.0, X(selectionStart))
            Rect(selection, left, 0.0, Math.Max(1.0, Math.Min(w, X(selectionEnd)) - left), Span)
        }
        shapes.Add(PathShape(selection.Build(), theme.AccentColor.WithAlpha(0.18)))
        shapes.Add(PathShape(Highlight(selectedFrame, w), theme.AccentColor.WithAlpha(0.35)))
        shapes.Add(PathShape(Highlight(hovered, w), theme.HoverColor))
        for phase in 0 ... trace.FramePhases.Count {
            shapes.Add(PathShape(paths["phase" + phase.ToString()], PhaseColor(theme, phase)))
        }
        shapes.Add(PathShape(paths["other"], theme.FaintTextColor))
        shapes.Add(PathShape(paths["clipped"], theme.TextColor))
        shapes.Add(PathShape(paths["markers"], theme.InfoColor))
        shapes.Add(
            Text{
                Key: "profiler-frame-scale",
                Content: Time(trace, int64(scale)),
                Position: PositionType.Absolute,
                Left: 6,
                Top: 4,
                FontFamily: theme.MonoFontFamily,
                FontSize: theme.CaptionFontSize,
                Color: theme.MutedTextColor,
            }
        )
        if hovered >= 0 && hovered < trace.Frames.Count && !selecting {
            shapes.Add(
                Container{
                    Key: "profiler-frame-tooltip",
                    Position: PositionType.Absolute,
                    Left: hoverX + 248.0 < w ? hoverX + 14.0: Math.Max(0.0, hoverX - 248.0),
                    Top: 8,
                    Width: 234,
                    Padding: 8,
                    Gap: 2,
                    BackgroundColor: theme.OverlayColor,
                    BorderWidth: 1,
                    BorderColor: theme.BorderColor,
                    BorderRadius: theme.RadiusMd,
                    BoxShadow: theme.ElevationMd,
                    HitTestSelf: false,
                    Children: Breakdown(trace, trace.Frames[hovered], theme, 8)
                }
            )
        }
        return Container{
            Key: "profiler-frames",
            Width: w,
            Height: 0,
            MinHeight: 80,
            FlexGrow: 1.0,
            Margin: Edges{Left: Pad},
            Position: PositionType.Relative,
            ZIndex: 1,
            BackgroundColor: theme.SunkenColor,
            BorderRadius: theme.RadiusSm,
            Focusable: true,
            Focus: Style{OutlineWidth: 1, OutlineColor: theme.FocusColor},
            Accessibility: Accessibility{Role: AccessibilityRole.Group, Name: "Frames"},
            OnWheel: (e WheelEvent) -> {
                if e.Modifiers.Ctrl {
                    e.PreventDefault()
                    Zoom(e.Delta.Y > 0.0 ? 0.8: 1.25, Math.Clamp(e.Position.X / w, 0.0, 1.0))
                } else if e.Modifiers.Shift {
                    e.PreventDefault()
                    Pan(e.Delta.Y > 0.0 ? -0.1: 0.1)
                }
            },
            OnPointerDown: (e PointerEvent) -> {
                pressX = e.Position.X
                BeginSelection(e)
            },
            OnPointerMove: (e PointerEvent) -> {
                if selecting {
                    if Math.Abs(e.Position.X - pressX) > 3.0 {
                        MoveSelection(e)
                    }
                    return
                }
                let frame = FrameAt(e.Position.X)
                hoverX = e.Position.X
                if frame != hovered {
                    hovered = frame
                    Rebuild()
                }
            },
            OnPointerLeave: (e PointerEvent) -> {
                if hovered >= 0 {
                    hovered = -1
                    Rebuild()
                }
            },
            OnPointerUp: (e PointerEvent) -> {
                if !selecting {
                    return
                }
                selecting = false
                e.ReleaseCapture()
                if Math.Abs(e.Position.X - pressX) <= 3.0 {
                    let frame = FrameAt(e.Position.X)
                    if frame >= 0 {
                        SelectFrame(trace, frame)
                    } else {
                        selectionStart = 0L
                        selectionEnd = 0L
                    }
                }
                tableKey = ""
                Rebuild()
            },
            OnPointerCancel: (e PointerEvent) -> {
                selecting = false
                e.ReleaseCapture()
            },
            OnKeyDown: (e KeyEvent) -> Keys(e),
            Children: shapes,
        }
    }

    private func DrawFrames(trace ProfilerTrace, w float64) {
        let count = Math.Max(1, int32(Math.Ceiling(w)))
        let best = [count]int32
        let longest = [count]int64
        Array.Fill(best, -1)
        let durations = List[int64]()
        for index in trace.FirstFrame(start) ... trace.Frames.Count {
            let r = trace.Records[trace.Frames[index].Record]
            if r.Ticks > end {
                break
            }
            if filterWindow != "" && r.Window != filterWindow {
                continue
            }
            let duration = r.EndTicks - r.Ticks
            durations.Add(duration)
            let left = Math.Clamp(int32(X(r.Ticks)), 0, count - 1)
            let right = Math.Clamp(int32(X(r.EndTicks)), left, count - 1)
            for column in left ... right + 1 {
                if best[column] < 0 || duration > longest[column] {
                    best[column] = index
                    longest[column] = duration
                }
            }
        }
        durations.Sort()
        scale = durations.Count == 0 ? 1.0: Math.Max(
            1.0,
            Math.Min(
                float64(durations[durations.Count - 1]),
                2.0 * float64(durations[int32(float64(durations.Count - 1) * 0.95)])
            )
        )
        let builders = List[PathBuilder]()
        for phase in 0 ... trace.FramePhases.Count {
            builders.Add(PathBuilder(0.0, 0.0, w, Span))
        }
        let other = PathBuilder(0.0, 0.0, w, Span)
        let clipped = PathBuilder(0.0, 0.0, w, Span)
        var column = 0
        while column < count {
            let index = best[column]
            var next = column + 1
            while next < count && best[next] == index {
                next++
            }
            if index >= 0 {
                let frame = trace.Frames[index]
                let r = trace.Records[frame.Record]
                let x = float64(column)
                let barWidth = next - column >= 4 ? float64(next - column - 1): float64(next - column)
                var bottom = Span
                for k in 0 ... frame.Phases.Length {
                    bottom = Stack(builders[frame.Phases[k]], x, barWidth, bottom, frame.Ticks[k])
                }
                Stack(other, x, barWidth, bottom, frame.Other)
                if float64(r.EndTicks - r.Ticks) > scale {
                    Rect(clipped, x, 0.0, barWidth, 12.0)
                }
            }
            column = next
        }
        let markers = PathBuilder(0.0, 0.0, w, Span)
        for lane in trace.Lanes {
            if lane.Group != "Markers" {
                continue
            }
            for index in lane.Records {
                let tick = trace.Records[index].Ticks
                if tick >= start && tick <= end {
                    Rect(markers, Math.Min(w - 2.0, X(tick)), 0.0, 2.0, 60.0)
                }
            }
        }
        for phase in 0 ... builders.Count {
            paths["phase" + phase.ToString()] = builders[phase].Build()
        }
        paths["other"] = other.Build()
        paths["clipped"] = clipped.Build()
        paths["markers"] = markers.Build()
        columns = best
    }

    private func Stack(path PathBuilder, x float64, barWidth float64, bottom float64, ticks int64) float64 {
        let top = Math.Max(0.0, bottom - float64(ticks) / scale * Span)
        if bottom > top {
            Rect(path, x, top, barWidth, bottom - top)
        }
        return top
    }

    private func Highlight(frame int32, w float64) VectorPath {
        let path = PathBuilder(0.0, 0.0, w, Span)
        if frame >= 0 {
            var first = -1
            var last = -1
            for column in 0 ... columns.Length {
                if columns[column] == frame {
                    first = first < 0 ? column: first
                    last = column
                }
            }
            if first >= 0 {
                Rect(path, Math.Max(0.0, float64(first) - 1.0), 0.0, float64(last - first) + 3.0, Span)
            }
        }
        return path.Build()
    }

    private func FrameAt(x float64) int32 {
        let column = int32(x)
        for distance in 0 ... 7 {
            for candidate in[]int32{column - distance, column + distance} {
                if candidate >= 0 && candidate < columns.Length && columns[candidate] >= 0 {
                    return columns[candidate]
                }
            }
        }
        return -1
    }

    private func Legend(trace ProfilerTrace, theme Theme) Container {
        let items = List[Blob]()
        for phase in 0 ... trace.FramePhases.Count {
            items.Add(LegendItem(LaneTitle(trace.FramePhases[phase]), PhaseColor(theme, phase), theme))
        }
        if trace.Frames.Count > 0 {
            items.Add(LegendItem("Other", theme.FaintTextColor, theme))
        }
        return Container{
            Key: "profiler-legend",
            Width: Percent(100),
            FlexShrink: 0.0,
            FlexDirection: FlexDirection.Row,
            FlexWrap: FlexWrap.Wrap,
            ColumnGap: 12,
            RowGap: 2,
            Padding: Edges{Left: Pad, Right: Pad, Top: 6, Bottom: 6},
            Children: items
        }
    }

    private func LegendItem(name string, color Color, theme Theme) Container -> Container{
        Key: "legend-" + name,
        FlexDirection: FlexDirection.Row,
        AlignItems: AlignItems.Center,
        Gap: 5,
        Swatch(color),
        Caption("label", name, theme.MutedTextColor)
    }

    private func Breakdown(trace ProfilerTrace, frame ProfilerFrame, theme Theme, limit int32) List[Blob] {
        let r = trace.Records[frame.Record]
        let rows = List[Blob]()
        rows.Add(Segment("Frame", r.EndTicks - r.Ticks, nil, theme, trace))
        let order = List[int32]()
        for k in 0 ... frame.Phases.Length + 1 {
            order.Add(k)
        }
        let ticks = (k int32) -> k < frame.Phases.Length ? frame.Ticks[k]: frame.Other
        order.Sort((a int32, b int32) -> ticks(b).CompareTo(ticks(a)))
        for k in order.GetRange(0, Math.Min(limit, order.Count)) {
            if k == frame.Phases.Length {
                rows.Add(Segment("Other", frame.Other, theme.FaintTextColor, theme, trace))
            } else {
                let phase = frame.Phases[k]
                rows.Add(
                    Segment(LaneTitle(trace.FramePhases[phase]), frame.Ticks[k], PhaseColor(theme, phase), theme, trace)
                )
            }
        }
        if frame.Wait > 0L {
            rows.Add(Segment("Wait", frame.Wait, Color.Transparent, theme, trace))
        }
        return rows
    }

    private func Segment(name string, ticks int64, color Color?, theme Theme, trace ProfilerTrace) Container {
        let children = List[Blob]()
        if let swatch = color {
            children.Add(Swatch(swatch))
        }
        children.Add(
            Text{
                Content: name,
                Width: 0,
                FlexGrow: 1.0,
                MinWidth: 0,
                FontFamily: theme.FontFamily,
                FontSize: theme.CaptionFontSize,
                FontWeight: color == nil ? 600: 400,
                Color: color == nil ? theme.TextColor: theme.MutedTextColor,
                TextWrap: TextWrap.NoWrap,
                TextTrimming: TextTrimming.Ellipsis
            }
        )
        children.Add(
            Text{
                Content: Time(trace, ticks),
                FontFamily: theme.MonoFontFamily,
                FontSize: theme.CaptionFontSize,
                Color: theme.TextColor,
                TextWrap: TextWrap.NoWrap
            }
        )
        return Container{
            Key: "segment-" + name,
            Height: 20,
            FlexShrink: 0.0,
            FlexDirection: FlexDirection.Row,
            AlignItems: AlignItems.Center,
            Gap: 6,
            Children: children
        }
    }

    private func Analysis(trace ProfilerTrace, theme Theme) Container {
        PrepareTable(trace)
        let panes = List[Blob]()
        panes.Add(
            Container{
                Key: "profiler-summary",
                Width: 0,
                FlexGrow: 1.0,
                MinWidth: 0,
                Height: Percent(100),
                FlexDirection: FlexDirection.Column,
                Cell.Mount[TabBarInput, TabBar](
                    "profiler-tabs",
                    TabBarInput{
                        Items: []NavigationItem{
                            NavigationItem{Id: "profiler-tab-Phases", Label: "Phases"},
                            NavigationItem{Id: "profiler-tab-Memory", Label: "Memory"},
                            NavigationItem{Id: "profiler-tab-Types", Label: "Types"},
                            NavigationItem{Id: "profiler-tab-Resources", Label: "Resources"},
                        },
                        SelectedId: "profiler-tab-" + tab,
                        OnSelect: (id string) -> {
                            tab = id.Substring("profiler-tab-".Length)
                            sortColumn = tab == "Phases" ? 2: tab == "Types" ? 1: tab == "Memory" ? 0: 4
                            descending = tab != "Memory"
                            tableKey = ""
                            Rebuild()
                        },
                        AccessibilityName: "Summary",
                    }
                ),
                Cell.Mount[DataGridInput, DataGrid](
                    "profiler-table",
                    DataGridInput{
                        Columns: tableColumns,
                        Rows: tableRows,
                        SortColumnId: "c" + sortColumn.ToString(),
                        SortDirection: descending ? DataGridSort.Descending: DataGridSort.Ascending,
                        OnSort: (id string, direction DataGridSort) -> {
                            let column = Int32.Parse(id.Substring(1), CultureInfo.InvariantCulture)
                            descending = column == sortColumn ? !descending: direction != DataGridSort.Ascending
                            sortColumn = column
                            tableKey = ""
                            Rebuild()
                        },
                        Selection: DataGridSelection.Single,
                        SelectedIds: selectedIds,
                        OnSelectionChange: (ids[]string) -> {
                            if ids.Length == 1 && ids[0].StartsWith("profiler-event-", StringComparison.Ordinal) {
                                if let current = session.Profiler {
                                    SelectRecord(
                                        current,
                                        Int32.Parse(
                                            ids[0].Substring("profiler-event-".Length),
                                            CultureInfo.InvariantCulture
                                        )
                                    )
                                }
                            }
                        },
                        FitColumnsToViewport: true,
                        Density: DataGridDensity.Compact,
                        Height: Length.Auto,
                        AccessibilityName: tab,
                        CreateRoot: (input DataGridInput, root Container) -> {
                            root.FlexGrow = 1
                            root.FlexBasis = 0
                            return root
                        },
                    }
                ),
            }
        )
        if selected >= 0 && selected < trace.Records.Count {
            panes.Add(DetailsDivider(theme))
            panes.Add(
                Container{
                    Key: "profiler-details",
                    Width: DetailsWidth(),
                    Height: Percent(100),
                    FlexShrink: 0.0,
                    OverflowY: Overflow.Scroll,
                    FlexDirection: FlexDirection.Column,
                    ScrollbarVisibility: ScrollbarVisibility.Auto,
                    Padding: Edges{Left: Pad, Right: Pad, Top: 4},
                    Children: Details(trace, theme)
                }
            )
        }
        return Container{
            Key: "profiler-analysis",
            Width: Percent(100),
            Height: 0,
            MinHeight: 180,
            FlexGrow: 1.0,
            FlexDirection: FlexDirection.Row,
            BorderWidth: Edges{Top: 1},
            BorderColor: theme.BorderColor,
            Children: panes
        }
    }

    private func DetailsWidth() float64 -> Math.Clamp(detailsWidth, 260.0, Math.Max(260.0, width - 520.0))

    private func DetailsDivider(theme Theme) Container -> Container{
        Key: "profiler-details-divider",
        Width: 6,
        Height: Percent(100),
        FlexShrink: 0.0,
        Focusable: true,
        Focus: Style{OutlineWidth: 1, OutlineColor: theme.FocusColor},
        Cursor: Cursor.ResizeHorizontal,
        BackgroundColor: resizing ? theme.AccentColor: theme.PanelColor,
        Hover: Style{BackgroundColor: theme.StrongBorderColor},
        BorderWidth: Edges{Left: 1},
        BorderColor: theme.BorderColor,
        Accessibility: Accessibility{Role: AccessibilityRole.Group, Name: "Resize details"},
        OnPointerDown: (e PointerEvent) -> {
            if e.Button != PointerButton.Primary || resizing {
                return
            }
            e.Capture()
            e.PreventDefault()
            resizing = true
            resizePointer = e.PointerId
            resizeStartX = e.WindowPosition.X
            resizeStartWidth = DetailsWidth()
        },
        OnPointerMove: (e PointerEvent) -> {
            if resizing && e.PointerId == resizePointer {
                detailsWidth = resizeStartWidth + resizeStartX - e.WindowPosition.X
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
                detailsWidth = DetailsWidth() + (e.Key == Key.Left ? 16.0: -16.0)
                e.PreventDefault()
                Rebuild()
            }
        },
    }

    private func PrepareTable(trace ProfilerTrace) {
        let lo = selectionEnd > selectionStart ? selectionStart: start
        let hi = selectionEnd > selectionStart ? selectionEnd: end
        let key = trace.Id + ":" + trace.Revision.ToString() + ":" + lo.ToString() + ":" + hi.ToString()
        + ":" + filterWindow + ":" + tab + ":" + sortColumn.ToString() + descending.ToString()
        if tableKey == key {
            return
        }
        tableKey = key
        let rows = List[ProfilerTableRow]()
        let names = tab == "Phases" ? []string{"Name", "Count", "Total", "p50", "p99", "Max", "Alloc"}
        : tab == "Memory" ? []string{"Counter", "Start", "End", "Change", "Peak"}
        : tab == "Types" ? []string{"Type", "Samples", "Sampled bytes", "Status"}
        : []string{"Start", "Duration", "Kind", "Name", "Bytes", "Owner", "Result"}
        if tab == "Phases" {
            let groups = Dictionary[string, List[int64]]()
            let allocations = Dictionary[string, List[int64]]()
            for index in 0 ... trace.Records.Count {
                let r = trace.Records[index]
                let gpu = r.GpuNs != nil
                if gpu ? r.Ticks < lo ||
                    r.Ticks >= hi: r.Kind != "duration" ||
                    r.Resource != nil ||
                    r.EndTicks <= lo ||
                    r.Ticks >= hi {
                    continue
                }
                if filterWindow != "" && r.Window != "" && r.Window != filterWindow {
                    continue
                }
                var name = gpu ? "GPU " + ProfilerTrace.GpuStage(r.Event): LaneTitle(trace.EventName(r))
                if filterWindow == "" && trace.WindowNames.Count > 1 && r.Window != "" {
                    name = WindowTitle(r.Window) + " / " + name
                }
                if !groups.TryGetValue(name, out var list) {
                    list = List[int64]()
                    groups.Add(name, list)
                    allocations.Add(name, List[int64]())
                }
                if gpu {
                    list.Add(int64(float64(r.GpuNs ?? 0uL) * float64(trace.Frequency) / 1000000000.0))
                    continue
                }
                let complete = r.Ticks >= lo && r.EndTicks <= hi
                list.Add(complete ? r.EndTicks - r.Ticks: -(Math.Min(hi, r.EndTicks) - Math.Max(lo, r.Ticks)) - 1L)
                allocations[name].Add(complete && r.Allocated != nil ? int64(r.Allocated ?? 0uL): -1L)
            }
            var reconcile int64 = 0L
            var buildStyle int64 = 0L
            for pair in groups {
                var total int64 = 0L
                var maximum int64 = 0L
                let durations = List[int64](pair.Value.Count)
                for value in pair.Value {
                    let duration = value < 0L ? -value - 1L: value
                    total += duration
                    maximum = Math.Max(maximum, duration)
                    if value >= 0L {
                        durations.Add(duration)
                    }
                }
                var allocation int64 = 0L
                var measured = 0
                for value in allocations[pair.Key] {
                    if value >= 0L {
                        allocation += value
                        measured++
                    }
                }
                if pair.Key == "Reconcile" {
                    reconcile += total
                }
                if pair.Key == "Build" || pair.Key == "StyleResolve" {
                    buildStyle += total
                }
                let count = pair.Value.Count
                let gpu = pair.Key.StartsWith("GPU ", StringComparison.Ordinal)
                durations.Sort()
                let p50 = durations.Count == 0 ? -1L: durations[(durations.Count - 1) / 2]
                let p99 = durations.Count == 0 ? -1L: durations[
                    int32(Math.Ceiling(float64(durations.Count) * 0.99)) - 1
                ]
                rows.Add(
                    ProfilerTableRow(
                        []string{
                            pair.Key,
                            count.ToString(),
                            Time(trace, total),
                            p50 < 0L ? "partial": Time(trace, p50),
                            p99 < 0L ? "partial": Time(trace, p99),
                            Time(trace, maximum),
                            gpu ? "": (measured == 0 ? "—": Bytes(float64(allocation)))
                            + (measured < count ? " *": "")
                        },
                        []float64{
                            0.0,
                            float64(count),
                            float64(total),
                            float64(p50),
                            float64(p99),
                            float64(maximum),
                            measured == 0 ? -1.0: float64(allocation)
                        },
                        "summary-row-" + pair.Key
                    )
                )
            }
            if reconcile > 0L {
                let diff = Math.Max(0L, reconcile - buildStyle)
                rows.Add(
                    ProfilerTableRow(
                        []string{"Diff (derived)", "", Time(trace, diff), "", "", "", ""},
                        []float64{0.0, 0.0, float64(diff), 0.0, 0.0, 0.0, -1.0},
                        "summary-row-Diff (derived)"
                    )
                )
            }
        } else if tab == "Types" {
            for index in 0 ... trace.Records.Count {
                let r = trace.Records[index]
                if r.Name == "allocation.samples" && r.Validity == "unavailable" {
                    rows.Add(
                        ProfilerTableRow(
                            []string{r.Source, "", "", "Unavailable"},
                            []float64{0.0, 0.0, 0.0, 0.0},
                            "profiler-event-" + index.ToString()
                        )
                    )
                }
                if r.Source != "GCAllocationTick_V4 samples" {
                    continue
                }
                rows.Add(
                    ProfilerTableRow(
                        []string{r.Name, (r.Value ?? 0uL).ToString(), Bytes(float64(r.Value1 ?? 0uL)), "Sampled"},
                        []float64{0.0, float64(r.Value ?? 0uL), float64(r.Value1 ?? 0uL), 0.0},
                        "profiler-event-" + index.ToString()
                    )
                )
            }
        } else if tab == "Memory" {
            for lane in trace.Lanes {
                if lane.Group != "Memory" {
                    continue
                }
                var initial float64? = nil
                var final float64? = nil
                var peak float64? = nil
                var unit = ""
                for offset in 0 ... lane.Records.Count {
                    let r = trace.Records[lane.Records[offset]]
                    if r.Ticks > hi {
                        break
                    }
                    unit = lane.Name.StartsWith("managed.allocated", StringComparison.Ordinal) ? "bytes/s": r.Unit
                    let value = SeriesValue(trace, lane, offset)
                    if r.Ticks <= lo || initial == nil {
                        initial = value
                    }
                    final = value
                    if r.Ticks >= lo {
                        if let sample = value {
                            peak = Math.Max(peak ?? sample, sample)
                        }
                    }
                }
                peak = peak ?? initial
                var delta float64? = nil
                if let a = initial {
                    if let z = final {
                        delta = z - a
                    }
                }
                rows.Add(
                    ProfilerTableRow(
                        []string{
                            LaneTitle(lane.Name),
                            OptionalValue(initial, unit),
                            OptionalValue(final, unit),
                            delta == nil ? "—": SignedValue(delta ?? 0.0, unit),
                            OptionalValue(peak, unit)
                        },
                        []float64{0.0, initial ?? -1.0, final ?? -1.0, delta ?? -1.0, peak ?? -1.0},
                        "summary-row-" + LaneTitle(lane.Name)
                    )
                )
            }
        } else {
            for index in 0 ... trace.Records.Count {
                let r = trace.Records[index]
                if r.Resource == nil || r.Ticks < lo || r.Ticks > hi {
                    continue
                }
                let kind = trace.ResourceName(r.ResourceKind)
                let bytes = r.Payload ?? r.Requirement
                let id = r.Resource ?? 0uL
                var duration = r.EndTicks - r.Ticks
                var durationText = Time(trace, duration)
                if r.Kind != "duration" {
                    if trace.ResourceRetired.TryGetValue(id, out var retired) || trace.ResourceReleased.TryGetValue(
                        id,
                        out retired
                    ) {
                        let created = trace.ResourceCreated.TryGetValue(id, out var ticks) ? ticks: 0L
                        duration = Math.Max(0L, retired - created)
                        durationText = (trace.ResourceCreated.ContainsKey(id) ? "": "≥ ") + Time(trace, duration)
                    } else {
                        duration = Math.Max(0L, trace.End - r.Ticks)
                        durationText = "live"
                    }
                }
                var name = trace.EventName(r)
                if name == kind {
                    if let w = r.Width {
                        if let h = r.Height {
                            name = w.ToString() + "×" + h.ToString() + " " + kind.ToLowerInvariant()
                        }
                    } else if let size = bytes {
                        name = Bytes(float64(size)) + " " + kind.ToLowerInvariant()
                    }
                }
                rows.Add(
                    ProfilerTableRow(
                        []string{
                            Time(trace, r.Ticks),
                            durationText,
                            kind,
                            name,
                            bytes == nil ? "—": Bytes(float64(bytes ?? 0uL)),
                            trace.OwnerChain(r),
                            Result(r)
                        },
                        []float64{
                            float64(r.Ticks),
                            float64(duration),
                            0.0,
                            0.0,
                            bytes == nil ? -1.0: float64(bytes ?? 0uL),
                            0.0,
                            float64(r.Result)
                        },
                        "profiler-event-" + index.ToString()
                    )
                )
            }
        }
        let numeric = tab == "Resources" ? sortColumn == 0 || sortColumn == 1 || sortColumn == 4 || sortColumn == 6
        : sortColumn != 0 && !(tab == "Types" && sortColumn == 3)
        rows.Sort(
            (a ProfilerTableRow, b ProfilerTableRow) -> {
                let order = numeric ? a.Values[sortColumn].CompareTo(b.Values[sortColumn]): String.Compare(
                    a.Cells[sortColumn],
                    b.Cells[sortColumn],
                    StringComparison.Ordinal
                )
                return descending ? -order: order
            }
        )
        let gridRows = [rows.Count]DataGridRow
        for row in 0 ... rows.Count {
            let values = Dictionary[string, string]()
            for column in 0 ... names.Length {
                values.Add("c" + column.ToString(), rows[row].Cells[column])
            }
            gridRows[row] = DataGridRow{Id: rows[row].Id, Label: rows[row].Cells[0], Values: values}
        }
        tableRows = gridRows
        let gridColumns = [names.Length]DataGridColumn
        for column in 0 ... names.Length {
            let text = tab == "Resources" ? column == 3 || column == 5: column == 0
            let number = tab == "Resources" ? column == 0 ||
                column == 1 ||
                column == 4: column != 0 &&
                !(tab == "Types" && column == 3)
            var definition = DataGridColumn{
                Id: "c" + column.ToString(),
                Label: names[column],
                Minimum: text ? 120.0: 56.0,
                Sortable: true,
                Alignment: number ? TextAlign.Right: TextAlign.Left,
            }
            if text {
                definition.Flex = 1.0
            } else {
                definition.Width = number ? 96.0: 110.0
            }
            gridColumns[column] = definition
        }
        tableColumns = gridColumns
    }

    private func Details(trace ProfilerTrace, theme Theme) List[Blob] {
        let r = trace.Records[selected]
        let rows = List[Blob]()
        if selectedFrame >= 0 && selectedFrame < trace.Frames.Count && trace.Frames[selectedFrame].Record == selected {
            rows.AddRange(Breakdown(trace, trace.Frames[selectedFrame], theme, Int32.MaxValue))
            if trace.PumpGpu.TryGetValue(r.Window + ":" + r.Pump.ToString(), out var gpu) {
                for index in gpu {
                    let sample = trace.Records[index]
                    let ticks = int64(float64(sample.GpuNs ?? 0uL) * float64(trace.Frequency) / 1000000000.0)
                    rows.Add(
                        Segment("GPU " + ProfilerTrace.GpuStage(sample.Event), ticks, Color.Transparent, theme, trace)
                    )
                }
            }
        } else {
            rows.Add(
                Text{
                    Content: LaneTitle(trace.EventName(r)),
                    FontFamily: theme.FontFamily,
                    FontSize: theme.FontSize,
                    FontWeight: 600,
                    Color: theme.TextColor,
                    Padding: Edges{Top: 4, Bottom: 4}
                }
            )
            rows.Add(
                Detail(
                    "Duration",
                    r.GpuNs != nil ? TimeNs(float64(r.GpuNs ?? 0uL)): Time(trace, r.EndTicks - r.Ticks),
                    theme
                )
            )
        }
        rows.Add(
            Detail(
                "Start",
                (trace.Milliseconds(r.Ticks) / 1000.0).ToString("F4", CultureInfo.InvariantCulture) + " s",
                theme
            )
        )
        if let pause = r.GcPauseTicks {
            rows.Add(
                Detail(
                    "GC pause",
                    (float64(pause) / 10000.0).ToString("F3", CultureInfo.InvariantCulture) + " ms",
                    theme
                )
            )
        }
        if r.Window != "" {
            rows.Add(Detail("Window", WindowTitle(r.Window), theme))
        }
        if let pump = r.Pump {
            rows.Add(Detail("Pump", pump.ToString(), theme))
        }
        if let frame = r.Frame {
            rows.Add(Detail("Frame", frame.ToString(), theme))
        }
        if let submission = r.Submission {
            rows.Add(Detail("Submission", submission.ToString(), theme))
        }
        rows.Add(Detail("Result", Result(r), theme))
        if r.Resource != nil {
            rows.Add(Detail("Kind", trace.ResourceName(r.ResourceKind), theme))
            let owner = trace.OwnerChain(r)
            if owner != "" {
                rows.Add(Detail("Owner", owner, theme))
            }
            rows.Add(
                Detail("Resource", r.Resource.ToString() + " · generation " + r.ResourceGeneration.ToString(), theme)
            )
            if r.Width != nil && r.Height != nil {
                rows.Add(Detail("Dimensions", r.Width.ToString() + " × " + r.Height.ToString(), theme))
            }
            if r.Payload != nil {
                rows.Add(Detail("Payload", Bytes(float64(r.Payload ?? 0uL)), theme))
            }
            if r.Requirement != nil {
                rows.Add(Detail("Requirement", Bytes(float64(r.Requirement ?? 0uL)), theme))
            }
            if r.Placement != nil {
                rows.Add(Detail("Placement", Bytes(float64(r.Placement ?? 0uL)), theme))
            }
            if r.Block != nil {
                rows.Add(Detail("Block", Bytes(float64(r.Block ?? 0uL)), theme))
            }
            if let flags = r.HeapFlags {
                rows.Add(Detail("Heap", (flags & 1uL) != 0uL ? "Device-local": "Host-visible", theme))
            }
            if let dedicated = r.Dedicated {
                rows.Add(Detail("Dedicated", dedicated ? "Yes": "No", theme))
            }
            if trace.ResourceRetired.TryGetValue(r.Resource ?? 0uL, out var retired) {
                rows.Add(Detail("Retired", Time(trace, retired), theme))
            }
            if trace.ResourceReleased.TryGetValue(r.Resource ?? 0uL, out var released) {
                rows.Add(Detail("Released", Time(trace, released), theme))
            }
        }
        if r.Kind == "counter" {
            if let value = r.FloatingValue {
                rows.Add(Detail("Value", Value(value, r.Unit), theme))
            } else if let value = r.Value {
                rows.Add(Detail("Value", Value(float64(value), r.Unit), theme))
            }
            if r.Source != "" {
                rows.Add(Detail("Source", r.Source, theme))
            }
            if let sampled = r.SampleTicks {
                rows.Add(Detail("Sample age", Time(trace, Math.Max(0L, r.Ticks - sampled)), theme))
            }
        }
        if r.Chrome != "" {
            rows.Add(Detail("Chrome event", r.Chrome, theme))
        }
        if r.Allocated != nil {
            rows.Add(Detail("Allocated", Bytes(float64(r.Allocated ?? 0uL)), theme))
        }
        if r.X != nil && r.Y != nil {
            rows.Add(Detail("Damage origin", r.X.ToString() + ", " + r.Y.ToString(), theme))
        }
        if let scene = r.Scene {
            rows.Add(Detail("Scene", scene.ToString(), theme))
        }
        return rows
    }

    private func SeriesValue(trace ProfilerTrace, lane ProfilerLane, offset int32) float64? {
        let r = trace.Records[lane.Records[offset]]
        if let value = r.FloatingValue {
            return value
        }
        guard let value = r.Value else {
            return nil
        }
        if lane.Name.StartsWith("managed.allocated.total", StringComparison.Ordinal) {
            if offset == 0 {
                return nil
            }
            let previous = trace.Records[lane.Records[offset - 1]]
            guard let before = previous.Value else {
                return nil
            }
            if r.Ticks <= previous.Ticks || value < before {
                return nil
            }
            return float64(value - before) * float64(trace.Frequency) / float64(r.Ticks - previous.Ticks)
        }
        return float64(value)
    }

    private func Select(index int32) {
        selected = index
        selectedFrame = -1
        selectedIds = index >= 0 ? []string{"profiler-event-" + index.ToString()}: []string{}
    }

    private func SelectFrame(trace ProfilerTrace, frame int32) {
        Select(trace.Frames[frame].Record)
        selectedFrame = frame
        let r = trace.Records[selected]
        selectionStart = r.Ticks
        selectionEnd = Math.Max(r.Ticks + 1L, r.EndTicks)
    }

    private func SelectRecord(trace ProfilerTrace, index int32) {
        Select(index)
        let r = trace.Records[index]
        selectionStart = r.Ticks
        selectionEnd = Math.Max(r.Ticks + 1L, r.EndTicks)
        let padding = Math.Max(trace.Frequency / 1000L, (selectionEnd - selectionStart) / 4L)
        start = Math.Max(0L, selectionStart - padding)
        end = selectionEnd + padding
        Changed()
    }

    private func BeginSelection(e PointerEvent) {
        if e.Button != PointerButton.Primary {
            return
        }
        e.Capture()
        selecting = true
        anchor = Tick(e.Position.X)
    }

    private func MoveSelection(e PointerEvent) {
        if selecting {
            let tick = Tick(e.Position.X)
            Select(-1)
            selectionStart = Math.Min(anchor, tick)
            selectionEnd = Math.Max(anchor, tick)
            Rebuild()
        }
    }

    private func Keys(e KeyEvent) {
        if e.Key == Key.Equal || e.Key == Key.KeypadAdd {
            Zoom(0.5, 0.5)
            e.PreventDefault()
        }
        if e.Key == Key.Minus || e.Key == Key.KeypadSubtract {
            Zoom(2.0, 0.5)
            e.PreventDefault()
        }
        if e.Key == Key.Left || e.Key == Key.Right {
            Pan(e.Key == Key.Left ? -0.1: 0.1)
            e.PreventDefault()
        }
        if e.Key == Key.Escape {
            Select(-1)
            selectionStart = 0L
            selectionEnd = 0L
            tableKey = ""
            Rebuild()
            e.PreventDefault()
        }
    }

    private func Fit() {
        if let trace = session.Profiler {
            start = 0L
            end = Math.Max(1L, trace.End)
            Changed()
        }
    }

    private func Pan(amount float64) {
        let span = end - start
        start = Math.Max(0L, start + int64(float64(span) * amount))
        end = start + span
        Changed()
    }

    private func Zoom(factor float64, fraction float64) {
        let span = Math.Max(1L, int64(float64(end - start) * factor))
        let center = start + int64(float64(end - start) * fraction)
        start = Math.Max(0L, center - int64(float64(span) * fraction))
        end = start + span
        Changed()
    }

    private func Changed() {
        follow = false
        hovered = -1
        paths.Clear()
        tableKey = ""
        Rebuild()
    }

    private func PlotWidth() float64 -> Math.Max(100.0, width - 2.0 * Pad)

    private func X(tick int64) float64 -> float64(tick - start) / float64(Math.Max(1L, end - start)) * PlotWidth()

    private func Tick(x float64) int64 -> start + int64(Math.Clamp(x / PlotWidth(), 0.0, 1.0) * float64(end - start))

    shared {
        private func LaneTitle(name string) string {
            let slash = name.IndexOf(" /", StringComparison.Ordinal)
            let counter = slash < 0 ? name: name.Substring(0, slash)
            var suffix = slash < 0 ? "": name.Substring(slash)
            let device = suffix.IndexOf(" / device ", StringComparison.Ordinal)
            if device >= 0 {
                let heap = suffix.IndexOf(" / heap ", StringComparison.Ordinal)
                suffix = suffix.Substring(0, device) + (heap >= 0 ? suffix.Substring(heap): "")
            }
            suffix = suffix.Replace(" / heap ", " · heap ")
            let title = counter == "vkQueueSubmit2" ? "Queue submit call"
            : counter == "vkQueuePresentKHR" ? "Queue present call"
            : counter == "submit.enqueue" ? "Submit enqueue"
            : counter == "submit.completion-observed" ? "Submit completion"
            : counter == "submit.prepare-to-observed" ? "Submit prepare to completion"
            : counter == "present.enqueue" ? "Present enqueue"
            : counter == "present.completion-observed" ? "Present completion"
            : counter == "present.prepare-to-observed" ? "Present prepare to completion"
            : counter == "cpu.instrumented" ? "Instrumented CPU"
            : counter == "command.record" ? "Command recording"
            : counter == "upload.prepare" ? "Upload preparation"
            : counter == "graphics.completion-observed" ? "Graphics completion"
            : counter == "managed.heap.estimate" ? "Managed heap (estimate)"
            : counter == "managed.allocated.total" ? "Managed allocation rate"
            : counter == "managed.committed.last_gc" ? "Managed committed (last GC)"
            : counter == "managed.heap.last_gc" ? "Managed heap (last GC)"
            : counter == "managed.fragmented.last_gc" ? "Managed fragmented (last GC)"
            : counter == "process.rss" ? "Process RSS": counter == "process.pss" ? "Process PSS"
            : counter == "driver.heap.usage.estimate" ? "Driver heap usage (estimate)": counter == "driver.heap.budget" ? "Driver heap budget"
            : counter.StartsWith("vulkan.live.", StringComparison.Ordinal) ? "GPU live " + counter.Substring(12)
            : counter.StartsWith("vulkan.retired.", StringComparison.Ordinal) ? "GPU retired " + counter.Substring(15)
            : counter == "vulkan.blocks" ? "Allocator blocks": counter.Replace(".", " ")
            return title + suffix
        }

        private func Result(r ProfilerRecord) string -> r.Kind == "resourcebaseline" ? "Live before recording"
        : r.Category == 0 &&
            r.Event == 0 ? r.Result == 1 ? "Rendered": r.Result == 2 ? "Deferred": r.Result < 0 ? "Failed": "Skipped"
        : r.Validity != "" ? r.Validity: r.Result == 0 ? "Success": r.Result.ToString(CultureInfo.InvariantCulture)

        private func PhaseColor(theme Theme, phase int32) Color {
            let series = theme.SeriesPalette
            let color = series[phase % series.Length]
            let round = phase / series.Length
            let amount = float32(Math.Min(0.8, 0.35 * float64((round + 1) / 2)))
            let target = round % 2 == 1 ? 0.0F: 1.0F
            return Color.FromNormalized(
                color.R + (target - color.R) * amount,
                color.G + (target - color.G) * amount,
                color.B + (target - color.B) * amount,
                1.0F
            )
        }

        private func Swatch(color Color) Container -> Container{
            Width: 9,
            Height: 9,
            FlexShrink: 0.0,
            BorderRadius: 2,
            BackgroundColor: color
        }

        private func Caption(key string, text string, color Color) Text {
            let theme = Theme.Read()
            return Text{
                Key: key,
                Content: text,
                FontFamily: theme.FontFamily,
                FontSize: theme.CaptionFontSize,
                Color: color,
                TextWrap: TextWrap.NoWrap,
                TextTrimming: TextTrimming.Ellipsis
            }
        }

        private func RulerLabel(key string, text string, left float64, theme Theme) Text -> Text{
            Key: key,
            Content: text,
            FontFamily: theme.MonoFontFamily,
            FontSize: theme.CaptionFontSize,
            Color: theme.MutedTextColor,
            Position: PositionType.Absolute,
            Left: left,
            Top: 2,
            TextWrap: TextWrap.NoWrap
        }

        private func Column(children List[Blob]) Container -> Container{
            Key: "profiler-panel",
            Width: Percent(100),
            Height: 0,
            MinHeight: 0,
            FlexGrow: 1.0,
            FlexDirection: FlexDirection.Column,
            Children: children
        }

        private func Detail(label string, value string, theme Theme) Container -> Container{
            Key: "detail-" + label,
            Width: Percent(100),
            MinHeight: 24,
            FlexShrink: 0.0,
            FlexDirection: FlexDirection.Row,
            AlignItems: AlignItems.Center,
            Gap: 8,
            Text{
                Content: label,
                Width: Percent(36),
                FontFamily: theme.FontFamily,
                FontSize: theme.CaptionFontSize,
                Color: theme.MutedTextColor
            },
            Text{
                Content: value,
                Width: 0,
                MinWidth: 0,
                FlexGrow: 1.0,
                FontFamily: theme.FontFamily,
                FontSize: theme.CaptionFontSize,
                Color: theme.TextColor,
                TextWrap: TextWrap.Wrap
            }
        }

        private func PathShape(path VectorPath, color Color) Shape -> Shape{
            Position: PositionType.Absolute,
            Left: 0,
            Top: 0,
            Width: Percent(100),
            Height: Percent(100),
            Path: path,
            Fit: ShapeFit.Fill,
            BackgroundColor: color,
        }

        private func Rect(path PathBuilder, x float64, y float64, width float64, height float64) {
            path.MoveTo(x, y).LineTo(x + width, y).LineTo(x + width, y + height).LineTo(x, y + height).Close()
        }

        private func Time(trace ProfilerTrace, ticks int64) string -> TimeNs(
            float64(ticks) / float64(trace.Frequency) * 1000000000.0
        )

        private func TimeNs(ns float64) string -> ns >= 1000000000.0 ? (ns / 1000000000.0).ToString(
            "G3",
            CultureInfo.InvariantCulture
        ) +
            " s"
        : ns >= 1000000.0 ? (ns / 1000000.0).ToString("G3", CultureInfo.InvariantCulture) + " ms"
        : (ns / 1000.0).ToString("G3", CultureInfo.InvariantCulture) + " µs"

        private func Bytes(value float64) string -> Math.Abs(value) >= 1073741824.0 ? (value / 1073741824.0).ToString(
            "G3",
            CultureInfo.InvariantCulture
        ) +
            " GiB"
        : Math.Abs(value) >= 1048576.0 ? (value / 1048576.0).ToString("G3", CultureInfo.InvariantCulture) + " MiB"
        : Math.Abs(value) >= 1024.0 ? (value / 1024.0).ToString("G3", CultureInfo.InvariantCulture) + " KiB"
        : value.ToString("G3", CultureInfo.InvariantCulture) + " B"

        private func Value(value float64, unit string) string -> unit == "bytes" ? Bytes(value)
        : unit == "bytes/s" ? Bytes(value) + "/s": unit == "ns" ? TimeNs(value): value.ToString(
            "G3",
            CultureInfo.InvariantCulture
        ) +
            " " +
            unit

        private func OptionalValue(value float64?, unit string) string {
            guard let actual = value else {
                return "—"
            }
            return Value(actual, unit)
        }

        private func SignedValue(value float64, unit string) string -> (value > 0.0 ? "+": "") + Value(value, unit)
    }
}
