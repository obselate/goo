using System.Diagnostics;

internal sealed class SpirvValidator
{
    public const string Project = "KhronosGroup/SPIRV-Tools";
    public const string Version = "2026.3";
    public const string Sdk = "1.4.357.0";
    public const string Commit = "b707790a898e44038547df54580022fc1cf89c3d";

    private readonly string path;

    private SpirvValidator(string path)
    {
        this.path = path;
    }

    public static SpirvValidator Find()
    {
        string path = FindTool("spirv-val");
        ToolResult result = Run(path, new[] { "--version" });
        RequireSuccess(path, result);
        string output = result.StandardOutput + result.StandardError;
        if (!output.Contains($"SPIRV-Tools v{Version}", StringComparison.Ordinal)
            || !output.Contains($"vulkan-sdk-{Sdk}", StringComparison.Ordinal))
        {
            throw new InvalidOperationException(
                $"spirv-val must be SPIRV-Tools {Version} from Vulkan SDK {Sdk}");
        }
        return new SpirvValidator(path);
    }

    public void Validate(string input)
    {
        ToolResult result = Run(path, new[] { "--target-env", "vulkan1.3", input });
        RequireSuccess(path, result);
    }

    private static string FindTool(string executable)
    {
        string[] names = OperatingSystem.IsWindows()
            ? new[] { executable, executable + ".exe" }
            : new[] { executable };
        string? sdk = Environment.GetEnvironmentVariable("VULKAN_SDK");
        if (!string.IsNullOrWhiteSpace(sdk))
        {
            foreach (string directory in new[] { "bin", "Bin" })
            {
                foreach (string name in names)
                {
                    string candidate = Path.Combine(sdk, directory, name);
                    if (File.Exists(candidate))
                    {
                        return candidate;
                    }
                }
            }
        }
        string? path = Environment.GetEnvironmentVariable("PATH");
        if (!string.IsNullOrWhiteSpace(path))
        {
            foreach (string directory in path.Split(Path.PathSeparator,
                StringSplitOptions.RemoveEmptyEntries))
            {
                foreach (string name in names)
                {
                    string candidate = Path.Combine(directory, name);
                    if (File.Exists(candidate))
                    {
                        return candidate;
                    }
                }
            }
        }
        throw new InvalidOperationException(
            $"Could not find {executable} in VULKAN_SDK or PATH. Download Vulkan SDK {Sdk} from "
            + "https://vulkan.lunarg.com/sdk/home");
    }

    private static ToolResult Run(string path, IEnumerable<string> arguments)
    {
        ProcessStartInfo start = new()
        {
            FileName = path,
            UseShellExecute = false,
            RedirectStandardOutput = true,
            RedirectStandardError = true,
            CreateNoWindow = true
        };
        foreach (string argument in arguments)
        {
            start.ArgumentList.Add(argument);
        }
        using Process process = Process.Start(start)
            ?? throw new InvalidOperationException($"Could not start {path}");
        Task<string> outputTask = process.StandardOutput.ReadToEndAsync();
        Task<string> errorTask = process.StandardError.ReadToEndAsync();
        process.WaitForExit();
        Task.WaitAll(outputTask, errorTask);
        return new ToolResult(process.ExitCode, outputTask.Result, errorTask.Result);
    }

    private static void RequireSuccess(string path, ToolResult result)
    {
        if (result.ExitCode == 0)
        {
            return;
        }
        string detail = (result.StandardError + result.StandardOutput).Trim();
        throw new InvalidOperationException(
            $"{Path.GetFileName(path)} failed with exit code {result.ExitCode}: {detail}");
    }

    private readonly record struct ToolResult(
        int ExitCode,
        string StandardOutput,
        string StandardError);
}
