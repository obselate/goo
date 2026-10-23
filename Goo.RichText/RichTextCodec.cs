using System.Net.Mime;

namespace Goo.RichText;

/// <summary>Reads and writes the supported inline HTML and RTF clipboard subset.</summary>
public static class RichTextCodec
{
    /// <summary>Decodes a complete representation before returning an owned fragment.</summary>
    public static RichTextResult Read(string contentType, ReadOnlyMemory<byte> bytes)
    {
        ArgumentNullException.ThrowIfNull(contentType);
        if (bytes.Length > RichInput.MaxBytes) return Failure(RichTextStatus.TooLarge);
        try
        {
            var type = new ContentType(contentType);
            RichTextFragment fragment;
            var status = RichTextStatus.Success;
            switch (type.MediaType.ToLowerInvariant())
            {
                case "text/html":
                    if (type.CharSet is { Length: > 0 } charset && !charset.Equals("utf-8", StringComparison.OrdinalIgnoreCase))
                        return Failure(RichTextStatus.Unsupported);
                    fragment = HtmlCodec.Read(RichInput.Utf8.GetString(bytes.Span));
                    break;
                case "text/rtf":
                case "application/rtf":
                    fragment = RtfCodec.Read(bytes.Span);
                    break;
                case "text/plain":
                    if (type.CharSet is { Length: > 0 } plainCharset && !plainCharset.Equals("utf-8", StringComparison.OrdinalIgnoreCase))
                        return Failure(RichTextStatus.Unsupported);
                    fragment = new(RichInput.Utf8.GetString(bytes.Span), Array.Empty<TextStyleSpan>());
                    status = RichTextStatus.PlainText;
                    break;
                default: return Failure(RichTextStatus.Unsupported);
            }
            return new(fragment.Text.Length == 0 ? RichTextStatus.Empty : status, fragment);
        }
        catch (RichLimitException) { return Failure(RichTextStatus.TooLarge); }
        catch (UnsupportedContentException error) { return Failure(RichTextStatus.UnsupportedContent, error.Message); }
        catch (FormatException error) { return Failure(RichTextStatus.Failed, error.Message); }
        catch (ArgumentOutOfRangeException) { return Failure(RichTextStatus.TooLarge); }
        catch (ArgumentException error) { return Failure(RichTextStatus.Failed, error.Message); }
    }

    /// <summary>Encodes one publication with UTF-8 plain text, HTML and RTF alternatives.</summary>
    /// <remarks>Unsupported app-supplied styles throw FormatException. Clipboard failures use RichTextClipboard results.</remarks>
    public static TransferData Write(RichTextFragment fragment)
    {
        ArgumentNullException.ThrowIfNull(fragment);
        var runs = Runs(fragment);
        var plain = RichInput.Utf8.GetBytes(fragment.Text);
        var html = RichInput.Utf8.GetBytes(HtmlCodec.Write(fragment.Text, runs));
        var rtf = RichInput.Utf8.GetBytes(RtfCodec.Write(fragment.Text, runs));
        if (plain.Length > RichInput.MaxBytes || html.Length > RichInput.MaxBytes || rtf.Length > RichInput.MaxBytes)
            throw new RichLimitException();
        return new([
            new("text/plain;charset=utf-8", plain), new("text/plain", plain),
            new("text/html", html), new("text/rtf", rtf)], Array.Empty<Uri>());
    }

    internal readonly record struct Run(int Start, int Length, TextStyleProperties Style);

    internal static List<Run> Runs(RichTextFragment fragment)
    {
        var styles = new TextStyleProperties[fragment.Styles.Count];
        var endpoints = new SortedSet<int> { 0, fragment.Text.Length };
        for (var index = 0; index < styles.Length; index++)
        {
            var span = fragment.Styles[index];
            if (!span.Style.TryGetTextStyle(out styles[index]))
                throw new UnsupportedContentException("The selection contains unsupported inline declarations.");
            RichInput.ValidateStyle(styles[index]);
            endpoints.Add(span.Range.Start);
            endpoints.Add(span.Range.Start + span.Range.Length);
        }
        var runs = new List<Run>();
        var start = 0;
        foreach (var end in endpoints)
        {
            if (end == start) continue;
            var style = new TextStyleProperties();
            for (var index = 0; index < styles.Length; index++)
            {
                var range = fragment.Styles[index].Range;
                if (range.Start <= start && range.Start + range.Length >= end && range.Length != 0)
                    style = RichInput.Merge(style, styles[index]);
            }
            if (runs.Count > 0 && EqualityComparer<TextStyleProperties>.Default.Equals(runs[^1].Style, style))
                runs[^1] = runs[^1] with { Length = runs[^1].Length + end - start };
            else
                runs.Add(new(start, end - start, style));
            start = end;
        }
        return runs;
    }

    internal static RichTextResult Failure(RichTextStatus status, string error = "") =>
        new(status, RichTextFragment.Empty, error.Length <= 1024 ? error : error[..1024]);
}
