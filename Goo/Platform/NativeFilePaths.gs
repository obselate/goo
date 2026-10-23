package Goo

import System
import System.Collections.Generic
import System.IO

internal class NativeFilePaths {
  shared {
    internal const MaxCount int32 = 4096
    internal const MaxPathUnits int32 = 32768
    internal const MaxTotalUnits int32 = 1048576
    internal const MaxUtf8Bytes int32 = 131072

    internal func Add(paths List[string], path string, ref units int32) {
      Validate(path, paths.Count, ref units)
      paths.Add(path)
    }

    internal func Validate(path string, count int32, ref units int32) {
      if path.IndexOf(char(0)) >= 0 || !Path.IsPathFullyQualified(path) {
        throw InvalidDataException("File paths must be absolute and contain no NUL")
      }
      if count >= MaxCount || path.Length > MaxPathUnits || path.Length > MaxTotalUnits - units {
        throw NativePathLimitException("File list exceeds its path-count or text budget")
      }
      units += path.Length
    }
  }
}

internal class NativePathLimitException : Exception {
  internal init(message string): base(message) { }
}
