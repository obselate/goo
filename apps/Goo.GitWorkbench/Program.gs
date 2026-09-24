package GooGitWorkbench

import Goo
import System
import System.IO

func Main(args[]string) int32 {
    if args.Length > 1 {
        Console.Error.WriteLine("Usage: dotnet run --project apps/Goo.GitWorkbench -- [repository-directory]")
        return 2
    }
    let directory = if args.Length == 1 {
        args[0]
    } else {
        Directory.GetCurrentDirectory()
    }
    Window.ConfigureApplication("Gituit", "0.1.0", "com.obselate.goo.gitworkbench")
    using let iconFont = FontSource(
        GitTheme.IconFamily,
        400,
        false,
        File.ReadAllBytes(Path.Combine(AppContext.BaseDirectory, "Assets", "MaterialIconsRound.otf"))
    )
    iconFont.Register()
    using let images = ImageSourceCache()
    using let logo = images
        .LoadAsync(Path.Combine(AppContext.BaseDirectory, "Assets", "GituitTitlebar.png"))
        .GetAwaiter()
        .GetResult()
    let root = GitWorkbench(directory, logo)
    let window = Window{
        Title: "Gituit",
        Width: 1200,
        Height: 800,
        MinWidth: 780,
        MinHeight: 560,
        Decorated: false,
        Transparent: true,
        ResizeBand: 8.0F,
        Resizable: true,
        Background: Color.Transparent,
        Root: root,
    }
    root.AttachWindow(window)
    window.Run()
    return 0
}
