package GooAsyncReadbackSmoke

import Goo
import Goo.Svg
import System
import System.Collections.Generic
import System.Diagnostics
import System.Globalization
import System.IO
import System.Threading

class NonScalingStrokeCell : Cell {
    shared {
        private let defaultSource VectorPath = PathBuilder(0.0, 0.0, 200.0, 200.0)
            .MoveTo(20.0, 20.0)
            .LineTo(50.0, 20.0)
            .QuadraticTo(80.0, 20.0, 65.0, 40.0)
            .LineTo(25.0, 45.0)
            .MoveTo(25.0, 60.0)
            .LineTo(60.0, 55.0)
            .LineTo(65.0, 80.0)
            .Close()
            .MoveTo(85.0, 30.0)
            .LineTo(85.0, 30.0)
            .Build()
        private let clip VectorPath = PathBuilder(0.0, 0.0, 200.0, 200.0)
            .MoveTo(25.0, 25.0)
            .LineTo(180.0, 25.0)
            .LineTo(180.0, 185.0)
            .LineTo(25.0, 185.0)
            .Close()
            .Build()
        private let dash DashPattern = DashPattern([]float64{10.0, 6.0}, 2.0)
        private let dots DashPattern = DashPattern([]float64{0.0, 9.0}, 0.0)
        private let odd DashPattern = DashPattern([]float64{8.0, 3.0, 2.0}, -3.0)
    }
    internal var Source VectorPath = defaultSource
    internal var Reference VectorPath = VectorPath.Empty
    internal var Pose PanelTransform = PanelTransform{TranslateX: 20, TranslateY: 20}
    internal var Style int32
    internal var Stretch bool
    internal var ShadowOffset bool

    override func Build() Blob -> Container{
        Width: 400,
        Height: 200,
        Position: PositionType.Relative,
        Container{
            Width: 200,
            Height: 200,
            Position: PositionType.Absolute,
            Left: 0,
            Top: 0,
            ClipPath: clip,
            ClipPathFit: ShapeFit.None,
            Stroke(Source, VectorEffect.NonScalingStroke, Pose),
        },
        Container{
            Width: 200,
            Height: 200,
            Position: PositionType.Absolute,
            Left: 200,
            Top: 0,
            ClipPath: clip,
            ClipPathFit: ShapeFit.None,
            Stroke(Reference, VectorEffect.None, PanelTransform{}),
        },
    }

    private func Stroke(path VectorPath, effect VectorEffect, pose PanelTransform) Shape -> Shape{
        Path: path,
        Fit: Stretch && effect == VectorEffect.NonScalingStroke ? ShapeFit.Fill: ShapeFit.None,
        Width: Stretch && effect == VectorEffect.NonScalingStroke ? 100: 200,
        Height: Stretch && effect == VectorEffect.NonScalingStroke ? 160: 200,
        Position: PositionType.Absolute,
        Left: 0,
        Top: 0,
        BackgroundColor: Color.Transparent,
        BorderColor: Color.White,
        BorderWidth: Style == 3 ? 8.0: 6.0,
        StrokeCap: Style == 3 ? StrokeCap.Square: StrokeCap(Style),
        StrokeJoin: Style == 1 ? StrokeJoin.Round: (Style == 2 ? StrokeJoin.Bevel: StrokeJoin.Miter),
        MiterLimit: Style == 3 ? 1.0: 4.0,
        Dashes: Style == 0 ? nil: (Style == 1 ? dash: (Style == 2 ? dots: odd)),
        StrokeStart: Style == 1 ? 0.1: (Style == 3 ? 0.2: 0.0),
        StrokeEnd: Style == 1 ? 0.85: (Style == 3 ? 0.9: 1.0),
        StrokeInset: false,
        VectorEffect: effect,
        TransformOriginX: 0,
        TransformOriginY: 0,
        Transform: pose,
        BoxShadow: BoxShadow{Color: Color.Rgb(255, 0, 0), OffsetX: ShadowOffset ? 10: 0, OffsetY: ShadowOffset ? 8: 0,},
    }
}

