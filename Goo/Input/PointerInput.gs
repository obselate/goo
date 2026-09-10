package Goo

import System
import System.Collections.Generic
import System.Numerics
import System.Runtime.ExceptionServices

internal partial class PointerInput {
  private let mouse PointerContact
  private var contacts List[PointerContact]?
  private var current PointerContact
  private var primaryTouch PointerContact?
  private var primaryPen PointerContact?
  private var touchSequenceActive bool
  private var penSequenceActive bool
  private var currentPointerId int64
  private var currentDevice PointerDevice
  private var cursor Vector2
  private var cursorValid bool
  private var queue List[QueuedPointerEvent]
  private var queueHead int32
  private var hoverChain List[Node]
  private var scratchChain List[Node]
  private var pressChain List[Node]
  private var hitChain List[Node]
  private var capturePath List[Node]
  private var capturePositions List[Point]
  private var activePath List[Node]
  private var activePositions List[Point]
  private var routePositions List[Point]
  private var routeDeltas List[Point]
  private var diagnosticsHook((Node?, PointerEventKind, float32, float32, PointerButton) -> bool)?
  private var control PointerDispatchControl
  private var dispatchGeneration int64
  private var wheelControl InputDispatchControl
  private var wheelDispatchGeneration int64
  private var heldButtons PointerButtons
  private var canceledButtons PointerButtons
  private var captureTarget Node?
  private var captureButton PointerButton
  private var activeTarget Node?
  private var clickTarget Node?
  private var dragEntry Node?
  private var dragEditor Node?
  private var dragEditorStarted bool
  private var dragCandidate Node?
  private var dragSession PointerDragSession?
  private var dragPointerId int64
  private var dragPointerDevice PointerDevice
  private var dragHitPath List[Node]?
  private var dragGeneration int64
  private var lastPressT float64
  private var lastPressX float32
  private var lastPressY float32
  private var lastPressNode Node?
  private var lastPressCount int32
  private var lastEventX float32
  private var lastEventY float32
  private var lastEventValid bool
  private var lastModifiers KeyModifiers
  private var pressure float32

  internal init() {
    queue = List[QueuedPointerEvent]()
    queueHead = 0
    mouse = PointerContact(0, PointerDevice.Mouse)
    current = mouse
    currentPointerId = 0
    currentDevice = PointerDevice.Mouse
    hoverChain = List[Node]()
    scratchChain = List[Node]()
    pressChain = mouse.PressChain
    hitChain = List[Node]()
    capturePath = mouse.CapturePath
    capturePositions = mouse.CapturePositions
    activePath = mouse.ActivePath
    activePositions = mouse.ActivePositions
    routePositions = List[Point]()
    routeDeltas = List[Point]()
    control = PointerDispatchControl()
    wheelControl = InputDispatchControl()
    lastPressT = -10.0
  }

  internal func SetDiagnosticsHook(value((Node?, PointerEventKind, float32, float32,
    PointerButton) -> bool)?) ->
  diagnosticsHook = value

  private func storeCurrent() {
    current.PressChain = pressChain
    current.CapturePath = capturePath
    current.CapturePositions = capturePositions
    current.ActivePath = activePath
    current.ActivePositions = activePositions
    current.HeldButtons = heldButtons
    current.CanceledButtons = canceledButtons
    current.CaptureTarget = captureTarget
    current.CaptureButton = captureButton
    current.ActiveTarget = activeTarget
    current.ClickTarget = clickTarget
    current.DragEntry = dragEntry
    current.DragEditor = dragEditor
    current.DragEditorStarted = dragEditorStarted
    current.LastPressT = lastPressT
    current.LastPressX = lastPressX
    current.LastPressY = lastPressY
    current.LastPressNode = lastPressNode
    current.LastPressCount = lastPressCount
    current.LastEventX = lastEventX
    current.LastEventY = lastEventY
    current.LastEventValid = lastEventValid
    current.LastModifiers = lastModifiers
    current.Pressure = pressure
  }

  private func loadCurrent() {
    pressChain = current.PressChain
    capturePath = current.CapturePath
    capturePositions = current.CapturePositions
    activePath = current.ActivePath
    activePositions = current.ActivePositions
    heldButtons = current.HeldButtons
    canceledButtons = current.CanceledButtons
    captureTarget = current.CaptureTarget
    captureButton = current.CaptureButton
    activeTarget = current.ActiveTarget
    clickTarget = current.ClickTarget
    dragEntry = current.DragEntry
    dragEditor = current.DragEditor
    dragEditorStarted = current.DragEditorStarted
    lastPressT = current.LastPressT
    lastPressX = current.LastPressX
    lastPressY = current.LastPressY
    lastPressNode = current.LastPressNode
    lastPressCount = current.LastPressCount
    lastEventX = current.LastEventX
    lastEventY = current.LastEventY
    lastEventValid = current.LastEventValid
    lastModifiers = current.LastModifiers
    pressure = current.Pressure
    currentPointerId = current.Id
    currentDevice = current.Device
  }

  private func activate(contact PointerContact) {
    storeCurrent()
    current = contact
    loadCurrent()
  }

  private func restoreMouse() {
    if current != mouse { activate(mouse) }
  }

