package Goo

import System
import System.IO
import System.Reflection

/// Resolves embedded assets before files beside the application. Results are not cached.
public shared class Assets {
  /// Opens a manifest resource, then a file under AppContext.BaseDirectory. Both slash forms are accepted.
  /// The caller disposes the stream. Rooted names and parent segments throw ArgumentException.
  public func Open(assembly Assembly, name string) Stream {
    if Object.ReferenceEquals(assembly, nil) { throw ArgumentNullException("assembly") }
    if String.IsNullOrWhiteSpace(name) { throw ArgumentException("An asset name is required", "name") }
    let normalized = name.Replace('\\', '/')
    if Path.IsPathRooted(normalized) || normalized.StartsWith("/", StringComparison.Ordinal)
      || (normalized.Length >= 2 && normalized[1] == ':')
      || normalized == ".." || normalized.StartsWith("../", StringComparison.Ordinal)
      || normalized.EndsWith("/..", StringComparison.Ordinal) || normalized.Contains("/../") {
      throw ArgumentException("Asset names must be application-relative without parent segments", "name")
    }
    if let resource = assembly.GetManifestResourceStream(normalized) { return resource }
    let path = Path.Combine(AppContext.BaseDirectory, normalized)
    if File.Exists(path) { return File.OpenRead(path) }
    throw FileNotFoundException("Asset not found in assembly '" + assembly.FullName
      + "' as '" + name + "' or at '" + path + "'.", path)
  }

  /// Reads an application-relative resource or file. Both slash forms are accepted. Rooted names and parent segments throw ArgumentException.
  public func ReadAllBytes(assembly Assembly, name string) []uint8 {
    using let stream = Open(assembly, name)
    using let bytes = MemoryStream()
    stream.CopyTo(bytes)
    return bytes.ToArray()
  }
}
