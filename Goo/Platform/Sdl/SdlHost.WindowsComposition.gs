package Goo

import Hexa.NET.SDL3
import System
import System.ComponentModel
import System.Runtime.CompilerServices
import System.Runtime.InteropServices

@StructLayout(LayoutKind.Sequential)
internal struct WindowsCompositionWindowRect {
    var Left int32
    var Top int32
    var Right int32
    var Bottom int32
}

internal unsafe partial class SdlHost {
    private var compositionWindow nint

    private func CreateCompositionWindow(properties uint32, title string, x int32, y int32,
        width int32, height int32, flags SDLWindowFlags, parent SdlHost? = nil) {
        const noRedirectionBitmap uint32 = 0x00200000u
        let borderless = (flags & SDLWindowFlags.Borderless) != SDLWindowFlags(0)
        var style = 0x06000000u
        var extendedStyle = noRedirectionBitmap
        var bounds = WindowsCompositionWindowRect{Left: x, Top: y, Right: x + width, Bottom: y + height}
        var owner nint
        if let popupOwner = parent {
            owner = popupOwner.GetNativeWindowHandle().Handle
            var origin = SdlTitlebarPoint{X: x, Y: y}
            if ClientToScreen(owner, ref origin) == 0 { throw Win32Exception(Marshal.GetLastPInvokeError()) }
            bounds = WindowsCompositionWindowRect{
                Left: origin.X, Top: origin.Y, Right: origin.X + width, Bottom: origin.Y + height,
            }
            style |= 0x80000000u
            extendedStyle |= 0x08000080u
            Require(SDL.SetPointerProperty(properties, "SDL.window.create.parent", popupOwner.window.Handle),
                "SDL_SetPointerProperty")
        } else {
            style |= 0x00020000u
            if borderless { style |= 0x80000000u }
            if !borderless || SDL.GetHintBoolean("SDL_BORDERLESS_WINDOWED_STYLE", true) { style |= 0x00C80000u }
            if !borderless || SDL.GetHintBoolean("SDL_BORDERLESS_RESIZABLE_STYLE", true) { style |= 0x00050000u }
            if !borderless {
                let adjusted = if OperatingSystem.IsWindowsVersionAtLeast(10, 0, 14393)
                    && AreDpiAwarenessContextsEqual(GetThreadDpiAwarenessContext(), nint(-4)) != 0 {
                    AdjustWindowRectExForDpi(ref bounds, style, 0, extendedStyle, 96u)
                } else { AdjustWindowRectEx(ref bounds, style, 0, extendedStyle) }
                if adjusted == 0 { throw Win32Exception(Marshal.GetLastPInvokeError()) }
            }
        }

        let hwnd = CreateWindowEx(extendedStyle, "SDL_app", title, style, bounds.Left, bounds.Top,
            bounds.Right - bounds.Left, bounds.Bottom - bounds.Top, owner, nint(0), GetModuleHandle(nint(0)), nint(0))
        if hwnd == nint(0) { throw Win32Exception(Marshal.GetLastPInvokeError()) }
        compositionWindow = hwnd
        if SetWindowLongPtr(hwnd, -4, nint(&CompositionWindowProc)) == nint(0) {
            throw Win32Exception(Marshal.GetLastPInvokeError())
        }
        WindowsBackdrop.SetFrameTheme(hwnd, if SDL.GetSystemTheme() == SDLSystemTheme.Dark {
            SystemTheme.Dark
        } else { SystemTheme.Light })
        Require(SDL.SetPointerProperty(properties, "SDL.window.create.win32.hwnd", *void(hwnd)), "SDL_SetPointerProperty")
        Require(SDL.SetNumberProperty(properties, "SDL.window.create.flags", int64(flags & ~SDLWindowFlags.Transparent)),
            "SDL_SetNumberProperty")
        window = SDL.CreateWindowWithProperties(properties)
        if window.IsNull { ThrowSdl("SDL_CreateWindowWithProperties") }
        if SetWindowPos(hwnd, nint(0), 0, 0, 0, 0, 0x237u) == 0 {
            throw Win32Exception(Marshal.GetLastPInvokeError())
        }
    }

    shared {
        @UnmanagedCallersOnly(CallConvs: []Type{typeof(CallConvStdcall)})
        private func CompositionWindowProc(hwnd nint, message uint32, wparam nuint, lparam nint) nint {
            if message == 0x0010u || message == 0x000Fu { return nint(0) }
            if (message >= 0x0100u && message <= 0x0102u)
                || message == 0x0104u || message == 0x0105u || message == 0x02A3u { return nint(0) }
            if message == 0x0109u { return if wparam == nuint(0xffff) { nint(1) } else { nint(0) } }
            if message == 0x0051u { return nint(1) }
            if (message >= 0x0245u && message <= 0x0247u)
                || message == 0x0249u || message == 0x024Au || message == 0x024Cu {
                if GetPointerType(uint32(wparam & nuint(0xffff)), out var pointerType) != 0
                    && (pointerType == 3u || (message == 0x0245u && pointerType == 4u)) { return nint(0) }
            }
            if message == 0x0020u && (lparam & nint(0xffff)) == nint(1) { return nint(1) }
            return DefWindowProc(hwnd, message, wparam, lparam)
        }

        @DllImport("user32.dll", EntryPoint: "CreateWindowExW", CharSet: CharSet.Unicode, SetLastError: true)
        private func CreateWindowEx(extendedStyle uint32, className string, title string, style uint32,
            x int32, y int32, width int32, height int32, owner nint, menu nint, instance nint, parameter nint) nint;

        @DllImport("kernel32.dll", EntryPoint: "GetModuleHandleW")
        private func GetModuleHandle(name nint) nint;

        @DllImport("user32.dll", EntryPoint: "SetWindowLongPtrW", SetLastError: true)
        private func SetWindowLongPtr(window nint, index int32, value nint) nint;

        @DllImport("user32.dll", EntryPoint: "DefWindowProcW")
        private func DefWindowProc(window nint, message uint32, wparam nuint, lparam nint) nint;

        @DllImport("user32.dll")
        private func GetPointerType(pointerId uint32, out pointerType uint32) int32;

        @DllImport("user32.dll", EntryPoint: "DestroyWindow")
        private func DestroyCompositionWindow(window nint) int32;

        @DllImport("user32.dll", SetLastError: true)
        private func SetWindowPos(window nint, after nint, x int32, y int32, width int32, height int32,
            flags uint32) int32;

        @DllImport("user32.dll", SetLastError: true)
        private func ClientToScreen(window nint, ref point SdlTitlebarPoint) int32;

        @DllImport("user32.dll", SetLastError: true)
        private func AdjustWindowRectEx(ref rect WindowsCompositionWindowRect, style uint32, menu int32,
            extendedStyle uint32) int32;

        @DllImport("user32.dll", SetLastError: true)
        private func AdjustWindowRectExForDpi(ref rect WindowsCompositionWindowRect, style uint32,
            menu int32, extendedStyle uint32, dpi uint32) int32;

        @DllImport("user32.dll")
        private func GetThreadDpiAwarenessContext() nint;

        @DllImport("user32.dll")
        private func AreDpiAwarenessContextsEqual(first nint, second nint) int32;
    }
}
