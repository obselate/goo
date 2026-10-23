package Goo.DevTools.Cli

import System
import System.IO

internal shared partial class PackageApplication {
    private async func PackageWindowsAsync(
        publish string,
        workspace string,
        symbols string,
        metadata Metadata,
        tool string
    ) string {
        let version = await ExecuteAsync(tool, []string{"--version"}, workspace, "invalid-tool", capture: true)
        if !version.Contains("7.1.0", StringComparison.Ordinal) {
            throw CliException("GOO_ISCC must select Inno Setup 7.1.0.", "invalid-tool", "validation")
        }
        let bundle = Path.Combine(workspace, "bundle")
        Directory.CreateDirectory(bundle)
        Directory.CreateDirectory(symbols)
        for source in Directory.EnumerateFiles(publish, "*", SearchOption.AllDirectories) {
            let relative = Path.GetRelativePath(publish, source)
            let destination = Path.Combine(
                if source.EndsWith(".pdb", StringComparison.OrdinalIgnoreCase) {
                    symbols
                } else {
                    bundle
                },
                relative
            )
            Directory.CreateDirectory(Path.GetDirectoryName(destination)!!)
            File.Copy(source, destination)
        }
        let executable = metadata.Executable + ".exe"
        if !File.Exists(Path.Combine(bundle, executable)) {
            throw CliException("The published application executable is missing.", "stage-failed", "stage")
        }
        let name = "${metadata.Id}-${metadata.Version}-win-x64-setup"
        let script = Path.Combine(workspace, "setup.iss")
        await File.WriteAllTextAsync(script, (`[Setup]
AppId=` + "${metadata.Id}" + `
AppName=` + "${InnoValue(metadata.Name)}" + `
AppVersion=` + "${metadata.Version}" + `
AppPublisher=` + "${InnoValue(metadata.Company)}" + `
DefaultDirName={localappdata}\Programs\` + "${metadata.Id}" + `
PrivilegesRequired=lowest
ArchitecturesAllowed=x64os
ArchitecturesInstallIn64BitMode=x64os
MinVersion=10.0.22000
SetupIconFile=` + "${InnoValue(metadata.Icon)}" + `
OutputDir=` + "${InnoValue(workspace)}" + `
OutputBaseFilename=` + "$name" + `
DisableProgramGroupPage=yes
UninstallDisplayIcon={app}\` + "$executable" + `
Compression=lzma2
SolidCompression=yes
[Files]
Source: "` + "${InnoValue(bundle)}" + `\*"; DestDir: "{app}"; Flags: ignoreversion recursesubdirs createallsubdirs
[Icons]
Name: "{autoprograms}\` + "${InnoValue(metadata.Name)}" + `"; Filename: "{app}\` + "$executable" + `"`))
        await ExecuteAsync(tool, []string{"--no-ide-signtools", script}, workspace, "package-failed")
        return Path.Combine(workspace, name + ".exe")
    }

    private func InnoValue(value string) string -> value.Replace("{", "{{", StringComparison.Ordinal).Replace(
        "\"",
        "\"\"",
        StringComparison.Ordinal
    )
}
