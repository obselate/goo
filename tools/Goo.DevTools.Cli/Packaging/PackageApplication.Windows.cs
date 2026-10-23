namespace Goo.DevTools.Cli;

internal static partial class PackageApplication
{
    private static async Task<string> PackageWindowsAsync(string publish, string workspace, string symbols, Metadata metadata, string tool)
    {
        var version = await ExecuteAsync(tool, ["--version"], workspace, "invalid-tool", capture: true);
        if (!version.Contains("7.1.0", StringComparison.Ordinal))
            throw new CliException("GOO_ISCC must select Inno Setup 7.1.0.", "invalid-tool", "validation");
        var bundle = Path.Combine(workspace, "bundle");
        Directory.CreateDirectory(bundle);
        Directory.CreateDirectory(symbols);
        foreach (var source in Directory.EnumerateFiles(publish, "*", SearchOption.AllDirectories))
        {
            var relative = Path.GetRelativePath(publish, source);
            var destination = Path.Combine(source.EndsWith(".pdb", StringComparison.OrdinalIgnoreCase) ? symbols : bundle, relative);
            Directory.CreateDirectory(Path.GetDirectoryName(destination)!);
            File.Copy(source, destination);
        }
        var executable = metadata.Executable + ".exe";
        if (!File.Exists(Path.Combine(bundle, executable)))
            throw new CliException("The published application executable is missing.", "stage-failed", "stage");
        var name = $"{metadata.Id}-{metadata.Version}-win-x64-setup";
        var script = Path.Combine(workspace, "setup.iss");
        await File.WriteAllTextAsync(script, $$"""
            [Setup]
            AppId={{metadata.Id}}
            AppName={{InnoValue(metadata.Name)}}
            AppVersion={{metadata.Version}}
            AppPublisher={{InnoValue(metadata.Company)}}
            DefaultDirName={localappdata}\Programs\{{metadata.Id}}
            PrivilegesRequired=lowest
            ArchitecturesAllowed=x64os
            ArchitecturesInstallIn64BitMode=x64os
            MinVersion=10.0.22000
            SetupIconFile={{InnoValue(metadata.Icon)}}
            OutputDir={{InnoValue(workspace)}}
            OutputBaseFilename={{name}}
            DisableProgramGroupPage=yes
            UninstallDisplayIcon={app}\{{executable}}
            Compression=lzma2
            SolidCompression=yes
            [Files]
            Source: "{{InnoValue(bundle)}}\*"; DestDir: "{app}"; Flags: ignoreversion recursesubdirs createallsubdirs
            [Icons]
            Name: "{autoprograms}\{{InnoValue(metadata.Name)}}"; Filename: "{app}\{{executable}}"
            """);
        await ExecuteAsync(tool, ["--no-ide-signtools", script], workspace, "package-failed");
        return Path.Combine(workspace, name + ".exe");
    }

    private static string InnoValue(string value) => value.Replace("{", "{{", StringComparison.Ordinal)
        .Replace("\"", "\"\"", StringComparison.Ordinal);
}