class NonScalingStrokeBenchCell : Cell {
    internal let Count int32
    internal let NonScaling bool
    internal var Path VectorPath
    internal var Zoom float64 = 1.0
    internal var StrokeColor Color = Color.White
    private let dash DashPattern = DashPattern([]float64{3.0, 2.0}, 0.0)

    internal init(path VectorPath, count int32, nonScaling bool) {
        Path = path
        Count = count
        NonScaling = nonScaling
    }

    override func Build() Blob {
        let pattern = NonScaling ? dash: DashPattern([]float64{3.0 / Zoom, 2.0 / Zoom}, 0.0)
        let content = Container{
            Width: 800,
            Height: 600,
            Position: PositionType.Absolute,
            TransformOriginX: 0,
            TransformOriginY: 0,
            Transform: PanelTransform{ScaleX: Zoom, ScaleY: Zoom},
        }
        for index in 0 ... Count {
            content.Children.Add(
                Shape{
                    Key: index.ToString(CultureInfo.InvariantCulture),
                    Path: Path,
                    Fit: ShapeFit.None,
                    Width: 12,
                    Height: 12,
                    Position: PositionType.Absolute,
                    Left: (index % 40) * 18,
                    Top: (index / 40) * 18,
                    BackgroundColor: Color.Rgb(64, 192, 128),
                    BorderColor: StrokeColor,
                    BorderWidth: NonScaling ? 1.0: 1.0 / Zoom,
                    StrokeCap: StrokeCap.Round,
                    StrokeJoin: StrokeJoin.Round,
                    StrokeInset: false,
                    Dashes: pattern,
                    VectorEffect: NonScaling ? VectorEffect.NonScalingStroke: VectorEffect.None,
                }
            )
        }
        return Container{Width: Percent(100), Height: Percent(100), content}
    }
}

func RunNonScalingStrokeSmoke() {
    Require(Environment.GetEnvironmentVariable("GOO_VK_DIAGNOSTICS") == "1", "GOO_VK_DIAGNOSTICS=1 is required")
    let measure = Environment.GetEnvironmentVariable("GOO_NON_SCALING_STROKE_MEASURE")
    let errors = StringWriter()
    let previousError = Console.Error
    try {
        Console.SetError(errors)
        if measure != "only" {
            VectorRetainSmoke.VerifyNonScalingStrokeHitBounds()
            VerifyNonScalingStrokeSvgStyle()
            VerifyNonScalingStrokePixels()
        }
        if measure != "0" {
            let asset = Svg.Parse(
                "<svg viewBox='0 0 12 12'><path d='M1 10 L6 1 L11 10 Z'"
                + " fill='#40c080' stroke='white' stroke-width='1' vector-effect='non-scaling-stroke'/></svg>"
            )
            for count in[]int32{1, 1000} {
                VectorRetainSmoke.Measure(asset, count, false)
                VectorRetainSmoke.Measure(asset, count, true)
                MeasureNonScalingStroke(asset.PathForNode(1), count, false)
                MeasureNonScalingStroke(asset.PathForNode(1), count, true)
            }
        }
    } catch (error Exception) {
        previousError.Write(errors.ToString())
        throw error
    } finally {
        Console.SetError(previousError)
    }
    ReadbackValidateCommonDiagnostics(errors.ToString())
    if measure != "only" {
        Console.WriteLine(
            "non-scaling-stroke: pixels=77 dpi=1,1.5,2 fit=1 flat=5 hit=1 transform_style_dpi_encodes=0 validation=0 cleanup=1"
        )
    }
}

