package Goo.PluginMcp

import ModelContextProtocol.Client
import ModelContextProtocol.Protocol
import System
import System.Collections.Generic
import System.Diagnostics
import System.IO
import System.Linq
import System.Reflection
import System.Text.Json
import System.Text.Json.Nodes
import System.Threading.Tasks

shared
class Verify {
    func Check(ok bool, detail string) {
        if !ok {
            throw InvalidOperationException(detail)
        }
    }

    func Data(result CallToolResult) JsonObject -> JsonNode.Parse(
        if result.StructuredContent != nil {
            result.StructuredContent.Value.GetRawText()
        } else {
            TextContentBlock(result.Content[0]).Text
        }
    )!!.AsObject()

    async func Call(client McpClient, name string, args JsonObject? = nil, rejected bool = false) CallToolResult {
        let parameters = CallToolRequestParams(){
            Name = name,
            Arguments = JsonSerializer.Deserialize[Dictionary[string, JsonElement]](
                (args ?? JsonObject()).ToJsonString()
            )
        }
        let result = await client.CallToolAsync(parameters)
        Check((result.IsError == true) == rejected, name + ": " + JsonSerializer.Serialize(result))
        return result
    }

    async func Client(root string, runtime string, source string? = nil) McpClient {
        let environment = Dictionary[string, string?](){["GOO_DEVTOOLS_DIR"] = runtime}
        if source != nil {
            environment["GOO_SOURCE_ROOT"] = source
        }
        return await McpClient.CreateAsync(
            StdioClientTransport(
                StdioClientTransportOptions(){
                    Command = "dotnet",
                    Arguments = List[string](){Assembly.GetEntryAssembly()!!.Location, "mcp", "--plugin-root", root},
                    EnvironmentVariables = environment
                }
            )
        )
    }

    async func Run(root string) {
        if OperatingSystem.IsLinux() && Environment.GetEnvironmentVariable("GOO_HEADLESS_WAYLAND") != "1" {
            throw InvalidOperationException(
                "Run verification under .github/scripts/with-headless-wayland.sh with a private XDG_CACHE_HOME."
            )
        }
        let output = Directory.CreateTempSubdirectory("goo-agent-e2e-").FullName
        Console.WriteLine("Evidence: " + output)
        let app = Path.Combine(output, "app")
        let runtime = Path.Combine(app, ".goo/devtools")
        Directory.CreateDirectory(runtime)
        let client = await Client(root, Path.Combine(output, "unused-runtime"))
        try {
            let tools = await client.ListToolsAsync(ListToolsRequestParams())
            let expected = GooServer(root).Tools
            Check(
                JsonNode.DeepEquals(
                    JsonSerializer.SerializeToNode(tools.Tools),
                    JsonSerializer.SerializeToNode(expected)
                ),
                "Tool names, schemas, descriptions or annotations differ"
            )
            File.WriteAllText(Path.Combine(output, "tools.json"), JsonSerializer.Serialize(tools.Tools))
            let context = await Call(client, "goo_context")
            File.WriteAllText(Path.Combine(output, "context.json"), JsonSerializer.Serialize(context))
            let bundled = Data(context)
            Check(GooServer.S(bundled["provenance"]!!, "kind") == "bundle", "Expected bundled provenance")
            Check(GooServer.B(bundled["preflight"]!!["configuration"]!!, "configured"), bundled.ToJsonString())
            let hashes = JsonObject()
            for document in bundled["documents"]!!.AsArray() {
                let path = document.GetValue[string]()
                hashes[path] = GooServer.Hash(File.ReadAllBytes(Path.Combine(root, "reference", path)))
            }
            Check(JsonNode.DeepEquals(hashes, bundled["provenance"]!!["files"]), "Bundle content hashes differ")
            Check(GooServer.S(bundled["provenance"]!!, "compilerCommit").Length == 40, "Compiler provenance missing")
            let search = Data(await Call(client, "goo_search", JsonObject(){["query"] = "how do I rebuild a cell"}))
            Check(
                GooServer.S(search, "mode") == "exact" && JsonNode.DeepEquals(
                    search["queryTerms"],
                    GooServer.Strings([]string{"rebuild", "cell"})
                ),
                search.ToJsonString()
            )
            Check(
                GooServer.S(search["results"]!![0]!!, "path") == "docs/api/cell.md" && GooServer.S(
                    search["results"]!![0]!!,
                    "sha256"
                )
                    .Length == 64,
                search.ToJsonString()
            )
            let missing = Data(await Call(client, "goo_search", JsonObject(){["query"] = "QuantumBananaTeleportation"}))
            Check(
                GooServer.S(missing, "mode") == "none" && GooServer.I(missing, "total") == 0 &&
                    missing["results"]!!
                    .AsArray().Count == 0,
                missing.ToJsonString()
            )
            await Call(client, "goo_read", JsonObject(){["path"] = "docs/api/cell.md", ["count"] = 25})
            await Call(client, "goo_read", JsonObject(){["path"] = "../../.ssh/id_rsa"}, true)
            let checkout = await Checkout(client, output)
            await Starter(client, root, output, app, checkout)
            Console.WriteLine("MCP tool contracts, checkout discovery, path rejection and starter build passed")
            await Live(client, output, app, runtime, false)
            await Live(client, output, app, runtime, true)
            let result = JsonObject(){
                ["passed"] = true,
                ["tools"] = GooServer.Strings(tools.Tools.Select(x -> x.Name).Order()),
                ["fullSnapshots"] = true,
                ["stableNodeIds"] = true,
                ["projectLocalDiscovery"] = true,
                ["inputPermission"] = true,
                ["clickPointerKeyboard"] = true,
                ["capture"] = true
            }
            File.WriteAllText(Path.Combine(output, "result.json"), result.ToJsonString())
            Console.WriteLine(result.ToJsonString())
        } finally {
            await client.DisposeAsync()
        }
    }