  private func findContact(pointerId int64, device PointerDevice, create bool) PointerContact? {
    if device == PointerDevice.Mouse { return mouse }
    if let values = contacts {
      for i in 0 ... values.Count {
        if values[i].Id == pointerId && values[i].Device == device { return values[i] }
      }
    }
    if !create { return nil }
    let created = PointerContact(pointerId, device)
    if contacts == nil { contacts = List[PointerContact]() }
    if let values = contacts { values.Add(created) }
    return created
  }

  private func removeCurrentContact() {
    if current != mouse {
      let removed = current
      if let values = contacts {
        for i in 0 ... values.Count {
          if values[i] == removed {
            values.RemoveAt(i)
            break
          }
        }
      }
      if let primary = primaryTouch {
        if primary == removed { primaryTouch = nil }
      }
      if let primary = primaryPen {
        if primary == removed { primaryPen = nil }
      }
      endDeviceSequenceIfIdle(removed.Device)
      restoreMouse()
    }
  }

  private func endDeviceSequenceIfIdle(device PointerDevice) {
    if device != PointerDevice.Mouse && !hasHeldContact(device) {
      if device == PointerDevice.Touch {
        touchSequenceActive = false
        primaryTouch = nil
      } else {
        penSequenceActive = false
        primaryPen = nil
      }
    }
  }

  private func hasHeldContact(device PointerDevice) bool {
    guard let values = contacts else { return false }
    for i in 0 ... values.Count {
      let contact = values[i]
      let buttons = contact == current ? heldButtons : contact.HeldButtons
      if contact.Device == device && buttons != PointerButtons.None {
        return true
      }
    }
    return false
  }

  private func isSemanticPrimary() bool -> switch current.Device {
    case PointerDevice.Mouse: true
    case PointerDevice.Touch: primaryTouch == current
    case PointerDevice.Pen: primaryPen == current
    case _: false
  }

  private func updatePressure(value float32, hasValue bool) {
    if current.Device == PointerDevice.Mouse {
      pressure = (int32(heldButtons) & int32(PointerButtons.Primary)) != 0 ? 1.0F : 0.0F
    } else if hasValue {
      pressure = normalizePressure(value)
    }
  }

  private func normalizePressure(value float32) float32 {
    if Single.IsNaN(value) || value <= 0.0F { return 0.0F }
    if value >= 1.0F { return 1.0F }
    return value
  }

  private func acquireSemanticPrimary(button PointerButton) bool {
    if button != PointerButton.Primary { return false }
    if current.Device == PointerDevice.Mouse {
      return true
    }
    if current.Device == PointerDevice.Touch {
      if !touchSequenceActive {
        touchSequenceActive = true
        primaryTouch = current
      }
      return primaryTouch == current
    }
    if !penSequenceActive {
      penSequenceActive = true
      primaryPen = current
    }
    return primaryPen == current
  }

  private func releaseSemanticPrimary(button PointerButton) {
    if button == PointerButton.Primary && current.Device != PointerDevice.Mouse {
      if current.Device == PointerDevice.Touch && primaryTouch == current {
        primaryTouch = nil
      } else if current.Device == PointerDevice.Pen && primaryPen == current {
        primaryPen = nil
      }
    }
  }

  internal func Bind(host WindowHost) {
    host.PointerMoved += (pointerId int64, device PointerDevice, x float32, y float32,
      buttons PointerButtons, pressure float32, modifiers KeyModifiers) -> {
        QueueMoveFromHost(pointerId, device, x, y, buttons, pressure, modifiers)
      }
    host.PointerPressed += (pointerId int64, device PointerDevice, x float32, y float32,
      button PointerButton, buttons PointerButtons, pressure float32,
      modifiers KeyModifiers) -> {
        QueuePressFromHost(pointerId, device, x, y, button, buttons, pressure, modifiers)
      }
    host.PointerReleased += (pointerId int64, device PointerDevice, x float32, y float32,
      button PointerButton, buttons PointerButtons, pressure float32,
      modifiers KeyModifiers) -> {
        QueueReleaseFromHost(pointerId, device, x, y, button, buttons, pressure, modifiers)
      }
    host.PointerCanceled += (pointerId int64, device PointerDevice) -> {
      QueueCancel(pointerId, device)
    }
    host.Wheel += (x float32, y float32, dx float32, dy float32, modifiers KeyModifiers) -> {
      QueueWheel(x, y, dx, dy, modifiers)
    }
  }

