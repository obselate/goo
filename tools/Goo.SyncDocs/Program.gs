import System
import System.Collections.Generic
import System.IO
import System.Linq
import System.Security.Cryptography
import System.Text.Json
import System.Text.RegularExpressions

let arguments = Environment.GetCommandLineArgs().Skip(1).ToArray()
if arguments.Contains("--help") || arguments.Contains("-h") {
    Console.WriteLine("Usage: Goo.SyncDocs CHECKOUT [OUTPUT_DIRECTORY [API_DIRECTORY]]")
    return
}
if arguments.Length < 1 || arguments.Length > 3 || arguments.Any(a -> a.StartsWith("-")) {
    throw ArgumentException("Usage: Goo.SyncDocs CHECKOUT [OUTPUT_DIRECTORY [API_DIRECTORY]]")
}
let root = Path.GetFullPath(arguments[0])
if !File.Exists(Path.Combine(root, "Goo/Goo.gsproj")) {
    throw InvalidOperationException("Expected a standalone Goo checkout containing Goo/Goo.gsproj")
}
let output = Path.GetFullPath(if arguments.Length > 1 { arguments[1] } else { Path.Combine(root, "plugins/goo/reference") })
let api = Path.GetFullPath(if arguments.Length > 2 { arguments[2] } else { Path.Combine(root, "docs/api") })
let paths = List[string]{
    "README.md",
    "CONTRIBUTING.md",
    "docs/native-authoring.md",
    "docs/production-readiness.md",
    "docs/svg.md",
    "docs/migrations/gcv1.md",
    "docs/shipping.md",
    "docs/platform-preflight.md"
}
let directories = List[string]{"docs/api", "docs/devtools"}
for directory in directories {
    let input = if directory == "docs/api" { api } else { Path.Combine(root, directory) }
    for path in Directory.GetFiles(input, "*.md").OrderBy(p -> p, StringComparer.Ordinal) {
        paths.Add(directory + "/" + Path.GetFileName(path))
    }
}
paths.Add("templates/Goo.Templates/content/Program.gs")
paths.Add("templates/Goo.Templates/content/GooStarter.gsproj")
let revision = "main"
let links = Regex(`(?<prefix>!?\[[^\]\n]*\]\(\s*<?|(?:href|src)=["'])(?<target>[^)\s<>"']+)`)
let files = Dictionary[string, string]()
Directory.CreateDirectory(output)
for relative in paths {
    let source = Path.Combine(root, relative)
    let input = if relative.StartsWith("docs/api/") { Path.Combine(api, Path.GetFileName(relative)) } else { source }
    let target = Path.Combine(output, relative)
    Directory.CreateDirectory(Path.GetDirectoryName(target) ?? output)
    if relative.EndsWith(".md", StringComparison.Ordinal) {
        let lines = File.ReadAllText(input).Split('\n')
        var fence = ""
        for var i = 0; i < lines.Length; i++ {
            let trimmed = lines[i].TrimStart()
            if fence.Length != 0 {
                if trimmed.StartsWith(fence, StringComparison.Ordinal) { fence = "" }
                continue
            }
            if trimmed.StartsWith("```") || trimmed.StartsWith("~~~") {
                fence = trimmed[..3]
                continue
            }
            lines[i] = links.Replace(lines[i], (match Match) -> {
                let target = match.Groups["target"].Value
                if target.StartsWith("#") || target.StartsWith("//") || Regex.IsMatch(target, `^[A-Za-z][A-Za-z0-9+.-]*:`) {
                    return match.Value
                }
                let end = target.IndexOfAny([]char{'#', '?'})
                let path = if end < 0 { target } else { target[..end] }
                let suffix = if end < 0 { "" } else { target[end..] }
                let destination = Path.GetFullPath(Path.Combine(Path.GetDirectoryName(source) ?? root, Uri.UnescapeDataString(path)))
                let local = Path.GetRelativePath(root, destination).Replace('\\', '/')
                if paths.Contains(local) || paths.Any(p -> p.StartsWith(local + "/", StringComparison.Ordinal)) {
                    return match.Value
                }
                let kind = if Directory.Exists(destination) { "tree" } else { "blob" }
                let url = "https://github.com/obselate/goo/$kind/$revision/" +
                    string.Join("/", local.Split('/').Select(Uri.EscapeDataString)) + suffix
                return match.Groups["prefix"].Value + url
            })
        }
        File.WriteAllText(target, string.Join("\n", lines))
    } else {
        File.Copy(input, target, true)
    }
    files[relative] = Convert.ToHexStringLower(SHA256.HashData(File.ReadAllBytes(target)))
}
for path in Directory.GetFiles(output, "*", SearchOption.AllDirectories) {
    if Path.GetFileName(path) != "manifest.json" && !files.ContainsKey(
        Path.GetRelativePath(output, path).Replace('\\', '/')
    ) {
        File.Delete(path)
    }
}
let manifest = Dictionary[string, object]{["repository"] = "https://github.com/obselate/goo", ["revision"] = revision, ["files"] = files}
let options = JsonSerializerOptions()
options.WriteIndented = true
File.WriteAllText(Path.Combine(output, "manifest.json"), JsonSerializer.Serialize(manifest, options) + "\n")
Console.WriteLine("Synced ${paths.Count} files. SHA-256 hashes identify the actual working files.")
