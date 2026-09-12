package GooAsyncReadbackSmoke

import System
import System.IO
import System.Runtime.InteropServices
import Goo
import Hexa.NET.SDL3

// SDK 0.4.591 nullable-wraps imported pointer fields. Use the native address
// directly for this SDL event; RunNativeInputSmoke checks its ABI layout.
@StructLayout(LayoutKind.Sequential, Size: 128)
struct NativeTextInputEvent {
  public var Type uint32
  public var Reserved uint32
  public var Timestamp uint64
  public var WindowID uint32
  public var Text nint
}

@DllImport("SDL3", EntryPoint: "SDL_PushEvent", CallingConvention: CallingConvention.Cdecl)
func NativeInputPushTextEvent(ref event NativeTextInputEvent) uint8;

class NativeInputAcceptanceCell : Cell {
  internal let Target ElementHandle = ElementHandle{}
  internal let Entry ElementHandle = ElementHandle{}

  internal var PointerCount int32
  internal var KeyDownCount int32
  internal var KeyUpCount int32
  internal var TextCount int32
  internal var CommittedText string

  init() {
    PointerCount = 0
    KeyDownCount = 0
    KeyUpCount = 0
    TextCount = 0
    CommittedText = ""
  }

  private func RecordPointer() {
    PointerCount = PointerCount + 1
    Rebuild()
  }

  private func RecordKeyDown() {
    KeyDownCount = KeyDownCount + 1
    Rebuild()
  }

  private func RecordKeyUp() {
    KeyUpCount = KeyUpCount + 1
    Rebuild()
  }

  private func RecordText(value string) {
    TextCount = TextCount + 1
    CommittedText = value
    Rebuild()
  }

  override func Build() Blob -> Container {
    Width: 320,
    Height: 160,
    Position: PositionType.Relative,
    BackgroundColor: Color.Rgb(12, 20, 32),
    Children: {
      Button{
        Key: "retained-sdl-target",
        Handle: Target,
        Position: PositionType.Absolute,
        Left: 16,
        Top: 16,
        Width: 128,
        Height: 56,
        Focusable: true,
        BackgroundColor: Color.Rgb(48, 96, 160),
        BorderWidth: 2,
        BorderColor: Color.Rgb(120, 168, 224),
        Focus: Style{ BorderColor: Color.Rgb(255, 220, 120) },
        OnClick: func() { RecordPointer() },
      },
      TextEntry{
        Key: "retained-sdl-entry",
        Handle: Entry,
        Position: PositionType.Absolute,
        Left: 16,
        Top: 88,
        Width: 240,
        Height: 44,
        Padding: 6,
        Focusable: true,
        Value: "",
        BackgroundColor: Color.Rgb(20, 30, 44),
        Color: Color.Rgb(224, 232, 244),
        SelectionColor: Color.Rgba(48, 96, 160, 180),
        OnKeyDown: func(value KeyEvent) { RecordKeyDown() },
        OnKeyUp: func(value KeyEvent) { RecordKeyUp() },
        OnTextInput: func(value string) { RecordText(value) },
      },
    },
  }
}

unsafe func NativeInputPushPointerPair(windowId uint32, x float32, y float32) int32 {
  var accepted int32 = 0
  var down = SDLEvent{
    Type: uint32(SDLEventType.MouseButtonDown),
    Button: SDLMouseButtonEvent{
      Type: SDLEventType.MouseButtonDown,
      WindowID: windowId,
      Which: 0u,
      Button: uint8(SDL.SDL_BUTTON_LEFT),
      Down: uint8(1),
      Clicks: uint8(1),
      X: x,
      Y: y,
    },
  }
  if SDL.PushEvent(&down) {
    accepted = accepted + 1
  }
  var up = SDLEvent{
    Type: uint32(SDLEventType.MouseButtonUp),
    Button: SDLMouseButtonEvent{
      Type: SDLEventType.MouseButtonUp,
      WindowID: windowId,
      Which: 0u,
      Button: uint8(SDL.SDL_BUTTON_LEFT),
      Down: uint8(0),
      Clicks: uint8(1),
      X: x,
      Y: y,
    },
  }
  if SDL.PushEvent(&up) {
    accepted = accepted + 1
  }
  return accepted
}