  internal func Drain(root Node?, resolver Resolver, timeS float64, text TextInput) bool {
    var changed = false
    queueHead = 0
    try {
      while queueHead < queue.Count {
        let e = queue[queueHead]
        queueHead = queueHead + 1
        try {
          let createsContact = e.Kind == PointerEventKind.Press
            || (e.Kind == PointerEventKind.Move && e.Device == PointerDevice.Pen)
          if e.Device == PointerDevice.Mouse {
            restoreMouse()
          } else {
            guard let contact = findContact(e.PointerId, e.Device, createsContact) else {
              continue
            }
            activate(contact)
          }
          if e.Kind == PointerEventKind.Move {
            if e.HasButtons { heldButtons = maskCanceledButtons(e.Buttons) }
            updatePressure(e.Pressure, e.HasPressure)
            if HandlePointerMove(root, resolver, e.X, e.Y, e.Modifiers) {
              changed = true
            }
          } else if e.Kind == PointerEventKind.Wheel {
            if HandleWheel(root, e.X, e.Y, e.DX, e.DY, e.Modifiers) {
              changed = true
            }
          } else if e.Kind == PointerEventKind.Press {
            HandlePointerPress(root, resolver, text, timeS, e.X, e.Y, e.Button, e.Buttons,
              e.HasButtons, e.Pressure, e.HasPressure, e.Modifiers)
            if pressChain.Count > 0 || dragEntry != nil || dragEditor != nil
              || dragCandidate != nil || dragSession != nil {
                changed = true
              }
          } else if e.Kind == PointerEventKind.Cancel {
            var diagnosticsConsumed = false
            if let hook = diagnosticsHook {
              diagnosticsConsumed = hook(root, PointerEventKind.Cancel, e.X, e.Y, e.Button)
            }
            let canceled = cancelInteraction(root, resolver, text)
            if diagnosticsConsumed || canceled {
              changed = true
            }
            if current != mouse { removeCurrentContact() }
          } else {
            let hadPress = pressChain.Count > 0 || dragEntry != nil || dragEditor != nil
              || currentOwnsDragState()
            if HandlePointerRelease(root, resolver, e.X, e.Y, e.Button, e.Buttons,
              e.HasButtons, e.Pressure, e.HasPressure, e.Modifiers) || hadPress{
                changed = true
              }
            if current.Device == PointerDevice.Touch && heldButtons == PointerButtons.None {
              removeCurrentContact()
            } else if current.Device == PointerDevice.Pen && heldButtons == PointerButtons.None {
              endDeviceSequenceIfIdle(PointerDevice.Pen)
            }
          }
          if current != mouse {
            storeCurrent()
            restoreMouse()
          }
        } finally {
          resolver.Flush()
        }
      }
    } finally {
      if queueHead > 0 {
        queue.RemoveRange(0, queueHead)
      }
      queueHead = 0
    }
    return changed
  }

  internal func QueueMove(x float32, y float32) {
    QueueMove(x, y, KeyModifiers{})
  }

  internal func QueueMove(x float32, y float32, modifiers KeyModifiers) {
    QueueMove(0, PointerDevice.Mouse, x, y, modifiers)
  }

  internal func QueueMove(pointerId int64, device PointerDevice, x float32, y float32,
    modifiers KeyModifiers) {
      queue.Add(QueuedPointerEvent{
        Kind: PointerEventKind.Move, PointerId: pointerId, Device: device, X: x, Y: y,
        Modifiers: modifiers,
      })
    }

  internal func QueueMove(pointerId int64, device PointerDevice, x float32, y float32,
    modifiers KeyModifiers, pressure float32) {
      queue.Add(QueuedPointerEvent{
        Kind: PointerEventKind.Move, PointerId: pointerId, Device: device, X: x, Y: y,
        Pressure: pressure, HasPressure: true, Modifiers: modifiers,
      })
    }

  private func QueueMoveFromHost(pointerId int64, device PointerDevice, x float32, y float32,
    buttons PointerButtons, pressure float32,
    modifiers KeyModifiers) {
      queue.Add(QueuedPointerEvent{
        Kind: PointerEventKind.Move, PointerId: pointerId, Device: device, X: x, Y: y,
        Buttons: buttons, HasButtons: true, Pressure: pressure, HasPressure: true,
        Modifiers: modifiers,
      })
    }

  internal func QueuePress(x float32, y float32) {
    QueuePress(x, y, PointerButton.Primary, KeyModifiers{})
  }

  internal func QueuePress(x float32, y float32, button PointerButton, modifiers KeyModifiers) {
    QueuePress(0, PointerDevice.Mouse, x, y, button, modifiers)
  }

  internal func QueuePress(pointerId int64, device PointerDevice, x float32, y float32,
    button PointerButton, modifiers KeyModifiers) {
      queue.Add(QueuedPointerEvent{
        Kind: PointerEventKind.Press, PointerId: pointerId, Device: device, X: x, Y: y,
        Button: button, Modifiers: modifiers,
      })
    }

  internal func QueuePress(pointerId int64, device PointerDevice, x float32, y float32,
    button PointerButton, modifiers KeyModifiers, pressure float32) {
      queue.Add(QueuedPointerEvent{
        Kind: PointerEventKind.Press, PointerId: pointerId, Device: device, X: x, Y: y,
        Button: button, Pressure: pressure, HasPressure: true, Modifiers: modifiers,
      })
    }

  private func QueuePressFromHost(pointerId int64, device PointerDevice, x float32, y float32,
    button PointerButton,
    buttons PointerButtons, pressure float32, modifiers KeyModifiers) {
      queue.Add(QueuedPointerEvent{
        Kind: PointerEventKind.Press, PointerId: pointerId, Device: device, X: x, Y: y,
        Button: button, Buttons: buttons, HasButtons: true, Pressure: pressure, HasPressure: true,
        Modifiers: modifiers,
      })
    }

  internal func QueueRelease(x float32, y float32) {
    QueueRelease(x, y, PointerButton.Primary, KeyModifiers{})
  }

  internal func QueueRelease(x float32, y float32, button PointerButton, modifiers KeyModifiers) {
    QueueRelease(0, PointerDevice.Mouse, x, y, button, modifiers)
  }

  internal func QueueRelease(pointerId int64, device PointerDevice, x float32, y float32,
    button PointerButton, modifiers KeyModifiers) {
      queue.Add(QueuedPointerEvent{
        Kind: PointerEventKind.Release, PointerId: pointerId, Device: device, X: x, Y: y,
        Button: button, Modifiers: modifiers,
      })
    }

