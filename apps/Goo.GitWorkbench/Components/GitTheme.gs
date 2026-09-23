package GooGitWorkbench

import Goo
import System

class GitTheme {
    shared {
        let Background Color = Color.Parse("#0d1117")
        let Surface Color = Color.Parse("#161b22")
        let Button Color = Color.Parse("#21262d")
        let Border Color = Color.Parse("#30363d")
        let Text Color = Color.Parse("#c9d1d9")
        let Muted Color = Color.Parse("#8b949e")
        let Accent Color = Color.Parse("#58a6ff")
        let Primary Color = Color.Parse("#1f6feb")
        let PrimaryHover Color = Color.Parse("#388bfd")
        let Error Color = Color.Parse("#f85149")
        let DiffAdded Color = Color.Parse("#3fb950")
        let DiffRemoved Color = Color.Parse("#f85149")
        let DiffHunk Color = Color.Parse("#79c0ff")
        let DiffAddedBackground Color = Color.Parse("#12261e")
        let DiffRemovedBackground Color = Color.Parse("#2d171b")
        let Mono string = if OperatingSystem.IsWindows() {
            "Consolas"
        } else if OperatingSystem.IsMacOS() {
            "Menlo"
        } else {
            "DejaVu Sans Mono"
        }
    }
}
