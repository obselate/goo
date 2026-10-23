using System.Globalization;
using System.Net;
using System.Text;

namespace Goo.RichText;

internal static class HtmlCodec
{
    private readonly record struct Frame(string Tag, TextStyleProperties Style, bool Preserve, bool Hidden);

    internal static RichTextFragment Read(string html)
    {
        var output = new FragmentBuilder();
        var frames = new Stack<Frame>();
        var current = new Frame("", default, false, false);
        var offset = 0;
        var paragraphBreak = false;
        while (offset < html.Length)
        {
            if (html[offset] != '<')
            {
                var end = html.IndexOf('<', offset);
                if (end < 0) end = html.Length;
                if (!current.Hidden)
                {
                    var value = WebUtility.HtmlDecode(html[offset..end]);
                    if (paragraphBreak && value.Length != 0)
                    {
                        output.Append("\n", current.Style);
                        paragraphBreak = false;
                    }
                    if (!current.Preserve) value = Collapse(value, output.Last);
                    output.Append(value, current.Style);
                }
                offset = end;
                continue;
            }
            if (html.AsSpan(offset).StartsWith("<!--", StringComparison.Ordinal))
            {
                var end = html.IndexOf("-->", offset + 4, StringComparison.Ordinal);
                if (end < 0) throw new FormatException("The HTML comment is incomplete.");
                offset = end + 3;
                continue;
            }
            var tagEnd = EndTag(html, offset + 1);
            var body = html[(offset + 1)..tagEnd].Trim();
            offset = tagEnd + 1;
            if (body.StartsWith("!doctype html", StringComparison.OrdinalIgnoreCase)) continue;
            if (body.Length == 0) throw new FormatException("An HTML tag is empty.");
            var closing = body[0] == '/';
            if (closing) body = body[1..].TrimStart();
            var nameEnd = 0;
            while (nameEnd < body.Length && char.IsAsciiLetterOrDigit(body[nameEnd])) nameEnd++;
            if (nameEnd == 0) throw new FormatException("An HTML tag name is invalid.");
            var tag = body[..nameEnd].ToLowerInvariant();
            var block = tag is "p" or "div" or "pre";
            if (closing)
            {
                if (current.Tag != tag || frames.Count == 0) throw new FormatException("HTML tags are not balanced.");
                if (block && output.Length != 0) paragraphBreak = true;
                current = frames.Pop();
                continue;
            }
            if (tag == "br")
            {
                if (!current.Hidden) output.Append("\n", current.Style);
                paragraphBreak = false;
                continue;
            }
            if (tag is "meta" or "title")
            {
                if (tag == "meta") continue;
            }
            else if (tag is not ("html" or "head" or "body" or "p" or "div" or "pre" or "span" or "font" or
                "b" or "strong" or "i" or "em" or "u" or "s" or "strike"))
                throw new UnsupportedContentException("The HTML contains unsupported document content: " + tag);
            if (frames.Count == RichInput.MaxDepth) throw new RichLimitException();
            if (block && output.Length != 0 && output.Last != '\n') paragraphBreak = true;
            var style = current.Style;
            style = tag switch
            {
                "b" or "strong" => RichInput.Merge(style, new(null, null, 700, null, null, null)),
                "i" or "em" => RichInput.Merge(style, new(null, null, null, FontStyle.Italic, null, null)),
                "u" => Decorate(style, TextDecoration.Underline),
                "s" or "strike" => Decorate(style, TextDecoration.LineThrough),
                _ => style
            };
            var preserve = current.Preserve || tag == "pre";
            foreach (var (key, value) in Attributes(body[nameEnd..]))
            {
                switch (key)
                {
                    case "style": (style, preserve) = Css(value, style, preserve); break;
                    case "face" when tag == "font": style = style with { FontFamily = value }; break;
                    case "color" when tag == "font": style = style with { Color = ParseColor(value) }; break;
                    case "size" when tag == "font":
                        if (!int.TryParse(value, out var fontSize) || fontSize is < 1 or > 7)
                            throw new UnsupportedContentException("Relative HTML font sizes are unsupported.");
                        style = style with { FontSize = new double[] { 10, 13, 16, 18, 24, 32, 48 }[fontSize - 1] };
                        break;
                    case "class" when value.Length == 0: break;
                    case "id" or "lang" or "dir":
                        throw new UnsupportedContentException("The HTML uses unsupported identity or language formatting.");
                    default: throw new UnsupportedContentException("The HTML attribute is unsupported: " + key);
                }
            }
            RichInput.ValidateStyle(style);
            frames.Push(current);
            current = new(tag, style, preserve, current.Hidden || tag is "head" or "title");
        }
        if (frames.Count != 0) throw new FormatException("HTML tags are not balanced.");
        return output.Build();
    }

