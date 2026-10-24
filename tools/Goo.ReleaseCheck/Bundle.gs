import System
import System.Collections.Generic
import System.IO
import System.Linq
import System.Text.RegularExpressions

internal shared partial class ReleaseCheck {
    private func ValidateBundle(path string, packageSdlDigest string) {
        let entries = List[string]()
        let directories = Stack[string]()
        directories.Push(path)
        while directories.Count > 0 {
            for entry in Directory.EnumerateFileSystemEntries(directories.Pop()) {
                let attributes = File.GetAttributes(entry)
                Require((attributes & FileAttributes.ReparsePoint) == 0, "bundle must not contain symlinks")
                entries.Add(entry)
                if (attributes & FileAttributes.Directory) != 0 {
                    directories.Push(entry)
                }
            }
        }
        let files = entries.Where(p -> File.Exists(p)).ToArray()
        let names = HashSet[string](
            files.Select(p -> Path.GetRelativePath(path, p).Replace('\\', '/')),
            StringComparer.Ordinal
        )
        Require(
            !names.Any(n -> n.EndsWith(".spv") || n.EndsWith("/shader-manifest.json")),
            "bundle contains loose runtime shaders"
        )
        Require(!names.Any(n -> n.EndsWith("text-native-build.json")), "bundle contains native provenance")
        let expected = HashSet[string](
            File.ReadAllLines(Path.Combine(Root, ".github/scripts/linux-bundle-files.txt")),
            StringComparer.Ordinal
        )
        expected.UnionWith([]string{"LICENSE", "README.md", "CHANGELOG.md", "THIRD-PARTY-NOTICES.md", "SHA256SUMS"})
        Require(
            names.SetEquals(expected),
            "bundle allowlist mismatch, missing=" + string.Join(", ", expected.Except(names).OrderBy(n -> n)) +
                " unexpected=" +
                string.Join(", ", names.Except(expected).OrderBy(n -> n))
        )
        let documents = []string{"README.md", "CHANGELOG.md", "LICENSE", "THIRD-PARTY-NOTICES.md"}
        for name in documents {
            Require(
                File.ReadAllBytes(Path.Combine(path, name)).SequenceEqual(File.ReadAllBytes(Path.Combine(Root, name))),
                "bundle $name differs from the release tree"
            )
        }
        let total = files.Sum(p -> FileInfo(p).Length)
        Console.WriteLine("Bundle size: $total bytes")
        let checksums = Dictionary[string, string](StringComparer.Ordinal)
        for line in File.ReadAllLines(Path.Combine(path, "SHA256SUMS")) {
            let match = Regex.Match(line, `^([0-9a-f]{64})  ([^\n]+)$`)
            Require(match.Success && !checksums.ContainsKey(match.Groups[2].Value), "invalid checksum line: " + line)
            checksums.Add(match.Groups[2].Value, match.Groups[1].Value)
        }
        expected.Remove("SHA256SUMS")
        Require(expected.SetEquals(checksums.Keys), "SHA256SUMS allowlist mismatch")
        for entry in checksums {
            Require(
                Hash(File.ReadAllBytes(Path.Combine(path, entry.Key))) == entry.Value,
                "checksum mismatch: " + entry.Key
            )
        }
        let native = []string{"libSDL3.so", "libgoo-harfbuzz-gpu.so", "libgoo-harfbuzz.so"}
        let hashes = HashSet[string](StringComparer.Ordinal)
        for name in native {
            let file = Path.Combine(path, name)
            let bytes = File.ReadAllBytes(file)
            Require(StartsWithBytes(bytes, []byte{127, 69, 76, 70}), "native payload is not ELF: " + name)
            Require(hashes.Add(Hash(bytes)), "duplicate native payloads: " + name)
            RequireGlibc(file)
        }
        Require(
            Hash(File.ReadAllBytes(Path.Combine(path, "libSDL3.so"))) == packageSdlDigest,
            "bundle and package contain different SDL payloads"
        )
        for file in files {
            RequireGlibc(file)
        }
        Console.WriteLine("Bundle OK: $total bytes, native=" + string.Join(", ", native.OrderBy(n -> n)))
    }
}
