package Goo

import System
import System.Collections.Generic
import System.Runtime.ExceptionServices

internal class PointerDragSession {
  internal let Source Node
  internal let Data DragData
  internal let PointerId int64
  internal let Device PointerDevice
  internal let IsPointer bool
  internal var RequestedTarget Node?
  internal var X float32
  internal var Y float32
  internal var Modifiers KeyModifiers
  internal var Target Node?
  internal var Effect DragEffect
  internal var Terminating bool
  internal var Negotiating bool
  internal var EndDelivered bool
  internal var NativeActive bool

  internal init(source Node, data DragData, pointerId int64, device PointerDevice, isPointer bool) {
    Source = source
    Data = data
    PointerId = pointerId
    Device = device
    IsPointer = isPointer
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
      return beginDrag(root, source, x, y, modifiers, true)
    }

  private func beginDrag(root Node?, source Node, x float32, y float32,
    modifiers KeyModifiers, isPointer bool) bool {
      if dragSession != nil || creatingDrag { return false }
      guard let tree = root else { return false }
      if !containsPath(tree, source) || !canReceiveInput(source) { return false }
      guard let descriptor = DragDropMetadata.Source(source) else { return false }
      let generation = dragGeneration
      let mapped = TransformGeometry.WindowToNode(source, x, y)
      if !mapped.Valid { return false }
      var data DragData?
      let owner = CellOwnership.Within(tree, source)
      creatingDrag = true
      try {
        try {
          data = descriptor.Create(DragStartEvent{
            IsPointer: isPointer,
            PointerId: isPointer ? current.Id : 0,
            Device: isPointer ? current.Device : PointerDevice.Mouse,
            Modifiers: modifiers,
            Position: Point{ X: float64(mapped.X - source.Rect.X),
              Y: float64(mapped.Y - source.Rect.Y) },
            WindowPosition: Point{ X: float64(x), Y: float64(y) },
          })
        } finally { owner?.Rebuild() }
      } catch (error Exception) {
        if isPointer { current.ClickTarget = nil }
        ExceptionDispatchInfo.Capture(error).Throw()
      } finally { creatingDrag = false }
      guard let payload = data else { return false }
      if dragGeneration != generation { return false }
      if !containsPath(tree, source) || !canReceiveInput(source)
        || DragDropMetadata.Source(source) == nil {
          return false
        }
      let session = PointerDragSession(source, payload, isPointer ? current.Id : 0,
        isPointer ? current.Device : PointerDevice.Mouse, isPointer)
      dragSession = session
      session.X = x
      session.Y = y
      session.Modifiers = modifiers
      if isPointer {
        dragPointerId = current.Id
        dragPointerDevice = current.Device
        current.ClickTarget = nil
        current.DragEntry = nil
        current.DragEditor = nil
        current.DragSelectionStarted = false
        current.CaptureTarget = source
        current.CaptureButton = PointerButton.Primary
        if !rebuildCapturePath(tree) {
          terminateDrag(tree, DragEndKind.Canceled, DragEffect.None, false, nil)
          return false
        }
      }
      try {
        updateDragTarget(tree, x, y, modifiers, true)
      } catch (error Exception) {
        terminateDrag(tree, DragEndKind.Canceled, DragEffect.None, true, error)
      }
      return dragSession == session
    }

  private func activeDragMatches() bool -> if let session = dragSession {
    !session.Terminating && !session.NativeActive && session.IsPointer && session.PointerId == current.Id
      && session.Device == current.Device
  } else { false }

  private func currentOwnsDragState() bool -> activeDragMatches()
    || (dragCandidate != nil && dragPointerMatches())

  private func promoteNativeDrag(root Node, x float32, y float32) bool {
    guard let session = dragSession, let files = session.Data.NativeFiles,
      let host = nativeDragHost else { return false }
    if session.NativeActive || !session.IsPointer || session.Device != PointerDevice.Mouse
      || (x >= 0.0F && y >= 0.0F && x < float32(host.LogicalWidth)
        && y < float32(host.LogicalHeight)) { return false }
    session.NativeActive = true
    let started = host.BeginNativeFileDrag(files, (accepted bool) -> {
      if dragSession != session || !session.NativeActive { return }
      let previous = current
      current = mouse
      try {
        terminateDrag(root, accepted ? DragEndKind.Dropped : DragEndKind.Canceled,
          accepted ? DragEffect.Copy : DragEffect.None, false, nil)
      } finally { current = previous }
    })
    if !started { session.NativeActive = false
      return false }
    clearCapture()
    current.ClickTarget = nil
    return true
  }

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

  private func dragEvent(session PointerDragSession, target Node, kind DragEventKind,
    x float32, y float32, modifiers KeyModifiers, effect DragEffect) DragEvent? ->
    DragTargetRouting.CreateEvent(session.Data, target, kind, x, y, modifiers,
      session.Data.AllowedEffects, effect, session.PointerId, session.Device, session.IsPointer)

