package Goo

import System
import System.Collections.Generic
import System.Collections.ObjectModel
import System.Runtime.InteropServices
import Hexa.NET.SDL3

internal unsafe partial class SdlHost {
  private func Dispatch(nativeEvent SDLEvent) {
    pendingEvents = true
    let eventType = SDLEventType(nativeEvent.Type)
    if eventType == SDLEventType.Quit || eventType == SDLEventType.Terminating {
      RequestClose()
      return
    }
    if eventType >= SDLEventType.DisplayFirst && eventType <= SDLEventType.DisplayLast {
      RefreshDisplayPacingForDisplay(nativeEvent.Display.DisplayID)
      return
    }
    if eventType >= SDLEventType.WindowFirst && eventType <= SDLEventType.WindowLast {
      if nativeEvent.Window.WindowID == windowId {
        DispatchWindow(eventType, nativeEvent.Window)
      }
      return
    }

    if eventType == SDLEventType.MouseMotion {
      if nativeEvent.Motion.WindowID == windowId && !IsSyntheticMouse(nativeEvent.Motion.Which) {
        pointerButtons = MapPointerButtons(nativeEvent.Motion.State)
        PointerMoved?.Invoke(MousePointerId, PointerDevice.Mouse,
          nativeEvent.Motion.X, nativeEvent.Motion.Y, pointerButtons,
          MousePressure(pointerButtons), MapModifiers(SDL.GetModState()))
      }
      return
    }
    if eventType == SDLEventType.MouseButtonDown {
      if nativeEvent.Button.WindowID == windowId && !IsSyntheticMouse(nativeEvent.Button.Which) {
        let button = MapPointerButton(nativeEvent.Button.Button)
        if button != PointerButton.None {
          pointerButtons = PointerButtons(
            int32(pointerButtons) | int32(ToPointerButtons(button)))
          PointerPressed?.Invoke(MousePointerId, PointerDevice.Mouse,
            nativeEvent.Button.X, nativeEvent.Button.Y, button, pointerButtons,
            MousePressure(pointerButtons), MapModifiers(SDL.GetModState()))
        }
      }
      return
    }
    if eventType == SDLEventType.MouseButtonUp {
      if nativeEvent.Button.WindowID == windowId && !IsSyntheticMouse(nativeEvent.Button.Which) {
        let button = MapPointerButton(nativeEvent.Button.Button)
        if button != PointerButton.None {
          pointerButtons = PointerButtons(
            int32(pointerButtons) & ^int32(ToPointerButtons(button)))
          PointerReleased?.Invoke(MousePointerId, PointerDevice.Mouse,
            nativeEvent.Button.X, nativeEvent.Button.Y, button, pointerButtons,
            MousePressure(pointerButtons), MapModifiers(SDL.GetModState()))
        }
      }
      return
    }
    if eventType == SDLEventType.MouseWheel {
      if nativeEvent.Wheel.WindowID == windowId {
        let direction = nativeEvent.Wheel.Direction == SDLMouseWheelDirection.Flipped ? -1.0F : 1.0F
        Wheel?.Invoke(nativeEvent.Wheel.MouseX, nativeEvent.Wheel.MouseY,
          nativeEvent.Wheel.X * direction, nativeEvent.Wheel.Y * direction,
          MapModifiers(SDL.GetModState()))
      }
      return
    }
    if eventType == SDLEventType.FingerDown {
      if nativeEvent.Tfinger.WindowID == windowId && !IsSyntheticTouch(nativeEvent.Tfinger.TouchID) {
        let pointerId = GetTouchPointerId(nativeEvent.Tfinger.TouchID, nativeEvent.Tfinger.FingerID)
        PointerPressed?.Invoke(pointerId, PointerDevice.Touch,
          TouchX(nativeEvent.Tfinger.X), TouchY(nativeEvent.Tfinger.Y),
          PointerButton.Primary, PointerButtons.Primary,
          NormalizePressure(nativeEvent.Tfinger.Pressure), MapModifiers(SDL.GetModState()))
      }
      return
    }
    if eventType == SDLEventType.FingerMotion {
      if nativeEvent.Tfinger.WindowID == windowId && !IsSyntheticTouch(nativeEvent.Tfinger.TouchID) {
        if touchPointers.TryGetValue(
          TouchContactKey(nativeEvent.Tfinger.TouchID, nativeEvent.Tfinger.FingerID),
          out var pointerId) {
            PointerMoved?.Invoke(pointerId, PointerDevice.Touch,
              TouchX(nativeEvent.Tfinger.X), TouchY(nativeEvent.Tfinger.Y),
              PointerButtons.Primary, NormalizePressure(nativeEvent.Tfinger.Pressure),
              MapModifiers(SDL.GetModState()))
          }
      }
      return
    }
    if eventType == SDLEventType.FingerUp {
      if nativeEvent.Tfinger.WindowID == windowId && !IsSyntheticTouch(nativeEvent.Tfinger.TouchID) {
        ReleaseTouchPointer(nativeEvent.Tfinger, false)
      }
      return
    }
    if eventType == SDLEventType.FingerCanceled {
      if nativeEvent.Tfinger.WindowID == windowId && !IsSyntheticTouch(nativeEvent.Tfinger.TouchID) {
        ReleaseTouchPointer(nativeEvent.Tfinger, true)
      }
      return
    }
    if eventType == SDLEventType.PenDown {
      if nativeEvent.Ptouch.WindowID == windowId {
        let buttons = PointerButtons(
          int32(PenButtons(nativeEvent.Ptouch.PenState)) |
          int32(PointerButtons.Primary))
        PointerPressed?.Invoke(int64(nativeEvent.Ptouch.Which), PointerDevice.Pen,
          nativeEvent.Ptouch.X, nativeEvent.Ptouch.Y, PointerButton.Primary,
          buttons, PenPressure(int64(nativeEvent.Ptouch.Which)), MapModifiers(SDL.GetModState()))
      }
      return
    }
    if eventType == SDLEventType.PenMotion {
      if nativeEvent.Pmotion.WindowID == windowId {
        PointerMoved?.Invoke(int64(nativeEvent.Pmotion.Which), PointerDevice.Pen,
          nativeEvent.Pmotion.X, nativeEvent.Pmotion.Y,
          PenButtons(nativeEvent.Pmotion.PenState),
          PenPressure(int64(nativeEvent.Pmotion.Which)), MapModifiers(SDL.GetModState()))
      }
      return
    }
    if eventType == SDLEventType.PenUp {
      if nativeEvent.Ptouch.WindowID == windowId {
        let buttons = PointerButtons(
          int32(PenButtons(nativeEvent.Ptouch.PenState)) & ^int32(PointerButtons.Primary))
        PointerReleased?.Invoke(int64(nativeEvent.Ptouch.Which), PointerDevice.Pen,
          nativeEvent.Ptouch.X, nativeEvent.Ptouch.Y, PointerButton.Primary,
          buttons, PenPressure(int64(nativeEvent.Ptouch.Which)), MapModifiers(SDL.GetModState()))
      }
      return
    }
    if eventType == SDLEventType.PenAxis {
      if nativeEvent.Paxis.WindowID == windowId && nativeEvent.Paxis.Axis == SDLPenAxis.Pressure {
        if penPressures == nil {
          penPressures = Dictionary[int64, float32]()
        }
        penPressures!! [int64(nativeEvent.Paxis.Which)] = NormalizePressure(nativeEvent.Paxis.Value)
      }
      return
    }
    if eventType == SDLEventType.PenButtonDown {
      if nativeEvent.Pbutton.WindowID == windowId {
        DispatchPenButton(nativeEvent.Pbutton, true)
      }
      return
    }
    if eventType == SDLEventType.PenButtonUp {
      if nativeEvent.Pbutton.WindowID == windowId {
        DispatchPenButton(nativeEvent.Pbutton, false)
      }
      return
    }
    if eventType == SDLEventType.PenProximityOut {
      if nativeEvent.Pproximity.WindowID == 0u || nativeEvent.Pproximity.WindowID == windowId {
        penPressures?.Remove(int64(nativeEvent.Pproximity.Which))
        PointerCanceled?.Invoke(int64(nativeEvent.Pproximity.Which), PointerDevice.Pen)
      }
      return
    }
    if eventType == SDLEventType.KeyDown {
      if nativeEvent.Key.WindowID == windowId && nativeEvent.Key.Repeat == uint8(0) {
        KeyPressed?.Invoke(MapKey(nativeEvent.Key.Scancode), MapModifiers(nativeEvent.Key.Mod))
      }
      return
    }
    if eventType == SDLEventType.KeyUp {
      if nativeEvent.Key.WindowID == windowId {
        KeyReleased?.Invoke(MapKey(nativeEvent.Key.Scancode), MapModifiers(nativeEvent.Key.Mod))
      }
      return
    }
    if eventType == SDLEventType.TextInput {
      if nativeEvent.Text.WindowID == windowId {
        guard let pointer = nativeEvent.Text.Text else { return }
        let text = Marshal.PtrToStringUTF8(nint(pointer)) ?? ""
        if text.Length != 0 {
          TextEntered?.Invoke(text)
        }
      }
      return
    }
    if eventType == SDLEventType.TextEditing {
      if nativeEvent.Edit.WindowID == windowId {
        var editing = ""
        if let pointer = nativeEvent.Edit.Text {
          editing = Marshal.PtrToStringUTF8(nint(pointer)) ?? ""
        }
        if editing.Length == 0 {
          TextCompositionCanceled?.Invoke()
        } else {
          ConvertCompositionRange(editing, nativeEvent.Edit.Start, nativeEvent.Edit.Length,
            out var selectionStart, out var selectionLength)
          TextEditing?.Invoke(editing, selectionStart, selectionLength)
        }
      }
      return
    }
    if eventType == SDLEventType.TextEditingCandidates {
      if nativeEvent.EditCandidates.WindowID == windowId {
        let candidates = CopyCandidates(nativeEvent.EditCandidates)
        var selected = nativeEvent.EditCandidates.SelectedCandidate
        if selected < 0 || selected >= candidates.Length {
          selected = -1
        }
        TextEditingCandidates?.Invoke(
          ReadOnlyCollection[string](Array.AsReadOnly(candidates)), selected,
          (nativeEvent.EditCandidates.Horizontal != uint8(0)))
      }
    }
  }

