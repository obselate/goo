namespace Goo.Svg;

internal sealed partial class SvgParser
{
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
                => throw Fail(element, $"{attributeName} animation is not supported"),
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
            throw Fail(element, "animation requires fill='freeze'");
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

}
