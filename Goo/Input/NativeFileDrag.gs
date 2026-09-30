package Goo

import System
import System.Collections.Generic
import System.Text

/// Owns local file paths for a native Copy offer while DragData.Value stays available to in-window targets.
public sealed class NativeFileDrag {
  private let paths IReadOnlyList[string]
  private let uriList string
  /// Gets the validated, immutable local paths in their original order.
  public prop Paths IReadOnlyList[string]{ get -> paths }
  internal prop UriList string{ get -> uriList }

  /// Creates a native file offer from absolute local paths.
  /// @param values absolute local paths to offer in order
  public init(values IReadOnlyList[string]) {
    if values == nil { throw ArgumentNullException("values") }
    if values.Count == 0 { throw ArgumentException("A native file offer requires a path", "values") }
    let validated = List[string](values.Count)
    var units int32 = 0
    let encoded = StringBuilder()
    for i in 0 ... values.Count {
      let path = values[i]
      if path == nil { throw ArgumentException("Native file paths cannot be null", "values") }
      NativeFilePaths.Add(validated, path, ref units)
      encoded.Append("file://")
      let segments = path.Split('/')
      for j in 0 ... segments.Length {
        if j > 0 { encoded.Append('/') }
        encoded.Append(Uri.EscapeDataString(segments[j]))
      }
      encoded.Append("\r\n")
      if encoded.Length > 1048576 { throw NativePathLimitException("Native URI list exceeds 1 MiB") }
    }
    paths = Array.AsReadOnly[string](validated.ToArray())
    uriList = encoded.ToString()
  }
}
