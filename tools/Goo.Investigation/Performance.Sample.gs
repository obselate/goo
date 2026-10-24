import System
import System.Collections.Concurrent
import System.Collections.Generic
import System.Diagnostics
import System.Globalization
import System.IO
import System.Linq
import System.Text.Json.Nodes
import System.Threading.Tasks

partial class Performance {
    func Executable(mode string) string {
        let name = "Goo.ConsumerPerformance" + if options["--rid"].StartsWith("win-") {
            ".exe"
        } else {
            ""
        }
        let path = Path.Combine(output, "stage", mode, "runtime", name)
        Runner.Require(File.Exists(path), "staged executable not found: " + path)
        return path
    }

    func Sample(
        name string,
        mode string,
        cacheDirectory string,
        diagnostics bool,
        readyDelay double,
        interval double
    ) JsonObject {
        let sampleRoot = Path.Combine(output, "raw/runs", name)
        Directory.CreateDirectory(sampleRoot)
        Directory.CreateDirectory(cacheDirectory)
        let extra = Dictionary[string, string]()
        extra["GOO_CONSUMER_READY_DELAY_MS"] = Math.Round(readyDelay * 1000).ToString(CultureInfo.InvariantCulture)
        extra["GOO_CONSUMER_RUN_MS"] = Math.Round((readyDelay + interval) * 1000).ToString(CultureInfo.InvariantCulture)
        extra["GOO_CONSUMER_STARTUP_DEADLINE_MS"] = if diagnostics {
            Math.Round(Seconds("startup-timeout") * 1000).ToString(CultureInfo.InvariantCulture)
        } else {
            "0"
        }
        extra["GOO_VK_DIAGNOSTICS"] = if diagnostics {
            "1"
        } else {
            "0"
        }
        extra["GOO_VK_PIPELINE_CACHE"] = "1"
        extra["GOO_VK_PIPELINE_CACHE_DIR"] = cacheDirectory
        let command = []string{Executable(mode)}
        let observation = Observe(command, extra, sampleRoot, diagnostics, readyDelay, interval)
        let result = Assess(observation, diagnostics, interval)
        result["name"] = name
        result["mode"] = mode
        result["command"] = System.Text.Json.JsonSerializer.SerializeToNode(command)
        Runner.Save(Path.Combine(sampleRoot, "result.json"), result)
        samples.Add(result)
        if observation.Errors.Count > 0 {
            failures.Add(JsonObject(){["sample"] = name, ["errors"] = result["errors"]!!.DeepClone()})
        }
        return result
    }

