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
    Window.ConfigureApplication("Goo Git workbench", "0.1.0", "com.obselate.goo.gitworkbench")
    Window{Title: "Git workbench", Width: 1200, Height: 800, Root: GitWorkbench(directory)}.Run()
    return 0
}
