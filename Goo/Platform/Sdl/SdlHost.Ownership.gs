package Goo

import System
import Hexa.NET.SDL3

internal unsafe partial class SdlHost {
  internal func SetOwner(parent SdlHost, modal bool) {
    ThrowIfDisposed()
    if !SDL.SetWindowParent(window, parent.NativeWindow) {
      throw NotSupportedException("The native backend could not establish window ownership: " + SDL.GetErrorS())
    }
    if modal && !SDL.SetWindowModal(window, true) {
      throw NotSupportedException("The native backend could not establish modal window semantics: " + SDL.GetErrorS())
    }
  }
}