func VerifyNonScalingStrokeSvgStyle() {
    let asset = Svg.Parse(
        "<svg viewBox='0 0 100 100' stroke='white'>"
        + "<g vector-effect='non-scaling-stroke'>"
        + "<path d='M0 0 L1 1'/>"
        + "<path d='M0 0 L1 1' vector-effect='non-scaling-stroke'/>"
        + "<path d='M0 0 L1 1' vector-effect='non-scaling-stroke' style='vector-effect:none'/>"
        + "<path d='M0 0 L1 1' vector-effect='none' style='vector-effect:non-scaling-stroke'/>"
        + "</g></svg>"
    )
    let paths = asset.Nodes[0].Children[0].Children
    Require(
        paths[0].Stroke!!.VectorEffect == VectorEffect.None
        && paths[1].Stroke!!.VectorEffect == VectorEffect.NonScalingStroke
        && paths[2].Stroke!!.VectorEffect == VectorEffect.None
        && paths[3].Stroke!!.VectorEffect == VectorEffect.NonScalingStroke,
        "SVG vector effect inheritance or style precedence changed"
    )
}

func VerifyNonScalingStrokePixels() {
    let root = NonScalingStrokeCell()
    let window = Window{
        Title: "Goo non-scaling stroke proof",
        Width: 400,
        Height: 200,
        VSync: false,
        Background: Color.Black,
        Root: root
    }
    let poses = []PanelTransform{
        PanelTransform{TranslateX: 20, TranslateY: 20, Scale: 0.5},
        PanelTransform{TranslateX: 20, TranslateY: 20},
        PanelTransform{TranslateX: 20, TranslateY: 20, Scale: 2.0},
        PanelTransform{TranslateX: 20, TranslateY: 20, ScaleX: 1.7, ScaleY: 0.6, SkewX: 25, SkewY: -10, Rotate: 25},
        PanelTransform{TranslateX: 150, TranslateY: 20, ScaleX: -1.3, ScaleY: 0.8},
        PanelTransform{TranslateX: 40, TranslateY: 40},
    }
    try {
        window.Open()
        WindowReadbackTestFixture.ForceRender(window, 0.0, 10.0)
        let creation = window.CreateOffscreenSession()
        Require(
            creation.Status == OffscreenRenderStatus.Success && creation.Session != nil,
            "Stroke offscreen session creation failed"
        )
        using let session = creation.Session!!
        for poseIndex in 0 ... poses.Length {
            for style in 0 ... 4 {
                let builds = PathBandEncoder.BuildCount
                root.Pose = poses[poseIndex]
                root.Style = style
                root.Stretch = poseIndex == 5
                root.ShadowOffset = poseIndex == 1
                root.Rebuild()
                WindowReadbackTestFixture.ForceRender(window, 0.0, 10.0)
                Require(PathBandEncoder.BuildCount == builds, "Transform or stroke style encoded centerline geometry")
                let shape = FindNonScalingStrokeNode(window.PathProbeNodeForTest()!!)!!
                let matrix = NonScalingStrokeHostMatrix(shape)
                if style == 0 {
                    VerifyNonScalingStrokeHostHit(shape, matrix)
                }
                let reference = NonScalingStrokeHostPath(root.Source, matrix)
                var dpiBuilds uint64
                for dpi in[]float64{1.0, 1.5, 2.0} {
                    RenderNonScalingStrokePair(
                        session,
                        root,
                        reference,
                        dpi,
                        "dpi=" + dpi.ToString(CultureInfo.InvariantCulture)
                        + " pose=" + poseIndex.ToString() + " style=" + style.ToString()
                    )
                    if dpi == 1.0 {
                        dpiBuilds = PathBandEncoder.BuildCount
                    } else {
                        Require(PathBandEncoder.BuildCount == dpiBuilds, "Display scale encoded path geometry")
                    }
                }
            }
        }
        let flat = []VectorPath{
            PathBuilder(0.0, 0.0, 200.0, 200.0).MoveTo(40.0, 40.0).LineTo(120.0, 40.0).Build(),
            PathBuilder(0.0, 0.0, 200.0, 200.0).MoveTo(40.0, 40.0).LineTo(40.0, 120.0).Build(),
            PathBuilder(0.0, 0.0, 200.0, 200.0).MoveTo(60.0, 60.0).LineTo(60.0, 60.0).Build(),
            PathBuilder(0.0, 0.0, 200.0, 200.0)
                .MoveTo(60.0, 60.0)
                .LineTo(60.0, 60.0)
                .LineTo(60.0, 60.0)
                .Close()
                .Build(),
            PathBuilder(0.0, 0.0, 200.0, 200.0).MoveTo(60.0, 60.0).Close().Build(),
        }
        for index in 0 ... flat.Length {
            root.Source = flat[index]
            root.Style = index == 4 ? 1: 3
            root.Stretch = false
            root.ShadowOffset = true
            root.Pose = PanelTransform{TranslateX: 20, TranslateY: 20}
            root.Rebuild()
            WindowReadbackTestFixture.ForceRender(window, 0.0, 10.0)
            let builds = PathBandEncoder.BuildCount
            root.Pose = PanelTransform{TranslateX: 25, TranslateY: 20}
            root.Rebuild()
            WindowReadbackTestFixture.ForceRender(window, 0.0, 10.0)
            Require(PathBandEncoder.BuildCount == builds, "Flat stroke translation encoded geometry")
            let shape = FindNonScalingStrokeNode(window.PathProbeNodeForTest()!!)!!
            let reference = NonScalingStrokeHostPath(root.Source, NonScalingStrokeHostMatrix(shape))
            RenderNonScalingStrokePair(session, root, reference, 2.0, "flat=" + index.ToString())
        }
    } finally {
        window.Close()
    }
}

