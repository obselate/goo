package Goo

internal class InputMetadata {
  shared {
    internal func HasState(blob Blob) bool -> blob.HasElementHandle
      || InputCallbacks.HasBlobCallbacks(blob) || TextInputCallbacks.HasBlobCallbacks(blob)
      || DragDropMetadata.HasBlobBindings(blob) || GestureMetadata.Get(blob) != nil

    internal func Refresh(node Node) {
      node.HasSparseInputState = node.HasElementHandle
        || InputCallbacks.HasNodeCallbacks(node) || TextInputCallbacks.HasNodeCallbacks(node)
        || DragDropMetadata.HasNodeBindings(node) || GestureMetadata.Get(node) != nil
    }

    internal func Sync(node Node, blob Blob) bool {
      let keyboardChanged = InputCallbacks.Sync(node, blob)
      let textChanged = TextInputCallbacks.Sync(node, blob)
      let dragDropChanged = DragDropMetadata.Sync(node, blob)
      let gesturesChanged = GestureMetadata.Sync(node, blob)
      Refresh(node)
      return keyboardChanged || textChanged || dragDropChanged || gesturesChanged
    }
  }
}
