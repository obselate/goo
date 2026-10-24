import System
import System.Collections.Generic
import System.Diagnostics
import System.IO
import System.Threading.Tasks

internal class SpirvValidator {
    private let path string

    private init(path string) {
        this.path = path
    }

    func Validate(input string) {
        let result = Run(path, []string{"--target-env", "vulkan1.3", input})
        RequireSuccess(path, result)
    }

    private data struct ToolResult(ExitCode int32, StandardOutput string, StandardError string) : IEquatable[
        SpirvValidator.ToolResult
    ] { }

    shared {
        const Project string = "KhronosGroup/SPIRV-Tools"
        const Version string = "2026.3"
        const Sdk string = "1.4.357.0"
        const Commit string = "9a49b0883b9b635689a85b5647dbfcb223268151"

        func Find() SpirvValidator {
            let path = FindTool("spirv-val")
            let result = Run(path, []string{"--version"})
            RequireSuccess(path, result)
            let output = result.StandardOutput + result.StandardError
            if !output.Contains("SPIRV-Tools v${SpirvValidator.Version}", StringComparison.Ordinal) ||
                (
                !output.Contains("vulkan-sdk-$Sdk", StringComparison.Ordinal) && !output.Contains(
                    "g${Commit[..8]}",
                    StringComparison.Ordinal
                )
            ) {
                throw InvalidOperationException(
                    "spirv-val must be SPIRV-Tools ${SpirvValidator.Version} from Vulkan SDK $Sdk"
                )
            }
            return SpirvValidator(path)
        }

        private func FindTool(executable string) string {
            let names = if OperatingSystem.IsWindows() {
                []string{executable, executable + ".exe"}
            } else {
                []string{executable}
            }
            let sdk string? = Environment.GetEnvironmentVariable("VULKAN_SDK")
            if !string.IsNullOrWhiteSpace(sdk) {
                for directory in[]string{"bin", "Bin"} {
                    for name in names {
                        let candidate = Path.Combine(sdk, directory, name)
                        if File.Exists(candidate) {
                            return candidate
                        }
                    }
                }
            }
            let path string? = Environment.GetEnvironmentVariable("PATH")
            if !string.IsNullOrWhiteSpace(path) {
                for directory in path.Split(Path.PathSeparator, StringSplitOptions.RemoveEmptyEntries) {
                    for name in names {
                        let candidate = Path.Combine(directory, name)
                        if File.Exists(candidate) {
                            return candidate
                        }
                    }
                }
            }
            throw InvalidOperationException(
                "Could not find $executable in VULKAN_SDK or PATH. Download Vulkan SDK $Sdk from " +
                    "https://vulkan.lunarg.com/sdk/home"
            )
        }

        private func Run(path string, arguments IEnumerable[string]) SpirvValidator.ToolResult {
            let start = ProcessStartInfo{
                FileName: path,
                UseShellExecute: false,
                RedirectStandardOutput: true,
                RedirectStandardError: true,
                CreateNoWindow: true
            }
            for argument in arguments {
                start.ArgumentList.Add(argument)
            }
            using let process = Process.Start(start) ?? throw InvalidOperationException("Could not start $path")
            let outputTask = process.StandardOutput.ReadToEndAsync()
            let errorTask = process.StandardError.ReadToEndAsync()
            process.WaitForExit()
            Task.WaitAll(outputTask, errorTask)
            return SpirvValidator.ToolResult(process.ExitCode, outputTask.Result, errorTask.Result)
        }

        private func RequireSuccess(path string, result SpirvValidator.ToolResult) {
            if result.ExitCode == 0 {
                return
            }
            let detail = (result.StandardError + result.StandardOutput).Trim()
            throw InvalidOperationException(
                "${Path.GetFileName(path)} failed with exit code ${result.ExitCode}: $detail"
            )
        }
    }
}
