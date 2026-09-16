namespace Goo.SvgCompiler;

internal sealed partial class SvgCompiler
{
    private List<SvgNode> OrderNodes()
    {
        var ordered = new List<SvgNode>(nodes.Count);
        var pending = new Queue<SvgNode>();
        pending.Enqueue(nodes[0]);
        while (pending.Count > 0)
        {
            var node = pending.Dequeue();
            ordered.Add(node);
            foreach (var child in node.Children)
            {
                pending.Enqueue(child);
            }
        }
        if (ordered.Count != nodes.Count)
        {
            throw new SvgCompileException("compiled node tree is disconnected");
        }
        for (var index = 0; index < ordered.Count; index++)
        {
            ordered[index].Index = index;
        }
        return ordered;
    }

    private byte[] WriteAsset()
    {
        var nodeBytes = new ByteWriter();
        var contourBytes = new ByteWriter();
        var curveBytes = new ByteWriter();
        var paintBytes = new ByteWriter();
        var stopBytes = new ByteWriter();
        var strokeBytes = new ByteWriter();
        var dashBytes = new ByteWriter();
        var clipBytes = new ByteWriter();
        var trackBytes = new ByteWriter();
        var keyframeBytes = new ByteWriter();
        var morphCurveBytes = new ByteWriter();
        var paintIndices = new Dictionary<SvgPaint, int>(ReferenceEqualityComparer.Instance);
        var strokeIndices = new Dictionary<SvgStroke, int>(ReferenceEqualityComparer.Instance);
        var clipIndices = new Dictionary<SvgClip, int>(ReferenceEqualityComparer.Instance);
        var trackIndices = new Dictionary<SvgAnimation, int>(ReferenceEqualityComparer.Instance);
        var tracks = new List<SvgAnimation>();
        var keyframes = new List<SvgAnimationKeyframe>();
        var morphCurves = new List<SvgQuadratic>();
        var orderedNodes = OrderNodes();

        foreach (var node in orderedNodes)
        {
            var contourStart = 0;
            var contourCount = 0;
            var paintIndex = uint.MaxValue;
            var strokeIndex = uint.MaxValue;
            var clipIndex = uint.MaxValue;
            var transformTrackIndex = uint.MaxValue;
            var opacityTrackIndex = uint.MaxValue;
            var morphTrackIndex = uint.MaxValue;
            var flags = node.Shape?.Flags ?? 0u;
            if (node.TransformAnimation is { } transformAnimation)
            {
                transformTrackIndex = (uint)GetTrackIndex(transformAnimation, trackIndices, tracks,
                    keyframes, morphCurves, trackBytes, keyframeBytes, morphCurveBytes);
            }
            if (node.OpacityAnimation is { } opacityAnimation)
            {
                opacityTrackIndex = (uint)GetTrackIndex(opacityAnimation, trackIndices, tracks,
                    keyframes, morphCurves, trackBytes, keyframeBytes, morphCurveBytes);
            }
            if (node.MorphAnimation is { } morphAnimation)
            {
                morphTrackIndex = (uint)GetTrackIndex(morphAnimation, trackIndices, tracks,
                    keyframes, morphCurves, trackBytes, keyframeBytes, morphCurveBytes);
            }
            if (node.Shape is { } shape)
            {
                contourStart = contours.Count;
                foreach (var contour in shape.Path.Contours)
                {
                    var curveStart = curves.Count;
                    AppendCurves(contour.Curves);
                    contourBytes.WriteU32((uint)curveStart);
                    contourBytes.WriteU32((uint)contour.Curves.Count);
                    contourBytes.WriteU32(contour.Closed ? 1u : 0u);
                    contourBytes.WriteU32(0);
                    contours.Add(contour);
                }
                contourCount = shape.Path.Contours.Count;
                if (shape.Fill is { } fill)
                {
                    if (fill.Animation is { } fillAnimation)
                    {
                        fill.TrackIndex = GetTrackIndex(fillAnimation, trackIndices, tracks,
                            keyframes, morphCurves, trackBytes, keyframeBytes, morphCurveBytes);
                    }
                    paintIndex = (uint)GetPaintIndex(fill, paintIndices, paintBytes, stopBytes);
                }
                if (shape.Stroke is { } stroke)
                {
                    if (stroke.Paint.Animation is { } strokeColorAnimation)
                    {
                        stroke.Paint.TrackIndex = GetTrackIndex(strokeColorAnimation, trackIndices, tracks,
                            keyframes, morphCurves, trackBytes, keyframeBytes, morphCurveBytes);
                    }
                    if (stroke.Animation is { } strokeAnimation)
                    {
                        stroke.TrackIndex = GetTrackIndex(strokeAnimation, trackIndices, tracks,
                            keyframes, morphCurves, trackBytes, keyframeBytes, morphCurveBytes);
                    }
                    strokeIndex = (uint)GetStrokeIndex(stroke, strokeIndices, strokeBytes, dashBytes, paintIndices, paintBytes, stopBytes);
                }
                if (shape.Clip is { } clip)
                {
                    clipIndex = (uint)GetClipIndex(clip, clipIndices, clipBytes, contourBytes);
                }
            }
            var parentIndex = node.Parent is null ? uint.MaxValue : (uint)node.Parent.Index;
            var firstChild = node.Children.Count == 0 ? uint.MaxValue : (uint)node.Children[0].Index;
            nodeBytes.WriteU32(parentIndex);
            nodeBytes.WriteU32(firstChild);
            nodeBytes.WriteU32((uint)node.Children.Count);
            nodeBytes.WriteU32(flags);
            nodeBytes.WriteU32((uint)contourStart);
            nodeBytes.WriteU32((uint)contourCount);
            nodeBytes.WriteU32(paintIndex);
            nodeBytes.WriteU32(strokeIndex);
            nodeBytes.WriteU32(clipIndex);
            nodeBytes.WriteU32(transformTrackIndex);
            nodeBytes.WriteU32(opacityTrackIndex);
            nodeBytes.WriteU32(morphTrackIndex);
            nodeBytes.WriteF32(node.Transform.A);
            nodeBytes.WriteF32(node.Transform.B);
            nodeBytes.WriteF32(node.Transform.C);
            nodeBytes.WriteF32(node.Transform.D);
            nodeBytes.WriteF32(node.Transform.E);
            nodeBytes.WriteF32(node.Transform.F);
            nodeBytes.WriteF32(node.Opacity);
            nodeBytes.WriteU32(0);
        }
        foreach (var curve in curves)
        {
            curveBytes.WriteF32(curve.X0);
            curveBytes.WriteF32(curve.Y0);
            curveBytes.WriteF32(curve.CX);
            curveBytes.WriteF32(curve.CY);
            curveBytes.WriteF32(curve.X1);
            curveBytes.WriteF32(curve.Y1);
        }
        if (nodes.Count > MaxNodes || contours.Count > MaxContours || curves.Count > MaxCurves
            || paints.Count > MaxPaints || stops.Count > MaxPaintStops || strokes.Count > MaxStrokes
            || dashValues.Count > MaxDashValues || clipRecords.Count > MaxClips
            || tracks.Count > 65536 || keyframes.Count > 262144 || morphCurves.Count > 262144)
        {
            throw new SvgCompileException("compiled vector section limit exceeded");
        }
        var sections = new[]
        {
            nodeBytes.ToArray(), contourBytes.ToArray(), curveBytes.ToArray(), paintBytes.ToArray(),
            stopBytes.ToArray(), strokeBytes.ToArray(), dashBytes.ToArray(), clipBytes.ToArray(),
            trackBytes.ToArray(), keyframeBytes.ToArray(), morphCurveBytes.ToArray()
        };
        var counts = new[]
        {
            nodes.Count, contours.Count, curves.Count, paints.Count, stops.Count,
            strokes.Count, dashValues.Count, clipRecords.Count, tracks.Count, keyframes.Count, morphCurves.Count
        };
        var strides = new[] { 80, 16, 24, 40, 12, 40, 4, 16, 24, 48, 24 };
        var output = new ByteWriter();
        output.WriteZeros(172);
        var offsets = new int[11];
        for (var index = 0; index < sections.Length; index++)
        {
            if (counts[index] == 0)
            {
                continue;
            }
            output.Align4();
            offsets[index] = output.Count;
            output.WriteBytes(sections[index]);
            if (sections[index].Length != counts[index] * strides[index])
            {
                throw new SvgCompileException($"section {index} has an invalid stride");
            }
        }
        if (output.Count > MaxAssetBytes)
        {
            throw new SvgCompileException($"compiled asset exceeds {MaxAssetBytes} bytes");
        }
        output.WriteU32At(0, 0x31564347u);
        output.WriteU16At(4, 1);
        output.WriteU16At(6, 172);
        output.WriteU32At(8, (uint)output.Count);
        output.WriteU32At(12, 11);
        output.WriteU32At(16, 0);
        output.WriteU32At(20, 0);
        output.WriteF32At(24, viewBoxX);
        output.WriteF32At(28, viewBoxY);
        output.WriteF32At(32, viewBoxWidth);
        output.WriteF32At(36, viewBoxHeight);
        for (var index = 0; index < 11; index++)
        {
            var descriptor = 40 + index * 12;
            output.WriteU32At(descriptor, counts[index] == 0 ? 0u : (uint)offsets[index]);
            output.WriteU32At(descriptor + 4, (uint)sections[index].Length);
            output.WriteU32At(descriptor + 8, (uint)counts[index]);
        }
        return output.ToArray();
    }

