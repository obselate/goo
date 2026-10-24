package GooAndroidSmokeApp

import Android.AccessibilityServices
import Android.App
import Android.Content
import Android.Graphics
import Android.OS
import Android.Runtime
import Android.Views
import Android.Views.Accessibility
import Android.Views.InputMethods
import Java.Lang
import NativeAction = Android.Views.Accessibility.AccessibilityNodeInfo.AccessibilityAction
import NodeAction = Android.Views.Accessibility.Action
import System
import System.Collections.Concurrent
import System.Linq
import System.Threading
import SystemException_2 = System.Exception
import ThreadingThread = System.Threading.Thread

@Instrumentation(
    Name = "org.goo.androidsmoke.AccessibilityChecks",
    TargetPackage = "org.goo.androidsmoke",
    FunctionalTest = true
)
class AccessibilityChecks : Instrumentation {
    private var automation UiAutomation? = nil
    private var activity MainActivity? = nil
    private let events ConcurrentQueue[EventRecord] = ConcurrentQueue[EventRecord]()
    private var listener EventListener? = nil

    init() { }

    init(handle nint, ownership JniHandleOwnership) : base(handle, ownership) { }

    override func OnCreate(arguments Bundle?) {
        base.OnCreate(arguments)
        Start()
    }

    override func OnStart() {
        using let result = Bundle()
        var status = Result.Ok
        try {
            automation = UiAutomation ?? throw InvalidOperationException("UiAutomation is unavailable.")
            {
                using let info = automation!!.ServiceInfo!!
                info.Flags |= AccessibilityServiceFlags.RetrieveInteractiveWindows | AccessibilityServiceFlags.RequestTouchExplorationMode
                this.automation!!.ServiceInfo = info
            }
            listener = EventListener(events)
            automation!!.SetOnAccessibilityEventListener(listener)
            using let intent = Intent(TargetContext!!, typeof(MainActivity))
            intent.AddFlags(ActivityFlags.NewTask | ActivityFlags.ClearTask)
            activity = cast[MainActivity](StartActivitySync(intent)!!)
            Wait(
                () -> Exists((n AccessibilityNodeInfo) -> n.Text == "Goo Vulkan"),
                "Goo did not present its semantic tree."
            )
            RunChecks()
            result.PutString("stream", "GOO_ACCESSIBILITY_PASS\n")
        } catch (error SystemException_2) {
            result.PutString("stream", "GOO_ACCESSIBILITY_FAIL\n" + error.ToString() + "\n")
            status = Result.Canceled
        } finally {
            automation?.SetOnAccessibilityEventListener(nil)
            listener?.Dispose()
        }
        Finish(status, result)
    }