  internal func QueueRelease(pointerId int64, device PointerDevice, x float32, y float32,
    button PointerButton, modifiers KeyModifiers, pressure float32) {
      queue.Add(QueuedPointerEvent{
        Kind: PointerEventKind.Release, PointerId: pointerId, Device: device, X: x, Y: y,
        Button: button, Pressure: pressure, HasPressure: true, Modifiers: modifiers,
      })
    }

  private func QueueReleaseFromHost(pointerId int64, device PointerDevice, x float32, y float32,
    button PointerButton,
    buttons PointerButtons, pressure float32, modifiers KeyModifiers) {
      queue.Add(QueuedPointerEvent{
        Kind: PointerEventKind.Release, PointerId: pointerId, Device: device, X: x, Y: y,
        Button: button, Buttons: buttons, HasButtons: true, Pressure: pressure, HasPressure: true,
        Modifiers: modifiers,
      })
    }

  internal func QueueWheel(x float32, y float32, dx float32, dy float32) {
    QueueWheel(x, y, dx, dy, KeyModifiers{})
  }

  internal func QueueWheel(x float32, y float32, dx float32, dy float32,
    modifiers KeyModifiers) {
      queue.Add(QueuedPointerEvent{
        Kind: PointerEventKind.Wheel, X: x, Y: y, DX: dx, DY: dy, Modifiers: modifiers,
      })
    }

  internal func QueueCancel() {
    QueueCancel(0, PointerDevice.Mouse)
  }

  internal func QueueCancel(pointerId int64, device PointerDevice) {
    queue.Add(QueuedPointerEvent{ Kind: PointerEventKind.Cancel, PointerId: pointerId, Device: device })
  }

  internal func FocusLost(root Node?, resolver Resolver) {
    try {
      cancelDrag(root)
      clearHover(resolver)
    } finally {
      cursorValid = false
      QueueCancel()
      if let values = contacts {
        for i in 0 ... values.Count {
          let contact = values[i]
          queue.Add(QueuedPointerEvent{
            Kind: PointerEventKind.Cancel, PointerId: contact.Id, Device: contact.Device,
          })
        }
      }
    }
  }

  internal func Reset(root Node?, resolver Resolver, text TextInput) {
    var failure Exception?
    try {
      cancelDrag(root)
    } catch (error Exception) {
      failure = error
    }
    activate(mouse)
    try {
      cancelInteraction(root, resolver, text)
    } catch (error Exception) {
      if failure == nil { failure = error }
    }
    if let values = contacts {
      for i in 0 ... values.Count {
        activate(values[i])
        try {
          cancelInteraction(root, resolver, text)
        } catch (error Exception) {
          if failure == nil { failure = error }
        }
      }
    }
    contacts?.Clear()
    primaryTouch = nil
    primaryPen = nil
    touchSequenceActive = false
    penSequenceActive = false
    activate(mouse)
    queue.Clear()
    queueHead = 0
    try {
      clearHover(resolver)
    } catch (error Exception) {
      if failure == nil { failure = error }
    }
    scratchChain.Clear()
    hitChain.Clear()
    dragHitPath?.Clear()
    clearCapture()
    clearActiveRoute()
    cursorValid = false
    heldButtons = PointerButtons.None
    canceledButtons = PointerButtons.None
    lastEventValid = false
    lastModifiers = KeyModifiers{}
    lastPressT = -10.0
    lastPressNode = nil
    lastPressCount = 0
    if let error = failure { ExceptionDispatchInfo.Capture(error).Throw() }
  }

  private func clearHover(resolver Resolver) {
    if hoverChain.Count == 0 {
      return
    }
    scratchChain.Clear()
    try {
      commitHoverRoute(resolver, hoverPositionX(), hoverPositionY())
    } finally {
      scratchChain.Clear()
    }
  }

  private func hoverPositionX() float32 -> cursorValid ? cursor.X : lastEventX

  private func hoverPositionY() float32 -> cursorValid ? cursor.Y : lastEventY

  private func commitHoverRoute(resolver Resolver, x float32, y float32) {
    let shared = sharedHoverPrefix(hoverChain, scratchChain)
    setHoverState(hoverChain, shared, hoverChain.Count, false, resolver)
    setHoverState(scratchChain, shared, scratchChain.Count, true, resolver)
    let tmp = hoverChain
    hoverChain = scratchChain
    scratchChain = tmp
    dispatchHoverLeaves(scratchChain, shared, x, y)
    dispatchHoverEnters(hoverChain, shared, x, y)
  }

  private func sharedHoverPrefix(left List[Node], right List[Node]) int32 {
    var result int32
    let count = left.Count < right.Count ? left.Count : right.Count
    while result < count && left[result] == right[result] {
      result++
    }
    return result
  }

  private func setHoverState(route List[Node], start int32, end int32, hovered bool,
    resolver Resolver) {
      for i in start ... end {
        let n = route[i]
        if n.Hovered != hovered {
          n.Hovered = hovered
          resolver.Invalidate(n, false)
        }
      }
    }

  private func dispatchHoverLeaves(route List[Node], shared int32, x float32, y float32) {
    for var i = route.Count; i > shared; i-- {
      let n = route[i - 1]
      if let callback = InputCallbacks.PointerLeave(n) {
        callback(hoverEvent(n, x, y))
        rebuildOwner(route, i - 1)
      }
    }
  }

