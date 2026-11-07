import Markdig
import Markdig.Extensions.AutoIdentifiers
import System
import System.Collections.Generic
import System.IO
import System.Linq
import System.Net
import System.Text.Json
import System.Text.RegularExpressions

internal data class Page(Source string, Target string, Title string, Group string) : IEquatable[Page] { }

func ShortTitle(title string) string -> WebUtility.HtmlEncode(title.Split(": ")[0])

let arguments = Environment.GetCommandLineArgs().Skip(1).ToArray()
if arguments.Contains("--help") || arguments.Contains("-h") {
    Console.WriteLine("Usage: Goo.Site CHECKOUT OUTPUT_DIRECTORY")
    return
}
if arguments.Length != 2 {
    throw ArgumentException("Usage: Goo.Site CHECKOUT OUTPUT_DIRECTORY")
}
let root = Path.GetFullPath(arguments[0])
let output = Path.GetFullPath(arguments[1])
let site = Path.Combine(root, "site")
let groups = Dictionary[string, string]{
    ["tutorials"] = "Tutorials",
    ["docs"] = "Guides",
    ["api"] = "API reference",
    ["api-audio"] = "Audio API",
    ["api-android"] = "Android API",
    ["devtools"] = "DevTools",
    ["interop"] = "Interop",
    ["migrations"] = "Migrations"
}
let order = groups.Keys.ToList()
let tutorialSources = Regex
    .Matches(File.ReadAllText(Path.Combine(root, "docs/tutorials/README.md")), `\]\(([^)]+)\)`)
    .Select(m -> "docs/tutorials/" + m.Groups[1].Value)
    .ToList()
let pages = Directory
    .GetFiles(Path.Combine(root, "docs"), "*.md", SearchOption.AllDirectories)
    .Select(
    path -> {
        let source = Path.GetRelativePath(root, path).Replace('\\', '/')
        let directory = source[.. source.LastIndexOf('/')]
        let group = directory[(directory.LastIndexOf('/') + 1) ..]
        let heading = File.ReadLines(path).FirstOrDefault(line -> line.StartsWith("# "))
        let target = if source.EndsWith("/README.md") {
            directory + "/index.html"
        } else {
            source[.. ^3] + ".html"
        }
        return Page(
            source,
            target,
            if heading == nil {
                groups[group]
            } else {
                heading[2 ..]
            },
            group
        )
    }
)
    .OrderBy(p -> order.IndexOf(p.Group))
    .ThenBy(p -> !p.Target.EndsWith("/index.html"))
    .ThenBy(p -> tutorialSources.IndexOf(p.Source))
    .ThenBy(p -> p.Title, StringComparer.Ordinal)
    .ToArray()
