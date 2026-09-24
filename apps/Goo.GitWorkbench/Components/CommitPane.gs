package GooGitWorkbench

import Goo
import System

class CommitPane {
    private let summary string
    private let description TextEditorController
    private let branch string
    private let canCommit bool
    private let onSummary Action[string]
    private let onCommit Action
    private let keyboardFocus bool

    init(
        summary string,
        description TextEditorController,
        branch string,
        canCommit bool,
        onSummary Action[string],
        onCommit Action,
        keyboardFocus bool
    ) {
        this.summary = summary
        this.description = description
        this.branch = branch
        this.canCommit = canCommit
        this.onSummary = onSummary
        this.onCommit = onCommit
        this.keyboardFocus = keyboardFocus
    }

    func render() Blob -> Container{
        Key: "commit-form",
        Width: Length.Percent(100),
        Height: 238,
        FlexShrink: 0,
        Padding: 14,
        FlexDirection: FlexDirection.Column,
        Gap: 8,
        BackgroundColor: GitTheme.Surface,
        BorderTopWidth: 1,
        BorderTopColor: GitTheme.Border,
        Container{
            Width: Length.Percent(100),
            Height: 34,
            FlexShrink: 0,
            FlexDirection: FlexDirection.Row,
            appInput(summary, "Summary", onSummary, keyboardFocus),
        },
        TextEditor(description){
            Accessibility = Accessibility{
                Role: AccessibilityRole.TextEditor,
                Name: "Commit description",
                Multiline: true
            },
            Width = Length.Percent(100),
            Height = 0,
            FlexGrow = 1,
            MinHeight = 70,
            Padding = 8,
            Placeholder = "Description (optional)",
            FontSize = 13,
            Color = GitTheme.Text,
            BackgroundColor = GitTheme.Background,
            BorderWidth = 1,
            BorderColor = GitTheme.Border,
            BorderRadius = 4,
            Focus = GitTheme.FocusBorder(keyboardFocus),
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
            true,
            keyboardFocus
        ),
    }
}