  private func dispatchHoverEnters(route List[Node], shared int32, x float32, y float32) {
    for i in shared ... route.Count {
      let n = route[i]
      if let callback = InputCallbacks.PointerEnter(n) {
        callback(hoverEvent(n, x, y))
        rebuildOwner(route, i)
      }
    }
  }

  private func hoverEvent(n Node, x float32, y float32) PointerEvent {
    let point = TransformGeometry.WindowToNode(n, x, y)
    let position = if point.Valid {
      Point{ X: float64(point.X - n.Rect.X), Y: float64(point.Y - n.Rect.Y) }
    } else { Point{} }
    return PointerEvent{
      IsPrimary: true,
      Pressure: float64(pressure),
      Position: position,
      WindowPosition: Point{ X: float64(x), Y: float64(y) },
      Delta: Point{},
      Button: PointerButton.None,
      Buttons: heldButtons,
      Modifiers: lastModifiers,
    }
  }

  private func maskCanceledButtons(buttons PointerButtons) PointerButtons -> PointerButtons(int32(buttons) & (int32(-1) ^ int32(canceledButtons)))

  internal func AfterTreeUpdated(root Node?, resolver Resolver, text TextInput) {
    activate(mouse)
    afterTreeUpdatedCurrent(root, resolver, text)
    if let values = contacts {
      for var i = 0; i < values.Count; {
        let contact = values[i]
        activate(contact)
        let canceled = afterTreeUpdatedCurrent(root, resolver, text)
        if canceled {
          removeCurrentContact()
        } else {
          i++
        }
      }
    }
    restoreMouse()
  }

  private func afterTreeUpdatedCurrent(root Node?, resolver Resolver, text TextInput) bool {
    guard let tree = root else {
      let canceled = cancelInteraction(root, resolver, text)
      if currentDevice == PointerDevice.Mouse {
        clearHover(resolver)
        cursorValid = false
      }
      return canceled
    }
    var routeUnavailable = false
    if captureTarget != nil {
      routeUnavailable = !rebuildCapturePath(tree)
    } else if activeTarget != nil {
      routeUnavailable = !rebuildActivePath(tree)
    }
    if routeUnavailable {
      cancelInteraction(root, resolver, text)
      return true
    }
    if let d = dragEntry {
      if !nodeVisibleInTree(tree, d, false) || !canReceiveInput(d) {
        dragEntry = nil
      }
    }
    if let d = dragEditor {
      if !nodeVisibleInTree(tree, d, false) || !canReceiveInput(d) {
        dragEditor = nil
        dragEditorStarted = false
      }
    }
    if let pan = current.TouchPan {
      if !nodeVisibleInTree(tree, pan.Target, false) || !canReceiveInput(pan.Target) {
        cancelInteraction(root, resolver, text)
        return true
      }
    }
    if let state = scrollDragState() {
      if let target = state.Target {
        if !nodeVisibleInTree(tree, target, false) || !scrollThumbAvailable(target) {
          clearScrollDrag()
        }
      }
    }
    if !pressChainVisible(tree) {
      clearPressChain(resolver)
      clickTarget = nil
    }
    afterDragTreeUpdated(tree)
    if currentDevice == PointerDevice.Mouse && cursorValid {
      HandleMove(tree, resolver, cursor.X, cursor.Y)
    }
    return false
  }

  internal func RefreshHover(root Node?, resolver Resolver) bool {
    restoreMouse()
    if cursorValid {
      return HandleMove(root, resolver, cursor.X, cursor.Y)
    }
    return false
  }

  internal func CurrentCursor() Cursor {
    restoreMouse()
    if hoverChain.Count == 0 {
      return Cursor.Default
    }
    return hoverChain[hoverChain.Count - 1].Cursor
  }

  internal func HandleClick(root Node?, x float32, y float32) bool {
    restoreMouse()
    guard let tree = root else {
      return false
    }
    return hitDispatchClick(tree, x, y)
  }

  internal func HandleMove(root Node?, resolver Resolver, x float32, y float32) bool -> handleMove(root, resolver, x, y, true, true)

  internal func HandlePointerMove(root Node?, resolver Resolver, x float32, y float32,
    modifiers KeyModifiers) bool{
      if let hook = diagnosticsHook {
        if hook(root, PointerEventKind.Move, x, y, PointerButton.None) { return true }
      }
      let delta = nextDelta(x, y)
      lastModifiers = modifiers
      if touchPanActive() { return updateTouchPan(root, resolver, x, y, false) }
      if hasScrollDrag() {
        clearDragCandidate()
        return updateScrollDrag(root, x, y)
      }
      var prevented bool
      try {
        prevented = dispatchPointer(root, PointerEventKind.Move, x, y, delta.X, delta.Y,
          PointerButton.None, modifiers)
      } catch (error Exception) {
        if activeDragMatches() {
          terminateDrag(root, DragEndKind.Canceled, DragEffect.None, true, error)
        }
        ExceptionDispatchInfo.Capture(error).Throw()
      }
      if activeDragMatches() {
        if let tree = root {
          try {
            updateDragTarget(tree, x, y, modifiers, true)
          } catch (error Exception) {
            terminateDrag(tree, DragEndKind.Canceled, DragEffect.None, true, error)
          }
        }
        handleMove(root, resolver, x, y,
          currentDevice == PointerDevice.Mouse && !prevented, false)
        return true
      }
      if dragCandidate != nil {
        if prevented || captureTarget != nil || dragEntry != nil || dragEditorStarted {
          if dragCandidate != nil && dragPointerMatches() { clearDragCandidate() }
        } else if startDragIfReady(root, x, y, modifiers) {
          handleMove(root, resolver, x, y,
            currentDevice == PointerDevice.Mouse && !prevented, false)
          return true
        }
      }
      if updateTouchPan(root, resolver, x, y, prevented) { return true }
      return handleMove(root, resolver, x, y, currentDevice == PointerDevice.Mouse && !prevented,
        isSemanticPrimary() && !prevented)
    }

