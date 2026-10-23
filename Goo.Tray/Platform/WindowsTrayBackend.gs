package Goo

import System
import System.Collections.Generic
import System.Runtime.InteropServices
import System.Security.Cryptography
import System.Text
import System.Threading

@StructLayout(LayoutKind.Sequential)
internal struct TrayWinGuid {
    internal var Low uint64
    internal var High uint64
}

@StructLayout(LayoutKind.Explicit, Size: 976)
internal struct TrayWinData {
    @FieldOffset(0) internal var Size uint32
    @FieldOffset(8) internal var Window nint
    @FieldOffset(16) internal var Id uint32
    @FieldOffset(20) internal var Flags uint32
    @FieldOffset(24) internal var Callback uint32
    @FieldOffset(32) internal var Image nint
    @FieldOffset(40) internal var Tip uint16
    @FieldOffset(816) internal var Version uint32
    @FieldOffset(952) internal var Guid TrayWinGuid
}

@StructLayout(LayoutKind.Sequential)
internal struct TrayWinBitmap {
    internal var Size uint32
    internal var Width int32
    internal var Height int32
    internal var Planes uint16
    internal var Bits uint16
    internal var Compression uint32
    internal var ImageSize uint32
    internal var XDensity int32
    internal var YDensity int32
    internal var Colors uint32
    internal var Important uint32
}

@StructLayout(LayoutKind.Sequential)
internal struct TrayWinIcon {
    internal var Icon int32
    internal var X uint32
    internal var Y uint32
    internal var Mask nint
    internal var Color nint
}

@StructLayout(LayoutKind.Explicit, Size: 40)
internal struct TrayWinIdentifier {
    @FieldOffset(0) internal var Size uint32
    @FieldOffset(8) internal var Window nint
    @FieldOffset(16) internal var Id uint32
    @FieldOffset(20) internal var Guid TrayWinGuid
}

@StructLayout(LayoutKind.Sequential)
internal struct TrayWinRect {
    internal var Left int32
    internal var Top int32
    internal var Right int32
    internal var Bottom int32
}

@UnmanagedFunctionPointer(CallingConvention.Winapi)
internal delegate TrayWinSubclass(window nint, message uint32, wparam nuint, lparam nint, id nuint, data nuint) nint;

internal unsafe class WindowsTrayBackend : TrayBackend {
    private let icon TrayIcon
    private let window nint
    private let identity TrayWinGuid
    private let id uint32
    private var root GCHandle
    private var image nint
    private var content TrayContent
    private var registered bool
    private var closed bool

    private init(owner TrayIcon, handle nint, value TrayContent, identifier uint32) {
        icon = owner
        window = handle
        content = value
        id = identifier
        identity = GuidFor(value.Id)
    }

    public func Update(value TrayContent, pixels IReadOnlyList[uint8]) TrayStatus {
        if closed { return TrayStatus.Closed }
        if value.Menu.Actions.Count > int16.MaxValue { return TrayStatus.Unsupported }
        let next = CreateImage(value, pixels)
        if next == nint(0) { return TrayStatus.Failed }
        let result = if registered && FindWindowW("Shell_TrayWnd", nint(0)) != nint(0) {
            if Notify(NimModify, next, value.Tooltip) { TrayStatus.Registered } else { TrayStatus.Failed }
        } else { Register(next, value.Tooltip) }
        if result == TrayStatus.Failed {
            DestroyIcon(next)
            return result
        }
        let previous = image
        image = next
        content = value
        if previous != nint(0) { DestroyIcon(previous) }
        return result
    }

    public func Dispose() {
        if closed { return }
        closed = true
        if registered { Notify(NimDelete, image, content.Tooltip) }
        registered = false
        if root.IsAllocated {
            RemoveWindowSubclass(window, subclass, nuint(id))
            root.Free()
        }
        if image != nint(0) { DestroyIcon(image) image = nint(0) }
    }

    private func Register(value nint, tooltip string) TrayStatus {
        registered = false
        if FindWindowW("Shell_TrayWnd", nint(0)) == nint(0) { return TrayStatus.NoHost }
        if !Notify(NimAdd, value, tooltip) { return TrayStatus.Failed }
        if !Notify(NimSetVersion, value, tooltip) {
            Notify(NimDelete, value, tooltip)
            return TrayStatus.Failed
        }
        registered = true
        return TrayStatus.Registered
    }

    private func Notify(operation uint32, value nint, tooltip string) bool {
        var data = TrayWinData{
            Size: uint32(Marshal.SizeOf[TrayWinData]()), Window: window, Id: id,
            Flags: NifMessage | NifIcon | NifTip | NifGuid | NifShowTip,
            Callback: callbackMessage, Image: value, Version: NotifyVersion, Guid: identity
        }
        let tip * uint16 = &data.Tip
        for index in 0 ... tooltip.Length { tip[index] = uint16(tooltip[index]) }
        tip[tooltip.Length] = uint16(0)
        return Shell_NotifyIconW(operation, &data) != 0
    }

