package Goo

import System
import System.Runtime.CompilerServices

internal class InputDispatchControl {
  internal var Active bool
  internal var Generation int64
  internal var PropagationStopped bool
  internal var DefaultPrevented bool

  internal func Begin(generation int64) {
    Generation = generation
    PropagationStopped = false
    DefaultPrevented = false
    Active = true
  }

  internal func Finish(generation int64) {
    if Active && Generation == generation {
      Active = false
    }
  }

  internal func Stop(generation int64) {
    if Active && Generation == generation {
      PropagationStopped = true
    }
  }

  internal func Prevent(generation int64) {
    if Active && Generation == generation {
      DefaultPrevented = true
    }
  }
}

/// Describes a keyboard callback.
public struct KeyEvent {
  /// Gets the physical key.
  public prop Key Key{ get; init; }
  /// Gets the modifier keys held for this event.
  public prop Modifiers KeyModifiers{ get; init; }
  /// Reports whether this key down came from Goo key repeat.
  public prop Repeat bool{ get; init; }
  internal prop Control InputDispatchControl? { get; init; }
  internal prop Generation int64{ get; init; }

  /// Stops this event before the next ancestor callback without preventing its default behavior.
  public func StopPropagation() {
    if let control = Control { control.Stop(Generation) }
  }

  /// Prevents the default keyboard behavior without stopping ancestor callbacks.
  public func PreventDefault() {
    if let control = Control { control.Prevent(Generation) }
  }
}

/// Describes a non-cancelable focus lifecycle callback.
public struct FocusEvent {
  internal prop Control InputDispatchControl? { get; init; }
  internal prop Generation int64{ get; init; }

  /// Stops this lifecycle event before the next ancestor callback. Focus has already changed.
  public func StopPropagation() {
    if let control = Control { control.Stop(Generation) }
  }
}

internal class InputCallbackSet {
  internal var OnKeyDown((KeyEvent) -> void)?
  internal var OnKeyUp((KeyEvent) -> void)?
  internal var OnFocus((FocusEvent) -> void)?
  internal var OnBlur((FocusEvent) -> void)?
  internal var OnPointerEnter((PointerEvent) -> void)?
  internal var OnPointerLeave((PointerEvent) -> void)?

  internal func Empty() bool -> OnKeyDown == nil && OnKeyUp == nil && OnFocus == nil && OnBlur == nil
    && OnPointerEnter == nil && OnPointerLeave == nil
}