    async func Checkout(client McpClient, output string) string {
        let checkout = Path.Combine(output, "checkout")
        Directory.CreateDirectory(Path.Combine(checkout, "Goo"))
        File.WriteAllText(Path.Combine(checkout, "Goo/Goo.gsproj"), "")
        Directory.CreateDirectory(Path.Combine(checkout, "docs/api"))
        let fresh = Path.Combine(checkout, "docs/api/new-api.md")
        File.WriteAllText(fresh, "# Newly added API\n\n## Probe\n\nAgentFreshDocument\n")
        let current = Data(await Call(client, "goo_context", JsonObject(){["repository"] = checkout}))
        Check(
            JsonNode.DeepEquals(current["documents"], GooServer.Strings([]string{"docs/api/new-api.md"})),
            current.ToJsonString()
        )
        Check(GooServer.S(current["provenance"]!!, "kind") == "checkout", current.ToJsonString())
        Check(
            GooServer.I(
                Data(
                    await Call(
                        client,
                        "goo_search",
                        JsonObject(){["query"] = "how do I find AgentFreshDocument", ["repository"] = checkout}
                    )
                ),
                "total"
            ) == 1,
            "Fresh checkout search failed"
        )
        Check(
            GooServer.S(
                Data(
                    await Call(
                        client,
                        "goo_read",
                        JsonObject(){["path"] = "docs/api/new-api.md", ["repository"] = checkout}
                    )
                ),
                "text"
            )
                .Contains("AgentFreshDocument"),
            "Fresh checkout read failed"
        )
        File.Delete(fresh)
        Check(
            GooServer.I(
                Data(
                    await Call(
                        client,
                        "goo_search",
                        JsonObject(){["query"] = "AgentFreshDocument", ["repository"] = checkout}
                    )
                ),
                "total"
            ) == 0,
            "Deleted document remained discoverable"
        )
        File.WriteAllText(fresh, "# Straße\n\nﬃ Σς\n\n")
        let unicode = Data(
            await Call(client, "goo_search", JsonObject(){["query"] = "STRASSE", ["repository"] = checkout})
        )
        Check(GooServer.I(unicode, "total") == 1, unicode.ToJsonString())
        let lines = Data(
            await Call(client, "goo_read", JsonObject(){["path"] = "docs/api/new-api.md", ["repository"] = checkout})
        )
        Check(GooServer.I(lines, "totalLines") == 4, lines.ToJsonString())
        File.Delete(fresh)
        let outside = Path.Combine(output, "outside.md")
        File.WriteAllText(outside, "Outside selected root")
        File.CreateSymbolicLink(fresh, outside)
        await Call(client, "goo_read", JsonObject(){["path"] = "docs/api/new-api.md", ["repository"] = checkout}, true)
        File.Delete(fresh)
        return checkout
    }

