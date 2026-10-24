import Goo
import System
import System.Runtime.InteropServices

func Model(id string)[]NativeMenuItem -> []NativeMenuItem{
    NativeMenuItem{
        Id: id + ".menu",
        Text: "Document",
        Items: []NativeMenuItem{
            NativeMenuItem{
                Id: id,
                Text: "Action",
                Checked: true,
                Shortcut: NativeMenuShortcut{
                    Key: "X",
                    Modifiers: KeyModifiers{Super: OperatingSystem.IsMacOS(), Ctrl: OperatingSystem.IsWindows()}
                }
            },
            NativeMenuItem{Id: id + ".disabled", Text: "Disabled", Enabled: false}
        }
    }
}

func Check(condition bool, message string) {
    if !condition {
        throw InvalidOperationException(message)
    }
}

internal unsafe shared class Mac {
    @StructLayout(LayoutKind.Sequential)
    private struct MacPoint {
        var X float64
        var Y float64
    }

    private const Objc string = "/usr/lib/libobjc.A.dylib"
    private var observer nint
    var SelectContext bool

    @DllImport("/usr/lib/libobjc.A.dylib", EntryPoint = "objc_getClass")
    func Class(name string) nint;

    @DllImport("/usr/lib/libobjc.A.dylib", EntryPoint = "sel_registerName")
    func Sel(name string) nint;

    @DllImport("/usr/lib/libobjc.A.dylib", EntryPoint = "objc_msgSend")
    func Send(value nint, selector nint) nint;

    @DllImport("/usr/lib/libobjc.A.dylib", EntryPoint = "objc_msgSend")
    private func Arg(value nint, selector nint, arg nint) nint;

    @DllImport("/usr/lib/libobjc.A.dylib", EntryPoint = "objc_msgSend")
    private func Text(value nint, selector nint, text string) nint;

    @DllImport("/usr/lib/libobjc.A.dylib", EntryPoint = "objc_msgSend")
    private func Event(
        value nint,
        selector nint,
        type nuint,
        point MacPoint,
        flags nuint,
        timestamp float64,
        number nint,
        context nint,
        characters nint,
        charactersIgnoringModifiers nint,
        repeat uint8,
        keyCode uint16
    ) nint;

    @DllImport("/usr/lib/libobjc.A.dylib", EntryPoint = "objc_msgSend")
    private func Schedule(value nint, selector nint, action nint, obj nint, delay float64, modes nint);

    @DllImport("/usr/lib/libobjc.A.dylib", EntryPoint = "objc_msgSend")
    private func Observe(value nint, selector nint, target nint, action nint, name nint, obj nint);

    @DllImport("/usr/lib/libobjc.A.dylib")
    private func objc_allocateClassPair(parent nint, name string, extra nuint) nint;

    @DllImport("/usr/lib/libobjc.A.dylib")
    private func objc_registerClassPair(value nint);

    @DllImport("/usr/lib/libobjc.A.dylib")
    private func class_addMethod(value nint, selector nint, action nint, types string) uint8;

    private func String(text string) nint -> Mac.Text(Class("NSString"), Sel("stringWithUTF8String:"), text)

    func KeyWindow(title string) {
        let windows = Send(Send(Class("NSApplication"), Sel("sharedApplication")), Sel("windows"))
        for var i = 0; i < int32(Send(windows, Sel("count"))); i++ {
            let window = Arg(windows, Sel("objectAtIndex:"), i)
            let text = Send(Send(window, Sel("title")), Sel("UTF8String"))
            if Marshal.PtrToStringUTF8(text) == title {
                Arg(window, Sel("makeKeyAndOrderFront:"), 0)
                return
            }
        }
        throw InvalidOperationException("Native owner window not found")
    }

    func Equivalent(key string) {
        let app = Send(Class("NSApplication"), Sel("sharedApplication"))
        let window = Send(app, Sel("keyWindow"))
        if window == 0 {
            throw InvalidOperationException("AppKit did not make the requested window key")
        }
        let e = Event(
            Class("NSEvent"),
            Sel(
                "keyEventWithType:location:modifierFlags:timestamp:windowNumber:context:characters:charactersIgnoringModifiers:isARepeat:keyCode:"
            ),
            10,
            MacPoint{},
            1u << 20,
            0.0,
            Send(window, Sel("windowNumber")),
            0,
            Mac.String(key),
            Mac.String(key),
            0,
            7
        )
        if Arg(Send(app, Sel("mainMenu")), Sel("performKeyEquivalent:"), e) == 0 {
            throw InvalidOperationException("AppKit did not consume the native key equivalent")
        }
    }

    func ObserveTracking() {
        let type = objc_allocateClassPair(Class("NSObject"), "GooNativeMenuSmokeObserver", 0)
        class_addMethod(type, Sel("began:"), nint(&Began), "v@:@")
        objc_registerClassPair(type)
        observer = Send(Send(type, Sel("alloc")), Sel("init"))
        Observe(
            Send(Class("NSNotificationCenter"), Sel("defaultCenter")),
            Sel("addObserver:selector:name:object:"),
            observer,
            Sel("began:"),
            Mac.String("NSMenuDidBeginTrackingNotification"),
            0
        )
    }

    @UnmanagedCallersOnly
    private func Began(receiver nint, selector nint, notification nint) {
        let menu = Send(notification, Sel("object"))
        if SelectContext {
            Arg(menu, Sel("performActionForItemAtIndex:"), 0)
        }
        let modes = Arg(Class("NSArray"), Sel("arrayWithObject:"), Mac.String("NSEventTrackingRunLoopMode"))
        Schedule(menu, Sel("performSelector:withObject:afterDelay:inModes:"), Sel("cancelTracking"), 0, 0.0, modes)
    }
}

