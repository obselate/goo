import System
import System.Diagnostics
import System.IO
import System.Linq

let arguments = Environment.GetCommandLineArgs().Skip(1).ToArray()
try {
    Checks.Execute(arguments)
} catch (error Exception) {
    Console.Error.WriteLine(error.Message)
    Environment.ExitCode = 1
}

internal shared partial class Checks {
    private let Root string = Path.GetFullPath(Path.Combine(AppContext.BaseDirectory, "../../../../.."))

    internal func Execute(arguments[]string) {
        Require(arguments.Length > 0, "Expected release, onboarding, accessibility, android or text-rebuild")
        let rest = arguments.Skip(1).ToArray()
        if arguments[0] == "release" {
            Release(rest)
        } else if arguments[0] == "onboarding" {
            Onboarding()
        } else if arguments[0] == "accessibility" {
            Accessibility(rest)
        } else if arguments[0] == "android" {
            Android(rest)
        } else if arguments[0] == "text-rebuild" {
            TextRebuild(rest)
        } else {
            throw ArgumentException("Unknown repository check: " + arguments[0])
        }
    }

    private func Require(condition bool, message string) {
        if !condition {
            throw InvalidDataException(message)
        }
    }

    private func Run(executable string, arguments[]string) string {
        let start = ProcessStartInfo(executable)
        start.WorkingDirectory = Root
        start.RedirectStandardOutput = true
        start.RedirectStandardError = true
        for argument in arguments {
            start.ArgumentList.Add(argument)
        }
        using let process = Process.Start(start) ?? throw IOException("Could not start " + executable)
        let output = process.StandardOutput.ReadToEndAsync()
        let error = process.StandardError.ReadToEndAsync()
        process.WaitForExit()
        Require(process.ExitCode == 0, executable + ": " + error.Result)
        return output.Result
    }
}