  private func DispatchWindow(eventType SDLEventType, nativeEvent SDLWindowEvent) {
    if eventType == SDLEventType.WindowMoved {
      X = nativeEvent.Data1
      Y = nativeEvent.Data2
      Moved?.Invoke(X, Y)
      RefreshMetrics()
      RaiseMetrics()
    } else if eventType == SDLEventType.WindowResized {
      LogicalWidth = nativeEvent.Data1
      LogicalHeight = nativeEvent.Data2
      RefreshFramebuffer()
      RaiseMetrics()
    } else if eventType == SDLEventType.WindowPixelSizeChanged {
      FramebufferWidth = nativeEvent.Data1
      FramebufferHeight = nativeEvent.Data2
      RefreshLogical()
      RaiseMetrics()
    } else if eventType == SDLEventType.WindowDisplayChanged ||
    eventType == SDLEventType.WindowDisplayScaleChanged{
      RefreshDisplayPacing(true)
      RefreshMetrics()
      RaiseMetrics()
    } else if eventType == SDLEventType.WindowMinimized {
      StateChanged?.Invoke(WindowState.Minimized)
    } else if eventType == SDLEventType.WindowMaximized {
      StateChanged?.Invoke(WindowState.Maximized)
    } else if eventType == SDLEventType.WindowShown {
      RefreshDisplayPacing(true)
    } else if eventType == SDLEventType.WindowRestored {
      RefreshDisplayPacing(true)
      StateChanged?.Invoke(WindowState.Normal)
    } else if eventType == SDLEventType.WindowEnterFullscreen {
      RefreshDisplayPacing(true)
      StateChanged?.Invoke(WindowState.Fullscreen)
    } else if eventType == SDLEventType.WindowLeaveFullscreen {
      RefreshDisplayPacing(true)
      StateChanged?.Invoke(WindowState.Normal)
    } else if eventType == SDLEventType.WindowFocusGained {
      FocusChanged?.Invoke(true)
    } else if eventType == SDLEventType.WindowFocusLost {
      pointerButtons = PointerButtons.None
      FocusChanged?.Invoke(false)
    } else if eventType == SDLEventType.WindowCloseRequested {
      RequestClose()
    } else if eventType == SDLEventType.WindowExposed {
      RefreshDisplayPacing(true)
      Exposed?.Invoke()
    }
  }