unsafe func NativeInputPushKeyPair(windowId uint32) int32 {
  var accepted int32 = 0
  var down = SDLEvent{
    Type: uint32(SDLEventType.KeyDown),
    Key: SDLKeyboardEvent{
      Type: SDLEventType.KeyDown,
      WindowID: windowId,
      Which: 0u,
      Scancode: SDLScancode.A,
      Key: 0,
      Mod: uint16(SDLKeymod.None),
      Raw: uint16(0),
      Down: uint8(1),
      Repeat: uint8(0),
    },
  }
  if SDL.PushEvent(&down) {
    accepted = accepted + 1
  }
  var up = SDLEvent{
    Type: uint32(SDLEventType.KeyUp),
    Key: SDLKeyboardEvent{
      Type: SDLEventType.KeyUp,
      WindowID: windowId,
      Which: 0u,
      Scancode: SDLScancode.A,
      Key: 0,
      Mod: uint16(SDLKeymod.None),
      Raw: uint16(0),
      Down: uint8(0),
      Repeat: uint8(0),
    },
  }
  if SDL.PushEvent(&up) {
    accepted = accepted + 1
  }
  return accepted
}

unsafe func NativeInputPushText(windowId uint32, value string, out polled int32) bool {
  polled = 0
  let storage = Marshal.StringToCoTaskMemUTF8(value)
  try {
    var event = NativeTextInputEvent{
      Type: uint32(SDLEventType.TextInput),
      WindowID: windowId,
      Text: storage,
    }
    let accepted = NativeInputPushTextEvent(&event) != 0
    if accepted {
      polled = WindowReadbackTestFixture.PumpNativeEventsForTest()
    }
    return accepted
  } finally {
    Marshal.FreeCoTaskMem(storage)
  }
}

func NativeInputRequireInputFrame(before VulkanDiagnosticCounterSnapshot,
  after VulkanDiagnosticCounterSnapshot, kind string) {
    Require(after.submitCount == before.submitCount + 1uL
        && after.presentCount == before.presentCount + 1uL,
      "Retained SDL " + kind + " input did not submit and present exactly once")
  }

