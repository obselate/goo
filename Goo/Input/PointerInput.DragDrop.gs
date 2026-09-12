package Goo

import System
import System.Collections.Generic
import System.Runtime.ExceptionServices

internal class PointerDragSession {
  internal let Source Node
  internal let Data DragData
  internal let PointerId int64
  internal let Device PointerDevice
  internal var Target Node?
  internal var Effect DragEffect
  internal var Terminating bool
  internal var EndDelivered bool

  internal init(source Node, data DragData, pointerId int64, device PointerDevice) {
    Source = source
    Data = data
    PointerId = pointerId
    Device = device
  }
}

internal partial class PointerInput {
  private func rememberDragCandidate() {
    clearDragCandidate()
    if dragSession != nil || !isSemanticPrimary() {
      return
    }
    if current.DragEntry != nil || current.DragEditor != nil || hasScrollDrag() || current.CaptureTarget != nil {
      return
    }
    for var i = current.PressChain.Count; i > 0; i-- {
      let node = current.PressChain[i - 1]
      if DragDropMetadata.Source(node) != nil {
        dragCandidate = node
        dragPointerId = current.Id
        dragPointerDevice = current.Device
        return
      }
    }
  }

  private func clearDragCandidate() {
    dragCandidate = nil
    dragPointerId = 0
    dragPointerDevice = PointerDevice.Mouse
  }

  private func dragPointerMatches() bool -> current.Id == dragPointerId
    && current.Device == dragPointerDevice

  private func dragThresholdCrossed(x float32, y float32) bool ->
  MathF.Abs(x - current.LastPressX) >= 4.0F || MathF.Abs(y - current.LastPressY) >= 4.0F

  private func startDragIfReady(root Node?, x float32, y float32,
    modifiers KeyModifiers) bool{
      guard let source = dragCandidate else { return false }
      if !dragPointerMatches() || !dragThresholdCrossed(x, y) { return false }
      clearDragCandidate()
      guard let tree = root else { return false }
      if !containsPath(tree, source) || !canReceiveInput(source) { return false }
      guard let descriptor = DragDropMetadata.Source(source) else { return false }
      let generation = dragGeneration
      let mapped = TransformGeometry.WindowToNode(source, x, y)
      if !mapped.Valid { return false }
      var data DragData?
      try {
        data = descriptor.Create(DragStartEvent{
          PointerId: current.Id,
          Device: current.Device,
          Modifiers: modifiers,
          Position: Point{ X: float64(mapped.X - source.Rect.X),
            Y: float64(mapped.Y - source.Rect.Y) },
          WindowPosition: Point{ X: float64(x), Y: float64(y) },
        })
        rebuildDragOwner(tree, source)
      } catch (error Exception) {
        current.ClickTarget = nil
        ExceptionDispatchInfo.Capture(error).Throw()
      }
      guard let payload = data else { return false }
      if dragGeneration != generation { return false }
      if !containsPath(tree, source) || !canReceiveInput(source)
        || DragDropMetadata.Source(source) == nil {
          return false
        }
      let session = PointerDragSession(source, payload, current.Id, current.Device)
      dragSession = session
      dragPointerId = current.Id
      dragPointerDevice = current.Device
      current.ClickTarget = nil
      current.DragEntry = nil
      current.DragEditor = nil
      current.DragEditorStarted = false
      current.CaptureTarget = source
      current.CaptureButton = PointerButton.Primary
      if !rebuildCapturePath(tree) {
        terminateDrag(tree, DragEndKind.Canceled, DragEffect.None, false, nil)
        return false
      }
      try {
        updateDragTarget(tree, x, y, modifiers, true)
      } catch (error Exception) {
        terminateDrag(tree, DragEndKind.Canceled, DragEffect.None, true, error)
      }
      return dragSession == session
    }

  private func activeDragMatches() bool -> if let session = dragSession {
    !session.Terminating && session.PointerId == current.Id
      && session.Device == current.Device
  } else { false }

  private func currentOwnsDragState() bool -> activeDragMatches()
    || (dragCandidate != nil && dragPointerMatches())

  private func dragSessionCurrent(session PointerDragSession) bool ->
  dragSession == session && !session.Terminating

  private func ensureDragSession(root Node, session PointerDragSession) bool {
    if !dragSessionCurrent(session) { return false }
    if containsPath(root, session.Source) && canReceiveInput(session.Source)
      && DragDropMetadata.Source(session.Source) != nil {
        return true
      }
    terminateDrag(root, DragEndKind.Canceled, DragEffect.None, true, nil)
    return false
  }

  private func dragTargetAvailable(root Node, target Node) bool ->
  containsPath(root, target) && canReceiveInput(target)
    && DragDropMetadata.Target(target) != nil

