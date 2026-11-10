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
        Require(arguments.Length == 1, "Expected one of --check, --write, --dry-run or --notes")
        let mode = arguments[0]
        Require(
            mode == "--check" || mode == "--write" || mode == "--dry-run" || mode == "--notes",
            "Expected one of --check, --write, --dry-run or --notes"
        )
        let version = ReadVersion()
        let fragments = ChangelogFragments()
        if mode == "--dry-run" {
            Console.Write(JoinedChangelog(version, fragments))
            return
        }
        if mode == "--notes" {
            Require(fragments.Count == 0, "Join changelog.d fragments with release --write before extracting release notes")
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
            let changelog = JoinedChangelog(version, fragments)
            for (path, expected) in SynchronizedFiles(version) {
                if File.ReadAllText(path) != expected {
                    File.WriteAllText(path, expected)
                }
            }
            File.WriteAllText(Path.Combine(Root, "CHANGELOG.md"), changelog)
            for path in fragments.Keys {
                File.Delete(path)
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

    private func ChangelogFragments() Dictionary[string, string] {
        let result = Dictionary[string, string](StringComparer.Ordinal)
        let directory = Path.Combine(Root, "changelog.d")
        Require(
            !Regex.IsMatch(File.ReadAllText(Path.Combine(Root, "CHANGELOG.md")), "^## Unreleased", RegexOptions.Multiline),
            "Add pending changes in changelog.d, not a CHANGELOG.md Unreleased section"
        )
        if !Directory.Exists(directory) {
            return result
        }
        for path in Directory.GetFiles(directory).OrderBy(p -> p, StringComparer.Ordinal) {
            let text = File.ReadAllText(path).Replace("\r\n", "\n").Replace('\r', '\n').Trim()
            Require(
                Regex.IsMatch(Path.GetFileName(path), `\A[a-z0-9][a-z0-9.-]*\.md\z`) &&
                    Regex.IsMatch(text, `\A## (Added|Changed|Fixed|Removed)\n\n- [^\n]+(?:\n- [^\n]+)*\z`),
                Path.GetRelativePath(Root, path) + ": expected ## Added, Changed, Fixed or Removed, a blank line and one or more single-line bullets"
            )
            result.Add(path, text)
        }
        return result
    }

    private func JoinedChangelog(version string, fragments Dictionary[string, string]) string {
        let text = File.ReadAllText(Path.Combine(Root, "CHANGELOG.md")).Replace("\r\n", "\n").Replace('\r', '\n')
        if Regex.IsMatch(text, "^## " + Regex.Escape(version) + " - ", RegexOptions.Multiline) {
            Require(fragments.Count == 0, "CHANGELOG.md already contains Goo $version. Update GooReleaseVersion before joining fragments")
            return text
        }
        Require(fragments.Count != 0, "No changelog.d fragments to join for Goo $version")
        let first = Regex.Match(text, "^## ", RegexOptions.Multiline)
        Require(first.Success, "CHANGELOG.md has no version sections")
        let sections = List[string]()
        for section in []string{"Added", "Changed", "Fixed", "Removed"} {
            let bullets = fragments.Values
                .Where(fragment -> fragment.StartsWith("## " + section + "\n"))
                .Select(fragment -> fragment.Substring(fragment.IndexOf("\n\n") + 2))
                .ToArray()
            if bullets.Length != 0 {
                sections.Add("### " + section + "\n\n" + string.Join("\n", bullets))
            }
        }
        return text.Substring(0, first.Index) + "## " + version + " - " + DateTime.UtcNow.ToString("yyyy-MM-dd") +
            "\n\n" + string.Join("\n\n", sections) + "\n\n" + text.Substring(first.Index)
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
            "apps/Goo.DevTools/DiagnosticWire.gs",
            "apps/Goo.DevTools/Program.gs",
            "apps/Goo.Gallery/Program.gs",
            "docs/devtools/protocol.md",
            "integrations/vscode/package.json",
            "templates/Goo.Templates/README.md"
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
        result[readme] = text
        let documents = Path.Combine(Root, "tools/Goo.PluginMcp/Documents.gs")
        result[documents] = ReplaceVersion(
            File.ReadAllText(documents),
            `(\] = "Install Goo\.DevTools )[^" ]+( and launch with goo dev --project)`,
            version,
            1,
            "tools/Goo.PluginMcp/Documents.gs: expected one current runtime version"
        )
        let runtime = Path.Combine(Root, "tools/Goo.PluginMcp/Runtime.gs")
        result[runtime] = ReplaceVersion(
            File.ReadAllText(runtime),
            "(Run `dotnet tool update --global Goo\\.DevTools --version )[^`]+(`\\. Set GOO_CLI only when testing a compatible source build\\.)",
            version,
            1,
            "tools/Goo.PluginMcp/Runtime.gs: expected one current CLI recovery version"
        )
        let manifest = Path.Combine(Root, "plugins/goo/mcp.json")
        result[manifest] = ReplaceVersion(
            File.ReadAllText(manifest),
            `(Goo\.DevTools@)[^"]+(")`,
            version,
            1,
            "plugins/goo/mcp.json: expected one pinned Goo.DevTools package"
        )
        return result
    }
}
