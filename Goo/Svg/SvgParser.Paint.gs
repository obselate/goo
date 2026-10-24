package Goo.Svg

import System
import System.Collections.Generic
import System.Globalization
import System.Linq
import System.Xml.Linq

internal partial class SvgParser {
    private func BuildShape(element XElement, path SvgPath, style SvgStyle) SvgShape {
        ReserveCurves(path)
        let bounds = path.Bounds()
        let fill = ParsePaint(style.Fill, style.FillOpacity, bounds, element)
        var stroke SvgStroke? = nil
        if let rawStroke = style.Stroke {
            if !IsNone(rawStroke) {
                let paint = ParsePaint(rawStroke, style.StrokeOpacity, bounds, element) ??
                    throw Fail(element, "stroke paint is empty")
                if paint.Kind != SvgPaintKind.Solid {
                    throw Fail(element, "gradient stroke paints are not supported")
                }
                stroke = SvgStroke{
                    Width: style.StrokeWidth,
                    MiterLimit: style.MiterLimit,
                    Cap: style.StrokeCap,
                    Join: style.StrokeJoin,
                    DashOffset: style.DashOffset,
                    VectorEffect: style.VectorEffect,
                    Paint: paint
                }
                if let dashes = style.Dashes {
                    ReserveDashes(dashes.Count, element)
                    stroke.Dashes.AddRange(dashes)
                }
            }
        }
        return SvgShape{
            Path: path,
            IsPath: LocalName(element) == "path",
            Fill: fill,
            Stroke: stroke,
            Flags: if style.FillRule == 1u {
                1u
            } else {
                0u
            }
        }
    }

    private func ParseClip(value string, owner XElement) SvgClip {
        let id = ParseLocalUrl(value, owner, "clip-path")
        if !clips.TryGetValue(id, out var definition) {
            throw Fail(owner, "clipPath '#$id' was not found")
        }
        let element = definition.Element
        let units = string?(element.Attribute("clipPathUnits")) ?? "userSpaceOnUse"
        if !units.Equals("userSpaceOnUse", StringComparison.Ordinal) {
            throw Fail(element, "clipPathUnits='objectBoundingBox' is not supported")
        }
        let clipStyle = ResolveStyle(element, SvgStyle())
        let clipTransform = ParseTransform(string?(element.Attribute("transform")), element)
        let clip = SvgClip{FillRule: 0}
        var foundRule = false
        for child in element.Elements() {
            let name = LocalName(child)
            if name == "g" {
                let groupStyle = ResolveStyle(child, clipStyle)
                let nestedTransform = clipTransform * ParseTransform(string?(child.Attribute("transform")), child)
                for nested in child.Elements() {
                    let nestedPath = ParseGeometry(nested)
                    let childTransform = nestedTransform * ParseTransform(
                        string?(nested.Attribute("transform")),
                        nested
                    )
                    let mapped = TransformPath(nestedPath, childTransform)
                    ReserveCurves(mapped)
                    clip.Contours.AddRange(mapped.Contours)
                    let rule = ResolveStyle(nested, groupStyle).ClipRule
                    if !foundRule {
                        clip.FillRule = rule
                        foundRule = true
                    } else if clip.FillRule != rule {
                        throw Fail(nested, "clip paths cannot mix fill rules")
                    }
                }
                continue
            }
            if name is not("path" or "rect" or "circle" or "ellipse" or "line" or "polyline" or "polygon") {
                throw Fail(child, "clipPath child '$name' is not representable")
            }
            let path = ParseGeometry(child)
            let transform = clipTransform * ParseTransform(string?(child.Attribute("transform")), child)
            let mappedPath = TransformPath(path, transform)
            ReserveCurves(mappedPath)
            clip.Contours.AddRange(mappedPath.Contours)
            let clipRule = ResolveStyle(child, clipStyle).ClipRule
            if !foundRule {
                clip.FillRule = clipRule
                foundRule = true
            } else if clip.FillRule != clipRule {
                throw Fail(child, "clip paths cannot mix fill rules")
            }
        }
        if clip.Contours.Count == 0 {
            throw Fail(element, "clipPath has no representable geometry")
        }
        return clip
    }

