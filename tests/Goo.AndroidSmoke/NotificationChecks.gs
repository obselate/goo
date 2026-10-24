package GooAndroidSmokeApp

import Android.App
import Android.Content
import Android.Content.PM
import Android.OS
import Android.Views.Accessibility
import Goo
import Goo.Android
import GooAndroidSmoke
import GooWindow = Goo.Window
import System
import System.Threading
import System.Threading.Tasks
import NodeAction = Android.Views.Accessibility.Action
@Activity(Name: "org.goo.androidsmoke.NotificationActivity", Exported: true, LaunchMode: LaunchMode.SingleTop)
sealed class NotificationActivity : GooActivity {

    protected override func CreateWindow() Goo.Window {
        GooWindow.ApplicationActivated += OnActivation
        return SmokeApplication.CreateWindow()
    }

    shared {
        private var lastNotification ApplicationActivation?
        internal prop LastNotification ApplicationActivation? {
            get -> Volatile.Read(&lastNotification)
            set -> Volatile.Write(&lastNotification, value)
        }
        private func OnActivation(activation ApplicationActivation) {
            if activation.Kind != ApplicationActivationKind.Notification { return }
            LastNotification = activation
            Android.Util.Log.Info("GooNotifications", "id=${activation.NotificationId} payload=${activation.Payload} initial=${activation.IsInitial} action=${activation.ActionId}")
        }

    }

    protected override func OnDestroy() {
        GooWindow.ApplicationActivated -= OnActivation
        base.OnDestroy()
    }
}
@Instrumentation(Name: "org.goo.androidsmoke.NotificationChecks", TargetPackage: "org.goo.androidsmoke", FunctionalTest: true)
sealed class NotificationChecks : Instrumentation {
    private var activity NotificationActivity?
    private var automation UiAutomation?
    private var service NotificationService?
    public init() {}
    public init(handle nint, ownership Android.Runtime.JniHandleOwnership) : base(handle, ownership) {}

    override func OnCreate(arguments Bundle?) {
        base.OnCreate(arguments)
        Start()
    }

    override func OnStart() {
        using let result = Bundle()
        var status = Result.Ok
        try {
            automation = UiAutomation ?? throw InvalidOperationException("UiAutomation is unavailable.")
            using let info = automation!!.ServiceInfo!!
            info.Flags |= Android.AccessibilityServices.AccessibilityServiceFlags.ReportViewIds
            automation!!.ServiceInfo = info
            using let intent = Intent(TargetContext!!, typeof(NotificationActivity))
            intent.AddFlags(ActivityFlags.NewTask | ActivityFlags.ClearTask)
            activity = NotificationActivity(StartActivitySync(intent)!!)
            RunOnMainSync(() -> {
                let opened = AndroidNotifications.Open(activity!!, Options("smoke"))
                Require(opened.Status == NotificationStatus.Success, "Open failed: " + opened.Error)
                service = opened.Service!!
            })
            CheckPermission()
            CheckDelivery()
            CheckDisabledChannel()
            CheckActivityRecreation()
            Require(Call(() -> service!!.ShowAsync(Message("cold", "Goo cold activation", "cold-payload"))).Status == NotificationStatus.Accepted,
                "Cold activation notification was not accepted.")
            RunOnMainSync(service!!.Dispose)
            result.PutString("stream", "GOO_NOTIFICATIONS_PASS\n")
        } catch (error Exception) {
            result.PutString("stream", "GOO_NOTIFICATIONS_FAIL\n" + error.ToString() + "\n")
            status = Result.Canceled
        }
        Finish(status, result)
    }

    private func CheckPermission() {
        Require(Call(service!!.GetPermissionAsync).Permission == NotificationPermission.NotDetermined, "A new install did not report NotDetermined.")
        Require(Call(() -> service!!.ShowAsync(Message("blocked", "Blocked", ""))).Status == NotificationStatus.PermissionRequired, "Show requested or bypassed permission.")
        var pending Task[NotificationResult]? = nil
        RunOnMainSync(() -> { pending = service!!.RequestPermissionAsync() })
        Require(Call(service!!.RequestPermissionAsync).Status == NotificationStatus.Failed, "A second permission request was accepted.")
        Wait(() -> HasPermissionButton("permission_allow_button"), "Permission dialog did not open.")
        DismissPermission()
        Require(Await(pending!!).Permission == NotificationPermission.NotDetermined, "Dismissal changed the permission decision.")
        RunOnMainSync(() -> { pending = service!!.RequestPermissionAsync() })
        Wait(() -> HasPermissionButton("permission_allow_button"), "Permission dialog did not reopen.")
        RunOnMainSync(service!!.Dispose)
        Require(Await(pending!!).Status == NotificationStatus.Failed, "Disposal left a pending permission task.")
        DismissPermission()
        RunOnMainSync(() -> { service = AndroidNotifications.Open(activity!!, Options("smoke")).Service!! })
        RunOnMainSync(() -> { pending = service!!.RequestPermissionAsync() })
        ClickPermission("permission_deny_button")
        Require(Await(pending!!).Permission == NotificationPermission.Denied, "Denial did not report Denied.")
        Require(Call(() -> service!!.ShowAsync(Message("blocked", "Blocked", ""))).Status == NotificationStatus.Denied, "Show ignored permission denial.")
        RunOnMainSync(() -> { pending = service!!.RequestPermissionAsync() })
        ClickPermission("permission_allow_button")
        Require(Await(pending!!).Permission == NotificationPermission.Granted, "Grant did not report Granted.")
    }

