package GooGitWorkbench

import Goo
import System.Collections.Generic

class ChangesPane {
    private let changes List[GitChange]
    private let selectedChange GitChange?
    private let onSelect Action[GitChange]
    private let onToggle Action[GitChange]

    init(changes List[GitChange], selectedChange GitChange?, onSelect Action[GitChange], onToggle Action[GitChange]) {
        this.changes = changes
        this.selectedChange = selectedChange
        this.onSelect = onSelect
        this.onToggle = onToggle
    }

    private func changeRow(change GitChange) Container {
        let isSelected = Object.ReferenceEquals(selectedChange, change)

        return Container{
            Width: Length.Percent(100),
            Height: 36,
            PaddingLeft: 6,
            PaddingRight: 8,
            FlexDirection: FlexDirection.Row,
            AlignItems: AlignItems.Center,
            Gap: 4,
            BackgroundColor: if isSelected {
                GitTheme.Button
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
            Button{
                Width: 28,
                Height: 28,
                Padding: 0,
                FlexDirection: FlexDirection.Row,
                AlignItems: AlignItems.Center,
                JustifyContent: JustifyContent.Center,
                BackgroundColor: Color.Transparent,
                BorderWidth: 0,
                BorderRadius: 3,
                Cursor: Cursor.Pointer,
                Focusable: true,
                Hover: Style{BackgroundColor: GitTheme.Border},
                Focus: Style{OutlineWidth: 1, OutlineColor: GitTheme.Accent},
                Accessibility: Accessibility{
                    Role: AccessibilityRole.Checkbox,
                    Name: if change.Staged {
                        "Unstage " + change.Path
                    } else {
                        "Stage " + change.Path
                    },
                    Checked: if change.Staged {
                        AccessibilityChecked.True
                    } else {
                        AccessibilityChecked.False
                    }
                },
                OnClick: () -> onToggle(change),
                Container{
                    Width: 14,
                    Height: 14,
                    BorderRadius: 2,
                    BorderWidth: 1,
                    BorderColor: if change.Staged {
                        GitTheme.Accent
                    } else {
                        GitTheme.Muted
                    },
                    BackgroundColor: if change.Staged {
                        GitTheme.Accent
                    } else {
                        Color.Transparent
                    },
                    AlignItems: AlignItems.Center,
                    JustifyContent: JustifyContent.Center,
                    Text{
                        Content: if change.Staged {
                            "✓"
                        } else {
                            ""
                        },
                        FontSize: 11,
                        FontWeight: 600,
                        Color: GitTheme.Background
                    }
                },
            },
            Button{
                Width: 0,
                Height: Length.Percent(100),
                FlexGrow: 1,
                Padding: 0,
                FlexDirection: FlexDirection.Row,
                AlignItems: AlignItems.Center,
                JustifyContent: JustifyContent.FlexStart,
                BackgroundColor: Color.Transparent,
                BorderWidth: 0,
                Cursor: Cursor.Pointer,
                Focusable: true,
                Hover: Style{BackgroundColor: GitTheme.Button},
                Focus: Style{OutlineWidth: 1, OutlineColor: GitTheme.Accent},
                Accessibility: Accessibility{Role: AccessibilityRole.Button, Name: change.Path},
                OnClick: () -> onSelect(change),
                Text{
                    Width: Length.Percent(100),
                    Content: change.Path,
                    FontSize: 12,
                    Color: GitTheme.Text,
                    TextWrap: TextWrap.NoWrap,
                    TextTrimming: TextTrimming.Ellipsis
                },
            },
        }
    }

    func render() Blob {
        let rows = List[Blob]()
        let paths = HashSet[string]()
        for change in changes {
            paths.Add(change.Path)
        }
        if changes.Count == 0 {
            rows.Add(
                Container{
                    Width: Length.Percent(100),
                    Height: 0,
                    FlexGrow: 1,
                    MinHeight: 0,
                    JustifyContent: JustifyContent.Center,
                    AlignItems: AlignItems.Center,
                    Text{Content: "Working tree clean", FontSize: 12, Color: GitTheme.Muted},
                }
            )
        } else {
            for change in changes {
                rows.Add(changeRow(change))
            }
        }

        return Container{
            Width: Length.Percent(100),
            Height: 0,
            FlexGrow: 1,
            MinHeight: 0,
            FlexDirection: FlexDirection.Column,
            BackgroundColor: GitTheme.Surface,
            Container{
                Width: Length.Percent(100),
                Height: 36,
                PaddingLeft: 14,
                PaddingRight: 12,
                FlexDirection: FlexDirection.Row,
                AlignItems: AlignItems.Center,
                BorderBottomWidth: 1,
                BorderBottomColor: GitTheme.Border,
                BackgroundColor: GitTheme.Surface,
                Text{
                    Content: if paths.Count == 1 {
                        "1 changed file"
                    } else {
                        paths.Count.ToString() + " changed files"
                    },
                    FontSize: 12,
                    FontWeight: 600,
                    Color: GitTheme.Text
                },
            },
            Container{
                Width: Length.Percent(100),
                Height: 0,
                FlexGrow: 1,
                MinHeight: 0,
                OverflowY: Overflow.Scroll,
                BackgroundColor: GitTheme.Surface,
                Children: rows,
            },
        }
    }
}
