package Goo

import System
import System.Collections.Generic
import System.Runtime.InteropServices
import System.Text

internal class NativeAccessibilityTextRun {
  internal var Id uint64
  internal var Owner AccessibilityId
  internal var Start int32
  internal var Text string = ""
  internal var Starts []int32 = []int32{}
  internal var Lengths []uint8 = []uint8{}
  internal var Words []uint8 = []uint8{}
  internal var Geometry bool
  internal var Bounds ElementRect
  internal var Direction uint8
  internal var Positions []float32 = []float32{}
  internal var Widths []float32 = []float32{}
  internal var Dirty bool = true
}

public sealed partial class NativeAccessibilityAdapter {
  private func UpdateText(node AccessibilityNode, retained NativeAccessibilityNodeCache) bool {
    let editable = node.SelectionStart != nil || node.TextSnapshot != nil
    let textual = editable || node.Role == AccessibilityRole.Text
    let version = node.TextSnapshot?.Version ?? -1
    if textual && version == retained.TextVersion && node.Value == retained.Value && retained.Runs.Count > 0 { return false }
    let text = if !textual { "" } else if let snapshot = node.TextSnapshot { snapshot.GetText() } else { node.Value }
    retained.TextVersion = version
    retained.Value = node.Value
    var count = 0
    var changed = false
    if textual {
      let boundaries = TextBoundaries(text)
      var first = 0
      var trailing = text.EndsWith("\n", StringComparison.Ordinal)
      while first < boundaries.Count - 1 || count == 0 || trailing {
        if first == boundaries.Count - 1 { trailing = false }
        var end = first
        while end < boundaries.Count - 1 && end - first < 200 {
          end++
          if text[boundaries[end] - 1] == '\n' { break }
        }
        let start = boundaries[first]
        let value = text.Substring(start, boundaries[end] - start)
        var run NativeAccessibilityTextRun
        if count < retained.Runs.Count && retained.Runs[count].Text == value {
          run = retained.Runs[count]
        } else {
          run = NativeAccessibilityTextRun()
          run.Id = nextTextId++
          run.Owner = node.Id
          run.Text = value
          let length = end - first
          run.Starts = [length + 1]int32
          run.Lengths = [length]uint8
          run.Positions = [length]float32
          run.Widths = [length]float32
          let words = List[uint8]()
          var previousWord = false
          for i in 0 ... length {
            run.Starts[i] = boundaries[first + i] - start
            run.Lengths[i] = uint8(Encoding.UTF8.GetByteCount(text, boundaries[first + i], boundaries[first + i + 1] - boundaries[first + i]))
            let word = Char.IsLetterOrDigit(text, boundaries[first + i])
            if word && !previousWord { words.Add(uint8(i)) }
            previousWord = word
          }
          run.Starts[length] = value.Length
          run.Words = words.ToArray()
          if count < retained.Runs.Count {
            textRuns.Remove(retained.Runs[count].Id)
            retained.Runs[count] = run
          } else { retained.Runs.Add(run) }
          textRuns.Add(run.Id, run)
          changed = true
        }
        run.Start = start
        count++
        first = end
        if first == boundaries.Count - 1 && !trailing { break }
      }
    }
    while retained.Runs.Count > count {
      textRuns.Remove(retained.Runs[retained.Runs.Count - 1].Id)
      retained.Runs.RemoveAt(retained.Runs.Count - 1)
      changed = true
    }
    return changed
  }

  private func UpdateTextGeometry(source Node?, retained NativeAccessibilityNodeCache) {
    if source != nil { TextGeometryQueries.Prepare(source) }
    for i in 0 ... retained.Runs.Count {
      let run = retained.Runs[i]
      if source == nil || source.Password || !ReadTextGeometry(source, run) {
        if run.Geometry { run.Geometry = false
          run.Dirty = true }
      }
    }
  }

