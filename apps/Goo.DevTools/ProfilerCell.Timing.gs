package GooDevTools

import Goo
import Goo.Widgets
import System
import System.Collections.Generic
import System.Globalization
import System.Threading

internal data struct ProfilerBar {
    var Record int32
    var Track int32
    var Depth int32
    var Left float64
    var Width float64
}

internal partial class ProfilerCell {
    private const Row float64 = 18.0
    private const FramesHeight float64 = 88.0
    private const StripHeight float64 = 14.0
    private let scopes List[ProfilerScope] = List[ProfilerScope]()
    private let bars List[ProfilerBar] = List[ProfilerBar]()
    private let peaks Dictionary[string, float64] = Dictionary[string, float64]()
    private var nesting ProfilerNesting = ProfilerNesting([]ProfilerScope{}, 0)
    private var nestTrace string = ""
    private var nestRevision int32 = -1
    private var nestScanned int32
    private var nestBusy bool
    private var hoveredBar int32 = -1
    private var hoverY float64
    private let framesHandle ElementHandle = ElementHandle{}
    private let trackHandles[]ElementHandle = []ElementHandle{ElementHandle{}, ElementHandle{}, ElementHandle{}}

    private func Timing(trace ProfilerTrace, theme Theme) Container {
        Nest(trace)
        if !paths.ContainsKey("tracks") {
            DrawTracks(trace, PlotWidth())
        }
        let children = List[Blob]()
        children.Add(Lane(trace, theme, "Frames", -1, FrameChart(trace, theme)))
        for track in 0 ... TrackNames.Length {
            children.Add(Lane(trace, theme, TrackNames[track], track, Track(trace, theme, track)))
        }
        return Container{
            Key: "profiler-timing",
            Width: Percent(100),
            OverflowY: Overflow.Scroll,
            ScrollbarY: theme.Scrollbar,
            ScrollbarVisibility: ScrollbarVisibility.Always,
            FlexDirection: FlexDirection.Column,
            Gap: 4,
            Children: children
        }
    }

    private func Lane(trace ProfilerTrace, theme Theme, name string, track int32, plot Container) Container {
        let header = List[Blob]()
        header.Add(
            Text{
                Content: name,
                FontFamily: theme.FontFamily,
                FontSize: theme.CaptionFontSize,
                FontWeight: 600,
                Color: theme.TextColor
            }
        )
        if track < 0 {
            header.Add(
                Caption(
                    "budget",
                    "Line: " + Time(trace, trace.Frequency / 60L) + " budget at 60 Hz",
                    theme.MutedTextColor
                )
            )
        }
        let key = "strip" + track.ToString()
        if !paths.ContainsKey(key + "a") {
            DrawStrips(trace, track, key)
        }
        if track >= 0 {
            header.Add(Swatch(theme.AccentColor))
            header.Add(
                Caption("time", "Work per frame, max " + Time(trace, int64(peaks[key + "t"])), theme.MutedTextColor)
            )
        }
        header.Add(Swatch(theme.WarningColor))
        header.Add(
            Caption(
                "alloc",
                peaks[key + "a"] < 0.0 ? "No allocation data": "Allocated per frame, max " + Bytes(peaks[key + "a"]),
                theme.MutedTextColor
            )
        )
        let children = List[Blob]()
        children.Add(Header(header))
        if track >= 0 {
            children.Add(Strip(key + "t", theme.AccentColor))
        }
        children.Add(Strip(key + "a", theme.WarningColor))
        children.Add(plot)
        return Container{
            Key: "lane-" + name,
            FlexShrink: 0.0,
            FlexDirection: FlexDirection.Column,
            Gap: 2,
            Children: children
        }
    }

    private func Header(children List[Blob]) Container -> Container{
        Height: Row,
        Margin: Edges{Left: Pad},
        FlexDirection: FlexDirection.Row,
        AlignItems: AlignItems.Center,
        Gap: 6,
        Children: children
    }

    private func Strip(key string, color Color) Container -> Container{
        Key: key,
        Width: PlotWidth(),
        Height: StripHeight,
        Margin: Edges{Left: Pad},
        Position: PositionType.Relative,
        HitTestSelf: false,
        PathShape(paths[key], color)
    }

