package Goo.PluginMcp

import System
import System.Collections.Generic
import System.Diagnostics
import System.Linq
import System.Text.Json.Nodes
import System.Threading

partial class GooServer {
    func Snapshot(a JsonObject) JsonObject {
        let offset = I(a, "offset")
        let limit = I(a, "limit")
        let after = I(a, "after_sequence")
        let wait = S(a, "wait")
        let timeout = I(a, "timeout_ms")
        if offset < 0 || limit < 1 || limit > 200 || after < 0 {
            throw ArgumentException("offset and after_sequence must be nonnegative; limit must be 1-200")
        }
        if wait != "" && (timeout < 1 || timeout > 10000) {
            throw ArgumentException("wait requires timeout_ms from 1 through 10000")
        }
        if wait == "" && timeout != 0 {
            throw ArgumentException("timeout_ms requires wait")
        }
        if wait == "" && after != 0 {
            throw ArgumentException("after_sequence requires wait")
        }
        let query = B(a, "compact") ||
            a["text"] != nil ||
            a["value"] != nil ||
            []string{"role", "name", "key", "state", "subtree", "fields", "wait"}.Any(x -> S(a, x) != "") ||
            offset != 0 ||
            after != 0 ||
            limit != 100 ||
            S(a, "match") != "contains"
        if !query {
            let (result, hello) = SnapshotResponse(a)
            result["runtime"] = RuntimeStatus(hello)
            return result
        }
        let clock = Stopwatch.StartNew()
        var session string? = nil
        var projected JsonObject? = nil
        while true {
            if wait != "" && session != nil && clock.Elapsed.TotalMilliseconds >= timeout {
                projected!!["outcome"] = "timeout"
                return projected!!
            }
            let remaining = if wait != "" {
                Math.Max(0.001, (timeout - clock.Elapsed.TotalMilliseconds) / 1000)
            } else {
                4.0
            }
            var result JsonObject
            var hello JsonObject
            try {
                let observed = SnapshotResponse(a, Math.Min(4, remaining))
                result = observed.Item1
                hello = observed.Item2
            } catch (GooTimeout) {
                if projected == nil {
                    rethrow
                }
                projected["outcome"] = "timeout"
                return projected
            }
            if !Has(hello["capabilities"], "target.handles") || !Has(hello["capabilities"], "tree.resolved-semantics") {
                throw ArgumentException(
                    "This runtime does not support compact resolved semantic snapshots. Update Goo."
                )
            }
            let current = result["payload"]?["targetIdentity"]?["sessionId"]?.GetValue[string]()
            if session == nil {
                session = current
            } else if session != current {
                throw ArgumentException("The selected Goo diagnostic session changed while waiting; reacquire targets.")
            }
            projected = Compact(result, a)
            projected["runtime"] = RuntimeStatus(hello)
            let gated = after == 0 || I(projected, "sequence") > after
            let satisfied = if wait == "missing" {
                I(projected, "matchedCount") == 0
            } else {
                I(projected, "matchedCount") > 0
            }
            if wait == "" {
                projected["outcome"] = if I(projected, "matchedCount") > 0 {
                    "matched"
                } else {
                    "not-matched"
                }
                return projected
            }
            if gated && satisfied {
                projected["outcome"] = "matched"
                return projected
            }
            if clock.Elapsed.TotalMilliseconds >= timeout {
                projected["outcome"] = "timeout"
                return projected
            }
            Thread.Sleep(int32(Math.Min(100, Math.Max(0, timeout - clock.Elapsed.TotalMilliseconds))))
        }
    }

