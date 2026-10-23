package Goo

import System
import System.Collections.Generic

/// Owns local file paths for a native Copy offer while DragData.Value stays available to in-window targets.
public sealed class NativeFileDrag {
  private let paths IReadOnlyList[string]
  /// Gets the validated, immutable local paths in their original order.
  public prop Paths IReadOnlyList[string]{ get -> paths }

  /// Creates a native file offer from absolute local paths.
  /// @param values absolute local paths to offer in order
  public init(values IReadOnlyList[string]) {
    if values == nil { throw ArgumentNullException("values") }
    if values.Count == 0 { throw ArgumentException("A native file offer requires a path", "values") }
    if values.Count > NativeFilePaths.MaxCount { throw NativePathLimitException("Native file list exceeds 4096 paths") }
    let validated = List[string](values.Count)
    var units int32 = 0
    var encodedUnits int32
    for i in 0 ... values.Count {
      let path = values[i]
      if path == nil { throw ArgumentException("Native file paths cannot be null", "values") }
      NativeFilePaths.Add(validated, path, ref units)
      encodedUnits += 9
      let segments = path.Split('/')
      encodedUnits += segments.Length - 1
      for segment in segments { encodedUnits += Uri.EscapeDataString(segment).Length }
      if encodedUnits > 1048576 { throw NativePathLimitException("Native URI list exceeds 1 MiB") }
    }
    paths = Array.AsReadOnly[string](validated.ToArray())
  }

  shared {
    /// Tries to create a native file offer without discarding an oversized selection.
    /// @param values absolute local paths to offer in order
    /// @param result receives the offer, or null when native transfer limits are exceeded
    /// @returns true when the whole selection can be offered
    public func TryCreate(values IReadOnlyList[string], out result NativeFileDrag?) bool {
      if values == nil { throw ArgumentNullException("values") }
      if values.Count > NativeFilePaths.MaxCount {
        result = nil
        return false
      }
      try {
        result = NativeFileDrag(values)
        return true
      } catch (_ NativePathLimitException) {
        result = nil
        return false
      }
    }
  }
}
