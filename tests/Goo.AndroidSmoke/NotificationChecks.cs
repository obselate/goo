using Android.App;
using Android.Content;
using Android.Content.PM;
using Android.OS;
using Android.Views;
using Android.Views.Accessibility;
using Goo;
using Goo.Android;
using GooAndroidSmoke;
using NodeAction = Android.Views.Accessibility.Action;

namespace GooAndroidSmokeApp;

[Activity(Name = "org.goo.androidsmoke.NotificationActivity", Exported = true, LaunchMode = LaunchMode.SingleTop)]
public sealed class NotificationActivity : GooActivity
{
    internal static volatile ApplicationActivation? LastNotification;

    protected override Goo.Window CreateWindow()
    {
        Goo.Window.ApplicationActivated += OnActivation;
        return SmokeApplication.CreateWindow();
    }

    private static void OnActivation(ApplicationActivation activation)
    {
        if (activation.Kind != ApplicationActivationKind.Notification)
            return;

        LastNotification = activation;
        global::Android.Util.Log.Info("GooNotifications",
            $"id={activation.NotificationId} payload={activation.Payload} initial={activation.IsInitial} action={activation.ActionId}");
    }

    protected override void OnDestroy()
    {
        Goo.Window.ApplicationActivated -= OnActivation;
        base.OnDestroy();
    }
}

[Instrumentation(Name = "org.goo.androidsmoke.NotificationChecks", TargetPackage = "org.goo.androidsmoke", FunctionalTest = true)]
public sealed class NotificationChecks : Instrumentation
{
    private NotificationActivity activity = null!;
    private UiAutomation automation = null!;
    private NotificationService service = null!;

    public NotificationChecks() { }