    func Compact(result JsonObject, a JsonObject) JsonObject {
        let payload = result["payload"]!!
        let identity = payload["targetIdentity"]
        if identity is not JsonObject || S(identity, "sessionId") == "" {
            throw ArgumentException(
                "This runtime does not support session-scoped target handles and resolved semantic queries. Update Goo."
            )
        }
        var nodes = payload["added"]?.AsArray().Select(x -> x.AsObject()).ToArray() ?? []JsonObject{}
        let subtree = S(a, "subtree")
        if subtree != "" {
            let root = nodes.FirstOrDefault(
                x -> S(x, "target") == subtree || long.TryParse(subtree, out var id) && subtree.All(char.IsDigit) &&
                    I(x, "id") == id
            )
            if root == nil {
                throw ArgumentException("The subtree target does not exist in this diagnostic session")
            }
            let allowed = HashSet[int64](){I(root, "id")}
            var changed = true
            while changed {
                let before = allowed.Count
                for node in nodes {
                    if allowed.Contains(I(node, "parentId", -1)) {
                        allowed.Add(I(node, "id"))
                    }
                }
                changed = allowed.Count != before
            }
            nodes = nodes.Where(x -> allowed.Contains(I(x, "id"))).ToArray()
        }
        let selected = nodes.Where(x -> Matches(x, a)).ToArray()
        let fields = S(a, "fields")
        let names = (
            if fields == "" {
                DefaultCompactFields
            } else {
                fields
            }
        )
            .Split(',')
            .Select(x -> x.Trim())
            .Where(x -> x != "")
            .ToArray()
        let unknown = names.Except(CompactFields.Split(',')).Order(StringComparer.Ordinal).ToArray()
        if unknown.Length != 0 {
            throw ArgumentException("Unknown compact fields: " + string.Join(", ", unknown))
        }
        let offset = I(a, "offset")
        let limit = I(a, "limit")
        let page = selected.Skip(int32(offset)).Take(int32(limit)).ToArray()
        let output = JsonArray()
        for node in page {
            let values = node.DeepClone().AsObject()
            values["role"] = S(node, "accessibilityRole")
            values["name"] = S(node, "accessibilityName")
            values["value"] = Value(node)
            values["state"] = Strings(StateTokens(node))
            let item = JsonObject()
            for name in names {
                item[name] = values[name]?.DeepClone()
            }
            output.Add(item)
        }
        let predicate = JsonObject(){
            ["wait"] = S(a, "wait"),
            ["match"] = S(a, "match"),
            ["afterSequence"] = I(a, "after_sequence")
        }
        for name in[]string{"role", "name", "key", "text", "value", "state"} {
            if a[name] != nil && (S(a, name) != "" || name == "text" || name == "value") {
                predicate[name] = a[name]?.DeepClone()
            }
        }
        if subtree != "" {
            predicate["subtree"] = subtree
        }
        let truncated = offset + page.Length < selected.Length
        return JsonObject(){
            ["targetIdentity"] = identity.DeepClone(),
            ["sequence"] = payload["sequence"]?.DeepClone(),
            ["outcome"] = "not-matched",
            ["predicate"] = predicate,
            ["matchedCount"] = selected.Length,
            ["offset"] = offset,
            ["limit"] = limit,
            ["truncated"] = truncated,
            ["nextOffset"] = if truncated {
                JsonValue.Create(offset + page.Length)
            } else {
                nil
            },
            ["nodes"] = output
        }
    }

    shared {
        const DefaultCompactFields string = "target,id,role,name,key,text,textLength,textTruncated,value,state,actionable,actionStatus,actionPoint"
        const CompactFields string = "target,id,parentId,kind,role,name,key,text,textLength,textTruncated,value,state,visible,clipped,clipApproximate,actionable,actionStatus,actionPoint,accessibilityId,selectionStart,selectionLength,caret"

        func Value(node JsonObject) string -> if S(node, "accessibilityValue") != "" {
            S(node, "accessibilityValue")
        } else {
            S(node, "text")
        }

        func StateTokens(node JsonObject) List[string] {
            let result = List[string]()
            for name in[]string{"hovered", "pressed", "focused", "disabled", "visible", "clipped", "actionable"} {
                if B(node, name) {
                    result.Add(name)
                }
            }
            if B(node, "accessibilityHidden") {
                result.Add("hidden")
            }
            let status = S(node, "actionStatus")
            if status != "" && !result.Contains(status) {
                result.Add(status)
            }
            return result
        }

        func Matches(node JsonObject, a JsonObject) bool {
            let exact = S(a, "match") == "exact"
            for name in[]string{"role", "name", "key"} {
                let expected = CaseFold(S(a, name))
                if expected == "" {
                    continue
                }
                let actual = CaseFold(
                    S(
                        node,
                        switch name {
                            case "role": "accessibilityRole"
                            case "name": "accessibilityName"
                            default: "key"
                        }
                    )
                )
                if !(
                    if exact {
                        actual == expected
                    } else {
                        actual.Contains(expected, StringComparison.Ordinal)
                    }
                ) {
                    return false
                }
            }
            let state = CaseFold(S(a, "state"))
            if state != "" && !StateTokens(node).Any(x -> CaseFold(x) == state) {
                return false
            }
            for name in[]string{"text", "value"} {
                if a[name] == nil {
                    continue
                }
                let expected = CaseFold(S(a, name))
                let actual = CaseFold(
                    if name == "value" {
                        Value(node)
                    } else {
                        S(node, "text")
                    }
                )
                if exact && B(node, "textTruncated") {
                    throw ArgumentException(
                        "Cannot prove exact " +
                            name +
                            " equality from truncated text; narrow the subtree or inspect application state another way"
                    )
                }
                let matched = if exact {
                    actual == expected
                } else {
                    actual.Contains(expected, StringComparison.Ordinal)
                }
                if !matched && B(node, "textTruncated") {
                    throw ArgumentException(
                        "Cannot prove " +
                            name +
                            " absence from truncated text; narrow the subtree or inspect application state another way"
                    )
                }
                if !matched {
                    return false
                }
            }
            return true
        }
    }
}
