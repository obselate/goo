package Goo

import System
import System.Collections.Generic
import System.Runtime.InteropServices

@StructLayout(LayoutKind.Sequential)
internal struct MenuMacPoint {
    internal var X float64
    internal var Y float64
}

@StructLayout(LayoutKind.Sequential)
internal struct MenuMacRect {
    internal var X float64
    internal var Y float64
    internal var Width float64
    internal var Height float64
}

@UnmanagedFunctionPointer(CallingConvention.Cdecl)
internal delegate MenuMacCallback(receiver nint, selector nint, argument nint);

internal sealed class NativeMenuBinding : IDisposable {
    internal let Owner Window
    internal let Activate Action[string]
    internal var Snapshot NativeMenuSnapshot?
    internal var Menu nint
    internal var Target nint
    internal var Handle nint
    internal var Selected string = ""
    internal var Tracking bool
    internal var Closed bool
    internal var Lease NativeModalLease?
    internal var Error string = ""
    private let closing Action

    internal init(owner Window, activate Action[string]) {
        Owner = owner
        Activate = activate
        closing = Dispose
        owner.NativeWindowClosing += closing
    }

    internal func SetItems(snapshot NativeMenuSnapshot) NativeMenuResult -> MacMenuBridge.Install(this, snapshot)

    public func Dispose() {
        Owner.RequireNativeServiceThread()
        if Closed { return }
        Closed = true
        Owner.NativeWindowClosing -= closing
        MacMenuBridge.Remove(this)
    }
}

