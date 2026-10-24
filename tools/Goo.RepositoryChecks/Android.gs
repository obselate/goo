import System
import System.Collections.Generic
import System.Globalization
import System.IO
import System.IO.Compression
import System.Linq
import System.Security.Cryptography
import System.Text.Json.Nodes
import System.Text.RegularExpressions

internal shared partial class Checks {
    private func Android(arguments[]string) {
        Require(arguments.Length > 0, "Expected Android package and optional --abi values")
        let packagePath = arguments[0]
        let abis = List[string]()
        var index = 1
        while index < arguments.Length {
            Require(
                arguments[index] == "--abi" && index + 1 < arguments.Length,
                "Expected --abi arm64-v8a or --abi x86_64"
            )
            let abi = arguments[index + 1]
            Require(abi == "arm64-v8a" || abi == "x86_64", "Unknown Android ABI: " + abi)
            abis.Add(abi)
            index += 2
        }
        if abis.Count == 0 {
            abis.Add("arm64-v8a")
            abis.Add("x86_64")
        }
        let manifest = JsonNode.Parse(File.ReadAllText(Path.Combine(Root, "tools/Goo.TextNative/manifest.json")))!!
        let policy = manifest["build"]!!["android"]!!
        using let archive = ZipFile.OpenRead(packagePath)
        let names = archive.Entries.Select(e -> e.FullName).ToArray()
        let prefix = if Path.GetExtension(packagePath) == ".aab" {
            "base"
        } else {
            ""
        }
        let forbidden = names.Where(
            n -> Regex.IsMatch(n, "lib(?:SDL|Skia|goo-freetype|goo-text-native)", RegexOptions.IgnoreCase)
        )
            .ToArray()
        Require(forbidden.Length == 0, "Unexpected legacy or desktop native payloads: " + string.Join(", ", forbidden))
        let directory = Path.Combine(Path.GetTempPath(), Guid.NewGuid().ToString())
        Directory.CreateDirectory(directory)
        try {
            for abi in abis {
                let rid = if abi == "arm64-v8a" {
                    "android-arm64"
                } else {
                    "android-x64"
                }
                let provenance = JsonNode.Parse(
                    File.ReadAllText(Path.Combine(Root, "Goo/Runtime/Vulkan", rid, "text-native-build.json"))
                )!!
                for item in manifest["outputs"]!![rid]!!.AsObject() {
                    let name = item.Key
                    let filename = item.Value.GetValue[string]()
                    let member = "$prefix/lib/$abi/$filename".TrimStart('/')
                    Require(names.Count(n -> n == member) == 1, "Expected one native payload: " + member)
                    let bytes = ReadEntry(archive, member)
                    Require(
                        Convert.ToHexStringLower(SHA256.HashData(bytes)) == provenance["artifacts"]!![name]!![
                            "sha256"
                        ]!!.GetValue[string](),
                        "Packaged native payload differs from build provenance: " + member
                    )
                    let binary = Path.Combine(directory, filename)
                    File.WriteAllBytes(binary, bytes)
                    let dynamic = Run("readelf", []string{"--dynamic", binary})
                    let needed = Regex
                        .Matches(dynamic, `Shared library: \[([^]]+)\]`)
                        .Select(m -> m.Groups[1].Value)
                        .OrderBy(n -> n, StringComparer.Ordinal)
                        .ToArray()
                    let required = policy["requiredNeeded"]!![name]!!
                        .AsArray()
                        .Select(n -> n.GetValue[string]())
                        .OrderBy(n -> n, StringComparer.Ordinal)
                        .ToArray()
                    Require(
                        needed.SequenceEqual(required),
                        "Android dependency mismatch: " + member + ": " + string.Join(", ", needed)
                    )
                    let headers = Run("readelf", []string{"--program-headers", "--wide", binary})
                    let alignments = headers
                        .Split('\n')
                        .Where(line -> line.TrimStart().StartsWith("LOAD "))
                        .Select(
                        line -> int64.Parse(
                            Regex.Split(line.Trim(), `\s+`).Last().Replace("0x", ""),
                            NumberStyles.HexNumber
                        )
                    )
                        .ToArray()
                    Require(
                        alignments.Length > 0 && alignments.Min() >= policy["minimumPageAlignment"]!!.GetValue[int64](),
                        "Android 16 KB page alignment missing: " + member
                    )
                    Console.WriteLine("Verified " + member)
                }
            }
        } finally {
            Directory.Delete(directory, true)
        }
        Console.WriteLine("Android package OK: " + packagePath)
    }
}
