package GooGitWorkbench

import Goo
import System.Collections.Generic

class HistoryPane {
    private let commits List[GitCommit]
    private let selectedCommit GitCommit?
    private let onSelect Action[GitCommit]
    private let keyboardFocus bool
    private let viewport ElementHandle

    public init(
        history List[GitCommit],
        selectedCommit GitCommit?,
        onSelect Action[GitCommit],
        keyboardFocus bool,
        viewport ElementHandle
    ) {
        commits = history
        this.selectedCommit = selectedCommit
        this.onSelect = onSelect
        this.keyboardFocus = keyboardFocus
        this.viewport = viewport
    }

    private func commitRow(commit GitCommit) Button {
        let isSelected = Object.ReferenceEquals(selectedCommit, commit)
        return Button{
            Width: Length.Percent(100),
            Height: 62,
            FlexShrink: 0,
            Padding: 10,
            PaddingLeft: 12,
            FlexDirection: FlexDirection.Column,
            AlignItems: AlignItems.FlexStart,
            Gap: 4,
            BackgroundColor: if isSelected {
                GitTheme.Selection
            } else {
                GitTheme.Surface
            },
            BorderLeftWidth: 3,
            BorderLeftColor: if isSelected {
                GitTheme.Accent
            } else {
                GitTheme.Surface
            },
            BorderBottomWidth: 1,
            BorderBottomColor: GitTheme.Border,
            Cursor: Cursor.Pointer,
            Focusable: true,
            TransitionMs: 100.0,
            Hover: Style{
                BackgroundColor: if isSelected {
                    GitTheme.SelectionHover
                } else {
                    GitTheme.RowHover
                }
            },
            Focus: GitTheme.FocusRing(keyboardFocus),
            Accessibility: Accessibility{Role: AccessibilityRole.Button, Name: commit.Subject},
            OnClick: () -> onSelect(commit),
            KeyBindings: WorkbenchButtonBindings(() -> onSelect(commit)),
            Text{
                Width: Length.Percent(100),
                Content: if commit.Subject == "" {
                    "(no commit message)"
                } else {
                    commit.Subject
                },
                FontSize: 13,
                FontWeight: 600,
                Color: if isSelected {
                    GitTheme.Accent
                } else {
                    GitTheme.Text
                },
                TextWrap: TextWrap.NoWrap,
                TextTrimming: TextTrimming.Ellipsis
            },
            Container{
                Width: Length.Percent(100),
                FlexDirection: FlexDirection.Row,
                AlignItems: AlignItems.Center,
                JustifyContent: JustifyContent.SpaceBetween,
                Gap: 8,
                Text{
                    Width: 0,
                    FlexGrow: 1,
                    Content: commit.Author,
                    FontSize: 11,
                    Color: GitTheme.Muted,
                    TextWrap: TextWrap.NoWrap,
                    TextTrimming: TextTrimming.Ellipsis
                },
                Text{
                    Content: commit.Id.Substring(0, 7),
                    FontSize: 11,
                    FontFamily: GitTheme.Mono,
                    Color: GitTheme.Muted,
                    TextWrap: TextWrap.NoWrap
                },
            },
        }
    }

    func render() Blob {
        let rows = List[Blob]()
        if commits.Count == 0 {
            rows.Add(Text{Content: "No commits yet.", FontSize: 12, Color: GitTheme.Muted, Padding: 12})
        } else {
            for commit in commits {
                rows.Add(commitRow(commit))
            }
        }
        return Container{
            Key: "history-pane",
            Width: Length.Percent(100),
            Height: 0,
            FlexGrow: 1,
            MinHeight: 0,
            FlexDirection: FlexDirection.Column,
            BackgroundColor: GitTheme.Surface,
            Container{
                Width: Length.Percent(100),
                Height: 34,
                FlexShrink: 0,
                Padding: 12,
                FlexDirection: FlexDirection.Row,
                AlignItems: AlignItems.Center,
                BorderBottomWidth: 1,
                BorderBottomColor: GitTheme.Border,
                BackgroundColor: GitTheme.Surface,
                Text{Content: "Recent commits", FontSize: 13, FontWeight: 400, Color: GitTheme.Text}
            },
            Container{
                Width: Length.Percent(100),
                Height: 0,
                FlexGrow: 1,
                MinHeight: 0,
                OverflowY: Overflow.Scroll,
                Handle: viewport,
                ScrollbarY: GitTheme.ScrollbarY,
                ScrollbarVisibilityY: ScrollbarVisibility.Always,
                BackgroundColor: GitTheme.Surface,
                Children: rows,
            },
        }
    }
}
