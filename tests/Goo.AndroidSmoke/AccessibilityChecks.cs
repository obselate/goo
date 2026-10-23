using Android.App;
using Android.Content;
using Android.OS;
using Android.Views;
using Android.Views.Accessibility;
using System.Collections.Concurrent;
using NodeAction = Android.Views.Accessibility.Action;
using NativeAction = Android.Views.Accessibility.AccessibilityNodeInfo.AccessibilityAction;

namespace GooAndroidSmokeApp;

[Instrumentation(Name = "org.goo.androidsmoke.AccessibilityChecks", TargetPackage = "org.goo.androidsmoke", FunctionalTest = true)]
public sealed class AccessibilityChecks : Instrumentation
{
    private UiAutomation automation = null!;
    private MainActivity activity = null!;
    private readonly ConcurrentQueue<EventRecord> events = new();
    private EventListener listener = null!;

    public AccessibilityChecks() { }

    public AccessibilityChecks(IntPtr handle, global::Android.Runtime.JniHandleOwnership ownership) : base(handle, ownership) { }

    public override void OnCreate(Bundle? arguments)
    {
        base.OnCreate(arguments);
        Start();
    }

    public override void OnStart()
    {
        using var result = new Bundle();
        var status = Result.Ok;
        try
        {
            automation = UiAutomation ?? throw new InvalidOperationException("UiAutomation is unavailable.");
            using (var info = automation.ServiceInfo!)
            {
                info.Flags |= global::Android.AccessibilityServices.AccessibilityServiceFlags.RetrieveInteractiveWindows
                    | global::Android.AccessibilityServices.AccessibilityServiceFlags.RequestTouchExplorationMode;
                automation.ServiceInfo = info;
            }
            listener = new EventListener(events);
            automation.SetOnAccessibilityEventListener(listener);
            using var intent = new Intent(TargetContext!, typeof(MainActivity));
            intent.AddFlags(ActivityFlags.NewTask | ActivityFlags.ClearTask);
            activity = (MainActivity)StartActivitySync(intent)!;
            Wait(() => Exists(n => n.Text == "Goo Vulkan"), "Goo did not present its semantic tree.");
            RunChecks();
            result.PutString("stream", "GOO_ACCESSIBILITY_PASS\n");
        }
        catch (Exception error)
        {
            result.PutString("stream", "GOO_ACCESSIBILITY_FAIL\n" + error + "\n");
            status = Result.Canceled;
        }
        finally
        {
            automation?.SetOnAccessibilityEventListener(null);
            listener?.Dispose();
        }
        Finish(status, result);
    }

