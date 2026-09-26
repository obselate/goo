package Goo

import System
import System.Collections.Generic

public sealed partial class NativeAccessibilityAdapter {
  private func TextPartitionLayout(source Node?) object? {
    guard let n = source else { return nil }
    return switch n.Kind {
      case NodeKind.Text: TextLayouts.CurrentForGeometry(n)
      case NodeKind.Entry: n.EntryShape
      case NodeKind.Editor: TextEditorLayouts.CurrentForGeometry(n)
      default: nil
    }
  }

  private func TextPartitionsCurrent(retained NativeAccessibilityNodeCache, layout object?) bool {
    if !retained.TextPartitionsValid || !Object.ReferenceEquals(retained.TextLayout, layout) {
      return false
    }
    if let editor = layout as TextEditorVisualLayout? {
      guard let lines = retained.TextLines else { return false }
      if lines.Count != editor.Lines.Count { return false }
      for i in 0 ... lines.Count {
        if lines[i] != editor.Lines[i] { return false }
      }
    }
    return true
  }

  private func RetainTextPartitionLayout(retained NativeAccessibilityNodeCache, layout object?) {
    retained.TextLayout = layout
    if let editor = layout as TextEditorVisualLayout? {
      let lines = retained.TextLines ?? List[TextEditorVisualLine]()
      lines.Clear()
      lines.AddRange(editor.Lines)
      retained.TextLines = lines
    } else { retained.TextLines = nil }
    retained.TextPartitionsValid = true
  }

  private func TextRunEnd(source Node?, layout object?, text string,
    boundaries List[int32], first int32) int32 {
    let limit = Math.Min(first + 200, boundaries.Count - 1)
    if first == limit { return first }
    var geometryStart = 0
    var geometryEnd = text.Length
    if source?.Kind == NodeKind.Editor {
      if let editor = layout as TextEditorVisualLayout? {
        if editor.Lines.Count > 0 {
          geometryStart = editor.Lines[0].SourceStart
          geometryEnd = editor.Lines[editor.Lines.Count - 1].SourceEnd
        } else { geometryEnd = 0 }
      } else { geometryEnd = 0 }
    }
    if source == nil || source.Password || layout == nil || boundaries[first] < geometryStart
      || boundaries[first] >= geometryEnd {
        var end = limit
        if boundaries[first] < geometryStart {
          let boundary = boundaries.BinarySearch(geometryStart)
          end = Math.Min(end, boundary >= 0 ? boundary : -boundary - 1)
        }
        let newline = text.IndexOf('\n', boundaries[first], boundaries[end] - boundaries[first])
        if newline >= 0 {
          let boundary = boundaries.BinarySearch(newline + 1)
          end = boundary >= 0 ? boundary : -boundary - 1
        }
        return end
      }
    var end = first
    var previous ElementRect
    var previousDirection = 0
    var hasGeometry = false
    while end < limit {
      let start = boundaries[end]
      let finish = boundaries[end + 1]
      if text[finish - 1] == '\n' { return end + 1 }
      if start >= geometryEnd { break }
      if source != nil && !source.Password
        && TextGeometryQueries.CaretRect(source, TextPosition{Offset: start, Affinity: TextAffinity.Downstream},
          TextCoordinateSpace.Element, out var leading)
        && TextGeometryQueries.CaretRect(source, TextPosition{Offset: finish, Affinity: TextAffinity.Upstream},
          TextCoordinateSpace.Element, out var trailing) {
        let direction = trailing.X < leading.X ? -1 : 1
        if hasGeometry && (Math.Abs(leading.Y - previous.Y) > 0.1
          || Math.Abs(leading.X - previous.X) > 0.1 || direction != previousDirection) { break }
        previous = trailing
        previousDirection = direction
        hasGeometry = true
      } else if hasGeometry { break }
      end++
    }
    return end
  }
}
