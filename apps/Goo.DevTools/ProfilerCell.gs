package GooDevTools

import Goo
import System
import System.Collections.Generic
import System.Globalization
import System.Text

internal class ProfilerCell : Cell {
    internal var session DiagnosticSession
    private var width float64 = 1500.0
    private var start int64
    private var end int64 = 1L
    private var selectionStart int64
    private var selectionEnd int64
    private var selected int32 = -1
    private var selecting bool
    private var anchor int64
    private var movingOverview bool
    private var overviewX float64
    private var overviewStart int64
    private var firstTrack int32
    private var filterWindow string = ""
    private var follow bool = true
    private var lifetimes bool
    private var showOwnerStack bool
    private var expandedResource string = ""
    private var expandedRevision int32 = -1
    private var resourceChildren List[ProfilerLane]?
    private var revision int32 = -1
    private let hidden HashSet[string] = HashSet[string]()
    private let paths Dictionary[string, VectorPath] = Dictionary[string, VectorPath]()

    internal func Refresh(value float64) {
        var changed = false
        if width != value {
            width = value
            paths.Clear()
            changed = true
        }
        if let trace = session.Profiler {
            if revision != trace.Revision {
                revision = trace.Revision
                changed = true
                paths.Clear()
                if follow {
                    let span = Math.Max(end - start, trace.Frequency * 2L)
                    end = Math.Max(1L, trace.End)
                    start = Math.Max(0L, end - span)
                }
            }
        }
        if changed {
            Rebuild()
        }
    }

