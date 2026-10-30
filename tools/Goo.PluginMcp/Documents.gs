package Goo.PluginMcp

import System
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
            "README.md",
            "CONTRIBUTING.md",
            "docs/native-authoring.md",
            "templates/Goo.Templates/content/Program.gs",
            "templates/Goo.Templates/content/GooStarter.gsproj"
        }
        for directory in[]string{"docs/api", "docs/devtools"} {
            let path = Path.Combine(root, directory)
            if Directory.Exists(path) {
                paths.AddRange(
                    Directory.GetFiles(path, "*.md").Select(x -> Path.GetRelativePath(root, x).Replace('\\', '/'))
                )
            }
        }
        return paths.Where(x -> File.Exists(Path.Combine(root, x))).Order(StringComparer.Ordinal).ToArray()
    }

    func Document(root string, path string) string {
        Require(Documents(root).Contains(path), "Unknown document. Use goo_context to list document paths.")
        let target = Resolve(Path.Combine(root, path))
        Require(
            target.StartsWith(root + Path.DirectorySeparatorChar, StringComparison.Ordinal),
            "Document resolves outside the selected source root"
        )
        return target
    }

    func Provenance(root string) JsonObject {
        let contributing = Path.Combine(root, "CONTRIBUTING.md")
        let match = Regex.Match(
            if File.Exists(contributing) {
                File.ReadAllText(contributing)
            } else {
                ""
            },
            "(?:pin is upstream `|https://github.com/DavidObando/gsharp/tree/)([0-9a-f]{40})"
        )
        let compilerFile = Path.Combine(root, "artifacts/gsharp/commit")
        let compiler = if File.Exists(compilerFile) {
            File.ReadAllText(compilerFile).Trim()
        } else if match.Success {
            match.Groups[1].Value
        } else {
            "unavailable"
        }
        if root == Bundle {
            return JsonObject(){
                ["kind"] = "bundle",
                ["repository"] = Manifest["repository"]?.DeepClone(),
                ["files"] = Manifest["files"]?.DeepClone(),
                ["dirty"] = false,
                ["compilerCommit"] = compiler
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
            ["compilerCommit"] = compiler
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
        ] = "Install Goo.DevTools 0.24.1 and launch with goo dev --project App.gsproj. Add --no-watch when hot reload is not needed and --input to enable agent interaction. Use goo_targets to discover live windows, then pass an explicit PID and window ID. GOO_CLI may specify a goo executable or built Goo.DevTools.Cli.dll. Use a CLI build with the list command and dev --input option."
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
        let line = I(a, "line")
        let count = I(a, "count")
        Require(line >= 1 && count >= 1 && count <= 240, "line must be positive and count must be 1-240")
        let root = Source(S(a, "repository"))
        let data = File.ReadAllBytes(Document(root, S(a, "path")))
        let lines = Lines(Encoding.UTF8.GetString(data))
        return JsonObject(){
            ["source"] = root,
            ["path"] = S(a, "path"),
            ["sha256"] = Hash(data),
            ["totalLines"] = lines.Length,
            ["line"] = line,
            ["text"] = string.Join("\n", lines.Skip(int32(line) - 1).Take(int32(count)))
        }
    }

    func Starter(a JsonObject) JsonObject {
        let name = S(a, "name")
        Require(
            Regex.IsMatch(name, "^[A-Za-z][A-Za-z0-9_]{0,63}$"),
            "Use a simple identifier starting with an ASCII letter, up to 64 characters"
        )
        let root = Source(S(a, "repository"))
        let files = JsonObject()
        let sourceFiles = JsonObject()
        for filename in[]string{"Program.gs", "GooStarter.gsproj"} {
            let relative = "templates/Goo.Templates/content/" + filename
            let template = Document(root, relative)
            var content = File.ReadAllText(template)
            sourceFiles[relative] = Hash(File.ReadAllBytes(template))
            if filename.EndsWith(".gsproj") {
                content = content.Replace(
                    "</Project>",
                    "  <ItemGroup>\n    <Watch Include=\"**/*.gs\" Exclude=\"bin/**;obj/**\" />\n  </ItemGroup>\n</Project>"
                )
            }
            files[filename.Replace("GooStarter", name)] = content.Replace("GooStarter", name)
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
        var build = "dotnet build " + name + ".gsproj -c Release --nologo -warnaserror"
        let compiler = Path.Combine(root, "artifacts/gsharp/compiler/gsc.dll")
        if trusted && File.Exists(compiler) {
            build += " -p:GsharpCompilerFullPath=" + Quote(compiler)
        }
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
                ["compilerCommit"] = provenance["compilerCommit"]?.DeepClone()
            },
            ["files"] = files,
            ["lint"] = lint,
            ["build"] = build,
            ["run"] = "goo dev --no-watch --project " + name + ".gsproj"
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
