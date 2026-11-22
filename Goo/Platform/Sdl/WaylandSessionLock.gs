package Goo

import System
import System.Collections.Generic
import System.Runtime.InteropServices

@UnmanagedFunctionPointer(CallingConvention.Cdecl)
internal delegate WaylandLockEvent(data nint, proxy nint);

@StructLayout(LayoutKind.Sequential)
internal struct WaylandLockArguments {
    internal var First nint
    internal var Second nint
    internal var Third nint
    internal var Fourth nint
}

internal unsafe sealed class WaylandSessionLock : IDisposable {
    private let display nint
    private let allocations List[nint] = List[nint]()
    private let onGlobal BackdropWaylandGlobal
    private let onRemove BackdropWaylandRemove = (_, _, _) -> {}
    private let onLocked WaylandLockEvent
    private let onFinished WaylandLockEvent
    private let onSync LayerWaylandFrame
    private var library nint
    private var queue nint
    private var registry nint
    private var manager nint
    private var managerName uint32
    private var session nint
    private var sync nint
    private var managerType nint
    private var sessionType nint
    private var surfaceType nint

    internal prop Locked bool { get; private set; }
    internal prop Finished bool { get; private set; }
    internal prop Synced bool { get; private set; }

    internal init(display nint) {
        if display == nint(0) { throw InvalidOperationException("SDL did not expose its Wayland connection") }
        this.display = display
        onGlobal = Global
        onLocked = (_, _) -> { Locked = true }
        onFinished = (_, _) -> { Finished = true }
        onSync = (_, _, _) -> { Synced = true }
        try {
            library = NativeLibrary.Load("libwayland-client.so.0")
            queue = RequireProxy(WaylandBackdrop.wl_display_create_queue(display))
            CreateInterfaces()
            registry = DisplayRequest(1u, "wl_registry_interface")
            AddListener(registry, []nint{Marshal.GetFunctionPointerForDelegate(onGlobal),
                Marshal.GetFunctionPointerForDelegate(onRemove)})
            if WaylandBackdrop.wl_display_roundtrip_queue(display, queue) < 0 {
                throw InvalidOperationException("Cannot read the Wayland session lock registry")
            }
            if managerName == 0u {
                throw NotSupportedException("The Wayland compositor does not advertise ext_session_lock_manager_v1")
            }
            var arguments = WaylandLockArguments{
                First: nint(managerName), Second: Marshal.PtrToStructure[BackdropWaylandInterface](managerType).Name,
                Third: nint(1),
            }
            manager = RequireProxy(MarshalConstructor(registry, 0u, ref arguments, managerType, 1u))
        } catch (_ Exception) {
            Dispose()
            rethrow
        }
    }

    internal func Start() {
        var argument = nint(0)
        session = RequireProxy(MarshalConstructor(manager, 1u, ref argument, sessionType, 1u))
        AddListener(session, []nint{Marshal.GetFunctionPointerForDelegate(onLocked),
            Marshal.GetFunctionPointerForDelegate(onFinished)})
        Flush()
    }

    internal func CreateSurface(connection nint, surface nint, output nint) nint {
        if connection != display || surface == nint(0) || output == nint(0) || session == nint(0) {
            throw InvalidOperationException("The session lock surface requires a roleless surface and output on its Wayland connection")
        }
        var arguments = WaylandLockArguments{Second: surface, Third: output}
        return RequireProxy(MarshalConstructor(session, 1u, ref arguments, surfaceType, 1u))
    }

    internal func Pump() {
        let dispatched = WaylandBackdrop.wl_display_dispatch_queue_pending(display, queue)
        if dispatched < 0 {
            throw InvalidOperationException("The Wayland session lock connection was lost")
        }
        if dispatched > 0 { SdlRuntime.Wake() }
    }

    internal func Reject() {
        DestroyRequest(session, 0u)
        session = nint(0)
        Flush()
    }

    internal func Unlock() {
        DestroyRequest(session, 2u)
        session = nint(0)
    }

    internal func BeginSync() {
        sync = DisplayRequest(0u, "wl_callback_interface")
        AddListener(sync, []nint{Marshal.GetFunctionPointerForDelegate(onSync)})
        Flush()
    }