    async func Starter(client McpClient, root string, output string, app string, checkout string) {
        let starter = Data(await Call(client, "goo_starter", JsonObject(){["name"] = "AgentProbe"}))
        Check(GooServer.S(starter, "run").Contains("--no-watch"), starter.ToJsonString())
        Check(
            GooServer.S(starter, "build") == "dotnet build AgentProbe.gsproj -c Release --nologo -warnaserror",
            starter.ToJsonString()
        )
        Check(GooServer.S(starter, "lint") == "unavailable", starter.ToJsonString())
        Check(
            starter["provenance"]!!["sourceFiles"]!!
                .AsObject()
                .Select(x -> x.Key)
                .Order()
                .SequenceEqual(
                []string{
                    "templates/Goo.Templates/content/GooStarter.gsproj",
                    "templates/Goo.Templates/content/Program.gs"
                }
            ),
            starter.ToJsonString()
        )
        Check(
            starter["provenance"]!!["generatedFiles"]!!
                .AsObject()
                .Select(x -> x.Key)
                .Order()
                .SequenceEqual([]string{"AgentProbe.gsproj", "Program.gs"}),
            starter.ToJsonString()
        )
        for source in starter["provenance"]!!["sourceFiles"]!!.AsObject() {
            let path = Path.Combine(checkout, source.Key)
            Directory.CreateDirectory(Path.GetDirectoryName(path)!!)
            File.Copy(Path.Combine(root, "reference", source.Key), path)
        }
        let linter = Path.Combine(checkout, "tools/Goo.Gslint/Goo.Gslint.gsproj")
        let compiler = Path.Combine(checkout, "artifacts/gsharp/compiler/gsc.dll")
        for path in[]string{linter, compiler} {
            Directory.CreateDirectory(Path.GetDirectoryName(path)!!)
            File.WriteAllText(path, "")
        }
        let untrusted = Data(
            await Call(client, "goo_starter", JsonObject(){["name"] = "AgentProbe", ["repository"] = checkout})
        )
        Check(
            GooServer.S(untrusted, "lint") == "unavailable" && GooServer.S(untrusted, "build") == GooServer.S(
                starter,
                "build"
            ),
            untrusted.ToJsonString()
        )
        let configured = await Client(root, Path.Combine(output, "unused-runtime"), checkout)
        try {
            for explicitSource in[]bool{false, true} {
                let args = JsonObject(){["name"] = "AgentProbe"}
                if explicitSource {
                    args["repository"] = checkout
                }
                let trusted = Data(await Call(configured, "goo_starter", args))
                Check(
                    GooServer.S(trusted, "lint").StartsWith("dotnet run --project " + linter + " "),
                    trusted.ToJsonString()
                )
                Check(
                    GooServer.S(trusted, "build") == GooServer.S(starter, "build") +
                        " -p:GsharpCompilerFullPath=" +
                        compiler,
                    trusted.ToJsonString()
                )
            }
        } finally {
            await configured.DisposeAsync()
        }
        for file in starter["files"]!!.AsObject() {
            File.WriteAllText(Path.Combine(app, file.Key), file.Value.GetValue[string]())
        }
        let build = GooServer.Execute(
            []string{
                "nice",
                "-n",
                "10",
                "dotnet",
                "build",
                Path.Combine(app, "AgentProbe.gsproj"),
                "-c",
                "Release",
                "--nologo",
                "-warnaserror",
                "-m:4"
            },
            180
        )
        File.WriteAllText(Path.Combine(output, "build.log"), build.Output + build.Error)
        Check(build.Code == 0, build.Output + build.Error)
    }