    private func RunChecks() {
        {
            using let canvas = Find(
                (n AccessibilityNodeInfo) -> n.ClassName == "android.view.View" && !n.Scrollable && n.ChildCount == 1
            )
            Require(
                !canvas.Clickable &&
                    !canvas.Focusable &&
                    !canvas.Focused &&
                    !canvas.ScreenReaderFocusable &&
                    canvas.ActionList!!
                    .All(
                    (a AccessibilityNodeInfo.AccessibilityAction) -> a.Id != int32(NodeAction.Click) &&
                        a.Id != int32(NodeAction.AccessibilityFocus)
                ),
                "Native canvas exposed a duplicate focus or action."
            )
        }
        {
            using let heading = Find((n AccessibilityNodeInfo) -> n.Text == "Goo Vulkan")
            Require(heading.Heading && heading.VisibleToUser, "Heading metadata is missing.")
        }
        {
            using let image = Find((n AccessibilityNodeInfo) -> n.ContentDescription == "Four color image")
            Require(image.ClassName == "android.widget.ImageView", "Image role is incorrect.")
        }
        {
            using let disabled = Find((n AccessibilityNodeInfo) -> n.ContentDescription == "Disabled")
            Require(!disabled.Enabled && !disabled.PerformAction(NodeAction.Click), "Disabled action was accepted.")
        }
        CheckTouchExploration()
        {
            using let counter = Find((n AccessibilityNodeInfo) -> n.ContentDescription == "Retained count: 0")
            Require(counter.ClassName == "android.widget.Button" && counter.Clickable, "Button role is incorrect.")
            Require(counter.PerformAction(NodeAction.AccessibilityFocus), "Reading focus failed.")
            Wait(
                () -> Exists(
                    (n AccessibilityNodeInfo) -> n.ContentDescription == "Retained count: 0" && n.AccessibilityFocused
                ),
                "Reading focus did not publish."
            )
            Require(
                !Exists((n AccessibilityNodeInfo) -> n.Focused && n.ClassName == "android.widget.EditText"),
                "Reading focus opened an editor."
            )
            Drain()
            Require(counter.PerformAction(NodeAction.Click), "Counter activation failed.")
        }
        Wait(
            () -> Exists((n AccessibilityNodeInfo) -> n.ContentDescription == "Retained count: 1"),
            "Counter state did not change."
        )
        WaitEvent(
            (e EventRecord) -> e.Type == EventTypes.WindowContentChanged &&
                e.Description == "Counter status" &&
                e
                .Text
                .Contains("Count 1", StringComparison.Ordinal),
            "Atomic live region text is missing."
        )
        {
            using let live = Find((n AccessibilityNodeInfo) -> n.HintText == "Counter status")
            Require(live.LiveRegion == AccessibilityLiveRegion.Polite, "Polite live region metadata is missing.")
        }
        {
            using let alert = Find((n AccessibilityNodeInfo) -> n.Text == "Counter changed")
            Require(alert.LiveRegion == AccessibilityLiveRegion.Assertive, "Assertive live region metadata is missing.")
        }
        CheckEditor()
        CheckPassword()
        CheckRangeAndScroll()
        CheckSurface()
        CheckActivityReplacement()
        Wait(
            () -> {
                var idle = false
                RunOnMainSync(
                    () -> {
                        idle = !activity!!.NativeView.HasFrameDemand
                    }
                )
                return idle
            },
            "Replacement Activity frames did not settle."
        )
        Drain()
        using let serviced = ManualResetEventSlim()
        RunOnMainSync(() -> activity!!.NativeView.Window.Post(serviced.Set))
        Require(serviced.Wait(TimeSpan.FromSeconds(5)), "Unchanged frame was not serviced.")
        automation!!.WaitForIdle(250, 5000)
        Require(
            !events.Any((e EventRecord) -> e.Type == EventTypes.WindowContentChanged),
            "An unchanged frame emitted a content refresh."
        )
    }

    private func CheckTouchExploration() {
        let manager = cast[AccessibilityManager](activity!!.GetSystemService(Context.AccessibilityService)!!)
        Wait(() -> manager.IsTouchExplorationEnabled, "Android did not enable touch exploration.")
        using let counter = Find((n AccessibilityNodeInfo) -> n.ContentDescription == "Retained count: 0")
        using let bounds = Rect()
        counter.GetBoundsInScreen(bounds)
        using let pointer = MotionEvent.PointerProperties{Id: 0, ToolType: MotionEventToolType.Finger}
        using let coords = MotionEvent.PointerCoords{
            X: bounds.ExactCenterX(),
            Y: bounds.ExactCenterY(),
            Pressure: 1.0f,
            Size: 1.0f
        }
        let downTime = SystemClock.UptimeMillis()
        let Inject = (action MotionEventActions) -> {
            using let motion = MotionEvent.Obtain(
                downTime,
                SystemClock.UptimeMillis(),
                action,
                1,
                []MotionEvent.PointerProperties{pointer},
                []MotionEvent.PointerCoords{coords},
                MetaKeyStates(0),
                MotionEventButtonState(0),
                1.0f,
                1.0f,
                0,
                Edge(0),
                InputSourceType.Touchscreen,
                MotionEventFlags(0)
            )!!
            Require(automation!!.InjectInputEvent(motion, true), "Native touch injection failed.")
        }
        Drain()
        Inject(MotionEventActions.HoverEnter)
        try {
            WaitEvent(
                (e EventRecord) -> e.Type == EventTypes.ViewHoverEnter && e.Description == "Retained count: 0",
                "Touch exploration did not enter the virtual button."
            )
        } finally {
            Inject(MotionEventActions.HoverExit)
        }
        WaitEvent(
            (e EventRecord) -> e.Type == EventTypes.ViewHoverExit,
            "Touch exploration did not leave the virtual button."
        )
        Require(
            Exists((n AccessibilityNodeInfo) -> n.ContentDescription == "Retained count: 0"),
            "Exploration activated the button."
        )
    }

