package Goo.Svg

import System
import System.Collections.Generic
import System.Xml.Linq

internal data struct SvgPoint(X float64, Y float64) {
    internal prop IsFinite bool -> Double.IsFinite(X) && Double.IsFinite(Y)
}

internal data struct SvgMatrix(A float64, B float64, C float64, D float64, E float64, F float64) {
    shared {
        internal prop Identity SvgMatrix -> SvgMatrix(1, 0, 0, 1, 0, 0)
    }

    internal func Apply(point SvgPoint) SvgPoint -> SvgPoint(
        A * point.X + C * point.Y + E,
        B * point.X + D * point.Y + F
    )

    internal prop ScaleX float64 -> Math.Sqrt(A * A + B * B)
    internal prop ScaleY float64 -> Math.Sqrt(C * C + D * D)
}

func (left SvgMatrix) operator * (right SvgMatrix) SvgMatrix -> SvgMatrix(
    left.A * right.A + left.C * right.B,
    left.B * right.A + left.D * right.B,
    left.A * right.C + left.C * right.D,
    left.B * right.C + left.D * right.D,
    left.A * right.E + left.C * right.F + left.E,
    left.B * right.E + left.D * right.F + left.F
)

internal data struct SvgColor(R uint8, G uint8, B uint8, A uint8) { }

internal enum SvgPaintKind {
    Solid,
    LinearGradient,
    RadialGradient
}

internal class SvgPaint {
    internal prop Kind SvgPaintKind {
        get;
        init
    }
    internal prop Color SvgColor {
        get;
        init
    }
    internal prop Opacity float64 {
        get;
        init
    }
    internal prop X0 float64 {
        get;
        init
    }
    internal prop Y0 float64 {
        get;
        init
    }
    internal prop X1 float64 {
        get;
        init
    }
    internal prop Y1 float64 {
        get;
        init
    }
    internal prop Animation SvgAnimation?
    internal let Stops List[SvgStop] = List[SvgStop]()

    internal init() {
        Opacity = 1
    }
}

internal class SvgStop {
    internal prop Offset float64 {
        get;
        init
    }
    internal prop Color SvgColor {
        get;
        init
    }
}

internal class SvgStroke {
    internal prop Width float64 {
        get;
        init
    }
    internal prop MiterLimit float64 {
        get;
        init
    }
    internal prop Cap uint32 {
        get;
        init
    }
    internal prop Join uint32 {
        get;
        init
    }
    internal prop DashOffset float64 {
        get;
        init
    }
    internal prop VectorEffect Goo.VectorEffect { get; init; }
    internal prop Animation SvgAnimation?
    internal prop Paint SvgPaint {
        get;
        init
    }
    internal let Dashes List[float64] = List[float64]()
}

internal class SvgClip {
    internal let Contours List[SvgContour] = List[SvgContour]()
    internal prop FillRule uint32
}

internal class SvgShape {
    internal prop Path SvgPath {
        get;
        init
    }
    internal prop IsPath bool {
        get;
        init
    }
    internal prop Fill SvgPaint? {
        get;
        init
    }
    internal prop Stroke SvgStroke? {
        get;
        init
    }
    internal prop Flags uint32 {
        get;
        init
    }
}

internal class SvgNode {
    internal prop Parent SvgNode? {
        get;
        init
    }
    internal let Children List[SvgNode] = List[SvgNode]()
    internal prop Transform SvgMatrix {
        get;
        init
    }
    internal prop Opacity float64 {
        get;
        init
    }
    internal prop Shape SvgShape? {
        get;
        init
    }
    internal prop Clip SvgClip? {
        get;
        init
    }
    internal prop TransformAnimation SvgAnimation?
    internal prop OpacityAnimation SvgAnimation?
    internal prop MorphAnimation SvgAnimation?
    internal prop Index int32
}

internal enum SvgAnimationKind {
    Transform,
    Opacity,
    Color,
    Stroke,
    Morph
}

internal class SvgAnimation {
    internal prop Kind SvgAnimationKind {
        get;
        init
    }
    internal prop Duration float64 {
        get;
        init
    }
    internal prop Flags uint32 {
        get;
        init
    }
    internal let Keyframes List[SvgAnimationKeyframe] = List[SvgAnimationKeyframe]()
}

