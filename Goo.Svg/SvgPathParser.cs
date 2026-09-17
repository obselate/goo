using System.Globalization;
using System.Xml.Linq;

namespace Goo.Svg;

internal static class SvgPathParser
{
    private const int MaxCurves = 262144;

    internal static SvgPath Parse(string value, XElement owner)
    {
        var scanner = new PathScanner(value, owner);
        var path = new SvgPath();
        var curveCount = 0;
        SvgContour? contour = null;
        var current = new SvgPoint(0, 0);
        var start = current;
        var previousCommand = '\0';
        var previousCubicControl = current;
        var previousQuadraticControl = current;
        var hasPreviousCubic = false;
        var hasPreviousQuadratic = false;
        char command = '\0';
        while (scanner.TryReadCommandOrNumber(out var token, out var tokenIsCommand))
        {
            if (tokenIsCommand)
            {
                command = token;
                if (command is 'z' or 'Z')
                {
                    if (contour is not null)
                    {
                        if (!Same(current, start)) AddLine(contour, current, start, ref curveCount);
                        contour.Closed = true;
                        current = start;
                    }
                    previousCommand = command;
                    hasPreviousCubic = false;
                    hasPreviousQuadratic = false;
                    continue;
                }
                if (command is not ('m' or 'M' or 'l' or 'L' or 'h' or 'H' or 'v' or 'V'
                    or 'c' or 'C' or 's' or 'S' or 'q' or 'Q' or 't' or 'T' or 'a' or 'A'))
                {
                    throw Fail(owner, $"path command '{command}' is not supported");
                }
            }
            else if (command == '\0')
            {
                throw Fail(owner, "path data must start with a command");
            }
            else if (!tokenIsCommand && command is 'z' or 'Z')
            {
                throw Fail(owner, "path data cannot continue after close without a command");
            }

            switch (command)
            {
                case 'm':
                case 'M':
                {
                    var point = ReadPoint(scanner, owner, command is 'm', current);
                    if (contour is not null && contour.Curves.Count != 0) path.Contours.Add(contour);
                    contour = new SvgContour();
                    current = point;
                    start = point;
                    previousCommand = command;
                    hasPreviousCubic = false;
                    hasPreviousQuadratic = false;
                    command = command == 'm' ? 'l' : 'L';
                    break;
                }
                case 'l':
                case 'L':
                {
                    EnsureContour(ref contour, current);
                    var point = ReadPoint(scanner, owner, command is 'l', current);
                    AddLine(contour!, current, point, ref curveCount);
                    current = point;
                    previousCommand = command;
                    hasPreviousCubic = false;
                    hasPreviousQuadratic = false;
                    break;
                }
                case 'h':
                case 'H':
                {
                    EnsureContour(ref contour, current);
                    var x = scanner.ReadNumber();
                    var point = new SvgPoint(command == 'h' ? current.X + x : x, current.Y);
                    AddLine(contour!, current, point, ref curveCount);
                    current = point;
                    previousCommand = command;
                    hasPreviousCubic = false;
                    hasPreviousQuadratic = false;
                    break;
                }
                case 'v':
                case 'V':
                {
                    EnsureContour(ref contour, current);
                    var y = scanner.ReadNumber();
                    var point = new SvgPoint(current.X, command == 'v' ? current.Y + y : y);
                    AddLine(contour!, current, point, ref curveCount);
                    current = point;
                    previousCommand = command;
                    hasPreviousCubic = false;
                    hasPreviousQuadratic = false;
                    break;
                }
                case 'c':
                case 'C':
                {
                    EnsureContour(ref contour, current);
                    var first = ReadPoint(scanner, owner, command is 'c', current);
                    var second = ReadPoint(scanner, owner, command is 'c', current);
                    var end = ReadPoint(scanner, owner, command is 'c', current);
                    AddCubic(contour!, current, first, second, end, ref curveCount);
                    current = end;
                    previousCubicControl = second;
                    hasPreviousCubic = true;
                    hasPreviousQuadratic = false;
                    previousCommand = command;
                    break;
                }
                case 's':
                case 'S':
                {
                    EnsureContour(ref contour, current);
                    var first = hasPreviousCubic && previousCommand is 'c' or 'C' or 's' or 'S'
                        ? Reflect(previousCubicControl, current)
                        : current;
                    var second = ReadPoint(scanner, owner, command is 's', current);
                    var end = ReadPoint(scanner, owner, command is 's', current);
                    AddCubic(contour!, current, first, second, end, ref curveCount);
                    current = end;
                    previousCubicControl = second;
                    hasPreviousCubic = true;
                    hasPreviousQuadratic = false;
                    previousCommand = command;
                    break;
                }
                case 'q':
                case 'Q':
                {
                    EnsureContour(ref contour, current);
                    var control = ReadPoint(scanner, owner, command is 'q', current);
                    var end = ReadPoint(scanner, owner, command is 'q', current);
                    AddQuadratic(contour!, current, control, end, ref curveCount);
                    current = end;
                    previousQuadraticControl = control;
                    hasPreviousQuadratic = true;
                    hasPreviousCubic = false;
                    previousCommand = command;
                    break;
                }
                case 't':
                case 'T':
                {
                    EnsureContour(ref contour, current);
                    var control = hasPreviousQuadratic && previousCommand is 'q' or 'Q' or 't' or 'T'
                        ? Reflect(previousQuadraticControl, current)
                        : current;
                    var end = ReadPoint(scanner, owner, command is 't', current);
                    AddQuadratic(contour!, current, control, end, ref curveCount);
                    current = end;
                    previousQuadraticControl = control;
                    hasPreviousQuadratic = true;
                    hasPreviousCubic = false;
                    previousCommand = command;
                    break;
                }
                case 'a':
                case 'A':
                {
                    EnsureContour(ref contour, current);
                    var rx = scanner.ReadNumber();
                    var ry = scanner.ReadNumber();
                    var rotation = scanner.ReadNumber();
                    var largeArc = scanner.ReadNumber();
                    var sweep = scanner.ReadNumber();
                    var end = ReadPoint(scanner, owner, command is 'a', current);
                    if (largeArc is not (0 or 1) || sweep is not (0 or 1))
                    {
                        throw Fail(owner, "arc flags must be zero or one");
                    }
                    AddArc(contour!, current, Math.Abs(rx), Math.Abs(ry), rotation,
                        largeArc != 0, sweep != 0, end, ref curveCount);
                    current = end;
                    hasPreviousCubic = false;
                    hasPreviousQuadratic = false;
                    previousCommand = command;
                    break;
                }
            }
        }
        if (contour is not null && contour.Curves.Count != 0) path.Contours.Add(contour);
        if (path.Contours.Count == 0)
        {
            throw Fail(owner, "path contains no geometry");
        }
        return path;
    }