    private func CheckEditor() {
        using let editor = Find((n AccessibilityNodeInfo) -> n.HintText == "Name")
        Require(editor.Editable && editor.ClassName == "android.widget.EditText", "Editor metadata is missing.")
        Require(editor.PerformAction(NodeAction(NativeAction.ActionShowOnScreen!!.Id)), "Editor reveal failed.")
        Require(editor.PerformAction(NodeAction.Click), "Editor activation failed.")
        Wait(
            () -> {
                var visible = false
                RunOnMainSync(
                    () -> {
                        visible = activity!!.NativeView.RootWindowInsets?.IsVisible(WindowInsets.Type.Ime()) == true
                    }
                )
                return visible
            },
            "Editor activation did not show the keyboard."
        )
        Wait(
            () -> Exists((n AccessibilityNodeInfo) -> n.HintText == "Name" && n.Focused),
            "Input focus did not publish."
        )
        const value = "á😀 אב one  two"
        Drain()
        {
            using let args = Bundle()
            args.PutCharSequence(AccessibilityNodeInfo.ActionArgumentSetTextCharsequence, value)
            Require(editor.PerformAction(NodeAction.SetText, args), "Set text failed.")
        }
        Wait(
            () -> Exists((n AccessibilityNodeInfo) -> n.HintText == "Name" && n.Text == value),
            "Set text did not reach Goo."
        )
        WaitEvent(
            (e EventRecord) -> e.Type == EventTypes.ViewTextChanged && e.Text == value && e.Before == "Hello Goo",
            "Text change event is missing."
        )
        SetSelection(editor, 5, 2)
        Wait(
            () -> Exists(
                (n AccessibilityNodeInfo) -> n.HintText == "Name" &&
                    n.TextSelectionStart == 5 &&
                    n.TextSelectionEnd == 2
            ),
            "Reverse selection was lost."
        )
        WaitEvent(
            (e EventRecord) -> e.Type == EventTypes.ViewTextSelectionChanged && e.From == 5 && e.To == 2,
            "Reverse selection event is missing."
        )
        SetSelection(editor, 0, 0)
        Wait(
            () -> Exists((n AccessibilityNodeInfo) -> n.HintText == "Name" && n.TextSelectionEnd == 0),
            "Character movement setup did not publish."
        )
        Move(editor, MovementGranularity.Character, true)
        Wait(
            () -> Exists((n AccessibilityNodeInfo) -> n.HintText == "Name" && n.TextSelectionEnd == 2),
            "Combining text split during character movement."
        )
        Move(editor, MovementGranularity.Character, true)
        Wait(
            () -> Exists((n AccessibilityNodeInfo) -> n.HintText == "Name" && n.TextSelectionEnd == 4),
            "Emoji split during character movement."
        )
        Drain()
        Move(editor, MovementGranularity.Character, false)
        WaitEvent(
            (e EventRecord) -> e.Type == EventTypes.ViewTextTraversedAtMovementGranularity && e.From == 2 && e.To == 4,
            "Backward character traversal range is incorrect."
        )
        SetSelection(
            editor,
            value.IndexOf("  ", StringComparison.Ordinal),
            value.IndexOf("  ", StringComparison.Ordinal)
        )
        Wait(
            () -> Exists(
                (n AccessibilityNodeInfo) -> n.HintText == "Name" && n.TextSelectionEnd == value.IndexOf(
                    "  ",
                    StringComparison.Ordinal
                )
            ),
            "Word movement setup did not publish."
        )
        Drain()
        Move(editor, MovementGranularity.Word, true)
        Wait(
            () -> Exists((n AccessibilityNodeInfo) -> n.HintText == "Name" && n.TextSelectionEnd == value.Length),
            "Word movement stopped at spacing."
        )
        WaitEvent(
            (e EventRecord) -> e.Type == EventTypes.ViewTextTraversedAtMovementGranularity &&
                e.From == value.Length - 3 &&
                e.To == value.Length,
            "Word traversal included spacing."
        )
        Require(editor.PerformAction(NodeAction.ClearFocus), "Editor blur failed.")
        RunOnMainSync(
            () -> (
                cast[InputMethodManager](activity!!.GetSystemService(Context.InputMethodService)!!)
            ).HideSoftInputFromWindow(activity!!.NativeView.WindowToken, HideSoftInputFlags.None)
        )
        Wait(
            () -> !Exists((n AccessibilityNodeInfo) -> n.HintText == "Name" && n.Focused),
            "Editor blur did not publish."
        )
    }