  private func IsSyntheticMouse(which uint32) bool -> which == TouchMouseId || which == PenMouseId

  private func IsSyntheticTouch(touchId int64) bool -> touchId == MouseTouchId || touchId == PenTouchId

  private func MapModifiers(value uint16) KeyModifiers {
    let alt = uint16(SDL.SDL_KMOD_LALT | SDL.SDL_KMOD_RALT)
    let shift = uint16(SDL.SDL_KMOD_LSHIFT | SDL.SDL_KMOD_RSHIFT)
    let ctrl = uint16(SDL.SDL_KMOD_LCTRL | SDL.SDL_KMOD_RCTRL)
    let superKey = uint16(SDL.SDL_KMOD_LGUI | SDL.SDL_KMOD_RGUI)
    let altDown = (value & alt) != uint16(0)
    let shiftDown = (value & shift) != uint16(0)
    let ctrlDown = (value & ctrl) != uint16(0)
    let superDown = (value & superKey) != uint16(0)
    return KeyModifiers{
      Alt: altDown,
      Shift: shiftDown,
      Ctrl: ctrlDown,
      Super: superDown,
    }
  }

  private func MapPointerButton(button uint8) PointerButton -> switch button {
    case SDL.SDL_BUTTON_LEFT: PointerButton.Primary
    case SDL.SDL_BUTTON_RIGHT: PointerButton.Secondary
    case SDL.SDL_BUTTON_MIDDLE: PointerButton.Middle
    case SDL.SDL_BUTTON_X1: PointerButton.Back
    case SDL.SDL_BUTTON_X2: PointerButton.Forward
    case _: PointerButton.None
  }

