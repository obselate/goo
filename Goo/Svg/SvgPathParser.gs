package Goo.Svg

import System
import System.Globalization
import System.Xml.Linq

internal class SvgPathParser {
    shared {
        private const MaxCurves int32 = 262144

        internal func Parse(value string, owner XElement) SvgPath {
            let scanner = PathScanner(value, owner)
            let path = SvgPath()
            var curveCount = 0
            var contour SvgContour? = nil
            var current = SvgPoint(0.0, 0.0)
            var start = current
            var previousCommand = '\u0000'
            var previousCubicControl = current
            var previousQuadraticControl = current
            var hasPreviousCubic = false
            var hasPreviousQuadratic = false
            var command = '\u0000'
            while scanner.TryReadCommandOrNumber(out var token, out var tokenIsCommand) {
                if tokenIsCommand {
                    command = token
                    if command is 'z' or 'Z' {
                        if contour != nil {
                            if !Same(current, start) {
                                AddLine(contour, current, start, &curveCount)
                            }
                            contour.Closed = true
                            current = start
                        }
                        previousCommand = command
                        hasPreviousCubic = false
                        hasPreviousQuadratic = false
                        continue
                    }
                    if command is not(
                        'm' or
                            'M' or
                            'l' or
                            'L' or
                            'h' or
                            'H' or
                            'v' or
                            'V' or
                            'c' or
                            'C' or
                            's' or
                            'S' or
                            'q' or
                            'Q' or
                            't' or
                            'T' or
                            'a' or
                            'A'
                    ) {
                        throw SvgParser.Fail(owner, "path command '$command' is not supported")
                    }
                } else if command == '\u0000' {
                    throw SvgParser.Fail(owner, "path data must start with a command")
                } else if !tokenIsCommand && command is 'z' or 'Z' {
                    throw SvgParser.Fail(owner, "path data cannot continue after close without a command")
                }
                switch command {
                    case 'm', 'M' {
                        let point = ReadPoint(scanner, owner, command == 'm', current)
                        if contour != nil && contour.Curves.Count != 0 {
                            path.Contours.Add(contour)
                        }
                        contour = SvgContour()
                        current = point
                        start = point
                        previousCommand = command
                        hasPreviousCubic = false
                        hasPreviousQuadratic = false
                        command = if command == 'm' {
                            'l'
                        } else {
                            'L'
                        }
                    }
                    case 'l', 'L' {
                        EnsureContour(&contour, current)
                        let point = ReadPoint(scanner, owner, command == 'l', current)
                        AddLine(contour!!, current, point, &curveCount)
                        current = point
                        previousCommand = command
                        hasPreviousCubic = false
                        hasPreviousQuadratic = false
                    }
                    case 'h', 'H' {
                        EnsureContour(&contour, current)
                        let x = scanner.ReadNumber()
                        let point = SvgPoint(
                            if command == 'h' {
                                current.X + x
                            } else {
                                x
                            },
                            current.Y
                        )
                        AddLine(contour!!, current, point, &curveCount)
                        current = point
                        previousCommand = command
                        hasPreviousCubic = false
                        hasPreviousQuadratic = false
                    }
                    case 'v', 'V' {
                        EnsureContour(&contour, current)
                        let y = scanner.ReadNumber()
                        let point = SvgPoint(
                            current.X,
                            if command == 'v' {
                                current.Y + y
                            } else {
                                y
                            }
                        )
                        AddLine(contour!!, current, point, &curveCount)
                        current = point
                        previousCommand = command
                        hasPreviousCubic = false
                        hasPreviousQuadratic = false
                    }
                    case 'c', 'C' {
                        EnsureContour(&contour, current)
                        let first = ReadPoint(scanner, owner, command == 'c', current)
                        let second = ReadPoint(scanner, owner, command == 'c', current)
                        let end = ReadPoint(scanner, owner, command == 'c', current)
                        AddCubic(contour!!, current, first, second, end, &curveCount)
                        current = end
                        previousCubicControl = second
                        hasPreviousCubic = true
                        hasPreviousQuadratic = false
                        previousCommand = command
                    }
                    case 's', 'S' {
                        EnsureContour(&contour, current)
                        let first = if hasPreviousCubic && previousCommand is 'c' or 'C' or 's' or 'S' {
                            Reflect(previousCubicControl, current)
                        } else {
                            current
                        }
                        let second = ReadPoint(scanner, owner, command == 's', current)
                        let end = ReadPoint(scanner, owner, command == 's', current)
                        AddCubic(contour!!, current, first, second, end, &curveCount)
                        current = end
                        previousCubicControl = second
                        hasPreviousCubic = true
                        hasPreviousQuadratic = false
                        previousCommand = command
                    }
                    case 'q', 'Q' {
                        EnsureContour(&contour, current)
                        let control = ReadPoint(scanner, owner, command == 'q', current)
                        let end = ReadPoint(scanner, owner, command == 'q', current)
                        AddQuadratic(contour!!, current, control, end, &curveCount)
                        current = end
                        previousQuadraticControl = control
                        hasPreviousQuadratic = true
                        hasPreviousCubic = false
                        previousCommand = command
                    }
                    case 't', 'T' {
                        EnsureContour(&contour, current)
                        let control = if hasPreviousQuadratic && previousCommand is 'q' or 'Q' or 't' or 'T' {
                            Reflect(previousQuadraticControl, current)
                        } else {
                            current
                        }
                        let end = ReadPoint(scanner, owner, command == 't', current)
                        AddQuadratic(contour!!, current, control, end, &curveCount)
                        current = end
                        previousQuadraticControl = control
                        hasPreviousQuadratic = true
                        hasPreviousCubic = false
                        previousCommand = command
                    }
                    case 'a', 'A' {
                        EnsureContour(&contour, current)
                        let rx = scanner.ReadNumber()
                        let ry = scanner.ReadNumber()
                        let rotation = scanner.ReadNumber()
                        let largeArc = scanner.ReadNumber()
                        let sweep = scanner.ReadNumber()
                        let end = ReadPoint(scanner, owner, command == 'a', current)
                        if largeArc is not(0.0 or 1.0) || sweep is not(0.0 or 1.0) {
                            throw SvgParser.Fail(owner, "arc flags must be zero or one")
                        }
                        AddArc(
                            contour!!,
                            current,
                            Math.Abs(rx),
                            Math.Abs(ry),
                            rotation,
                            largeArc != 0.0,
                            sweep != 0.0,
                            end,
                            &curveCount
                        )
                        current = end
                        hasPreviousCubic = false
                        hasPreviousQuadratic = false
                        previousCommand = command
                    }
                }
            }
            if contour != nil && contour.Curves.Count != 0 {
                path.Contours.Add(contour)
            }
            if path.Contours.Count == 0 {
                throw SvgParser.Fail(owner, "path contains no geometry")
            }
            return path
        }

        private func ReadPoint(scanner PathScanner, owner XElement, relative bool, current SvgPoint) SvgPoint {
            let x = scanner.ReadNumber()
            let y = scanner.ReadNumber()
            let point = SvgPoint(x, y)
            let result = if relative {
                SvgPoint(current.X + point.X, current.Y + point.Y)
            } else {
                point
            }
            if !result.IsFinite {
                throw SvgParser.Fail(owner, "path coordinate is not finite")
            }
            return result
        }

        private func EnsureContour(ref contour SvgContour?, current SvgPoint) {
            contour ??= SvgContour()
        }

        private func Reflect(point SvgPoint, around SvgPoint) SvgPoint -> SvgPoint(
            2.0 * around.X - point.X,
            2.0 * around.Y - point.Y
        )

        private func Same(left SvgPoint, right SvgPoint) bool -> left.X == right.X && left.Y == right.Y

        private func AddLine(contour SvgContour, from SvgPoint, to SvgPoint, ref curveCount int32) {
            AddCurve(
                contour,
                SvgQuadratic(from.X, from.Y, (from.X + to.X) / 2.0, (from.Y + to.Y) / 2.0, to.X, to.Y),
                &curveCount
            )
        }

        private func AddQuadratic(
            contour SvgContour,
            from SvgPoint,
            control SvgPoint,
            to SvgPoint,
            ref curveCount int32
        ) {
            AddCurve(contour, SvgQuadratic(from.X, from.Y, control.X, control.Y, to.X, to.Y), &curveCount)
        }

        private func AddCubic(
            contour SvgContour,
            from SvgPoint,
            first SvgPoint,
            second SvgPoint,
            to SvgPoint,
            ref curveCount int32
        ) {
            AddCubicRecursive(contour, from, first, second, to, 0, &curveCount)
        }

        private func AddCubicRecursive(
            contour SvgContour,
            p0 SvgPoint,
            p1 SvgPoint,
            p2 SvgPoint,
            p3 SvgPoint,
            depth int32,
            ref curveCount int32
        ) {
            let control = SvgPoint((3.0 * (p1.X + p2.X) - p0.X - p3.X) / 4.0, (3.0 * (p1.Y + p2.Y) - p0.Y - p3.Y) / 4.0)
            let deltaX = p3.X - 3.0 * p2.X + 3.0 * p1.X - p0.X
            let deltaY = p3.Y - 3.0 * p2.Y + 3.0 * p1.Y - p0.Y
            let error = Math.Sqrt(deltaX * deltaX + deltaY * deltaY) * Math.Sqrt(3.0) / 36.0
            if !control.IsFinite || !float64.IsFinite(error) {
                throw SvgParseException("path cubic contains non-finite geometry")
            }
            if error <= 0.0001 || depth >= 10 {
                AddQuadratic(contour, p0, control, p3, &curveCount)
                return
            }
            let p01 = Midpoint(p0, p1)
            let p12 = Midpoint(p1, p2)
            let p23 = Midpoint(p2, p3)
            let p012 = Midpoint(p01, p12)
            let p123 = Midpoint(p12, p23)
            let middle = Midpoint(p012, p123)
            AddCubicRecursive(contour, p0, p01, p012, middle, depth + 1, &curveCount)
            AddCubicRecursive(contour, middle, p123, p23, p3, depth + 1, &curveCount)
        }

        private func AddCurve(contour SvgContour, curve SvgQuadratic, ref curveCount int32) {
            if !float64.IsFinite(curve.X0) || !float64.IsFinite(curve.Y0) || !float64.IsFinite(curve.CX) ||
                !float64.IsFinite(curve.CY) || !float64.IsFinite(curve.X1) || !float64.IsFinite(curve.Y1) {
                throw SvgParseException("path contains non-finite geometry")
            }
            if curveCount >= MaxCurves {
                throw SvgParseException("path curve count exceeds $MaxCurves")
            }
            contour.Curves.Add(curve)
            curveCount++
        }

        private func Midpoint(left SvgPoint, right SvgPoint) SvgPoint -> SvgPoint(
            (left.X + right.X) / 2.0,
            (left.Y + right.Y) / 2.0
        )

        private func AddArc(
            contour SvgContour,
            from SvgPoint,
            radiusX float64,
            radiusY float64,
            rotation float64,
            largeArc bool,
            sweep bool,
            to SvgPoint,
            ref curveCount int32
        ) {
            var radiusX = radiusX
            var radiusY = radiusY
            if Same(from, to) {
                return
            }
            if radiusX == 0.0 || radiusY == 0.0 {
                AddLine(contour, from, to, &curveCount)
                return
            }
            let angle = rotation * Math.PI / 180.0
            let cosine = Math.Cos(angle)
            let sine = Math.Sin(angle)
            let dx = (from.X - to.X) / 2.0
            let dy = (from.Y - to.Y) / 2.0
            let xPrime = cosine * dx + sine * dy
            let yPrime = -sine * dx + cosine * dy
            let lambda = xPrime * xPrime / (radiusX * radiusX) + yPrime * yPrime / (radiusY * radiusY)
            if lambda > 1.0 {
                let scale = Math.Sqrt(lambda)
                radiusX *= scale
                radiusY *= scale
            }
            let sign = if largeArc == sweep {
                -1
            } else {
                1
            }
            let numerator = Math.Max(
                0.0,
                (radiusX * radiusX * radiusY * radiusY) - (radiusX * radiusX * yPrime * yPrime) - (
                    radiusY * radiusY * xPrime * xPrime
                )
            )
            let denominator = radiusX * radiusX * yPrime * yPrime + radiusY * radiusY * xPrime * xPrime
            let coefficient = if denominator == 0.0 {
                0.0
            } else {
                float64(sign) * Math.Sqrt(numerator / denominator)
            }
            let centerPrimeX = coefficient * radiusX * yPrime / radiusY
            let centerPrimeY = coefficient * -radiusY * xPrime / radiusX
            let centerX = cosine * centerPrimeX - sine * centerPrimeY + (from.X + to.X) / 2.0
            let centerY = sine * centerPrimeX + cosine * centerPrimeY + (from.Y + to.Y) / 2.0
            let startAngle = VectorAngle(
                SvgPoint(1.0, 0.0),
                SvgPoint((xPrime - centerPrimeX) / radiusX, (yPrime - centerPrimeY) / radiusY)
            )
            var deltaAngle = VectorAngle(
                SvgPoint((xPrime - centerPrimeX) / radiusX, (yPrime - centerPrimeY) / radiusY),
                SvgPoint((-xPrime - centerPrimeX) / radiusX, (-yPrime - centerPrimeY) / radiusY)
            )
            if !sweep && deltaAngle > 0.0 {
                deltaAngle -= 2.0 * Math.PI
            }
            if sweep && deltaAngle < 0.0 {
                deltaAngle += 2.0 * Math.PI
            }
            let segments = Math.Max(1, int32(Math.Ceiling(Math.Abs(deltaAngle) / (Math.PI / 2.0))))
            let segmentAngle = deltaAngle / float64(segments)
            var currentAngle = startAngle
            for var index = 0; index < segments; index++ {
                let nextAngle = currentAngle + segmentAngle
                let tangent = 4.0 / 3.0 * Math.Tan((nextAngle - currentAngle) / 4.0)
                let p0 = EllipsePoint(centerX, centerY, radiusX, radiusY, cosine, sine, currentAngle)
                let p3 = EllipsePoint(centerX, centerY, radiusX, radiusY, cosine, sine, nextAngle)
                let c1 = EllipsePoint(centerX, centerY, radiusX, radiusY, cosine, sine, currentAngle, tangent, true)
                let c2 = EllipsePoint(centerX, centerY, radiusX, radiusY, cosine, sine, nextAngle, tangent, false)
                AddCubic(contour, p0, c1, c2, p3, &curveCount)
                currentAngle = nextAngle
            }
        }

        private func EllipsePoint(
            cx float64,
            cy float64,
            rx float64,
            ry float64,
            cosine float64,
            sine float64,
            angle float64,
            tangent float64 = 0,
            firstControl bool = false
        ) SvgPoint {
            var x = rx * Math.Cos(angle)
            var y = ry * Math.Sin(angle)
            if tangent != 0.0 {
                if firstControl {
                    x += -tangent * rx * Math.Sin(angle)
                    y += tangent * ry * Math.Cos(angle)
                } else {
                    x -= -tangent * rx * Math.Sin(angle)
                    y -= tangent * ry * Math.Cos(angle)
                }
            }
            return SvgPoint(cx + cosine * x - sine * y, cy + sine * x + cosine * y)
        }

        private func VectorAngle(left SvgPoint, right SvgPoint) float64 -> Math.Atan2(
            left.X * right.Y - left.Y * right.X,
            left.X * right.X + left.Y * right.Y
        )
    }
}

