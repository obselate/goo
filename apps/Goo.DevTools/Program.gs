package GooDevTools

import Goo
import Goo.DevTools.Cli
import Goo.Widgets
import Goo.Widgets.Layout
import System
import System.Diagnostics
import System.Globalization
import System.IO
import System.Linq
import System.Threading
import System.Threading.Tasks

func Main() int32 {
    try {
        let arguments = Environment.GetCommandLineArgs()[1 ..]
        let commandLine = CommandLine.Parse(
            if arguments.Length > 0 && arguments[0] == "--version" {
                arguments
            } else {
                []string{"inspector"}.Concat(arguments).ToArray()
            }
        )
        if commandLine.Has("version") {
            Console.WriteLine("0.29.1")
            return 0
        }
        if commandLine.Has("help") {
            Console.WriteLine(CommandLine.Help("inspector"))
            return 0
        }
        let sample = Environment.GetEnvironmentVariable("GOO_DEVTOOLS_SAMPLE") == "1"
        var selected DiscoveryDescriptor? = nil
        let pidText = commandLine.Get("pid")
        var pid int32? = nil
        if pidText != nil {
            if !int32.TryParse(pidText, out var parsed) || parsed <= 0 {
                throw CliException("--pid must be a positive integer.")
            }
            pid = parsed
        }
        var seconds = 15.0
        let wait = commandLine.Get("wait")
        if wait != nil &&
            (
            !float64.TryParse(wait, NumberStyles.Float, CultureInfo.InvariantCulture, out seconds) || !float64.IsFinite(
                seconds
            ) ||
                seconds <= 0 ||
                seconds > 300
        ) {
            throw CliException("--wait must be a positive number of seconds, up to 300.")
        }
        let project = commandLine.Get("project") ?? Directory.GetCurrentDirectory()
        if !Directory.Exists(project) && !File.Exists(project) {
            throw CliException("Project path does not exist: $project")
        }
        let directory = if Directory.Exists(project) {
            project
        } else {
            Path.GetDirectoryName(Path.GetFullPath(project))!!
        }
        if !sample {
            let started = Stopwatch.GetTimestamp()
            while selected == nil && Stopwatch.GetElapsedTime(started).TotalSeconds < seconds {
                selected = Discovery.Select(
                    Discovery.Scan(directory),
                    pid,
                    commandLine.Get("pipe"),
                    commandLine.Get("app"),
                    commandLine.Get("window"),
                    commandLine.Has("latest")
                )
                if selected == nil {
                    Thread.Sleep(100)
                }
            }
        }
        return RunWindow(selected, sample)
    } catch (exception CliException) {
        Console.Error.WriteLine("goo inspector: ${exception.Message}")
        return 2
    }
}

private func RunWindow(descriptor DiscoveryDescriptor?, sample bool) int32 {
    Window.ConfigureApplication("Goo DevTools", "0.29.1", "io.github.obselate.goo.devtools")
    using let sansRegular = RegisterFont("Vend Sans", "VendSans-VariableFont_wght.ttf", 400)
    using let sansMedium = RegisterFont("Vend Sans", "VendSans-VariableFont_wght.ttf", 500)
    using let sansSemibold = RegisterFont("Vend Sans", "VendSans-VariableFont_wght.ttf", 600)
    using let mono = RegisterFont("JetBrains Mono", "JetBrainsMono-VariableFont_wght.ttf", 400)
    let transport = if sample {
        DiagnosticTransport(SampleDiagnosticTransport{})
    } else if let endpoint = descriptor {
        DiagnosticTransport(
            DiagnosticPipeTransport(
                DiagnosticEndpoint{
                    ProcessId: endpoint.ProcessId,
                    ProcessName: endpoint.ProcessName,
                    PipeName: endpoint.Pipe,
                    Protocol: DiagnosticProtocolVersion{Major: 1, Minor: 0},
                    Transport: endpoint.Transport,
                    DescriptorPath: endpoint.DescriptorPath,
                    ApplicationName: endpoint.ApplicationName ?? "",
                    WindowTitle: endpoint.WindowTitle ?? "",
                    StartedAt: endpoint.StartedAt?.ToString("O") ?? ""
                }
            )
        )
    } else {
        DiagnosticTransport(DiagnosticDisconnectedTransport{})
    }
    let session = DiagnosticSession(transport, sample)
    let root = DevToolsCell(session)
    let window = Window{
        Title: "Goo DevTools",
        Width: 1540,
        Height: 960,
        MinWidth: 800,
        MinHeight: 560,
        Transparent: true,
        ResizeBand: 8.0F,
        Resizable: true,
        VSync: true,
        Background: Color.Transparent,
        Root: root,
    }
    WindowChrome.ReplaceTitlebar(window)
    Theme.Attach(window, Theme.Ink)
    root.AttachWindow(window)
    if sample || descriptor != nil {
        session.Connect()
        session.Pump()
    }
    window.Run()
    return 0
}

private func RegisterFont(family string, file string, weight int32) FontSource {
    let font = FontSource(
        family,
        weight,
        false,
        File.ReadAllBytes(Path.Combine(AppContext.BaseDirectory, "Fonts", file)),
        0u,
        []FontVariation{FontVariation("wght", float32(weight))}
    )
    font.Register()
    return font
}