    private func ParsePaint(
        value string,
        opacity float64,
        bounds(MinX float64, MinY float64, MaxX float64, MaxY float64),
        owner XElement
    ) SvgPaint? {
        if IsNone(value) {
            return nil
        }
        if value.StartsWith("url(", StringComparison.OrdinalIgnoreCase) {
            let id = ParseLocalUrl(value, owner, "paint")
            let gradient = ResolveGradient(id, owner, HashSet[string](StringComparer.Ordinal))
            return BuildGradientPaint(gradient, opacity, bounds, owner)
        }
        if value.Contains("(", StringComparison.Ordinal) {
            throw Fail(owner, "paint '$value' is not in the supported color subset")
        }
        return SvgPaint{
            Kind: SvgPaintKind.Solid,
            Color: ApplyOpacity(ParseColor(value, owner), opacity),
            Opacity: opacity
        }
    }

    private func ResolveGradient(id string, owner XElement, stack HashSet[string]) SvgGradientDefinition {
        var id = id
        let chain = List[SvgGradientDefinition]()
        while true {
            if !gradients.TryGetValue(id, out var current) {
                throw Fail(owner, "gradient '#$id' was not found")
            }
            if !stack.Add(id) {
                throw Fail(current.Element, "gradient references form a cycle")
            }
            chain.Add(current)
            guard let href = GetHref(current.Element) else {
                break
            }
            if chain.Count > MaxGradientHops {
                throw Fail(current.Element, "gradient reference depth exceeds $MaxGradientHops")
            }
            id = href
        }
        var definition = chain[^1]
        for var index = chain.Count - 2; index >= 0; index-- {
            let baseDefinition = definition
            let merged = XElement(chain[index].Element)
            for attribute in baseDefinition.Element.Attributes() {
                if merged.Attribute(attribute.Name) == nil {
                    merged.SetAttributeValue(attribute.Name, attribute.Value)
                }
            }
            if !merged.Elements().Any() {
                for child in baseDefinition.Element.Elements() {
                    merged.Add(XElement(child))
                }
            }
            definition = SvgGradientDefinition(merged)
        }
        return definition
    }