    private func CheckPassword() {
        using let password = Find((n AccessibilityNodeInfo) -> n.HintText == "Password")
        Require(password.Password && password.Text == "••••••", "Password text is not masked.")
        Require(password.MovementGranularities == MovementGranularity.Character, "Password exposed word boundaries.")
        Drain()
        {
            using let args = Bundle()
            args.PutCharSequence(AccessibilityNodeInfo.ActionArgumentSetTextCharsequence, "new😀secret")
            Require(password.PerformAction(NodeAction.SetText, args), "Password edit failed.")
        }
        WaitEvent((e EventRecord) -> e.Type == EventTypes.ViewTextChanged && e.Password, "Password event is missing.")
        Require(
            events.Where((e EventRecord) -> e.Password).All(
                (e EventRecord) -> !e.Text.Contains("secret", StringComparison.Ordinal) && !e.Before.Contains(
                    "secret",
                    StringComparison.Ordinal
                )
            ),
            "Password event exposed document text."
        )
        using let current = Find((n AccessibilityNodeInfo) -> n.HintText == "Password")
        Require(
            current.Text is {Length: > 0} masked && masked.All((c char) -> c == '•'),
            "Edited password is not masked."
        )
    }

    private func CheckRangeAndScroll() {
        {
            using let checkbox = Find((n AccessibilityNodeInfo) -> n.ContentDescription == "Check item")
            Require(
                checkbox.Checkable && checkbox.ClassName == "android.widget.CheckBox",
                "Checkbox role is incorrect."
            )
            if OperatingSystem.IsAndroidVersionAtLeast(36) {
                Require(checkbox.CheckedState == CheckedState.Partial, "Mixed check state is missing.")
            }
            Require(checkbox.PerformAction(NodeAction.Click), "Checkbox activation failed.")
        }
        Wait(
            () -> Exists(
                (n AccessibilityNodeInfo) -> n.ContentDescription == "Check item" &&
                    (
                    if OperatingSystem.IsAndroidVersionAtLeast(36) {
                        n.CheckedState == CheckedState.True
                    } else {
                        n.Checked
                    }
                )
            ),
            "Checkbox state did not change."
        )
        {
            using let slider = Find((n AccessibilityNodeInfo) -> n.ContentDescription == "Level")
            using let range_ = slider.GetRangeInfo()
            Require(
                slider.ClassName == "android.widget.SeekBar" &&
                    range_ != nil &&
                    range_.Current == float32(25.0) &&
                    range_.Min == float32(0.0) &&
                    range_.Max == float32(100.0),
                "Range metadata is incorrect."
            )
            using let args = Bundle()
            args.PutFloat(AccessibilityNodeInfo.ActionArgumentProgressValue, 61.0f)
            Require(slider.PerformAction(NodeAction(NativeAction.ActionSetProgress!!.Id), args), "Set progress failed.")
        }
        Wait(
            () -> Exists((n AccessibilityNodeInfo) -> n.ContentDescription == "Level" && HasRangeValue(n, 61.0f)),
            "Range value did not change."
        )
        {
            using let slider = Find((n AccessibilityNodeInfo) -> n.ContentDescription == "Level")
            Require(slider.PerformAction(NodeAction.ScrollForward), "Range increment failed.")
        }
        Wait(
            () -> Exists((n AccessibilityNodeInfo) -> n.ContentDescription == "Level" && HasRangeValue(n, 62.0f)),
            "Range increment did not publish."
        )
        {
            using let footer = Find((n AccessibilityNodeInfo) -> n.Text == "Scroll to this shared Cell")
            Require(footer.PerformAction(NodeAction(NativeAction.ActionShowOnScreen!!.Id)), "Footer reveal failed.")
        }
        Wait(
            () -> Exists((n AccessibilityNodeInfo) -> n.Text == "Scroll to this shared Cell" && n.VisibleToUser),
            "Footer stayed clipped."
        )
        Drain()
        {
            using let scroller = Find((n AccessibilityNodeInfo) -> n.Scrollable && !n.Editable)
            Require(scroller.PerformAction(NodeAction.ScrollBackward), "Backward scroll failed.")
        }
        WaitEvent((e EventRecord) -> e.Type == EventTypes.ViewScrolled && e.MaxScrollY > 0, "Scroll event is missing.")
    }

