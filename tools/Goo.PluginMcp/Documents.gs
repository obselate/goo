package Goo.PluginMcp

import System
import System.Collections.Concurrent
import System.Collections.Generic
import System.Diagnostics
import System.IO
import System.Linq
import System.Reflection
import System.Security.Cryptography
import System.Text
import System.Text.Json.Nodes
import System.Text.RegularExpressions

partial class GooServer {
    private data class IndexedAssets(Modified int64, Length int64, Value JsonNode) { }
    private let Assets ConcurrentDictionary[string, IndexedAssets] = ConcurrentDictionary[string, IndexedAssets](
        StringComparer.Ordinal
    )

    func Source(repository string) string {
        let chosen = if repository != "" {
            repository
        } else {
            Environment.GetEnvironmentVariable("GOO_SOURCE_ROOT") ?? ""
        }
        if chosen == "" {
            return Bundle
        }
        let root = Resolve(chosen)
        Require(
            File.Exists(Path.Combine(root, "Goo/Goo.gsproj")),
            "Expected a standalone Goo checkout containing Goo/Goo.gsproj"
        )
        return root
    }

    func Documents(root string)[]string {
        if root == Bundle {
            return Manifest["files"]!!.AsObject().Select(x -> x.Key).Order(StringComparer.Ordinal).ToArray()
        }
        let paths = List[string](){
            "docs/svg.md",
            "docs/shipping.md",
            "docs/platform-preflight.md",
            "docs/android.md",
            "docs/images.md",
            "docs/interop.md",
            "docs/devtools/README.md",
            "docs/devtools/cli.md",
            "docs/devtools/protocol.md",
            "templates/Goo.Templates/content/Program.gs",
            "templates/Goo.Templates/content/GooStarter.gsproj",
            "templates/Goo.Templates/content/global.json",
            "templates/Goo.Templates/content/.gitignore",
            "templates/Goo.Templates/content/Properties/PublishProfiles/NativeAot.pubxml",
            "templates/Goo.Templates/content/Properties/PublishProfiles/Trimmed.pubxml"
        }
        for directory in[]string{"docs/api"} {
            let path = Path.Combine(root, directory)
            if Directory.Exists(path) {
                paths.AddRange(
                    Directory.GetFiles(path, "*.md").Select(x -> Path.GetRelativePath(root, x).Replace('\\', '/'))
                )
            }
        }
        return paths.Where(x -> File.Exists(Path.Combine(root, x))).Order(StringComparer.Ordinal).ToArray()
    }

    func Document(root string, path string, documents[]string) string {
        Require(documents.Contains(path), "Unknown document. Use goo_context to list document paths.")
        let target = Resolve(Path.Combine(root, path))
        Require(
            target.StartsWith(root + Path.DirectorySeparatorChar, StringComparison.Ordinal),
            "Document resolves outside the selected source root"
        )
        return target
    }