let first = Window{Title: "Native menu first", Width: 240, Height: 160}.Open()
let second = Window{Title: "Native menu second", Width: 240, Height: 160}.Open()

try {
    first.Pump(0.0)
    second.Pump(0.0)
    using let firstBar = NativeMenuBar(first)
    using let secondBar = NativeMenuBar(second)
    var firstCount = 0
    var secondCount = 0
    firstBar.Activated += (id string) -> {
        Check(id == "first", "First activation ID")
        firstCount++
    }
    secondBar.Activated += (id string) -> {
        Check(id == "second", "Second activation ID")
        secondCount++
    }
    let firstItems = Model("first")
    let secondItems = Model("second")
    try {
        firstBar.SetItems([]NativeMenuItem{NativeMenuItem{Id: "duplicate"}, NativeMenuItem{Id: "duplicate"}})
        throw InvalidOperationException("Duplicate identifiers accepted")
    } catch (ArgumentException) { }
    if OperatingSystem.IsWindows() || OperatingSystem.IsMacOS() {
        let child = Window{Owner: second, Title: "Native menu child", Width: 160, Height: 120}.Open()
        let pending = NativeMenus.ShowContextMenuAsync(child, Point(), firstItems)
        let conflict = NativeMenus.ShowContextMenuAsync(second, Point(), secondItems)
        Check(
            conflict.IsCompleted && conflict.Result.Status == NativeMenuStatus.Busy,
            "Owner chain is Busy before launch"
        )
        child.RequestClose()
        child.Pump(0.0)
        Check(
            pending.IsCompleted && pending.Result.Status == NativeMenuStatus.OwnerClosed && !child.IsOpen,
            "Owner close before native launch completes once"
        )
    }
    if OperatingSystem.IsWindows() {
        WindowsSmoke.Run(
            first,
            second,
            firstBar,
            secondBar,
            firstItems,
            secondItems,
            () -> firstCount,
            () -> secondCount
        )
    } else if !OperatingSystem.IsMacOS() {
        Check(firstBar.SetItems(firstItems).Status == NativeMenuStatus.Unsupported, "Unsupported native bar")
        Check(
            NativeMenus.ShowContextMenuAsync(first, Point(), firstItems).Result.Status == NativeMenuStatus.Unsupported,
            "Unsupported native context menu"
        )
    } else {
        let application = Mac.Send(Mac.Class("NSApplication"), Mac.Sel("sharedApplication"))
        let original = Mac.Send(application, Mac.Sel("mainMenu"))
        let services = Mac.Send(application, Mac.Sel("servicesMenu"))
        let windows = Mac.Send(application, Mac.Sel("windowsMenu"))
        Check(firstBar.SetItems(firstItems).Status == NativeMenuStatus.Success, "Install first bar")
        Check(secondBar.SetItems(secondItems).Status == NativeMenuStatus.Success, "Install second bar")
        Mac.KeyWindow("Native menu first")
        first.Pump(0.0)
        Mac.Equivalent("x")
        first.Pump(0.0)
        Check(firstCount == 1 && secondCount == 0, "First window accelerator routes once")
        Mac.KeyWindow("Native menu second")
        second.Pump(0.0)
        Mac.Equivalent("x")
        second.Pump(0.0)
        Check(firstCount == 1 && secondCount == 1, "Second window accelerator routes once")
        Check(Mac.Send(application, Mac.Sel("servicesMenu")) == services, "Preserve Services menu")
        Check(Mac.Send(application, Mac.Sel("windowsMenu")) == windows, "Preserve system Window menu")
        Console.WriteLine("macOS menu accelerators passed.")
        Mac.ObserveTracking()
        Mac.SelectContext = true
        let context = NativeMenus.ShowContextMenuAsync(
            second,
            Point{X: 10.0, Y: 10.0},
            []NativeMenuItem{NativeMenuItem{Id: "context", Text: "Context"}}
        )
        Check(!context.IsCompleted, "Context launch is queued")
        Check(
            NativeMenus.ShowContextMenuAsync(second, Point(), firstItems).Result.Status == NativeMenuStatus.Busy,
            "Concurrent context menu is Busy"
        )
        second.Pump(0.0)
        Check(
            context.Result.Status == NativeMenuStatus.Success && context.Result.ItemId == "context",
            "Context selection completes once with its ID: ${context.Result.Status}, ${context.Result.ItemId}, ${context.Result.Error}"
        )
        Console.WriteLine("macOS native context selection passed.")
        Check(secondCount == 1, "Context selection has no bar callback")
        Mac.SelectContext = false
        let cancelled = NativeMenus.ShowContextMenuAsync(second, Point(), firstItems)
        second.Pump(0.0)
        Check(
            cancelled.Result.Status == NativeMenuStatus.Cancelled && cancelled.Result.ItemId == "",
            "Context cancellation is explicit"
        )
        secondBar.Dispose()
        firstBar.Dispose()
        Check(Mac.Send(application, Mac.Sel("mainMenu")) == original, "Restore captured default menu")
    }
    Console.WriteLine("Native menu smoke passed.")
} finally {
    first.RequestClose()
    second.RequestClose()
    if first.IsOpen {
        first.Run()
    } else if second.IsOpen {
        second.Run()
    }
}
