package GooGitWorkbench

import Goo
import System

class GitTheme {
    shared {
        const IconFamily string = "Material Icons Round"
        const SidebarWidth float64 = 320
        const ToolbarHeight float64 = 66
        const PaneHeaderHeight float64 = 40
        let Toolbar Color = Color.Parse("#24292f")
        let TitleBar Color = Color.Parse("#1c2128")
        let BorderStrong Color = Color.Parse("#454c56")
        let Selection Color = Color.Parse("#1c3553")
        let SelectionHover Color = Color.Parse("#24405f")
        let RowHover Color = Color.Parse("#212b36")
        let DiffHunkBackground Color = Color.Parse("#152334")
        let Background Color = Color.Parse("#0d1117")
        let Surface Color = Color.Parse("#161b22")
        let Button Color = Color.Parse("#21262d")
        let Border Color = Color.Parse("#30363d")
        let Text Color = Color.Parse("#e6edf3")
        let Muted Color = Color.Parse("#919ba7")
        let Accent Color = Color.Parse("#58a6ff")
        let Primary Color = Color.Parse("#1f6feb")
        let PrimaryHover Color = Color.Parse("#388bfd")
        let Error Color = Color.Parse("#f85149")
        let DiffAdded Color = Color.Parse("#aff5b4")
        let DiffRemoved Color = Color.Parse("#ffdcd7")
        let DiffHunk Color = Color.Parse("#79c0ff")
        let DiffAddedBackground Color = Color.Parse("#12281c")
        let DiffRemovedBackground Color = Color.Parse("#301c22")
        let SyntaxComment Style = Style{Color: Color.Parse("#919ba7")}
        let SyntaxKeyword Style = Style{Color: Color.Parse("#ff7b72")}
        let SyntaxString Style = Style{Color: Color.Parse("#a5d6ff")}
        let SyntaxConstant Style = Style{Color: Color.Parse("#79c0ff")}
        let SyntaxType Style = Style{Color: Color.Parse("#ffa657")}
        let SyntaxFunction Style = Style{Color: Color.Parse("#d2a8ff")}
        let Mono string = if OperatingSystem.IsWindows() {
            "Consolas"
        } else if OperatingSystem.IsMacOS() {
            "Menlo"
        } else {
            "DejaVu Sans Mono"
        }
        func FocusRing(keyboardFocus bool) Style? -> if keyboardFocus {
            Style{OutlineWidth: 1, OutlineColor: Accent, OutlineOffset: -2}
        } else {
            nil
        }

        func FocusBorder(keyboardFocus bool) Style? -> if keyboardFocus {
            Style{BorderColor: Accent}
        } else {
            nil
        }

        func Icon(symbol string, size float64 = 20) Text -> Text{
            Content: symbol,
            FontFamily: IconFamily,
            FontSize: size,
            FontWeight: 400,
            Color: Text,
            TextAlign: TextAlign.Center,
            FlexShrink: 0,
        }
    }
}
