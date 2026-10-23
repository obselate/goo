using System.Globalization;
using System.Text;

namespace Goo.RichText;

internal static class RtfCodec
{
    private readonly record struct State(TextStyleProperties Style, int Fallback, bool Skip, string Destination,
        int Font, int Charset, int Red, int Green, int Blue, bool ColorSet);

    internal static RichTextFragment Read(ReadOnlySpan<byte> bytes)
    {
        if (!bytes.StartsWith("{\\rtf1"u8)) throw new FormatException("The clipboard data is not RTF version 1.");
        Encoding.RegisterProvider(CodePagesEncodingProvider.Instance);
        return new Parser(Encoding.Latin1.GetString(bytes)).Read();
    }

    private sealed class Parser(string source)
    {
        private readonly FragmentBuilder output = new();
        private readonly Stack<State> stack = new();
        private readonly Dictionary<int, string> fonts = [];
        private readonly Dictionary<int, int> fontCharsets = [];
        private readonly List<Color?> colors = [];
        private readonly StringBuilder fontName = new();
        private readonly List<byte> escaped = [];
        private State state = new(default, 1, false, "", -1, -1, 0, 0, 0, false);
        private int position, fallback;
        private int codePage = 1252;
        private int defaultFont = -1;
        private bool ignorable, closed;

        internal RichTextFragment Read()
        {
            while (position < source.Length)
            {
                var value = source[position++];
                if (closed)
                {
                    if (!char.IsWhiteSpace(value) && value != '\0') throw new FormatException("RTF has content after the root group.");
                    continue;
                }
                if (value == '{')
                {
                    FlushBytes();
                    if (stack.Count == RichInput.MaxDepth) throw new RichLimitException();
                    stack.Push(state);
                    ignorable = false;
                }
                else if (value == '}')
                {
                    FlushBytes();
                    if (stack.Count == 0) throw new FormatException("RTF groups are not balanced.");
                    state = stack.Pop();
                    closed = stack.Count == 0;
                    ignorable = false;
                }
                else
                {
                    if (stack.Count == 0) throw new FormatException("RTF has content outside the root group.");
                    if (value is '\r' or '\n') continue;
                    if (value == '\\') ReadControl();
                    else if (value >= 128) escaped.Add((byte)value);
                    else
                    {
                        FlushBytes();
                        var start = position - 1;
                        if (state.Destination.Length == 0)
                            while (position < source.Length && source[position] is >= ' ' and < (char)128 &&
                                source[position] is not ('\\' or '{' or '}')) position++;
                        Character(source[start..position]);
                    }
                }
            }
            if (!closed || stack.Count != 0 || fallback != 0) throw new FormatException("The RTF document is incomplete.");
            return output.Build();
        }

        private void ReadControl()
        {
            if (position == source.Length) throw new FormatException("An RTF escape is incomplete.");
            var value = source[position++];
            if (value == '\'')
            {
                if (position + 2 > source.Length || !byte.TryParse(source.AsSpan(position, 2), NumberStyles.HexNumber,
                    CultureInfo.InvariantCulture, out var octet)) throw new FormatException("An RTF byte escape is invalid.");
                escaped.Add(octet);
                position += 2;
                return;
            }
            FlushBytes();
            if (value is '\\' or '{' or '}') { Character(value.ToString()); return; }
            if (value == '*') { ignorable = true; return; }
            if (!char.IsAsciiLetter(value))
            {
                Character(value switch
                {
                    '~' => "\u00a0",
                    '_' => "\u2011",
                    '-' => "\u00ad",
                    _ => throw new UnsupportedContentException("The RTF control symbol is unsupported.")
                });
                return;
            }
            var start = position - 1;
            while (position < source.Length && char.IsAsciiLetter(source[position])) position++;
            var word = source[start..position];
            var numberStart = position;
            if (position < source.Length && source[position] == '-') position++;
            while (position < source.Length && char.IsAsciiDigit(source[position])) position++;
            int? number = null;
            if (position != numberStart)
            {
                if (!int.TryParse(source.AsSpan(numberStart, position - numberStart), NumberStyles.AllowLeadingSign,
                    CultureInfo.InvariantCulture, out var parsed)) throw new FormatException("An RTF number is out of range.");
                number = parsed;
            }
            if (position < source.Length && source[position] == ' ') position++;
            if (word == "bin") throw new UnsupportedContentException("RTF binary content is unsupported.");
            if (ignorable)
            {
                if (word is "generator" or "info" or "xmlnstbl" or "latentstyles") state = state with { Skip = true };
                else throw new UnsupportedContentException("The RTF destination is unsupported: " + word);
                ignorable = false;
            }
            if (!state.Skip) ApplyControl(word, number);
        }