    private func BuildGradientPaint(
        definition SvgGradientDefinition,
        opacity float64,
        bounds(MinX float64, MinY float64, MaxX float64, MaxY float64),
        owner XElement
    ) SvgPaint {
        let element = definition.Element
        let name = LocalName(element)
        let units = string?(element.Attribute("gradientUnits")) ?? "objectBoundingBox"
        if units is not("objectBoundingBox" or "userSpaceOnUse") {
            throw Fail(element, "gradientUnits is not supported")
        }
        let transformText = string?(element.Attribute("gradientTransform"))
        if units == "objectBoundingBox" && !string.IsNullOrWhiteSpace(transformText) {
            throw Fail(element, "objectBoundingBox gradientTransform is not supported")
        }
        let spread = string?(element.Attribute("spreadMethod")) ?? "pad"
        if !spread.Equals("pad", StringComparison.Ordinal) {
            throw Fail(element, "gradient spread methods other than pad are not supported")
        }
        let transform = ParseTransform(transformText, element)
        let determinant = transform.A * transform.D - transform.B * transform.C
        if !float64.IsFinite(determinant) || determinant == 0.0 {
            throw Fail(element, "gradientTransform must be non-singular")
        }
        var paint = SvgPaint{
            Kind: if name == "linearGradient" {
                SvgPaintKind.LinearGradient
            } else {
                SvgPaintKind.RadialGradient
            }
        }
        if paint.Kind == SvgPaintKind.LinearGradient {
            let x0 = ParseGradientCoordinate(string?(element.Attribute("x1")) ?? "0%", units, bounds, true, owner)
            let y0 = ParseGradientCoordinate(string?(element.Attribute("y1")) ?? "0%", units, bounds, false, owner)
            let x1 = ParseGradientCoordinate(string?(element.Attribute("x2")) ?? "100%", units, bounds, true, owner)
            let y1 = ParseGradientCoordinate(string?(element.Attribute("y2")) ?? "0%", units, bounds, false, owner)
            let first = transform.Apply(SvgPoint(x0, y0))
            let second = transform.Apply(SvgPoint(x1, y1))
            ValidateGradientPoint(first, element, "linear gradient start")
            ValidateGradientPoint(second, element, "linear gradient end")
            if float32(first.X) == float32(second.X) && float32(first.Y) == float32(second.Y) {
                throw Fail(element, "linear gradient endpoints must differ")
            }
            paint = SvgPaint{Kind: SvgPaintKind.LinearGradient, X0: first.X, Y0: first.Y, X1: second.X, Y1: second.Y}
        } else {
            if element.Attribute("fx") != nil || element.Attribute("fy") != nil || element.Attribute("fr") != nil {
                throw Fail(element, "radial gradient focal attributes are not supported")
            }
            if Math.Abs(transform.B) > 1e-12 || Math.Abs(transform.C) > 1e-12 {
                throw Fail(element, "radial gradientTransform must remain axis-aligned")
            }
            let cx = ParseGradientCoordinate(string?(element.Attribute("cx")) ?? "50%", units, bounds, true, owner)
            let cy = ParseGradientCoordinate(string?(element.Attribute("cy")) ?? "50%", units, bounds, false, owner)
            let radius = ParseGradientRadius(string?(element.Attribute("r")) ?? "50%", units, owner)
            let center = transform.Apply(SvgPoint(cx, cy))
            var radiusX = if units == "objectBoundingBox" {
                (bounds.MaxX - bounds.MinX) * radius
            } else {
                radius
            }
            var radiusY = if units == "objectBoundingBox" {
                (bounds.MaxY - bounds.MinY) * radius
            } else {
                radius
            }
            radiusX = Math.Abs(transform.A) * radiusX
            radiusY = Math.Abs(transform.D) * radiusY
            ValidateGradientPoint(center, element, "radial gradient center")
            let edge = SvgPoint(center.X + radiusX, center.Y + radiusY)
            ValidateGradientPoint(edge, element, "radial gradient edge")
            if float32(edge.X) <= float32(center.X) || float32(edge.Y) <= float32(center.Y) {
                throw Fail(element, "radial gradient radii must remain positive")
            }
            paint = SvgPaint{Kind: SvgPaintKind.RadialGradient, X0: center.X, Y0: center.Y, X1: edge.X, Y1: edge.Y}
        }
        let stopElements = element.Elements().ToList()
        for child in stopElements {
            if LocalName(child) != "stop" {
                throw Fail(child, "gradient child '${LocalName(child)}' is not supported")
            }
            if let descendant = child.Descendants().FirstOrDefault() {
                throw Fail(descendant, "gradient stop child '${LocalName(descendant)}' is not supported")
            }
        }
        if (stopElements.Count is < 2 or > 4) {
            throw Fail(element, "gradients must contain two to four stops")
        }
        var lastOffset = -1.0
        for stopElement in stopElements {
            let offset = ParseStopOffset(string?(stopElement.Attribute("offset")) ?? "0", stopElement)
            if offset < lastOffset {
                throw Fail(stopElement, "gradient stop offsets must be ordered")
            }
            lastOffset = offset
            let stopStyle = ResolveStopStyle(stopElement)
            var color = ParseColor(stopStyle.Color, stopElement)
            if stopStyle.Opacity < 0.0 || stopStyle.Opacity > 1.0 {
                throw Fail(stopElement, "stop opacity must be between zero and one")
            }
            color = ApplyOpacity(color, stopStyle.Opacity * opacity)
            paint.Stops.Add(SvgStop{Offset: offset, Color: color})
        }
        return paint
    }

    private func ParseGradientCoordinate(
        value string,
        units string,
        bounds(MinX float64, MinY float64, MaxX float64, MaxY float64),
        horizontal bool,
        owner XElement
    ) float64 {
        let text = value.Trim()
        let isPercent = text.EndsWith('%')
        let number = if isPercent {
            ParseLooseNumber(
                text[.. ^1],
                owner,
                if horizontal {
                    "gradient x"
                } else {
                    "gradient y"
                }
            ) / 100.0
        } else {
            ParseLength(
                text,
                0.0,
                owner,
                if horizontal {
                    "gradient x"
                } else {
                    "gradient y"
                }
            )
        }
        if units == "objectBoundingBox" {
            return if horizontal {
                bounds.MinX + (bounds.MaxX - bounds.MinX) * number
            } else {
                bounds.MinY + (bounds.MaxY - bounds.MinY) * number
            }
        }
        return switch isPercent {
            case true when horizontal: viewBoxX + viewBoxWidth * number
            case true: viewBoxY + viewBoxHeight * number
            default: number
        }
    }