    func PackageDocuments(project string) Dictionary[string, string] {
        let result = Dictionary[string, string](StringComparer.Ordinal)
        var assets JsonNode? = nil
        if project != "" {
            let selected = Resolve(project)
            let directory = if Directory.Exists(selected) {
                selected
            } else {
                Path.GetDirectoryName(selected)!!
            }
            let path = Path.Combine(directory, "obj/project.assets.json")
            Require(File.Exists(path), "Restore the selected project before reading package API documentation.")
            let file = FileInfo(path)
            if Assets.TryGetValue(path, out var cached) &&
                cached.Modified == file
                .LastWriteTimeUtc
                .Ticks &&
                cached.Length == file.Length {
                assets = cached.Value
            } else {
                assets = JsonNode.Parse(File.ReadAllText(path))!!
                Assets[path] = IndexedAssets(file.LastWriteTimeUtc.Ticks, file.Length, assets)
            }
        }
        let cache = Environment.GetEnvironmentVariable("NUGET_PACKAGES") ?? Path.Combine(
            Environment.GetFolderPath(Environment.SpecialFolder.UserProfile),
            ".nuget/packages"
        )
        for name in[]string{"Goo.Widgets", "Goo.Animations"} {
            if assets != nil {
                for library in assets["libraries"]!!.AsObject().Where(
                    x -> x.Key.StartsWith(name + "/", StringComparison.OrdinalIgnoreCase)
                ) {
                    for folder in assets["packageFolders"]!!.AsObject() {
                        let directory = Path.Combine(folder.Key, S(library.Value, "path"))
                        for target in assets["targets"]!!.AsObject() {
                            let references = target.Value[library.Key]?["compile"] as JsonObject
                            if references == nil {
                                continue
                            }
                            for reference in references {
                                let relative = Path.ChangeExtension(reference.Key, ".xml")
                                let filename = Path.Combine(directory, relative)
                                if Path.GetFileName(filename) == name + ".xml" && File.Exists(filename) {
                                    result["packages/" + library.Key + "/" + relative] = filename
                                }
                            }
                        }
                    }
                }
            } else {
                let directory = Path.Combine(cache, name.ToLowerInvariant())
                if !Directory.Exists(directory) {
                    continue
                }
                let version = Directory
                    .GetDirectories(directory)
                    .Where(
                    x -> System.Version.TryParse(Path.GetFileName(x).Split('+')[0].Split('-')[0], out var parsed)
                )
                    .OrderByDescending(
                    x -> Path.GetFileName(x),
                    Comparer[string].Create((left, right) -> ComparePackageVersions(left, right))
                )
                    .FirstOrDefault()
                if version == nil || !Directory.Exists(Path.Combine(version, "lib")) {
                    continue
                }
                let filename = Directory
                    .GetFiles(Path.Combine(version, "lib"), name + ".xml", SearchOption.AllDirectories)
                    .Order(StringComparer.Ordinal)
                    .LastOrDefault()
                if filename != nil {
                    result[
                        "packages/" + name + "/" + Path.GetFileName(version) + "/" + Path.GetRelativePath(
                            version,
                            filename
                        )
                            .Replace('\\', '/')
                    ] = filename
                }
            }
        }
        return result
    }

    func ComparePackageVersions(left string, right string) int32 {
        let a = left.Split('+')[0].Split('-', 2)
        let b = right.Split('+')[0].Split('-', 2)
        let version = System.Version.Parse(a[0]).CompareTo(System.Version.Parse(b[0]))
        if version != 0 {
            return version
        }
        if a.Length != b.Length {
            return b.Length.CompareTo(a.Length)
        }
        if a.Length == 1 {
            return 0
        }
        let first = a[1].Split('.')
        let second = b[1].Split('.')
        for index in 0 ... Math.Min(first.Length, second.Length) {
            let firstNumeric = uint64.TryParse(first[index], out var firstNumber)
            let secondNumeric = uint64.TryParse(second[index], out var secondNumber)
            let order = if firstNumeric && secondNumeric {
                firstNumber.CompareTo(secondNumber)
            } else if firstNumeric != secondNumeric {
                secondNumeric.CompareTo(firstNumeric)
            } else {
                StringComparer.OrdinalIgnoreCase.Compare(first[index], second[index])
            }
            if order != 0 {
                return order
            }
        }
        return first.Length.CompareTo(second.Length)
    }

    func PackageStatus(packages Dictionary[string, string]) JsonObject {
        let result = JsonObject()
        for name in[]string{"Goo.Widgets", "Goo.Animations"} {
            let path = packages.Keys.FirstOrDefault(
                x -> x.StartsWith("packages/" + name + "/", StringComparison.OrdinalIgnoreCase)
            )
            result[name] = if path != nil {
                JsonValue.Create(path.Split('/')[2])
            } else {
                JsonValue.Create("unavailable")
            }
        }
        return result
    }

