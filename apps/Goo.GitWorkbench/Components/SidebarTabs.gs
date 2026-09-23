package GooGitWorkbench

import Goo
import System

class SidebarTabs {
    private let showHistory bool
    private let onChanges Action
    private let onHistory Action

    init(showHistory bool, onChanges Action, onHistory Action) {
        this.showHistory = showHistory
        this.onChanges = onChanges
        this.onHistory = onHistory
    }

    private func tab(label string, selected bool, onClick Action) Button -> Button{
        Width: Length.Percent(50),
        Height: 42,
        BackgroundColor: GitTheme.Surface,
        BorderBottomWidth: 2,
        BorderBottomColor: if selected {
            GitTheme.Accent
        } else {
            GitTheme.Border
        },
        Hover: Style{BackgroundColor: GitTheme.Button},
        Focus: Style{BorderBottomColor: GitTheme.Accent},
        OnClick: onClick,
        Text{
            Content: label,
            FontSize: 13,
            Color: if selected {
                GitTheme.Text
            } else {
                GitTheme.Muted
            }
        },
    }

    func render() Blob -> Container{
        Width: Length.Percent(100),
        Height: 42,
        FlexDirection: FlexDirection.Row,
        tab("Changes", !showHistory, onChanges),
        tab("History", showHistory, onHistory),
    }
}
