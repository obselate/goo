using System.Globalization;
using System.Text;
using System.Xml;
using System.Xml.Linq;

namespace Goo.SvgCompiler;

internal sealed class SvgCompileException : Exception
{
    internal SvgCompileException(string message) : base(message)
    {
    }
}

internal readonly record struct SvgPoint(double X, double Y)
{
    internal bool IsFinite => double.IsFinite(X) && double.IsFinite(Y);
}

internal readonly record struct SvgMatrix(double A, double B, double C, double D, double E, double F)
{
    internal static SvgMatrix Identity => new(1, 0, 0, 1, 0, 0);

    internal SvgPoint Apply(SvgPoint point)
    {
        return new SvgPoint(
            A * point.X + C * point.Y + E,
            B * point.X + D * point.Y + F);
    }

    public static SvgMatrix operator *(SvgMatrix left, SvgMatrix right)
    {
        return new SvgMatrix(
            left.A * right.A + left.C * right.B,
            left.B * right.A + left.D * right.B,
            left.A * right.C + left.C * right.D,
            left.B * right.C + left.D * right.D,
            left.A * right.E + left.C * right.F + left.E,
            left.B * right.E + left.D * right.F + left.F);
    }

    internal double ScaleX => Math.Sqrt(A * A + B * B);
    internal double ScaleY => Math.Sqrt(C * C + D * D);
}

internal readonly record struct SvgColor(byte R, byte G, byte B, byte A)
{
    internal uint Packed => (uint)(R << 24 | G << 16 | B << 8 | A);
}

internal enum SvgPaintKind
{
    Solid,
    LinearGradient,
    RadialGradient
}

internal sealed class SvgPaint
{
    internal SvgPaintKind Kind { get; init; }
    internal SvgColor Color { get; init; }
    internal double Opacity { get; init; }
    internal double X0 { get; init; }
    internal double Y0 { get; init; }
    internal double X1 { get; init; }
    internal double Y1 { get; init; }
    internal int TrackIndex { get; set; } = -1;
    internal SvgAnimation? Animation { get; set; }
    internal List<SvgStop> Stops { get; } = [];
}

internal sealed class SvgStop
{
    internal double Offset { get; init; }
    internal SvgColor Color { get; init; }
}

internal sealed class SvgStroke
{
    internal double Width { get; init; }
    internal double MiterLimit { get; init; }
    internal uint Cap { get; init; }
    internal uint Join { get; init; }
    internal double DashOffset { get; init; }
    internal int TrackIndex { get; set; } = -1;
    internal SvgAnimation? Animation { get; set; }
    internal SvgPaint Paint { get; init; } = null!;
    internal List<double> Dashes { get; } = [];
}

internal sealed class SvgClip
{
    internal List<SvgContour> Contours { get; } = [];
    internal uint FillRule { get; set; }
}

internal sealed class SvgShape
{
    internal SvgPath Path { get; init; } = null!;
    internal bool IsPath { get; init; }
    internal SvgPaint? Fill { get; init; }
    internal SvgStroke? Stroke { get; init; }
    internal SvgClip? Clip { get; init; }
    internal uint Flags { get; init; }
}

internal sealed class SvgNode
{
    internal SvgNode? Parent { get; init; }
    internal List<SvgNode> Children { get; } = [];
    internal SvgMatrix Transform { get; init; }
    internal double Opacity { get; init; }
    internal SvgShape? Shape { get; init; }
    internal SvgAnimation? TransformAnimation { get; set; }
    internal SvgAnimation? OpacityAnimation { get; set; }
    internal SvgAnimation? MorphAnimation { get; set; }
    internal int Index { get; set; }
}

internal enum SvgAnimationKind
{
    Transform,
    Opacity,
    Color,
    Stroke,
    Morph
}

internal sealed class SvgAnimation
{
    internal SvgAnimationKind Kind { get; init; }
    internal double Duration { get; init; }
    internal uint Flags { get; init; }
    internal List<SvgAnimationKeyframe> Keyframes { get; } = [];
}

internal sealed class SvgAnimationKeyframe
{
    internal double Time { get; init; }
    internal double A { get; init; }
    internal double B { get; init; }
    internal double C { get; init; }
    internal double D { get; init; }
    internal double E { get; init; }
    internal double F { get; init; }
    internal uint Easing { get; init; }
    internal double ControlA { get; init; }
    internal double ControlB { get; init; }
    internal double ControlC { get; init; }
    internal double ControlD { get; init; }
    internal List<SvgQuadratic>? MorphCurves { get; init; }
    internal uint MorphCurveStart { get; set; }
    internal uint MorphCurveCount { get; set; }
}

internal sealed class SvgPath
{
    internal List<SvgContour> Contours { get; } = [];

    internal (double MinX, double MinY, double MaxX, double MaxY) Bounds()
    {
        var minX = double.PositiveInfinity;
        var minY = double.PositiveInfinity;
        var maxX = double.NegativeInfinity;
        var maxY = double.NegativeInfinity;
        foreach (var contour in Contours)
        {
            foreach (var curve in contour.Curves)
            {
                IncludeQuadraticBounds(curve.X0, curve.CX, curve.X1, ref minX, ref maxX);
                IncludeQuadraticBounds(curve.Y0, curve.CY, curve.Y1, ref minY, ref maxY);
            }
        }
        return double.IsFinite(minX)
            ? (minX, minY, maxX, maxY)
            : (0, 0, 0, 0);
    }

    private static void IncludeQuadraticBounds(double start, double control, double end,
        ref double minimum, ref double maximum)
    {
        minimum = Math.Min(minimum, Math.Min(start, end));
        maximum = Math.Max(maximum, Math.Max(start, end));
        var denominator = start - 2 * control + end;
        if (denominator == 0)
        {
            return;
        }
        var t = (start - control) / denominator;
        if (t <= 0 || t >= 1 || !double.IsFinite(t))
        {
            return;
        }
        var inverse = 1 - t;
        var value = inverse * inverse * start + 2 * inverse * t * control + t * t * end;
        minimum = Math.Min(minimum, value);
        maximum = Math.Max(maximum, value);
    }
}

internal sealed class SvgContour
{
    internal List<SvgQuadratic> Curves { get; } = [];
    internal bool Closed { get; set; }
}

internal readonly record struct SvgQuadratic(double X0, double Y0, double CX, double CY, double X1, double Y1);

internal sealed class SvgGradientDefinition
{
    internal XElement Element { get; }
    internal SvgGradientDefinition(XElement element) => Element = element;
}

internal sealed class SvgClipDefinition
{
    internal XElement Element { get; }
    internal SvgClipDefinition(XElement element) => Element = element;
}

internal sealed class SvgStyle
{
    internal string Fill { get; set; } = "#000000";
    internal string? Stroke { get; set; }
    internal double FillOpacity { get; set; } = 1;
    internal double StrokeOpacity { get; set; } = 1;
    internal double StrokeWidth { get; set; } = 1;
    internal uint StrokeCap { get; set; }
    internal uint StrokeJoin { get; set; }
    internal double MiterLimit { get; set; } = 4;
    internal double DashOffset { get; set; }
    internal List<double>? Dashes { get; set; }
    internal uint FillRule { get; set; }
    internal uint ClipRule { get; set; }
    internal double Opacity { get; set; } = 1;
    internal double LocalOpacity { get; set; } = 1;
    internal string? ClipPath { get; set; }
    internal bool DisplayNone { get; set; }

    internal SvgStyle Clone()
    {
        return new SvgStyle
        {
            Fill = Fill,
            Stroke = Stroke,
            FillOpacity = FillOpacity,
            StrokeOpacity = StrokeOpacity,
            StrokeWidth = StrokeWidth,
            StrokeCap = StrokeCap,
            StrokeJoin = StrokeJoin,
            MiterLimit = MiterLimit,
            DashOffset = DashOffset,
            Dashes = Dashes is null ? null : [.. Dashes],
            FillRule = FillRule,
            ClipRule = ClipRule,
            Opacity = Opacity,
            LocalOpacity = LocalOpacity,
            ClipPath = ClipPath,
            DisplayNone = DisplayNone
        };
    }
}

internal sealed class SvgCompiler
{
    private const int MaxInputBytes = 16 * 1024 * 1024;
    private const int MaxXmlCharacters = 32 * 1024 * 1024;
    private const int MaxNodes = 65536;
    private const int MaxContours = 65536;
    private const int MaxCurves = 262144;
    private const int MaxPaints = 65536;
    private const int MaxPaintStops = 262144;
    private const int MaxStrokes = 65536;
    private const int MaxDashValues = 262144;
    private const int MaxClips = 65536;
    private const int MaxRenderDepth = 1024;
    private const int MaxAssetBytes = 64 * 1024 * 1024;
    private const double QuadraticTolerance = 0.0001;

    private readonly Dictionary<string, SvgGradientDefinition> gradients = new(StringComparer.Ordinal);
    private readonly Dictionary<string, SvgClipDefinition> clips = new(StringComparer.Ordinal);
    private readonly HashSet<string> ids = new(StringComparer.Ordinal);
    private readonly List<SvgNode> nodes = [];
    private readonly List<SvgPaint> paints = [];
    private readonly List<SvgStop> stops = [];
    private readonly List<SvgStroke> strokes = [];
    private readonly List<double> dashValues = [];
    private readonly List<SvgContour> contours = [];
    private readonly List<SvgQuadratic> curves = [];
    private readonly List<SvgClip> clipRecords = [];
    private int reservedCurveCount;
    private double viewBoxX;
    private double viewBoxY;
    private double viewBoxWidth;
    private double viewBoxHeight;

    private SvgCompiler()
    {
    }

    internal static byte[] CompileFile(string path)
    {
        if (string.IsNullOrWhiteSpace(path))
        {
            throw new SvgCompileException("input path is empty");
        }
        byte[] bytes;
        try
        {
            bytes = File.ReadAllBytes(path);
        }
        catch (Exception exception)
        {
            throw new SvgCompileException($"cannot read '{path}': {exception.Message}");
        }
        return CompileBytes(bytes, path);
    }

