import System
import System.Collections.Generic
import System.IO
import System.Linq
import System.Text
import System.Text.Json.Nodes

internal shared partial class ReleaseCheck {
    private class MachoMetadata {
        internal let Dependencies HashSet[string] = HashSet[string](StringComparer.Ordinal)
        internal var InstallName string? = nil
        internal var Minimum uint32? = nil
    }

    private func UInt32(bytes[]byte, offset int32) uint32 {
        Require(offset >= 0 && offset <= bytes.Length - 4, "native payload has truncated metadata")
        return System.Buffers.Binary.BinaryPrimitives.ReadUInt32LittleEndian(bytes.AsSpan(offset, 4))
    }

    private func MachoString(bytes[]byte, command int32, size int32, offset int32) string {
        Require(offset >= 8 && offset < size, "Mach-O load command has an invalid string offset")
        let start = command + offset
        let end = Array.IndexOf[byte](bytes, 0, start, size - offset)
        Require(end >= 0, "Mach-O load command has an unterminated string")
        return UTF8Encoding(false, true).GetString(bytes, start, end - start)
    }

    private func ParseMacho(bytes[]byte) MachoMetadata {
        Require(bytes.Length >= 32, "native payload has a truncated Mach-O header")
        Require(
            UInt32(bytes, 0) == uint32(0xFEEDFACF) && UInt32(bytes, 4) == uint32(0x0100000C) && UInt32(bytes, 12) == 6,
            "native payload is not a thin arm64 Mach-O dylib"
        )
        let count = UInt32(bytes, 16)
        let commandBytes = UInt32(bytes, 20)
        Require(commandBytes <= uint32(bytes.Length - 32), "native payload has a truncated Mach-O load-command table")
        let end = 32 + int32(commandBytes)
        var position = 32
        let result = MachoMetadata()
        var index uint32 = 0
        while index < count {
            Require(position <= end - 8, "native payload has a truncated Mach-O load command")
            let command = UInt32(bytes, position) & 0x7FFFFFFF
            let commandSize = UInt32(bytes, position + 4)
            Require(
                commandSize >= 8 && commandSize <= uint32(end - position),
                "native payload has an invalid Mach-O load command"
            )
            let size = int32(commandSize)
            if command == 0x0C ||
                command == 0x0D ||
                command == 0x18 ||
                command == 0x1F ||
                command == 0x20 ||
                command == 0x23 {
                Require(size >= 24, "native payload has a truncated Mach-O dylib command")
                let name = MachoString(bytes, position, size, int32(UInt32(bytes, position + 8)))
                if command == 0x0D {
                    Require(result.InstallName == nil, "native payload has multiple Mach-O install names")
                    result.InstallName = name
                } else {
                    result.Dependencies.Add(name)
                }
            } else if command == 0x32 || command == 0x24 {
                Require(
                    size >= (
                        if command == 0x32 {
                            24
                        } else {
                            16
                        }
                    ),
                    "native payload has a truncated minimum macOS command"
                )
                if command == 0x32 {
                    Require(UInt32(bytes, position + 8) == 1, "native payload does not target macOS")
                }
                let value = UInt32(
                    bytes,
                    position +
                        (
                        if command == 0x32 {
                            12
                        } else {
                            8
                        }
                    )
                )
                Require(
                    result.Minimum == nil || result.Minimum == value,
                    "native payload has conflicting minimum macOS metadata"
                )
                result.Minimum = value
            }
            position += size
            index += 1
        }
        Require(position == end, "native payload has inconsistent Mach-O load commands")
        Require(
            result.InstallName != nil && result.Minimum != nil,
            "native payload lacks Mach-O identity or minimum macOS metadata"
        )
        return result
    }

    private func ValidateMacos(payloads Dictionary[string, []byte]) {
        let metadata = Dictionary[string, MachoMetadata](StringComparer.Ordinal)
        for item in payloads {
            if item.Key.EndsWith(".dylib") {
                metadata.Add(item.Key, ParseMacho(item.Value))
            }
        }
        let names = []string{"libMoltenVK.dylib", "libSDL3.dylib", "libgoo-harfbuzz-gpu.dylib", "libgoo-harfbuzz.dylib"}
        Require(HashSet[string](metadata.Keys).SetEquals(names), "macOS native payload set is incomplete")
        for name in names {
            let details = metadata[name]
            Require(details.InstallName == "@rpath/" + name, "packaged $name has an unexpected Mach-O install name")
            Require(details.Minimum!!.CompareTo(uint32(0x000E0000)) <= 0, "packaged $name requires macOS above 14.0")
            for dependency in details.Dependencies {
                Require(
                    dependency.StartsWith("/System/Library/") || dependency.StartsWith("/usr/lib/") ||
                        dependency.StartsWith("@rpath/"),
                    "packaged $name has an unexpected dependency: $dependency"
                )
                Require(
                    !dependency.StartsWith("@rpath/") ||
                        (name == "libgoo-harfbuzz-gpu.dylib" && dependency == "@rpath/libgoo-harfbuzz.dylib"),
                    "packaged $name has an unexpected private dependency: $dependency"
                )
            }
        }
        ValidateMacosProvenance(payloads, metadata)
    }

    private func ValidateMacosProvenance(
        payloads Dictionary[string, []byte],
        metadata Dictionary[string, MachoMetadata]
    ) {
        let recorded = JsonNode.Parse(payloads["text-native-build.json"])!!
        let manifest = JsonNode.Parse(File.ReadAllText(Path.Combine(Root, "tools/Goo.TextNative/manifest.json")))!!
        let fields = []string{"schema", "name", "source", "requiredExports"}
        for field in fields {
            Require(
                JsonNode.DeepEquals(recorded[field], manifest[field]),
                "packaged macOS text-native provenance is stale: " + field
            )
        }
        Require(
            JsonNode.DeepEquals(recorded["outputs"]?["osx-arm64"], manifest["outputs"]!!["osx-arm64"]),
            "packaged macOS text-native output names are stale"
        )
        let build = recorded["build"] as JsonObject ?? JsonObject()
        let evidence = recorded["buildEvidence"] as JsonObject ?? JsonObject()
        let policy = manifest["build"]!!
        let environment = policy["environments"]!!["osx-arm64"]
        for field in policy.AsObject() {
            if field.Key == "linux" || field.Key == "windows" || field.Key == "android" || field.Key == "environments" {
                continue
            }
            Require(
                JsonNode.DeepEquals(build[field.Key], field.Value),
                "packaged macOS text-native provenance is stale: build." + field.Key
            )
            let value = if evidence.ContainsKey(field.Key) {
                evidence[field.Key]
            } else {
                build[field.Key]
            }
            Require(
                JsonNode.DeepEquals(value, field.Value),
                "packaged macOS text-native build policy is stale: " + field.Key
            )
        }
        Require(
            JsonNode.DeepEquals(build["environments"]?["osx-arm64"], environment),
            "packaged macOS text-native provenance environment is stale"
        )
        Require(
            evidence["target"]?.GetValue[string]() == "osx-arm64" &&
                evidence["sourceDirectory"]?.GetValue[string]() == "temporary",
            "packaged macOS text-native build evidence is invalid"
        )
        Require(
            JsonNode.DeepEquals(evidence["environment"], environment),
            "packaged macOS text-native build environment is stale"
        )
        Require(
            evidence["deploymentTarget"]?.GetValue[string]() == "14.0",
            "packaged macOS text-native deployment target is stale"
        )
        for output in manifest["outputs"]!!["osx-arm64"]!!.AsObject() {
            let role = output.Key
            let name = output.Value.GetValue[string]()
            let artifact = recorded["artifacts"]?[role] as JsonObject ?? JsonObject()
            let bytes = payloads[name]
            let details = metadata[name]
            let needed = details.Dependencies.OrderBy(n -> n, StringComparer.Ordinal).ToArray()
            let expected = policy["macos"]!!["requiredNeeded"]!![role]!!
                .AsArray()
                .Select(n -> n.GetValue[string]())
                .OrderBy(n -> n, StringComparer.Ordinal)
                .ToArray()
            let exports = HashSet[string](
                (artifact["exports"] as JsonArray ?? JsonArray()).Select(n -> n.GetValue[string]()),
                StringComparer.Ordinal
            )
            let required = manifest["requiredExports"]!![role]!!.AsArray().Select(n -> n.GetValue[string]())
            let architectures = artifact["architectures"] as JsonArray
            let recordedNeeded = artifact["needed"] as JsonArray
            Require(
                artifact["file"]?.GetValue[string]() == name && artifact["bytes"]?.GetValue[int64]() == bytes.Length &&
                    artifact["sha256"]?.GetValue[string]() == Hash(bytes) &&
                    architectures != nil &&
                    architectures.Count == 1 &&
                    architectures[0]?.GetValue[string]() == "arm64" &&
                    artifact["installName"]?.GetValue[string]() == details.InstallName && needed.SequenceEqual(
                    expected
                ) &&
                    recordedNeeded != nil &&
                    recordedNeeded
                    .Select(n -> n.GetValue[string]()).SequenceEqual(needed) && exports.IsSupersetOf(required),
                "packaged macOS text-native artifact provenance is invalid: " + name
            )
        }
    }
}