    private void RunChecks()
    {
        using (var canvas = Find(n => n.ClassName == "android.view.View" && !n.Scrollable && n.ChildCount == 1))
            Require(!canvas.Clickable && !canvas.Focusable && !canvas.Focused && !canvas.ScreenReaderFocusable
                && canvas.ActionList!.All(a => a.Id != (int)NodeAction.Click && a.Id != (int)NodeAction.AccessibilityFocus),
                "Native canvas exposed a duplicate focus or action.");
        using (var heading = Find(n => n.Text == "Goo Vulkan"))
            Require(heading.Heading && heading.VisibleToUser, "Heading metadata is missing.");
        using (var image = Find(n => n.ContentDescription == "Four color image"))
            Require(image.ClassName == "android.widget.ImageView", "Image role is incorrect.");
        using (var disabled = Find(n => n.ContentDescription == "Disabled"))
            Require(!disabled.Enabled && !disabled.PerformAction(NodeAction.Click), "Disabled action was accepted.");
        CheckTouchExploration();
        using (var counter = Find(n => n.ContentDescription == "Retained count: 0"))
        {
            Require(counter.ClassName == "android.widget.Button" && counter.Clickable, "Button role is incorrect.");
            Require(counter.PerformAction(NodeAction.AccessibilityFocus), "Reading focus failed.");
            Wait(() => Exists(n => n.ContentDescription == "Retained count: 0" && n.AccessibilityFocused), "Reading focus did not publish.");
            Require(!Exists(n => n.Focused && n.ClassName == "android.widget.EditText"), "Reading focus opened an editor.");
            Drain();
            Require(counter.PerformAction(NodeAction.Click), "Counter activation failed.");
        }
        Wait(() => Exists(n => n.ContentDescription == "Retained count: 1"), "Counter state did not change.");
        WaitEvent(e => e.Type == EventTypes.WindowContentChanged && e.Description == "Counter status"
            && e.Text.Contains("Count 1", StringComparison.Ordinal), "Atomic live region text is missing.");
        using (var live = Find(n => n.HintText == "Counter status"))
            Require(live.LiveRegion == AccessibilityLiveRegion.Polite, "Polite live region metadata is missing.");
        using (var alert = Find(n => n.Text == "Counter changed"))
            Require(alert.LiveRegion == AccessibilityLiveRegion.Assertive, "Assertive live region metadata is missing.");
        CheckEditor();
        CheckPassword();
        CheckRangeAndScroll();
        CheckSurface();
        CheckActivityReplacement();
        Wait(() =>
        {
            var idle = false;
            RunOnMainSync(() => idle = !activity.NativeView.HasFrameDemand);
            return idle;
        }, "Replacement Activity frames did not settle.");
        Drain();
        using var serviced = new ManualResetEventSlim();
        RunOnMainSync(() => activity.NativeView.Window.Post(serviced.Set));
        Require(serviced.Wait(TimeSpan.FromSeconds(5)), "Unchanged frame was not serviced.");
        automation.WaitForIdle(250, 5000);
        Require(!events.Any(e => e.Type == EventTypes.WindowContentChanged), "An unchanged frame emitted a content refresh.");
    }

    private void CheckTouchExploration()
    {
        var manager = (AccessibilityManager)activity.GetSystemService(Context.AccessibilityService)!;
        Wait(() => manager.IsTouchExplorationEnabled, "Android did not enable touch exploration.");
        using var counter = Find(n => n.ContentDescription == "Retained count: 0");
        using var bounds = new global::Android.Graphics.Rect();
        counter.GetBoundsInScreen(bounds);
        using var pointer = new MotionEvent.PointerProperties { Id = 0, ToolType = MotionEventToolType.Finger };
        using var coords = new MotionEvent.PointerCoords
        {
            X = bounds.ExactCenterX(),
            Y = bounds.ExactCenterY(),
            Pressure = 1,
            Size = 1
        };
        var downTime = SystemClock.UptimeMillis();
        Drain();
        Inject(MotionEventActions.HoverEnter);
        try
        {
            WaitEvent(e => e.Type == EventTypes.ViewHoverEnter && e.Description == "Retained count: 0",
                "Touch exploration did not enter the virtual button.");
        }
        finally
        {
            Inject(MotionEventActions.HoverExit);
        }
        WaitEvent(e => e.Type == EventTypes.ViewHoverExit, "Touch exploration did not leave the virtual button.");
        Require(Exists(n => n.ContentDescription == "Retained count: 0"), "Exploration activated the button.");

        void Inject(MotionEventActions action)
        {
            using var motion = MotionEvent.Obtain(downTime, SystemClock.UptimeMillis(), action, 1,
                [pointer], [coords], 0, 0, 1, 1, 0, 0, InputSourceType.Touchscreen, 0)!;
            Require(automation.InjectInputEvent(motion, true), "Native touch injection failed.");
        }
    }

