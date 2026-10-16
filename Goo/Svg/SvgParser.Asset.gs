package Goo.Svg

import Goo
import System
import System.Collections.Generic
import System.Linq
import System.Xml
import System.Xml.Linq

internal partial class SvgParser {
    private func BuildAsset() VectorAsset {
        let orderedNodes = OrderNodes()
        let paintIndices = Dictionary[SvgPaint, int32](ReferenceEqualityComparer.Instance)
        let strokeIndices = Dictionary[SvgStroke, int32](ReferenceEqualityComparer.Instance)
        let trackIndices = Dictionary[SvgAnimation, int32](ReferenceEqualityComparer.Instance)
        let animationNodes = List[VectorAnimationNode](orderedNodes.Count)
        let animationPaints = List[VectorAnimationPaint]()
        let animationStrokes = List[VectorAnimationStroke]()
        let animationTracks = List[VectorAnimationTrack]()
        let keyframes = List[VectorAnimationKeyframe]()
        let morphCurves = List[VectorAnimationCurve]()
        let dashes = List[float32]()
        let AddTrack = func (animation SvgAnimation?) uint32 {
            if animation == nil {
                return MissingIndex
            }
            if trackIndices.TryGetValue(animation, out var existing) {
                return uint32(existing)
            }
            if animationTracks.Count >= MaxAnimationTracks ||
                animation
                .Keyframes
                .Count == 0 ||
                animation
                .Keyframes
                .Count > MaxAnimationKeyframes - keyframes.Count {
                throw SvgParseException("animation track limit exceeded")
            }
            let keyframeStart = keyframes.Count
            for keyframe in animation.Keyframes {
                var curveStart = MissingIndex
                var curveCount = 0u
                if animation.Kind == SvgAnimationKind.Morph {
                    let source = keyframe.MorphCurves ?? throw SvgParseException("morph keyframe has no target curves")
                    if source.Count == 0 || source.Count > MaxMorphCurves - morphCurves.Count {
                        throw SvgParseException("morph curve limit exceeded")
                    }
                    curveStart = uint32(morphCurves.Count)
                    curveCount = uint32(source.Count)
                    for curve in source {
                        morphCurves.Add(
                            VectorAnimationCurve(
                                F32(curve.X0),
                                F32(curve.Y0),
                                F32(curve.CX),
                                F32(curve.CY),
                                F32(curve.X1),
                                F32(curve.Y1)
                            )
                        )
                    }
                }
                keyframes.Add(
                    VectorAnimationKeyframe(
                        F32(keyframe.Time),
                        F32(keyframe.A),
                        F32(keyframe.B),
                        F32(keyframe.C),
                        F32(keyframe.D),
                        F32(keyframe.E),
                        F32(keyframe.F),
                        keyframe.Easing,
                        F32(keyframe.ControlA),
                        F32(keyframe.ControlB),
                        F32(keyframe.ControlC),
                        F32(keyframe.ControlD),
                        curveStart,
                        curveCount
                    )
                )
            }
            let index = animationTracks.Count
            animationTracks.Add(
                VectorAnimationTrack(
                    VectorAnimationKind(animation.Kind),
                    uint32(keyframeStart),
                    uint32(animation.Keyframes.Count),
                    F32(animation.Duration),
                    animation.Flags
                )
            )
            trackIndices.Add(animation, index)
            return uint32(index)
        }
        let AddPaint = func (paint SvgPaint) uint32 {
            if paintIndices.TryGetValue(paint, out var existing) {
                return uint32(existing)
            }
            if animationPaints.Count >= MaxPaints {
                throw SvgParseException("paint count exceeds $MaxPaints")
            }
            let index = animationPaints.Count
            animationPaints.Add(VectorAnimationPaint(VectorPaintKind(paint.Kind), AddTrack(paint.Animation)))
            paintIndices.Add(paint, index)
            return uint32(index)
        }
        let AddStroke = func (stroke SvgStroke) uint32 {
            if strokeIndices.TryGetValue(stroke, out var existing) {
                return uint32(existing)
            }
            if animationStrokes.Count >= MaxStrokes {
                throw SvgParseException("stroke count exceeds $MaxStrokes")
            }
            let dashStart = dashes.Count
            for value in stroke.Dashes {
                dashes.Add(F32(value))
            }
            let index = animationStrokes.Count
            animationStrokes.Add(
                VectorAnimationStroke(
                    F32(stroke.Width),
                    F32(stroke.MiterLimit),
                    stroke.Cap,
                    stroke.Join,
                    F32(stroke.DashOffset),
                    AddPaint(stroke.Paint),
                    AddTrack(stroke.Animation),
                    uint32(dashStart),
                    uint32(stroke.Dashes.Count)
                )
            )
            strokeIndices.Add(stroke, index)
            return uint32(index)
        }
        for node in orderedNodes {
            var paintIndex = MissingIndex
            var strokeIndex = MissingIndex
            let transformTrackIndex = AddTrack(node.TransformAnimation)
            let opacityTrackIndex = AddTrack(node.OpacityAnimation)
            let morphTrackIndex = AddTrack(node.MorphAnimation)
            if node.Shape is {} shape {
                if shape.Fill is {} fill {
                    paintIndex = AddPaint(fill)
                }
                if shape.Stroke is {} stroke {
                    strokeIndex = AddStroke(stroke)
                }
            }
            animationNodes.Add(
                VectorAnimationNode(paintIndex, strokeIndex, transformTrackIndex, opacityTrackIndex, morphTrackIndex)
            )
        }
        let roots = []VectorNode{BuildNode(nodes[0])}
        if animationTracks.Count == 0 {
            return VectorAsset(viewBoxX, viewBoxY, viewBoxWidth, viewBoxHeight, roots)
        }
        let animation = VectorAssetAnimation(
            animationNodes.ToArray(),
            animationPaints.ToArray(),
            animationStrokes.ToArray(),
            animationTracks.ToArray(),
            keyframes.ToArray(),
            morphCurves.ToArray(),
            dashes.ToArray()
        )
        return VectorAsset(viewBoxX, viewBoxY, viewBoxWidth, viewBoxHeight, roots, animation)
    }

