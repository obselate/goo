package Goo

import System
import System.Collections.Generic
import System.IO
import System.Runtime.ExceptionServices
import System.Runtime.InteropServices
import System.Text
import System.Threading
import System.Threading.Tasks
import Microsoft.Win32.SafeHandles
import Hexa.NET.SDL3

@UnmanagedFunctionPointer(CallingConvention.Cdecl)
internal delegate NativeDragFinished(userData nint, status int32, effect uint32, sourceRemoval uint8);
@UnmanagedFunctionPointer(CallingConvention.Cdecl)
internal delegate NativeDragSend(userData nint, contentType nint, descriptor int32);

internal class NativeMimeTable : IDisposable {
  internal let Pointer nint
  private let names []nint

  internal init(types IReadOnlyList[string]) {
    names = [types.Count]nint
    Pointer = Marshal.AllocHGlobal(types.Count * nint.Size)
    try {
      for i in 0 ... types.Count {
        names[i] = Marshal.StringToCoTaskMemUTF8(types[i])
        Marshal.WriteIntPtr(Pointer, i * nint.Size, names[i])
      }
    } catch (error Exception) { Dispose()
      ExceptionDispatchInfo.Capture(error).Throw() }
  }

  public func Dispose() {
    for name in names { if name != nint(0) { Marshal.FreeCoTaskMem(name) } }
    Marshal.FreeHGlobal(Pointer)
  }
}

internal class NativeDragBinding {
  internal let Host SdlHost
  internal let Effects DragEffect
  internal let Completed Action[NativeTransferResult]
  internal let Representations List[TransferRepresentation]
  internal let Types []string
  internal var Handle GCHandle
  internal var Started bool
  internal var Finished bool
  private let cancellation CancellationTokenSource = CancellationTokenSource()
  private var failure string?

  internal init(host SdlHost, data TransferData, effects DragEffect, completed Action[NativeTransferResult]) {
    Host = host
    Effects = effects
    Completed = completed
    Representations = List[TransferRepresentation](data.Representations.Count + (data.Uris.Count > 0 ? 1 : 0))
    for item in data.Representations { Representations.Add(item) }
    if data.Uris.Count > 0 {
      Representations.Add(TransferRepresentation("text/uri-list", Encoding.UTF8.GetBytes(ClipboardTransfer.EncodeLocalUris(data.Uris))))
    }
    if Representations.Count == 0 { throw InvalidDataException("Native drag requires MIME data or URI references") }
    if Representations.Count > 128 { throw ClipboardLimitException("Native drag exceeds 128 MIME types") }
    Types = [Representations.Count]string
    for i in 0 ... Types.Length { Types[i] = Representations[i].ContentType }
    Handle = GCHandle.Alloc(this)
  }

  internal func Start() {
    if Finished { return }
    try {
      using let names = NativeMimeTable(Types)
      let status = Host.StartNativeDrag(names.Pointer, uint32(Types.Length), Effects, GCHandle.ToIntPtr(Handle))
      if status == DataTransferStatus.Success { Started = true }
      else { Finish(NativeTransferResult(status, error: SDL.GetErrorS() ?? "Native drag setup failed")) }
    } catch (error DllNotFoundException) { Finish(NativeTransferResult(DataTransferStatus.Unsupported, error: error.Message)) }
    catch (error EntryPointNotFoundException) { Finish(NativeTransferResult(DataTransferStatus.Unsupported, error: error.Message)) }
  }

  internal func Send(handle SafeFileHandle, contentType string) {
    let token = cancellation.Token
    Task.Run(() -> {
      using let owned = handle
      try {
        for item in Representations {
          if item.ContentType != contentType { continue }
          let pinned = GCHandle.Alloc(item.Data, GCHandleType.Pinned)
          try { WaylandTransferPipe.Write(int32(handle.DangerousGetHandle()), pinned.AddrOfPinnedObject(), item.Data.Length, token) }
          finally { pinned.Free() }
          return
        }
        Interlocked.CompareExchange(ref failure, "Native target requested an unoffered MIME type", nil)
      } catch (_ OperationCanceledException) { }
      catch (error IOException) { Interlocked.CompareExchange(ref failure, error.Message, nil) }
      catch (error ObjectDisposedException) { Interlocked.CompareExchange(ref failure, error.Message, nil) }
    })
  }

  internal func Finish(result NativeTransferResult, notify bool = true) {
    if Finished { return }
    Finished = true
    if Host.nativeDrag == this { Host.nativeDrag = nil }
    cancellation.Cancel()
    cancellation.Dispose()
    if Handle.IsAllocated { Handle.Free() }
    let error = Interlocked.CompareExchange(ref failure, nil, nil)
    let terminal = if result.Status == DataTransferStatus.Success && error != nil {
      NativeTransferResult(DataTransferStatus.Failed, error: error)
    } else { result }
    if !notify { return }
    try { Completed(terminal) }
    catch (exception Exception) { Host.nativeTransferFailure = exception }
  }
}

