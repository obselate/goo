package Goo

import Microsoft.Win32.SafeHandles
import System
import System.Collections.Generic
import System.IO
import System.IO.MemoryMappedFiles
import System.Runtime.InteropServices

internal unsafe sealed class FontData : SafeHandle {
  private var mapping MemoryMappedFile?
  private var view MemoryMappedViewAccessor?
  private var viewRetained bool
  private var pin GCHandle
  internal let Length int32
  internal let Path string?

  internal init(bytes []uint8) : base(nint(0), true) {
    if bytes.Length == 0 || bytes.Length > VulkanTextFont.MaxFontBytes {
      throw ArgumentOutOfRangeException("bytes")
    }
    Length = bytes.Length
    let ownedBytes = bytes.AsSpan().ToArray()
    pin = GCHandle.Alloc(ownedBytes, GCHandleType.Pinned)
    SetHandle(pin.AddrOfPinnedObject())
  }

  private init(file FileStream, path string, length int32) : base(nint(0), true) {
    Length = length
    Path = path
    try {
      let mapped = MemoryMappedFile.CreateFromFile(file, nil, 0L, MemoryMappedFileAccess.Read,
        HandleInheritability.None, true)
      mapping = mapped
      let accessor = mapped.CreateViewAccessor(0L, int64(Length), MemoryMappedFileAccess.Read)
      view = accessor
      accessor.SafeMemoryMappedViewHandle.DangerousAddRef(ref viewRetained)
      SetHandle(accessor.SafeMemoryMappedViewHandle.DangerousGetHandle())
    } catch (error Exception) {
      ReleaseHandle()
      rethrow
    }
  }

  shared {
    private let gate object = Object()
    private let files Dictionary[FontFileIdentity, WeakReference[FontData]] =
      Dictionary[FontFileIdentity, WeakReference[FontData]]()

    internal func FromPath(path string) FontData {
      lock gate {
        let expected = FontFileIdentity.ReadPath(path)
        if let knownIdentity = expected {
          if files.TryGetValue(knownIdentity, out var known) && known.TryGetTarget(out var knownData)
            && !knownData.IsClosed { return knownData }
        }
        using let file = FileStream(path, FileMode.Open, FileAccess.Read, FileShare.Read | FileShare.Delete)
        let length = file.Length
        if length == 0 || length > VulkanTextFont.MaxFontBytes {
          throw InvalidDataException("Font file must contain between 1 byte and 64 MiB")
        }
        let identity = FontFileIdentity.Read(file.SafeFileHandle.DangerousGetHandle(), length)
        if files.TryGetValue(identity, out var weak) && weak.TryGetTarget(out var current)
          && !current.IsClosed { return current }
        for entry in files {
          if !entry.Value.TryGetTarget(out var live) || live.IsClosed { files.Remove(entry.Key) }
        }
        let created = FontData(file, path, int32(length))
        files[identity] = WeakReference[FontData](created)
        return created
      }
    }
  }

  public override prop IsInvalid bool { get -> handle == nint(0) }
  internal func Matches(other FontData) bool {
    if Object.ReferenceEquals(this, other) { return true }
    let result = ReadOnlySpan[uint8](*uint8(handle), Length)
      .SequenceEqual(ReadOnlySpan[uint8](*uint8(other.handle), other.Length))
    GC.KeepAlive(this)
    GC.KeepAlive(other)
    return result
  }

  protected override func ReleaseHandle() bool {
    if let accessor = view {
      if viewRetained {
        accessor.SafeMemoryMappedViewHandle.DangerousRelease()
        viewRetained = false
      }
      accessor.Dispose()
    }
    mapping?.Dispose()
    if pin.IsAllocated { pin.Free() }
    return true
  }
}