    internal static byte[] CompileText(string text)
    {
        if (text is null)
        {
            throw new SvgCompileException("input text is null");
        }
        if (Encoding.UTF8.GetByteCount(text) > MaxInputBytes)
        {
            throw new SvgCompileException($"input exceeds {MaxInputBytes} bytes");
        }
        try
        {
            using var source = new StringReader(text);
            using var reader = XmlReader.Create(source, CreateXmlSettings(), "<string>");
            return CompileDocument(reader, "<string>");
        }
        catch (SvgCompileException)
        {
            throw;
        }
        catch (Exception exception)
        {
            throw new SvgCompileException(exception.Message);
        }
    }

    internal static byte[] CompileStream(Stream stream, string sourceName)
    {
        if (stream is null)
        {
            throw new SvgCompileException("input stream is null");
        }
        if (string.IsNullOrWhiteSpace(sourceName))
        {
            sourceName = "<stream>";
        }
        try
        {
            using var copy = new MemoryStream();
            var buffer = new byte[81920];
            var total = 0;
            while (true)
            {
                var read = stream.Read(buffer, 0, buffer.Length);
                if (read == 0)
                {
                    break;
                }
                if (total > MaxInputBytes - read)
                {
                    throw new SvgCompileException($"input exceeds {MaxInputBytes} bytes");
                }
                copy.Write(buffer, 0, read);
                total += read;
            }
            return CompileBytes(copy.ToArray(), sourceName);
        }
        catch (SvgCompileException)
        {
            throw;
        }
        catch (Exception exception)
        {
            throw new SvgCompileException($"cannot read '{sourceName}': {exception.Message}");
        }
    }

    private static byte[] CompileBytes(byte[] bytes, string sourceName)
    {
        if (bytes.Length > MaxInputBytes)
        {
            throw new SvgCompileException($"input exceeds {MaxInputBytes} bytes");
        }
        try
        {
            using var stream = new MemoryStream(bytes, writable: false);
            using var reader = XmlReader.Create(stream, CreateXmlSettings(), sourceName);
            return CompileDocument(reader, sourceName);
        }
        catch (SvgCompileException)
        {
            throw;
        }
        catch (Exception exception)
        {
            throw new SvgCompileException(exception.Message);
        }
    }

    private static byte[] CompileDocument(XmlReader reader, string sourceName)
    {
        try
        {
            var document = XDocument.Load(reader, LoadOptions.SetLineInfo);
            if (document.Root is null)
            {
                throw new SvgCompileException("document has no root element");
            }
            return new SvgCompiler().Compile(document.Root);
        }
        catch (SvgCompileException)
        {
            throw;
        }
        catch (XmlException exception)
        {
            throw new SvgCompileException($"XML line {exception.LineNumber}, column {exception.LinePosition}: {exception.Message}");
        }
        catch (Exception exception)
        {
            throw new SvgCompileException($"{sourceName}: {exception.Message}");
        }
    }

    private static XmlReaderSettings CreateXmlSettings()
    {
        return new XmlReaderSettings
        {
            DtdProcessing = DtdProcessing.Prohibit,
            XmlResolver = null,
            MaxCharactersInDocument = MaxXmlCharacters,
            MaxCharactersFromEntities = 0,
            IgnoreComments = true,
            IgnoreWhitespace = false
        };
    }

    private byte[] Compile(XElement root)
    {
        RequireName(root, "svg");
        ValidateNamespace(root);
        CollectDefinitions(root);
        ParseViewBox(root);
        var rootStyle = ResolveStyle(root, new SvgStyle());
        var rootNode = new SvgNode
        {
            Parent = null,
            Transform = SvgMatrix.Identity,
            Opacity = rootStyle.LocalOpacity,
            Index = 0
        };
        nodes.Add(rootNode);
        if (rootStyle.DisplayNone)
        {
            return WriteAsset();
        }
        foreach (var child in root.Elements())
        {
            ParseChild(child, rootNode, rootStyle, false, 1);
        }
        if (nodes.Count > MaxNodes || contours.Count > MaxContours || curves.Count > MaxCurves
            || paints.Count > MaxPaints || stops.Count > MaxPaintStops || strokes.Count > MaxStrokes
            || dashValues.Count > MaxDashValues || clipRecords.Count > MaxClips)
        {
            throw Fail(root, "compiled vector section limit exceeded");
        }
        return WriteAsset();
    }

    private void CollectDefinitions(XElement root)
    {
        foreach (var element in root.DescendantsAndSelf())
        {
            ValidateNamespace(element);
            var name = LocalName(element);
            var id = (string?)element.Attribute("id");
            if (id is not null)
            {
                if (id.Length == 0 || !ids.Add(id))
                {
                    throw Fail(element, "duplicate or empty id");
                }
                if (name is "linearGradient" or "radialGradient")
                {
                    gradients.Add(id, new SvgGradientDefinition(element));
                }
                else if (name == "clipPath")
                {
                    clips.Add(id, new SvgClipDefinition(element));
                }
            }
            if (name is "style" or "script" or "filter" or "mask" or "foreignObject"
                or "image" or "text" or "use" or "pattern" or "symbol")
            {
                throw Fail(element, $"SVG element '{name}' is outside the compiled subset");
            }
            if (name is "animateMotion" or "animateColor" or "set" or "mpath")
            {
                throw Fail(element, $"SVG animation element '{name}' is outside the controlled animation subset");
            }
            if (IsAnimationElement(element)
                && (element.Parent is null
                    || LocalName(element.Parent) is not ("g" or "path" or "rect" or "circle" or "ellipse"
                        or "line" or "polyline" or "polygon")
                    || element.Ancestors().Any(ancestor => LocalName(ancestor) is "defs" or "clipPath"
                        or "linearGradient" or "radialGradient" or "stop")))
            {
                throw Fail(element, $"SVG animation element '{name}' is not attached to a renderable node");
            }
            foreach (var attribute in element.Attributes())
            {
                var attributeName = attribute.Name.LocalName;
                if (attributeName == "class" || attributeName.StartsWith("on", StringComparison.OrdinalIgnoreCase)
                    || attributeName is "filter" or "mask" or "externalResourcesRequired")
                {
                    throw Fail(element, $"SVG attribute '{attributeName}' is outside the compiled subset");
                }
                if (attributeName is "href" or "xlink:href")
                {
                    var value = attribute.Value.Trim();
                    if (!value.StartsWith("#", StringComparison.Ordinal) || value.Length == 1)
                    {
                        throw Fail(element, "external SVG references are not allowed");
                    }
                }
            }
        }
    }

    private void ParseViewBox(XElement root)
    {
        var viewBox = (string?)root.Attribute("viewBox");
        if (viewBox is not null)
        {
            var values = ParseNumberList(viewBox, root, "viewBox");
            if (values.Count != 4 || values[2] <= 0 || values[3] <= 0)
            {
                throw Fail(root, "viewBox must contain four positive finite values");
            }
            viewBoxX = values[0];
            viewBoxY = values[1];
            viewBoxWidth = values[2];
            viewBoxHeight = values[3];
            return;
        }
        viewBoxX = 0;
        viewBoxY = 0;
        viewBoxWidth = ParseLength((string?)root.Attribute("width") ?? "0", 0, root, "width");
        viewBoxHeight = ParseLength((string?)root.Attribute("height") ?? "0", 0, root, "height");
        if (viewBoxWidth <= 0 || viewBoxHeight <= 0)
        {
            throw Fail(root, "root SVG requires a positive viewBox or width and height");
        }
    }

    private void ParseChild(XElement element, SvgNode parent, SvgStyle inherited, bool inClip, int depth)
    {
        var name = LocalName(element);
        if (name is "defs" or "title" or "desc" or "metadata")
        {
            return;
        }
        if (name == "svg")
        {
            throw Fail(element, "nested svg elements are not supported");
        }
        if (depth >= MaxRenderDepth)
        {
            throw Fail(element, $"compiled node depth exceeds renderer limit {MaxRenderDepth}");
        }
        if (name == "g")
        {
            var style = ResolveStyle(element, inherited);
            if (style.DisplayNone)
            {
                return;
            }
            var group = AddNode(parent, ParseTransform((string?)element.Attribute("transform"), element),
                style.LocalOpacity, null);
            foreach (var child in element.Elements())
            {
                if (IsAnimationElement(child))
                {
                    ParseAnimation(child, group);
                }
                else
                {
                    ParseChild(child, group, style, inClip, depth + 1);
                }
            }
            return;
        }
        if (inClip)
        {
            throw Fail(element, $"clipPath child '{name}' is not representable");
        }
        if (name is "path" or "rect" or "circle" or "ellipse" or "line" or "polyline" or "polygon")
        {
            var style = ResolveStyle(element, inherited);
            if (style.DisplayNone)
            {
                return;
            }
            var path = ParseGeometry(element);
            var shape = BuildShape(element, path, style);
            var transform = ParseTransform((string?)element.Attribute("transform"), element);
            var node = AddNode(parent, transform, style.LocalOpacity, shape);
            foreach (var child in element.Elements())
            {
                if (IsAnimationElement(child))
                {
                    ParseAnimation(child, node);
                }
                else
                {
                    throw Fail(child, $"SVG shape child '{LocalName(child)}' is not supported");
                }
            }
            return;
        }
        throw Fail(element, $"SVG element '{name}' is outside the compiled subset");
    }

    private SvgNode AddNode(SvgNode parent, SvgMatrix transform, double opacity, SvgShape? shape)
    {
        if (nodes.Count >= MaxNodes)
        {
            throw new SvgCompileException($"node count exceeds {MaxNodes}");
        }
        var node = new SvgNode
        {
            Parent = parent,
            Transform = transform,
            Opacity = opacity,
            Shape = shape,
            Index = nodes.Count
        };
        nodes.Add(node);
        parent.Children.Add(node);
        return node;
    }

    private static bool IsAnimationElement(XElement element)
    {
        return LocalName(element) is "animate" or "animateTransform";
    }

