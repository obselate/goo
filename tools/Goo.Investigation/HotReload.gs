import System
import System.Collections.Generic
import System.Diagnostics
import System.IO
import System.Linq
import System.Text.Json.Nodes
import System.Threading
import System.Threading.Tasks
import System.Xml.Linq

class HotReload {
    shared {
        func State(output string, label string) JsonObject? {
            let path = Path.Combine(output, "state.txt")
            if !File.Exists(path) {
                return nil
            }
            let lines = File.ReadAllLines(path)
            if lines.Length != 5 {
                return nil
            }
            let cells = lines.Skip(3).Select(x -> x.Split('|')).ToArray()
            if cells.Any(x -> x.Length != 7 || x[1] != label) {
                return nil
            }
            for handle in lines.Skip(1).Take(2) {
                let parts = handle.Split(':')
                Runner.Require(parts.Length == 2 && parts[0] == parts[1] && parts[0] != "0", string.Join("\n", lines))
            }
            for cell in cells {
                Runner.Require(
                    cell.Skip(2).Take(4).SequenceEqual([]string{"7", "keep this text", "2", "6"}),
                    string.Join("\n", lines)
                )
            }
            let handles = JsonArray()
            let stateCells = JsonArray()
            for handle in lines.Skip(1).Take(2) {
                handles.Add(handle)
            }
            for cell in cells {
                let values = JsonArray()
                for value in cell {
                    values.Add(value)
                }
                stateCells.Add(values)
            }
            return JsonObject(){["pid"] = int32.Parse(lines[0]), ["handles"] = handles, ["cells"] = stateCells}
        }

        func Wait(watch Process, output string, check Func[JsonObject?], seconds int32 = 100) JsonObject {
            let deadline = Stopwatch.StartNew()
            while deadline.Elapsed.TotalSeconds < seconds {
                Runner.Require(!watch.HasExited, File.ReadAllText(Path.Combine(output, "watch.log")))
                let value = check()
                if value != nil {
                    return value
                }
                Thread.Sleep(100)
            }
            throw InvalidOperationException(File.ReadAllText(Path.Combine(output, "watch.log")))
        }

        public func Run(options Dictionary[string, string]) {
            let output = Directory.CreateTempSubdirectory("goo-hotreload-").FullName
            Console.WriteLine("Evidence: " + output)
            let runtime = Path.GetFullPath(options["--runtime"])
            Runner.Require(File.Exists(runtime), runtime)
            let app = Path.Combine(output, "app")
            Directory.CreateDirectory(app)
            let program = Path.Combine(app, "Program.gs")
            File.Copy(Path.Combine(Runner.Root, "tests/Goo.HotReloadSmoke/Program.gs"), program)
            let project = Path.Combine(app, "Smoke.gsproj")
            XDocument(
                XElement(
                    "Project",
                    XAttribute("Sdk", "Gsharp.NET.Sdk/0.5.26"),
                    XElement(
                        "PropertyGroup",
                        XElement("OutputType", "Exe"),
                        XElement("TargetFramework", "net10.0"),
                        XElement("GsharpHotReloadRuntimeAssemblyFullPath", runtime)
                    ),
                    XElement(
                        "ItemGroup",
                        XElement(
                            "PackageReference",
                            XAttribute("Include", "Goo"),
                            XAttribute("Version", options["--goo-version"])
                        )
                    )
                )
            ).Save(project)
            XDocument(
                XElement(
                    "configuration",
                    XElement(
                        "packageSources",
                        XElement("clear"),
                        XElement(
                            "add",
                            XAttribute("key", "local"),
                            XAttribute("value", Path.GetFullPath(options["--packages"]))
                        ),
                        XElement(
                            "add",
                            XAttribute("key", "nuget"),
                            XAttribute("value", "https://api.nuget.org/v3/index.json")
                        )
                    )
                )
            ).Save(Path.Combine(app, "NuGet.Config"))
            let diagnostics = options.ContainsKey("--diagnostics")
            let environment = Dictionary[string, string]()
            environment["GOO_HOTRELOAD_EVIDENCE"] = output
            environment["GOO_DEVTOOLS"] = if diagnostics {
                "1"
            } else {
                "0"
            }
            environment["GOO_DEVTOOLS_DIR"] = Path.Combine(output, "endpoints")
            let build = List[string]{"dotnet", "build", project, "--nologo", "-m:4"}
            if !OperatingSystem.IsWindows() {
                build.InsertRange(0, []string{"nice", "-n", "10"})
            }
            Runner.Run(build.ToArray(), seconds: 120, log: Path.Combine(output, "build.log"))
            using let watch = Runner.Start(
                []string{"dotnet", "watch", "--project", project, "--non-interactive"},
                environment: environment
            )
            using let log = StreamWriter(Path.Combine(output, "watch.log"))
            log.AutoFlush = true
            let stdout = Copy(watch.StandardOutput, log)
            let stderr = Copy(watch.StandardError, log)
            try {
                Verify(watch, output, program, diagnostics, environment)
            } finally {
                File.WriteAllText(Path.Combine(output, "close"), "")
                Thread.Sleep(500)
                Runner.Stop(watch)
                Task.WaitAll(stdout, stderr)
            }
        }

        func Verify(
            watch Process,
            output string,
            program string,
            diagnostics bool,
            environment Dictionary[string, string]
        ) {
            let before = Wait(watch, output, () -> State(output, "Before stable"))
            Runner.Save(Path.Combine(output, "before.json"), before)
            for label in[]string{"After", "Again"} {
                let old = if label == "After" {
                    "Before"
                } else {
                    "After"
                }
                File.WriteAllText(
                    program,
                    File.ReadAllText(program).Replace("LastLabel = \"$old \"", "LastLabel = \"$label \"")
                )
                let after = Wait(watch, output, () -> State(output, label + " stable"))
                Runner.Require(
                    JsonNode.DeepEquals(after["pid"], before["pid"]) && JsonNode.DeepEquals(
                        after["handles"],
                        before["handles"]
                    ),
                    "PID or native handles changed"
                )
                for index in 0 ... 2 {
                    let a = after["cells"]!![index]!!
                    let b = before["cells"]!![index]!!
                    Runner.Require(
                        JsonNode.DeepEquals(a[0], b[0]) && int32.Parse(a[6]!!.GetValue[string]()) > int32.Parse(
                            b[6]!!.GetValue[string]()
                        ),
                        "Cell identity or rebuild count was not preserved"
                    )
                }
                Runner.Save(Path.Combine(output, label.ToLowerInvariant() + ".json"), after)
                Console.WriteLine(
                    "$label: both windows updated in PID ${after["pid"]}, native handles and Cell/editor state preserved"
                )
            }
            if diagnostics {
                let cli = Path.Combine(
                    Environment.GetFolderPath(Environment.SpecialFolder.UserProfile),
                    ".dotnet/tools/goo"
                )
                for title in[]string{"first", "second"} {
                    Runner.Run(
                        []string{
                            cli,
                            "capture",
                            "--pid",
                            before["pid"]!!.ToString(),
                            "--window",
                            title,
                            "--output",
                            Path.Combine(output, title + ".png")
                        },
                        environment: environment,
                        seconds: 20
                    )
                }
            } else {
                let endpoints = Path.Combine(output, "endpoints")
                Runner.Require(
                    !Directory.Exists(endpoints) || !Directory.EnumerateFiles(endpoints, "*.json").Any(),
                    "diagnostic endpoint exists with diagnostics disabled"
                )
            }
            File.AppendAllText(program, "\nfunc AddedMember() int32 -> 9\n")
            Wait(
                watch,
                output,
                () -> {
                    if File.ReadAllText(Path.Combine(output, "watch.log")).Contains("GSHR1001") {
                        return JsonObject()
                    }
                    return nil
                },
                30
            )
            Runner.Require(
                JsonNode.DeepEquals(State(output, "Again stable")!!["pid"], before["pid"]),
                "structural edit restarted app"
            )
            let result = JsonObject(){
                ["passed"] = true,
                ["diagnostics"] = diagnostics,
                ["pid"] = before["pid"]!!.DeepClone(),
                ["windows"] = 2,
                ["edits"] = 2,
                ["statePreserved"] = true,
                ["nativeHandlesPreserved"] = true,
                ["structuralEdit"] = "GSHR1001"
            }
            Runner.Save(Path.Combine(output, "result.json"), result)
            Console.WriteLine(result.ToJsonString())
        }

        async func Copy(reader StreamReader, writer StreamWriter) {
            while true {
                let line = await reader.ReadLineAsync()
                if line == nil {
                    return
                }
                lock writer {
                    writer.WriteLine(line)
                }
            }
        }
    }
}