    internal static string Write(string text, IReadOnlyList<RichTextCodec.Run> runs)
    {
        var html = new StringBuilder("<pre style=\"white-space:pre-wrap\">");
        foreach (var run in runs)
        {
            var style = run.Style;
            html.Append("<span style=\"");
            if (style.FontFamily is { } family) html.Append("font-family:'").Append(WebUtility.HtmlEncode(family.Replace("\\", "\\\\").Replace("'", "\\'"))).Append("';");
            if (style.FontSize is { } size) html.Append("font-size:").Append(Number(size)).Append("px;");
            if (style.FontWeight is { } weight) html.Append("font-weight:").Append(Number(weight)).Append(';');
            if (style.FontStyle is { } slant) html.Append("font-style:").Append(slant == FontStyle.Italic ? "italic;" : "normal;");
            if (style.Color is { } color) html.Append("color:#").Append(Byte(color.R).ToString("X2")).Append(Byte(color.G).ToString("X2")).Append(Byte(color.B).ToString("X2")).Append(';');
            if (style.TextDecoration is { } decoration)
            {
                html.Append("text-decoration:");
                if (decoration == TextDecoration.None) html.Append("none");
                if ((decoration & TextDecoration.Underline) != 0) html.Append("underline ");
                if ((decoration & TextDecoration.LineThrough) != 0) html.Append("line-through");
                html.Append(';');
            }
            html.Append("\">").Append(WebUtility.HtmlEncode(text.Substring(run.Start, run.Length))).Append("</span>");
        }
        return html.Append("</pre>").ToString();
    }

    private static int EndTag(string html, int position)
    {
        var quote = '\0';
        for (; position < html.Length; position++)
        {
            var value = html[position];
            if (quote != '\0') { if (value == quote) quote = '\0'; }
            else if (value is '\'' or '"') quote = value;
            else if (value == '>') return position;
        }
        throw new FormatException("An HTML tag is incomplete.");
    }

    private static IEnumerable<(string Key, string Value)> Attributes(string source)
    {
        var position = 0;
        while (position < source.Length)
        {
            while (position < source.Length && char.IsWhiteSpace(source[position])) position++;
            if (position == source.Length) yield break;
            var start = position;
            while (position < source.Length && (char.IsAsciiLetterOrDigit(source[position]) || source[position] == '-')) position++;
            if (position == start) throw new FormatException("An HTML attribute name is invalid.");
            var key = source[start..position].ToLowerInvariant();
            while (position < source.Length && char.IsWhiteSpace(source[position])) position++;
            if (position == source.Length || source[position++] != '=') throw new FormatException("An HTML attribute has no value.");
            while (position < source.Length && char.IsWhiteSpace(source[position])) position++;
            if (position == source.Length) throw new FormatException("An HTML attribute has no value.");
            var quote = source[position] is '\'' or '"' ? source[position++] : '\0';
            start = position;
            while (position < source.Length && (quote != '\0' ? source[position] != quote : !char.IsWhiteSpace(source[position]))) position++;
            var value = source[start..position];
            if (quote != '\0' && position++ == source.Length) throw new FormatException("An HTML attribute is incomplete.");
            yield return (key, WebUtility.HtmlDecode(value));
        }
    }