    private func ParseGradientRadius(value string, units string, owner XElement) float64 {
        let text = value.Trim()
        var radius float64
        if text.EndsWith('%') {
            let percentNumber = ParseLooseNumber(text[.. ^1], owner, "gradient radius") / 100.0
            if units == "objectBoundingBox" {
                radius = percentNumber
            } else {
                radius = percentNumber * Math.Sqrt((viewBoxWidth * viewBoxWidth + viewBoxHeight * viewBoxHeight) / 2.0)
            }
        } else {
            radius = ParseLength(text, 0.0, owner, "gradient radius")
        }
        if !float64.IsFinite(radius) || radius <= 0.0 {
            throw Fail(owner, "radial gradient radius must be positive")
        }
        return radius
    }

    private func ResolveStyle(element XElement, parent SvgStyle) SvgStyle {
        ReserveDashes(parent.Dashes?.Count ?? 0, element)
        let style = parent.Clone()
        style.LocalOpacity = 1.0
        style.ClipPath = nil
        let direct = element
            .Attributes()
            .Where(
            (attribute XAttribute) -> attribute
                .Name
                .Namespace == XNamespace.None &&
                IsStyleProperty(attribute.Name.LocalName)
        )
            .ToDictionary(
            (attribute XAttribute) -> attribute.Name.LocalName.ToLowerInvariant(),
            (attribute XAttribute) -> attribute.Value,
            StringComparer.Ordinal
        )
        ApplyStyleValues(style, direct, element)
        if let inline = string?(element.Attribute("style")) {
            if inline.Contains('{') || inline.Contains('}') || inline.Contains('@') {
                throw Fail(element, "CSS selectors and at-rules are not supported")
            }
            let declarations = Dictionary[string, string](StringComparer.Ordinal)
            for declaration in inline.Split(
                ';',
                StringSplitOptions.RemoveEmptyEntries | StringSplitOptions.TrimEntries
            ) {
                let separator = declaration.IndexOf(':')
                if separator <= 0 {
                    throw Fail(element, "invalid inline style declaration")
                }
                declarations[declaration[.. separator].Trim().ToLowerInvariant()] = declaration[
                    (separator + 1) ..
                ].Trim()
            }
            ApplyStyleValues(style, declarations, element)
        }
        style.Opacity = parent.Opacity * style.LocalOpacity
        if style.Opacity < 0.0 || style.Opacity > 1.0 || !float64.IsFinite(style.Opacity) {
            throw Fail(element, "opacity must be between zero and one")
        }
        return style
    }

