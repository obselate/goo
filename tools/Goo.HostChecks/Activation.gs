import System
import System.Collections.Generic
import System.Diagnostics
import System.IO
import System.Linq
import System.Threading
import System.Threading.Tasks

internal partial class Host : IDisposable {
    private let Program string
    private let Root string
    private let Children List[Child] = List[Child]()
    private let EnvironmentValues Dictionary[string, string?] = Dictionary[string, string?]()

    internal init(program string, root string) {
        Program = Path.GetFullPath(program)
        Root = Path.GetFullPath(root)
        HostChecks.Require(!Path.Exists(Root), "Output already exists: " + Root)
        Directory.CreateDirectory(Root)
    }

    private func Command(arguments[]string)[]string {
        HostChecks.Require(File.Exists(Program), "Program does not exist: " + Program)
        let prefix = if Path.GetExtension(Program) == ".dll" {
            []string{Executable("dotnet"), Program}
        } else {
            []string{Program}
        }
        return prefix.Concat(arguments).ToArray()
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
            HostChecks.Require(!Volatile.Read(ref HostChecks.Cancelled), "Activation check cancelled")
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
        HostChecks.Require(lines.SequenceEqual(expected), "Native activation changed: " + string.Join(", ", lines))
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

    public func Dispose() {
        for child in Children {
            child.Dispose()
        }
    }
}

internal class Child : IDisposable {
    internal let Process Process
    private let Output Task[string]
    private let Error Task[string]

    internal init(command[]string, directory string = "", environment Dictionary[string, string?]? = nil) {
        Process = HostChecks.Start(command, environment, directory: directory)
        Output = Process.StandardOutput.ReadToEndAsync()
        Error = Process.StandardError.ReadToEndAsync()
    }

    internal func Text() string -> Output.GetAwaiter().GetResult() + Error.GetAwaiter().GetResult()

    internal func Complete(seconds int32) {
        HostChecks.Require(Process.WaitForExit(seconds * 1000), "App host check timed out")
        HostChecks.Require(Process.ExitCode == 0, "App host check exited ${Process.ExitCode}:\n" + Text())
    }

    public func Dispose() {
        HostChecks.Stop(Process, 10)
        let text = Text()
        if Process.ExitCode != 0 && text.Length > 0 {
            Console.Error.WriteLine(text)
        }
        Process.Dispose()
    }
}
