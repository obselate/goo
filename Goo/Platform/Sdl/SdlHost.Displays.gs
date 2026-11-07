package Goo

import Hexa.NET.SDL3
import System
import System.Collections.Generic

internal unsafe partial class SdlHost {
  private const CenteredDisplayMask uint32 = 0x2FFF0000u

  shared {
    internal func ConstrainInitialBounds(requested ElementRect, minWidth int32, minHeight int32,
      positionSet bool, usable ElementRect) ElementRect {
      if usable.Width <= 0.0 || usable.Height <= 0.0 { return requested }
      let width = Math.Max(Math.Max(1, minWidth), Math.Min(requested.Width, usable.Width))
      let height = Math.Max(Math.Max(1, minHeight), Math.Min(requested.Height, usable.Height))
      let right = usable.X + Math.Max(0.0, usable.Width - width)
      let bottom = usable.Y + Math.Max(0.0, usable.Height - height)
      return ElementRect{
        X: if positionSet { Math.Clamp(requested.X, usable.X, right) } else { Math.Floor((usable.X + right) / 2.0) },
        Y: if positionSet { Math.Clamp(requested.Y, usable.Y, bottom) } else { Math.Floor((usable.Y + bottom) / 2.0) },
        Width: width, Height: height,
      }
    }

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
          guard let display = ReadDisplay(nativeDisplays[index]) else {
            throw InvalidOperationException("SDL_GetDisplayBounds failed: " + SDL.GetErrorS())
          }
          result.Add(display)
          index++
        }
        return result.AsReadOnly()
      } finally {
        SDL.Free(nativeDisplays)
      }
    }

    private func ReadDisplay(id uint32) WindowDisplay? {
      if id == 0u { return nil }
      var nativeBounds SDLRect = SDLRect{}
      if !SDL.GetDisplayBounds(id, &nativeBounds) { return nil }
      var nativeUsableBounds SDLRect = SDLRect{}
      var usableBounds ElementRect?
      if SDL.GetDisplayUsableBounds(id, &nativeUsableBounds) {
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
      let contentScale = SDL.GetDisplayContentScale(id)
      return WindowDisplay(WindowDisplayId{ NativeValue: id }, SDL.GetDisplayNameS(id) ?? "",
        bounds, usableBounds, if contentScale > 0.0F { contentScale } else { 0.0F })
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

  public func GetCurrentDisplay() WindowDisplay? {
    ThrowIfDisposed()
    return ReadDisplay(SDL.GetDisplayForWindow(window))
  }

  public func TrySetFullscreenDisplay(display WindowDisplayId) WindowOperationResult {
    if disposed || IsClosing { return WindowOperationResult.Closed }
    if layerWindow != nil { return WindowOperationResult.Unsupported }
    let id = display.NativeValue
    if id == 0u || !HasDisplay(id) { return WindowOperationResult.Failed }
    let position = int32(CenteredDisplayMask | id)
    if !SDL.SetWindowPosition(window, position, position) && !IsWayland() {
      return WindowOperationResult.Failed
    }
    return if SDL.SetWindowFullscreen(window, true) {
      WindowOperationResult.Accepted
    } else { WindowOperationResult.Failed }
  }
}
