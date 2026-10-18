package GooDevTools

import Goo
import System
import System.Collections.Generic
import System.Globalization
import System.Text

internal class ProfilerTableRow {
    internal let Cells[]string
    internal let Values[]float64
    internal let Record int32
    internal init(cells[]string, values[]float64, record int32 = -1) {
        Cells = cells
        Values = values
        Record = record
    }
}

internal class ProfilerTrackRow {
    internal let Key string
    internal let Title string
    internal let Height float64
    internal let Lane ProfilerLane?
    internal let Device uint64?
    internal init(key string, title string, height float64, lane ProfilerLane? = nil, device uint64? = nil) {
        Key = key
        Title = title
        Height = height
        Lane = lane
        Device = device
    }
}

internal class ProfilerCell : Cell {
    internal var session DiagnosticSession
    private var width float64 = 1400.0
    private var start int64
    private var end int64 = 1L
    private var selectionStart int64
    private var selectionEnd int64
    private var selected int32 = -1
    private var anchor int64
    private var selecting bool
    private var overviewDrag bool
    private var overviewX float64
    private var overviewStart int64
    private var filterWindow string = ""
    private var windowPicker bool
    private var follow bool = true
    private var lifetimes bool
    private var moreCounters bool
    private var expandedResource string = ""
    private var revision int32 = -1
    private var tab string = "Phases"
    private var sortColumn int32 = 2
    private var descending bool = true
    private var tableKey string = ""
    private var tableRows List[ProfilerTableRow] = List[ProfilerTableRow]()
    private var resourceTotals string = ""
    private let collapsed HashSet[string] = HashSet[string]()
    private let paths Dictionary[string, VectorPath] = Dictionary[string, VectorPath]()
    private let scales Dictionary[string, float64] = Dictionary[string, float64]()
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
            scales.Clear()
            Rebuild()
        }
    }

    override func Build() Blob {
        let children = List[Blob]()
        children.Add(Toolbar())
        if windowPicker {
            children.Add(WindowPicker())
        }
        guard let trace = session.Profiler else {
            children.Add(
                Label(
                    session
                        .Capabilities
                        .ProfilerTrace ? "Record a real target trace to inspect phases, memory and resource loads."
                    : "Recording unavailable: target lacks profiler.trace.v1."
                )
            )
            return Column("profiler-panel", children)
        }
        children.Add(
            Text{
                Key: "profiler-status",
                Content: Status(trace),
                FontSize: 11,
                Color: trace.Partial || trace.Dropped > 0uL ? DevToolsTheme.Amber: DevToolsTheme.InkMuted,
                TextWrap: TextWrap.NoWrap,
                TextTrimming: TextTrimming.Ellipsis
            }
        )
        if trace.Reason != "" {
            children.Add(Label(trace.Reason))
        }
        children.Add(Overview(trace))
        children.Add(Ruler(trace))
        let tracks = Tracks(trace)
        let heights = List[float64]()
        for row in tracks {
            heights.Add(row.Height)
        }
        children.Add(
            Virtual(ProfilerVirtualSource(heights, (index int32) -> Track(trace, tracks[index]))){
                Key = "profiler-tracks",
                Height = 0,
                MinHeight = 160,
                FlexGrow = 1.0,
                OverflowY = Overflow.Scroll,
                OverflowX = Overflow.Hidden,
                ScrollbarVisibility = ScrollbarVisibility.Auto,
                Accessibility = Accessibility{Role: AccessibilityRole.Tree, Name: "Profiler tracks"},
            }
        )
        children.Add(Analysis(trace))
        return Column("profiler-panel", children)
    }

    private func Toolbar() Container {
        let controls = List[Blob]()
        let active = session.Profiler?.Active == true
        controls.Add(
            Control(
                "profiler-record",
                active ? "Stop": "Record",
                () -> {
                    if active {
                        session.StopProfiler()
                    } else {
                        session.StartProfiler()
                        selected = -1
                        selectionStart = 0L
                        selectionEnd = 0L
                        revision = -1
                        follow = true
                        paths.Clear()
                    }
                    Rebuild()
                },
                session.State == DiagnosticConnectionState.Connected && session.Capabilities.ProfilerTrace
            )
        )
        controls.Add(
            Control(
                "profiler-clear",
                "Clear",
                () -> {
                    session.ClearProfiler()
                    selected = -1
                    selectionStart = 0L
                    selectionEnd = 0L
                    tableRows.Clear()
                    tableKey = ""
                    paths.Clear()
                    Rebuild()
                },
                !active
            )
        )
        controls.Add(
            Control(
                "profiler-window",
                filterWindow == "" ? "All windows": WindowTitle(filterWindow),
                () -> {
                    windowPicker = !windowPicker
                    Rebuild()
                }
            )
        )
        controls.Add(Control("profiler-fit", "Fit", () -> Fit()))
        controls.Add(
            Control(
                "profiler-zoom-selection",
                "Zoom selection",
                () -> {
                    if selectionEnd > selectionStart {
                        start = selectionStart
                        end = selectionEnd
                        Changed()
                    }
                },
                selectionEnd > selectionStart
            )
        )
        controls.Add(Control("profiler-zoom-out", "−", () -> Zoom(2.0, 0.5)))
        controls.Add(Control("profiler-zoom-in", "+", () -> Zoom(0.5, 0.5)))
        controls.Add(
            Toggle(
                "profiler-follow",
                "Follow",
                follow,
                () -> {
                    follow = !follow
                    Rebuild()
                }
            )
        )
        return Container{
            Key: "profiler-toolbar",
            Width: Percent(100),
            Height: 34,
            FlexShrink: 0.0,
            FlexDirection: FlexDirection.Row,
            AlignItems: AlignItems.Center,
            Gap: 4,
            Padding: 3,
            OverflowX: Overflow.Hidden,
            Children: controls
        }
    }

    private func WindowPicker() Container {
        let controls = List[Blob]()
        controls.Add(Control("profiler-window-all", "All windows", () -> PickWindow("")))
        for window in session.Windows {
            let id = window.Id
            controls.Add(Control("profiler-window-" + id, WindowTitle(id), () -> PickWindow(id)))
        }
        return Container{Key: "profiler-window-picker", FlexDirection: FlexDirection.Row, Gap: 4, Children: controls}
    }

    private func PickWindow(id string) {
        filterWindow = id
        windowPicker = false
        tableKey = ""
        Rebuild()
    }

    private func Status(trace ProfilerTrace) string {
        let name = session.Endpoint.ApplicationName == "" ? "Target": session.Endpoint.ApplicationName
        let pid = trace.Process.Split(" / ")[0]
        return trace.State + " · " + trace.Records.Count.ToString() + " records · " + Time(trace, trace.End)
        + " · " + name + " (pid " + pid + ")"
        + (trace.Devices == "" ? "": " · " + trace.Devices)
        + (trace.Dropped > 0uL ? " · " + trace.Dropped.ToString() + " dropped": "")
        + (trace.Partial ? " · PARTIAL": "")
    }

    private func WindowTitle(id string) string {
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

    private func Tracks(trace ProfilerTrace) List[ProfilerTrackRow] {
        let rows = List[ProfilerTrackRow]()
        let windows = List[string]()
        for lane in trace.Lanes {
            if lane.Window != "" && !windows.Contains(lane.Window) {
                windows.Add(lane.Window)
            }
        }
        for window in windows {
            if filterWindow != "" && window != filterWindow {
                continue
            }
            AddGroup(trace, rows, "window-" + window, WindowTitle(window), window, "")
        }
        AddGroup(trace, rows, "process", "Process markers", "", "Markers")
        AddGroup(trace, rows, "GPU", "GPU · per-submission elapsed, not CPU-aligned", "", "GPU")
        AddGroup(trace, rows, "Memory", "Memory · separate accounts", "", "Memory")
        AddGroup(trace, rows, "Resources", "Resources", "", "Resources")
        return rows
    }

    private func AddGroup(
        trace ProfilerTrace,
        rows List[ProfilerTrackRow],
        key string,
        title string,
        window string,
        group string
    ) {
        let lanes = List[ProfilerLane]()
        for lane in trace.Lanes {
            if group == "" ? lane.Window == window: lane.Group == group {
                lanes.Add(lane)
            }
        }
        if lanes.Count == 0 {
            return
        }
        rows.Add(ProfilerTrackRow(key, title + " (" + lanes.Count.ToString() + ")", 30.0))
        if collapsed.Contains(key) {
            return
        }
        if group == "Memory" {
            for device in trace.DeviceIds {
                rows.Add(
                    ProfilerTrackRow("owner-" + device.ToString(), "GPU live / retired by owner", 70.0, device: device)
                )
            }
        }
        for lane in lanes {
            if group == "Memory" && IsMore(lane) && !moreCounters {
                continue
            }
            if group == "Memory" && lane.Name.StartsWith("driver.heap.budget", StringComparison.Ordinal) &&
                !moreCounters {
                continue
            }
            rows.Add(
                ProfilerTrackRow(
                    "lane-" + lane.Group + lane.Name + lane.Window,
                    LaneTitle(lane.Name),
                    lane.Group == "CPU" || lane.Group == "Queue" ? Math.Max(
                        34.0,
                        float64(lane.MaxDepth + 1) * 16.0 + 8.0
                    ): 40.0,
                    lane
                )
            )
            if lane.Group == "Resources" && expandedResource == lane.Name {
                let byId = Dictionary[uint64, ProfilerLane]()
                for index in lane.Records {
                    let r = trace.Records[index]
                    guard let id = r.Resource else {
                        continue
                    }
                    if !byId.TryGetValue(id, out var child) {
                        let name = trace.ResourceNames.TryGetValue(id, out var actual) ? actual: "Resource " +
                            id.ToString()
                        child = ProfilerLane("  " + name + " #" + id.ToString(), "Resources", "")
                        byId.Add(id, child)
                    }
                    child.Records.Add(index)
                    child.Dirty = true
                }
                for pair in byId {
                    let child = pair.Value
                    child.Prepare(trace.Records)
                    rows.Add(ProfilerTrackRow("resource-" + pair.Key.ToString(), child.Name, 34.0, child))
                }
            }
        }
        if group == "Memory" {
            rows.Add(ProfilerTrackRow("more", "More counters", 30.0))
        }
    }

    private func Track(trace ProfilerTrace, row ProfilerTrackRow) Blob {
        if let lane = row.Lane {
            return Lane(trace, lane, row.Height)
        }
        if let device = row.Device {
            return OwnerStack(trace, device)
        }
        let expanded = row.Key == "more" ? moreCounters: !collapsed.Contains(row.Key)
        let children = List[Blob]()
        children.Add(
            Button{
                Key: "profiler-group-" + row.Key,
                Height: 30,
                Width: 0,
                FlexGrow: 1.0,
                JustifyContent: JustifyContent.FlexStart,
                FlexDirection: FlexDirection.Row,
                AlignItems: AlignItems.Center,
                Gap: 6,
                Padding: Edges{Left: 6, Right: 8},
                BackgroundColor: DevToolsTheme.SurfaceRaised,
                Hover: Style{BackgroundColor: DevToolsTheme.SurfaceStrong},
                Focus: FocusStyle(),
                Accessibility: Accessibility{Role: AccessibilityRole.TreeItem, Name: row.Title, Expanded: expanded},
                OnClick: () -> {
                    if row.Key == "more" {
                        moreCounters = !moreCounters
                    } else if !collapsed.Remove(row.Key) {
                        collapsed.Add(row.Key)
                    }
                    Rebuild()
                },
                DevToolsIcons.View("disclosure-" + row.Key, expanded ? DevToolsIcons.Expand: DevToolsIcons.Chevron),
                Label(row.Title),
            }
        )
        if row.Key == "Resources" {
            children.Add(
                Toggle(
                    "profiler-lifetimes",
                    "Lifetimes",
                    lifetimes,
                    () -> {
                        lifetimes = !lifetimes
                        paths.Clear()
                        Rebuild()
                    }
                )
            )
        }
        return Container{
            Key: "group-row-" + row.Key,
            Width: Percent(100),
            Height: 30,
            FlexDirection: FlexDirection.Row,
            Children: children
        }
    }

    private func Overview(trace ProfilerTrace) Container {
        let w = PlotWidth()
        let total = Math.Max(1L, trace.End)
        let key = "overview"
        if !paths.ContainsKey(key + "0") {
            let maxima = [int32(w) + 1]float64
            let indices = [int32(w) + 1]int32
            Array.Fill(indices, -1)
            let maximum = 50.1
            for index in 0 ... trace.Records.Count {
                let r = trace.Records[index]
                if r.Kind != "duration" || r.Category != 0 || r.Event != 0 || r.Window == "" {
                    continue
                }
                if filterWindow != "" && r.Window != filterWindow {
                    continue
                }
                let pixel = Math.Clamp(int32(float64(r.Ticks) / float64(total) * w), 0, int32(w))
                let ms = trace.Milliseconds(r.EndTicks - r.Ticks)
                if ms >= maxima[pixel] {
                    maxima[pixel] = ms
                    indices[pixel] = index
                }
            }
            let builders = []PathBuilder{
                PathBuilder(0.0, 0.0, w, 56.0),
                PathBuilder(0.0, 0.0, w, 56.0),
                PathBuilder(0.0, 0.0, w, 56.0),
                PathBuilder(0.0, 0.0, w, 56.0)
            }
            for pixel in 0 ... indices.Length {
                if indices[pixel] < 0 {
                    continue
                }
                let r = trace.Records[indices[pixel]]
                let ms = maxima[pixel]
                let bucket = ms > maximum ? 2: r.Result == 0 ? 3: ms <= 16.7 ? 0: ms <= 33.4 ? 1: 2
                let height = Math.Clamp(ms / maximum * 48.0, 1.0, 48.0)
                Rect(builders[bucket], float64(pixel), 54.0 - height, 2.0, height)
            }
            for bucket in 0 ... 4 {
                paths[key + bucket.ToString()] = builders[bucket].Build()
            }
            scales[key] = maximum
        }
        let shapes = List[Blob]()
        let colors = []Color{DevToolsTheme.Green, DevToolsTheme.Amber, DevToolsTheme.Red, DevToolsTheme.InkSubtle}
        for bucket in 0 ... 4 {
            shapes.Add(PathShape(paths[key + bucket.ToString()], colors[bucket], w, 56.0))
        }
        let budget = PathBuilder(0.0, 0.0, w, 56.0)
        Rect(budget, 0.0, 54.0 - 16.7 / scales[key] * 48.0, w, 1.0)
        shapes.Add(PathShape(budget.Build(), DevToolsTheme.InkMuted, w, 56.0))
        let viewport = PathBuilder(0.0, 0.0, w, 56.0)
        let left = Math.Clamp(float64(start) / float64(total) * w, 0.0, w)
        let right = Math.Clamp(float64(end) / float64(total) * w, left, w)
        Rect(viewport, left, 1.0, Math.Max(1.0, right - left), 54.0)
        shapes.Add(
            Shape{
                Position: PositionType.Absolute,
                Left: 0,
                Top: 0,
                Width: w,
                Height: 56,
                Path: viewport.Build(),
                Fit: ShapeFit.Fill,
                BackgroundColor: Color.Transparent,
                BorderWidth: 1,
                BorderColor: DevToolsTheme.Accent
            }
        )
        let dim = PathBuilder(0.0, 0.0, w, 56.0)
        if left > 0.0 {
            Rect(dim, 0.0, 0.0, left, 56.0)
        }
        if right < w {
            Rect(dim, right, 0.0, w - right, 56.0)
        }
        shapes.Add(
            Shape{
                Position: PositionType.Absolute,
                Left: 0,
                Top: 0,
                Width: w,
                Height: 56,
                Path: dim.Build(),
                Fit: ShapeFit.Fill,
                BackgroundColor: Color.Rgba(0, 0, 0, 110)
            }
        )
        return Container{
            Key: "profiler-frame-overview",
            Width: Percent(100),
            Height: 60,
            FlexShrink: 0.0,
            FlexDirection: FlexDirection.Row,
            Container{
                Width: 220,
                Height: 56,
                Padding: 6,
                FlexDirection: FlexDirection.Column,
                Label("Frame time"),
                Label("16.7 ms (60 Hz) budget")
            },
            Container{
                Key: "profiler-overview",
                Width: w,
                Height: 56,
                Position: PositionType.Relative,
                BackgroundColor: DevToolsTheme.Surface,
                Children: shapes,
                Focusable: true,
                Focus: FocusStyle(),
                Accessibility: Accessibility{Role: AccessibilityRole.Group, Name: "Frame time overview"},
                OnPointerDown: (e PointerEvent) -> {
                    if e.Button != PointerButton.Primary {
                        return
                    }
                    e.Capture()
                    overviewDrag = true
                    overviewX = e.Position.X
                    overviewStart = start
                },
                OnPointerMove: (e PointerEvent) -> {
                    if overviewDrag && Math.Abs(e.Position.X - overviewX) > 3.0 {
                        let span = end - start
                        start = Math.Max(0L, overviewStart + int64((e.Position.X - overviewX) / w * float64(total)))
                        end = start + span
                        Changed()
                    }
                },
                OnPointerUp: (e PointerEvent) -> {
                    e.ReleaseCapture()
                    if overviewDrag && Math.Abs(e.Position.X - overviewX) <= 3.0 {
                        let tick = int64(Math.Clamp(e.Position.X / w, 0.0, 1.0) * float64(total))
                        var nearest int32 = -1
                        var distance int64 = int64.MaxValue
                        for index in 0 ... trace.Records.Count {
                            let r = trace.Records[index]
                            if r.Kind == "duration" && r.Category == 0 && r.Event == 0 && r.Window != "" {
                                if filterWindow != "" && r.Window != filterWindow {
                                    continue
                                }
                                let delta = Math.Abs(tick - r.Ticks)
                                if delta < distance {
                                    nearest = index
                                    distance = delta
                                }
                            }
                        }
                        if nearest >= 0 {
                            SelectRecord(trace, nearest, false)
                        }
                        let span = end - start
                        start = Math.Max(0L, tick - span / 2L)
                        end = start + span
                        Changed()
                    }
                    overviewDrag = false
                },
                OnPointerCancel: (e PointerEvent) -> {
                    overviewDrag = false
                    e.ReleaseCapture()
                },
            },
        }
    }

    private func Ruler(trace ProfilerTrace) Container {
        let ticks = List[Blob]()
        let target = float64(Math.Max(1L, end - start)) / 7.0
        let power = Math.Pow(10.0, Math.Floor(Math.Log10(target)))
        let normalized = target / power
        let step = int64(
            Math.Max(1.0, (normalized <= 1.0 ? 1.0: normalized <= 2.0 ? 2.0: normalized <= 5.0 ? 5.0: 10.0) * power)
        )
        let stepMs = trace.Milliseconds(step)
        let scale = stepMs >= 1000.0 ? 0.001: stepMs >= 1.0 ? 1.0: 1000.0
        let unit = stepMs >= 1000.0 ? "s": stepMs >= 1.0 ? "ms": "µs"
        let decimals = Math.Clamp(int32(Math.Ceiling(-Math.Log10(stepMs * scale))), 0, 6)
        let basis = start
        let baseDecimals = Math.Clamp(int32(Math.Ceiling(-Math.Log10(stepMs / 1000.0))) + 2, 0, 9)
        ticks.Add(
            Text{
                Key: "ruler-base",
                Content: (trace.Milliseconds(basis) / 1000.0).ToString(
                    "F" + baseDecimals.ToString(),
                    CultureInfo.InvariantCulture
                ) +
                    " s",
                FontSize: 10,
                Color: DevToolsTheme.InkMuted,
                Position: PositionType.Absolute,
                Left: 0,
                Top: 2,
                TextWrap: TextWrap.NoWrap
            }
        )
        var tick = basis + step
        while tick <= end {
            if X(tick) < 100.0 {
                tick += step
                continue
            }
            ticks.Add(
                Text{
                    Key: "ruler-" + tick.ToString(),
                    Content: "+" + (trace.Milliseconds(tick - basis) * scale).ToString(
                        "F" + decimals.ToString(),
                        CultureInfo.InvariantCulture
                    ) +
                        " " +
                        unit,
                    FontSize: 10,
                    Color: DevToolsTheme.InkMuted,
                    Position: PositionType.Absolute,
                    Left: X(tick),
                    Top: 2,
                    TextWrap: TextWrap.NoWrap
                }
            )
            tick += step
        }
        return Container{
            Key: "profiler-ruler",
            Margin: Edges{Left: 220},
            Width: PlotWidth(),
            Height: 24,
            FlexShrink: 0.0,
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

    private func Lane(trace ProfilerTrace, lane ProfilerLane, height float64) Container {
        let w = PlotWidth()
        let key = lane.Group + lane.Name + lane.Window
        let h = height - 4.0
        if !paths.ContainsKey(key) {
            let geometry = PathBuilder(0.0, 0.0, w, h)
            let baseline = PathBuilder(0.0, 0.0, w, h)
            let annotations = PathBuilder(0.0, 0.0, w, h)
            var budgetLane ProfilerLane? = nil
            if lane.Name.StartsWith("driver.heap.usage.estimate", StringComparison.Ordinal) {
                let suffix = lane.Name.Substring("driver.heap.usage.estimate".Length)
                for candidate in trace.Lanes {
                    if candidate.Name == "driver.heap.budget" + suffix {
                        budgetLane = candidate
                    }
                }
            }
            var maximum = 1.0
            let first = lane.FirstVisible(start)
            if lane.Group == "Memory" {
                for offset in Math.Max(0, first - 1) ... lane.Records.Count {
                    let r = trace.Records[lane.Records[offset]]
                    if r.Ticks > end {
                        break
                    }
                    if let value = SeriesValue(trace, lane, offset) {
                        maximum = Math.Max(maximum, value)
                    }
                }
                if let budgets = budgetLane {
                    for offset in Math.Max(0, budgets.FirstVisible(start) - 1) ... budgets.Records.Count {
                        let r = trace.Records[budgets.Records[offset]]
                        if r.Ticks > end {
                            break
                        }
                        if let value = r.Value {
                            maximum = Math.Max(maximum, value)
                        }
                    }
                }
            }
            scales[key] = maximum
            var lastPixel = -1
            for offset in(
                lane.Group == "Memory" ? Math.Max(0, first - 1): lifetimes && lane.Group == "Resources" ? 0: first
            ) ... lane
                .Records
                .Count {
                let r = trace.Records[lane.Records[offset]]
                if r.Ticks > end {
                    break
                }
                if lane.Group == "Memory" {
                    if let value = SeriesValue(trace, lane, offset) {
                        let next = offset + 1 < lane.Records.Count ? trace.Records[lane.Records[offset + 1]].Ticks: end
                        let left = Math.Max(0.0, X(r.Ticks))
                        let right = Math.Min(w, X(next))
                        let bar = Math.Max(0.5, value / maximum * (h - 5.0))
                        if right > left {
                            Rect(geometry, left, h - bar, right - left, bar)
                        }
                    }
                    continue
                }
                if r.Kind == "resourcebaseline" {
                    let left = Math.Clamp(X(r.Ticks), 0.0, w - 2.0)
                    Rect(baseline, left, 7.0, 2.0, h - 12.0)
                    continue
                }
                let a = r.Ticks
                var z = r.EndTicks
                if lifetimes && lane.Group == "Resources" && r.Resource != nil && r.Kind == "resourcelifecycle"
                && (r.Event == 200 || r.Event == 220 || r.Event == 120) {
                    z = trace.End
                    if trace.ResourceReleased.TryGetValue(r.Resource ?? 0uL, out var released) {
                        z = released
                    }
                }
                if z < start {
                    continue
                }
                let left = Math.Clamp(X(a), 0.0, w - 1.0)
                let right = Math.Clamp(X(z), left, w)
                let nested = lane.Group == "CPU" || lane.Group == "Queue"
                let depth = nested ? lane.Depth[offset]: 0
                let y = nested ? 3.0 + float64(depth) * 16.0: r.Kind == "duration" ? 5.0: 3.0
                if int32(left) != lastPixel || right - left > 2.0 {
                    Rect(
                        geometry,
                        left,
                        y,
                        Math.Max(2.0, right - left),
                        nested ? 14.0: r.Kind == "duration" ? h - 10.0: 5.0
                    )
                }
                lastPixel = int32(left)
            }
            if let budgets = budgetLane {
                for offset in Math.Max(0, budgets.FirstVisible(start) - 1) ... budgets.Records.Count {
                    let r = trace.Records[budgets.Records[offset]]
                    if r.Ticks > end {
                        break
                    }
                    guard let value = r.Value else {
                        continue
                    }
                    let next = offset +
                        1 < budgets
                        .Records
                        .Count ? trace
                        .Records[budgets.Records[offset + 1]]
                        .Ticks: end
                    let left = Math.Max(0.0, X(r.Ticks))
                    let right = Math.Min(w, X(next))
                    if right > left {
                        Rect(annotations, left, h - value / maximum * (h - 5.0), right - left, 1.0)
                    }
                }
            }
            if lane.Name.StartsWith("managed.heap.estimate", StringComparison.Ordinal) {
                for candidate in trace.Lanes {
                    if !candidate.Name.StartsWith("gc.gen", StringComparison.Ordinal) {
                        continue
                    }
                    var previous float64? = nil
                    for index in candidate.Records {
                        let r = trace.Records[index]
                        if r.Ticks > end {
                            break
                        }
                        if let value = r.Value {
                            if let before = previous {
                                if value > before && r.Ticks >= start {
                                    Rect(annotations, Math.Clamp(X(r.Ticks), 0.0, w - 1.0), 0.0, 1.0, h)
                                }
                            }
                            previous = value
                        }
                    }
                }
            }
            paths[key + "annotations"] = annotations.Build()
            paths[key] = geometry.Build()
            paths[key + "baseline"] = baseline.Build()
        }
        let plot = List[Blob]()
        plot.Add(
            PathShape(
                paths[key],
                lane.Group == "Memory" ? DevToolsTheme.Green: lane.Group == "Resources" ? DevToolsTheme.Amber: DevToolsTheme.Accent,
                w,
                h
            )
        )
        plot.Add(PathShape(paths[key + "baseline"], DevToolsTheme.InkSubtle, w, h))
        plot.Add(PathShape(paths[key + "annotations"], DevToolsTheme.Amber, w, h))
        let selection = PathBuilder(0.0, 0.0, w, h)
        if selectionEnd > selectionStart && selectionEnd > start && selectionStart < end {
            let left = Math.Max(0.0, X(selectionStart))
            Rect(selection, left, 0.0, Math.Max(1.0, Math.Min(w, X(selectionEnd)) - left), h)
        }
        plot.Add(PathShape(selection.Build(), Color.Rgba(137, 171, 249, 12), w, h))
        if lane.Group == "CPU" || lane.Group == "Queue" {
            for offset in lane.FirstVisible(start) ... lane.Records.Count {
                let r = trace.Records[lane.Records[offset]]
                if r.Ticks > end {
                    break
                }
                if r.Kind != "duration" {
                    continue
                }
                let left = Math.Max(0.0, X(r.Ticks))
                let right = Math.Min(w, X(r.EndTicks))
                if right - left > 40.0 {
                    plot.Add(
                        Text{
                            Key: "slice-label-" + lane.Records[offset].ToString(),
                            Content: LaneTitle(trace.EventName(r)),
                            FontSize: 10,
                            Color: DevToolsTheme.Background,
                            Position: PositionType.Absolute,
                            Left: left + 3.0,
                            Top: 3.0 + float64(lane.Depth[offset]) * 16.0,
                            Width: right - left - 6.0,
                            Height: 14,
                            TextWrap: TextWrap.NoWrap,
                            TextTrimming: TextTrimming.Ellipsis
                        }
                    )
                }
            }
        }
        let labels = List[Blob]()
        labels.Add(
            Text{
                Content: LaneTitle(lane.Name),
                FontSize: 11,
                Color: DevToolsTheme.Ink,
                TextWrap: TextWrap.NoWrap,
                TextTrimming: TextTrimming.Ellipsis
            }
        )
        if lane.Group == "Memory" {
            let unit = lane.Name.StartsWith("managed.allocated", StringComparison.Ordinal) ? "bytes/s": trace
                .Records[lane.Records[0]]
                .Unit
            labels.Add(
                Label(
                    "max " + Value(scales[key], unit)
                    +
                        (
                        lane.Name.StartsWith("driver.heap.usage", StringComparison.Ordinal) ? " · amber: budget"
                        : lane.Name.StartsWith("managed.heap.estimate", StringComparison.Ordinal) ? " · amber: GC": ""
                    )
                )
            )
        } else if lane.Group == "Resources" {
            labels.Add(Label("gray marker: live before recording"))
        }
        var title Blob = Container{
            Width: 220,
            Height: height,
            Padding: Edges{Left: 8, Right: 6},
            Overflow: Overflow.Hidden,
            FlexDirection: FlexDirection.Column,
            JustifyContent: JustifyContent.Center,
            Children: labels
        }
        if lane.Group == "Resources" && !lane.Name.StartsWith("  ", StringComparison.Ordinal) {
            title = Button{
                Key: "resource-disclosure-" + lane.Name,
                Width: 220,
                Height: height,
                FlexDirection: FlexDirection.Row,
                JustifyContent: JustifyContent.FlexStart,
                Padding: Edges{Left: 22},
                AlignItems: AlignItems.Center,
                Gap: 4,
                Focus: FocusStyle(),
                Accessibility: Accessibility{
                    Role: AccessibilityRole.TreeItem,
                    Name: lane.Name,
                    Expanded: expandedResource == lane.Name
                },
                OnClick: () -> {
                    expandedResource = expandedResource == lane.Name ? "": lane.Name
                    Rebuild()
                },
                DevToolsIcons.View(
                    "resource-chevron",
                    expandedResource == lane.Name ? DevToolsIcons.Expand: DevToolsIcons.Chevron
                ),
                Text{
                    Content: lane.Name,
                    FontSize: 11,
                    Color: DevToolsTheme.Ink,
                    TextWrap: TextWrap.NoWrap,
                    TextTrimming: TextTrimming.Ellipsis
                },
            }
        }
        return Container{
            Key: "lane-" + key,
            Width: Percent(100),
            Height: height,
            FlexDirection: FlexDirection.Row,
            BorderWidth: Edges{Bottom: 1},
            BorderColor: DevToolsTheme.Border,
            title,
            Container{
                Key: "plot-" + key,
                Width: w,
                Height: h,
                Position: PositionType.Relative,
                Focusable: true,
                Focus: FocusStyle(),
                BackgroundColor: DevToolsTheme.Surface,
                Accessibility: Accessibility{
                    Role: AccessibilityRole.Group,
                    Name: LaneTitle(lane.Name) + (lane.Window == "" ? "": " · " + WindowTitle(lane.Window))
                },
                OnWheel: (e WheelEvent) -> {
                    if e.Modifiers.Ctrl {
                        e.PreventDefault()
                        Zoom(e.Delta.Y > 0.0 ? 0.8: 1.25, Math.Clamp(e.Position.X / w, 0.0, 1.0))
                    } else if e.Modifiers.Shift {
                        e.PreventDefault()
                        Pan(e.Delta.Y > 0.0 ? -0.1: 0.1)
                    }
                },
                OnPointerDown: (e PointerEvent) -> BeginSelection(e),
                OnPointerMove: (e PointerEvent) -> MoveSelection(e),
                OnPointerUp: (e PointerEvent) -> {
                    if !selecting {
                        return
                    }
                    selecting = false
                    e.ReleaseCapture()
                    if selectionEnd - selectionStart < Math.Max(1L, (end - start) / int64(w) * 3L) {
                        Hit(trace, lane, Tick(e.Position.X), e.Position.Y)
                    }
                    Rebuild()
                },
                OnPointerCancel: (e PointerEvent) -> {
                    selecting = false
                    e.ReleaseCapture()
                },
                OnKeyDown: (e KeyEvent) -> Keys(e),
                Children: plot,
            },
        }
    }

    private func SeriesValue(trace ProfilerTrace, lane ProfilerLane, offset int32) float64? {
        let r = trace.Records[lane.Records[offset]]
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

    private func OwnerStack(trace ProfilerTrace, device uint64) Container {
        let key = "owner-" + device.ToString()
        if !paths.ContainsKey(key + "0") {
            let indices = List[int32]()
            for lane in trace.Lanes {
                if lane.Group != "Memory" {
                    continue
                }
                for index in lane.Records {
                    let r = trace.Records[index]
                    if r.Device == device &&
                        r.Ticks <= end &&
                        (r.Name == "vulkan.live.requirements" || r.Name == "vulkan.retired.requirements") {
                        indices.Add(index)
                    }
                }
            }
            indices.Sort((a int32, b int32) -> trace.Records[a].Ticks.CompareTo(trace.Records[b].Ticks))
            indices.Add(-1)
            let builders = [16]PathBuilder
            for slot in 0 ... 16 {
                builders[slot] = PathBuilder(0.0, 0.0, PlotWidth(), 34.0)
            }
            var maximum = 1.0
            for pass in 0 ... 2 {
                let values = [16]uint64
                var previous int64 = 0L
                var sampled = false
                for index in indices {
                    let tick = index < 0 ? end: trace.Records[index].Ticks
                    if sampled && tick != previous && tick >= start && previous < end {
                        var total = 0.0
                        for value in values {
                            total += float64(value)
                        }
                        if pass == 0 {
                            maximum = Math.Max(maximum, total)
                        } else {
                            let left = Math.Max(0.0, X(previous))
                            let right = Math.Min(PlotWidth(), X(tick))
                            var bottom = 32.0
                            for slot in 0 ... 16 {
                                let bar = float64(values[slot]) / maximum * 30.0
                                if bar > 0.0 && right > left {
                                    Rect(builders[slot], left, bottom - bar, right - left, bar)
                                }
                                bottom -= bar
                            }
                        }
                    }
                    if index < 0 {
                        break
                    }
                    let r = trace.Records[index]
                    if let owner = r.Owner {
                        if owner < 8uL {
                            if let value = r.Value {
                                values[int32(owner) * 2 + (r.Name == "vulkan.retired.requirements" ? 1: 0)] = value
                                sampled = true
                            }
                        }
                    }
                    previous = tick
                }
            }
            for slot in 0 ... 16 {
                paths[key + slot.ToString()] = builders[slot].Build()
            }
            scales[key] = maximum
        }
        let colors = OwnerColors()
        let shapes = List[Blob]()
        for slot in 0 ... 16 {
            shapes.Add(
                Shape{
                    Position: PositionType.Absolute,
                    Left: 0,
                    Top: 0,
                    Width: PlotWidth(),
                    Height: 34,
                    Path: paths[key + slot.ToString()],
                    Fit: ShapeFit.Fill,
                    BackgroundColor: colors[slot / 2],
                    Opacity: slot % 2 == 0 ? 1.0: 0.45
                }
            )
        }
        let legend = List[Blob]()
        for owner in 0 ... 8 {
            if !trace.PositiveOwners.TryGetValue(device, out var owners) || (owners & (1uL << owner)) == 0uL {
                continue
            }
            legend.Add(
                Container{
                    FlexDirection: FlexDirection.Row,
                    AlignItems: AlignItems.Center,
                    Gap: 3,
                    Container{Width: 9, Height: 9, BackgroundColor: colors[owner]},
                    Label(trace.OwnerName(uint64(owner)))
                }
            )
        }
        legend.Add(Label("retired: dim"))
        return Container{
            Key: key,
            Width: Percent(100),
            Height: 70,
            FlexDirection: FlexDirection.Column,
            Container{
                Height: 34,
                FlexDirection: FlexDirection.Row,
                Container{
                    Width: 220,
                    Padding: 6,
                    FlexDirection: FlexDirection.Column,
                    Label("GPU live / retired by owner"),
                    Label("max " + Value(scales[key], "bytes"))
                },
                Container{Width: PlotWidth(), Height: 34, Position: PositionType.Relative, Children: shapes}
            },
            Container{
                Margin: Edges{Left: 220},
                Height: 30,
                FlexDirection: FlexDirection.Row,
                FlexWrap: FlexWrap.Wrap,
                Gap: 7,
                Children: legend
            },
        }
    }

    private func Analysis(trace ProfilerTrace) Container {
        let tabs = List[Blob]()
        for name in[]string{"Phases", "Memory", "Resources"} {
            let current = name
            tabs.Add(
                Button{
                    Key: "profiler-tab-" + current,
                    Height: 28,
                    Padding: Edges{Left: 12, Right: 12},
                    BackgroundColor: tab == current ? DevToolsTheme.Selection: DevToolsTheme.Surface,
                    Focus: FocusStyle(),
                    Accessibility: Accessibility{Role: AccessibilityRole.Tab, Name: current, Selected: tab == current},
                    OnClick: () -> {
                        tab = current
                        sortColumn = current == "Phases" ? 2: 4
                        descending = true
                        tableKey = ""
                        Rebuild()
                    },
                    Label(current),
                }
            )
        }
        let columns = tab == "Phases" ? []string{"Name", "Count", "Total", "% range", "Average", "Max", "Alloc"}
        : tab == "Memory" ? []string{"Counter", "Start", "End", "Δ", "Observed peak"}
        : []string{"Start", "Duration", "Kind", "Name", "Bytes", "Owner", "Result"}
        PrepareTable(trace)
        let headers = List[Blob]()
        for column in 0 ... columns.Length {
            let index = column
            headers.Add(
                Button{
                    Key: "profiler-sort-" + column.ToString(),
                    Width: ColumnWidth(column),
                    FlexGrow: FlexibleColumn(column) ? 1.0: 0.0,
                    FlexShrink: 0.0,
                    MinWidth: 0,
                    Padding: 0,
                    JustifyContent: JustifyContent.FlexStart,
                    Height: 28,
                    BackgroundColor: DevToolsTheme.SurfaceRaised,
                    Focus: FocusStyle(),
                    Accessibility: Accessibility{Role: AccessibilityRole.ColumnHeader, Name: columns[column]},
                    OnClick: () -> {
                        if sortColumn == index {
                            descending = !descending
                        } else {
                            sortColumn = index
                            descending = true
                        }
                        tableKey = ""
                        Rebuild()
                    },
                    Text{
                        Content: columns[column] + (sortColumn == column ? descending ? " ↓": " ↑": ""),
                        Width: Percent(100),
                        Padding: Edges{Left: 5, Right: 5},
                        FontSize: 11,
                        Color: DevToolsTheme.Ink,
                        TextAlign: NumericColumn(column) ? TextAlign.Right: TextAlign.Left,
                        TextWrap: TextWrap.NoWrap,
                        TextTrimming: TextTrimming.Ellipsis
                    },
                }
            )
        }
        let left = List[Blob]()
        left.Add(
            Container{
                Height: 28,
                FlexDirection: FlexDirection.Row,
                Accessibility: Accessibility{Role: AccessibilityRole.TabList},
                Children: tabs
            }
        )
        left.Add(
            Label(
                tab == "Phases" ? "Inclusive rows overlap. Allocation traffic includes contained phases only."
                : tab == "Memory" ? "Separate accounts. First sample and observed peaks are labelled."
                : resourceTotals
            )
        )
        left.Add(Container{Height: 28, FlexDirection: FlexDirection.Row, Children: headers})
        let rows = tableRows
        let heights = List[float64]()
        for row in rows {
            heights.Add(28.0)
        }
        left.Add(
            Virtual(ProfilerVirtualSource(heights, (index int32) -> TableRow(trace, rows[index]))){
                Key = "profiler-summary-rows",
                Height = 0,
                MinHeight = 0,
                FlexGrow = 1.0,
                OverflowX = Overflow.Hidden,
                ScrollbarVisibility = ScrollbarVisibility.Auto,
                Accessibility = Accessibility{Role: AccessibilityRole.Grid, Name: tab + " summary"},
            }
        )
        let panes = List[Blob]()
        panes.Add(
            Container{
                Key: "profiler-summary",
                Width: 0,
                FlexGrow: 1.0,
                MinWidth: 0,
                Height: Percent(100),
                FlexDirection: FlexDirection.Column,
                Children: left
            }
        )
        if selected >= 0 && selected < trace.Records.Count {
            panes.Add(DetailsDivider())
            panes.Add(
                Container{
                    Key: "profiler-details",
                    Width: DetailsWidth(),
                    Height: Percent(100),
                    FlexShrink: 0.0,
                    OverflowY: Overflow.Scroll,
                    FlexDirection: FlexDirection.Column,
                    ScrollbarVisibility: ScrollbarVisibility.Auto,
                    Children: Details(trace)
                }
            )
        }
        return Container{
            Key: "profiler-analysis",
            Width: Percent(100),
            Height: 280,
            MinHeight: 180,
            FlexShrink: 0.0,
            FlexDirection: FlexDirection.Row,
            BorderWidth: Edges{Top: 1},
            BorderColor: DevToolsTheme.Border,
            Children: panes
        }
    }

    private func FlexibleColumn(column int32) bool -> tab == "Resources" ? column == 3 || column == 5: column == 0

    private func NumericColumn(column int32) bool -> tab == "Resources" ? column == 0 ||
        column == 1 ||
        column == 4: column != 0

    private func ColumnWidth(column int32) float64 -> FlexibleColumn(column) ? 0.0
    : tab == "Memory" && column == 1 ? 140.0
    : tab == "Memory" && column == 4 ? 110.0
    : NumericColumn(column) ? 84.0: column == 2 ? 100.0: 140.0

    private func DetailsWidth() float64 -> Math.Clamp(detailsWidth, 280.0, Math.Max(280.0, width - 560.0))

    private func DetailsDivider() Container -> Container{
        Key: "profiler-details-divider",
        Width: 6,
        Height: Percent(100),
        FlexShrink: 0.0,
        Focusable: true,
        Focus: FocusStyle(),
        Cursor: Cursor.ResizeHorizontal,
        BackgroundColor: resizing ? DevToolsTheme.Accent: DevToolsTheme.Background,
        Hover: Style{BackgroundColor: DevToolsTheme.BorderStrong},
        Accessibility: Accessibility{Role: AccessibilityRole.Group, Name: "Resize profiler details"},
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
                detailsWidth = Math.Clamp(
                    resizeStartWidth + resizeStartX - e.WindowPosition.X,
                    280.0,
                    Math.Max(280.0, width - 560.0)
                )
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
                detailsWidth = Math.Clamp(
                    DetailsWidth() + (e.Key == Key.Left ? 16.0: -16.0),
                    280.0,
                    Math.Max(280.0, width - 560.0)
                )
                e.PreventDefault()
                Rebuild()
            }
        },
    }

    private func TableRow(trace ProfilerTrace, row ProfilerTableRow) Blob {
        let cells = List[Blob]()
        for column in 0 ... row.Cells.Length {
            cells.Add(
                Text{
                    Content: row.Cells[column],
                    Width: ColumnWidth(column),
                    FlexGrow: FlexibleColumn(column) ? 1.0: 0.0,
                    FlexShrink: 0.0,
                    MinWidth: 0,
                    TextAlign: NumericColumn(column) ? TextAlign.Right: TextAlign.Left,
                    Padding: Edges{Left: 5, Right: 5},
                    FontSize: 11,
                    Color: DevToolsTheme.InkMuted,
                    TextWrap: TextWrap.NoWrap,
                    TextTrimming: TextTrimming.Ellipsis,
                    Accessibility: Accessibility{Role: AccessibilityRole.GridCell}
                }
            )
        }
        return Button{
            Key: row.Record >= 0 ? "profiler-event-" + row.Record.ToString(): "summary-row-" + row.Cells[0],
            Height: 28,
            Width: Percent(100),
            FlexDirection: FlexDirection.Row,
            AlignItems: AlignItems.Center,
            BackgroundColor: selected >= 0 && row.Record == selected ? DevToolsTheme.Selection: DevToolsTheme.Surface,
            Focus: FocusStyle(),
            Accessibility: Accessibility{Role: AccessibilityRole.Row},
            OnClick: () -> {
                if row.Record >= 0 {
                    SelectRecord(trace, row.Record, true)
                }
            },
            Children: cells
        }
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
        resourceTotals = "Already-live baselines excluded from load totals."
        if tab == "Phases" {
            let groups = Dictionary[string, List[int32]]()
            for index in 0 ... trace.Records.Count {
                let r = trace.Records[index]
                if r.Kind != "duration" || r.EndTicks <= lo || r.Ticks >= hi || r.Resource != nil {
                    continue
                }
                if filterWindow != "" && r.Window != "" && r.Window != filterWindow {
                    continue
                }
                let name = LaneTitle(trace.EventName(r))
                if !groups.TryGetValue(name, out var list) {
                    list = List[int32]()
                    groups.Add(name, list)
                }
                list.Add(index)
            }
            var reconcile int64 = 0L
            var buildStyle int64 = 0L
            for pair in groups {
                var total int64 = 0L
                var maximum int64 = 0L
                var allocation uint64 = 0uL
                var measured = 0
                var incomplete = false
                for index in pair.Value {
                    let r = trace.Records[index]
                    let duration = Math.Min(hi, r.EndTicks) - Math.Max(lo, r.Ticks)
                    total += duration
                    maximum = Math.Max(maximum, duration)
                    if r.Ticks >= lo && r.EndTicks <= hi {
                        if let value = r.Allocated {
                            allocation += value
                            measured++
                        }
                    } else {
                        incomplete = true
                    }
                }
                if pair.Key == "Reconcile" {
                    reconcile += total
                }
                if pair.Key == "Build" || pair.Key == "StyleResolve" {
                    buildStyle += total
                }
                let count = pair.Value.Count
                rows.Add(
                    ProfilerTableRow(
                        []string{
                            pair.Key,
                            count.ToString(),
                            Time(trace, total),
                            (float64(total) / float64(Math.Max(1L, hi - lo)) * 100.0).ToString(
                                "G3",
                                CultureInfo.InvariantCulture
                            ) +
                                "%",
                            Time(trace, total / int64(count)),
                            Time(trace, maximum),
                            (measured == 0 ? "unmeasured": Bytes(float64(allocation))) +
                                (incomplete || measured < count ? " *": "")
                        },
                        []float64{
                            0.0,
                            float64(count),
                            float64(total),
                            float64(total),
                            float64(total) / float64(count),
                            float64(maximum),
                            measured == 0 ? -1.0: float64(allocation)
                        }
                    )
                )
            }
            if reconcile > 0L {
                let diff = Math.Max(0L, reconcile - buildStyle)
                rows.Add(
                    ProfilerTableRow(
                        []string{"Diff (derived)", "—", Time(trace, diff), "—", "—", "—", "—"},
                        []float64{0.0, 0.0, float64(diff), 0.0, 0.0, 0.0, -1.0}
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
                var firstSample = false
                var unit = ""
                for offset in 0 ... lane.Records.Count {
                    let r = trace.Records[lane.Records[offset]]
                    if r.Ticks > hi {
                        break
                    }
                    unit = lane.Name.StartsWith("managed.allocated", StringComparison.Ordinal) ? "bytes/s": r.Unit
                    let value = SeriesValue(trace, lane, offset)
                    if r.Ticks <= lo {
                        initial = value
                    }
                    if initial == nil && r.Ticks >= lo && value != nil {
                        initial = value
                        firstSample = true
                    }
                    final = value
                    if r.Ticks >= lo && value != nil {
                        peak = Math.Max(peak ?? 0.0, value)
                    }
                }
                if peak == nil {
                    peak = initial
                }
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
                            OptionalValue(initial, unit) + (firstSample ? " (first sample)": ""),
                            OptionalValue(final, unit),
                            delta == nil ? "unmeasured": SignedValue(delta ?? 0.0, unit),
                            OptionalValue(peak, unit)
                        },
                        []float64{0.0, initial ?? -1.0, final ?? -1.0, delta ?? -1.0, peak ?? -1.0}
                    )
                )
            }
        } else {
            let totals = Dictionary[string, uint64]()
            for index in 0 ... trace.Records.Count {
                let r = trace.Records[index]
                if r.Resource == nil || r.Ticks < lo || r.Ticks > hi {
                    continue
                }
                let kind = trace.ResourceName(r.ResourceKind)
                let baseline = r.Kind == "resourcebaseline"
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
                if !baseline && r.Payload != nil {
                    totals[kind] = (totals.TryGetValue(kind, out var old) ? old: 0uL) + (r.Payload ?? 0uL)
                }
                rows.Add(
                    ProfilerTableRow(
                        []string{
                            Time(trace, r.Ticks),
                            durationText,
                            kind,
                            name,
                            bytes == nil ? "unmeasured": Bytes(float64(bytes ?? 0uL)),
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
                        index
                    )
                )
            }
            let labels = List[string]()
            for pair in totals {
                labels.Add(pair.Key + " " + Bytes(float64(pair.Value)))
            }
            resourceTotals = "Loads: " + String.Join(" · ", labels) + " (excludes already-live baselines)"
        }
        rows.Sort(
            (a ProfilerTableRow, b ProfilerTableRow) -> {
                let numeric = tab == "Resources" ? sortColumn == 0 ||
                    sortColumn == 1 ||
                    sortColumn == 4 ||
                    sortColumn == 6
                : sortColumn != 0
                let order = numeric ? a.Values[sortColumn].CompareTo(b.Values[sortColumn]): String.Compare(
                    a.Cells[sortColumn],
                    b.Cells[sortColumn],
                    StringComparison.Ordinal
                )
                return descending ? -order: order
            }
        )
        tableRows = rows
    }

    private func Details(trace ProfilerTrace) List[Blob] {
        let rows = List[Blob]()
        if selected < 0 || selected >= trace.Records.Count {
            return rows
        }
        let r = trace.Records[selected]
        rows.Add(
            Text{
                Content: LaneTitle(trace.EventName(r)),
                FontSize: 13,
                FontWeight: 600,
                Color: DevToolsTheme.Ink,
                Padding: 8
            }
        )
        rows.Add(Detail("Start", Time(trace, r.Ticks)))
        rows.Add(
            Detail(
                "Duration",
                r.GpuNs != nil ? TimeNs(float64(r.GpuNs ?? 0uL)) +
                    " (GPU, unaligned)": Time(trace, r.EndTicks - r.Ticks)
            )
        )
        rows.Add(Detail("End", Time(trace, r.EndTicks)))
        if r.Window != "" {
            rows.Add(Detail("Window", WindowTitle(r.Window)))
        }
        if let pump = r.Pump {
            rows.Add(Detail("Pump", pump.ToString()))
        }
        if let frame = r.Frame {
            rows.Add(Detail("Frame", frame.ToString()))
        }
        if let submission = r.Submission {
            rows.Add(Detail("Submission", submission.ToString()))
        }
        rows.Add(Detail("Result", Result(r)))
        if r.Resource != nil {
            rows.Add(Detail("Kind", trace.ResourceName(r.ResourceKind)))
            let owner = trace.OwnerChain(r)
            if owner != "" {
                rows.Add(Detail("Owner", owner))
            }
            rows.Add(Detail("Resource", r.Resource.ToString() + " · generation " + r.ResourceGeneration.ToString()))
            if r.Width != nil && r.Height != nil {
                rows.Add(Detail("Dimensions", r.Width.ToString() + " × " + r.Height.ToString()))
            }
            if r.Payload != nil {
                rows.Add(Detail("Payload", Bytes(float64(r.Payload ?? 0uL))))
            }
            if r.Requirement != nil {
                rows.Add(Detail("Requirement", Bytes(float64(r.Requirement ?? 0uL))))
            }
            if r.Placement != nil {
                rows.Add(Detail("Placement", Bytes(float64(r.Placement ?? 0uL))))
            }
            if r.Block != nil {
                rows.Add(Detail("Block", Bytes(float64(r.Block ?? 0uL))))
            }
            if let flags = r.HeapFlags {
                rows.Add(Detail("Heap", (flags & 1uL) != 0uL ? "Device-local": "Host-visible/shared"))
            }
            if let dedicated = r.Dedicated {
                rows.Add(Detail("Dedicated", dedicated ? "Yes": "No"))
            }
            if r.Kind == "resourcebaseline" {
                rows.Add(Detail("Lifetime", "Live before recording. Creation time is unknown."))
            }
            if trace.ResourceRetired.TryGetValue(r.Resource ?? 0uL, out var retired) {
                rows.Add(Detail("Retired", Time(trace, retired)))
            }
            if trace.ResourceReleased.TryGetValue(r.Resource ?? 0uL, out var released) {
                rows.Add(Detail("Released", Time(trace, released)))
            }
        }
        if r.Kind == "counter" {
            if let value = r.Value {
                rows.Add(Detail("Value", Value(float64(value), r.Unit)))
            }
            if r.Source != "" {
                rows.Add(Detail("Source", r.Source))
            }
            if r.Validity != "" {
                rows.Add(Detail("Validity", r.Validity))
            }
            if let sampled = r.SampleTicks {
                rows.Add(Detail("Sample age", Time(trace, Math.Max(0L, r.Ticks - sampled))))
            }
        }
        if r.Allocated != nil {
            rows.Add(Detail("Allocation traffic", Bytes(float64(r.Allocated ?? 0uL))))
        }
        if r.X != nil && r.Y != nil {
            rows.Add(Detail("Damage origin", r.X.ToString() + ", " + r.Y.ToString()))
        }
        if let scene = r.Scene {
            rows.Add(Detail("Scene", scene.ToString()))
        }
        if trace.Partial {
            rows.Add(Detail("Continuity", "Unknown across dropped or missing data"))
        }
        return rows
    }

    private func Hit(trace ProfilerTrace, lane ProfilerLane, tick int64, y float64) {
        var best = int64.MaxValue
        var found = -1
        for offset in lane.FirstVisible(start) ... lane.Records.Count {
            let r = trace.Records[lane.Records[offset]]
            if r.Ticks > end {
                break
            }
            if (lane.Group == "CPU" || lane.Group == "Queue") &&
                int32(Math.Max(0.0, y - 3.0) / 16.0) != lane.Depth[offset] {
                continue
            }
            let distance = tick >= r.Ticks && tick <= r.EndTicks ? 0L: Math.Min(
                Math.Abs(tick - r.Ticks),
                Math.Abs(tick - r.EndTicks)
            )
            if distance < best {
                best = distance
                found = lane.Records[offset]
            }
        }
        if found >= 0 {
            SelectRecord(trace, found, false)
        }
    }

    private func SelectRecord(trace ProfilerTrace, index int32, zoom bool) {
        selected = index
        let r = trace.Records[index]
        selectionStart = r.Ticks
        selectionEnd = Math.Max(r.Ticks + 1L, r.EndTicks)
        if zoom {
            let padding = Math.Max(trace.Frequency / 1000L, (selectionEnd - selectionStart) / 4L)
            start = Math.Max(0L, selectionStart - padding)
            end = selectionEnd + padding
            Changed()
        } else {
            Rebuild()
        }
    }

    private func BeginSelection(e PointerEvent) {
        if e.Button != PointerButton.Primary {
            return
        }
        e.Capture()
        selecting = true
        anchor = Tick(e.Position.X)
        selectionStart = anchor
        selectionEnd = anchor
        selected = -1
    }

    private func MoveSelection(e PointerEvent) {
        if selecting {
            let tick = Tick(e.Position.X)
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
            selected = -1
            selectionStart = 0L
            selectionEnd = 0L
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

    private func Zoom(scale float64, fraction float64) {
        let span = Math.Max(1L, int64(float64(end - start) * scale))
        let center = start + int64(float64(end - start) * fraction)
        start = Math.Max(0L, center - int64(float64(span) * fraction))
        end = start + span
        Changed()
    }

    private func Changed() {
        follow = false
        paths.Clear()
        scales.Clear()
        tableKey = ""
        Rebuild()
    }

    private func PlotWidth() float64 -> Math.Max(100.0, width - 242.0)

    private func X(tick int64) float64 -> float64(tick - start) / float64(Math.Max(1L, end - start)) * PlotWidth()

    private func Tick(x float64) int64 -> start + int64(Math.Clamp(x / PlotWidth(), 0.0, 1.0) * float64(end - start))

    shared {
        private func IsMore(lane ProfilerLane) bool -> !(
            lane.Name.StartsWith("managed.heap.estimate", StringComparison.Ordinal)
            || lane.Name.StartsWith("managed.allocated.total", StringComparison.Ordinal)
            || lane.Name.StartsWith("process.", StringComparison.Ordinal)
            || lane.Name.StartsWith("driver.heap.", StringComparison.Ordinal)
        )

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

        private func FocusStyle() Style -> Style{OutlineWidth: 1, OutlineColor: DevToolsTheme.Accent}

        private func Control(key string, text string, action Action, enabled bool = true) Button -> Button{
            Key: key,
            Height: 28,
            Padding: Edges{Left: 9, Right: 9},
            BackgroundColor: DevToolsTheme.SurfaceRaised,
            Hover: Style{BackgroundColor: DevToolsTheme.SurfaceStrong},
            Active: Style{BackgroundColor: DevToolsTheme.Selection},
            Focus: FocusStyle(),
            Disabled: !enabled,
            OnClick: action,
            Label(text),
        }

        private func Toggle(key string, text string, active bool, action Action) Button -> Button{
            Key: key,
            Height: 28,
            Padding: Edges{Left: 9, Right: 9},
            BackgroundColor: active ? DevToolsTheme.Selection: DevToolsTheme.Surface,
            Focus: FocusStyle(),
            OnClick: action,
            Accessibility: Accessibility{
                Role: AccessibilityRole.Switch,
                Name: text,
                Checked: active ? AccessibilityChecked.True: AccessibilityChecked.False
            },
            Label(text),
        }

        private func Label(text string) Text -> Text{
            Content: text,
            FontSize: 11,
            Color: DevToolsTheme.InkMuted,
            TextWrap: TextWrap.NoWrap,
            TextTrimming: TextTrimming.Ellipsis
        }

        private func Column(key string, children List[Blob]) Container -> Container{
            Key: key,
            Width: Percent(100),
            Height: 0,
            MinHeight: 0,
            FlexGrow: 1.0,
            FlexDirection: FlexDirection.Column,
            Children: children
        }

        private func Detail(label string, value string) Container -> Container{
            Key: "detail-" + label,
            Width: Percent(100),
            MinHeight: 28,
            Padding: Edges{Left: 8, Right: 8, Top: 4, Bottom: 4},
            FlexDirection: FlexDirection.Row,
            Gap: 8,
            BorderWidth: Edges{Bottom: 1},
            BorderColor: DevToolsTheme.Border,
            Text{Content: label, Width: Percent(32), FontSize: 11, Color: DevToolsTheme.InkSubtle},
            Text{
                Content: value,
                Width: 0,
                MinWidth: 0,
                FlexGrow: 1.0,
                FontSize: 11,
                Color: DevToolsTheme.Ink,
                TextWrap: TextWrap.Wrap
            }
        }

        private func PathShape(path VectorPath, color Color, width float64, height float64) Shape -> Shape{
            Position: PositionType.Absolute,
            Left: 0,
            Top: 0,
            Width: width,
            Height: height,
            Path: path,
            Fit: ShapeFit.Fill,
            BackgroundColor: color
        }

        private func OwnerColors()[]Color -> []Color{
            DevToolsTheme.InkSubtle,
            DevToolsTheme.Accent,
            DevToolsTheme.Green,
            DevToolsTheme.Amber,
            DevToolsTheme.Red,
            Color.Rgb(174, 144, 214),
            Color.Rgb(104, 190, 199),
            Color.Rgb(214, 164, 134)
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
                return "unmeasured"
            }
            return Value(actual, unit)
        }

        private func SignedValue(value float64, unit string) string -> (value > 0.0 ? "+": "") + Value(value, unit)
    }
}

internal class ProfilerVirtualSource : VirtualSource {
    internal let Heights List[float64]
    internal let Render Func[int32, Blob]
    internal init(heights List[float64], render Func[int32, Blob]) {
        Heights = heights
        Render = render
    }

    public func State(current VirtualState?) VirtualState -> ProfilerVirtualState(this)
}

internal class ProfilerVirtualState : VirtualState {
    private let source ProfilerVirtualSource
    private let offsets List[float64] = List[float64]()
    private var first int32 = -1
    private var last int32 = -1
    private var pendingFirst int32
    private var pendingLast int32
    internal init(value ProfilerVirtualSource) {
        source = value
        offsets.Add(0.0)
        for height in source.Heights {
            offsets.Add(offsets[offsets.Count - 1] + height)
        }
    }

    private func Index(y float64) int32 {
        var lo = 0
        var hi = source.Heights.Count
        while lo < hi {
            let mid = lo + (hi - lo) / 2
            if offsets[mid + 1] < y {
                lo = mid + 1
            } else {
                hi = mid
            }
        }
        return lo
    }

    public override func Realize(viewport VirtualViewport, output VirtualOutput) {
        pendingFirst = Math.Max(0, Index(viewport.ScrollOffset.Y) - 1)
        pendingLast = Math.Min(source.Heights.Count, Index(viewport.ScrollOffset.Y + viewport.Size.Height) + 2)
        output.ContentSize = LayoutSize{Width: viewport.Size.Width, Height: offsets[offsets.Count - 1]}
        output.ItemCount = source.Heights.Count
        for index in pendingFirst ... pendingLast {
            let content = source.Render(index)
            output.Add(
                VirtualItem{
                    Key: content.Key ?? index.ToString(),
                    Index: index,
                    X: 0.0,
                    Y: offsets[index],
                    Width: viewport.Size.Width,
                    Height: source.Heights[index],
                    Content: content
                }
            )
        }
    }

    public override func NeedsRealize(viewport VirtualViewport) bool -> first != Math.Max(
        0,
        Index(viewport.ScrollOffset.Y) - 1
    )
    || last != Math.Min(source.Heights.Count, Index(viewport.ScrollOffset.Y + viewport.Size.Height) + 2)

    public override func Commit() {
        first = pendingFirst
        last = pendingLast
    }
}