    func Observe(
        command[]string,
        extra Dictionary[string, string],
        sampleRoot string,
        diagnostics bool,
        readyDelay double,
        interval double
    ) SampleObservation {
        let observation = SampleObservation()
        let events = BlockingCollection[JsonObject]()
        let readers = List[Task]()
        var process Process? = nil
        observation.Started = Now()
        let deadline = observation.Started + int64(Seconds("startup-timeout") * 1000000000)
        try {
            process = Start(command, Path.GetDirectoryName(command[0])!!, extra)
            readers.Add(Read(process.StandardOutput, Path.Combine(sampleRoot, "stdout.log"), "stdout", events))
            readers.Add(Read(process.StandardError, Path.Combine(sampleRoot, "stderr.log"), "stderr", events))
            observation.OpenReturn = WaitEvent(
                process,
                events,
                observation.Records,
                "window_open_return",
                (deadline - Now()) / 1000000000.0
            )
            if observation.OpenReturn == nil {
                observation.Errors.Add("Window.Open did not return before the startup timeout")
            } else {
                observation.FirstPump = WaitEvent(
                    process,
                    events,
                    observation.Records,
                    "first_frame_pump_return",
                    (deadline - Now()) / 1000000000.0
                )
                if observation.FirstPump == nil {
                    observation.Errors.Add("first-frame submission attempt did not return before the startup timeout")
                }
            }
            if diagnostics && observation.FirstPump != nil {
                if !process.WaitForExit(int32((Math.Max(0, (deadline - Now()) / 1000000000.0) + 5) * 1000)) {
                    observation.Errors.Add("process did not close after the startup deadline")
                }
            } else if !diagnostics && observation.FirstPump != nil {
                observation.IdleStart = WaitEvent(process, events, observation.Records, "idle_start", readyDelay + 5)
                if observation.IdleStart == nil {
                    observation.Errors.Add("window closed before the diagnostics-off idle interval started")
                } else {
                    observation.MemoryStart = Memory(process.Id)
                    observation.IdleEnd = WaitEvent(process, events, observation.Records, "idle_end", interval + 5)
                    if observation.IdleEnd == nil {
                        observation.Errors.Add("window closed during the diagnostics-off idle interval")
                    } else {
                        observation.MemoryEnd = Memory(process.Id)
                    }
                }
                if !process.HasExited && !process.WaitForExit(5000) {
                    observation.Errors.Add("process did not close after the diagnostics-off idle interval")
                }
            }
        } catch (error Exception) {
            observation.Errors.Add("runner error: ${error.GetType().Name}: ${error.Message}")
        } finally {
            if process != nil {
                Runner.Stop(process)
            }
            if !Task.WaitAll(readers.ToArray(), 5000) {
                if process != nil {
                    process.StandardOutput.Close()
                    process.StandardError.Close()
                }
                if !Task.WaitAll(readers.ToArray(), 1000) {
                    observation.Errors.Add("output reader did not stop")
                }
            }
        }
        while events.TryTake(out let record) {
            observation.Records.Add(record)
        }
        observation.Ended = Now()
        if process != nil {
            observation.Returncode = process.ExitCode
            process.Dispose()
        }
        if observation.Returncode != 0 {
            observation.Errors.Add("exit ${observation.Returncode}")
        }
        let diagnosticsRecords = observation
            .Records
            .Where(x -> Text(x, "channel") == "stderr")
            .Select(x -> x["value"]!!.ToJsonString())
        File.WriteAllLines(Path.Combine(sampleRoot, "diagnostics.ndjson"), diagnosticsRecords)
        return observation
    }

    func Assess(observation SampleObservation, diagnostics bool, interval double) JsonObject {
        let records = observation.Records
        let errors = observation.Errors
        let fixtures = records
            .Where(x -> Text(x, "channel") == "stdout" && Text(x["value"]!!.AsObject(), "kind") == "fixture")
            .Select(x -> x["value"]!!.AsObject())
            .ToList()
        let present = records
            .Where(x -> Text(x, "channel") == "stderr")
            .Select(x -> x["value"]!!.AsObject())
            .FirstOrDefault(x -> Text(x, "kind") == "live" && Number(x, "event") == 508)
        let metrics = fixtures.Where(x -> Text(x, "event") == "metrics").ToList()
        let geometry = Geometry(metrics)
        for error in geometry["errors"]!!.AsArray() {
            errors.Add(error.GetValue[string]())
        }
        let startup = StartupTiming(present, observation.Started, diagnostics, errors)
        let windowSeconds = Number(startup, "window")
        let launchSeconds = Number(startup, "launch")
        let idleTiming = IdleTiming(observation.IdleStart, observation.IdleEnd, errors)
        let actual = Number(idleTiming, "actual")
        let idleComplete = observation.IdleStart != nil && observation.IdleEnd != nil
        let workloadValid = observation.Returncode == 0 &&
            Flag(geometry, "valid") &&
            observation.OpenReturn != nil &&
            observation.FirstPump != nil &&
            errors.Count == 0
        let result = JsonObject()
        result["status"] = if errors.Count == 0 {
            "ok"
        } else {
            "failed"
        }
        result["errors"] = System.Text.Json.JsonSerializer.SerializeToNode(errors.Distinct().ToArray())
        result["returncode"] = JsonValue.Create(observation.Returncode)
        result["popenBoundaryMonotonicNs"] = observation.Started
        result["endedMonotonicNs"] = observation.Ended
        result["processLifetimeSeconds"] = (observation.Ended - observation.Started) / 1000000000.0
        result["diagnosticsEnabled"] = diagnostics
        result["workloadValid"] = workloadValid
        result["startupValid"] = diagnostics && workloadValid && present != nil && windowSeconds != nil
        result["idleValid"] = !diagnostics && workloadValid && idleComplete && actual != nil && actual > 0
        result["instrumentation"] = if present != nil {
            "available"
        } else if diagnostics {
            "missing_event_508"
        } else {
            "disabled"
        }
        result["startupOrigin"] = if present != nil {
            JsonValue.Create("window_open")
        } else {
            nil
        }
        result["windowOpenToFirstPresentSeconds"] = JsonValue.Create(windowSeconds)
        result["linuxPopenBoundaryToFirstPresentSeconds"] = JsonValue.Create(launchSeconds)
        result["launchOrigin"] = if launchSeconds != nil {
            JsonValue.Create("immediately_before_process_start_using_linux_clock_monotonic")
        } else {
            nil
        }
        result["firstFrameSubmissionAttempt"] = observation.FirstPump?.DeepClone()
        result[
            "firstFrameSubmissionAttemptLimit"
        ] = "Pump returned after a submission attempt; this is not asynchronous successful presentation"
        result["firstPresent"] = present?.DeepClone()
        result["metrics"] = metrics.LastOrDefault()?.DeepClone()
        result["geometry"] = geometry
        result["fixtureEvents"] = System.Text.Json.JsonSerializer.SerializeToNode(fixtures)
        result["idle"] = if diagnostics {
            nil
        } else {
            JsonObject(){
                ["requestedSeconds"] = interval,
                ["actualSeconds"] = JsonValue.Create(actual),
                ["processCpuSeconds"] = idleTiming["cpu"]?.DeepClone(),
                ["cpuPercentOneCore"] = idleTiming["percent"]?.DeepClone(),
                ["startMemory"] = observation.MemoryStart?.DeepClone(),
                ["endMemory"] = observation.MemoryEnd?.DeepClone(),
                ["startFixture"] = observation.IdleStart?.DeepClone(),
                ["endFixture"] = observation.IdleEnd?.DeepClone()
            }
        }
        return result
    }

