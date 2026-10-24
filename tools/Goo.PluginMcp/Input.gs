package Goo.PluginMcp

import System
import System.Collections.Generic
import System.Globalization
import System.Linq
import System.Text
import System.Text.Encodings.Web
import System.Text.Json
import System.Text.Json.Nodes

partial class GooServer {
    let GestureGate object = System.Object()
    let Gestures Dictionary[string, string] = Dictionary[string, string]()
    let InputLocks Dictionary[string, object] = Dictionary[string, object]()

    func Input(a JsonObject) JsonObject {
        let event_ = S(a, "event")
        if a["target"] != nil && a["node_id"] != nil {
            throw ArgumentException("Use target or node_id, not both")
        }
        if ![]string{"click", "pointer.move", "pointer.down", "pointer.up", "wheel"}.Contains(event_) &&
            (a["target"] != nil || a["node_id"] != nil) {
            throw ArgumentException("target and node_id apply only to pointer and wheel events")
        }
        let key = I(a, "pid").ToString() + "\0" + S(a, "window") + "\0" + S(a, "project")
        var gate object
        lock GestureGate {
            if !InputLocks.TryGetValue(key, out gate) {
                gate = System.Object()
                InputLocks[key] = gate
            }
        }
        lock gate {
            var gesture string? = nil
            lock GestureGate {
                Gestures.TryGetValue(key, out gesture)
                if gesture == nil && (event_ == "pointer.down" || event_ == "key.down") {
                    gesture = Guid.NewGuid().ToString("N")
                    Gestures[key] = gesture
                }
            }
            let arguments = List[string](){"input", event_, "--json", "--wait", "10"}
            arguments.AddRange(TargetArgs(a))
            if gesture != nil {
                arguments.Add("--gesture=" + gesture)
            }
            for name in[]string{
                "target",
                "node_id",
                "x",
                "y",
                "offset_x",
                "offset_y",
                "delta_x",
                "delta_y",
                "button",
                "key",
                "text"
            } {
                if a[name] != nil {
                    let option = if name == "node_id" {
                        "node"
                    } else {
                        name.Replace('_', '-')
                    }
                    let value = if a[name]!!.GetValueKind() == System.Text.Json.JsonValueKind.String {
                        a[name]!!.GetValue[string]()
                    } else {
                        a[name]!!.ToJsonString()
                    }
                    arguments.Add("--" + option + "=" + value)
                }
            }
            for name in[]string{"alt", "ctrl", "shift", "super"} {
                if B(a, name) {
                    arguments.Add("--" + name)
                }
            }
            var result JsonObject
            try {
                result = Response(Run(arguments, uncertain: true, phase: "input"), "input")
            } catch (error GooFailure) {
                if error.Message.Contains("gesture-owned") || error.Message.Contains("gesture-expired") {
                    lock GestureGate {
                        Gestures.Remove(key)
                    }
                }
                rethrow
            }
            let payload = result["payload"]?.AsObject() ?? JsonObject()
            if !B(payload, "applied") {
                throw ArgumentException("Input was not acknowledged as applied. Inspect state before another action.")
            }
            lock GestureGate {
                if B(payload, "gestureActive") && S(payload, "gestureId") != "" {
                    Gestures[key] = S(payload, "gestureId")
                } else {
                    Gestures.Remove(key)
                }
            }
            result["gestureLease"] = JsonObject(){
                ["supported"] = payload.ContainsKey("gestureActive"),
                ["leaseMs"] = payload["leaseMs"]?.DeepClone() ?? JsonValue.Create(0)
            }
            return result
        }
    }