    private func OrderNodes() List[SvgNode] {
        let ordered = List[SvgNode](nodes.Count)
        let pending = Queue[SvgNode]()
        pending.Enqueue(nodes[0])
        while pending.Count > 0 {
            let node = pending.Dequeue()
            node.Index = ordered.Count
            ordered.Add(node)
            for child in node.Children {
                pending.Enqueue(child)
            }
        }
        if ordered.Count != nodes.Count {
            throw SvgParseException("SVG node tree is disconnected")
        }
        return ordered
    }

    private func BuildNode(node SvgNode) VectorNode {
        let shape = node.Shape
        let children = node.Children.Select(BuildNode).ToArray()
        let style = VectorNodeStyle{
            Key: "node-${node.Index}",
            Fill: BuildPaint(shape?.Fill),
            Stroke: BuildStroke(shape?.Stroke),
            Transform: VectorAssetAnimation.MatrixTransform(
                F32(node.Transform.A),
                F32(node.Transform.C),
                F32(node.Transform.B),
                F32(node.Transform.D),
                F32(node.Transform.E),
                F32(node.Transform.F)
            ),
            Opacity: node.Opacity,
            ClipPath: BuildPath(node.Clip?.Contours),
            FillRule: if shape?.Flags == 1u {
                FillRule.EvenOdd
            } else {
                FillRule.NonZero
            },
            ClipPathFillRule: if node.Clip?.FillRule == 1u {
                FillRule.EvenOdd
            } else {
                FillRule.NonZero
            },
        }
        return VectorNode(BuildPath(shape?.Path.Contours), style, children)
    }

    private func BuildPaint(paint SvgPaint?) VectorPaint? {
        if paint == nil {
            return nil
        }
        if paint.Kind == SvgPaintKind.Solid {
            return VectorPaint(BuildColor(paint.Color))
        }
        let stops = paint
            .Stops
            .Select((stop SvgStop) -> GradientStop{Offset: stop.Offset, Color: BuildColor(stop.Color)})
            .ToArray()
        let x0 = paint.X0 / viewBoxWidth
        let y0 = paint.Y0 / viewBoxHeight
        let x1 = paint.X1 / viewBoxWidth
        let y1 = paint.Y1 / viewBoxHeight
        let gradient = if paint.Kind == SvgPaintKind.LinearGradient {
            cast[Gradient](VectorLinearGradient(x0, y0, x1, y1, stops))
        } else {
            cast[Gradient](VectorRadialGradient(x0, y0, Math.Abs(x1 - x0), Math.Abs(y1 - y0), stops))
        }
        return VectorPaint(gradient)
    }

    private func BuildStroke(stroke SvgStroke?) VectorStroke? {
        if stroke == nil {
            return nil
        }
        let dashes = if stroke.Dashes.Count == 0 {
            default(DashPattern?)
        } else {
            DashPattern(stroke.Dashes.ToArray(), stroke.DashOffset)
        }
        return VectorStroke(
            stroke.Width,
            BuildPaint(stroke.Paint)!!,
            StrokeCap(stroke.Cap),
            StrokeJoin(stroke.Join),
            stroke.MiterLimit,
            dashes
        )
    }

    private func BuildPath(source IReadOnlyList[SvgContour]?) VectorPath {
        if source == nil || source.Count == 0 {
            return VectorPath.Empty
        }
        let builder = PathBuilder(viewBoxX, viewBoxY, viewBoxWidth, viewBoxHeight)
        for contour in source {
            if contour.Curves.Count == 0 {
                continue
            }
            builder.MoveTo(contour.Curves[0].X0, contour.Curves[0].Y0)
            for curve in contour.Curves {
                builder.QuadraticTo(curve.CX, curve.CY, curve.X1, curve.Y1)
            }
            if contour.Closed {
                builder.Close()
            }
        }
        return builder.Build()
    }

