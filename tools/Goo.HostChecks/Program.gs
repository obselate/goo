import System
import System.Collections.Generic
import System.Diagnostics
import System.IO
import System.Linq
import System.Threading.Tasks

class HostChecks {
    shared {
        public let Root string = Path.GetFullPath(Path.Combine(AppContext.BaseDirectory, "../../../../../"))
        let Active HashSet[Process] = HashSet[Process]()
        var Cancelled bool = false

        public func Require(condition bool, message string) {
            if !condition {
                throw InvalidOperationException(message)
            }
        }

        public func Start(command[]string, environment Dictionary[string, string]? = nil, capture bool = true) Process {
            let info = ProcessStartInfo{
                FileName: command[0],
                UseShellExecute: false,
                RedirectStandardOutput: capture,
                RedirectStandardError: capture,
                WorkingDirectory: Root
            }
            for argument in command.Skip(1) {
                info.ArgumentList.Add(argument)
            }
            if environment != nil {
                for entry in environment {
                    info.Environment[entry.Key] = entry.Value
                }
            }
            let process = Process.Start(info)!!
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

        public func Stop(process Process) {
            if !process.HasExited {
                process.Kill(entireProcessTree: true)
                process.WaitForExit()
            }
        }

        public func Run(
            command[]string,
            seconds int32 = 0,
            environment Dictionary[string, string]? = nil,
            required bool = true
        ) CommandResult {
            using let process = Start(command, environment, capture: !required)
            let stdout = if required {
                default(Task[string]?)
            } else {
                process.StandardOutput.ReadToEndAsync()
            }
            let stderr = if required {
                default(Task[string]?)
            } else {
                process.StandardError.ReadToEndAsync()
            }
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
            if required {
                Require(process.ExitCode == 0, "command failed with exit ${process.ExitCode}: " + command[0])
            }
            return CommandResult{
                Code: process.ExitCode,
                Output: if stdout == nil {
                    ""
                } else {
                    stdout.GetAwaiter().GetResult()
                },
                Error: if stderr == nil {
                    ""
                } else {
                    stderr.GetAwaiter().GetResult()
                }
            }
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

        func Main(arguments[]string) int32 {
            Console.CancelKeyPress += Cancel
            try {
                Require(
                    arguments.Length >= 1,
                    "expected macos-notifications, wayland-notifications, macos-data-transfer, or input-build"
                )
                let args = arguments.Skip(1).ToArray()
                if arguments[0] == "macos-notifications" {
                    Notifications.MacOs(args)
                } else if arguments[0] == "wayland-notifications" {
                    Notifications.Wayland(args)
                } else if arguments[0] == "macos-data-transfer" {
                    DataTransfer.Run(args)
                } else if arguments[0] == "input-build" {
                    InputBuild.Run(args)
                } else {
                    throw ArgumentException("unknown check: " + arguments[0])
                }
                lock Active {
                    return if Cancelled {
                        130
                    } else {
                        0
                    }
                }
            } catch (error Exception) {
                Console.Error.WriteLine(error.Message)
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

class CommandResult {
    public var Code int32
    public var Output string = ""
    public var Error string = ""
}

class LoggedProcess : IDisposable {
    public let Process Process
    let stdout StreamWriter
    let stderr StreamWriter
    let readers[]Task

    init(command[]string, output string, error string? = nil, environment Dictionary[string, string]? = nil) {
        stdout = StreamWriter(output){AutoFlush = true}
        stderr = if error == nil {
            stdout
        } else {
            StreamWriter(error){AutoFlush = true}
        }
        try {
            Process = HostChecks.Start(command, environment)
        } catch {
            stdout.Dispose()
            if stderr != stdout {
                stderr.Dispose()
            }
            rethrow
        }
        readers = []Task{Copy(Process.StandardOutput, stdout), Copy(Process.StandardError, stderr)}
    }

    public func Wait(seconds int32) {
        HostChecks.Require(Process.WaitForExit(seconds * 1000), "process timed out")
        Task.WaitAll(readers)
    }

    public func Dispose() {
        try {
            HostChecks.Stop(Process)
            Task.WaitAll(readers)
        } finally {
            Process.Dispose()
            stdout.Dispose()
            if stderr != stdout {
                stderr.Dispose()
            }
        }
    }

    shared {
        async func Copy(reader StreamReader, writer StreamWriter) {
            while true {
                let line = await reader.ReadLineAsync()
                if line == nil {
                    return
                }
                lock writer {
                    writer.WriteLine(line)
                }
            }
        }
    }
}
