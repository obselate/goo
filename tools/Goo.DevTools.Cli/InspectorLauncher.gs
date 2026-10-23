package Goo.DevTools.Cli

import System
import System.Collections.Generic
import System.Diagnostics
import System.IO
import System.Linq

internal shared class InspectorLauncher {
    func Find(projectDirectory string? = nil) string? ->
        Candidates(projectDirectory).Select(Path.GetFullPath).FirstOrDefault(IsRunnable)

    func Launch(executable string, descriptor DiscoveryDescriptor, focus bool) Process? ->
        Process.Start(CreateStartInfo(executable, descriptor, focus))

    internal func Candidates(projectDirectory string? = nil) IReadOnlyList[string] {
        let candidates = List[string]()
        let configured = Environment.GetEnvironmentVariable("GOO_DEVTOOLS_INSPECTOR")
        if !string.IsNullOrWhiteSpace(configured) {
            candidates.Add(configured)
        }
        AddFromPath(candidates, "goo-devtools")
        AddFromPath(candidates, "goo-devtools.exe")
        if projectDirectory != nil {
            let root string? = FindRepositoryRoot(projectDirectory)
            if root != nil {
                candidates.Add(Path.Combine(root, "apps", "Goo.DevTools", "bin", "Debug", "net10.0", "Goo.DevTools"))
                candidates.Add(Path.Combine(root, "apps", "Goo.DevTools", "bin", "Release", "net10.0", "Goo.DevTools"))
                candidates.Add(
                    Path.Combine(root, "apps", "Goo.DevTools", "bin", "Debug", "net10.0", "Goo.DevTools.dll")
                )
                candidates.Add(
                    Path.Combine(root, "apps", "Goo.DevTools", "bin", "Release", "net10.0", "Goo.DevTools.dll")
                )
            }
        }
        let local = Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData)
        if !string.IsNullOrWhiteSpace(local) {
            candidates.Add(Path.Combine(local, "Goo", "DevTools", "goo-devtools"))
        }
        candidates.Add(Path.Combine(AppContext.BaseDirectory, "goo-devtools"))
        candidates.Add(Path.Combine(AppContext.BaseDirectory, "goo-devtools.dll"))
        return candidates
    }

    internal func CreateStartInfo(executable string, descriptor DiscoveryDescriptor, focus bool) ProcessStartInfo {
        let start = ProcessStartInfo{
            FileName: if executable.EndsWith(".dll", StringComparison.OrdinalIgnoreCase) {
                "dotnet"
            } else {
                executable
            },
            UseShellExecute: false,
            WorkingDirectory: Path.GetDirectoryName(executable) ?? Environment.CurrentDirectory
        }
        if executable.EndsWith(".dll", StringComparison.OrdinalIgnoreCase) {
            start.ArgumentList.Add(executable)
        }
        start.ArgumentList.Add("--attach")
        start.ArgumentList.Add("--pipe")
        start.ArgumentList.Add(descriptor.Pipe)
        start.ArgumentList.Add("--pid")
        start.ArgumentList.Add(descriptor.ProcessId.ToString())
        if focus {
            start.ArgumentList.Add("--focus")
        }
        return start
    }

    func FindRepositoryRoot(start string) string? {
        var directory DirectoryInfo? = DirectoryInfo(Path.GetFullPath(start))
        while directory != nil {
            if File.Exists(Path.Combine(directory.FullName, "LICENSE")) && Path.Exists(
                Path.Combine(directory.FullName, ".git")
            ) {
                return directory.FullName
            }
            directory = directory.Parent
        }
        return nil
    }

    private func IsRunnable(path string) bool {
        if !File.Exists(path) {
            return false
        }
        if OperatingSystem.IsWindows() {
            return true
        }
        if path.EndsWith(".dll", StringComparison.OrdinalIgnoreCase) {
            return true
        }
        try {
            return (File.GetUnixFileMode(path) & UnixFileMode.UserExecute) != 0 ||
                (File.GetUnixFileMode(path) & UnixFileMode.GroupExecute) != 0 ||
                (File.GetUnixFileMode(path) & UnixFileMode.OtherExecute) != 0
        } catch (IOException) {
            return false
        } catch (UnauthorizedAccessException) {
            return false
        }
    }

    private func AddFromPath(candidates List[string], name string) {
        let path string? = Environment
            .GetEnvironmentVariable("PATH")
            ?.Split(Path.PathSeparator)
            .Where((item string) -> !string.IsNullOrWhiteSpace(item))
            .Select((item string) -> Path.Combine(item, name))
            .FirstOrDefault(IsRunnable)
        if path != nil {
            candidates.Add(path)
        }
    }
}