internal class SvgAnimationKeyframe {
    internal prop Time float64 {
        get;
        init
    }
    internal prop A float64 {
        get;
        init
    }
    internal prop B float64 {
        get;
        init
    }
    internal prop C float64 {
        get;
        init
    }
    internal prop D float64
    internal prop E float64 {
        get;
        init
    }
    internal prop F float64 {
        get;
        init
    }
    internal prop Easing uint32 {
        get;
        init
    }
    internal prop ControlA float64 {
        get;
        init
    }
    internal prop ControlB float64 {
        get;
        init
    }
    internal prop ControlC float64 {
        get;
        init
    }
    internal prop ControlD float64 {
        get;
        init
    }
    internal prop MorphCurves List[SvgQuadratic]? {
        get;
        init
    }
}

internal class SvgPath {
    internal let Contours List[SvgContour] = List[SvgContour]()

    internal func Bounds()(MinX float64, MinY float64, MaxX float64, MaxY float64) {
        var minX = Double.PositiveInfinity
        var minY = Double.PositiveInfinity
        var maxX = Double.NegativeInfinity
        var maxY = Double.NegativeInfinity

        for contour in Contours {
            for curve in contour.Curves {
                IncludeQuadraticBounds(curve.X0, curve.CX, curve.X1, ref minX, ref maxX)
                IncludeQuadraticBounds(curve.Y0, curve.CY, curve.Y1, ref minY, ref maxY)
            }
        }
        return if Double.IsFinite(minX) {
            (minX, minY, maxX, maxY)
        } else {
            (0.0, 0.0, 0.0, 0.0)
        }
    }

    shared {
        private func IncludeQuadraticBounds(
            start float64,
            control float64,
            end float64,
            ref minimum float64,
            ref maximum float64
        ) {
            minimum = Math.Min(minimum, Math.Min(start, end))
            maximum = Math.Max(maximum, Math.Max(start, end))
            let denominator = start - 2 * control + end
            if denominator == 0 {
                return
            }

            let t = (start - control) / denominator
            if t <= 0 || t >= 1 || !Double.IsFinite(t) {
                return
            }

            let inverse = 1 - t
            let value = inverse * inverse * start + 2 * inverse * t * control + t * t * end
            minimum = Math.Min(minimum, value)
            maximum = Math.Max(maximum, value)
        }
    }
}

internal class SvgContour {
    internal let Curves List[SvgQuadratic] = List[SvgQuadratic]()
    internal prop Closed bool
}

internal data struct SvgQuadratic(X0 float64, Y0 float64, CX float64, CY float64, X1 float64, Y1 float64) { }

internal class SvgGradientDefinition {
    internal let Element XElement

    internal init(element XElement) {
        Element = element
    }
}

internal class SvgClipDefinition {
    internal let Element XElement

    internal init(element XElement) {
        Element = element
    }
}

internal class SvgStyle {
    internal prop Fill string
    internal prop Stroke string?
    internal prop FillOpacity float64
    internal prop StrokeOpacity float64
    internal prop StrokeWidth float64
    internal prop StrokeCap uint32
    internal prop StrokeJoin uint32
    internal prop MiterLimit float64
    internal prop DashOffset float64
    internal prop Dashes List[float64]?
    internal prop VectorEffect Goo.VectorEffect
    internal prop FillRule uint32
    internal prop ClipRule uint32
    internal prop Opacity float64
    internal prop LocalOpacity float64
    internal prop ClipPath string?
    internal prop DisplayNone bool

    internal init() {
        Fill = "#000000"
        FillOpacity = 1
        StrokeOpacity = 1
        StrokeWidth = 1
        MiterLimit = 4
        Opacity = 1
        LocalOpacity = 1
    }

    internal func Clone() SvgStyle -> SvgStyle{
        Fill: Fill,
        Stroke: Stroke,
        FillOpacity: FillOpacity,
        StrokeOpacity: StrokeOpacity,
        StrokeWidth: StrokeWidth,
        StrokeCap: StrokeCap,
        StrokeJoin: StrokeJoin,
        MiterLimit: MiterLimit,
        DashOffset: DashOffset,
        Dashes: if let dashes = Dashes {
            List[float64](dashes)
        } else {
            nil
        },
        FillRule: FillRule,
        ClipRule: ClipRule,
        Opacity: Opacity,
        LocalOpacity: LocalOpacity,
        ClipPath: ClipPath,
        DisplayNone: DisplayNone,
    }
}