  private func handleMove(root Node?, resolver Resolver, x float32, y float32, allowHover bool,
    allowSelection bool) bool{
      if allowHover {
        cursor = Vector2(x, y)
        cursorValid = true
      }
      guard let tree = root else {
        return false
      }
      var changed = false
      if allowHover {
        scratchChain.Clear()
        hitChainInto(tree, x, y, scratchChain)
        if chainDisabled(scratchChain) {
          scratchChain.Clear()
        }
        changed = !sameNodes(hoverChain, scratchChain)
        if changed {
          commitHoverRoute(resolver, x, y)
        } else {
          scratchChain.Clear()
        }
      }

      if allowSelection {
        if let d = dragEntry {
          if !canReceiveInput(d) {
            dragEntry = nil
            return changed
          }
          let caret = d.Caret
          let affinity = d.CaretAffinity
          let scrollX = d.EditScrollX
          let blink = d.BlinkT
          let point = TransformGeometry.WindowToNode(d, x, y)
          if !point.Valid {
            dragEntry = nil
            return changed
          }
          let local = point.X - TextLayouts.ContentLeft(d)
          let hit = TextMetrics().HitAt(d, local)
          d.Caret = hit.Index
          d.CaretAffinity = TextAffinity(hit.Affinity)
          d.BlinkT = 0.0
          FollowCaret(d)
          if d.Caret != caret || d.CaretAffinity != affinity
            || d.EditScrollX != scrollX || blink != 0.0 {
              changed = true
            }
        }
        if let d = dragEditor {
          if !canReceiveInput(d) {
            dragEditor = nil
            dragEditorStarted = false
            return changed
          }
          let point = TransformGeometry.WindowToNode(d, x, y)
          if !point.Valid {
            dragEditor = nil
            dragEditorStarted = false
            return changed
          }
          if !dragEditorStarted && (MathF.Abs(x - lastPressX) >= 4.0F
              || MathF.Abs(y - lastPressY) >= 4.0F) {
                dragEditorStarted = true
              }
          if dragEditorStarted
            && TextEditorInputAdapter.DragTo(d, point.X - d.Rect.X, point.Y - d.Rect.Y) {
              changed = true
            }
        }
      }
      return changed
    }

  internal func HandlePress(root Node?, resolver Resolver, text TextInput, timeS float64, x float32, y float32) bool -> HandlePress(root, resolver, text, timeS, x, y, KeyModifiers {}, true)

  private func HandlePress(root Node?, resolver Resolver, text TextInput, timeS float64, x float32,
    y float32, modifiers KeyModifiers, semantic bool) bool{
      guard let tree = root else {
        return false
      }
      let dbl = timeS - lastPressT < 0.4 && MathF.Abs(x - lastPressX) < 4.0F && MathF.Abs(y - lastPressY) < 4.0F
      lastPressT = timeS
      lastPressX = x
      lastPressY = y
      clearPressChain(resolver)
      clickTarget = nil
      dragEntry = nil
      dragEditor = nil
      dragEditorStarted = false
      hitChainInto(tree, x, y, pressChain)
      if chainDisabled(pressChain) {
        pressChain.Clear()
        clickTarget = nil
        return false
      }
      for i in 0 ... pressChain.Count {
        let pressed = pressChain[i]
        pressed.PointerPressCount++
        if !pressed.Pressed {
          pressed.Pressed = true
          resolver.Invalidate(pressed, false)
        }
      }

      if !semantic {
        lastPressNode = nil
        lastPressCount = 0
        clickTarget = nil
        return pressChain.Count > 0
      }

      var target Node? = nil
      for var i = pressChain.Count; i > 0; i-- {
        if pressChain[i - 1].Focusable {
          target = pressChain[i - 1]
          break
        }
      }
      let focusedBefore = text.FocusedNode()
      text.SetFocus(resolver, target)
      if text.FocusedNode() != focusedBefore {
        current.FocusTarget = text.FocusedNode()
      } else {
        current.FocusTarget = nil
      }

      if let entry = target {
        if entry.Kind == NodeKind.Entry {
          let point = TransformGeometry.WindowToNode(entry, x, y)
          if !point.Valid { return false }
          let local = point.X - TextLayouts.ContentLeft(entry)
          let hit = TextMetrics().HitAt(entry, local)
          let index = hit.Index
          if dbl && entry == lastPressNode {
            let selection = Edit().SelectWordAt(EditState{ Text: entry.Buffer, Caret: entry.Caret, Anchor: entry.Anchor }, index)
            entry.Caret = selection.Caret
            entry.Anchor = selection.Anchor
            entry.CaretAffinity = TextAffinity.Upstream
            entry.AnchorAffinity = TextAffinity.Downstream
          } else {
            entry.Caret = index
            entry.Anchor = index
            entry.CaretAffinity = TextAffinity(hit.Affinity)
            entry.AnchorAffinity = entry.CaretAffinity
          }
          entry.BlinkT = 0.0
          FollowCaret(entry)
          text.RefreshInputArea(entry)
          dragEntry = entry
          lastPressCount = 0
        } else if entry.Kind == NodeKind.Editor {
          let point = TransformGeometry.WindowToNode(entry, x, y)
          if !point.Valid { return false }
          let repeated = dbl && entry == lastPressNode
          var count = repeated ? lastPressCount + 1 : 1
          if count > 3 { count = 3 }
          lastPressCount = count
          if TextEditorInputAdapter.SelectAt(entry, point.X - entry.Rect.X, point.Y - entry.Rect.Y,
            modifiers.Shift, count) {
              text.RefreshInputArea(entry)
              dragEditor = entry
            }
        } else {
          lastPressCount = 0
        }
      } else {
        lastPressCount = 0
      }
      lastPressNode = target
      clickTarget = deepestClickable(pressChain)
      return pressChain.Count > 0
    }

