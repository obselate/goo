import System
import System.Collections.Generic
import System.IO
import System.Linq
import System.Text.RegularExpressions
import System.Xml.Linq

internal shared partial class Checks {
    private const InlineVersion string = `\b0\.\d+\.\d+(?:-[0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*)?\b`

    private func ReadVersion() string {
        let version = XDocument
            .Load(Path.Combine(Root, "Directory.Build.props"))
            .Descendants("GooReleaseVersion")
            .FirstOrDefault()
            ?.Value ??
            ""
        Require(
            Regex.IsMatch(
                version,
                `\A(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)(-[0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*)?\z`
            ),
            "Directory.Build.props: GooReleaseVersion is missing or invalid"
        )
        return version
    }

    private func Release(arguments[]string) {
        Require(arguments.Length == 1, "Expected one of --check, --write or --notes")
        let mode = arguments[0]
        Require(
            mode == "--check" || mode == "--write" || mode == "--notes",
            "Expected one of --check, --write or --notes"
        )
        let version = ReadVersion()
        if mode == "--notes" {
            let text = File.ReadAllText(Path.Combine(Root, "CHANGELOG.md")).Replace("\r\n", "\n").Replace('\r', '\n')
            let entries = Regex.Matches(
                text,
                "^## " + Regex.Escape(version) + ` - \d{4}-\d{2}-\d{2}[ \t]*$`,
                RegexOptions.Multiline
            )
            Require(entries.Count != 0, "CHANGELOG.md: release entry for Goo $version is missing")
            Require(entries.Count == 1, "CHANGELOG.md: duplicate release entries for Goo $version")
            let entry = entries[0]
            let next = Regex.Match(text.Substring(entry.Index + entry.Length), "^## ", RegexOptions.Multiline)
            let end = if next.Success {
                entry.Index + entry.Length + next.Index
            } else {
                text.Length
            }
            Require(
                text.Substring(entry.Index + entry.Length, end - entry.Index - entry.Length).Trim().Length != 0,
                "CHANGELOG.md: release entry for Goo $version is empty"
            )
            Console.Write(text.Substring(entry.Index, end - entry.Index).TrimEnd() + "\n")
            return
        }
        if mode == "--write" {
            for (path, expected) in SynchronizedFiles(version) {
                if File.ReadAllText(path) != expected {
                    File.WriteAllText(path, expected)
                }
            }
        }
        CheckRelease(version)
        Console.WriteLine(
            if mode == "--write" {
                "Synchronized Goo $version"
            } else {
                "Release version OK: Goo $version"
            }
        )
    }

    private func CheckRelease(version string) {
        let stale = List[string]()
        for (path, expected) in SynchronizedFiles(version) {
            if File.ReadAllText(path) != expected {
                stale.Add(Path.GetRelativePath(Root, path))
            }
        }
        Require(stale.Count == 0, "release version is stale in:\n" + string.Join("\n", stale))
    }

    private func ReplaceVersion(text string, pattern string, version string, count int32, message string) string {
        let regex = Regex(pattern)
        Require(regex.Matches(text).Count == count, message)
        return regex.Replace(text, m -> m.Groups[1].Value + version + m.Groups[2].Value)
    }

    private func SynchronizedFiles(version string) Dictionary[string, string] {
        let result = Dictionary[string, string]()
        let literals = []string{
            "CONTRIBUTING.md",
            "README.md",
            "docs/nuget-readme.md",
            "apps/Goo.DevTools/DiagnosticWire.gs",
            "apps/Goo.DevTools/Program.gs",
            "apps/Goo.DevTools/README.md",
            "apps/Goo.Gallery/Program.gs",
            "docs/devtools/README.md",
            "docs/devtools/protocol.md",
            "integrations/rider/README.md",
            "integrations/vscode/README.md",
            "integrations/vscode/package.json",
            "templates/Goo.Templates/README.md",
            "tools/Goo.DevTools.Cli/CliApplication.gs",
            "tools/Goo.DevTools.Cli/ProtocolConnection.gs"
        }
        for relative in literals {
            let path = Path.Combine(Root, relative)
            let text = File.ReadAllText(path)
            Require(Regex.IsMatch(text, InlineVersion), relative + ": no synchronized release version found")
            result[path] = Regex.Replace(
                Regex.Replace(text, InlineVersion, version),
                `(?<=/releases/download/v)0\.\d+\.\d+(?:-[0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*)?`,
                version
            )
        }
        let templates = Path.Combine(Root, "templates/Goo.Templates/content")
        for path in Directory.GetFiles(templates, "*proj", SearchOption.AllDirectories) {
            result[path] = ReplaceVersion(
                File.ReadAllText(path),
                `(<PackageReference Include="Goo(?:\.Android)?" Version=")[^"]+(" />)`,
                version,
                1,
                Path.GetRelativePath(Root, path) + ": expected one Goo PackageReference"
            )
        }
        for path in Directory.GetFiles(templates, "template.json", SearchOption.AllDirectories) {
            result[path] = ReplaceVersion(
                File.ReadAllText(path),
                `("(?:defaultValue|replaces)": ")` + InlineVersion + `("[,])`,
                version,
                2,
                Path.GetRelativePath(Root, path) + ": expected two Goo version fields"
            )
        }
        let readme = Path.Combine(Root, "plugins/goo/README.md")
        let text = ReplaceVersion(
            File.ReadAllText(readme),
            `(and Goo\.DevTools )[^ ]+?(\. The server uses)`,
            version,
            1,
            "plugins/goo/README.md: expected one current CLI prerequisite version"
        )
        result[readme] = ReplaceVersion(
            text,
            "(Install the runtime CLI with `dotnet tool install --global Goo\\.DevTools --version )[^`]+(`\\.)",
            version,
            1,
            "plugins/goo/README.md: expected one current CLI install version"
        )
        let server = Path.Combine(Root, "plugins/goo/scripts/server.py")
        let runtime = ReplaceVersion(
            File.ReadAllText(server),
            `("runtime": "Install Goo\.DevTools )[^" ]+( and launch with goo dev --project)`,
            version,
            1,
            "plugins/goo/scripts/server.py: expected one current runtime version"
        )
        result[server] = ReplaceVersion(
            runtime,
            "(Run `dotnet tool update --global Goo\\.DevTools --version )[^`]+(`\\. Set GOO_CLI only when testing a compatible source build\\.)",
            version,
            2,
            "plugins/goo/scripts/server.py: expected two current CLI recovery versions"
        )
        return result
    }
}