    private int GetPaintIndex(SvgPaint paint, Dictionary<SvgPaint, int> indices,
        ByteWriter paintBytes, ByteWriter stopBytes)
    {
        if (indices.TryGetValue(paint, out var existing)) return existing;
        if (paints.Count >= MaxPaints) throw new SvgCompileException($"paint count exceeds {MaxPaints}");
        var index = paints.Count;
        var stopStart = stops.Count;
        foreach (var stop in paint.Stops)
        {
            stops.Add(stop);
            stopBytes.WriteF32(stop.Offset);
            stopBytes.WriteU32(stop.Color.Packed);
            stopBytes.WriteU32(0);
        }
        paintBytes.WriteU16((ushort)paint.Kind);
        paintBytes.WriteU16(0);
        paintBytes.WriteU32(paint.Color.Packed);
        paintBytes.WriteF32(paint.Opacity);
        paintBytes.WriteF32(paint.X0);
        paintBytes.WriteF32(paint.Y0);
        paintBytes.WriteF32(paint.X1);
        paintBytes.WriteF32(paint.Y1);
        paintBytes.WriteU32(paint.TrackIndex < 0 ? uint.MaxValue : (uint)paint.TrackIndex);
        paintBytes.WriteU32((uint)stopStart);
        paintBytes.WriteU32((uint)paint.Stops.Count);
        paints.Add(paint);
        indices.Add(paint, index);
        return index;
    }

