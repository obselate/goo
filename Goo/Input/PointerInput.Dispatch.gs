package Goo

import System
import System.Collections.Generic
import System.Numerics
import System.Runtime.ExceptionServices

internal partial class PointerInput {
  private func nextDelta(x float32, y float32) Point {
    var delta Point
    if current.LastEventValid {
      delta = Point{ X: float64(x - current.LastEventX), Y: float64(y - current.LastEventY) }
    }
    current.LastEventX = x
    current.LastEventY = y
    current.LastEventValid = true
    return delta
  }

  private func clearCapture() {
    current.CaptureTarget = nil
    current.CaptureButton = PointerButton.None
    current.CapturePath.Clear()
    current.CapturePositions.Clear()
  }

  private func rebuildCapturePath(root Node) bool {
    guard let target = current.CaptureTarget else { return false }
    return rebuildPath(root, target, current.CapturePath, current.CapturePositions)
  }

  private func rebuildActivePath(root Node) bool {
    guard let target = current.ActiveTarget else { return false }
    return rebuildPath(root, target, current.ActivePath, current.ActivePositions)
  }

  private func rebuildPath(root Node, target Node, path List[Node], positions List[Point]) bool {
    if !canReceiveInput(target) || !containsPath(root, target) { return false }
    path.Clear()
    let rebuilt = appendPath(root, target, path)
    if rebuilt && !savePositions(path, positions) { path.Clear() }
    return rebuilt && path.Count > 0
  }

  private func appendPath(root Node, target Node, path List[Node]) bool {
    path.Add(root)
    if root == target { return true }
    for i in 0 ... root.Children.Count {
      if appendPath(root.Children[i], target, path) { return true }
    }
    path.RemoveAt(path.Count - 1)
    return false
  }

  private func applyCaptureRequests(button PointerButton, route List[Node]) {
    if let requested = control.ReleaseTarget {
      if let owner = current.CaptureTarget {
        if owner == requested { clearCapture()
          current.LastPressNode = nil }
      }
    }
    if let requested = control.CaptureTarget {
      if requested != current.LastPressNode { current.LastPressNode = nil }
      current.CapturePath.Clear()
      current.CaptureTarget = requested
      current.CaptureButton = button
      for i in 0 ... route.Count {
        let n = route[i]
        current.CapturePath.Add(n)
        if n == requested { break }
      }
      savePositions(current.CapturePath, current.CapturePositions)
    }
  }

  private func releaseCaptureAfterUp(button PointerButton) {
    if current.CaptureTarget == nil {
      return
    }
    if current.CaptureButton == button || (current.CaptureButton == PointerButton.None && current.HeldButtons == PointerButtons.None) {
      clearCapture()
    }
  }

  private func rememberActiveRoute(route List[Node]) {
    current.ActivePath.Clear()
    current.ActiveTarget = nil
    for i in 0 ... route.Count {
      let n = route[i]
      current.ActivePath.Add(n)
      current.ActiveTarget = n
    }
    savePositions(current.ActivePath, current.ActivePositions)
  }

  private func clearActiveRoute() {
    current.ActiveTarget = nil
    current.ActivePath.Clear()
    current.ActivePositions.Clear()
  }

  private func savePositions(route List[Node], positions List[Point]) bool {
    positions.Clear()
    if !routeHasTransform(route) {
      for i in 0 ... route.Count {
        let n = route[i]
        positions.Add(Point{
          X: float64(current.LastEventX - n.Rect.X),
          Y: float64(current.LastEventY - n.Rect.Y),
        })
      }
      return true
    }
    return mapRoutePositions(route, current.LastEventX, current.LastEventY, positions)
  }

  private func mapRoutePositions(route List[Node], x float32, y float32,
    positions List[Point]) bool{
      positions.Clear()
      let portal = deepestPortal(route)
      var mappedX = x
      var mappedY = y
      var valid = true
      for i in 0 ... route.Count {
        let n = route[i]
        if n.IsPortal {
          mappedX = x
          mappedY = y
          valid = true
        }
        let point = if valid { TransformGeometry.Unmap(n, mappedX, mappedY) }
        else { TransformPoint{} }
        if !point.Valid {
          if i >= portal {
            positions.Clear()
            return false
          }
          valid = false
          positions.Add(Point{ X: float64(x - n.Rect.X), Y: float64(y - n.Rect.Y) })
        } else {
          mappedX = point.X
          mappedY = point.Y
          positions.Add(Point{
            X: float64(mappedX - n.Rect.X),
            Y: float64(mappedY - n.Rect.Y),
          })
        }
      }
      return true
    }