    private func DrawStrips(trace ProfilerTrace, track int32, key string) {
        let w = PlotWidth()
        let time = List[float64]()
        let alloc = List[float64]()
        let lefts = List[float64]()
        let widths = List[float64]()
        var timePeak = 0.0
        var allocPeak = -1.0
        for index in trace.FirstFrame(start) ... trace.Frames.Count {
            let r = trace.Records[trace.Frames[index].Record]
            if r.Ticks > end {
                break
            }
            if filterWindow != "" && r.Window != filterWindow {
                continue
            }
            var ticks = r.EndTicks - r.Ticks
            var bytes = r.Allocated == nil ? -1L: int64(r.Allocated ?? 0uL)
            if track >= 0 {
                ticks = 0L
                bytes = -1L
                if nesting.FrameTotals.TryGetValue(
                    track.ToString() + ":" + r.Window + ":" + r.Pump.ToString(),
                    out var totals
                ) {
                    ticks = totals[0]
                    bytes = totals[1]
                }
            }
            let left = Math.Max(0.0, X(r.Ticks))
            lefts.Add(left)
            widths.Add(Math.Max(1.0, Math.Min(w, X(r.EndTicks)) - left))
            time.Add(float64(ticks))
            alloc.Add(float64(bytes))
            timePeak = Math.Max(timePeak, float64(ticks))
            allocPeak = Math.Max(allocPeak, float64(bytes))
        }
        let timePath = PathBuilder(0.0, 0.0, w, StripHeight)
        let allocPath = PathBuilder(0.0, 0.0, w, StripHeight)
        for index in 0 ... lefts.Count {
            if time[index] > 0.0 {
                let height = Math.Max(1.0, time[index] / timePeak * StripHeight)
                Rect(timePath, lefts[index], StripHeight - height, widths[index], height)
            }
            if alloc[index] > 0.0 {
                let height = Math.Max(1.0, alloc[index] / allocPeak * StripHeight)
                Rect(allocPath, lefts[index], StripHeight - height, widths[index], height)
            }
        }
        paths[key + "t"] = timePath.Build()
        paths[key + "a"] = allocPath.Build()
        peaks[key + "t"] = timePeak
        peaks[key + "a"] = allocPeak
    }

