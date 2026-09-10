package Goo

import System
import System.Collections.Generic
import System.Runtime.ExceptionServices

internal class InputCoordinator {
  private var keyboard KeyboardInput
  private var pointer PointerInput
  private var text TextInput
  private var attachedHost WindowHost?
  private var disposed bool

  internal init() {
    keyboard = KeyboardInput()
    pointer = PointerInput()
    text = TextInput()
  }

  internal func SetDiagnostics(
    pointerHook((Node?, PointerEventKind, float32, float32, PointerButton) -> bool)?,
    keyboardHook((Key, KeyModifiers) -> bool)?) {
      pointer.SetDiagnosticsHook(pointerHook)
      keyboard.SetDiagnosticsHook(keyboardHook)
    }

  internal func Attach(host WindowHost) {
    if disposed { throw ObjectDisposedException("InputCoordinator") }
    if attachedHost == host {
      return
    }
    if attachedHost != nil {
      throw InvalidOperationException("Input is already attached to another host")
    }
    attachedHost = host
    text.Attach(host)
    pointer.Bind(host)
    keyboard.Bind(host)
    host.TextEntered += (value string) -> {
      QueueText(value)
    }
    host.TextEditing += (value string, selectionStart int32, selectionLength int32) -> {
      QueueComposition(value, selectionStart, selectionLength)
    }
    host.TextEditingCandidates += (candidates IReadOnlyList[string], selected int32,
      horizontal bool) -> {
        QueueCompositionCandidates(candidates, selected, horizontal)
      }
    host.TextCompositionCanceled += () -> {
      QueueCompositionCancel()
    }
  }

  internal func Drain(root Node?, resolver Resolver, timeS float64,
    onKeyPress Action[Key, KeyModifiers]?) bool ->
  Drain(root, resolver, timeS, onKeyPress, 0)

  internal func Drain(root Node?, resolver Resolver, timeS float64,
    onKeyPress Action[Key, KeyModifiers]?, repeatStartTicks int64) bool{
      let pointerChanged = pointer.Drain(root, resolver, timeS, text)
      return keyboard.Drain(root, resolver, text, onKeyPress, repeatStartTicks, pointer)
        || pointerChanged
    }

  internal func AfterTreeUpdated(root Node?, resolver Resolver, rebuilt bool) {
    if !rebuilt {
      return
    }
    try {
      if let tree = root {
        if hasUnavailableFocus(tree, false, false) {
          text.SetFocus(resolver, nil)
        }
      }
      text.AfterTreeUpdated(root, resolver)
      keyboard.AfterTreeUpdated(resolver, text)
      pointer.AfterTreeUpdated(root, resolver, text)
    } finally {
      resolver.Flush()
    }
  }

  internal func Step(root Node?, resolver Resolver, dt float64) bool {
    try {
      let blinked = text.Step(dt)
      return keyboard.Step(root, resolver, text, dt) || blinked
    } finally {
      resolver.Flush()
    }
  }

  internal func Step(root Node?, resolver Resolver, dt float64, nowTicks int64) bool {
    try {
      let blinked = text.Step(dt)
      return keyboard.Step(root, resolver, text, dt, nowTicks) || blinked
    } finally {
      resolver.Flush()
    }
  }

  // Shortens idle waits to the next caret blink or key-repeat edge.
  internal func NextTickDeadlineSeconds() float64 ->
  Math.Min(text.BlinkDeadlineSeconds(), keyboard.RepeatDeadlineSeconds())

  internal func RefreshHover(root Node?, resolver Resolver) bool {
    try {
      return pointer.RefreshHover(root, resolver)
    } finally {
      resolver.Flush()
    }
  }

  internal func CurrentCursor() Cursor -> pointer.CurrentCursor()
  internal func ConsumeScrollRectsDirty() bool -> pointer.ConsumeScrollRectsDirty()

  internal func FocusLost(root Node?, resolver Resolver) {
    try {
      text.SetNativeFocus(false)
      keyboard.Reset(resolver)
      text.SetFocus(resolver, nil)
      if root != nil {
        pointer.Reset(root, resolver, text)
      } else {
        pointer.FocusLost(root, resolver)
      }
    } finally {
      text.SetNativeFocus(false)
      resolver.Flush()
    }
  }

  internal func FocusLost(resolver Resolver) {
    FocusLost(nil, resolver)
  }

  internal func FocusGained() -> text.SetNativeFocus(true)

  internal func FocusElement(resolver Resolver, target Node) bool {
    if target.Retired || !target.Focusable || !canReceiveInput(target) {
      return false
    }
    text.SetFocus(resolver, target)
    return text.FocusedNode() == target
  }

  internal func FocusedNode() Node ? -> text.FocusedNode()

