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
        let manifest = JsonNode.Parse(File.ReadAllText(Path.Combine(root, "reference/manifest.json")))!!
        Check(
            S(provenance, "bundleHash") == Hash(File.ReadAllBytes(Path.Combine(root, "reference/manifest.json"))) &&
                provenance["files"] == nil,
            "Bundle identity differs"
        )
        Check(
            JsonNode.DeepEquals(
                bundled["documents"],
                Strings(manifest["files"]!!.AsObject().Select(x -> x.Key).Order(StringComparer.Ordinal))
            ),
            bundled
        )
        Check(S(provenance, "compilerVersion") == "0.5.212", provenance)
        let searchResult = await Call(client, "cellSearch")
        let search = Data(searchResult)
        Check(
            searchResult.StructuredContent == nil && searchResult.Content.Count == 1 && S(search, "mode") == "ranked",
            search
        )
        let first = search["results"]!![0]!!
        Check(S(first, "path") == "docs/api/cell.md", search)
        let missing = await Read(client, "missingSearch")
        Check(
            S(missing, "mode") == "none" && I(missing, "total") == 0 && missing["results"]!!.AsArray().Count == 0,
            missing
        )
        await Call(client, "cellRead")
        let memberSearch = await Read(client, "sectionSearch", JsonObject(){["query"] = "Window.MeasureText"})
        let member = memberSearch["results"]!![0]!!
        Check(S(member, "section").StartsWith("### `MeasureText"), memberSearch)
        let memberRead = await Read(
            client,
            "sectionRead",
            JsonObject(){["path"] = S(member, "path"), ["section_id"] = S(member, "section_id")}
        )
        Check(
            B(memberRead, "complete") && S(memberRead, "text").Contains("## `Window`") && S(
                memberRead,
                "text"
            ).Contains("Returns:") && !S(memberRead, "text").Contains("### `Open`"),
            memberRead
        )
        Check(S(memberRead, "sha256").Length == 64, memberRead)
        await Call(client, "outsideRead", rejected: true)
    }

    async func Checkout(client McpClient, output string) string {
        let checkout = Path.Combine(output, "checkout")
        let repository = JsonObject(){["repository"] = checkout}
        Directory.CreateDirectory(Path.Combine(checkout, "Goo"))
        File.WriteAllText(Path.Combine(checkout, "Goo/Goo.gsproj"), "")
        Directory.CreateDirectory(Path.Combine(checkout, "docs/api"))
        let fresh = Path.Combine(checkout, "docs/api/new-api.md")
        File.WriteAllText(fresh, "# Newly added API\n\nHeaderOnlyProbe\n\n## Probe\n\nAgentFreshDocument\n")
        let current = await Read(client, "context", repository)
        Check(JsonNode.DeepEquals(current["documents"], Strings([]string{"docs/api/new-api.md"})), current)
        Check(S(current["provenance"]!!, "kind") == "checkout", current)
        let header = await Read(
            client,
            "sectionSearch",
            JsonObject(){["repository"] = checkout, ["query"] = "HeaderOnlyProbe"}
        )
        Check(S(header["results"]!![0]!!, "section") == "# Newly added API", header)
        let imageGuide = Path.Combine(checkout, "docs/images.md")
        File.WriteAllText(imageGuide, "# Images\n\nImageHeaderProbe\n")
        let imageContext = await Read(client, "context", repository)
        Check(imageContext["documents"]!!.AsArray().Any(x -> x.GetValue[string]() == "docs/images.md"), imageContext)
        Check(
            S(
                await Read(client, "sectionRead", JsonObject(){["repository"] = checkout, ["path"] = "docs/images.md"}),
                "text"
            ).Contains("ImageHeaderProbe"),
            imageContext
        )
        File.Delete(imageGuide)
        let found = await Read(client, "freshSearch", repository)
        Check(S(found["results"]!![0]!!, "path") == "docs/api/new-api.md", found)
        Check(
            S(await Read(client, "freshRead", repository), "text").Contains("AgentFreshDocument"),
            "Fresh read failed"
        )
        File.Delete(fresh)
        let deleted = await Read(client, "deletedSearch", repository)
        Check(deleted["results"]!!.AsArray().All(x -> S(x, "path") != "docs/api/new-api.md"), deleted)
        File.WriteAllText(fresh, "# Straße\n\nﬃ Σς\n\n")
        let unicode = await Read(client, "unicodeSearch", repository)
        Check(I(unicode, "total") == 1, unicode)
        let lines = await Read(client, "freshRead", repository)
        Check(I(lines, "totalLines") == 4, lines)
        File.WriteAllText(
            fresh,
            "# Probe\n\n## `Provider`\n\nProvider for values. TypeOnlyNeedle\n\n### `Value`\n\nField summary.\n\n## Clip\n\n" +
                String('a', 500) +
                " DelayedSnippetTerm."
        )
        let typeOnly = await Read(
            client,
            "sectionSearch",
            JsonObject(){["repository"] = checkout, ["query"] = "TypeOnlyNeedle"}
        )
        Check(
            S(typeOnly["results"]!![0]!!, "section") == "## `Provider`" && typeOnly["results"]!!.AsArray().All(
                x -> S(x, "path") != "docs/api/new-api.md" || S(x, "section") != "### `Value`"
            ),
            typeOnly
        )
        let clipped = await Read(
            client,
            "sectionSearch",
            JsonObject(){["repository"] = checkout, ["query"] = "DelayedSnippetTerm"}
        )
        let excerpt = S(clipped["results"]!![0]!!, "excerpt")
        Check(excerpt.Contains("DelayedSnippetTerm") && excerpt.Length <= 600, clipped)
        File.Delete(fresh)
        File.WriteAllText(
            fresh,
            "# Probe\n\n## Type\n\n### Row\n\nArrange a row.\n\n### Throw\n\nThrow an exception.\n\n### Long\n\n" +
                String('x', 5000)
        )
        Directory.CreateDirectory(Path.Combine(checkout, "obj"))
        File.WriteAllText(
            Path.Combine(checkout, "obj/project.assets.json"),
            "{\"libraries\":{},\"packageFolders\":{},\"targets\":{}}"
        )
        let row = await Read(
            client,
            "sectionSearch",
            JsonObject(){["repository"] = checkout, ["project"] = checkout, ["query"] = "row"}
        )
        Check(
            S(row["results"]!![0]!!, "section") == "### Row" && row["results"]!!.AsArray().All(
                x -> S(x, "section") != "### Throw" && S(x, "section") != "## Type"
            ),
            row
        )
        let rowId = S(row["results"]!![0]!!, "section_id")
        let bounded = await Read(
            client,
            "sectionRead",
            JsonObject(){["repository"] = checkout, ["path"] = "docs/api/new-api.md", ["line"] = 13, ["max_bytes"] = 64}
        )
        Check(
            !B(bounded, "complete") && I(bounded, "bytes") <= 64 && I(bounded["continuation"]!!, "offset") > 0,
            bounded
        )
        let continued = await Read(
            client,
            "sectionRead",
            JsonObject(){
                ["repository"] = checkout,
                ["path"] = "docs/api/new-api.md",
                ["section_id"] = S(bounded, "section_id"),
                ["offset"] = I(bounded["continuation"]!!, "offset")
            }
        )
        Check(S(continued, "text").StartsWith("x"), continued)
        let lineRange = await Read(
            client,
            "sectionRead",
            JsonObject(){
                ["repository"] = checkout,
                ["path"] = "docs/api/new-api.md",
                ["line"] = 1,
                ["count"] = 13,
                ["max_bytes"] = 64
            }
        )
        Check(!B(lineRange, "complete") && I(lineRange, "endLine") == 13, lineRange)
        let rangeEnd = await Read(
            client,
            "sectionRead",
            Merge(
                JsonObject(){["repository"] = checkout, ["path"] = "docs/api/new-api.md"},
                lineRange["continuation"]!!.AsObject()
            )
        )
        Check(
            B(rangeEnd, "complete") && S(lineRange, "text") + S(rangeEnd, "text") == string.Join(
                "\n",
                Lines(File.ReadAllText(fresh)).Take(13)
            ),
            rangeEnd
        )
        File.WriteAllText(fresh, "# Changed\n\nNo row definition.\n")
        await Call(
            client,
            "sectionRead",
            JsonObject(){["repository"] = checkout, ["path"] = "docs/api/new-api.md", ["section_id"] = rowId},
            true
        )
        File.Delete(fresh)
        File.WriteAllText(
            fresh,
            "# Probe\n\n## `TransferSession`\n\nA retained transfer session.\n\n### `BeginTransfer()`\n\nBegin a transfer. Call EndTransfer to end the transfer session. EndTransfer closes the transfer session.\n\n### `EndTransfer()`\n\nEnd the transfer.\n"
        )
        let ending = await Read(
            client,
            "sectionSearch",
            JsonObject(){["repository"] = checkout, ["project"] = checkout, ["query"] = "end transfer session"}
        )
        Check(S(ending["results"]!![0]!!, "section") == "### `EndTransfer()`", ending)
        let guide = Path.Combine(checkout, "docs/api/transfer-guide.md")
        File.WriteAllText(
            guide,
            "# Transfer guide\n\n## Manage retained sessions\n\nBegin transfer sessions to start retained work. End transfer sessions to close retained work. An end transfer session call completes the retained transfer session.\n"
        )
        for query in[]string{"end transfer session", "begin transfer session"} {
            let matching = await Read(
                client,
                "sectionSearch",
                JsonObject(){["repository"] = checkout, ["project"] = checkout, ["query"] = query}
            )
            Check(
                S(matching["results"]!![0]!!, "section") == (
                    if query.StartsWith("end") {
                        "### `EndTransfer()`"
                    } else {
                        "### `BeginTransfer()`"
                    }
                ),
                matching
            )
        }
        File.WriteAllText(
            fresh,
            "# Probe\n\n## `DrawingSession`\n\nA retained drawing buffer.\n\n### `Begin()`\n\nBegin drawing. Call End to end the drawing buffer. End closes the drawing buffer.\n\n### `End()`\n\nEnd drawing.\n"
        )
        let scoped = await Read(
            client,
            "sectionSearch",
            JsonObject(){["repository"] = checkout, ["project"] = checkout, ["query"] = "end drawing buffer"}
        )
        Check(S(scoped["results"]!![0]!!, "section") == "### `End()`", scoped)
        File.Delete(guide)
        File.WriteAllText(
            fresh,
            "# Probe\n\n## A\n\nAn encoding stage.\n\n## B\n\nAn encoder stage.\n\n## C\n\nAn encode stage.\n\n## D\n\nThe printer runs.\n\n## E\n\nThe print runs.\n\n## F\n\nA detection stage.\n\n## G\n\nA detect stage.\n\n## H\n\nOwner keeps state.\n"
        )
        let forms = JsonObject(){
            ["encoding"] = "## A",
            ["encoder"] = "## B",
            ["encode"] = "## C",
            ["printer"] = "## D",
            ["print"] = "## E"
        }
        for pair in forms {
            let exact = await Read(
                client,
                "sectionSearch",
                JsonObject(){["repository"] = checkout, ["project"] = checkout, ["query"] = pair.Key}
            )
            Check(S(exact["results"]!![0]!!, "section") == pair.Value.GetValue[string](), exact)
        }
        for query in[]string{"printing", "detecting"} {
            let stemmed = await Read(
                client,
                "sectionSearch",
                JsonObject(){["repository"] = checkout, ["project"] = checkout, ["query"] = query}
            )
            Check(I(stemmed, "total") >= 2, stemmed)
        }
        let shortRoot = await Read(
            client,
            "sectionSearch",
            JsonObject(){["repository"] = checkout, ["project"] = checkout, ["query"] = "own"}
        )
        Check(I(shortRoot, "total") == 0, shortRoot)
        File.WriteAllText(
            fresh,
            "# Probe\n\n## `Shape`\n\nParentOnlyMarker.\n\n### `StrokeTrim`\n\nTrim the path stroke.\n"
        )
        let owner = await Read(
            client,
            "sectionSearch",
            JsonObject(){["repository"] = checkout, ["project"] = checkout, ["query"] = "shape stroke trim"}
        )
        Check(S(owner["results"]!![0]!!, "section") == "### `StrokeTrim`", owner)
        let parentOnly = await Read(
            client,
            "sectionSearch",
            JsonObject(){["repository"] = checkout, ["project"] = checkout, ["query"] = "ParentOnlyMarker"}
        )
        Check(I(parentOnly, "total") == 1 && S(parentOnly["results"]!![0]!!, "section") == "## `Shape`", parentOnly)
        File.Delete(fresh)
        let packageRoot = Path.Combine(output, "packages")
        let packagePath = Path.Combine(packageRoot, "goo.widgets/1.0.0/lib/net10.0/Goo.Widgets.xml")
        Directory.CreateDirectory(Path.GetDirectoryName(packagePath)!!)
        File.WriteAllText(
            packagePath,
            "<doc><members><member name=\"M:Goo.DevTools.Cli.CliApplication.RunAsync(System.String[])\"><summary>Run the declaration probe.</summary><param name=\"args\">Arguments to parse.</param><returns>The exit code.</returns><exception cref=\"T:System.ArgumentException\">Invalid arguments.</exception><seealso cref=\"T:System.String\" /></member></members></doc>"
        )
        File.Copy(Assembly.GetEntryAssembly()!!.Location, Path.ChangeExtension(packagePath, ".dll"))
        let assets = JsonObject(){
            ["libraries"] = JsonObject(){["Goo.Widgets/1.0.0"] = JsonObject(){["path"] = "goo.widgets/1.0.0"}},
            ["packageFolders"] = JsonObject(){[packageRoot + Path.DirectorySeparatorChar] = JsonObject()},
            ["targets"] = JsonObject(){
                ["net10.0"] = JsonObject(){
                    ["Goo.Widgets/1.0.0"] = JsonObject(){
                        ["compile"] = JsonObject(){["lib/net10.0/Goo.Widgets.dll"] = JsonObject()}
                    }
                }
            }
        }
        File.WriteAllText(Path.Combine(checkout, "obj/project.assets.json"), assets.ToJsonString())
        let packageSearch = await Read(
            client,
            "sectionSearch",
            JsonObject(){["repository"] = checkout, ["project"] = checkout, ["query"] = "CliApplication.RunAsync"}
        )
        let packageHit = packageSearch["results"]!![0]!!
        Check(
            S(packageHit, "path").StartsWith("packages/Goo.Widgets/1.0.0/") &&
                S(packageSearch["packages"]!!, "Goo.Animations") == "unavailable",
            packageSearch
        )
        let packageRead = await Read(
            client,
            "sectionRead",
            JsonObject(){
                ["repository"] = checkout,
                ["project"] = checkout,
                ["path"] = S(packageHit, "path"),
                ["section_id"] = S(packageHit, "section_id")
            }
        )
        Check(
            B(packageRead, "complete") && S(packageRead, "text").Contains("shared RunAsync(args []string)") && S(
                packageRead,
                "text"
            ).Contains("Task[int32]") && S(packageRead, "text").Contains("Arguments to parse.") && S(
                packageRead,
                "text"
            ).Contains("exception T:System.ArgumentException") && S(packageRead, "text").Contains(
                "seealso T:System.String"
            ) &&
                S(packageRead, "sha256") == Hash(File.ReadAllBytes(packagePath)),
            packageRead
        )
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
        Check(S(starter, "run") == "goo dev", starter)
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
                    "templates/Goo.Templates/content/.gitignore",
                    "templates/Goo.Templates/content/GooStarter.gsproj",
                    "templates/Goo.Templates/content/Program.gs",
                    "templates/Goo.Templates/content/Properties/PublishProfiles/NativeAot.pubxml",
                    "templates/Goo.Templates/content/Properties/PublishProfiles/Trimmed.pubxml",
                    "templates/Goo.Templates/content/global.json"
                }
            ),
            starter
        )
        Check(
            provenance["generatedFiles"]!!
                .AsObject()
                .Select(x -> x.Key)
                .Order()
                .SequenceEqual(
                []string{
                    ".gitignore",
                    "AgentProbe.gsproj",
                    "Program.gs",
                    "Properties/PublishProfiles/NativeAot.pubxml",
                    "Properties/PublishProfiles/Trimmed.pubxml",
                    "global.json"
                }
            ),
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
                Check(S(trusted, "build") == S(starter, "build"), trusted)
            }
        } finally {
            await configured.DisposeAsync()
        }
        for file in starter["files"]!!.AsObject() {
            Directory.CreateDirectory(Path.GetDirectoryName(Path.Combine(app, file.Key))!!)
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
        await Call(client, "invalidKey", target, true)
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
            if event_ == "pointer.down" {
                await Call(client, "invalidKey", target, true)
            }
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