    private int GetStrokeIndex(SvgStroke stroke, Dictionary<SvgStroke, int> indices,
        ByteWriter strokeBytes, ByteWriter dashBytes, Dictionary<SvgPaint, int> paintIndices,
        ByteWriter paintBytes, ByteWriter stopBytes)
    {
        if (indices.TryGetValue(stroke, out var existing)) return existing;
        if (strokes.Count >= MaxStrokes) throw new SvgCompileException($"stroke count exceeds {MaxStrokes}");
        var paintIndex = GetPaintIndex(stroke.Paint, paintIndices, paintBytes, stopBytes);
        var dashStart = dashValues.Count;
        foreach (var value in stroke.Dashes)
        {
            dashValues.Add(value);
            dashBytes.WriteF32(value);
        }
        var index = strokes.Count;
        strokeBytes.WriteF32(stroke.Width);
        strokeBytes.WriteF32(stroke.MiterLimit);
        strokeBytes.WriteU32(stroke.Cap);
        strokeBytes.WriteU32(stroke.Join);
        strokeBytes.WriteF32(stroke.DashOffset);
        strokeBytes.WriteU32((uint)paintIndex);
        strokeBytes.WriteU32(stroke.TrackIndex < 0 ? uint.MaxValue : (uint)stroke.TrackIndex);
        strokeBytes.WriteU32((uint)dashStart);
        strokeBytes.WriteU32((uint)stroke.Dashes.Count);
        strokeBytes.WriteU32(0);
        strokes.Add(stroke);
        indices.Add(stroke, index);
        return index;
    }

