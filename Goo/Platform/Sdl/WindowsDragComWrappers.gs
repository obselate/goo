package Goo

import System
import System.Collections
import System.Runtime.CompilerServices
import System.Runtime.InteropServices

@StructLayout(LayoutKind.Sequential)
internal struct WindowsDragPoint {
  internal var X int32
  internal var Y int32
}

internal unsafe class WindowsDragComWrappers : ComWrappers {
  shared {
    internal let TargetId Guid = Guid("00000122-0000-0000-c000-000000000046")
    internal let SourceId Guid = Guid("00000121-0000-0000-c000-000000000046")
    private let instance WindowsDragComWrappers = WindowsDragComWrappers()
    private let targetEntry nint = DefineTarget()
    private let sourceEntry nint = DefineSource()
    private const UnexpectedFailure int32 = int32(0x80004005u)

    @DllImport("ole32.dll", EntryPoint: "RegisterDragDrop")
    internal func Register(window nint, target nint) int32;
    @DllImport("ole32.dll", EntryPoint: "RevokeDragDrop")
    internal func Revoke(window nint) int32;
    @DllImport("ole32.dll", EntryPoint: "DoDragDrop")
    internal func Start(data nint, source nint, effects uint32, out selected uint32) int32;
    @DllImport("user32.dll", EntryPoint: "ScreenToClient")
    internal func ScreenToClient(window nint, ref point WindowsDragPoint) int32;
    @DllImport("user32.dll", EntryPoint: "GetAsyncKeyState")
    internal func KeyState(key int32) int16;

    internal func Create(value object, id Guid) nint {
      let unknown = instance.GetOrCreateComInterfaceForObject(value, CreateComInterfaceFlags.None)
      try {
        var requested = id
        var result nint
        let status = Marshal.QueryInterface(unknown, ref requested, out result)
        if status < 0 { throw WindowsTransferException("IUnknown.QueryInterface", status) }
        return result
      } finally { ClipboardTransfer.WindowsReleaseObject(unknown) }
    }

    private func DefineTarget() nint {
      let methods Span[nint] = stackalloc [4]nint
      methods[0] = nint(&DropEnter)
      methods[1] = nint(&DropOver)
      methods[2] = nint(&DropLeave)
      methods[3] = nint(&Drop)
      return DefineEntry(TargetId, methods)
    }

    private func DefineSource() nint {
      let methods Span[nint] = stackalloc [2]nint
      methods[0] = nint(&ContinueDrag)
      methods[1] = nint(&DefaultCursor)
      return DefineEntry(SourceId, methods)
    }

    private func DefineEntry(id Guid, methods ReadOnlySpan[nint]) nint {
      var query nint
      var addRef nint
      var release nint
      GetIUnknownImpl(out query, out addRef, out release)
      let table = RuntimeHelpers.AllocateTypeAssociatedMemory(typeof(WindowsDragComWrappers), (3 + methods.Length) * nint.Size)
      Marshal.WriteIntPtr(table, query)
      Marshal.WriteIntPtr(table, nint.Size, addRef)
      Marshal.WriteIntPtr(table, 2 * nint.Size, release)
      for i in 0 ... methods.Length { Marshal.WriteIntPtr(table, (i + 3) * nint.Size, methods[i]) }
      let entry = RuntimeHelpers.AllocateTypeAssociatedMemory(typeof(WindowsDragComWrappers), Marshal.SizeOf[ComWrappers.ComInterfaceEntry]())
      Marshal.StructureToPtr[ComWrappers.ComInterfaceEntry](ComWrappers.ComInterfaceEntry{ IID: id, Vtable: table }, entry, false)
      return entry
    }

    @UnmanagedCallersOnly(CallConvs: []Type{typeof(CallConvStdcall)})
    private func DropEnter(self nint, data nint, keys uint32, point WindowsDragPoint, effect nint) int32 {
      var target WindowsDropTarget?
      try {
        let current = ComWrappers.ComInterfaceDispatch.GetInstance[WindowsDropTarget](cast[*ComWrappers.ComInterfaceDispatch](self))
        target = current
        return current.Enter(data, keys, point, effect)
      } catch (error Exception) { return TargetFailure(target, effect, error) }
    }

    @UnmanagedCallersOnly(CallConvs: []Type{typeof(CallConvStdcall)})
    private func DropOver(self nint, keys uint32, point WindowsDragPoint, effect nint) int32 {
      var target WindowsDropTarget?
      try {
        let current = ComWrappers.ComInterfaceDispatch.GetInstance[WindowsDropTarget](cast[*ComWrappers.ComInterfaceDispatch](self))
        target = current
        return current.Over(keys, point, effect)
      } catch (error Exception) { return TargetFailure(target, effect, error) }
    }

    @UnmanagedCallersOnly(CallConvs: []Type{typeof(CallConvStdcall)})
    private func DropLeave(self nint) int32 {
      var target WindowsDropTarget?
      try {
        let current = ComWrappers.ComInterfaceDispatch.GetInstance[WindowsDropTarget](cast[*ComWrappers.ComInterfaceDispatch](self))
        target = current
        return current.Leave()
      } catch (error Exception) { return TargetFailure(target, nint(0), error) }
    }

    @UnmanagedCallersOnly(CallConvs: []Type{typeof(CallConvStdcall)})
    private func Drop(self nint, data nint, keys uint32, point WindowsDragPoint, effect nint) int32 {
      var target WindowsDropTarget?
      try {
        let current = ComWrappers.ComInterfaceDispatch.GetInstance[WindowsDropTarget](cast[*ComWrappers.ComInterfaceDispatch](self))
        target = current
        return current.Drop(data, keys, point, effect)
      } catch (error Exception) { return TargetFailure(target, effect, error) }
    }

    private func TargetFailure(target WindowsDropTarget?, effect nint, error Exception) int32 {
      target?.Fail(error)
      if effect != nint(0) { Marshal.WriteInt32(effect, 0) }
      return UnexpectedFailure
    }

    @UnmanagedCallersOnly(CallConvs: []Type{typeof(CallConvStdcall)})
    private func ContinueDrag(self nint, escape int32, keys uint32) int32 {
      try {
        return ComWrappers.ComInterfaceDispatch.GetInstance[WindowsDragSource](cast[*ComWrappers.ComInterfaceDispatch](self)).Continue(escape != 0, keys)
      } catch (_ Exception) { return UnexpectedFailure }
    }

    @UnmanagedCallersOnly(CallConvs: []Type{typeof(CallConvStdcall)})
    private func DefaultCursor(self nint, effect uint32) int32 -> int32(0x00040102u)
  }