    private func CheckSurface() {
        using let original = Find((n AccessibilityNodeInfo) -> n.ContentDescription == "Retained count: 1")
        Require(original.PerformAction(NodeAction(NativeAction.ActionShowOnScreen!!.Id)), "Counter reveal failed.")
        Require(
            original.AccessibilityFocused || original.PerformAction(NodeAction.AccessibilityFocus),
            "Counter reading focus failed before Surface replacement."
        )
        RunOnMainSync(
            () -> {
                activity!!.NativeView.Visibility = ViewStates.Gone
            }
        )
        Wait(
            () -> !Exists((n AccessibilityNodeInfo) -> n.ContentDescription == "Retained count: 1"),
            "Hidden Surface kept its virtual subtree."
        )
        Drain()
        RunOnMainSync(
            () -> {
                activity!!.NativeView.Visibility = ViewStates.Visible
            }
        )
        Wait(
            () -> Exists((n AccessibilityNodeInfo) -> n.ContentDescription == "Retained count: 1"),
            "Replacement Surface did not publish."
        )
        automation!!.WaitForIdle(250, 5000)
        using let restored = Find((n AccessibilityNodeInfo) -> n.ContentDescription == "Retained count: 1")
        Require(
            original.Equals(restored) && !restored.AccessibilityFocused,
            "Surface replacement changed IDs or kept stale reading focus."
        )
        Require(
            !events.Any(
                (e EventRecord) -> e.Description == "Counter status" && e.Type == EventTypes.WindowContentChanged
            ),
            "Surface replacement replayed a live announcement."
        )
    }

    private func CheckActivityReplacement() {
        using let old = Find((n AccessibilityNodeInfo) -> n.ContentDescription == "Retained count: 1")
        using let monitor = AddMonitor(activity!!.Class.Name, nil, false)!!
        try {
            RunOnMainSync(activity!!.Recreate)
            activity = WaitForMonitorWithTimeout(monitor, 15000) as MainActivity ??
                throw InvalidOperationException("Replacement Activity did not start.")
        } finally {
            RemoveMonitor(monitor)
        }
        Wait(
            () -> Exists(
                (n AccessibilityNodeInfo) -> n.ClassName == "android.widget.Button" && n.ContentDescription?.StartsWith(
                    "Retained count:",
                    StringComparison.Ordinal
                ) == true
            ),
            "Replacement Activity did not publish."
        )
        Require(!old.PerformAction(NodeAction.Click), "Disposed Activity accepted a stale virtual action.")
    }