        private void ApplyControl(string word, int? number)
        {
            if (word == "uc")
            {
                var count = Required();
                if (count is < 0 or > 16) throw new UnsupportedContentException("The RTF Unicode fallback count is unsupported.");
                state = state with { Fallback = count };
            }
            else if (word == "u")
            {
                var unicode = Required();
                if (unicode is < short.MinValue or > ushort.MaxValue) throw new FormatException("An RTF Unicode escape is out of range.");
                if (fallback != 0) throw new FormatException("An RTF Unicode fallback is incomplete.");
                Character(((char)(ushort)unicode).ToString());
                fallback = state.Fallback;
            }
            else if (state.Destination == "fonttbl") FontControl(word, number);
            else if (state.Destination == "colortbl")
            {
                var channel = Required();
                if (channel is < 0 or > 255) throw new FormatException("An RTF color channel is invalid.");
                state = word switch
                {
                    "red" => state with { Red = channel, ColorSet = true },
                    "green" => state with { Green = channel, ColorSet = true },
                    "blue" => state with { Blue = channel, ColorSet = true },
                    _ => throw new UnsupportedContentException("The RTF color table uses an unsupported control.")
                };
            }
            else
            {
                var enabled = number != 0;
                switch (word)
                {
                    case "rtf": if (number != 1) throw new FormatException("RTF version must be 1."); break;
                    case "ansi": break;
                    case "ansicpg": codePage = Required(); EncodingFor(codePage); break;
                    case "deff": defaultFont = Required(); break;
                    case "deflang":
                    case "deflangfe": break;
                    case "fonttbl": state = state with { Destination = "fonttbl" }; break;
                    case "colortbl": state = state with { Destination = "colortbl" }; break;
                    case "info":
                    case "generator": state = state with { Skip = true }; break;
                    case "plain": state = state with { Style = default, Font = -1, Charset = -1 }; break;
                    case "b": state = state with { Style = state.Style with { FontWeight = enabled ? 700 : 400 } }; break;
                    case "i": state = state with { Style = state.Style with { FontStyle = enabled ? FontStyle.Italic : FontStyle.Normal } }; break;
                    case "ul": Decorate(TextDecoration.Underline, enabled); break;
                    case "ulnone": Decorate(TextDecoration.Underline, false); break;
                    case "strike": Decorate(TextDecoration.LineThrough, enabled); break;
                    case "fs": state = state with { Style = state.Style with { FontSize = Required() * 2.0 / 3 } }; break;
                    case "f": SelectFont(Required()); break;
                    case "cf":
                        var color = Required();
                        if (color < 0 || color >= colors.Count) throw new FormatException("An RTF color index is missing.");
                        state = state with { Style = state.Style with { Color = colors[color] } }; break;
                    case "par":
                    case "line": Character("\n"); break;
                    case "tab": Character("\t"); break;
                    case "emdash": Character("\u2014"); break;
                    case "endash": Character("\u2013"); break;
                    case "bullet": Character("\u2022"); break;
                    case "lquote": Character("\u2018"); break;
                    case "rquote": Character("\u2019"); break;
                    case "ldblquote": Character("\u201c"); break;
                    case "rdblquote": Character("\u201d"); break;
                    case "pard": break;
                    default: throw new UnsupportedContentException("The RTF control is unsupported: " + word);
                }
            }
            RichInput.ValidateStyle(state.Style);
            int Required() => number ?? throw new FormatException("An RTF control requires a number.");
        }

        private void FontControl(string word, int? number)
        {
            if (word == "f")
            {
                state = state with { Font = number ?? throw new FormatException("An RTF font index is missing."), Charset = -1 };
                fontName.Clear();
            }
            else if (word == "fcharset") state = state with { Charset = number ?? throw new FormatException("An RTF font charset is missing.") };
            else if (word is not ("fnil" or "froman" or "fswiss" or "fmodern" or "fscript" or "fdecor" or "ftech" or "fbidi" or "fprq"))
                throw new UnsupportedContentException("The RTF font table uses an unsupported control: " + word);
        }

        private void Decorate(TextDecoration bit, bool enabled)
        {
            var current = state.Style.TextDecoration ?? TextDecoration.None;
            state = state with { Style = state.Style with { TextDecoration = enabled ? current | bit : current & ~bit } };
        }

        private void SelectFont(int font)
        {
            if (!fonts.TryGetValue(font, out var family)) throw new FormatException("An RTF font index is missing.");
            state = state with { Font = font, Charset = fontCharsets.GetValueOrDefault(font, -1), Style = state.Style with { FontFamily = family } };
        }

        private void FlushBytes()
        {
            if (escaped.Count == 0) return;
            var page = state.Charset switch
            {
                -1 or 0 or 1 => codePage,
                128 => 932,
                129 => 949,
                130 => 1361,
                134 => 936,
                136 => 950,
                161 => 1253,
                162 => 1254,
                163 => 1258,
                177 => 1255,
                178 => 1256,
                186 => 1257,
                204 => 1251,
                222 => 874,
                238 => 1250,
                255 => 437,
                _ => throw new UnsupportedContentException("The RTF font charset is unsupported.")
            };
            if (fallback != 0)
            {
                var skipped = Math.Min(fallback, escaped.Count);
                escaped.RemoveRange(0, skipped);
                fallback -= skipped;
            }
            if (escaped.Count != 0) Character(EncodingFor(page).GetString(escaped.ToArray()));
            escaped.Clear();
        }

