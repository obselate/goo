package Goo.RichText

import Goo
import System
import System.Collections.Generic
import System.Globalization
import System.Linq
import System.Text

/// Reports rich clipboard parsing, publication or editing.
public enum RichTextStatus {
    /// The supported rich content was transferred.
    Success,
    /// Plain text was transferred without formatting.
    PlainText,
    /// The host cannot provide the requested transfer.
    Unsupported,
    /// The content uses document features outside the supported inline subset.
    UnsupportedContent,
    /// The selection or clipboard has no text.
    Empty,
    /// The encoded content, decoded text or style count exceeds its limit.
    TooLarge,
    /// The editor does not allow this edit.
    ReadOnly,
    /// The command was cancelled.
    Cancelled,
    /// The document, selection or formatting changed before completion.
    Stale,
    /// The content is malformed or a native operation failed.
    Failed
}

/// Owns source text and persistent, fragment-relative UTF-16 style spans.
public class RichTextFragment {
    /// Creates an owned fragment. Every range must end on a UTF-16 boundary.
    public init(text string, styles IReadOnlyList[TextStyleSpan]) {
        ArgumentNullException.ThrowIfNull(text)
        ArgumentNullException.ThrowIfNull(styles)
        if text.Length > RichInput.MaxText || styles.Count > RichInput.MaxStyles {
            throw ArgumentOutOfRangeException(nameof(text))
        }
        RichInput.ValidateText(text)
        let keys = HashSet[string](StringComparer.Ordinal)
        let copy = [styles.Count]TextStyleSpan
        for index in 0 ... copy.Length {
            let span = styles[index]
            if string.IsNullOrEmpty(span.Key) || !keys.Add(span.Key) || span.Style == nil {
                throw ArgumentException("Styles require unique keys and non-null declarations.", nameof(styles))
            }
            RichInput.ValidateRange(text, span.Range)
            copy[index] = TextStyleSpan(span.Key, span.Range, Style{BasedOn: span.Style})
        }
        Text = text
        Styles = Array.AsReadOnly(copy)
    }

    /// Gets immutable Unicode source text.
    public prop Text string { get; }

    /// Gets owned persistent styles. Later spans override earlier declarations.
    public prop Styles IReadOnlyList[TextStyleSpan] { get; }

    shared {
        internal let Empty RichTextFragment = RichTextFragment("", Array.Empty[TextStyleSpan]())
    }
}

/// Contains Status, Fragment and bounded Error detail.
public data class RichTextResult(Status RichTextStatus, Fragment RichTextFragment, Error string = "") { }

internal shared class RichInput {
    internal const MaxBytes int32 = 16777216
    internal const MaxText int32 = 1048576
    internal const MaxStyles int32 = 4096
    internal const MaxDepth int32 = 64
    internal let Utf8 UTF8Encoding = UTF8Encoding(false, true)

    internal func ValidateText(text string) {
        for var index = 0; index < text.Length; index++ {
            let current = text[index]
            if current == '\0' || char.IsLowSurrogate(current) {
                throw FormatException("Text contains NUL or an unpaired surrogate.")
            }
            if char.IsHighSurrogate(current) && ((index += 1) == text.Length || !char.IsLowSurrogate(text[index])) {
                throw FormatException("Text contains an unpaired surrogate.")
            }
        }
    }

    internal func ValidateRange(text string, $range TextRange) {
        let split = (position int32) -> position > 0 && position < text.Length && char.IsLowSurrogate(text[position])
        if $range.Start < 0 || $range.Length < 0 || $range.Start > text.Length - $range.Length ||
            split($range.Start) || split($range.Start + $range.Length) {
            throw ArgumentOutOfRangeException(nameof($range))
        }
    }

    internal func Merge(before TextStyleProperties, after TextStyleProperties) TextStyleProperties ->
        TextStyleProperties{FontFamily: after.FontFamily ?? before.FontFamily, FontSize: after.FontSize ?? before.FontSize,
            FontWeight: after.FontWeight ?? before.FontWeight, FontStyle: after.FontStyle ?? before.FontStyle,
            Color: after.Color ?? before.Color, TextDecoration: after.TextDecoration ?? before.TextDecoration}

    internal func ValidateStyle(style TextStyleProperties) {
        let byteColor = (channel float32) ->
            Math.Abs(float64(channel * 255f) - Math.Round(float64(channel * 255f))) < 0.0001
        if style.FontFamily?.Length > 256 || style.FontFamily?.IndexOfAny([]char{'\0', ';', ',', '\r', '\n'}) >= 0 ||
            (if let size = style.FontSize { !float64.IsFinite(size) || size <= 0 || size > 4096 } else { false }) ||
            (if let weight = style.FontWeight { weight < 1 || weight > 1000 } else { false }) ||
            (if let slant = style.FontStyle { slant != FontStyle.Normal && slant != FontStyle.Italic } else { false }) ||
            (if let color = style.Color { color.A != 1 || !byteColor(color.R) || !byteColor(color.G) || !byteColor(color.B) } else { false }) {
            throw UnsupportedContentException("The inline style cannot round-trip through HTML and RTF.")
        }
    }

    internal class InlineStyle : Style {
        internal init(value TextStyleProperties) {
            if let family = value.FontFamily { FontFamily = family }
            if let size = value.FontSize { FontSize = size }
            if let weight = value.FontWeight { FontWeight = weight }
            if let slant = value.FontStyle { FontStyle = slant }
            if let color = value.Color { Color = color }
            if let decoration = value.TextDecoration { TextDecoration = decoration }
        }
    }
}

internal class UnsupportedContentException(message string) : FormatException(message) { }
internal class RichLimitException : FormatException { }

internal class FragmentBuilder {
    private let text StringBuilder = StringBuilder()
    private let runs List[(Start int32, Length int32, Style TextStyleProperties)] = List[(Start int32, Length int32, Style TextStyleProperties)]()
    internal prop Length int32 -> text.Length
    internal prop Last char -> if text.Length == 0 { '\0' } else { text[^1] }

    internal func Append(value string, style TextStyleProperties) {
        if value.Length == 0 { return }
        if value.Length > RichInput.MaxText - text.Length { throw RichLimitException() }
        RichInput.ValidateStyle(style)
        if runs.Count > 0 && EqualityComparer[TextStyleProperties].Default.Equals(runs[^1].Style, style) {
            let last = runs[^1]
            runs[^1] = (last.Start, last.Length + value.Length, style)
        } else {
            if runs.Count == RichInput.MaxStyles { throw RichLimitException() }
            runs.Add((text.Length, value.Length, style))
        }
        text.Append(value)
    }

    internal func Build() RichTextFragment -> RichTextFragment(text.ToString(), runs.Select(
        (run (Start int32, Length int32, Style TextStyleProperties), index int32) ->
            TextStyleSpan(index.ToString(CultureInfo.InvariantCulture), TextRange(run.Start, run.Length),
                RichInput.InlineStyle(run.Style))).ToArray())
}
