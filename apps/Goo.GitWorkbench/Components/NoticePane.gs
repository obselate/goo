package GooGitWorkbench

import Goo
import System

func WorkbenchNotice(message string, isError bool, onDismiss Action, keyboardFocus bool) Container -> Container{
    Key: "workbench-notice",
    Width: Length.Percent(100),
    Height: if isError {
        128
    } else {
        56
    },
    FlexShrink: 0,
    Padding: 12,
    FlexDirection: FlexDirection.Row,
    AlignItems: AlignItems.Stretch,
    Gap: 8,
    BackgroundColor: GitTheme.Surface,
    BorderTopWidth: 1,
    BorderTopColor: GitTheme.Border,
    Container{
        Width: 0,
        FlexGrow: 1,
        MinWidth: 0,
        Height: Length.Percent(100),
        OverflowX: Overflow.Hidden,
        OverflowY: Overflow.Scroll,
        Text{
            Width: Length.Percent(100),
            Content: message,
            FontSize: 12,
            Color: if isError {
                GitTheme.Error
            } else {
                GitTheme.Muted
            },
            TextWrap: TextWrap.Wrap,
            FlexShrink: 0,
        },
    },
    Button{
        Width: 24,
        Height: 24,
        Padding: 0,
        BackgroundColor: Color.Transparent,
        Hover: Style{BackgroundColor: GitTheme.Button},
        Focus: GitTheme.FocusRing(keyboardFocus),
        Accessibility: Accessibility{Role: AccessibilityRole.Button, Name: "Dismiss message"},
        OnClick: onDismiss,
        KeyBindings: WorkbenchButtonBindings(onDismiss),
        GitTheme.Icon("\uE5CD", 16),
    },
}
