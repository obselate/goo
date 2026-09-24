package GooGitWorkbench

import Goo
import System
import System.Collections.Generic

open class DetailPane : Cell[DetailPaneInput] {
    private let rowBuilder Func[DiffRow, Blob]
    private var version int32

    public init() {
        rowBuilder = (row DiffRow) -> Cell.Mount[DiffRow, DiffLine](row.Index.ToString(), row)
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
        if version != input.Version {
            version = input.Version
        }
        return VirtualRows(input.Rows, 24.0, (row DiffRow) -> row.Index.ToString(), rowBuilder){
            Key = "diff-rows-" + version.ToString(),
            Handle = input.Viewport,
            Width = Length.Percent(100),
            Height = 0,
            FlexGrow = 1,
            MinWidth = 0,
            MinHeight = 0,
            FlexDirection = FlexDirection.Column,
            OverflowX = Overflow.Hidden,
            OverflowY = Overflow.Scroll,
            ScrollbarY = GitTheme.ScrollbarY,
            ScrollbarVisibilityY = ScrollbarVisibility.Always,
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
                if input.Total > 1 {
                    Container{
                        FlexDirection: FlexDirection.Row,
                        AlignItems: AlignItems.Center,
                        Gap: 2,
                        headerIconButton(
                            "\uE5CB",
                            if input.Commit != nil {
                                "Previous commit (Ctrl+Page Up)"
                            } else {
                                "Previous change (Ctrl+Page Up)"
                            },
                            input.Previous,
                            input.Position > 0,
                            input.KeyboardFocus
                        ),
                        Text{
                            Content: "${input.Position + 1} / ${input.Total}",
                            FontSize: 11,
                            Color: GitTheme.Muted,
                            TextWrap: TextWrap.NoWrap,
                        },
                        headerIconButton(
                            "\uE5CC",
                            if input.Commit != nil {
                                "Next commit (Ctrl+Page Down)"
                            } else {
                                "Next change (Ctrl+Page Down)"
                            },
                            input.Next,
                            input.Position + 1 < input.Total,
                            input.KeyboardFocus
                        ),
                    }
                } else {
                    Container{Width: 0, Height: 0}
                },
            },
            content(input),
        }
    }
}
