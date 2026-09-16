package Goo

import System
import System.Collections.Generic
import System.Globalization
import System.Text.Json
import System.Threading

internal class DiagnosticGestureException : InvalidOperationException {
  internal let Code string

  internal init(code string, message string): base(message) {
    Code = code
  }
}

internal partial class DevToolsSession {
  private const InputPointerId int64 = -9223372036854775807L
  private const InputGestureLeaseMs int32 = 30000
  private var inputAllowed bool
  private var inputUsed bool
  private var inputGestureId string?
  private var inputGestureVersion int64
  private var inputGestureTimer Timer?
  private let inputButtons HashSet[PointerButton] = HashSet[PointerButton]()
  private let inputKeys HashSet[Key] = HashSet[Key]()
  private let retiredGestureIds HashSet[string] = HashSet[string](StringComparer.Ordinal)
  private let retiredGestureOrder Queue[string] = Queue[string]()
  internal prop AllowsInput bool{ get -> Volatile.Read(&inputAllowed) }

  internal func EnableInput() { Volatile.Write(&inputAllowed, true) }

  internal func InputPayload(payload JsonElement) string {
    owner.RequireElementHandleThread("DevToolsSession.InputPayload")
    if disposed || !owner.IsOpen { throw ObjectDisposedException("Goo window") }
    if !inputAllowed { throw UnauthorizedAccessException("DevTools input is disabled. Use GOO_DEVTOOLS_INPUT=1 with GOO_DEVTOOLS=1, or DevTools.Attach(window, true).") }
    if inspecting { throw InvalidOperationException("Exit inspector selection mode before sending application input.") }
    if payload.ValueKind != JsonValueKind.Object { throw ArgumentException("Input payload must be an object.") }
    let eventName = inputText(payload, "event", true)
    let requestedGesture = inputText(payload, "gestureId", false)
    if requestedGesture.Length > 128 { throw ArgumentException("gestureId is limited to 128 characters.") }
    let gesture = authorizeInputGesture(eventName, requestedGesture)
    try {
      owner.UpdateTree(0.0)
      let modifiers = inputModifiers(payload)
      let input = owner.PlatformInput
      if eventName == "reset" {
        input.FocusLost()
        inputUsed = false
        inputButtons.Clear()
        inputKeys.Clear()
      } else if eventName == "pointer.cancel" {
        input.PointerCancel(InputPointerId, PointerDevice.Mouse)
        inputButtons.Clear()
      } else if eventName == "key.down" || eventName == "key.up" {
        let name = inputText(payload, "key", true)
        var key Key
        if !Enum.TryParse[Key](name, true, out key) || key == Key.Unknown
          || !String.Equals(Enum.GetName(typeof(Key), key), name, StringComparison.OrdinalIgnoreCase) {
            throw ArgumentException("Unknown key name: " + name)
          }
        inputUsed = true
        if eventName == "key.down" {
          input.KeyPress(key, modifiers)
          inputKeys.Add(key)
        } else {
          input.KeyRelease(key)
          inputKeys.Remove(key)
        }
      } else if eventName == "text" {
        let value = inputText(payload, "text", false)
        if value.Length > 16384 { throw ArgumentException("Committed text is limited to 16384 UTF-16 units per request.") }
        inputUsed = true
        if !input.CommitText(value) { throw InvalidOperationException("No focused editable text target accepted the text.") }
      } else if eventName == "pointer.move" || eventName == "pointer.down"
        || eventName == "pointer.up" || eventName == "click" || eventName == "wheel" {
          let point = inputPoint(payload)
          let buttonName = inputText(payload, "button", false)
          var button = PointerButton.Primary
          if buttonName != "" && (!Enum.TryParse[PointerButton](buttonName, true, out button)
              || button == PointerButton.None
              || !String.Equals(Enum.GetName(typeof(PointerButton), button), buttonName, StringComparison.OrdinalIgnoreCase)) {
                throw ArgumentException("Unknown pointer button: " + buttonName)
              }
          let deltaX = inputNumber(payload, "deltaX", false)
          let deltaY = inputNumber(payload, "deltaY", false)
          inputUsed = true
          if eventName == "pointer.move" {
            input.PointerMove(InputPointerId, PointerDevice.Mouse, float32(point.X), float32(point.Y), modifiers, 0.0F)
          } else if eventName == "wheel" {
            input.PointerWheel(float32(point.X), float32(point.Y), float32(deltaX), float32(deltaY), modifiers)
          } else {
            if eventName != "pointer.up" {
              input.PointerPress(InputPointerId, PointerDevice.Mouse, float32(point.X), float32(point.Y), button, modifiers, 1.0F)
              if eventName == "pointer.down" { inputButtons.Add(button) }
            }
            if eventName != "pointer.down" {
              input.PointerRelease(InputPointerId, PointerDevice.Mouse, float32(point.X), float32(point.Y), button, modifiers, 0.0F)
              if eventName == "pointer.up" { inputButtons.Remove(button) }
            }
          }
        } else { throw ArgumentException("Unknown input event: " + eventName) }
      owner.UpdateTree(0.0)
      let settled = CaptureSnapshot(true)
      settleInputGesture(gesture)
      let active = inputGestureId != nil
      return "{\"command\":\"input\",\"applied\":true,\"sequence\":"
      +settled.Sequence.ToString(CultureInfo.InvariantCulture)
      +",\"gestureId\":" + (if let current = inputGestureId { DiagnosticJson.Quote(current) } else { "null" })
      +",\"gestureActive\":" + (active ? "true" : "false")
      +",\"leaseMs\":" + (active ? InputGestureLeaseMs.ToString(CultureInfo.InvariantCulture) : "0") + "}"
    } catch (error Exception) {
      resetInjectedInput()
      System.Runtime.ExceptionServices.ExceptionDispatchInfo.Capture(error).Throw()
      return ""
    }
  }