  private func queryDragTarget(root Node, session PointerDragSession, x float32, y float32,
    modifiers KeyModifiers) Node? {
      let path = dragTargetPath()
      path.Clear()
      if session.IsPointer { hitChainInto(root, x, y, path) }
      else {
        var target = session.RequestedTarget
        while let node = target {
          path.Add(node)
          if node.FocusScopeBoundary { break }
          target = node.Parent
        }
        path.Reverse()
      }
      if !DragTargetRouting.AllowsPath(path) {
        path.Clear()
        session.Effect = DragEffect.None
        return nil
      }
      var selected Node?
      var effect = DragEffect.None
      let start = DragTargetRouting.RouteStart(path)
      for var i = path.Count; i > start; i-- {
        let target = path[i - 1]
        if !DragTargetRouting.Available(root, target) { continue }
        if let descriptor = DragDropMetadata.Target(target) {
          if let event = dragEvent(session, target, DragEventKind.Move, x, y,
            modifiers, DragEffect.None) {
              let owner = CellOwnership.Within(root, target)
              var queried DragEffect
              try { queried = descriptor.Query(event) }
              finally { owner?.Rebuild() }
              if !ensureDragSession(root, session) {
                path.Clear()
                return nil
              }
              if DragTargetRouting.Available(root, target) {
                let accepted = acceptedDragEffect(queried, session.Data.AllowedEffects)
                if accepted != DragEffect.None {
                  selected = target
                  effect = accepted
                  break
                }
                if descriptor.StopAncestorRouting { break }
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
        || !DragTargetRouting.Available(root, target) {
          return false
        }
      guard let descriptor = DragDropMetadata.Target(target) else { return false }
      guard let event = dragEvent(session, target, kind, x, y, modifiers, effect) else { return false }
      let owner = CellOwnership.Within(root, target)
      try { descriptor.Changed?.Invoke(event) }
      finally { owner?.Rebuild() }
      if terminalLeave {
        return dragSession == session && DragTargetRouting.Available(root, target)
      }
      return ensureDragSession(root, session) && DragTargetRouting.Available(root, target)
    }

  private func updateDragTarget(root Node, x float32, y float32, modifiers KeyModifiers,
    notifyMove bool) {
      guard let session = dragSession else { return }
      if session.Terminating || session.Negotiating { return }
      session.Negotiating = true
      try {
        session.X = x
        session.Y = y
        session.Modifiers = modifiers
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
            if DragTargetRouting.Available(root, nextTarget) {
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
      } finally { session.Negotiating = false }
    }

  private func dropDrag(root Node, x float32, y float32, modifiers KeyModifiers) bool {
    guard let session = dragSession else { return false }
    try {
      updateDragTarget(root, x, y, modifiers, false)
      if !dragSessionCurrent(session) { return false }
      guard let target = session.Target else {
        terminateDrag(root, DragEndKind.Canceled, DragEffect.None, true, nil)
        return false
      }
      let effect = session.Effect
      if !DragTargetRouting.Available(root, target) {
        terminateDrag(root, DragEndKind.Canceled, DragEffect.None, false, nil)
        return false
      }
      guard let descriptor = DragDropMetadata.Target(target),
        let event = dragEvent(session, target, DragEventKind.Drop, x, y, modifiers, effect) else {
        terminateDrag(root, DragEndKind.Canceled, DragEffect.None, false, nil)
        return false
      }
      session.Terminating = true
      var failure Exception?
      let owner = CellOwnership.Within(root, target)
      try {
        try { descriptor.Changed?.Invoke(event) }
        finally { owner?.Rebuild() }
      } catch (error Exception) { failure = error }
      completeDrag(root, session, failure == nil ? DragEndKind.Dropped : DragEndKind.Canceled,
        failure == nil ? effect : DragEffect.None, false, failure)
      return true
    } catch (error Exception) {
      if dragSession == session {
        terminateDrag(root, DragEndKind.Canceled, DragEffect.None, true, error)
      }
      ExceptionDispatchInfo.Capture(error).Throw()
      return false
    }
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
      completeDrag(root, session, kind, effect, notifyLeave, original)
    }

  private func completeDrag(root Node?, session PointerDragSession, kind DragEndKind,
    effect DragEffect, notifyLeave bool, original Exception?) {
      var failure = original
      try {
        if notifyLeave {
          if let tree = root {
            if let target = session.Target {
              try {
                notifyDragTarget(tree, session, target, DragEventKind.Leave,
                  session.X, session.Y, session.Modifiers, DragEffect.None)
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
                  let owner = CellOwnership.Within(tree, session.Source)
                  try {
                    try { callback(DragEndEvent{ Kind: kind, Effect: effect }) }
                    finally { owner?.Rebuild() }
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
        if session.IsPointer {
          clearCapture()
          current.ClickTarget = nil
        }
        clearDragCandidate()
      }
      if let error = failure { ExceptionDispatchInfo.Capture(error).Throw() }
    }

  private func cancelDrag(root Node?) bool {
    let active = dragSession != nil
    clearDragCandidate()
    if !active { dragGeneration++ }
    guard let session = dragSession else { return false }
    if session.Terminating { return false }
    if session.NativeActive {
      nativeDragHost?.CancelNativeFileDrag()
      if dragSession == session { terminateDrag(root, DragEndKind.Canceled, DragEffect.None, false, nil) }
      return true
    }
    let previous = current
    if session.IsPointer && !activeDragMatches() {
      if session.Device == PointerDevice.Mouse {
        current = mouse
      } else if let contact = findContact(session.PointerId, session.Device, false) {
        current = contact
      }
    }
    try {
      terminateDrag(root, DragEndKind.Canceled, DragEffect.None, true, nil)
    } finally {
      current = previous
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

  internal func CancelDrag(root Node?) bool -> cancelDrag(root)

  internal func BeginDrag(root Node?, source Node, modifiers KeyModifiers) bool {
    if dragCandidate != nil || mouse.HeldButtons != PointerButtons.None
      || hasHeldContact(PointerDevice.Touch) || hasHeldContact(PointerDevice.Pen) { return false }
    let point = TransformGeometry.NodeToWindow(source, source.Rect.X + source.Rect.W / 2.0F,
      source.Rect.Y + source.Rect.H / 2.0F)
    return point.Valid && beginDrag(root, source, point.X, point.Y, modifiers, false)
  }

  internal func UpdateDrag(root Node?, target Node?, modifiers KeyModifiers) bool {
    guard let tree = root, let session = dragSession else { return false }
    if session.IsPointer || session.Terminating || session.Negotiating { return false }
    session.RequestedTarget = target
    var x = session.X
    var y = session.Y
    if let node = target {
      let point = TransformGeometry.NodeToWindow(node, node.Rect.X + node.Rect.W / 2.0F,
        node.Rect.Y + node.Rect.H / 2.0F)
      if point.Valid && containsPath(tree, node) && canReceiveInput(node) {
        x = point.X
        y = point.Y
      } else { session.RequestedTarget = nil }
    }
    try {
      updateDragTarget(tree, x, y, modifiers, true)
      return dragSessionCurrent(session) && session.Target != nil
    } catch (error Exception) {
      if dragSession == session {
        terminateDrag(tree, DragEndKind.Canceled, DragEffect.None, true, error)
      }
      throw error
    }
  }

  internal func DropDrag(root Node?) bool {
    guard let tree = root, let session = dragSession else { return false }
    if session.Terminating || session.Negotiating { return false }
    let previous = current
    if session.IsPointer {
      guard let contact = findContact(session.PointerId, session.Device, false) else { return false }
      current = contact
    }
    try { return dropDrag(tree, session.X, session.Y, session.Modifiers) }
    finally { current = previous }
  }

  internal func UpdateDragModifiers(root Node?, modifiers KeyModifiers) {
    guard let session = dragSession else { return }
    if !session.IsPointer {
      if sameDragModifiers(session.Modifiers, modifiers) { return }
      if let tree = root {
        UpdateDrag(tree, session.RequestedTarget, modifiers)
      }
      return
    }
    if session.Device != PointerDevice.Mouse {
      guard let contact = findContact(session.PointerId, session.Device, false) else { return }
      current = contact
    } else {
      current = mouse
    }
    try {
      guard let tree = root else { return }
      if sameDragModifiers(current.LastModifiers, modifiers) { return }
      current.LastModifiers = modifiers
      try {
        updateDragTarget(tree, current.LastEventX, current.LastEventY, modifiers, true)
      } catch (error Exception) {
        terminateDrag(tree, DragEndKind.Canceled, DragEffect.None, true, error)
      }
      return
    } finally {
      current = mouse
    }
  }

  private func sameDragModifiers(left KeyModifiers, right KeyModifiers) bool ->
  left.Alt == right.Alt && left.Shift == right.Shift && left.Ctrl == right.Ctrl
    && left.Super == right.Super

  private func afterDragTreeUpdated(root Node) {
    if let session = dragSession {
      if session.NativeActive {
        if !containsPath(root, session.Source) || !canReceiveInput(session.Source)
          || DragDropMetadata.Source(session.Source) == nil { cancelDrag(root) }
        return
      }
    }
    if dragSession?.IsPointer == false && current != mouse { return }
    if !currentOwnsDragState() && dragSession?.IsPointer != false { return }
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
      if session.IsPointer {
        updateDragTarget(root, current.LastEventX, current.LastEventY, current.LastModifiers, true)
      } else { UpdateDrag(root, session.RequestedTarget, session.Modifiers) }
    } catch (error Exception) {
      terminateDrag(root, DragEndKind.Canceled, DragEffect.None, true, error)
    }
  }
}
