package Goo.RichText

import Goo
import System
import System.Collections.Generic
import System.Globalization
import System.Net
import System.Text

internal shared class HtmlCodec {
    private data struct Frame(Tag string, Style TextStyleProperties, Preserve bool, Hidden bool) : IEquatable[Frame] { }

    internal func Read(html string) RichTextFragment {
        let output = FragmentBuilder()
        let frames = Stack[Frame]()
        var current = Frame("", default(TextStyleProperties), false, false)
        var offset = 0
        var paragraphBreak = false
        while offset < html.Length {
            if html[offset] != '<' {
                var end = html.IndexOf('<', offset)
                if end < 0 { end = html.Length }
                if !current.Hidden {
                    var value = WebUtility.HtmlDecode(html[offset .. end])
                    if paragraphBreak && value.Length != 0 {
                        output.Append("\n", current.Style)
                        paragraphBreak = false
                    }
                    if !current.Preserve {
                        value = Collapse(value, output.Last)
                    }
                    output.Append(value, current.Style)
                }
                offset = end
                continue
            }
            if html.AsSpan(offset).StartsWith("<!--", StringComparison.Ordinal) {
                let end = html.IndexOf("-->", offset + 4, StringComparison.Ordinal)
                if end < 0 {
                    throw FormatException("The HTML comment is incomplete.")
                }
                offset = end + 3
                continue
            }
            let tagEnd = EndTag(html, offset + 1)
            var body = html[(offset + 1) .. tagEnd].Trim()
            offset = tagEnd + 1
            if body.StartsWith("!doctype html", StringComparison.OrdinalIgnoreCase) { continue }
            if body.Length == 0 { throw FormatException("An HTML tag is empty.") }
            let closing = body[0] == '/'
            if closing { body = body[1 ..].TrimStart() }
            var nameEnd = 0
            while nameEnd < body.Length && char.IsAsciiLetterOrDigit(body[nameEnd]) {
                nameEnd++
            }
            if nameEnd == 0 { throw FormatException("An HTML tag name is invalid.") }
            let tag = body[.. nameEnd].ToLowerInvariant()
            let block = (tag is "p" or "div" or "pre")
            if closing {
                if current.Tag != tag || frames.Count == 0 {
                    throw FormatException("HTML tags are not balanced.")
                }
                if block && output.Length != 0 {
                    paragraphBreak = true
                }
                current = frames.Pop()
                continue
            }
            if tag == "br" {
                if !current.Hidden {
                    output.Append("\n", current.Style)
                }
                paragraphBreak = false
                continue
            }
            if tag is "meta" or "title" {
                if tag == "meta" { continue }
            } else if tag is not("html" or "head" or "body" or "p" or "div" or "pre" or "span" or "font" or
                "b" or "strong" or "i" or "em" or "u" or "s" or "strike") {
                throw UnsupportedContentException("The HTML contains unsupported document content: " + tag)
            }
            if frames.Count == RichInput.MaxDepth {
                throw RichLimitException()
            }
            if block && output.Length != 0 && output.Last != '\n' {
                paragraphBreak = true
            }
            var style = current.Style
            style = switch tag {
                case "b" or "strong": RichInput.Merge(style, TextStyleProperties(nil, nil, 700, nil, nil, nil))
                case "i" or "em": RichInput.Merge(style, TextStyleProperties(nil, nil, nil, FontStyle.Italic, nil, nil))
                case "u": Decorate(style, TextDecoration.Underline)
                case "s" or "strike": Decorate(style, TextDecoration.LineThrough)
                default: style
            }
            var preserve = current.Preserve || tag == "pre"
            for (key, value) in Attributes(body[nameEnd ..]) {
                switch key {
                    case "style" {
                        style, preserve = Css(value, style, preserve)
                    }
                    case "face" when tag == "font" {
                        style = style with{FontFamily = value}
                    }
                    case "color" when tag == "font" {
                        style = style with{Color = ParseColor(value)}
                    }
                    case "size" when tag == "font" {
                        if !int32.TryParse(value, out var fontSize) || (fontSize < 1 || fontSize > 7) {
                            throw UnsupportedContentException("Relative HTML font sizes are unsupported.")
                        }
                        style = style with{
                            FontSize = []float64{10.0, 13.0, 16.0, 18.0, 24.0, 32.0, 48.0} [fontSize - 1]
                        }
                    }
                    case "class" when value.Length == 0 { }
                    case "id" or "lang" or "dir" {
                        throw UnsupportedContentException("The HTML uses unsupported identity or language formatting.")
                    }
                    default {
                        throw UnsupportedContentException("The HTML attribute is unsupported: " + key)
                    }
                }
            }
            RichInput.ValidateStyle(style)
            frames.Push(current)
            current = Frame(tag, style, preserve, current.Hidden || (tag is "head" or "title"))
        }
        if frames.Count != 0 { throw FormatException("HTML tags are not balanced.") }
        return output.Build()
    }

    internal func Write(text string, runs IReadOnlyList[RichTextCodec.Run]) string {
        let html = StringBuilder("<pre style=\"white-space:pre-wrap\">")
        for run in runs {
            let style = run.Style
            html.Append("<span style=\"")
            if style.FontFamily is {} family {
                html
                    .Append("font-family:'")
                    .Append(WebUtility.HtmlEncode(family.Replace("\\", "\\\\").Replace("'", "\\'")))
                    .Append("';")
            }
            if style.FontSize is {} size {
                html.Append("font-size:").Append(Number(size)).Append("px;")
            }
            if style.FontWeight is {} weight {
                html.Append("font-weight:").Append(Number(weight)).Append(';')
            }
            if style.FontStyle is {} slant {
                html.Append("font-style:").Append(
                    if slant == FontStyle.Italic {
                        "italic;"
                    } else {
                        "normal;"
                    }
                )
            }
            let __spill0 = style.Color
            var color Color
            if __spill0 != nil && {
                color = __spill0!!
                true
            } {
                html
                    .Append("color:#")
                    .Append(HtmlCodec.Byte(color.R).ToString("X2"))
                    .Append(HtmlCodec.Byte(color.G).ToString("X2"))
                    .Append(HtmlCodec.Byte(color.B).ToString("X2"))
                    .Append(';')
            }
            if style.TextDecoration is {} decoration {
                html.Append("text-decoration:")
                if decoration == TextDecoration.None {
                    html.Append("none")
                }
                if (decoration & TextDecoration.Underline) != 0 {
                    html.Append("underline ")
                }
                if (decoration & TextDecoration.LineThrough) != 0 {
                    html.Append("line-through")
                }
                html.Append(';')
            }
            html.Append("\">").Append(WebUtility.HtmlEncode(text.Substring(run.Start, run.Length))).Append("</span>")
        }
        return html.Append("</pre>").ToString()
    }

    private func EndTag(html string, position int32) int32 {
        var position = position
        var quote = '\u0000'
        for ; position < html.Length; position++ {
            let value = html[position]
            if quote != '\u0000' {
                if value == quote {
                    quote = '\u0000'
                }
            } else if value == '\'' || value == '"' {
                quote = value
            } else if value == '>' {
                return position
            }
        }
        throw FormatException("An HTML tag is incomplete.")
    }

    private func Attributes(source string) sequence[(Key string, Value string)] {
        var position = 0
        while position < source.Length {
            while position < source.Length && char.IsWhiteSpace(source[position]) {
                position++
            }
            if position == source.Length {
                yield break
            }
            var start = position
            while position < source.Length && (char.IsAsciiLetterOrDigit(source[position]) || source[position] == '-') {
                position++
            }
            if position == start {
                throw FormatException("An HTML attribute name is invalid.")
            }
            let key = source[start .. position].ToLowerInvariant()
            while position < source.Length && char.IsWhiteSpace(source[position]) {
                position++
            }
            if position == source.Length || source[position++] != '=' {
                throw FormatException("An HTML attribute has no value.")
            }
            while position < source.Length && char.IsWhiteSpace(source[position]) {
                position++
            }
            if position == source.Length {
                throw FormatException("An HTML attribute has no value.")
            }
            let quote = if (source[position] is '\'' or '"') {
                source[position++]
            } else {
                '\u0000'
            }
            start = position
            while position < source.Length &&
                (
                if quote != '\u0000' {
                    source[position] != quote
                } else {
                    !char.IsWhiteSpace(source[position])
                }
            ) {
                position++
            }
            let value = source[start .. position]
            if quote != '\u0000' && position++ == source.Length {
                throw FormatException("An HTML attribute is incomplete.")
            }
            yield(key, WebUtility.HtmlDecode(value))
        }
    }

    private func Css(css string, style TextStyleProperties, preserve bool)(TextStyleProperties, bool) {
        var style = style
        var preserve = preserve
        for declaration in css.Split(';', StringSplitOptions.RemoveEmptyEntries | StringSplitOptions.TrimEntries) {
            let colon = declaration.IndexOf(':')
            if colon < 0 {
                throw FormatException("An inline CSS declaration has no value.")
            }
            let name = declaration[.. colon].Trim().ToLowerInvariant()
            let value = declaration[(colon + 1) ..].Trim()
            switch name {
                case "font-family" {
                    if value.Contains(',') {
                        throw UnsupportedContentException("Font fallback lists are unsupported.")
                    }
                    style = style with{FontFamily = value.Trim('\'', '"').Replace("\\'", "'").Replace("\\\\", "\\")}
                }
                case "font-size" {
                    style = style with{FontSize = Size(value)}
                }
                case "font-weight" {
                    style = style with{
                        FontWeight = switch value {
                            case "normal": float64(400.0)
                            case "bold": float64(700.0)
                            default: ParseNumber(value)
                        }
                    }
                }
                case "font-style" {
                    style = style with{
                        FontStyle = switch value {
                            case "normal": FontStyle.Normal
                            case "italic": FontStyle.Italic
                            default: throw UnsupportedContentException("The CSS font style is unsupported.")
                        }
                    }
                }
                case "color" {
                    style = style with{Color = ParseColor(value)}
                }
                case "text-decoration", "text-decoration-line" {
                    var decoration = TextDecoration.None
                    for part in value.Split(' ', StringSplitOptions.RemoveEmptyEntries) {
                        decoration |= switch part {
                            case "none": TextDecoration.None
                            case "underline": TextDecoration.Underline
                            case "line-through": TextDecoration.LineThrough
                            default: throw UnsupportedContentException("The CSS decoration is unsupported.")
                        }
                    }
                    style = style with{TextDecoration = decoration}
                }
                case "white-space" {
                    preserve = switch value {
                        case "pre" or "pre-wrap": true
                        case "normal": false
                        default: throw UnsupportedContentException("The CSS whitespace mode is unsupported.")
                    }
                }
                default {
                    throw UnsupportedContentException("The CSS declaration is unsupported: " + name)
                }
            }
        }
        return (style, preserve)
    }

    private func Collapse(text string, previous char) string {
        var previous = previous
        let output = StringBuilder(text.Length)
        for value in text {
            let next = if value == ' ' || value == '\t' || value == '\r' || value == '\n' || value == '\u000C' {
                ' '
            } else {
                value
            }
            if next != ' ' || !((previous == ' ' || previous == '\n' || previous == '\u0000')) {
                output.Append(next)
            }
            previous = next
        }
        return output.ToString()
    }

    private func Decorate(style TextStyleProperties, value TextDecoration) TextStyleProperties ->
        style with{TextDecoration = (style.TextDecoration ?? TextDecoration.None) | value}

    private func Size(value string) float64 -> if value.EndsWith("px", StringComparison.OrdinalIgnoreCase) {
        ParseNumber(value[.. ^2])
    } else {
        (
            if value.EndsWith("pt", StringComparison.OrdinalIgnoreCase) {
                ParseNumber(value[.. ^2]) * float64(96.0) / float64(72.0)
            } else {
                throw UnsupportedContentException("Relative CSS font sizes are unsupported.")
                default(float64)
            }
        )
    }

    private func ParseNumber(value string) float64 -> if float64.TryParse(
        value,
        NumberStyles.AllowDecimalPoint,
        CultureInfo.InvariantCulture,
        out var number
    ) {
        number
    } else {
        throw FormatException("An inline CSS number is invalid.")
        default(float64)
    }

    private func ParseColor(value string) Color -> Color.TryParse(value) ??
        throw UnsupportedContentException("The CSS color is unsupported.")

    private func Number(value float64) string -> value.ToString("R", CultureInfo.InvariantCulture)

    internal func Byte(value float32) int32 -> int32(Math.Round(value * float32(255.0)))
}