func RunNativeInputSmoke() {
  Require(Environment.GetEnvironmentVariable("GOO_VK_DIAGNOSTICS") == "1",
    "GOO_VK_DIAGNOSTICS=1 is required")
  Require(Marshal.SizeOf[NativeTextInputEvent]() == 128
      && Marshal.OffsetOf[NativeTextInputEvent]("WindowID") == Marshal.OffsetOf[SDLTextInputEvent]("WindowID")
      && Marshal.OffsetOf[NativeTextInputEvent]("Text") == Marshal.OffsetOf[SDLTextInputEvent]("Text"),
    "Native SDL text input event layout does not match the bindings")
  let root = NativeInputAcceptanceCell{}
  let capturedError = StringWriter()
  let originalError = Console.Error
  var window Window? = nil
  var acceptedEvents int32 = 0
  var nativePollSeen bool = false
  var submitCount uint64 = 0uL
  var presentCount uint64 = 0uL
  try {
    Console.SetError(capturedError)
    let opened = Window{
      Title: "Goo Retained SDL acceptance",
      Width: 320,
      Height: 160,
      VSync: false,
      Root: root,
    }
    window = opened
    opened.Open()
    WindowReadbackTestFixture.ForceRender(opened, 0.0)
    Require(root.Target.IsMounted
        && root.Entry.IsMounted,
      "Retained SDL acceptance scene did not mount")
    let windowId = WindowReadbackTestFixture.SdlWindowId(opened)
    Require(windowId != 0u, "Retained SDL acceptance did not obtain a live SDL window ID")
    Require(root.Entry.Focus(), "Retained SDL acceptance TextEntry did not accept focus")
    WindowReadbackTestFixture.ForceRender(opened, 0.0)

    let targetBounds = root.Target.BorderBox
    let pointerX = float32(targetBounds.X + targetBounds.Width * 0.5)
    let pointerY = float32(targetBounds.Y + targetBounds.Height * 0.5)
    let pointerBefore = WindowReadbackTestFixture.DiagnosticCounters(opened)
    let pointerAccepted = NativeInputPushPointerPair(windowId, pointerX, pointerY)
    acceptedEvents = acceptedEvents + pointerAccepted
    Require(pointerAccepted == 2, "Retained SDL pointer events were not accepted by SDL")
    let pointerPolled = WindowReadbackTestFixture.PumpNativeEventsForTest()
    nativePollSeen = nativePollSeen || pointerPolled > 0
    Require(pointerPolled > 0, "Retained SDL pointer events were not polled")
    WindowReadbackTestFixture.ForceRender(opened, 0.0)
    let pointerAfter = WindowReadbackTestFixture.DiagnosticCounters(opened)
    NativeInputRequireInputFrame(pointerBefore, pointerAfter, "pointer")
    submitCount = submitCount + pointerAfter.submitCount - pointerBefore.submitCount
    presentCount = presentCount + pointerAfter.presentCount - pointerBefore.presentCount
    Require(root.PointerCount == 1
        && root.KeyDownCount == 0
        && root.KeyUpCount == 0
        && root.TextCount == 0
        && root.CommittedText == "",
      "Retained SDL pointer callback was not isolated")

    Require(root.Entry.Focus(), "Retained SDL acceptance TextEntry did not refocus")
    WindowReadbackTestFixture.ForceRender(opened, 0.0)
    let keyBefore = WindowReadbackTestFixture.DiagnosticCounters(opened)
    let keyAccepted = NativeInputPushKeyPair(windowId)
    acceptedEvents = acceptedEvents + keyAccepted
    Require(keyAccepted == 2, "Retained SDL key events were not accepted by SDL")
    let keyPolled = WindowReadbackTestFixture.PumpNativeEventsForTest()
    nativePollSeen = nativePollSeen || keyPolled > 0
    Require(keyPolled > 0, "Retained SDL key events were not polled")
    WindowReadbackTestFixture.ForceRender(opened, 0.0)
    let keyAfter = WindowReadbackTestFixture.DiagnosticCounters(opened)
    NativeInputRequireInputFrame(keyBefore, keyAfter, "key")
    submitCount = submitCount + keyAfter.submitCount - keyBefore.submitCount
    presentCount = presentCount + keyAfter.presentCount - keyBefore.presentCount
    Require(root.PointerCount == 1
        && root.KeyDownCount == 1
        && root.KeyUpCount == 1
        && root.TextCount == 0
        && root.CommittedText == "",
      "Retained SDL key callback was not isolated")

    let textBefore = WindowReadbackTestFixture.DiagnosticCounters(opened)
    let textAccepted = NativeInputPushText(windowId, "é", out var textPolled)
    if textAccepted {
      acceptedEvents = acceptedEvents + 1
    }
    Require(textAccepted, "Retained SDL text event was not accepted by SDL")
    nativePollSeen = nativePollSeen || textPolled > 0
    Require(textPolled > 0, "Retained SDL text event was not polled")
    WindowReadbackTestFixture.ForceRender(opened, 0.0)
    let textAfter = WindowReadbackTestFixture.DiagnosticCounters(opened)
    NativeInputRequireInputFrame(textBefore, textAfter, "text")
    submitCount = submitCount + textAfter.submitCount - textBefore.submitCount
    presentCount = presentCount + textAfter.presentCount - textBefore.presentCount
    Require(root.PointerCount == 1
        && root.KeyDownCount == 1
        && root.KeyUpCount == 1
        && root.TextCount == 1
        && root.CommittedText == "é",
      "Retained SDL committed text callback was not isolated: pointer="
      +root.PointerCount.ToString() + " keyDown=" + root.KeyDownCount.ToString()
      +" keyUp=" + root.KeyUpCount.ToString() + " text=" + root.TextCount.ToString()
      +" value=" + root.CommittedText)

    Require(acceptedEvents == 5, "Retained SDL acceptance did not accept all five input events")
    Require(submitCount == 3uL && presentCount == 3uL,
      "Retained SDL input render totals were not exact")
    opened.RequestClose()
    WindowReadbackTestFixture.ForceRender(opened, 0.0)
    Require(!opened.IsOpen, "Retained SDL acceptance window did not close")
    Require(WindowReadbackTestFixture.ResidentResourceBytes(opened) == 0uL,
      "Retained SDL acceptance readback resources remain resident after close")
  } finally {
    if let opened = window {
      if opened.IsOpen {
        opened.RequestClose()
        WindowReadbackTestFixture.ForceRender(opened, 0.0)
      }
    }
    Console.SetError(originalError)
  }
  let diagnostics = capturedError.ToString()
  ReadbackValidateCommonDiagnostics(diagnostics)
  Require(!diagnostics.Contains("\"event\":325")
      && !diagnostics.Contains("\"event\":326"),
    "Retained SDL acceptance emitted unsupported-scene diagnostics")
  Require(nativePollSeen, "Retained SDL acceptance did not enter the native polling path")
  Console.WriteLine("native-input-smoke: sdl_poll=1 pointer=1 key=1 text=1"
    +" submit=3 present=3 close=1")
}
