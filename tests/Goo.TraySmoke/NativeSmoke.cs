using Goo;
using System.Reflection;
using System.Runtime.InteropServices;

internal static class MacSmoke
{
    internal static void Invoke(object backend)
    {
        var menu = (nint)backend.GetType().GetField("menu", BindingFlags.Instance | BindingFlags.NonPublic)!.GetValue(backend)!;
        if (menu == 0 || Send(menu, Sel("numberOfItems")) != 2)
            throw new InvalidOperationException("Native status menu not installed");
        Arg(menu, Sel("performActionForItemAtIndex:"), 0);
    }

    [DllImport("/usr/lib/libobjc.A.dylib", EntryPoint = "sel_registerName")] private static extern nint Sel(string name);
    [DllImport("/usr/lib/libobjc.A.dylib", EntryPoint = "objc_msgSend")] private static extern nint Send(nint value, nint selector);
    [DllImport("/usr/lib/libobjc.A.dylib", EntryPoint = "objc_msgSend")] private static extern nint Arg(nint value, nint selector, nint argument);
}

internal static class WindowsSmoke
{
    private static readonly Subclass callback = Dispatch;

    internal static void Invoke(Window owner, object backend)
    {
        var flags = BindingFlags.NonPublic | BindingFlags.Instance;
        var window = (nint)backend.GetType().GetField("window", flags)!.GetValue(backend)!;
        var id = (uint)backend.GetType().GetField("id", flags)!.GetValue(backend)!;
        var message = RegisterWindowMessageW("Goo.Tray.Callback.1");
        SendMessageW(window, message, 0, (nint)((id << 16) | 0x400));
        if (SetWindowSubclass(window, callback, 0x4754, 0) == 0)
            throw new InvalidOperationException("Install menu tracking observer");
        try
        {
            SendMessageW(window, message, 0, (nint)((id << 16) | 0x7B));
            using var timeout = new Timer(_ => PostMessageW(window, 0x1F, 0, 0),
                null, TimeSpan.FromSeconds(10), Timeout.InfiniteTimeSpan);
            owner.Pump(0);
        }
        finally { RemoveWindowSubclass(window, callback, 0x4754); }
    }

    private static nint Dispatch(nint window, uint message, nuint wparam, nint lparam, nuint id, nuint data)
    {
        if (message == 0x211)
        {
            PostMessageW(window, 0x100, 0x28, 0);
            PostMessageW(window, 0x100, 0x0D, 0);
        }
        return DefSubclassProc(window, message, wparam, lparam);
    }

    private delegate nint Subclass(nint window, uint message, nuint wparam, nint lparam, nuint id, nuint data);
    [DllImport("user32.dll", CharSet = CharSet.Unicode)] private static extern uint RegisterWindowMessageW(string name);
    [DllImport("user32.dll")] private static extern nint SendMessageW(nint window, uint message, nuint wparam, nint lparam);
    [DllImport("user32.dll")] private static extern int PostMessageW(nint window, uint message, nuint wparam, nint lparam);
    [DllImport("comctl32.dll")] private static extern int SetWindowSubclass(nint window, Subclass proc, nuint id, nuint data);
    [DllImport("comctl32.dll")] private static extern int RemoveWindowSubclass(nint window, Subclass proc, nuint id);
    [DllImport("comctl32.dll")] private static extern nint DefSubclassProc(nint window, uint message, nuint wparam, nint lparam);
}
