import System
import System.Collections.Generic
import System.IO
import System.IO.Compression
import System.Linq
import System.Security.Cryptography
import System.Text.Json.Nodes
import System.Text.RegularExpressions

internal shared partial class Checks {
    private func Accessibility(arguments[]string) {
        Require(arguments.Length == 1, "Expected AccessKit package")
        let packagePath = arguments[0]
        using let archive = ZipFile.OpenRead(packagePath)
        let manifest = ReadJson(archive, "native-build.json")
        Require(manifest["accesskit_c"]!!.GetValue[string]() == "0.23.0", "Unexpected AccessKit C ABI")
        let payloads = HashSet[string](StringComparer.Ordinal)
        for item in manifest["sha256"]!!.AsObject() {
            let parts = item.Key.Split('/')
            Require(parts.Length == 3, "Invalid AccessKit native path: " + item.Key)
            let rid = parts[1]
            let filename = parts[2]
            let entry = "runtimes/$rid/native/$filename"
            let bytes = ReadEntry(archive, entry)
            Require(Convert.ToHexStringLower(SHA256.HashData(bytes)) == item.Value.GetValue[string](), entry)
            payloads.Add(entry)
            if rid == "linux-x64" {
                let directory = Path.Combine(Path.GetTempPath(), "goo-accesskit-abi-" + Guid.NewGuid().ToString())
                Directory.CreateDirectory(directory)
                try {
                    let binary = Path.Combine(directory, filename)
                    File.WriteAllBytes(binary, bytes)
                    let symbols = Run("readelf", []string{"--version-info", binary})
                    let versions = Regex.Matches(symbols, `GLIBC_([0-9.]+)`)
                    Require(versions.Count > 0, "Missing GLIBC versions")
                    for match in versions {
                        let fields = match.Groups[1].Value.Split('.').Select(p -> int32.Parse(p)).ToArray()
                        Require(
                            fields[0] < 2 ||
                                (
                                fields[0] == 2 &&
                                    (fields.Length == 1 || fields[1] < 27 || (fields[1] == 27 && fields.Length == 2))
                            ),
                            "GLIBC baseline exceeds 2.27"
                        )
                    }
                } finally {
                    Directory.Delete(directory, true)
                }
            }
        }
        let names = archive.Entries.Select(e -> e.FullName).ToArray()
        Require(payloads.SetEquals(names.Where(n -> n.StartsWith("runtimes/"))), "Native payload set differs")
        Require(!names.Any(n -> n.StartsWith("lib/")), "The runtime package must remain native-only")
        Require(
            names.Contains("LICENSE-MIT") && names.Contains("LICENSE-APACHE") && names.Contains("README.md"),
            "Missing AccessKit licenses or README"
        )
        Console.WriteLine(
            "${Path.GetFileName(packagePath)}: five pinned native payloads, licenses, and glibc baseline passed"
        )
    }

    private func ReadEntry(archive ZipArchive, name string)[]byte {
        let entry = archive.GetEntry(name) ?? throw InvalidDataException("Missing archive entry: " + name)
        using let stream = entry.Open()
        using let output = MemoryStream()
        stream.CopyTo(output)
        return output.ToArray()
    }

    private func ReadJson(archive ZipArchive, name string) JsonNode -> JsonNode.Parse(ReadEntry(archive, name)) ??
        throw InvalidDataException("Missing JSON: " + name)
}
