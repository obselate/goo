package Goo

import System
import Hexa.NET.SDL3

internal unsafe partial class SdlHost {
  public prop IsVisible bool { get -> !disposed && !IsClosing
    && (SDL.GetWindowFlags(window) & uint64(SDLWindowFlags.Hidden)) == 0uL }

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
      if !SDL.ShowWindow(window) { return WindowOperationResult.Failed }
      return WindowOperationResult.Accepted
    } finally {
      if let value = previous { SDL.SetHint("SDL_WINDOW_ACTIVATE_WHEN_SHOWN", value) }
      else { SDL.ResetHint("SDL_WINDOW_ACTIVATE_WHEN_SHOWN") }
    }
  }

  public func Hide() WindowOperationResult {
    if disposed || IsClosing { return WindowOperationResult.Closed }
    return SDL.HideWindow(window) ? WindowOperationResult.Accepted : WindowOperationResult.Failed
  }
}
