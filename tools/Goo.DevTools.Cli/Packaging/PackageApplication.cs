using System.ComponentModel;
using System.Diagnostics;
using System.IO.Compression;
using System.Runtime.InteropServices;
using System.Security.Cryptography;
using System.Text.Json;
using System.Text.RegularExpressions;

namespace Goo.DevTools.Cli;

internal static class PackageApplication
{
    private const string AppImageToolHash = "95cbe7cce9717fce90c484e34052ee7c7f1d7635b33c12525b4776826a7d29b6";
    private const string AppImageRuntimeHash = "617aa77314d57c8b8e4fae9c3f0b35af7b30d5529cb69e98f64f92510ed98a46";
    private const string MetadataProperties = "AssemblyName,Product,Version,GooPackageId,GooPackageIcon";

    internal static async Task<int> RunAsync(CommandLine commandLine, string project)
    {
        if (commandLine.Get("target") != "linux" || !OperatingSystem.IsLinux()
            || RuntimeInformation.OSArchitecture != Architecture.X64)
            throw new CliException("Packaging requires --target linux on Linux x64.", "unsupported-target", "validation");

        var tool = VerifyTool("GOO_APPIMAGETOOL", AppImageToolHash);
        var runtime = VerifyTool("GOO_APPIMAGE_RUNTIME", AppImageRuntimeHash);
        var directory = Path.GetDirectoryName(project)!;
        var metadata = await ReadMetadataAsync(project, "linux-x64");
        var output = Path.GetFullPath(commandLine.Get("output") ?? "artifacts/packages", directory);
        var workspace = Path.Combine(directory, "obj", "goo-package", Guid.NewGuid().ToString("N"));
        Directory.CreateDirectory(workspace);
        try
        {
            var publish = Path.Combine(workspace, "publish");
            await ExecuteAsync("dotnet", ["publish", project, "-c", "Release", "-r", "linux-x64",
                "--self-contained", "true", "-p:PublishAot=true", "-m:2", "-o", publish], directory, "publish-failed");
            var appDir = Path.Combine(workspace, "AppDir");
            var symbols = Path.Combine(workspace, "symbols");
            await ExecuteAsync("bash", [Path.Combine(AppContext.BaseDirectory, "Packaging", "stage-linux-x64.sh"),
                publish, Path.Combine(appDir, "usr", "bin"), symbols, metadata.Executable], directory, "stage-failed");
            await WriteAppDirAsync(appDir, metadata);
            var name = $"{metadata.Id}-{metadata.Version}-linux-x64";
            var artifact = Path.Combine(workspace, name + ".AppImage");
            await ExecuteAsync("env", ["ARCH=x86_64", tool, "--appimage-extract-and-run", "--no-appstream",
                "--runtime-file", runtime, appDir, artifact], workspace, "package-failed");
            if (!File.Exists(artifact) || new FileInfo(artifact).Length == 0)
                throw new CliException("appimagetool did not create an AppImage.", "package-failed", "package");

            Directory.CreateDirectory(output);
            var artifacts = new List<string>();
            if (Directory.EnumerateFiles(symbols, "*", SearchOption.AllDirectories).Any())
            {
                var archive = Path.Combine(workspace, name + ".symbols.zip");
                ZipFile.CreateFromDirectory(symbols, archive);
                var destination = Path.Combine(output, Path.GetFileName(archive));
                File.Move(archive, destination, true);
                artifacts.Add(destination);
            }
            var image = Path.Combine(output, Path.GetFileName(artifact));
            File.Move(artifact, image, true);
            artifacts.Insert(0, image);
            if (commandLine.Has("json"))
                Console.WriteLine(JsonSerializer.Serialize(new { target = "linux", signing = "unsigned", artifacts }));
            else
                foreach (var path in artifacts)
                    Console.WriteLine(path);
            return 0;
        }
        finally
        {
            Directory.Delete(workspace, true);
        }
    }

    private static string VerifyTool(string variable, string expectedHash)
    {
        var path = Environment.GetEnvironmentVariable(variable);
        if (string.IsNullOrWhiteSpace(path) || !File.Exists(path))
            throw new CliException($"Set {variable} to the pinned file listed in docs/shipping.md.", "missing-tool", "validation");
        using var stream = File.OpenRead(path);
        if (!Convert.ToHexString(SHA256.HashData(stream)).Equals(expectedHash, StringComparison.OrdinalIgnoreCase))
            throw new CliException($"{variable} does not match the pinned SHA-256.", "invalid-tool", "validation");
        return Path.GetFullPath(path);
    }

