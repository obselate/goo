package Goo

import System
import System.Buffers
import System.Diagnostics
import System.Runtime.ExceptionServices

internal partial class InputCoordinator {
  internal func Drain(root Node?, resolver Resolver, timeS float64,
    onKeyPress Action[Key, KeyModifiers]?, repeatStartTicks int64 = 0) bool {
    if !queue.Begin() { return false }
    try { return drain(root, resolver, timeS, onKeyPress, repeatStartTicks) }
    finally { queue.Finish() }
  }

  private func drain(root Node?, resolver Resolver, timeS float64,
    onKeyPress Action[Key, KeyModifiers]?, repeatStartTicks int64) bool {
    let ingressFocusGeneration = focus.Generation
    var currentRoot = root
    refreshScopes(root, resolver)
    var changed = keyboard.ClearStalePress(resolver)
    resolver.Flush()
    while queue.Take(out var e) {
      let previousTimestamp = PopupInputContext.Timestamp
      PopupInputContext.Timestamp = e.NativeTimestamp
      try {
        if e.IsFocusLost {
          loseFocus(currentRoot, resolver)
          changed = true
          continue
        }
        if e.IsFocusGained {
          focus.SetNativeFocus(true)
          changed = true
          continue
        }
        if !focus.NativeFocusAllowed && !(e.IsPointer && (e.Pointer.Kind == PointerEventKind.Move
          || e.Pointer.Kind == PointerEventKind.Wheel || e.Pointer.Kind == PointerEventKind.HoverInvalidation)) { continue }
        if !e.IsPointer || !pointer.CanDeferVirtualization(e.Pointer) {
          if let owner = resolver.Owner {
            owner.FlushDeferredVirtualization()
            currentRoot = owner.Tree
          }
        }
        if !e.IsPointer && e.Keyboard.TextFocusGeneration >= ingressFocusGeneration {
          e.Keyboard.TextFocusGeneration = focus.Generation
        }
        let dispatched = if let frame = e.PointerFrame {
            pointer.DispatchFrame(frame, e.PointerFrameCount, currentRoot, resolver, timeS, text)
          } else if e.IsPointer { pointer.Dispatch(e.Pointer, currentRoot, resolver, timeS, text) }
          else { keyboard.Dispatch(e.Keyboard, currentRoot, resolver, text, onKeyPress, repeatStartTicks, pointer) }
        if dispatched { changed = true }
      } finally {
        if let frame = e.PointerFrame { ArrayPool[QueuedPointerEvent].Shared.Return(frame) }
        PopupInputContext.Timestamp = previousTimestamp
        if keyboard.ClearStalePress(resolver) { changed = true }
        resolver.Flush()
      }
    }
    return changed
  }

  internal func Step(root Node?, resolver Resolver, dt float64) bool ->
    Step(root, resolver, dt, Stopwatch.GetTimestamp())

  internal func Step(root Node?, resolver Resolver, dt float64, nowTicks int64) bool {
    if !queue.Begin() { return false }
    var changed = false
    try {
      changed = text.Step(dt)
      if keyboard.Step(dt, nowTicks) { changed = true }
      if queue.HasPending && drain(root, resolver, float64(nowTicks) / float64(Stopwatch.Frequency),
        resolver.Owner?.PlatformKeyPressedCallbacks, nowTicks) { changed = true }
      if pointer.StepGestures(root, resolver,
        float64(nowTicks) / float64(Stopwatch.Frequency)) { changed = true }
    } finally {
      try {
        if keyboard.ClearStalePress(resolver) { changed = true }
        resolver.Flush()
      } finally { queue.Finish() }
    }
    return changed
  }

  internal func Reset(root Node?, resolver Resolver, preserveQueue bool = false,
    preserveNative bool = false) {
    let entered = queue.Begin()
    try {
      ScrollState.StopMomentumTree(root)
      var failure Exception?
      try {
        keyboard.Reset(resolver)
      } catch (error Exception) {
        failure = error
      }
      try {
        pointer.Reset(root, resolver, preserveNative)
      } catch (error Exception) {
        if failure == nil { failure = error }
      }
      pointer.ResetScrollbars(resolver)
      try {
        focus.SetFocus(resolver, nil)
      } catch (error Exception) {
        if failure == nil { failure = error }
      }
      try {
        resolver.Flush()
      } catch (error Exception) {
        if failure == nil { failure = error }
      }
      if let error = failure { ExceptionDispatchInfo.Capture(error).Throw() }
    } finally {
      if !preserveQueue { queue.Clear() }
      if entered { queue.Finish() }
    }
  }
}
