using Goo;
using System.Runtime.InteropServices;

var first = new Window { Title = "Native menu first", Width = 240, Height = 160 }.Open();
var second = new Window { Title = "Native menu second", Width = 240, Height = 160 }.Open();
try
{
    first.Pump(0);
    second.Pump(0);
    using var firstBar = new NativeMenuBar(first);
    using var secondBar = new NativeMenuBar(second);
    var firstCount = 0;
    var secondCount = 0;
    firstBar.Activated += id => { Check(id == "first", "First activation ID"); firstCount++; };
    secondBar.Activated += id => { Check(id == "second", "Second activation ID"); secondCount++; };
    var firstItems = Model("first");
    var secondItems = Model("second");
    try
    {
        firstBar.SetItems([new NativeMenuItem { Id = "duplicate" }, new NativeMenuItem { Id = "duplicate" }]);
        throw new InvalidOperationException("Duplicate identifiers accepted");
    }
    catch (ArgumentException) { }
    if (OperatingSystem.IsWindows() || OperatingSystem.IsMacOS())
    {
        var child = new Window { Owner = second, Title = "Native menu child", Width = 160, Height = 120 }.Open();
        var pending = NativeMenus.ShowContextMenuAsync(child, new Point(), firstItems);
        var conflict = NativeMenus.ShowContextMenuAsync(second, new Point(), secondItems);
        Check(conflict.IsCompleted && conflict.Result.Status == NativeMenuStatus.Busy, "Owner chain is Busy before launch");
        child.RequestClose();
        child.Pump(0);
        Check(pending.IsCompleted && pending.Result.Status == NativeMenuStatus.OwnerClosed && !child.IsOpen,
            "Owner close before native launch completes once");
    }
    if (OperatingSystem.IsWindows())
    {
        WindowsSmoke.Run(first, second, firstBar, secondBar, firstItems, secondItems, () => firstCount, () => secondCount);
    }
    else if (!OperatingSystem.IsMacOS())
    {
        Check(firstBar.SetItems(firstItems).Status == NativeMenuStatus.Unsupported, "Unsupported native bar");
        Check(NativeMenus.ShowContextMenuAsync(first, new Point(), firstItems).Result.Status == NativeMenuStatus.Unsupported,
            "Unsupported native context menu");
    }
    else
    {
        var application = Mac.Send(Mac.Class("NSApplication"), Mac.Sel("sharedApplication"));
        var original = Mac.Send(application, Mac.Sel("mainMenu"));
        var services = Mac.Send(application, Mac.Sel("servicesMenu"));
        var windows = Mac.Send(application, Mac.Sel("windowsMenu"));
        Check(firstBar.SetItems(firstItems).Status == NativeMenuStatus.Success, "Install first bar");
        Check(secondBar.SetItems(secondItems).Status == NativeMenuStatus.Success, "Install second bar");
        Mac.KeyWindow("Native menu first");
        first.Pump(0);
        Mac.Equivalent("x");
        first.Pump(0);
        Check(firstCount == 1 && secondCount == 0, "First window accelerator routes once");
        Mac.KeyWindow("Native menu second");
        second.Pump(0);
        Mac.Equivalent("x");
        second.Pump(0);
        Check(firstCount == 1 && secondCount == 1, "Second window accelerator routes once");
        Check(Mac.Send(application, Mac.Sel("servicesMenu")) == services, "Preserve Services menu");
        Check(Mac.Send(application, Mac.Sel("windowsMenu")) == windows, "Preserve system Window menu");
        Console.WriteLine("macOS menu accelerators passed.");
        Mac.ObserveTracking();
        Mac.SelectContext = true;
        var context = NativeMenus.ShowContextMenuAsync(second, new Point { X = 10, Y = 10 },
            [new NativeMenuItem { Id = "context", Text = "Context" }]);
        Check(!context.IsCompleted, "Context launch is queued");
        Check(NativeMenus.ShowContextMenuAsync(second, new Point(), firstItems).Result.Status == NativeMenuStatus.Busy,
            "Concurrent context menu is Busy");
        second.Pump(0);
        Check(context.Result.Status == NativeMenuStatus.Success && context.Result.ItemId == "context",
            $"Context selection completes once with its ID: {context.Result.Status}, {context.Result.ItemId}, {context.Result.Error}");
        Console.WriteLine("macOS native context selection passed.");
        Check(secondCount == 1, "Context selection has no bar callback");
        Mac.SelectContext = false;
        var cancelled = NativeMenus.ShowContextMenuAsync(second, new Point(), firstItems);
        second.Pump(0);
        Check(cancelled.Result.Status == NativeMenuStatus.Cancelled && cancelled.Result.ItemId == "",
            "Context cancellation is explicit");
        secondBar.Dispose();
        firstBar.Dispose();
        Check(Mac.Send(application, Mac.Sel("mainMenu")) == original, "Restore captured default menu");
    }
    Console.WriteLine("Native menu smoke passed.");
}
finally
{
    first.RequestClose();
    second.RequestClose();
    if (first.IsOpen) first.Run();
    else if (second.IsOpen) second.Run();
}