func RenderNonScalingStrokePair(
    session OffscreenRenderSession,
    source NonScalingStrokeCell,
    reference VectorPath,
    dpi float64,
    context string
) {
    let page = NonScalingStrokeCell{
        Source: source.Source,
        Reference: reference,
        Pose: source.Pose,
        Style: source.Style,
        Stretch: source.Stretch,
        ShadowOffset: source.ShadowOffset,
    }
    let options = OffscreenRenderOptions(
        400.0F,
        200.0F,
        uint32(400.0 * dpi),
        uint32(200.0 * dpi),
        Color.Black,
        134217728L
    )
    let pending = session.RenderAsync(page, options, CancellationToken.None)
    let deadline = Stopwatch.GetTimestamp() + Stopwatch.Frequency * 30L
    while !pending.IsCompleted && Stopwatch.GetTimestamp() < deadline {
        session.Service()
        Thread.Sleep(1)
    }
    Require(pending.IsCompleted, "Offscreen stroke did not complete: " + context)
    let result = pending.GetAwaiter().GetResult()
    Require(
        result.Status == OffscreenRenderStatus.Success && result.Capture != nil,
        "Offscreen stroke failed: " + context + " " + result.Status.ToString() + " " + result.Error
    )
    CompareNonScalingStrokePixels(result.Capture!!, context)
}

func NonScalingStrokeHostMatrix(shape Node) Affine2D {
    let world = TransformGeometry.WindowMatrix(shape)
    let mapping = ShapeGeometry.Resolve(shape, shape.Rect).Mapping
    return Affine2D{
        A: world.A * mapping.ScaleX,
        B: world.B * mapping.ScaleY,
        C: world.C * mapping.ScaleX,
        D: world.D * mapping.ScaleY,
        TX: world.A * mapping.TranslateX + world.B * mapping.TranslateY + world.TX,
        TY: world.C * mapping.TranslateX + world.D * mapping.TranslateY + world.TY,
    }
}

func FindNonScalingStrokeNode(node Node) Node? {
    if node.Kind == NodeKind.Shape && node.ShapeVectorEffect == VectorEffect.NonScalingStroke {
        return node
    }
    for child in node.Children {
        if let found = FindNonScalingStrokeNode(child) {
            return found
        }
    }
    return nil
}

