package Goo

import System
import System.Runtime.InteropServices
import System.Threading

@StructLayout(LayoutKind.Sequential)
internal struct WindowsCompositionSwapchainDescription {
  var Width uint32
  var Height uint32
  var Format int32
  var Stereo int32
  var SampleCount uint32
  var SampleQuality uint32
  var Usage uint32
  var BufferCount uint32
  var Scaling int32
  var SwapEffect int32
  var AlphaMode int32
  var Flags uint32
}

@StructLayout(LayoutKind.Sequential)
internal struct WindowsCompositionTextureDescription {
  var Width uint32
  var Height uint32
  var MipLevels uint32
  var ArraySize uint32
  var Format int32
  var SampleCount uint32
  var SampleQuality uint32
  var Usage int32
  var BindFlags uint32
  var CpuAccessFlags uint32
  var MiscFlags uint32
}

internal unsafe sealed class WindowsCompositionDevice {
  internal var Device nint
  internal var Context nint
  internal var Factory nint
  internal prop AdapterMatched bool { get; private set }
  private var composition nint
  private var target nint
  private var visual nint
  private var references int32 = 1

  internal init(hwnd nint, luid uint64?) {
    Initialize(hwnd, luid)
  }

  private func Initialize(hwnd nint, luid uint64?) {
    var adapter nint
    var dxgi nint
    try {
      if let identifier = luid {
        var factoryId = Guid("50c83a1c-e072-4c48-87b0-3630fa36a6d0")
        Check(CreateDXGIFactory1(nint(&factoryId), out var factory), "CreateDXGIFactory1")
        Factory = factory
        let enumerate = cast[unmanaged[Stdcall](nint, uint32, *nint) -> int32](Method(Factory, 12))
        let description = stackalloc[312]uint8
        for index in 0 ... 64 {
          var candidate nint
          let result = enumerate(Factory, uint32(index), &candidate)
          if result == -2005270526 { break }
          Check(result, "EnumAdapters1")
          let describe = cast[unmanaged[Stdcall](nint, *uint8) -> int32](Method(candidate, 10))
          fixed bytes *uint8 = description {
            if describe(candidate, bytes) >= 0 && uint64(Marshal.ReadInt64(nint(bytes), 296)) == identifier {
              adapter = candidate
              break
            }
          }
          Release(candidate)
        }
      }
      AdapterMatched = adapter != nint(0)
      var created = D3D11CreateDevice(adapter, if AdapterMatched { 0 } else { 1 }, nint(0), 0x20u, nint(0), 0u, 7u,
        out Device, out var selectedLevel, out Context)
      if created < 0 && !AdapterMatched {
        created = D3D11CreateDevice(nint(0), 5, nint(0), 0x20u, nint(0), 0u, 7u,
          out Device, out selectedLevel, out Context)
      }
      Check(created, "D3D11CreateDevice")
      dxgi = Query(Device, "54ec77fa-1377-44e6-8c32-88fd5f44c84c")
      if !AdapterMatched {
        let getAdapter = cast[unmanaged[Stdcall](nint, *nint) -> int32](Method(dxgi, 7))
        Check(getAdapter(dxgi, &adapter), "GetAdapter")
        var factoryId = Guid("50c83a1c-e072-4c48-87b0-3630fa36a6d0")
        let getParent = cast[unmanaged[Stdcall](nint, *Guid, *nint) -> int32](Method(adapter, 6))
        var factory nint
        Check(getParent(adapter, &factoryId, &factory), "GetParent")
        Release(Factory)
        Factory = factory
      }
      var identifier = Guid("c37ea93a-e7aa-450d-b16f-9746cb0407f3")
      Check(DCompositionCreateDevice(dxgi, nint(&identifier), out var compositionDevice), "DCompositionCreateDevice")
      composition = compositionDevice
      let createTarget = cast[unmanaged[Stdcall](nint, nint, int32, *nint) -> int32](Method(composition, 6))
      Check(createTarget(composition, hwnd, 0, &target), "CreateTargetForHwnd(bottom)")
      let createVisual = cast[unmanaged[Stdcall](nint, *nint) -> int32](Method(composition, 7))
      Check(createVisual(composition, &visual), "CreateVisual")
      let setRoot = cast[unmanaged[Stdcall](nint, nint) -> int32](Method(target, 3))
      Check(setRoot(target, visual), "SetRoot")
    } catch {
      ReleaseReference()
      rethrow
    } finally {
      Release(dxgi)
      Release(adapter)
    }
  }

  internal func Retain() WindowsCompositionDevice {
    Interlocked.Increment(ref references)
    return this
  }

  internal func Commit(swapchain nint) int32 {
    if swapchain != nint(0) {
      let setContent = cast[unmanaged[Stdcall](nint, nint) -> int32](Method(visual, 15))
      let result = setContent(visual, swapchain)
      if result < 0 { return result }
    }
    let commit = cast[unmanaged[Stdcall](nint) -> int32](Method(composition, 3))
    return commit(composition)
  }

  internal func ReleaseReference() {
    if Interlocked.Decrement(ref references) != 0 { return }
    Release(visual)
    Release(target)
    Release(composition)
    Release(Context)
    Release(Device)
    Release(Factory)
  }

  shared {
    internal func Method(instance nint, index int32) nint
    -> Marshal.ReadIntPtr(Marshal.ReadIntPtr(instance), index * nint.Size)

    internal func Check(result int32, operation string) {
      if result < 0 { throw COMException(operation + " failed: 0x" + result.ToString("x8"), result) }
    }

    internal func Query(instance nint, name string) nint {
      var identifier = Guid(name)
      var result nint
      let query = cast[unmanaged[Stdcall](nint, *Guid, *nint) -> int32](Method(instance, 0))
      Check(query(instance, &identifier, &result), "QueryInterface")
      return result
    }

    internal func Release(instance nint) {
      if instance == nint(0) { return }
      let release = cast[unmanaged[Stdcall](nint) -> uint32](Method(instance, 2))
      release(instance)
    }

    @DllImport("dxgi.dll")
    private func CreateDXGIFactory1(identifier nint, out factory nint) int32;
    @DllImport("d3d11.dll")
    private func D3D11CreateDevice(adapter nint, driverType int32, software nint,
      flags uint32, levels nint, levelCount uint32, sdkVersion uint32,
      out device nint, out selectedLevel int32, out context nint) int32;
    @DllImport("dcomp.dll")
    private func DCompositionCreateDevice(device nint, identifier nint, out composition nint) int32;
  }
}
