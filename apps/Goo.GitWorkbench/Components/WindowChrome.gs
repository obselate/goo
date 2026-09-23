package GooGitWorkbench

import Goo
import System

func WorkbenchWindowChrome(window Window) Container -> Window.DragRegion(
    Container{
        Width: Length.Percent(100),
        Height: 32,
        FlexShrink: 0.0,
        FlexDirection: FlexDirection.Row,
        AlignItems: AlignItems.Center,
        Gap: 8,
        PaddingLeft: 16,
        BackgroundColor: GitTheme.Surface,
        BorderBottomWidth: 1,
        BorderBottomColor: GitTheme.Border,
        WindowControl(
            "close",
            Color.Parse("#ff5f57"),
            Color.Parse("#ff827b"),
            () -> {
                window.RequestClose()
            }
        ),
        WindowControl(
            "minimize",
            Color.Parse("#febc2e"),
            Color.Parse("#ffd15c"),
            () -> {
                window.State = WindowState.Minimized
            }
        ),
        WindowControl(
            "maximize",
            Color.Parse("#28c840"),
            Color.Parse("#50dc61"),
            () -> {
                window.State = if window.State == WindowState.Maximized {
                    WindowState.Normal
                } else {
                    WindowState.Maximized
                }
            }
        ),
        Container{Key: "window-chrome-drag-area", Width: 0, Height: Length.Percent(100), FlexGrow: 1.0,},
    }
)

private func WindowControl(key string, color Color, hover Color, action Action) Button -> Button{
    Key: "window-" + key,
    Width: 12,
    Height: 12,
    Padding: 0,
    Margin: 0,
    BorderRadius: 999,
    BackgroundColor: color,
    Hover: Style{BackgroundColor: hover},
    Cursor: Cursor.Pointer,
    Accessibility: Accessibility{Role: AccessibilityRole.Button, Name: key},
    OnClick: action,
}