    private static int GetTrackIndex(SvgAnimation animation,
        Dictionary<SvgAnimation, int> indices, List<SvgAnimation> tracks,
        List<SvgAnimationKeyframe> keyframes, List<SvgQuadratic> morphCurves,
        ByteWriter trackBytes, ByteWriter keyframeBytes, ByteWriter morphCurveBytes)
    {
        if (indices.TryGetValue(animation, out var existing)) return existing;
        if (tracks.Count >= 65536)
        {
            throw new SvgCompileException("track count exceeds 65536");
        }
        if (animation.Keyframes.Count == 0 || animation.Keyframes.Count > 262144 - keyframes.Count)
        {
            throw new SvgCompileException("keyframe count exceeds 262144");
        }
        var keyframeStart = keyframes.Count;
        foreach (var keyframe in animation.Keyframes)
        {
            if (animation.Kind == SvgAnimationKind.Morph)
            {
                var targetCurves = keyframe.MorphCurves
                    ?? throw new SvgCompileException("morph keyframe has no target curves");
                if (targetCurves.Count == 0 || targetCurves.Count > 262144 - morphCurves.Count)
                {
                    throw new SvgCompileException("morph curve count exceeds 262144");
                }
                keyframe.MorphCurveStart = (uint)morphCurves.Count;
                keyframe.MorphCurveCount = (uint)targetCurves.Count;
                foreach (var curve in targetCurves)
                {
                    morphCurves.Add(curve);
                    morphCurveBytes.WriteF32(curve.X0);
                    morphCurveBytes.WriteF32(curve.Y0);
                    morphCurveBytes.WriteF32(curve.CX);
                    morphCurveBytes.WriteF32(curve.CY);
                    morphCurveBytes.WriteF32(curve.X1);
                    morphCurveBytes.WriteF32(curve.Y1);
                }
                keyframes.Add(keyframe);
                keyframeBytes.WriteF32(keyframe.Time);
                keyframeBytes.WriteU32(keyframe.MorphCurveStart);
                keyframeBytes.WriteU32(keyframe.MorphCurveCount);
                keyframeBytes.WriteZeros(16);
                keyframeBytes.WriteU32(keyframe.Easing);
                keyframeBytes.WriteF32(keyframe.ControlA);
                keyframeBytes.WriteF32(keyframe.ControlB);
                keyframeBytes.WriteF32(keyframe.ControlC);
                keyframeBytes.WriteF32(keyframe.ControlD);
                continue;
            }
            keyframes.Add(keyframe);
            keyframeBytes.WriteF32(keyframe.Time);
            keyframeBytes.WriteF32(keyframe.A);
            keyframeBytes.WriteF32(keyframe.B);
            keyframeBytes.WriteF32(keyframe.C);
            keyframeBytes.WriteF32(keyframe.D);
            keyframeBytes.WriteF32(keyframe.E);
            keyframeBytes.WriteF32(keyframe.F);
            keyframeBytes.WriteU32(keyframe.Easing);
            keyframeBytes.WriteF32(keyframe.ControlA);
            keyframeBytes.WriteF32(keyframe.ControlB);
            keyframeBytes.WriteF32(keyframe.ControlC);
            keyframeBytes.WriteF32(keyframe.ControlD);
        }
        var index = tracks.Count;
        trackBytes.WriteU16((ushort)animation.Kind);
        trackBytes.WriteU16((ushort)GetValueKind(animation.Kind));
        trackBytes.WriteU32((uint)keyframeStart);
        trackBytes.WriteU32((uint)animation.Keyframes.Count);
        trackBytes.WriteF32(animation.Duration);
        trackBytes.WriteU32(animation.Flags);
        trackBytes.WriteU32(0);
        tracks.Add(animation);
        indices.Add(animation, index);
        return index;
    }

    private static int GetValueKind(SvgAnimationKind kind)
    {
        return kind switch
        {
            SvgAnimationKind.Transform => 2,
            SvgAnimationKind.Opacity => 0,
            SvgAnimationKind.Color => 1,
            SvgAnimationKind.Stroke => 3,
            SvgAnimationKind.Morph => 4,
            _ => throw new SvgCompileException("unknown animation kind")
        };
    }

    private int GetClipIndex(SvgClip clip, Dictionary<SvgClip, int> indices,
        ByteWriter clipBytes, ByteWriter contourBytes)
    {
        if (indices.TryGetValue(clip, out var existing)) return existing;
        if (clipRecords.Count >= MaxClips) throw new SvgCompileException($"clip count exceeds {MaxClips}");
        var start = contours.Count;
        foreach (var contour in clip.Contours)
        {
            var curveStart = curves.Count;
            AppendCurves(contour.Curves);
            contourBytes.WriteU32((uint)curveStart);
            contourBytes.WriteU32((uint)contour.Curves.Count);
            contourBytes.WriteU32(contour.Closed ? 1u : 0u);
            contourBytes.WriteU32(0);
            contours.Add(contour);
        }
        var index = clipRecords.Count;
        clipBytes.WriteU32((uint)start);
        clipBytes.WriteU32((uint)clip.Contours.Count);
        clipBytes.WriteU32(clip.FillRule);
        clipBytes.WriteU32(uint.MaxValue);
        clipRecords.Add(clip);
        indices.Add(clip, index);
        return index;
    }

    private void ReserveCurves(SvgPath path)
    {
        var count = 0;
        foreach (var contour in path.Contours)
        {
            if (contour.Curves.Count > MaxCurves - count)
            {
                throw new SvgCompileException($"curve count exceeds {MaxCurves}");
            }
            count += contour.Curves.Count;
        }
        if (count > MaxCurves - reservedCurveCount)
        {
            throw new SvgCompileException($"curve count exceeds {MaxCurves}");
        }
        reservedCurveCount += count;
    }