    private func Find(predicate(AccessibilityNodeInfo) -> bool) AccessibilityNodeInfo {
        for window in automation!!.Windows!! {
            {
                using let _ = window
                {
                    using let root = window.Root
                    if root?.PackageName == "org.goo.androidsmoke" && Search(root!!, predicate) is {} found {
                        return found
                    }
                }
            }
        }
        throw InvalidOperationException("Expected Goo virtual node is missing.")
    }

    private func Exists(predicate(AccessibilityNodeInfo) -> bool) bool {
        try {
            using let node = Find(predicate)
            return true
        } catch (InvalidOperationException) {
            return false
        }
    }

    private func WaitEvent(predicate(EventRecord) -> bool, message string) -> Wait(() -> events.Any(predicate), message)

    private func Drain() {
        automation!!.WaitForIdle(250, 5000)
        events.Clear()
    }

    private class EventListener(events ConcurrentQueue[EventRecord]) : Java
        .Lang
        .Object,
    UiAutomation
        .IOnAccessibilityEventListener {
        func OnAccessibilityEvent(e AccessibilityEvent?) {
            if e?.PackageName != "org.goo.androidsmoke" {
                return
            }
            events.Enqueue(
                EventRecord(
                    e!!.EventType,
                    e!!.ContentDescription ?? "",
                    string.Join(" ", e!!.Text!!),
                    e!!.BeforeText ?? "",
                    e!!.FromIndex,
                    e!!.ToIndex,
                    e!!.Password,
                    e!!.MaxScrollY
                )
            )
        }
    }

    private data struct EventRecord(
        Type EventTypes,
        Description string,
        Text string,
        Before string,
        From int32,
        To int32,
        Password bool,
        MaxScrollY int32
    ) : IEquatable[EventRecord] { }

    shared {
        private func SetSelection(node AccessibilityNodeInfo, start int32, end int32) {
            using let args = Bundle()
            args.PutInt(AccessibilityNodeInfo.ActionArgumentSelectionStartInt, start)
            args.PutInt(AccessibilityNodeInfo.ActionArgumentSelectionEndInt, end)
            Require(node.PerformAction(NodeAction.SetSelection, args), "Set selection failed.")
        }

        private func HasRangeValue(node AccessibilityNodeInfo, value float32) bool {
            using let range_ = node.GetRangeInfo()
            return range_?.Current == value
        }

        private func Move(node AccessibilityNodeInfo, granularity MovementGranularity, forward bool) {
            using let args = Bundle()
            args.PutInt(AccessibilityNodeInfo.ActionArgumentMovementGranularityInt, int32(granularity))
            Require(
                node.PerformAction(
                    if forward {
                        NodeAction.NextAtMovementGranularity
                    } else {
                        NodeAction.PreviousAtMovementGranularity
                    },
                    args
                ),
                "Text movement failed."
            )
        }

        private func Search(
            node AccessibilityNodeInfo,
            predicate(AccessibilityNodeInfo) -> bool
        ) AccessibilityNodeInfo? {
            if !node.Refresh() {
                return nil
            }
            if node.PackageName == "org.goo.androidsmoke" && predicate(node) {
                return AccessibilityNodeInfo(node)
            }
            for var i = 0; i < node.ChildCount; i++ {
                {
                    using let child AccessibilityNodeInfo? = node.GetChild(i)
                    if child != nil && Search(child, predicate) is {} found {
                        return found
                    }
                }
            }
            return nil
        }

        private func Wait(condition() -> bool, message string) {
            let deadline = SystemClock.UptimeMillis() + int64(15000)
            do {
                if condition() {
                    return
                }
                ThreadingThread.Sleep(50)
            } while SystemClock.UptimeMillis() < deadline
            throw InvalidOperationException(message)
        }

        private func Require(condition bool, message string) {
            if !condition {
                throw InvalidOperationException(message)
            }
        }
    }
}
