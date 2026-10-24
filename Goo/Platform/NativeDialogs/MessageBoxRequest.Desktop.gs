package Goo

import System
import System.Runtime.InteropServices

@StructLayout(LayoutKind.Sequential)
internal struct SdlMessageBoxData {
    internal var Flags uint32
    internal var Window nint
    internal var Title nint
    internal var Message nint
    internal var Count int32
    internal var Buttons nint
    internal var Colors nint
}

@StructLayout(LayoutKind.Sequential)
internal struct SdlMessageBoxButton {
    internal var Flags uint32
    internal var Id int32
    internal var Text nint
}

internal sealed partial class MessageBoxRequest {
    private func Show() {
        if let show = owner.NativeMessageBox {
            nativeDialog = show(options, Finish)
            if finished {
                nativeDialog?.Dispose()
                nativeDialog = nil
            }
            return
        }
        if lease.SDLWindow == nint(0) {
            Finish(MessageBoxResult(MessageBoxStatus.Unsupported))
            return
        }
        var data = SdlMessageBoxData{}
        let labels = [options.Buttons.Count]nint
        try {
            data.Flags = switch options.Icon {
                case MessageBoxIcon.Error: 0x10u
                case MessageBoxIcon.Warning: 0x20u
                default: 0x40u
            }
            data.Window = lease.SDLWindow
            data.Title = Marshal.StringToCoTaskMemUTF8(options.Title)
            data.Message = Marshal.StringToCoTaskMemUTF8(options.Message)
            data.Count = labels.Length
            let size = Marshal.SizeOf[SdlMessageBoxButton]()
            data.Buttons = Marshal.AllocHGlobal(size * data.Count)
            for i in 0 ... data.Count {
                let source = options.Buttons[i]
                labels[i] = Marshal.StringToCoTaskMemUTF8(source.Text)
                var button SdlMessageBoxButton
                button.Id = source.Id
                button.Text = labels[i]
                button.Flags = (if source.Default { 1u } else { 0u }) | (if source.Cancel { 2u } else { 0u })
                Marshal.StructureToPtr[SdlMessageBoxButton](button, data.Buttons + i * size, false)
            }
            var selected = -1
            let shown = ShowMessageBox(&data, &selected) != 0
            let error = if shown { "" } else { Marshal.PtrToStringUTF8(GetError()) ?? "SDL message box failed" }
            Finish(if !shown { MessageBoxResult(MessageBoxStatus.Failed, error: error) }
                else if selected == -1 { MessageBoxResult(MessageBoxStatus.Cancelled) }
                else { MessageBoxResult(MessageBoxStatus.Success, selected) })
        } finally {
            Marshal.FreeCoTaskMem(data.Title)
            Marshal.FreeCoTaskMem(data.Message)
            for label in labels { Marshal.FreeCoTaskMem(label) }
            if data.Buttons != nint(0) { Marshal.FreeHGlobal(data.Buttons) }
        }
    }

    shared {
        @DllImport("SDL3", EntryPoint: "SDL_ShowMessageBox", CallingConvention: CallingConvention.Cdecl)
        private func ShowMessageBox(ref data SdlMessageBoxData, out selected int32) uint8;

        @DllImport("SDL3", EntryPoint: "SDL_GetError", CallingConvention: CallingConvention.Cdecl)
        private func GetError() nint;
    }
}