    private static SvgPoint ReadPoint(PathScanner scanner, XElement owner, bool relative, SvgPoint current)
    {
        var x = scanner.ReadNumber();
        var y = scanner.ReadNumber();
        var point = new SvgPoint(x, y);
        var result = relative ? new SvgPoint(current.X + point.X, current.Y + point.Y) : point;
        if (!result.IsFinite)
        {
            throw Fail(owner, "path coordinate is not finite");
        }
        return result;
    }

    private static void EnsureContour(ref SvgContour? contour, SvgPoint current)
    {
        contour ??= new SvgContour();
    }

    private static SvgPoint Reflect(SvgPoint point, SvgPoint around) => new(2 * around.X - point.X, 2 * around.Y - point.Y);
    private static bool Same(SvgPoint left, SvgPoint right) => left.X == right.X && left.Y == right.Y;

    private static void AddLine(SvgContour contour, SvgPoint from, SvgPoint to, ref int curveCount)
    {
        AddCurve(contour, new SvgQuadratic(from.X, from.Y, (from.X + to.X) / 2,
            (from.Y + to.Y) / 2, to.X, to.Y), ref curveCount);
    }

    private static void AddQuadratic(SvgContour contour, SvgPoint from, SvgPoint control,
        SvgPoint to, ref int curveCount)
    {
        AddCurve(contour, new SvgQuadratic(from.X, from.Y, control.X, control.Y, to.X, to.Y),
            ref curveCount);
    }

    private static void AddCubic(SvgContour contour, SvgPoint from, SvgPoint first,
        SvgPoint second, SvgPoint to, ref int curveCount)
    {
        AddCubicRecursive(contour, from, first, second, to, 0, ref curveCount);
    }

