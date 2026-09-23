package GooGitWorkbench

import Goo
import System
import System.Collections.Generic

class DetailPane {
    private let selectedChange GitChange?
    private let selectedCommit GitCommit?
    private let detail string
    private let onStage Action
    private let onUnstage Action

    init(selectedChange GitChange?, selectedCommit GitCommit?, detail string, onStage Action, onUnstage Action) {
        this.selectedChange = selectedChange
        this.selectedCommit = selectedCommit
        this.detail = detail
        this.onStage = onStage
        this.onUnstage = onUnstage
    }

    func render() Blob {
        let heading = List[Blob]()
        heading.Add(
            Text{
                Content: if let commit = selectedCommit {
                    "Commit ${commit.Id.Substring(0, 7)}"
                } else if let change = selectedChange {
                    change.Path
                } else {
                    "Diff"
                },
                Width: 0,
                FlexGrow: 1,
                FontSize: 14,
                FontWeight: 600,
                Color: GitTheme.Text,
                TextWrap: TextWrap.NoWrap,
                TextTrimming: TextTrimming.Ellipsis,
            }
        )
        if let change = selectedChange {
            if change.Staged {
                heading.Add(appButton("Unstage", onUnstage))
            } else {
                heading.Add(appButton("Stage", onStage))
            }
        }
        let rows = List[Blob]()
        if selectedChange == nil && selectedCommit == nil {
            rows.Add(
                Container{
                    Width: Length.Percent(100),
                    Height: Length.Percent(100),
                    AlignItems: AlignItems.Center,
                    JustifyContent: JustifyContent.Center,
                    Text{
                        Content: "Select a file or commit to inspect its changes.",
                        FontSize: 13,
                        Color: GitTheme.Muted,
                    },
                }
            )
        } else {
            let preview = if detail.Length > 120000 {
                detail.Substring(0, 120000) + "\n\nOutput truncated."
            } else {
                detail
            }
            let isDiff = selectedCommit != nil || (selectedChange != nil && !selectedChange!!.Untracked)
            for line in preview.Split('\n') {
                let added = isDiff && line.StartsWith("+") && !line.StartsWith("+++")
                let removed = isDiff && line.StartsWith("-") && !line.StartsWith("---")
                let color = if isDiff &&
                    (line.StartsWith("+++") || line.StartsWith("---") || line.StartsWith("diff ")) {
                    GitTheme.Muted
                } else if added {
                    GitTheme.DiffAdded
                } else if removed {
                    GitTheme.DiffRemoved
                } else if isDiff && line.StartsWith("@@") {
                    GitTheme.DiffHunk
                } else {
                    GitTheme.Text
                }
                let background = if added {
                    GitTheme.DiffAddedBackground
                } else if removed {
                    GitTheme.DiffRemovedBackground
                } else {
                    GitTheme.Background
                }
                rows.Add(
                    Text{
                        Width: Length.Percent(100),
                        Padding: 2,
                        Content: line,
                        FontFamily: GitTheme.Mono,
                        FontSize: 12,
                        Color: color,
                        BackgroundColor: background,
                        TextWrap: TextWrap.NoWrap,
                    }
                )
            }
        }

        return Container{
            Width: 0,
            FlexGrow: 1,
            MinWidth: 0,
            Height: Length.Percent(100),
            MinHeight: 0,
            FlexDirection: FlexDirection.Column,
            BackgroundColor: GitTheme.Surface,
            Container{
                Width: Length.Percent(100),
                Padding: 12,
                FlexDirection: FlexDirection.Row,
                AlignItems: AlignItems.Center,
                Gap: 8,
                BorderBottomWidth: 1,
                BorderBottomColor: GitTheme.Border,
                BackgroundColor: GitTheme.Surface,
                Children: heading,
            },
            Container{
                Width: Length.Percent(100),
                Height: 0,
                FlexGrow: 1,
                MinWidth: 0,
                MinHeight: 0,
                FlexDirection: FlexDirection.Column,
                OverflowX: Overflow.Scroll,
                OverflowY: Overflow.Scroll,
                Children: rows,
            },
        }
    }
}