    public NotificationChecks(IntPtr handle, global::Android.Runtime.JniHandleOwnership ownership) : base(handle, ownership) { }

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
                info.Flags |= global::Android.AccessibilityServices.AccessibilityServiceFlags.ReportViewIds;
                automation.ServiceInfo = info;
            }
            using var intent = new Intent(TargetContext!, typeof(NotificationActivity));
            intent.AddFlags(ActivityFlags.NewTask | ActivityFlags.ClearTask);
            activity = (NotificationActivity)StartActivitySync(intent)!;
            RunOnMainSync(() =>
            {
                var opened = AndroidNotifications.Open(activity, Options("smoke"));
                Require(opened.Status == NotificationStatus.Success, "Open failed: " + opened.Error);
                service = opened.Service!;
            });
            CheckPermission();
            CheckDelivery();
            CheckDisabledChannel();
            CheckActivityRecreation();
            Require(Call(() => service.ShowAsync(Message("cold", "Goo cold activation", "cold-payload"))).Status
                == NotificationStatus.Accepted, "Cold activation notification was not accepted.");
            RunOnMainSync(service.Dispose);
            result.PutString("stream", "GOO_NOTIFICATIONS_PASS\n");
        }
        catch (Exception error)
        {
            result.PutString("stream", "GOO_NOTIFICATIONS_FAIL\n" + error + "\n");
            status = Result.Canceled;
        }
        Finish(status, result);
    }

    private void CheckPermission()
    {
        Require(Call(service.GetPermissionAsync).Permission == NotificationPermission.NotDetermined,
            "A new install did not report NotDetermined.");
        Require(Call(() => service.ShowAsync(Message("blocked", "Blocked", ""))).Status == NotificationStatus.PermissionRequired,
            "Show requested or bypassed permission.");
        Task<NotificationResult>? pending = null;
        RunOnMainSync(() => pending = service.RequestPermissionAsync());
        Require(Call(service.RequestPermissionAsync).Status == NotificationStatus.Failed, "A second permission request was accepted.");
        Wait(() => HasPermissionButton("permission_allow_button"), "Permission dialog did not open.");
        DismissPermission();
        Require(Await(pending!).Permission == NotificationPermission.NotDetermined, "Dismissal changed the permission decision.");

        RunOnMainSync(() => pending = service.RequestPermissionAsync());
        Wait(() => HasPermissionButton("permission_allow_button"), "Permission dialog did not reopen.");
        RunOnMainSync(service.Dispose);
        Require(Await(pending!).Status == NotificationStatus.Failed, "Disposal left a pending permission task.");
        DismissPermission();
        RunOnMainSync(() => service = AndroidNotifications.Open(activity, Options("smoke")).Service!);

        RunOnMainSync(() => pending = service.RequestPermissionAsync());
        ClickPermission("permission_deny_button");
        Require(Await(pending!).Permission == NotificationPermission.Denied, "Denial did not report Denied.");
        Require(Call(() => service.ShowAsync(Message("blocked", "Blocked", ""))).Status == NotificationStatus.Denied,
            "Show ignored permission denial.");
        RunOnMainSync(() => pending = service.RequestPermissionAsync());
        ClickPermission("permission_allow_button");
        Require(Await(pending!).Permission == NotificationPermission.Granted, "Grant did not report Granted.");
    }

    private void DismissPermission()
    {
        using (var down = new KeyEvent(KeyEventActions.Down, Keycode.Back))
            Require(automation.InjectInputEvent(down, true), "Permission dismissal key failed.");
        using (var up = new KeyEvent(KeyEventActions.Up, Keycode.Back))
            Require(automation.InjectInputEvent(up, true), "Permission dismissal key failed.");
        Wait(() => !HasPermissionButton("permission_allow_button"), "Permission dialog did not close.");
    }

    private void CheckDelivery()
    {
        Require(Call(() => service.ShowAsync(Message("warm", "Goo warm activation", "old"))).Delivery == NotificationDelivery.Accepted,
            "Submission did not report Accepted.");
        Require(Call(() => service.ShowAsync(Message("warm", "Goo warm activation", "new-😀"))).Status == NotificationStatus.Accepted,
            "Replacement failed.");
        Require(Call(() => service.GetStatusAsync("warm")).Delivery == NotificationDelivery.PresentInCenter,
            "Accepted notification was not in the center.");
        var manager = (NotificationManager)activity.GetSystemService(Context.NotificationService)!;
        var active = manager.GetActiveNotifications()!;
        try
        {
            Require(active.Length == 1, "Replacement created a second notification.");
            NotificationActivity.LastNotification = null;
            RunOnMainSync(() => active[0].Notification!.ContentIntent!.Send());
            Wait(() => NotificationActivity.LastNotification?.NotificationId == "warm", "Warm tap did not activate Goo.");
            var activation = NotificationActivity.LastNotification!;
            Require(!activation.IsInitial && activation.Payload == "new-😀" && activation.ActionId == "",
                "Warm activation lost replacement data or initial state.");
        }
        finally
        {
            foreach (var entry in active)
                entry.Dispose();
        }
        Require(Call(service.GetPermissionAsync).ActivationSupport == NotificationActivationSupport.WarmAndCold,
            "The explicit activity route did not report WarmAndCold.");
        Require(Call(() => service.RemoveAsync("warm")).Delivery == NotificationDelivery.Removed, "Removal was not accepted.");
        Require(Call(() => service.GetStatusAsync("warm")).Delivery == NotificationDelivery.Removed, "Removal left an active entry.");
    }

    private void CheckDisabledChannel()
    {
        RunOnMainSync(() =>
        {
            var manager = (NotificationManager)activity.GetSystemService(Context.NotificationService)!;
            using var channel = new NotificationChannel("disabled", "Disabled smoke", NotificationImportance.None);
            manager.CreateNotificationChannel(channel);
            using var disabled = AndroidNotifications.Open(activity, Options("disabled")).Service!;
            Require(disabled.GetPermissionAsync().Result.Permission == NotificationPermission.Disabled,
                "Disabled channel did not report Disabled.");
            Require(disabled.ShowAsync(Message("disabled", "Disabled", "")).Result.Status == NotificationStatus.Disabled,
                "Show ignored the disabled channel.");
        });
    }

    private void CheckActivityRecreation()
    {
        var oldService = service;
        var monitor = AddMonitor("org.goo.androidsmoke.NotificationActivity", null, false)!;
        try
        {
            RunOnMainSync(activity.Recreate);
            activity = (NotificationActivity)(WaitForMonitorWithTimeout(monitor, 10000)
                ?? throw new InvalidOperationException("The activity did not recreate."));
            RunOnMainSync(() =>
            {
                var closed = false;
                try
                {
                    oldService.GetPermissionAsync();
                }
                catch (ObjectDisposedException)
                {
                    closed = true;
                }
                Require(closed, "Activity destruction did not close the old service.");
                service = AndroidNotifications.Open(activity, Options("smoke")).Service!;
            });
        }
        finally
        {
            RemoveMonitor(monitor);
            monitor.Dispose();
        }
    }

    private static NotificationOptions Options(string channel) => new()
    {
        ChannelId = channel,
        ChannelName = "Goo notification smoke",
        SmallIconResource = "goo_notification"
    };

    private static NotificationMessage Message(string id, string title, string payload) => new()
    {
        Id = id,
        Title = title,
        Body = "Android NotificationManager smoke",
        Payload = payload
    };

    private NotificationResult Call(Func<Task<NotificationResult>> operation)
    {
        Task<NotificationResult>? task = null;
        RunOnMainSync(() => task = operation());
        return Await(task!);
    }

    private static NotificationResult Await(Task<NotificationResult> task)
    {
        Require(task.Wait(TimeSpan.FromSeconds(10)), "Notification operation did not complete.");
        return task.GetAwaiter().GetResult();
    }

    private bool HasPermissionButton(string id)
    {
        using var root = automation.RootInActiveWindow;
        using var button = root is null ? null : FindButton(root, id);
        return button is not null;
    }

    private void ClickPermission(string id)
    {
        Wait(() => HasPermissionButton(id), "Permission button did not appear: " + id);
        using var root = automation.RootInActiveWindow!;
        using var button = FindButton(root, id)!;
        Require(button.PerformAction(NodeAction.Click), "Permission button click failed.");
    }

    private static AccessibilityNodeInfo? FindButton(AccessibilityNodeInfo node, string id)
    {
        if (node.ViewIdResourceName?.EndsWith(":id/" + id, StringComparison.Ordinal) == true)
            return new AccessibilityNodeInfo(node);

        for (var i = 0; i < node.ChildCount; i++)
        {
            using var child = node.GetChild(i);
            if (child is not null && FindButton(child, id) is { } found)
                return found;
        }
        return null;
    }

    private static void Wait(Func<bool> condition, string error)
    {
        var deadline = SystemClock.UptimeMillis() + 10000;
        while (SystemClock.UptimeMillis() < deadline)
        {
            if (condition())
                return;
            Thread.Sleep(50);
        }
        throw new InvalidOperationException(error);
    }

    private static void Require(bool condition, string error)
    {
        if (!condition)
            throw new InvalidOperationException(error);
    }
}
