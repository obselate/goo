package Goo

import System
import System.IO
import System.Runtime.InteropServices
import System.Threading

@StructLayout(LayoutKind.Sequential)
internal struct TransferPollDescriptor {
  internal var Descriptor int32
  internal var Events int16
  internal var Returned int16
}

internal unsafe class WaylandTransferPipe {
  shared {
    @DllImport("libc", EntryPoint: "read", SetLastError: true)
    private func ReadNative(descriptor int32, bytes nint, length nuint) nint;
    @DllImport("libc", EntryPoint: "write", SetLastError: true)
    private func WriteNative(descriptor int32, bytes nint, length nuint) nint;
    @DllImport("libc", EntryPoint: "poll", SetLastError: true)
    private func Poll(descriptors nint, count nuint, timeout int32) int32;

    private func Wait(descriptor int32, events int16, cancellation CancellationToken) {
      var state = TransferPollDescriptor{ Descriptor: descriptor, Events: events }
      let result = Poll(nint(&state), nuint(1), 50)
      if result < 0 && Marshal.GetLastPInvokeError() != 4 { throw IOException("Native pipe wait failed") }
      cancellation.ThrowIfCancellationRequested()
    }

    internal func Read(descriptor int32, bytes nint, length int32, cancellation CancellationToken) int32 {
      while true {
        cancellation.ThrowIfCancellationRequested()
        let count = ReadNative(descriptor, bytes, nuint(length))
        if count >= nint(0) { return int32(count) }
        let error = Marshal.GetLastPInvokeError()
        if error == 4 { continue }
        if error != 11 { throw IOException("Native pipe read failed: " + error.ToString()) }
        Wait(descriptor, int16(1), cancellation)
      }
    }

    internal func Write(descriptor int32, bytes nint, length int32, cancellation CancellationToken) {
      var offset int32
      while offset < length {
        cancellation.ThrowIfCancellationRequested()
        let count = WriteNative(descriptor, bytes + nint(offset), nuint(length - offset))
        if count > nint(0) { offset += int32(count)
          continue }
        let error = Marshal.GetLastPInvokeError()
        if count == nint(0) { throw IOException("Native pipe write made no progress") }
        if error == 4 { continue }
        if error != 11 { throw IOException("Native pipe write failed: " + error.ToString()) }
        Wait(descriptor, int16(4), cancellation)
      }
    }
  }
}
