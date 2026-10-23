package Goo

import System
import System.Collections.Generic
import System.ComponentModel
import System.Runtime.InteropServices

@StructLayout(LayoutKind.Sequential)
internal struct MenuWinPoint {
    internal var X int32
    internal var Y int32
}

@StructLayout(LayoutKind.Sequential)
internal struct MenuWinMessage {
    internal var Window nint
    internal var Message uint32
    internal var WParam nuint
    internal var LParam nint
    internal var Time uint32
    internal var Point MenuWinPoint
    internal var Private uint32
}

@StructLayout(LayoutKind.Sequential)
internal struct MenuWinItem {
    internal var Size uint32
    internal var Mask uint32
    internal var Type uint32
    internal var State uint32
    internal var Id uint32
    internal var Submenu nint
    internal var Checked nint
    internal var Unchecked nint
    internal var Data nuint
    internal var Text nint
    internal var Length uint32
    internal var Bitmap nint
}

@StructLayout(LayoutKind.Sequential)
internal struct MenuWinAccel {
    internal var Flags uint8
    internal var Key uint16
    internal var Command uint16
}

@UnmanagedFunctionPointer(CallingConvention.Winapi)
internal delegate MenuWinSubclass(window nint, message uint32, wparam nuint, lparam nint, id nuint, data nuint) nint;

@UnmanagedFunctionPointer(CallingConvention.Cdecl)
internal delegate MenuWinHook(data nint, message nint) uint8;

@UnmanagedFunctionPointer(CallingConvention.Winapi)
internal delegate MenuWinFilter(code int32, wparam nint, lparam nint) nint;

internal sealed class WindowsMenuBinding : IDisposable {
    internal let Owner Window
    internal let Activate Action[string]
    internal var Snapshot NativeMenuSnapshot?
    internal var Handle nint
    internal var Menu nint
    internal var Previous nint
    internal var Accelerators nint
    internal var Lease NativeModalLease?
    internal var Tracking bool
    internal var Closed bool
    internal var Error string = ""
    internal var Selected string = ""
    private let closing Action

    internal init(owner Window, activate Action[string]) {
        Owner = owner
        Activate = activate
        closing = Dispose
        owner.NativeWindowClosing += closing
    }

    internal func SetItems(snapshot NativeMenuSnapshot) NativeMenuResult -> WindowsMenuBridge.Install(this, snapshot)

    public func Dispose() {
        Owner.RequireNativeServiceThread()
        if Closed { return }
        Closed = true
        Owner.NativeWindowClosing -= closing
        WindowsMenuBridge.Remove(this)
    }
}

