import System
import System.Collections.Generic
import System.Diagnostics
import System.IO
import System.Runtime.InteropServices
import System.Security.Cryptography
import System.Threading.Tasks

internal class SlangCompiler {
    private let path string

    private init(path string, platform string, executableSha256 string, runtimeSha256 string, archiveSha256 string) {
        this.path = path
        Platform = platform
        ExecutableSha256 = executableSha256
        RuntimeSha256 = runtimeSha256
        ArchiveSha256 = archiveSha256
    }

    prop Platform string {
        get;
    }

    prop ExecutableSha256 string {
        get;
    }

    prop RuntimeSha256 string {
        get;
    }

    prop ArchiveSha256 string {
        get;
    }

    func Compile(
        language string,
        input string,
        authoringRoot string,
        output string,
        sourceIndependent bool = false
    ) IReadOnlyList[string] {
        if !((language == "slang" || language == "glsl")) {
            throw InvalidOperationException("Unsupported Slang compiler input language: $language")
        }
        let arguments = List[string]{
            "-lang",
            language,
            input,
            "-I",
            authoringRoot,
            "-entry",
            "main",
            "-stage",
            "fragment",
            "-target",
            "spirv",
            "-capability",
            "SPIRV_1_5",
            "-matrix-layout-row-major",
            "-fp-mode",
            "precise",
            "-O2",
            "-Wall",
            "-Wpedantic",
            "-warnings-as-errors",
            "all",
            "-restrictive-capability-check",
            "-diagnostic-color",
            "never"
        }
        if language == "slang" {
            arguments.AddRange([]string{"-std", "2026"})
        } else {
            arguments.Insert(0, "-allow-glsl")
        }
        if sourceIndependent {
            arguments.AddRange([]string{"-D", "GOO_SOURCE_INDEPENDENT=1"})
        }
        arguments.AddRange([]string{"-o", output})
        let result = Run(path, arguments)
        RequireSuccess(path, result)
        return NormalizeArguments(arguments, input, authoringRoot, output)
    }

    private data struct ToolResult(ExitCode int32, StandardOutput string, StandardError string) : IEquatable[
        SlangCompiler.ToolResult
    ] { }