    func Mutation(
        a JsonObject,
        command string,
        payload JsonObject,
        capabilities List[string],
        property string = ""
    ) JsonObject {
        let selected = TargetArgs(a)
        let status = CliPreflight()
        if !B(status, "compatible") {
            throw GooFailure(
                Failure(
                    "cli-incompatible",
                    status["issues"]!![0]!!.GetValue[string](),
                    "preflight",
                    action: status["actions"]!![0]!!.GetValue[string](),
                    context: JsonObject(){["cliVersion"] = status["version"]?.DeepClone()}
                )
            )
        }
        if !Has(status["features"], "attach.require-capabilities") {
            throw GooFailure(
                Failure(
                    "cli-incompatible",
                    "The configured Goo CLI cannot guard typed mutations before dispatch.",
                    "preflight",
                    action: Recovery,
                    context: JsonObject(){["cliVersion"] = status["version"]?.DeepClone()}
                )
            )
        }
        let body = RequestJson(payload)
        if body.Length > 65536 {
            throw ArgumentException("Request exceeds the endpoint request limit")
        }
        let arguments = List[string](){
            "attach",
            "--once",
            "--json",
            "--command",
            command,
            "--payload",
            body,
            "--require-capabilities",
            string.Join(",", capabilities),
            "--wait",
            "10"
        }
        if property != "" {
            arguments.Add("--require-override-property")
            arguments.Add(property)
        }
        arguments.AddRange(selected)
        return Response(Run(arguments, uncertain: true, phase: command), command)
    }

    func Inspect(a JsonObject) JsonObject {
        let action = S(a, "action")
        let selector = []string{"target", "node_id", "x", "y"}.Any(x -> a[x] != nil)
        if action != "select" {
            if selector {
                throw ArgumentException("Inspection selectors apply only to select")
            }
            return Mutation(a, "inspect." + action, JsonObject(), List[string](){"inspect." + action})
        }
        var payload JsonObject
        var required List[string]
        if a["target"] != nil || a["node_id"] != nil {
            if a["x"] != nil || a["y"] != nil {
                throw ArgumentException("Use target, node_id, or x/y, not a mixture")
            }
            let selected = MutationTarget(a)
            payload = selected.Item1
            required = selected.Item2
        } else {
            if a["x"] == nil || a["y"] == nil {
                throw ArgumentException("select requires target, node_id, or both x and y")
            }
            if !double.IsFinite(a["x"]!!.GetValue[double]()) || !double.IsFinite(a["y"]!!.GetValue[double]()) {
                throw ArgumentException("x and y must be finite")
            }
            payload = JsonObject(){["x"] = a["x"]?.DeepClone(), ["y"] = a["y"]?.DeepClone()}
            required = List[string]()
        }
        required.Insert(0, "inspect.select")
        return Mutation(a, "inspect.select", payload, required)
    }

    func Style(a JsonObject, reset bool) JsonObject {
        let property = S(a, "property")
        if reset && a["property"] != nil && string.IsNullOrWhiteSpace(property) {
            throw ArgumentException("property must not be empty")
        }
        if !reset && (string.IsNullOrWhiteSpace(property) || string.IsNullOrWhiteSpace(S(a, "value"))) {
            throw ArgumentException("property and value must not be empty")
        }
        let (payload, required) = MutationTarget(a)
        if !reset || a["property"] != nil {
            payload["property"] = property
        }
        if !reset {
            payload["value"] = S(a, "value")
        }
        required.Insert(0, "runtime-overrides.describe")
        required.Insert(0, "runtime-overrides")
        return Mutation(
            a,
            if reset {
                "property.reset"
            } else {
                "property.override"
            },
            payload,
            required,
            property
        )
    }

    shared {
        private let RequestJsonOptions JsonSerializerOptions = JsonSerializerOptions(){
            Encoder = JavaScriptEncoder.UnsafeRelaxedJsonEscaping
        }

        func RequestJson(payload JsonObject) string {
            let json = payload.ToJsonString(RequestJsonOptions)
            let result = StringBuilder(json.Length)
            for character in json {
                if character >= '\u007f' {
                    result.Append("\\u").Append(int32(character).ToString("x4", CultureInfo.InvariantCulture))
                } else {
                    result.Append(character)
                }
            }
            return result.ToString()
        }

        func MutationTarget(a JsonObject)(JsonObject, List[string]) {
            if (a["target"] == nil) == (a["node_id"] == nil) {
                throw ArgumentException("Provide exactly one of target or node_id")
            }
            if a["target"] != nil {
                let target = S(a, "target")
                if target.Length == 0 || target.Length > 128 {
                    throw ArgumentException("target must contain 1-128 characters")
                }
                return (JsonObject(){["target"] = target}, List[string](){"target.handles"})
            }
            if I(a, "node_id") <= 0 {
                throw ArgumentException("node_id must be positive")
            }
            return (JsonObject(){["nodeId"] = I(a, "node_id")}, List[string]())
        }
    }
}