    internal func Flush() { WaylandBackdrop.wl_display_flush(display) }

    public func Dispose() {
        if library == nint(0) { return }
        if sync != nint(0) { WaylandBackdrop.wl_proxy_destroy(sync) }
        if session != nint(0) { WaylandBackdrop.wl_proxy_destroy(session) }
        if manager != nint(0) { DestroyRequest(manager, 0u) }
        if registry != nint(0) { WaylandBackdrop.wl_proxy_destroy(registry) }
        if queue != nint(0) { WaylandBackdrop.wl_event_queue_destroy(queue) }
        Flush()
        for allocation in allocations { Marshal.FreeHGlobal(allocation) }
        NativeLibrary.Free(library)
        library = nint(0)
    }

    private func Global(data nint, proxy nint, name uint32, interfaceName nint, version uint32) {
        if version >= 1u && Marshal.PtrToStringUTF8(interfaceName) == "ext_session_lock_manager_v1" {
            managerName = name
        }
    }

    private func DisplayRequest(opcode uint32, interfaceName string) nint {
        let wrapper = RequireProxy(WaylandBackdrop.wl_proxy_create_wrapper(display))
        try {
            WaylandBackdrop.wl_proxy_set_queue(wrapper, queue)
            var argument = nint(0)
            return RequireProxy(MarshalConstructor(
                wrapper, opcode, ref argument, NativeLibrary.GetExport(library, interfaceName), 1u))
        } finally { WaylandBackdrop.wl_proxy_wrapper_destroy(wrapper) }
    }

    private func AddListener(proxy nint, callbacks []nint) {
        let listener = Allocate(callbacks.Length * IntPtr.Size)
        for index in 0 ... callbacks.Length { Marshal.WriteIntPtr(listener, index * IntPtr.Size, callbacks[index]) }
        if WaylandBackdrop.wl_proxy_add_listener(proxy, listener, nint(0)) != 0 {
            throw InvalidOperationException("Cannot listen to Wayland session lock events")
        }
    }

    private func CreateInterfaces() {
        let interfaceSize = Marshal.SizeOf[BackdropWaylandInterface]()
        managerType = Allocate(interfaceSize)
        sessionType = Allocate(interfaceSize)
        surfaceType = Allocate(interfaceSize)
        let lockTypes = Allocate(IntPtr.Size)
        Marshal.WriteIntPtr(lockTypes, sessionType)
        let surfaceTypes = Allocate(3 * IntPtr.Size)
        Marshal.WriteIntPtr(surfaceTypes, surfaceType)
        Marshal.WriteIntPtr(surfaceTypes, IntPtr.Size, NativeLibrary.GetExport(library, "wl_surface_interface"))
        Marshal.WriteIntPtr(surfaceTypes, 2 * IntPtr.Size, NativeLibrary.GetExport(library, "wl_output_interface"))
        WriteInterface(managerType, "ext_session_lock_manager_v1", [](string, string, nint){
            ("destroy", "", nint(0)), ("lock", "n", lockTypes)}, [](string, string, nint){})
        WriteInterface(sessionType, "ext_session_lock_v1", [](string, string, nint){
            ("destroy", "", nint(0)), ("get_lock_surface", "noo", surfaceTypes), ("unlock_and_destroy", "", nint(0))},
            [](string, string, nint){("locked", "", nint(0)), ("finished", "", nint(0))})
        WriteInterface(surfaceType, "ext_session_lock_surface_v1", [](string, string, nint){
            ("destroy", "", nint(0)), ("ack_configure", "u", nint(0))}, [](string, string, nint){("configure", "uuu", nint(0))})
    }

    private func WriteInterface(address nint, name string, requests [](string, string, nint), events [](string, string, nint)) {
        Marshal.StructureToPtr[BackdropWaylandInterface](BackdropWaylandInterface{
            Name: Text(name), Version: 1, MethodCount: requests.Length, Methods: WriteMessages(requests),
            EventCount: events.Length, Events: WriteMessages(events),
        }, address, false)
    }

