import System
import System.Collections.Generic
import System.Diagnostics
import System.IO
import System.Linq
import System.Runtime.InteropServices
import System.Text.Json
import System.Text.Json.Nodes
import System.Threading.Tasks

partial class Performance {
    func Execute() {
        Runner.Require(
            Hash(Path.Combine(root, FontPath)) == FontHash && Hash(Path.Combine(root, LicensePath)) == LicenseHash,
            "benchmark font or license hash does not match the fixture contract"
        )
        let identity = JsonObject()
        let sourceFiles = []string{
            "Program.gs",
            "Goo.ConsumerPerformance.gsproj",
            "Directory.Build.props",
            "Directory.Packages.props",
            "global.json",
            "NuGet.Config",
            FontPath,
            LicensePath
        }
        for relative in sourceFiles {
            let path = Path.Combine(root, relative)
            identity[relative] = JsonObject(){["sha256"] = Hash(path), ["bytes"] = FileInfo(path).Length}
        }
        for path in Directory.GetFiles(Path.Combine(Runner.Root, "tools/Goo.Investigation"), "*.gs*").Order(
            StringComparer.Ordinal
        ) {
            let relative = Path.GetRelativePath(root, path).Replace('\\', '/')
            identity[relative] = JsonObject(){["sha256"] = Hash(path), ["bytes"] = FileInfo(path).Length}
        }
        let settings = JsonObject(){
            ["rid"] = options["--rid"],
            ["packageVersion"] = options["--package-version"],
            ["packageSource"] = source,
            ["packageSourceKind"] = sourceKind,
            ["warmRuns"] = int32.Parse(options.GetValueOrDefault("--warm-runs", "5")),
            ["idleRuns"] = int32.Parse(options.GetValueOrDefault("--idle-runs", "5")),
            ["startupTimeoutSeconds"] = Seconds("startup-timeout"),
            ["startupHoldSeconds"] = Seconds("startup-hold"),
            ["readinessDelaySeconds"] = Seconds("readiness-delay"),
            ["idleSettleSeconds"] = Seconds("idle-settle"),
            ["idleSeconds"] = Seconds("idle"),
            ["publishOnly"] = options.ContainsKey("--publish-only")
        }
        Runner.Save(Path.Combine(output, "options.json"), settings)
        Command("dotnet-info", []string{"dotnet", "--info"}, 60)
        let version = Command("dotnet-version", []string{"dotnet", "--version"}, 60).Trim()
        Runner.Require(version == "10.0.401", "fixture requires .NET SDK 10.0.401, got '" + version + "'")
        let sizes = Publish()
        for mode in modes {
            Runner.Require(
                sizes[mode]!!["noticesInRuntime"]!!.AsArray().Any(
                    x -> Text(x.AsObject(), "path") == "VendSans-OFL.txt"
                ),
                mode + " staged runtime omitted the Vend Sans license"
            )
        }
        let observedEnvironment = JsonObject()
        for name in recorded {
            let value = Environment.GetEnvironmentVariable(name)
            if value != nil {
                observedEnvironment[name] = value
            }
        }
        let provenance = JsonObject(){
            ["schemaVersion"] = 1,
            ["recordedUtc"] = DateTimeOffset.UtcNow.ToString("O"),
            ["options"] = settings.DeepClone(),
            ["sdk"] = JsonObject(){["dotnetVersion"] = version, ["globalJson"] = identity["global.json"]!!.DeepClone()},
            ["restoreConfig"] = JsonObject(){["path"] = config, ["sha256"] = Hash(config)},
            ["packages"] = JsonObject(){
                ["goo"] = Package("Goo", options["--package-version"]),
                ["gsharpSdk"] = Package("Gsharp.NET.Sdk", "0.5.26")
            },
            ["source"] = identity,
            ["font"] = JsonObject(){
                ["path"] = FontPath,
                ["sha256"] = FontHash,
                ["license"] = LicensePath,
                ["licenseSha256"] = LicenseHash
            },
            ["host"] = Host(),
            ["environment"] = observedEnvironment,
            ["controlledGooEnvironment"] = JsonSerializer.SerializeToNode(controlled),
            ["commands"] = commands.DeepClone(),
            ["sizes"] = sizes.DeepClone(),
            ["measurementLimits"] = Limits()
        }
        Runner.Save(Path.Combine(output, "provenance.json"), provenance)
        if options.ContainsKey("--publish-only") {
            Runner.Save(
                Path.Combine(output, "summary.json"),
                JsonObject(){["sizes"] = sizes.DeepClone(), ["measurements"] = nil, ["failures"] = JsonArray()}
            )
        } else {
            Measure(sizes)
        }
    }