    private void ParseAnimation(XElement element, SvgNode node)
    {
        var name = LocalName(element);
        var transform = name == "animateTransform";
        var attributeName = ((string?)element.Attribute("attributeName")
            ?? (transform ? "transform" : "")).Trim().ToLowerInvariant();
        if (transform && attributeName != "transform")
        {
            throw Fail(element, "animateTransform must target transform");
        }
        if (!transform && attributeName.Length == 0)
        {
            throw Fail(element, "animate requires attributeName");
        }
        if (attributeName == "transform" && !transform)
        {
            throw Fail(element, "transform animation requires animateTransform");
        }
        if (name == "animateTransform")
        {
            var type = ((string?)element.Attribute("type") ?? "").Trim().ToLowerInvariant();
            if (type is not ("matrix" or "translate" or "scale" or "rotate" or "skewx" or "skewy"))
            {
                throw Fail(element, "animateTransform type is not supported");
            }
            var transformAnimation = BuildAnimation(element, SvgAnimationKind.Transform, type, null, null);
            if (node.TransformAnimation is not null)
            {
                throw Fail(element, "a node cannot have multiple transform animations");
            }
            node.TransformAnimation = transformAnimation;
            return;
        }
        if (attributeName is "d" or "path")
        {
            if (node.Shape is null || !node.Shape.IsPath)
            {
                throw Fail(element, "path morph animation requires a path shape");
            }
            if (node.MorphAnimation is not null)
            {
                throw Fail(element, "a node cannot have multiple path morph animations");
            }
            node.MorphAnimation = BuildAnimation(element, SvgAnimationKind.Morph, attributeName,
                node.Shape.Stroke, node.Shape.Path);
            return;
        }
        var kind = attributeName switch
        {
            "opacity" => SvgAnimationKind.Opacity,
            "fill" or "stroke" => SvgAnimationKind.Color,
            "stroke-width" or "stroke-miterlimit" or "stroke-linecap" or "stroke-linejoin"
                or "stroke-dashoffset" => SvgAnimationKind.Stroke,
            "fill-opacity" or "stroke-opacity" or "stroke-dasharray"
                => throw Fail(element, $"{attributeName} animation is not representable in the GCV1 track ABI"),
            _ => throw Fail(element, $"attribute '{attributeName}' is not in the controlled animation subset")
        };
        var animation = BuildAnimation(element, kind, attributeName, node.Shape?.Stroke, null);
        if (kind == SvgAnimationKind.Opacity)
        {
            if (node.OpacityAnimation is not null)
            {
                throw Fail(element, "a node cannot have multiple opacity animations");
            }
            node.OpacityAnimation = animation;
            return;
        }
        if (node.Shape is null)
        {
            throw Fail(element, $"attribute '{attributeName}' requires a shape node");
        }
        if (kind == SvgAnimationKind.Color)
        {
            var paint = attributeName == "fill" ? node.Shape.Fill : node.Shape.Stroke?.Paint;
            if (paint is null)
            {
                throw Fail(element, $"attribute '{attributeName}' has no static paint to animate");
            }
            if (paint.Kind != SvgPaintKind.Solid)
            {
                throw Fail(element, $"attribute '{attributeName}' animation requires a solid paint");
            }
            if (paint.Animation is not null)
            {
                throw Fail(element, $"a paint cannot have multiple color animations");
            }
            paint.Animation = animation;
            return;
        }
        if (node.Shape.Stroke is null)
        {
            throw Fail(element, $"attribute '{attributeName}' requires a stroke");
        }
        if (node.Shape.Stroke.Animation is not null)
        {
            throw Fail(element, "a stroke cannot have multiple property animations");
        }
        node.Shape.Stroke.Animation = animation;
    }

    private SvgAnimation BuildAnimation(XElement element, SvgAnimationKind kind,
        string attribute, SvgStroke? baseStroke, SvgPath? basePath)
    {
        ValidateAnimationPolicy(element);
        var duration = ParseDuration((string?)element.Attribute("dur") ?? "", element);
        var rawValues = ReadAnimationValues(element);
        if (rawValues.Count < 2)
        {
            throw Fail(element, "animation requires at least two values");
        }
        var values = new List<SvgAnimationKeyframe>();
        foreach (var raw in rawValues)
        {
            values.Add(ParseAnimationValue(raw, kind, attribute, element, baseStroke, basePath));
        }
        var times = ReadKeyTimes(element, values.Count);
        var calcMode = ((string?)element.Attribute("calcMode") ?? "linear").Trim().ToLowerInvariant();
        if (calcMode is not ("linear" or "discrete" or "spline"))
        {
            throw Fail(element, $"calcMode '{calcMode}' is not supported");
        }
        var splines = ReadKeySplines(element, calcMode, values.Count);
        var keyframes = new List<SvgAnimationKeyframe>(values.Count);
        for (var index = 0; index < values.Count; index++)
        {
            var source = values[index];
            var easing = index == values.Count - 1
                ? 0u
                : calcMode == "discrete"
                    ? 1u
                    : calcMode == "spline" ? 2u : 0u;
            var spline = index < splines.Count ? splines[index] : (0.0, 0.0, 0.0, 0.0);
            keyframes.Add(new SvgAnimationKeyframe
            {
                Time = times[index] * duration,
                A = source.A,
                B = source.B,
                C = source.C,
                D = source.D,
                E = source.E,
                F = source.F,
                Easing = easing,
                ControlA = spline.Item1,
                ControlB = spline.Item2,
                ControlC = spline.Item3,
                ControlD = spline.Item4,
                MorphCurves = source.MorphCurves
            });
        }
        var repeat = ReadRepeatCount(element);
        if (repeat.Indefinite)
        {
            return WithKeyframes(new SvgAnimation
            {
                Kind = kind,
                Duration = duration,
                Flags = 1u
            }, keyframes);
        }
        var repeated = new List<SvgAnimationKeyframe>(checked(keyframes.Count * repeat.Count));
        for (var cycle = 0; cycle < repeat.Count; cycle++)
        {
            foreach (var keyframe in keyframes)
            {
                repeated.Add(new SvgAnimationKeyframe
                {
                    Time = keyframe.Time + cycle * duration,
                    A = keyframe.A,
                    B = keyframe.B,
                    C = keyframe.C,
                    D = keyframe.D,
                    E = keyframe.E,
                    F = keyframe.F,
                    Easing = keyframe.Easing,
                    ControlA = keyframe.ControlA,
                    ControlB = keyframe.ControlB,
                    ControlC = keyframe.ControlC,
                    ControlD = keyframe.ControlD,
                    MorphCurves = keyframe.MorphCurves
                });
            }
        }
        return WithKeyframes(new SvgAnimation
        {
            Kind = kind,
            Duration = duration * repeat.Count,
            Flags = 0u
        }, repeated);
    }

    private static SvgAnimation WithKeyframes(SvgAnimation animation, IEnumerable<SvgAnimationKeyframe> keyframes)
    {
        animation.Keyframes.AddRange(keyframes);
        return animation;
    }

    private static void ValidateAnimationPolicy(XElement element)
    {
        var begin = (string?)element.Attribute("begin");
        if (begin is not null && begin.Trim() is not ("0" or "0s" or "0ms"))
        {
            throw Fail(element, "event-driven or delayed animation begin values are not supported");
        }
        var attributeType = ((string?)element.Attribute("attributeType") ?? "auto").Trim().ToLowerInvariant();
        if (attributeType is not ("auto" or "xml"))
        {
            throw Fail(element, "CSS animation attributeType is not supported");
        }
        var additive = ((string?)element.Attribute("additive") ?? "replace").Trim().ToLowerInvariant();
        if (additive != "replace")
        {
            throw Fail(element, "additive animation is not supported");
        }
        var accumulate = ((string?)element.Attribute("accumulate") ?? "none").Trim().ToLowerInvariant();
        if (accumulate != "none")
        {
            throw Fail(element, "accumulate animation is not supported");
        }
        var restart = ((string?)element.Attribute("restart") ?? "always").Trim().ToLowerInvariant();
        if (restart != "always")
        {
            throw Fail(element, "restart animation values other than always are not supported");
        }
        var fill = ((string?)element.Attribute("fill") ?? "remove").Trim().ToLowerInvariant();
        if (fill != "freeze")
        {
            throw Fail(element, "animation requires fill='freeze' because the track ABI has no active fill timing");
        }
        if (element.Attribute("end") is not null || element.Attribute("repeatDur") is not null
            || element.Attribute("min") is not null || element.Attribute("max") is not null)
        {
            throw Fail(element, "event-driven or duration-bounded SMIL timing is not supported");
        }
    }

    private static List<string> ReadAnimationValues(XElement element)
    {
        var values = (string?)element.Attribute("values");
        if (values is not null)
        {
            if (element.Attribute("from") is not null || element.Attribute("to") is not null
                || element.Attribute("by") is not null)
            {
                throw Fail(element, "values cannot be combined with from, to, or by");
            }
            return values.Split(';', StringSplitOptions.TrimEntries)
                .Where(value => value.Length != 0)
                .ToList();
        }
        var from = (string?)element.Attribute("from");
        var to = (string?)element.Attribute("to");
        if (from is not null && to is not null && element.Attribute("by") is null)
        {
            return [from.Trim(), to.Trim()];
        }
        throw Fail(element, "controlled animation requires values or both from and to");
    }

    private static List<double> ReadKeyTimes(XElement element, int count)
    {
        var raw = (string?)element.Attribute("keyTimes");
        if (raw is null)
        {
            var result = new List<double>(count);
            for (var index = 0; index < count; index++) result.Add((double)index / (count - 1));
            return result;
        }
        var values = raw.Split(';', StringSplitOptions.TrimEntries)
            .Where(value => value.Length != 0)
            .Select(value => ParseLooseNumber(value, element, "keyTimes"))
            .ToList();
        if (values.Count != count || values.Count < 2 || values[0] != 0 || values[^1] != 1)
        {
            throw Fail(element, "keyTimes must match values and span zero to one");
        }
        for (var index = 1; index < values.Count; index++)
        {
            if (values[index] < values[index - 1] || values[index] < 0 || values[index] > 1)
            {
                throw Fail(element, "keyTimes must be ordered values between zero and one");
            }
        }
        return values;
    }