    private func ReserveCurves(path SvgPath) {
        let count = path.Contours.Sum((contour SvgContour) -> contour.Curves.Count)
        if count > MaxCurves - reservedCurveCount {
            throw SvgParseException("curve count exceeds $MaxCurves")
        }
        reservedCurveCount += count
    }

    shared {
        private func BuildColor(color SvgColor) Color -> Color.Rgba(color.R, color.G, color.B, color.A)

        private func F32(value float64) float32 {
            let result = float32(value)
            if !float32.IsFinite(result) {
                throw SvgParseException("SVG value is outside the supported range")
            }
            return result
        }

        private func AddLine(contour SvgContour, from SvgPoint, to SvgPoint) {
            contour.Curves.Add(
                SvgQuadratic(from.X, from.Y, (from.X + to.X) / float64(2.0), (from.Y + to.Y) / float64(2.0), to.X, to.Y)
            )
        }

        private func AddQuadratic(contour SvgContour, from SvgPoint, control SvgPoint, to SvgPoint) {
            contour.Curves.Add(SvgQuadratic(from.X, from.Y, control.X, control.Y, to.X, to.Y))
        }

        private func AddCubic(contour SvgContour, from SvgPoint, c1 SvgPoint, c2 SvgPoint, to SvgPoint) {
            AddCubicRecursive(contour, from, c1, c2, to, 0)
        }

        private func AddCubicRecursive(
            contour SvgContour,
            p0 SvgPoint,
            p1 SvgPoint,
            p2 SvgPoint,
            p3 SvgPoint,
            depth int32
        ) {
            let control = SvgPoint(
                (float64(3.0) * (p1.X + p2.X) - p0.X - p3.X) / float64(4.0),
                (float64(3.0) * (p1.Y + p2.Y) - p0.Y - p3.Y) / float64(4.0)
            )
            let deltaX = p3.X - float64(3.0) * p2.X + float64(3.0) * p1.X - p0.X
            let deltaY = p3.Y - float64(3.0) * p2.Y + float64(3.0) * p1.Y - p0.Y
            let error = Math.Sqrt(deltaX * deltaX + deltaY * deltaY) * Math.Sqrt(3.0) / float64(36.0)
            if !control.IsFinite || !float64.IsFinite(error) {
                throw SvgParseException("cubic curve contains non-finite geometry")
            }
            if error <= QuadraticTolerance || depth >= 10 {
                AddQuadratic(contour, p0, control, p3)
                return
            }
            let p01 = Midpoint(p0, p1)
            let p12 = Midpoint(p1, p2)
            let p23 = Midpoint(p2, p3)
            let p012 = Midpoint(p01, p12)
            let p123 = Midpoint(p12, p23)
            let middle = Midpoint(p012, p123)
            AddCubicRecursive(contour, p0, p01, p012, middle, depth + 1)
            AddCubicRecursive(contour, middle, p123, p23, p3, depth + 1)
        }

        private func Midpoint(left SvgPoint, right SvgPoint) SvgPoint -> SvgPoint(
            (left.X + right.X) / float64(2.0),
            (left.Y + right.Y) / float64(2.0)
        )

        private func LocalName(element XElement) string -> element.Name.LocalName

        private func RequireName(element XElement, name string) {
            if !LocalName(element).Equals(name, StringComparison.Ordinal) {
                throw Fail(element, "root must be '$name'")
            }
        }

        private func ValidateNamespace(element XElement) {
            if element.Name.Namespace != XNamespace.None && element.Name.Namespace != "http://www.w3.org/2000/svg" {
                throw Fail(element, "only the SVG namespace is supported")
            }
        }

        internal func Fail(element XElement, message string) SvgParseException {
            let info = cast[IXmlLineInfo](element)
            return if info.HasLineInfo() {
                SvgParseException("line ${info.LineNumber}, column ${info.LinePosition}: $message")
            } else {
                SvgParseException(message)
            }
        }

        private let NamedColors IReadOnlyDictionary[string, SvgColor] = Dictionary[string, SvgColor](
            StringComparer.OrdinalIgnoreCase
        ){
            ["black"] = SvgColor(0, 0, 0, 255),
            ["white"] = SvgColor(255, 255, 255, 255),
            ["red"] = SvgColor(255, 0, 0, 255),
            ["green"] = SvgColor(0, 128, 0, 255),
            ["blue"] = SvgColor(0, 0, 255, 255),
            ["yellow"] = SvgColor(255, 255, 0, 255),
            ["cyan"] = SvgColor(0, 255, 255, 255),
            ["aqua"] = SvgColor(0, 255, 255, 255),
            ["magenta"] = SvgColor(255, 0, 255, 255),
            ["fuchsia"] = SvgColor(255, 0, 255, 255),
            ["gray"] = SvgColor(128, 128, 128, 255),
            ["grey"] = SvgColor(128, 128, 128, 255),
            ["transparent"] = SvgColor(0, 0, 0, 0)
        }
        private const MissingIndex uint32 = uint32.MaxValue
    }
}