    private func WriteMessages(messages [](string, string, nint)) nint {
        if messages.Length == 0 { return nint(0) }
        let size = Marshal.SizeOf[BackdropWaylandMessage]()
        let address = Allocate(messages.Length * size)
        for index in 0 ... messages.Length {
            let (name, signature, types) = messages[index]
            Marshal.StructureToPtr[BackdropWaylandMessage](BackdropWaylandMessage{
                Name: Text(name), Signature: Text(signature), Types: types,
            }, address + nint(index * size), false)
        }
        return address
    }

    private func Allocate(size int32) nint {
        let value = Marshal.AllocHGlobal(size)
        allocations.Add(value)
        return value
    }

    private func Text(value string) nint {
        let address = Marshal.StringToHGlobalAnsi(value)
        allocations.Add(address)
        return address
    }

    shared {
        private func RequireProxy(proxy nint) nint {
            if proxy == nint(0) { throw InvalidOperationException("Cannot create a Wayland session lock object") }
            return proxy
        }

        internal func DestroyRequest(proxy nint, opcode uint32) {
            WaylandBackdrop.wl_proxy_marshal_array(proxy, opcode, nil)
            WaylandBackdrop.wl_proxy_destroy(proxy)
        }

        @DllImport("libwayland-client.so.0", EntryPoint: "wl_proxy_marshal_array_constructor_versioned")
        private func MarshalConstructor(proxy nint, opcode uint32, ref args WaylandLockArguments, kind nint, version uint32) nint;

        @DllImport("libwayland-client.so.0", EntryPoint: "wl_proxy_marshal_array_constructor_versioned")
        private func MarshalConstructor(proxy nint, opcode uint32, ref arg nint, kind nint, version uint32) nint;

        @DllImport("libwayland-client.so.0", EntryPoint: "wl_proxy_marshal_array")
        internal func MarshalRequest(proxy nint, opcode uint32, ref arg nint);
    }
}

internal sealed class WaylandLockSurface : IDisposable {
    private let session WaylandSessionLock
    private let onConfigure LayerWaylandConfigure
    private var proxy nint
    private var listener nint
    private var serial uint32?
    private var configuredWidth uint32
    private var configuredHeight uint32
    private var resizePending bool
    private var presenting bool = true

    internal let Output WindowDisplayId

    internal prop Configured bool {
        get -> presenting && proxy != nint(0) && configuredWidth != 0u && configuredHeight != 0u
    }

    internal func StopPresenting() { presenting = false }

    internal init(session WaylandSessionLock, output WindowDisplayId) {
        this.session = session
        Output = output
        onConfigure = (_, _, nextSerial, width, height) -> {
            serial = nextSerial
            configuredWidth = width
            configuredHeight = height
            resizePending = true
        }
    }

    internal func Attach(display nint, surface nint, output nint) {
        proxy = session.CreateSurface(display, surface, output)
        listener = Marshal.AllocHGlobal(IntPtr.Size)
        Marshal.WriteIntPtr(listener, Marshal.GetFunctionPointerForDelegate(onConfigure))
        if WaylandBackdrop.wl_proxy_add_listener(proxy, listener, nint(0)) != 0 {
            throw InvalidOperationException("Cannot listen to Wayland session lock surface events")
        }
        session.Flush()
    }

    internal func TakeResize(out width int32, out height int32) bool {
        width = checked(int32(configuredWidth))
        height = checked(int32(configuredHeight))
        if !resizePending || proxy == nint(0) { return false }
        resizePending = false
        if width <= 0 || height <= 0 { throw InvalidOperationException("The compositor sent an invalid lock surface size") }
        return true
    }

    internal func Matches(extent VkExtent2D) bool ->
        Configured && extent.width == configuredWidth && extent.height == configuredHeight

    internal func AckConfigure() {
        if let value = serial {
            var argument = nint(value)
            WaylandSessionLock.MarshalRequest(proxy, 1u, ref argument)
            serial = nil
        }
    }

    public func Dispose() {
        if proxy == nint(0) { return }
        WaylandSessionLock.DestroyRequest(proxy, 0u)
        proxy = nint(0)
        Marshal.FreeHGlobal(listener)
        GC.KeepAlive(onConfigure)
    }
}
