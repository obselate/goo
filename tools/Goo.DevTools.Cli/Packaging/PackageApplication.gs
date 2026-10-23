package Goo.DevTools.Cli

import System
import System.Collections.Generic
import System.ComponentModel
import System.Diagnostics
import System.IO
import System.IO.Compression
import System.Linq
import System.Runtime.InteropServices
import System.Security.Cryptography
import System.Text.Json
import System.Text.RegularExpressions
import System.Threading.Tasks

internal shared partial class PackageApplication {
    private data class Metadata(
        Executable string,
        Name string,
        Version string,
        Id string,
        Icon string,
        Company string
    ) : IEquatable[Metadata] { }

    private const AppImageToolHash string = "95cbe7cce9717fce90c484e34052ee7c7f1d7635b33c12525b4776826a7d29b6"
    private const AppImageRuntimeHash string = "617aa77314d57c8b8e4fae9c3f0b35af7b30d5529cb69e98f64f92510ed98a46"
    private const MetadataProperties string = "AssemblyName,Product,Version,GooPackageId,GooPackageIcon,Company"

    internal async func RunAsync(commandLine CommandLine, project string) int32 {
        let target = commandLine.Get("target")
        if target == "android" {
            return await PackageAndroidAsync(commandLine, project)
        }
        let windows = target == "windows" && OperatingSystem.IsWindows()
        let macos = target == "macos" && OperatingSystem.IsMacOS() &&
            RuntimeInformation.OSArchitecture == Architecture.Arm64
        if !macos &&
            (
            (!windows && (target != "linux" || !OperatingSystem.IsLinux())) ||
                RuntimeInformation.OSArchitecture != Architecture.X64
        ) {
            throw CliException(
                "Package on the target OS with --target linux, windows (x64) or macos (arm64).",
                "unsupported-target",
                "validation"
            )
        }
        let tool = if windows {
            Environment.GetEnvironmentVariable("GOO_ISCC")
        } else {
            (
                if macos {
                    "/usr/bin/hdiutil"
                } else {
                    VerifyTool("GOO_APPIMAGETOOL", AppImageToolHash)
                }
            )
        }
        if string.IsNullOrWhiteSpace(tool) || !File.Exists(tool) {
            throw CliException(
                "The target packaging tool is missing. See docs/shipping.md.",
                "missing-tool",
                "validation"
            )
        }
        let runtime = if windows || macos {
            ""
        } else {
            VerifyTool("GOO_APPIMAGE_RUNTIME", AppImageRuntimeHash)
        }
        let rid = if windows {
            "win-x64"
        } else {
            (
                if macos {
                    "osx-arm64"
                } else {
                    "linux-x64"
                }
            )
        }
        let directory = Path.GetDirectoryName(project)!!
        let metadata = await ReadMetadataAsync(project, rid)
        let output = Path.GetFullPath(commandLine.Get("output") ?? "artifacts/packages", directory)
        let workspace = Path.Combine(directory, "obj", "goo-package", Guid.NewGuid().ToString("N"))
        Directory.CreateDirectory(workspace)
        try {
            let publish = Path.Combine(workspace, "publish")
            await ExecuteAsync(
                "dotnet",
                []string{
                    "publish",
                    project,
                    "-c",
                    "Release",
                    "-r",
                    rid,
                    "--self-contained",
                    "true",
                    "-p:PublishAot=true",
                    "-m:4",
                    "-o",
                    publish
                },
                directory,
                "publish-failed"
            )
            let appDir = Path.Combine(workspace, "AppDir")
            let symbols = Path.Combine(workspace, "symbols")
            let name = "${metadata.Id}-${metadata.Version}-$rid"
            var artifact string
            if windows {
                artifact = await PackageWindowsAsync(publish, workspace, symbols, metadata, tool!!)
            } else if macos {
                artifact = await PackageMacOsAsync(publish, workspace, symbols, metadata)
            } else {
                await ExecuteAsync(
                    "bash",
                    []string{
                        Path.Combine(AppContext.BaseDirectory, "Packaging", "stage-linux-x64.sh"),
                        publish,
                        Path.Combine(appDir, "usr", "bin"),
                        symbols,
                        metadata.Executable
                    },
                    directory,
                    "stage-failed"
                )
                await WriteAppDirAsync(appDir, metadata)
                artifact = Path.Combine(workspace, name + ".AppImage")
                await ExecuteAsync(
                    "env",
                    []string{
                        "ARCH=x86_64",
                        tool!!,
                        "--appimage-extract-and-run",
                        "--no-appstream",
                        "--runtime-file",
                        runtime,
                        appDir,
                        artifact
                    },
                    workspace,
                    "package-failed"
                )
            }
            if !File.Exists(artifact) || FileInfo(artifact).Length == int64(0) {
                throw CliException("The packaging tool did not create an artifact.", "package-failed", "package")
            }
            Directory.CreateDirectory(output)
            let artifacts = List[string]()
            if Directory.EnumerateFiles(symbols, "*", SearchOption.AllDirectories).Any() {
                let archive = Path.Combine(workspace, name + ".symbols.zip")
                ZipFile.CreateFromDirectory(symbols, archive)
                let destination = Path.Combine(output, Path.GetFileName(archive))
                File.Move(archive, destination, true)
                artifacts.Add(destination)
            }
            let image = Path.Combine(output, Path.GetFileName(artifact))
            File.Move(artifact, image, true)
            artifacts.Insert(0, image)
            if macos {
                let app = Path.Combine(output, metadata.Executable + ".app")
                if Directory.Exists(app) {
                    throw CliException("The output app already exists: $app", "output-exists", "package")
                }
                await ExecuteAsync(
                    "ditto",
                    []string{Path.Combine(workspace, metadata.Executable + ".app"), app},
                    workspace,
                    "package-failed"
                )
                artifacts.Add(app)
            }
            if commandLine.Has("json") {
                Console.WriteLine(
                    JsonSerializer.Serialize(
                        AnonymousType3_EF798FF08380A835(
                            target,
                            if macos {
                                "ad-hoc"
                            } else {
                                "unsigned"
                            },
                            artifacts
                        )
                    )
                )
            } else {
                for path in artifacts {
                    Console.WriteLine(path)
                }
            }
            return 0
        } finally {
            Directory.Delete(workspace, true)
        }
    }

    private func VerifyTool(variable string, expectedHash string) string {
        let path = Environment.GetEnvironmentVariable(variable)
        if string.IsNullOrWhiteSpace(path) || !File.Exists(path) {
            throw CliException(
                "Set $variable to the pinned file listed in docs/shipping.md.",
                "missing-tool",
                "validation"
            )
        }
        using let stream = File.OpenRead(path!!)
        if !Convert.ToHexString(SHA256.HashData(stream)).Equals(expectedHash, StringComparison.OrdinalIgnoreCase) {
            throw CliException("$variable does not match the pinned SHA-256.", "invalid-tool", "validation")
        }
        return Path.GetFullPath(path!!)
    }

    private async func ReadMetadataAsync(project string, runtime string) Metadata {
        let text = await ExecuteAsync(
            "dotnet",
            []string{
                "msbuild",
                project,
                "-nologo",
                "-p:Configuration=Release",
                "-p:RuntimeIdentifier=$runtime",
                "-getProperty:$MetadataProperties"
            },
            Path.GetDirectoryName(project)!!,
            "invalid-package-metadata",
            capture: true
        )
        try {
            using let document = JsonDocument.Parse(text)
            let properties = document.RootElement.GetProperty("Properties")
            let executable = properties.GetProperty("AssemblyName").GetString() ?? ""
            var name = properties.GetProperty("Product").GetString()
            let version = properties.GetProperty("Version").GetString() ?? ""
            let id = properties.GetProperty("GooPackageId").GetString() ?? ""
            var icon = properties.GetProperty("GooPackageIcon").GetString() ?? ""
            if string.IsNullOrWhiteSpace(name) {
                name = executable
            }
            if !Regex.IsMatch(executable, "\\A[A-Za-z0-9_.-]+\\z", RegexOptions.CultureInvariant) ||
                (executable is "." or "..") ||
                name.Any(char.IsControl) || !Regex.IsMatch(
                version,
                "\\A[0-9]+\\.[0-9]+\\.[0-9]+\\z",
                RegexOptions.CultureInvariant
            ) ||
                !Regex.IsMatch(id, "\\A[a-z][a-z0-9]*(\\.[a-z][a-z0-9-]*)+\\z", RegexOptions.CultureInvariant) ||
                string
                .IsNullOrWhiteSpace(icon) {
                throw CliException(
                    "Set AssemblyName, Product, numeric Version, GooPackageId and GooPackageIcon. See docs/shipping.md.",
                    "invalid-package-metadata",
                    "validation"
                )
            }
            icon = Path.GetFullPath(icon, Path.GetDirectoryName(project)!!)
            let extension = if runtime == "win-x64" {
                ".ico"
            } else {
                (
                    if runtime == "osx-arm64" {
                        ".icns"
                    } else {
                        ".png"
                    }
                )
            }
            if !File.Exists(icon) || !icon.EndsWith(extension, StringComparison.OrdinalIgnoreCase) {
                throw CliException(
                    "GooPackageIcon must name an existing $extension file.",
                    "invalid-package-metadata",
                    "validation"
                )
            }
            let company = properties.GetProperty("Company").GetString() ?? ""
            if runtime == "win-x64" && (string.IsNullOrWhiteSpace(company) || company.Any(char.IsControl)) {
                throw CliException(
                    "Set Company to the Windows app publisher.",
                    "invalid-package-metadata",
                    "validation"
                )
            }
            return Metadata(executable, name, version, id, icon, company)
        } catch (exception Exception) when exception is JsonException ||
            exception is KeyNotFoundException ||
            exception is InvalidOperationException {
            throw CliException(
                "MSBuild did not return the required package metadata.",
                "invalid-package-metadata",
                "validation"
            )
        }
    }

    private async func WriteAppDirAsync(appDir string, metadata Metadata) {
        let launcher = Path.Combine(appDir, "AppRun")
        await File.WriteAllTextAsync(launcher, `#!/bin/sh
set -eu
` + "root=$$(CDPATH= cd -- \"$$(dirname -- \"$$0\")\" && pwd)\n" + (`exec "$root/usr/bin/` + "${metadata.Executable}" + `" "$@"
`))
        if OperatingSystem.IsLinux() {
            File.SetUnixFileMode(
                launcher,
                UnixFileMode.UserRead | UnixFileMode.UserWrite | UnixFileMode.UserExecute | UnixFileMode.GroupRead | UnixFileMode.GroupExecute | UnixFileMode.OtherRead | UnixFileMode.OtherExecute
            )
        }
        let name = metadata.Name.Replace("\\", "\\\\", StringComparison.Ordinal)
        await File.WriteAllTextAsync(Path.Combine(appDir, metadata.Id + ".desktop"), (`[Desktop Entry]
Type=Application
Name=` + "$name" + `
Exec=` + "${metadata.Executable}" + `
Icon=` + "${metadata.Id}" + `
Terminal=false
Categories=Utility;
`))
        File.Copy(metadata.Icon, Path.Combine(appDir, metadata.Id + ".png"))
        File.CreateSymbolicLink(Path.Combine(appDir, ".DirIcon"), metadata.Id + ".png")
        File.Copy(
            Path.Combine(AppContext.BaseDirectory, "Packaging", "AppImage-Runtime-LICENSE.txt"),
            Path.Combine(appDir, "usr", "bin", "AppImage-Runtime-LICENSE.txt")
        )
    }

    private async func ExecuteAsync(
        file string,
        arguments[]string,
        directory string,
        code string,
        capture bool = false
    ) string {
        let start = ProcessStartInfo(file){
            WorkingDirectory = directory,
            UseShellExecute = false,
            RedirectStandardOutput = true,
            RedirectStandardError = true
        }
        for argument in arguments {
            start.ArgumentList.Add(argument)
        }
        var process Process
        try {
            process = Process.Start(start) ?? throw CliException("Could not start $file.", "missing-tool", "validation")
        } catch (Win32Exception) {
            throw CliException("Could not start $file.", "missing-tool", "validation")
        }
        {
            using let _ = process
            let error = process.StandardError.BaseStream.CopyToAsync(Console.OpenStandardError())
            let output Task[string]? = if capture {
                process.StandardOutput.ReadToEndAsync()
            } else {
                default(Task[string]?)
            }
            let forward = if capture {
                Task.CompletedTask
            } else {
                process.StandardOutput.BaseStream.CopyToAsync(Console.OpenStandardError())
            }
            await process.WaitForExitAsync()
            await Task.WhenAll(error, forward)
            let result = if output == nil {
                ""
            } else {
                await output
            }
            if process.ExitCode != 0 {
                throw CliException("${Path.GetFileName(file)} exited with code ${process.ExitCode}.", code, "package")
            }
            return result
        }
    }
}

internal data class AnonymousType3_EF798FF08380A835(target string?, signing string, artifacts List[string?]) { }
