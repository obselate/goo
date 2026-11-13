package Goo

import System
import System.IO
import System.Reflection

/// Resolves embedded assets before files beside the application. Results are not cached.
public shared class Assets {
  /// Opens an exact manifest resource name, then a file under AppContext.BaseDirectory.
  /// The caller disposes the stream. Missing assets report both locations.
  public func Open(assembly Assembly, name string) Stream {
    if Object.ReferenceEquals(assembly, nil) { throw ArgumentNullException("assembly") }
    if String.IsNullOrWhiteSpace(name) { throw ArgumentException("An asset name is required", "name") }
    if let resource = assembly.GetManifestResourceStream(name) { return resource }
    let path = Path.Combine(AppContext.BaseDirectory, name)
    if File.Exists(path) { return File.OpenRead(path) }
    throw FileNotFoundException("Asset not found in assembly '" + assembly.FullName
      + "' as '" + name + "' or at '" + path + "'.", path)
  }

  /// Reads an exact manifest resource name or an application-relative file.
  public func ReadAllBytes(assembly Assembly, name string) []uint8 {
    using let stream = Open(assembly, name)
    using let bytes = MemoryStream()
    stream.CopyTo(bytes)
    return bytes.ToArray()
  }
}
