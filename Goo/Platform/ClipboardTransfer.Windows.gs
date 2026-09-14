package Goo

import System
import System.Collections.Generic
import System.IO
import System.Runtime.InteropServices

internal unsafe partial class ClipboardTransfer {
  shared {
    @DllImport("user32.dll", EntryPoint: "IsClipboardFormatAvailable", SetLastError: true)
    private func WinClipboardAvailable(format uint32) int32;
    @DllImport("user32.dll", EntryPoint: "OpenClipboard", SetLastError: true)
    private func WinOpenClipboard(owner nint) int32;
    @DllImport("user32.dll", EntryPoint: "CloseClipboard", SetLastError: true)
    private func WinCloseClipboard() int32;
    @DllImport("user32.dll", EntryPoint: "GetClipboardData", SetLastError: true)
    private func WinClipboardData(format uint32) nint;
    @DllImport("shell32.dll", EntryPoint: "DragQueryFileW", CharSet: CharSet.Unicode, SetLastError: true)
    private func WinDropFile(drop nint, index uint32, buffer nint, capacity uint32) uint32;
    @DllImport("user32.dll", EntryPoint: "RegisterClipboardFormatW", CharSet: CharSet.Unicode)
    private func WinRegisterClipboardFormat(name string) uint32;
    @DllImport("kernel32.dll", EntryPoint: "GlobalSize", SetLastError: true)
    private func WinGlobalSize(memory nint) nuint;
    @DllImport("kernel32.dll", EntryPoint: "GlobalLock", SetLastError: true)
    private func WinGlobalLock(memory nint) nint;
    @DllImport("kernel32.dll", EntryPoint: "GlobalUnlock")
    private func WinGlobalUnlock(memory nint) int32;

    private func WindowsHasFiles() bool -> WinClipboardAvailable(15u) != 0

    private func WindowsReadFiles() ClipboardFiles {
      if WinOpenClipboard(nint(0)) == 0 { throw IOException("OpenClipboard failed: " + Marshal.GetLastWin32Error().ToString()) }
      try {
        let drop = WinClipboardData(15u)
        if drop == nint(0) { throw IOException("CF_HDROP read failed: " + Marshal.GetLastWin32Error().ToString()) }
        let count = WinDropFile(drop, uint32.MaxValue, nint(0), 0u)
        if count > uint32(MaxPaths) { throw ClipboardLimitException("Clipboard exceeds 4096 file paths") }
        let paths = List[string](int32(count))
        var units = 0
        for i in 0 ... int32(count) {
          let length = WinDropFile(drop, uint32(i), nint(0), 0u)
          if length > 32768u || length > uint32(MaxPathUnits - units) { throw ClipboardLimitException("Clipboard paths exceed the text budget") }
          let buffer = Marshal.AllocHGlobal((int32(length) + 1) * 2)
          try {
            let written = WinDropFile(drop, uint32(i), buffer, length + 1u)
            if written != length { throw IOException("CF_HDROP path changed while reading") }
            AddPath(paths, Marshal.PtrToStringUni(buffer, int32(length)), ref units)
          } finally { Marshal.FreeHGlobal(buffer) }
        }
        return ClipboardFiles(if paths.Count == 0 { ClipboardReadStatus.Empty } else { ClipboardReadStatus.Success }, paths.ToArray())
      } finally { WinCloseClipboard() }
    }

    private func WindowsReadImageData(formatType string, limit int32) []uint8 {
      if WinOpenClipboard(nint(0)) == 0 { throw IOException("OpenClipboard failed: " + Marshal.GetLastWin32Error().ToString()) }
      try {
        let format = if formatType == "image/png" { WinRegisterClipboardFormat("PNG") }
        else if WinClipboardAvailable(17u) != 0 { 17u } else { 8u }
        let memory = WinClipboardData(format)
        if memory == nint(0) { throw IOException("Native image clipboard data is unavailable") }
        let size = WinGlobalSize(memory)
        let prefix = if formatType == "image/bmp" { 14 } else { 0 }
        if size > nuint(limit - prefix) { throw ClipboardLimitException("Clipboard image exceeds 64 MiB") }
        let native = WinGlobalLock(memory)
        if native == nint(0) { throw IOException("Native clipboard image could not be locked") }
        try {
          let bytes = [int32(size) + prefix]uint8
          Marshal.Copy(native, bytes, prefix, int32(size))
          if prefix == 0 { return bytes }
          if size < nuint(40) { throw InvalidDataException("Truncated native DIB") }
          let header = BitConverter.ToUInt32(bytes, 14)
          let bits = BitConverter.ToUInt16(bytes, 28)
          let compression = BitConverter.ToUInt32(bytes, 30)
          let used = BitConverter.ToUInt32(bytes, 46)
          let colors = if used != 0u { int64(used) } else if bits <= 8 { int64(1 << int32(bits)) } else { 0L }
          let masks = if header == 40u && compression == 3u { 12 } else if header == 40u && compression == 6u { 16 } else { 0 }
          let offset = 14 + int64(header) + colors * 4 + masks
          if header < 40u || offset > bytes.Length { throw InvalidDataException("Invalid native DIB palette") }
          bytes[0] = 66
          bytes[1] = 77
          BitConverter.GetBytes(uint32(bytes.Length)).CopyTo(bytes, 2)
          BitConverter.GetBytes(uint32(offset)).CopyTo(bytes, 10)
          return bytes
        } finally { WinGlobalUnlock(memory) }
      } finally { WinCloseClipboard() }
    }
  }
}