    private void CheckEditor()
    {
        using var editor = Find(n => n.HintText == "Name");
        Require(editor.Editable && editor.ClassName == "android.widget.EditText", "Editor metadata is missing.");
        Require(editor.PerformAction((NodeAction)NativeAction.ActionShowOnScreen!.Id), "Editor reveal failed.");
        Require(editor.PerformAction(NodeAction.Click), "Editor activation failed.");
        Wait(() =>
        {
            var visible = false;
            RunOnMainSync(() => visible = activity.NativeView.RootWindowInsets?.IsVisible(WindowInsets.Type.Ime()) == true);
            return visible;
        }, "Editor activation did not show the keyboard.");
        Wait(() => Exists(n => n.HintText == "Name" && n.Focused), "Input focus did not publish.");
        const string value = "a\u0301😀 אב one  two";
        Drain();
        using (var args = new Bundle())
        {
            args.PutCharSequence(AccessibilityNodeInfo.ActionArgumentSetTextCharsequence, value);
            Require(editor.PerformAction(NodeAction.SetText, args), "Set text failed.");
        }
        Wait(() => Exists(n => n.HintText == "Name" && n.Text == value), "Set text did not reach Goo.");
        WaitEvent(e => e.Type == EventTypes.ViewTextChanged && e.Text == value && e.Before == "Hello Goo",
            "Text change event is missing.");
        SetSelection(editor, 5, 2);
        Wait(() => Exists(n => n.HintText == "Name" && n.TextSelectionStart == 5 && n.TextSelectionEnd == 2),
            "Reverse selection was lost.");
        WaitEvent(e => e.Type == EventTypes.ViewTextSelectionChanged && e.From == 5 && e.To == 2,
            "Reverse selection event is missing.");
        SetSelection(editor, 0, 0);
        Wait(() => Exists(n => n.HintText == "Name" && n.TextSelectionEnd == 0), "Character movement setup did not publish.");
        Move(editor, MovementGranularity.Character, true);
        Wait(() => Exists(n => n.HintText == "Name" && n.TextSelectionEnd == 2), "Combining text split during character movement.");
        Move(editor, MovementGranularity.Character, true);
        Wait(() => Exists(n => n.HintText == "Name" && n.TextSelectionEnd == 4), "Emoji split during character movement.");
        Drain();
        Move(editor, MovementGranularity.Character, false);
        WaitEvent(e => e.Type == EventTypes.ViewTextTraversedAtMovementGranularity && e.From == 2 && e.To == 4,
            "Backward character traversal range is incorrect.");
        SetSelection(editor, value.IndexOf("  ", StringComparison.Ordinal), value.IndexOf("  ", StringComparison.Ordinal));
        Wait(() => Exists(n => n.HintText == "Name" && n.TextSelectionEnd == value.IndexOf("  ", StringComparison.Ordinal)),
            "Word movement setup did not publish.");
        Drain();
        Move(editor, MovementGranularity.Word, true);
        Wait(() => Exists(n => n.HintText == "Name" && n.TextSelectionEnd == value.Length), "Word movement stopped at spacing.");
        WaitEvent(e => e.Type == EventTypes.ViewTextTraversedAtMovementGranularity && e.From == value.Length - 3 && e.To == value.Length,
            "Word traversal included spacing.");
        Require(editor.PerformAction(NodeAction.ClearFocus), "Editor blur failed.");
        RunOnMainSync(() => ((global::Android.Views.InputMethods.InputMethodManager)activity.GetSystemService(Context.InputMethodService)!)
            .HideSoftInputFromWindow(activity.NativeView.WindowToken, global::Android.Views.InputMethods.HideSoftInputFlags.None));
        Wait(() => !Exists(n => n.HintText == "Name" && n.Focused), "Editor blur did not publish.");
    }

    private void CheckPassword()
    {
        using var password = Find(n => n.HintText == "Password");
        Require(password.Password && password.Text == "••••••", "Password text is not masked.");
        Require(password.MovementGranularities == MovementGranularity.Character, "Password exposed word boundaries.");
        Drain();
        using (var args = new Bundle())
        {
            args.PutCharSequence(AccessibilityNodeInfo.ActionArgumentSetTextCharsequence, "new😀secret");
            Require(password.PerformAction(NodeAction.SetText, args), "Password edit failed.");
        }
        WaitEvent(e => e.Type == EventTypes.ViewTextChanged && e.Password, "Password event is missing.");
        Require(events.Where(e => e.Password).All(e => !e.Text.Contains("secret", StringComparison.Ordinal)
            && !e.Before.Contains("secret", StringComparison.Ordinal)), "Password event exposed document text.");
        using var current = Find(n => n.HintText == "Password");
        Require(current.Text is { Length: > 0 } masked && masked.All(c => c == '•'), "Edited password is not masked.");
    }

