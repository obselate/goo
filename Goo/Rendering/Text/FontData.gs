package Goo

import System
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

  private init(path string) : base(nint(0), true) {
    using let file = FileStream(path, FileMode.Open, FileAccess.Read, FileShare.Read | FileShare.Delete)
    if file.Length == 0 || file.Length > VulkanTextFont.MaxFontBytes {
      throw InvalidDataException("Font file must contain between 1 byte and 64 MiB")
    }
    Length = int32(file.Length)
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
      throw error
    }
  }

  shared {
    internal func FromPath(path string) FontData -> FontData(path)
  }

  public override prop IsInvalid bool { get -> handle == nint(0) }
  internal func Matches(other FontData) bool {
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
