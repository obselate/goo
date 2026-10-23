import Goo
import System
import System.Runtime.InteropServices

internal unsafe shared class WindowsSmoke {
    private let callback WindowsSmoke_Subclass = Dispatch
    private var $select bool
    private var current nint

    internal func Run(
        first Window,
        second Window,
        firstBar NativeMenuBar,
        secondBar NativeMenuBar,
        firstItems[]NativeMenuItem,
        secondItems[]NativeMenuItem,
        firstCount() -> int32,
        secondCount() -> int32
    ) {
        Check(firstBar.SetItems(firstItems).Status == NativeMenuStatus.Success, "Install Windows first bar")
        Check(secondBar.SetItems(secondItems).Status == NativeMenuStatus.Success, "Install Windows second bar")
        let firstHandle = FindWindowW(0, first.Title)
        let secondHandle = FindWindowW(0, second.Title)
        Check(GetMenu(firstHandle) != 0 && GetMenu(secondHandle) != 0, "Per-window native menu bars")
        SendMessageW(firstHandle, 0x111, 1, 0)
        Check(firstCount() == 0, "Activation is posted, not called on native stack")
        first.Pump(0.0)
        Check(firstCount() == 1 && secondCount() == 0, "WM_COMMAND routes once")
        SendMessageW(firstHandle, 0x211, 0, 0)
        SendMessageW(firstHandle, 0x111, 1, 0)
        SendMessageW(firstHandle, 0x212, 0, 0)
        Check(first.IsInputBlocked && firstCount() == 1, "Tracking completion waits for native dispatch")
        first.Pump(0.0)
        Check(!first.IsInputBlocked && firstCount() == 2, "Tracking releases input before activation")
        WindowsSmoke.Key(first, firstHandle)
        Check(firstCount() == 3 && secondCount() == 0, "First native accelerator routes once")
        WindowsSmoke.Key(second, secondHandle)
        Check(firstCount() == 3 && secondCount() == 1, "Second native accelerator routes once")
        Console.WriteLine("Windows menu accelerators passed.")
        SendMessageW(secondHandle, 0x51, 0, GetKeyboardLayout(0))
        WindowsSmoke.Key(second, secondHandle)
        Check(secondCount() == 2, "Accelerator rebuild after keyboard layout notification")
        current = secondHandle
        Check(SetWindowSubclass(current, callback, 0x474E, 0) != 0, "Coexisting native subclass")
        try {
            $select = true
            let selected = NativeMenus.ShowContextMenuAsync(
                second,
                Point{X: 10.0, Y: 10.0},
                []NativeMenuItem{
                    NativeMenuItem{Id: "other", Text: "Other"},
                    NativeMenuItem{
                        Id: "context",
                        Text: "Context",
                        Shortcut: NativeMenuShortcut{Key: "x", Modifiers: KeyModifiers{Ctrl: true}}
                    }
                }
            )
            Check(!selected.IsCompleted, "Native context launch is queued")
            Check(
                NativeMenus.ShowContextMenuAsync(second, Point(), firstItems).Result.Status == NativeMenuStatus.Busy,
                "Concurrent native context menu is Busy"
            )
            second.Pump(0.0)
            Check(
                selected.Result.Status == NativeMenuStatus.Success && selected.Result.ItemId == "context",
                "Native context accelerator returns selection"
            )
            Check(secondCount() == 2, "Context selection does not activate the bar")
            Console.WriteLine("Windows native context selection passed.")
            $select = false
            let cancelled = NativeMenus.ShowContextMenuAsync(second, Point(), firstItems)
            second.Pump(0.0)
            Check(
                cancelled.Result.Status == NativeMenuStatus.Cancelled && cancelled.Result.ItemId == "",
                "Native context cancellation is explicit"
            )
        } finally {
            RemoveWindowSubclass(current, callback, 0x474E)
        }
        SendMessageW(firstHandle, 0x211, 0, 0)
        SendMessageW(firstHandle, 0x111, 1, 0)
        first.RequestClose()
        SendMessageW(firstHandle, 0x212, 0, 0)
        first.Pump(0.0)
        Check(!first.IsOpen && firstCount() == 3, "Owner close completes before queued tracking action")
        secondBar.Dispose()
        firstBar.Dispose()
        Check(GetMenu(firstHandle) == 0 && GetMenu(secondHandle) == 0, "Owned bars detach and free handles")
    }

    private func Key(owner Window, window nint) {
        let saved = [256]uint8
        let keys = [256]uint8
        GetKeyboardState(saved)
        keys[0x11] = uint8(0x80)
        keys[0x58] = uint8(0x80)
        try {
            SetKeyboardState(keys)
            PostMessageW(window, 0x100, 0x58, 0)
            owner.Pump(0.0)
        } finally {
            SetKeyboardState(saved)
        }
    }

    private func Dispatch(window nint, message uint32, wparam nuint, lparam nint, id nuint, data nuint) nint {
        if message == uint32(0x211) {
            Console.WriteLine("Windows native context tracking entered.")
            if $select {
                SendMessageW(window, 0x111, 1, 0)
                let keys = [256]uint8
                GetKeyboardState(keys)
                keys[0x11] = uint8(0x80)
                SetKeyboardState(keys)
                PostMessageW(window, 0x100, 0x58, 0)
            } else {
                PostMessageW(window, 0x1F, 0, 0)
            }
        }
        return DefSubclassProc(window, message, wparam, lparam)
    }

    private func Check(condition bool, message string) {
        if !condition {
            throw InvalidOperationException(message)
        }
    }

    @DllImport("user32.dll", CharSet = CharSet.Unicode)
    private func FindWindowW(name nint, title string) nint;

    @DllImport("user32.dll")
    private func GetMenu(window nint) nint;

    @DllImport("user32.dll")
    private func SendMessageW(window nint, message uint32, wparam nuint, lparam nint) nint;

    @DllImport("user32.dll")
    private func PostMessageW(window nint, message uint32, wparam nuint, lparam nint) int32;

    @DllImport("user32.dll")
    private func GetKeyboardState(keys[]uint8) int32;

    @DllImport("user32.dll")
    private func SetKeyboardState(keys[]uint8) int32;

    @DllImport("user32.dll")
    private func GetKeyboardLayout(thread uint32) nint;

    @DllImport("comctl32.dll")
    private func SetWindowSubclass(window nint, proc WindowsSmoke_Subclass, id nuint, data nuint) int32;

    @DllImport("comctl32.dll")
    private func RemoveWindowSubclass(window nint, proc WindowsSmoke_Subclass, id nuint) int32;

    @DllImport("comctl32.dll")
    private func DefSubclassProc(window nint, message uint32, wparam nuint, lparam nint) nint;
}

@UnmanagedFunctionPointer(CallingConvention.Winapi)
internal delegate WindowsSmoke_Subclass(
    window nint,
    message uint32,
    wparam nuint,
    lparam nint,
    id nuint,
    data nuint
) nint;