    async func Live(client McpClient, output string, app string, runtime string, enabled bool) {
        let label = if enabled {
            "input-enabled"
        } else {
            "inspection-only"
        }
        let start = ProcessStartInfo("dotnet"){
            RedirectStandardOutput = true,
            RedirectStandardError = true,
            UseShellExecute = false
        }
        start.ArgumentList.Add(Path.Combine(app, "bin/Release/net10.0/AgentProbe.dll"))
        start.Environment["GOO_DEVTOOLS"] = "1"
        start.Environment["GOO_DEVTOOLS_INPUT"] = if enabled {
            "1"
        } else {
            "0"
        }
        start.Environment["GOO_DEVTOOLS_DIR"] = runtime
        using let process = Process.Start(start)!!
        let stdout = process.StandardOutput.ReadToEndAsync()
        let stderr = process.StandardError.ReadToEndAsync()
        let pid = process.Id
        try {
            let clock = Stopwatch.StartNew()
            var targets = JsonArray()
            while clock.Elapsed.TotalSeconds < 30 {
                Check(!process.HasExited, "Starter exited before discovery")
                targets = Data(await Call(client, "goo_targets", JsonObject(){["pid"] = pid, ["project"] = app}))[
                    "targets"
                ]!!.AsArray()
                if targets.Count != 0 {
                    break
                }
                await Task.Delay(250)
            }
            Check(targets.Count == 1 && GooServer.S(targets[0]!!, "window") != "", targets.ToJsonString())
            let target = JsonObject(){
                ["pid"] = pid,
                ["window"] = GooServer.S(targets[0]!!, "window"),
                ["project"] = app
            }
            let before = await Snapshot(client, target)
            let again = await Snapshot(client, target)
            Check(
                before["added"]!!.AsArray()
                    .Count > 0 &&
                    before["added"]!!
                    .AsArray()
                    .Select(x -> GooServer.I(x, "id"))
                    .Order()
                    .SequenceEqual(again["added"]!!.AsArray().Select(x -> GooServer.I(x, "id")).Order()),
                "Node IDs changed"
            )
            Check(before["added"]!!.AsArray().Any(x -> GooServer.S(x, "content") == "Count: 0"), before.ToJsonString())
            let button = GooServer.I(before["added"]!!.AsArray().First(x -> GooServer.S(x, "kind") == "Button"), "id")
            await Observe(client, target, button, output, label)
            File.WriteAllText(Path.Combine(output, label + "-before.json"), before.ToJsonString())
            if !enabled {
                let error = await Call(
                    client,
                    "goo_input",
                    Merge(target, JsonObject(){["event"] = "click", ["node_id"] = button}),
                    true
                )
                Check(
                    JsonSerializer.Serialize(error).Contains("does not permit input"),
                    JsonSerializer.Serialize(error)
                )
                Check(
                    (await Snapshot(client, target))["added"]!!.AsArray().Any(
                        x -> GooServer.S(x, "content") == "Count: 0"
                    ),
                    "Input changed inspection-only app"
                )
            } else {
                await EnabledInput(client, target, button, output)
            }
        } finally {
            if !process.HasExited {
                process.Kill(entireProcessTree: true)
            }
            await process.WaitForExitAsync()
            File.WriteAllText(Path.Combine(output, label + ".log"), await stdout + await stderr)
        }
        Check(
            Data(await Call(client, "goo_targets", JsonObject(){["pid"] = pid, ["project"] = app}))["targets"]!!
                .AsArray().Count == 0,
            "Dead process is still discoverable"
        )
        Console.WriteLine(label + " passed")
    }

