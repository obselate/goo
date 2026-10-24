import System
import System.IO
import System.Runtime.InteropServices

@UnmanagedFunctionPointer(CallingConvention.Cdecl)
delegate PopupInit(flags uint32) byte;

@UnmanagedFunctionPointer(CallingConvention.Cdecl)
delegate PopupCreate(title nint, width int32, height int32, flags uint64) nint;

@UnmanagedFunctionPointer(CallingConvention.Cdecl)
delegate PopupCreateChild(parent nint, x int32, y int32, width int32, height int32, flags uint64) nint;

@UnmanagedFunctionPointer(CallingConvention.Cdecl)
delegate PopupConfigure(
    parent nint,
    popup nint,
    input uint64,
    x int32,
    y int32,
    width int32,
    height int32,
    flags int32
) byte;

@UnmanagedFunctionPointer(CallingConvention.Cdecl)
delegate PopupDestroy(window nint);

@UnmanagedFunctionPointer(CallingConvention.Cdecl)
delegate PopupError() nint;

@UnmanagedFunctionPointer(CallingConvention.Cdecl)
delegate PopupQuit();

class Popup {
    shared {
        public func Run(arguments[]string) {
            Runner.Require(arguments.Length >= 2, "expected SDL_SOURCE SDL_LIBRARY")
            let root = Path.Combine(arguments[0], "src/video/wayland")
            let events = File.ReadAllText(Path.Combine(root, "SDL_waylandevents.c"))
            let window = File.ReadAllText(Path.Combine(root, "SDL_waylandwindow.c"))
            let creation = window.Substring(window.IndexOf("// Assign the popup role", StringComparison.Ordinal))
            let grab = creation.IndexOf("Goo_GrabPopup(", StringComparison.Ordinal)
            let property = creation.IndexOf(
                "SDL_SetPointerProperty(props, SDL_PROP_WINDOW_WAYLAND_XDG_POPUP_POINTER",
                StringComparison.Ordinal
            )
            Runner.Require(
                grab >= 0 && property >= 0 && grab < property,
                "Popup grab must precede publishing the popup property"
            )
            for call in[]string{
                "Goo_RecordPopupInput(window->sdlwindow, seat, nsTimestamp)",
                "Goo_RecordPopupInput(SDL_GetKeyboardFocus(), seat, timestamp_ns)",
                "Goo_RecordPopupInput(window_data->sdlwindow, seat, Wayland_GetTouchTimestamp(seat, timestamp))"
            } {
                Runner.Require(events.Contains(call), "Missing popup input handler: " + call)
            }
            let library = NativeLibrary.Load(Path.GetFullPath(arguments[1]))
            try {
                Native(library)
            } finally {
                NativeLibrary.Free(library)
            }
            Console.WriteLine(
                "PASS actual Wayland popup bridge rejects absent/unmatched input and accepts non-grabbing tooltips"
            )
        }

        func Native(library nint) {
            let init = Marshal.GetDelegateForFunctionPointer[PopupInit](NativeLibrary.GetExport(library, "SDL_Init"))
            let create = Marshal.GetDelegateForFunctionPointer[PopupCreate](
                NativeLibrary.GetExport(library, "SDL_CreateWindow")
            )
            let createPopup = Marshal.GetDelegateForFunctionPointer[PopupCreateChild](
                NativeLibrary.GetExport(library, "SDL_CreatePopupWindow")
            )
            let configure = Marshal.GetDelegateForFunctionPointer[PopupConfigure](
                NativeLibrary.GetExport(library, "Goo_ConfigurePopup")
            )
            let destroy = Marshal.GetDelegateForFunctionPointer[PopupDestroy](
                NativeLibrary.GetExport(library, "SDL_DestroyWindow")
            )
            let error = Marshal.GetDelegateForFunctionPointer[PopupError](
                NativeLibrary.GetExport(library, "SDL_GetError")
            )
            let quit = Marshal.GetDelegateForFunctionPointer[PopupQuit](NativeLibrary.GetExport(library, "SDL_Quit"))
            CheckNative(init(0x20) != 0, error)
            let title = Marshal.StringToCoTaskMemUTF8("Popup bridge lifetime")
            var parent nint = 0
            try {
                parent = create(title, 320, 240, 0x8)
                CheckNative(parent != 0, error)
                for kind in[]uint64{0x80000, 0x40000} {
                    let popup = createPopup(parent, 0, 0, 80, 60, kind | 0x8)
                    CheckNative(popup != 0, error)
                    try {
                        let configured = configure(parent, popup, 0, 10, 10, 20, 20, 0) != 0
                        CheckNative(configured == (kind == 0x40000), error)
                        if kind == 0x80000 {
                            Runner.Require(
                                configure(parent, popup, uint64.MaxValue, 10, 10, 20, 20, 0) == 0,
                                "Popup accepted an unmatched input token"
                            )
                        }
                    } finally {
                        destroy(popup)
                    }
                }
            } finally {
                if parent != 0 {
                    destroy(parent)
                }
                Marshal.FreeCoTaskMem(title)
                quit()
            }
        }

        func CheckNative(condition bool, error PopupError) {
            if !condition {
                throw InvalidOperationException(Marshal.PtrToStringUTF8(error()) ?? "SDL popup check failed")
            }
        }
    }
}