    private static (TextStyleProperties, bool) Css(string css, TextStyleProperties style, bool preserve)
    {
        foreach (var declaration in css.Split(';', StringSplitOptions.RemoveEmptyEntries | StringSplitOptions.TrimEntries))
        {
            var colon = declaration.IndexOf(':');
            if (colon < 0) throw new FormatException("An inline CSS declaration has no value.");
            var name = declaration[..colon].Trim().ToLowerInvariant();
            var value = declaration[(colon + 1)..].Trim();
            switch (name)
            {
                case "font-family":
                    if (value.Contains(',')) throw new UnsupportedContentException("Font fallback lists are unsupported.");
                    style = style with { FontFamily = value.Trim('\'', '"').Replace("\\'", "'").Replace("\\\\", "\\") }; break;
                case "font-size": style = style with { FontSize = Size(value) }; break;
                case "font-weight":
                    style = style with { FontWeight = value switch { "normal" => 400, "bold" => 700, _ => ParseNumber(value) } }; break;
                case "font-style":
                    style = style with
                    {
                        FontStyle = value switch
                        {
                            "normal" => FontStyle.Normal,
                            "italic" => FontStyle.Italic,
                            _ => throw new UnsupportedContentException("The CSS font style is unsupported.")
                        }
                    }; break;
                case "color": style = style with { Color = ParseColor(value) }; break;
                case "text-decoration":
                case "text-decoration-line":
                    var decoration = TextDecoration.None;
                    foreach (var part in value.Split(' ', StringSplitOptions.RemoveEmptyEntries))
                        decoration |= part switch
                        {
                            "none" => TextDecoration.None,
                            "underline" => TextDecoration.Underline,
                            "line-through" => TextDecoration.LineThrough,
                            _ => throw new UnsupportedContentException("The CSS decoration is unsupported.")
                        };
                    style = style with { TextDecoration = decoration }; break;
                case "white-space":
                    preserve = value switch
                    {
                        "pre" or "pre-wrap" => true,
                        "normal" => false,
                        _ => throw new UnsupportedContentException("The CSS whitespace mode is unsupported.")
                    }; break;
                default: throw new UnsupportedContentException("The CSS declaration is unsupported: " + name);
            }
        }
        return (style, preserve);
    }

    private static string Collapse(string text, char previous)
    {
        var output = new StringBuilder(text.Length);
        foreach (var value in text)
        {
            var next = value is ' ' or '\t' or '\r' or '\n' or '\f' ? ' ' : value;
            if (next != ' ' || previous is not (' ' or '\n' or '\0')) output.Append(next);
            previous = next;
        }
        return output.ToString();
    }

    private static TextStyleProperties Decorate(TextStyleProperties style, TextDecoration value) =>
        style with { TextDecoration = (style.TextDecoration ?? TextDecoration.None) | value };
    private static double Size(string value) => value.EndsWith("px", StringComparison.OrdinalIgnoreCase) ? ParseNumber(value[..^2]) :
        value.EndsWith("pt", StringComparison.OrdinalIgnoreCase) ? ParseNumber(value[..^2]) * 96 / 72 :
        throw new UnsupportedContentException("Relative CSS font sizes are unsupported.");
    private static double ParseNumber(string value) => double.TryParse(value, NumberStyles.AllowDecimalPoint, CultureInfo.InvariantCulture, out var number)
        ? number : throw new FormatException("An inline CSS number is invalid.");
    private static Color ParseColor(string value) => Color.TryParse(value) ?? throw new UnsupportedContentException("The CSS color is unsupported.");
    private static string Number(double value) => value.ToString("R", CultureInfo.InvariantCulture);
    internal static int Byte(float value) => (int)Math.Round(value * 255);
}