    shared {
        public func Run(options Dictionary[string, string]) {
            Performance(options).Execute()
        }

        func Optional(command[]string, seconds int32) JsonObject? {
            let executable = (Environment.GetEnvironmentVariable("PATH") ?? "")
                .Split(Path.PathSeparator)
                .Select(x -> Path.Combine(x, command[0]))
                .FirstOrDefault(x -> File.Exists(x))
            if executable == nil {
                return nil
            }
            let actual = command.ToArray()
            actual[0] = executable
            try {
                using let process = Runner.Start(actual)
                let stdout = process.StandardOutput.ReadToEndAsync()
                let stderr = process.StandardError.ReadToEndAsync()
                let finished = process.WaitForExit(seconds * 1000)
                if !finished {
                    Runner.Stop(process)
                }
                Task.WaitAll(stdout, stderr)
                if !finished {
                    return JsonObject(){["command"] = JsonSerializer.SerializeToNode(actual), ["error"] = "timed out"}
                }
                return JsonObject(){
                    ["command"] = JsonSerializer.SerializeToNode(actual),
                    ["returncode"] = process.ExitCode,
                    ["stdout"] = stdout.Result,
                    ["stderr"] = stderr.Result
                }
            } catch (error System.ComponentModel.Win32Exception) {
                return JsonObject(){["command"] = JsonSerializer.SerializeToNode(actual), ["error"] = error.Message}
            }
        }

        func Host() JsonObject {
            var cpu string? = nil
            if File.Exists("/proc/cpuinfo") {
                let line = File.ReadLines("/proc/cpuinfo").FirstOrDefault(
                    x -> x.StartsWith("model name", StringComparison.OrdinalIgnoreCase)
                )
                if line != nil {
                    cpu = line.Split(':', 2)[1].Trim()
                }
            }
            return JsonObject(){
                ["platform"] = RuntimeInformation.OSDescription,
                ["machine"] = RuntimeInformation.OSArchitecture.ToString(),
                ["dotnet"] = Environment.Version.ToString(),
                ["cpu"] = cpu,
                ["nvidiaSmi"] = Optional(
                    []string{"nvidia-smi", "--query-gpu=name,driver_version", "--format=csv,noheader"},
                    15
                ),
                ["vulkanInfo"] = Optional([]string{"vulkaninfo", "--summary"}, 30)
            }
        }

        func Limits() JsonObject -> JsonObject(){
            ["diagnosticStartupOrigin"] = "Window.Open",
            [
                "firstFramePump"
            ] = "one public Pump performs a submission attempt before the watcher; it is not successful-present confirmation",
            ["linuxLaunchOrigin"] = "timestamp immediately before Process.Start on CLOCK_MONOTONIC; null elsewhere",
            ["event508Availability"] = "flushed only after teardown and absent from public Goo 0.6.4",
            [
                "diagnosticsOffReadiness"
            ] = "configured settle after Window.Open returned, not successful-present confirmation",
            [
                "idleCpuBoundary"
            ] = "GC heap, private bytes, and working set are read before each Process.TotalProcessorTime and Stopwatch boundary; end-getter work and fixture formatting remain in the measured interval",
            ["emptyCache"] = "Goo pipeline cache only; OS and driver caches are not dropped",
            ["gcCommittedBytes"] = "last completed GC snapshot; null when GC index is zero",
            ["privateBytes"] = "virtual committed private bytes, not private resident memory",
            ["linuxPssAndPrivateResident"] = "read from /proc/<pid>/smaps_rollup when available, otherwise null",
            ["vulkanDeviceMemory"] = "Goo tracked allocations, not total process GPU memory"
        }
    }
}
