package GooGitWorkbench

import Goo
import System

func WorkbenchWindowChrome(window Window, keyboardFocus bool, logo ImageSource) Container -> Container{
    Width: Length.Percent(100),
    Height: 32,
    FlexShrink: 0,
    FlexDirection: FlexDirection.Row,
    AlignItems: AlignItems.Center,
    BackgroundColor: GitTheme.TitleBar,
    BorderBottomWidth: 1,
    BorderBottomColor: GitTheme.Border,
    Window.DragRegion(
        Container{
            Key: "window-chrome-drag-area",
            Width: 0,
            Height: Length.Percent(100),
            FlexGrow: 1,
            PaddingLeft: 10,
            FlexDirection: FlexDirection.Row,
            AlignItems: AlignItems.Center,
            Gap: 6,
            Image{Source: logo, Width: 22, Height: 22, FlexShrink: 0},
            Text{Content: "Gituit", FontSize: 12, Color: GitTheme.Muted},
        }
    ),
    WindowControl(
        "minimize",
        "\uE15B",
        GitTheme.Button,
        () -> {
            window.State = WindowState.Minimized
        },
        keyboardFocus
    ),
    WindowControl(
        "maximize",
        "\uE3C6",
        GitTheme.Button,
        () -> {
            window.State = if window.State == WindowState.Maximized {
                WindowState.Normal
            } else {
                WindowState.Maximized
            }
        },
        keyboardFocus
    ),
    WindowControl(
        "close",
        "\uE5CD",
        Color.Parse("#b62324"),
        () -> {
            window.RequestClose()
        },
        keyboardFocus
    ),
}

private func WindowControl(key string, symbol string, hover Color, action Action, keyboardFocus bool) Button -> Button{
    Key: "window-" + key,
    Width: 40,
    Height: Length.Percent(100),
    Padding: 0,
    Margin: 0,
    BorderWidth: 0,
    BorderRadius: 0,
    AlignItems: AlignItems.Center,
    JustifyContent: JustifyContent.Center,
    BackgroundColor: Color.Transparent,
    Hover: Style{BackgroundColor: hover},
    Focus: GitTheme.FocusRing(keyboardFocus),
    Accessibility: Accessibility{Role: AccessibilityRole.Button, Name: key},
    OnClick: action,
    KeyBindings: WorkbenchButtonBindings(action),
    Text{
        Content: symbol,
        FontFamily: GitTheme.IconFamily,
        FontSize: 18,
        FontWeight: 400,
        TextAlign: TextAlign.Center,
        Color: GitTheme.Text,
    },
}