    shared {
        func StartupTiming(present JsonObject?, started int64, diagnostics bool, errors List[string]) JsonObject {
            var windowSeconds double? = nil
            var launchSeconds double? = nil
            if present != nil {
                let frequency = Integer(present, "frequency")
                let ticks = Integer(present, "ticks")
                let origin = Integer(present, "originTicks")
                if frequency != nil && frequency > 0 && ticks != nil && origin != nil {
                    windowSeconds = (ticks - origin) / double(frequency)
                    if OperatingSystem.IsLinux() && frequency == 1000000000 && ticks >= started {
                        launchSeconds = (ticks - started) / 1000000000.0
                    }
                }
            } else if diagnostics {
                errors.Add("package instrumentation missing teardown-flushed first-successful-present event 508")
            }
            return JsonObject(){
                ["window"] = JsonValue.Create(windowSeconds),
                ["launch"] = JsonValue.Create(launchSeconds)
            }
        }

        func IdleTiming(start JsonObject?, end JsonObject?, errors List[string]) JsonObject {
            var actual double? = nil
            var cpu double? = nil
            var percent double? = nil
            if start != nil && end != nil {
                let frequency = Integer(start, "frequency")
                let endFrequency = Integer(end, "frequency")
                let startTicks = Integer(start, "ticks")
                let endTicks = Integer(end, "ticks")
                let startCpu = Integer(start, "processCpuTicks")
                let endCpu = Integer(end, "processCpuTicks")
                if frequency == endFrequency &&
                    frequency != nil &&
                    frequency > 0 &&
                    startTicks != nil &&
                    endTicks != nil {
                    actual = (endTicks - startTicks) / double(frequency)
                }
                if actual == nil || actual <= 0 {
                    errors.Add("diagnostics-off idle interval has no positive completed duration")
                } else if startCpu == nil || endCpu == nil || endCpu < startCpu {
                    errors.Add("diagnostics-off idle interval has a non-monotonic process CPU counter")
                } else {
                    cpu = (endCpu - startCpu) / 10000000.0
                    percent = cpu / actual * 100
                }
            }
            return JsonObject(){
                ["actual"] = JsonValue.Create(actual),
                ["cpu"] = JsonValue.Create(cpu),
                ["percent"] = JsonValue.Create(percent)
            }
        }

        async func Read(reader StreamReader, path string, channel string, events BlockingCollection[JsonObject]) {
            using let output = StreamWriter(path)
            output.AutoFlush = true
            while true {
                let line = await reader.ReadLineAsync()
                if line == nil {
                    return
                }
                output.WriteLine(line)
                try {
                    let value = JsonNode.Parse(line)
                    if value is JsonObject {
                        events.Add(
                            JsonObject(){["channel"] = channel, ["receivedMonotonicNs"] = Now(), ["value"] = value}
                        )
                    }
                } catch (error System.Text.Json.JsonException) { }
            }
        }

        func WaitEvent(
            process Process,
            events BlockingCollection[JsonObject],
            records List[JsonObject],
            name string,
            seconds double
        ) JsonObject? {
            let deadline = Now() + int64(seconds * 1000000000)
            while Now() < deadline {
                if events.TryTake(out let record, 50) {
                    records.Add(record)
                    let value = record["value"]!!.AsObject()
                    if Text(record, "channel") == "stdout" &&
                        Text(value, "kind") == "fixture" &&
                        Text(value, "event") == name {
                        return value
                    }
                } else if process.HasExited {
                    if events.TryTake(out let finalRecord, 100) {
                        records.Add(finalRecord)
                        let value = finalRecord["value"]!!.AsObject()
                        if Text(finalRecord, "channel") == "stdout" &&
                            Text(value, "kind") == "fixture" &&
                            Text(value, "event") == name {
                            return value
                        }
                    } else {
                        return nil
                    }
                }
            }
            return nil
        }

        func Memory(pid int32) JsonObject {
            let result = JsonObject(){["pssBytes"] = nil, ["privateResidentBytes"] = nil, ["rssBytes"] = nil}
            let path = "/proc/$pid/smaps_rollup"
            if !File.Exists(path) {
                return result
            }
            try {
                let values = Dictionary[string, int64]()
                for line in File.ReadLines(path) {
                    let fields = line.Split(default([]char?), StringSplitOptions.RemoveEmptyEntries)
                    if fields.Length >= 2 && int64.TryParse(fields[1], out let value) {
                        values[fields[0].TrimEnd(':')] = value * 1024
                    }
                }
                if values.ContainsKey("Pss") {
                    result["pssBytes"] = values["Pss"]
                }
                if values.ContainsKey("Rss") {
                    result["rssBytes"] = values["Rss"]
                }
                let privateNames = []string{"Private_Clean", "Private_Dirty", "Private_Hugetlb"}
                if privateNames.All(x -> values.ContainsKey(x)) {
                    result["privateResidentBytes"] = privateNames.Sum(x -> values[x])
                }
            } catch (error IOException) { } catch (error UnauthorizedAccessException) { }
            return result
        }

        func Text(value JsonObject, key string) string? {
            if value[key] is JsonValue && value[key]!!.AsValue().TryGetValue[string](out let text) {
                return text
            }
            return nil
        }

        func Integer(value JsonObject, key string) int64? {
            if value[key] is JsonValue && value[key]!!.AsValue().TryGetValue[int64](out let number) {
                return number
            }
            return nil
        }

        func Number(value JsonObject, key string) double? {
            if value[key] is JsonValue && value[key]!!.AsValue().TryGetValue[double](out let number) {
                return number
            }
            return nil
        }

        func Flag(value JsonObject, key string) bool -> value[key]!!.GetValue[bool]()
    }
}

class SampleObservation {
    public let Records List[JsonObject] = List[JsonObject]()
    public let Errors List[string] = List[string]()
    public var OpenReturn JsonObject? = nil
    public var FirstPump JsonObject? = nil
    public var IdleStart JsonObject? = nil
    public var IdleEnd JsonObject? = nil
    public var MemoryStart JsonObject? = nil
    public var MemoryEnd JsonObject? = nil
    public var Returncode int32? = nil
    public var Started int64 = 0
    public var Ended int64 = 0
}
