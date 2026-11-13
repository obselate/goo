package Goo

import System
import System.Collections.Generic
import System.Numerics
import System.Runtime.ExceptionServices

internal partial class PointerInput {
  private let focus FocusManager
  private let mouse PointerContact
  private var contacts List[PointerContact]?
  private var current PointerContact
  private var primaryTouch PointerContact?
  private var primaryPen PointerContact?
  private var touchSequenceActive bool
  private var penSequenceActive bool
  private var cursor Vector2
  private var cursorValid bool
  private let queue InputEventQueue
  private var hoverChain List[NodeMount]
  private var hoverOwners List[Cell?] = List[Cell?]()
  private var scratchHoverOwners List[Cell?] = List[Cell?]()
  private var hoverGeneration int64
  private var scratchChain List[NodeMount]
  private var hitChain List[NodeMount]
  private var routePositions List[Point]
  private var routeDeltas List[Point]
  private var diagnosticsHook((Node?, PointerEventKind, float32, float32, PointerButton) -> bool)?
  private var control PointerDispatchControl
  private var dispatchGeneration int64
  private var wheelControl InputDispatchControl
  private var wheelDispatchGeneration int64
  internal var WheelScrollScale float32 = 1.0F
  internal var DragStartDistance float32 = 8.0F
  internal var UiScale float32 = 1.0F
  private var dragCandidateMount NodeMount
  private prop dragCandidate Node? {
    get -> dragCandidateMount.Current
    set -> dragCandidateMount = NodeMount(value)
  }
  private var dragSession PointerDragSession?
  private var dragPointerId int64
  private var dragPointerDevice PointerDevice
  private var dragHitPath List[NodeMount]?
  private var dragGeneration int64
  private var creatingDrag bool
  private var dragHost WindowHost?
  private var resetting bool

  internal func RetainsInteraction(root Node) bool {
    if FocusScopes.Contains(root, dragCandidate) || FocusScopes.Contains(root, dragSession?.Source)
      || FocusScopes.Contains(root, dragSession?.Target) || FocusScopes.Contains(root, dragSession?.RequestedTarget)
      || FocusScopes.Contains(root, control.CurrentTarget) || FocusScopes.Contains(root, control.CaptureOwner)
      || FocusScopes.Contains(root, control.CaptureTarget) || FocusScopes.Contains(root, control.ReleaseTarget) { return true }
    if contactRetainsInteraction(root, mouse) { return true }
    if let contacts = contacts {
      for contact in contacts {
        if contactRetainsInteraction(root, contact) { return true }
      }
    }
    if let groups = gestureGroups {
      for group in groups {
        if FocusScopes.Contains(root, group.DeferredClick) { return true }
        for candidate in group.Candidates {
          if !candidate.Terminal && FocusScopes.Contains(root, candidate.Owner) { return true }
        }
      }
    }
    return false
  }

  private func contactRetainsInteraction(root Node, contact PointerContact) bool {
    if FocusScopes.Contains(root, contact.CaptureTarget) || FocusScopes.Contains(root, contact.TouchPan?.Target)
      || FocusScopes.Contains(root, PointerScrollStates.Drag(contact)?.Target)
      || FocusScopes.Contains(root, PointerScrollStates.Press(contact)?.Target) { return true }
    if let pan = contact.TouchPan {
      for sample in pan.Samples {
        if FocusScopes.Contains(root, sample.Target) { return true }
      }
    }
    if contact.HeldButtons == PointerButtons.None { return false }
    if FocusScopes.Contains(root, contact.ActiveTarget) || FocusScopes.Contains(root, contact.ClickTarget)
      || FocusScopes.Contains(root, contact.DragEntry) || FocusScopes.Contains(root, contact.DragEditor)
      || FocusScopes.Contains(root, contact.FocusTarget) { return true }
    for mount in contact.PressChain {
      if FocusScopes.Contains(root, mount.Current) { return true }
    }
    return false
  }

  internal init(focus FocusManager, queue InputEventQueue) {
    this.focus = focus
    this.queue = queue
    mouse = PointerContact(0, PointerDevice.Mouse)
    current = mouse
    hoverChain = List[NodeMount]()
    scratchChain = List[NodeMount]()
    hitChain = List[NodeMount]()
    routePositions = List[Point]()
    routeDeltas = List[Point]()
    control = PointerDispatchControl()
    wheelControl = InputDispatchControl()
  }

