package Goo

import System
import System.Diagnostics
import System.Threading

internal class WindowDisplaySmokeCell : Cell {
  override func Build() Blob -> Container{ Width: 100, Height: 100 }
}

internal class WindowDisplaySmoke {
  shared {
    private func Require(value bool, message string) {
      if !value { throw InvalidOperationException(message) }
    }

    private func CloseWindow(window Window) {
      window.RequestClose()
      let deadline = Stopwatch.GetTimestamp() + Stopwatch.Frequency * 5
      while window.IsOpen && Stopwatch.GetTimestamp() < deadline {
        window.PumpScheduled(0.0)
        Thread.Sleep(1)
      }
      Require(!window.IsOpen, "Display smoke window did not close")
    }

    internal func Run() {
      let missingDisplay = WindowDisplayId{ NativeValue: uint32.MaxValue }
      let window = Window{
        Title: "Goo display smoke", Root: WindowDisplaySmokeCell{},
        Width: 320, Height: 200, InitiallyVisible: false,
      }
      Require(window.TrySetFullscreenDisplay(missingDisplay) == WindowOperationResult.Closed,
        "Closed window accepted a fullscreen display request")
      window.Open()
      try {
        let displays = window.GetDisplays()
        Require(displays.Count > 0, "SDL display inventory is empty")
        let display = displays[0]
        Require(display.Id.NativeValue != 0u, "SDL returned a zero display ID")
        Require(display.Bounds.Width > 0.0 && display.Bounds.Height > 0.0,
          "SDL display bounds are invalid")
        Require(display.ContentScale >= 0.0F,
          "SDL display scale is invalid")
        Require(window.TrySetFullscreenDisplay(missingDisplay) == WindowOperationResult.Failed,
          "Unknown display ID did not fail")
        Require(window.State == WindowState.Normal,
          "Failed fullscreen display request changed the window state")
        var observedFullscreenEvent bool
        window.StateChanged += (value WindowState) -> {
          if value == WindowState.Fullscreen { observedFullscreenEvent = true }
        }
        let target = if displays.Count > 1 { displays[1] } else { display }
        Require(window.TrySetFullscreenDisplay(target.Id) == WindowOperationResult.Accepted,
          "Fullscreen request for an inventoried display failed")
        Require(window.State == WindowState.Fullscreen,
          "Accepted fullscreen request did not update the requested state")
        Require(window.Show() == WindowOperationResult.Accepted,
          "Showing the window for native fullscreen verification failed")
        let targetId = target.Id.NativeValue
        let fullscreenDeadline = Stopwatch.GetTimestamp() + Stopwatch.Frequency * 5
        var nativeState WindowNativeDisplayStateForTest
        while Stopwatch.GetTimestamp() < fullscreenDeadline {
          window.Pump(0.0)
          nativeState = window.NativeDisplayStateForTest()
          if observedFullscreenEvent && nativeState.Fullscreen
            && nativeState.DisplayId == targetId {
              break
          }
          Thread.Sleep(1)
        }
        Require(observedFullscreenEvent && nativeState.Fullscreen
            && nativeState.DisplayId == targetId,
          "Native fullscreen did not reach the selected display")
        let observedDisplayId = nativeState.DisplayId
        let retarget = if displays.Count > 1 { display } else { target }
        Require(window.TrySetFullscreenDisplay(retarget.Id) == WindowOperationResult.Accepted,
          "Retargeting an already-fullscreen window failed")
        let retargetId = retarget.Id.NativeValue
        let retargetDeadline = Stopwatch.GetTimestamp() + Stopwatch.Frequency * 5
        while Stopwatch.GetTimestamp() < retargetDeadline {
          window.Pump(0.0)
          nativeState = window.NativeDisplayStateForTest()
          if nativeState.Fullscreen && nativeState.DisplayId == retargetId { break }
          Thread.Sleep(1)
        }
        Require(nativeState.Fullscreen,
          "Accepted fullscreen display request left the native window out of fullscreen")
        Console.WriteLine("window-display: selected_display="+targetId.ToString()
          +" observed_display="+observedDisplayId.ToString()
          +" retarget_display="+retargetId.ToString()
          +" observed_retarget_display="+nativeState.DisplayId.ToString()
          +" outputs="+displays.Count.ToString())
      } finally {
        CloseWindow(window)
      }
    }
  }
}