    async func EnabledInput(client McpClient, target JsonObject, button int64, output string) {
        await Diagnostics(client, target, button)
        await Call(
            client,
            "goo_input",
            Merge(target, JsonObject(){["pid"] = 0, ["event"] = "click", ["node_id"] = button}),
            true
        )
        let stale = await Call(
            client,
            "goo_input",
            Merge(target, JsonObject(){["event"] = "click", ["node_id"] = long.MaxValue}),
            true
        )
        Check(JsonSerializer.Serialize(stale).Contains("stale-target"), JsonSerializer.Serialize(stale))
        await Call(client, "goo_input", Merge(target, JsonObject(){["event"] = "not-an-event"}), true)
        let beforePng = await Capture(client, target)
        File.WriteAllBytes(Path.Combine(output, "before.png"), beforePng)
        for event_ in[]string{"click", "pointer.down", "pointer.up", "key.down", "key.up"} {
            let args = JsonObject(){["event"] = event_}
            if event_.StartsWith("key.") {
                args["key"] = "Space"
            } else {
                args["node_id"] = button
            }
            let applied = Data(await Call(client, "goo_input", Merge(target, args)))
            Check(GooServer.B(applied, "ok") && GooServer.B(applied["payload"]!!, "applied"), applied.ToJsonString())
        }
        var after = await Snapshot(client, target)
        Check(after["added"]!!.AsArray().Any(x -> GooServer.S(x, "content") == "Count: 2"), after.ToJsonString())
        Check(
            after["added"]!!.AsArray().Any(x -> GooServer.I(x, "id") == button && GooServer.S(x, "kind") == "Button"),
            "Button ID changed"
        )
        await Call(client, "goo_input", Merge(target, JsonObject(){["event"] = "pointer.cancel"}))
        await Call(client, "goo_input", Merge(target, JsonObject(){["event"] = "reset"}))
        after = await Snapshot(client, target)
        Check(
            !after["added"]!!.AsArray().Any(x -> GooServer.B(x, "focused") || GooServer.B(x, "pressed")),
            "Input reset failed"
        )
        File.WriteAllText(Path.Combine(output, "after.json"), after.ToJsonString())
        let afterPng = await Capture(client, target)
        Check(!afterPng.SequenceEqual(beforePng), "Capture did not change after input")
        File.WriteAllBytes(Path.Combine(output, "after.png"), afterPng)
    }

    async func Snapshot(client McpClient, target JsonObject) JsonObject {
        let result = Data(await Call(client, "goo_snapshot", target))
        Check(GooServer.B(result, "ok") && GooServer.B(result["payload"]!!, "full"), result.ToJsonString())
        return result["payload"]!!.AsObject()
    }

