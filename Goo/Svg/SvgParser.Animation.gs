package Goo.Svg

import System
import System.Collections.Generic
import System.Globalization
import System.Linq
import System.Xml.Linq

internal partial class SvgParser {
    private func ParseAnimation(element XElement, node SvgNode) {
        let name = LocalName(element)
        let transform = name == "animateTransform"
        let attributeName = (
            string?(element.Attribute("attributeName")) ??
                (
                if transform {
                    "transform"
                } else {
                    ""
                }
            )
        )
            .Trim().ToLowerInvariant()
        if transform && attributeName != "transform" {
            throw Fail(element, "animateTransform must target transform")
        }
        if !transform && attributeName.Length == 0 {
            throw Fail(element, "animate requires attributeName")
        }
        if attributeName == "transform" && !transform {
            throw Fail(element, "transform animation requires animateTransform")
        }
        if name == "animateTransform" {
            let type = (string?(element.Attribute("type")) ?? "").Trim().ToLowerInvariant()
            if type is not("matrix" or "translate" or "scale" or "rotate" or "skewx" or "skewy") {
                throw Fail(element, "animateTransform type is not supported")
            }
            let transformAnimation = BuildAnimation(element, SvgAnimationKind.Transform, type, nil, nil)
            if node.TransformAnimation != nil {
                throw Fail(element, "a node cannot have multiple transform animations")
            }
            node.TransformAnimation = transformAnimation
            return
        }
        if (attributeName is "d" or "path") {
            guard let shape = node.Shape else {
                throw Fail(element, "path morph animation requires a path shape")
            }
            if !shape.IsPath {
                throw Fail(element, "path morph animation requires a path shape")
            }
            if node.MorphAnimation != nil {
                throw Fail(element, "a node cannot have multiple path morph animations")
            }
            node.MorphAnimation = BuildAnimation(
                element,
                SvgAnimationKind.Morph,
                attributeName,
                shape.Stroke,
                shape.Path
            )
            return
        }
        let kind = switch attributeName {
            case "opacity": SvgAnimationKind.Opacity
            case "fill" or "stroke": SvgAnimationKind.Color
            case "stroke-width" or
                "stroke-miterlimit" or
                "stroke-linecap" or
                "stroke-linejoin" or
                "stroke-dashoffset": SvgAnimationKind.Stroke
            case "fill-opacity" or
                "stroke-opacity" or
                "stroke-dasharray": throw Fail(element, "$attributeName animation is not supported")
            default: throw Fail(element, "attribute '$attributeName' is not in the controlled animation subset")
        }
        let animation = BuildAnimation(element, kind, attributeName, node.Shape?.Stroke, nil)
        if kind == SvgAnimationKind.Opacity {
            if node.OpacityAnimation != nil {
                throw Fail(element, "a node cannot have multiple opacity animations")
            }
            node.OpacityAnimation = animation
            return
        }
        let shape = node.Shape ?? throw Fail(element, "attribute '$attributeName' requires a shape node")
        if kind == SvgAnimationKind.Color {
            let paint = (
                if attributeName == "fill" {
                    shape.Fill
                } else {
                    shape.Stroke?.Paint
                }
            ) ??
                throw Fail(element, "attribute '$attributeName' has no static paint to animate")
            if paint.Kind != SvgPaintKind.Solid {
                throw Fail(element, "attribute '$attributeName' animation requires a solid paint")
            }
            if paint.Animation != nil {
                throw Fail(element, "a paint cannot have multiple color animations")
            }
            for keyframe in animation.Keyframes {
                keyframe.D *= paint.Opacity
            }
            paint.Animation = animation
            return
        }
        let stroke = shape.Stroke ?? throw Fail(element, "attribute '$attributeName' requires a stroke")
        if stroke.Animation != nil {
            throw Fail(element, "a stroke cannot have multiple property animations")
        }
        stroke.Animation = animation
    }