    private static List<(double, double, double, double)> ReadKeySplines(XElement element, string calcMode, int valueCount)
    {
        var raw = (string?)element.Attribute("keySplines");
        if (calcMode == "spline" && raw is null)
        {
            throw Fail(element, "calcMode='spline' requires keySplines");
        }
        if (raw is null)
        {
            return [];
        }
        if (calcMode != "spline")
        {
            throw Fail(element, "keySplines requires calcMode='spline'");
        }
        var result = new List<(double, double, double, double)>();
        foreach (var part in raw.Split(';', StringSplitOptions.TrimEntries))
        {
            var values = ParseNumberList(part, element, "keySplines");
            if (values.Count != 4 || values.Any(value => value < 0 || value > 1))
            {
                throw Fail(element, "each keySpline requires four values between zero and one");
            }
            result.Add((values[0], values[1], values[2], values[3]));
        }
        if (result.Count != valueCount - 1)
        {
            throw Fail(element, "keySplines must contain one cubic for each keyframe segment");
        }
        return result;
    }

    private static (bool Indefinite, int Count) ReadRepeatCount(XElement element)
    {
        var raw = ((string?)element.Attribute("repeatCount") ?? "1").Trim().ToLowerInvariant();
        if (raw == "indefinite")
        {
            return (true, 1);
        }
        if (!double.TryParse(raw, NumberStyles.Float, CultureInfo.InvariantCulture, out var value)
            || !double.IsFinite(value) || value < 1 || value > 64 || Math.Truncate(value) != value)
        {
            throw Fail(element, "repeatCount must be indefinite or an integer from one to 64");
        }
        return (false, (int)value);
    }

    private static double ParseDuration(string value, XElement owner)
    {
        var text = value.Trim().ToLowerInvariant();
        if (text.Length == 0 || text == "indefinite")
        {
            throw Fail(owner, "animation dur must be a finite positive time");
        }
        var multiplier = text.EndsWith("ms", StringComparison.Ordinal) ? 0.001
            : text.EndsWith('s') ? 1.0 : 1.0;
        var numberText = text.EndsWith("ms", StringComparison.Ordinal) ? text[..^2]
            : text.EndsWith('s') ? text[..^1] : text;
        if (!double.TryParse(numberText, NumberStyles.Float, CultureInfo.InvariantCulture, out var result)
            || !double.IsFinite(result) || result <= 0)
        {
            throw Fail(owner, "animation dur must be a finite positive time");
        }
        return result * multiplier;
    }

    private static SvgAnimationKeyframe ParseAnimationValue(string raw, SvgAnimationKind kind,
        string attribute, XElement owner, SvgStroke? baseStroke, SvgPath? basePath)
    {
        return kind switch
        {
            SvgAnimationKind.Transform => MatrixValue(ParseTransformValue(raw, attribute, owner)),
            SvgAnimationKind.Opacity => new SvgAnimationKeyframe
            {
                A = ParseOpacity(raw, owner, "opacity")
            },
            SvgAnimationKind.Color => ColorValue(ParseColor(raw, owner)),
            SvgAnimationKind.Stroke => StrokeValue(raw, attribute, owner, baseStroke
                ?? throw Fail(owner, "stroke animation has no base stroke")),
            SvgAnimationKind.Morph => MorphValue(raw, owner, basePath
                ?? throw Fail(owner, "path morph animation has no base path")),
            _ => throw Fail(owner, "unknown animation kind")
        };
    }

    private static SvgAnimationKeyframe MorphValue(string raw, XElement owner, SvgPath basePath)
    {
        var target = SvgPathParser.Parse(raw, owner);
        ValidateMorphTopology(basePath, target, owner);
        return new SvgAnimationKeyframe
        {
            MorphCurves = target.Contours.SelectMany(contour => contour.Curves).ToList()
        };
    }

    private static void ValidateMorphTopology(SvgPath basePath, SvgPath target, XElement owner)
    {
        if (basePath.Contours.Count != target.Contours.Count)
        {
            throw Fail(owner, "path morph target contour count does not match the base path");
        }
        for (var contourIndex = 0; contourIndex < basePath.Contours.Count; contourIndex++)
        {
            var baseContour = basePath.Contours[contourIndex];
            var targetContour = target.Contours[contourIndex];
            if (baseContour.Closed != targetContour.Closed)
            {
                throw Fail(owner, $"path morph target contour {contourIndex} closed state does not match the base path");
            }
            if (baseContour.Curves.Count != targetContour.Curves.Count)
            {
                throw Fail(owner, $"path morph target contour {contourIndex} curve count does not match the base path");
            }
            ValidateContourConnectivity(baseContour, owner, contourIndex);
            ValidateContourConnectivity(targetContour, owner, contourIndex);
        }
    }

    private static void ValidateContourConnectivity(SvgContour contour, XElement owner, int contourIndex)
    {
        if (contour.Curves.Count == 0)
        {
            throw Fail(owner, $"path morph target contour {contourIndex} has no curves");
        }
        for (var curveIndex = 1; curveIndex < contour.Curves.Count; curveIndex++)
        {
            var previous = contour.Curves[curveIndex - 1];
            var current = contour.Curves[curveIndex];
            if (current.X0 != previous.X1 || current.Y0 != previous.Y1)
            {
                throw Fail(owner, $"path morph target contour {contourIndex} has disconnected curves");
            }
        }
        if (contour.Closed)
        {
            var first = contour.Curves[0];
            var last = contour.Curves[^1];
            if (last.X1 != first.X0 || last.Y1 != first.Y0)
            {
                throw Fail(owner, $"path morph target contour {contourIndex} closed endpoint does not match");
            }
        }
    }

    private static SvgAnimationKeyframe MatrixValue(SvgMatrix matrix)
    {
        return new SvgAnimationKeyframe
        {
            A = matrix.A,
            B = matrix.B,
            C = matrix.C,
            D = matrix.D,
            E = matrix.E,
            F = matrix.F
        };
    }

    private static SvgAnimationKeyframe ColorValue(SvgColor color)
    {
        return new SvgAnimationKeyframe
        {
            A = color.R / 255.0,
            B = color.G / 255.0,
            C = color.B / 255.0,
            D = color.A / 255.0
        };
    }

    private static SvgAnimationKeyframe StrokeValue(string raw, string attribute,
        XElement owner, SvgStroke baseStroke)
    {
        var width = baseStroke.Width;
        var miter = baseStroke.MiterLimit;
        var cap = baseStroke.Cap;
        var join = baseStroke.Join;
        var dashOffset = baseStroke.DashOffset;
        switch (attribute)
        {
            case "stroke-width":
                width = ParseLength(raw, 0, owner, attribute);
                if (width < 0) throw Fail(owner, "stroke-width cannot be negative");
                break;
            case "stroke-miterlimit":
                miter = ParseLooseNumber(raw, owner, attribute);
                if (miter < 1) throw Fail(owner, "stroke-miterlimit must be at least one");
                break;
            case "stroke-linecap":
                cap = ParseCap(raw, owner);
                break;
            case "stroke-linejoin":
                join = ParseJoin(raw, owner);
                break;
            case "stroke-dashoffset":
                dashOffset = ParseLength(raw, 0, owner, attribute);
                break;
            default:
                throw Fail(owner, $"stroke property '{attribute}' is not supported");
        }
        return new SvgAnimationKeyframe
        {
            A = width,
            B = miter,
            C = cap,
            D = join,
            E = dashOffset,
            F = 0
        };
    }

    private static uint ParseCap(string value, XElement owner)
    {
        return value.Trim().ToLowerInvariant() switch
        {
            "butt" => 0u,
            "round" => 1u,
            "square" => 2u,
            _ => throw Fail(owner, $"stroke-linecap '{value}' is not supported")
        };
    }

    private static uint ParseJoin(string value, XElement owner)
    {
        return value.Trim().ToLowerInvariant() switch
        {
            "miter" => 0u,
            "round" => 1u,
            "bevel" => 2u,
            _ => throw Fail(owner, $"stroke-linejoin '{value}' is not supported")
        };
    }

    private static SvgMatrix ParseTransformValue(string value, string type, XElement owner)
    {
        var values = ParseNumberList(value, owner, "animateTransform value");
        return type switch
        {
            "matrix" when values.Count == 6 => new SvgMatrix(values[0], values[1], values[2], values[3], values[4], values[5]),
            "translate" when values.Count is 1 or 2 => new SvgMatrix(1, 0, 0, 1, values[0], values.Count == 2 ? values[1] : 0),
            "scale" when values.Count is 1 or 2 => new SvgMatrix(values[0], 0, 0, values.Count == 2 ? values[1] : values[0], 0, 0),
            "rotate" when values.Count is 1 or 3 => RotateValue(values),
            "skewx" when values.Count == 1 => new SvgMatrix(1, 0, Math.Tan(values[0] * Math.PI / 180), 1, 0, 0),
            "skewy" when values.Count == 1 => new SvgMatrix(1, Math.Tan(values[0] * Math.PI / 180), 0, 1, 0, 0),
            _ => throw Fail(owner, $"animateTransform {type} value has invalid arguments")
        };
    }

    private static SvgMatrix RotateValue(IReadOnlyList<double> values)
    {
        var radians = values[0] * Math.PI / 180;
        var rotation = new SvgMatrix(Math.Cos(radians), Math.Sin(radians), -Math.Sin(radians), Math.Cos(radians), 0, 0);
        if (values.Count == 1) return rotation;
        return new SvgMatrix(1, 0, 0, 1, values[1], values[2]) * rotation
            * new SvgMatrix(1, 0, 0, 1, -values[1], -values[2]);
    }