internal unsafe sealed class WindowsMenuBridge {
    shared {
        private const SubclassId int32 = 0x474D
        private const WmCommand uint32 = 0x111
        private const WmEnterMenuLoop uint32 = 0x211
        private const WmExitMenuLoop uint32 = 0x212
        private const WmInputLanguageChange uint32 = 0x51
        private let bindings Dictionary[nint, WindowsMenuBinding] = Dictionary[nint, WindowsMenuBinding]()
        private let contexts Dictionary[nint, WindowsMenuBinding] = Dictionary[nint, WindowsMenuBinding]()
        private let subclass MenuWinSubclass = Dispatch
        private let hook MenuWinHook = Translate
        private let menuFilter MenuWinFilter = FilterMenuMessage
        @DllImport("SDL3", CallingConvention: CallingConvention.Cdecl)
        private func SDL_SetWindowsMessageHook(callback nint, data nint);
        @DllImport("SDL3", CallingConvention: CallingConvention.Cdecl) private func SDL_GetWindowProperties(window nint) uint32;
        @DllImport("SDL3", CallingConvention: CallingConvention.Cdecl) private func SDL_GetPointerProperty(properties uint32, name string, fallback nint) nint;
        @DllImport("user32.dll", SetLastError: true) private func CreateMenu() nint;
        @DllImport("user32.dll", SetLastError: true) private func CreatePopupMenu() nint;
        @DllImport("user32.dll", SetLastError: true) private func InsertMenuItemW(menu nint, position uint32, byPosition int32, item *MenuWinItem) int32;
        @DllImport("user32.dll", SetLastError: true) internal func DestroyMenu(menu nint) int32;
        @DllImport("user32.dll", SetLastError: true) private func SetMenu(window nint, menu nint) int32;
        @DllImport("user32.dll") private func GetMenu(window nint) nint;
        @DllImport("user32.dll", SetLastError: true) private func DrawMenuBar(window nint) int32;
        @DllImport("user32.dll", SetLastError: true) private func ClientToScreen(window nint, point *MenuWinPoint) int32;
        @DllImport("user32.dll", SetLastError: true) private func TrackPopupMenuEx(menu nint, flags uint32, x int32, y int32, window nint, parameters nint) uint32;
        @DllImport("user32.dll") private func EndMenu() int32;
        @DllImport("user32.dll") private func GetKeyboardLayout(thread uint32) nint;
        @DllImport("user32.dll") private func VkKeyScanExW(character uint16, layout nint) int16;
        @DllImport("user32.dll", SetLastError: true) private func CreateAcceleratorTableW(entries *MenuWinAccel, count int32) nint;
        @DllImport("user32.dll") private func DestroyAcceleratorTable(table nint) int32;
        @DllImport("user32.dll") private func TranslateAcceleratorW(window nint, table nint, message *MenuWinMessage) int32;
        @DllImport("user32.dll") private func GetAncestor(window nint, flags uint32) nint;
        @DllImport("kernel32.dll") private func SetLastError(error uint32);
        @DllImport("comctl32.dll", SetLastError: true) private func SetWindowSubclass(window nint, callback MenuWinSubclass, id nuint, data nuint) int32;
        @DllImport("comctl32.dll") private func RemoveWindowSubclass(window nint, callback MenuWinSubclass, id nuint) int32;
        @DllImport("comctl32.dll") private func DefSubclassProc(window nint, message uint32, wparam nuint, lparam nint) nint;
        @DllImport("user32.dll", SetLastError: true) private func SetWindowsHookExW(kind int32, callback MenuWinFilter, module nint, thread uint32) nint;
        @DllImport("user32.dll") private func UnhookWindowsHookEx(hook nint) int32;
        @DllImport("user32.dll") private func CallNextHookEx(hook nint, code int32, wparam nint, lparam nint) nint;
        @DllImport("kernel32.dll") private func GetCurrentThreadId() uint32;

        private func Failure() NativeMenuResult -> NativeMenuResult(NativeMenuStatus.Failed, error: Win32Exception(Marshal.GetLastPInvokeError()).Message)

        internal func Install(binding WindowsMenuBinding, snapshot NativeMenuSnapshot) NativeMenuResult {
            if binding.Closed || !binding.Owner.IsOpen { return NativeMenuResult(NativeMenuStatus.OwnerClosed) }
            if binding.Tracking { return NativeMenuResult(NativeMenuStatus.Busy) }
            if snapshot.Actions.Count > int16.MaxValue { return NativeMenuResult(NativeMenuStatus.Unsupported) }
            let handle = SDL_GetPointerProperty(SDL_GetWindowProperties(binding.Owner.BorrowNativeWindow()), "SDL.window.win32.hwnd", nint(0))
            if handle == nint(0) { return NativeMenuResult(NativeMenuStatus.Unsupported) }
            if bindings.TryGetValue(handle, out var existing) && existing != binding {
                throw InvalidOperationException("A native menu bar is already attached to this window")
            }
            let accelerators = BuildAccelerators(snapshot, out var status)
            if status != NativeMenuStatus.Success { return if status == NativeMenuStatus.Failed { Failure() } else { NativeMenuResult(status) } }
            let menu = Build(snapshot.Items, snapshot, true)
            if menu == nint(0) { DestroyAcceleratorTable(accelerators) return Failure() }
            if binding.Handle == nint(0) {
                if SetWindowSubclass(handle, subclass, nuint(SubclassId), nuint(0)) == 0 {
                    let failure = Failure()
                    DestroyMenu(menu)
                    DestroyAcceleratorTable(accelerators)
                    return failure
                }
                binding.Handle = handle
                binding.Previous = GetMenu(handle)
                bindings.Add(handle, binding)
                if bindings.Count == 1 { SDL_SetWindowsMessageHook(Marshal.GetFunctionPointerForDelegate(hook), nint(0)) }
            }
            if SetMenu(handle, menu) == 0 {
                let failure = Failure()
                DestroyMenu(menu)
                DestroyAcceleratorTable(accelerators)
                return failure
            }
            let previous = binding.Menu
            let previousAccelerators = binding.Accelerators
            binding.Menu = menu
            binding.Accelerators = accelerators
            binding.Snapshot = snapshot
            DestroyMenu(previous)
            DestroyAcceleratorTable(previousAccelerators)
            let result = if DrawMenuBar(handle) == 0 { Failure() } else { NativeMenuResult(NativeMenuStatus.Success) }
            binding.Owner.RefreshSchedulerMetrics()
            return result
        }

        internal func Build(items IReadOnlyList[NativeMenuItem], snapshot NativeMenuSnapshot, bar bool, offset int32 = 0) nint {
            let menu = if bar { CreateMenu() } else { CreatePopupMenu() }
            if menu == nint(0) { return menu }
            for item in items {
                let title = if let shortcut = item.Shortcut { item.Text + "\t" + ShortcutText(shortcut) } else { item.Text }
                let text = Marshal.StringToHGlobalUni(title)
                var row = MenuWinItem{
                    Size: uint32(Marshal.SizeOf[MenuWinItem]()), Mask: 0x143,
                    Type: if item.Separator { uint32(0x800) } else { uint32(0) },
                    State: (if !item.Enabled { uint32(3) } else { uint32(0) }) | (if item.Checked { uint32(8) } else { uint32(0) }),
                    Id: if item.Separator { uint32(0) } else { uint32(snapshot.Tags[item.Id] + offset) }, Text: text,
                }
                if item.Items.Count != 0 {
                    row.Submenu = Build(item.Items, snapshot, false, offset)
                    row.Mask |= 4
                    if row.Submenu == nint(0) {
                        let error = Marshal.GetLastPInvokeError()
                        Marshal.FreeHGlobal(text)
                        DestroyMenu(menu)
                        Marshal.SetLastPInvokeError(error)
                        return nint(0)
                    }
                }
                let inserted = InsertMenuItemW(menu, uint32.MaxValue, 1, &row)
                let error = Marshal.GetLastPInvokeError()
                Marshal.FreeHGlobal(text)
                if inserted == 0 {
                    DestroyMenu(row.Submenu)
                    DestroyMenu(menu)
                    Marshal.SetLastPInvokeError(error)
                    return nint(0)
                }
            }
            return menu
        }

        private func ShortcutText(shortcut NativeMenuShortcut) string {
            let m = shortcut.Modifiers
            return (if m.Ctrl { "Ctrl+" } else { "" }) + (if m.Alt { "Alt+" } else { "" })
                + (if m.Shift { "Shift+" } else { "" }) + shortcut.Key.ToUpperInvariant()
        }

        private func BuildAccelerators(snapshot NativeMenuSnapshot, out status NativeMenuStatus, offset int32 = 0) nint {
            status = NativeMenuStatus.Success
            let entries = [snapshot.Actions.Count]MenuWinAccel
            var count = 0
            let seen = HashSet[uint32]()
            let layout = GetKeyboardLayout(0)
            for item in snapshot.Actions {
                if let shortcut = item.Shortcut {
                    if shortcut.Modifiers.Super || shortcut.Key.Length != 1 { status = NativeMenuStatus.Unsupported return nint(0) }
                    let mapping = VkKeyScanExW(uint16(Char.ToLowerInvariant(shortcut.Key[0])), layout)
                    if mapping == -1 || (int32(mapping) & 0xF800) != 0 { status = NativeMenuStatus.Unsupported return nint(0) }
                    let m = shortcut.Modifiers
                    let modifiers = uint8((int32(mapping) >> 8) | (if m.Shift { 1 } else { 0 })
                        | (if m.Ctrl { 2 } else { 0 }) | (if m.Alt { 4 } else { 0 }))
                    let flags = uint8(1 | ((int32(modifiers) & 1) << 2) | ((int32(modifiers) & 2) << 2) | ((int32(modifiers) & 4) << 2))
                    let key = uint16(int32(mapping) & 255)
                    if !seen.Add((uint32(flags) << 16) | uint32(key)) { status = NativeMenuStatus.Unsupported return nint(0) }
                    if item.Enabled {
                        entries[count] = MenuWinAccel{Flags: flags, Key: key, Command: uint16(snapshot.Tags[item.Id] + offset)}
                        count++
                    }
                }
            }
            if count == 0 { return nint(0) }
            fixed pointer *MenuWinAccel = entries {
                let result = CreateAcceleratorTableW(pointer, count)
                if result == nint(0) { status = NativeMenuStatus.Failed }
                return result
            }
        }

        private func Translate(data nint, pointer nint) uint8 {
            var message = Marshal.PtrToStructure[MenuWinMessage](pointer)
            try {
                if message.Message != uint32(0x100) && message.Message != uint32(0x104) { return 1 }
                let root = GetAncestor(message.Window, 2)
                if contexts.TryGetValue(root, out var context) {
                    return if context.Accelerators != nint(0) && TranslateAcceleratorW(root, context.Accelerators, &message) != 0 { uint8(0) } else { uint8(1) }
                }
                if bindings.TryGetValue(root, out var binding) && !binding.Closed && !binding.Owner.NativeOwnerClosing
                    && !binding.Owner.IsInputBlocked && binding.Accelerators != nint(0) {
                    if TranslateAcceleratorW(root, binding.Accelerators, &message) != 0 { return 0 }
                }
            } catch (error Exception) {
                if bindings.TryGetValue(message.Window, out var binding) { binding.Error = error.Message }
            }
            return 1
        }

        private func Dispatch(window nint, message uint32, wparam nuint, lparam nint, id nuint, data nuint) nint {
            try {
                if contexts.TryGetValue(window, out var context) {
                    if message == WmCommand && lparam == nint(0) {
                        let index = int32(wparam & nuint(0xFFFF)) - 0x8001
                        let snapshot = context.Snapshot!!
                        if index >= 0 && index < snapshot.Actions.Count && snapshot.Actions[index].Enabled {
                            context.Selected = snapshot.Actions[index].Id
                            EndMenu()
                            return nint(0)
                        }
                    }
                    return DefSubclassProc(window, message, wparam, lparam)
                }
                if bindings.TryGetValue(window, out var binding) {
                    if message == WmCommand && lparam == nint(0) {
                        let index = int32(wparam & nuint(0xFFFF)) - 1
                        let snapshot = binding.Snapshot
                        if !binding.Closed && snapshot != nil && index >= 0 && index < snapshot.Actions.Count {
                            let item = snapshot.Actions[index]
                            if item.Enabled && item.Items.Count == 0 && (binding.Tracking || !binding.Owner.IsInputBlocked) {
                                if binding.Tracking { binding.Selected = item.Id } else {
                                    binding.Owner.TryPost(() -> {
                                        if !binding.Closed && !binding.Owner.NativeOwnerClosing && !binding.Owner.IsInputBlocked { binding.Activate(item.Id) }
                                    })
                                }
                            }
                            return nint(0)
                        }
                    } else if message == WmEnterMenuLoop && !binding.Tracking {
                        binding.Lease = binding.Owner.BeginNativeModal(out var status)
                        if binding.Lease == nil { EndMenu() } else {
                            binding.Tracking = true
                            binding.Selected = ""
                            binding.Lease!!.Closing = () -> EndMenu()
                        }
                    } else if message == WmExitMenuLoop && binding.Tracking {
                        binding.Tracking = false
                        let lease = binding.Lease
                        binding.Lease = nil
                        let selected = binding.Selected
                        binding.Selected = ""
                        lease!!.PostCompletion(() -> {
                            lease?.Dispose()
                            if binding.Closed { Remove(binding) }
                            else if selected.Length != 0 {
                                binding.Owner.TryPost(() -> {
                                    if !binding.Closed && !binding.Owner.NativeOwnerClosing && !binding.Owner.IsInputBlocked { binding.Activate(selected) }
                                })
                            }
                        })
                    } else if message == WmInputLanguageChange && binding.Snapshot != nil {
                        let table = BuildAccelerators(binding.Snapshot!!, out var status)
                        let error = if status == NativeMenuStatus.Failed { Failure().Error } else { "" }
                        DestroyAcceleratorTable(binding.Accelerators)
                        binding.Accelerators = table
                        binding.Error = if status == NativeMenuStatus.Unsupported { "The current keyboard layout cannot represent the installed shortcuts" } else { error }
                    } else if message == uint32(0x82) { binding.Dispose() }
                }
            } catch (error Exception) {
                if contexts.TryGetValue(window, out var context) { context.Error = error.Message }
                else if bindings.TryGetValue(window, out var binding) { binding.Error = error.Message }
            }
            return DefSubclassProc(window, message, wparam, lparam)
        }

        internal func Remove(binding WindowsMenuBinding) {
            if binding.Handle == nint(0) { return }
            if binding.Tracking { EndMenu() return }
            if GetMenu(binding.Handle) == binding.Menu {
                SetMenu(binding.Handle, binding.Previous)
                DrawMenuBar(binding.Handle)
                binding.Owner.RefreshSchedulerMetrics()
            }
            RemoveWindowSubclass(binding.Handle, subclass, nuint(SubclassId))
            bindings.Remove(binding.Handle)
            DestroyMenu(binding.Menu)
            DestroyAcceleratorTable(binding.Accelerators)
            binding.Handle = nint(0)
            binding.Menu = nint(0)
            binding.Accelerators = nint(0)
            if bindings.Count == 0 && contexts.Count == 0 { SDL_SetWindowsMessageHook(nint(0), nint(0)) }
        }

        private func FilterMenuMessage(code int32, wparam nint, lparam nint) nint {
            if code == 2 {
                try {
                    var message = Marshal.PtrToStructure[MenuWinMessage](lparam)
                    if message.Message == uint32(0x100) || message.Message == uint32(0x104) {
                        for entry in contexts {
                            let context = entry.Value
                            if context.Accelerators != nint(0)
                                && TranslateAcceleratorW(entry.Key, context.Accelerators, &message) != 0 { return nint(1) }
                        }
                    }
                } catch (error Exception) {
                    for context in contexts.Values { context.Error = error.Message }
                    EndMenu()
                }
            }
            return CallNextHookEx(nint(0), code, wparam, lparam)
        }

        internal func ShowContext(owner Window, point Point, snapshot NativeMenuSnapshot, lease NativeModalLease) NativeMenuResult {
            if snapshot.Actions.Count > int16.MaxValue { return NativeMenuResult(NativeMenuStatus.Unsupported) }
            let table = BuildAccelerators(snapshot, out var status, 0x8000)
            if status != NativeMenuStatus.Success { return if status == NativeMenuStatus.Failed { Failure() } else { NativeMenuResult(status) } }
            let handle = SDL_GetPointerProperty(SDL_GetWindowProperties(lease.SDLWindow), "SDL.window.win32.hwnd", nint(0))
            if handle == nint(0) { DestroyAcceleratorTable(table) return NativeMenuResult(NativeMenuStatus.Unsupported) }
            let menu = Build(snapshot.Items, snapshot, false, 0x8000)
            if menu == nint(0) { DestroyAcceleratorTable(table) return Failure() }
            let context = WindowsMenuBinding(owner, (ignored string) -> { })
            context.Snapshot = snapshot
            context.Accelerators = table
            let ownsSubclass = !bindings.ContainsKey(handle)
            var filter = nint(0)
            try {
                if ownsSubclass && SetWindowSubclass(handle, subclass, nuint(SubclassId), nuint(0)) == 0 { return Failure() }
                contexts.Add(handle, context)
                SDL_SetWindowsMessageHook(Marshal.GetFunctionPointerForDelegate(hook), nint(0))
                filter = SetWindowsHookExW(-1, menuFilter, nint(0), GetCurrentThreadId())
                if filter == nint(0) { return Failure() }
                var location = MenuWinPoint{X: int32(Math.Round(float64(point.X * owner.UiScale))), Y: int32(Math.Round(float64(point.Y * owner.UiScale)))}
                if ClientToScreen(handle, &location) == 0 { return Failure() }
                lease.Closing = () -> EndMenu()
                SetLastError(0)
                let command = TrackPopupMenuEx(menu, uint32(0x102), location.X, location.Y, handle, nint(0))
                if context.Selected != "" { return NativeMenuResult(NativeMenuStatus.Success, context.Selected) }
                if context.Error != "" { return NativeMenuResult(NativeMenuStatus.Failed, error: context.Error) }
                if command == 0 {
                    return if Marshal.GetLastPInvokeError() == 0 { NativeMenuResult(NativeMenuStatus.Cancelled) } else { Failure() }
                }
                return NativeMenuResult(NativeMenuStatus.Success, snapshot.Actions[int32(command & uint32(0x7FFF)) - 1].Id)
            } finally {
                if filter != nint(0) { UnhookWindowsHookEx(filter) }
                lease.Closing = nil
                contexts.Remove(handle)
                if ownsSubclass { RemoveWindowSubclass(handle, subclass, nuint(SubclassId)) }
                if bindings.Count == 0 && contexts.Count == 0 { SDL_SetWindowsMessageHook(nint(0), nint(0)) }
                context.Dispose()
                DestroyAcceleratorTable(table)
                DestroyMenu(menu)
            }
        }
    }
}