  internal func SetDiagnosticsHook(value((Node?, PointerEventKind, float32, float32,
    PointerButton) -> bool)?) ->
  diagnosticsHook = value

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
      current = mouse
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
      if contact.Device == device && contact.HeldButtons != PointerButtons.None {
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
      current.Pressure = (int32(current.HeldButtons) & int32(PointerButtons.Primary)) != 0 ? 1.0F : 0.0F
    } else if hasValue {
      current.Pressure = normalizePressure(value)
    }
  }

  private func normalizePressure(value float32) float32 {
    if Single.IsNaN(value) || value <= 0.0F { return 0.0F }
    return if value >= 1.0F { 1.0F } else { value }
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

  internal func ChangeUiScale(root Node?, resolver Resolver, value float32) {
    let position = cursor * (UiScale / value)
    let hadPosition = cursorValid
    Reset(root, resolver)
    UiScale = value
    if hadPosition { QueueMove(position.X, position.Y, KeyModifiers{}) }
  }

  internal func Bind(host WindowHost) {
    dragHost = host
    host.PointerMoved += QueueMoveFromHost
    host.PointerPressed += QueuePressFromHost
    host.PointerReleased += QueueReleaseFromHost
    host.PointerCanceled += QueueCancel
    host.PointerHoverInvalidated += QueueHoverInvalidation
    host.Wheel += (x, y, dx, dy, modifiers) -> QueueWheel(x / UiScale, y / UiScale, dx, dy, modifiers)
    if let pinch = host as PinchInputHost? { pinch.Pinch += QueuePinch }
  }

  internal func Dispatch(e QueuedPointerEvent, root Node?, resolver Resolver,
    timeS float64, text TextInput) bool {
      gestureTime = timeS
      recognizerTime = e.ReceivedTime > 0.0 ? e.ReceivedTime : timeS
    try {
      if e.Kind == PointerEventKind.PinchBegin || e.Kind == PointerEventKind.PinchUpdate
        || e.Kind == PointerEventKind.PinchEnd { return DispatchPinch(e, root, resolver) }
      let createsContact = e.Kind == PointerEventKind.Press
        || (e.Kind == PointerEventKind.Move && e.Device == PointerDevice.Pen)
      if e.Device == PointerDevice.Mouse {
        current = mouse
      } else {
        guard let contact = findContact(e.PointerId, e.Device, createsContact) else { return false }
        current = contact
      }
      if e.Kind == PointerEventKind.Move {
        if e.HasButtons { current.HeldButtons = maskCanceledButtons(e.Buttons) }
        updatePressure(e.Pressure, e.HasPressure)
        return HandlePointerMove(root, resolver, e.X, e.Y, e.Modifiers)
      }
      if e.Kind == PointerEventKind.HoverInvalidation {
        clearHover(resolver)
        clearScrollHover(false, resolver)
        cursorValid = false
        return true
      }
      if e.Kind == PointerEventKind.Wheel {
        return HandleWheel(root, e.X, e.Y, e.DX, e.DY, e.Modifiers)
      }
      if e.Kind == PointerEventKind.Press {
        HandlePointerPress(root, resolver, text, timeS, e.X, e.Y, e.Button, e.Buttons,
          e.HasButtons, e.Pressure, e.HasPressure, e.Modifiers)
        return current.PressChain.Count > 0 || current.DragEntry != nil || current.DragEditor != nil
          || dragCandidate != nil || dragSession != nil
      }
      if e.Kind == PointerEventKind.Cancel {
        var diagnosticsConsumed = false
        if let hook = diagnosticsHook {
          diagnosticsConsumed = hook(root, PointerEventKind.Cancel, e.X, e.Y, e.Button)
        }
        try { return cancelInteraction(root, resolver) || diagnosticsConsumed }
        finally {
          if current.Device == PointerDevice.Touch { finishGestureContact(root, current.Id) }
          if current != mouse { removeCurrentContact() }
        }
      }
      let hadPress = current.PressChain.Count > 0 || current.DragEntry != nil || current.DragEditor != nil
        || currentOwnsDragState()
      let changed = HandlePointerRelease(root, resolver, e.X, e.Y, e.Button, e.Buttons,
        e.HasButtons, e.Pressure, e.HasPressure, e.Modifiers, text) || hadPress
      if current.Device == PointerDevice.Touch && current.HeldButtons == PointerButtons.None {
        finishGestureContact(root, current.Id)
        removeCurrentContact()
      } else if current.Device == PointerDevice.Pen && current.HeldButtons == PointerButtons.None {
        endDeviceSequenceIfIdle(PointerDevice.Pen)
      }
      return changed
    } finally {
      current = mouse
    }
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
        Kind: PointerEventKind.Move, PointerId: pointerId, Device: device, X: x / UiScale, Y: y / UiScale,
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
        Kind: PointerEventKind.Press, PointerId: pointerId, Device: device, X: x / UiScale, Y: y / UiScale,
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
        Kind: PointerEventKind.Release, PointerId: pointerId, Device: device, X: x / UiScale, Y: y / UiScale,
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

  internal func QueueCancel(pointerId int64, device PointerDevice) {
    queue.Add(QueuedPointerEvent{ Kind: PointerEventKind.Cancel, PointerId: pointerId, Device: device })
  }

  private func QueueHoverInvalidation() {
    queue.Add(QueuedPointerEvent{ Kind: PointerEventKind.HoverInvalidation })
  }

  internal func Reset(root Node?, resolver Resolver, preserveNative bool = false) {
    if resetting { return }
    motionResetVersion++
    resetting = true
    try { reset(root, resolver, preserveNative) }
    finally { resetting = false }
  }

  private func reset(root Node?, resolver Resolver, preserveNative bool) {
    var failure Exception?
    try {
      clearGestures(root, focus.NativeFocusAllowed ? GestureCancelReason.Explicit : GestureCancelReason.FocusLost)
      if !preserveNative || dragSession?.NativeActive != true { cancelDrag(root) }
    } catch (error Exception) {
      failure = error
    }
    current = mouse
    try {
      cancelInteraction(root, resolver, focus.NativeFocusAllowed ? GestureCancelReason.Explicit : GestureCancelReason.FocusLost)
    } catch (error Exception) {
      if failure == nil { failure = error }
    }
    if let values = contacts {
      for i in 0 ... values.Count {
        current = values[i]
        try {
          cancelInteraction(root, resolver, focus.NativeFocusAllowed ? GestureCancelReason.Explicit : GestureCancelReason.FocusLost)
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
    current = mouse
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
    current.HeldButtons = PointerButtons.None
    current.CanceledButtons = PointerButtons.None
    current.LastEventValid = false
    current.LastModifiers = KeyModifiers{}
    resetClickSequence()
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

  private func hoverPositionX() float32 -> cursorValid ? cursor.X : current.LastEventX

  private func hoverPositionY() float32 -> cursorValid ? cursor.Y : current.LastEventY

  private func commitHoverRoute(resolver Resolver, x float32, y float32) {
    hoverGeneration++
    let generation = hoverGeneration
    let shared = sharedHoverPrefix(hoverChain, scratchChain)
    CellOwnership.CaptureRoute(scratchChain, scratchHoverOwners)
    setHoverState(hoverChain, shared, hoverChain.Count, false, resolver)
    setHoverState(scratchChain, shared, scratchChain.Count, true, resolver)
    let tmp = hoverChain
    hoverChain = scratchChain
    scratchChain = tmp
    let oldOwners = hoverOwners
    hoverOwners = scratchHoverOwners
    scratchHoverOwners = oldOwners
    let leaveFailure = dispatchHoverLeaves(scratchChain, scratchHoverOwners, shared, x, y)
    scratchHoverOwners.Clear()
    if generation != hoverGeneration {
      if let error = leaveFailure { ExceptionDispatchInfo.Capture(error).Throw() }
      return
    }
    let enterFailure = dispatchHoverEnters(hoverChain, hoverOwners, shared, x, y)
    if let error = leaveFailure ?? enterFailure { ExceptionDispatchInfo.Capture(error).Throw() }
  }

  private func sharedHoverPrefix(left List[NodeMount], right List[NodeMount]) int32 {
    var result int32
    let count = left.Count < right.Count ? left.Count : right.Count
    while result < count && left[result].Equals(right[result]) {
      result++
    }
    return result
  }

  private func setHoverState(route List[NodeMount], start int32, end int32, hovered bool,
    resolver Resolver) {
      for i in start ... end {
        guard let n = hovered ? route[i].Current : route[i].Captured else { continue }
        if n.Hovered != hovered && !ScrollbarParts.IsPart(n) {
          n.Hovered = hovered
          resolver.Invalidate(n, false)
        }
      }
    }

  private func dispatchHoverLeaves(route List[NodeMount], owners List[Cell?], shared int32, x float32, y float32) Exception? {
    var failure Exception?
    let generation = hoverGeneration
    for var i = route.Count; i > shared; i-- {
      guard let n = route[i - 1].Captured else { continue }
      if let callback = InputCallbacks.PointerLeave(n) {
        let owner = owners[i - 1]
        try { callback(hoverEvent(n, x, y)) }
        catch (error Exception) { failure ??= error }
        finally { owner?.RebuildAfterCallback() }
      }
      if generation != hoverGeneration { break }
    }
    return failure
  }

  private func dispatchHoverEnters(route List[NodeMount], owners List[Cell?], shared int32, x float32, y float32) Exception? {
    var failure Exception?
    let generation = hoverGeneration
    for i in shared ... route.Count {
      guard let n = route[i].Current else { continue }
      if let callback = InputCallbacks.PointerEnter(n) {
        let owner = owners[i]
        try { callback(hoverEvent(n, x, y)) }
        catch (error Exception) { failure ??= error }
        finally { owner?.RebuildAfterCallback() }
      }
      if generation != hoverGeneration || route[i].Current == nil { break }
    }
    return failure
  }

  private func hoverEvent(n Node, x float32, y float32) PointerEvent {
    let point = TransformGeometry.WindowToNode(n, x, y)
    let position = if point.Valid {
      Point{ X: float64(point.X - n.Rect.X), Y: float64(point.Y - n.Rect.Y) }
    } else { Point{} }
    return PointerEvent{
      IsPrimary: true,
      Pressure: float64(current.Pressure),
      Position: position,
      WindowPosition: Point{ X: float64(x), Y: float64(y) },
      Delta: Point{},
      Button: PointerButton.None,
      Buttons: current.HeldButtons,
      Modifiers: current.LastModifiers,
    }
  }

  private func maskCanceledButtons(buttons PointerButtons) PointerButtons -> PointerButtons(int32(buttons) & (int32(-1) ^ int32(current.CanceledButtons)))

  internal func AfterTreeUpdated(root Node?, resolver Resolver) {
    if dragSession?.IsPointer == false && root == nil { cancelDrag(root) }
    refreshGestures(root)
    current = mouse
    afterTreeUpdatedCurrent(root, resolver)
    if let values = contacts {
      for var i = 0; i < values.Count; {
        let contact = values[i]
        current = contact
        let canceled = afterTreeUpdatedCurrent(root, resolver)
        if canceled {
          removeCurrentContact()
        } else {
          i++
        }
      }
    }
    current = mouse
  }

  private func afterTreeUpdatedCurrent(root Node?, resolver Resolver) bool {
    guard let tree = root else {
      let canceled = cancelInteraction(root, resolver, GestureCancelReason.OwnerUnavailable)
      if current.Device == PointerDevice.Mouse {
        clearHover(resolver)
        cursorValid = false
      }
      return canceled
    }
    if let drag = current.PointerDrag {
      if drag.Target.Current?.OnPointerDrag == nil { clearCapture(GestureCancelReason.OwnerUnavailable) }
    }
    var routeUnavailable = false
    if current.CapturePath.Count > 0 {
      routeUnavailable = !rebuildCapturePath(tree)
    } else if current.ActivePath.Count > 0 {
      routeUnavailable = !rebuildActivePath(tree)
    }
    if routeUnavailable {
      cancelInteraction(root, resolver, GestureCancelReason.OwnerUnavailable)
      return true
    }
    if let d = current.DragEntry {
      if !nodeVisibleInTree(tree, d, false) || !canReceiveInput(d) {
        current.DragEntry = nil
      }
    }
    if let d = current.DragEditor {
      if !nodeVisibleInTree(tree, d, false) || !canReceiveInput(d) {
        current.DragEditor = nil
        current.DragSelectionStarted = false
      }
    }
    if let pan = current.TouchPan {
      let target = pan.Target
      if target == nil || !nodeVisibleInTree(tree, target, false) || !canReceiveInput(target) {
        cancelInteraction(root, resolver, GestureCancelReason.OwnerUnavailable)
        return true
      }
    }
    if let state = scrollDragState() {
      let target = state.Target
      if target == nil || !nodeVisibleInTree(tree, target, false) || !scrollThumbAvailable(target, state.Vertical) {
        clearScrollDrag()
        clearScrollbarPartPress(resolver)
      }
    }
    if let state = scrollbarPartPressState() {
      let target = state.Target
      if target == nil || !nodeVisibleInTree(tree, target, false) {
        clearScrollbarPartPress(resolver)
      }
    }
    if !pressChainVisible(tree) {
      clearPressChain(resolver)
      current.ClickTarget = nil
    }
    afterDragTreeUpdated(tree)
    if current.Device == PointerDevice.Mouse && cursorValid {
      HandleMove(tree, resolver, cursor.X, cursor.Y)
    }
    return false
  }

  internal func RefreshHover(root Node?, resolver Resolver) bool {
    current = mouse
    if !cursorValid { return false }
    let moved = HandleMove(root, resolver, cursor.X, cursor.Y)
    return updateScrollHover(cursor.X, cursor.Y, resolver) || moved
  }

  internal func CurrentCursor() Cursor {
    current = mouse
    return if hoverChain.Count == 0 { Cursor.Default } else { hoverChain[hoverChain.Count - 1].Current?.Cursor ?? Cursor.Default }
  }

  internal func HandleMove(root Node?, resolver Resolver, x float32, y float32) bool -> handleMove(root, resolver, x, y, true, true)

  internal func HandlePointerMove(root Node?, resolver Resolver, x float32, y float32,
    modifiers KeyModifiers) bool{
      if let hook = diagnosticsHook {
        if hook(root, PointerEventKind.Move, x, y, PointerButton.None) { return true }
      }
      let delta = nextDelta(x, y)
      current.LastModifiers = modifiers
      if current.Device == PointerDevice.Touch && gestureGroupFor(current.Id)?.Claimed == true {
        return updateGestures(root, resolver, GestureInputKind.Move, x, y)
      }
      if touchPanActive() { return updateTouchPan(root, resolver, x, y, false) }
      if hasScrollDrag() {
        clearDragCandidate()
        let prevented = dispatchPointer(root, PointerEventKind.Move, x, y, delta.X, delta.Y,
          PointerButton.None, modifiers)
        return prevented || updateScrollDrag(root, x, y)
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
      if prevented || current.CaptureTarget != nil || activeDragMatches() {
        cancelCurrentGestures(root, GestureCancelReason.LostArbitration)
      } else if updateGestures(root, resolver, GestureInputKind.Move, x, y) {
        return true
      }
      if activeDragMatches() {
        if let tree = root {
          try {
            updateDragTarget(tree, x, y, modifiers, true)
            promoteNativeDrag(tree, x, y)
          } catch (error Exception) {
            terminateDrag(tree, DragEndKind.Canceled, DragEffect.None, true, error)
          }
        }
        handleMove(root, resolver, x, y,
          current.Device == PointerDevice.Mouse && !prevented, false)
        return true
      }
      if dragCandidate != nil {
        if prevented || current.CaptureTarget != nil || current.DragEntry != nil || current.DragSelectionStarted {
          if dragCandidate != nil && dragPointerMatches() { clearDragCandidate() }
        } else if startDragIfReady(root, x, y, modifiers) {
          cancelCurrentGestures(root, GestureCancelReason.LostArbitration)
          handleMove(root, resolver, x, y,
            current.Device == PointerDevice.Mouse && !prevented, false)
          return true
        }
      }
      if updateTouchPan(root, resolver, x, y, prevented) {
        cancelCurrentGestures(root, GestureCancelReason.LostArbitration)
        return true
      }
      let moved = handleMove(root, resolver, x, y,
        current.Device == PointerDevice.Mouse && !prevented,
        isSemanticPrimary() && !prevented)
      let scrollbarHoverChanged = current.Device == PointerDevice.Mouse && !prevented
        ? updateScrollHover(x, y, resolver) : false
      return moved || scrollbarHoverChanged
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
          CellOwnership.CaptureRoute(scratchChain, hoverOwners)
          scratchChain.Clear()
        }
      }

      if allowSelection {
        if let d = current.DragEntry {
          if !canReceiveInput(d) {
            current.DragEntry = nil
            return changed
          }
          if !current.DragSelectionStarted && dragThresholdCrossed(x, y, 4.0F) {
            current.DragSelectionStarted = true
          }
          if !current.DragSelectionStarted { return changed }
          let caret = d.Caret
          let affinity = d.CaretAffinity
          let scrollX = d.EditScrollX
          let blink = d.BlinkT
          let point = TransformGeometry.WindowToNode(d, x, y)
          if !point.Valid {
            current.DragEntry = nil
            return changed
          }
          let local = point.X - BoxGeometry.ContentLeft(d)
          let hit = TextMetrics().HitAt(d, local, current.LastPressCount >= 2)
          if current.LastPressCount >= 2 {
            let target = current.LastPressCount >= 3 ? TextRange{ Start: 0, Length: d.Buffer.Length }
              : TextSelectionRanges.Word(d.Buffer, hit.Index)
            let selected = TextSelectionRanges.Extend(current.DragSelectionOrigin, target)
            d.Anchor = selected.Anchor.Offset
            d.Caret = selected.Active.Offset
            d.AnchorAffinity = selected.Anchor.Affinity
            d.CaretAffinity = selected.Active.Affinity
          } else {
            d.Caret = hit.Index
            d.CaretAffinity = TextAffinity(hit.Affinity)
          }
          d.BlinkT = 0.0
          FollowCaret(d)
          if d.Caret != caret || d.CaretAffinity != affinity
            || d.EditScrollX != scrollX || blink != 0.0 {
              changed = true
            }
        }
        if let d = current.DragEditor {
          if !canReceiveInput(d) {
            current.DragEditor = nil
            current.DragSelectionStarted = false
            return changed
          }
          let point = TransformGeometry.WindowToNode(d, x, y)
          if !point.Valid {
            current.DragEditor = nil
            current.DragSelectionStarted = false
            return changed
          }
          if !current.DragSelectionStarted && (MathF.Abs(x - current.LastPressX) >= 4.0F
              || MathF.Abs(y - current.LastPressY) >= 4.0F) {
                current.DragSelectionStarted = true
              }
          if current.DragSelectionStarted
            && TextEditorInputAdapter.DragTo(d, point.X - d.Rect.X, point.Y - d.Rect.Y,
              current.LastPressCount, current.DragSelectionOrigin) {
              changed = true
            }
        }
      }
      return changed
    }

  private func HandlePress(root Node?, resolver Resolver, text TextInput, x float32,
    y float32, modifiers KeyModifiers, semantic bool) bool{
      guard let tree = root else {
        return false
      }
      clearPressChain(resolver)
      current.ClickTarget = nil
      current.DragEntry = nil
      current.DragEditor = nil
      current.DragSelectionStarted = false
      hitChainInto(tree, x, y, current.PressChain)
      if chainDisabled(current.PressChain) {
        current.PressChain.Clear()
        current.ClickTarget = nil
        return false
      }
      for i in 0 ... current.PressChain.Count {
        guard let pressed = current.PressChain[i].Current else { continue }
        pressed.PointerPressCount++
        if !pressed.Pressed {
          pressed.Pressed = true
          resolver.Invalidate(pressed, false)
        }
      }

      if !semantic {
        current.ClickTarget = nil
        return current.PressChain.Count > 0
      }

      var target Node? = nil
      for var i = current.PressChain.Count; i > 0; i-- {
        if let candidate = current.PressChain[i - 1].Current && candidate.Focusable {
          target = candidate
          break
        }
      }
      let focusedBefore = focus.FocusedNode()
      focus.SetFocus(resolver, target)
      if focus.FocusedNode() != focusedBefore {
        current.FocusTarget = focus.FocusedNode()
      } else {
        current.FocusTarget = nil
      }

      if let entry = target {
        if hasPendingTouchGesture() {
          current.TouchCaretPending = entry.Kind == NodeKind.Entry || entry.Kind == NodeKind.Editor
        } else if entry.Kind == NodeKind.Entry {
          let point = TransformGeometry.WindowToNode(entry, x, y)
          if !point.Valid { return false }
          let local = point.X - BoxGeometry.ContentLeft(entry)
          let hit = TextMetrics().HitAt(entry, local, current.LastPressCount >= 2)
          let index = hit.Index
          if current.LastPressCount >= 2 {
            text.ExecuteEditorCommand(tree, resolver, TextCommand{
              Kind: current.LastPressCount >= 3 ? TextCommandKind.SelectLine : TextCommandKind.SelectWord,
              Position: TextPosition{ Offset: index, Affinity: TextAffinity(hit.Affinity) },
              ExtendSelection: modifiers.Shift,
            })
          } else {
            entry.Caret = index
            if !modifiers.Shift { entry.Anchor = index }
            entry.CaretAffinity = TextAffinity(hit.Affinity)
            if !modifiers.Shift { entry.AnchorAffinity = entry.CaretAffinity }
          }
          current.DragSelectionOrigin = TextRange{ Start: Math.Min(entry.Anchor, entry.Caret),
            Length: Math.Abs(entry.Caret - entry.Anchor) }
          entry.BlinkT = 0.0
          FollowCaret(entry)
          text.RefreshInputArea(entry)
          current.DragEntry = entry
        } else if entry.Kind == NodeKind.Editor || entry.Selectable {
          let point = TransformGeometry.WindowToNode(entry, x, y)
          if !point.Valid { return false }
          if TextEditorInputAdapter.SelectAt(entry, point.X - entry.Rect.X, point.Y - entry.Rect.Y,
            modifiers.Shift, current.LastPressCount) {
              text.RefreshInputArea(entry)
              current.DragEditor = entry
              if entry.Selectable {
                current.DragSelectionOrigin = TextRange(Math.Min(entry.Anchor, entry.Caret),
                  Math.Abs(entry.Anchor - entry.Caret))
              }
              if let selected = entry.EditorController?.Selection {
                current.DragSelectionOrigin = TextRange{
                  Start: Math.Min(selected.Anchor.Offset, selected.Active.Offset),
                  Length: Math.Abs(selected.Active.Offset - selected.Anchor.Offset) }
              }
            }
        }
      }
      current.ClickTarget = deepestClickable(current.PressChain)
      return current.PressChain.Count > 0
    }

  internal func HandlePointerPress(root Node?, resolver Resolver, text TextInput, timeS float64,
    x float32, y float32, button PointerButton, buttons PointerButtons, hasButtons bool,
    modifiers KeyModifiers) bool -> HandlePointerPress(root, resolver, text, timeS, x, y, button, buttons, hasButtons,
      0.0F, false, modifiers)

  internal func HandlePointerPress(root Node?, resolver Resolver, text TextInput, timeS float64,
    x float32, y float32, button PointerButton, buttons PointerButtons, hasButtons bool,
    eventPressure float32, hasPressure bool, modifiers KeyModifiers) bool{
      focus.SetKeyboardModality(resolver, false)
      if let hook = diagnosticsHook {
        if hook(root, PointerEventKind.Press, x, y, button) { return true }
      }
      nextDelta(x, y)
      current.LastModifiers = modifiers
      current.CanceledButtons = removePointerButton(current.CanceledButtons, button)
      current.HeldButtons = hasButtons ? maskCanceledButtons(buttons) : addPointerButton(current.HeldButtons, button)
      updatePressure(eventPressure, hasPressure)
      let semantic = acquireSemanticPrimary(button)
      let prevented = dispatchPointer(root, PointerEventKind.Press, x, y, 0.0F, 0.0F, button, modifiers, timeS)
      if button != PointerButton.Primary || prevented {
        return false
      }
      if current.Device == PointerDevice.Touch && nativePinch?.Claimed == true {
        return cancelInteraction(root, resolver, GestureCancelReason.LostArbitration)
      }
      beginGestures(root, resolver, x, y)
      if semantic {
        if let tree = root {
          if tryBeginScrollInteraction(tree, resolver, x, y) {
            resetClickSequence()
            return true
          }
        }
      }
      let handled = HandlePress(root, resolver, text, x, y, modifiers, semantic)
      if semantic {
        rememberDragCandidate()
        beginTouchPan(x, y)
      }
      return updateGestures(root, resolver, GestureInputKind.Down, x, y) || handled
    }

  private func HandleRelease(root Node?, resolver Resolver, x float32, y float32,
    allowClick bool) bool{
      var target Node? = nil
      if allowClick {
        if let pressed = current.ClickTarget {
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
      if let group = gestureGroupFor(current.Id), let pressed = target {
        for candidate in group.Candidates {
          if !candidate.Terminal && !candidate.Accepted
            && Double.IsFinite(candidate.Session.NextDeadlineSeconds()) {
            group.DeferredClick = pressed
            target = nil
            break
          }
        }
      }
      clearPressChain(resolver)
      current.DragEntry = nil
      current.DragEditor = nil
      current.DragSelectionStarted = false
      current.ClickTarget = nil
      return if let activate = target { hitActivate(root, activate) } else { false }
    }

  internal func HandlePointerRelease(root Node?, resolver Resolver, x float32, y float32,
    button PointerButton, buttons PointerButtons, hasButtons bool, modifiers KeyModifiers) bool -> HandlePointerRelease(root, resolver, x, y, button, buttons, hasButtons, 0.0F, false,
      modifiers)

  internal func HandlePointerRelease(root Node?, resolver Resolver, x float32, y float32,
    button PointerButton, buttons PointerButtons, hasButtons bool, eventPressure float32,
    hasPressure bool, modifiers KeyModifiers, text TextInput? = nil) bool{
      if let hook = diagnosticsHook {
        if hook(root, PointerEventKind.Release, x, y, button) { return true }
      }
      if (int32(current.CanceledButtons) & int32(pointerButtonMask(button))) != 0 {
        current.CanceledButtons = removePointerButton(current.CanceledButtons, button)
        if hasButtons {
          current.HeldButtons = maskCanceledButtons(buttons)
        }
        return false
      }
      nextDelta(x, y)
      current.LastModifiers = modifiers
      current.HeldButtons = hasButtons ? maskCanceledButtons(buttons) : removePointerButton(current.HeldButtons, button)
      updatePressure(eventPressure, hasPressure)
      let semantic = isSemanticPrimary()
      try {
        if current.Device == PointerDevice.Touch && gestureGroupFor(current.Id)?.Claimed == true {
          return updateGestures(root, resolver, GestureInputKind.Up, x, y)
        }
        if button == PointerButton.Primary && touchPanActive() {
          return finishTouchPan(root, resolver, x, y)
        }
        if button == PointerButton.Primary && hasScrollDrag() {
          let prevented = dispatchPointer(root, PointerEventKind.Release, x, y,
            0.0F, 0.0F, button, modifiers)
          if !prevented {
            updateScrollDrag(root, x, y)
          }
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
          if prevented {
            terminateDrag(root, DragEndKind.Canceled, DragEffect.None, true, nil)
          } else if let tree = root {
            dropDrag(tree, x, y, modifiers)
          } else {
            terminateDrag(nil, DragEndKind.Canceled, DragEffect.None, false, nil)
          }
          HandleRelease(root, resolver, x, y, false)
          return true
        }
        let prevented = dispatchPointer(root, PointerEventKind.Release, x, y, 0.0F, 0.0F, button, modifiers)
        if prevented || current.CaptureTarget != nil {
          cancelCurrentGestures(root, GestureCancelReason.LostArbitration)
        } else if updateGestures(root, resolver, GestureInputKind.Up, x, y) {
          return true
        }
        if !prevented && semantic && current.TouchCaretPending {
          if let text = text {
            completingTouchTap = true
            try { HandlePress(root, resolver, text, x, y, modifiers, true) }
            finally { completingTouchTap = false }
          }
        }
        releaseCaptureAfterUp(button)
        return if button != PointerButton.Primary || !semantic { false } else { HandleRelease(root, resolver, x, y, !prevented) }
      } finally {
        releaseCaptureAfterUp(button)
        if button == PointerButton.Primary {
          current.TouchCaretPending = false
          clearPressChain(resolver)
          current.DragEntry = nil
          current.DragEditor = nil
          current.DragSelectionStarted = false
          clearScrollDrag()
          clearScrollbarPartPress(resolver)
          clearTouchPan()
          current.ClickTarget = nil
          if dragCandidate != nil && dragPointerMatches() { clearDragCandidate() }
          current.FocusTarget = nil
          releaseSemanticPrimary(button)
        }
        if current.HeldButtons == PointerButtons.None { clearActiveRoute() }
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
      guard let child = hitChain[i].Current else { continue }
      if child.IsPortal { info.DragsWindow = false }
      if child.DragsWindow {
        info.DragsWindow = true
        info.HasContent = false
      }
      if isInteractiveContent(child) {
        info.HasContent = true
      }
    }
    hitChain.Clear()
    return info
  }

  private func deepestClickable(chain List[NodeMount]) Node? {
    for var i = chain.Count; i > 0; i-- {
      guard let node = chain[i - 1].Current else { return nil }
      if hasActivation(node) { return node }
      if node.FocusScopeBoundary { break }
    }
    return nil
  }

  private func chainDisabled(chain List[NodeMount]) bool {
    if chain.Count == 0 { return false }
    guard let root = chain[0].Current, let target = chain[chain.Count - 1].Current else { return true }
    if root.HasFocusScopes && !FocusScopes.Allows(root, target) { return true }
    for mount in chain {
      guard let node = mount.Current else { return true }
      if node.Disabled { return true }
    }
    return false
  }

  private func sameNodes(a List[NodeMount], b List[NodeMount]) bool {
    if a.Count != b.Count {
      return false
    }
    for i in 0 ... a.Count {
      if !a[i].Equals(b[i]) {
        return false
      }
    }
    return true
  }

  private func containsNode(nodes List[NodeMount], target Node) bool {
    for i in 0 ... nodes.Count {
      if nodes[i].Current == target { return true }
    }
    return false
  }

  private func nodeVisibleInTree(root Node, target Node, hidden bool) bool {
    if hidden { return false }
    var current Node? = target
    while let node = current {
      if node.Retired || node.PaintInputHidden { return false }
      if node == root { return true }
      current = node.Parent
    }
    return false
  }

  private func pressChainVisible(root Node) bool {
    if current.PressChain.Count == 0 { return true }
    guard let target = current.PressChain[current.PressChain.Count - 1].Current else { return false }
    return nodeVisibleInTree(root, target, false) && canReceiveInput(target)
  }

  private func clearPressChain(resolver Resolver) {
    for i in 0 ... current.PressChain.Count {
      guard let n = current.PressChain[i].Captured else { continue }
      if n.PointerPressCount > 0 { n.PointerPressCount-- }
      if n.PointerPressCount == 0 && !n.KeyboardPressed && n.Pressed {
        n.Pressed = false
        resolver.Invalidate(n, false)
      }
    }
    current.PressChain.Clear()
  }

}

internal enum PointerEventKind {
  Move; Press; Release; Cancel; Wheel; HoverInvalidation; PinchBegin; PinchUpdate; PinchEnd
}

internal data struct QueuedPointerEvent {
  internal var Kind PointerEventKind
  internal var ReceivedTime float64
  internal var PointerId int64
  internal var Device PointerDevice
  internal var X float32
  internal var Y float32
  internal var DX float32
  internal var DY float32
  internal var PinchScale float32
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
  internal var PressChain List[NodeMount]
  internal var CapturePath List[NodeMount]
  internal var CapturePositions List[Point]
  internal var ActivePath List[NodeMount]
  internal var ActivePositions List[Point]
  internal var HeldButtons PointerButtons
  internal var CanceledButtons PointerButtons
  internal var Canceling bool
  internal var PointerDrag PointerDragState?
  private var captureTargetMount NodeMount
  internal prop CaptureTarget Node? {
    get -> captureTargetMount.Current
    set -> captureTargetMount = NodeMount(value)
  }
  internal var CaptureButton PointerButton
  private var activeTargetMount NodeMount
  private var clickTargetMount NodeMount
  private var dragEntryMount NodeMount
  private var dragEditorMount NodeMount
  internal prop ActiveTarget Node? {
    get -> activeTargetMount.Current
    set -> activeTargetMount = NodeMount(value)
  }
  internal prop ClickTarget Node? {
    get -> clickTargetMount.Current
    set -> clickTargetMount = NodeMount(value)
  }
  internal prop DragEntry Node? {
    get -> dragEntryMount.Current
    set -> dragEntryMount = NodeMount(value)
  }
  internal prop DragEditor Node? {
    get -> dragEditorMount.Current
    set -> dragEditorMount = NodeMount(value)
  }
  internal var DragSelectionStarted bool
  internal var TouchCaretPending bool
  internal var DragSelectionOrigin TextRange
  internal var LastPressT float64
  internal var LastPressX float32
  internal var LastPressY float32
  private var lastPressMount NodeMount
  internal prop LastPressNode Node? {
    get -> lastPressMount.Current
    set -> lastPressMount = NodeMount(value)
  }
  internal var LastPressButton PointerButton
  internal var LastPressCount int32
  internal var LastEventX float32
  internal var LastEventY float32
  internal var LastEventValid bool
  internal var LastModifiers KeyModifiers
  internal var Pressure float32
  private var focusTargetMount NodeMount
  internal prop FocusTarget Node? {
    get -> focusTargetMount.Current
    set -> focusTargetMount = NodeMount(value)
  }
  internal var TouchPan PointerTouchPanState?

  internal init(id int64, device PointerDevice) {
    Id = id
    Device = device
    PressChain = List[NodeMount]()
    CapturePath = List[NodeMount]()
    CapturePositions = List[Point]()
    ActivePath = List[NodeMount]()
    ActivePositions = List[Point]()
    LastPressT = -10.0
  }
}

internal data struct InputHitInfo {
  internal var HasContent bool
  internal var DragsWindow bool
}