    private SvgShape BuildShape(XElement element, SvgPath path, SvgStyle style)
    {
        ReserveCurves(path);
        var bounds = path.Bounds();
        var fill = ParsePaint(style.Fill, style.FillOpacity, bounds, element);
        SvgStroke? stroke = null;
        if (style.Stroke is not null && !IsNone(style.Stroke))
        {
            var paint = ParsePaint(style.Stroke, style.StrokeOpacity, bounds, element)
                ?? throw Fail(element, "stroke paint is empty");
            if (paint.Kind != SvgPaintKind.Solid)
            {
                throw Fail(element, "gradient stroke paints are not supported in compiled vectors");
            }
            stroke = new SvgStroke
            {
                Width = style.StrokeWidth,
                MiterLimit = style.MiterLimit,
                Cap = style.StrokeCap,
                Join = style.StrokeJoin,
                DashOffset = style.DashOffset,
                Paint = paint
            };
            if (style.Dashes is not null)
            {
                stroke.Dashes.AddRange(style.Dashes);
            }
        }
        SvgClip? clip = null;
        if (style.ClipPath is not null)
        {
            clip = ParseClip(style.ClipPath, element);
        }
        return new SvgShape
        {
            Path = path,
            IsPath = LocalName(element) == "path",
            Fill = fill,
            Stroke = stroke,
            Clip = clip,
            Flags = style.FillRule == 1u ? 1u : 0u
        };
    }

    private SvgClip ParseClip(string value, XElement owner)
    {
        var id = ParseLocalUrl(value, owner, "clip-path");
        if (!clips.TryGetValue(id, out var definition))
        {
            throw Fail(owner, $"clipPath '#{id}' was not found");
        }
        var element = definition.Element;
        var units = (string?)element.Attribute("clipPathUnits") ?? "userSpaceOnUse";
        if (!units.Equals("userSpaceOnUse", StringComparison.Ordinal))
        {
            throw Fail(element, "clipPathUnits='objectBoundingBox' is not supported");
        }
        var clip = new SvgClip { FillRule = 0 };
        var foundRule = false;
        foreach (var child in element.Elements())
        {
            var name = LocalName(child);
            if (name == "g")
            {
                var nestedTransform = ParseTransform((string?)child.Attribute("transform"), child);
                foreach (var nested in child.Elements())
                {
                    var nestedPath = ParseGeometry(nested);
                    var mapped = TransformPath(nestedPath, nestedTransform);
                    ReserveCurves(mapped);
                    clip.Contours.AddRange(mapped.Contours);
                    var rule = ResolveStyle(nested, new SvgStyle()).ClipRule;
                    if (!foundRule)
                    {
                        clip.FillRule = rule;
                        foundRule = true;
                    }
                    else if (clip.FillRule != rule)
                    {
                        throw Fail(nested, "clip paths cannot mix fill rules");
                    }
                }
                continue;
            }
            if (name is not ("path" or "rect" or "circle" or "ellipse" or "line" or "polyline" or "polygon"))
            {
                throw Fail(child, $"clipPath child '{name}' is not representable");
            }
            var path = ParseGeometry(child);
            var transform = ParseTransform((string?)child.Attribute("transform"), child);
            var mappedPath = TransformPath(path, transform);
            ReserveCurves(mappedPath);
            clip.Contours.AddRange(mappedPath.Contours);
            var clipRule = ResolveStyle(child, new SvgStyle()).ClipRule;
            if (!foundRule)
            {
                clip.FillRule = clipRule;
                foundRule = true;
            }
            else if (clip.FillRule != clipRule)
            {
                throw Fail(child, "clip paths cannot mix fill rules");
            }
        }
        if (clip.Contours.Count == 0)
        {
            throw Fail(element, "clipPath has no representable geometry");
        }
        return clip;
    }

    private SvgPaint? ParsePaint(string value, double opacity, (double MinX, double MinY, double MaxX, double MaxY) bounds, XElement owner)
    {
        if (IsNone(value))
        {
            return null;
        }
        if (value.StartsWith("url(", StringComparison.OrdinalIgnoreCase))
        {
            var id = ParseLocalUrl(value, owner, "paint");
            var gradient = ResolveGradient(id, owner, new HashSet<string>(StringComparer.Ordinal));
            return BuildGradientPaint(gradient, opacity, bounds, owner);
        }
        if (value.Contains("(", StringComparison.Ordinal))
        {
            throw Fail(owner, $"paint '{value}' is not in the supported color subset");
        }
        return new SvgPaint
        {
            Kind = SvgPaintKind.Solid,
            Color = ParseColor(value, owner),
            Opacity = opacity
        };
    }

    private SvgGradientDefinition ResolveGradient(string id, XElement owner, HashSet<string> stack)
    {
        if (!gradients.TryGetValue(id, out var definition))
        {
            throw Fail(owner, $"gradient '#{id}' was not found");
        }
        if (!stack.Add(id))
        {
            throw Fail(definition.Element, "gradient references form a cycle");
        }
        var href = GetHref(definition.Element);
        if (href is not null)
        {
            var baseDefinition = ResolveGradient(href, owner, stack);
            var merged = new XElement(definition.Element);
            foreach (var attribute in baseDefinition.Element.Attributes())
            {
                if (merged.Attribute(attribute.Name) is null)
                {
                    merged.SetAttributeValue(attribute.Name, attribute.Value);
                }
            }
            if (!merged.Elements().Any())
            {
                foreach (var child in baseDefinition.Element.Elements())
                {
                    merged.Add(new XElement(child));
                }
            }
            definition = new SvgGradientDefinition(merged);
        }
        stack.Remove(id);
        return definition;
    }

    private SvgPaint BuildGradientPaint(SvgGradientDefinition definition, double opacity,
        (double MinX, double MinY, double MaxX, double MaxY) bounds, XElement owner)
    {
        var element = definition.Element;
        var name = LocalName(element);
        var units = (string?)element.Attribute("gradientUnits") ?? "objectBoundingBox";
        if (units is not ("objectBoundingBox" or "userSpaceOnUse"))
        {
            throw Fail(element, "gradientUnits is not supported");
        }
        var transformText = (string?)element.Attribute("gradientTransform");
        if (units == "objectBoundingBox" && !string.IsNullOrWhiteSpace(transformText))
        {
            throw Fail(element, "objectBoundingBox gradientTransform is not supported");
        }
        var spread = (string?)element.Attribute("spreadMethod") ?? "pad";
        if (!spread.Equals("pad", StringComparison.Ordinal))
        {
            throw Fail(element, "gradient spread methods other than pad are not supported");
        }
        var transform = ParseTransform(transformText, element);
        var determinant = transform.A * transform.D - transform.B * transform.C;
        if (!double.IsFinite(determinant) || determinant == 0)
        {
            throw Fail(element, "gradientTransform must be non-singular");
        }
        var paint = new SvgPaint
        {
            Kind = name == "linearGradient" ? SvgPaintKind.LinearGradient : SvgPaintKind.RadialGradient,
            Opacity = opacity
        };
        if (paint.Kind == SvgPaintKind.LinearGradient)
        {
            var x0 = ParseGradientCoordinate((string?)element.Attribute("x1") ?? "0%", units, bounds, true, owner);
            var y0 = ParseGradientCoordinate((string?)element.Attribute("y1") ?? "0%", units, bounds, false, owner);
            var x1 = ParseGradientCoordinate((string?)element.Attribute("x2") ?? "100%", units, bounds, true, owner);
            var y1 = ParseGradientCoordinate((string?)element.Attribute("y2") ?? "0%", units, bounds, false, owner);
            var first = transform.Apply(new SvgPoint(x0, y0));
            var second = transform.Apply(new SvgPoint(x1, y1));
            ValidateGradientPoint(first, element, "linear gradient start");
            ValidateGradientPoint(second, element, "linear gradient end");
            if ((float)first.X == (float)second.X && (float)first.Y == (float)second.Y)
            {
                throw Fail(element, "linear gradient endpoints must differ");
            }
            paint = new SvgPaint
            {
                Kind = SvgPaintKind.LinearGradient,
                Opacity = opacity,
                X0 = first.X,
                Y0 = first.Y,
                X1 = second.X,
                Y1 = second.Y
            };
        }
        else
        {
            if (element.Attribute("fx") is not null || element.Attribute("fy") is not null
                || element.Attribute("fr") is not null)
            {
                throw Fail(element, "radial gradient focal attributes are not supported");
            }
            if (Math.Abs(transform.B) > 1e-12 || Math.Abs(transform.C) > 1e-12)
            {
                throw Fail(element, "radial gradientTransform must remain axis-aligned");
            }
            var cx = ParseGradientCoordinate((string?)element.Attribute("cx") ?? "50%", units, bounds, true, owner);
            var cy = ParseGradientCoordinate((string?)element.Attribute("cy") ?? "50%", units, bounds, false, owner);
            var radius = ParseGradientRadius((string?)element.Attribute("r") ?? "50%", units, owner);
            var center = transform.Apply(new SvgPoint(cx, cy));
            var radiusX = units == "objectBoundingBox"
                ? (bounds.MaxX - bounds.MinX) * radius
                : radius;
            var radiusY = units == "objectBoundingBox"
                ? (bounds.MaxY - bounds.MinY) * radius
                : radius;
            radiusX = Math.Abs(transform.A) * radiusX;
            radiusY = Math.Abs(transform.D) * radiusY;
            ValidateGradientPoint(center, element, "radial gradient center");
            var edge = new SvgPoint(center.X + radiusX, center.Y + radiusY);
            ValidateGradientPoint(edge, element, "radial gradient edge");
            if ((float)edge.X <= (float)center.X || (float)edge.Y <= (float)center.Y)
            {
                throw Fail(element, "radial gradient radii must remain positive");
            }
            paint = new SvgPaint
            {
                Kind = SvgPaintKind.RadialGradient,
                Opacity = opacity,
                X0 = center.X,
                Y0 = center.Y,
                X1 = edge.X,
                Y1 = edge.Y
            };
        }
        var stopElements = element.Elements().ToList();
        foreach (var child in stopElements)
        {
            if (LocalName(child) != "stop")
            {
                throw Fail(child, $"gradient child '{LocalName(child)}' is not supported");
            }
            var descendant = child.Descendants().FirstOrDefault();
            if (descendant is not null)
            {
                throw Fail(descendant, $"gradient stop child '{LocalName(descendant)}' is not supported");
            }
        }
        if (stopElements.Count is < 2 or > 4)
        {
            throw Fail(element, "gradients must contain two to four stops");
        }
        var lastOffset = -1.0;
        foreach (var stopElement in stopElements)
        {
            var offset = ParseStopOffset((string?)stopElement.Attribute("offset") ?? "0", stopElement);
            if (offset < lastOffset)
            {
                throw Fail(stopElement, "gradient stop offsets must be ordered");
            }
            lastOffset = offset;
            var stopStyle = ResolveStopStyle(stopElement);
            var color = ParseColor(stopStyle.Color, stopElement);
            if (stopStyle.Opacity < 0 || stopStyle.Opacity > 1)
            {
                throw Fail(stopElement, "stop opacity must be between zero and one");
            }
            color = color with { A = (byte)Math.Clamp((int)Math.Round(color.A * stopStyle.Opacity), 0, 255) };
            paint.Stops.Add(new SvgStop { Offset = offset, Color = color });
        }
        return paint;
    }

