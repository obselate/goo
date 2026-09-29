package Goo

import System

internal partial class TextEditorLayouts {
  shared {
    internal func LineNumberDigits(count int32) int32 {
      var digits = 1
      var remaining = count
      while remaining >= 10 {
        remaining = remaining / 10
        digits++
      }
      return digits
    }

    private func editorViewportWidth(n Node, width float32) float32 -> width < 0.0F
      ? width : MathF.Max(0.0F, width - verticalScrollbarGutter(n))

    internal func GutterWidth(n Node) float32 -> n.EditorShowLineNumbers && n.EditorState != nil
      ? For(n, BoxGeometry.ContentWidth(n), BoxGeometry.ContentHeight(n)).GutterWidth : 0.0F

    internal func TextLeft(n Node) float32 -> BoxGeometry.ContentLeft(n) + GutterWidth(n)

    internal func InGutter(n Node, localX float32) bool -> n.EditorShowLineNumbers
      && localX >= BoxGeometry.ContentLeft(n) - n.Rect.X && localX < TextLeft(n) - n.Rect.X
  }
}
