using Goo;
using System.Runtime.InteropServices;

internal static unsafe class WindowsSmoke
{
    private static readonly Subclass callback = Dispatch;
    private static bool select;
    private static nint current;

    internal static void Run(Window first, Window second, NativeMenuBar firstBar, NativeMenuBar secondBar,
        NativeMenuItem[] firstItems, NativeMenuItem[] secondItems, Func<int> firstCount, Func<int> secondCount)
    {
        Check(firstBar.SetItems(firstItems).Status == NativeMenuStatus.Success, "Install Windows first bar");
        Check(secondBar.SetItems(secondItems).Status == NativeMenuStatus.Success, "Install Windows second bar");
        var firstHandle = FindWindowW(null, first.Title);
        var secondHandle = FindWindowW(null, second.Title);
        Check(GetMenu(firstHandle) != 0 && GetMenu(secondHandle) != 0, "Per-window native menu bars");
        SendMessageW(firstHandle, 0x111, 1, 0);
        Check(firstCount() == 0, "Activation is posted, not called on native stack");
        first.Pump(0);
        Check(firstCount() == 1 && secondCount() == 0, "WM_COMMAND routes once");
        SendMessageW(firstHandle, 0x211, 0, 0);
        SendMessageW(firstHandle, 0x111, 1, 0);
        SendMessageW(firstHandle, 0x212, 0, 0);
        Check(first.IsInputBlocked && firstCount() == 1, "Tracking completion waits for native dispatch");
        first.Pump(0);
        Check(!first.IsInputBlocked && firstCount() == 2, "Tracking releases input before activation");
        Key(first, firstHandle);
        Check(firstCount() == 3 && secondCount() == 0, "First native accelerator routes once");
        Key(second, secondHandle);
        Check(firstCount() == 3 && secondCount() == 1, "Second native accelerator routes once");
        Console.WriteLine("Windows menu accelerators passed.");
        SendMessageW(secondHandle, 0x51, 0, GetKeyboardLayout(0));
        Key(second, secondHandle);
        Check(secondCount() == 2, "Accelerator rebuild after keyboard layout notification");
        current = secondHandle;
        Check(SetWindowSubclass(current, callback, 0x474E, 0) != 0, "Coexisting native subclass");
        try
        {
            select = true;
            var selected = NativeMenus.ShowContextMenuAsync(second, new Point { X = 10, Y = 10 },
                [new NativeMenuItem { Id = "other", Text = "Other" },
                    new NativeMenuItem { Id = "context", Text = "Context",
                    Shortcut = new NativeMenuShortcut { Key = "x", Modifiers = new KeyModifiers { Ctrl = true } } }]);
            Check(!selected.IsCompleted, "Native context launch is queued");
            Check(NativeMenus.ShowContextMenuAsync(second, new Point(), firstItems).Result.Status == NativeMenuStatus.Busy,
                "Concurrent native context menu is Busy");
            second.Pump(0);
            Check(selected.Result.Status == NativeMenuStatus.Success && selected.Result.ItemId == "context",
                "Native context accelerator returns selection");
            Check(secondCount() == 2, "Context selection does not activate the bar");
            Console.WriteLine("Windows native context selection passed.");
            select = false;
            var cancelled = NativeMenus.ShowContextMenuAsync(second, new Point(), firstItems);
            second.Pump(0);
            Check(cancelled.Result.Status == NativeMenuStatus.Cancelled && cancelled.Result.ItemId == "",
                "Native context cancellation is explicit");
        }
        finally { RemoveWindowSubclass(current, callback, 0x474E); }
        SendMessageW(firstHandle, 0x211, 0, 0);
        SendMessageW(firstHandle, 0x111, 1, 0);
        first.RequestClose();
        SendMessageW(firstHandle, 0x212, 0, 0);
        first.Pump(0);
        Check(!first.IsOpen && firstCount() == 3, "Owner close completes before queued tracking action");
        secondBar.Dispose();
        firstBar.Dispose();
        Check(GetMenu(firstHandle) == 0 && GetMenu(secondHandle) == 0, "Owned bars detach and free handles");
    }

    private static void Key(Window owner, nint window)
    {
        var saved = new byte[256];
        var keys = new byte[256];
        GetKeyboardState(saved);
        keys[0x11] = 0x80;
        keys[0x58] = 0x80;
        try
        {
            SetKeyboardState(keys);
            PostMessageW(window, 0x100, 0x58, 0);
            owner.Pump(0);
        }
        finally { SetKeyboardState(saved); }
    }

    private static nint Dispatch(nint window, uint message, nuint wparam, nint lparam, nuint id, nuint data)
    {
        if (message == 0x211)
        {
            Console.WriteLine("Windows native context tracking entered.");
            if (select)
            {
                SendMessageW(window, 0x111, 1, 0);
                var keys = new byte[256];
                GetKeyboardState(keys);
                keys[0x11] = 0x80;
                SetKeyboardState(keys);
                PostMessageW(window, 0x100, 0x58, 0);
            }
            else { PostMessageW(window, 0x1F, 0, 0); }
        }
        return DefSubclassProc(window, message, wparam, lparam);
    }

    private static void Check(bool condition, string message)
    {
        if (!condition) throw new InvalidOperationException(message);
    }

    private delegate nint Subclass(nint window, uint message, nuint wparam, nint lparam, nuint id, nuint data);
    [DllImport("user32.dll", CharSet = CharSet.Unicode)] private static extern nint FindWindowW(string? name, string title);
    [DllImport("user32.dll")] private static extern nint GetMenu(nint window);
    [DllImport("user32.dll")] private static extern nint SendMessageW(nint window, uint message, nuint wparam, nint lparam);
    [DllImport("user32.dll")] private static extern int PostMessageW(nint window, uint message, nuint wparam, nint lparam);
    [DllImport("user32.dll")] private static extern int GetKeyboardState(byte[] keys);
    [DllImport("user32.dll")] private static extern int SetKeyboardState(byte[] keys);
    [DllImport("user32.dll")] private static extern nint GetKeyboardLayout(uint thread);
    [DllImport("comctl32.dll")] private static extern int SetWindowSubclass(nint window, Subclass proc, nuint id, nuint data);
    [DllImport("comctl32.dll")] private static extern int RemoveWindowSubclass(nint window, Subclass proc, nuint id);
    [DllImport("comctl32.dll")] private static extern nint DefSubclassProc(nint window, uint message, nuint wparam, nint lparam);
}