    private static string? GetHref(XElement element)
    {
        return ((string?)element.Attribute("href") ?? (string?)element.Attribute(XName.Get("href", "http://www.w3.org/1999/xlink")))?.Trim() switch
        {
            null or "" => null,
            var value when value.StartsWith("#", StringComparison.Ordinal) => value[1..],
            _ => throw new SvgCompileException("external SVG references are not allowed")
        };
    }

    private double ParseGradientCoordinate(string value, string units,
        (double MinX, double MinY, double MaxX, double MaxY) bounds, bool horizontal, XElement owner)
    {
        var text = value.Trim();
        var isPercent = text.EndsWith('%');
        var number = isPercent
            ? ParseLooseNumber(text[..^1], owner, horizontal ? "gradient x" : "gradient y") / 100
            : ParseLength(text, 0, owner, horizontal ? "gradient x" : "gradient y");
        if (units == "objectBoundingBox")
        {
            var fraction = isPercent ? number : number;
            return horizontal
                ? bounds.MinX + (bounds.MaxX - bounds.MinX) * fraction
                : bounds.MinY + (bounds.MaxY - bounds.MinY) * fraction;
        }
        return isPercent
            ? (horizontal ? viewBoxX + viewBoxWidth * number : viewBoxY + viewBoxHeight * number)
            : number;
    }

    private double ParseGradientRadius(string value, string units, XElement owner)
    {
        var text = value.Trim();
        double radius;
        if (text.EndsWith('%'))
        {
            var percentNumber = ParseLooseNumber(text[..^1], owner, "gradient radius") / 100;
            if (units == "objectBoundingBox")
            {
                radius = percentNumber;
            }
            else
            {
                radius = percentNumber * Math.Sqrt(
                    (viewBoxWidth * viewBoxWidth + viewBoxHeight * viewBoxHeight) / 2);
            }
        }
        else
        {
            radius = ParseLength(text, 0, owner, "gradient radius");
        }
        if (!double.IsFinite(radius) || radius <= 0)
        {
            throw Fail(owner, "radial gradient radius must be positive");
        }
        return radius;
    }

    private static void ValidateGradientPoint(SvgPoint point, XElement owner, string field)
    {
        if (!point.IsFinite || !float.IsFinite((float)point.X) || !float.IsFinite((float)point.Y))
        {
            throw Fail(owner, $"{field} is not representable as float32");
        }
    }

    private static (string Color, double Opacity) ResolveStopStyle(XElement element)
    {
        var color = (string?)element.Attribute("stop-color") ?? "#000000";
        var opacity = ParseLooseNumber((string?)element.Attribute("stop-opacity") ?? "1", element, "stop-opacity");
        var style = (string?)element.Attribute("style");
        if (style is null)
        {
            return (color, opacity);
        }
        foreach (var declaration in style.Split(';', StringSplitOptions.RemoveEmptyEntries | StringSplitOptions.TrimEntries))
        {
            var separator = declaration.IndexOf(':');
            if (separator <= 0)
            {
                throw Fail(element, "invalid inline style declaration");
            }
            var key = declaration[..separator].Trim().ToLowerInvariant();
            var value = declaration[(separator + 1)..].Trim();
            switch (key)
            {
                case "stop-color":
                    color = value;
                    break;
                case "stop-opacity":
                    opacity = ParseLooseNumber(value, element, "stop-opacity");
                    break;
                default:
                    throw Fail(element, $"style property '{key}' is not supported");
            }
        }
        return (color, opacity);
    }

    private SvgStyle ResolveStyle(XElement element, SvgStyle parent)
    {
        var style = parent.Clone();
        style.LocalOpacity = 1;
        var direct = element.Attributes()
            .Where(attribute => attribute.Name.Namespace == XNamespace.None
                && IsStyleProperty(attribute.Name.LocalName))
            .ToDictionary(attribute => attribute.Name.LocalName.ToLowerInvariant(), attribute => attribute.Value, StringComparer.Ordinal);
        ApplyStyleValues(style, direct, element);
        var inline = (string?)element.Attribute("style");
        if (inline is not null)
        {
            if (inline.Contains('{') || inline.Contains('}') || inline.Contains('@'))
            {
                throw Fail(element, "CSS selectors and at-rules are not supported");
            }
            var declarations = new Dictionary<string, string>(StringComparer.Ordinal);
            foreach (var declaration in inline.Split(';', StringSplitOptions.RemoveEmptyEntries | StringSplitOptions.TrimEntries))
            {
                var separator = declaration.IndexOf(':');
                if (separator <= 0)
                {
                    throw Fail(element, "invalid inline style declaration");
                }
                declarations[declaration[..separator].Trim().ToLowerInvariant()] = declaration[(separator + 1)..].Trim();
            }
            ApplyStyleValues(style, declarations, element);
        }
        style.Opacity *= 1;
        if (style.Opacity < 0 || style.Opacity > 1 || !double.IsFinite(style.Opacity))
        {
            throw Fail(element, "opacity must be between zero and one");
        }
        return style;
    }

    private static bool IsStyleProperty(string name)
    {
        return name.ToLowerInvariant() is "fill" or "stroke" or "fill-opacity" or "stroke-opacity"
            or "stroke-width" or "stroke-linecap" or "stroke-linejoin" or "stroke-miterlimit"
            or "stroke-dasharray" or "stroke-dashoffset" or "fill-rule" or "clip-rule"
            or "opacity" or "clip-path" or "display" or "visibility" or "color-interpolation"
            or "color-interpolation-filters" or "shape-rendering" or "overflow" or "enable-background"
            or "vector-effect" or "stop-color" or "stop-opacity";
    }

    private void ApplyStyleValues(SvgStyle style, IReadOnlyDictionary<string, string> values, XElement owner)
    {
        foreach (var pair in values)
        {
            switch (pair.Key)
            {
                case "fill":
                    style.Fill = pair.Value;
                    break;
                case "stroke":
                    style.Stroke = pair.Value;
                    break;
                case "fill-opacity":
                    style.FillOpacity = ParseOpacity(pair.Value, owner, pair.Key);
                    break;
                case "stroke-opacity":
                    style.StrokeOpacity = ParseOpacity(pair.Value, owner, pair.Key);
                    break;
                case "stroke-width":
                    style.StrokeWidth = ParseLength(pair.Value, 0, owner, pair.Key);
                    if (style.StrokeWidth < 0) throw Fail(owner, "stroke-width cannot be negative");
                    break;
                case "stroke-linecap":
                    style.StrokeCap = pair.Value.Trim().ToLowerInvariant() switch
                    {
                        "butt" => 0u,
                        "round" => 1u,
                        "square" => 2u,
                        _ => throw Fail(owner, $"stroke-linecap '{pair.Value}' is not supported")
                    };
                    break;
                case "stroke-linejoin":
                    style.StrokeJoin = pair.Value.Trim().ToLowerInvariant() switch
                    {
                        "miter" => 0u,
                        "round" => 1u,
                        "bevel" => 2u,
                        _ => throw Fail(owner, $"stroke-linejoin '{pair.Value}' is not supported")
                    };
                    break;
                case "stroke-miterlimit":
                    style.MiterLimit = ParseLooseNumber(pair.Value, owner, pair.Key);
                    if (style.MiterLimit < 1) throw Fail(owner, "stroke-miterlimit must be at least one");
                    break;
                case "stroke-dasharray":
                    style.Dashes = ParseDashArray(pair.Value, owner);
                    break;
                case "stroke-dashoffset":
                    style.DashOffset = ParseLength(pair.Value, 0, owner, pair.Key);
                    break;
                case "fill-rule":
                    style.FillRule = pair.Value.Trim().ToLowerInvariant() switch
                    {
                        "nonzero" => 0u,
                        "evenodd" => 1u,
                        _ => throw Fail(owner, $"fill-rule '{pair.Value}' is not supported")
                    };
                    break;
                case "clip-rule":
                    style.ClipRule = pair.Value.Trim().ToLowerInvariant() switch
                    {
                        "nonzero" => 0u,
                        "evenodd" => 1u,
                        _ => throw Fail(owner, $"clip-rule '{pair.Value}' is not supported")
                    };
                    break;
                case "opacity":
                    var opacity = ParseOpacity(pair.Value, owner, pair.Key);
                    style.Opacity *= opacity;
                    style.LocalOpacity *= opacity;
                    break;
                case "clip-path":
                    style.ClipPath = pair.Value;
                    break;
                case "display":
                    style.DisplayNone = pair.Value.Trim().Equals("none", StringComparison.OrdinalIgnoreCase);
                    break;
                case "visibility":
                    style.DisplayNone = pair.Value.Trim().Equals("hidden", StringComparison.OrdinalIgnoreCase)
                        || pair.Value.Trim().Equals("collapse", StringComparison.OrdinalIgnoreCase);
                    break;
                case "color-interpolation":
                case "color-interpolation-filters":
                case "shape-rendering":
                case "overflow":
                case "enable-background":
                case "vector-effect":
                    if (pair.Key == "vector-effect" && !pair.Value.Trim().Equals("none", StringComparison.OrdinalIgnoreCase))
                    {
                        throw Fail(owner, "vector-effect values other than none are not supported");
                    }
                    break;
                case "stop-color":
                case "stop-opacity":
                    break;
                default:
                    throw Fail(owner, $"style property '{pair.Key}' is not supported");
            }
        }
    }

