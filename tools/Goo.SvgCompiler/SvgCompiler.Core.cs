namespace Goo.SvgCompiler;

internal sealed partial class SvgCompiler
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

}
