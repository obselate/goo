import System
import System.Collections.Generic
import System.Diagnostics
import System.IO
import System.Linq

try {
    Repo.Execute(Environment.GetCommandLineArgs().Skip(1).ToArray())
} catch (error Exception) {
    Console.Error.WriteLine(error.Message)
    Environment.ExitCode = 1
}

internal shared partial class Repo {
    private let Root string = Path.GetFullPath(Path.Combine(AppContext.BaseDirectory, "../../../../.."))
    private let Lanes[]string = []string{
        "lint",
        "api",
        "gestures",
        "spell-check",
        "metadata",
        "core",
        "image",
        "devtools",
        "docs",
        "docs-android"
    }

    internal func Execute(arguments[]string) {
        let verb = if arguments.Length == 0 {
            "help"
        } else {
            arguments[0]
        }
        if verb is not("help" or "--help" or "-h" or "doctor" or "build" or "check" or "docs" or "pack" or "site") {
            throw ArgumentException("Unknown command: " + verb + ". Use --help.")
        }
        if (verb is "help" or "--help" or "-h") || arguments.Skip(1).Any(a -> a == "--help" || a == "-h") {
            Console.WriteLine(
                "Usage: dotnet run --project tools/Goo.Repo -- <command>\n" +
                    "  doctor                 Check tools and print fix commands\n" +
                    "  build                  Build the desktop framework\n" +
                    "  check --list           List CI check lanes\n" +
                    "  check <lane>           Run one CI check lane\n" +
                    "  docs [--check]         Generate or compare desktop docs\n" +
                    "  docs --android [--check]  Generate or compare Android docs\n" +
                    "  pack                   Build pinned SDL inputs and pack Goo\n" +
                    "  site                   Build the website into artifacts/site\n" +
                    "Every command accepts --help. On Linux, GOO_BUILD_LOCK enables a shared flock build lock."
            )
            return
        }
        let rest = arguments.Skip(1).ToArray()
        if verb == "check" {
            if rest.Length != 1 || rest[0] != "--list" && !Lanes.Contains(rest[0]) {
                throw ArgumentException("Expected check <lane> or check --list.")
            }
            if rest[0] == "--list" {
                Console.WriteLine(string.Join("\n", Lanes))
                return
            }
        } else if verb == "docs" {
            if rest.Any(a -> a is not("--check" or "--android")) || rest.Distinct().Count() != rest.Length {
                throw ArgumentException("Expected docs [--android] [--check].")
            }
        } else if rest.Length != 0 {
            throw ArgumentException(verb + " does not accept arguments.")
        }
        Directory.SetCurrentDirectory(Root)
        if verb == "doctor" {
            Doctor()
            return
        }
        let lockPath = Environment.GetEnvironmentVariable("GOO_BUILD_LOCK") ?? ""
        if OperatingSystem.IsLinux() && lockPath.Length != 0 && Environment.GetEnvironmentVariable(
            "GOO_REPO_BUILD_LOCK"
        ) != "1" {
            Environment.SetEnvironmentVariable("GOO_REPO_BUILD_LOCK", "1")
            Run(
                "flock",
                []string{"--close", lockPath, "dotnet", typeof(Repo).Assembly.Location}.Concat(arguments).ToArray()
            )
            return
        }
        let temporary = Path.Combine(Root, "artifacts", "repo-run-" + Guid.NewGuid().ToString("N"))
        Directory.CreateDirectory(temporary)
        Environment.SetEnvironmentVariable("GOO_REPO_TEMP", temporary)
        try {
            if verb == "build" {
                Build("Goo")
            } else if verb == "check" {
                Check(rest[0])
            } else if verb == "docs" {
                Docs(rest.Contains("--check"), rest.Contains("--android"))
            } else if verb == "pack" {
                Pack()
            } else if verb == "site" {
                Tool("Goo.Site", []string{Root, "artifacts/site"})
            }
        } finally {
            Directory.Delete(temporary, true)
        }
    }

    private func Run(executable string, arguments[]string) {
        Console.WriteLine("+ " + executable + " " + string.Join(" ", arguments))
        let start = ProcessStartInfo(executable)
        start.WorkingDirectory = Root
        if executable == "bash" && arguments.Length != 0 &&
            (arguments[0] is ".github/scripts/build-sdl-linux-x64.sh" or ".github/scripts/fetch-sdl-win-x64.sh") {
            start.Environment["TMPDIR"] = Environment.GetEnvironmentVariable("GOO_REPO_TEMP")
        }
        for argument in arguments {
            start.ArgumentList.Add(argument)
        }
        using let process = Process.Start(start) ?? throw IOException("Could not start " + executable)
        process.WaitForExit()
        if process.ExitCode != 0 {
            throw InvalidOperationException(executable + " exited with code " + process.ExitCode.ToString())
        }
    }

    private func Build(project string) -> Run(
        "dotnet",
        []string{"build", Project(project), "-c", "Release", "-p:TreatWarningsAsErrors=true"}
    )

    private func Project(name string) string -> name + "/" + Path.GetFileName(name) + ".gsproj"

    private func Tool(name string, arguments[]string) -> Run(
        "dotnet",
        []string{"run", "--project", "tools/" + name, "-c", "Release", "--"}.Concat(arguments).ToArray()
    )

    private func Test(name string) -> Run(
        "dotnet",
        []string{"test", Project("tests/" + name), "-c", "Release", "-p:TreatWarningsAsErrors=true"}
    )

    private func Check(lane string) {
        if lane == "lint" {
            Build("tools/Goo.Gslint")
            Run(
                "dotnet",
                []string{
                    File.ReadAllText(Path.Combine(AppContext.BaseDirectory, "formatter.path")).Trim(),
                    "--check",
                    "tools/Goo.Gslint/Program.gs"
                }
            )
            Tool("Goo.Gslint.Tests", []string{})
            Tool(
                "Goo.Gslint",
                []string{
                    "--strict",
                    "--severity",
                    "GL0005=none",
                    "--severity",
                    "GL0006=none",
                    "--severity",
                    "GL0001=none",
                    "Goo",
                    "Goo.Audio",
                    "tests"
                }
            )
            Tool(
                "Goo.Gslint",
                []string{
                    "--strict",
                    "--severity",
                    "GL0005=none",
                    "--severity",
                    "GL0006=none",
                    "apps",
                    "templates",
                    "plugins/goo/reference/templates"
                }
            )
        } else if lane == "api" {
            BuildAndroid()
            Test("Goo.ApiContractTests")
        } else if lane == "gestures" {
            Test("Goo.Gestures.Tests")
        } else if lane == "spell-check" {
            Environment.SetEnvironmentVariable("GOO_REQUIRE_HUNSPELL", "1")
            Test("Goo.SpellCheckTests")
        } else if lane == "metadata" {
            Tool("Goo.RepositoryChecks", []string{"onboarding"})
        } else if lane == "image" {
            Test("Goo.ImageLoadingTests")
        } else if lane == "devtools" {
            Build("tools/Goo.DevTools.Cli")
            Test("Goo.DevTools.Cli.Tests")
        } else if lane == "docs" {
            Docs(true, false)
        } else if lane == "docs-android" {
            Docs(true, true)
        } else if lane == "core" {
            if !OperatingSystem.IsLinux() {
                throw PlatformNotSupportedException("The core CI lane needs Linux. Use check gestures on this host.")
            }
            if !File.Exists("artifacts/native/libSDL3.so") {
                Run("bash", []string{".github/scripts/build-sdl-linux-x64.sh", "artifacts/native/libSDL3.so"})
            }
            Run(
                "bash",
                []string{
                    ".github/scripts/with-headless-wayland.sh",
                    "env",
                    "SDL_VIDEODRIVER=wayland",
                    "LIBGL_ALWAYS_SOFTWARE=1",
                    "VK_INSTANCE_LAYERS=VK_LAYER_KHRONOS_validation",
                    "LD_LIBRARY_PATH=" + Path.Combine(Root, "artifacts/native") +
                        ":" +
                        Environment.GetEnvironmentVariable("LD_LIBRARY_PATH"),
                    "dotnet",
                    "test",
                    Project("tests/Goo.CoreBehaviorTests"),
                    "-c",
                    "Release",
                    "-p:TreatWarningsAsErrors=true",
                    "-p:GooLinuxSdlPath=" + Path.Combine(Root, "artifacts/native/libSDL3.so")
                }
            )
        }
    }

    private func Pack() {
        if !OperatingSystem.IsLinux() {
            throw PlatformNotSupportedException(
                "The Goo package needs Linux x64 to build its pinned SDL payload. Run pack on Linux x64."
            )
        }
        if !File.Exists("artifacts/native/libSDL3.so") {
            Run("bash", []string{".github/scripts/build-sdl-linux-x64.sh", "artifacts/native/libSDL3.so"})
        }
        if !File.Exists("artifacts/native/SDL3.dll") {
            Run("bash", []string{".github/scripts/fetch-sdl-win-x64.sh", "artifacts/native/SDL3.dll"})
        }
        Run(
            "dotnet",
            []string{
                "pack",
                "Goo/Goo.gsproj",
                "-c",
                "Release",
                "-o",
                "artifacts/packages",
                "-p:GooLinuxSdlPath=" + Path.Combine(Root, "artifacts/native/libSDL3.so"),
                "-p:GooWindowsSdlPath=" + Path.Combine(Root, "artifacts/native/SDL3.dll")
            }
        )
    }
}
