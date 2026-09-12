package Goo

import System
import System.Collections.Generic
import System.Numerics

internal enum WindowHitResult {
  Normal;
  Draggable;
  TopLeft;
  Top;
  TopRight;
  Right;
  BottomRight;
  Bottom;
  BottomLeft;
  Left;
}

internal interface WindowHost {
  event MetricsChanged Action[int32, int32, int32, int32]
  event Moved Action[int32, int32]
  event StateChanged Action[WindowState]
  event FocusChanged Action[bool]
  event CloseRequested Action
  event Exposed Action
  event PointerMoved Action[int64, PointerDevice, float32, float32,
    PointerButtons, float32, KeyModifiers]
  event PointerPressed Action[int64, PointerDevice, float32, float32,
    PointerButton, PointerButtons, float32, KeyModifiers]
  event PointerReleased Action[int64, PointerDevice, float32, float32,
    PointerButton, PointerButtons, float32, KeyModifiers]
  event PointerCanceled Action[int64, PointerDevice]
  event Wheel Action[float32, float32, float32, float32, KeyModifiers]
  event KeyPressed Action[Key, KeyModifiers]
  event KeyReleased Action[Key, KeyModifiers]
  event TextEntered Action[string]
  event TextEditing Action[string, int32, int32]
  event TextEditingCandidates Action[IReadOnlyList[string], int32, bool]
  event TextCompositionCanceled Action

  prop LogicalWidth int32 { get; }
  prop LogicalHeight int32 { get; }
  prop FramebufferWidth int32 { get; }
  prop FramebufferHeight int32 { get; }
  prop X int32 { get; }
  prop Y int32 { get; }
  prop IsClosing bool { get; }
  prop IsTextInputActive bool { get; }
  prop HasPendingEvents bool { get; }
  prop SchedulerPacingAvailable bool { get; }
  prop NativeResizable bool { get; }
  prop CanMove bool { get; }

  func PollEvents();
  func WaitEvents(timeoutMs int32);
  func ClearPendingEvents();
  func MarkFrame(nowTicks float64);
  func DeferFrame(nowTicks float64);
  func IsFrameDue(nowTicks float64) bool;
  func FrameWaitMilliseconds(nowTicks float64, fallbackMs int32) int32;
  func RefreshMetricsIfChanged();
  func Wake();
  func SetTitle(value string);
  func SetSize(width int32, height int32);
  func SetPosition(x int32, y int32);
  func SetState(value WindowState);
  func RequestActivation() WindowActivationResult;
  func SetBorder(decorated bool, resizable bool);
  func SetVSync(value bool);
  func SetCursor(value Cursor);
  func Show();
  func StartTextInput() bool;
  func StopTextInput();
  func SetImeArea(x int32, y int32, width int32, height int32, cursor int32) bool;
  func GetClipboardText() string;
  func SetClipboardText(value string);
  func BeginClose();
  func Dispose();
}

internal enum WindowReadbackRequestStatus {
  Accepted;
  Busy;
  BudgetExceeded;
  NotReady;
  Failed;
  DeviceLost;
}

internal enum WindowReadbackPollStatus {
  NotReady;
  Complete;
  Failed;
}

internal interface WindowReadbackResult {
  prop Width uint32 { get; }
  prop Height uint32 { get; }
  prop RowBytes uint32 { get; }
  prop Premultiplied bool { get; }
  prop OriginBottomLeft bool { get; }
  prop SrgbEncoded bool { get; }
  prop Pixels []uint8 { get; }
}

internal interface WindowRenderTarget {
  prop ProfileSink FrameProfileSink { get; }
  prop NeedsRender bool { get; }
  prop LastFrameSubmitted bool { get; }
  prop QueueWorkPending bool { get; }

  func PrepareClose() bool;
  func SetVSync(value bool);
  func BeginFrame();
  func Render(root Node?, background Color, dpi Vector2, overlay DiagnosticOverlay?);
  func Present();
  func ServicePendingSubmission() bool;
  func PollQueueCompletion() bool;
  func Resize(width int32, height int32) bool;
  func RequestCapture(root Node?, background Color, dpi Vector2) WindowReadbackRequestStatus;
  func PollCapture() WindowReadbackPollStatus;
  func TakeCaptureResult() WindowReadbackResult?;
  func Dispose();
}
