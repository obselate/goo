package GooGitWorkbench

import Goo
import System

func stageCheckbox(
    checked AccessibilityChecked,
    name string,
    callback Action,
    keyboardFocus bool,
    enabled bool = true,
    busy bool = false
) Button -> Button{
    Width: 28,
    Height: 28,
    FlexShrink: 0,
    Padding: 0,
    AlignItems: AlignItems.Center,
    JustifyContent: JustifyContent.Center,
    BackgroundColor: Color.Transparent,
    BorderWidth: 0,
    BorderRadius: 3,
    Cursor: Cursor.Pointer,
    Disabled: !enabled,
    Focus: GitTheme.FocusRing(keyboardFocus),
    Accessibility: Accessibility{Role: AccessibilityRole.Checkbox, Name: name, Checked: checked, Busy: busy},
    OnClick: callback,
    KeyBindings: WorkbenchButtonBindings(callback),
    Container{
        Width: 16,
        Height: 16,
        BorderRadius: 2,
        BorderWidth: 1,
        BorderColor: if checked != AccessibilityChecked.False {
            GitTheme.Primary
        } else {
            GitTheme.Muted
        },
        BackgroundColor: if checked != AccessibilityChecked.False {
            GitTheme.Primary
        } else {
            Color.Transparent
        },
        AlignItems: AlignItems.Center,
        JustifyContent: JustifyContent.Center,
        GitTheme.Icon(
            if checked == AccessibilityChecked.True {
                "\uE5CA"
            } else if checked == AccessibilityChecked.Mixed {
                "\uE15B"
            } else {
                ""
            },
            14
        ),
    },
}

func appButton(
    label string,
    callback Action,
    enabled bool = true,
    primary bool = false,
    fullWidth bool = false,
    keyboardFocus bool = false
) Button -> Button{
    Disabled: !enabled,
    Width: if fullWidth {
        Length.Percent(100)
    } else {
        Length.Auto
    },
    Padding: 8,
    MinHeight: 34,
    FlexShrink: 0,
    BackgroundColor: if !enabled {
        if primary {
            Color.Parse("#203d60")
        } else {
            GitTheme.Surface
        }
    } else if primary {
        GitTheme.Primary
    } else {
        GitTheme.Button
    },
    BorderWidth: 1,
    BorderColor: if primary && enabled {
        GitTheme.Primary
    } else {
        GitTheme.Border
    },
    BorderRadius: 4,
    Hover: Style{
        BackgroundColor: if primary {
            GitTheme.PrimaryHover
        } else {
            GitTheme.Border
        }
    },
    Focus: GitTheme.FocusRing(keyboardFocus),
    OnClick: callback,
    KeyBindings: WorkbenchButtonBindings(callback),
    Text{
        Content: label,
        FontSize: 13,
        FontWeight: 600,
        TextWrap: TextWrap.NoWrap,
        TextTrimming: TextTrimming.Ellipsis,
        Color: if enabled {
            GitTheme.Text
        } else {
            GitTheme.Muted
        }
    },
}

func appInput(value string, placeholder string, onChange Action[string], keyboardFocus bool) TextEntry -> TextEntry{
    Width: 0,
    FlexGrow: 1,
    Height: 34,
    Padding: 8,
    Value: value,
    Placeholder: placeholder,
    FontSize: 13,
    Color: GitTheme.Text,
    BackgroundColor: GitTheme.Background,
    BorderWidth: 1,
    BorderColor: GitTheme.Border,
    BorderRadius: 4,
    Focus: GitTheme.FocusBorder(keyboardFocus),
    OnChange: onChange,
}
