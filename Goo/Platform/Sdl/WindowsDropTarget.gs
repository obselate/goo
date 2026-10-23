package Goo

import System
import System.Runtime.InteropServices

internal unsafe class WindowsDropTarget : IDisposable {
  private let host SdlHost
  private let window nint
  private var userData nint
  private var pointer nint
  private var initialized bool
  private var registered bool
  private var closed bool
  private var dataObject nint
  private var token uint64
  private var sourceEffects uint32
  private var queryEffects uint32
  private var dropping bool
  private var finished bool
  private var result uint32
  internal var Modifiers KeyModifiers

  internal init(host SdlHost, window nint, userData nint) {
    this.host = host
    this.window = window
    this.userData = userData
    let apartment = ClipboardTransfer.WindowsOleInitialize(nint(0))
    if apartment < 0 { throw WindowsTransferException("OleInitialize", apartment) }
    initialized = true
    try {
      pointer = WindowsDragComWrappers.Create(this, WindowsDragComWrappers.TargetId)
      let revoke = WindowsDragComWrappers.Revoke(window)
      if revoke < 0 && revoke != int32(0x80040100u) { throw WindowsTransferException("RevokeDragDrop", revoke) }
      let status = WindowsDragComWrappers.Register(window, pointer)
      if status < 0 { throw WindowsTransferException("RegisterDragDrop", status) }
      registered = true
    } catch (_ Exception) { Dispose()
      rethrow }
  }

  internal func Configure(userData nint) {
    this.userData = userData
  }

  internal func Enter(data nint, keys uint32, point WindowsDragPoint, effect nint) int32 {
    if effect == nint(0) { return int32(0x80004003u) }
    if closed { Marshal.WriteInt32(effect, 0)
      return 0 }
    if data == nint(0) { return int32(0x80070057u) }
    OwnData(data)
    token++
    sourceEffects = uint32(Marshal.ReadInt32(effect)) & 3u
    queryEffects = 0u
    Marshal.WriteInt32(effect, int32(Query(0, keys, point)))
    return 0
  }

  internal func Over(keys uint32, point WindowsDragPoint, effect nint) int32 {
    if effect == nint(0) { return int32(0x80004003u) }
    Marshal.WriteInt32(effect, int32(Query(1, keys, point)))
    return 0
  }

  internal func Leave() int32 {
    if !closed && dataObject != nint(0) { Notify(2, 0.0F, 0.0F, 0u) }
    OwnData(nint(0))
    return 0
  }

  internal func Drop(data nint, keys uint32, point WindowsDragPoint, effect nint) int32 {
    if effect == nint(0) { return int32(0x80004003u) }
    if closed || data == nint(0) { Marshal.WriteInt32(effect, 0)
      return 0 }
    if dataObject != data { OwnData(data) }
    result = 0u
    finished = false
    dropping = true
    try {
      Query(3, keys, point)
      Marshal.WriteInt32(effect, int32(result))
      return 0
    } finally { dropping = false
      OwnData(nint(0)) }
  }

  private func Query(kind int32, keys uint32, point WindowsDragPoint) uint32 {
    if closed || userData == nint(0) || dataObject == nint(0) { return 0u }
    var client = point
    if WindowsDragComWrappers.ScreenToClient(window, ref client) == 0 { return 0u }
    Modifiers = KeyModifiers{
      Ctrl: (keys & 8u) != 0u,
      Shift: (keys & 4u) != 0u,
      Alt: WindowsDragComWrappers.KeyState(18) < int16(0),
      Super: WindowsDragComWrappers.KeyState(91) < int16(0) || WindowsDragComWrappers.KeyState(92) < int16(0)
    }
    var allowed = sourceEffects
    if Modifiers.Ctrl && Modifiers.Shift { allowed = 0u }
    else if Modifiers.Ctrl { allowed &= uint32(DragEffect.Copy) }
    else if Modifiers.Shift { allowed &= uint32(DragEffect.Move) }
    if allowed != queryEffects { queryEffects = allowed
      token++ }
    if allowed == 0u { Notify(if kind == 3 { 4 } else { 2 }, float32(client.X), float32(client.Y), 0u)
      return 0u }
    let current = token
    let selected = Notify(kind, float32(client.X), float32(client.Y), allowed) & allowed
    if closed || current != token || dataObject == nint(0) { return 0u }
    return if selected == uint32(DragEffect.Copy) || selected == uint32(DragEffect.Move) { selected } else { 0u }
  }

  private func Notify(kind int32, x float32, y float32, effects uint32) uint32 ->
    NativeDropState.ReceiveDataDrop(userData, kind, x, y, nint(0), 0u, effects, token, dataObject)

  internal func Commit(current uint64, effect DragEffect) {
    if closed || !dropping || finished || current != token { return }
    let selected = uint32(effect) & queryEffects
    result = if selected == uint32(DragEffect.Copy) || selected == uint32(DragEffect.Move) { selected } else { 0u }
    finished = true
  }

  internal func Fail(error Exception) {
    host.nativeTransferFailure ??= error
    OwnData(nint(0))
  }

  private func OwnData(value nint) {
    let previous = dataObject
    dataObject = nint(0)
    ClipboardTransfer.WindowsReleaseObject(previous)
    if value == nint(0) { return }
    let addRef = cast[unmanaged[Stdcall](nint) -> uint32](Marshal.ReadIntPtr(Marshal.ReadIntPtr(value), nint.Size))
    addRef(value)
    dataObject = value
  }

  public func Dispose() {
    if closed { return }
    closed = true
    userData = nint(0)
    OwnData(nint(0))
    if registered { WindowsDragComWrappers.Revoke(window)
      registered = false }
    ClipboardTransfer.WindowsReleaseObject(pointer)
    pointer = nint(0)
    if initialized { ClipboardTransfer.WindowsOleUninitialize()
      initialized = false }
  }
}
