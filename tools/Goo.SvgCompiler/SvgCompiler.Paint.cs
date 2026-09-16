namespace Goo.SvgCompiler;

internal sealed partial class SvgCompiler
{
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

}