    private func BuildAnimation(
        element XElement,
        kind SvgAnimationKind,
        attribute string,
        baseStroke SvgStroke?,
        basePath SvgPath?
    ) SvgAnimation {
        ValidateAnimationPolicy(element)
        let duration = ParseDuration(string?(element.Attribute("dur")) ?? "", element)
        let repeat = ReadRepeatCount(element)
        if reservedAnimationTracks >= MaxAnimationTracks {
            throw Fail(element, "animation track limit exceeded")
        }
        let rawValues = ReadAnimationValues(
            element,
            (MaxAnimationKeyframes - reservedAnimationKeyframes) / repeat.Count
        )
        if rawValues.Count < 2 {
            throw Fail(element, "animation requires at least two values")
        }
        let expandedCount = checked(int64(rawValues.Count) * int64(repeat.Count))
        if reservedAnimationTracks >= MaxAnimationTracks ||
            expandedCount > int64(MaxAnimationKeyframes - reservedAnimationKeyframes) {
            throw Fail(element, "animation track limit exceeded")
        }
        reservedAnimationTracks++
        reservedAnimationKeyframes += checked(int32(expandedCount))
        if kind == SvgAnimationKind.Morph && basePath != nil {
            let curveCount = basePath.Contours.Sum((contour SvgContour) -> int64(contour.Curves.Count))
            let expandedCurves = checked(curveCount * expandedCount)
            if expandedCurves > int64(MaxMorphCurves) - reservedMorphCurves {
                throw Fail(element, "morph curve limit exceeded")
            }
            reservedMorphCurves += expandedCurves
        }
        let values = List[SvgAnimationKeyframe]()
        for raw in rawValues {
            values.Add(ParseAnimationValue(raw, kind, attribute, element, baseStroke, basePath))
        }
        let times = ReadKeyTimes(element, values.Count)
        let calcMode = (string?(element.Attribute("calcMode")) ?? "linear").Trim().ToLowerInvariant()
        if calcMode is not("linear" or "discrete" or "spline") {
            throw Fail(element, "calcMode '$calcMode' is not supported")
        }
        let splines = ReadKeySplines(element, calcMode, values.Count)
        let keyframes = List[SvgAnimationKeyframe](values.Count)
        for index in 0 ... values.Count {
            let source = values[index]
            let easing = switch calcMode {
                case "discrete" when index < values.Count - 1: 1u
                case "spline" when index < values.Count - 1: 2u
                default: 0u
            }
            let spline = if index < splines.Count {
                splines[index]
            } else {
                (0.0, 0.0, 0.0, 0.0)
            }
            keyframes.Add(
                SvgAnimationKeyframe{
                    Time: times[index] * duration,
                    A: source.A,
                    B: source.B,
                    C: source.C,
                    D: source.D,
                    E: source.E,
                    F: source.F,
                    Easing: easing,
                    ControlA: spline.Item1,
                    ControlB: spline.Item2,
                    ControlC: spline.Item3,
                    ControlD: spline.Item4,
                    MorphCurves: source.MorphCurves
                }
            )
        }
        if repeat.Indefinite {
            return WithKeyframes(SvgAnimation{Kind: kind, Duration: duration, Flags: 1u}, keyframes)
        }
        let repeated = List[SvgAnimationKeyframe](checked(keyframes.Count * repeat.Count))
        for cycle in 0 ... repeat.Count {
            for keyframe in keyframes {
                repeated.Add(
                    SvgAnimationKeyframe{
                        Time: keyframe.Time + float64(cycle) * duration,
                        A: keyframe.A,
                        B: keyframe.B,
                        C: keyframe.C,
                        D: keyframe.D,
                        E: keyframe.E,
                        F: keyframe.F,
                        Easing: keyframe.Easing,
                        ControlA: keyframe.ControlA,
                        ControlB: keyframe.ControlB,
                        ControlC: keyframe.ControlC,
                        ControlD: keyframe.ControlD,
                        MorphCurves: keyframe.MorphCurves
                    }
                )
            }
        }
        return WithKeyframes(SvgAnimation{Kind: kind, Duration: duration * float64(repeat.Count), Flags: 0u}, repeated)
    }

