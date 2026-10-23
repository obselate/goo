package Goo

import System
import System.Runtime.InteropServices

@StructLayout(LayoutKind.Sequential)
internal struct MacNativeDragOffer {
    internal var Writers nint
    internal var Service nint
}

@UnmanagedFunctionPointer(CallingConvention.Cdecl)
internal delegate MacNativeDragService(userData nint);

internal partial class NativeDragBinding {
    internal var MacRuntimeHeld bool
}

internal unsafe partial class SdlHost {
    shared {
        @ThreadStatic
        private var macTrackingTick bool
        private let macService MacNativeDragService = ServiceMacNativeDrag
        private let macServiceAddress nint = Marshal.GetFunctionPointerForDelegate(macService)
        private var macEventClass nint
        private var macModifierSelector nint
        @DllImport("/usr/lib/libobjc.A.dylib", EntryPoint: "objc_getClass")
        private func MacNativeClass(name string) nint;
        @DllImport("/usr/lib/libobjc.A.dylib", EntryPoint: "sel_registerName")
        private func MacNativeSelector(name string) nint;
        @DllImport("/usr/lib/libobjc.A.dylib", EntryPoint: "objc_msgSend")
        private func MacNativeFlags(receiver nint, selector nint) uint64;

        private func ServiceMacNativeDrag(userData nint) {
            if macTrackingTick || NativeDropState.CallbackDepth != 0 { return }
            macTrackingTick = true
            try {
                if let binding = GCHandle.FromIntPtr(userData).Target as NativeDragBinding? {
                    if binding.Finished { return }
                    try { Window.ServiceNativeTracking() }
                    catch (error Exception) {
                        binding.Host.nativeTransferFailure = error
                        binding.Host.CancelNativeDrag()
                    }
                }
            } catch (_ Exception) { }
            finally { macTrackingTick = false }
        }

        private func MacNativeDropModifiers() KeyModifiers {
            if macEventClass == nint(0) {
                macEventClass = MacNativeClass("NSEvent")
                macModifierSelector = MacNativeSelector("modifierFlags")
            }
            let flags = MacNativeFlags(macEventClass, macModifierSelector)
            return KeyModifiers{
                Shift: (flags & uint64(1 << 17)) != uint64(0),
                Ctrl: (flags & uint64(1 << 18)) != uint64(0),
                Alt: (flags & uint64(1 << 19)) != uint64(0),
                Super: (flags & uint64(1 << 20)) != uint64(0)}
        }
    }

    private func StartMacNativeDrag(binding NativeDragBinding) DataTransferStatus {
        let pool = ClipboardTransfer.objc_autoreleasePoolPush()
        try {
            SdlRuntime.Acquire()
            binding.MacRuntimeHeld = true
            let objects = ClipboardTransfer.MacCreateTransferObjects(binding.Data)
            var offer = MacNativeDragOffer{Writers: objects, Service: macServiceAddress}
            using let names = NativeMimeTable(binding.Types)
            binding.Started = true
            return DataTransferStatus(StartDataDrag(windowHandle, names.Pointer, uint32(binding.Types.Length),
                uint32(binding.Effects), nint(&offer), sendAddress, finishedAddress, GCHandle.ToIntPtr(binding.Handle)))
        } finally { ClipboardTransfer.objc_autoreleasePoolPop(pool) }
    }
}
