package Goo.PluginMcp

import ModelContextProtocol.Protocol
import System
import System.Collections.Generic
import System.ComponentModel
import System.Diagnostics
import System.Globalization
import System.IO
import System.Linq
import System.Reflection
import System.Text.Json
import System.Text.Json.Nodes

partial class GooServer {
    let PreflightGate object = System.Object()
    var CachedKey string = ""
    var CachedStatus JsonObject? = nil

    func Failure(
        code string,
        message string,
        phase string,
        uncertain bool = false,
        action string = "",
        context JsonObject? = nil
    ) JsonObject {
        let detail = JsonObject(){
            ["code"] = code,
            ["message"] = message,
            ["phase"] = phase,
            ["mayHaveApplied"] = uncertain,
            ["pluginVersion"] = Version,
            ["cliVersion"] = "unavailable",
            ["runtime"] = RuntimeStatus(JsonObject())
        }
        if action != "" {
            detail["action"] = action
        }
        if context != nil {
            for item in context {
                detail[item.Key] = item.Value?.DeepClone()
            }
        }
        return detail
    }

    func Cli()[]string {
        let executable = Environment.GetEnvironmentVariable("GOO_CLI") ?? Assembly.GetEntryAssembly()!!.Location
        if !File.Exists(executable) {
            throw GooFailure(
                Failure(
                    "cli-unavailable",
                    "Goo.DevTools is not installed or GOO_CLI does not name a file.",
                    "preflight",
                    action: "Install Goo.DevTools or set GOO_CLI to its executable or built CLI DLL."
                )
            )
        }
        return if executable.EndsWith(".dll", StringComparison.OrdinalIgnoreCase) {
            []string{"dotnet", executable}
        } else {
            []string{executable}
        }
    }

    func CliPreflight(timeout double = 5) JsonObject {
        lock PreflightGate {
            try {
                let command = Cli()
                let executable = FileInfo(command.Last())
                let key = string.Join("\0", command) +
                    executable
                    .LastWriteTimeUtc
                    .Ticks
                    .ToString() +
                    ":" +
                    executable
                    .Length
                    .ToString()
                if CachedStatus != nil && CachedKey == key {
                    return CachedStatus!!.DeepClone().AsObject()
                }
                let process = Execute(command.Concat([]string{"--version", "--json"}), timeout)
                var version JsonObject = JsonObject()
                try {
                    if process.Code == 0 {
                        version = JsonNode.Parse(process.Output)!!.AsObject()
                    }
                } catch (JsonException) { }
                let raw = version["features"]
                let features = if raw is JsonArray && raw.AsArray().All(
                    x -> x != nil && x.GetValueKind() == JsonValueKind.String
                ) {
                    raw.AsArray().Select(x -> x.GetValue[string]()).ToArray()
                } else {
                    []string{}
                }
                let available = process.Code == 0 && S(version, "version") != ""
                let compatible = available &&
                    []string{"list", "input", "dev.input", "errors.structured", "process-tree-cleanup"}.All(
                    x -> features.Contains(x)
                )
                let status = JsonObject(){
                    ["available"] = available,
                    ["compatible"] = compatible,
                    ["command"] = command.Last(),
                    ["version"] = S(version, "version", "unavailable"),
                    ["features"] = Strings(features.Order()),
                    ["issues"] = Strings(
                        if compatible {
                            []string{}
                        } else {
                            []string{"The configured Goo CLI is missing required agent features."}
                        }
                    ),
                    ["actions"] = Strings(
                        if compatible {
                            []string{}
                        } else {
                            []string{Recovery}
                        }
                    )
                }
                CachedKey = key
                CachedStatus = status.DeepClone().AsObject()
                return status
            } catch (error GooFailure) {
                return JsonObject(){
                    ["available"] = false,
                    ["version"] = "unavailable",
                    ["features"] = JsonObject(),
                    ["issues"] = Strings([]string{S(error.Detail, "message")}),
                    ["actions"] = Strings([]string{S(error.Detail, "action")})
                }
            } catch (error Exception) {
                return JsonObject(){
                    ["available"] = false,
                    ["version"] = "unavailable",
                    ["features"] = JsonObject(),
                    ["issues"] = Strings([]string{error.Message}),
                    ["actions"] = Strings(
                        []string{"Install Goo.DevTools or set GOO_CLI to a compatible executable or built CLI DLL."}
                    )
                }
            }
        }
    }

