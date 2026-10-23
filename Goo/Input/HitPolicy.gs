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
    if b.HasSparseInputState && GestureMetadata.Get(b) != nil { return true }
    if hover != nil { return true }
    if active != nil { return true }
    return inputStyleRequiresHitTest(entries)
  }

private func inputStyleRequiresHitTest(entries StyleEntries?) bool {
  guard let values = entries else { return false }
  var cursor = Cursor.Default
  var overflowX = Overflow.Visible
  var overflowY = Overflow.Visible
  var entriesCursor = values.Cursor()
  while entriesCursor.MoveNext() {
    let entry = entriesCursor.Current
    switch entry.Field {
      case StyleField.Cursor { cursor = Cursor(int32(entry.A)) }
      case StyleField.OverflowX { overflowX = Overflow(int32(entry.A)) }
      case StyleField.OverflowY { overflowY = Overflow(int32(entry.A)) }
      case _ { }
    }
  }
  return cursor != Cursor.Default || overflowX == Overflow.Scroll || overflowY == Overflow.Scroll
}