  private func resetInjectedInput() {
    if inputUsed {
      inputUsed = false
      owner.ResetInputForDiagnostics()
    }
    inputButtons.Clear()
    inputKeys.Clear()
    releaseInputGesture()
  }

  internal func RequireNoInputGesture() {
    owner.RequireElementHandleThread("DevToolsSession.RequireNoInputGesture")
    if inputGestureId != nil {
      throw DiagnosticGestureException("gesture-owned", "Another client owns the active input gesture.")
    }
  }

  private func authorizeInputGesture(eventName string, requested string) string {
    if let current = inputGestureId {
      if requested != current {
        throw DiagnosticGestureException("gesture-owned", "Another client owns the active input gesture.")
      }
      return current
    }
    if requested != "" && retiredGestureIds.Contains(requested) {
      if eventName == "reset" || eventName == "pointer.cancel" { return "" }
      throw DiagnosticGestureException("gesture-expired", "The input gesture lease has ended.")
    }
    if eventName == "pointer.down" || eventName == "key.down" {
      let created = requested == "" ? Guid.NewGuid().ToString("N") : requested
      inputGestureId = created
      return created
    }
    if requested != "" {
      throw DiagnosticGestureException("gesture-expired", "The input gesture lease is not active.")
    }
    return ""
  }

  private func settleInputGesture(gesture string) {
    if gesture == "" { return }
    if inputButtons.Count == 0 && inputKeys.Count == 0 {
      releaseInputGesture()
      return
    }
    inputGestureVersion++
    let version = inputGestureVersion
    inputGestureTimer?.Dispose()
    inputGestureTimer = Timer(_ -> {
      try {
        Post(() -> {
          if inputGestureId == gesture && inputGestureVersion == version { resetInjectedInput() }
        })
      } catch (_ Exception) { }
    }, nil, InputGestureLeaseMs, Timeout.Infinite)
  }

  private func releaseInputGesture() {
    inputGestureTimer?.Dispose()
    inputGestureTimer = nil
    guard let current = inputGestureId else { return }
    inputGestureId = nil
    if retiredGestureIds.Add(current) {
      retiredGestureOrder.Enqueue(current)
      if retiredGestureOrder.Count > 64 {
        retiredGestureIds.Remove(retiredGestureOrder.Dequeue())
      }
    }
  }

  private func inputPoint(payload JsonElement) Point {
    if payload.TryGetProperty("nodeId", out var idValue) {
      if !idValue.TryGetInt64(out var id) || id <= 0 { throw ArgumentException("nodeId must be a positive integer.") }
      captureIfNeeded()
      guard let node = identity.FindNode(id), let bounds = identity.Find(id) else {
        throw KeyNotFoundException("The input target no longer exists in this window.")
      }
      if node.Retired || bounds.BorderBox.Width <= 0 || bounds.BorderBox.Height <= 0 {
        throw KeyNotFoundException("The input target is no longer mounted and visible.")
      }
      var ancestor Node? = node
      while let current = ancestor {
        if current.Display == Display.None { throw KeyNotFoundException("The input target is hidden.") }
        ancestor = current.Parent
      }
      if payload.TryGetProperty("x", out var ignoredX) || payload.TryGetProperty("y", out var ignoredY) {
        throw ArgumentException("Use nodeId with optional offsetX/offsetY, or x/y coordinates.")
      }
      let x = if payload.TryGetProperty("offsetX", out var offsetX) { inputNumber(payload, "offsetX", true) } else { bounds.BorderBox.Width / 2.0 }
      let y = if payload.TryGetProperty("offsetY", out var offsetY) { inputNumber(payload, "offsetY", true) } else { bounds.BorderBox.Height / 2.0 }
      return Point{X: bounds.BorderBox.X + x, Y: bounds.BorderBox.Y + y}
    }
    return Point{X: inputNumber(payload, "x", true), Y: inputNumber(payload, "y", true)}
  }

  private func inputModifiers(payload JsonElement) KeyModifiers {
    if !payload.TryGetProperty("modifiers", out var value) { return KeyModifiers{} }
    if value.ValueKind != JsonValueKind.Object { throw ArgumentException("modifiers must be an object.") }
    return KeyModifiers{Alt: inputFlag(value, "alt"), Ctrl: inputFlag(value, "ctrl"),
      Shift: inputFlag(value, "shift"), Super: inputFlag(value, "super")}
  }

  private func inputFlag(payload JsonElement, name string) bool {
    if !payload.TryGetProperty(name, out var value) { return false }
    if value.ValueKind != JsonValueKind.True && value.ValueKind != JsonValueKind.False {
      throw ArgumentException(name + " must be boolean.")
    }
    return value.GetBoolean()
  }

  private func inputText(payload JsonElement, name string, required bool) string {
    if !payload.TryGetProperty(name, out var value) {
      if required || name == "text" { throw ArgumentException(name + " is required.") }
      return ""
    }
    if value.ValueKind != JsonValueKind.String { throw ArgumentException(name + " must be text.") }
    let result = value.GetString() ?? ""
    if required && result.Length == 0 { throw ArgumentException(name + " must not be empty.") }
    return result
  }

  private func inputNumber(payload JsonElement, name string, required bool) float64 {
    if !payload.TryGetProperty(name, out var value) {
      if required { throw ArgumentException(name + " is required.") }
      return 0.0
    }
    if value.ValueKind != JsonValueKind.Number || !value.TryGetDouble(out var result)
      || !Double.IsFinite(result) || Math.Abs(result) > 10000000.0 {
        throw ArgumentException(name + " must be a finite logical coordinate/delta within ±10000000.")
      }
    return result
  }
}
