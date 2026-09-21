package Goo

import System

internal class TextEditorInputAdapter {
  shared {
    internal func SelectAt(n Node, localX float32, localY float32, extend bool,
      clickCount int32) bool{
        guard let controller = n.EditorController else { return false }
        let position = TextEditorLayouts.HitTest(n, localX, localY, clickCount >= 2)
        if clickCount >= 2 {
          if !controller.Execute(TextCommand{
            Kind: clickCount >= 3 ? TextCommandKind.SelectLine : TextCommandKind.SelectWord,
            Position: position, ExtendSelection: extend }) { return false }
        } else {
          controller.Selection = TextSelection{
            Anchor: extend ? controller.Selection.Anchor : position,
            Active: position,
          }
        }
        n.BlinkT = 0.0
        return true
      }

    internal func DragTo(n Node, localX float32, localY float32, clicks int32, origin TextRange) bool {
      guard let controller = n.EditorController else { return false }
      let position = TextEditorLayouts.HitTest(n, localX, localY, clicks >= 2)
      if clicks >= 2 {
        let target = clicks >= 3 ? TextSelectionRanges.Line(controller.Document, position.Offset)
          : TextSelectionRanges.Word(controller.Document.GetText(), position.Offset)
        controller.Selection = TextSelectionRanges.Extend(origin, target)
      } else {
        controller.Selection = TextSelection{
          Anchor: controller.Selection.Anchor,
          Active: position,
        }
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
