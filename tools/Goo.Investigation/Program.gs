import System
import System.Collections.Generic
import System.Diagnostics
import System.IO
import System.Linq
import System.Text.Json
import System.Threading.Tasks

class Runner {
    shared {
        public let JsonOptions JsonSerializerOptions = JsonSerializerOptions{WriteIndented: true}
        public let Root string = Path.GetFullPath(Path.Combine(AppContext.BaseDirectory, "../../../../../"))
        let Active HashSet[Process] = HashSet[Process]()
        var Cancelled bool = false

        public func Require(condition bool, message string) {
            if !condition {
                throw InvalidOperationException(message)
            }
        }

        public func Save(path string, value object) {
            Directory.CreateDirectory(Path.GetDirectoryName(path)!!)
            File.WriteAllText(path, JsonSerializer.Serialize(value, JsonOptions) + "\n")
        }

        public func Start(
            command[]string,
            directory string = "",
            environment Dictionary[string, string]? = nil
        ) Process {
            let info = ProcessStartInfo{
                FileName: command[0],
                UseShellExecute: false,
                RedirectStandardOutput: true,
                RedirectStandardError: true
            }
            if directory != "" {
                info.WorkingDirectory = directory
            }
            for argument in command.Skip(1) {
                info.ArgumentList.Add(argument)
            }
            if environment != nil {
                for item in environment {
                    info.Environment[item.Key] = item.Value
                }
            }
            return Own(Process.Start(info)!!)
        }

        public func Stop(process Process) {
            if !process.HasExited {
                process.Kill(entireProcessTree: true)
                Require(process.WaitForExit(8000), "process tree did not stop")
            }
        }

        public func Own(process Process) Process {
            lock Active {
                if Cancelled {
                    Stop(process)
                    process.Dispose()
                    throw OperationCanceledException()
                }
                Active.Add(process)
                process.Disposed += (sender, eventArgs) -> {
                    lock Active {
                        Active.Remove(process)
                    }
                }
            }
            return process
        }

        func Cancel(sender object?, eventArgs ConsoleCancelEventArgs) {
            eventArgs.Cancel = true
            let processes = List[Process]()
            lock Active {
                Cancelled = true
                processes.AddRange(Active)
            }
            for process in processes {
                try {
                    Stop(process)
                } catch (error InvalidOperationException) { }
            }
        }

        public func Run(
            command[]string,
            directory string = "",
            environment Dictionary[string, string]? = nil,
            seconds int32 = 0,
            log string = ""
        ) string {
            using let process = Start(command, directory, environment)
            let stdout = process.StandardOutput.ReadToEndAsync()
            let stderr = process.StandardError.ReadToEndAsync()
            try {
                Require(
                    process.WaitForExit(
                        if seconds == 0 {
                            -1
                        } else {
                            seconds * 1000
                        }
                    ),
                    "process timed out: " + command[0]
                )
            } finally {
                Stop(process)
            }
            Task.WaitAll(stdout, stderr)
            let text = stdout.Result + stderr.Result
            if log != "" {
                File.WriteAllText(log, text)
            }
            Require(process.ExitCode == 0, text)
            return stdout.Result
        }

        func Options(arguments[]string, kind string) Dictionary[string, string] {
            let options = Dictionary[string, string]()
            let allowed = (
                if kind == "grid-scroll" {
                    "--widgets-project --output --skip-build --repeats"
                } else if kind == "hot-reload" {
                    "--runtime --packages --goo-version --diagnostics"
                } else {
                    "--output --rid --package-version --package-source --warm-runs --idle-runs --startup-timeout-seconds " +
                        "--startup-hold-seconds --readiness-delay-seconds --idle-settle-seconds --idle-seconds --publish-only"
                }
            ).Split(' ')
            var index = 0
            while index < arguments.Length {
                let name = arguments[index]
                Require(allowed.Contains(name), "unexpected argument: " + name)
                if name == "--diagnostics" || name == "--skip-build" || name == "--publish-only" {
                    options[name] = "true"
                } else {
                    index++
                    Require(index < arguments.Length, "missing value: " + name)
                    options[name] = arguments[index]
                }
                index++
            }
            return options
        }

        func Main(arguments[]string) int32 {
            Console.CancelKeyPress += Cancel
            try {
                Require(arguments.Length > 0, "expected grid-scroll, hot-reload, foreign-parent, or performance")
                let rest = arguments.Skip(1).ToArray()
                if arguments[0] == "grid-scroll" {
                    GridScroll.Run(Options(rest, arguments[0]))
                } else if arguments[0] == "hot-reload" {
                    HotReload.Run(Options(rest, arguments[0]))
                } else if arguments[0] == "foreign-parent" {
                    ForeignParent.Run(rest)
                } else if arguments[0] == "performance" {
                    Performance.Run(Options(rest, arguments[0]))
                } else {
                    throw ArgumentException("unknown runner: " + arguments[0])
                }
                lock Active {
                    return if Cancelled {
                        130
                    } else {
                        0
                    }
                }
            } catch (error Exception) {
                Console.Error.WriteLine("error: " + error.Message)
                lock Active {
                    return if Cancelled {
                        130
                    } else {
                        1
                    }
                }
            }
        }
    }
}