  private func ReadTextGeometry(source Node, run NativeAccessibilityTextRun) bool {
    var end = run.Text.Length
    if end > 0 && run.Text[end - 1] == '\n' { end--
      if end > 0 && run.Text[end - 1] == '\r' { end-- } }
    if !TextGeometryQueries.CaretRect(source, TextPosition {Offset: run.Start, Affinity: TextAffinity.Downstream}, TextCoordinateSpace.Window, out var first)
      || !TextGeometryQueries.CaretRect(source, TextPosition{Offset: run.Start + end, Affinity: TextAffinity.Upstream}, TextCoordinateSpace.Window, out var last)
      || Math.Abs(first.Y - last.Y) > 0.1 { return false }
    let ownerBounds = ElementHandles.BorderBox(source)
    if first.Y + first.Height <= ownerBounds.Y || first.Y >= ownerBounds.Y + ownerBounds.Height { return false }
    let direction = last.X < first.X ? uint8(1) : uint8(0)
    let bounds = ElementRect{X: Math.Min(first.X, last.X), Y: first.Y, Width: Math.Abs(last.X - first.X), Height: first.Height}
    var dirty = !run.Geometry || !sameElementRect(run.Bounds, bounds) || run.Direction != direction
    var previous = first.X
    for i in 0 ... run.Lengths.Length {
      let finish = Math.Min(run.Starts[i + 1], end)
      if !TextGeometryQueries.CaretRect(source, TextPosition {Offset: run.Start + finish, Affinity: TextAffinity.Upstream}, TextCoordinateSpace.Window, out var next)
        || Math.Abs(next.Y - first.Y) > 0.1 { return false }
      let advance = direction == uint8(0) ? next.X - previous : previous - next.X
      if advance < -0.1 { return false }
      let position = float32(Math.Abs(previous - first.X) * scaleX)
      let width = float32(Math.Max(0.0, advance) * scaleX)
      if run.Positions[i] != position || run.Widths[i] != width { dirty = true }
      run.Positions[i] = position
      run.Widths[i] = width
      previous = next.X
    }
    run.Geometry = true
    run.Bounds = bounds
    run.Direction = direction
    run.Dirty = run.Dirty || dirty
    return true
  }

  private func EncodeTextRun(run NativeAccessibilityTextRun) nint {
    let result = AccessKitNative.NodeNew(AccessKitSchema.TextRun)
    try {
      SetString(result, run.Text, 2)
      SetBytes(result, run.Lengths, false)
      SetBytes(result, run.Words, true)
      if run.Geometry {
        AccessKitNative.NodeSetBounds(result, NativeBounds(run.Bounds))
        AccessKitNative.NodeSetTextDirection(result, run.Direction)
        SetCoordinates(result, run.Positions, false)
        SetCoordinates(result, run.Widths, true)
      }
      return result
    } catch (error Exception) { AccessKitNative.NodeFree(result)
      throw error }
  }

  shared {
    private func TextBoundaries(text string) List[int32] {
      let graphemes = UnicodeGraphemes.Starts(text)
      let result = List[int32](graphemes.Length + 1)
      for i in 0 ... graphemes.Length {
        let start = graphemes[i]
        let end = i + 1 < graphemes.Length ? graphemes[i + 1] : text.Length
        if Encoding.UTF8.GetByteCount(text, start, end - start) <= 255 { result.Add(start) }
        else {
          // AccessKit lengths are bytes. Oversized graphemes use scalar boundaries;
          // Goo still validates/snap-selects the requested editor range.
          var offset = start
          while offset < end { result.Add(offset)
            offset += Char.IsHighSurrogate(text[offset]) && offset + 1 < end ? 2 : 1 }
        }
      }
      result.Add(text.Length)
      return result
    }

    private func EncodeSelection(target nint, node AccessibilityNode, retained NativeAccessibilityNodeCache) {
      guard let start = node.SelectionStart, let length = node.SelectionLength else { return }
      if retained.Runs.Count == 0 { return }
      let caret = node.Caret ?? start + length
      let anchor = caret == start ? start + length : start
      AccessKitNative.NodeSetTextSelection(target, AccessKitTextSelection{
        Anchor: TextPositionFor(retained, anchor), Focus: TextPositionFor(retained, caret),
      })
    }

    private func TextPositionFor(retained NativeAccessibilityNodeCache, offset int32) AccessKitTextPosition {
      var index = 0
      while index + 1 < retained.Runs.Count && retained.Runs[index + 1].Start <= offset { index++ }
      let run = retained.Runs[index]
      var character = Array.BinarySearch[int32](run.Starts, Math.Clamp(offset - run.Start, 0, run.Text.Length))
      if character < 0 { character = Math.Max(0, -character - 2) }
      return AccessKitTextPosition{Node: run.Id, CharacterIndex: uint64(character)}
    }

    private func SetBytes(target nint, bytes []uint8, words bool) {
      let pointer = Marshal.AllocHGlobal(Math.Max(1, bytes.Length))
      try {
        if bytes.Length > 0 { Marshal.Copy(bytes, 0, pointer, bytes.Length) }
        if words { AccessKitNative.NodeSetWordStarts(target, uint64(bytes.Length), pointer) }
        else { AccessKitNative.NodeSetCharacterLengths(target, uint64(bytes.Length), pointer) }
      } finally { Marshal.FreeHGlobal(pointer) }
    }

    private func SetCoordinates(target nint, values []float32, widths bool) {
      let pointer = Marshal.AllocHGlobal(Math.Max(4, values.Length * 4))
      try {
        if values.Length > 0 { Marshal.Copy(values, 0, pointer, values.Length) }
        if widths { AccessKitNative.NodeSetCharacterWidths(target, uint64(values.Length), pointer) }
        else { AccessKitNative.NodeSetCharacterPositions(target, uint64(values.Length), pointer) }
      } finally { Marshal.FreeHGlobal(pointer) }
    }
  }
}
