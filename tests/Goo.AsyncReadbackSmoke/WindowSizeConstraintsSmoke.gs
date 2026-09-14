package Goo

import System
import System.Threading
import Hexa.NET.SDL3

internal unsafe class WindowSizeConstraintsSmoke {
  shared {
    private func Require(value bool, message string) {
      if !value { throw InvalidOperationException(message) }
    }

    private func Settle(window Window) {
      for i in 0 ... 20 { window.Pump(0.016)
        Thread.Sleep(10) }
    }

    private func CheckNativeLimits(window Window) {
      let native = SDL.GetWindowFromID(WindowReadbackTestFixture.SdlWindowId(window))
      var w int32
      var h int32
      Require(SDL.GetWindowMinimumSize(native, &w, &h), "Cannot read native minimum size")
      Require(w == window.MinWidth && h == window.MinHeight, "Native minimum size differs from Window")
      Require(SDL.GetWindowMaximumSize(native, &w, &h), "Cannot read native maximum size")
      Require(w == window.MaxWidth && h == window.MaxHeight, "Native maximum size differs from Window")
    }

    internal func Run() {
      let window = Window{
        Title: "Goo native size constraints", Width: 100, Height: 100,
        MinWidth: 400, MinHeight: 260, MaxWidth: 800, MaxHeight: 600,
        Root: WindowActivationCell{},
      }.Open()
      try {
        Settle(window)
        CheckNativeLimits(window)
        Require(window.Width == 400 && window.Height == 260, "Initial size did not clamp to minimum")
        window.Width = 1000
        window.Height = 900
        Settle(window)
        Require(window.Width == 800 && window.Height == 600, "Programmatic size exceeded maximum")
        window.MaxWidth = 600
        window.MaxHeight = 420
        Settle(window)
        CheckNativeLimits(window)
        Require(window.Width == 600 && window.Height == 420, "Changed maximum did not resize client area")
        window.Width = 100
        window.Height = 100
        Settle(window)
        Require(window.Width == 400 && window.Height == 260, "Programmatic size fell below minimum")
        window.MinWidth = 520
        window.MinHeight = 340
        Settle(window)
        CheckNativeLimits(window)
        Require(window.Width == 520 && window.Height == 340, "Changed minimum did not resize client area")
        var notifications int32
        window.MetricsChanged += (metrics WindowMetrics) -> { notifications++ }
        Settle(window)
        let settled = notifications
        window.MinWidth = 520
        window.MinHeight = 340
        Settle(window)
        Require(notifications == settled, "Unchanged limits caused metric churn")
        window.MaxWidth = 0
        window.MaxHeight = 0
        window.MinWidth = 0
        window.MinHeight = 0
        CheckNativeLimits(window)
        window.Width = 300
        window.Height = 200
        Settle(window)
        Require(window.Width == 300 && window.Height == 200, "Removed constraints still restrict the size")
        Console.WriteLine("window-size-constraints: initial/live/min/max/reset=pass native_limits=matched metrics=stable")
      } finally {
        window.RequestClose()
        Settle(window)
        Require(!window.IsOpen, "Size-constraint smoke did not close")
      }
    }
  }
}