  private func deepestPortal(route List[Node]) int32 {
    var result = -1
    for i in 0 ... route.Count {
      if route[i].IsPortal { result = i }
    }
    return result
  }

  private func routeHasTransform(route List[Node]) bool {
    for i in 0 ... route.Count {
      if route[i].HasVisualTransform { return true }
    }
    return false
  }

  private func mapRouteEvent(route List[Node], x float32, y float32,
    previousX float32, previousY float32) bool{
      routePositions.Clear()
      routeDeltas.Clear()
      let portal = deepestPortal(route)
      var mappedX = x
      var mappedY = y
      var mappedPreviousX = previousX
      var mappedPreviousY = previousY
      var valid = true
      for i in 0 ... route.Count {
        let n = route[i]
        if n.IsPortal {
          mappedX = x
          mappedY = y
          mappedPreviousX = previousX
          mappedPreviousY = previousY
          valid = true
        }
        let point = if valid { TransformGeometry.Unmap(n, mappedX, mappedY) }
        else { TransformPoint{} }
        let previous = if valid { TransformGeometry.Unmap(n, mappedPreviousX, mappedPreviousY) }
        else { TransformPoint{} }
        if !point.Valid || !previous.Valid {
          if i >= portal {
            routePositions.Clear()
            routeDeltas.Clear()
            return false
          }
          valid = false
          routePositions.Add(Point{ X: float64(x - n.Rect.X), Y: float64(y - n.Rect.Y) })
          routeDeltas.Add(Point{ X: float64(x - previousX), Y: float64(y - previousY) })
        } else {
          mappedX = point.X
          mappedY = point.Y
          mappedPreviousX = previous.X
          mappedPreviousY = previous.Y
          routePositions.Add(Point{
            X: float64(mappedX - n.Rect.X),
            Y: float64(mappedY - n.Rect.Y),
          })
          routeDeltas.Add(Point{
            X: float64(point.X - previous.X),
            Y: float64(point.Y - previous.Y),
          })
        }
      }
      return true
    }

  private func dispatchPointer(root Node?, kind PointerEventKind, x float32, y float32,
    dx float64, dy float64, button PointerButton, modifiers KeyModifiers, timeS float64 = 0.0) bool{
      guard let tree = root else { return false }
      var captured = false
      if (kind == PointerEventKind.Move || kind == PointerEventKind.Release) && current.CaptureTarget != nil {
        if !rebuildCapturePath(tree) {
          resetClickSequence()
          clearCapture()
          return false
        }
        captured = true
      } else {
        scratchChain.Clear()
        hitChainInto(tree, x, y, scratchChain)
        if chainDisabled(scratchChain) {
          if kind == PointerEventKind.Press { resetClickSequence() }
          scratchChain.Clear()
          return false
        }
      }
      let route = captured ? current.CapturePath : scratchChain
      if kind == PointerEventKind.Press {
        beginClickSequence(route, timeS, x, y, button)
        rememberActiveRoute(route)
      } else {
        invalidateMovedClickSequence(x, y)
        if kind == PointerEventKind.Release && button == current.LastPressButton {
          if captured {
            scratchChain.Clear()
            hitChainInto(tree, x, y, scratchChain)
          }
          if chainDisabled(scratchChain) || clickSequenceTarget(scratchChain) != current.LastPressNode {
            current.LastPressNode = nil
          }
          if captured { scratchChain.Clear() }
        }
      }
      let transformed = routeHasTransform(route)
      if transformed {
        let previousX = kind == PointerEventKind.Move ? x - float32(dx) : x
        let previousY = kind == PointerEventKind.Move ? y - float32(dy) : y
        if !mapRouteEvent(route, x, y, previousX, previousY) { return false }
      }
      dispatchGeneration++
      let generation = dispatchGeneration
      control.Begin(generation, current.CaptureTarget)
      var prevented = false
      var interactiveChild = false
      try {
        for var i = route.Count; i > 0; i-- {
          let n = route[i - 1]
          let event = PointerEvent{
            Identity: current.Device == PointerDevice.Mouse ? nil : current,
            IsPrimary: isSemanticPrimary(),
            Pressure: float64(current.Pressure),
            Position: transformed ? routePositions[i - 1] : Point{
              X: float64(x - n.Rect.X), Y: float64(y - n.Rect.Y),
            },
            WindowPosition: Point{ X: float64(x), Y: float64(y) },
            Delta: transformed ? routeDeltas[i - 1] : Point{ X: dx, Y: dy },
            Button: button,
            IsFromInteractiveChild: interactiveChild,
            ClickCount: kind != PointerEventKind.Move && button == current.LastPressButton ? current.LastPressCount : 0,
            Buttons: current.HeldButtons,
            Modifiers: modifiers,
            Control: control,
            Generation: generation,
          }
          control.SetCurrentTarget(generation, n)
          try {
            if kind == PointerEventKind.Press {
              if let callback = n.OnPointerDown {
                callback(event)
                CellOwnership.InRoute(route, i - 1)?.Rebuild()
              }
            } else if kind == PointerEventKind.Move {
              if let callback = n.OnPointerMove {
                callback(event)
                CellOwnership.InRoute(route, i - 1)?.Rebuild()
              }
            } else if let callback = n.OnPointerUp {
              callback(event)
              CellOwnership.InRoute(route, i - 1)?.Rebuild()
            }
          } finally {
            control.ClearCurrentTarget(generation)
          }
          if control.PropagationStopped || n.FocusScopeBoundary { break }
          interactiveChild = interactiveChild || isInteractiveContent(n)
        }
        applyCaptureRequests(button, route)
        prevented = control.DefaultPrevented
      } finally {
        control.Finish(generation)
        if !captured { scratchChain.Clear() }
      }
      return prevented
    }