    private func ApplyStyleValues(style SvgStyle, values IReadOnlyDictionary[string, string], owner XElement) {
        for pair in values {
            switch pair.Key {
                case "fill" {
                    style.Fill = pair.Value
                }
                case "stroke" {
                    style.Stroke = pair.Value
                }
                case "fill-opacity" {
                    style.FillOpacity = ParseOpacity(pair.Value, owner, pair.Key)
                }
                case "stroke-opacity" {
                    style.StrokeOpacity = ParseOpacity(pair.Value, owner, pair.Key)
                }
                case "stroke-width" {
                    style.StrokeWidth = ParseLength(pair.Value, 0.0, owner, pair.Key)
                    if style.StrokeWidth < 0.0 {
                        throw Fail(owner, "stroke-width cannot be negative")
                    }
                }
                case "stroke-linecap" {
                    style.StrokeCap = switch pair.Value.Trim().ToLowerInvariant() {
                        case "butt": 0u
                        case "round": 1u
                        case "square": 2u
                        default: throw Fail(owner, "stroke-linecap '${pair.Value}' is not supported")
                    }
                }
                case "stroke-linejoin" {
                    style.StrokeJoin = switch pair.Value.Trim().ToLowerInvariant() {
                        case "miter": 0u
                        case "round": 1u
                        case "bevel": 2u
                        default: throw Fail(owner, "stroke-linejoin '${pair.Value}' is not supported")
                    }
                }
                case "stroke-miterlimit" {
                    style.MiterLimit = ParseLooseNumber(pair.Value, owner, pair.Key)
                    if style.MiterLimit < 1.0 {
                        throw Fail(owner, "stroke-miterlimit must be at least one")
                    }
                }
                case "stroke-dasharray" {
                    let dashes = ParseDashArray(pair.Value, owner, MaxTotalDashEntries - reservedDashEntries)
                    reservedDashEntries += dashes?.Count ?? 0
                    style.Dashes = dashes
                }
                case "stroke-dashoffset" {
                    style.DashOffset = ParseLength(pair.Value, 0.0, owner, pair.Key)
                }
                case "fill-rule" {
                    style.FillRule = switch pair.Value.Trim().ToLowerInvariant() {
                        case "nonzero": 0u
                        case "evenodd": 1u
                        default: throw Fail(owner, "fill-rule '${pair.Value}' is not supported")
                    }
                }
                case "clip-rule" {
                    style.ClipRule = switch pair.Value.Trim().ToLowerInvariant() {
                        case "nonzero": 0u
                        case "evenodd": 1u
                        default: throw Fail(owner, "clip-rule '${pair.Value}' is not supported")
                    }
                }
                case "opacity" {
                    style.LocalOpacity = ParseOpacity(pair.Value, owner, pair.Key)
                }
                case "clip-path" {
                    style.ClipPath = pair.Value
                }
                case "display" {
                    style.DisplayNone = pair.Value.Trim().Equals("none", StringComparison.OrdinalIgnoreCase)
                }
                case "visibility" {
                    style.DisplayNone = pair
                        .Value
                        .Trim()
                        .Equals("hidden", StringComparison.OrdinalIgnoreCase) ||
                        pair
                        .Value
                        .Trim()
                        .Equals("collapse", StringComparison.OrdinalIgnoreCase)
                }
                case "vector-effect" {
                    style.VectorEffect = switch pair.Value.Trim().ToLowerInvariant() {
                        case "none": Goo.VectorEffect.None
                        case "non-scaling-stroke": Goo.VectorEffect.NonScalingStroke
                        default: throw Fail(owner, "vector-effect '${pair.Value}' is not supported")
                    }
                }
                case "color-interpolation", "color-interpolation-filters", "shape-rendering",
                    "overflow", "enable-background" { }
                case "stop-color", "stop-opacity" { }
                default {
                    throw Fail(owner, "style property '${pair.Key}' is not supported")
                }
            }
        }
    }

    private func ReserveDashes(count int32, owner XElement) {
        if count > MaxTotalDashEntries - reservedDashEntries {
            throw Fail(owner, "dash entry count exceeds $MaxTotalDashEntries")
        }
        reservedDashEntries += count
    }

