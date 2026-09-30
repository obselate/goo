package Goo

import System
import System.Runtime.ExceptionServices
import System.Runtime.InteropServices

@UnmanagedFunctionPointer(CallingConvention.Cdecl)
internal delegate NativeFileDragFinished(userData nint, accepted uint8);

internal class NativeFileDragBinding {
  internal let Host SdlHost
  internal let Completed Action[bool]
  internal var Handle GCHandle
  internal var Finished bool

  internal init(host SdlHost, completed Action[bool]) {
    Host = host
    Completed = completed
    Handle = GCHandle.Alloc(this)
  }

  internal func Finish(accepted bool) {
    if Finished { return }
    Finished = true
    if Host.nativeFileDrag == this { Host.nativeFileDrag = nil }
    if Handle.IsAllocated { Handle.Free() }
    try { Completed(accepted) }
    catch (error Exception) { Host.nativeFileDragFailure = error }
  }
}

internal unsafe partial class SdlHost {
  internal var nativeFileDrag NativeFileDragBinding?
  internal var nativeFileDragFailure Exception?

  shared {
    @DllImport("SDL3", EntryPoint: "Goo_StartFileDrag", CallingConvention: CallingConvention.Cdecl)
    private func StartFileDrag(window nint, uriList nint, completed nint, userData nint) uint8;
    @DllImport("SDL3", EntryPoint: "Goo_CancelFileDrag", CallingConvention: CallingConvention.Cdecl)
    private func CancelFileDrag(window nint);
    private let finishedCallback NativeFileDragFinished = FileDragFinished
    private let finishedAddress nint = Marshal.GetFunctionPointerForDelegate(finishedCallback)

    private func FileDragFinished(userData nint, accepted uint8) {
      try {
        let handle = GCHandle.FromIntPtr(userData)
        if let binding = handle.Target as NativeFileDragBinding? { binding.Finish(accepted != 0) }
      } catch (_ Exception) { }
    }
  }

  public func BeginNativeFileDrag(files NativeFileDrag, completed Action[bool]) bool {
    ThrowIfDisposed()
    if nativeFileDrag != nil || !IsWayland() { return false }
    let binding = NativeFileDragBinding(this, completed)
    nativeFileDrag = binding
    let uriList = Marshal.StringToCoTaskMemUTF8(files.UriList)
    try {
      if StartFileDrag(windowHandle, uriList, finishedAddress,
        GCHandle.ToIntPtr(binding.Handle)) != 0 { return true }
      nativeFileDrag = nil
      binding.Handle.Free()
      return false
    } catch (error Exception) {
      nativeFileDrag = nil
      if binding.Handle.IsAllocated { binding.Handle.Free() }
      throw error
    } finally { Marshal.FreeCoTaskMem(uriList) }
  }

  public func CancelNativeFileDrag() {
    if let binding = nativeFileDrag {
      CancelFileDrag(windowHandle)
      if nativeFileDrag == binding { binding.Finish(false) }
    }
  }

  private func ThrowNativeFileDragFailure() {
    if let error = nativeFileDragFailure {
      nativeFileDragFailure = nil
      ExceptionDispatchInfo.Capture(error).Throw()
    }
  }
}