  internal func EditorSnapshot() FocusedEditorSnapshot ? -> text.EditorSnapshot()

  internal func CommitEditorText(root Node?, value string) bool -> text.CommitPlatformText(root, value)

  internal func ClearEditorFocus(resolver Resolver) -> text.ClearEditorFocus(resolver)

  internal func MoveEditorFocus(root Node?, resolver Resolver, forward bool) bool ->
  text.MoveEditorFocus(root, resolver, forward)

  internal func SetEditorSelection(root Node?, start int32, end int32) bool ->
  text.SetEditorSelection(root, start, end)

  internal func SetEditorComposition(root Node?, value string, start int32, length int32) bool ->
  text.HandleComposition(root, value, start, length)

  internal func SetEditorCompositionRange(root Node?, start int32, end int32) bool ->
  text.SetEditorCompositionRange(root, start, end)

  internal func FinishEditorComposition(root Node?) bool -> text.FinishComposition(root)

  internal func CancelEditorComposition(root Node?) bool -> text.HandleCompositionCancel(root)

  internal func DeleteEditorSurroundingText(root Node?, before int32, after int32) bool ->
  text.DeleteSurroundingText(root, before, after)

  internal func ExecuteEditorCommand(root Node?, resolver Resolver, command TextCommand) bool ->
  text.ExecuteEditorCommand(root, resolver, command)

  internal func BlurElement(resolver Resolver, target Node) bool {
    if target.Retired || text.FocusedNode() != target {
      return false
    }
    text.SetFocus(resolver, nil)
    return true
  }

  internal func Reset(root Node?, resolver Resolver) {
    var failure Exception?
    try {
      keyboard.Reset(resolver)
    } catch (error Exception) {
      failure = error
    }
    try {
      pointer.Reset(root, resolver, text)
    } catch (error Exception) {
      if failure == nil { failure = error }
    }
    try {
      text.SetFocus(resolver, nil)
    } catch (error Exception) {
      if failure == nil { failure = error }
    }
    try {
      resolver.Flush()
    } catch (error Exception) {
      if failure == nil { failure = error }
    }
    if let error = failure { ExceptionDispatchInfo.Capture(error).Throw() }
  }

  internal func Dispose() {
    if disposed {
      return
    }
    disposed = true
    text.Dispose()
  }

  internal func HandleClick(root Node?, x float32, y float32) bool ->
  pointer.HandleClick(root, x, y)

  internal func HandleWheel(root Node?, x float32, y float32, dx float32, dy float32) bool ->
  pointer.HandleWheel(root, x, y, dx, dy)

  internal func HandleWheel(root Node?, x float32, y float32, dx float32, dy float32,
    modifiers KeyModifiers) bool -> pointer.HandleWheel(root, x, y, dx, dy, modifiers)

  internal func HandleMove(root Node?, resolver Resolver, x float32, y float32) bool {
    try {
      return pointer.HandleMove(root, resolver, x, y)
    } finally {
      resolver.Flush()
    }
  }

  internal func HandlePress(root Node?, resolver Resolver, timeS float64, x float32, y float32) bool {
    try {
      return pointer.HandlePress(root, resolver, text, timeS, x, y)
    } finally {
      resolver.Flush()
    }
  }

  internal func HandleRelease(root Node?, resolver Resolver, x float32, y float32) bool {
    try {
      return pointer.HandleRelease(root, resolver, x, y)
    } finally {
      resolver.Flush()
    }
  }

  internal func HandleKey(root Node?, resolver Resolver, key Key, shift bool, ctrl bool) bool ->
  HandleKey(root, resolver, key, KeyModifiers{ Shift: shift, Ctrl: ctrl })

  internal func HandleKey(root Node?, resolver Resolver, key Key, modifiers KeyModifiers) bool {
    try {
      if pointer.HandleDragKey(root, key, modifiers) { return true }
      return keyboard.HandleKey(root, resolver, text, key, modifiers)
    } finally {
      resolver.Flush()
    }
  }

  internal func HandleChar(root Node?, value string) bool -> text.HandleChar(root, value)

  internal func SetClipboardFallback(value string) {
    text.SetClipboardFallback(value)
  }

  internal func AccessibilitySetValue(root Node?, resolver Resolver, target Node, value string) bool {
    let result = text.AccessibilitySetValue(root, target, value)
    if result { resolver.Invalidate(target, false) }
    return result
  }

  internal func AccessibilitySetSelection(resolver Resolver, target Node, start int32,
    length int32) bool{
      let result = text.AccessibilitySetSelection(target, start, length)
      if result { resolver.Invalidate(target, false) }
      return result
    }

  internal func QueueKeyPress(key Key, modifiers KeyModifiers) {
    keyboard.QueueKeyPress(key, modifiers)
  }

