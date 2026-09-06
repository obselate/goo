package Goo

import System

internal class TextEditorInputAdapter {
  shared {
    internal func SelectAt(n Node, localX float32, localY float32, extend bool,
      clickCount int32) bool{
        guard let controller = n.EditorController else { return false }
        let position = TextEditorLayouts.HitTest(n, localX, localY)
        if clickCount >= 3 {
          let line = controller.Document.GetLineIndex(position.Offset)
          let textRange = controller.Document.GetLineRange(line)
          controller.Selection = TextSelection{
            Anchor: TextPosition{ Offset: textRange.Start, Affinity: TextAffinity.Upstream },
            Active: TextPosition{ Offset: textRange.Start + textRange.Length,
              Affinity: TextAffinity.Downstream },
          }
        } else if clickCount == 2 {
          controller.Selection = wordSelection(controller, position)
        } else {
          controller.Selection = TextSelection{
            Anchor: extend ? controller.Selection.Anchor : position,
            Active: position,
          }
        }
        n.BlinkT = 0.0
        return true
      }

    internal func DragTo(n Node, localX float32, localY float32) bool {
      guard let controller = n.EditorController else { return false }
      let position = TextEditorLayouts.HitTest(n, localX, localY)
      controller.Selection = TextSelection{
        Anchor: controller.Selection.Anchor,
        Active: position,
      }
      n.BlinkT = 0.0
      return true
    }

    internal func UpdateImeArea(host WindowHost, n Node) {
      guard let controller = n.EditorController else {
        return
      }
      let caret = if let composition = controller.Composition {
        TextEditorLayouts.CompositionCaretRect(n, composition)
      } else {
        TextEditorLayouts.CaretRect(n, controller.Selection.Active)
      }
      let left = n.Rect.X + caret.X
      let top = n.Rect.Y + caret.Y
      setImeArea(host, n, left, top, caret.W, caret.H)
    }

    internal func ApplyImeArea(host WindowHost, p0 TransformPoint, p1 TransformPoint,
      p2 TransformPoint, p3 TransformPoint) {
        if !p0.Valid || !p1.Valid || !p2.Valid || !p3.Valid {
          return
        }
        let minX = TransformGeometry.min4(p0.X, p1.X, p2.X, p3.X)
        let minY = TransformGeometry.min4(p0.Y, p1.Y, p2.Y, p3.Y)
        let maxX = TransformGeometry.max4(p0.X, p1.X, p2.X, p3.X)
        let maxY = TransformGeometry.max4(p0.Y, p1.Y, p2.Y, p3.Y)
        let left = MathF.Floor(minX)
        let top = MathF.Floor(minY)
        let right = MathF.Ceiling(maxX)
        let bottom = MathF.Ceiling(maxY)
        let width = int32(right - left) > 0 ? int32(right - left) : 1
        let height = int32(bottom - top) > 0 ? int32(bottom - top) : 1
        host.SetImeArea(int32(left), int32(top), width, height, 0)
      }

    private func wordSelection(controller TextEditorController, position TextPosition) TextSelection {
      let text = controller.Document.GetText()
      if text.Length == 0 {
        return TextSelection{ Anchor: position, Active: position }
      }
      let starts = UnicodeGraphemes.Starts(text)
      var index int32 = 0
      while index < starts.Length && starts[index] < position.Offset { index++ }
      if index == starts.Length || starts[index] > position.Offset {
        index--
      }
      if index < 0 || !Char.IsLetterOrDigit(text, starts[index]) {
        return TextSelection{ Anchor: position, Active: position }
      }
      var first = index
      while first > 0 && Char.IsLetterOrDigit(text, starts[first - 1]) { first-- }
      var last = index + 1
      while last < starts.Length && Char.IsLetterOrDigit(text, starts[last]) { last++ }
      let end = last < starts.Length ? starts[last] : text.Length
      return TextSelection{
        Anchor: TextPosition{ Offset: starts[first], Affinity: TextAffinity.Upstream },
        Active: TextPosition{ Offset: end, Affinity: TextAffinity.Downstream },
      }
    }

    private func setImeArea(host WindowHost, n Node, x float32, y float32, width float32,
      height float32) {
        let p0 = TransformGeometry.NodeToWindow(n, x, y)
        let p1 = TransformGeometry.NodeToWindow(n, x + width, y)
        let p2 = TransformGeometry.NodeToWindow(n, x, y + height)
        let p3 = TransformGeometry.NodeToWindow(n, x + width, y + height)
        ApplyImeArea(host, p0, p1, p2, p3)
      }

  }
}
