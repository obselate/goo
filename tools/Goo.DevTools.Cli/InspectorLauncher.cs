using System.Diagnostics;

namespace Goo.DevTools.Cli;

internal static class InspectorLauncher
{
    public static string? Find(string? projectDirectory = null)
    {
        return Candidates(projectDirectory).Select(Path.GetFullPath).FirstOrDefault(IsRunnable);
    }

    public static Process? Launch(string executable, DiscoveryDescriptor descriptor, bool focus)
    {
        return Process.Start(CreateStartInfo(executable, descriptor, focus));
    }

    internal static IReadOnlyList<string> Candidates(string? projectDirectory = null)
    {
        var candidates = new List<string>();
        var configured = Environment.GetEnvironmentVariable("GOO_DEVTOOLS_INSPECTOR");
        if (!string.IsNullOrWhiteSpace(configured))
            candidates.Add(configured);
        AddFromPath(candidates, "goo-devtools");
        AddFromPath(candidates, "goo-devtools.exe");
        if (projectDirectory is not null)
        {
            var root = FindRepositoryRoot(projectDirectory);
            if (root is not null)
            {
                candidates.Add(Path.Combine(root, "apps", "Goo.DevTools", "bin", "Debug", "net10.0", "Goo.DevTools"));
                candidates.Add(Path.Combine(root, "apps", "Goo.DevTools", "bin", "Release", "net10.0", "Goo.DevTools"));
                candidates.Add(Path.Combine(root, "apps", "Goo.DevTools", "bin", "Debug", "net10.0", "Goo.DevTools.dll"));
                candidates.Add(Path.Combine(root, "apps", "Goo.DevTools", "bin", "Release", "net10.0", "Goo.DevTools.dll"));
            }
        }

        var local = Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData);
        if (!string.IsNullOrWhiteSpace(local))
            candidates.Add(Path.Combine(local, "Goo", "DevTools", "goo-devtools"));
        candidates.Add(Path.Combine(AppContext.BaseDirectory, "goo-devtools"));
        candidates.Add(Path.Combine(AppContext.BaseDirectory, "goo-devtools.dll"));
        return candidates;
    }

    internal static ProcessStartInfo CreateStartInfo(string executable, DiscoveryDescriptor descriptor, bool focus)
    {
        var start = new ProcessStartInfo
        {
            FileName = executable.EndsWith(".dll", StringComparison.OrdinalIgnoreCase) ? "dotnet" : executable,
            UseShellExecute = false,
            WorkingDirectory = Path.GetDirectoryName(executable) ?? Environment.CurrentDirectory,
        };
        if (executable.EndsWith(".dll", StringComparison.OrdinalIgnoreCase))
            start.ArgumentList.Add(executable);
        start.ArgumentList.Add("--attach");
        start.ArgumentList.Add("--pipe");
        start.ArgumentList.Add(descriptor.Pipe);
        start.ArgumentList.Add("--pid");
        start.ArgumentList.Add(descriptor.ProcessId.ToString());
        if (focus)
            start.ArgumentList.Add("--focus");
        return start;
    }

    public static string? FindRepositoryRoot(string start)
    {
        var directory = new DirectoryInfo(Path.GetFullPath(start));
        while (directory is not null)
        {
            if (File.Exists(Path.Combine(directory.FullName, "LICENSE"))
                && Path.Exists(Path.Combine(directory.FullName, ".git")))
                return directory.FullName;
            directory = directory.Parent;
        }

        return null;
    }

    private static bool IsRunnable(string path)
    {
        if (!File.Exists(path))
            return false;
        if (OperatingSystem.IsWindows())
            return true;
        if (path.EndsWith(".dll", StringComparison.OrdinalIgnoreCase))
            return true;
        try
        {
            return (File.GetUnixFileMode(path) & UnixFileMode.UserExecute) != 0
                || (File.GetUnixFileMode(path) & UnixFileMode.GroupExecute) != 0
                || (File.GetUnixFileMode(path) & UnixFileMode.OtherExecute) != 0;
        }
        catch (IOException)
        {
            return false;
        }
        catch (UnauthorizedAccessException)
        {
            return false;
        }
    }

    private static void AddFromPath(List<string> candidates, string name)
    {
        var path = Environment.GetEnvironmentVariable("PATH")?.Split(Path.PathSeparator)
            .Where(item => !string.IsNullOrWhiteSpace(item))
            .Select(item => Path.Combine(item, name))
            .FirstOrDefault(IsRunnable);
        if (path is not null)
            candidates.Add(path);
    }
}
