using System.Text;

namespace Goo.RichText;

/// <summary>Reports rich clipboard parsing, publication or editing.</summary>
public enum RichTextStatus
{
    /// <summary>The supported rich content was transferred.</summary>
    Success,
    /// <summary>Plain text was transferred without formatting.</summary>
    PlainText,
    /// <summary>The host cannot provide the requested transfer.</summary>
    Unsupported,
    /// <summary>The content uses document features outside the supported inline subset.</summary>
    UnsupportedContent,
    /// <summary>The selection or clipboard has no text.</summary>
    Empty,
    /// <summary>The encoded content, decoded text or style count exceeds its limit.</summary>
    TooLarge,
    /// <summary>The editor does not allow this edit.</summary>
    ReadOnly,
    /// <summary>The command was cancelled.</summary>
    Cancelled,
    /// <summary>The document, selection or formatting changed before completion.</summary>
    Stale,
    /// <summary>The content is malformed or a native operation failed.</summary>
    Failed
}

/// <summary>Owns source text and persistent, fragment-relative UTF-16 style spans.</summary>
public sealed class RichTextFragment
{
    /// <summary>Creates an owned fragment. Every range must end on a UTF-16 boundary.</summary>
    public RichTextFragment(string text, IReadOnlyList<TextStyleSpan> styles)
    {
        ArgumentNullException.ThrowIfNull(text);
        ArgumentNullException.ThrowIfNull(styles);
        if (text.Length > RichInput.MaxText || styles.Count > RichInput.MaxStyles)
            throw new ArgumentOutOfRangeException(nameof(text));
        RichInput.ValidateText(text);
        var keys = new HashSet<string>(StringComparer.Ordinal);
        var copy = new TextStyleSpan[styles.Count];
        for (var index = 0; index < copy.Length; index++)
        {
            var span = styles[index];
            if (string.IsNullOrEmpty(span.Key) || !keys.Add(span.Key) || span.Style == null)
                throw new ArgumentException("Styles require unique keys and non-null declarations.", nameof(styles));
            RichInput.ValidateRange(text, span.Range);
            copy[index] = new(span.Key, span.Range, new Style { BasedOn = span.Style });
        }
        Text = text;
        Styles = Array.AsReadOnly(copy);
    }

    /// <summary>Gets immutable Unicode source text.</summary>
    public string Text { get; }
    /// <summary>Gets owned persistent styles. Later spans override earlier declarations.</summary>
    public IReadOnlyList<TextStyleSpan> Styles { get; }
    internal static readonly RichTextFragment Empty = new("", Array.Empty<TextStyleSpan>());
}

/// <summary>Contains the operation status, captured fragment and bounded detail.</summary>
public sealed record RichTextResult(RichTextStatus Status, RichTextFragment Fragment, string Error = "");

internal static class RichInput
{
    internal const int MaxBytes = 16777216;
    internal const int MaxText = 1048576;
    internal const int MaxStyles = 4096;
    internal const int MaxDepth = 64;
    internal static readonly UTF8Encoding Utf8 = new(false, true);

    internal static void ValidateText(string text)
    {
        for (var index = 0; index < text.Length; index++)
        {
            var current = text[index];
            if (current == '\0' || char.IsLowSurrogate(current))
                throw new FormatException("Text contains NUL or an unpaired surrogate.");
            if (char.IsHighSurrogate(current) && (++index == text.Length || !char.IsLowSurrogate(text[index])))
                throw new FormatException("Text contains an unpaired surrogate.");
        }
    }

    internal static void ValidateRange(string text, TextRange range)
    {
        if (range.Start < 0 || range.Length < 0 || range.Start > text.Length - range.Length ||
            Split(range.Start) || Split(range.Start + range.Length))
            throw new ArgumentOutOfRangeException(nameof(range));
        bool Split(int position) => position > 0 && position < text.Length && char.IsLowSurrogate(text[position]);
    }

    internal static TextStyleProperties Merge(TextStyleProperties before, TextStyleProperties after) => new(
        after.FontFamily ?? before.FontFamily, after.FontSize ?? before.FontSize,
        after.FontWeight ?? before.FontWeight, after.FontStyle ?? before.FontStyle,
        after.Color ?? before.Color, after.TextDecoration ?? before.TextDecoration);

    internal static void ValidateStyle(TextStyleProperties style)
    {
        if (style.FontFamily?.Length > 256 || style.FontFamily?.IndexOfAny(['\0', ';', ',', '\r', '\n']) >= 0 ||
            style.FontSize is { } size && (!double.IsFinite(size) || size <= 0 || size > 4096) ||
            style.FontWeight is { } weight && (weight < 1 || weight > 1000) ||
            style.FontStyle is { } slant && slant != FontStyle.Normal && slant != FontStyle.Italic ||
            style.Color is { } color && (color.A != 1 || !ByteColor(color.R) || !ByteColor(color.G) || !ByteColor(color.B)))
            throw new UnsupportedContentException("The inline style cannot round-trip through HTML and RTF.");
        static bool ByteColor(float channel) => Math.Abs(channel * 255 - Math.Round(channel * 255)) < 0.0001;
    }

    internal sealed class InlineStyle : Style
    {
        internal InlineStyle(TextStyleProperties value)
        {
            if (value.FontFamily is { } family) FontFamily = family;
            if (value.FontSize is { } size) FontSize = size;
            if (value.FontWeight is { } weight) FontWeight = weight;
            if (value.FontStyle is { } slant) FontStyle = slant;
            if (value.Color is { } color) Color = color;
            if (value.TextDecoration is { } decoration) TextDecoration = decoration;
        }
    }
}

internal sealed class UnsupportedContentException(string message) : FormatException(message);
internal sealed class RichLimitException : FormatException;

internal sealed class FragmentBuilder
{
    private readonly StringBuilder text = new();
    private readonly List<(int Start, int Length, TextStyleProperties Style)> runs = [];
    internal int Length => text.Length;
    internal char Last => text.Length == 0 ? '\0' : text[^1];

    internal void Append(string value, TextStyleProperties style)
    {
        if (value.Length == 0) return;
        if (value.Length > RichInput.MaxText - text.Length) throw new RichLimitException();
        RichInput.ValidateStyle(style);
        if (runs.Count > 0 && EqualityComparer<TextStyleProperties>.Default.Equals(runs[^1].Style, style))
        {
            var last = runs[^1];
            runs[^1] = (last.Start, last.Length + value.Length, style);
        }
        else
        {
            if (runs.Count == RichInput.MaxStyles) throw new RichLimitException();
            runs.Add((text.Length, value.Length, style));
        }
        text.Append(value);
    }

    internal RichTextFragment Build() => new(text.ToString(), runs.Select((run, index) =>
        new TextStyleSpan(index.ToString(System.Globalization.CultureInfo.InvariantCulture),
            new TextRange(run.Start, run.Length), new RichInput.InlineStyle(run.Style))).ToArray());
}
