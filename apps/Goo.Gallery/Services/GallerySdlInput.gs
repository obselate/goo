package GooGallery

import Goo
import Hexa.NET.SDL3
import System
import System.Runtime.InteropServices

@DllImport("SDL3", EntryPoint: "SDL_GetWindows", CallingConvention: CallingConvention.Cdecl)
unsafe func GallerySdlGetWindows(count *int32) nint;

@DllImport("SDL3", EntryPoint: "SDL_GetWindowID", CallingConvention: CallingConvention.Cdecl)
func GallerySdlGetWindowId(window nint) uint32;

@DllImport("SDL3", EntryPoint: "SDL_free", CallingConvention: CallingConvention.Cdecl)
func GallerySdlFree(value nint);

unsafe func GallerySdlWindowId() uint32 {
    var count int32 = 0
    let windows = GallerySdlGetWindows(&count)
    if windows == nint.Zero || count != 1 {
        if windows != nint.Zero {
            GallerySdlFree(windows)
        }
        throw InvalidOperationException("Goo Gallery input smoke could not identify its SDL window")
    }
    let window = (*nint(*void(windows)))[0]
    let id = GallerySdlGetWindowId(window)
    GallerySdlFree(windows)
    return id
}

unsafe func GalleryPushClick(windowId uint32, bounds ElementRect) {
    let x = float32(bounds.X + bounds.Width * 0.5)
    let y = float32(bounds.Y + bounds.Height * 0.5)
    var down = SDLEvent{
        Type: uint32(SDLEventType.MouseButtonDown),
        Button: SDLMouseButtonEvent{
            Type: SDLEventType.MouseButtonDown,
            WindowID: windowId,
            Which: 0u,
            Button: uint8(SDL.SDL_BUTTON_LEFT),
            Down: uint8(1),
            Clicks: uint8(1),
            X: x,
            Y: y,
        },
    }
    var up = SDLEvent{
        Type: uint32(SDLEventType.MouseButtonUp),
        Button: SDLMouseButtonEvent{
            Type: SDLEventType.MouseButtonUp,
            WindowID: windowId,
            Which: 0u,
            Button: uint8(SDL.SDL_BUTTON_LEFT),
            Down: uint8(0),
            Clicks: uint8(1),
            X: x,
            Y: y,
        },
    }
    if !SDL.PushEvent(&down) || !SDL.PushEvent(&up) {
        throw InvalidOperationException("Goo Gallery input smoke could not queue native pointer input")
    }
}