func NonScalingStrokeHostPath(path VectorPath, matrix Affine2D) VectorPath {
    let geometry = PathGeometry.For(path)
    let builder = PathBuilder(0.0, 0.0, 200.0, 200.0)
    for contourIndex in 0 ... geometry.ContourCount {
        let contour = geometry.Contours[contourIndex]
        if contour.Start == contour.End {
            continue
        }
        let first = geometry.Quadratics[contour.Start]
        builder.MoveTo(
            matrix.A * first.X0 + matrix.B * first.Y0 + matrix.TX,
            matrix.C * first.X0 + matrix.D * first.Y0 + matrix.TY
        )
        for index in contour.Start ... contour.End {
            let curve = geometry.Quadratics[index]
            builder.QuadraticTo(
                matrix.A * curve.CX + matrix.B * curve.CY + matrix.TX,
                matrix.C * curve.CX + matrix.D * curve.CY + matrix.TY,
                matrix.A * curve.X1 + matrix.B * curve.Y1 + matrix.TX,
                matrix.C * curve.X1 + matrix.D * curve.Y1 + matrix.TY
            )
        }
        if contour.Closed {
            builder.Close()
        }
    }
    return builder.Build()
}

func VerifyNonScalingStrokeHostHit(shape Node, matrix Affine2D) {
    let length = MathF.Sqrt(matrix.A * matrix.A + matrix.C * matrix.C)
    let sign = matrix.A * matrix.D - matrix.B * matrix.C < 0.0F ? -1.0F: 1.0F
    let normalX = sign * matrix.C / length
    let normalY = -sign * matrix.A / length
    let x = matrix.A * 35.0F + matrix.B * 20.0F + matrix.TX
    let y = matrix.C * 35.0F + matrix.D * 20.0F + matrix.TY
    let inside = TransformGeometry.WindowToNode(shape, x + normalX * 2.5F, y + normalY * 2.5F)
    let outside = TransformGeometry.WindowToNode(shape, x + normalX * 4.5F, y + normalY * 4.5F)
    Require(
        inside.Valid && ShapeGeometry.HitTest(shape, inside.X, inside.Y),
        "Transformed host-pixel stroke hit failed"
    )
    Require(
        outside.Valid && !ShapeGeometry.HitTest(shape, outside.X, outside.Y),
        "Transformed stroke hit scaled its width"
    )
}

func CompareNonScalingStrokePixels(frame WindowCapture, context string) {
    let width = int32(frame.Width)
    let height = int32(frame.Height)
    let half = width / 2
    let rowBytes = int32(frame.RowBytes)
    var interior = 0
    for y in 1 ... height - 1 {
        for x in 1 ... half - 1 {
            var minimum = 255
            var maximum = 0
            for dy in -1 ... 2 {
                for dx in -1 ... 2 {
                    let value = int32(frame.Pixels[(y + dy) * rowBytes + (half + x + dx) * 4])
                    minimum = Math.Min(minimum, value)
                    maximum = Math.Max(maximum, value)
                }
            }
            let actual = int32(frame.Pixels[y * rowBytes + x * 4])
            if minimum >= 224 {
                interior++
            }
            if (minimum >= 224 && actual < 160) || (maximum <= 16 && actual > 96) {
                throw InvalidOperationException(
                    "Non-scaling stroke differs from host-space CPU stroke: " + context
                    + " x=" + x.ToString() + " y=" + y.ToString() + " actual=" + actual.ToString()
                    + "/" + frame.Pixels[y * rowBytes + x * 4 + 1].ToString()
                    + "/" + frame.Pixels[y * rowBytes + x * 4 + 2].ToString()
                    + " reference=" + minimum.ToString() + "/" + maximum.ToString()
                    + " center=" + frame.Pixels[y * rowBytes + (half + x) * 4].ToString()
                    + "/" + frame.Pixels[y * rowBytes + (half + x) * 4 + 1].ToString()
                    + "/" + frame.Pixels[y * rowBytes + (half + x) * 4 + 2].ToString()
                )
            }
        }
    }
    Require(interior >= 20, "Stroke proof did not compare enough interior pixels: " + context)
}