    private func Track(trace ProfilerTrace, theme Theme, track int32) Container {
        let w = PlotWidth()
        let height = float64(nesting.TrackRows[track]) * Row
        let hover = hoveredBar >= 0 && bars[hoveredBar].Track == track
        let shapes = List[Blob]()
        shapes.Add(PathShape(SelectionPath(w, height), theme.AccentColor.WithAlpha(0.18)))
        for group in 0 ... GroupNames.Length + 1 {
            let color = GroupColor(theme, group - 1)
            shapes.Add(PathShape(paths["t" + track.ToString() + "g" + group.ToString()], color.WithAlpha(0.45)))
            shapes.Add(PathShape(paths["t" + track.ToString() + "e" + group.ToString()], color))
        }
        var labels = 0
        for bar in bars {
            if bar.Track != track || bar.Width < 40.0 || labels >= 300 {
                continue
            }
            labels++
            let r = trace.Records[bar.Record]
            let name = ScopeTitle(trace, r)
            shapes.Add(
                Text{
                    Key: "bar-" + bar.Record.ToString(),
                    Content: bar.Width >= 120.0 ? name + "  " + Time(trace, r.EndTicks - r.Ticks): name,
                    Position: PositionType.Absolute,
                    Left: bar.Left + 4.0,
                    Top: float64(bar.Depth) * Row,
                    Width: bar.Width - 6.0,
                    Height: Row,
                    FontFamily: theme.FontFamily,
                    FontSize: theme.CaptionFontSize,
                    Color: theme.TextColor,
                    TextWrap: TextWrap.NoWrap,
                    TextTrimming: TextTrimming.Ellipsis
                }
            )
        }
        if hover {
            let bar = bars[hoveredBar]
            shapes.Add(
                Container{
                    Key: "bar-hover",
                    Position: PositionType.Absolute,
                    Left: bar.Left,
                    Top: float64(bar.Depth) * Row + 1.0,
                    Width: Math.Max(2.0, bar.Width),
                    Height: Row - 2.0,
                    BorderWidth: 1,
                    BorderColor: theme.FocusColor,
                    HitTestSelf: false
                }
            )
            if !selecting {
                shapes.Add(ScopeTooltip(trace, theme, bar))
            }
        }
        return Container{
            Key: "profiler-track-" + track.ToString(),
            Handle: trackHandles[track],
            Width: w,
            Height: height,
            FlexShrink: 0.0,
            Margin: Edges{Left: Pad},
            Position: PositionType.Relative,
            BackgroundColor: theme.SunkenColor,
            BorderRadius: theme.RadiusSm!!,
            Accessibility: Accessibility{Role: AccessibilityRole.Group, Name: TrackNames[track]},
            OnWheel: (e WheelEvent) -> Wheel(e, w),
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
                let bar = BarAt(track, e.Position.X, e.Position.Y)
                hoverX = e.Position.X
                hoverY = e.Position.Y
                if bar != hoveredBar {
                    hoveredBar = bar
                    Rebuild()
                }
            },
            OnPointerLeave: (e PointerEvent) -> {
                if hoveredBar >= 0 {
                    hoveredBar = -1
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
                    let bar = BarAt(track, e.Position.X, e.Position.Y)
                    Select(bar >= 0 ? bars[bar].Record: -1)
                    selectionStart = bar >= 0 ? trace.Records[selected].Ticks: 0L
                    selectionEnd = bar >= 0 ? Math.Max(selectionStart + 1L, trace.Records[selected].EndTicks): 0L
                }
                tableKey = ""
                Rebuild()
            },
            OnPointerCancel: (e PointerEvent) -> {
                selecting = false
                e.ReleaseCapture()
            },
            Children: shapes,
        }
    }

    private func ScopeTooltip(trace ProfilerTrace, theme Theme, bar ProfilerBar) Portal {
        let r = trace.Records[bar.Record]
        let own = nesting.SelfAllocated[bar.Record]
        return Tooltip(
            "profiler-scope-tooltip",
            trackHandles[bar.Track],
            hoverX,
            hoverY + 14.0,
            theme,
            []Blob{
                Text{
                    Content: ScopeTitle(trace, r),
                    FontFamily: theme.FontFamily,
                    FontSize: theme.FontSize,
                    FontWeight: 600,
                    Color: theme.TextColor
                },
                Detail("Inclusive", Time(trace, r.EndTicks - r.Ticks), theme),
                Detail("Exclusive", Time(trace, Math.Max(0L, nesting.Exclusive[bar.Record])), theme),
                Detail("Allocated", r.Allocated == nil ? "No data": Bytes(float64(r.Allocated ?? 0uL)), theme),
                Detail("Self allocated", own < 0L ? "No data": Bytes(float64(own)), theme),
                Detail(
                    "Start",
                    trace.Milliseconds(r.Ticks).ToString("F3", CultureInfo.InvariantCulture) + " ms",
                    theme
                ),
            }
        )
    }

    private func Tooltip(
        key string,
        anchor ElementHandle,
        x float64,
        y float64,
        theme Theme,
        children IList[Blob]
    ) Portal -> Portal{
        Key: key,
        Anchor: anchor,
        AnchorRect: ElementRect{X: x, Y: y},
        Placement: PortalPlacement.RightStart,
        Padding: Edges{Left: 14, Right: 14},
        Container{
            Width: 234,
            Padding: 8,
            Gap: 2,
            BackgroundColor: theme.OverlayColor,
            BorderWidth: 1,
            BorderColor: theme.BorderColor,
            BorderRadius: theme.RadiusMd!!,
            BoxShadow: theme.ElevationMd,
            HitTestSelf: false,
            Children: children
        }
    }

    private func BarAt(track int32, x float64, y float64) int32 {
        let depth = int32(y / Row)
        for index in 0 ... bars.Count {
            let bar = bars[index]
            if bar.Track == track && bar.Depth == depth && x >= bar.Left - 1.0 && x <= bar.Left + bar.Width + 1.0 {
                return index
            }
        }
        return -1
    }

    private func Wheel(e WheelEvent, w float64) {
        if e.Modifiers.Ctrl {
            e.PreventDefault()
            Zoom(e.Delta.Y > 0.0 ? 0.8: 1.25, Math.Clamp(e.Position.X / w, 0.0, 1.0))
        } else if e.Modifiers.Shift {
            e.PreventDefault()
            Pan(e.Delta.Y > 0.0 ? -0.1: 0.1)
        }
    }

    private func SelectionPath(w float64, h float64) VectorPath {
        let path = PathBuilder(0.0, 0.0, w, h)
        if selectionEnd > selectionStart && selectionEnd > start && selectionStart < end {
            let left = Math.Max(0.0, X(selectionStart))
            Rect(path, left, 0.0, Math.Max(1.0, Math.Min(w, X(selectionEnd)) - left), h)
        }
        return path.Build()
    }

    private func DrawTracks(trace ProfilerTrace, w float64) {
        bars.Clear()
        hoveredBar = -1
        let groups = GroupNames.Length + 1
        let builders = List[PathBuilder]()
        for edge in 0 ... 2 {
            for track in 0 ... TrackNames.Length {
                for group in 0 ... groups {
                    builders.Add(PathBuilder(0.0, 0.0, w, float64(nesting.TrackRows[track]) * Row))
                }
            }
        }
        let edges = TrackNames.Length * groups
        let last = Dictionary[int32, int32]()
        for index in nesting.Nested {
            let r = trace.Records[index]
            if r.Ticks > end {
                break
            }
            if r.EndTicks < start || filterWindow != "" && r.Window != filterWindow {
                continue
            }
            let name = trace.EventName(r)
            let track = TrackOf(name)
            let depth = nesting.Depths[index]
            let left = Math.Max(0.0, X(r.Ticks))
            let barWidth = Math.Max(1.0, Math.Min(w, X(r.EndTicks)) - left)
            let slot = track * 4096 + depth
            if barWidth <= 1.0 && last.TryGetValue(slot, out var previous) && int32(left) <= previous {
                continue
            }
            last[slot] = int32(left + barWidth)
            let slotIndex = track * groups + GroupOf(name) + 1
            let top = float64(depth) * Row + 1.0
            Rect(builders[slotIndex], left, top, barWidth > 3.0 ? barWidth - 1.0: barWidth, Row - 2.0)
            Rect(builders[edges + slotIndex], left, top, Math.Min(2.0, barWidth), Row - 2.0)
            bars.Add(ProfilerBar{Record: index, Track: track, Depth: depth, Left: left, Width: barWidth})
        }
        for k in 0 ... edges {
            paths["t" + (k / groups).ToString() + "g" + (k % groups).ToString()] = builders[k].Build()
            paths["t" + (k / groups).ToString() + "e" + (k % groups).ToString()] = builders[edges + k].Build()
        }
        paths["tracks"] = PathBuilder(0.0, 0.0, 1.0, 1.0).Build()
    }

    private func Nest(trace ProfilerTrace) {
        if nestTrace != trace.Id {
            nestTrace = trace.Id
            nestBusy = false
            nestRevision = -1
            nestScanned = 0
            scopes.Clear()
            nesting = ProfilerNesting([]ProfilerScope{}, 0)
        }
        if nestBusy || nestRevision == trace.Revision {
            return
        }
        nestRevision = trace.Revision
        let count = trace.Records.Count
        for index in nestScanned ... count {
            let r = trace.Records[index]
            if r.Kind == "duration" && r.Resource == nil && r.GpuNs == nil {
                let name = trace.EventName(r)
                scopes.Add(
                    ProfilerScope{
                        Record: index,
                        Ticks: r.Ticks,
                        EndTicks: r.EndTicks,
                        Name: name,
                        Track: TrackOf(name),
                        Window: r.Window,
                        Thread: r.Thread,
                        Pump: r.Pump,
                        Allocated: r.Allocated == nil ? -1L: int64(r.Allocated ?? 0uL),
                        Observed: r.Source.EndsWith("-observed", StringComparison.Ordinal),
                    }
                )
            }
        }
        nestScanned = count
        nestBusy = true
        let snapshot = scopes.ToArray()
        let token = Latest("nesting")
        go CompleteNesting(snapshot, count, token)
    }

    private func CompleteNesting(snapshot[]ProfilerScope, count int32, token CancellationToken) {
        try {
            token.ThrowIfCancellationRequested()
            let result = ProfilerNesting(snapshot, count)
            Post(
                () -> {
                    if !token.IsCancellationRequested {
                        nesting = result
                        nestBusy = false
                        paths.Clear()
                        tableKey = ""
                    }
                }
            )
        } catch (error OperationCanceledException) { } catch (error Exception) {
            let message = error.Message
            Post(
                () -> {
                    if !token.IsCancellationRequested {
                        nestBusy = false
                        fileStatus = message
                    }
                }
            )
        }
    }

    private func TimersTable(trace ProfilerTrace, lo int64, hi int64, rows List[ProfilerTableRow]) {
        Nest(trace)
        let timers = Dictionary[string, []int64]()
        for index in 0 ... trace.Records.Count {
            let r = trace.Records[index]
            let gpu = r.GpuNs != nil
            if !gpu && (index >= nesting.Depths.Length || nesting.Depths[index] < 0) || r.Ticks < lo || r.Ticks >= hi
            || filterWindow != "" && r.Window != "" && r.Window != filterWindow {
                continue
            }
            var name = gpu ? "GPU " + ProfilerTrace.GpuStage(r.Event): LaneTitle(trace.EventName(r))
            if filterWindow == "" && trace.WindowNames.Count > 1 && r.Window != "" {
                name = WindowTitle(r.Window) + " / " + name
            }
            if !timers.TryGetValue(name, out var t) {
                t = []int64{0L, 0L, 0L, 0L, 0L, 0L, gpu ? 1L: 0L}
                timers.Add(name, t)
            }
            t[0]++
            if gpu {
                t[1] += int64(float64(r.GpuNs ?? 0uL) * float64(trace.Frequency) / 1000000000.0)
                continue
            }
            if !nesting.Repeated[index] {
                t[1] += r.EndTicks - r.Ticks
            }
            t[2] += Math.Max(0L, nesting.Exclusive[index])
            if r.Allocated != nil {
                t[5]++
                if !nesting.Repeated[index] {
                    t[3] += int64(r.Allocated ?? 0uL)
                }
                t[4] += Math.Max(0L, nesting.SelfAllocated[index])
            }
        }
        for pair in timers {
            let t = pair.Value
            let gpu = t[6] == 1L
            let mark = t[5] > 0L && t[5] < t[0]? " *": ""
            rows.Add(
                ProfilerTableRow(
                    []string{
                        pair.Key,
                        t[0].ToString(CultureInfo.InvariantCulture),
                        Time(trace, t[1]),
                        gpu ? "—": Time(trace, t[2]),
                        t[5] == 0L ? "—": Bytes(float64(t[3])) + mark,
                        t[5] == 0L ? "—": Bytes(float64(t[4])) + mark
                    },
                    []float64{
                        0.0,
                        float64(t[0]),
                        float64(t[1]),
                        gpu ? -1.0: float64(t[2]),
                        t[5] == 0L ? -1.0: float64(t[3]),
                        t[5] == 0L ? -1.0: float64(t[4])
                    },
                    "timer-" + pair.Key
                )
            )
        }
    }

    shared {
        private let GroupNames[]string = []string{
            "Input",
            "Build",
            "Layout",
            "Animation",
            "Paint",
            "GPU and present",
            "DevTools"
        }
        private let TrackNames[]string = []string{"UI thread", "GPU and present", "DevTools"}

        private func GroupOf(name string) int32 -> name == "Frame" || name == "CapWait" ? -1
        : name == "Events" || name == "Input" || name == "InputTree" ? 0
        : name == "Tree" || name == "Reconcile" || name == "Build" || name == "Diff" || name == "StyleResolve"
        || name == "Virtualization" ? 1
        : name == "Layout" ? 2
        : name == "Motion" || name == "Transitions" ? 3
        : name == "Render" || name == "Paint" || name == "LayerCollect" || name == "LayerCreate" || name == "ClipAtlas"
        || name == "CanvasFlush" ? 4
        : name == "Diagnostics" ? 6: 5

        private func TrackOf(name string) int32 {
            let group = GroupOf(name)
            return group < 5 ? 0: group - 4
        }

        private func GroupColor(theme Theme, group int32) Color -> group < 0 ? theme.FaintTextColor: PhaseColor(
            theme,
            group
        )
    }
}
