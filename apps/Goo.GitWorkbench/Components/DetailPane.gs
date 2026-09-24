package GooGitWorkbench

import Goo
import System
import System.Collections.Generic

open class DetailPane : Cell[DetailPaneInput], IDisposable {
    private let viewport ElementHandle = ElementHandle{}
    private let rowBuilder Func[DiffRow, Blob]
    private let onWidth Action[float64]
    private var rows List[DiffRow] = List[DiffRow]()
    private var version int32
    private var viewportWidth float64
    private var contentWidth float64

    public init() {
        viewport.MetricsChanged += trackViewport
        onWidth = (width float64) -> {
            if width > contentWidth {
                contentWidth = width
                Rebuild()
            }
        }
        rowBuilder = (row DiffRow) -> Cell.Mount[DiffLineInput, DiffLine](
            row.Index.ToString(),
            DiffLineInput(row, onWidth)
        )
    }

    private func trackViewport(metrics ElementMetrics) {
        if metrics.IsMounted && metrics.ContentBox.Width != viewportWidth {
            viewportWidth = metrics.ContentBox.Width
            Rebuild()
        }
    }

    /// Releases the viewport metrics subscription.
    public func Dispose() {
        viewport.MetricsChanged -= trackViewport
    }

    private func content(input DetailPaneInput) Blob {
        if input.Change == nil && input.Commit == nil {
            return Container{
                Key: "diff-empty",
                Width: Length.Percent(100),
                Height: 0,
                FlexGrow: 1,
                MinHeight: 0,
                AlignItems: AlignItems.Center,
                JustifyContent: JustifyContent.Center,
                Gap: 8,
                Text{Content: "No changes to display", FontSize: 18, FontWeight: 500, Color: GitTheme.Text},
                Text{
                    Content: "Select a changed file or a commit to view its diff.",
                    FontSize: 13,
                    Color: GitTheme.Muted
                },
            }
        }
        if input.Loading {
            return Container{
                Key: "diff-loading",
                Width: Length.Percent(100),
                Height: 0,
                FlexGrow: 1,
                Padding: 16,
                Text{Content: "Loading diff…", FontSize: 13, Color: GitTheme.Muted},
            }
        }
        if !Object.ReferenceEquals(rows, input.Rows) {
            rows = input.Rows
            contentWidth = 0
            version++
        }
        return Virtual(
            rows,
            Math.Max(1.0, Math.Max(viewportWidth, contentWidth)),
            24.0,
            (row DiffRow) -> row.Index.ToString(),
            rowBuilder
        ){
            Key = "diff-rows-" + version.ToString(),
            Handle = viewport,
            Width = Length.Percent(100),
            Height = 0,
            FlexGrow = 1,
            MinWidth = 0,
            MinHeight = 0,
            FlexDirection = FlexDirection.Column,
            OverflowX = Overflow.Scroll,
            OverflowY = Overflow.Scroll,
        }
    }

    protected override func Build(input DetailPaneInput) Blob {
        let heading = if let change = input.Change {
            change.Path
        } else if let commit = input.Commit {
            if commit.Subject == "" {
                "Commit ${commit.Id.Substring(0, 7)}"
            } else {
                commit.Subject
            }
        } else {
            "Working tree"
        }
        return Container{
            Width: 0,
            FlexGrow: 1,
            MinWidth: 0,
            Height: Length.Percent(100),
            MinHeight: 0,
            FlexDirection: FlexDirection.Column,
            BackgroundColor: GitTheme.Background,
            Container{
                Key: "detail-header",
                Width: Length.Percent(100),
                Height: GitTheme.PaneHeaderHeight,
                FlexShrink: 0,
                PaddingLeft: 14,
                PaddingRight: 14,
                Gap: 10,
                FlexDirection: FlexDirection.Row,
                AlignItems: AlignItems.Center,
                BorderBottomWidth: 1,
                BorderBottomColor: GitTheme.Border,
                BackgroundColor: GitTheme.Surface,
                GitTheme.Icon("\uE24D", 17),
                Text{
                    Width: 0,
                    FlexGrow: 1,
                    MinWidth: 0,
                    Content: heading,
                    FontSize: 13,
                    FontWeight: 500,
                    Color: GitTheme.Text,
                    TextWrap: TextWrap.NoWrap,
                    TextTrimming: TextTrimming.Ellipsis,
                },
                Text{
                    Content: if let change = input.Change {
                        if change.Staged {
                            "Staged changes"
                        } else {
                            "Working tree"
                        }
                    } else if let commit = input.Commit {
                        commit.Id.Substring(0, 7)
                    } else {
                        ""
                    },
                    FontSize: 11,
                    Color: GitTheme.Muted,
                    TextWrap: TextWrap.NoWrap,
                },
            },
            content(input),
        }
    }
}
