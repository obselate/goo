package GooGitWorkbench

import Goo
import System
import System.Collections.Generic

open class DiffLine : Cell[DiffLineInput], IDisposable {
    private let textHandle ElementHandle = ElementHandle{}
    private var current DiffLineInput

    public init() {
        textHandle.MetricsChanged += trackWidth
    }

    private func trackWidth(metrics ElementMetrics) {
        if metrics.IsMounted {
            let leading = if current.Row.Kind == DiffRowKind.File {
                16.0
            } else {
                112.0
            }
            current.OnWidth(metrics.BorderBox.Width + leading)
        }
    }

    /// Releases the realized line's text metrics subscription.
    public func Dispose() {
        textHandle.MetricsChanged -= trackWidth
    }

    private func number(value string) Text -> Text{
        Width: 44,
        Height: Length.Percent(100),
        PaddingTop: 3,
        PaddingLeft: 4,
        PaddingRight: 8,
        FlexShrink: 0,
        BackgroundColor: Color.Rgba(0, 0, 0, 28),
        BorderRightWidth: 1,
        BorderRightColor: GitTheme.Border,
        Content: value,
        FontFamily: GitTheme.Mono,
        FontSize: 13,
        Color: GitTheme.Muted,
        TextAlign: TextAlign.Right,
        TextWrap: TextWrap.NoWrap,
    }

    protected override func Build(input DiffLineInput) Blob {
        current = input
        let row = input.Row
        let color = switch row.Kind {
            case DiffRowKind.Added: GitTheme.DiffAdded
            case DiffRowKind.Removed: GitTheme.DiffRemoved
            case DiffRowKind.Hunk: GitTheme.DiffHunk
            case DiffRowKind.Note: GitTheme.Muted
            default: GitTheme.Text
        }
        let background = switch row.Kind {
            case DiffRowKind.Added: GitTheme.DiffAddedBackground
            case DiffRowKind.Removed: GitTheme.DiffRemovedBackground
            case DiffRowKind.Hunk: GitTheme.DiffHunkBackground
            case DiffRowKind.File: GitTheme.Surface
            default: GitTheme.Background
        }
        let text = Text{
            Handle: textHandle,
            Width: Length.Auto,
            FlexShrink: 0,
            PaddingLeft: 4,
            PaddingRight: 8,
            Content: row.Content,
            StyleRanges: syntaxRanges(row.Syntax),
            FontFamily: GitTheme.Mono,
            FontSize: 13,
            FontWeight: if row.Kind == DiffRowKind.File {
                600
            } else {
                400
            },
            Color: color,
            TextWrap: TextWrap.NoWrap,
        }
        if row.Kind == DiffRowKind.File {
            return Container{
                Width: Length.Percent(100),
                Height: 24,
                PaddingLeft: 8,
                PaddingRight: 8,
                FlexDirection: FlexDirection.Row,
                AlignItems: AlignItems.Center,
                BackgroundColor: background,
                BorderBottomWidth: 1,
                BorderBottomColor: GitTheme.Border,
                text,
            }
        }
        return Container{
            Width: Length.Percent(100),
            Height: 24,
            FlexDirection: FlexDirection.Row,
            AlignItems: AlignItems.Center,
            BackgroundColor: background,
            number(row.OldNumber),
            number(row.NewNumber),
            Text{
                Width: 24,
                FlexShrink: 0,
                PaddingLeft: 6,
                Content: row.Marker,
                FontFamily: GitTheme.Mono,
                FontSize: 13,
                Color: color,
                TextWrap: TextWrap.NoWrap,
            },
            text,
        }
    }

    private func syntaxRanges(syntax[]?SyntaxSpan)[]TextStyleRange {
        guard let spans = syntax else {
            return []TextStyleRange{}
        }
        let ranges = List[TextStyleRange]()
        for span in spans {
            let style = switch span.Kind {
                case SyntaxKind.Comment: GitTheme.SyntaxComment
                case SyntaxKind.Keyword: GitTheme.SyntaxKeyword
                case SyntaxKind.String: GitTheme.SyntaxString
                case SyntaxKind.Constant: GitTheme.SyntaxConstant
                case SyntaxKind.Type: GitTheme.SyntaxType
                default: GitTheme.SyntaxFunction
            }
            ranges.Add(TextStyleRange(TextRange(span.Start, span.Length), style))
        }
        return ranges.ToArray()
    }
}