    private void AppendCurves(IReadOnlyCollection<SvgQuadratic> source)
    {
        if (source.Count > MaxCurves - curves.Count)
        {
            throw new SvgCompileException($"curve count exceeds {MaxCurves}");
        }
        curves.AddRange(source);
    }

    private static void AddLine(SvgContour contour, SvgPoint from, SvgPoint to)
    {
        contour.Curves.Add(new SvgQuadratic(from.X, from.Y, (from.X + to.X) / 2, (from.Y + to.Y) / 2, to.X, to.Y));
    }

    private static void AddQuadratic(SvgContour contour, SvgPoint from, SvgPoint control, SvgPoint to)
    {
        contour.Curves.Add(new SvgQuadratic(from.X, from.Y, control.X, control.Y, to.X, to.Y));
    }

    private static void AddCubic(SvgContour contour, SvgPoint from, SvgPoint c1, SvgPoint c2, SvgPoint to)
    {
        AddCubicRecursive(contour, from, c1, c2, to, 0);
    }

    private static void AddCubicRecursive(SvgContour contour, SvgPoint p0, SvgPoint p1, SvgPoint p2, SvgPoint p3, int depth)
    {
        var control = new SvgPoint(
            (3 * (p1.X + p2.X) - p0.X - p3.X) / 4,
            (3 * (p1.Y + p2.Y) - p0.Y - p3.Y) / 4);
        var deltaX = p3.X - 3 * p2.X + 3 * p1.X - p0.X;
        var deltaY = p3.Y - 3 * p2.Y + 3 * p1.Y - p0.Y;
        var error = Math.Sqrt(deltaX * deltaX + deltaY * deltaY) * Math.Sqrt(3) / 36;
        if (!control.IsFinite || !double.IsFinite(error))
        {
            throw new SvgCompileException("cubic curve contains non-finite geometry");
        }
        if (error <= QuadraticTolerance || depth >= 10)
        {
            AddQuadratic(contour, p0, control, p3);
            return;
        }
        var p01 = Midpoint(p0, p1);
        var p12 = Midpoint(p1, p2);
        var p23 = Midpoint(p2, p3);
        var p012 = Midpoint(p01, p12);
        var p123 = Midpoint(p12, p23);
        var middle = Midpoint(p012, p123);
        AddCubicRecursive(contour, p0, p01, p012, middle, depth + 1);
        AddCubicRecursive(contour, middle, p123, p23, p3, depth + 1);
    }

    private static SvgPoint Midpoint(SvgPoint left, SvgPoint right) => new((left.X + right.X) / 2, (left.Y + right.Y) / 2);

    private static string LocalName(XElement element) => element.Name.LocalName;
    private static void RequireName(XElement element, string name)
    {
        if (!LocalName(element).Equals(name, StringComparison.Ordinal))
        {
            throw Fail(element, $"root must be '{name}'");
        }
    }

    private static void ValidateNamespace(XElement element)
    {
        if (element.Name.Namespace != XNamespace.None
            && element.Name.Namespace != "http://www.w3.org/2000/svg")
        {
            throw Fail(element, "only the SVG namespace is supported");
        }
    }

    internal static SvgCompileException Fail(XElement element, string message)
    {
        var info = (IXmlLineInfo)element;
        return info.HasLineInfo()
            ? new SvgCompileException($"line {info.LineNumber}, column {info.LinePosition}: {message}")
            : new SvgCompileException(message);
    }

    private static readonly IReadOnlyDictionary<string, SvgColor> NamedColors =
        new Dictionary<string, SvgColor>(StringComparer.OrdinalIgnoreCase)
        {
            ["black"] = new(0, 0, 0, 255),
            ["white"] = new(255, 255, 255, 255),
            ["red"] = new(255, 0, 0, 255),
            ["green"] = new(0, 128, 0, 255),
            ["blue"] = new(0, 0, 255, 255),
            ["yellow"] = new(255, 255, 0, 255),
            ["cyan"] = new(0, 255, 255, 255),
            ["aqua"] = new(0, 255, 255, 255),
            ["magenta"] = new(255, 0, 255, 255),
            ["fuchsia"] = new(255, 0, 255, 255),
            ["gray"] = new(128, 128, 128, 255),
            ["grey"] = new(128, 128, 128, 255),
            ["transparent"] = new(0, 0, 0, 0)
        };
}