    private func ShowMenu() {
        if closed || icon.Owner.NativeOwnerClosing || content.Menu.Items.Count == 0 { return }
        guard let lease = icon.Owner.BeginNativeModal(out var modalStatus) else { return }
        try {
            var location = MenuWinPoint{}
            var bounds = TrayWinRect{}
            var identifier = TrayWinIdentifier{
                Size: uint32(Marshal.SizeOf[TrayWinIdentifier]()), Window: window, Id: id, Guid: identity
            }
            if Shell_NotifyIconGetRect(&identifier, &bounds) >= 0 {
                location.X = bounds.Left + (bounds.Right - bounds.Left) / 2
                location.Y = bounds.Bottom
            } else if GetCursorPos(&location) == 0 { icon.PostStatus(TrayStatus.Failed) return }
            if ScreenToClient(window, &location) == 0 { icon.PostStatus(TrayStatus.Failed) return }
            SetForegroundWindow(window)
            let point = Point{X: float64(location.X) / float64(icon.Owner.UiScale), Y: float64(location.Y) / float64(icon.Owner.UiScale)}
            let result = WindowsMenuBridge.ShowContext(icon.Owner, point, content.Menu, lease)
            if result.Status == NativeMenuStatus.Success { icon.PostCommand(result.ItemId) }
            else if result.Status == NativeMenuStatus.Failed { icon.PostStatus(TrayStatus.Failed) }
        } finally {
            lease.Dispose()
            if !closed {
                Notify(NimSetFocus, image, content.Tooltip)
                PostMessageW(window, WmNull, nuint(0), nint(0))
            }
        }
    }