    private static List<double>? ParseDashArray(string value, XElement owner)
    {
        if (value.Trim().Equals("none", StringComparison.OrdinalIgnoreCase))
        {
            return null;
        }
        var values = ParseNumberList(value, owner, "stroke-dasharray");
        if (values.Count == 0 || values.Any(item => item < 0))
        {
            throw Fail(owner, "stroke-dasharray values must be non-negative");
        }
        if (values.All(item => item == 0))
        {
            throw Fail(owner, "stroke-dasharray cannot contain only zero values");
        }
        if (values.Count % 2 != 0)
        {
            values.AddRange(values.ToArray());
        }
        return values;
    }

    private static bool IsNone(string value) => value.Trim().Equals("none", StringComparison.OrdinalIgnoreCase);

    private static string ParseLocalUrl(string value, XElement owner, string field)
    {
        var text = value.Trim();
        if (!text.StartsWith("url(", StringComparison.OrdinalIgnoreCase) || !text.EndsWith(')'))
        {
            throw Fail(owner, $"{field} must use a local url(#id)");
        }
        var id = text[4..^1].Trim();
        if (id.StartsWith('#') && id.Length > 1 && !id[1..].Contains('#'))
        {
            return id[1..];
        }
        throw Fail(owner, $"{field} must use a local url(#id)");
    }

    private static SvgColor ParseColor(string value, XElement owner)
    {
        var text = value.Trim().ToLowerInvariant();
        if (NamedColors.TryGetValue(text, out var named))
        {
            return named;
        }
        if (text.StartsWith("#", StringComparison.Ordinal))
        {
            var hex = text[1..];
            return hex.Length switch
            {
                3 => new SvgColor(
                    ExpandHex(hex[0]), ExpandHex(hex[1]), ExpandHex(hex[2]), 255),
                4 => new SvgColor(
                    ExpandHex(hex[0]), ExpandHex(hex[1]), ExpandHex(hex[2]), ExpandHex(hex[3])),
                6 => new SvgColor(
                    ParseHex(hex[0..2]), ParseHex(hex[2..4]), ParseHex(hex[4..6]), 255),
                8 => new SvgColor(
                    ParseHex(hex[0..2]), ParseHex(hex[2..4]), ParseHex(hex[4..6]), ParseHex(hex[6..8])),
                _ => throw Fail(owner, $"color '{value}' is invalid")
            };
        }
        throw Fail(owner, $"color '{value}' is outside the supported subset");
    }

    private static byte ParseHex(string value)
    {
        return byte.Parse(value, NumberStyles.AllowHexSpecifier, CultureInfo.InvariantCulture);
    }

    private static byte ExpandHex(char value)
    {
        var text = value.ToString();
        return (byte)(ParseHex(text + text));
    }

    private static double ParseStopOffset(string value, XElement owner)
    {
        var text = value.Trim();
        var result = text.EndsWith('%')
            ? ParseLooseNumber(text[..^1], owner, "stop offset") / 100
            : ParseLooseNumber(text, owner, "stop offset");
        if (!double.IsFinite(result) || result < 0 || result > 1)
        {
            throw Fail(owner, "gradient stop offset must be between zero and one");
        }
        return result;
    }

    private static double ParseOpacity(string value, XElement owner, string field)
    {
        var result = ParseLooseNumber(value, owner, field);
        if (result < 0 || result > 1)
        {
            throw Fail(owner, $"{field} must be between zero and one");
        }
        return result;
    }

    private static double ParseLooseNumber(string value, XElement owner, string field)
    {
        var text = value.Trim();
        if (text.EndsWith('%'))
        {
            return ParseLooseNumber(text[..^1], owner, field) / 100;
        }
        if (!double.TryParse(text, NumberStyles.Float, CultureInfo.InvariantCulture, out var result)
            || !double.IsFinite(result))
        {
            throw Fail(owner, $"{field} must be a finite number");
        }
        return result;
    }

    private static double ParseLength(string value, double relative, XElement owner, string field)
    {
        var text = value.Trim();
        if (text.EndsWith('%'))
        {
            if (relative == 0)
            {
                throw Fail(owner, $"{field} percentages are not supported without a relative basis");
            }
            return ParseLooseNumber(text[..^1], owner, field) / 100 * relative;
        }
        var suffix = text.Length > 2 ? text[^2..].ToLowerInvariant() : "";
        if (suffix is "px" or "pt" or "pc" or "mm" or "cm" or "in" or "em" or "ex")
        {
            throw Fail(owner, $"{field} units '{suffix}' are not supported");
        }
        return ParseLooseNumber(text, owner, field);
    }

    private static List<double> ParseNumberList(string value, XElement owner, string field)
    {
        var scanner = new SvgNumberScanner(value, owner, field);
        var values = new List<double>();
        while (scanner.TryRead(out var number))
        {
            values.Add(number);
        }
        return values;
    }

    private static SvgMatrix ParseTransform(string? value, XElement owner)
    {
        if (string.IsNullOrWhiteSpace(value))
        {
            return SvgMatrix.Identity;
        }
        var scanner = new SvgTransformScanner(value, owner);
        var result = SvgMatrix.Identity;
        while (scanner.TryReadName(out var name))
        {
            var values = scanner.ReadArguments();
            var matrix = name switch
            {
                "matrix" when values.Count == 6 => new SvgMatrix(values[0], values[1], values[2], values[3], values[4], values[5]),
                "translate" when values.Count is 1 or 2 => new SvgMatrix(1, 0, 0, 1, values[0], values.Count == 2 ? values[1] : 0),
                "scale" when values.Count is 1 or 2 => new SvgMatrix(values[0], 0, 0, values.Count == 2 ? values[1] : values[0], 0, 0),
                "rotate" when values.Count is 1 or 3 => Rotate(values),
                "skewx" when values.Count == 1 => new SvgMatrix(1, 0, Math.Tan(values[0] * Math.PI / 180), 1, 0, 0),
                "skewy" when values.Count == 1 => new SvgMatrix(1, Math.Tan(values[0] * Math.PI / 180), 0, 1, 0, 0),
                _ => throw Fail(owner, $"transform '{name}' has invalid arguments")
            };
            if (!double.IsFinite(matrix.A) || !double.IsFinite(matrix.B) || !double.IsFinite(matrix.C)
                || !double.IsFinite(matrix.D) || !double.IsFinite(matrix.E) || !double.IsFinite(matrix.F))
            {
                throw Fail(owner, "transform contains a non-finite value");
            }
            result *= matrix;
        }
        scanner.RequireEnd();
        return result;
    }

    private static SvgMatrix Rotate(IReadOnlyList<double> values)
    {
        var radians = values[0] * Math.PI / 180;
        var rotation = new SvgMatrix(Math.Cos(radians), Math.Sin(radians), -Math.Sin(radians), Math.Cos(radians), 0, 0);
        if (values.Count == 1)
        {
            return rotation;
        }
        return new SvgMatrix(1, 0, 0, 1, values[1], values[2]) * rotation
            * new SvgMatrix(1, 0, 0, 1, -values[1], -values[2]);
    }

    private SvgPath ParseGeometry(XElement element)
    {
        return LocalName(element) switch
        {
            "path" => SvgPathParser.Parse((string?)element.Attribute("d") ?? throw Fail(element, "path requires d"), element),
            "rect" => ParseRect(element),
            "circle" => ParseEllipse(element, true),
            "ellipse" => ParseEllipse(element, false),
            "line" => ParseLine(element),
            "polyline" => ParsePoly(element, false),
            "polygon" => ParsePoly(element, true),
            _ => throw Fail(element, $"'{LocalName(element)}' is not geometry")
        };
    }

    private static SvgPath ParseLine(XElement element)
    {
        var x1 = ParseLength((string?)element.Attribute("x1") ?? "0", 0, element, "x1");
        var y1 = ParseLength((string?)element.Attribute("y1") ?? "0", 0, element, "y1");
        var x2 = ParseLength((string?)element.Attribute("x2") ?? "0", 0, element, "x2");
        var y2 = ParseLength((string?)element.Attribute("y2") ?? "0", 0, element, "y2");
        var path = new SvgPath();
        var contour = new SvgContour();
        AddLine(contour, new SvgPoint(x1, y1), new SvgPoint(x2, y2));
        path.Contours.Add(contour);
        return path;
    }

    private static SvgPath ParsePoly(XElement element, bool close)
    {
        var values = ParseNumberList((string?)element.Attribute("points") ?? "", element, "points");
        if (values.Count < 4 || values.Count % 2 != 0)
        {
            throw Fail(element, "polyline and polygon points require pairs");
        }
        var path = new SvgPath();
        var contour = new SvgContour();
        var first = new SvgPoint(values[0], values[1]);
        var previous = first;
        for (var index = 2; index < values.Count; index += 2)
        {
            var next = new SvgPoint(values[index], values[index + 1]);
            AddLine(contour, previous, next);
            previous = next;
        }
        if (close)
        {
            AddLine(contour, previous, first);
            contour.Closed = true;
        }
        path.Contours.Add(contour);
        return path;
    }

