package Goo.RichText

import Goo
import System
import System.Collections.Generic
import System.Net.Mime

/// Reads and writes the supported inline HTML and RTF clipboard subset.
shared class RichTextCodec {
    internal data struct Run(Start int32, Length int32, Style TextStyleProperties) : IEquatable[Run] { }

    /// Decodes a complete representation before returning an owned fragment.
    func Read(contentType string, bytes ReadOnlyMemory[uint8]) RichTextResult {
        ArgumentNullException.ThrowIfNull(contentType, paramName: "contentType")
        if bytes.Length > RichInput.MaxBytes {
            return Failure(RichTextStatus.TooLarge)
        }
        try {
            let type = ContentType(contentType)
            var fragment RichTextFragment
            var status = RichTextStatus.Success
            switch type.MediaType.ToLowerInvariant() {
                case "text/html" {
                    if type.CharSet is {Length: > 0} charset && !charset.Equals(
                        "utf-8",
                        StringComparison.OrdinalIgnoreCase
                    ) {
                        return Failure(RichTextStatus.Unsupported)
                    }
                    fragment = HtmlCodec.Read(RichInput.Utf8.GetString(bytes.Span))
                }
                case "text/rtf", "application/rtf" {
                    fragment = RtfCodec.Read(bytes.Span)
                }
                case "text/plain" {
                    if type.CharSet is {Length: > 0} plainCharset && !plainCharset.Equals(
                        "utf-8",
                        StringComparison.OrdinalIgnoreCase
                    ) {
                        return Failure(RichTextStatus.Unsupported)
                    }
                    fragment = RichTextFragment(RichInput.Utf8.GetString(bytes.Span), Array.Empty[TextStyleSpan]())
                    status = RichTextStatus.PlainText
                }
                default {
                    return Failure(RichTextStatus.Unsupported)
                }
            }
            return RichTextResult(
                if fragment.Text.Length == 0 {
                    RichTextStatus.Empty
                } else {
                    status
                },
                fragment
            )
        } catch (RichLimitException) {
            return Failure(RichTextStatus.TooLarge)
        } catch (error UnsupportedContentException) {
            return Failure(RichTextStatus.UnsupportedContent, error.Message)
        } catch (error FormatException) {
            return Failure(RichTextStatus.Failed, error.Message)
        } catch (ArgumentOutOfRangeException) {
            return Failure(RichTextStatus.TooLarge)
        } catch (error ArgumentException) {
            return Failure(RichTextStatus.Failed, error.Message)
        }
    }

    /// Encodes one publication with UTF-8 plain text, HTML and RTF alternatives.
    /// @remarks Unsupported app-supplied styles throw FormatException. Clipboard failures use
    /// RichTextClipboard results.
    func Write(fragment RichTextFragment) TransferData {
        ArgumentNullException.ThrowIfNull(fragment, paramName: "fragment")
        let runs = Runs(fragment)
        let plain = RichInput.Utf8.GetBytes(fragment.Text)
        let html = RichInput.Utf8.GetBytes(HtmlCodec.Write(fragment.Text, runs))
        let rtf = RichInput.Utf8.GetBytes(RtfCodec.Write(fragment.Text, runs))
        if plain.Length > RichInput.MaxBytes || html.Length > RichInput.MaxBytes || rtf.Length > RichInput.MaxBytes {
            throw RichLimitException()
        }
        return TransferData(
            []TransferRepresentation{
                TransferRepresentation("text/plain;charset=utf-8", plain),
                TransferRepresentation("text/plain", plain),
                TransferRepresentation("text/html", html),
                TransferRepresentation("text/rtf", rtf)
            },
            Array.Empty[Uri]()
        )
    }

    internal func Runs(fragment RichTextFragment) List[Run] {
        let styles = [fragment.Styles.Count]TextStyleProperties
        let endpoints = SortedSet[int32]{0, fragment.Text.Length}
        for index in 0 ... styles.Length {
            let span = fragment.Styles[index]
            if !span.Style.TryGetTextStyle(&styles[index]) {
                throw UnsupportedContentException("The selection contains unsupported inline declarations.")
            }
            RichInput.ValidateStyle(styles[index])
            endpoints.Add(span.Range.Start)
            endpoints.Add(span.Range.Start + span.Range.Length)
        }
        let runs = List[Run]()
        var start = 0
        for end in endpoints {
            if end == start {
                continue
            }
            var style = default(TextStyleProperties)
            for index in 0 ... styles.Length {
                let range_ = fragment.Styles[index].Range
                if range_.Start <= start && range_.Start + range_.Length >= end && range_.Length != 0 {
                    style = RichInput.Merge(style, styles[index])
                }
            }
            if runs.Count > 0 && EqualityComparer[TextStyleProperties].Default.Equals(runs[^1].Style, style) {
                runs[^1] = runs[^1]with{Length = runs[^1].Length + end - start}
            } else {
                runs.Add(Run(start, end - start, style))
            }
            start = end
        }
        return runs
    }

    internal func Failure(status RichTextStatus, error string = "") RichTextResult -> RichTextResult(
        status,
        RichTextFragment.Empty,
        if error.Length <= 1024 {
            error
        } else {
            error[.. 1024]
        }
    )
}
