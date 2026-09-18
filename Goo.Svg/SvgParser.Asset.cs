using Goo;

namespace Goo.Svg;

internal sealed partial class SvgParser
{
    private VectorAsset BuildAsset()
    {
        var orderedNodes = OrderNodes();
        var paintIndices = new Dictionary<SvgPaint, int>(ReferenceEqualityComparer.Instance);
        var strokeIndices = new Dictionary<SvgStroke, int>(ReferenceEqualityComparer.Instance);
        var trackIndices = new Dictionary<SvgAnimation, int>(ReferenceEqualityComparer.Instance);
        var animationNodes = new List<VectorAnimationNode>(orderedNodes.Count);
        var animationPaints = new List<VectorAnimationPaint>();
        var animationStrokes = new List<VectorAnimationStroke>();
        var animationTracks = new List<VectorAnimationTrack>();
        var keyframes = new List<VectorAnimationKeyframe>();
        var morphCurves = new List<VectorAnimationCurve>();
        var dashes = new List<float>();

        foreach (var node in orderedNodes)
        {
            var paintIndex = MissingIndex;
            var strokeIndex = MissingIndex;
            var transformTrackIndex = AddTrack(node.TransformAnimation);
            var opacityTrackIndex = AddTrack(node.OpacityAnimation);
            var morphTrackIndex = AddTrack(node.MorphAnimation);
            if (node.Shape is { } shape)
            {
                if (shape.Fill is { } fill)
                {
                    paintIndex = AddPaint(fill);
                }
                if (shape.Stroke is { } stroke)
                {
                    strokeIndex = AddStroke(stroke);
                }
            }
            animationNodes.Add(new VectorAnimationNode(paintIndex, strokeIndex,
                transformTrackIndex, opacityTrackIndex, morphTrackIndex));
        }

        var roots = new[] { BuildNode(nodes[0]) };
        if (animationTracks.Count == 0)
        {
            return new VectorAsset(viewBoxX, viewBoxY, viewBoxWidth, viewBoxHeight, roots);
        }
        var animation = new VectorAssetAnimation(animationNodes.ToArray(),
            animationPaints.ToArray(), animationStrokes.ToArray(), animationTracks.ToArray(),
            keyframes.ToArray(), morphCurves.ToArray(), dashes.ToArray());
        return new VectorAsset(viewBoxX, viewBoxY, viewBoxWidth, viewBoxHeight, roots, animation);

        uint AddPaint(SvgPaint paint)
        {
            if (paintIndices.TryGetValue(paint, out var existing))
            {
                return (uint)existing;
            }
            if (animationPaints.Count >= MaxPaints)
            {
                throw new SvgParseException($"paint count exceeds {MaxPaints}");
            }
            var index = animationPaints.Count;
            animationPaints.Add(new VectorAnimationPaint((VectorPaintKind)paint.Kind,
                AddTrack(paint.Animation)));
            paintIndices.Add(paint, index);
            return (uint)index;
        }

        uint AddStroke(SvgStroke stroke)
        {
            if (strokeIndices.TryGetValue(stroke, out var existing))
            {
                return (uint)existing;
            }
            if (animationStrokes.Count >= MaxStrokes)
            {
                throw new SvgParseException($"stroke count exceeds {MaxStrokes}");
            }
            var dashStart = dashes.Count;
            foreach (var value in stroke.Dashes)
            {
                dashes.Add(F32(value));
            }
            var index = animationStrokes.Count;
            animationStrokes.Add(new VectorAnimationStroke(F32(stroke.Width),
                F32(stroke.MiterLimit), stroke.Cap, stroke.Join, F32(stroke.DashOffset),
                AddPaint(stroke.Paint), AddTrack(stroke.Animation), (uint)dashStart,
                (uint)stroke.Dashes.Count));
            strokeIndices.Add(stroke, index);
            return (uint)index;
        }

        uint AddTrack(SvgAnimation? animation)
        {
            if (animation is null)
            {
                return MissingIndex;
            }
            if (trackIndices.TryGetValue(animation, out var existing))
            {
                return (uint)existing;
            }
            if (animationTracks.Count >= 65536 || animation.Keyframes.Count == 0
                || animation.Keyframes.Count > 262144 - keyframes.Count)
            {
                throw new SvgParseException("animation track limit exceeded");
            }
            var keyframeStart = keyframes.Count;
            foreach (var keyframe in animation.Keyframes)
            {
                var curveStart = MissingIndex;
                var curveCount = 0u;
                if (animation.Kind == SvgAnimationKind.Morph)
                {
                    var source = keyframe.MorphCurves
                        ?? throw new SvgParseException("morph keyframe has no target curves");
                    if (source.Count == 0 || source.Count > 262144 - morphCurves.Count)
                    {
                        throw new SvgParseException("morph curve limit exceeded");
                    }
                    curveStart = (uint)morphCurves.Count;
                    curveCount = (uint)source.Count;
                    foreach (var curve in source)
                    {
                        morphCurves.Add(new VectorAnimationCurve(F32(curve.X0), F32(curve.Y0),
                            F32(curve.CX), F32(curve.CY), F32(curve.X1), F32(curve.Y1)));
                    }
                }
                keyframes.Add(new VectorAnimationKeyframe(F32(keyframe.Time), F32(keyframe.A),
                    F32(keyframe.B), F32(keyframe.C), F32(keyframe.D), F32(keyframe.E),
                    F32(keyframe.F), keyframe.Easing, F32(keyframe.ControlA),
                    F32(keyframe.ControlB), F32(keyframe.ControlC), F32(keyframe.ControlD),
                    curveStart, curveCount));
            }
            var index = animationTracks.Count;
            animationTracks.Add(new VectorAnimationTrack((VectorAnimationKind)animation.Kind,
                (uint)keyframeStart, (uint)animation.Keyframes.Count, F32(animation.Duration),
                animation.Flags));
            trackIndices.Add(animation, index);
            return (uint)index;
        }
    }