internal unsafe partial class SdlHost {
  internal var nativeDrag NativeDragBinding?
  internal var nativeTransferFailure Exception?
  internal var TransferPost ((Action) -> bool)?

  shared {
    @DllImport("SDL3", EntryPoint: "Goo_StartDataDrag", CallingConvention: CallingConvention.Cdecl)
    private func StartDataDrag(window nint, types nint, count uint32, effects uint32,
      nativeObject nint, send nint, completed nint, userData nint) int32;
    @DllImport("SDL3", EntryPoint: "Goo_CancelDataDrag", CallingConvention: CallingConvention.Cdecl)
    private func CancelDataDrag(window nint);
    private let finishedCallback NativeDragFinished = DataDragFinished
    private let finishedAddress nint = Marshal.GetFunctionPointerForDelegate(finishedCallback)
    private let sendCallback NativeDragSend = DataDragSend
    private let sendAddress nint = Marshal.GetFunctionPointerForDelegate(sendCallback)

    private func DataDragFinished(userData nint, status int32, effect uint32, sourceRemoval uint8) {
      try {
        let handle = GCHandle.FromIntPtr(userData)
        if let binding = handle.Target as NativeDragBinding? {
          let selected = DragEffect(effect & uint32(binding.Effects))
          let outcome = if status >= int32(DataTransferStatus.Success) && status <= int32(DataTransferStatus.Failed) { DataTransferStatus(status) } else { DataTransferStatus.Failed }
          let accepted = outcome == DataTransferStatus.Success && (selected == DragEffect.Copy || selected == DragEffect.Move)
          binding.Finish(NativeTransferResult(if accepted { DataTransferStatus.Success } else if outcome == DataTransferStatus.Success { DataTransferStatus.Failed } else { outcome },
            if accepted { selected } else { DragEffect.None }, accepted && selected == DragEffect.Move && sourceRemoval != 0,
            if !accepted && outcome != DataTransferStatus.Cancelled { "Native drag did not complete" } else { "" }))
        }
      } catch (_ Exception) { }
    }

    private func DataDragSend(userData nint, contentType nint, descriptor int32) {
      let owned = SafeFileHandle(nint(descriptor), true)
      try {
        let handle = GCHandle.FromIntPtr(userData)
        if let binding = handle.Target as NativeDragBinding? {
          binding.Send(owned, ClipboardTransfer.BoundedUtf8(contentType, 256))
          return
        }
      } catch (_ Exception) { }
      owned.Dispose()
    }
  }

  internal func StartNativeDrag(types nint, count uint32, effects DragEffect, userData nint) DataTransferStatus ->
    DataTransferStatus(StartDataDrag(windowHandle, types, count, uint32(effects), nint(0), sendAddress, finishedAddress, userData))

  public func BeginNativeDrag(data TransferData, effects DragEffect, completed Action[NativeTransferResult]) NativeTransferResult {
    ThrowIfDisposed()
    if nativeDrag != nil { return NativeTransferResult(DataTransferStatus.Failed, error: "A native drag is already active") }
    if (TransferCapabilities() & NativeTransferCapabilities.OutboundData) == NativeTransferCapabilities.None {
      return NativeTransferResult(DataTransferStatus.Unsupported, error: "This host does not support native MIME drags")
    }
    guard let post = TransferPost else { return NativeTransferResult(DataTransferStatus.Unsupported, error: "Native drag has no owner dispatcher") }
    try {
      let binding = NativeDragBinding(this, data, effects, completed)
      nativeDrag = binding
      if !post(binding.Start) {
        binding.Finish(NativeTransferResult(DataTransferStatus.Cancelled), false)
        return NativeTransferResult(DataTransferStatus.Cancelled)
      }
      return NativeTransferResult(DataTransferStatus.Success)
    } catch (error NativePathLimitException) { return NativeTransferResult(DataTransferStatus.TooLarge, error: error.Message) }
    catch (error ClipboardLimitException) { return NativeTransferResult(DataTransferStatus.TooLarge, error: error.Message) }
    catch (error NotSupportedException) { return NativeTransferResult(DataTransferStatus.Unsupported, error: error.Message) }
    catch (error IOException) { return NativeTransferResult(DataTransferStatus.Failed, error: error.Message) }
  }

  public func CancelNativeDrag() {
    if let binding = nativeDrag {
      if binding.Started { CancelDataDrag(windowHandle) }
      if nativeDrag == binding { binding.Finish(NativeTransferResult(DataTransferStatus.Cancelled)) }
    }
  }

  private func ThrowNativeTransferFailure() {
    if let error = nativeTransferFailure {
      nativeTransferFailure = nil
      ExceptionDispatchInfo.Capture(error).Throw()
    }
  }
}
