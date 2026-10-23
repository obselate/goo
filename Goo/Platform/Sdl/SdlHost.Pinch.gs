package Goo

import Hexa.NET.SDL3
import System
import System.Runtime.InteropServices

@StructLayout(LayoutKind.Sequential)
internal struct SdlPinchEventNative {
    internal var Type uint32
    internal var Reserved uint32
    internal var Timestamp uint64
    internal var Scale float32
    internal var WindowId uint32

    shared {
        internal const BeginType uint32 = 0x710u
        internal const UpdateType uint32 = 0x711u
        internal const EndType uint32 = 0x712u
        private var pinchWindowId uint32

        internal func Matches(type uint32) bool -> type >= BeginType && type <= EndType

        internal func Read(value SDLEvent) SdlPinchEventNative ->
            MemoryMarshal.Read[SdlPinchEventNative](MemoryMarshal.AsBytes[SDLEvent](
                MemoryMarshal.CreateReadOnlySpan[SDLEvent](in value, 1)))

        internal func WindowIdFor(value SDLEvent) uint32 {
            let pinch = Read(value)
            if pinch.Type == BeginType {
                pinchWindowId = pinch.WindowId
                if pinchWindowId == 0u {
                    let focus = SDL.GetMouseFocus()
                    if !focus.IsNull { pinchWindowId = SDL.GetWindowID(focus) }
                }
            }
            let result = pinchWindowId
            if pinch.Type == EndType { pinchWindowId = 0u }
            return result
        }
    }
}

internal unsafe partial class SdlHost {
    public event Pinch Action[GestureInputKind, float32, float32, float32]
    private var previousPinchScale float32 = 1.0F
    private var pinchX float32
    private var pinchY float32

    private func DispatchPinch(nativeEvent SDLEvent) {
        let pinch = SdlPinchEventNative.Read(nativeEvent)
        if pinch.Type == SdlPinchEventNative.BeginType {
            var x float32
            var y float32
            SDL.GetMouseState(&x, &y)
            pinchX = x
            pinchY = y
            previousPinchScale = 1.0F
            Pinch?.Invoke(GestureInputKind.Down, pinchX, pinchY, 1.0F)
        } else if pinch.Type == SdlPinchEventNative.UpdateType {
            if !Single.IsFinite(pinch.Scale) || pinch.Scale <= 0.0F { return }
            let scale = OperatingSystem.IsLinux() ? pinch.Scale / previousPinchScale : pinch.Scale
            previousPinchScale = pinch.Scale
            Pinch?.Invoke(GestureInputKind.Move, pinchX, pinchY, scale)
        } else {
            previousPinchScale = 1.0F
            Pinch?.Invoke(GestureInputKind.Up, pinchX, pinchY, 1.0F)
        }
    }
}