func MeasureNonScalingStroke(path VectorPath, count int32, nonScaling bool) {
    let root = NonScalingStrokeBenchCell(path, count, nonScaling)
    let window = Window{
        Title: "Goo stroke zoom benchmark",
        Width: 800,
        Height: 600,
        VSync: false,
        Background: Color.Black,
        Root: root
    }
    try {
        window.Open()
        for frame in 0 ... 10 {
            WindowReadbackTestFixture.ForceRender(window, 0.0, 10.0)
        }
        let initial = WindowReadbackTestFixture.PathResources(window)
        let builds = PathBandEncoder.BuildCount
        let strokeBuilds = PathStrokeCache.Shared.BuildCount
        let flattens = PathStrokeCache.Shared.FlattenCount
        let metricBuilds = VulkanPathStrokeFrameData.MetricBuildCount
        let counters = WindowReadbackTestFixture.DiagnosticCounters(window)
        let samples = [300]float64
        for frame in 0 ... samples.Length {
            root.Zoom = 0.75 + float64(frame % 100) / 200.0
            let start = Stopwatch.GetTimestamp()
            root.Rebuild()
            WindowReadbackTestFixture.ForceRender(window, 0.0, 10.0)
            samples[frame] = float64(Stopwatch.GetTimestamp() - start) * 1000.0 / float64(Stopwatch.Frequency)
            if nonScaling && PathBandEncoder.BuildCount != builds {
                throw InvalidOperationException("Non-scaling stroke zoom encoded geometry")
            }
        }
        let finalStats = WindowReadbackTestFixture.PathResources(window)
        let finalCounters = WindowReadbackTestFixture.DiagnosticCounters(window)
        if nonScaling {
            Require(
                finalStats.PathCount == 1u && finalStats.WordCount == initial.WordCount
                && finalStats.UploadSequence == initial.UploadSequence,
                "Non-scaling instances did not share one retained encoding"
            )
            Require(
                PathStrokeCache.Shared.BuildCount == strokeBuilds
                && PathStrokeCache.Shared.FlattenCount == flattens
                && VulkanPathStrokeFrameData.MetricBuildCount == metricBuilds,
                "Uniform non-scaling zoom rebuilt stroke geometry or metrics"
            )
        }
        Array.Sort(samples)
        let frames = float64(finalCounters.recordCount - counters.recordCount)
        Console.WriteLine(
            "NON_SCALING_STROKE_ZOOM instances=" + count.ToString()
            + " non_scaling=" + nonScaling.ToString() + " frames=300 encode_builds="
            + (PathBandEncoder.BuildCount - builds).ToString() + " paths=" + finalStats.PathCount.ToString()
            + " atlas_bytes=" + (uint64(finalStats.WordCount) * 4uL).ToString()
            + " stroke_builds=" + (PathStrokeCache.Shared.BuildCount - strokeBuilds).ToString()
            + " flattens=" + (PathStrokeCache.Shared.FlattenCount - flattens).ToString()
            + " gpu_metric_builds=" + (VulkanPathStrokeFrameData.MetricBuildCount - metricBuilds).ToString()
            + " draws_per_frame=" + (float64(finalCounters.drawCount - counters.drawCount) / frames).ToString(
                "F1",
                CultureInfo.InvariantCulture
            )
            +
                " pipeline_binds_per_frame=" +
                (float64(finalCounters.pipelineChangeCount - counters.pipelineChangeCount) / frames).ToString(
                "F1",
                CultureInfo.InvariantCulture
            )
            +
                " descriptor_binds_per_frame=" +
                (float64(finalCounters.descriptorChangeCount - counters.descriptorChangeCount) / frames).ToString(
                "F1",
                CultureInfo.InvariantCulture
            )
            + " p50_ms=" + samples[150].ToString("F3", CultureInfo.InvariantCulture)
            + " p95_ms=" + samples[284].ToString("F3", CultureInfo.InvariantCulture)
        )
        ProfileNonScalingStroke(window, root)
        if nonScaling {
            root.StrokeColor = Color.Rgb(0, 0, 255)
            root.Rebuild()
            WindowReadbackTestFixture.ForceRender(window, 0.0, 10.0)
            Require(
                PathBandEncoder.BuildCount == builds && PathStrokeCache.Shared.BuildCount == strokeBuilds,
                "Non-scaling color change rebuilt geometry"
            )
            root.Path = PathBuilder(0.0, 0.0, 12.0, 12.0)
                .MoveTo(1.0, 1.0)
                .LineTo(10.0, 2.0)
                .LineTo(9.0, 10.0)
                .Close()
                .Build()
            root.Rebuild()
            WindowReadbackTestFixture.ForceRender(window, 0.0, 10.0)
            Require(
                PathBandEncoder.BuildCount == builds + 1uL,
                "A shared geometry edit did not build exactly one encoding"
            )
        }
    } finally {
        window.Close()
    }
}

