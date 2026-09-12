package Goo

import System
import System.Collections.Generic
import System.Diagnostics

internal class KeyboardInput {
  private var queue List[KeyboardEvent]
  private var queueHead int32
  private var heldKey Key
  private var heldModifiers KeyModifiers
  private var heldT float64
  private var nextRepeatTicks int64
  private var skipRepeatStep bool
  private var pressedButton Node?
  private var pressedKey Key
  private var control InputDispatchControl
  private var diagnosticsHook((Key, KeyModifiers) -> bool)?
  private var dispatchGeneration int64

  internal init() {
    queue = List[KeyboardEvent]()
    queueHead = 0
    heldKey = Key.Unknown
    pressedKey = Key.Unknown
    control = InputDispatchControl()
  }

  internal func SetDiagnosticsHook(value((Key, KeyModifiers) -> bool)?) {
    diagnosticsHook = value
  }

  internal func Bind(host WindowHost) {
    host.KeyPressed += (key Key, modifiers KeyModifiers) -> {
      QueueKeyPress(key, modifiers)
    }
    host.KeyReleased += (key Key, modifiers KeyModifiers) -> {
      QueueKeyRelease(key, modifiers)
    }
  }

  internal func QueueKeyPress(key Key, modifiers KeyModifiers) {
    queue.Add(KeyboardEvent{ Kind: KeyboardEventKind.Press, Key: key, Modifiers: modifiers })
  }

  internal func QueueKeyRelease(key Key) {
    QueueKeyRelease(key, KeyModifiers{})
  }

  internal func QueueKeyRelease(key Key, modifiers KeyModifiers) {
    queue.Add(KeyboardEvent{ Kind: KeyboardEventKind.Release, Key: key, Modifiers: modifiers })
  }

  internal func QueueText(text string, focusGeneration int64) {
    queue.Add(KeyboardEvent{ Kind: KeyboardEventKind.Text, Text: text,
      TextFocusGeneration: focusGeneration })
  }

  internal func QueueComposition(text string, selectionStart int32, selectionLength int32,
    focusGeneration int64) {
      queue.Add(KeyboardEvent{
        Kind: KeyboardEventKind.Composition,
        Text: text,
        SelectionStart: selectionStart,
        SelectionLength: selectionLength,
        TextFocusGeneration: focusGeneration,
      })
    }

  internal func QueueCompositionCandidates(candidates IReadOnlyList[string], selected int32,
    horizontal bool, focusGeneration int64) {
      queue.Add(KeyboardEvent{
        Kind: KeyboardEventKind.CompositionCandidates,
        Candidates: candidates,
        SelectedCandidate: selected,
        CandidatesHorizontal: horizontal,
        TextFocusGeneration: focusGeneration,
      })
    }

  internal func QueueCompositionCancel(focusGeneration int64) {
    queue.Add(KeyboardEvent{ Kind: KeyboardEventKind.CompositionCancel,
      TextFocusGeneration: focusGeneration })
  }

  internal func Drain(root Node?, resolver Resolver, text TextInput,
    onKeyPress Action[Key, KeyModifiers]?) bool ->
  Drain(root, resolver, text, onKeyPress, 0)

  internal func Drain(root Node?, resolver Resolver, text TextInput,
    onKeyPress Action[Key, KeyModifiers]?, repeatStartTicks int64) bool ->
  Drain(root, resolver, text, onKeyPress, repeatStartTicks, nil)

