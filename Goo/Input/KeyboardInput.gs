package Goo

import System
import System.Collections.Generic
import System.Diagnostics

internal class KeyboardInput {
  private let focus FocusManager
  private var queue List[KeyboardEvent]
  private var queueHead int32
  private let releases Dictionary[Key, PendingKeyRelease] = Dictionary[Key, PendingKeyRelease]()
  private var heldTarget Node?
  private var heldFocusGeneration int64
  private var dispatchingKey Key
  private var heldKey Key
  private var heldModifiers KeyModifiers
  private var heldT float64
  private var nextRepeatTicks int64
  private var skipRepeatStep bool
  private var pressedButton Node?
  private var pressedKey Key
  private var pressedFocusGeneration int64
  private var control InputDispatchControl
  private var diagnosticsHook((Key, KeyModifiers) -> bool)?
  private var dispatchGeneration int64

  internal init(focus FocusManager) {
    this.focus = focus
    queue = List[KeyboardEvent]()
    heldKey = Key.Unknown
    pressedKey = Key.Unknown
    dispatchingKey = Key.Unknown
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
      var changed = clearButtonPressAfterFocusMove(resolver)
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
              if root == nil || FocusScopes.ModalRoot(root) == nil {
                if let callback = onKeyPress {
                callback(e.Key, e.Modifiers)
                }
              }
              pointer?.UpdateDragModifiers(root, e.Modifiers)
              let target = focus.FocusedNode() ?? root
              let dispatch = DispatchKeyDown(target, e.Key, e.Modifiers, false)
              if dispatch.Repeat && focus.FocusedNode() == target {
                StartKeyRepeat(e.Key, e.Modifiers, repeatStartTicks)
              }
              if dispatch.Handled { changed = true }
            } else if e.Kind == KeyboardEventKind.Release {
              try {
                pointer?.UpdateDragModifiers(root, e.Modifiers)
                if DispatchKeyUp(focus.FocusedNode() ?? root, e.Key, e.Modifiers).Handled {
                  changed = true
                }
              } finally {
                if e.Key == pressedKey { EndPress(root, resolver, pressedButton, false) }
                releases.Remove(e.Key)
                StopKeyRepeat(e.Key)
              }
            } else if let value = e.Text {
              if e.TextFocusGeneration != focus.Generation {
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
              if e.TextFocusGeneration == focus.Generation {
                text.HandleCompositionCandidates(e.Candidates, e.SelectedCandidate, e.CandidatesHorizontal)
              }
            } else if e.Kind == KeyboardEventKind.CompositionCancel {
              if e.TextFocusGeneration == focus.Generation && text.HandleCompositionCancel(root) {
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

  internal func Step(root Node?, resolver Resolver, text TextInput, dt float64) bool -> if heldKey == Key.Unknown { false } else { Step(root, resolver, text, dt, Stopwatch.GetTimestamp()) }

  internal func Step(root Node?, resolver Resolver, text TextInput, dt float64, nowTicks int64) bool {
    if let target = heldTarget {
      if target != focus.FocusedNode() || heldFocusGeneration != focus.Generation || !canReceiveInput(target) {
        resetRepeat()
      }
    } else {
      resetRepeat()
    }
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
    releases.Clear()
    queueHead = 0
    resetRepeat()
    clearButtonPress(resolver)
  }

  internal func AfterTreeUpdated(resolver Resolver) {
    clearButtonPressAfterFocusMove(resolver)
    if releases.Count > 0 {
      let stale = List[Key]()
      for item in releases {
        if item.Value.Target != focus.FocusedNode() || item.Value.Generation != focus.Generation
          || !canReceiveInput(item.Value.Target) {
          stale.Add(item.Key)
        }
      }
      for key in stale { releases.Remove(key) }
    }
    guard let focused = focus.FocusedNode() else {
      resetRepeat()
      return
    }
    if focused != heldTarget || heldFocusGeneration != focus.Generation || !canReceiveInput(focused) {
      resetRepeat()
    }
  }

  private func StartKeyRepeat(key Key, modifiers KeyModifiers, repeatStartTicks int64) {
    heldTarget = focus.FocusedNode()
    heldFocusGeneration = focus.Generation
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
    return DispatchKeyDown(focus.FocusedNode() ?? root, key, modifiers, false).Handled
  }

  internal func BeginPress(resolver Resolver, n Node) bool {
    if n.Kind != NodeKind.Button || focus.FocusedNode() != n || !canReceiveInput(n) {
      return false
    }
    clearButtonPress(resolver)
    pressedButton = n
    pressedKey = dispatchingKey
    pressedFocusGeneration = focus.Generation
    n.KeyboardPressed = true
    n.Pressed = true
    resolver.Invalidate(n, false)
    return true
  }

  internal func EndPress(root Node?, resolver Resolver, target Node?, activate bool) bool {
    guard let n = pressedButton else { return false }
    if n != target { return false }
    let shouldActivate = activate && focus.FocusedNode() == n
      && pressedFocusGeneration == focus.Generation && canReceiveInput(n)
    clearButtonPress(resolver)
    if shouldActivate { hitActivate(root, n) }
    return true
  }

  private func resetRepeat() {
    heldTarget = nil
    heldKey = Key.Unknown
    heldModifiers = KeyModifiers{}
    heldT = 0.0
    nextRepeatTicks = 0
    skipRepeatStep = false
  }

  private func HandleRepeatedKey(root Node?, resolver Resolver, text TextInput) bool {
    let dispatch = DispatchKeyDown(heldTarget, heldKey, heldModifiers, true)
    if !dispatch.Repeat { resetRepeat() }
    return dispatch.Handled
  }

  private func DispatchKeyDown(target Node?, key Key, modifiers KeyModifiers, repeat bool)
  KeyboardDispatchResult -> dispatchKey(target, key, modifiers, repeat, true)

  private func DispatchKeyUp(target Node?, key Key, modifiers KeyModifiers) KeyboardDispatchResult -> dispatchKey(target, key, modifiers, false, false)

  private func dispatchKey(target Node?, key Key, modifiers KeyModifiers, repeat bool,
    down bool) KeyboardDispatchResult{
      var result KeyboardDispatchResult
      guard let start = target else { return result }
      if !canReceiveInput(start) {
        return result
      }
      dispatchGeneration++
      let generation = dispatchGeneration
      control.Begin(generation)
      let previousKey = dispatchingKey
      dispatchingKey = down ? key : Key.Unknown
      try {
        let focusGeneration = focus.Generation
        var last = start
        var current Node? = start
        while current != nil {
          let node = current
          let callback = down ? InputCallbacks.KeyDown(node) : InputCallbacks.KeyUp(node)
          if let handler = callback {
            handler(KeyEvent{ Key: key, Modifiers: modifiers, Repeat: repeat,
              Control: control, Generation: generation })
            CellOwnership.Nearest(node)?.Rebuild()
          }
          last = node
          if control.PropagationStopped || node.FocusScopeBoundary { break }
          current = node.Parent
        }
        if control.DefaultPrevented || focusGeneration != focus.Generation || !canReceiveInput(start) {
          return result
        }
        current = start
        while current != nil {
          let node = current
          if !down && releases.TryGetValue(key, out var pending)
            && pending.Target == start && pending.Owner == node && pending.Generation == focus.Generation {
              result.Handled = true
              pending.Action()
              CellOwnership.Nearest(node)?.Rebuild()
              return result
            }
          if down {
            if let bindings = InputCallbacks.Bindings(node) {
              for binding in bindings {
                if binding.Key != key || binding.Modifiers != modifiers { continue }
                if binding.Action == nil && binding.OnRelease == nil { continue }
                result.Handled = true
                result.Repeat = binding.Repeat
                if !repeat || binding.Repeat {
                  if !repeat {
                    if let release = binding.OnRelease {
                      releases[key] = PendingKeyRelease{ Target: start, Owner: node, Action: release, Generation: focus.Generation }
                    }
                  }
                  binding.Action?.Invoke()
                  CellOwnership.Nearest(node)?.Rebuild()
                }
                return result
              }
            }
          }
          if node == last { break }
          current = node.Parent
        }
        return result
      } finally {
        control.Finish(generation)
        dispatchingKey = previousKey
      }
    }

  private func firstRepeatDelayTicks() int64 -> int64(Math.Ceiling(0.4 * float64(Stopwatch.Frequency)))

  private func repeatIntervalTicks() int64 -> int64(Math.Ceiling(float64(Stopwatch.Frequency) / 30.0))

  private func clearButtonPressAfterFocusMove(resolver Resolver) bool {
    if let n = pressedButton {
      if focus.FocusedNode() != n || pressedFocusGeneration != focus.Generation || !canReceiveInput(n) {
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
  internal var Handled bool
  internal var Repeat bool
}

internal data struct PendingKeyRelease {
  internal var Target Node
  internal var Generation int64
  internal var Owner Node
  internal var Action Action
}
