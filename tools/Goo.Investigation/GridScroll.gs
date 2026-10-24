import System
import System.Collections.Generic
import System.Globalization
import System.IO
import System.Linq
import System.Text.Json.Nodes

class GridScroll {
    shared {
        public func Run(options Dictionary[string, string]) {
            let widgets = Path.GetFullPath(options["--widgets-project"])
            let output = options["--output"]
            let repeats = int32.Parse(options.GetValueOrDefault("--repeats", "3"), CultureInfo.InvariantCulture)
            let here = Path.Combine(Runner.Root, "tools/Goo.ConsumerPerformance/GridScroll")
            let cache = Path.Combine(
                Environment.GetFolderPath(Environment.SpecialFolder.UserProfile),
                ".cache/goo-fix/GridPerf"
            )
            Directory.CreateDirectory(output)
            let environment = Dictionary[string, string]()
            environment["NUGET_PACKAGES"] = Path.Combine(cache, "nuget")
            environment["DOTNET_GCHeapHardLimit"] = "0x180000000"
            environment["DOTNET_TieredCompilation"] = "0"
            let limit = []string{"flock", Path.Combine(cache, "../heavy.lock"), "nice", "-n", "10"}
            if !options.ContainsKey("--skip-build") {
                let build = []string{
                    "dotnet",
                    "build",
                    Path.Combine(here, "GridScroll.gsproj"),
                    "-c",
                    "Release",
                    "-m:4",
                    "-nodeReuse:false",
                    "-p:UseSharedCompilation=false",
                    "-p:WidgetsProject=" + widgets,
                    "-p:CustomAfterMicrosoftCommonTargets=" + Path.Combine(here, "References.targets"),
                    "-p:IncludeTestFixtures=true",
                    "-p:GooTestFixturesProps=" + Path.Combine(here, "Frames.props")
                }
                Runner.Run(
                    []string{"nice", "-n", "10"}.Concat(build).ToArray(),
                    environment: environment,
                    log: Path.Combine(output, "build.log")
                )
            }
            let results = JsonObject()
            for wrapped in[]int32{0, 1} {
                for pattern in[]string{"wheel", "thumb"} {
                    let frames = List[JsonObject]()
                    let stages = Dictionary[string, []double]()
                    for repeat in Enumerable.Range(0, repeats) {
                        let path = Path.Combine(output, "$pattern-wrap$wrapped-$repeat.jsonl")
                        let command = []string{
                            "dotnet",
                            Path.Combine(here, "bin/Release/net10.0/GridScroll.dll"),
                            "10000",
                            pattern,
                            if wrapped == 1 {
                                "wrap"
                            } else {
                                "fixed"
                            }
                        }
                        Runner.Run(limit.Concat(command).ToArray(), environment: environment, log: path)
                        for line in File.ReadLines(path) {
                            if !line.StartsWith("{\"stage\":") {
                                continue
                            }
                            let item = JsonNode.Parse(line)!!.AsObject()
                            let stage = item["stage"]!!.GetValue[string]()
                            if stage == "Frame" {
                                frames.Add(item)
                            }
                            if !stages.ContainsKey(stage) {
                                stages[stage] = [2]double{}
                            }
                            stages[stage][0] += item["ms"]!!.GetValue[double]()
                            stages[stage][1] += item["bytes"]!!.GetValue[double]()
                        }
                    }
                    results["$pattern-wrap$wrapped"] = Summarize(frames, stages)
                }
            }
            Runner.Save(Path.Combine(output, "summary.json"), results)
            Console.WriteLine(results.ToJsonString(Runner.JsonOptions))
        }

        func Summarize(frames List[JsonObject], stages Dictionary[string, []double]) JsonObject {
            let ordered = frames.Select((x JsonObject) -> x["ms"]!!.GetValue[double]()).Order().ToArray()
            Runner.Require(ordered.Length > 0, "no recorded frames")
            let result = JsonObject()
            for percentile in[]int32{50, 95, 99} {
                result["p${percentile}_ms"] = JsonValue.Create(
                    ordered[int32(Math.Ceiling(ordered.Length * percentile / 100.0)) - 1]
                )
            }
            result["frames"] = JsonValue.Create(frames.Count)
            result["bytes_per_frame"] = JsonValue.Create(
                frames.Sum((x JsonObject) -> x["bytes"]!!.GetValue[double]()) / frames.Count
            )
            result["gcs"] = JsonValue.Create(frames.Sum((x JsonObject) -> x["gc"]!!.GetValue[int32]()))
            let perFrame = JsonObject()
            for stage in stages {
                perFrame[stage.Key] = JsonObject(){
                    ["ms"] = JsonValue.Create(stage.Value[0] / frames.Count),
                    ["bytes"] = JsonValue.Create(stage.Value[1] / frames.Count)
                }
            }
            result["stages_per_frame"] = perFrame
            return result
        }
    }
}
