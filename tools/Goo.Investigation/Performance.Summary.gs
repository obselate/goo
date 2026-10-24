import System
import System.Collections.Generic
import System.IO
import System.Linq
import System.Text.Json
import System.Text.Json.Nodes

partial class Performance {
    func Measure(sizes JsonObject) {
        let warmCache = Path.Combine(output, "caches/warm")
        let prime = List[JsonObject]()
        for mode in modes {
            prime.Add(
                Sample("prime-" + mode, mode, warmCache, false, Seconds("readiness-delay"), Seconds("startup-hold"))
            )
        }
        let warm = List[JsonObject]()
        for index in Enumerable.Range(0, int32.Parse(options.GetValueOrDefault("--warm-runs", "5"))) {
            for mode in if index % 2 == 0 {
                modes
            } else {
                modes.Reverse().ToArray()
            } {
                warm.Add(
                    Sample(
                        "warm-${index + 1:00}-$mode",
                        mode,
                        warmCache,
                        true,
                        Seconds("readiness-delay"),
                        Seconds("startup-hold")
                    )
                )
            }
        }
        let cold = List[JsonObject]()
        for mode in modes {
            cold.Add(
                Sample(
                    "empty-cache-" + mode,
                    mode,
                    Path.Combine(output, "caches/empty-" + mode),
                    true,
                    Seconds("readiness-delay"),
                    Seconds("startup-hold")
                )
            )
        }
        let idle = List[JsonObject]()
        for index in Enumerable.Range(0, int32.Parse(options.GetValueOrDefault("--idle-runs", "5"))) {
            for mode in if index % 2 == 0 {
                modes
            } else {
                modes.Reverse().ToArray()
            } {
                idle.Add(
                    Sample(
                        "idle-${index + 1:00}-$mode",
                        mode,
                        warmCache,
                        false,
                        Seconds("idle-settle"),
                        Seconds("idle")
                    )
                )
            }
        }
        WriteSummary(sizes, prime, warm, cold, idle)
    }