        private void Character(string text)
        {
            if (state.Skip) return;
            if (fallback != 0)
            {
                var skipped = Math.Min(fallback, text.Length);
                fallback -= skipped;
                if (skipped == text.Length) return;
                text = text[skipped..];
            }
            if (state.Destination == "fonttbl")
            {
                foreach (var character in text)
                {
                    if (character != ';') { if (fontName.Length == 256) throw new RichLimitException(); fontName.Append(character); continue; }
                    if (state.Font < 0 || fonts.Count == RichInput.MaxStyles) throw new FormatException("An RTF font entry is invalid.");
                    fonts[state.Font] = fontName.ToString().Trim();
                    fontCharsets[state.Font] = state.Charset;
                    fontName.Clear();
                }
            }
            else if (state.Destination == "colortbl")
            {
                if (text != ";") { if (!string.IsNullOrWhiteSpace(text)) throw new FormatException("An RTF color entry is invalid."); return; }
                if (colors.Count == RichInput.MaxStyles) throw new RichLimitException();
                colors.Add(state.ColorSet ? Color.Rgb(state.Red, state.Green, state.Blue) : (Color?)null);
                state = state with { Red = 0, Green = 0, Blue = 0, ColorSet = false };
            }
            else
            {
                if (state.Font < 0 && defaultFont >= 0) SelectFont(defaultFont);
                output.Append(text, state.Style);
            }
        }
    }

    internal static string Write(string text, IReadOnlyList<RichTextCodec.Run> runs)
    {
        var fonts = runs.Where(run => run.Style.FontFamily != null).Select(run => run.Style.FontFamily!).Distinct().ToArray();
        var colors = runs.Where(run => run.Style.Color != null).Select(run => run.Style.Color!.Value).Distinct().ToArray();
        var output = new StringBuilder("{\\rtf1\\ansi\\ansicpg1252\\uc1");
        output.Append("{\\fonttbl");
        for (var index = 0; index < fonts.Length; index++)
        {
            output.Append("{\\f").Append(index).Append("\\fnil ");
            Escape(output, fonts[index], false);
            output.Append(";}");
        }
        output.Append("}{\\colortbl;");
        foreach (var color in colors)
            output.Append("\\red").Append(HtmlCodec.Byte(color.R)).Append("\\green").Append(HtmlCodec.Byte(color.G))
                .Append("\\blue").Append(HtmlCodec.Byte(color.B)).Append(';');
        output.Append('}');
        foreach (var run in runs)
        {
            var style = run.Style;
            if (style.FontWeight is { } weight && weight is not (400 or 700) ||
                style.FontSize is { } size && Math.Abs(size * 1.5 - Math.Round(size * 1.5)) > 0.00001)
                throw new UnsupportedContentException("RTF supports normal or bold weight and half-point font sizes.");
            output.Append("{\\plain");
            if (style.FontFamily is { } family) output.Append("\\f").Append(Array.IndexOf(fonts, family));
            if (style.FontSize is { } fontSize) output.Append("\\fs").Append((int)Math.Round(fontSize * 1.5));
            if (style.FontWeight is { } fontWeight) output.Append(fontWeight == 700 ? "\\b" : "\\b0");
            if (style.FontStyle is { } slant) output.Append(slant == FontStyle.Italic ? "\\i" : "\\i0");
            if (style.Color is { } color) output.Append("\\cf").Append(Array.IndexOf(colors, color) + 1);
            if (style.TextDecoration is { } decoration)
            {
                output.Append((decoration & TextDecoration.Underline) != 0 ? "\\ul" : "\\ulnone");
                output.Append((decoration & TextDecoration.LineThrough) != 0 ? "\\strike" : "\\strike0");
            }
            output.Append(' ');
            Escape(output, text.AsSpan(run.Start, run.Length), true);
            output.Append('}');
        }
        return output.Append('}').ToString();
    }

    private static void Escape(StringBuilder output, ReadOnlySpan<char> text, bool breaks)
    {
        foreach (var value in text)
        {
            if (value is '\\' or '{' or '}') output.Append('\\').Append(value);
            else if (value == '\n' && breaks) output.Append("\\line ");
            else if (value == '\t' && breaks) output.Append("\\tab ");
            else if (value < 32 || value > 126 || value == ';' && !breaks)
                output.Append("\\u").Append(((short)value).ToString(CultureInfo.InvariantCulture)).Append('?');
            else output.Append(value);
        }
    }

    private static Encoding EncodingFor(int codePage)
    {
        try { return Encoding.GetEncoding(codePage, EncoderFallback.ExceptionFallback, DecoderFallback.ExceptionFallback); }
        catch (ArgumentException) { throw new UnsupportedContentException("The RTF code page is unavailable."); }
    }
}