  private func MapPointerButtons(state uint32) PointerButtons {
    var buttons = PointerButtons.None
    if (state & NativePointerMask(SDL.SDL_BUTTON_LEFT)) != 0u {
      buttons = PointerButtons(int32(buttons) | int32(PointerButtons.Primary))
    }
    if (state & NativePointerMask(SDL.SDL_BUTTON_RIGHT)) != 0u {
      buttons = PointerButtons(int32(buttons) | int32(PointerButtons.Secondary))
    }
    if (state & NativePointerMask(SDL.SDL_BUTTON_MIDDLE)) != 0u {
      buttons = PointerButtons(int32(buttons) | int32(PointerButtons.Middle))
    }
    if (state & NativePointerMask(SDL.SDL_BUTTON_X1)) != 0u {
      buttons = PointerButtons(int32(buttons) | int32(PointerButtons.Back))
    }
    if (state & NativePointerMask(SDL.SDL_BUTTON_X2)) != 0u {
      buttons = PointerButtons(int32(buttons) | int32(PointerButtons.Forward))
    }
    return buttons
  }

  private func NativePointerMask(button uint8) uint32 -> uint32(1) << int32(uint32(button) - 1u)

  private func PenButtons(state uint32) PointerButtons {
    var buttons = PointerButtons.None
    if (state & uint32(SDLPenInputFlags.Down)) != 0u {
      buttons = PointerButtons(int32(buttons) | int32(PointerButtons.Primary))
    }
    if (state & uint32(SDLPenInputFlags.Button1)) != 0u {
      buttons = PointerButtons(int32(buttons) | int32(PointerButtons.Secondary))
    }
    if (state & uint32(SDLPenInputFlags.Button2)) != 0u {
      buttons = PointerButtons(int32(buttons) | int32(PointerButtons.Middle))
    }
    if (state & uint32(SDLPenInputFlags.Button3)) != 0u {
      buttons = PointerButtons(int32(buttons) | int32(PointerButtons.Back))
    }
    if (state & uint32(SDLPenInputFlags.Button4)) != 0u {
      buttons = PointerButtons(int32(buttons) | int32(PointerButtons.Forward))
    }
    return buttons
  }

  private func MapPenButton(button uint8) PointerButton {
    if button == uint8(1) { return PointerButton.Secondary }
    if button == uint8(2) { return PointerButton.Middle }
    if button == uint8(3) { return PointerButton.Back }
    if button == uint8(4) { return PointerButton.Forward }
    return PointerButton.None
  }

  private func ToPointerButtons(button PointerButton) PointerButtons -> switch button {
    case PointerButton.Primary: PointerButtons.Primary
    case PointerButton.Secondary: PointerButtons.Secondary
    case PointerButton.Middle: PointerButtons.Middle
    case PointerButton.Back: PointerButtons.Back
    case PointerButton.Forward: PointerButtons.Forward
    case _: PointerButtons.None
  }

  private func MousePressure(buttons PointerButtons) float32 -> (int32(buttons) & int32(PointerButtons.Primary)) != 0 ? 1.0F : 0.0F

  private func NormalizePressure(pressure float32) float32 {
    if Single.IsNaN(pressure) || pressure <= 0.0F { return 0.0F }
    return pressure >= 1.0F ? 1.0F : pressure
  }

