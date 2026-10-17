package Goo.Svg

import System
import System.Xml.Linq

internal partial class SvgParser {
    private func ParseGeometry(element XElement) SvgPath -> switch LocalName(element) {
        case "path": SvgPathParser.Parse(
            string?(element.Attribute("d")) ?? throw Fail(element, "path requires d"),
            element
        )
        case "rect": ParseRect(element)
        case "circle": ParseEllipse(element, true)
        case "ellipse": ParseEllipse(element, false)
        case "line": ParseLine(element)
        case "polyline": ParsePoly(element, false)
        case "polygon": ParsePoly(element, true)
        default: throw Fail(element, "'${LocalName(element)}' is not geometry")
    }

    shared {
        private func ParseLine(element XElement) SvgPath {
            let x1 = ParseLength(string?(element.Attribute("x1")) ?? "0", 0.0, element, "x1")
            let y1 = ParseLength(string?(element.Attribute("y1")) ?? "0", 0.0, element, "y1")
            let x2 = ParseLength(string?(element.Attribute("x2")) ?? "0", 0.0, element, "x2")
            let y2 = ParseLength(string?(element.Attribute("y2")) ?? "0", 0.0, element, "y2")
            let path = SvgPath()
            let contour = SvgContour()
            AddLine(contour, SvgPoint(x1, y1), SvgPoint(x2, y2))
            path.Contours.Add(contour)
            return path
        }

        private func ParsePoly(element XElement, close bool) SvgPath {
            let values = ParseNumberList(string?(element.Attribute("points")) ?? "", element, "points")
            if values.Count < 4 || values.Count % 2 != 0 {
                throw Fail(element, "polyline and polygon points require pairs")
            }
            let path = SvgPath()
            let contour = SvgContour()
            let first = SvgPoint(values[0], values[1])
            var previous = first
            for var index = 2; index < values.Count; index += 2 {
                let next = SvgPoint(values[index], values[index + 1])
                AddLine(contour, previous, next)
                previous = next
            }
            if close {
                AddLine(contour, previous, first)
                contour.Closed = true
            }
            path.Contours.Add(contour)
            return path
        }

        private func ParseRect(element XElement) SvgPath {
            let x = ParseLength(string?(element.Attribute("x")) ?? "0", 0.0, element, "x")
            let y = ParseLength(string?(element.Attribute("y")) ?? "0", 0.0, element, "y")
            let width = ParseLength(string?(element.Attribute("width")) ?? "0", 0.0, element, "width")
            let height = ParseLength(string?(element.Attribute("height")) ?? "0", 0.0, element, "height")
            if width <= 0.0 || height <= 0.0 {
                throw Fail(element, "rect width and height must be positive")
            }
            var rx = ParseLength(string?(element.Attribute("rx")) ?? "0", 0.0, element, "rx")
            var ry = ParseLength(string?(element.Attribute("ry")) ?? "0", 0.0, element, "ry")
            if rx < 0.0 || ry < 0.0 {
                throw Fail(element, "rect corner radii cannot be negative")
            }
            if rx == 0.0 && ry != 0.0 {
                rx = ry
            }
            if ry == 0.0 && rx != 0.0 {
                ry = rx
            }
            rx = Math.Min(rx, width / 2.0)
            ry = Math.Min(ry, height / 2.0)
            let path = SvgPath()
            let contour = SvgContour()
            let p0 = SvgPoint(x + rx, y)
            let p1 = SvgPoint(x + width - rx, y)
            let p2 = SvgPoint(x + width, y + ry)
            let p3 = SvgPoint(x + width, y + height - ry)
            let p4 = SvgPoint(x + width - rx, y + height)
            let p5 = SvgPoint(x + rx, y + height)
            let p6 = SvgPoint(x, y + height - ry)
            let p7 = SvgPoint(x, y + ry)
            AddLine(contour, p0, p1)
            AddCubic(
                contour,
                p1,
                SvgPoint(p1.X + EllipseControlRatio * rx, p1.Y),
                SvgPoint(p2.X, p2.Y - EllipseControlRatio * ry),
                p2
            )
            AddLine(contour, p2, p3)
            AddCubic(
                contour,
                p3,
                SvgPoint(p3.X, p3.Y + EllipseControlRatio * ry),
                SvgPoint(p4.X + EllipseControlRatio * rx, p4.Y),
                p4
            )
            AddLine(contour, p4, p5)
            AddCubic(
                contour,
                p5,
                SvgPoint(p5.X - EllipseControlRatio * rx, p5.Y),
                SvgPoint(p6.X, p6.Y + EllipseControlRatio * ry),
                p6
            )
            AddLine(contour, p6, p7)
            AddCubic(
                contour,
                p7,
                SvgPoint(p7.X, p7.Y - EllipseControlRatio * ry),
                SvgPoint(p0.X - EllipseControlRatio * rx, p0.Y),
                p0
            )
            contour.Closed = true
            path.Contours.Add(contour)
            return path
        }

        private func ParseEllipse(element XElement, circle bool) SvgPath {
            let cx = ParseLength(string?(element.Attribute("cx")) ?? "0", 0.0, element, "cx")
            let cy = ParseLength(string?(element.Attribute("cy")) ?? "0", 0.0, element, "cy")
            let rx = if circle {
                ParseLength(string?(element.Attribute("r")) ?? "0", 0.0, element, "r")
            } else {
                ParseLength(string?(element.Attribute("rx")) ?? "0", 0.0, element, "rx")
            }
            let ry = if circle {
                rx
            } else {
                ParseLength(string?(element.Attribute("ry")) ?? "0", 0.0, element, "ry")
            }
            if rx <= 0.0 || ry <= 0.0 {
                throw Fail(element, "ellipse radii must be positive")
            }
            let path = SvgPath()
            let contour = SvgContour()
            let p0 = SvgPoint(cx + rx, cy)
            let p1 = SvgPoint(cx, cy + ry)
            let p2 = SvgPoint(cx - rx, cy)
            let p3 = SvgPoint(cx, cy - ry)
            AddCubic(
                contour,
                p0,
                SvgPoint(cx + rx, cy + EllipseControlRatio * ry),
                SvgPoint(cx + EllipseControlRatio * rx, cy + ry),
                p1
            )
            AddCubic(
                contour,
                p1,
                SvgPoint(cx - EllipseControlRatio * rx, cy + ry),
                SvgPoint(cx - rx, cy + EllipseControlRatio * ry),
                p2
            )
            AddCubic(
                contour,
                p2,
                SvgPoint(cx - rx, cy - EllipseControlRatio * ry),
                SvgPoint(cx - EllipseControlRatio * rx, cy - ry),
                p3
            )
            AddCubic(
                contour,
                p3,
                SvgPoint(cx + EllipseControlRatio * rx, cy - ry),
                SvgPoint(cx + rx, cy - EllipseControlRatio * ry),
                p0
            )
            contour.Closed = true
            path.Contours.Add(contour)
            return path
        }

        private func TransformPath(path SvgPath, transform SvgMatrix) SvgPath {
            let result = SvgPath()
            for source in path.Contours {
                let target = SvgContour{Closed: source.Closed}
                for curve in source.Curves {
                    let p0 = transform.Apply(SvgPoint(curve.X0, curve.Y0))
                    let control = transform.Apply(SvgPoint(curve.CX, curve.CY))
                    let p1 = transform.Apply(SvgPoint(curve.X1, curve.Y1))
                    target.Curves.Add(SvgQuadratic(p0.X, p0.Y, control.X, control.Y, p1.X, p1.Y))
                }
                result.Contours.Add(target)
            }
            return result
        }
    }
}
