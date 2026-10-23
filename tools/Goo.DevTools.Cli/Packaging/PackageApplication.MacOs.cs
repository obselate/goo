using System.Xml.Linq;

namespace Goo.DevTools.Cli;

internal static partial class PackageApplication
{
    private static async Task<string> PackageMacOsAsync(string publish, string workspace, string symbols, Metadata metadata)
    {
        var plist = Path.Combine(workspace, "Info.plist");
        var values = new Dictionary<string, string>
        {
            ["CFBundleIdentifier"] = metadata.Id,
            ["CFBundleExecutable"] = metadata.Executable,
            ["CFBundleName"] = metadata.Name,
            ["CFBundleDisplayName"] = metadata.Name,
            ["CFBundlePackageType"] = "APPL",
            ["CFBundleShortVersionString"] = metadata.Version,
            ["CFBundleVersion"] = metadata.Version,
            ["CFBundleIconFile"] = Path.GetFileName(metadata.Icon),
            ["LSMinimumSystemVersion"] = "14.0"
        };
        var dictionary = new XElement("dict", values.SelectMany(pair => new[]
        {
            new XElement("key", pair.Key), new XElement("string", pair.Value)
        }));
        dictionary.Add(new XElement("key", "NSHighResolutionCapable"), new XElement("true"));
        new XDocument(new XDeclaration("1.0", "UTF-8", null),
            new XDocumentType("plist", "-//Apple//DTD PLIST 1.0//EN", "http://www.apple.com/DTDs/PropertyList-1.0.dtd", null),
            new XElement("plist", new XAttribute("version", "1.0"), dictionary)).Save(plist);
        var iconDestination = Path.Combine(publish, Path.GetFileName(metadata.Icon));
        if (!File.Exists(iconDestination))
            File.Copy(metadata.Icon, iconDestination);
        var app = Path.Combine(workspace, metadata.Executable + ".app");
        await ExecuteAsync("bash", [Path.Combine(AppContext.BaseDirectory, "Packaging", "stage-macos-arm64.sh"),
            publish, app, symbols, metadata.Executable, plist, metadata.Version], workspace, "stage-failed");
        var source = Path.Combine(workspace, "dmg");
        Directory.CreateDirectory(source);
        await ExecuteAsync("ditto", [app, Path.Combine(source, Path.GetFileName(app))], workspace, "stage-failed");
        Directory.CreateSymbolicLink(Path.Combine(source, "Applications"), "/Applications");
        var artifact = Path.Combine(workspace, $"{metadata.Id}-{metadata.Version}-osx-arm64.dmg");
        await ExecuteAsync("hdiutil", ["create", "-volname", metadata.Name, "-srcfolder", source,
            "-format", "UDZO", artifact], workspace, "package-failed");
        await ExecuteAsync("hdiutil", ["verify", artifact], workspace, "package-failed");
        return artifact;
    }
}
