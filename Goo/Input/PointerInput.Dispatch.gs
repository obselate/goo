package Goo

import System
import System.Collections.Generic
import System.Numerics
import System.Runtime.ExceptionServices

internal partial class PointerInput {
  private func nextDelta(x float32, y float32) Point {
    var delta Point
    if lastEventValid {
      delta = Point{ X: float64(x - lastEventX), Y: float64(y - lastEventY) }
    }
    lastEventX = x
    lastEventY = y
    lastEventValid = true
    return delta
  }

  private func clearCapture() {
    captureTarget = nil
    captureButton = PointerButton.None
    capturePath.Clear()
    capturePositions.Clear()
  }

  private func rebuildCapturePath(root Node) bool {
    guard let target = captureTarget else { return false }
    if !canReceiveInput(target) || !containsPath(root, target) { return false }
    capturePath.Clear()
    let rebuilt = appendPath(root, target, capturePath)
    if rebuilt && !savePositions(capturePath, capturePositions) { capturePath.Clear() }
    return rebuilt && capturePath.Count > 0
  }

  private func rebuildActivePath(root Node) bool {
    guard let target = activeTarget else { return false }
    if !canReceiveInput(target) || !containsPath(root, target) { return false }
    activePath.Clear()
    let rebuilt = appendPath(root, target, activePath)
    if rebuilt && !savePositions(activePath, activePositions) { activePath.Clear() }
    return rebuilt && activePath.Count > 0
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
      if let owner = captureTarget {
        if owner == requested { clearCapture() }
      }
    }
    if let requested = control.CaptureTarget {
      capturePath.Clear()
      captureTarget = requested
      captureButton = button
      for i in 0 ... route.Count {
        let n = route[i]
        capturePath.Add(n)
        if n == requested { break }
      }
      savePositions(capturePath, capturePositions)
    }
  }

  private func releaseCaptureAfterUp(button PointerButton) {
    if captureTarget == nil {
      return
    }
    if captureButton == button || (captureButton == PointerButton.None && heldButtons == PointerButtons.None) {
      clearCapture()
    }
  }

  private func rememberActiveRoute(route List[Node]) {
    activePath.Clear()
    activeTarget = nil
    for i in 0 ... route.Count {
      let n = route[i]
      activePath.Add(n)
      activeTarget = n
    }
    savePositions(activePath, activePositions)
  }

  private func clearActiveRoute() {
    activeTarget = nil
    activePath.Clear()
    activePositions.Clear()
  }

  private func savePositions(route List[Node], positions List[Point]) bool {
    positions.Clear()
    if !routeHasTransform(route) {
      for i in 0 ... route.Count {
        let n = route[i]
        positions.Add(Point{
          X: float64(lastEventX - n.Rect.X),
          Y: float64(lastEventY - n.Rect.Y),
        })
      }
      return true
    }
    return mapRoutePositions(route, lastEventX, lastEventY, positions)
  }

  private func mapRoutePositions(route List[Node], x float32, y float32,
    positions List[Point]) bool{
      positions.Clear()
      var mappedX = x
      var mappedY = y
      for i in 0 ... route.Count {
        let n = route[i]
        let point = TransformGeometry.Unmap(n, mappedX, mappedY)
        if !point.Valid {
          positions.Clear()
          return false
        }
        mappedX = point.X
        mappedY = point.Y
        positions.Add(Point{
          X: float64(mappedX - n.Rect.X),
          Y: float64(mappedY - n.Rect.Y),
        })
      }
      return true
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
      var mappedX = x
      var mappedY = y
      var mappedPreviousX = previousX
      var mappedPreviousY = previousY
      for i in 0 ... route.Count {
        let n = route[i]
        let point = TransformGeometry.Unmap(n, mappedX, mappedY)
        let previous = TransformGeometry.Unmap(n, mappedPreviousX, mappedPreviousY)
        if !point.Valid || !previous.Valid {
          routePositions.Clear()
          routeDeltas.Clear()
          return false
        }
        mappedX = point.X
        mappedY = point.Y
        mappedPreviousX = previous.X
        mappedPreviousY = previous.Y
        routePositions.Add(Point{
          X: float64(mappedX - n.Rect.X),
          Y: float64(mappedY - n.Rect.Y),
        })
        routeDeltas.Add(Point{
          X: float64(mappedX - mappedPreviousX),
          Y: float64(mappedY - mappedPreviousY),
        })
      }
      return true
    }

  private func dispatchPointer(root Node?, kind PointerEventKind, x float32, y float32,
    dx float64, dy float64, button PointerButton, modifiers KeyModifiers) bool{
      guard let tree = root else { return false }
      var captured = false
      if (kind == PointerEventKind.Move || kind == PointerEventKind.Release) && captureTarget != nil {
        if !rebuildCapturePath(tree) {
          clearCapture()
          return false
        }
        captured = true
      } else {
        scratchChain.Clear()
        hitChainInto(tree, x, y, scratchChain)
        if chainDisabled(scratchChain) {
          scratchChain.Clear()
          return false
        }
      }
      let route = captured ? capturePath : scratchChain
      if kind == PointerEventKind.Press {
        rememberActiveRoute(route)
      }
      let transformed = routeHasTransform(route)
      if transformed {
        let previousX = kind == PointerEventKind.Move ? x - float32(dx) : x
        let previousY = kind == PointerEventKind.Move ? y - float32(dy) : y
        if !mapRouteEvent(route, x, y, previousX, previousY) { return false }
      }
      dispatchGeneration++
      let generation = dispatchGeneration
      control.Begin(generation, captureTarget)
      var prevented = false
      try {
        for var i = route.Count; i > 0; i-- {
          let n = route[i - 1]
          let event = PointerEvent{
            Identity: currentDevice == PointerDevice.Mouse ? nil : current,
            IsPrimary: isSemanticPrimary(),
            Pressure: float64(pressure),
            Position: transformed ? routePositions[i - 1] : Point{
              X: float64(x - n.Rect.X), Y: float64(y - n.Rect.Y),
            },
            WindowPosition: Point{ X: float64(x), Y: float64(y) },
            Delta: transformed ? routeDeltas[i - 1] : Point{ X: dx, Y: dy },
            Button: button,
            Buttons: heldButtons,
            Modifiers: modifiers,
            Control: control,
            Generation: generation,
          }
          control.SetCurrentTarget(generation, n)
          try {
            if kind == PointerEventKind.Press {
              if let callback = n.OnPointerDown {
                callback(event)
                rebuildOwner(route, i - 1)
              }
            } else if kind == PointerEventKind.Move {
              if let callback = n.OnPointerMove {
                callback(event)
                rebuildOwner(route, i - 1)
              }
            } else if let callback = n.OnPointerUp {
              callback(event)
              rebuildOwner(route, i - 1)
            }
          } finally {
            control.ClearCurrentTarget(generation)
          }
          if control.PropagationStopped { break }
        }
        applyCaptureRequests(button, route)
        prevented = control.DefaultPrevented
      } finally {
        control.Finish(generation)
        if !captured { scratchChain.Clear() }
      }
      return prevented
    }

  private func cancelInteraction(root Node?, resolver Resolver, text TextInput) bool {
    let hadInteraction = heldButtons != PointerButtons.None || pressChain.Count > 0
      || dragEntry != nil || dragEditor != nil || hasScrollDrag()
      || clickTarget != nil || captureTarget != nil || activeTarget != nil
      || currentOwnsDragState()
    if !hadInteraction { return false }
    let canceled = heldButtons
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
      canceledButtons = PointerButtons(int32(canceledButtons) | int32(canceled))
      clearPressChain(resolver)
      dragEntry = nil
      dragEditor = nil
      dragEditorStarted = false
      clearScrollDrag()
      clearTouchPan()
      clickTarget = nil
      if isSemanticPrimary() {
        if let focusTarget = current.FocusTarget {
          if text.FocusedNode() == focusTarget { text.SetFocus(resolver, nil) }
        }
      }
      current.FocusTarget = nil
      clearCapture()
      clearActiveRoute()
      heldButtons = PointerButtons.None
      lastPressT = -10.0
      lastPressNode = nil
      lastPressCount = 0
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
    let captured = captureTarget != nil && capturePath.Count > 0
    let route = captured ? capturePath : activePath
    let positions = captured ? capturePositions : activePositions
    if route.Count == 0 || !lastEventValid {
      return
    }
    dispatchGeneration++
    let generation = dispatchGeneration
    control.Begin(generation, nil)
    try {
      for var i = route.Count; i > 0; i-- {
        let n = route[i - 1]
        let event = PointerEvent{
          Identity: currentDevice == PointerDevice.Mouse ? nil : current,
          IsPrimary: isSemanticPrimary(),
          Pressure: float64(pressure),
          Position: positions[i - 1],
          WindowPosition: Point{ X: float64(lastEventX), Y: float64(lastEventY) },
          Delta: Point{},
          Button: PointerButton.None,
          Buttons: PointerButtons.None,
          Modifiers: lastModifiers,
          Control: control,
          Generation: generation,
        }
        control.SetCurrentTarget(generation, n)
        try {
          if let callback = n.OnPointerCancel {
            callback(event)
            rebuildOwner(route, i - 1)
          }
        } finally {
          control.ClearCurrentTarget(generation)
        }
        if control.PropagationStopped { break }
      }
    } finally {
      control.Finish(generation)
    }
  }

  private func rebuildOwner(route List[Node], index int32) {
    var owner Cell? = nil
    for i in 0 ... index + 1 {
      if let current = route[i].Fiber { owner = current }
    }
    if let cell = owner { cell.Rebuild() }
  }
}

internal func containsPath(root Node, target Node) bool {
  if root == target { return true }
  for i in 0 ... root.Children.Count {
    if containsPath(root.Children[i], target) { return true }
  }
  return false
}