    func Provenance(root string) JsonObject {
        let configuration = Path.Combine(root, "global.json")
        let project = Path.Combine(root, "templates/Goo.Templates/content/GooStarter.gsproj")
        let compiler = if File.Exists(configuration) {
            JsonNode.Parse(File.ReadAllText(configuration))?["msbuild-sdks"]?["Gsharp.NET.Sdk"]?.GetValue[string]() ??
                "unavailable"
        } else if File.Exists(project) {
            Regex.Match(File.ReadAllText(project), `Gsharp.NET.Sdk/([^"]+)`).Groups[1].Value
        } else {
            "unavailable"
        }
        if root == Bundle {
            return JsonObject(){
                ["kind"] = "bundle",
                ["repository"] = Manifest["repository"]?.DeepClone(),
                ["bundleHash"] = Hash(File.ReadAllBytes(Path.Combine(Bundle, "manifest.json"))),
                ["dirty"] = false,
                ["compilerVersion"] = compiler
            }
        }
        let revision = Execute([]string{"git", "-C", root, "rev-parse", "HEAD"}, 25)
        let status = Execute([]string{"git", "-C", root, "status", "--porcelain"}, 25)
        return JsonObject(){
            ["kind"] = "checkout",
            ["repository"] = root,
            ["revision"] = if revision.Code == 0 {
                revision.Output.Trim()
            } else {
                "unavailable"
            },
            ["dirty"] = if status.Code == 0 {
                JsonValue.Create(status.Output != "")
            } else {
                JsonValue.Create("unavailable")
            },
            ["compilerVersion"] = compiler
        }
    }

    func Fingerprint() string {
        using let digest = IncrementalHash.CreateHash(HashAlgorithmName.SHA256)
        let paths = List[string](){
            "plugin.json",
            "mcp.json",
            "skills/goo-authoring/SKILL.md",
            "reference/manifest.json"
        }
        for path in paths.Order(StringComparer.Ordinal) {
            digest.AppendData(Encoding.UTF8.GetBytes(path))
            digest.AppendData(File.ReadAllBytes(Path.Combine(Root, path)))
        }
        for path in Directory
            .GetFiles(AppContext.BaseDirectory)
            .Where(x -> x.EndsWith(".dll") || x.EndsWith(".json"))
            .Order(StringComparer.Ordinal) {
            digest.AppendData(Encoding.UTF8.GetBytes("runtime/" + Path.GetFileName(path)))
            digest.AppendData(File.ReadAllBytes(path))
        }
        return Convert.ToHexStringLower(digest.GetHashAndReset())
    }

    func Configuration() JsonObject {
        let path = Path.Combine(Root, "mcp.json")
        let issues = List[string]()
        try {
            let config = JsonNode.Parse(File.ReadAllText(path))!!
            let server = config["mcpServers"]?["goo"]
            if S(config, "$$schema") != "https://agent-plugins.org/schemas/1.0.0/mcp.schema.json" {
                issues.Add("The Goo MCP manifest does not use the portable Agent Plugins schema.")
            }
            let version = Assembly.GetEntryAssembly()!!
                .GetCustomAttribute[AssemblyInformationalVersionAttribute]()
                .InformationalVersion
                .Split('+')[0]
            let expected = Strings(
                []string{"tool", "exec", "Goo.DevTools@" + version, "--", "mcp", "--plugin-root", "$${PLUGIN_ROOT}"}
            )
            if server == nil ||
                S(server, "type") != "stdio" ||
                S(server, "command") != "dotnet" ||
                !JsonNode
                .DeepEquals(server["args"], expected) {
                issues.Add("The Goo MCP manifest does not declare the pinned Goo.DevTools MCP command.")
            }
        } catch (error Exception) {
            issues.Add("The Goo MCP manifest is unreadable: " + error.Message)
        }
        let status = Template("configuration")
        status["configured"] = issues.Count == 0
        status["manifest"] = path
        status["runtimeEnvironment"] = AppContext.BaseDirectory
        status["issues"] = Strings(issues)
        if issues.Count == 0 {
            status["actions"] = JsonArray()
        }
        return status
    }

