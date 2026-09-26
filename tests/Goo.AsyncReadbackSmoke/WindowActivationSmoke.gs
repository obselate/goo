package Goo

import System
import System.Diagnostics
import System.Threading

internal class WindowActivationCell : Cell {
  internal let Entry ElementHandle = ElementHandle()

  override func Build() Blob -> TextEntry {
    Handle: Entry, Value: "Activation preserves this editor",
    Width: 280, Height: 40,
  }
}

internal class WindowActivationSmoke {
  shared {
    private func Require(value bool, message string) {
      if !value { throw InvalidOperationException(message) }
    }

    internal func Run() {
      let root = WindowActivationCell{}
      let window = Window{
        Title: "Goo activation smoke", Root: root, Width: 320, Height: 100,
        InitiallyVisible: false,
      }.Open()
      try {
        Require(!window.IsVisible && !window.IsFocused, "Initially hidden window was shown or focused")
        window.Pump(0.0)
        let mounted = window.Tree
        var visibility = 0
        window.VisibilityChanged += (value bool) -> { visibility++ }
        let passive = window.Show(false)
        if (window.Capabilities & WindowCapabilities.ShowWithoutActivation) != WindowCapabilities.None {
          Require(passive == WindowOperationResult.Accepted && window.IsVisible,
            "Supported passive show did not reveal the window")
          Require(!window.IsFocused, "Passive show synthesized focus")
        } else {
          Require(passive == WindowOperationResult.Unsupported && !window.IsVisible,
            "Unsupported passive show changed visibility")
          Require(window.Show() == WindowOperationResult.Accepted, "Initial show failed")
        }
        WindowReadbackTestFixture.ForceRender(window, 0.0)
        Require(root.Entry.Focus(), "Activation smoke editor did not focus")
        guard let editor = window.PlatformInput.Editor else {
          throw InvalidOperationException("Activation smoke editor state is missing")
        }
        var notifications = 0
        window.FocusChanged += (focused bool) -> { notifications++ }
        for attempt in 0 ... 3 {
          let focused = window.IsFocused
          let events = notifications
          Require(window.RequestActivation() == WindowActivationResult.Accepted,
            "Native activation request was not accepted")
          Require(window.IsFocused == focused && notifications == events,
            "Activation request synthesized native focus")
          guard let current = window.PlatformInput.Editor else {
            throw InvalidOperationException("Activation request lost the focused editor")
          }
          Require(current.FocusId == editor.FocusId && current.Text == editor.Text
              && current.SelectionStart == editor.SelectionStart
              && current.SelectionEnd == editor.SelectionEnd,
            "Activation request changed the focused editor")
        }
        window.State = WindowState.Minimized
        let minimizedDeadline = Stopwatch.GetTimestamp() + Stopwatch.Frequency / 4
        while Stopwatch.GetTimestamp() < minimizedDeadline {
          window.Pump(0.0)
          Thread.Sleep(1)
        }
        Require(window.RequestActivation() == WindowActivationResult.Accepted,
          "Minimized window activation request was not accepted")
        let deadline = Stopwatch.GetTimestamp() + Stopwatch.Frequency / 2
        while Stopwatch.GetTimestamp() < deadline {
          window.Pump(0.0)
          Thread.Sleep(1)
        }
        Require(window.Hide() == WindowOperationResult.Accepted && !window.IsVisible,
          "Hide did not hide the native window")
        Require(window.Tree == mounted && window.IsOpen && !window.IsFocused,
          "Hide discarded the retained tree or retained focus")
        if (window.Capabilities & WindowCapabilities.Focusability) != WindowCapabilities.None {
          window.Focusable = false
          Require(window.RequestActivation() == WindowActivationResult.Unsupported,
            "Nonfocusable window accepted activation")
          Require(window.Show() == WindowOperationResult.Accepted && !window.IsFocused,
            "Nonfocusable show failed or synthesized focus")
          window.Focusable = true
        } else {
          Require(window.Show() == WindowOperationResult.Accepted, "Reshow failed")
        }
        if (window.Capabilities & WindowCapabilities.Topmost) != WindowCapabilities.None {
          window.Topmost = true
          window.Topmost = false
        }
        Require(visibility >= 3, "Native lifecycle did not report visibility changes")
        Console.WriteLine("window-activation: requests=4 visibility=verified editor=preserved synchronous_focus=unchanged"
          +" observed_focus=" + window.IsFocused.ToString()
          +" observed_state=" + window.State.ToString())
      } finally {
        window.RequestClose()
        let deadline = Stopwatch.GetTimestamp() + Stopwatch.Frequency * 5
        while window.IsOpen && Stopwatch.GetTimestamp() < deadline {
          window.PumpScheduled(0.0)
          Thread.Sleep(1)
        }
        Require(!window.IsOpen, "Activation smoke window did not close")
        Require(window.RequestActivation() == WindowActivationResult.Closed,
          "Closed window accepted activation")
      }
    }
  }
}
