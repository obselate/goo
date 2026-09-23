package GooGitWorkbench

import Goo
import System.Collections.Generic

class ChangesPane {
    private let changes List[GitChange]
    private let selectedChange GitChange?
    private let onSelect Action[GitChange]

    init(changes List[GitChange], selectedChange GitChange?, onSelect Action[GitChange]) {
        this.changes = changes
        this.selectedChange = selectedChange
        this.onSelect = onSelect
    }

    private func changeRow(change GitChange) Button -> Button{
        Width: Length.Percent(100),
        Height: 34,
        Padding: 8,
        FlexDirection: FlexDirection.Row,
        JustifyContent: JustifyContent.FlexStart,
        AlignItems: AlignItems.Center,
        Gap: 8,
        BackgroundColor: if Object.ReferenceEquals(selectedChange, change) {
            GitTheme.Button
        } else {
            GitTheme.Surface
        },
        BorderWidth: if Object.ReferenceEquals(selectedChange, change) {
            1
        } else {
            0
        },
        BorderColor: if Object.ReferenceEquals(selectedChange, change) {
            GitTheme.Accent
        } else {
            GitTheme.Surface
        },
        BorderRadius: 3,
        Hover: Style{BackgroundColor: GitTheme.Button},
        OnClick: () -> {
            onSelect(change)
        },
        Text{
            Content: change.Code,
            Width: 18,
            FontSize: 12,
            Color: if Object.ReferenceEquals(selectedChange, change) {
                GitTheme.Accent
            } else {
                GitTheme.Muted
            }
        },
        Text{
            Content: change.Path,
            Width: 0,
            FlexGrow: 1,
            MinWidth: 0,
            FontSize: 12,
            Color: GitTheme.Text,
            TextWrap: TextWrap.NoWrap
        },
    }

    private func sectionHeader(label string, count int32) Container -> Container{
        Width: Length.Percent(100),
        Padding: 9,
        FlexDirection: FlexDirection.Row,
        AlignItems: AlignItems.Center,
        JustifyContent: JustifyContent.SpaceBetween,
        BackgroundColor: GitTheme.Background,
        Text{Content: label, FontSize: 11, FontWeight: 600, Color: GitTheme.Muted},
        Text{Content: count.ToString(), FontSize: 11, Color: GitTheme.Muted},
    }

    private func emptySection(message string) Text -> Text{
        Content: message,
        Width: Length.Percent(100),
        Padding: 10,
        FontSize: 12,
        Color: GitTheme.Muted
    }

    func render() Blob {
        var stagedCount = 0
        var unstagedCount = 0
        for change in changes {
            if change.Staged {
                stagedCount++
            } else {
                unstagedCount++
            }
        }

        let rows = List[Blob]()
        rows.Add(
            Container{
                Width: Length.Percent(100),
                Padding: 12,
                FlexDirection: FlexDirection.Row,
                AlignItems: AlignItems.Center,
                JustifyContent: JustifyContent.SpaceBetween,
                BorderWidth: 1,
                BorderColor: GitTheme.Border,
                Text{Content: "Changes", FontSize: 14, FontWeight: 600, Color: GitTheme.Text},
                Text{Content: changes.Count.ToString(), FontSize: 12, Color: GitTheme.Muted},
            }
        )

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
            rows.Add(sectionHeader("Staged", stagedCount))
            if stagedCount == 0 {
                rows.Add(emptySection("No staged changes"))
            } else {
                for change in changes {
                    if change.Staged {
                        rows.Add(changeRow(change))
                    }
                }
            }

            rows.Add(sectionHeader("Unstaged", unstagedCount))
            if unstagedCount == 0 {
                rows.Add(emptySection("No unstaged changes"))
            } else {
                for change in changes {
                    if !change.Staged {
                        rows.Add(changeRow(change))
                    }
                }
            }
        }

        return Container{
            Width: Length.Percent(100),
            Height: 0,
            FlexGrow: 1,
            MinHeight: 0,
            FlexDirection: FlexDirection.Column,
            OverflowY: Overflow.Scroll,
            BackgroundColor: GitTheme.Surface,
            Children: rows,
        }
    }
}
