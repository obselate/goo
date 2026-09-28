package Goo

import Hexa.NET.SDL3
import System
import System.Collections.Generic

internal unsafe partial class SdlHost {
  private const CenteredDisplayMask uint32 = 0x2FFF0000u

  shared {
    private func ReadDisplays() IReadOnlyList[WindowDisplay] {
      var count int32
      let nativeDisplays = SDL.GetDisplays(&count)
      let result = List[WindowDisplay]()
      if nativeDisplays == nil {
        throw InvalidOperationException("SDL_GetDisplays failed: " + SDL.GetErrorS())
      }
      try {
        var index int32
        while index < count {
          let id = nativeDisplays[index]
          var nativeBounds SDLRect = SDLRect{}
          if !SDL.GetDisplayBounds(id, &nativeBounds) {
            throw InvalidOperationException("SDL_GetDisplayBounds failed: " + SDL.GetErrorS())
          }
          var nativeUsableBounds SDLRect = SDLRect{}
          let hasUsableBounds = SDL.GetDisplayUsableBounds(id, &nativeUsableBounds)
          var usableBounds ElementRect?
          if hasUsableBounds {
            usableBounds = ElementRect{
              X: float64(nativeUsableBounds.X),
              Y: float64(nativeUsableBounds.Y),
              Width: float64(nativeUsableBounds.W),
              Height: float64(nativeUsableBounds.H),
            }
          }
          let bounds = ElementRect{
            X: float64(nativeBounds.X),
            Y: float64(nativeBounds.Y),
            Width: float64(nativeBounds.W),
            Height: float64(nativeBounds.H),
          }
          let displayId = WindowDisplayId{ NativeValue: id }
          let contentScale = SDL.GetDisplayContentScale(id)
          result.Add(WindowDisplay(displayId, SDL.GetDisplayNameS(id) ?? "",
            bounds, usableBounds, if contentScale > 0.0F { contentScale } else { 0.0F }))
          index++
        }
        return result.AsReadOnly()
      } finally {
        SDL.Free(nativeDisplays)
      }
    }

    private func HasDisplay(id uint32) bool {
      var count int32
      let nativeDisplays = SDL.GetDisplays(&count)
      if nativeDisplays == nil { return false }
      try {
        var index int32
        while index < count {
          if nativeDisplays[index] == id { return true }
          index++
        }
        return false
      } finally {
        SDL.Free(nativeDisplays)
      }
    }
  }

  public func GetDisplays() IReadOnlyList[WindowDisplay] {
    ThrowIfDisposed()
    return ReadDisplays()
  }

  public func TrySetFullscreenDisplay(display WindowDisplayId) WindowOperationResult {
    if disposed || IsClosing { return WindowOperationResult.Closed }
    let id = display.NativeValue
    if id == 0u || !HasDisplay(id) { return WindowOperationResult.Failed }
    let position = int32(CenteredDisplayMask | id)
    let flags = SDL.GetWindowFlags(window)
    let windowedWayland = IsWayland() &&
      (flags & uint64(SDLWindowFlags.Fullscreen)) == 0uL
    if !SDL.SetWindowPosition(window, position, position) && !windowedWayland {
      return WindowOperationResult.Failed
    }
    return if SDL.SetWindowFullscreen(window, true) {
      WindowOperationResult.Accepted
    } else { WindowOperationResult.Failed }
  }
}
