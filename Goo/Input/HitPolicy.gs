package Goo

internal func isInteractiveContent(node Node) bool -> node.OnClick != nil || node.Focusable

internal func resolvedHitTestSelf(b Blob, focusable bool, entries StyleEntries?,
  hover StyleEntries?, active StyleEntries?) bool{
    switch b {
      case c is Container {
        if c.HasAuthoredHitTestSelf { return c.HitTestSelf }
        if c.DragsWindow { return true }
      }
      case _ { }
    }
    if b is Button { return true }
    if b is TextEntry { return true }
    if b is TextEditor { return true }
    if focusable { return true }
    if b.OnClick != nil { return true }
    if b.OnPointerDown != nil { return true }
    if b.OnPointerMove != nil { return true }
    if b.OnPointerUp != nil { return true }
    if b.OnPointerCancel != nil { return true }
    if b.OnPointerEnter != nil { return true }
    if b.OnPointerLeave != nil { return true }
    if b.OnWheel != nil { return true }
    if b.HasSparseInputState && DragDropMetadata.HasBlobBindings(b) { return true }
    if hover != nil { return true }
    if active != nil { return true }
    return inputStyleRequiresHitTest(entries)
  }

private func inputStyleRequiresHitTest(entries StyleEntries?) bool {
  guard let values = entries else { return false }
  var cursorResolved = false
  var overflowXResolved = false
  var overflowYResolved = false
  for var i = values.Count; i > 0; i-- {
    let entry = values.At(i - 1)
    if entry.Field == StyleField.Cursor && !cursorResolved {
      cursorResolved = true
      if Cursor(int32(entry.A)) != Cursor.Default { return true }
    } else if entry.Field == StyleField.OverflowX && !overflowXResolved {
      overflowXResolved = true
      if Overflow(int32(entry.A)) == Overflow.Scroll { return true }
    } else if entry.Field == StyleField.OverflowY && !overflowYResolved {
      overflowYResolved = true
      if Overflow(int32(entry.A)) == Overflow.Scroll { return true }
    }
  }
  return false
}