    shared {
        private func ApplyOpacity(color SvgColor, opacity float64) SvgColor -> color with{
            A = uint8(Math.Clamp(int32(Math.Round(float64(color.A) * opacity)), 0, 255))
        }

        private func GetHref(element XElement) string? -> switch (
            string?(element.Attribute("href")) ??
                string?(element.Attribute(XName.Get("href", "http://www.w3.org/1999/xlink")))
        )
            ?.Trim() {
            case nil or "": default(string?)
            case var value when value!!.StartsWith("#", StringComparison.Ordinal): value!![1 ..]
            default: throw SvgParseException("external SVG references are not allowed")
        }

        private func ValidateGradientPoint(point SvgPoint, owner XElement, field string) {
            if !point.IsFinite || !float32.IsFinite(float32(point.X)) || !float32.IsFinite(float32(point.Y)) {
                throw Fail(owner, "$field is not representable as float32")
            }
        }

        private func ResolveStopStyle(element XElement)(Color string, Opacity float64) {
            var color = string?(element.Attribute("stop-color")) ?? "#000000"
            var opacity = ParseLooseNumber(string?(element.Attribute("stop-opacity")) ?? "1", element, "stop-opacity")
            guard let style = string?(element.Attribute("style")) else {
                return (color, opacity)
            }
            for declaration in style.Split(
                ';',
                StringSplitOptions.RemoveEmptyEntries | StringSplitOptions.TrimEntries
            ) {
                let separator = declaration.IndexOf(':')
                if separator <= 0 {
                    throw Fail(element, "invalid inline style declaration")
                }
                let key = declaration[.. separator].Trim().ToLowerInvariant()
                let value = declaration[(separator + 1) ..].Trim()
                switch key {
                    case "stop-color" {
                        color = value
                    }
                    case "stop-opacity" {
                        opacity = ParseLooseNumber(value, element, "stop-opacity")
                    }
                    default {
                        throw Fail(element, "style property '$key' is not supported")
                    }
                }
            }
            return (color, opacity)
        }

        private func IsStyleProperty(name string) bool -> (
            name.ToLowerInvariant() is "fill" or
                "stroke" or
                "fill-opacity" or
                "stroke-opacity" or
                "stroke-width" or
                "stroke-linecap" or
                "stroke-linejoin" or
                "stroke-miterlimit" or
                "stroke-dasharray" or
                "stroke-dashoffset" or
                "fill-rule" or
                "clip-rule" or
                "opacity" or
                "clip-path" or
                "display" or
                "visibility" or
                "color-interpolation" or
                "color-interpolation-filters" or
                "shape-rendering" or
                "overflow" or
                "enable-background" or
                "vector-effect" or
                "stop-color" or
                "stop-opacity"
        )

        private func ParseDashArray(value string, owner XElement, remaining int32) List[float64]? {
            if value.Trim().Equals("none", StringComparison.OrdinalIgnoreCase) {
                return nil
            }
            let scanner = SvgNumberScanner(value, owner, "stroke-dasharray")
            var count = 0
            while scanner.TryRead(out var number) {
                if count >= MaxDashEntries {
                    throw Fail(owner, "stroke-dasharray entry count exceeds $MaxDashEntries")
                }
                count++
            }
            let normalizedCount = if count % 2 == 0 { count } else { count * 2 }
            if normalizedCount > MaxDashEntries {
                throw Fail(owner, "stroke-dasharray entry count exceeds $MaxDashEntries")
            }
            if normalizedCount > remaining {
                throw Fail(owner, "dash entry count exceeds $MaxTotalDashEntries")
            }
            let values = ParseNumberList(value, owner, "stroke-dasharray")
            if values.Count == 0 || values.Any((item float64) -> item < 0.0) {
                throw Fail(owner, "stroke-dasharray values must be non-negative")
            }
            if values.All((item float64) -> item == 0.0) {
                throw Fail(owner, "stroke-dasharray cannot contain only zero values")
            }
            if values.Count % 2 != 0 {
                for index in 0 ... count {
                    values.Add(values[index])
                }
            }
            return values
        }

        private func IsNone(value string) bool -> value.Trim().Equals("none", StringComparison.OrdinalIgnoreCase)

        private func ParseLocalUrl(value string, owner XElement, field string) string {
            let text = value.Trim()
            if !text.StartsWith("url(", StringComparison.OrdinalIgnoreCase) || !text.EndsWith(')') {
                throw Fail(owner, "$field must use a local url(#id)")
            }
            let id = text[4 .. ^1].Trim()
            if id.StartsWith('#') && id.Length > 1 && !id[1 ..].Contains('#') {
                return id[1 ..]
            }
            throw Fail(owner, "$field must use a local url(#id)")
        }

        private func ParseColor(value string, owner XElement) SvgColor {
            let text = value.Trim().ToLowerInvariant()
            if NamedColors.TryGetValue(text, out var named) {
                return named
            }
            if text.StartsWith("#", StringComparison.Ordinal) {
                let hex = text[1 ..]
                return switch hex.Length {
                    case 3: SvgColor(ExpandHex(hex[0]), ExpandHex(hex[1]), ExpandHex(hex[2]), 255)
                    case 4: SvgColor(ExpandHex(hex[0]), ExpandHex(hex[1]), ExpandHex(hex[2]), ExpandHex(hex[3]))
                    case 6: SvgColor(ParseHex(hex[0 .. 2]), ParseHex(hex[2 .. 4]), ParseHex(hex[4 .. 6]), 255)
                    case 8: SvgColor(
                        ParseHex(hex[0 .. 2]),
                        ParseHex(hex[2 .. 4]),
                        ParseHex(hex[4 .. 6]),
                        ParseHex(hex[6 .. 8])
                    )
                    default: throw Fail(owner, "color '$value' is invalid")
                }
            }
            throw Fail(owner, "color '$value' is outside the supported subset")
        }

        private func ParseHex(value string) uint8 -> uint8.Parse(
            value,
            NumberStyles.AllowHexSpecifier,
            CultureInfo.InvariantCulture
        )

        private func ExpandHex(value char) uint8 {
            let text = value.ToString()
            return uint8((ParseHex(text + text)))
        }

        private func ParseStopOffset(value string, owner XElement) float64 {
            let text = value.Trim()
            let result = if text.EndsWith('%') {
                ParseLooseNumber(text[.. ^1], owner, "stop offset") / 100.0
            } else {
                ParseLooseNumber(text, owner, "stop offset")
            }
            if !float64.IsFinite(result) || result < 0.0 || result > 1.0 {
                throw Fail(owner, "gradient stop offset must be between zero and one")
            }
            return result
        }

        private func ParseOpacity(value string, owner XElement, field string) float64 {
            let result = ParseLooseNumber(value, owner, field)
            if result < 0.0 || result > 1.0 {
                throw Fail(owner, "$field must be between zero and one")
            }
            return result
        }

        private func ParseLooseNumber(value string, owner XElement, field string) float64 {
            let text = value.Trim()
            if text.EndsWith('%') {
                return ParseLooseNumber(text[.. ^1], owner, field) / 100.0
            }
            if !float64.TryParse(text, NumberStyles.Float, CultureInfo.InvariantCulture, out var result) ||
                !float64.IsFinite(result) {
                throw Fail(owner, "$field must be a finite number")
            }
            return result
        }

        private func ParseLength(value string, relative float64, owner XElement, field string) float64 {
            let text = value.Trim()
            if text.EndsWith('%') {
                if relative == 0.0 {
                    throw Fail(owner, "$field percentages are not supported without a relative basis")
                }
                return ParseLooseNumber(text[.. ^1], owner, field) / 100.0 * relative
            }
            let suffix = if text.Length > 2 {
                text[^2 ..].ToLowerInvariant()
            } else {
                ""
            }
            if (suffix is "px" or "pt" or "pc" or "mm" or "cm" or "in" or "em" or "ex") {
                throw Fail(owner, "$field units '$suffix' are not supported")
            }
            return ParseLooseNumber(text, owner, field)
        }

        private func ParseNumberList(value string, owner XElement, field string) List[float64] {
            let scanner = SvgNumberScanner(value, owner, field)
            let values = List[float64]()
            while scanner.TryRead(out var number) {
                values.Add(number)
            }
            return values
        }

        private func ParseTransform(value string?, owner XElement) SvgMatrix {
            if string.IsNullOrWhiteSpace(value) {
                return SvgMatrix.Identity
            }
            let scanner = SvgTransformScanner(value, owner)
            var result = SvgMatrix.Identity
            while scanner.TryReadName(out var name) {
                let values = scanner.ReadArguments()
                let matrix = switch name {
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
                    case "rotate" when(values.Count is 1 or 3): Rotate(values)
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
                    default: throw Fail(owner, "transform '$name' has invalid arguments")
                }
                if !float64.IsFinite(matrix.A) || !float64.IsFinite(matrix.B) || !float64.IsFinite(matrix.C) ||
                    !float64.IsFinite(matrix.D) || !float64.IsFinite(matrix.E) || !float64.IsFinite(matrix.F) {
                    throw Fail(owner, "transform contains a non-finite value")
                }
                result *= matrix
            }
            scanner.RequireEnd()
            return result
        }

        private func Rotate(values IReadOnlyList[float64]) SvgMatrix {
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
