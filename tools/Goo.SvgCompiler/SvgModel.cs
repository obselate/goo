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