  private func TouchX(normalizedX float32) float32 -> normalizedX * float32(LogicalWidth)
  private func TouchY(normalizedY float32) float32 -> normalizedY * float32(LogicalHeight)

  private func GetTouchPointerId(touchId int64, fingerId int64) int64 {
    let key = TouchContactKey(touchId, fingerId)
    if touchPointers.TryGetValue(key, out var pointerId) { return pointerId }
    if nextTouchPointerId == -1L {
      throw InvalidOperationException("SDL touch pointer ID space is exhausted.")
    }
    pointerId = nextTouchPointerId
    nextTouchPointerId++
    touchPointers.Add(key, pointerId)
    return pointerId
  }

  private func ReleaseTouchPointer(touch SDLTouchFingerEvent, canceled bool) {
    let key = TouchContactKey(touch.TouchID, touch.FingerID)
    if !touchPointers.Remove(key, out var pointerId) { return }
    if canceled {
      PointerCanceled?.Invoke(pointerId, PointerDevice.Touch)
      return
    }
    PointerReleased?.Invoke(pointerId, PointerDevice.Touch,
      TouchX(touch.X), TouchY(touch.Y), PointerButton.Primary,
      PointerButtons.None, NormalizePressure(touch.Pressure),
      MapModifiers(SDL.GetModState()))
  }

  private func DispatchPenButton(pen SDLPenButtonEvent, down bool) {
    let button = MapPenButton(pen.Button)
    if button == PointerButton.None { return }
    var buttons = PenButtons(pen.PenState)
    if down {
      buttons = PointerButtons(int32(buttons) | int32(ToPointerButtons(button)))
    } else {
      buttons = PointerButtons(int32(buttons) & ^int32(ToPointerButtons(button)))
    }
    if down {
      PointerPressed?.Invoke(int64(pen.Which), PointerDevice.Pen, pen.X, pen.Y,
        button, buttons, PenPressure(int64(pen.Which)), MapModifiers(SDL.GetModState()))
    } else {
      PointerReleased?.Invoke(int64(pen.Which), PointerDevice.Pen, pen.X, pen.Y,
        button, buttons, PenPressure(int64(pen.Which)), MapModifiers(SDL.GetModState()))
    }
  }

  private func PenPressure(penId int64) float32 {
    if let values = penPressures {
      if values.TryGetValue(penId, out var pressure) { return pressure }
    }
    return 0.0F
  }

  private func CopyCandidates(nativeEvent SDLTextEditingCandidatesEvent) []string {
    guard let values = nativeEvent.Candidates else { return []string{} }
    if nativeEvent.NumCandidates <= 0 { return []string{} }
    let pointers = *SdlVulkanExtensionPointer(values)
    let candidates = [nativeEvent.NumCandidates]string
    var index int32 = 0
    while index < nativeEvent.NumCandidates {
      candidates[index] = Marshal.PtrToStringUTF8(nint(pointers[index].Value)) ?? ""
      index++
    }
    return candidates
  }

  private func ConvertCompositionRange(text string, characterStart int32,
    characterLength int32, out utf16Start int32, out utf16Length int32) {
      if characterStart < 0 || characterLength < 0 {
        utf16Start = 0
        utf16Length = 0
        return
      }
      var scalarCount int32 = 0
      var cursor int32 = 0
      while cursor < text.Length {
        cursor += IsSurrogatePair(text, cursor) ? 2 : 1
        scalarCount++
      }
      if characterStart > scalarCount || characterLength > scalarCount - characterStart {
        utf16Start = 0
        utf16Length = 0
        return
      }
      utf16Start = Utf16Offset(text, characterStart)
      utf16Length = Utf16Offset(text, characterStart + characterLength) - utf16Start
    }

  private func Utf16Offset(text string, characterOffset int32) int32 {
    if characterOffset <= 0 { return 0 }
    var scalar int32 = 0
    var utf16 int32 = 0
    while utf16 < text.Length && scalar < characterOffset {
      utf16 += IsSurrogatePair(text, utf16) ? 2 : 1
      scalar++
    }
    return utf16
  }

  private func IsSurrogatePair(text string, index int32) bool {
    if index < 0 || index + 1 >= text.Length { return false }
    let first = int32(text[index])
    let second = int32(text[index + 1])
    return first >= 0xD800 && first <= 0xDBFF && second >= 0xDC00 && second <= 0xDFFF
  }

  private data struct TouchContactKey(TouchId int64, FingerId int64) { }
}
