package Goo

import System
import Hexa.NET.SDL3

internal unsafe partial class SdlHost {
  private var deferFirstShow bool
  private var firstShowRequested bool
  private var firstShowMapping bool

  internal prop FirstShowPending bool { get -> deferFirstShow && firstShowRequested }

  internal func DeferFirstShow() bool {
    let properties = SDL.GetWindowProperties(window)
    if !SDL.GetBooleanProperty(properties, "Goo.Wayland.NonblockingFirstShowAvailable.1", false) {
      return false
    }
    deferFirstShow = true
    return true
  }

  internal func PrepareFirstPresent() bool {
    if deferFirstShow {
      deferFirstShow = false
      if firstShowRequested {
        let properties = SDL.GetWindowProperties(window)
        Require(SDL.SetBooleanProperty(properties, "Goo.Wayland.NonblockingFirstShow.1", true),
          "SDL_SetBooleanProperty")
        if RequestActivation() != WindowOperationResult.Accepted {
          throw InvalidOperationException("Native secondary window show failed")
        }
      }
    }
    if firstShowMapping {
      if SDL.GetBooleanProperty(SDL.GetWindowProperties(window),
        "Goo.Wayland.InitialConfigurePending.1", false) { return false }
      firstShowMapping = false
    }
    return true
  }

  public prop IsVisible bool { get -> !disposed && !IsClosing
    && (SDL.GetWindowFlags(window) & uint64(SDLWindowFlags.Hidden | SDLWindowFlags.Minimized)) == 0uL }

  public prop Capabilities WindowCapabilities {
    get {
      let driver = SDL.GetCurrentVideoDriverS()
      return if driver == "windows" || driver == "cocoa" || driver == "x11" {
        WindowCapabilities.Visibility | WindowCapabilities.ShowWithoutActivation
          | WindowCapabilities.Focusability | WindowCapabilities.Topmost
      } else { WindowCapabilities.Visibility }
    }
  }

  public func SetFocusable(value bool) {
    ThrowIfDisposed()
    if (Capabilities & WindowCapabilities.Focusability) == WindowCapabilities.None {
      throw NotSupportedException("The native backend cannot change top-level focusability")
    }
    Require(SDL.SetWindowFocusable(window, value), "SDL_SetWindowFocusable")
  }

  public func SetTopmost(value bool) {
    ThrowIfDisposed()
    if (Capabilities & WindowCapabilities.Topmost) == WindowCapabilities.None {
      throw NotSupportedException("The native backend does not support topmost windows")
    }
    Require(SDL.SetWindowAlwaysOnTop(window, value), "SDL_SetWindowAlwaysOnTop")
  }

  public func ShowWithoutActivation() WindowOperationResult {
    if disposed || IsClosing { return WindowOperationResult.Closed }
    if (Capabilities & WindowCapabilities.ShowWithoutActivation) == WindowCapabilities.None {
      return WindowOperationResult.Unsupported
    }
    let previous = SDL.GetHintS("SDL_WINDOW_ACTIVATE_WHEN_SHOWN")
    if !SDL.SetHint("SDL_WINDOW_ACTIVATE_WHEN_SHOWN", "0") {
      return WindowOperationResult.Unsupported
    }
    try {
      firstShowMapping = true
      if !SDL.ShowWindow(window) { return WindowOperationResult.Failed }
      return WindowOperationResult.Accepted
    } finally {
      if let value = previous { SDL.SetHint("SDL_WINDOW_ACTIVATE_WHEN_SHOWN", value) }
      else { SDL.ResetHint("SDL_WINDOW_ACTIVATE_WHEN_SHOWN") }
    }
  }

  public func Hide() WindowOperationResult {
    if disposed || IsClosing { return WindowOperationResult.Closed }
    if deferFirstShow {
      firstShowRequested = false
      return WindowOperationResult.Accepted
    }
    return SDL.HideWindow(window) ? WindowOperationResult.Accepted : WindowOperationResult.Failed
  }
}