    override func Build() Blob {
        let children = List[Blob]()
        let toolbar = List[Blob]()
        let active = session.Profiler?.Active == true
        toolbar.Add(
            Control(
                "profiler-record",
                active ? "Stop": "Record",
                () -> {
                    if active {
                        session.StopProfiler()
                    } else {
                        session.StartProfiler()
                        resourceChildren = nil
                        expandedRevision = -1
                        revision = -1
                        selected = -1
                        selectionStart = 0L
                        selectionEnd = 0L
                        follow = true
                    }
                    Rebuild()
                },
                session.Capabilities.ProfilerTrace && session.State == DiagnosticConnectionState.Connected
            )
        )
        toolbar.Add(
            Control(
                "profiler-clear",
                "Clear",
                () -> {
                    session.ClearProfiler()
                    resourceChildren = nil
                    expandedRevision = -1
                    selected = -1
                    selectionEnd = 0L
                    paths.Clear()
                    Rebuild()
                },
                !active
            )
        )
        toolbar.Add(Control("profiler-window", filterWindow == "" ? "All windows": filterWindow, () -> CycleWindow()))
        toolbar.Add(Control("profiler-fit", "Fit", () -> Fit()))
        toolbar.Add(
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
        toolbar.Add(Control("profiler-zoom-in", "+", () -> Zoom(0.5, 0.5)))
        toolbar.Add(Control("profiler-zoom-out", "-", () -> Zoom(2.0, 0.5)))
        toolbar.Add(Control("profiler-pan-left", "Pan left", () -> Pan(-0.25)))
        toolbar.Add(Control("profiler-pan-right", "Pan right", () -> Pan(0.25)))
        toolbar.Add(
            Control(
                "profiler-follow",
                follow ? "Follow: on": "Follow: off",
                () -> {
                    follow = !follow
                    Rebuild()
                }
            )
        )
        toolbar.Add(
            Control(
                "profiler-lifetimes",
                lifetimes ? "Resource lifetimes": "Resource load events",
                () -> {
                    lifetimes = !lifetimes
                    paths.Clear()
                    Rebuild()
                }
            )
        )
        toolbar.Add(
            Control(
                "profiler-owner-stack",
                showOwnerStack ? "Hide owner stack": "Show owner stack",
                () -> {
                    showOwnerStack = !showOwnerStack
                    Rebuild()
                }
            )
        )
        children.Add(Row("profiler-toolbar", toolbar))
        let categories = List[Blob]()
        for group in[]string{"Frames", "CPU", "Queue", "GPU", "Memory", "Resources"} {
            let current = group
            categories.Add(
                Control(
                    "profiler-category-" + current,
                    (hidden.Contains(current) ? "Show ": "Hide ") + current,
                    () -> {
                        if !hidden.Remove(current) {
                            hidden.Add(current)
                        }
                        firstTrack = 0
                        Rebuild()
                    }
                )
            )
        }
        categories.Add(Label("Visibility filters. GPU elapsed values are not CPU-aligned execution bars."))
        children.Add(Row("profiler-categories", categories))
        guard let trace = session.Profiler else {
            children.Add(
                Label(
                    session
                        .Capabilities
                        .ProfilerTrace ? "Record a real target trace to inspect instrumented phases, memory and resource loads."
                    : "Recording unavailable: this target does not advertise profiler.trace.v1."
                )
            )
            return Column("profiler-panel", children)
        }
        children.Add(
            Label(
                trace.State + (trace.Partial ? " / PARTIAL": "") + " / " + trace.Records.Count.ToString()
                + " records / " + trace.Dropped.ToString() +
                    " dropped / " +
                    Bytes(uint64(trace.RetainedBytes)) +
                    " of 128 MiB UI budget / " +
                    trace.Process
            )
        )
        if trace.Reason != "" {
            children.Add(Label(trace.Reason))
        }
        children.Add(Overview(trace))
        children.Add(
            Label(
                Time(trace, start) +
                    "  to  " +
                    Time(trace, end) +
                    "    Wheel: zoom at cursor. Shift-wheel: pan. Drag: select range. Click: event details."
            )
        )
        let ruler = List[Blob]()
        for mark in 0 ... 6 {
            ruler.Add(Label(Time(trace, start + (end - start) * int64(mark) / 5L)))
        }
        children.Add(
            Container{
                Key: "profiler-ruler",
                Margin: Edges{Left: 310},
                Width: PlotWidth(),
                Height: 24,
                FlexDirection: FlexDirection.Row,
                JustifyContent: JustifyContent.SpaceBetween,
                Children: ruler,
                OnPointerDown: (e PointerEvent) -> {
                    if e.Button != PointerButton.Primary {
                        return
                    }
                    e.Capture()
                    anchor = Tick(e.Position.X)
                    selectionStart = anchor
                    selectionEnd = anchor
                    selected = -1
                    selecting = true
                },
                OnPointerMove: (e PointerEvent) -> {
                    if selecting {
                        let tick = Tick(e.Position.X)
                        selectionStart = Math.Min(anchor, tick)
                        selectionEnd = Math.Max(anchor, tick)
                        Rebuild()
                    }
                },
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
        )
        let visible = List[ProfilerLane]()
        for group in[]string{"Frames", "CPU", "Queue", "GPU", "Memory", "Resources"} {
            for lane in trace.Lanes {
                if lane.Group == group && !hidden.Contains(lane.Group)
                && (filterWindow == "" || lane.Window == "" || lane.Window == filterWindow) {
                    visible.Add(lane)
                    if lane.Group == "Resources" && expandedResource == lane.Name {
                        for child in ResourceChildren(trace, lane) {
                            visible.Add(child)
                        }
                    }
                }
            }
        }
        firstTrack = Math.Clamp(firstTrack, 0, Math.Max(0, visible.Count - 9))
        let navigation = List[Blob]()
        navigation.Add(
            Control(
                "profiler-tracks-up",
                "Tracks up",
                () -> {
                    firstTrack = Math.Max(0, firstTrack - 9)
                    Rebuild()
                }
            )
        )
        navigation.Add(
            Control(
                "profiler-tracks-down",
                "Tracks down",
                () -> {
                    firstTrack = Math.Min(Math.Max(0, visible.Count - 9), firstTrack + 9)
                    Rebuild()
                }
            )
        )
        navigation.Add(
            Label(
                "Tracks " + Math.Min(firstTrack + 1, visible.Count).ToString() + "-" + Math.Min(
                    firstTrack + 9,
                    visible.Count
                )
                    .ToString() + " of " + visible.Count.ToString()
            )
        )
        children.Add(Row("profiler-track-navigation", navigation))
        if showOwnerStack && !hidden.Contains("Memory") {
            for device in trace.DeviceIds {
                children.Add(OwnerStack(trace, device))
            }
        }
        for i in firstTrack ... Math.Min(firstTrack + 9, visible.Count) {
            children.Add(Lane(trace, visible[i]))
        }
        let lower = List[Blob]()
        lower.Add(
            Text{
                Key: "profiler-summary",
                Content: Summary(trace),
                FontSize: 11,
                Color: DevToolsTheme.Ink,
                Width: Percent(62),
                TextWrap: TextWrap.Wrap
            }
        )
        lower.Add(
            Text{
                Key: "profiler-details",
                Content: Details(trace),
                FontSize: 11,
                Color: DevToolsTheme.InkMuted,
                Width: Percent(38),
                TextWrap: TextWrap.Wrap
            }
        )
        children.Add(
            Container{
                Key: "profiler-analysis",
                Height: 0,
                MinHeight: 140,
                FlexGrow: 1.0,
                OverflowY: Overflow.Scroll,
                BackgroundColor: DevToolsTheme.Surface,
                Padding: 10,
                FlexDirection: FlexDirection.Row,
                Children: lower
            }
        )
        return Column("profiler-panel", children)
    }

    private func Overview(trace ProfilerTrace) Container {
        let total = Math.Max(1L, trace.End)
        let w = PlotWidth()
        let path = PathBuilder(0.0, 0.0, w, 22.0)
        Rect(
            path,
            float64(start) / float64(total) * w,
            1.0,
            Math.Max(2.0, float64(end - start) / float64(total) * w),
            20.0
        )
        return Container{
            Key: "profiler-overview",
            Height: 24,
            Width: w,
            Margin: Edges{Left: 310},
            BackgroundColor: DevToolsTheme.SurfaceStrong,
            OnPointerDown: (e PointerEvent) -> {
                if e.Button != PointerButton.Primary {
                    return
                }
                e.Capture()
                movingOverview = true
                overviewX = e.Position.X
                let center = int64(Math.Clamp(e.Position.X / w, 0.0, 1.0) * float64(total))
                let span = end - start
                start = Math.Max(0L, center - span / 2L)
                end = start + span
                overviewStart = start
                Changed()
            },
            OnPointerMove: (e PointerEvent) -> {
                if movingOverview {
                    let span = end - start
                    start = Math.Max(0L, overviewStart + int64((e.Position.X - overviewX) / w * float64(total)))
                    end = start + span
                    Changed()
                }
            },
            OnPointerUp: (e PointerEvent) -> {
                movingOverview = false
                e.ReleaseCapture()
            },
            OnPointerCancel: (e PointerEvent) -> {
                movingOverview = false
                e.ReleaseCapture()
            },
            Shape{
                Width: w,
                Height: 22,
                Path: path.Build(),
                Fit: ShapeFit.Fill,
                BackgroundColor: DevToolsTheme.Selection
            },
        }
    }

    private func OwnerStack(trace ProfilerTrace, device uint64) Container {
        let prefix = "owner-stack-" + device.ToString() + "-"
        if !paths.ContainsKey(prefix + "0") {
            let indices = List[int32]()
            for lane in trace.Lanes {
                if lane.Group != "Memory" {
                    continue
                }
                for index in lane.Records {
                    let r = trace.Records[index]
                    if r.Device == device && r.Ticks <= end
                    && (r.Name == "vulkan.live.requirements" || r.Name == "vulkan.retired.requirements") {
                        indices.Add(index)
                    }
                }
            }
            indices.Sort((a int32, b int32) -> trace.Records[a].Ticks.CompareTo(trace.Records[b].Ticks))
            indices.Add(-1)
            let builders = [16]PathBuilder
            for i in 0 ... 16 {
                builders[i] = PathBuilder(0.0, 0.0, PlotWidth(), 34.0)
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
                            let x = float64(Math.Max(previous, start) - start) / float64(
                                Math.Max(1L, end - start)
                            ) * PlotWidth()
                            let right = float64(Math.Min(tick, end) - start) / float64(
                                Math.Max(1L, end - start)
                            ) * PlotWidth()
                            var bottom = 32.0
                            for slot in 0 ... 16 {
                                let height = float64(values[slot]) / maximum * 30.0
                                if height > 0.0 && right > x {
                                    Rect(builders[slot], x, bottom - height, right - x, height)
                                }
                                bottom -= height
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
                                let slot = int32(owner) * 2 + (r.Name == "vulkan.retired.requirements" ? 1: 0)
                                values[slot] = value
                                sampled = true
                            }
                        }
                    }
                    previous = tick
                }
            }
            for slot in 0 ... 16 {
                paths[prefix + slot.ToString()] = builders[slot].Build()
            }
        }
        let shapes = List[Blob]()
        let colors = []Color{
            DevToolsTheme.InkSubtle,
            DevToolsTheme.Accent,
            DevToolsTheme.Green,
            DevToolsTheme.Amber,
            DevToolsTheme.Red,
            Color.Rgb(174, 144, 214),
            Color.Rgb(104, 190, 199),
            Color.Rgb(214, 164, 134)
        }
        for slot in 0 ... 16 {
            shapes.Add(
                Shape{
                    Width: PlotWidth(),
                    Height: 34,
                    Position: PositionType.Absolute,
                    Left: 0,
                    Top: 0,
                    Path: paths[prefix + slot.ToString()],
                    Fit: ShapeFit.Fill,
                    BackgroundColor: colors[slot / 2],
                    Opacity: slot % 2 == 0 ? 1.0: 0.45
                }
            )
        }
        return Container{
            Key: prefix,
            Width: Percent(100),
            Height: 52,
            FlexShrink: 0.0,
            FlexDirection: FlexDirection.Row,
            Container{
                Width: 310,
                Height: 52,
                FlexDirection: FlexDirection.Column,
                Label("Goo requirement bytes, live + retired / device " + device.ToString()),
                Label("Unknown, LayerTarget, Glyph/Path/Clip atlas, Staging, Image, Buffer. Retired: dim."),
            },
            Container{Width: PlotWidth(), Height: 34, Position: PositionType.Relative, Children: shapes},
        }
    }

    private func ResourceChildren(trace ProfilerTrace, parent ProfilerLane) List[ProfilerLane] {
        if expandedRevision != trace.Revision || resourceChildren == nil {
            let byId = Dictionary[uint64, ProfilerLane]()
            let children = List[ProfilerLane]()
            for index in parent.Records {
                let r = trace.Records[index]
                guard let id = r.Resource else {
                    continue
                }
                if !byId.TryGetValue(id, out var child) {
                    var label = id.ToString()
                    if trace.ResourceNames.TryGetValue(id, out var name) {
                        label += " / " + name
                    }
                    child = ProfilerLane("  " + label, "Resources", "")
                    children.Add(child)
                    byId.Add(id, child)
                }
                child.Records.Add(index)
                child.Dirty = true
            }
            for child in children {
                child.Prepare(trace.Records)
            }
            resourceChildren = children
            expandedRevision = trace.Revision
        }
        return resourceChildren!!
    }

    private func Lane(trace ProfilerTrace, lane ProfilerLane) Container {
        let graphWidth = PlotWidth()
        let key = lane.Group + lane.Name + lane.Window
        if !paths.TryGetValue(key, out var geometry) {
            let path = PathBuilder(0.0, 0.0, graphWidth, 34.0)
            let first = lifetimes && lane.Group == "Resources" ? 0: lane.FirstVisible(start)
            var maximum uint64 = 1uL
            if lane.Group == "Memory" {
                for offset in first ... lane.Records.Count {
                    let r = trace.Records[lane.Records[offset]]
                    if r.Ticks > end {
                        break
                    }
                    if let value = r.Value {
                        maximum = Math.Max(maximum, value)
                    }
                }
            }
            var lastPixel = -1
            for offset in first ... lane.Records.Count {
                let r = trace.Records[lane.Records[offset]]
                if r.Ticks > end {
                    break
                }
                var intervalStart = r.Ticks
                var intervalEnd = r.EndTicks
                if lifetimes && lane.Group == "Resources" {
                    if r.Kind != "resourcebaseline" &&
                        !(r.Kind == "resourcelifecycle" && (r.Event == 200 || r.Event == 220 || r.Event == 120)) {
                        continue
                    }
                    if r.Kind == "resourcebaseline" {
                        intervalStart = 0L
                    }
                    intervalEnd = trace.End
                    if let resource = r.Resource {
                        if trace.ResourceReleased.TryGetValue(resource, out var released) {
                            intervalEnd = released
                        }
                    }
                    if intervalEnd < start {
                        continue
                    }
                }
                let x = Math.Clamp(
                    float64(intervalStart - start) / float64(Math.Max(1L, end - start)) * graphWidth,
                    0.0,
                    graphWidth - 1.0
                )
                let right = Math.Clamp(
                    float64(intervalEnd - start) / float64(Math.Max(1L, end - start)) * graphWidth,
                    x + 1.0,
                    graphWidth
                )
                if lane.Group == "Memory" {
                    if let value = r.Value {
                        let height = Math.Max(1.0, float64(value) / float64(maximum) * 28.0)
                        Rect(path, x, 32.0 - height, 2.0, height)
                    }
                } else if int32(x) != lastPixel || right - x > 2.0 {
                    Rect(
                        path,
                        x,
                        r.Kind == "duration" ? 7.0: 12.0,
                        Math.Max(2.0, right - x),
                        r.Kind == "duration" ? 20.0: 10.0
                    )
                }
                lastPixel = int32(x)
            }
            geometry = path.Build()
            paths[key] = geometry
        }
        let labels = List[Blob]()
        labels.Add(Label(lane.Group + " / " + lane.Name + (lane.Window == "" ? "": " / " + lane.Window)))
        if lane.Group == "Memory" && lane.Records.Count > 0 {
            let latest = trace.Records[lane.Records[lane.Records.Count - 1]]
            labels.Add(
                Label(
                    (
                        latest.Value == nil ? "unavailable": latest.Unit == "bytes" ? Bytes(latest.Value): latest
                            .Value
                            .ToString()
                    )
                    + " / " + latest.Validity + " / " + latest.Source
                    + (latest.Value1 == nil ? "": " / allocations " + latest.Value1.ToString())
                )
            )
        }
        return Container{
            Key: "lane-" + key,
            Width: Percent(100),
            Height: 42,
            FlexShrink: 0.0,
            FlexDirection: FlexDirection.Row,
            BorderWidth: Edges{Bottom: 1},
            BorderColor: DevToolsTheme.Border,
            Container{
                Width: 310,
                Height: 42,
                Overflow: Overflow.Hidden,
                FlexDirection: FlexDirection.Column,
                Children: labels,
                OnPointerUp: (e PointerEvent) -> {
                    if lane.Group == "Resources" && !lane.Name.StartsWith("  ", StringComparison.Ordinal) {
                        expandedResource = expandedResource == lane.Name ? "": lane.Name
                        resourceChildren = nil
                        e.PreventDefault()
                        Rebuild()
                    }
                },
                OnWheel: (e WheelEvent) -> {
                    e.PreventDefault()
                    firstTrack = Math.Max(0, firstTrack + (e.Delta.Y > 0.0 ? -1: 1))
                    Rebuild()
                }
            },
            Container{
                Key: "plot-" + key,
                Width: graphWidth,
                Height: 34,
                Focusable: true,
                Position: PositionType.Relative,
                BackgroundColor: DevToolsTheme.Surface,
                OnWheel: (e WheelEvent) -> {
                    e.PreventDefault()
                    if e.Modifiers.Shift {
                        Pan(e.Delta.Y > 0.0 ? -0.1: 0.1)
                    } else {
                        Zoom(e.Delta.Y > 0.0 ? 0.8: 1.25, Math.Clamp(e.Position.X / graphWidth, 0.0, 1.0))
                    }
                },
                OnPointerDown: (e PointerEvent) -> {
                    if e.Button != PointerButton.Primary {
                        return
                    }
                    e.Capture()
                    e.PreventDefault()
                    selecting = true
                    anchor = Tick(e.Position.X)
                    selectionStart = anchor
                    selectionEnd = anchor
                    selected = -1
                },
                OnPointerMove: (e PointerEvent) -> {
                    if selecting {
                        let tick = Tick(e.Position.X)
                        selectionStart = Math.Min(anchor, tick)
                        selectionEnd = Math.Max(anchor, tick)
                        Rebuild()
                    }
                },
                OnPointerUp: (e PointerEvent) -> {
                    if !selecting {
                        return
                    }
                    e.ReleaseCapture()
                    selecting = false
                    if selectionEnd - selectionStart < Math.Max(1L, (end - start) / int64(graphWidth) * 3L) {
                        Select(trace, lane, Tick(e.Position.X))
                    }
                    Rebuild()
                },
                OnPointerCancel: (e PointerEvent) -> {
                    selecting = false
                    e.ReleaseCapture()
                },
                OnKeyDown: (e KeyEvent) -> {
                    if e.Key == Key.Equal || e.Key == Key.KeypadAdd {
                        Zoom(0.5, 0.5)
                        e.PreventDefault()
                    }
                    if e.Key == Key.Minus || e.Key == Key.KeypadSubtract {
                        Zoom(2.0, 0.5)
                        e.PreventDefault()
                    }
                    if e.Key == Key.Left {
                        Pan(-0.1)
                        e.PreventDefault()
                    }
                    if e.Key == Key.Right {
                        Pan(0.1)
                        e.PreventDefault()
                    }
                    if e.Key == Key.Escape {
                        selected = -1
                        selectionStart = 0L
                        selectionEnd = 0L
                        Rebuild()
                        e.PreventDefault()
                    }
                },
                Shape{
                    Width: graphWidth,
                    Height: 34,
                    Path: geometry,
                    Fit: ShapeFit.Fill,
                    Position: PositionType.Absolute,
                    Left: 0,
                    Top: 0,
                    BackgroundColor: lane.Group == "Memory" ? DevToolsTheme.Green: lane.Group == "Resources" ? DevToolsTheme.Amber: DevToolsTheme.Accent
                },
                Shape{
                    Width: graphWidth,
                    Height: 34,
                    Path: SelectionPath(),
                    Fit: ShapeFit.Fill,
                    Position: PositionType.Absolute,
                    Left: 0,
                    Top: 0,
                    BackgroundColor: Color.Transparent,
                    BorderColor: DevToolsTheme.Amber,
                    BorderWidth: 1
                },
            },
        }
    }

    private func SelectionPath() VectorPath {
        if selectionEnd <= start || selectionStart >= end || selectionEnd <= selectionStart {
            return VectorPath.Empty
        }
        let w = PlotWidth()
        let left = Math.Max(0.0, float64(selectionStart - start) / float64(end - start) * w)
        let right = Math.Min(w, float64(selectionEnd - start) / float64(end - start) * w)
        let path = PathBuilder(0.0, 0.0, w, 34.0)
        Rect(path, left, 1.0, Math.Max(1.0, right - left), 32.0)
        return path.Build()
    }

    private func Select(trace ProfilerTrace, lane ProfilerLane, tick int64) {
        var best int64 = int64.MaxValue
        let first = lifetimes && lane.Group == "Resources" ? 0: lane.FirstVisible(start)
        for offset in first ... lane.Records.Count {
            let index = lane.Records[offset]
            let r = trace.Records[index]
            if r.Ticks > end {
                break
            }
            var a = r.Ticks
            var z = r.EndTicks
            if lifetimes && lane.Group == "Resources" {
                if r.Kind != "resourcebaseline" &&
                    !(r.Kind == "resourcelifecycle" && (r.Event == 200 || r.Event == 220 || r.Event == 120)) {
                    continue
                }
                if r.Kind == "resourcebaseline" {
                    a = 0L
                }
                z = trace.End
                if let resource = r.Resource {
                    if trace.ResourceReleased.TryGetValue(resource, out var released) {
                        z = released
                    }
                }
            }
            let distance = tick >= a && tick <= z ? 0L: Math.Min(Math.Abs(tick - a), Math.Abs(tick - z))
            if distance < best {
                best = distance
                selected = index
            }
        }
        if selected >= 0 {
            let r = trace.Records[selected]
            selectionStart = r.Ticks
            selectionEnd = Math.Max(r.Ticks + 1L, r.EndTicks)
        }
    }

    private func Fit() {
        if let trace = session.Profiler {
            start = 0L
            end = Math.Max(1L, trace.End)
            Changed()
        }
    }

    private func Changed() {
        follow = false
        paths.Clear()
        Rebuild()
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

    private func CycleWindow() {
        var next = ""
        var found = filterWindow == ""
        for window in session.Windows {
            if found {
                next = window.Id
                break
            }
            if window.Id == filterWindow {
                found = true
            }
        }
        filterWindow = next
        firstTrack = 0
        Rebuild()
    }

    private func PlotWidth() float64 -> Math.Max(100.0, width - 332.0)

    private func Tick(x float64) int64 -> start + int64(Math.Clamp(x / PlotWidth(), 0.0, 1.0) * float64(end - start))

    private func Summary(trace ProfilerTrace) string {
        let lo = selectionEnd > selectionStart ? selectionStart: start
        let hi = selectionEnd > selectionStart ? selectionEnd: end
        let b = StringBuilder("Instrumented range summary (not sampled stacks)\n")
        b
            .Append(Time(trace, lo))
            .Append(" to ")
            .Append(Time(trace, hi))
            .Append(
            "\nInclusive phase rows overlap. Do not add parent and child rows. Exclusive timing is unavailable without phase parent links.\n"
        )
        var reconcileTicks int64 = 0L
        var buildStyleTicks int64 = 0L
        for lane in trace.Lanes {
            if hidden.Contains(lane.Group) || filterWindow != "" && lane.Window != "" && lane.Window != filterWindow {
                continue
            }
            var calls = 0
            var ticks int64 = 0L
            var allocated uint64 = 0uL
            var incomplete = false
            var measuredAllocations = 0
            var unionTicks int64 = 0L
            var coverageEnd = lo
            var creates = 0
            var retires = 0
            var releases = 0
            var loaded uint64 = 0uL
            var knownPayloads = 0
            var gpuKnown = 0
            var gpuUnknown = 0
            var gpuNs uint64 = 0uL
            var unit = ""
            var initial uint64? = nil
            var final uint64? = nil
            var peak uint64? = nil
            let first = lane.FirstVisible(lo)
            if lane.Group == "Memory" && first > 0 {
                initial = trace.Records[lane.Records[first - 1]].Value
                final = initial
                peak = initial
            }
            for offset in first ... lane.Records.Count {
                let r = trace.Records[lane.Records[offset]]
                unit = r.Unit
                if r.Ticks > hi {
                    break
                }
                if lane.Group == "Memory" {
                    if r.Ticks <= lo {
                        initial = r.Value
                    }
                    if r.Ticks <= hi {
                        final = r.Value
                    }
                    if r.Ticks >= lo {
                        if let value = r.Value {
                            peak = Math.Max(peak ?? 0uL, value)
                        }
                    }
                }
                if r.EndTicks < lo {
                    continue
                }
                if r.Kind == "duration" && r.EndTicks > lo && r.Ticks < hi {
                    calls++
                    let a = Math.Max(lo, r.Ticks)
                    let z = Math.Min(hi, r.EndTicks)
                    ticks += z - a
                    if r.Category == 0 {
                        let phase = trace.PhaseName(r.Event)
                        if phase == "Reconcile" {
                            reconcileTicks += z - a
                        }
                        if phase == "Build" || phase == "StyleResolve" {
                            buildStyleTicks += z - a
                        }
                    }
                    unionTicks += Math.Max(0L, z - Math.Max(a, coverageEnd))
                    coverageEnd = Math.Max(coverageEnd, z)
                    if r.Ticks >= lo && r.EndTicks <= hi {
                        if let bytes = r.Allocated {
                            allocated += bytes
                            measuredAllocations++
                        }
                    } else {
                        incomplete = true
                    }
                }
                if r.Ticks >= lo && lane.Group == "Resources" {
                    if r.Event == 200 || r.Event == 220 || r.Event == 120 {
                        creates++
                        if let bytes = r.Payload {
                            loaded += bytes
                            knownPayloads++
                        }
                    }
                    if r.Event == 202 {
                        retires++
                    }
                    if r.Event == 203 || r.Event == 221 || r.Event == 121 {
                        releases++
                    }
                }
                if lane.Group == "GPU" && r.Source == "vulkan.timestamp.elapsed" && r.Ticks >= lo {
                    if let elapsed = r.GpuNs {
                        gpuKnown++
                        gpuNs += elapsed
                    } else {
                        gpuUnknown++
                    }
                }
            }
            if calls > 0 {
                b
                    .Append(lane.Name)
                    .Append(": ")
                    .Append(calls)
                    .Append(" calls, inclusive ")
                    .Append(Time(trace, ticks))
                    .Append(", union within row ")
                    .Append(Time(trace, unionTicks))
                    .Append(", allocation traffic ")
                    .Append(Bytes(measuredAllocations == 0 ? nil: allocated))
                    .Append(incomplete || measuredAllocations < calls ? " (boundary/unmeasured incomplete)": "")
                    .Append("\n")
            }
            if lane.Group == "Memory" {
                b
                    .Append(lane.Name)
                    .Append(": start ")
                    .Append(CounterValue(initial, unit))
                    .Append(", end ")
                    .Append(CounterValue(final, unit))
                    .Append(", observed peak ")
                    .Append(CounterValue(peak, unit))
                    .Append(", delta ")
                if initial != nil && final != nil {
                    b
                        .Append((decimal(final) - decimal(initial)).ToString(CultureInfo.InvariantCulture))
                        .Append(" ")
                        .Append(unit)
                } else {
                    b.Append("unmeasured")
                }
                b.Append("\n")
            }
            if creates + retires + releases > 0 {
                b
                    .Append(lane.Name)
                    .Append(": creates ")
                    .Append(creates)
                    .Append(", retires ")
                    .Append(retires)
                    .Append(", releases ")
                    .Append(releases)
                    .Append(", known payload ")
                    .Append(Bytes(knownPayloads == 0 ? nil: loaded))
                    .Append(" (")
                    .Append(knownPayloads)
                    .Append(" measured creations)\n")
            }
            if gpuKnown + gpuUnknown > 0 {
                b
                    .Append("GPU elapsed (unaligned): ")
                    .Append(gpuKnown)
                    .Append(" available stages, ")
                    .Append(gpuUnknown)
                    .Append(" unavailable, summed stage elapsed ")
                    .Append(gpuNs)
                    .Append(" ns. Not a CPU interval.\n")
            }
        }
        if reconcileTicks > 0L {
            b
                .Append("Derived Diff: ")
                .Append(Time(trace, Math.Max(0L, reconcileTicks - buildStyleTicks)))
                .Append(" (clipped inclusive Reconcile minus Build/StyleResolve, not a contiguous slice).\n")
        }
        return b.ToString()
    }

    private func Details(trace ProfilerTrace) string {
        if selected < 0 || selected >= trace.Records.Count {
            return "Event details\nClick an event for exact times, correlation and memory fields.\n"
            + "GPU elapsed is unaligned. Present accepted is not display latency.\n" + trace.Devices
        }
        let r = trace.Records[selected]
        var name = r.Name
        if let resource = r.Resource {
            if trace.ResourceNames.TryGetValue(resource, out var label) {
                name = label
            }
        }
        let b = StringBuilder()
        b.Append("Event ").Append(r.Sequence).Append(" / ").Append(r.Kind).Append(" / ").Append(name).Append("\n")
        b
            .Append("event ID ")
            .Append(r.Event)
            .Append(" / category ")
            .Append(r.Category)
            .Append(" / kind ")
            .Append(r.ResourceKind.ToString())
            .Append("\n")
        b.Append(r.Source).Append(" / ").Append(r.Validity).Append(" / ").Append(r.Unit).Append("\n")
        b.Append("ticks ").Append(r.Ticks).Append(" to ").Append(r.EndTicks).Append(" / result ").Append(r.Result)
        if r.Category == 0 && r.Event == 0 {
            b.Append(r.Result == 1 ? " rendered": r.Result == 2 ? " deferred": r.Result < 0 ? " failed": " skipped")
        }
        b
            .Append("\nwindow ")
            .Append(r.Window)
            .Append(" / thread ")
            .Append(r.Thread.ToString())
            .Append(" / pump ")
            .Append(r.Pump.ToString())
            .Append(" / frame ")
            .Append(r.Frame.ToString())
        b
            .Append("\nsubmission ")
            .Append(r.Submission.ToString())
            .Append(" / device ")
            .Append(r.Device.ToString())
            .Append(".")
            .Append(r.DeviceGeneration.ToString())
        b
            .Append("\nscene ")
            .Append(r.Scene.ToString())
            .Append(" / swapchain generation ")
            .Append(r.Generation.ToString())
            .Append(" / image ")
            .Append(r.ImageIndex.ToString())
        b
            .Append("\nresource ")
            .Append(r.Resource.ToString())
            .Append(".")
            .Append(r.ResourceGeneration.ToString())
            .Append(" / parent ")
            .Append(r.Parent.ToString())
        b
            .Append("\n")
            .Append(trace.ResourceName(r.ResourceKind))
            .Append(" / ")
            .Append(trace.OwnerName(r.Owner))
            .Append(" / ")
            .Append(r.Width.ToString())
            .Append(" x ")
            .Append(r.Height.ToString())
        b.Append("\ndamage origin ").Append(r.X.ToString()).Append(",").Append(r.Y.ToString())
        b
            .Append("\npayload ")
            .Append(Bytes(r.Payload))
            .Append(" / requirements ")
            .Append(Bytes(r.Requirement))
            .Append(" / placement ")
            .Append(Bytes(r.Placement))
            .Append(" / block ")
            .Append(Bytes(r.Block))
        b
            .Append("\nheap ")
            .Append(r.Heap.ToString())
            .Append(" / flags ")
            .Append(r.HeapFlags.ToString())
            .Append(" / memory type ")
            .Append(r.MemoryType.ToString())
            .Append(" / dedicated ")
            .Append(r.Dedicated.ToString())
        b
            .Append("\nvalue ")
            .Append(r.Value.ToString())
            .Append(" / value1 ")
            .Append(r.Value1.ToString())
            .Append(" / sample ticks ")
            .Append(r.SampleTicks.ToString())
            .Append(" / GC index ")
            .Append(r.GcIndex.ToString())
        b
            .Append("\nallocated traffic ")
            .Append(Bytes(r.Allocated))
            .Append(" / GPU elapsed ")
            .Append(r.GpuNs == nil ? "unavailable": r.GpuNs.ToString() + " ns (unaligned)")
        if r.Kind == "resourcebaseline" {
            b.Append("\nAlready live at Start. Creation time is unknown.")
        }
        if let resource = r.Resource {
            if trace.ResourceReleased.TryGetValue(resource, out var released) {
                b.Append("\nReleased at ").Append(Time(trace, released))
            } else if trace.ResourceRetired.TryGetValue(resource, out var retired) {
                b.Append("\nRetired/in flight since ").Append(Time(trace, retired))
            }
        }
        if trace.Partial {
            b.Append("\nLifetime continuity is unknown across dropped or missing data.")
        }
        return b.ToString()
    }

    shared {
        private func Control(key string, text string, action Action, enabled bool = true) Button -> Button{
            Key: key,
            Height: 28,
            Padding: Edges{Left: 8, Right: 8},
            BackgroundColor: DevToolsTheme.SurfaceRaised,
            Disabled: !enabled,
            OnClick: action,
            Text{Content: text, FontSize: 12, Color: enabled ? DevToolsTheme.Ink: DevToolsTheme.InkSubtle},
        }

        private func Label(text string) Text -> Text{
            Content: text,
            FontSize: 11,
            Color: DevToolsTheme.InkMuted,
            TextWrap: TextWrap.Wrap
        }

        private func Row(key string, children List[Blob]) Container -> Container{
            Key: key,
            Width: Percent(100),
            MinHeight: 30,
            FlexDirection: FlexDirection.Row,
            FlexWrap: FlexWrap.Wrap,
            Gap: 4,
            Padding: 3,
            Children: children
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

        private func Time(trace ProfilerTrace, ticks int64) string -> trace.Milliseconds(ticks).ToString(
            "0.###",
            CultureInfo.InvariantCulture
        ) +
            " ms"

        private func CounterValue(value uint64?, unit string) string -> if unit == "bytes" {
            Bytes(value)
        } else {
            value == nil ? "unmeasured": value.ToString() + " " + unit
        }

        private func Bytes(value uint64?) string {
            guard let actual = value else {
                return "unmeasured"
            }
            if actual >= 1048576uL {
                return (float64(actual) / 1048576.0).ToString("0.##", CultureInfo.InvariantCulture) + " MiB"
            }
            return actual.ToString() + " B"
        }

        private func Rect(path PathBuilder, x float64, y float64, w float64, h float64) {
            path.MoveTo(x, y).LineTo(x + w, y).LineTo(x + w, y + h).LineTo(x, y + h).Close()
        }
    }
}
