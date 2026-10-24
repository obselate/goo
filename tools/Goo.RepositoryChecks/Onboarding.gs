import System
import System.Collections.Generic
import System.IO
import System.Linq
import System.Text.Json.Nodes
import System.Text.RegularExpressions
import System.Xml.Linq

internal shared partial class Checks {
    private func Onboarding() {
        let version = ReadVersion()
        let tracked = Run("git", []string{"ls-files", "-z"})
            .Split('\0')
            .Where(p -> p.Length != 0 && File.Exists(Path.Combine(Root, p)))
            .ToArray()
        ProjectVersions(version, tracked)
        for path in Directory.GetFiles(
            Path.Combine(Root, "templates/Goo.Templates/content"),
            "template.json",
            SearchOption.AllDirectories
        ) {
            let document = JsonNode.Parse(File.ReadAllText(path))!!
            let symbol = document["symbols"]!!["goo-version"]!!
            Require(
                symbol["defaultValue"]?.GetValue[string]() == version &&
                    symbol["replaces"]?.GetValue[string]() == version,
                Path.GetRelativePath(Root, path) + ": template Goo version must be " + version
            )
        }
        ReleaseText(version)
        MarkdownLinks(tracked)
        XDocument.Load(Path.Combine(Root, "integrations/rider/GooDevTools.xml"))
        Console.WriteLine("Onboarding metadata OK: Goo $version, 7 packages")
    }

    private func ProjectVersions(version string, tracked[]string) {
        let expected = HashSet[string](StringComparer.Ordinal)
        expected.UnionWith(
            []string{
                "Goo",
                "Goo.Accessibility",
                "Goo.Audio",
                "Goo.Android",
                "Goo.DevTools",
                "Goo.DevTools.App",
                "Goo.Templates"
            }
        )
        let packages = HashSet[string](StringComparer.Ordinal)
        for relative in tracked {
            if !relative.EndsWith(".csproj") && !relative.EndsWith(".gsproj") {
                continue
            }
            let project = XDocument.Load(Path.Combine(Root, relative))
            let id = project.Descendants("PackageId").FirstOrDefault()?.Value
            if id != nil && id.StartsWith("Goo") {
                packages.Add(id)
                Require(
                    project.Descendants("Version").FirstOrDefault()?.Value == "$(GooReleaseVersion)",
                    relative + ": package version must use $(GooReleaseVersion)"
                )
            }
            for reference in project.Descendants("PackageReference") {
                if reference.Attribute("Include")?.Value != "Goo" {
                    continue
                }
                let standalone = relative.StartsWith("templates/Goo.Templates/content/") || relative.StartsWith(
                    "plugins/goo/reference/templates/Goo.Templates/content/"
                )
                let required = if standalone {
                    version
                } else {
                    "$(GooReleaseVersion)"
                }
                let declared = reference.Attribute("VersionOverride")?.Value ?? reference.Attribute("Version")?.Value
                Require(declared == required, "$relative: Goo reference is $declared, expected $required")
            }
        }
        Require(
            packages.SetEquals(expected),
            "Goo package IDs differ: found=" + string.Join(", ", packages.OrderBy(p -> p)) + " expected=" + string.Join(
                ", ",
                expected.OrderBy(p -> p)
            )
        )
    }

    private func MarkdownProse(text string) string {
        let lines = List[string]()
        var fenced = false
        for line in text.Replace("\r\n", "\n").Split('\n') {
            if line.TrimStart().StartsWith("```") {
                fenced = !fenced
            } else if !fenced {
                lines.Add(line)
            }
        }
        return string.Join("\n", lines)
    }

    private func ReleaseText(version string) {
        CheckRelease(version)
        Require(
            Regex.IsMatch(
                File.ReadAllText(Path.Combine(Root, "CHANGELOG.md")).Replace("\r\n", "\n").Replace('\r', '\n'),
                "^## " + Regex.Escape(version) + ` - \d{4}-\d{2}-\d{2}$`,
                RegexOptions.Multiline
            ),
            "CHANGELOG.md: release heading for $version is missing"
        )
        let readme = File.ReadAllText(Path.Combine(Root, "README.md"))
        let required = []string{
            "dotnet new install Goo.Templates@$version",
            "Windows x64 is tested on Windows 11",
            "minimum supported Windows version is not yet established",
            "## Further reading"
        }
        let missing = required.Where(item -> !readme.Contains(item)).OrderBy(item -> item).ToArray()
        Require(missing.Length == 0, "README.md: required onboarding text is missing: " + string.Join(", ", missing))
        Require(
            !readme.Contains("Windows requires Windows 11"),
            "README.md: Windows 11 must be a tested environment, not a minimum requirement"
        )
        let prose = MarkdownProse(File.ReadAllText(Path.Combine(Root, "docs/nuget-readme.md")))
        let markdown = Regex.Matches(prose, `!?\[[^\]\n]*\]\(([^)\n]+)\)`).Select(m -> m.Groups[1].Value)
        let html = Regex.Matches(prose, `(?:href|src)="([^"]+)"`).Select(m -> m.Groups[1].Value)
        let relative = markdown
            .Concat(html)
            .Where(target -> !target.StartsWith("#") && !target.StartsWith("http://") && !target.StartsWith("https://"))
            .ToArray()
        Require(
            relative.Length == 0,
            "docs/nuget-readme.md: NuGet cannot resolve relative links: " + string.Join(", ", relative)
        )
    }

    private func MarkdownLinks(tracked[]string) {
        let failures = List[string]()
        for relative in tracked {
            if !relative.EndsWith(".md") || relative.StartsWith("vendor/") || relative.StartsWith(
                "plugins/goo/reference/"
            ) {
                continue
            }
            let path = Path.Combine(Root, relative)
            for match in Regex.Matches(MarkdownProse(File.ReadAllText(path)), `!?\[[^\]\n]*\]\(([^)\n]+)\)`) {
                let target = Regex.Split(match.Groups[1].Value.Trim(), `\s+`)[0].Trim('<', '>')
                if target.Length == 0 || target.StartsWith("#") || target.StartsWith("http://") || target.StartsWith(
                    "https://"
                ) ||
                    target.StartsWith("mailto:") {
                    continue
                }
                let destination = ResolvePath(Path.Combine(Path.GetDirectoryName(path) ?? Root, target.Split('#')[0]))
                if destination != Root && !destination.StartsWith(
                    Root + Path.DirectorySeparatorChar,
                    StringComparison.Ordinal
                ) {
                    failures.Add("$relative: $target resolves outside the repository")
                } else if !Path.Exists(destination) {
                    failures.Add("$relative: $target")
                }
            }
        }
        Require(failures.Count == 0, "broken local Markdown links:\n" + string.Join("\n", failures))
    }

    private func ResolvePath(path string) string {
        let full = if Path.IsPathRooted(path) {
            path
        } else {
            Path.Combine(Environment.CurrentDirectory, path)
        }
        let root = Path.GetPathRoot(full) ?? ""
        var resolved = root
        for part in full.Substring(root.Length).Split(Path.DirectorySeparatorChar) {
            if part == "." || part.Length == 0 {
                continue
            }
            if part == ".." {
                resolved = Path.GetDirectoryName(resolved) ?? root
                continue
            }
            resolved = Path.Combine(resolved, part)
            let info FileSystemInfo = if Directory.Exists(resolved) {
                DirectoryInfo(resolved)
            } else {
                FileInfo(resolved)
            }
            if info.LinkTarget != nil {
                resolved = info.ResolveLinkTarget(true)?.FullName ?? resolved
            }
        }
        return resolved
    }
}