  internal func QueueKeyRelease(key Key) {
    keyboard.QueueKeyRelease(key)
  }

  internal func QueueText(value string) {
    keyboard.QueueText(value, text.FocusGeneration())
  }

  internal func QueueComposition(value string, selectionStart int32, selectionLength int32) {
    keyboard.QueueComposition(value, selectionStart, selectionLength, text.FocusGeneration())
  }

  internal func QueueCompositionCandidates(candidates IReadOnlyList[string], selected int32,
    horizontal bool) {
      keyboard.QueueCompositionCandidates(candidates, selected, horizontal, text.FocusGeneration())
    }

  internal func QueueCompositionCancel() {
    keyboard.QueueCompositionCancel(text.FocusGeneration())
  }

  internal func QueuePointerMove(x float32, y float32) {
    pointer.QueueMove(x, y)
  }

  internal func QueuePointerPress(x float32, y float32) {
    pointer.QueuePress(x, y)
  }

  internal func QueuePointerPress(x float32, y float32, button PointerButton, modifiers KeyModifiers) {
    pointer.QueuePress(x, y, button, modifiers)
  }

  internal func QueuePointerRelease(x float32, y float32) {
    pointer.QueueRelease(x, y)
  }

  internal func QueuePointerRelease(x float32, y float32, button PointerButton, modifiers KeyModifiers) {
    pointer.QueueRelease(x, y, button, modifiers)
  }

  internal func QueuePointerWheel(x float32, y float32, dx float32, dy float32) {
    pointer.QueueWheel(x, y, dx, dy)
  }

  internal func QueuePointerWheel(x float32, y float32, dx float32, dy float32,
    modifiers KeyModifiers) {
      pointer.QueueWheel(x, y, dx, dy, modifiers)
    }

  internal func QueuePointerMove(x float32, y float32, modifiers KeyModifiers) {
    pointer.QueueMove(x, y, modifiers)
  }

  internal func QueuePointerMove(pointerId int64, device PointerDevice, x float32, y float32,
    modifiers KeyModifiers) {
      pointer.QueueMove(pointerId, device, x, y, modifiers)
    }

  internal func QueuePointerMove(pointerId int64, device PointerDevice, x float32, y float32,
    modifiers KeyModifiers, pressure float32) {
      pointer.QueueMove(pointerId, device, x, y, modifiers, pressure)
    }

  internal func QueuePointerPress(pointerId int64, device PointerDevice, x float32, y float32,
    button PointerButton, modifiers KeyModifiers) {
      pointer.QueuePress(pointerId, device, x, y, button, modifiers)
    }

  internal func QueuePointerPress(pointerId int64, device PointerDevice, x float32, y float32,
    button PointerButton, modifiers KeyModifiers, pressure float32) {
      pointer.QueuePress(pointerId, device, x, y, button, modifiers, pressure)
    }

  internal func QueuePointerRelease(pointerId int64, device PointerDevice, x float32, y float32,
    button PointerButton, modifiers KeyModifiers) {
      pointer.QueueRelease(pointerId, device, x, y, button, modifiers)
    }

  internal func QueuePointerRelease(pointerId int64, device PointerDevice, x float32, y float32,
    button PointerButton, modifiers KeyModifiers, pressure float32) {
      pointer.QueueRelease(pointerId, device, x, y, button, modifiers, pressure)
    }

  internal func QueuePointerCancel(pointerId int64, device PointerDevice) {
    pointer.QueueCancel(pointerId, device)
  }

  internal func DispatchKeyPress(root Node?, resolver Resolver, key Key, modifiers KeyModifiers,
    onKeyPress Action[Key, KeyModifiers]?) bool{
      try {
        if let callback = onKeyPress {
          callback(key, modifiers)
        }
        if pointer.HandleDragKey(root, key, modifiers) { return true }
        return keyboard.HandleKey(root, resolver, text, key, modifiers)
      } finally {
        resolver.Flush()
      }
    }

  internal func StartKeyRepeat(key Key, modifiers KeyModifiers) {
    keyboard.StartKeyRepeat(key, modifiers)
  }

  internal func HitInfo(root Node?, x float32, y float32) InputHitInfo ->
  pointer.HitInfo(root, x, y)

  private func hasUnavailableFocus(n Node, hidden bool, disabled bool) bool {
    let nowHidden = hidden || n.PaintInputHidden
    let nowDisabled = disabled || n.Disabled
    if (nowHidden || nowDisabled) && n.Focused {
      return true
    }
    for index in 0 ... n.Children.Count {
      if hasUnavailableFocus(n.Children[index], nowHidden, nowDisabled) {
        return true
      }
    }
    return false
  }
}