// Sparse callback state keeps ordinary declarations and retained nodes unchanged.
internal class InputCallbacks {
  shared {
    private let blobValues ConditionalWeakTable[Blob, InputCallbackSet] =
    ConditionalWeakTable[Blob, InputCallbackSet]()
    private let nodeValues ConditionalWeakTable[Node, InputCallbackSet] =
    ConditionalWeakTable[Node, InputCallbackSet]()

    internal func SetBlobKeyDown(blob Blob, value((KeyEvent) -> void)?) bool {
      let callbacks = blobCallbacks(blob, value != nil)
      if callbacks == nil { return false }
      callbacks.OnKeyDown = value
      return finishBlob(blob, callbacks)
    }

    internal func BlobKeyDown(blob Blob)((KeyEvent) -> void) ? -> blobCallbacks(blob, false)?.OnKeyDown

    internal func SetBlobKeyUp(blob Blob, value((KeyEvent) -> void)?) bool {
      let callbacks = blobCallbacks(blob, value != nil)
      if callbacks == nil { return false }
      callbacks.OnKeyUp = value
      return finishBlob(blob, callbacks)
    }

    internal func BlobKeyUp(blob Blob)((KeyEvent) -> void) ? -> blobCallbacks(blob, false)?.OnKeyUp

    internal func SetBlobFocus(blob Blob, value((FocusEvent) -> void)?) bool {
      let callbacks = blobCallbacks(blob, value != nil)
      if callbacks == nil { return false }
      callbacks.OnFocus = value
      return finishBlob(blob, callbacks)
    }

    internal func BlobFocus(blob Blob)((FocusEvent) -> void) ? -> blobCallbacks(blob, false)?.OnFocus

    internal func SetBlobBlur(blob Blob, value((FocusEvent) -> void)?) bool {
      let callbacks = blobCallbacks(blob, value != nil)
      if callbacks == nil { return false }
      callbacks.OnBlur = value
      return finishBlob(blob, callbacks)
    }

    internal func BlobBlur(blob Blob)((FocusEvent) -> void) ? -> blobCallbacks(blob, false)?.OnBlur

    internal func SetBlobPointerEnter(blob Blob, value((PointerEvent) -> void)?) bool {
      let callbacks = blobCallbacks(blob, value != nil)
      if callbacks == nil { return false }
      callbacks.OnPointerEnter = value
      return finishBlob(blob, callbacks)
    }

    internal func BlobPointerEnter(blob Blob)((PointerEvent) -> void) ? -> blobCallbacks(blob, false)?.OnPointerEnter

    internal func SetBlobPointerLeave(blob Blob, value((PointerEvent) -> void)?) bool {
      let callbacks = blobCallbacks(blob, value != nil)
      if callbacks == nil { return false }
      callbacks.OnPointerLeave = value
      return finishBlob(blob, callbacks)
    }

    internal func BlobPointerLeave(blob Blob)((PointerEvent) -> void) ? -> blobCallbacks(blob, false)?.OnPointerLeave

    internal func Sync(node Node, blob Blob) bool {
      var source InputCallbackSet?
      if blobValues.TryGetValue(blob, out var blobCallbacks) {
        source = blobCallbacks
      }
      var destination InputCallbackSet?
      if nodeValues.TryGetValue(node, out var nodeCallbacks) {
        destination = nodeCallbacks
      }
      let sourcePresence = presence(source)
      let destinationPresence = presence(destination)
      if source == nil {
        nodeValues.Remove(node)
        node.HasSparseInputState = node.HasElementHandle
          || TextInputCallbacks.HasNodeCallbacks(node)
          || DragDropMetadata.HasNodeBindings(node)
        return sourcePresence != destinationPresence
      }
      if destination == nil {
        destination = InputCallbackSet()
        nodeValues.Add(node, destination)
      }
      destination.OnKeyDown = source.OnKeyDown
      destination.OnKeyUp = source.OnKeyUp
      destination.OnFocus = source.OnFocus
      destination.OnBlur = source.OnBlur
      destination.OnPointerEnter = source.OnPointerEnter
      destination.OnPointerLeave = source.OnPointerLeave
      node.HasSparseInputState = true
      return sourcePresence != destinationPresence
    }

    internal func KeyDown(node Node)((KeyEvent) -> void) ? -> nodeCallbacks(node)?.OnKeyDown

    internal func KeyUp(node Node)((KeyEvent) -> void) ? -> nodeCallbacks(node)?.OnKeyUp

    internal func Focus(node Node)((FocusEvent) -> void) ? -> nodeCallbacks(node)?.OnFocus

    internal func Blur(node Node)((FocusEvent) -> void) ? -> nodeCallbacks(node)?.OnBlur

    internal func PointerEnter(node Node)((PointerEvent) -> void) ? -> nodeCallbacks(node)?.OnPointerEnter

    internal func PointerLeave(node Node)((PointerEvent) -> void) ? -> nodeCallbacks(node)?.OnPointerLeave

    private func blobCallbacks(blob Blob, create bool) InputCallbackSet? {
      if blobValues.TryGetValue(blob, out var value) {
        return value
      }
      if !create { return nil }
      let created = InputCallbackSet()
      blobValues.Add(blob, created)
      return created
    }

    internal func HasBlobCallbacks(blob Blob) bool -> blobValues.TryGetValue(blob, out var value) && !value.Empty()

    internal func HasNodeCallbacks(node Node) bool -> nodeValues.TryGetValue(node, out var value) && !value.Empty()

    private func finishBlob(blob Blob, callbacks InputCallbackSet) bool {
      if callbacks.Empty() {
        blobValues.Remove(blob)
        return false
      }
      return true
    }

    private func nodeCallbacks(node Node) InputCallbackSet? {
      if !node.HasSparseInputState { return nil }
      if nodeValues.TryGetValue(node, out var value) {
        return value
      }
      return nil
    }

    private func presence(value InputCallbackSet?) int32 {
      if value == nil { return 0 }
      var result int32
      if value.OnKeyDown != nil { result = result | 1 }
      if value.OnKeyUp != nil { result = result | 2 }
      if value.OnFocus != nil { result = result | 4 }
      if value.OnBlur != nil { result = result | 8 }
      if value.OnPointerEnter != nil { result = result | 16 }
      if value.OnPointerLeave != nil { result = result | 32 }
      return result
    }
  }
}
