import System
import System.Collections.Generic
import System.Diagnostics
import System.IO
import System.Linq
import System.Threading
import System.Threading.Tasks

try {
    let args = Environment.GetCommandLineArgs().Skip(1).ToArray()
    Host.Require(
        args.Length == 3,
        "Expected app-host, desktop, macos, macos-host, placement or wayland, PROGRAM and OUTPUT"
    )
    using let host = Host(args[1], args[2])
    Console.CancelKeyPress += host.Cancel
    try {
        if args[0] == "app-host" {
            host.AppHost()
        } else if args[0] == "desktop" {
            host.Desktop()
        } else if args[0] == "macos" {
            host.Macos()
        } else if args[0] == "macos-host" {
            host.MacosHost()
        } else if args[0] == "placement" {
            host.Placement()
        } else if args[0] == "wayland" {
            host.Wayland()
        } else {
            throw ArgumentException("Unknown activation check: " + args[0])
        }
    } finally {
        Console.CancelKeyPress -= host.Cancel
    }
} catch (error Exception) {
    Console.Error.WriteLine(error.Message)
    if Environment.ExitCode != 130 {
        Environment.ExitCode = 1
    }
}

internal partial class Host : IDisposable {
    private let Program string
    private let Root string
    private let Children List[Child] = List[Child]()
    private let EnvironmentValues Dictionary[string, string?] = Dictionary[string, string?]()
    private var Cancelled bool = false

    internal init(program string, root string) {
        Program = Path.GetFullPath(program)
        Root = Path.GetFullPath(root)
        Require(!Path.Exists(Root), "Output already exists: " + Root)
        Directory.CreateDirectory(Root)
    }

    shared {
        internal func Require(condition bool, message string) {
            if !condition {
                throw InvalidOperationException(message)
            }
        }
    }

    private func Command(arguments[]string)[]string {
        Require(File.Exists(Program), "Program does not exist: " + Program)
        let prefix = if Path.GetExtension(Program) == ".dll" {
            []string{Executable("dotnet"), Program}
        } else {
            []string{Program}
        }
        return prefix.Concat(arguments).ToArray()
    }

    private func Start(
        command[]string,
        directory string = "",
        environment Dictionary[string, string?]? = nil,
        capture bool = true
    ) Child {
        lock Children {
            Require(!Cancelled, "Activation check cancelled")
            let child = Child(command, directory, environment ?? EnvironmentValues, capture)
            Children.Add(child)
            return child
        }
    }

    private func Run(
        command[]string,
        seconds int32,
        environment Dictionary[string, string?]? = nil,
        capture bool = false
    ) string {
        let child = Start(command, environment: environment, capture: capture)
        child.Complete(seconds)
        return child.Text()
    }

    private func WaitFile(
        path string,
        seconds int32,
        child Child? = nil,
        error string = "",
        interval int32 = 20
    ) string {
        let timer = Stopwatch.StartNew()
        while true {
            lock Children {
                Require(!Cancelled, "Activation check cancelled")
            }
            if error != "" && File.Exists(error) {
                throw InvalidOperationException(File.ReadAllText(error))
            }
            if File.Exists(path) {
                return path
            }
            if child != nil && child.Process.HasExited {
                child.Complete(30)
                throw InvalidOperationException("Receiver exited before " + Path.GetFileName(path))
            }
            if timer.Elapsed.TotalSeconds >= seconds {
                throw TimeoutException(Path.GetFileName(path))
            }
            Thread.Sleep(interval)
        }
    }

    private func Observed(directory string, index int32, kind string, initial bool, target string, seconds int32 = 25) {
        let path = WaitFile(Path.Combine(directory, "$index.event"), seconds, error: Path.Combine(directory, "error"))
        let expected = []string{
            kind,
            if initial {
                "initial"
            } else {
                "warm"
            },
            target
        }
        let lines = File.ReadAllLines(path)
        Require(lines.SequenceEqual(expected), "Native activation changed: " + string.Join(", ", lines))
    }

    private func Touch(path string) {
        using let file = File.Open(path, FileMode.OpenOrCreate)
    }

    private func Runtime() {
        let runtime = Path.Combine(Root, "r")
        Directory.CreateDirectory(runtime)
        if !OperatingSystem.IsWindows() {
            File.SetUnixFileMode(runtime, UnixFileMode.UserRead | UnixFileMode.UserWrite | UnixFileMode.UserExecute)
        }
        EnvironmentValues["XDG_RUNTIME_DIR"] = runtime
    }

    private func Executable(name string) string {
        let filename = if OperatingSystem.IsWindows() {
            name + ".exe"
        } else {
            name
        }
        for directory in(Environment.GetEnvironmentVariable("PATH") ?? "").Split(Path.PathSeparator) {
            let path = Path.Combine(directory, filename)
            if File.Exists(path) {
                return Path.GetFullPath(path)
            }
        }
        throw FileNotFoundException("Required executable: " + name)
    }

    internal func Cancel(sender object?, args ConsoleCancelEventArgs) {
        args.Cancel = true
        Environment.ExitCode = 130
        lock Children {
            Cancelled = true
            for child in Children {
                child.Stop()
            }
        }
    }

    public func Dispose() {
        lock Children {
            for child in Children {
                child.Dispose()
            }
        }
    }
}

internal class Child : IDisposable {
    internal let Process Process
    private let Output Task[string]
    private let Error Task[string]

    internal init(command[]string, directory string, environment Dictionary[string, string?], capture bool) {
        let info = ProcessStartInfo(command[0])
        info.RedirectStandardOutput = capture
        info.RedirectStandardError = capture
        if directory != "" {
            info.WorkingDirectory = directory
        }
        for argument in command.Skip(1) {
            info.ArgumentList.Add(argument)
        }
        for entry in environment {
            if entry.Value == nil {
                info.Environment.Remove(entry.Key)
            } else {
                info.Environment[entry.Key] = entry.Value
            }
        }
        Process = System.Diagnostics.Process.Start(info) ?? throw IOException("Could not start " + command[0])
        Output = if capture {
            Process.StandardOutput.ReadToEndAsync()
        } else {
            Task.FromResult("")
        }
        Error = if capture {
            Process.StandardError.ReadToEndAsync()
        } else {
            Task.FromResult("")
        }
    }

    internal func Text() string -> Output.GetAwaiter().GetResult() + Error.GetAwaiter().GetResult()

    internal func Complete(seconds int32) {
        Host.Require(Process.WaitForExit(seconds * 1000), "App host check timed out")
        Host.Require(Process.ExitCode == 0, "App host check exited ${Process.ExitCode}:\n" + Text())
    }

    internal func Stop() {
        if !Process.HasExited {
            Process.Kill(entireProcessTree: true)
        }
        Host.Require(Process.WaitForExit(10000), "App host process did not stop")
    }

    public func Dispose() {
        Stop()
        let text = Text()
        if Process.ExitCode != 0 && text.Length > 0 {
            Console.Error.WriteLine(text)
        }
        Process.Dispose()
    }
}