    private func DismissPermission() {
        Require(automation!!.PerformGlobalAction(Android.AccessibilityServices.GlobalAction.Back), "Permission dialog back action failed.")
        Wait(() -> !HasPermissionButton("permission_allow_button"), "Permission dialog did not close.")
    }

    private func CheckDelivery() {
        Require(Call(() -> service!!.ShowAsync(Message("warm", "Goo warm activation", "old"))).Delivery == NotificationDelivery.Accepted, "Submission did not report Accepted.")
        RunOnMainSync(() -> {
            using let replacement = AndroidNotifications.Open(activity!!, Options("replacement")).Service!!
            Require(replacement.ShowAsync(Message("warm", "Goo warm activation", "new-😀")).Result.Status == NotificationStatus.Accepted, "Cross-channel replacement failed.")
        })
        Wait(() -> Call(() -> service!!.GetStatusAsync("warm")).Delivery == NotificationDelivery.PresentInCenter, "Accepted notification was not in the center.")
        let manager = NotificationManager(activity!!.GetSystemService(Context.NotificationService)!!)
        let active = manager.GetActiveNotifications()!!
        try {
            Require(active.Length == 1, "Replacement created a second notification.")
            NotificationActivity.LastNotification = nil
            RunOnMainSync(() -> { active[0].Notification!!.ContentIntent!!.Send() })
            Wait(() -> NotificationActivity.LastNotification?.NotificationId == "warm", "Warm tap did not activate Goo.")
            let activation = NotificationActivity.LastNotification!!
            Require(!activation.IsInitial && activation.Payload == "new-😀" && activation.ActionId == "", "Warm activation lost replacement data or initial state.")
        } finally { for entry in active { entry.Dispose() } }
        Require(Call(service!!.GetPermissionAsync).ActivationSupport == NotificationActivationSupport.WarmAndCold, "The explicit activity route did not report WarmAndCold.")
        Require(Call(() -> service!!.RemoveAsync("warm")).Delivery == NotificationDelivery.Removed, "Removal was not accepted.")
        Wait(() -> Call(() -> service!!.GetStatusAsync("warm")).Delivery == NotificationDelivery.Removed, "Removal left an active entry.")
    }

    private func CheckDisabledChannel() {
        RunOnMainSync(() -> {
            let manager = NotificationManager(activity!!.GetSystemService(Context.NotificationService)!!)
            using let channel = NotificationChannel("disabled", "Disabled smoke", NotificationImportance.None)
            manager.CreateNotificationChannel(channel)
            using let disabled = AndroidNotifications.Open(activity!!, Options("disabled")).Service!!
            Require(disabled.GetPermissionAsync().Result.Permission == NotificationPermission.Disabled, "Disabled channel did not report Disabled.")
            Require(disabled.ShowAsync(Message("disabled", "Disabled", "")).Result.Status == NotificationStatus.Disabled, "Show ignored the disabled channel.")
        })
    }

    private func CheckActivityRecreation() {
        let oldService = service!!
        let monitor = AddMonitor("org.goo.androidsmoke.NotificationActivity", nil, false)!!
        try {
            RunOnMainSync(activity!!.Recreate)
            activity = NotificationActivity(WaitForMonitorWithTimeout(monitor, 10000) ?? throw InvalidOperationException("The activity did not recreate."))
            RunOnMainSync(() -> {
                var closed = false
                try { oldService.GetPermissionAsync() }
                catch (_ ObjectDisposedException) { closed = true }
                Require(closed, "Activity destruction did not close the old service.")
                service = AndroidNotifications.Open(activity!!, Options("smoke")).Service!!
            })
        } finally {
            RemoveMonitor(monitor)
            monitor.Dispose()
        }
    }

    private func Options(channel string) NotificationOptions -> NotificationOptions{
        ChannelId: channel, ChannelName: "Goo notification smoke", SmallIconResource: "goo_notification"
    }

    private func Message(id string, title string, payload string) NotificationMessage -> NotificationMessage{
        Id: id, Title: title, Body: "Android NotificationManager smoke", Payload: payload
    }

    private func Call(operation Func[Task[NotificationResult]]) NotificationResult {
        var task Task[NotificationResult]? = nil
        RunOnMainSync(() -> { task = operation() })
        return Await(task!!)
    }

    private func Await(task Task[NotificationResult]) NotificationResult {
        Require(task.Wait(TimeSpan.FromSeconds(10)), "Notification operation did not complete.")
        return task.GetAwaiter().GetResult()
    }

    private func HasPermissionButton(id string) bool {
        using let root = automation!!.RootInActiveWindow
        using let button = if root == nil { nil } else { FindButton(root, id) }
        return button != nil
    }

    private func ClickPermission(id string) {
        Wait(() -> {
            using let root = automation!!.RootInActiveWindow
            using let button = if root == nil { nil } else { FindButton(root, id) }
            return button != nil && button.PerformAction(NodeAction.Click)
        }, "Permission button click failed: " + id)
    }

    private func FindButton(node AccessibilityNodeInfo, id string) AccessibilityNodeInfo? {
        if node.ViewIdResourceName?.EndsWith(":id/" + id, StringComparison.Ordinal) == true { return AccessibilityNodeInfo(node) }
        var i = 0
        while i < node.ChildCount {
            using let child = node.GetChild(i)
            if child != nil { if let found = FindButton(child, id) { return found } }
            i++
        }
        return nil
    }

    private func Wait(condition Func[bool], error string) {
        let deadline = SystemClock.UptimeMillis() + 10000
        while SystemClock.UptimeMillis() < deadline {
            if condition() { return }
            Thread.Sleep(50)
        }
        throw InvalidOperationException(error)
    }

    private func Require(condition bool, error string) {
        if !condition { throw InvalidOperationException(error) }
    }
}
