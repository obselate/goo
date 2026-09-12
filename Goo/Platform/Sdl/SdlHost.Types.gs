package Goo

import System
import System.Runtime.InteropServices
import Hexa.NET.SDL3

internal data struct SdlHostPoint(X int32, Y int32) { }

@DllImport("SDL3", EntryPoint: "SDL_SetWindowHitTest", CallingConvention: CallingConvention.Cdecl)
internal func SDL_SetWindowHitTestRaw(window nint, callback nint, userData nint) uint8;

@DllImport("SDL3", EntryPoint: "SDL_GetWindowFromID", CallingConvention: CallingConvention.Cdecl)
internal func SDL_GetWindowFromIdRaw(windowId uint32) nint;

@DllImport("SDL3", EntryPoint: "SDL_Vulkan_GetVkGetInstanceProcAddr", CallingConvention: CallingConvention.Cdecl)
internal func SDL_Vulkan_GetVkGetInstanceProcAddrRaw() nint;

@UnmanagedFunctionPointer(CallingConvention.Cdecl)
internal delegate SdlHostRawHitTest(nativeWindow nint, point nint, userData nint) SDLHitTestResult;