    func Context(repository string) JsonObject {
        let root = Source(repository)
        let fingerprint = Fingerprint()
        let result = Template("context")
        result["source"] = root
        result["bundled"] = root == Bundle
        result["provenance"] = Provenance(root)
        result["documents"] = Strings(Documents(root))
        result[
            "runtime"
        ] = "Install Goo.DevTools 0.30.1 and launch with goo dev --project App.gsproj. Add --input for agent interaction. Use goo_list to list live windows. Runtime tools accept project, pid, pipe, app, window, latest and wait in seconds. GOO_CLI may name a goo executable or built Goo.DevTools.Cli.dll."
        let preflight = result["preflight"]!!
        let plugin = preflight["plugin"]!!
        plugin["version"] = Version
        plugin["loadedSource"] = Root
        plugin["loadedFingerprint"] = LoadedFingerprint
        plugin["diskFingerprint"] = fingerprint
        plugin["restartRequired"] = fingerprint != LoadedFingerprint
        preflight["configuration"] = Configuration()
        preflight["cli"] = CliPreflight()
        return result
    }

    func Read(a JsonObject) JsonObject {
        let root = Source(S(a, "repository"))
        let path = S(a, "path")
        let documents = Documents(root)
        let packages = PackageDocuments(S(a, "project"))
        let filename = if packages.TryGetValue(path, out var packageFile) {
            packageFile
        } else {
            Document(root, path, documents)
        }
        let units = Units(path, filename)
        let id = S(a, "section_id")
        let line = I(a, "line")
        let count = I(a, "count")
        let offset = I(a, "offset")
        let cap = I(a, "max_bytes")
        Require(
            line >= 1 && count >= 0 && count <= 240 && offset >= 0 && cap >= 64 && cap <= 16000,
            "Use a positive line, count 0-240, nonnegative offset and max_bytes 64-16000"
        )
        let unit = if id != "" {
            units.FirstOrDefault(x -> x.Id == id)
        } else {
            units.LastOrDefault(x -> x.Start <= line)
        }
        Require(unit != nil, "Unknown or stale section_id. Search the selected source again.")
        let selected = unit
        let text = if count > 0 {
            string.Join(
                "\n",
                Lines(Encoding.UTF8.GetString(File.ReadAllBytes(filename))).Skip(int32(line) - 1).Take(int32(count))
            )
        } else {
            (
                if selected.Parent != "" {
                    selected.Parent + "\n\n"
                } else {
                    ""
                }
            ) +
                selected.Text
        }
        Require(offset <= text.Length, "offset exceeds the selected unit")
        var end = int32(offset)
        var used = 0
        while end < text.Length {
            let length = if char.IsHighSurrogate(text[end]) && end + 1 < text.Length {
                2
            } else {
                1
            }
            let size = Encoding.UTF8.GetByteCount(text.AsSpan(end, length))
            if used + size > cap {
                break
            }
            used += size
            end += length
        }
        let result = JsonObject(){
            ["source"] = root,
            ["path"] = path,
            ["sha256"] = selected.Hash,
            ["section_id"] = selected.Id,
            ["section"] = selected.Heading,
            ["totalLines"] = units.Max(x -> x.End),
            ["line"] = if count > 0 {
                line
            } else {
                int64(selected.Start)
            },
            ["endLine"] = if count > 0 {
                Math.Min(line + count - 1, int64(units.Max(x -> x.End)))
            } else {
                int64(selected.End)
            },
            ["text"] = text.Substring(int32(offset), end - int32(offset)),
            ["complete"] = end == text.Length,
            ["continuation"] = if end < text.Length {
                JsonObject(){["section_id"] = selected.Id, ["offset"] = end, ["line"] = line, ["count"] = count}
            } else {
                nil
            },
            ["bytes"] = used
        }
        let assembly = Path.ChangeExtension(filename, ".dll")
        if path.EndsWith(".xml") && File.Exists(assembly) {
            result["assembly"] = JsonObject(){
                ["path"] = Path.ChangeExtension(path, ".dll"),
                ["sha256"] = Index[filename].AssemblyHash
            }
        }
        return result
    }