    private static void AddCubicRecursive(SvgContour contour, SvgPoint p0, SvgPoint p1,
        SvgPoint p2, SvgPoint p3, int depth, ref int curveCount)
    {
        var control = new SvgPoint(
            (3 * (p1.X + p2.X) - p0.X - p3.X) / 4,
            (3 * (p1.Y + p2.Y) - p0.Y - p3.Y) / 4);
        var deltaX = p3.X - 3 * p2.X + 3 * p1.X - p0.X;
        var deltaY = p3.Y - 3 * p2.Y + 3 * p1.Y - p0.Y;
        var error = Math.Sqrt(deltaX * deltaX + deltaY * deltaY) * Math.Sqrt(3) / 36;
        if (!control.IsFinite || !double.IsFinite(error))
        {
            throw new SvgParseException("path cubic contains non-finite geometry");
        }
        if (error <= 0.0001 || depth >= 10)
        {
            AddQuadratic(contour, p0, control, p3, ref curveCount);
            return;
        }
        var p01 = Midpoint(p0, p1);
        var p12 = Midpoint(p1, p2);
        var p23 = Midpoint(p2, p3);
        var p012 = Midpoint(p01, p12);
        var p123 = Midpoint(p12, p23);
        var middle = Midpoint(p012, p123);
        AddCubicRecursive(contour, p0, p01, p012, middle, depth + 1, ref curveCount);
        AddCubicRecursive(contour, middle, p123, p23, p3, depth + 1, ref curveCount);
    }

    private static void AddCurve(SvgContour contour, SvgQuadratic curve, ref int curveCount)
    {
        if (!double.IsFinite(curve.X0) || !double.IsFinite(curve.Y0)
            || !double.IsFinite(curve.CX) || !double.IsFinite(curve.CY)
            || !double.IsFinite(curve.X1) || !double.IsFinite(curve.Y1))
        {
            throw new SvgParseException("path contains non-finite geometry");
        }
        if (curveCount >= MaxCurves)
        {
            throw new SvgParseException($"path curve count exceeds {MaxCurves}");
        }
        contour.Curves.Add(curve);
        curveCount++;
    }

    private static SvgPoint Midpoint(SvgPoint left, SvgPoint right) => new((left.X + right.X) / 2, (left.Y + right.Y) / 2);
    private static void AddArc(SvgContour contour, SvgPoint from, double radiusX, double radiusY,
        double rotation, bool largeArc, bool sweep, SvgPoint to, ref int curveCount)
    {
        if (Same(from, to)) return;
        if (radiusX == 0 || radiusY == 0)
        {
            AddLine(contour, from, to, ref curveCount);
            return;
        }
        var angle = rotation * Math.PI / 180;
        var cosine = Math.Cos(angle);
        var sine = Math.Sin(angle);
        var dx = (from.X - to.X) / 2;
        var dy = (from.Y - to.Y) / 2;
        var xPrime = cosine * dx + sine * dy;
        var yPrime = -sine * dx + cosine * dy;
        var lambda = xPrime * xPrime / (radiusX * radiusX) + yPrime * yPrime / (radiusY * radiusY);
        if (lambda > 1)
        {
            var scale = Math.Sqrt(lambda);
            radiusX *= scale;
            radiusY *= scale;
        }
        var sign = largeArc == sweep ? -1 : 1;
        var numerator = Math.Max(0, (radiusX * radiusX * radiusY * radiusY)
            - (radiusX * radiusX * yPrime * yPrime) - (radiusY * radiusY * xPrime * xPrime));
        var denominator = radiusX * radiusX * yPrime * yPrime + radiusY * radiusY * xPrime * xPrime;
        var coefficient = denominator == 0 ? 0 : sign * Math.Sqrt(numerator / denominator);
        var centerPrimeX = coefficient * radiusX * yPrime / radiusY;
        var centerPrimeY = coefficient * -radiusY * xPrime / radiusX;
        var centerX = cosine * centerPrimeX - sine * centerPrimeY + (from.X + to.X) / 2;
        var centerY = sine * centerPrimeX + cosine * centerPrimeY + (from.Y + to.Y) / 2;
        var startAngle = VectorAngle(new SvgPoint(1, 0), new SvgPoint((xPrime - centerPrimeX) / radiusX, (yPrime - centerPrimeY) / radiusY));
        var deltaAngle = VectorAngle(
            new SvgPoint((xPrime - centerPrimeX) / radiusX, (yPrime - centerPrimeY) / radiusY),
            new SvgPoint((-xPrime - centerPrimeX) / radiusX, (-yPrime - centerPrimeY) / radiusY));
        if (!sweep && deltaAngle > 0) deltaAngle -= 2 * Math.PI;
        if (sweep && deltaAngle < 0) deltaAngle += 2 * Math.PI;
        var segments = Math.Max(1, (int)Math.Ceiling(Math.Abs(deltaAngle) / (Math.PI / 2)));
        var segmentAngle = deltaAngle / segments;
        var currentAngle = startAngle;
        for (var index = 0; index < segments; index++)
        {
            var nextAngle = currentAngle + segmentAngle;
            var tangent = 4.0 / 3.0 * Math.Tan((nextAngle - currentAngle) / 4);
            var p0 = EllipsePoint(centerX, centerY, radiusX, radiusY, cosine, sine, currentAngle);
            var p3 = EllipsePoint(centerX, centerY, radiusX, radiusY, cosine, sine, nextAngle);
            var c1 = EllipsePoint(centerX, centerY, radiusX, radiusY, cosine, sine, currentAngle, tangent, true);
            var c2 = EllipsePoint(centerX, centerY, radiusX, radiusY, cosine, sine, nextAngle, tangent, false);
            AddCubic(contour, p0, c1, c2, p3, ref curveCount);
            currentAngle = nextAngle;
        }
    }

