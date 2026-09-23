package GooGitWorkbench

import Goo
import System

func appButton(label string, callback Action, enabled bool = true, primary bool = false) Button -> Button{
    Disabled: !enabled,
    Padding: 8,
    BackgroundColor: if !enabled {
        GitTheme.Surface
    } else if primary {
        GitTheme.Success
    } else {
        GitTheme.Button
    },
    BorderWidth: 1,
    BorderColor: if primary && enabled {
        GitTheme.Success
    } else {
        GitTheme.Border
    },
    BorderRadius: 6,
    Hover: Style{
        BackgroundColor: if primary {
            GitTheme.SuccessHover
        } else {
            GitTheme.Border
        }
    },
    Focus: Style{OutlineWidth: 1, OutlineColor: GitTheme.Accent},
    OnClick: callback,
    Text{
        Content: label,
        FontSize: 12,
        Color: if enabled {
            GitTheme.Text
        } else {
            GitTheme.Muted
        }
    },
}

func appInput(value string, placeholder string, onChange Action[string]) TextEntry -> TextEntry{
    Width: 0,
    FlexGrow: 1,
    Height: 32,
    Padding: 8,
    Value: value,
    Placeholder: placeholder,
    FontSize: 12,
    Color: GitTheme.Text,
    BackgroundColor: GitTheme.Background,
    BorderWidth: 1,
    BorderColor: GitTheme.Border,
    BorderRadius: 6,
    Focus: Style{BorderColor: GitTheme.Accent},
    OnChange: onChange,
}