    private List<SvgNode> OrderNodes()
    {
        var ordered = new List<SvgNode>(nodes.Count);
        var pending = new Queue<SvgNode>();
        pending.Enqueue(nodes[0]);
        while (pending.Count > 0)
        {
            var node = pending.Dequeue();
            node.Index = ordered.Count;
            ordered.Add(node);
            foreach (var child in node.Children)
            {
                pending.Enqueue(child);
            }
        }
        if (ordered.Count != nodes.Count)
        {
            throw new SvgParseException("SVG node tree is disconnected");
        }
        return ordered;
    }

    private VectorNode BuildNode(SvgNode node)
    {
        var shape = node.Shape;
        var children = node.Children.Select(BuildNode).ToArray();
        var style = new VectorNodeStyle
        {
            Key = $"node-{node.Index}",
            Fill = BuildPaint(shape?.Fill),
            Stroke = BuildStroke(shape?.Stroke),
            Transform = VectorAssetAnimation.MatrixTransform(F32(node.Transform.A),
                F32(node.Transform.B), F32(node.Transform.C), F32(node.Transform.D),
                F32(node.Transform.E), F32(node.Transform.F)),
            Opacity = node.Opacity,
            ClipPath = BuildPath(shape?.Clip?.Contours),
            FillRule = shape?.Flags == 1 ? FillRule.EvenOdd : FillRule.NonZero,
            ClipPathFillRule = shape?.Clip?.FillRule == 1 ? FillRule.EvenOdd : FillRule.NonZero
        };
        return new VectorNode(BuildPath(shape?.Path.Contours), style, children);
    }

    private VectorPaint? BuildPaint(SvgPaint? paint)
    {
        if (paint is null)
        {
            return null;
        }
        if (paint.Kind == SvgPaintKind.Solid)
        {
            return new VectorPaint(BuildColor(paint.Color));
        }
        var stops = paint.Stops.Select(stop => new GradientStop
        {
            Offset = stop.Offset,
            Color = BuildColor(stop.Color)
        }).ToArray();
        var x0 = paint.X0 / viewBoxWidth;
        var y0 = paint.Y0 / viewBoxHeight;
        var x1 = paint.X1 / viewBoxWidth;
        var y1 = paint.Y1 / viewBoxHeight;
        var gradient = paint.Kind == SvgPaintKind.LinearGradient
            ? (Gradient)new VectorLinearGradient(x0, y0, x1, y1, stops)
            : new VectorRadialGradient(x0, y0, Math.Abs(x1 - x0), Math.Abs(y1 - y0), stops);
        return new VectorPaint(gradient);
    }