    func Starter(a JsonObject) JsonObject {
        let name = S(a, "name")
        Require(
            Regex.IsMatch(name, "^[A-Za-z][A-Za-z0-9_]{0,63}$"),
            "Use a simple identifier starting with an ASCII letter, up to 64 characters"
        )
        let root = Source(S(a, "repository"))
        let documents = Documents(root)
        let files = JsonObject()
        let sourceFiles = JsonObject()
        for filename in[]string{
            "Program.gs",
            "GooStarter.gsproj",
            "global.json",
            ".gitignore",
            "Properties/PublishProfiles/NativeAot.pubxml",
            "Properties/PublishProfiles/Trimmed.pubxml"
        } {
            let relative = "templates/Goo.Templates/content/" + filename
            let template = Document(root, relative, documents)
            let content = File.ReadAllText(template)
            sourceFiles[relative] = Hash(File.ReadAllBytes(template))
            files[filename.Replace("GooStarter", name)] = content.Replace("goostarter", name.ToLowerInvariant())
                .Replace("GooStarter", name)
        }
        let project = S(files, name + ".gsproj")
        let sdk = Regex.Match(project, "<Project Sdk=\"Gsharp.NET.Sdk/([^\"]+)\"")
        let packageMatch = Regex.Match(project, "<PackageReference Include=\"Goo\" Version=\"([^\"]+)\"")
        let configured = Environment.GetEnvironmentVariable("GOO_SOURCE_ROOT") ?? ""
        let trusted = root == Bundle || configured != "" && root == Resolve(configured)
        let linter = Path.Combine(root, "tools/Goo.Gslint/Goo.Gslint.gsproj")
        let lint = if trusted && File.Exists(linter) {
            "dotnet run --project " +
                Quote(linter) +
                " -c Release -- --strict --severity GL0005=none --severity GL0006=none Program.gs"
        } else {
            "unavailable"
        }
        let build = "dotnet build " + name + ".gsproj -c Release --nologo -warnaserror"
        let provenance = Provenance(root)
        provenance["sourceFiles"] = sourceFiles
        let generated = JsonObject()
        for file in files {
            generated[file.Key] = Hash(Encoding.UTF8.GetBytes(file.Value.GetValue[string]()))
        }
        provenance["generatedFiles"] = generated
        return JsonObject(){
            ["source"] = root,
            ["provenance"] = provenance,
            ["versions"] = JsonObject(){
                ["gsharpSdk"] = if sdk.Success {
                    sdk.Groups[1].Value
                } else {
                    "unavailable"
                },
                ["goo"] = if packageMatch.Success {
                    packageMatch.Groups[1].Value
                } else {
                    "unavailable"
                },
                ["compilerVersion"] = provenance["compilerVersion"]?.DeepClone()
            },
            ["files"] = files,
            ["lint"] = lint,
            ["build"] = build,
            ["run"] = "goo dev"
        }
    }

    shared {
        func Hash(data[]byte) string -> Convert.ToHexStringLower(SHA256.HashData(data))

        func Lines(text string)[]string {
            if text == "" {
                return []string{}
            }
            var lines = Regex.Split(text, "\\r\\n|[\\n\\r\\v\\f\\x1c-\\x1e\\x85\\u2028\\u2029]")
            if lines.Last() == "" {
                Array.Resize(ref lines, lines.Length - 1)
            }
            return lines
        }

        func Resolve(path string) string {
            let expanded = if path == "~" {
                Environment.GetFolderPath(Environment.SpecialFolder.UserProfile)
            } else if path.StartsWith("~/") {
                Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.UserProfile), path.Substring(2))
            } else {
                path
            }
            var current = Path.GetPathRoot(Path.GetFullPath(expanded))!!
            for part in Path.GetFullPath(expanded).Substring(current.Length).Split(Path.DirectorySeparatorChar) {
                current = Path.Combine(current, part)
                let info FileSystemInfo = if Directory.Exists(current) {
                    DirectoryInfo(current)
                } else {
                    FileInfo(current)
                }
                if info.LinkTarget != nil {
                    current = info.ResolveLinkTarget(true)!!.FullName
                }
            }
            return Path.TrimEndingDirectorySeparator(current)
        }

        func Quote(value string) string -> if Regex.IsMatch(value, "^[a-zA-Z0-9_@%+=:,./-]+$") {
            value
        } else {
            "'" + value.Replace("'", "'\"'\"'") + "'"
        }
    }
}