    shared {
        private func IsAnimationElement(element XElement) bool -> (
            LocalName(element) is "animate" or "animateTransform"
        )

        private func WithKeyframes(animation SvgAnimation, keyframes IEnumerable[SvgAnimationKeyframe]) SvgAnimation {
            animation.Keyframes.AddRange(keyframes)
            return animation
        }

        private func ValidateAnimationPolicy(element XElement) {
            let begin string? = string?(element.Attribute("begin"))
            if begin != nil && begin.Trim() is not("0" or "0s" or "0ms") {
                throw Fail(element, "event-driven or delayed animation begin values are not supported")
            }
            let attributeType = (string?(element.Attribute("attributeType")) ?? "auto").Trim().ToLowerInvariant()
            if attributeType is not("auto" or "xml") {
                throw Fail(element, "CSS animation attributeType is not supported")
            }
            let additive = (string?(element.Attribute("additive")) ?? "replace").Trim().ToLowerInvariant()
            if additive != "replace" {
                throw Fail(element, "additive animation is not supported")
            }
            let accumulate = (string?(element.Attribute("accumulate")) ?? "none").Trim().ToLowerInvariant()
            if accumulate != "none" {
                throw Fail(element, "accumulate animation is not supported")
            }
            let restart = (string?(element.Attribute("restart")) ?? "always").Trim().ToLowerInvariant()
            if restart != "always" {
                throw Fail(element, "restart animation values other than always are not supported")
            }
            let fill = (string?(element.Attribute("fill")) ?? "remove").Trim().ToLowerInvariant()
            if fill != "freeze" {
                throw Fail(element, "animation requires fill='freeze'")
            }
            if element.Attribute("end") != nil || element.Attribute("repeatDur") != nil || element.Attribute(
                "min"
            ) != nil ||
                element.Attribute("max") != nil {
                throw Fail(element, "event-driven or duration-bounded SMIL timing is not supported")
            }
        }

        private func ReadAnimationValues(element XElement, limit int32) List[string] {
            if let values = string?(element.Attribute("values")) {
                if element.Attribute("from") != nil || element.Attribute("to") != nil || element.Attribute(
                    "by"
                ) != nil {
                    throw Fail(element, "values cannot be combined with from, to, or by")
                }
                var count = 0
                var inValue = false
                for character in values {
                    if character == ';' {
                        inValue = false
                    } else if !inValue && !char.IsWhiteSpace(character) {
                        count++
                        if count > limit {
                            throw Fail(element, "animation track limit exceeded")
                        }
                        inValue = true
                    }
                }
                return values
                    .Split(';', StringSplitOptions.TrimEntries)
                    .Where((value string) -> value.Length != 0)
                    .ToList()
            }
            let from string? = string?(element.Attribute("from"))
            let to string? = string?(element.Attribute("to"))
            if from != nil && to != nil && element.Attribute("by") == nil {
                return List[string]{from.Trim(), to.Trim()}
            }
            throw Fail(element, "controlled animation requires values or both from and to")
        }

        private func ReadKeyTimes(element XElement, count int32) List[float64] {
            guard let raw = string?(element.Attribute("keyTimes")) else {
                let result = List[float64](count)
                for index in 0 ... count {
                    result.Add(float64(index) / float64((count - 1)))
                }
                return result
            }
            let values = raw
                .Split(';', StringSplitOptions.TrimEntries)
                .Where((value string) -> value.Length != 0)
                .Select((value string) -> ParseLooseNumber(value, element, "keyTimes"))
                .ToList()
            if values.Count != count || values.Count < 2 || values[0] != 0.0 || values[^1] != 1.0 {
                throw Fail(element, "keyTimes must match values and span zero to one")
            }
            for index in 1 ... values.Count {
                if values[index] < values[index - 1] || values[index] < 0.0 || values[index] > 1.0 {
                    throw Fail(element, "keyTimes must be ordered values between zero and one")
                }
            }
            return values
        }

        private func ReadKeySplines(element XElement, calcMode string, valueCount int32) List[
            (float64, float64, float64, float64)
        ] {
            let raw string? = string?(element.Attribute("keySplines"))
            if calcMode == "spline" && raw == nil {
                throw Fail(element, "calcMode='spline' requires keySplines")
            }
            if raw == nil {
                return List[(float64, float64, float64, float64)]()
            }
            if calcMode != "spline" {
                throw Fail(element, "keySplines requires calcMode='spline'")
            }
            let result = List[(float64, float64, float64, float64)]()
            for part in raw.Split(';', StringSplitOptions.TrimEntries) {
                let values = ParseNumberList(part, element, "keySplines")
                if values.Count != 4 || values.Any((value float64) -> value < 0.0 || value > 1.0) {
                    throw Fail(element, "each keySpline requires four values between zero and one")
                }
                result.Add((values[0], values[1], values[2], values[3]))
            }
            if result.Count != valueCount - 1 {
                throw Fail(element, "keySplines must contain one cubic for each keyframe segment")
            }
            return result
        }

        private func ReadRepeatCount(element XElement)(Indefinite bool, Count int32) {
            let raw = (string?(element.Attribute("repeatCount")) ?? "1").Trim().ToLowerInvariant()
            if raw == "indefinite" {
                return (true, 1)
            }
            if !float64.TryParse(raw, NumberStyles.Float, CultureInfo.InvariantCulture, out var value) ||
                !float64.IsFinite(value) || value < 1.0 || value > 64.0 || Math.Truncate(value) != value {
                throw Fail(element, "repeatCount must be indefinite or an integer from one to 64")
            }
            return (false, int32(value))
        }

        private func ParseDuration(value string, owner XElement) float64 {
            let text = value.Trim().ToLowerInvariant()
            if text.Length == 0 || text == "indefinite" {
                throw Fail(owner, "animation dur must be a finite positive time")
            }
            let multiplier = if text.EndsWith("ms", StringComparison.Ordinal) {
                0.001
            } else {
                1.0
            }
            let numberText = switch text {
                case _ when text.EndsWith("ms", StringComparison.Ordinal): text[.. ^2]
                case _ when text.EndsWith('s'): text[.. ^1]
                default: text
            }
            if !float64.TryParse(numberText, NumberStyles.Float, CultureInfo.InvariantCulture, out var result) ||
                !float64.IsFinite(result) || result <= 0.0 {
                throw Fail(owner, "animation dur must be a finite positive time")
            }
            return result * multiplier
        }

        private func ParseAnimationValue(
            raw string,
            kind SvgAnimationKind,
            attribute string,
            owner XElement,
            baseStroke SvgStroke?,
            basePath SvgPath?
        ) SvgAnimationKeyframe -> switch kind {
            case SvgAnimationKind.Transform: MatrixValue(ParseTransformValue(raw, attribute, owner))
            case SvgAnimationKind.Opacity: SvgAnimationKeyframe{A: ParseOpacity(raw, owner, "opacity")}
            case SvgAnimationKind.Color: ColorValue(ParseColor(raw, owner))
            case SvgAnimationKind.Stroke: StrokeValue(
                raw,
                attribute,
                owner,
                baseStroke ?? throw Fail(owner, "stroke animation has no base stroke")
            )
            case SvgAnimationKind.Morph: MorphValue(
                raw,
                owner,
                basePath ?? throw Fail(owner, "path morph animation has no base path")
            )
            default: throw Fail(owner, "unknown animation kind")
        }

        private func MorphValue(raw string, owner XElement, basePath SvgPath) SvgAnimationKeyframe {
            let target = SvgPathParser.Parse(raw, owner)
            ValidateMorphTopology(basePath, target, owner)
            return SvgAnimationKeyframe{
                MorphCurves: target.Contours.SelectMany((contour SvgContour) -> contour.Curves).ToList(),
            }
        }

        private func ValidateMorphTopology(basePath SvgPath, target SvgPath, owner XElement) {
            if basePath.Contours.Count != target.Contours.Count {
                throw Fail(owner, "path morph target contour count does not match the base path")
            }
            for contourIndex in 0 ... basePath.Contours.Count {
                let baseContour = basePath.Contours[contourIndex]
                let targetContour = target.Contours[contourIndex]
                if baseContour.Closed != targetContour.Closed {
                    throw Fail(
                        owner,
                        "path morph target contour $contourIndex closed state does not match the base path"
                    )
                }
                if baseContour.Curves.Count != targetContour.Curves.Count {
                    throw Fail(
                        owner,
                        "path morph target contour $contourIndex curve count does not match the base path"
                    )
                }
                ValidateContourConnectivity(baseContour, owner, contourIndex)
                ValidateContourConnectivity(targetContour, owner, contourIndex)
            }
        }

        private func ValidateContourConnectivity(contour SvgContour, owner XElement, contourIndex int32) {
            if contour.Curves.Count == 0 {
                throw Fail(owner, "path morph target contour $contourIndex has no curves")
            }
            for curveIndex in 1 ... contour.Curves.Count {
                let previous = contour.Curves[curveIndex - 1]
                let current = contour.Curves[curveIndex]
                if current.X0 != previous.X1 || current.Y0 != previous.Y1 {
                    throw Fail(owner, "path morph target contour $contourIndex has disconnected curves")
                }
            }
            if contour.Closed {
                let first = contour.Curves[0]
                let last = contour.Curves[^1]
                if last.X1 != first.X0 || last.Y1 != first.Y0 {
                    throw Fail(owner, "path morph target contour $contourIndex closed endpoint does not match")
                }
            }
        }

        private func MatrixValue(matrix SvgMatrix) SvgAnimationKeyframe -> SvgAnimationKeyframe{
            A: matrix.A,
            B: matrix.C,
            C: matrix.B,
            D: matrix.D,
            E: matrix.E,
            F: matrix.F
        }

        private func ColorValue(color SvgColor) SvgAnimationKeyframe -> SvgAnimationKeyframe{
            A: float64(color.R) / 255.0,
            B: float64(color.G) / 255.0,
            C: float64(color.B) / 255.0,
            D: float64(color.A) / 255.0
        }

        private func StrokeValue(
            raw string,
            attribute string,
            owner XElement,
            baseStroke SvgStroke
        ) SvgAnimationKeyframe {
            var width = baseStroke.Width
            var miter = baseStroke.MiterLimit
            var cap = baseStroke.Cap
            var join = baseStroke.Join
            var dashOffset = baseStroke.DashOffset
            switch attribute {
                case "stroke-width" {
                    width = ParseLength(raw, 0.0, owner, attribute)
                    if width < 0.0 {
                        throw Fail(owner, "stroke-width cannot be negative")
                    }
                }
                case "stroke-miterlimit" {
                    miter = ParseLooseNumber(raw, owner, attribute)
                    if miter < 1.0 {
                        throw Fail(owner, "stroke-miterlimit must be at least one")
                    }
                }
                case "stroke-linecap" {
                    cap = ParseCap(raw, owner)
                }
                case "stroke-linejoin" {
                    join = ParseJoin(raw, owner)
                }
                case "stroke-dashoffset" {
                    dashOffset = ParseLength(raw, 0.0, owner, attribute)
                }
                default {
                    throw Fail(owner, "stroke property '$attribute' is not supported")
                }
            }
            return SvgAnimationKeyframe{A: width, B: miter, C: cap, D: join, E: dashOffset, F: 0.0}
        }

        private func ParseCap(value string, owner XElement) uint32 -> switch value.Trim().ToLowerInvariant() {
            case "butt": 0u
            case "round": 1u
            case "square": 2u
            default: throw Fail(owner, "stroke-linecap '$value' is not supported")
        }

        private func ParseJoin(value string, owner XElement) uint32 -> switch value.Trim().ToLowerInvariant() {
            case "miter": 0u
            case "round": 1u
            case "bevel": 2u
            default: throw Fail(owner, "stroke-linejoin '$value' is not supported")
        }

        private func ParseTransformValue(value string, type string, owner XElement) SvgMatrix {
            let values = ParseNumberList(value, owner, "animateTransform value")
            return switch type {
                case "matrix" when values.Count == 6: SvgMatrix(
                    values[0],
                    values[1],
                    values[2],
                    values[3],
                    values[4],
                    values[5]
                )
                case "translate" when(values.Count is 1 or 2): SvgMatrix(
                    1.0,
                    0.0,
                    0.0,
                    1.0,
                    values[0],
                    if values.Count == 2 {
                        values[1]
                    } else {
                        0.0
                    }
                )
                case "scale" when(values.Count is 1 or 2): SvgMatrix(
                    values[0],
                    0.0,
                    0.0,
                    if values.Count == 2 {
                        values[1]
                    } else {
                        values[0]
                    },
                    0.0,
                    0.0
                )
                case "rotate" when(values.Count is 1 or 3): RotateValue(values)
                case "skewx" when values.Count == 1: SvgMatrix(
                    1.0,
                    0.0,
                    Math.Tan(values[0] * Math.PI / 180.0),
                    1.0,
                    0.0,
                    0.0
                )
                case "skewy" when values.Count == 1: SvgMatrix(
                    1.0,
                    Math.Tan(values[0] * Math.PI / 180.0),
                    0.0,
                    1.0,
                    0.0,
                    0.0
                )
                default: throw Fail(owner, "animateTransform $type value has invalid arguments")
            }
        }

        private func RotateValue(values IReadOnlyList[float64]) SvgMatrix {
            let radians = values[0] * Math.PI / 180.0
            let rotation = SvgMatrix(
                Math.Cos(radians),
                Math.Sin(radians),
                -Math.Sin(radians),
                Math.Cos(radians),
                0.0,
                0.0
            )
            if values.Count == 1 {
                return rotation
            }
            return SvgMatrix(1.0, 0.0, 0.0, 1.0, values[1], values[2]) * rotation * SvgMatrix(
                1.0,
                0.0,
                0.0,
                1.0,
                -values[1],
                -values[2]
            )
        }
    }
}
