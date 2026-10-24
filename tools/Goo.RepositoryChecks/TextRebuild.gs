import System
import System.Collections.Generic
import System.IO
import System.Linq
import System.Text.Json.Nodes

internal shared partial class Checks {
    private func TextRebuild(arguments[]string) {
        Require(arguments.Length == 2, "Expected recorded and rebuilt provenance files")
        let recorded = TargetSnapshot(
            JsonNode.Parse(File.ReadAllText(arguments[0])) ?? throw InvalidDataException("Missing recorded provenance")
        )
        let rebuilt = TargetSnapshot(
            JsonNode.Parse(File.ReadAllText(arguments[1])) ?? throw InvalidDataException("Missing rebuilt provenance")
        )
        let changed = recorded
            .AsObject()
            .Select(p -> p.Key)
            .Union(rebuilt.AsObject().Select(p -> p.Key))
            .Where(key -> !JsonNode.DeepEquals(recorded[key], rebuilt[key]))
            .OrderBy(key -> key)
            .ToArray()
        Require(
            JsonNode.DeepEquals(recorded, rebuilt),
            "Native rebuild provenance differs in target-relevant fields: " + string.Join(", ", changed)
        )
        Console.WriteLine("Native rebuild provenance OK: " + recorded["buildEvidence"]!!["target"]!!.GetValue[string]())
    }

    private func TargetSnapshot(value JsonNode) JsonNode {
        let target = value["buildEvidence"]!!["target"]!!.GetValue[string]()
        let platform = switch target.Split('-')[0] {
            case "linux": "linux"
            case "win": "windows"
            case "osx": "macos"
            case "android": "android"
            default: throw InvalidDataException("Unknown native target: " + target)
        }
        let snapshot = value.DeepClone()
        let outputs = JsonObject()
        outputs[target] = value["outputs"]!![target]!!.DeepClone()
        snapshot["outputs"] = outputs
        let sections = []string{"build", "buildEvidence"}
        let platforms = []string{"linux", "windows", "macos", "android"}
        for section in sections {
            let node = snapshot[section]!!.AsObject()
            for name in platforms {
                if name != platform {
                    node.Remove(name)
                }
            }
            if node.ContainsKey("environments") {
                let environments = JsonObject()
                environments[target] = node["environments"]!![target]!!.DeepClone()
                node["environments"] = environments
            }
        }
        let policy = snapshot["build"]!!.AsObject()
        let evidence = snapshot["buildEvidence"]!!.AsObject()
        for key in evidence.Select(p -> p.Key).ToArray() {
            if policy.ContainsKey(key) && JsonNode.DeepEquals(evidence[key], policy[key]) {
                evidence.Remove(key)
            }
        }
        return snapshot
    }
}