    async func Observe(client McpClient, target JsonObject, button int64, output string, label string) {
        let capabilities = Data(await Call(client, "goo_capabilities", target))
        Check(capabilities["runtime"]!!["capabilities"] is JsonArray, capabilities.ToJsonString())
        let query = Merge(
            target,
            JsonObject(){["compact"] = true, ["role"] = "button", ["match"] = "exact", ["limit"] = 1}
        )
        let compact = Data(await Call(client, "goo_snapshot", query))
        Check(
            GooServer.I(compact, "matchedCount") == 1 && GooServer.S(compact, "outcome") == "matched",
            compact.ToJsonString()
        )
        Check(GooServer.I(compact["nodes"]!![0]!!, "id") == button, compact.ToJsonString())
        let handle = GooServer.S(compact["nodes"]!![0]!!, "target")
        Check(handle != "", compact.ToJsonString())
        File.WriteAllText(Path.Combine(output, label + "-compact.json"), compact.ToJsonString())
        let exists = Data(
            await Call(client, "goo_snapshot", Merge(query, JsonObject(){["wait"] = "exists", ["timeout_ms"] = 1000}))
        )
        Check(GooServer.S(exists, "outcome") == "matched", exists.ToJsonString())
        let missing = Data(
            await Call(
                client,
                "goo_snapshot",
                Merge(
                    target,
                    JsonObject(){
                        ["compact"] = true,
                        ["text"] = "QuantumBananaTeleportation",
                        ["wait"] = "missing",
                        ["timeout_ms"] = 1000
                    }
                )
            )
        )
        Check(
            GooServer.S(missing, "outcome") == "matched" && GooServer.I(missing, "matchedCount") == 0,
            missing.ToJsonString()
        )
        let timeout = Data(
            await Call(
                client,
                "goo_snapshot",
                Merge(
                    query,
                    JsonObject(){["wait"] = "exists", ["timeout_ms"] = 250, ["after_sequence"] = long.MaxValue}
                )
            )
        )
        Check(GooServer.S(timeout, "outcome") == "timeout", timeout.ToJsonString())
        let subtree = Data(
            await Call(
                client,
                "goo_snapshot",
                Merge(target, JsonObject(){["compact"] = true, ["subtree"] = handle, ["fields"] = "target,id,parentId"})
            )
        )
        Check(subtree["nodes"]!!.AsArray().Any(x -> GooServer.I(x, "id") == button), subtree.ToJsonString())
        await Call(client, "goo_snapshot", Merge(query, JsonObject(){["fields"] = "unknown"}), true)
        await Call(client, "goo_snapshot", Merge(query, JsonObject(){["subtree"] = "not-a-target"}), true)
        await Call(client, "goo_snapshot", Merge(query, JsonObject(){["timeout_ms"] = 1}), true)
        await Call(client, "goo_snapshot", Merge(query, JsonObject(){["after_sequence"] = 1}), true)
        await Call(client, "goo_snapshot", Merge(query, JsonObject(){["limit"] = 201}), true)
    }

    async func Diagnostics(client McpClient, target JsonObject, button int64) {
        await Call(client, "goo_inspect", Merge(target, JsonObject(){["action"] = "enter"}))
        await Call(client, "goo_inspect", Merge(target, JsonObject(){["action"] = "select", ["node_id"] = button}))
        await Call(client, "goo_inspect", Merge(target, JsonObject(){["action"] = "clear"}))
        await Call(client, "goo_inspect", Merge(target, JsonObject(){["action"] = "exit"}))
        await Call(client, "goo_inspect", Merge(target, JsonObject(){["action"] = "enter", ["node_id"] = button}), true)
        await Call(
            client,
            "goo_inspect",
            Merge(target, JsonObject(){["action"] = "select", ["node_id"] = button, ["x"] = 0}),
            true
        )
        await Call(
            client,
            "goo_style_override",
            Merge(target, JsonObject(){["node_id"] = button, ["property"] = "Width", ["value"] = "180px"})
        )
        await Call(client, "goo_style_reset", Merge(target, JsonObject(){["node_id"] = button, ["property"] = "Width"}))
        await Call(client, "goo_style_reset", Merge(target, JsonObject(){["node_id"] = button}))
        await Call(
            client,
            "goo_style_override",
            Merge(target, JsonObject(){["node_id"] = button, ["property"] = "unknown", ["value"] = "1"}),
            true
        )
        await Call(
            client,
            "goo_style_override",
            Merge(target, JsonObject(){["property"] = "Width", ["value"] = "1px"}),
            true
        )
    }

    async func Capture(client McpClient, target JsonObject)[]byte {
        let result = await Call(client, "goo_capture", target)
        let image = result.Content.OfType[ImageContentBlock]().Single()
        let pixels = image.DecodedData.ToArray()
        Check(
            image.MimeType == "image/png" && pixels.Take(8).SequenceEqual([]byte{137, 80, 78, 71, 13, 10, 26, 10}),
            "Capture is not PNG"
        )
        return pixels
    }

    func Merge(target JsonObject, additions JsonObject) JsonObject {
        let result = target.DeepClone().AsObject()
        for item in additions {
            result[item.Key] = item.Value?.DeepClone()
        }
        return result
    }
}
