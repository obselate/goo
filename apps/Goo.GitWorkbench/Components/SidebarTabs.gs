package GooGitWorkbench

import Goo
import System

class SidebarTabs {
    private let showHistory bool
    private let onChanges Action
    private let onHistory Action
    private let keyboardFocus bool

    init(showHistory bool, onChanges Action, onHistory Action, keyboardFocus bool) {
        this.showHistory = showHistory
        this.onChanges = onChanges
        this.onHistory = onHistory
        this.keyboardFocus = keyboardFocus
    }

    private func tab(label string, selected bool, onClick Action) Button -> Button{
        Width: Length.Percent(50),
        Height: GitTheme.PaneHeaderHeight,
        BackgroundColor: if selected {
            GitTheme.Surface
        } else {
            GitTheme.TitleBar
        },
        BorderBottomWidth: 2,
        BorderBottomColor: if selected {
            GitTheme.Accent
        } else {
            GitTheme.Border
        },
        Hover: Style{BackgroundColor: GitTheme.Button},
        Focus: GitTheme.FocusRing(keyboardFocus),
        OnClick: onClick,
        KeyBindings: WorkbenchButtonBindings(onClick),
        Text{
            Content: label,
            FontSize: 13,
            FontWeight: if selected {
                600
            } else {
                400
            },
            Color: if selected {
                GitTheme.Text
            } else {
                GitTheme.Muted
            }
        },
    }

    func render() Blob -> Container{
        Width: Length.Percent(100),
        Height: GitTheme.PaneHeaderHeight,
        FlexDirection: FlexDirection.Row,
        FlexShrink: 0,
        tab("Changes", !showHistory, onChanges),
        tab("History", showHistory, onHistory),
    }
}