    private VectorStroke? BuildStroke(SvgStroke? stroke)
    {
        if (stroke is null)
        {
            return null;
        }
        var dashes = stroke.Dashes.Count == 0
            ? null
            : new DashPattern(stroke.Dashes.ToArray(), stroke.DashOffset);
        return new VectorStroke(stroke.Width, BuildPaint(stroke.Paint)!,
            (StrokeCap)stroke.Cap, (StrokeJoin)stroke.Join, stroke.MiterLimit, dashes);
    }

    private VectorPath BuildPath(IReadOnlyList<SvgContour>? source)
    {
        if (source is null || source.Count == 0)
        {
            return VectorPath.Empty;
        }
        var builder = new PathBuilder(viewBoxX, viewBoxY, viewBoxWidth, viewBoxHeight);
        foreach (var contour in source)
        {
            if (contour.Curves.Count == 0)
            {
                continue;
            }
            builder.MoveTo(contour.Curves[0].X0, contour.Curves[0].Y0);
            foreach (var curve in contour.Curves)
            {
                builder.QuadraticTo(curve.CX, curve.CY, curve.X1, curve.Y1);
            }
            if (contour.Closed)
            {
                builder.Close();
            }
        }
        return builder.Build();
    }

    private static Color BuildColor(SvgColor color) => Color.Rgba(color.R, color.G, color.B, color.A);

    private static float F32(double value)
    {
        var result = (float)value;
        if (!float.IsFinite(result))
        {
            throw new SvgParseException("SVG value is outside the supported range");
        }
        return result;
    }

    private void ReserveCurves(SvgPath path)
    {
        var count = path.Contours.Sum(contour => contour.Curves.Count);
        if (count > MaxCurves - reservedCurveCount)
        {
            throw new SvgParseException($"curve count exceeds {MaxCurves}");
        }
        reservedCurveCount += count;
    }

    private static void AddLine(SvgContour contour, SvgPoint from, SvgPoint to)
    {
        contour.Curves.Add(new SvgQuadratic(from.X, from.Y,
            (from.X + to.X) / 2, (from.Y + to.Y) / 2, to.X, to.Y));
    }

    private static void AddQuadratic(SvgContour contour, SvgPoint from, SvgPoint control, SvgPoint to)
    {
        contour.Curves.Add(new SvgQuadratic(from.X, from.Y, control.X, control.Y, to.X, to.Y));
    }

    private static void AddCubic(SvgContour contour, SvgPoint from, SvgPoint c1, SvgPoint c2, SvgPoint to)
    {
        AddCubicRecursive(contour, from, c1, c2, to, 0);
    }

    private static void AddCubicRecursive(SvgContour contour, SvgPoint p0, SvgPoint p1,
        SvgPoint p2, SvgPoint p3, int depth)
    {
        var control = new SvgPoint(
            (3 * (p1.X + p2.X) - p0.X - p3.X) / 4,
            (3 * (p1.Y + p2.Y) - p0.Y - p3.Y) / 4);
        var deltaX = p3.X - 3 * p2.X + 3 * p1.X - p0.X;
        var deltaY = p3.Y - 3 * p2.Y + 3 * p1.Y - p0.Y;
        var error = Math.Sqrt(deltaX * deltaX + deltaY * deltaY) * Math.Sqrt(3) / 36;
        if (!control.IsFinite || !double.IsFinite(error))
        {
            throw new SvgParseException("cubic curve contains non-finite geometry");
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

    private static SvgPoint Midpoint(SvgPoint left, SvgPoint right) =>
        new((left.X + right.X) / 2, (left.Y + right.Y) / 2);

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

    internal static SvgParseException Fail(XElement element, string message)
    {
        var info = (IXmlLineInfo)element;
        return info.HasLineInfo()
            ? new SvgParseException($"line {info.LineNumber}, column {info.LinePosition}: {message}")
            : new SvgParseException(message);
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

    private const uint MissingIndex = uint.MaxValue;
}