  private func dragEvent(session PointerDragSession, target Node, kind DragEventKind,
    x float32, y float32, modifiers KeyModifiers, effect DragEffect) DragEvent? {
      let mapped = TransformGeometry.WindowToNode(target, x, y)
      if !mapped.Valid { return nil }
      return DragEvent{
        Kind: kind,
        Data: session.Data,
        PointerId: session.PointerId,
        Device: session.Device,
        Modifiers: modifiers,
        Position: Point{ X: float64(mapped.X - target.Rect.X),
          Y: float64(mapped.Y - target.Rect.Y) },
        WindowPosition: Point{ X: float64(x), Y: float64(y) },
        AllowedEffects: session.Data.AllowedEffects,
        Effect: effect,
      }
    }

  private func queryDragTarget(root Node, session PointerDragSession, x float32, y float32,
    modifiers KeyModifiers) Node? {
      let path = dragTargetPath()
      path.Clear()
      hitChainInto(root, x, y, path)
      if chainDisabled(path) {
        path.Clear()
        session.Effect = DragEffect.None
        return nil
      }
      var selected Node?
      var effect = DragEffect.None
      for var i = path.Count; i > 0; i-- {
        let target = path[i - 1]
        if let descriptor = DragDropMetadata.Target(target) {
          if let event = dragEvent(session, target, DragEventKind.Move, x, y,
            modifiers, DragEffect.None) {
              let queried = descriptor.Query(event)
              rebuildDragOwner(root, target)
              if !ensureDragSession(root, session) {
                path.Clear()
                return nil
              }
              if dragTargetAvailable(root, target) {
                let accepted = acceptedDragEffect(queried, session.Data.AllowedEffects)
                if accepted != DragEffect.None {
                  selected = target
                  effect = accepted
                  break
                }
              }
            }
        }
      }
      path.Clear()
      session.Effect = effect
      return selected
    }

  private func dragTargetPath() List[Node] {
    if let path = dragHitPath { return path }
    let path = List[Node]()
    dragHitPath = path
    return path
  }

  private func notifyDragTarget(root Node, session PointerDragSession, target Node,
    kind DragEventKind, x float32, y float32, modifiers KeyModifiers,
    effect DragEffect) bool{
      let terminalLeave = kind == DragEventKind.Leave && session.Terminating
      if dragSession != session || (session.Terminating && !terminalLeave)
        || !dragTargetAvailable(root, target) {
          return false
        }
      guard let descriptor = DragDropMetadata.Target(target) else { return false }
      guard let event = dragEvent(session, target, kind, x, y, modifiers, effect) else { return false }
      descriptor.Changed?.Invoke(event)
      rebuildDragOwner(root, target)
      if terminalLeave {
        return dragSession == session && dragTargetAvailable(root, target)
      }
      return ensureDragSession(root, session) && dragTargetAvailable(root, target)
    }

  private func updateDragTarget(root Node, x float32, y float32, modifiers KeyModifiers,
    notifyMove bool) {
      guard let session = dragSession else { return }
      if session.Terminating { return }
      if !ensureDragSession(root, session) { return }
      let previous = session.Target
      let selected = queryDragTarget(root, session, x, y, modifiers)
      if !dragSessionCurrent(session) { return }
      let effect = session.Effect
      if previous != selected {
        session.Target = nil
        if let oldTarget = previous {
          notifyDragTarget(root, session, oldTarget, DragEventKind.Leave, x, y,
            modifiers, DragEffect.None)
          if !dragSessionCurrent(session) { return }
        }
        if let nextTarget = selected {
          if dragTargetAvailable(root, nextTarget) {
            session.Target = nextTarget
            let retained = notifyDragTarget(root, session, nextTarget, DragEventKind.Enter,
              x, y, modifiers, effect)
            if !dragSessionCurrent(session) { return }
            if !retained {
              session.Target = nil
              session.Effect = DragEffect.None
            }
          }
        }
      } else if notifyMove {
        if let currentTarget = selected {
          let retained = notifyDragTarget(root, session, currentTarget, DragEventKind.Move,
            x, y, modifiers, effect)
          if !dragSessionCurrent(session) { return }
          if !retained {
            session.Target = nil
            session.Effect = DragEffect.None
          }
        }
      }
    }

  private func dropDrag(root Node, x float32, y float32, modifiers KeyModifiers) {
    guard let session = dragSession else { return }
    try {
      updateDragTarget(root, x, y, modifiers, false)
      if !dragSessionCurrent(session) { return }
      guard let target = session.Target else {
        terminateDrag(root, DragEndKind.Canceled, DragEffect.None, true, nil)
        return
      }
      let effect = session.Effect
      if !dragTargetAvailable(root, target) {
        terminateDrag(root, DragEndKind.Canceled, DragEffect.None, false, nil)
        return
      }
      if !dispatchDrop(root, session, target, x, y, modifiers, effect) {
        terminateDrag(root, DragEndKind.Canceled, DragEffect.None, false, nil)
        return
      }
      if !dragSessionCurrent(session) { return }
      terminateDrag(root, DragEndKind.Dropped, effect, false, nil)
    } catch (error Exception) {
      if dragSession == session {
        terminateDrag(root, DragEndKind.Canceled, DragEffect.None, true, error)
      }
      ExceptionDispatchInfo.Capture(error).Throw()
    }
  }