static NativeMenuItem[] Model(string id) =>
[
    new NativeMenuItem
    {
        Id = id + ".menu", Text = "Document",
        Items = [new NativeMenuItem
        {
            Id = id, Text = "Action", Checked = true,
            Shortcut = new NativeMenuShortcut { Key = "X", Modifiers = new KeyModifiers
                { Super = OperatingSystem.IsMacOS(), Ctrl = OperatingSystem.IsWindows() } }
        }, new NativeMenuItem { Id = id + ".disabled", Text = "Disabled", Enabled = false }]
    }
];

static void Check(bool condition, string message)
{
    if (!condition) throw new InvalidOperationException(message);
}

static unsafe class Mac
{
    private const string Objc = "/usr/lib/libobjc.A.dylib";
    private static nint observer;
    public static bool SelectContext;
    [DllImport(Objc, EntryPoint = "objc_getClass")] public static extern nint Class(string name);
    [DllImport(Objc, EntryPoint = "sel_registerName")] public static extern nint Sel(string name);
    [DllImport(Objc, EntryPoint = "objc_msgSend")] public static extern nint Send(nint value, nint selector);
    [DllImport(Objc, EntryPoint = "objc_msgSend")] private static extern nint Arg(nint value, nint selector, nint arg);
    [DllImport(Objc, EntryPoint = "objc_msgSend")] private static extern nint Text(nint value, nint selector, string text);
    [DllImport(Objc, EntryPoint = "objc_msgSend")] private static extern nint Event(nint value, nint selector,
        nuint type, MacPoint point, nuint flags, double timestamp, nint number, nint context,
        nint characters, nint charactersIgnoringModifiers, byte repeat, ushort keyCode);
    [DllImport(Objc, EntryPoint = "objc_msgSend")] private static extern void Schedule(nint value, nint selector,
        nint action, nint obj, double delay, nint modes);
    [DllImport(Objc, EntryPoint = "objc_msgSend")] private static extern void Observe(nint value, nint selector,
        nint target, nint action, nint name, nint obj);
    [DllImport(Objc)] private static extern nint objc_allocateClassPair(nint parent, string name, nuint extra);
    [DllImport(Objc)] private static extern void objc_registerClassPair(nint value);
    [DllImport(Objc)] private static extern byte class_addMethod(nint value, nint selector,
        delegate* unmanaged<nint, nint, nint, void> action, string types);
    private static nint String(string text) => Text(Class("NSString"), Sel("stringWithUTF8String:"), text);

    public static void KeyWindow(string title)
    {
        var windows = Send(Send(Class("NSApplication"), Sel("sharedApplication")), Sel("windows"));
        for (var i = 0; i < (int)Send(windows, Sel("count")); i++)
        {
            var window = Arg(windows, Sel("objectAtIndex:"), i);
            var text = Send(Send(window, Sel("title")), Sel("UTF8String"));
            if (Marshal.PtrToStringUTF8(text) == title)
            {
                Arg(window, Sel("makeKeyAndOrderFront:"), 0);
                return;
            }
        }
        throw new InvalidOperationException("Native owner window not found");
    }

    public static void Equivalent(string key)
    {
        var app = Send(Class("NSApplication"), Sel("sharedApplication"));
        var window = Send(app, Sel("keyWindow"));
        if (window == 0) throw new InvalidOperationException("AppKit did not make the requested window key");
        var e = Event(Class("NSEvent"), Sel("keyEventWithType:location:modifierFlags:timestamp:windowNumber:context:characters:charactersIgnoringModifiers:isARepeat:keyCode:"),
            10, new MacPoint(), 1u << 20, 0, Send(window, Sel("windowNumber")), 0, String(key), String(key), 0, 7);
        if (Arg(Send(app, Sel("mainMenu")), Sel("performKeyEquivalent:"), e) == 0)
            throw new InvalidOperationException("AppKit did not consume the native key equivalent");
    }

    public static void ObserveTracking()
    {
        var type = objc_allocateClassPair(Class("NSObject"), "GooNativeMenuSmokeObserver", 0);
        class_addMethod(type, Sel("began:"), &Began, "v@:@");
        objc_registerClassPair(type);
        observer = Send(Send(type, Sel("alloc")), Sel("init"));
        Observe(Send(Class("NSNotificationCenter"), Sel("defaultCenter")), Sel("addObserver:selector:name:object:"),
            observer, Sel("began:"), String("NSMenuDidBeginTrackingNotification"), 0);
    }

    [UnmanagedCallersOnly]
    private static void Began(nint receiver, nint selector, nint notification)
    {
        var menu = Send(notification, Sel("object"));
        if (SelectContext) Arg(menu, Sel("performActionForItemAtIndex:"), 0);
        var modes = Arg(Class("NSArray"), Sel("arrayWithObject:"), String("NSEventTrackingRunLoopMode"));
        Schedule(menu, Sel("performSelector:withObject:afterDelay:inModes:"), Sel("cancelTracking"), 0, 0, modes);
    }

    [StructLayout(LayoutKind.Sequential)]
    private struct MacPoint { public double X; public double Y; }
}