  internal func HandlePointerPress(root Node?, resolver Resolver, text TextInput, timeS float64,
    x float32, y float32, button PointerButton, buttons PointerButtons, hasButtons bool,
    modifiers KeyModifiers) bool -> HandlePointerPress(root, resolver, text, timeS, x, y, button, buttons, hasButtons,
      0.0F, false, modifiers)

  internal func HandlePointerPress(root Node?, resolver Resolver, text TextInput, timeS float64,
    x float32, y float32, button PointerButton, buttons PointerButtons, hasButtons bool,
    eventPressure float32, hasPressure bool, modifiers KeyModifiers) bool{
      if let hook = diagnosticsHook {
        if hook(root, PointerEventKind.Press, x, y, button) { return true }
      }
      nextDelta(x, y)
      lastModifiers = modifiers
      canceledButtons = removePointerButton(canceledButtons, button)
      heldButtons = hasButtons ? maskCanceledButtons(buttons) : addPointerButton(heldButtons, button)
      updatePressure(eventPressure, hasPressure)
      let semantic = acquireSemanticPrimary(button)
      if button == PointerButton.Primary && semantic {
        if let tree = root {
          if tryBeginScrollDrag(tree, resolver, x, y) { return true }
        }
      }
      let prevented = dispatchPointer(root, PointerEventKind.Press, x, y, 0.0F, 0.0F, button, modifiers)
      if button != PointerButton.Primary || prevented {
        return false
      }
      let handled = HandlePress(root, resolver, text, timeS, x, y, modifiers, semantic)
      if semantic {
        rememberDragCandidate()
        beginTouchPan(x, y)
      }
      return handled
    }

  internal func HandleRelease(root Node?, resolver Resolver, x float32, y float32) bool -> HandleRelease(root, resolver, x, y, true)

  private func HandleRelease(root Node?, resolver Resolver, x float32, y float32,
    allowClick bool) bool{
      var target Node? = nil
      if allowClick {
        if let pressed = clickTarget {
          if let tree = root {
            scratchChain.Clear()
            hitChainInto(tree, x, y, scratchChain)
            if !chainDisabled(scratchChain) && containsNode(scratchChain, pressed) {
              target = pressed
            }
            scratchChain.Clear()
          }
        }
      }
      clearPressChain(resolver)
      dragEntry = nil
      dragEditor = nil
      dragEditorStarted = false
      clickTarget = nil
      return if let activate = target { hitActivate(root, activate) } else { false }
    }

  internal func HandlePointerRelease(root Node?, resolver Resolver, x float32, y float32,
    button PointerButton, buttons PointerButtons, hasButtons bool, modifiers KeyModifiers) bool -> HandlePointerRelease(root, resolver, x, y, button, buttons, hasButtons, 0.0F, false,
      modifiers)

  internal func HandlePointerRelease(root Node?, resolver Resolver, x float32, y float32,
    button PointerButton, buttons PointerButtons, hasButtons bool, eventPressure float32,
    hasPressure bool, modifiers KeyModifiers) bool{
      if let hook = diagnosticsHook {
        if hook(root, PointerEventKind.Release, x, y, button) { return true }
      }
      if (int32(canceledButtons) & int32(pointerButtonMask(button))) != 0 {
        canceledButtons = removePointerButton(canceledButtons, button)
        if hasButtons {
          heldButtons = maskCanceledButtons(buttons)
        }
        return false
      }
      nextDelta(x, y)
      lastModifiers = modifiers
      heldButtons = hasButtons ? maskCanceledButtons(buttons) : removePointerButton(heldButtons, button)
      updatePressure(eventPressure, hasPressure)
      let semantic = isSemanticPrimary()
      try {
        if button == PointerButton.Primary && touchPanActive() {
          return updateTouchPan(root, resolver, x, y, false)
        }
        if button == PointerButton.Primary && hasScrollDrag() {
          updateScrollDrag(root, x, y)
          return true
        }
        if button == PointerButton.Primary && semantic && activeDragMatches() {
          var prevented bool
          try {
            prevented = dispatchPointer(root, PointerEventKind.Release, x, y,
              0.0F, 0.0F, button, modifiers)
          } catch (error Exception) {
            terminateDrag(root, DragEndKind.Canceled, DragEffect.None, true, error)
          }
          releaseCaptureAfterUp(button)
          if let tree = root {
            dropDrag(tree, x, y, modifiers)
          } else {
            terminateDrag(nil, DragEndKind.Canceled, DragEffect.None, false, nil)
          }
          HandleRelease(root, resolver, x, y, false)
          return true
        }
        let prevented = dispatchPointer(root, PointerEventKind.Release, x, y, 0.0F, 0.0F, button, modifiers)
        releaseCaptureAfterUp(button)
        if button != PointerButton.Primary || !semantic {
          return false
        }
        return HandleRelease(root, resolver, x, y, !prevented)
      } finally {
        releaseCaptureAfterUp(button)
        if button == PointerButton.Primary {
          clearPressChain(resolver)
          dragEntry = nil
          dragEditor = nil
          dragEditorStarted = false
          clearScrollDrag()
          clearTouchPan()
          clickTarget = nil
          if dragCandidate != nil && dragPointerMatches() { clearDragCandidate() }
          current.FocusTarget = nil
          releaseSemanticPrimary(button)
        }
        if heldButtons == PointerButtons.None { clearActiveRoute() }
      }
    }

