import System
import System.Collections.Generic
import System.IO
import System.Security.Cryptography
import System.Text.RegularExpressions

internal shared class ShaderSourceDigest {
    internal func Compute(path string) string {
        using let hash = IncrementalHash.CreateHash(HashAlgorithmName.SHA256)
        Append(path, hash, HashSet[string]())
        return Convert.ToHexString(hash.GetHashAndReset()).ToLowerInvariant()
    }

    private func Append(source string, hash IncrementalHash, visited HashSet[string]) {
        let path = Path.GetFullPath(source)
        if !visited.Add(path) { return }
        hash.AppendData(File.ReadAllBytes(path))
        for include Match in Regex.Matches(File.ReadAllText(path), "(?m)^\\s*#include\\s+\"([^\"]+)\"") {
            Append(Path.Combine(Path.GetDirectoryName(path)!!, include.Groups[1].Value), hash, visited)
        }
    }
}
