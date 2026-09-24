package GooGitWorkbench

import Goo
import System.Collections.Generic

class ChangesPane {
    private let changes List[GitChange]
    private let selectedChange GitChange?
    private let onSelect Action[GitChange]
    private let onToggle Action[GitChange]
    private let onToggleAll Action[bool]
    private let keyboardFocus bool

    init(
        changes List[GitChange],
        selectedChange GitChange?,
        onSelect Action[GitChange],
        onToggle Action[GitChange],
        onToggleAll Action[bool],
        keyboardFocus bool
    ) {
        this.changes = changes
        this.selectedChange = selectedChange
        this.onSelect = onSelect
        this.onToggle = onToggle
        this.onToggleAll = onToggleAll
        this.keyboardFocus = keyboardFocus
    }

    private func changeRow(change GitChange, duplicate bool) Container {
        let isSelected = Object.ReferenceEquals(selectedChange, change)

        return Container{
            Key: (
                if duplicate {
                    "worktree:"
                } else {
                    "file:"
                }
            ) +
                change.Path,
            Width: Length.Percent(100),
            Height: 34,
            FlexShrink: 0,
            PaddingLeft: 10,
            PaddingRight: 8,
            FlexDirection: FlexDirection.Row,
            AlignItems: AlignItems.Center,
            Gap: 6,
            BackgroundColor: if isSelected {
                GitTheme.Selection
            } else {
                GitTheme.Surface
            },
            BorderBottomWidth: 1,
            BorderBottomColor: GitTheme.Border,
            Hover: Style{
                BackgroundColor: if isSelected {
                    GitTheme.SelectionHover
                } else {
                    GitTheme.RowHover
                }
            },
            stageCheckbox(
                if change.Staged {
                    AccessibilityChecked.True
                } else {
                    AccessibilityChecked.False
                },
                (
                    if change.Staged {
                        "Unstage "
                    } else {
                        "Stage "
                    }
                ) +
                    change.Path,
                () -> onToggle(change),
                keyboardFocus
            ),
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
                Focus: GitTheme.FocusRing(keyboardFocus),
                Accessibility: Accessibility{Role: AccessibilityRole.Button, Name: change.Path},
                OnClick: () -> onSelect(change),
                KeyBindings: WorkbenchButtonBindings(() -> onSelect(change)),
                Text{
                    Width: Length.Percent(100),
                    Content: change.Path,
                    FontSize: 13,
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
        var staged = 0
        for change in changes {
            if change.Staged {
                staged++
            }
        }
        let allStaged = changes.Count > 0 && staged == changes.Count
        if changes.Count == 0 {
            rows.Add(
                Container{
                    Width: Length.Percent(100),
                    Height: 0,
                    FlexGrow: 1,
                    MinHeight: 0,
                    JustifyContent: JustifyContent.Center,
                    AlignItems: AlignItems.Center,
                    Text{Content: "Working tree clean", FontSize: 13, Color: GitTheme.Muted},
                }
            )
        } else {
            for change in changes {
                rows.Add(changeRow(change, !paths.Add(change.Path)))
            }
        }

        return Container{
            Key: "changes-pane",
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
                PaddingLeft: 10,
                PaddingRight: 8,
                Gap: 6,
                FlexDirection: FlexDirection.Row,
                AlignItems: AlignItems.Center,
                BorderBottomWidth: 1,
                BorderBottomColor: GitTheme.Border,
                BackgroundColor: GitTheme.Surface,
                stageCheckbox(
                    if allStaged {
                        AccessibilityChecked.True
                    } else if staged > 0 {
                        AccessibilityChecked.Mixed
                    } else {
                        AccessibilityChecked.False
                    },
                    if allStaged {
                        "Unstage all files"
                    } else {
                        "Stage all files"
                    },
                    () -> onToggleAll(!allStaged),
                    keyboardFocus,
                    changes.Count > 0
                ),
                Text{
                    Content: if paths.Count == 1 {
                        "1 changed file"
                    } else {
                        paths.Count.ToString() + " changed files"
                    },
                    FontSize: 13,
                    FontWeight: 400,
                    Color: GitTheme.Muted
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
