package Goo

import System
import System.Collections.Generic
import System.Runtime.ExceptionServices

/// Reports the native transfer operations supported by an open desktop window.
@Flags
public enum NativeTransferCapabilities {
  /// No native transfer operation is available.
  None = 0;
  /// The host can deliver owned external file lists to DropTarget.
  FileDrop = 1;
  /// The host reports drag positions before the final file list is available.
  DropPreview = 2;
  /// The host can offer application data to other applications.
  OutboundData = 4;
  /// The host can report a target's negotiated effect back to the source application.
  EffectNegotiation = 8;
}

/// Contains an owned external file list, or an empty preview before the host delivers paths.
public sealed class NativeFileDrop {
  private let paths IReadOnlyList[string]
  /// Gets absolute file paths without reading file contents; the list survives the drag and window lifetime.
  public prop Paths IReadOnlyList[string]{ get -> paths }
  /// Gets whether paths are still unavailable; preview acceptance must not depend on individual files.
  public prop IsPreview bool{ get; private set }
  internal init(paths []string, preview bool) {
    this.paths = Array.AsReadOnly[string](paths)
    IsPreview = preview
  }
}

internal class NativeDropSession {
  internal var Data DragData
  internal var Target Node?
  internal var X float32
  internal var Y float32
  internal var Modifiers KeyModifiers
  internal init(data DragData) { Data = data }
}

internal class NativeDropRouter {
  private let getRoot(() -> Node?)
  private let canReceive(() -> bool)
  private let invalidate Action
  private let path List[Node] = List[Node]()
  private var current NativeDropSession?
  private var generation int64

  internal init(getRoot(() -> Node?), canReceive(() -> bool), invalidate Action) {
    this.getRoot = getRoot
    this.canReceive = canReceive
    this.invalidate = invalidate
  }

  internal func Begin(data DragData, x float32, y float32, modifiers KeyModifiers) {
    let version = generation + 1
    Cancel()
    if generation != version || !canReceive() { return }
    let session = NativeDropSession(data)
    current = session
    Update(session, x, y, modifiers, true)
  }

  internal func Move(x float32, y float32, modifiers KeyModifiers) {
    if let session = current { Update(session, x, y, modifiers, true) }
  }

  internal func Complete(data DragData, x float32, y float32, modifiers KeyModifiers) {
    guard let session = current else { return }
    session.Data = data
    Update(session, x, y, modifiers, false)
    if current != session { return }
    guard let root = getRoot(), let target = session.Target else { Cancel()
      return }
    current = nil
    generation++
    if canReceive() && DragTargetRouting.Available(root, target) {
      Notify(root, session, target, DragEventKind.Drop, DragEffect.Copy)
    }
  }

  internal func Cancel() {
    let previous = current
    current = nil
    generation++
    if let session = previous {
      if let target = session.Target, let root = getRoot() {
        if DragTargetRouting.Available(root, target) { Notify(root, session, target, DragEventKind.Leave, DragEffect.None) }
      }
    }
  }

  internal func Validate() {
    guard let session = current else { return }
    guard let root = getRoot() else { Cancel()
      return }
    if !canReceive() { Cancel()
      return }
    if let target = session.Target {
      if !DragTargetRouting.Available(root, target) { Cancel() }
    }
  }

  private func Update(session NativeDropSession, x float32, y float32,
    modifiers KeyModifiers, moved bool) {
      if !canReceive() || !Single.IsFinite(x) || !Single.IsFinite(y) { Cancel()
        return }
      guard let root = getRoot() else { Cancel()
        return }
      session.X = x
      session.Y = y
      session.Modifiers = modifiers
      try {
        path.Clear()
        hitChainInto(root, x, y, path)
        var selected Node?
        if DragTargetRouting.AllowsPath(path) {
          for var i = path.Count; i > 0; i-- {
            let target = path[i - 1]
            if !DragTargetRouting.Available(root, target) { continue }
            if let descriptor = DragDropMetadata.Target(target) {
              if let event = Event(session, target, DragEventKind.Move, DragEffect.None) {
                let accepted = acceptedDragEffect(descriptor.Query(event), DragEffect.Copy)
                Rebuild(root, target)
                if current != session || !canReceive() { return }
                if accepted == DragEffect.Copy && DragTargetRouting.Available(root, target) { selected = target
                  break }
              }
            }
          }
        }
        if current != session { return }
        let previous = session.Target
        if previous != selected {
          session.Target = nil
          if let old = previous { if DragTargetRouting.Available(root, old) { Notify(root, session, old, DragEventKind.Leave, DragEffect.None) } }
          if current != session || !canReceive() { return }
          if let target = selected {
            if DragTargetRouting.Available(root, target) {
              session.Target = target
              Notify(root, session, target, DragEventKind.Enter, DragEffect.Copy)
            }
          }
        } else if moved {
          if let target = selected { Notify(root, session, target, DragEventKind.Move, DragEffect.Copy) }
        }
      } catch (error Exception) {
        if current == session {
          try { Cancel() } catch (cleanup Exception) { }
        }
        ExceptionDispatchInfo.Capture(error).Throw()
      } finally { path.Clear() }
    }

  private func Event(session NativeDropSession, target Node, kind DragEventKind, effect DragEffect) DragEvent? ->
    DragTargetRouting.CreateEvent(session.Data, target, kind, session.X, session.Y,
      session.Modifiers, DragEffect.Copy, effect, -1L, PointerDevice.Mouse)

  private func Notify(root Node, session NativeDropSession, target Node, kind DragEventKind, effect DragEffect) {
    guard let descriptor = DragDropMetadata.Target(target), let event = Event(session, target, kind, effect) else { return }
    descriptor.Changed?.Invoke(event)
    Rebuild(root, target)
  }
  private func Rebuild(root Node, target Node) {
    CellOwnership.Within(root, target)?.Rebuild()
    invalidate()
  }
}