  internal func Drain(root Node?, resolver Resolver, text TextInput,
    onKeyPress Action[Key, KeyModifiers]?, repeatStartTicks int64,
    pointer PointerInput?) bool{
      var changed = clearButtonPressAfterFocusMove(resolver, text)
      queueHead = 0
      try {
        resolver.Flush()
        while queueHead < queue.Count {
          let e = queue[queueHead]
          queueHead = queueHead + 1
          try {
            if e.Kind == KeyboardEventKind.Press {
              if let hook = diagnosticsHook {
                if hook(e.Key, e.Modifiers) {
                  changed = true
                  continue
                }
              }
              if let callback = onKeyPress {
                callback(e.Key, e.Modifiers)
              }
              if pointer?.HandleDragKey(root, e.Key, e.Modifiers) == true {
                changed = true
                StopKeyRepeat(e.Key)
                continue
              }
              let dispatch = DispatchKeyDown(text.FocusedNode(), e.Key, e.Modifiers, false)
              let handled = !dispatch.DefaultPrevented
                && HandleKeyDefault(root, resolver, text, e.Key, e.Modifiers)
              if dispatch.Routed || handled {
                StartKeyRepeat(e.Key, e.Modifiers, repeatStartTicks)
              }
              if handled { changed = true }
            } else if e.Kind == KeyboardEventKind.Release {
              try {
                if pointer?.HandleDragKey(root, e.Key, e.Modifiers) == true {
                  changed = true
                  continue
                }
                let dispatch = DispatchKeyUp(text.FocusedNode(), e.Key, e.Modifiers)
                if HandleButtonRelease(root, resolver, text, e.Key, !dispatch.DefaultPrevented) {
                  changed = true
                }
              } finally {
                // Never leave key release state armed when a public callback throws.
                HandleButtonRelease(root, resolver, text, e.Key, false)
                StopKeyRepeat(e.Key)
              }
            } else if let value = e.Text {
              if e.TextFocusGeneration != text.FocusGeneration() {
                continue
              }
              if e.Kind == KeyboardEventKind.Text && text.HandleChar(root, value) {
                changed = true
              }
              if e.Kind == KeyboardEventKind.Composition
                && text.HandleComposition(root, value, e.SelectionStart, e.SelectionLength) {
                  changed = true
                }
            } else if e.Kind == KeyboardEventKind.CompositionCandidates {
              if e.TextFocusGeneration == text.FocusGeneration() {
                text.HandleCompositionCandidates(e.Candidates, e.SelectedCandidate, e.CandidatesHorizontal)
              }
            } else if e.Kind == KeyboardEventKind.CompositionCancel {
              if e.TextFocusGeneration == text.FocusGeneration() && text.HandleCompositionCancel(root) {
                changed = true
              }
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

  internal func Step(root Node?, resolver Resolver, text TextInput, dt float64) bool {
    if heldKey == Key.Unknown {
      return false
    }
    return Step(root, resolver, text, dt, Stopwatch.GetTimestamp())
  }

  internal func Step(root Node?, resolver Resolver, text TextInput, dt float64, nowTicks int64) bool {
    if heldKey == Key.Unknown {
      return false
    }
    if skipRepeatStep {
      skipRepeatStep = false
      return false
    }
    if nextRepeatTicks != 0 {
      if nowTicks < nextRepeatTicks {
        return false
      }
      nextRepeatTicks = nowTicks + repeatIntervalTicks()
      try {
        return HandleRepeatedKey(root, resolver, text)
      } catch (error Exception) {
        resetRepeat()
        throw error
      }
    }
    var changed = false
    heldT = heldT + dt
    if heldT >= 0.4 {
      heldT = 0.4 - 1.0 / 30.0
      try {
        changed = HandleRepeatedKey(root, resolver, text)
      } catch (error Exception) {
        resetRepeat()
        throw error
      }
    }
    return changed
  }

  internal func RepeatDeadlineSeconds() float64 {
    if heldKey == Key.Unknown {
      return Double.PositiveInfinity
    }
    if nextRepeatTicks != 0 {
      let remaining = nextRepeatTicks - Stopwatch.GetTimestamp()
      return remaining <= 0 ? 0.0 : float64(remaining) / float64(Stopwatch.Frequency)
    }
    let remaining = 0.4 - heldT
    return remaining <= 0.0 ? 0.0 : remaining
  }

  internal func Reset(resolver Resolver) {
    queue.Clear()
    queueHead = 0
    resetRepeat()
    clearButtonPress(resolver)
  }

  internal func AfterTreeUpdated(resolver Resolver, text TextInput) {
    clearButtonPressAfterFocusMove(resolver, text)
    guard let focused = text.FocusedNode() else {
      resetRepeat()
      return
    }
    if focused.Retired || (focused.Kind != NodeKind.Entry && focused.Kind != NodeKind.Editor)
      || !canReceiveInput(focused) {
        resetRepeat()
      }
  }

  internal func StartKeyRepeat(key Key, modifiers KeyModifiers) {
    StartKeyRepeat(key, modifiers, 0)
  }

  private func StartKeyRepeat(key Key, modifiers KeyModifiers, repeatStartTicks int64) {
    if !repeats(key) {
      return
    }
    heldKey = key
    heldModifiers = modifiers
    heldT = 0.0
    nextRepeatTicks = repeatStartTicks == 0 ? 0 : repeatStartTicks + firstRepeatDelayTicks()
    skipRepeatStep = repeatStartTicks != 0
  }

  internal func StopKeyRepeat(key Key) {
    if key == heldKey {
      resetRepeat()
    }
  }

  internal func HandleKey(root Node?, resolver Resolver, text TextInput, key Key, modifiers KeyModifiers) bool {
    if let hook = diagnosticsHook {
      if hook(key, modifiers) { return true }
    }
    let dispatch = DispatchKeyDown(text.FocusedNode(), key, modifiers, false)
    if dispatch.DefaultPrevented { return false }
    return HandleKeyDefault(root, resolver, text, key, modifiers)
  }

  internal func HandleButtonPress(root Node?, resolver Resolver, text TextInput, key Key) bool {
    if key != Key.Enter && key != Key.Space {
      return false
    }
    guard let n = text.FocusedNode() else { return false }
    if n.Kind != NodeKind.Button || !canReceiveInput(n) {
      return false
    }
    clearButtonPress(resolver)
    pressedButton = n
    pressedKey = key
    n.KeyboardPressed = true
    n.Pressed = true
    resolver.Invalidate(n, false)
    if key == Key.Enter {
      hitActivate(root, n)
    }
    return true
  }

  internal func HandleButtonRelease(root Node?, resolver Resolver, text TextInput, key Key,
    activate bool) bool{
      if key != pressedKey {
        return false
      }
      guard let n = pressedButton else {
        pressedKey = Key.Unknown
        return false
      }
      let shouldActivate = activate && key == Key.Space && text.FocusedNode() == n
      clearButtonPress(resolver)
      if shouldActivate {
        hitActivate(root, n)
      }
      return true
    }

  private func repeats(key Key) bool -> key == Key.Left || key == Key.Right || key == Key.Backspace
    || key == Key.Delete || key == Key.Home || key == Key.End || key == Key.Up || key == Key.Down
    || key == Key.PageUp || key == Key.PageDown

  private func resetRepeat() {
    heldKey = Key.Unknown
    heldModifiers = KeyModifiers{}
    heldT = 0.0
    nextRepeatTicks = 0
    skipRepeatStep = false
  }

  private func HandleRepeatedKey(root Node?, resolver Resolver, text TextInput) bool {
    let dispatch = DispatchKeyDown(text.FocusedNode(), heldKey, heldModifiers, true)
    if dispatch.DefaultPrevented { return false }
    let handled = HandleKeyDefault(root, resolver, text, heldKey, heldModifiers)
    return handled
  }

  private func HandleKeyDefault(root Node?, resolver Resolver, text TextInput, key Key,
    modifiers KeyModifiers) bool{
      var handled = text.HandleKey(root, resolver, key, modifiers)
      if handled {
        clearButtonPressAfterFocusMove(resolver, text)
      }
      if !handled {
        handled = HandleButtonPress(root, resolver, text, key)
      }
      return handled
    }

  private func DispatchKeyDown(target Node?, key Key, modifiers KeyModifiers, repeat bool)
  KeyboardDispatchResult -> dispatchKey(target, key, modifiers, repeat, true)

  private func DispatchKeyUp(target Node?, key Key, modifiers KeyModifiers) KeyboardDispatchResult -> dispatchKey(target, key, modifiers, false, false)

  private func dispatchKey(target Node?, key Key, modifiers KeyModifiers, repeat bool,
    down bool) KeyboardDispatchResult{
      var result KeyboardDispatchResult
      guard let start = target else { return result }
      dispatchGeneration++
      let generation = dispatchGeneration
      control.Begin(generation)
      try {
        var current Node? = start
        while current != nil {
          let node = current!!
          let callback = down ? InputCallbacks.KeyDown(node) : InputCallbacks.KeyUp(node)
          if let handler = callback {
            result.Routed = true
            handler(KeyEvent{ Key: key, Modifiers: modifiers, Repeat: repeat,
              Control: control, Generation: generation })
            rebuildFiberOwner(node)
          }
          if control.PropagationStopped { break }
          current = node.Parent
        }
        result.DefaultPrevented = control.DefaultPrevented
        return result
      } finally {
        control.Finish(generation)
      }
    }

  private func firstRepeatDelayTicks() int64 -> int64(Math.Ceiling(0.4 * float64(Stopwatch.Frequency)))

  private func repeatIntervalTicks() int64 -> int64(Math.Ceiling(float64(Stopwatch.Frequency) / 30.0))

  private func clearButtonPressAfterFocusMove(resolver Resolver, text TextInput) bool {
    if let n = pressedButton {
      if text.FocusedNode() != n || !canReceiveInput(n) {
        clearButtonPress(resolver)
        return true
      }
    }
    return false
  }

  private func clearButtonPress(resolver Resolver) {
    if let n = pressedButton {
      n.KeyboardPressed = false
      n.Pressed = n.PointerPressCount > 0
      resolver.Invalidate(n, false)
    }
    pressedButton = nil
    pressedKey = Key.Unknown
  }
}

internal enum KeyboardEventKind {
  Press;
  Release;
  Text;
  Composition;
  CompositionCandidates;
  CompositionCancel;
}

internal data struct KeyboardEvent {
  internal var Kind KeyboardEventKind
  internal var Key Key
  internal var Modifiers KeyModifiers
  internal var Text string?
  internal var SelectionStart int32
  internal var SelectionLength int32
  internal var Candidates IReadOnlyList[string]?
  internal var SelectedCandidate int32
  internal var CandidatesHorizontal bool
  internal var TextFocusGeneration int64
}

internal data struct KeyboardDispatchResult {
  internal var Routed bool
  internal var DefaultPrevented bool
}