    func WriteSummary(
        sizes JsonObject,
        prime List[JsonObject],
        warm List[JsonObject],
        cold List[JsonObject],
        idle List[JsonObject]
    ) {
        let collections = Dictionary[string, List[JsonObject]]()
        collections["warm"] = warm
        collections["emptyGooCache"] = cold
        collections["idleDiagnosticsOff"] = idle
        let comparison = Comparison(collections)
        for sample in warm.Concat(cold).Concat(idle) {
            sample["comparisonEligible"] = Flag(comparison, "valid") &&
                (Flag(sample, "startupValid") || Flag(sample, "idleValid"))
            sample["startupComparisonValid"] = Flag(sample, "startupValid") && Flag(comparison, "valid")
            sample["idleComparisonValid"] = Flag(sample, "idleValid") && Flag(comparison, "valid")
        }
        if !Flag(comparison, "valid") {
            failures.Add(JsonObject(){["sample"] = "comparison", ["errors"] = comparison["errors"]!!.DeepClone()})
        }
        let summary = JsonObject(){
            ["sizes"] = sizes.DeepClone(),
            ["comparison"] = comparison,
            ["warm"] = JsonObject(),
            ["emptyGooCache"] = JsonObject(),
            ["idleDiagnosticsOff"] = JsonObject()
        }
        for mode in modes {
            let modeWarm = warm.Where(x -> Text(x, "mode") == mode).ToList()
            let modeIdle = idle.Where(x -> Text(x, "mode") == mode).ToList()
            let warmSummary = JsonObject()
            for name in[]string{"windowOpenToFirstPresentSeconds", "linuxPopenBoundaryToFirstPresentSeconds"} {
                warmSummary[name] = Metric(modeWarm, "startupComparisonValid", x -> Number(x, name))
            }
            let presentMetrics = Dictionary[string, string]()
            presentMetrics["firstPresentManagedHeapBytes"] = "managedAllocatedBytes"
            presentMetrics["firstPresentPrivateBytes"] = "privateBytes"
            presentMetrics["firstPresentWorkingSetBytes"] = "workingSetBytes"
            presentMetrics["firstPresentVulkanTrackedBytes"] = "vulkanDeviceMemoryBytes"
            presentMetrics["firstPresentVulkanObjectCount"] = "vulkanObjectCount"
            for metric in presentMetrics {
                warmSummary[metric.Key] = Metric(
                    modeWarm,
                    "startupComparisonValid",
                    x -> NestedNumber(x, "firstPresent", metric.Value)
                )
            }
            summary["warm"]!![mode] = warmSummary
            let idleSummary = JsonObject()
            for name in[]string{"actualSeconds", "processCpuSeconds", "cpuPercentOneCore"} {
                idleSummary[name] = Metric(modeIdle, "idleComparisonValid", x -> NestedNumber(x, "idle", name))
            }
            for name in[]string{"pssBytes", "privateResidentBytes"} {
                idleSummary[name] = Metric(
                    modeIdle,
                    "idleComparisonValid",
                    x -> NestedNumber(x["idle"]!!.AsObject(), "startMemory", name)
                )
            }
            idleSummary["gcHeapBytes"] = Metric(
                modeIdle,
                "idleComparisonValid",
                x -> NestedNumber(x["idle"]!!.AsObject(), "startFixture", "gcHeapBytes")
            )
            idleSummary["lastGcCommittedBytes"] = Metric(
                modeIdle,
                "idleComparisonValid",
                x -> NestedNumber(x["idle"]!!.AsObject(), "startFixture", "gcCommittedBytes")
            )
            summary["idleDiagnosticsOff"]!![mode] = idleSummary
        }
        for sample in cold {
            let eligible = Flag(sample, "startupComparisonValid")
            let errors = sample["errors"]!!.DeepClone().AsArray()
            if !Flag(comparison, "valid") {
                for error in comparison["errors"]!!.AsArray() {
                    errors.Add(error?.DeepClone())
                }
            }
            summary["emptyGooCache"]!![Text(sample, "mode")!!] = JsonObject(){
                ["startupValid"] = eligible,
                ["rawStartupValid"] = Flag(sample, "startupValid"),
                ["comparisonEligible"] = Flag(sample, "comparisonEligible"),
                ["instrumentation"] = sample["instrumentation"]!!.DeepClone(),
                ["windowOpenToFirstPresentSeconds"] = if eligible {
                    sample["windowOpenToFirstPresentSeconds"]?.DeepClone()
                } else {
                    nil
                },
                ["linuxPopenBoundaryToFirstPresentSeconds"] = if eligible {
                    sample["linuxPopenBoundaryToFirstPresentSeconds"]?.DeepClone()
                } else {
                    nil
                },
                ["errors"] = errors
            }
        }
        summary["primeFailures"] = JsonSerializer.SerializeToNode(
            prime.Where(x -> !Flag(x, "workloadValid")).Select(x -> Text(x, "name")).ToArray()
        )
        summary["failures"] = failures.DeepClone()
        Runner.Save(Path.Combine(output, "samples.json"), samples)
        Runner.Save(Path.Combine(output, "summary.json"), summary)
        Runner.Require(failures.Count == 0, "benchmark completed with ${failures.Count} failed samples")
    }