    shared {
        const Project string = "shader-slang/slang"
        const Version string = "2026.16"
        const Commit string = "2c6ca521d2c38e7ab67c63293351bc88eb747340"
        private const LinuxExecutableSha256 string = "17272094a0dfde5dfc1534c5583cfbb36cb540edc6a88198aa9ebbca0c2fc336"
        private const LinuxRuntimeSha256 string = "e7ac31add0058c5b2a5406be803d38d3e750a4717ab6f425f98530cf791467c8"
        private const LinuxArchiveSha256 string = "b9c5e195ce9a7124147d47febe78b7f8c59c96829add50b0938bd04b8056fb88"
        private const WindowsExecutableSha256 string = "e2966526f3ed76a2373c27dd6af282fdb1b010b40ae7b8ca90d9d41ee39a00c1"
        private const WindowsRuntimeSha256 string = "5b7c2a51827818ce64182ad0522d6bb50f87679c21baf5f364c7194d604372c5"
        private const WindowsArchiveSha256 string = "7fa1e69d68706ed18cc679270bc3a2e4a3f7400d9f7bf393564fad3b3bc03e25"
        private const MacOsArm64ExecutableSha256 string = "7e4295527a0142b466d988184a15b27e5ef80be1f49943eec83d6aedfc725a15"
        private const MacOsArm64RuntimeSha256 string = "ef20598c247dc673efafb42d5648326d894da2e8b18fc955d5485dd5a4c1efbe"
        private const MacOsArm64ArchiveSha256 string = "5d7edc2c91c38d1914c14a5a410f0fe517bce9a284395336715ba36a091e9d9e"

        func Find() SlangCompiler {
            RequireSupportedPlatform()
            let path = FindTool("slangc")
            let version = Run(path, []string{"-version"})
            RequireSuccess(path, version)
            if (version.StandardOutput + version.StandardError).Trim() != SlangCompiler.Version {
                throw InvalidOperationException("slangc must be version ${SlangCompiler.Version}")
            }
            var platform string
            var runtime string
            var expectedExecutable string
            var expectedRuntime string
            var archive string
            if OperatingSystem.IsLinux() {
                platform = "linux-x64-glibc-2.27"
                runtime = Path.GetFullPath(
                    Path.Combine(
                        Path.GetDirectoryName(path)!!,
                        "..",
                        "lib",
                        "libslang-compiler.so.0.${SlangCompiler.Version}"
                    )
                )
                expectedExecutable = LinuxExecutableSha256
                expectedRuntime = LinuxRuntimeSha256
                archive = LinuxArchiveSha256
            } else if OperatingSystem.IsWindows() {
                platform = "windows-x64"
                runtime = Path.Combine(Path.GetDirectoryName(path)!!, "slang-compiler.dll")
                expectedExecutable = WindowsExecutableSha256
                expectedRuntime = WindowsRuntimeSha256
                archive = WindowsArchiveSha256
            } else if OperatingSystem.IsMacOS() {
                platform = "macos-aarch64"
                runtime = Path.GetFullPath(
                    Path.Combine(
                        Path.GetDirectoryName(path)!!,
                        "..",
                        "lib",
                        "libslang-compiler.0.${SlangCompiler.Version}.dylib"
                    )
                )
                expectedExecutable = MacOsArm64ExecutableSha256
                expectedRuntime = MacOsArm64RuntimeSha256
                archive = MacOsArm64ArchiveSha256
            } else {
                throw PlatformNotSupportedException()
            }
            let executableSha256 = HashFile(path)
            if executableSha256 != expectedExecutable {
                throw InvalidOperationException("slangc SHA-256 must be $expectedExecutable, found $executableSha256")
            }
            if !File.Exists(runtime) {
                throw FileNotFoundException("Slang compiler runtime is missing", runtime)
            }
            let runtimeSha256 = HashFile(runtime)
            if runtimeSha256 != expectedRuntime {
                throw InvalidOperationException(
                    "Slang compiler runtime SHA-256 must be $expectedRuntime, found $runtimeSha256"
                )
            }
            return SlangCompiler(path, platform, executableSha256, runtimeSha256, archive)
        }

        private func RequireSupportedPlatform() {
            let architecture = RuntimeInformation.ProcessArchitecture
            let supported = architecture == Architecture.X64 &&
                (OperatingSystem.IsLinux() || OperatingSystem.IsWindows()) ||
                architecture == Architecture.Arm64 &&
                OperatingSystem.IsMacOS()
            if !supported {
                throw PlatformNotSupportedException(
                    "slangc 2026.16 is locked to Linux x64, Windows x64, and macOS arm64"
                )
            }
        }

        private func NormalizeArguments(
            arguments IReadOnlyList[string],
            input string,
            authoringRoot string,
            output string
        ) IReadOnlyList[string] {
            let normalized = [arguments.Count]string
            for var index = 0; index < arguments.Count; index++ {
                normalized[index] = if arguments[index] == input {
                    "<source>"
                } else {
                    (
                        if arguments[index] == authoringRoot {
                            "<authoring>"
                        } else {
                            (
                                if arguments[index] == output {
                                    "<output>"
                                } else {
                                    arguments[index]
                                }
                            )
                        }
                    )
                }
            }
            return normalized
        }

        private func FindTool(executable string) string {
            let name = if OperatingSystem.IsWindows() {
                executable + ".exe"
            } else {
                executable
            }
            let sdk string? = Environment.GetEnvironmentVariable("SLANG_SDK")
            if !string.IsNullOrWhiteSpace(sdk) {
                let candidate = Path.Combine(sdk, "bin", name)
                if File.Exists(candidate) {
                    return Path.GetFullPath(candidate)
                }
            }
            let environmentPath string? = Environment.GetEnvironmentVariable("PATH")
            if !string.IsNullOrWhiteSpace(environmentPath) {
                for directory in environmentPath.Split(Path.PathSeparator, StringSplitOptions.RemoveEmptyEntries) {
                    let candidate = Path.Combine(directory, name)
                    if File.Exists(candidate) {
                        return Path.GetFullPath(candidate)
                    }
                }
            }
            throw InvalidOperationException(
                "Could not find $name in SLANG_SDK or PATH. Download Slang ${SlangCompiler.Version} from " +
                    "https://github.com/shader-slang/slang/releases/tag/v${SlangCompiler.Version}"
            )
        }

        private func HashFile(value string) string {
            using let stream = File.OpenRead(value)
            return Convert.ToHexString(SHA256.HashData(stream)).ToLowerInvariant()
        }

        private func Run(executable string, arguments IEnumerable[string]) SlangCompiler.ToolResult {
            let start = ProcessStartInfo{
                FileName: executable,
                UseShellExecute: false,
                RedirectStandardOutput: true,
                RedirectStandardError: true,
                CreateNoWindow: true
            }
            for argument in arguments {
                start.ArgumentList.Add(argument)
            }
            using let process = Process.Start(start) ?? throw InvalidOperationException("Could not start $executable")
            let outputTask = process.StandardOutput.ReadToEndAsync()
            let errorTask = process.StandardError.ReadToEndAsync()
            process.WaitForExit()
            Task.WaitAll(outputTask, errorTask)
            return SlangCompiler.ToolResult(process.ExitCode, outputTask.Result, errorTask.Result)
        }

        private func RequireSuccess(executable string, result SlangCompiler.ToolResult) {
            if result.ExitCode == 0 {
                return
            }
            let detail = (result.StandardError + result.StandardOutput).Trim()
            throw InvalidOperationException(
                "${Path.GetFileName(executable)} failed with exit code ${result.ExitCode}: $detail"
            )
        }
    }
}