  internal func HitInfo(root Node?, x float32, y float32) InputHitInfo {
    guard let tree = root else {
      return InputHitInfo{}
    }
    var info InputHitInfo
    hitChain.Clear()
    hitChainInto(tree, x, y, hitChain)
    if chainDisabled(hitChain) {
      hitChain.Clear()
      return info
    }
    for i in 0 ... hitChain.Count {
      let child = hitChain[i]
      if child.OnClick != nil || child.Focusable {
        info.HasContent = true
      }
      if child.DragsWindow {
        info.DragsWindow = true
      }
    }
    hitChain.Clear()
    return info
  }

  private func deepestClickable(chain List[Node]) Node? {
    for var i = chain.Count; i > 0; i-- {
      if chain[i - 1].OnClick != nil {
        return chain[i - 1]
      }
    }
    return nil
  }

  private func chainDisabled(chain List[Node]) bool {
    for i in 0 ... chain.Count {
      if chain[i].Disabled {
        return true
      }
    }
    return false
  }

  private func sameNodes(a List[Node], b List[Node]) bool {
    if a.Count != b.Count {
      return false
    }
    for i in 0 ... a.Count {
      if a[i] != b[i] {
        return false
      }
    }
    return true
  }

  private func containsNode(nodes List[Node], target Node) bool {
    for i in 0 ... nodes.Count {
      if nodes[i] == target { return true }
    }
    return false
  }

  private func nodeVisibleInTree(root Node, target Node, hidden bool) bool {
    let nowHidden = hidden || root.PaintInputHidden
    if root == target {
      return !nowHidden
    }
    for i in 0 ... root.Children.Count {
      if nodeVisibleInTree(root.Children[i], target, nowHidden) {
        return true
      }
    }
    return false
  }

  private func pressChainVisible(root Node) bool {
    for i in 0 ... pressChain.Count {
      let n = pressChain[i]
      if !nodeVisibleInTree(root, n, false) || !canReceiveInput(n) {
        return false
      }
    }
    return true
  }

  private func clearPressChain(resolver Resolver) {
    for i in 0 ... pressChain.Count {
      let n = pressChain[i]
      if n.PointerPressCount > 0 { n.PointerPressCount-- }
      if n.PointerPressCount == 0 && !n.KeyboardPressed && n.Pressed {
        n.Pressed = false
        resolver.Invalidate(n, false)
      }
    }
    pressChain.Clear()
  }

}

internal enum PointerEventKind { Move; Press; Release; Cancel; Wheel }

internal data struct QueuedPointerEvent {
  internal var Kind PointerEventKind
  internal var PointerId int64
  internal var Device PointerDevice
  internal var X float32
  internal var Y float32
  internal var DX float32
  internal var DY float32
  internal var Button PointerButton
  internal var Buttons PointerButtons
  internal var HasButtons bool
  internal var Pressure float32
  internal var HasPressure bool
  internal var Modifiers KeyModifiers
}

internal class PointerContact {
  internal let Id int64
  internal let Device PointerDevice
  internal var PressChain List[Node]
  internal var CapturePath List[Node]
  internal var CapturePositions List[Point]
  internal var ActivePath List[Node]
  internal var ActivePositions List[Point]
  internal var HeldButtons PointerButtons
  internal var CanceledButtons PointerButtons
  internal var CaptureTarget Node?
  internal var CaptureButton PointerButton
  internal var ActiveTarget Node?
  internal var ClickTarget Node?
  internal var DragEntry Node?
  internal var DragEditor Node?
  internal var DragEditorStarted bool
  internal var LastPressT float64
  internal var LastPressX float32
  internal var LastPressY float32
  internal var LastPressNode Node?
  internal var LastPressCount int32
  internal var LastEventX float32
  internal var LastEventY float32
  internal var LastEventValid bool
  internal var LastModifiers KeyModifiers
  internal var Pressure float32
  internal var FocusTarget Node?
  internal var TouchPan PointerTouchPanState?

  internal init(id int64, device PointerDevice) {
    Id = id
    Device = device
    PressChain = List[Node]()
    CapturePath = List[Node]()
    CapturePositions = List[Point]()
    ActivePath = List[Node]()
    ActivePositions = List[Point]()
    LastPressT = -10.0
  }
}

internal data struct InputHitInfo {
  internal var HasContent bool
  internal var DragsWindow bool
}