  private func cancelInteraction(root Node?, resolver Resolver) bool {
    let hadInteraction = current.HeldButtons != PointerButtons.None || current.PressChain.Count > 0
      || current.DragEntry != nil || current.DragEditor != nil || hasScrollDrag()
      || current.ClickTarget != nil || current.CaptureTarget != nil || current.ActiveTarget != nil
      || currentOwnsDragState()
    if !hadInteraction { resetClickSequence()
      return false }
    let canceled = current.HeldButtons
    var failure Exception?
    try {
      try {
        dispatchCancel()
      } catch (error Exception) {
        failure = error
      }
      try {
        cancelCurrentDrag(root)
      } catch (error Exception) {
        if failure == nil { failure = error }
      }
    } finally {
      current.CanceledButtons = PointerButtons(int32(current.CanceledButtons) | int32(canceled))
      clearPressChain(resolver)
      current.DragEntry = nil
      current.DragEditor = nil
      current.DragSelectionStarted = false
      clearScrollDrag()
      clearTouchPan()
      current.ClickTarget = nil
      if isSemanticPrimary() {
        if let focusTarget = current.FocusTarget {
          if focus.FocusedNode() == focusTarget {
            focus.SetFocus(resolver, nil) }
        }
      }
      current.FocusTarget = nil
      clearCapture()
      clearActiveRoute()
      current.HeldButtons = PointerButtons.None
      resetClickSequence()
      if current.Device == PointerDevice.Touch && primaryTouch == current {
        primaryTouch = nil
      } else if current.Device == PointerDevice.Pen && primaryPen == current {
        primaryPen = nil
      }
    }
    if let error = failure { ExceptionDispatchInfo.Capture(error).Throw() }
    return true
  }

  private func dispatchCancel() {
    let captured = current.CaptureTarget != nil && current.CapturePath.Count > 0
    let route = captured ? current.CapturePath : current.ActivePath
    let positions = captured ? current.CapturePositions : current.ActivePositions
    if route.Count == 0 || !current.LastEventValid {
      return
    }
    dispatchGeneration++
    let generation = dispatchGeneration
    control.Begin(generation, nil)
    var interactiveChild = false
    try {
      for var i = route.Count; i > 0; i-- {
        let n = route[i - 1]
        let event = PointerEvent{
          Identity: current.Device == PointerDevice.Mouse ? nil : current,
          IsPrimary: isSemanticPrimary(),
          Pressure: float64(current.Pressure),
          Position: positions[i - 1],
          WindowPosition: Point{ X: float64(current.LastEventX), Y: float64(current.LastEventY) },
          Delta: Point{},
          Button: PointerButton.None,
          IsFromInteractiveChild: interactiveChild,
          Buttons: PointerButtons.None,
          Modifiers: current.LastModifiers,
          Control: control,
          Generation: generation,
        }
        control.SetCurrentTarget(generation, n)
        try {
          if let callback = n.OnPointerCancel {
            callback(event)
            CellOwnership.InRoute(route, i - 1)?.Rebuild()
          }
        } finally {
          control.ClearCurrentTarget(generation)
        }
        if control.PropagationStopped { break }
        interactiveChild = interactiveChild || isInteractiveContent(n)
      }
    } finally {
      control.Finish(generation) }
  }
}

internal func containsPath(root Node, target Node) bool {
  if root == target { return true }
  for i in 0 ... root.Children.Count {
    if containsPath(root.Children[i], target) { return true }
  }
  return false
}