    private static SvgPoint EllipsePoint(double cx, double cy, double rx, double ry, double cosine, double sine, double angle,
        double tangent = 0, bool firstControl = false)
    {
        var x = rx * Math.Cos(angle);
        var y = ry * Math.Sin(angle);
        if (tangent != 0)
        {
            if (firstControl)
            {
                x += -tangent * rx * Math.Sin(angle);
                y += tangent * ry * Math.Cos(angle);
            }
            else
            {
                x -= -tangent * rx * Math.Sin(angle);
                y -= tangent * ry * Math.Cos(angle);
            }
        }
        return new SvgPoint(cx + cosine * x - sine * y, cy + sine * x + cosine * y);
    }

    private static double VectorAngle(SvgPoint left, SvgPoint right)
    {
        return Math.Atan2(left.X * right.Y - left.Y * right.X, left.X * right.X + left.Y * right.Y);
    }

    private static SvgParseException Fail(XElement element, string message)
    {
        var info = (System.Xml.IXmlLineInfo)element;
        return info.HasLineInfo()
            ? new SvgParseException($"line {info.LineNumber}, column {info.LinePosition}: {message}")
            : new SvgParseException(message);
    }
}

internal sealed class PathScanner
{
    private readonly string text;
    private readonly XElement owner;
    private int index;
    internal PathScanner(string text, XElement owner)
    {
        this.text = text;
        this.owner = owner;
    }

    internal bool TryReadCommandOrNumber(out char token, out bool tokenIsCommand)
    {
        SkipSeparators();
        if (index >= text.Length)
        {
            token = '\0';
            tokenIsCommand = false;
            return false;
        }
        if (char.IsLetter(text[index]))
        {
            token = text[index++];
            tokenIsCommand = true;
            return true;
        }
        token = '\0';
        tokenIsCommand = false;
        return true;
    }

    internal double ReadNumber()
    {
        SkipSeparators();
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
            throw Fail($"path contains an invalid number at offset {start}");
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
            if (exponentDigits == 0) throw Fail("path contains an invalid exponent");
        }
        if (!double.TryParse(text[start..index], NumberStyles.Float, CultureInfo.InvariantCulture, out var result)
            || !double.IsFinite(result))
        {
            throw Fail("path contains a non-finite number");
        }
        return result;
    }

    private void SkipSeparators()
    {
        while (index < text.Length && (char.IsWhiteSpace(text[index]) || text[index] == ',')) index++;
    }

    private SvgParseException Fail(string message)
    {
        var info = (System.Xml.IXmlLineInfo)owner;
        return info.HasLineInfo()
            ? new SvgParseException($"line {info.LineNumber}, column {info.LinePosition}: {message}")
            : new SvgParseException(message);
    }
}