    func Run(arguments IEnumerable[string], timeout double = 25, uncertain bool = false, phase string = "cli") string {
        let clock = Stopwatch.StartNew()
        try {
            let status = CliPreflight(timeout)
            if !B(status, "compatible") {
                throw GooFailure(
                    Failure(
                        "cli-incompatible",
                        status["issues"]!![0]!!.GetValue[string](),
                        "preflight",
                        action: status["actions"]!![0]!!.GetValue[string]()
                    )
                )
            }
            let remaining = timeout - clock.Elapsed.TotalSeconds
            if remaining <= 0 {
                throw TimeoutException()
            }
            let result = Execute(Cli().Concat(arguments), remaining)
            if result.Code == 0 {
                return result.Output
            }
            let output = result.Error + result.Output
            for line in Lines(output).Reverse() {
                try {
                    let value = JsonNode.Parse(line)
                    if value is JsonObject && value["error"] is JsonObject {
                        let detail = value["error"]!!.AsObject()
                        let context = JsonObject()
                        for name in[]string{"cliVersion", "runtime"} {
                            if detail.ContainsKey(name) {
                                context[name] = detail[name]?.DeepClone()
                            }
                        }
                        throw GooFailure(
                            Failure(
                                S(detail, "code", "cli-failed"),
                                S(detail, "message", "Goo CLI failed."),
                                S(detail, "phase", phase),
                                B(detail, "mayHaveApplied"),
                                S(detail, "action"),
                                context
                            )
                        )
                    }
                } catch (JsonException) { }
            }
            throw GooFailure(
                Failure(
                    "cli-failed",
                    if output.Trim() == "" {
                        "Goo CLI failed."
                    } else {
                        output.Substring(Math.Max(0, output.Length - 6000)).Trim()
                    },
                    phase,
                    uncertain
                )
            )
        } catch (TimeoutException) {
            throw GooTimeout(
                Failure(
                    "cli-timeout",
                    "Goo CLI timed out." + if uncertain {
                        " The action may already have applied. Inspect state before another action and do not automatically retry it."
                    } else {
                        ""
                    },
                    phase,
                    uncertain
                )
            )
        }
    }

    func Targets(a JsonObject) JsonObject {
        let pid = I(a, "pid")
        if pid < 0 {
            throw ArgumentException("pid must be positive, or zero to list all live targets")
        }
        let arguments = List[string](){"list", "--json"}
        if pid != 0 {
            arguments.Add("--pid")
            arguments.Add(pid.ToString(CultureInfo.InvariantCulture))
        }
        if S(a, "project") != "" {
            arguments.Add("--project=" + S(a, "project"))
        }
        return JsonNode.Parse(Run(arguments, phase: "discovery"))!!.AsObject()
    }

    func SnapshotResponse(a JsonObject, timeout double = 4)(JsonObject, JsonObject) {
        let output = Run(
            []string{
                "attach",
                "--once",
                "--json",
                "--command",
                "snapshot",
                "--payload",
                "{\"full\":true}",
                "--wait",
                Math.Max(0.1, timeout - 0.1).ToString("F3", CultureInfo.InvariantCulture)
            }.Concat(TargetArgs(a)),
            timeout,
            phase: "snapshot"
        )
        let messages = Lines(output)
            .Where(x -> !string.IsNullOrWhiteSpace(x))
            .Select(x -> JsonNode.Parse(x)!!.AsObject())
            .ToArray()
        let hello = messages.FirstOrDefault(x -> S(x, "type") == "hello") ?? JsonObject()
        let result = Response(output, "snapshot", "snapshot-failed")
        if result["payload"] is not JsonObject || !B(result["payload"]!!, "full") {
            throw ArgumentException(
                "The runtime returned an incomplete tree. Update Goo to a version supporting full snapshot requests."
            )
        }
        return (result, hello)
    }

    func Response(output string, phase string, code string = "request-failed") JsonObject {
        let messages = Lines(output)
            .Where(x -> !string.IsNullOrWhiteSpace(x))
            .Select(x -> JsonNode.Parse(x)!!.AsObject())
            .ToArray()
        let hello = messages.FirstOrDefault(x -> S(x, "type") == "hello") ?? JsonObject()
        let result = messages.LastOrDefault(x -> x["id"] != nil && x["id"]!!.ToJsonString() != "0")
        if result == nil || !B(result, "ok") || result["error"] != nil || S(result, "type") == "error" {
            let detail = if result?["error"] is JsonObject {
                result!!["error"]!!.AsObject()
            } else {
                JsonObject()
            }
            let fallback = "Goo request failed: " + (result?.ToJsonString() ?? "None")
            throw GooFailure(
                Failure(
                    S(detail, "code", code),
                    S(detail, "message", fallback.Substring(0, Math.Min(3000, fallback.Length))),
                    S(detail, "phase", phase),
                    B(detail, "mayHaveApplied")
                )
            )
        }
        if !result.ContainsKey("runtime") {
            result["runtime"] = RuntimeStatus(hello)
        }
        return result
    }