    private void CheckRangeAndScroll()
    {
        using (var checkbox = Find(n => n.ContentDescription == "Check item"))
        {
            Require(checkbox.Checkable && checkbox.ClassName == "android.widget.CheckBox", "Checkbox role is incorrect.");
            if (OperatingSystem.IsAndroidVersionAtLeast(36))
                Require(checkbox.CheckedState == CheckedState.Partial, "Mixed check state is missing.");
            Require(checkbox.PerformAction(NodeAction.Click), "Checkbox activation failed.");
        }
        Wait(() => Exists(n => n.ContentDescription == "Check item"
            && (OperatingSystem.IsAndroidVersionAtLeast(36) ? n.CheckedState == CheckedState.True : n.Checked)),
            "Checkbox state did not change.");
        using (var slider = Find(n => n.ContentDescription == "Level"))
        {
            using var range = slider.GetRangeInfo();
            Require(slider.ClassName == "android.widget.SeekBar" && range is { Current: 25, Min: 0, Max: 100 },
                "Range metadata is incorrect.");
            using var args = new Bundle();
            args.PutFloat(AccessibilityNodeInfo.ActionArgumentProgressValue, 61);
            Require(slider.PerformAction((NodeAction)NativeAction.ActionSetProgress!.Id, args), "Set progress failed.");
        }
        Wait(() => Exists(n => n.ContentDescription == "Level" && HasRangeValue(n, 61)), "Range value did not change.");
        using (var slider = Find(n => n.ContentDescription == "Level"))
            Require(slider.PerformAction(NodeAction.ScrollForward), "Range increment failed.");
        Wait(() => Exists(n => n.ContentDescription == "Level" && HasRangeValue(n, 62)), "Range increment did not publish.");
        using (var footer = Find(n => n.Text == "Scroll to this shared Cell"))
            Require(footer.PerformAction((NodeAction)NativeAction.ActionShowOnScreen!.Id), "Footer reveal failed.");
        Wait(() => Exists(n => n.Text == "Scroll to this shared Cell" && n.VisibleToUser), "Footer stayed clipped.");
        Drain();
        using (var scroller = Find(n => n.Scrollable && !n.Editable))
            Require(scroller.PerformAction(NodeAction.ScrollBackward), "Backward scroll failed.");
        WaitEvent(e => e.Type == EventTypes.ViewScrolled && e.MaxScrollY > 0, "Scroll event is missing.");
    }

    private void CheckSurface()
    {
        using var original = Find(n => n.ContentDescription == "Retained count: 1");
        Require(original.PerformAction((NodeAction)NativeAction.ActionShowOnScreen!.Id), "Counter reveal failed.");
        Require(original.AccessibilityFocused || original.PerformAction(NodeAction.AccessibilityFocus),
            "Counter reading focus failed before Surface replacement.");
        RunOnMainSync(() => activity.NativeView.Visibility = ViewStates.Gone);
        Wait(() => !Exists(n => n.ContentDescription == "Retained count: 1"), "Hidden Surface kept its virtual subtree.");
        Drain();
        RunOnMainSync(() => activity.NativeView.Visibility = ViewStates.Visible);
        Wait(() => Exists(n => n.ContentDescription == "Retained count: 1"), "Replacement Surface did not publish.");
        automation.WaitForIdle(250, 5000);
        using var restored = Find(n => n.ContentDescription == "Retained count: 1");
        Require(original.Equals(restored) && !restored.AccessibilityFocused, "Surface replacement changed IDs or kept stale reading focus.");
        Require(!events.Any(e => e.Description == "Counter status" && e.Type == EventTypes.WindowContentChanged),
            "Surface replacement replayed a live announcement.");
    }

