package Goo

import System
import System.Collections.Generic
import System.Runtime.CompilerServices
import System.Runtime.InteropServices
import System.Text
import Hexa.NET.SDL3

internal class NativeDropOffer {
  internal let Paths List[string] = List[string]()
  internal var Units int32
  internal var Started bool
  internal var Rejected bool
  internal var X float32
  internal var Y float32
  internal var Modifiers KeyModifiers
}

internal class NativeDropState {
  private let router NativeDropRouter
  private var native SdlHost?
  private var offer NativeDropOffer?
  internal var LastError string?
  shared {
    private let bindings ConditionalWeakTable[SdlHost, NativeDropState] = ConditionalWeakTable[SdlHost, NativeDropState]()
    private let utf8 UTF8Encoding = UTF8Encoding(false, true)
    private let preview DragData = DragData(NativeFileDrop([]string{}, true), DragEffect.Copy)
    internal func Dispatch(host SdlHost, kind SDLEventType, data nint, x float32, y float32, modifiers KeyModifiers) {
      if bindings.TryGetValue(host, out var state) { state.Receive(kind, data, x, y, modifiers) }
    }
  }

  internal init(getRoot(() -> Node?), canReceive(() -> bool), invalidate Action) {
    router = NativeDropRouter(getRoot, canReceive, invalidate)
  }
  internal func Bind(host SdlHost) {
    if host.TransferCapabilities() == NativeTransferCapabilities.None {
      throw NotSupportedException("This SDL video driver does not support native file drops")
    }
    if native == host { return }
    Unbind()
    native = host
    bindings.Add(host, this)
  }
  internal func Unbind() {
    if let host = native { bindings.Remove(host) }
    native = nil
    offer = nil
    router.Cancel()
  }
  internal func Validate() -> router.Validate()

  internal func Receive(kind SDLEventType, data nint, x float32, y float32, modifiers KeyModifiers) {
    if kind == SDLEventType.DropBegin {
      let next = NativeDropOffer()
      offer = next
      LastError = nil
      router.Cancel()
      return
    }
    guard let active = offer else { return }
    if kind == SDLEventType.DropComplete {
      offer = nil
      if active.Started && !active.Rejected && active.Paths.Count > 0 {
        router.Complete(DragData(NativeFileDrop(active.Paths.ToArray(), false), DragEffect.Copy), active.X, active.Y, active.Modifiers)
      } else { router.Cancel() }
      return
    }
    if active.Rejected { return }
    if kind == SDLEventType.DropPosition {
      if !Single.IsFinite(x) || !Single.IsFinite(y) { Reject(active, "Native drop coordinates must be finite")
        return }
      active.X = x
      active.Y = y
      active.Modifiers = modifiers
      if !active.Started {
        active.Started = true
        router.Begin(preview, x, y, modifiers)
      } else { router.Move(x, y, modifiers) }
      return
    }
    if kind == SDLEventType.DropText {
      Reject(active, "Text offers are not supported by native file-drop ingress")
      return
    }
    if kind != SDLEventType.DropFile { return }
    try {
      let path = ReadPath(data)
      ClipboardTransfer.AddPath(active.Paths, path, ref active.Units)
    } catch (error ClipboardLimitException) {
      Reject(active, "Native file list exceeds the path-count or text budget")
    } catch (error System.IO.InvalidDataException) {
      Reject(active, "Native file paths must be absolute and contain no NUL")
    } catch (error DecoderFallbackException) {
      Reject(active, "Native file path is not valid UTF-8")
    } catch (error ArgumentException) {
      Reject(active, error.Message)
    }
  }
  private func Reject(active NativeDropOffer, error string) {
    active.Rejected = true
    active.Paths.Clear()
    LastError = error
    router.Cancel()
  }
  private func ReadPath(data nint) string {
    if data == nint(0) { throw System.IO.InvalidDataException("Missing native path") }
    var length = 0
    while length <= 131072 && Marshal.ReadByte(data, length) != 0 { length++ }
    if length > 131072 { throw ClipboardLimitException("Native path exceeds its UTF-8 limit") }
    let bytes = [length]uint8
    Marshal.Copy(data, bytes, 0, length)
    return utf8.GetString(bytes)
  }
}

internal unsafe partial class SdlHost {
  internal func TransferCapabilities() NativeTransferCapabilities {
    ThrowIfDisposed()
    let driver = SDL.GetCurrentVideoDriverS()
    return if driver == "wayland" || driver == "x11" || driver == "windows" || driver == "cocoa" {
      NativeTransferCapabilities.FileDrop | NativeTransferCapabilities.DropPreview
    } else { NativeTransferCapabilities.None }
  }
}
