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
  /// The host reports drag positions before final transfer data is available.
  DropPreview = 2;
  /// The host can offer application data to other applications.
  OutboundData = 4;
  /// The host can report a target's negotiated effect back to the source application.
  EffectNegotiation = 8;
  /// The host can deliver owned MIME data and URI references to DropTarget.
  DataDrop = 16;
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

/// Contains the allowed MIME formats and owned data for one native offer.
public sealed class NativeDataDrop {
  /// Gets the offered formats that match the window's exact allow-list.
  public prop Formats IReadOnlyList[string] { get; }
  /// Gets captured bytes and URI references, or empty data during preview.
  public prop Data TransferData { get; }
  /// Gets whether final data is still unavailable.
  public prop IsPreview bool { get; }

  internal init(formats []string, data TransferData, preview bool) {
    Formats = Array.AsReadOnly[string](formats)
    Data = data
    IsPreview = preview
  }
}

internal class NativeDropSession {
  internal var Data DragData
  internal var Target Node?
  internal var X float32
  internal var Y float32
  internal var Modifiers KeyModifiers
  internal var Effect DragEffect
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

  internal func Begin(data DragData, x float32, y float32, modifiers KeyModifiers) DragEffect {
    let version = generation + 1
    Cancel()
    if generation != version || !canReceive() { return DragEffect.None }
    let session = NativeDropSession(data)
    current = session
    Update(session, x, y, modifiers, true)
    return if current == session { session.Effect } else { DragEffect.None }
  }

  internal func Move(x float32, y float32, modifiers KeyModifiers) DragEffect {
    guard let session = current else { return DragEffect.None }
    Update(session, x, y, modifiers, true)
    return if current == session { session.Effect } else { DragEffect.None }
  }

  internal func Complete(data DragData, x float32, y float32, modifiers KeyModifiers, accepted Action[DragEffect]? = nil) DragEffect {
    guard let session = current else { return DragEffect.None }
    session.Data = data
    Update(session, x, y, modifiers, false)
    if current != session { return DragEffect.None }
    guard let root = getRoot(), let target = session.Target else { Cancel()
      return DragEffect.None }
    current = nil
    generation++
    if !canReceive() || !DragTargetRouting.Available(root, target) { return DragEffect.None }
    accepted?.Invoke(session.Effect)
    Notify(root, session, target, DragEventKind.Drop, session.Effect)
    return session.Effect
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
        var selectedEffect = DragEffect.None
        if DragTargetRouting.AllowsPath(path) {
          let start = DragTargetRouting.RouteStart(path)
          for var i = path.Count; i > start; i-- {
            let target = path[i - 1]
            if !DragTargetRouting.Available(root, target) { continue }
            if let descriptor = DragDropMetadata.Target(target) {
              if let event = Event(session, target, DragEventKind.Move, DragEffect.None) {
                let owner = CellOwnership.Within(root, target)
                var accepted DragEffect
                try { accepted = acceptedDragEffect(descriptor.Query(event), session.Data.AllowedEffects) }
                finally { Rebuild(owner) }
                if current != session || !canReceive() { return }
                if DragTargetRouting.Available(root, target) {
                  if accepted != DragEffect.None { selected = target
                    selectedEffect = accepted
                    break }
                  if descriptor.StopAncestorRouting { break }
                }
              }
            }
          }
        }
        if current != session { return }
        let previous = session.Target
        session.Effect = selectedEffect
        if previous != selected {
          session.Target = nil
          if let old = previous { if DragTargetRouting.Available(root, old) { Notify(root, session, old, DragEventKind.Leave, DragEffect.None) } }
          if current != session || !canReceive() { return }
          if let target = selected {
            if DragTargetRouting.Available(root, target) {
              session.Target = target
              Notify(root, session, target, DragEventKind.Enter, session.Effect)
            }
          }
        } else if moved {
          if let target = selected { Notify(root, session, target, DragEventKind.Move, session.Effect) }
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
      session.Modifiers, session.Data.AllowedEffects, effect, -1L, PointerDevice.Mouse)

  private func Notify(root Node, session NativeDropSession, target Node, kind DragEventKind, effect DragEffect) {
    guard let descriptor = DragDropMetadata.Target(target), let event = Event(session, target, kind, effect) else { return }
    let owner = CellOwnership.Within(root, target)
    try { descriptor.Changed?.Invoke(event) }
    finally { Rebuild(owner) }
  }
  private func Rebuild(owner Cell?) {
    owner?.Rebuild()
    invalidate()
  }
}