  protected override func ComputeVtables(value object, flags CreateComInterfaceFlags, out count int32) *ComWrappers.ComInterfaceEntry {
    count = 1
    if value is WindowsDropTarget { return cast[*ComWrappers.ComInterfaceEntry](targetEntry) }
    if value is WindowsDragSource { return cast[*ComWrappers.ComInterfaceEntry](sourceEntry) }
    throw NotSupportedException("Only Goo Windows drop source and target objects can be projected to COM")
  }

  protected override func CreateObject(value nint, flags CreateObjectFlags) object? {
    throw NotSupportedException("This adapter does not create native COM wrappers")
  }

  protected override func ReleaseObjects(values IEnumerable) {
    throw NotSupportedException("This adapter does not use reference-tracker wrappers")
  }
}

internal class WindowsDragSource {
  private let binding NativeDragBinding
  internal var Cancelled bool

  internal init(binding NativeDragBinding) {
    this.binding = binding
  }

  internal func Continue(escape bool, keys uint32) int32 {
    Console.WriteLine("query " + Environment.TickCount64.ToString() + " " + Cancelled.ToString() + " " + binding.Host.IsClosing.ToString() + " " + keys.ToString())
    if escape || Cancelled || binding.Host.IsClosing { return int32(0x00040101u) }
    return if (keys & 1u) == 0u { int32(0x00040100u) } else { 0 }
  }
}
