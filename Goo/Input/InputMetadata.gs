package Goo

internal class InputMetadata {
  shared {
    internal func HasState(blob Blob) bool -> blob.HasElementHandle
      || InputCallbacks.HasBlobCallbacks(blob) || TextInputCallbacks.HasBlobCallbacks(blob)
      || DragDropMetadata.HasBlobBindings(blob)

    internal func Refresh(node Node) {
      node.HasSparseInputState = node.HasElementHandle
        || InputCallbacks.HasNodeCallbacks(node) || TextInputCallbacks.HasNodeCallbacks(node)
        || DragDropMetadata.HasNodeBindings(node)
    }

    internal func Sync(node Node, blob Blob, owner Window?) bool {
      if blob.HasElementHandle {
        ElementHandles.Bind(node, blob.Handle, owner)
      } else if node.HasElementHandle {
        ElementHandles.Bind(node, nil, owner)
      }
      let keyboardChanged = InputCallbacks.Sync(node, blob)
      let textChanged = TextInputCallbacks.Sync(node, blob)
      let dragDropChanged = DragDropMetadata.Sync(node, blob)
      Refresh(node)
      return keyboardChanged || textChanged || dragDropChanged
    }
  }
}