func ProfileNonScalingStroke(window Window, root NonScalingStrokeBenchCell) {
    guard let recorder = FrameRecorder.Start(Guid.NewGuid(), FrameRecorder.DefaultBufferBytes) else {
        throw InvalidOperationException("Stroke timing recorder did not start")
    }
    let paint = List[float64]()
    let gpu = List[float64]()
    var after int64
    try {
        for frame in 0 ... 36 {
            root.Zoom = 0.75 + float64(frame % 100) / 200.0
            root.Rebuild()
            WindowReadbackTestFixture.ForceRender(window, 0.0, 10.0)
            var paintMs = 0.0
            var more = true
            while more {
                let records = recorder.Read(after, 10000, out after, out more, out var state, out var dropped)
                Require(dropped == 0L, "Stroke timing recorder lost samples")
                if frame < 4 {
                    continue
                }
                for record in records {
                    if record.Kind == FrameTraceKind.Duration && record.Source == "target.render"
                    && record.EventId == uint64(int32(FrameProfileStage.Paint)) {
                        paintMs += float64(record.EndTicks - record.Ticks) * 1000.0 / float64(Stopwatch.Frequency)
                    }
                    if record.Source == "vulkan.timestamp.elapsed"
                    && record.EventId == VulkanDiagnosticEventIds.MainPass {
                        if let elapsed = record.GpuElapsedNs {
                            gpu.Add(float64(elapsed) / 1000000.0)
                        }
                    }
                }
            }
            if frame >= 4 {
                paint.Add(paintMs)
            }
        }
        Require(paint.Count >= 30 && gpu.Count >= 28, "Stroke timing samples are missing")
        paint.Sort()
        gpu.Sort()
        Console.WriteLine(
            "NON_SCALING_STROKE_PROFILE instances=" + root.Count.ToString()
            + " non_scaling=" + root.NonScaling.ToString()
            + " paint_p50_ms=" + paint[paint.Count / 2].ToString("F3", CultureInfo.InvariantCulture)
            + " paint_p95_ms=" + paint[(paint.Count - 1) * 95 / 100].ToString("F3", CultureInfo.InvariantCulture)
            + " gpu_p50_ms=" + gpu[gpu.Count / 2].ToString("F3", CultureInfo.InvariantCulture)
            + " gpu_p95_ms=" + gpu[(gpu.Count - 1) * 95 / 100].ToString("F3", CultureInfo.InvariantCulture)
        )
    } finally {
        recorder.Stop(true)
    }
}