    private static SvgPath ParseRect(XElement element)
    {
        var x = ParseLength((string?)element.Attribute("x") ?? "0", 0, element, "x");
        var y = ParseLength((string?)element.Attribute("y") ?? "0", 0, element, "y");
        var width = ParseLength((string?)element.Attribute("width") ?? "0", 0, element, "width");
        var height = ParseLength((string?)element.Attribute("height") ?? "0", 0, element, "height");
        if (width <= 0 || height <= 0)
        {
            throw Fail(element, "rect width and height must be positive");
        }
        var rx = ParseLength((string?)element.Attribute("rx") ?? "0", 0, element, "rx");
        var ry = ParseLength((string?)element.Attribute("ry") ?? "0", 0, element, "ry");
        if (rx < 0 || ry < 0)
        {
            throw Fail(element, "rect corner radii cannot be negative");
        }
        if (rx == 0 && ry != 0) rx = ry;
        if (ry == 0 && rx != 0) ry = rx;
        rx = Math.Min(rx, width / 2);
        ry = Math.Min(ry, height / 2);
        var path = new SvgPath();
        var contour = new SvgContour();
        var p0 = new SvgPoint(x + rx, y);
        var p1 = new SvgPoint(x + width - rx, y);
        var p2 = new SvgPoint(x + width, y + ry);
        var p3 = new SvgPoint(x + width, y + height - ry);
        var p4 = new SvgPoint(x + width - rx, y + height);
        var p5 = new SvgPoint(x + rx, y + height);
        var p6 = new SvgPoint(x, y + height - ry);
        var p7 = new SvgPoint(x, y + ry);
        AddLine(contour, p0, p1);
        AddQuadratic(contour, p1, new SvgPoint(x + width, y), p2);
        AddLine(contour, p2, p3);
        AddQuadratic(contour, p3, new SvgPoint(x + width, y + height), p4);
        AddLine(contour, p4, p5);
        AddQuadratic(contour, p5, new SvgPoint(x, y + height), p6);
        AddLine(contour, p6, p7);
        AddQuadratic(contour, p7, new SvgPoint(x, y), p0);
        contour.Closed = true;
        path.Contours.Add(contour);
        return path;
    }

    private static SvgPath ParseEllipse(XElement element, bool circle)
    {
        var cx = ParseLength((string?)element.Attribute("cx") ?? "0", 0, element, "cx");
        var cy = ParseLength((string?)element.Attribute("cy") ?? "0", 0, element, "cy");
        var rx = circle
            ? ParseLength((string?)element.Attribute("r") ?? "0", 0, element, "r")
            : ParseLength((string?)element.Attribute("rx") ?? "0", 0, element, "rx");
        var ry = circle
            ? rx
            : ParseLength((string?)element.Attribute("ry") ?? "0", 0, element, "ry");
        if (rx <= 0 || ry <= 0)
        {
            throw Fail(element, "ellipse radii must be positive");
        }
        var path = new SvgPath();
        var contour = new SvgContour();
        var k = 0.5522847498307936;
        var p0 = new SvgPoint(cx + rx, cy);
        var p1 = new SvgPoint(cx, cy + ry);
        var p2 = new SvgPoint(cx - rx, cy);
        var p3 = new SvgPoint(cx, cy - ry);
        AddCubic(contour, p0, new SvgPoint(cx + rx, cy + k * ry), new SvgPoint(cx + k * rx, cy + ry), p1);
        AddCubic(contour, p1, new SvgPoint(cx - k * rx, cy + ry), new SvgPoint(cx - rx, cy + k * ry), p2);
        AddCubic(contour, p2, new SvgPoint(cx - rx, cy - k * ry), new SvgPoint(cx - k * rx, cy - ry), p3);
        AddCubic(contour, p3, new SvgPoint(cx + k * rx, cy - ry), new SvgPoint(cx + rx, cy - k * ry), p0);
        contour.Closed = true;
        path.Contours.Add(contour);
        return path;
    }

    private static SvgPath TransformPath(SvgPath path, SvgMatrix transform)
    {
        var result = new SvgPath();
        foreach (var source in path.Contours)
        {
            var target = new SvgContour { Closed = source.Closed };
            foreach (var curve in source.Curves)
            {
                var p0 = transform.Apply(new SvgPoint(curve.X0, curve.Y0));
                var control = transform.Apply(new SvgPoint(curve.CX, curve.CY));
                var p1 = transform.Apply(new SvgPoint(curve.X1, curve.Y1));
                target.Curves.Add(new SvgQuadratic(p0.X, p0.Y, control.X, control.Y, p1.X, p1.Y));
            }
            result.Contours.Add(target);
        }
        return result;
    }

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

internal sealed class SvgNumberScanner
{
    private readonly string text;
    private readonly XElement owner;
    private readonly string field;
    private int index;

    internal SvgNumberScanner(string text, XElement owner, string field)
    {
        this.text = text;
        this.owner = owner;
        this.field = field;
    }

    internal bool TryRead(out double value)
    {
        SkipSeparators();
        if (index >= text.Length)
        {
            value = 0;
            return false;
        }
        var start = index;
        if (text[index] is '+' or '-') index++;
        var digits = 0;
        while (index < text.Length && char.IsDigit(text[index]))
        {
            index++;
            digits++;
        }
        if (index < text.Length && text[index] == '.')
        {
            index++;
            while (index < text.Length && char.IsDigit(text[index]))
            {
                index++;
                digits++;
            }
        }
        if (digits == 0)
        {
            throw SvgCompiler.Fail(owner, $"{field} contains an invalid number");
        }
        if (index < text.Length && text[index] is 'e' or 'E')
        {
            index++;
            if (index < text.Length && text[index] is '+' or '-') index++;
            var exponentDigits = 0;
            while (index < text.Length && char.IsDigit(text[index]))
            {
                index++;
                exponentDigits++;
            }
            if (exponentDigits == 0)
            {
                throw SvgCompiler.Fail(owner, $"{field} contains an invalid exponent");
            }
        }
        if (!double.TryParse(text[start..index], NumberStyles.Float, CultureInfo.InvariantCulture, out value)
            || !double.IsFinite(value))
        {
            throw SvgCompiler.Fail(owner, $"{field} contains a non-finite number");
        }
        return true;
    }

    private void SkipSeparators()
    {
        while (index < text.Length && (char.IsWhiteSpace(text[index]) || text[index] == ',')) index++;
    }
}

internal sealed class SvgTransformScanner
{
    private readonly string text;
    private readonly XElement owner;
    private int index;

    internal SvgTransformScanner(string text, XElement owner)
    {
        this.text = text;
        this.owner = owner;
    }

    internal bool TryReadName(out string name)
    {
        SkipSeparators();
        if (index >= text.Length)
        {
            name = "";
            return false;
        }
        var start = index;
        while (index < text.Length && char.IsLetter(text[index])) index++;
        if (start == index || index >= text.Length || text[index] != '(')
        {
            throw SvgCompiler.Fail(owner, "invalid transform list");
        }
        name = text[start..index].ToLowerInvariant();
        index++;
        return true;
    }

    internal List<double> ReadArguments()
    {
        var values = new List<double>();
        while (true)
        {
            while (index < text.Length && (char.IsWhiteSpace(text[index]) || text[index] == ',')) index++;
            if (index >= text.Length)
            {
                throw SvgCompiler.Fail(owner, "unterminated transform");
            }
            if (text[index] == ')')
            {
                index++;
                return values;
            }
            values.Add(ReadNumber());
        }
    }

    private double ReadNumber()
    {
        var start = index;
        if (index < text.Length && text[index] is '+' or '-') index++;
        var digits = 0;
        while (index < text.Length && char.IsDigit(text[index]))
        {
            index++;
            digits++;
        }
        if (index < text.Length && text[index] == '.')
        {
            index++;
            while (index < text.Length && char.IsDigit(text[index]))
            {
                index++;
                digits++;
            }
        }
        if (digits == 0)
        {
            throw SvgCompiler.Fail(owner, "invalid transform number");
        }
        if (index < text.Length && text[index] is 'e' or 'E')
        {
            index++;
            if (index < text.Length && text[index] is '+' or '-') index++;
            var exponentDigits = 0;
            while (index < text.Length && char.IsDigit(text[index]))
            {
                index++;
                exponentDigits++;
            }
            if (exponentDigits == 0)
            {
                throw SvgCompiler.Fail(owner, "invalid transform exponent");
            }
        }
        if (!double.TryParse(text[start..index], NumberStyles.Float, CultureInfo.InvariantCulture, out var value)
            || !double.IsFinite(value))
        {
            throw SvgCompiler.Fail(owner, "transform contains a non-finite number");
        }
        return value;
    }

    internal void RequireEnd()
    {
        SkipSeparators();
        if (index != text.Length)
        {
            throw SvgCompiler.Fail(owner, "invalid transform list");
        }
    }

    private void SkipSeparators()
    {
        while (index < text.Length && (char.IsWhiteSpace(text[index]) || text[index] == ',')) index++;
    }
}

internal sealed class ByteWriter
{
    private readonly List<byte> bytes = [];
    internal int Count => bytes.Count;

    internal void WriteU16(ushort value)
    {
        bytes.Add((byte)value);
        bytes.Add((byte)(value >> 8));
    }

    internal void WriteU32(uint value)
    {
        bytes.Add((byte)value);
        bytes.Add((byte)(value >> 8));
        bytes.Add((byte)(value >> 16));
        bytes.Add((byte)(value >> 24));
    }

    internal void WriteF32(double value)
    {
        if (!double.IsFinite(value) || value < float.MinValue || value > float.MaxValue)
        {
            throw new SvgCompileException("compiled value is not a finite float32");
        }
        WriteU32((uint)BitConverter.SingleToInt32Bits((float)value));
    }

    internal void WriteBytes(byte[] value) => bytes.AddRange(value);
    internal void WriteZeros(int count)
    {
        for (var index = 0; index < count; index++) bytes.Add(0);
    }

    internal void Align4()
    {
        while ((bytes.Count & 3) != 0) bytes.Add(0);
    }

    internal byte[] ToArray() => bytes.ToArray();

    internal void WriteU16At(int offset, ushort value)
    {
        bytes[offset] = (byte)value;
        bytes[offset + 1] = (byte)(value >> 8);
    }

    internal void WriteU32At(int offset, uint value)
    {
        bytes[offset] = (byte)value;
        bytes[offset + 1] = (byte)(value >> 8);
        bytes[offset + 2] = (byte)(value >> 16);
        bytes[offset + 3] = (byte)(value >> 24);
    }

    internal void WriteF32At(int offset, double value)
    {
        if (!double.IsFinite(value) || value < float.MinValue || value > float.MaxValue)
        {
            throw new SvgCompileException("compiled value is not a finite float32");
        }
        WriteU32At(offset, (uint)BitConverter.SingleToInt32Bits((float)value));
    }
}