    private void CheckActivityReplacement()
    {
        using var old = Find(n => n.ContentDescription == "Retained count: 1");
        using var monitor = AddMonitor(activity.Class!.Name, null, false)!;
        try
        {
            RunOnMainSync(activity.Recreate);
            activity = WaitForMonitorWithTimeout(monitor, 15000) as MainActivity
                ?? throw new InvalidOperationException("Replacement Activity did not start.");
        }
        finally
        {
            RemoveMonitor(monitor);
        }
        Wait(() => Exists(n => n.ClassName == "android.widget.Button"
            && n.ContentDescription?.StartsWith("Retained count:", StringComparison.Ordinal) == true),
            "Replacement Activity did not publish.");
        Require(!old.PerformAction(NodeAction.Click), "Disposed Activity accepted a stale virtual action.");
    }

    private static void SetSelection(AccessibilityNodeInfo node, int start, int end)
    {
        using var args = new Bundle();
        args.PutInt(AccessibilityNodeInfo.ActionArgumentSelectionStartInt, start);
        args.PutInt(AccessibilityNodeInfo.ActionArgumentSelectionEndInt, end);
        Require(node.PerformAction(NodeAction.SetSelection, args), "Set selection failed.");
    }

    private static bool HasRangeValue(AccessibilityNodeInfo node, float value)
    {
        using var range = node.GetRangeInfo();
        return range?.Current == value;
    }

    private static void Move(AccessibilityNodeInfo node, MovementGranularity granularity, bool forward)
    {
        using var args = new Bundle();
        args.PutInt(AccessibilityNodeInfo.ActionArgumentMovementGranularityInt, (int)granularity);
        Require(node.PerformAction(forward ? NodeAction.NextAtMovementGranularity : NodeAction.PreviousAtMovementGranularity, args),
            "Text movement failed.");
    }

    private AccessibilityNodeInfo Find(Func<AccessibilityNodeInfo, bool> predicate)
    {
        foreach (var window in automation.Windows!)
        {
            using (window)
            using (var root = window.Root)
                if (root?.PackageName == "org.goo.androidsmoke" && Search(root, predicate) is { } found) return found;
        }
        throw new InvalidOperationException("Expected Goo virtual node is missing.");
    }

    private static AccessibilityNodeInfo? Search(AccessibilityNodeInfo node, Func<AccessibilityNodeInfo, bool> predicate)
    {
        if (!node.Refresh()) return null;
        if (node.PackageName == "org.goo.androidsmoke" && predicate(node)) return new AccessibilityNodeInfo(node);
        for (var i = 0; i < node.ChildCount; i++)
            using (var child = node.GetChild(i))
                if (child is not null && Search(child, predicate) is { } found) return found;
        return null;
    }

    private bool Exists(Func<AccessibilityNodeInfo, bool> predicate)
    {
        try { using var node = Find(predicate); return true; }
        catch (InvalidOperationException) { return false; }
    }

    private void WaitEvent(Func<EventRecord, bool> predicate, string message) => Wait(() => events.Any(predicate), message);

    private static void Wait(Func<bool> condition, string message)
    {
        var deadline = SystemClock.UptimeMillis() + 15000;
        do
        {
            if (condition()) return;
            Thread.Sleep(50);
        } while (SystemClock.UptimeMillis() < deadline);
        throw new InvalidOperationException(message);
    }

    private void Drain()
    {
        automation.WaitForIdle(250, 5000);
        events.Clear();
    }

    private static void Require(bool condition, string message)
    {
        if (!condition) throw new InvalidOperationException(message);
    }

    private sealed class EventListener(ConcurrentQueue<EventRecord> events) : Java.Lang.Object, UiAutomation.IOnAccessibilityEventListener
    {
        public void OnAccessibilityEvent(AccessibilityEvent? e)
        {
            if (e?.PackageName != "org.goo.androidsmoke") return;
            events.Enqueue(new EventRecord(e.EventType, e.ContentDescription ?? "", string.Join(" ", e.Text!),
                e.BeforeText ?? "", e.FromIndex, e.ToIndex, e.Password, e.MaxScrollY));
        }
    }

    private readonly record struct EventRecord(EventTypes Type, string Description, string Text, string Before,
        int From, int To, bool Password, int MaxScrollY);
}
