import System
import System.Collections.Generic
import System.IO
import System.Linq
import System.Security.Cryptography
import System.Text.Json

let arguments = Environment.GetCommandLineArgs()
let root = Path.GetFullPath(arguments[1])
if !File.Exists(Path.Combine(root, "Goo/Goo.gsproj")) {
    throw InvalidOperationException("Expected a standalone Goo checkout containing Goo/Goo.gsproj")
}
let output = Path.GetFullPath(Path.Combine(AppContext.BaseDirectory, "../../../../../plugins/goo/reference"))
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
    for path in Directory.GetFiles(Path.Combine(root, directory), "*.md").OrderBy(p -> p, StringComparer.Ordinal) {
        paths.Add(Path.GetRelativePath(root, path).Replace('\\', '/'))
    }
}
paths.Add("templates/Goo.Templates/content/Program.gs")
paths.Add("templates/Goo.Templates/content/GooStarter.gsproj")
let files = Dictionary[string, string]()
Directory.CreateDirectory(output)
for relative in paths {
    let source = Path.Combine(root, relative)
    let target = Path.Combine(output, relative)
    Directory.CreateDirectory(Path.GetDirectoryName(target) ?? output)
    File.Copy(source, target, true)
    files[relative] = Convert.ToHexStringLower(SHA256.HashData(File.ReadAllBytes(source)))
}
for path in Directory.GetFiles(output, "*", SearchOption.AllDirectories) {
    if Path.GetFileName(path) != "manifest.json" && !files.ContainsKey(
        Path.GetRelativePath(output, path).Replace('\\', '/')
    ) {
        File.Delete(path)
    }
}
let manifest = Dictionary[string, object]{["repository"] = "https://github.com/obselate/goo", ["files"] = files}
let options = JsonSerializerOptions()
options.WriteIndented = true
File.WriteAllText(Path.Combine(output, "manifest.json"), JsonSerializer.Serialize(manifest, options) + "\n")
Console.WriteLine("Synced ${paths.Count} files. SHA-256 hashes identify the actual working files.")
