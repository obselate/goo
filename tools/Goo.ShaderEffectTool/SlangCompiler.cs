using System.Diagnostics;
using System.Security.Cryptography;

internal sealed class SlangCompiler
{
    public const string Project = "shader-slang/slang";
    public const string Version = "2026.16";
    public const string Commit = "2c6ca521d2c38e7ab67c63293351bc88eb747340";

    private const string LinuxExecutableSha256 = "17272094a0dfde5dfc1534c5583cfbb36cb540edc6a88198aa9ebbca0c2fc336";
    private const string LinuxRuntimeSha256 = "e7ac31add0058c5b2a5406be803d38d3e750a4717ab6f425f98530cf791467c8";
    private const string LinuxArchiveSha256 = "b9c5e195ce9a7124147d47febe78b7f8c59c96829add50b0938bd04b8056fb88";
    private const string WindowsExecutableSha256 = "e2966526f3ed76a2373c27dd6af282fdb1b010b40ae7b8ca90d9d41ee39a00c1";
    private const string WindowsRuntimeSha256 = "5b7c2a51827818ce64182ad0522d6bb50f87679c21baf5f364c7194d604372c5";
    private const string WindowsArchiveSha256 = "7fa1e69d68706ed18cc679270bc3a2e4a3f7400d9f7bf393564fad3b3bc03e25";
    private const string MacOsArm64ExecutableSha256 = "7e4295527a0142b466d988184a15b27e5ef80be1f49943eec83d6aedfc725a15";
    private const string MacOsArm64RuntimeSha256 = "ef20598c247dc673efafb42d5648326d894da2e8b18fc955d5485dd5a4c1efbe";
    private const string MacOsArm64ArchiveSha256 = "5d7edc2c91c38d1914c14a5a410f0fe517bce9a284395336715ba36a091e9d9e";

    private readonly string path;

    private SlangCompiler(
        string path,
        string platform,
        string executableSha256,
        string runtimeSha256,
        string archiveSha256)
    {
        this.path = path;
        Platform = platform;
        ExecutableSha256 = executableSha256;
        RuntimeSha256 = runtimeSha256;
        ArchiveSha256 = archiveSha256;
    }

    public string Platform { get; }
    public string ExecutableSha256 { get; }
    public string RuntimeSha256 { get; }
    public string ArchiveSha256 { get; }

    public static SlangCompiler Find()
    {
        RequireSupportedPlatform();

        string path = FindTool("slangc");
        ToolResult version = Run(path, new[] { "-version" });
        RequireSuccess(path, version);
        if ((version.StandardOutput + version.StandardError).Trim() != Version)
        {
            throw new InvalidOperationException($"slangc must be version {Version}");
        }

        string platform;
        string runtime;
        string expectedExecutable;
        string expectedRuntime;
        string archive;
        if (OperatingSystem.IsLinux())
        {
            platform = "linux-x64-glibc-2.27";
            runtime = Path.GetFullPath(Path.Combine(
                Path.GetDirectoryName(path)!, "..", "lib", $"libslang-compiler.so.0.{Version}"));
            expectedExecutable = LinuxExecutableSha256;
            expectedRuntime = LinuxRuntimeSha256;
            archive = LinuxArchiveSha256;
        }
        else if (OperatingSystem.IsWindows())
        {
            platform = "windows-x64";
            runtime = Path.Combine(Path.GetDirectoryName(path)!, "slang-compiler.dll");
            expectedExecutable = WindowsExecutableSha256;
            expectedRuntime = WindowsRuntimeSha256;
            archive = WindowsArchiveSha256;
        }
        else if (OperatingSystem.IsMacOS())
        {
            platform = "macos-aarch64";
            runtime = Path.GetFullPath(Path.Combine(
                Path.GetDirectoryName(path)!, "..", "lib", $"libslang-compiler.0.{Version}.dylib"));
            expectedExecutable = MacOsArm64ExecutableSha256;
            expectedRuntime = MacOsArm64RuntimeSha256;
            archive = MacOsArm64ArchiveSha256;
        }
        else
        {
            throw new PlatformNotSupportedException();
        }

        string executableSha256 = HashFile(path);
        if (executableSha256 != expectedExecutable)
        {
            throw new InvalidOperationException(
                $"slangc SHA-256 must be {expectedExecutable}, found {executableSha256}");
        }
        if (!File.Exists(runtime))
        {
            throw new FileNotFoundException("Slang compiler runtime is missing", runtime);
        }
        string runtimeSha256 = HashFile(runtime);
        if (runtimeSha256 != expectedRuntime)
        {
            throw new InvalidOperationException(
                $"Slang compiler runtime SHA-256 must be {expectedRuntime}, found {runtimeSha256}");
        }
        return new SlangCompiler(path, platform, executableSha256, runtimeSha256, archive);
    }