private unsafe data struct FontFileIdentity(Device uint64, FileIdLow uint64, FileIdHigh uint64,
  Length int64) : IEquatable[FontFileIdentity] {
  shared {
    internal func ReadPath(path string) FontFileIdentity? {
      if OperatingSystem.IsWindows() {
        using let file = OpenMetadata(path, 0u, 7u, nint(0), 3u, 0u, nint(0))
        if file.IsInvalid { return nil }
        let info * uint64 = stackalloc[3]uint64
        if FileInformation(file.DangerousGetHandle(), 1, nint(info), 24u) == 0 { return nil }
        return Read(file.DangerousGetHandle(), int64(info[1]))
      }
      let status * uint64 = stackalloc[32]uint64
      let mac = OperatingSystem.IsMacOS()
      let result = if mac {
        if RuntimeInformation.ProcessArchitecture == Architecture.X64 {
          MacPathStat64(path, nint(status))
        } else { MacPathStat(path, nint(status)) }
      } else { PathStat(path, nint(status)) }
      if result != 0 { return nil }
      let device = if mac { status[0] & 0xffffffffuL } else { status[0] }
      let length = int64(status[if mac { 12 } else { 6 }])
      return FontFileIdentity(device, status[1], 0uL, length)
    }

    internal func Read(handle nint, length int64) FontFileIdentity {
      let status * uint64 = stackalloc[32]uint64
      if OperatingSystem.IsWindows() {
        if FileInformation(handle, 18, nint(status), 24u) != 0 {
          return FontFileIdentity(status[0], status[1], status[2], length)
        }
        if LegacyFileInformation(handle, nint(status)) == 0 {
          throw IOException("Cannot identify font file", Marshal.GetLastPInvokeError())
        }
        let words = *uint32(status)
        return FontFileIdentity(uint64(words[7]), uint64(words[11]) << 32 | uint64(words[12]), 0uL, length)
      }
      let mac = OperatingSystem.IsMacOS()
      let result = if mac {
        if RuntimeInformation.ProcessArchitecture == Architecture.X64 {
          MacStat64(int32(handle), nint(status))
        } else { MacStat(int32(handle), nint(status)) }
      } else { Stat(int32(handle), nint(status)) }
      if result != 0 { throw IOException("Cannot identify font file", Marshal.GetLastPInvokeError()) }
      let device = if mac { status[0] & 0xffffffffuL } else { status[0] }
      return FontFileIdentity(device, status[1], 0uL, length)
    }

    @DllImport("libc", EntryPoint: "stat", CharSet: CharSet.Ansi)
    private func PathStat(path string, status nint) int32;
    @DllImport("/usr/lib/libSystem.B.dylib", EntryPoint: "stat", CharSet: CharSet.Ansi)
    private func MacPathStat(path string, status nint) int32;
    @DllImport("/usr/lib/libSystem.B.dylib", EntryPoint: `stat$INODE64`, CharSet: CharSet.Ansi)
    private func MacPathStat64(path string, status nint) int32;
    @DllImport("libc", EntryPoint: "fstat", SetLastError: true)
    private func Stat(descriptor int32, status nint) int32;
    @DllImport("/usr/lib/libSystem.B.dylib", EntryPoint: "fstat", SetLastError: true)
    private func MacStat(descriptor int32, status nint) int32;
    @DllImport("/usr/lib/libSystem.B.dylib", EntryPoint: `fstat$INODE64`, SetLastError: true)
    private func MacStat64(descriptor int32, status nint) int32;
    @DllImport("kernel32", EntryPoint: "CreateFileW", CharSet: CharSet.Unicode, SetLastError: true)
    private func OpenMetadata(path string, access uint32, share uint32, attributes nint,
      disposition uint32, flags uint32, template nint) SafeFileHandle;
    @DllImport("kernel32", EntryPoint: "GetFileInformationByHandleEx", SetLastError: true)
    private func FileInformation(handle nint, kind int32, data nint, length uint32) int32;
    @DllImport("kernel32", EntryPoint: "GetFileInformationByHandle", SetLastError: true)
    private func LegacyFileInformation(handle nint, data nint) int32;
  }
}