internal sealed class MacMenuBridge {
    shared {
        private let bindings Dictionary[nint, NativeMenuBinding] = Dictionary[nint, NativeMenuBinding]()
        private let targets Dictionary[nint, NativeMenuBinding] = Dictionary[nint, NativeMenuBinding]()
        private let callback MenuMacCallback = Dispatch
        private var targetClass nint
        private var baseline nint
        private var active nint
        private var tracking int32
        private var activeBinding NativeMenuBinding?
        private let documentItems List[nint] = List[nint]()
        @DllImport("/usr/lib/libobjc.A.dylib") private func objc_getClass(name string) nint;
        @DllImport("/usr/lib/libobjc.A.dylib") private func objc_allocateClassPair(parent nint, name string, extra nuint) nint;
        @DllImport("/usr/lib/libobjc.A.dylib") private func objc_registerClassPair(value nint);
        @DllImport("/usr/lib/libobjc.A.dylib") private func class_addMethod(value nint, selector nint, callback nint, types string) uint8;
        @DllImport("/usr/lib/libobjc.A.dylib") private func sel_registerName(name string) nint;
        @DllImport("/usr/lib/libobjc.A.dylib", EntryPoint: "objc_msgSend") private func Send(value nint, selector nint) nint;
        @DllImport("/usr/lib/libobjc.A.dylib", EntryPoint: "objc_msgSend") private func Arg(value nint, selector nint, argument nint) nint;
        @DllImport("/usr/lib/libobjc.A.dylib", EntryPoint: "objc_msgSend") private func Text(value nint, selector nint, text string) nint;
        @DllImport("/usr/lib/libobjc.A.dylib", EntryPoint: "objc_msgSend") private func InitItem(value nint, selector nint, title nint, action nint, equivalent nint) nint;
        @DllImport("/usr/lib/libobjc.A.dylib", EntryPoint: "objc_msgSend") private func Observe(value nint, selector nint, observer nint, action nint, name nint, object nint);
        @DllImport("/usr/lib/libobjc.A.dylib", EntryPoint: "objc_msgSend") private func At(value nint, selector nint, index nint) nint;
        @DllImport("/usr/lib/libobjc.A.dylib", EntryPoint: "objc_msgSend") private func Bool(value nint, selector nint) uint8;
        @DllImport("/usr/lib/libobjc.A.dylib", EntryPoint: "objc_msgSend") private func Popup(value nint, selector nint, item nint, point MenuMacPoint, view nint) uint8;
        @DllImport("/usr/lib/libobjc.A.dylib", EntryPoint: "objc_msgSend") private func Convert(value nint, selector nint, point MenuMacPoint, view nint) MenuMacPoint;
        @DllImport("SDL3", EntryPoint: "SDL_GetWindowProperties", CallingConvention: CallingConvention.Cdecl)
        private func Properties(window nint) uint32;
        @DllImport("SDL3", EntryPoint: "SDL_GetPointerProperty", CallingConvention: CallingConvention.Cdecl)
        private func Pointer(properties uint32, name string, fallback nint) nint;

        @DllImport("/usr/lib/libobjc.A.dylib", EntryPoint: "objc_msgSend") private func Bounds(value nint, selector nint) MenuMacRect;
        private func Sel(name string) nint -> sel_registerName(name)
        private func App() nint -> Send(objc_getClass("NSApplication"), Sel("sharedApplication"))
        private func Center() nint -> Send(objc_getClass("NSNotificationCenter"), Sel("defaultCenter"))
        private func String(value string) nint -> Text(objc_getClass("NSString"), Sel("stringWithUTF8String:"), value)
        internal func Release(value nint) { if value != nint(0) { Send(value, Sel("release")) } }

        private func EnsureTarget(binding NativeMenuBinding) {
            if targetClass == nint(0) {
                targetClass = objc_allocateClassPair(objc_getClass("NSObject"), "GooNativeMenuTarget", nuint(0))
                if targetClass == nint(0) { throw InvalidOperationException("Unable to create the native menu target") }
                let pointer = Marshal.GetFunctionPointerForDelegate(callback)
                for name in [5]string{"activate:", "becameKey:", "willClose:", "began:", "ended:"} {
                    if class_addMethod(targetClass, Sel(name), pointer, "v@:@") == 0 {
                        throw InvalidOperationException("Unable to register a native menu action")
                    }
                }
                objc_registerClassPair(targetClass)
            }
            binding.Target = Send(Send(targetClass, Sel("alloc")), Sel("init"))
            targets.Add(binding.Target, binding)
            Observe(Center(), Sel("addObserver:selector:name:object:"), binding.Target,
                Sel("began:"), String("NSMenuDidBeginTrackingNotification"), nint(0))
            Observe(Center(), Sel("addObserver:selector:name:object:"), binding.Target,
                Sel("ended:"), String("NSMenuDidEndTrackingNotification"), nint(0))
        }

        internal func Install(binding NativeMenuBinding, snapshot NativeMenuSnapshot) NativeMenuResult {
            if binding.Closed || !binding.Owner.IsOpen { return NativeMenuResult(NativeMenuStatus.OwnerClosed) }
            if tracking != 0 { return NativeMenuResult(NativeMenuStatus.Busy) }
            let handle = Pointer(Properties(binding.Owner.BorrowNativeWindow()), "SDL.window.cocoa.window", nint(0))
            if handle == nint(0) { return NativeMenuResult(NativeMenuStatus.Unsupported) }
            if bindings.TryGetValue(handle, out var existing) && existing != binding {
                throw InvalidOperationException("A native menu bar is already attached to this window")
            }
            if baseline == nint(0) {
                baseline = Send(Send(App(), Sel("mainMenu")), Sel("retain"))
                if baseline == nint(0) { return NativeMenuResult(NativeMenuStatus.Failed, error: "The SDL application menu is unavailable") }
            }
            if binding.Target == nint(0) {
                EnsureTarget(binding)
                binding.Handle = handle
                bindings.Add(handle, binding)
                Observe(Center(), Sel("addObserver:selector:name:object:"), binding.Target,
                    Sel("becameKey:"), String("NSWindowDidBecomeKeyNotification"), nint(0))
                Observe(Center(), Sel("addObserver:selector:name:object:"), binding.Target,
                    Sel("willClose:"), String("NSWindowWillCloseNotification"), handle)
            }
            let menu = Build(snapshot.Items, snapshot, binding.Target)
            let previous = binding.Menu
            binding.Menu = menu
            binding.Snapshot = snapshot
            if KeyWindow() == handle || activeBinding == binding { Select(binding) }
            Release(previous)
            return NativeMenuResult(NativeMenuStatus.Success)
        }

        internal func Build(items IReadOnlyList[NativeMenuItem], snapshot NativeMenuSnapshot, target nint) nint {
            let menu = Arg(Send(objc_getClass("NSMenu"), Sel("alloc")), Sel("initWithTitle:"), String(""))
            Arg(menu, Sel("setAutoenablesItems:"), nint(0))
            try {
                for item in items {
                    var native nint
                    if item.Separator {
                        native = Send(Send(objc_getClass("NSMenuItem"), Sel("separatorItem")), Sel("retain"))
                    } else {
                        let key = if let shortcut = item.Shortcut { shortcut.Key.ToLowerInvariant() } else { "" }
                        native = InitItem(Send(objc_getClass("NSMenuItem"), Sel("alloc")), Sel("initWithTitle:action:keyEquivalent:"),
                            String(item.Text), if item.Items.Count == 0 { Sel("activate:") } else { nint(0) }, String(key))
                        Arg(native, Sel("setTarget:"), target)
                        Arg(native, Sel("setTag:"), nint(snapshot.Tags[item.Id]))
                        Arg(native, Sel("setEnabled:"), nint(if item.Enabled { 1 } else { 0 }))
                        Arg(native, Sel("setState:"), nint(if item.Checked { 1 } else { 0 }))
                        if let shortcut = item.Shortcut {
                            let m = shortcut.Modifiers
                            let mask = (if m.Shift { 1 << 17 } else { 0 }) | (if m.Ctrl { 1 << 18 } else { 0 })
                                | (if m.Alt { 1 << 19 } else { 0 }) | (if m.Super { 1 << 20 } else { 0 })
                            Arg(native, Sel("setKeyEquivalentModifierMask:"), nint(mask))
                        }
                        if item.Items.Count != 0 {
                            let submenu = Build(item.Items, snapshot, target)
                            Arg(native, Sel("setSubmenu:"), submenu)
                            Release(submenu)
                        }
                    }
                    Arg(menu, Sel("addItem:"), native)
                    Release(native)
                }
                return menu
            } catch (error Exception) {
                Release(menu)
                throw error
            }
        }

        private func Select(binding NativeMenuBinding) {
            if binding.Closed || binding.Menu == nint(0) || Send(App(), Sel("mainMenu")) != baseline { return }
            ClearDocumentMenus()
            let count = int32(Send(binding.Menu, Sel("numberOfItems")))
            for i in 0 ... count {
                let item = Send(At(binding.Menu, Sel("itemAtIndex:"), nint(i)), Sel("copy"))
                Arg(baseline, Sel("addItem:"), item)
                documentItems.Add(item)
            }
            active = baseline
            activeBinding = binding
        }

        private func ClearDocumentMenus() {
            for item in documentItems {
                Arg(baseline, Sel("removeItem:"), item)
                Release(item)
            }
            documentItems.Clear()
        }

        private func KeyWindow() nint {
            var key = Send(App(), Sel("keyWindow"))
            while key != nint(0) && !bindings.ContainsKey(key) { key = Send(key, Sel("parentWindow")) }
            return key
        }

        private func SelectNext() {
            if active != nint(0) && Send(App(), Sel("mainMenu")) != active { return }
            if bindings.TryGetValue(KeyWindow(), out var binding) && !binding.Closed { Select(binding) return }
            ClearDocumentMenus()
            active = nint(0)
            activeBinding = nil
        }

        internal func Remove(binding NativeMenuBinding) {
            if binding.Target == nint(0) { return }
            if binding.Tracking {
                Send(if activeBinding == binding { active } else { binding.Menu }, Sel("cancelTracking"))
                return
            }
            bindings.Remove(binding.Handle)
            Arg(Center(), Sel("removeObserver:"), binding.Target)
            targets.Remove(binding.Target)
            SelectNext()
            Release(binding.Menu)
            binding.Menu = nint(0)
            if bindings.Count == 0 && targets.Count == 0 {
                ClearDocumentMenus()
                active = nint(0)
                activeBinding = nil
                Release(baseline)
                baseline = nint(0)
            }
            Release(binding.Target)
            binding.Target = nint(0)
        }

        private func Dispatch(receiver nint, selector nint, argument nint) {
            try {
                if !targets.TryGetValue(receiver, out var binding) { return }
                if binding.Closed && selector != Sel("ended:") { return }
                if selector == Sel("activate:") {
                    let tag = int32(Send(argument, Sel("tag"))) - 1
                    let snapshot = binding.Snapshot
                    if snapshot == nil || tag < 0 || tag >= snapshot.Actions.Count { return }
                    let item = snapshot.Actions[tag]
                    if !item.Enabled || item.Items.Count != 0 { return }
                    if binding.Handle != nint(0) && !binding.Tracking && binding.Owner.IsInputBlocked { return }
                    binding.Selected = item.Id
                    if binding.Handle != nint(0) && !binding.Tracking {
                        binding.Owner.TryPost(() -> {
                            if !binding.Closed && !binding.Owner.NativeOwnerClosing && !binding.Owner.IsInputBlocked { binding.Activate(item.Id) }
                        })
                    }
                } else if selector == Sel("becameKey:") {
                    if Send(argument, Sel("object")) == binding.Handle || binding == activeBinding { SelectNext() }
                } else if selector == Sel("willClose:") { binding.Dispose()
                } else if selector == Sel("began:") {
                    let menu = Send(argument, Sel("object"))
                    if binding.Tracking || !OwnsMenu(binding, menu) { return }
                    if binding.Handle != nint(0) {
                        binding.Lease = binding.Owner.BeginNativeModal(out var status)
                        if binding.Lease == nil { Send(menu, Sel("cancelTracking")) return }
                        binding.Lease!!.Closing = () -> Send(menu, Sel("cancelTracking"))
                    }
                    binding.Tracking = true
                    if binding.Handle != nint(0) { binding.Selected = "" }
                    tracking++
                } else if selector == Sel("ended:") {
                    if !binding.Tracking || !OwnsMenu(binding, Send(argument, Sel("object"))) { return }
                    if Send(Send(argument, Sel("object")), Sel("supermenu")) != nint(0) { return }
                    binding.Tracking = false
                    tracking--
                    let lease = binding.Lease
                    binding.Lease = nil
                    if lease != nil {
                        let selected = binding.Selected
                        binding.Selected = ""
                        lease.PostCompletion(() -> {
                            lease.Dispose()
                            if binding.Closed { Remove(binding) }
                            else if selected.Length != 0 {
                                binding.Owner.TryPost(() -> {
                                    if !binding.Closed && !binding.Owner.NativeOwnerClosing && !binding.Owner.IsInputBlocked { binding.Activate(selected) }
                                })
                            }
                        })
                    } else if binding.Closed { Remove(binding) }
                }
            } catch (error Exception) {
                if targets.TryGetValue(receiver, out var binding) { binding.Error = error.Message }
            }
        }

        private func OwnsMenu(binding NativeMenuBinding, menu nint) bool {
            var current = menu
            while current != nint(0) {
                if current == binding.Menu || activeBinding == binding && current == active { return true }
                current = Send(current, Sel("supermenu"))
            }
            return false
        }

        internal func ShowContext(owner Window, point Point, snapshot NativeMenuSnapshot, lease NativeModalLease) NativeMenuResult {
            let handle = Pointer(Properties(lease.SDLWindow), "SDL.window.cocoa.window", nint(0))
            if handle == nint(0) { return NativeMenuResult(NativeMenuStatus.Unsupported) }
            let binding = NativeMenuBinding(owner, (ignored string) -> { })
            try {
                EnsureTarget(binding)
                binding.Snapshot = snapshot
                binding.Menu = Build(snapshot.Items, snapshot, binding.Target)
                let view = Send(handle, Sel("contentView"))
                let bounds = Bounds(view, Sel("bounds"))
                var topLeft = MenuMacPoint{X: bounds.X, Y: bounds.Y}
                if Bool(view, Sel("isFlipped")) == 0 { topLeft.Y += bounds.Height }
                var windowPoint = Convert(view, Sel("convertPoint:toView:"), topLeft, nint(0))
                windowPoint.X += float64(point.X * owner.UiScale)
                windowPoint.Y -= float64(point.Y * owner.UiScale)
                let logical = Convert(view, Sel("convertPoint:fromView:"), windowPoint, nint(0))
                lease.Closing = () -> Send(binding.Menu, Sel("cancelTracking"))
                Popup(binding.Menu, Sel("popUpMenuPositioningItem:atLocation:inView:"), nint(0), logical, view)
                if binding.Error != "" { return NativeMenuResult(NativeMenuStatus.Failed, error: binding.Error) }
                return if binding.Selected == "" { NativeMenuResult(NativeMenuStatus.Cancelled) }
                    else { NativeMenuResult(NativeMenuStatus.Success, binding.Selected) }
            } finally {
                lease.Closing = nil
                binding.Dispose()
            }
        }
    }
}
