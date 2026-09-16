namespace Goo.SvgCompiler;

internal sealed partial class SvgCompiler
{
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

}
