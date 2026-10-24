package Goo.PluginMcp

import Goo.PluginMcp.GooServer
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

shared class Verify {
    func Check(ok bool, detail object) {
        if !ok {
            throw InvalidOperationException(detail.ToString() ?? "")
        }
    }

    func Data(result CallToolResult) JsonObject -> JsonNode.Parse(
        result.StructuredContent?.GetRawText() ?? TextContentBlock(result.Content[0]).Text
    )!!.AsObject()

    async func Call(client McpClient, name string, target JsonObject? = nil, rejected bool = false) CallToolResult {
        let request = Fixture(name)
        let args = request["arguments"]!!.AsObject()
        if target != nil {
            for item in target {
                if !args.ContainsKey(item.Key) {
                    args[item.Key] = item.Value?.DeepClone()
                }
            }
        }
        let result = await client.CallToolAsync(JsonSerializer.Deserialize[CallToolRequestParams](request))
        Check((result.IsError == true) == rejected, name + ": " + JsonSerializer.Serialize(result))
        return result
    }

    async func Read(client McpClient, name string, target JsonObject? = nil) JsonObject -> Data(
        await Call(client, name, target)
    )

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
                "Run under .github/scripts/with-headless-wayland.sh with a private XDG_CACHE_HOME."
            )
        }
        let output = Directory.CreateTempSubdirectory("goo-agent-e2e-").FullName
        try {
            Console.WriteLine("Evidence: " + output)
            let app = Path.Combine(output, "app")
            let runtime = Path.Combine(app, ".goo/devtools")
            Directory.CreateDirectory(runtime)
            let client = await Client(root, Path.Combine(output, "unused-runtime"))
            try {
                let tools = await client.ListToolsAsync(ListToolsRequestParams())
                Check(
                    JsonNode.DeepEquals(
                        JsonSerializer.SerializeToNode(tools.Tools),
                        JsonSerializer.SerializeToNode(ToolDefinitions)
                    ),
                    "Tool contracts differ"
                )
                File.WriteAllText(Path.Combine(output, "tools.json"), JsonSerializer.Serialize(tools.Tools))
                await Documents(client, root, output)
                let checkout = await Checkout(client, output)
                await Starter(client, root, output, app, checkout)
                await Live(client, output, app, runtime, false)
                await Live(client, output, app, runtime, true)
                let result = JsonObject(){
                    ["passed"] = true,
                    ["tools"] = Strings(tools.Tools.Select(x -> x.Name).Order()),
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
        } finally {
            Directory.Delete(output, true)
        }
    }

    async func Documents(client McpClient, root string, output string) {
        let context = await Call(client, "context")
        File.WriteAllText(Path.Combine(output, "context.json"), JsonSerializer.Serialize(context))
        let bundled = Data(context)
        let provenance = bundled["provenance"]!!
        Check(S(provenance, "kind") == "bundle", bundled)
        Check(B(bundled["preflight"]!!["configuration"]!!, "configured"), bundled)
        let hashes = JsonObject()
        for document in bundled["documents"]!!.AsArray() {
            let path = document.GetValue[string]()
            hashes[path] = Hash(File.ReadAllBytes(Path.Combine(root, "reference", path)))
        }
        Check(JsonNode.DeepEquals(hashes, provenance["files"]), "Bundle hashes differ")
        Check(
            JsonNode.DeepEquals(bundled["documents"], Strings(hashes.Select(x -> x.Key).Order(StringComparer.Ordinal))),
            bundled
        )
        Check(S(provenance, "compilerCommit").Length == 40, provenance)
        let search = await Read(client, "cellSearch")
        Check(
            S(search, "mode") == "exact" && JsonNode.DeepEquals(
                search["queryTerms"],
                Strings([]string{"rebuild", "cell"})
            ),
            search
        )
        let first = search["results"]!![0]!!
        Check(S(first, "path") == "docs/api/cell.md" && S(first, "sha256").Length == 64, search)
        let missing = await Read(client, "missingSearch")
        Check(
            S(missing, "mode") == "none" && I(missing, "total") == 0 && missing["results"]!!.AsArray().Count == 0,
            missing
        )
        await Call(client, "cellRead")
        await Call(client, "outsideRead", rejected: true)
    }

    async func Checkout(client McpClient, output string) string {
        let checkout = Path.Combine(output, "checkout")
        let repository = JsonObject(){["repository"] = checkout}
        Directory.CreateDirectory(Path.Combine(checkout, "Goo"))
        File.WriteAllText(Path.Combine(checkout, "Goo/Goo.gsproj"), "")
        Directory.CreateDirectory(Path.Combine(checkout, "docs/api"))
        let fresh = Path.Combine(checkout, "docs/api/new-api.md")
        File.WriteAllText(fresh, "# Newly added API\n\n## Probe\n\nAgentFreshDocument\n")
        let current = await Read(client, "context", repository)
        Check(JsonNode.DeepEquals(current["documents"], Strings([]string{"docs/api/new-api.md"})), current)
        Check(S(current["provenance"]!!, "kind") == "checkout", current)
        let found = await Read(client, "freshSearch", repository)
        Check(I(found, "total") == 1, found)
        Check(
            S(await Read(client, "freshRead", repository), "text").Contains("AgentFreshDocument"),
            "Fresh read failed"
        )
        File.Delete(fresh)
        let deleted = await Read(client, "deletedSearch", repository)
        Check(I(deleted, "total") == 0, deleted)
        File.WriteAllText(fresh, "# Straße\n\nﬃ Σς\n\n")
        let unicode = await Read(client, "unicodeSearch", repository)
        Check(I(unicode, "total") == 1, unicode)
        let lines = await Read(client, "freshRead", repository)
        Check(I(lines, "totalLines") == 4, lines)
        File.Delete(fresh)
        if !OperatingSystem.IsWindows() {
            let outside = Path.Combine(output, "outside.md")
            File.WriteAllText(outside, "Outside selected root")
            File.CreateSymbolicLink(fresh, outside)
            await Call(client, "freshRead", repository, true)
            File.Delete(fresh)
        }
        return checkout
    }

    async func Starter(client McpClient, root string, output string, app string, checkout string) {
        let starter = await Read(client, "starter")
        Check(S(starter, "run").Contains("--no-watch"), starter)
        Check(S(starter, "build") == "dotnet build AgentProbe.gsproj -c Release --nologo -warnaserror", starter)
        Check(S(starter, "lint") == "unavailable", starter)
        let provenance = starter["provenance"]!!
        Check(
            provenance["sourceFiles"]!!
                .AsObject()
                .Select(x -> x.Key)
                .Order()
                .SequenceEqual(
                []string{
                    "templates/Goo.Templates/content/GooStarter.gsproj",
                    "templates/Goo.Templates/content/Program.gs"
                }
            ),
            starter
        )
        Check(
            provenance["generatedFiles"]!!
                .AsObject()
                .Select(x -> x.Key)
                .Order()
                .SequenceEqual([]string{"AgentProbe.gsproj", "Program.gs"}),
            starter
        )
        for source in provenance["sourceFiles"]!!.AsObject() {
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
        let untrusted = await Read(client, "starter", JsonObject(){["repository"] = checkout})
        Check(S(untrusted, "lint") == "unavailable" && S(untrusted, "build") == S(starter, "build"), untrusted)
        let configured = await Client(root, Path.Combine(output, "unused-runtime"), checkout)
        try {
            for explicitSource in[]bool{false, true} {
                let args = JsonObject()
                if explicitSource {
                    args["repository"] = checkout
                }
                let trusted = await Read(configured, "starter", args)
                Check(S(trusted, "lint").StartsWith("dotnet run --project " + linter + " "), trusted)
                Check(S(trusted, "build") == S(starter, "build") + " -p:GsharpCompilerFullPath=" + compiler, trusted)
            }
        } finally {
            await configured.DisposeAsync()
        }
        for file in starter["files"]!!.AsObject() {
            File.WriteAllText(Path.Combine(app, file.Key), file.Value.GetValue[string]())
        }
        let build = Execute(
            []string{
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
        let target = JsonObject(){["pid"] = process.Id, ["project"] = app}
        try {
            let clock = Stopwatch.StartNew()
            var targets = JsonArray()
            while clock.Elapsed.TotalSeconds < 30 {
                Check(!process.HasExited, "Starter exited before discovery")
                let discovered = await Read(client, "targets", target)
                targets = discovered["targets"]!!.AsArray()
                if targets.Count != 0 {
                    break
                }
                await Task.Delay(250)
            }
            Check(targets.Count == 1 && S(targets[0]!!, "window") != "", targets)
            target["window"] = S(targets[0]!!, "window")
            let before = await Snapshot(client, target)
            let again = await Snapshot(client, target)
            let nodes = before["added"]!!.AsArray()
            Check(
                nodes.Count > 0 &&
                    nodes
                    .Select(x -> I(x, "id"))
                    .Order()
                    .SequenceEqual(again["added"]!!.AsArray().Select(x -> I(x, "id")).Order()),
                "Node IDs changed"
            )
            Check(nodes.Any(x -> S(x, "content") == "Count: 0"), before)
            let button = I(nodes.First(x -> S(x, "kind") == "Button"), "id")
            await Observe(client, target, button, output, label)
            File.WriteAllText(Path.Combine(output, label + "-before.json"), before.ToJsonString())
            let selected = Merge(target, JsonObject(){["node_id"] = button})
            if enabled {
                await EnabledInput(client, target, selected, output)
            } else {
                let error = await Call(client, "click", selected, true)
                Check(
                    JsonSerializer.Serialize(error).Contains("does not permit input"),
                    JsonSerializer.Serialize(error)
                )
                let unchanged = await Snapshot(client, target)
                Check(unchanged["added"]!!.AsArray().Any(x -> S(x, "content") == "Count: 0"), unchanged)
            }
        } finally {
            if !process.HasExited {
                process.Kill(entireProcessTree: true)
            }
            await process.WaitForExitAsync()
            File.WriteAllText(Path.Combine(output, label + ".log"), await stdout + await stderr)
        }
        let dead = await Read(client, "targets", target)
        Check(dead["targets"]!!.AsArray().Count == 0, dead)
        Console.WriteLine(label + " passed")
    }

    async func EnabledInput(client McpClient, target JsonObject, selected JsonObject, output string) {
        await Diagnostics(client, target, selected)
        await Call(client, "invalidPid", selected, true)
        let stale = await Call(client, "staleInput", target, true)
        Check(JsonSerializer.Serialize(stale).Contains("stale-target"), JsonSerializer.Serialize(stale))
        await Call(client, "unknownInput", target, true)
        let beforePng = await Capture(client, target)
        File.WriteAllBytes(Path.Combine(output, "before.png"), beforePng)
        for event_ in[]string{"click", "pointer.down", "pointer.up", "key.down", "key.up"} {
            let applied = await Read(
                client,
                event_,
                if event_.StartsWith("key.") {
                    target
                } else {
                    selected
                }
            )
            Check(B(applied, "ok") && B(applied["payload"]!!, "applied"), applied)
        }
        var after = await Snapshot(client, target)
        Check(after["added"]!!.AsArray().Any(x -> S(x, "content") == "Count: 2"), after)
        Check(
            after["added"]!!.AsArray().Any(x -> I(x, "id") == I(selected, "node_id") && S(x, "kind") == "Button"),
            "Button ID changed"
        )
        await Call(client, "pointer.cancel", target)
        await Call(client, "reset", target)
        after = await Snapshot(client, target)
        Check(!after["added"]!!.AsArray().Any(x -> B(x, "focused") || B(x, "pressed")), "Input reset failed")
        File.WriteAllText(Path.Combine(output, "after.json"), after.ToJsonString())
        let afterPng = await Capture(client, target)
        Check(!afterPng.SequenceEqual(beforePng), "Capture did not change after input")
        File.WriteAllBytes(Path.Combine(output, "after.png"), afterPng)
    }

    async func Snapshot(client McpClient, target JsonObject) JsonObject {
        let result = await Read(client, "snapshot", target)
        Check(B(result, "ok") && B(result["payload"]!!, "full"), result)
        return result["payload"]!!.AsObject()
    }

    async func Observe(client McpClient, target JsonObject, button int64, output string, label string) {
        let capabilities = await Read(client, "capabilities", target)
        Check(capabilities["runtime"]!!["capabilities"] is JsonArray, capabilities)
        let compact = await Read(client, "compact", target)
        Check(I(compact, "matchedCount") == 1 && S(compact, "outcome") == "matched", compact)
        Check(I(compact["nodes"]!![0]!!, "id") == button, compact)
        let handle = S(compact["nodes"]!![0]!!, "target")
        Check(handle != "", compact)
        File.WriteAllText(Path.Combine(output, label + "-compact.json"), compact.ToJsonString())
        for wait in[]string{"exists", "missing", "timeout"} {
            let observed = await Read(client, wait, target)
            Check(
                S(observed, "outcome") == if wait == "timeout" {
                    "timeout"
                } else {
                    "matched"
                },
                observed
            )
            if wait == "missing" {
                Check(I(observed, "matchedCount") == 0, observed)
            }
        }
        let subtree = await Read(client, "subtree", Merge(target, JsonObject(){["subtree"] = handle}))
        Check(subtree["nodes"]!!.AsArray().Any(x -> I(x, "id") == button), subtree)
        for name in[]string{
            "invalidFields",
            "unknownSubtree",
            "timeoutWithoutWait",
            "sequenceWithoutWait",
            "oversizedPage"
        } {
            await Call(client, name, target, true)
        }
    }

    async func Diagnostics(client McpClient, target JsonObject, selected JsonObject) {
        await Call(client, "inspectEnter", target)
        await Call(client, "inspectSelect", selected)
        for name in[]string{"inspectClear", "inspectExit"} {
            await Call(client, name, target)
        }
        await Call(client, "inspectEnter", selected, true)
        await Call(client, "inspectMixed", selected, true)
        for name in[]string{"overrideWidth", "resetWidth", "resetAll"} {
            await Call(client, name, selected)
        }
        await Call(client, "invalidProperty", selected, true)
        await Call(client, "overrideWithoutSelector", target, true)
    }

    async func Capture(client McpClient, target JsonObject)[]byte {
        let result = await Call(client, "capture", target)
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