    shared {
        private const NimAdd uint32 = 0
        private const NimModify uint32 = 1
        private const NimDelete uint32 = 2
        private const NimSetFocus uint32 = 3
        private const NimSetVersion uint32 = 4
        private const NifMessage uint32 = 1
        private const NifIcon uint32 = 2
        private const NifTip uint32 = 4
        private const NifGuid uint32 = 0x20
        private const NifShowTip uint32 = 0x80
        private const NotifyVersion uint32 = 4
        private const WmNull uint32 = 0
        private const WmContextMenu uint32 = 0x7B
        private const NinSelect uint32 = 0x400
        private const NinKeySelect uint32 = 0x401
        private var nextId int32
        private var callbackMessage uint32
        private var taskbarCreated uint32
        private let subclass TrayWinSubclass = Dispatch

        @DllImport("SDL3", CallingConvention: CallingConvention.Cdecl)
        private func SDL_GetWindowProperties(window nint) uint32;
        @DllImport("SDL3", CallingConvention: CallingConvention.Cdecl)
        private func SDL_GetPointerProperty(properties uint32, name string, fallback nint) nint;
        @DllImport("shell32.dll") private func Shell_NotifyIconW(operation uint32, value *TrayWinData) int32;
        @DllImport("shell32.dll") private func Shell_NotifyIconGetRect(value *TrayWinIdentifier, bounds *TrayWinRect) int32;
        @DllImport("user32.dll", CharSet: CharSet.Unicode) private func RegisterWindowMessageW(name string) uint32;
        @DllImport("user32.dll", CharSet: CharSet.Unicode) private func FindWindowW(name string, title nint) nint;
        @DllImport("user32.dll") private func CreateIconIndirect(value *TrayWinIcon) nint;
        @DllImport("user32.dll") private func DestroyIcon(value nint) int32;
        @DllImport("user32.dll") private func GetCursorPos(point *MenuWinPoint) int32;
        @DllImport("user32.dll") private func ScreenToClient(window nint, point *MenuWinPoint) int32;
        @DllImport("user32.dll") private func SetForegroundWindow(window nint) int32;
        @DllImport("user32.dll") private func PostMessageW(window nint, message uint32, wparam nuint, lparam nint) int32;
        @DllImport("gdi32.dll") private func CreateDIBSection(dc nint, info *TrayWinBitmap, usage uint32, bits *nint, section nint, offset uint32) nint;
        @DllImport("gdi32.dll") private func CreateBitmap(width int32, height int32, planes uint32, bits uint32, pixels nint) nint;
        @DllImport("gdi32.dll") private func DeleteObject(value nint) int32;
        @DllImport("comctl32.dll") private func SetWindowSubclass(window nint, callback TrayWinSubclass, id nuint, data nuint) int32;
        @DllImport("comctl32.dll") private func RemoveWindowSubclass(window nint, callback TrayWinSubclass, id nuint) int32;
        @DllImport("comctl32.dll") private func DefSubclassProc(window nint, message uint32, wparam nuint, lparam nint) nint;

        internal func Create(icon TrayIcon, content TrayContent, pixels IReadOnlyList[uint8],
            out status TrayStatus, out error string) TrayBackend? {
            status = TrayStatus.Unsupported
            error = ""
            if content.Menu.Actions.Count > int16.MaxValue { return nil }
            let handle = SDL_GetPointerProperty(SDL_GetWindowProperties(icon.Owner.BorrowNativeWindow()),
                "SDL.window.win32.hwnd", nint(0))
            if handle == nint(0) { return nil }
            let identifier = Interlocked.Increment(ref nextId)
            if identifier <= 0 || identifier > uint16.MaxValue {
                error = "The process exhausted Windows tray callback identities"
                return nil
            }
            if callbackMessage == 0 {
                callbackMessage = RegisterWindowMessageW("Goo.Tray.Callback.1")
                taskbarCreated = RegisterWindowMessageW("TaskbarCreated")
            }
            status = TrayStatus.Failed
            if callbackMessage == 0 || taskbarCreated == 0 {
                error = "Windows did not register tray callback messages"
                return nil
            }
            let result = WindowsTrayBackend(icon, handle, content, uint32(identifier))
            result.root = GCHandle.Alloc(result)
            if SetWindowSubclass(handle, subclass, nuint(result.id), nuint(GCHandle.ToIntPtr(result.root))) == 0 {
                result.Dispose()
                error = "Windows did not attach the tray callback"
                return nil
            }
            status = result.Update(content, pixels)
            if status == TrayStatus.Failed {
                result.Dispose()
                error = "Windows did not accept the tray icon"
                return nil
            }
            return result
        }

        private func Dispatch(window nint, message uint32, wparam nuint, lparam nint, id nuint, data nuint) nint {
            var backend WindowsTrayBackend?
            try {
                backend = GCHandle.FromIntPtr(nint(data)).Target as WindowsTrayBackend
                if let current = backend {
                    if !current.closed && message == taskbarCreated {
                        current.icon.PostStatus(current.Register(current.image, current.content.Tooltip))
                    } else if !current.closed && message == callbackMessage
                        && uint32((nuint(lparam) >> 16) & nuint(0xFFFF)) == current.id {
                        let action = uint32(nuint(lparam) & nuint(0xFFFF))
                        if action == NinSelect || action == NinKeySelect { current.icon.PostActivation() }
                        else if action == WmContextMenu { current.icon.Owner.TryPost(current.ShowMenu) }
                        return nint(0)
                    }
                }
            } catch (error Exception) { backend?.icon.PostStatus(TrayStatus.Failed) }
            return DefSubclassProc(window, message, wparam, lparam)
        }

        private func GuidFor(value string) TrayWinGuid {
            let capacity = Encoding.UTF8.GetMaxByteCount(value.Length)
            let bytes * uint8 = stackalloc[capacity]uint8
            let count = Encoding.UTF8.GetBytes(value.AsSpan(), Span[uint8](bytes, capacity))
            let hash * uint8 = stackalloc[32]uint8
            SHA256.HashData(ReadOnlySpan[uint8](bytes, count), Span[uint8](hash, 32))
            let parts = *uint64(hash)
            return TrayWinGuid{Low: parts[0], High: parts[1]}
        }

        private func CreateImage(content TrayContent, pixels IReadOnlyList[uint8]) nint {
            var header = TrayWinBitmap{
                Size: uint32(Marshal.SizeOf[TrayWinBitmap]()), Width: content.Width, Height: -content.Height,
                Planes: uint16(1), Bits: uint16(32)
            }
            var memory = nint(0)
            let bitmap = CreateDIBSection(nint(0), &header, uint32(0), &memory, nint(0), uint32(0))
            if bitmap == nint(0) { return nint(0) }
            var mask = nint(0)
            try {
                if memory == nint(0) { return nint(0) }
                let target = *uint8(memory)
                for index in 0 ... content.Width * content.Height {
                    let offset = index * 4
                    let alpha = int32(pixels[offset + 3])
                    target[offset] = uint8((int32(pixels[offset + 2]) * alpha + 127) / 255)
                    target[offset + 1] = uint8((int32(pixels[offset + 1]) * alpha + 127) / 255)
                    target[offset + 2] = uint8((int32(pixels[offset]) * alpha + 127) / 255)
                    target[offset + 3] = uint8(alpha)
                }
                let maskLength = ((content.Width + 15) / 16) * 2 * content.Height
                let empty * uint8 = stackalloc[maskLength]uint8
                Span[uint8](empty, maskLength).Clear()
                mask = CreateBitmap(content.Width, content.Height, uint32(1), uint32(1), nint(empty))
                if mask == nint(0) { return nint(0) }
                var info = TrayWinIcon{Icon: 1, Mask: mask, Color: bitmap}
                return CreateIconIndirect(&info)
            } finally {
                if mask != nint(0) { DeleteObject(mask) }
                DeleteObject(bitmap)
            }
        }
    }
}
