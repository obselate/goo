package Goo.RichText

import Goo
import System
import System.Collections.Generic
import System.Globalization
import System.Linq
import System.Text

internal shared class RtfCodec {
    private data struct State(
        Style TextStyleProperties,
        Fallback int32,
        Skip bool,
        Destination string,
        Font int32,
        Charset int32,
        Red int32,
        Green int32,
        Blue int32,
        ColorSet bool
    ) : IEquatable[State] { }

    private class Parser(source string) {
        private let output FragmentBuilder = FragmentBuilder()
        private let stack Stack[State] = Stack[State]()
        private let fonts Dictionary[int32, string] = Dictionary[int32, string]()
        private let fontCharsets Dictionary[int32, int32] = Dictionary[int32, int32]()
        private let colors List[Color?] = List[Color?]()
        private let fontName StringBuilder = StringBuilder()
        private let escaped List[uint8] = List[uint8]()
        private var state State = State(default(TextStyleProperties), 1, false, "", -1, -1, 0, 0, 0, false)
        private var position int32
        private var fallback int32
        private var codePage int32 = 1252
        private var defaultFont int32 = -1
        private var ignorable bool
        private var closed bool

        internal func Read() RichTextFragment {
            while position < source.Length {
                let value = source[position++]
                if closed {
                    if !char.IsWhiteSpace(value) && value != '\u0000' {
                        throw FormatException("RTF has content after the root group.")
                    }
                    continue
                }
                if value == '{' {
                    FlushBytes()
                    if stack.Count == RichInput.MaxDepth {
                        throw RichLimitException()
                    }
                    stack.Push(state)
                    ignorable = false
                } else if value == '}' {
                    FlushBytes()
                    if stack.Count == 0 {
                        throw FormatException("RTF groups are not balanced.")
                    }
                    state = stack.Pop()
                    closed = stack.Count == 0
                    ignorable = false
                } else {
                    if stack.Count == 0 {
                        throw FormatException("RTF has content outside the root group.")
                    }
                    if value == '\r' || value == '\n' {
                        continue
                    }
                    if value == '\\' {
                        ReadControl()
                    } else if value >= char(128) {
                        escaped.Add(uint8(value))
                    } else {
                        FlushBytes()
                        let start = position - 1
                        if state.Destination.Length == 0 {
                            while position < source.Length &&
                                (source[position] is >= ' ' and < char(128)) &&
                                source[position] is not('\\' or '{' or '}') {
                                position++
                            }
                        }
                        Character(source[start .. position])
                    }
                }
            }
            if !closed || stack.Count != 0 || fallback != 0 {
                throw FormatException("The RTF document is incomplete.")
            }
            return output.Build()
        }

        private func ReadControl() {
            if position == source.Length {
                throw FormatException("An RTF escape is incomplete.")
            }
            let value = source[position++]
            if value == '\'' {
                if position + 2 > source.Length || !uint8.TryParse(
                    source.AsSpan(position, 2),
                    NumberStyles.HexNumber,
                    CultureInfo.InvariantCulture,
                    out var octet
                ) {
                    throw FormatException("An RTF byte escape is invalid.")
                }
                escaped.Add(octet)
                position += 2
                return
            }
            FlushBytes()
            if value == '\\' || value == '{' || value == '}' {
                Character(value.ToString())
                return
            }
            if value == '*' {
                ignorable = true
                return
            }
            if !char.IsAsciiLetter(value) {
                Character(
                    switch value {
                        case '~': " "
                        case '_': "‑"
                        case '-': "­"
                        default: throw UnsupportedContentException("The RTF control symbol is unsupported.")
                    }
                )
                return
            }
            let start = position - 1
            while position < source.Length && char.IsAsciiLetter(source[position]) {
                position++
            }
            let word = source[start .. position]
            let numberStart = position
            if position < source.Length && source[position] == '-' {
                position++
            }
            while position < source.Length && char.IsAsciiDigit(source[position]) {
                position++
            }
            var number int32? = nil
            if position != numberStart {
                if !int32.TryParse(
                    source.AsSpan(numberStart, position - numberStart),
                    NumberStyles.AllowLeadingSign,
                    CultureInfo.InvariantCulture,
                    out var parsed
                ) {
                    throw FormatException("An RTF number is out of range.")
                }
                number = parsed
            }
            if position < source.Length && source[position] == ' ' {
                position++
            }
            if word == "bin" {
                throw UnsupportedContentException("RTF binary content is unsupported.")
            }
            if ignorable {
                if (word is "generator" or "info" or "xmlnstbl" or "latentstyles") {
                    state = state with{Skip = true}
                } else {
                    throw UnsupportedContentException("The RTF destination is unsupported: " + word)
                }
                ignorable = false
            }
            if !state.Skip {
                ApplyControl(word, number)
            }
        }

        private func ApplyControl(word string, number int32?) {
            let Required = () -> number ?? throw FormatException("An RTF control requires a number.")
            if word == "uc" {
                let count = Required()
                if count < 0 || count > 16 {
                    throw UnsupportedContentException("The RTF Unicode fallback count is unsupported.")
                }
                state = state with{Fallback = count}
            } else if word == "u" {
                let unicode = Required()
                if unicode < int32(int16.MinValue) || unicode > int32(uint16.MaxValue) {
                    throw FormatException("An RTF Unicode escape is out of range.")
                }
                if fallback != 0 {
                    throw FormatException("An RTF Unicode fallback is incomplete.")
                }
                Character((char(uint16(unicode))).ToString())
                fallback = state.Fallback
            } else if state.Destination == "fonttbl" {
                FontControl(word, number)
            } else if state.Destination == "colortbl" {
                let channel = Required()
                if channel < 0 || channel > 255 {
                    throw FormatException("An RTF color channel is invalid.")
                }
                state = switch word {
                    case "red": state with{Red = channel, ColorSet = true}
                    case "green": state with{Green = channel, ColorSet = true}
                    case "blue": state with{Blue = channel, ColorSet = true}
                    default: throw UnsupportedContentException("The RTF color table uses an unsupported control.")
                }
            } else {
                let enabled = number != 0
                switch word {
                    case "rtf" {
                        if number != 1 {
                            throw FormatException("RTF version must be 1.")
                        }
                    }
                    case "ansi" { }
                    case "ansicpg" {
                        codePage = Required()
                        RtfCodec.EncodingFor(codePage)
                    }
                    case "deff" {
                        defaultFont = Required()
                    }
                    case "deflang", "deflangfe" { }
                    case "fonttbl" {
                        state = state with{Destination = "fonttbl"}
                    }
                    case "colortbl" {
                        state = state with{Destination = "colortbl"}
                    }
                    case "info", "generator" {
                        state = state with{Skip = true}
                    }
                    case "plain" {
                        state = state with{Style = default(TextStyleProperties), Font = -1, Charset = -1}
                    }
                    case "b" {
                        state = state with{
                            Style = state.Style with{FontWeight = if enabled { 700 } else { 400 }}
                        }
                    }
                    case "i" {
                        state = state with{
                            Style = state.Style with{FontStyle = if enabled { FontStyle.Italic } else { FontStyle.Normal }}
                        }
                    }
                    case "ul" {
                        Decorate(TextDecoration.Underline, enabled)
                    }
                    case "ulnone" {
                        Decorate(TextDecoration.Underline, false)
                    }
                    case "strike" {
                        Decorate(TextDecoration.LineThrough, enabled)
                    }
                    case "fs" {
                        state = state with{
                            Style = state.Style with{FontSize = float64(Required()) * 2.0 / float64(3.0)}
                        }
                    }
                    case "f" {
                        SelectFont(Required())
                    }
                    case "cf" {
                        let color = Required()
                        if color < 0 || color >= colors.Count {
                            throw FormatException("An RTF color index is missing.")
                        }
                        state = state with{Style = state.Style with{Color = colors[color]}}
                    }
                    case "par" or "line" { Character("\n") }
                    case "tab" { Character("\t") }
                    case "emdash" { Character("\u2014") }
                    case "endash" { Character("\u2013") }
                    case "bullet" { Character("\u2022") }
                    case "lquote" { Character("\u2018") }
                    case "rquote" { Character("\u2019") }
                    case "ldblquote" { Character("\u201c") }
                    case "rdblquote" { Character("\u201d") }
                    case "pard" { }
                    default {
                        throw UnsupportedContentException("The RTF control is unsupported: " + word)
                    }
                }
            }
            RichInput.ValidateStyle(state.Style)
        }

        private func FontControl(word string, number int32?) {
            if word == "f" {
                state = state with{
                    Font = number ?? throw FormatException("An RTF font index is missing."),
                    Charset = -1
                }
                fontName.Clear()
            } else if word == "fcharset" {
                state = state with{Charset = number ?? throw FormatException("An RTF font charset is missing.")}
            } else if !(
                (
                    word == "fnil" ||
                        word == "froman" ||
                        word == "fswiss" ||
                        word == "fmodern" ||
                        word == "fscript" ||
                        word == "fdecor" ||
                        word == "ftech" ||
                        word == "fbidi" ||
                        word == "fprq"
                )
            ) {
                throw UnsupportedContentException("The RTF font table uses an unsupported control: " + word)
            }
        }

        private func Decorate(bit TextDecoration, enabled bool) {
            let current = state.Style.TextDecoration ?? TextDecoration.None
            state = state with{
                Style = state.Style with{
                    TextDecoration = if enabled {
                        current | bit
                    } else {
                        current & ~bit
                    }
                }
            }
        }

        private func SelectFont(font int32) {
            if !fonts.TryGetValue(font, out var family) {
                throw FormatException("An RTF font index is missing.")
            }
            state = state with{
                Font = font,
                Charset = fontCharsets.GetValueOrDefault(font, -1),
                Style = state.Style with{FontFamily = family}
            }
        }

        private func FlushBytes() {
            if escaped.Count == 0 {
                return
            }
            let page = switch state.Charset {
                case -1 or 0 or 1: codePage
                case 128: 932
                case 129: 949
                case 130: 1361
                case 134: 936
                case 136: 950
                case 161: 1253
                case 162: 1254
                case 163: 1258
                case 177: 1255
                case 178: 1256
                case 186: 1257
                case 204: 1251
                case 222: 874
                case 238: 1250
                case 255: 437
                default: throw UnsupportedContentException("The RTF font charset is unsupported.")
            }
            if fallback != 0 {
                let skipped = Math.Min(fallback, escaped.Count)
                escaped.RemoveRange(0, skipped)
                fallback -= skipped
            }
            if escaped.Count != 0 {
                Character(RtfCodec.EncodingFor(page).GetString(escaped.ToArray()))
            }
            escaped.Clear()
        }

        private func Character(text string) {
            var text = text
            if state.Skip {
                return
            }
            if fallback != 0 {
                let skipped = Math.Min(fallback, text.Length)
                fallback -= skipped
                if skipped == text.Length {
                    return
                }
                text = text[skipped ..]
            }
            if state.Destination == "fonttbl" {
                for character in text {
                    if character != ';' {
                        if fontName.Length == 256 {
                            throw RichLimitException()
                        }
                        fontName.Append(character)
                        continue
                    }
                    if state.Font < 0 || fonts.Count == RichInput.MaxStyles {
                        throw FormatException("An RTF font entry is invalid.")
                    }
                    fonts[state.Font] = fontName.ToString().Trim()
                    fontCharsets[state.Font] = state.Charset
                    fontName.Clear()
                }
            } else if state.Destination == "colortbl" {
                if text != ";" {
                    if !string.IsNullOrWhiteSpace(text) {
                        throw FormatException("An RTF color entry is invalid.")
                    }
                    return
                }
                if colors.Count == RichInput.MaxStyles {
                    throw RichLimitException()
                }
                colors.Add(
                    if state.ColorSet {
                        Color.Rgb(state.Red, state.Green, state.Blue)
                    } else {
                        default(Color?)
                    }
                )
                state = state with{Red = 0, Green = 0, Blue = 0, ColorSet = false}
            } else {
                if state.Font < 0 && defaultFont >= 0 {
                    SelectFont(defaultFont)
                }
                output.Append(text, state.Style)
            }
        }
    }

    internal func Read(bytes ReadOnlySpan[uint8]) RichTextFragment {
        if bytes.Length < 6 || bytes[0] != 0x7B || bytes[1] != 0x5C || bytes[2] != 0x72 ||
            bytes[3] != 0x74 || bytes[4] != 0x66 || bytes[5] != 0x31 {
            throw FormatException("The clipboard data is not RTF version 1.")
        }
        Encoding.RegisterProvider(CodePagesEncodingProvider.Instance)
        return Parser(Encoding.Latin1.GetString(bytes)).Read()
    }

    internal func Write(text string, runs IReadOnlyList[RichTextCodec.Run]) string {
        let fonts = runs
            .Where((run RichTextCodec.Run) -> run.Style.FontFamily != nil)
            .Select((run RichTextCodec.Run) -> run.Style.FontFamily!!)
            .Distinct()
            .ToArray()
        let colors = runs
            .Where((run RichTextCodec.Run) -> run.Style.Color != nil)
            .Select((run RichTextCodec.Run) -> run.Style.Color!!)
            .Distinct()
            .ToArray()
        let output = StringBuilder("{\\rtf1\\ansi\\ansicpg1252\\uc1")
        output.Append("{\\fonttbl")
        for var index = 0; index < fonts.Length; index++ {
            output.Append("{\\f").Append(index).Append("\\fnil ")
            Escape(output, fonts[index], false)
            output.Append(";}")
        }
        output.Append("}{\\colortbl;")
        for color in colors {
            output
                .Append("\\red")
                .Append(HtmlCodec.Byte(color.R))
                .Append("\\green")
                .Append(HtmlCodec.Byte(color.G))
                .Append("\\blue")
                .Append(HtmlCodec.Byte(color.B))
                .Append(';')
        }
        output.Append('}')
        for run in runs {
            let style = run.Style
            if style.FontWeight is {} weight &&
                !((weight == float64(400.0) || weight == float64(700.0))) ||
                style.FontSize is {} size &&
                Math.Abs(size * 1.5 - Math.Round(size * 1.5)) > 0.00001 {
                throw UnsupportedContentException("RTF supports normal or bold weight and half-point font sizes.")
            }
            output.Append("{\\plain")
            if style.FontFamily is {} family {
                output.Append("\\f").Append(Array.IndexOf(fonts, family))
            }
            if style.FontSize is {} fontSize {
                output.Append("\\fs").Append(int32(Math.Round(fontSize * 1.5)))
            }
            if style.FontWeight is {} fontWeight {
                output.Append(
                    if fontWeight == float64(700.0) {
                        "\\b"
                    } else {
                        "\\b0"
                    }
                )
            }
            if style.FontStyle is {} slant {
                output.Append(
                    if slant == FontStyle.Italic {
                        "\\i"
                    } else {
                        "\\i0"
                    }
                )
            }
            if style.Color is {} color {
                output.Append("\\cf").Append(Array.IndexOf(colors, color) + 1)
            }
            if style.TextDecoration is {} decoration {
                output.Append(
                    if (decoration & TextDecoration.Underline) != 0 {
                        "\\ul"
                    } else {
                        "\\ulnone"
                    }
                )
                output.Append(
                    if (decoration & TextDecoration.LineThrough) != 0 {
                        "\\strike"
                    } else {
                        "\\strike0"
                    }
                )
            }
            output.Append(' ')
            Escape(output, text.AsSpan(run.Start, run.Length), true)
            output.Append('}')
        }
        return output.Append('}').ToString()
    }

    private func Escape(output StringBuilder, text ReadOnlySpan[char], breaks bool) {
        for value in text {
            if value == '\\' || value == '{' || value == '}' {
                output.Append('\\').Append(value)
            } else if value == '\n' && breaks {
                output.Append("\\line ")
            } else if value == '\t' && breaks {
                output.Append("\\tab ")
            } else if value < char(32) || value > char(126) || value == ';' && !breaks {
                output.Append("\\u").Append((int16(value)).ToString(CultureInfo.InvariantCulture)).Append('?')
            } else {
                output.Append(value)
            }
        }
    }

    private func EncodingFor(codePage int32) Encoding {
        try {
            return Encoding.GetEncoding(codePage, EncoderFallback.ExceptionFallback, DecoderFallback.ExceptionFallback)
        } catch (ArgumentException) {
            throw UnsupportedContentException("The RTF code page is unavailable.")
        }
    }
}
