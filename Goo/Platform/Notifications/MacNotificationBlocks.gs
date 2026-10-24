package Goo

import System
import System.Runtime.InteropServices
import System.Threading.Tasks

@StructLayout(LayoutKind.Sequential)
internal struct MacNotificationBlock {
    internal var Isa nint
    internal var Flags int32
    internal var Reserved int32
    internal var Invoke nint
    internal var Descriptor nint
    internal var Context nint
}

@StructLayout(LayoutKind.Sequential)
internal struct MacNotificationBlockDescriptor {
    internal var Reserved nuint
    internal var Size nuint
    internal var Copy nint
    internal var Dispose nint
}

internal data struct MacNotificationReply {
    internal prop Value nint { get; init; }
    internal prop Error nint { get; init; }
}

@UnmanagedFunctionPointer(CallingConvention.Cdecl)
internal delegate MacNotificationObjectBlock(block nint, value nint);

@UnmanagedFunctionPointer(CallingConvention.Cdecl)
internal delegate MacNotificationAuthorizationBlock(block nint, granted uint8, error nint);

@UnmanagedFunctionPointer(CallingConvention.Cdecl)
internal delegate MacNotificationCopyBlock(destination nint, source nint);

@UnmanagedFunctionPointer(CallingConvention.Cdecl)
internal delegate MacNotificationDisposeBlock(block nint);

@UnmanagedFunctionPointer(CallingConvention.Cdecl)
internal delegate MacNotificationVoidCompletion(block nint);

@UnmanagedFunctionPointer(CallingConvention.Cdecl)
internal delegate MacNotificationPresentationCompletion(block nint, options nuint);

internal class MacNotificationBlockLease : IDisposable {
    private var block nint
    internal let Mode int32
    internal let Completion TaskCompletionSource[MacNotificationReply] =
        TaskCompletionSource[MacNotificationReply](TaskCreationOptions.RunContinuationsAsynchronously)

    internal prop Pointer nint { get -> block }

    internal init(mode int32) {
        Mode = mode
        let handle = GCHandle.Alloc(this)
        try {
            block = Marshal.AllocHGlobal(Marshal.SizeOf[MacNotificationBlock]())
            Marshal.StructureToPtr[MacNotificationBlock](MacNotificationBlock {
                Isa: StackBlock, Flags: 1 << 25,
                Invoke: if mode == 2 { AuthorizationPointer } else { ObjectPointer },
                Descriptor: Descriptor, Context: GCHandle.ToIntPtr(handle),
            }, block, false)
        } catch (error Exception) {
            handle.Free()
            if block != nint(0) { Marshal.FreeHGlobal(block) }
            throw error
        }
    }

    public func Dispose() {
        if block == nint(0) { return }
        DisposeBlock(block)
        Marshal.FreeHGlobal(block)
        block = nint(0)
    }

    shared {
        private let SystemLibrary nint = NativeLibrary.Load("/usr/lib/libSystem.B.dylib")
        private let StackBlock nint = NativeLibrary.GetExport(SystemLibrary, "_NSConcreteStackBlock")
        private let ObjectCallback MacNotificationObjectBlock = CompleteObject
        private let AuthorizationCallback MacNotificationAuthorizationBlock = CompleteAuthorization
        private let CopyCallback MacNotificationCopyBlock = CopyBlock
        private let DisposeCallback MacNotificationDisposeBlock = DisposeBlock
        private let ObjectPointer nint = Marshal.GetFunctionPointerForDelegate(ObjectCallback)
        private let AuthorizationPointer nint = Marshal.GetFunctionPointerForDelegate(AuthorizationCallback)
        private let Descriptor nint = CreateDescriptor()

        private func CreateDescriptor() nint {
            let pointer = Marshal.AllocHGlobal(Marshal.SizeOf[MacNotificationBlockDescriptor]())
            Marshal.StructureToPtr[MacNotificationBlockDescriptor](MacNotificationBlockDescriptor {
                Size: nuint(Marshal.SizeOf[MacNotificationBlock]()),
                Copy: Marshal.GetFunctionPointerForDelegate(CopyCallback),
                Dispose: Marshal.GetFunctionPointerForDelegate(DisposeCallback),
            }, pointer, false)
            return pointer
        }

        private func State(block nint) MacNotificationBlockLease ->
            (GCHandle.FromIntPtr(Marshal.PtrToStructure[MacNotificationBlock](block).Context).Target as MacNotificationBlockLease)!!

        private func CopyBlock(destination nint, source nint) {
            let context = GCHandle.ToIntPtr(GCHandle.Alloc(State(source)))
            Marshal.WriteIntPtr(destination, Marshal.OffsetOf[MacNotificationBlock]("Context").ToInt32(), context)
        }

        private func DisposeBlock(block nint) {
            let context = Marshal.PtrToStructure[MacNotificationBlock](block).Context
            if context != nint(0) { GCHandle.FromIntPtr(context).Free() }
        }

        private func CompleteObject(block nint, value nint) {
            let state = State(block)
            MacNotificationService.Retain(value)
            let reply = if state.Mode == 1 { MacNotificationReply { Error: value } }
                else { MacNotificationReply { Value: value } }
            if !state.Completion.TrySetResult(reply) { MacNotificationService.Release(value) }
        }

        private func CompleteAuthorization(block nint, granted uint8, error nint) {
            let state = State(block)
            MacNotificationService.Retain(error)
            if !state.Completion.TrySetResult(MacNotificationReply { Value: nint(granted), Error: error }) {
                MacNotificationService.Release(error)
            }
        }

        internal func Complete(block nint) {
            let invoke = Marshal.PtrToStructure[MacNotificationBlock](block).Invoke
            Marshal.GetDelegateForFunctionPointer[MacNotificationVoidCompletion](invoke)(block)
        }

        internal func Present(block nint) {
            let invoke = Marshal.PtrToStructure[MacNotificationBlock](block).Invoke
            Marshal.GetDelegateForFunctionPointer[MacNotificationPresentationCompletion](invoke)(block, nuint(24))
        }
    }
}