    private static async Task<Metadata> ReadMetadataAsync(string project, string runtime)
    {
        var text = await ExecuteAsync("dotnet", ["msbuild", project, "-nologo", "-p:Configuration=Release",
            $"-p:RuntimeIdentifier={runtime}", $"-getProperty:{MetadataProperties}"],
            Path.GetDirectoryName(project)!, "invalid-package-metadata", capture: true);
        try
        {
            using var document = JsonDocument.Parse(text);
            var properties = document.RootElement.GetProperty("Properties");
            var executable = properties.GetProperty("AssemblyName").GetString() ?? "";
            var name = properties.GetProperty("Product").GetString();
            var version = properties.GetProperty("Version").GetString() ?? "";
            var id = properties.GetProperty("GooPackageId").GetString() ?? "";
            var icon = properties.GetProperty("GooPackageIcon").GetString() ?? "";
            if (string.IsNullOrWhiteSpace(name))
                name = executable;
            if (!Regex.IsMatch(executable, @"\A[A-Za-z0-9_.-]+\z", RegexOptions.CultureInvariant)
                || executable is "." or ".." || name.Any(char.IsControl)
                || !Regex.IsMatch(version, @"\A[0-9]+\.[0-9]+\.[0-9]+\z", RegexOptions.CultureInvariant)
                || !Regex.IsMatch(id, @"\A[a-z][a-z0-9]*(\.[a-z][a-z0-9-]*)+\z", RegexOptions.CultureInvariant)
                || string.IsNullOrWhiteSpace(icon))
                throw new CliException("Set AssemblyName, Product, numeric Version, GooPackageId and GooPackageIcon. See docs/shipping.md.",
                    "invalid-package-metadata", "validation");
            icon = Path.GetFullPath(icon, Path.GetDirectoryName(project)!);
            if (!File.Exists(icon) || !icon.EndsWith(".png", StringComparison.OrdinalIgnoreCase))
                throw new CliException("GooPackageIcon must name an existing PNG file.", "invalid-package-metadata", "validation");
            return new Metadata(executable, name, version, id, icon);
        }
        catch (Exception exception) when (exception is JsonException or KeyNotFoundException or InvalidOperationException)
        {
            throw new CliException("MSBuild did not return the required package metadata.", "invalid-package-metadata", "validation");
        }
    }

    private static async Task WriteAppDirAsync(string appDir, Metadata metadata)
    {
        var launcher = Path.Combine(appDir, "AppRun");
        await File.WriteAllTextAsync(launcher, "#!/bin/sh\nset -eu\n"
            + "root=$(CDPATH= cd -- \"$(dirname -- \"$0\")\" && pwd)\n"
            + $"exec \"$root/usr/bin/{metadata.Executable}\" \"$@\"\n");
        if (OperatingSystem.IsLinux())
            File.SetUnixFileMode(launcher, UnixFileMode.UserRead | UnixFileMode.UserWrite | UnixFileMode.UserExecute
                | UnixFileMode.GroupRead | UnixFileMode.GroupExecute | UnixFileMode.OtherRead | UnixFileMode.OtherExecute);
        var name = metadata.Name.Replace("\\", "\\\\", StringComparison.Ordinal);
        await File.WriteAllTextAsync(Path.Combine(appDir, metadata.Id + ".desktop"),
            $"[Desktop Entry]\nType=Application\nName={name}\nExec={metadata.Executable}\nIcon={metadata.Id}\nTerminal=false\nCategories=Utility;\n");
        File.Copy(metadata.Icon, Path.Combine(appDir, metadata.Id + ".png"));
        File.CreateSymbolicLink(Path.Combine(appDir, ".DirIcon"), metadata.Id + ".png");
        File.Copy(Path.Combine(AppContext.BaseDirectory, "Packaging", "AppImage-Runtime-LICENSE.txt"),
            Path.Combine(appDir, "usr", "bin", "AppImage-Runtime-LICENSE.txt"));
    }

    private static async Task<string> ExecuteAsync(string file, string[] arguments, string directory, string code, bool capture = false)
    {
        var start = new ProcessStartInfo(file)
        {
            WorkingDirectory = directory,
            UseShellExecute = false,
            RedirectStandardOutput = true,
            RedirectStandardError = true
        };
        foreach (var argument in arguments)
            start.ArgumentList.Add(argument);
        Process process;
        try
        {
            process = Process.Start(start) ?? throw new CliException($"Could not start {file}.", "missing-tool", "validation");
        }
        catch (Win32Exception)
        {
            throw new CliException($"Could not start {file}.", "missing-tool", "validation");
        }
        using (process)
        {
            var error = process.StandardError.BaseStream.CopyToAsync(Console.OpenStandardError());
            var output = capture ? process.StandardOutput.ReadToEndAsync() : null;
            var forward = capture ? Task.CompletedTask : process.StandardOutput.BaseStream.CopyToAsync(Console.OpenStandardError());
            await process.WaitForExitAsync();
            await Task.WhenAll(error, forward);
            var result = output is null ? "" : await output;
            if (process.ExitCode != 0)
                throw new CliException($"{Path.GetFileName(file)} exited with code {process.ExitCode}.", code, "package");
            return result;
        }
    }

    private sealed record Metadata(string Executable, string Name, string Version, string Id, string Icon);
}
