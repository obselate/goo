package Goo

import System
import System.Collections.Generic
import System.Collections.ObjectModel
import System.Runtime.CompilerServices

/// Describes transient IME composition Text and its selected UTF-16 SelectionStart and SelectionLength.
public data struct TextCompositionEvent(Text string, SelectionStart int32,
  SelectionLength int32) { }

/// Describes one native IME candidate-list update with Candidates, SelectedCandidate, and Horizontal layout.
public data struct TextCandidateEvent(Candidates IReadOnlyList[string],
  SelectedCandidate int32, Horizontal bool) { }

internal class TextInputCallbackSet {
  internal var OnTextInput Action[string]?
  internal var OnTextComposition((TextCompositionEvent) -> void)?
  internal var OnTextCompositionCancel Action?
  internal var OnTextCandidates((TextCandidateEvent) -> void)?

  internal func Empty() bool -> OnTextInput == nil && OnTextComposition == nil
    && OnTextCompositionCancel == nil && OnTextCandidates == nil
}

// Text callbacks are separate from keyboard callbacks so key-only participants stay small.
internal class TextInputCallbacks {
  shared {
    private var blobValues ConditionalWeakTable[Blob, TextInputCallbackSet]?
    private var nodeValues ConditionalWeakTable[Node, TextInputCallbackSet]?
    private let emptyCandidates IReadOnlyList[string] =
    ReadOnlyCollection[string](List[string]())

    internal func EmptyCandidates() IReadOnlyList[string] -> emptyCandidates

    internal func SetBlobTextInput(blob Blob, value Action[string]?) bool {
      let callbacks = blobCallbacks(blob, value != nil)
      if callbacks == nil { return false }
      callbacks.OnTextInput = value
      return finishBlob(blob, callbacks)
    }

    internal func BlobTextInput(blob Blob) Action[string] ? -> blobCallbacks(blob, false)?.OnTextInput

    internal func SetBlobTextComposition(blob Blob, value((TextCompositionEvent) -> void)?) bool {
      let callbacks = blobCallbacks(blob, value != nil)
      if callbacks == nil { return false }
      callbacks.OnTextComposition = value
      return finishBlob(blob, callbacks)
    }

    internal func BlobTextComposition(blob Blob)((TextCompositionEvent) -> void) ? -> blobCallbacks(blob, false)?.OnTextComposition

    internal func SetBlobTextCompositionCancel(blob Blob, value Action?) bool {
      let callbacks = blobCallbacks(blob, value != nil)
      if callbacks == nil { return false }
      callbacks.OnTextCompositionCancel = value
      return finishBlob(blob, callbacks)
    }

    internal func BlobTextCompositionCancel(blob Blob) Action ? -> blobCallbacks(blob, false)?.OnTextCompositionCancel

    internal func SetBlobTextCandidates(blob Blob, value((TextCandidateEvent) -> void)?) bool {
      let callbacks = blobCallbacks(blob, value != nil)
      if callbacks == nil { return false }
      callbacks.OnTextCandidates = value
      return finishBlob(blob, callbacks)
    }

    internal func BlobTextCandidates(blob Blob)((TextCandidateEvent) -> void) ? -> blobCallbacks(blob, false)?.OnTextCandidates

    internal func Sync(node Node, blob Blob) bool {
      var source TextInputCallbackSet?
      if let values = blobValues {
        if values.TryGetValue(blob, out var callbacks) { source = callbacks }
      }
      var destination TextInputCallbackSet?
      if let values = nodeValues {
        if values.TryGetValue(node, out var callbacks) { destination = callbacks }
      }
      let sourcePresence = presence(source)
      let destinationPresence = presence(destination)
      if source == nil {
        nodeValues?.Remove(node)
        node.HasSparseInputState = node.HasElementHandle || InputCallbacks.HasNodeCallbacks(node)
          || DragDropMetadata.HasNodeBindings(node)
        return sourcePresence != destinationPresence
      }
      if destination == nil {
        if nodeValues == nil {
          nodeValues = ConditionalWeakTable[Node, TextInputCallbackSet]()
        }
        destination = TextInputCallbackSet()
        nodeValues!!.Add(node, destination)
      }
      destination.OnTextInput = source.OnTextInput
      destination.OnTextComposition = source.OnTextComposition
      destination.OnTextCompositionCancel = source.OnTextCompositionCancel
      destination.OnTextCandidates = source.OnTextCandidates
      node.HasSparseInputState = true
      return sourcePresence != destinationPresence
    }

    internal func HasBlobCallbacks(blob Blob) bool -> if let values = blobValues {
      values.TryGetValue(blob, out var callbacks) && !callbacks.Empty()
    } else { false }

    internal func HasNodeCallbacks(node Node) bool -> if let values = nodeValues {
      values.TryGetValue(node, out var callbacks) && !callbacks.Empty()
    } else { false }

    internal func TextInput(node Node) Action[string] ? -> nodeCallbacks(node)?.OnTextInput

    internal func TextComposition(node Node)((TextCompositionEvent) -> void) ? -> nodeCallbacks(node)?.OnTextComposition

    internal func TextCompositionCancel(node Node) Action ? -> nodeCallbacks(node)?.OnTextCompositionCancel

    internal func TextCandidates(node Node)((TextCandidateEvent) -> void) ? -> nodeCallbacks(node)?.OnTextCandidates

    private func blobCallbacks(blob Blob, create bool) TextInputCallbackSet? {
      if let values = blobValues {
        if values.TryGetValue(blob, out var callbacks) { return callbacks }
      }
      if !create { return nil }
      if blobValues == nil {
        blobValues = ConditionalWeakTable[Blob, TextInputCallbackSet]()
      }
      let created = TextInputCallbackSet()
      blobValues!!.Add(blob, created)
      return created
    }

    private func finishBlob(blob Blob, callbacks TextInputCallbackSet) bool {
      if callbacks.Empty() {
        blobValues?.Remove(blob)
        return false
      }
      return true
    }

    private func nodeCallbacks(node Node) TextInputCallbackSet? {
      if !node.HasSparseInputState { return nil }
      return if let values = nodeValues {
        if values.TryGetValue(node, out var callbacks) { callbacks } else { nil }
      } else { nil }
    }

    private func presence(value TextInputCallbackSet?) int32 {
      if value == nil { return 0 }
      var result int32
      if value.OnTextInput != nil { result = result | 1 }
      if value.OnTextComposition != nil { result = result | 2 }
      if value.OnTextCompositionCancel != nil { result = result | 4 }
      if value.OnTextCandidates != nil { result = result | 8 }
      return result
    }
  }
}