    private static void RequireSupportedPlatform()
    {
        System.Runtime.InteropServices.Architecture architecture =
            System.Runtime.InteropServices.RuntimeInformation.ProcessArchitecture;
        bool supported = architecture == System.Runtime.InteropServices.Architecture.X64
            && (OperatingSystem.IsLinux() || OperatingSystem.IsWindows())
            || architecture == System.Runtime.InteropServices.Architecture.Arm64
            && OperatingSystem.IsMacOS();
        if (!supported)
        {
            throw new PlatformNotSupportedException(
                "slangc 2026.16 is locked to Linux x64, Windows x64, and macOS arm64");
        }
    }

    public IReadOnlyList<string> Compile(
        string language,
        string input,
        string authoringRoot,
        string output)
    {
        if (language is not ("slang" or "glsl"))
        {
            throw new InvalidOperationException($"Unsupported Slang compiler input language: {language}");
        }
        List<string> arguments = new()
        {
            "-lang", language,
            input,
            "-I", authoringRoot,
            "-entry", "main",
            "-stage", "fragment",
            "-target", "spirv",
            "-capability", "SPIRV_1_6",
            "-matrix-layout-row-major",
            "-fp-mode", "precise",
            "-O2",
            "-Wall",
            "-Wpedantic",
            "-warnings-as-errors", "all",
            "-restrictive-capability-check",
            "-diagnostic-color", "never"
        };
        if (language == "slang")
        {
            arguments.AddRange(new[] { "-std", "2026" });
        }
        else
        {
            arguments.Insert(0, "-allow-glsl");
        }
        arguments.AddRange(new[] { "-o", output });

        ToolResult result = Run(path, arguments);
        RequireSuccess(path, result);
        return NormalizeArguments(arguments, input, authoringRoot, output);
    }

    private static IReadOnlyList<string> NormalizeArguments(
        IReadOnlyList<string> arguments,
        string input,
        string authoringRoot,
        string output)
    {
        string[] normalized = new string[arguments.Count];
        for (int index = 0; index < arguments.Count; index++)
        {
            normalized[index] = arguments[index] == input
                ? "<source>"
                : arguments[index] == authoringRoot
                    ? "<authoring>"
                    : arguments[index] == output
                        ? "<output>"
                        : arguments[index];
        }
        return normalized;
    }

    private static string FindTool(string executable)
    {
        string name = OperatingSystem.IsWindows() ? executable + ".exe" : executable;
        string? sdk = Environment.GetEnvironmentVariable("SLANG_SDK");
        if (!string.IsNullOrWhiteSpace(sdk))
        {
            string candidate = Path.Combine(sdk, "bin", name);
            if (File.Exists(candidate))
            {
                return Path.GetFullPath(candidate);
            }
        }
        string? environmentPath = Environment.GetEnvironmentVariable("PATH");
        if (!string.IsNullOrWhiteSpace(environmentPath))
        {
            foreach (string directory in environmentPath.Split(Path.PathSeparator,
                StringSplitOptions.RemoveEmptyEntries))
            {
                string candidate = Path.Combine(directory, name);
                if (File.Exists(candidate))
                {
                    return Path.GetFullPath(candidate);
                }
            }
        }
        throw new InvalidOperationException(
            $"Could not find {name} in SLANG_SDK or PATH. Download Slang {Version} from "
            + $"https://github.com/shader-slang/slang/releases/tag/v{Version}");
    }

    private static string HashFile(string value)
    {
        using FileStream stream = File.OpenRead(value);
        return Convert.ToHexString(SHA256.HashData(stream)).ToLowerInvariant();
    }

    private static ToolResult Run(string executable, IEnumerable<string> arguments)
    {
        ProcessStartInfo start = new()
        {
            FileName = executable,
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
            ?? throw new InvalidOperationException($"Could not start {executable}");
        Task<string> outputTask = process.StandardOutput.ReadToEndAsync();
        Task<string> errorTask = process.StandardError.ReadToEndAsync();
        process.WaitForExit();
        Task.WaitAll(outputTask, errorTask);
        return new ToolResult(process.ExitCode, outputTask.Result, errorTask.Result);
    }

    private static void RequireSuccess(string executable, ToolResult result)
    {
        if (result.ExitCode == 0)
        {
            return;
        }
        string detail = (result.StandardError + result.StandardOutput).Trim();
        throw new InvalidOperationException(
            $"{Path.GetFileName(executable)} failed with exit code {result.ExitCode}: {detail}");
    }

    private readonly record struct ToolResult(
        int ExitCode,
        string StandardOutput,
        string StandardError);
}