  private func dispatchDrop(root Node, session PointerDragSession, target Node,
    x float32, y float32, modifiers KeyModifiers, effect DragEffect) bool{
      if !dragSessionCurrent(session) || !dragTargetAvailable(root, target) { return false }
      guard let descriptor = DragDropMetadata.Target(target) else { return false }
      guard let event = dragEvent(session, target, DragEventKind.Drop, x, y,
        modifiers, effect) else { return false }
      if let callback = descriptor.Changed {
        callback(event)
        rebuildDragOwner(root, target)
      }
      return true
    }

  private func terminateDrag(root Node?, kind DragEndKind, effect DragEffect,
    notifyLeave bool, original Exception?) {
      guard let session = dragSession else {
        if let error = original { ExceptionDispatchInfo.Capture(error).Throw() }
        return
      }
      if session.Terminating {
        if let error = original { ExceptionDispatchInfo.Capture(error).Throw() }
        return
      }
      session.Terminating = true
      var failure = original
      try {
        if notifyLeave {
          if let tree = root {
            if let target = session.Target {
              try {
                notifyDragTarget(tree, session, target, DragEventKind.Leave,
                  current.LastEventX, current.LastEventY, current.LastModifiers, DragEffect.None)
              } catch (error Exception) {
                if failure == nil { failure = error }
              }
            }
          }
        }
        if !session.EndDelivered {
          session.EndDelivered = true
          if let tree = root {
            if containsPath(tree, session.Source) && !session.Source.Retired {
              if let source = DragDropMetadata.Source(session.Source) {
                if let callback = source.End {
                  try {
                    callback(DragEndEvent{ Kind: kind, Effect: effect })
                    rebuildDragOwner(tree, session.Source)
                  } catch (error Exception) {
                    if failure == nil { failure = error }
                  }
                }
              }
            }
          }
        }
      } finally {
        session.Target = nil
        session.Effect = DragEffect.None
        if dragSession == session { dragSession = nil }
        dragGeneration++
        clearCapture()
        clearDragCandidate()
        current.ClickTarget = nil
      }
      if let error = failure { ExceptionDispatchInfo.Capture(error).Throw() }
    }

  private func cancelDrag(root Node?) bool {
    let active = dragSession != nil
    clearDragCandidate()
    if !active { dragGeneration++ }
    guard let session = dragSession else { return false }
    if !activeDragMatches() {
      if session.Device == PointerDevice.Mouse {
        current = mouse
      } else if let contact = findContact(session.PointerId, session.Device, false) {
        current = contact
      }
    }
    try {
      terminateDrag(root, DragEndKind.Canceled, DragEffect.None, true, nil)
    } finally {
      current = mouse
    }
    return active
  }

  private func cancelCurrentDrag(root Node?) bool {
    let candidate = dragCandidate != nil && dragPointerMatches()
    let active = activeDragMatches()
    if candidate { clearDragCandidate() }
    if active {
      terminateDrag(root, DragEndKind.Canceled, DragEffect.None, true, nil)
    }
    return candidate || active
  }

  internal func HandleDragKey(root Node?, key Key, modifiers KeyModifiers) bool {
    guard let session = dragSession else { return false }
    if session.Device != PointerDevice.Mouse {
      guard let contact = findContact(session.PointerId, session.Device, false) else { return false }
      current = contact
    } else {
      current = mouse
    }
    try {
      if key == Key.Escape {
        terminateDrag(root, DragEndKind.Canceled, DragEffect.None, true, nil)
        return true
      }
      guard let tree = root else { return false }
      if sameDragModifiers(current.LastModifiers, modifiers) { return false }
      current.LastModifiers = modifiers
      try {
        updateDragTarget(tree, current.LastEventX, current.LastEventY, modifiers, true)
      } catch (error Exception) {
        terminateDrag(tree, DragEndKind.Canceled, DragEffect.None, true, error)
      }
      return false
    } finally {
      current = mouse
    }
  }

  private func sameDragModifiers(left KeyModifiers, right KeyModifiers) bool ->
  left.Alt == right.Alt && left.Shift == right.Shift && left.Ctrl == right.Ctrl
    && left.Super == right.Super

  private func afterDragTreeUpdated(root Node) {
    if !currentOwnsDragState() { return }
    if let candidate = dragCandidate {
      if !containsPath(root, candidate) || !canReceiveInput(candidate)
        || DragDropMetadata.Source(candidate) == nil {
          clearDragCandidate()
        }
    }
    guard let session = dragSession else { return }
    if !containsPath(root, session.Source) || !canReceiveInput(session.Source)
      || DragDropMetadata.Source(session.Source) == nil {
        terminateDrag(root, DragEndKind.Canceled, DragEffect.None, true, nil)
        return
      }
    try {
      updateDragTarget(root, current.LastEventX, current.LastEventY, current.LastModifiers, true)
    } catch (error Exception) {
      terminateDrag(root, DragEndKind.Canceled, DragEffect.None, true, error)
    }
  }

  private func rebuildDragOwner(root Node, target Node) {
    if let owner = findOwner(root, target, nil) { owner.Rebuild() }
  }
}