    shared {
        func NestedNumber(value JsonObject, parent string, key string) double? {
            if value[parent] is JsonObject {
                return Number(value[parent]!!.AsObject(), key)
            }
            return nil
        }

        func Metric(samples List[JsonObject], validity string, selector Func[JsonObject, double?]) JsonObject {
            let observed = samples.Select(selector).ToArray()
            let values = samples
                .Where(x -> Flag(x, validity))
                .Select(selector)
                .Where(x -> x != nil)
                .Select(x -> x.Value)
                .Order()
                .ToArray()
            return JsonObject(){
                ["observedCount"] = observed.Count(x -> x != nil),
                ["validSampleCount"] = samples.Count(x -> Flag(x, validity)),
                ["invalidSamples"] = JsonSerializer.SerializeToNode(
                    samples.Where(x -> !Flag(x, validity)).Select(x -> Text(x, "name")).ToArray()
                ),
                ["distribution"] = if values.Length == 0 {
                    nil
                } else {
                    JsonObject(){
                        ["count"] = values.Length,
                        ["median"] = if values.Length % 2 == 1 {
                            values[values.Length / 2]
                        } else {
                            (values[values.Length / 2 - 1] + values[values.Length / 2]) / 2
                        },
                        ["min"] = values[0],
                        ["max"] = values[values.Length - 1]
                    }
                }
            }
        }

        func Geometry(metrics List[JsonObject]) JsonObject {
            let names = []string{
                "logicalWidth",
                "logicalHeight",
                "framebufferWidth",
                "framebufferHeight",
                "displayScaleX",
                "displayScaleY"
            }
            let tuples = JsonArray()
            var invalid = 0
            for metric in metrics {
                let values = JsonArray()
                for name in names {
                    values.Add(metric[name]?.DeepClone())
                }
                if !tuples.Any(x -> JsonNode.DeepEquals(x, values)) {
                    tuples.Add(values)
                }
                if Integer(metric, "logicalWidth") != 640 ||
                    Integer(metric, "logicalHeight") != 480 ||
                    Integer(metric, "framebufferWidth") == nil ||
                    Integer(metric, "framebufferWidth") <= 0 ||
                    Integer(metric, "framebufferHeight") == nil ||
                    Integer(metric, "framebufferHeight") <= 0 ||
                    Number(metric, "displayScaleX") == nil ||
                    Number(metric, "displayScaleX") <= 0 ||
                    Number(metric, "displayScaleY") == nil ||
                    Number(metric, "displayScaleY") <= 0 {
                    invalid++
                }
            }
            let stable = metrics.Count > 0 && invalid == 0 && tuples.Count == 1
            let errors = JsonArray()
            if metrics.Count == 0 || invalid > 0 {
                errors.Add("missing or invalid 640x480 framebuffer and display-scale metrics: " + tuples.ToJsonString())
            } else if tuples.Count != 1 {
                errors.Add("display geometry changed during the sample: " + tuples.ToJsonString())
            }
            var physical JsonObject? = nil
            if stable {
                physical = JsonObject()
                for index in 2 ... 6 {
                    physical[names[index]] = tuples[0]!![index]?.DeepClone()
                }
            }
            return JsonObject(){
                ["valid"] = stable,
                ["emittedCount"] = metrics.Count,
                ["invalidTupleCount"] = invalid,
                ["observedTuples"] = tuples,
                ["physical"] = physical,
                ["errors"] = errors
            }
        }

        func Comparison(collections Dictionary[string, List[JsonObject]]) JsonObject {
            let invalid = JsonArray()
            let admitted = JsonArray()
            let rejected = JsonArray()
            let physical = JsonArray()
            let observed = JsonArray()
            let counts = JsonObject()
            for collection in collections {
                for sample in collection.Value {
                    let geometry = sample["geometry"]!!.AsObject()
                    if !Flag(geometry, "valid") {
                        invalid.Add(Text(sample, "name"))
                    }
                    for value in geometry["observedTuples"]!!.AsArray() {
                        if !observed.Any(x -> JsonNode.DeepEquals(x, value)) {
                            observed.Add(value?.DeepClone())
                        }
                    }
                    let validity = if collection.Key == "idleDiagnosticsOff" {
                        "idleValid"
                    } else {
                        "startupValid"
                    }
                    let isAdmitted = Flag(sample, validity)
                    if isAdmitted {
                        admitted.Add(Text(sample, "name"))
                        let value = geometry["physical"]
                        if !physical.Any(x -> JsonNode.DeepEquals(x, value)) {
                            physical.Add(value?.DeepClone())
                        }
                    } else {
                        rejected.Add(Text(sample, "name"))
                    }
                    let key = collection.Key + "/" + Text(sample, "mode")
                    if counts[key] == nil {
                        counts[key] = JsonObject(){
                            ["observed"] = 0,
                            ["admitted"] = 0,
                            ["rejected"] = 0,
                            ["geometryValid"] = 0,
                            ["geometryInvalid"] = 0
                        }
                    }
                    let entry = counts[key]!!.AsObject()
                    for field in[]string{
                        "observed",
                        if isAdmitted {
                            "admitted"
                        } else {
                            "rejected"
                        },
                        if Flag(geometry, "valid") {
                            "geometryValid"
                        } else {
                            "geometryInvalid"
                        }
                    } {
                        entry[field] = entry[field]!!.GetValue[int32]() + 1
                    }
                }
            }
            let errors = JsonArray()
            if admitted.Count == 0 {
                errors.Add("comparison has no admitted warm, empty-cache, or idle samples")
            } else if physical.Count != 1 {
                errors.Add(
                    "comparison requires one physical framebuffer/display-scale workload across admitted samples; observed " +
                        physical.ToJsonString()
                )
            }
            return JsonObject(){
                ["valid"] = errors.Count == 0,
                ["errors"] = errors,
                ["observedGeometryTuples"] = observed,
                ["physicalWorkloads"] = physical,
                ["admittedSamples"] = admitted,
                ["rejectedSamples"] = rejected,
                ["invalidGeometrySamples"] = invalid,
                ["counts"] = counts
            }
        }
    }
}