internal class PathScanner {
    private let text string
    private let owner XElement
    private var index int32

    internal init(text string, owner XElement) {
        this.text = text
        this.owner = owner
    }

    internal func TryReadCommandOrNumber(out token char, out tokenIsCommand bool) bool {
        SkipSeparators()
        if index >= text.Length {
            token = '\u0000'
            tokenIsCommand = false
            return false
        }
        if char.IsLetter(text[index]) {
            token = text[index]
            index++
            tokenIsCommand = true
            return true
        }
        token = '\u0000'
        tokenIsCommand = false
        return true
    }

    internal func ReadNumber() float64 {
        SkipSeparators()
        let start = index
        if index < text.Length && (text[index] is '+' or '-') {
            index++
        }
        var digits = 0
        while index < text.Length && char.IsDigit(text[index]) {
            index++
            digits++
        }
        if index < text.Length && text[index] == '.' {
            index++
            while index < text.Length && char.IsDigit(text[index]) {
                index++
                digits++
            }
        }
        if digits == 0 {
            throw SvgParser.Fail(owner, "path contains an invalid number at offset $start")
        }
        if index < text.Length && (text[index] is 'e' or 'E') {
            index++
            if index < text.Length && (text[index] is '+' or '-') {
                index++
            }
            var exponentDigits = 0
            while index < text.Length && char.IsDigit(text[index]) {
                index++
                exponentDigits++
            }
            if exponentDigits == 0 {
                throw SvgParser.Fail(owner, "path contains an invalid exponent")
            }
        }
        if !float64.TryParse(text[start .. index], NumberStyles.Float, CultureInfo.InvariantCulture, out var result) ||
            !float64.IsFinite(result) {
            throw SvgParser.Fail(owner, "path contains a non-finite number")
        }
        return result
    }

    private func SkipSeparators() {
        while index < text.Length && (char.IsWhiteSpace(text[index]) || text[index] == ',') {
            index++
        }
    }
}