let nav = string.Concat(
    pages.GroupBy(p -> p.Group).Select(
        g -> {
            let index = g.FirstOrDefault(p -> p.Target.EndsWith("/index.html"))
            let heading = if index == nil {
                groups[g.Key]
            } else {
                "<a href=\"{{root}}${index.Target}\">${groups[g.Key]}</a>"
            }
            let items = g.Where(p -> p != index).Select(
                p -> "<li><a href=\"{{root}}${p.Target}\">${ShortTitle(p.Title)}</a></li>"
            )
            return "<h2>$heading</h2><ul>${string.Concat(items)}</ul>"
        }
    )
)
let tutorials = JsonSerializer.Serialize(
    tutorialSources.Select(
        source -> {
            let page = pages.First(p -> p.Source == source)
            let image = Regex
                .Match(File.ReadAllText(Path.Combine(root, source)), `!\[[^\]]*\]\(([^)]+)\)`)
                .Groups[1]
                .Value
            return []string{ShortTitle(page.Title), page.Target, "docs/tutorials/" + image}
        }
    )
        .ToArray()
)
let pipeline = MarkdownPipelineBuilder().UsePipeTables().UseAutoIdentifiers(AutoIdentifierOptions.GitHub).Build()
let links = Regex(`(?<attribute>href|src)="(?<target>[^"]+)"`)
let firstHeading = Regex(`<h1[^>]*>.*?</h1>\s*`)
let template = File.ReadAllText(Path.Combine(site, "page.html"))
let assets = HashSet[string]()
let missing = List[string]()
let failures = List[string]()
if Directory.Exists(output) {
    Directory.Delete(output, true)
}
for page in pages {
    try {
        let directory = Path.GetDirectoryName(Path.Combine(root, page.Source))!!
        let html = links.Replace(
            Markdown.ToHtml(File.ReadAllText(Path.Combine(root, page.Source)), pipeline),
            (match Match) -> {
                let target = WebUtility.HtmlDecode(match.Groups["target"].Value)
                if target.StartsWith("#") || Regex.IsMatch(target, `^([A-Za-z][A-Za-z0-9+.-]*:|//)`) {
                    return match.Value
                }
                let end = target.IndexOfAny([]char{'#', '?'})
                let path = if end < 0 {
                    target
                } else {
                    target[.. end]
                }
                let suffix = if end < 0 {
                    ""
                } else {
                    target[end ..]
                }
                let destination = Path.GetFullPath(Path.Combine(directory, Uri.UnescapeDataString(path)))
                let local = Path.GetRelativePath(root, destination).Replace('\\', '/')
                let url = if local.StartsWith("docs/") && File.Exists(destination) {
                    if !local.EndsWith(".md") {
                        assets.Add(local)
                        path
                    } else if path.EndsWith("README.md") {
                        path[.. ^9] + "index.html"
                    } else {
                        path[.. ^3] + ".html"
                    }
                } else {
                    if !File.Exists(destination) && !Directory.Exists(destination) {
                        missing.Add(page.Source + ": " + target)
                    }
                    let kind = if Directory.Exists(destination) {
                        "tree"
                    } else {
                        "blob"
                    }
                    "https://github.com/obselate/goo/$kind/main/$local"
                }
                return match.Groups["attribute"].Value + "=\"" + WebUtility.HtmlEncode(url + suffix) + "\""
            }
        )
        let current = "href=\"{{root}}${page.Target}\""
        let file = Path.Combine(output, page.Target)
        Directory.CreateDirectory(Path.GetDirectoryName(file)!!)
        File.WriteAllText(
            file,
            template
                .Replace("{{nav}}", nav.Replace(current, current + " aria-current=\"page\""))
                .Replace("{{title}}", WebUtility.HtmlEncode(page.Title))
                .Replace("{{tutorial}}", tutorialSources.IndexOf(page.Source).ToString())
                .Replace("{{tutorials}}", tutorials)
                .Replace("{{root}}", string.Concat(Enumerable.Repeat("../", page.Target.Count(c -> c == '/'))))
                .Replace("{{content}}", firstHeading.Replace(html, "", 1))
        )
    } catch (error Exception) {
        failures.Add(page.Source + ": " + error.Message)
    }
}
let readme = File.ReadAllText(Path.Combine(root, "README.md"))
let fence = Regex("^```[^\n]*\n(.*?)\n```", RegexOptions.Multiline | RegexOptions.Singleline)
let samples = Dictionary[string, []string]{
    ["fence"] = fence.Matches(readme).Select(m -> m.Groups[1].Value).ToArray(),
    ["code"] = Regex.Matches(fence.Replace(readme, ""), "`([^`\n]+)`").Select(m -> m.Groups[1].Value).ToArray()
}
File.WriteAllText(
    Path.Combine(output, "index.html"),
    Regex
        .Replace(
        File.ReadAllText(Path.Combine(site, "index.html")),
        `\{\{(fence|code) (\d+)\}\}`,
        (match Match) -> {
            return WebUtility.HtmlEncode(samples[match.Groups[1].Value][int.Parse(match.Groups[2].Value) - 1])
        }
    )
        .Replace("{{tutorials}}", tutorials)
        .Replace("{{root}}", "")
)
for path in Directory.GetFiles(site) {
    if Path.GetFileName(path) is not("index.html" or "page.html") {
        File.Copy(path, Path.Combine(output, Path.GetFileName(path)))
    }
}
for local in assets {
    Directory.CreateDirectory(Path.GetDirectoryName(Path.Combine(output, local))!!)
    File.Copy(Path.Combine(root, local), Path.Combine(output, local), true)
}
for line in missing {
    Console.Error.WriteLine("Missing link target in " + line)
}
if failures.Count != 0 {
    throw InvalidOperationException("Pages failed to convert:\n" + string.Join("\n", failures))
}
Console.WriteLine("Built ${pages.Length + 1} pages in $output.")