    func Capabilities(a JsonObject) JsonObject {
        let (_, hello) = SnapshotResponse(a)
        let capabilities = hello["capabilities"]
        if !StringList(capabilities) {
            throw GooFailure(
                Failure(
                    "invalid-handshake",
                    "The runtime returned an invalid capability list.",
                    "handshake",
                    context: JsonObject(){["runtime"] = RuntimeStatus(hello)}
                )
            )
        }
        let discovery = Has(capabilities, "runtime-overrides") && Has(capabilities, "runtime-overrides.describe")
        let properties = hello["runtimeOverrideProperties"]
        if discovery && (!StringList(properties) || properties!!.AsArray().Any(x -> x.GetValue[string]() == "")) {
            throw GooFailure(
                Failure(
                    "invalid-handshake",
                    "The runtime advertised override discovery without a valid property list.",
                    "handshake",
                    context: JsonObject(){["runtime"] = RuntimeStatus(hello)}
                )
            )
        }
        return JsonObject(){
            ["runtime"] = RuntimeStatus(hello),
            ["runtimeOverrides"] = JsonObject(){
                ["available"] = discovery,
                ["properties"] = if discovery {
                    properties?.DeepClone()
                } else {
                    JsonArray()
                },
                ["reason"] = if discovery {
                    ""
                } else {
                    "The runtime does not advertise runtime-overrides and runtime-overrides.describe."
                }
            }
        }
    }

    func Capture(a JsonObject) CallToolResult {
        let directory = Directory.CreateTempSubdirectory("goo-capture-").FullName
        try {
            let path = Path.Combine(directory, "frame.png")
            Run([]string{"capture", "--output", path, "--wait", "10"}.Concat(TargetArgs(a)), phase: "capture")
            let data = File.ReadAllBytes(path)
            if data.Length < 8 || !data.Take(8).SequenceEqual([]byte{137, 80, 78, 71, 13, 10, 26, 10}) {
                throw ArgumentException("Goo CLI did not produce a PNG")
            }
            let content = List[ContentBlock]()
            content.Add(ImageContentBlock.FromBytes(ReadOnlyMemory[byte](data), "image/png"))
            return CallToolResult(){Content = content}
        } finally {
            Directory.Delete(directory, true)
        }
    }

    data class ProcessResult(Code int32, Output string, Error string) { }
    shared {
        const Recovery string = "Run `dotnet tool update --global Goo.DevTools --version 0.15.0`. Set GOO_CLI only when testing a compatible source build."

        func Execute(command IEnumerable[string], timeout double) ProcessResult {
            let parts = command.ToArray()
            let start = ProcessStartInfo(parts[0]){
                RedirectStandardOutput = true,
                RedirectStandardError = true,
                UseShellExecute = false
            }
            for part in parts.Skip(1) {
                start.ArgumentList.Add(part)
            }
            using let process = Process.Start(start)!!
            let output = process.StandardOutput.ReadToEndAsync()
            let error = process.StandardError.ReadToEndAsync()
            if !process.WaitForExit(int32(Math.Max(1, timeout * 1000))) {
                process.Kill(entireProcessTree: true)
                process.WaitForExit()
                throw TimeoutException()
            }
            return ProcessResult(process.ExitCode, output.GetAwaiter().GetResult(), error.GetAwaiter().GetResult())
        }

        func TargetArgs(a JsonObject) List[string] {
            if I(a, "pid") <= 0 {
                throw ArgumentException("Provide the positive PID of the intended running Goo application")
            }
            let result = List[string](){"--pid", I(a, "pid").ToString(CultureInfo.InvariantCulture)}
            if S(a, "window") != "" {
                result.Add("--window=" + S(a, "window"))
            }
            if S(a, "project") != "" {
                result.Add("--project=" + S(a, "project"))
            }
            return result
        }

        func StringList(value JsonNode?) bool -> value is JsonArray && value.AsArray().All(
            x -> x != nil && x.GetValueKind() == JsonValueKind.String
        )

        func Has(value JsonNode?, item string) bool -> value is JsonArray && value.AsArray().Any(
            x -> x?.GetValue[string]() == item
        )

        func RuntimeStatus(hello JsonObject) JsonObject {
            let valid = StringList(hello["capabilities"])
            let identity = JsonObject()
            for name in[]string{"pid", "windowId", "sessionId"} {
                if hello[name] != nil {
                    identity[name] = hello[name]?.DeepClone()
                }
            }
            return JsonObject(){
                ["runtimeVersion"] = hello["runtimeVersion"]?.DeepClone() ?? JsonValue.Create("unavailable"),
                ["protocol"] = hello["protocol"]?.DeepClone() ?? JsonValue.Create("unavailable"),
                ["protocolVersion"] = hello["version"]?.DeepClone() ?? JsonValue.Create("unavailable"),
                ["capabilities"] = if valid {
                    hello["capabilities"]?.DeepClone()
                } else {
                    JsonArray()
                },
                ["identity"] = identity,
                ["inputPermission"] = if !valid {
                    "unavailable"
                } else if Has(hello["capabilities"], "input") {
                    "enabled"
                } else {
                    "disabled"
                },
                ["inspectMode"] = hello["inspectMode"]?.DeepClone() ?? JsonValue.Create("unavailable")
            }
        }
    }
}
