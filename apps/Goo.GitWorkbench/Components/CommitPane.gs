package GooGitWorkbench

import Goo
import System

class CommitPane {
    private let summary string
    private let description TextEditorController
    private let branch string
    private let canCommit bool
    private let notice string
    private let noticeIsError bool
    private let onSummary Action[string]
    private let onCommit Action

    init(
        summary string,
        description TextEditorController,
        branch string,
        canCommit bool,
        notice string,
        noticeIsError bool,
        onSummary Action[string],
        onCommit Action
    ) {
        this.summary = summary
        this.description = description
        this.branch = branch
        this.canCommit = canCommit
        this.notice = notice
        this.noticeIsError = noticeIsError
        this.onSummary = onSummary
        this.onCommit = onCommit
    }

    func render() Blob -> Container{
        Width: Length.Percent(100),
        Height: 255,
        Padding: 12,
        FlexDirection: FlexDirection.Column,
        Gap: 8,
        BackgroundColor: GitTheme.Surface,
        BorderTopWidth: 1,
        BorderTopColor: GitTheme.Border,
        Container{
            Width: Length.Percent(100),
            Height: 32,
            FlexDirection: FlexDirection.Row,
            appInput(summary, "Summary", onSummary),
        },
        TextEditor(description){
            Width = Length.Percent(100),
            Height = 0,
            FlexGrow = 1,
            MinHeight = 70,
            Padding = 8,
            Placeholder = "Description (optional)",
            FontSize = 12,
            Color = GitTheme.Text,
            BackgroundColor = GitTheme.Background,
            BorderWidth = 1,
            BorderColor = GitTheme.Border,
            BorderRadius = 6,
            Focus = Style{BorderColor: GitTheme.Accent},
        },
        Text{
            Content: notice,
            Height: 17,
            FontSize: 11,
            Color: if noticeIsError {
                GitTheme.Error
            } else {
                GitTheme.Muted
            }
        },
        appButton(
            if branch == "" {
                "Commit staged"
            } else {
                "Commit to $branch"
            },
            onCommit,
            canCommit,
            true,
            true
        ),
    }
}
