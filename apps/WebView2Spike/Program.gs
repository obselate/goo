package WebView2Spike

import Goo
import System

@STAThread
func Main(args[]string) {
    let opaque = Array.IndexOf(args, "--opaque") >= 0
    let output = Array.IndexOf(args, "--selftest")
    if output >= 0 && output + 1 >= args.Length {
        Console.Error.WriteLine("Usage: WebView2Spike [--opaque] [--selftest <outputDir>]")
        Environment.ExitCode = 2
        return
    }
    Native.SetProcessDpiAwarenessContext(nint(-4))
    let host = WebViewHost()
    let window = Window{
        Title: "Goo WebView2 visual hosting spike",
        Size: LayoutSize(900, 600),
        Transparent: !opaque,
        Background: opaque ? SpikeTheme.WindowBackground : Color.Transparent,
        Backdrop: opaque ? WindowBackdrop.None : WindowBackdrop.Blur,
        WindowsBackdrop: WindowsBackdropOptions{Material: WindowsBackdropMaterial.Acrylic},
        Root: SpikeView(host),
    }.Open()
    if output < 0 {
        window.After(0.0, () -> host.Run(window))
        Application.Run(window)
        return
    }
    let test = SelfTest(window, host, args[output + 1], opaque ? "opaque" : "transparent-acrylic")
    window.After(0.0, () -> test.Run())
    Application.Run(window)
    test.Write()
    Environment.ExitCode = test.ExitCode
}
