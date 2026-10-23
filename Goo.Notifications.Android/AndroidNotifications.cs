using Android.App;
using Android.Content;
using Android.Content.PM;
using Android.OS;
using Goo.Android;

namespace Goo;

/// <summary>Opens Android notifications. Calls must run on the activity's UI thread.</summary>
public static class AndroidNotifications
{
    /// <summary>Creates the channel and a service bound to the activity, without requesting permission.</summary>
    /// <param name="owner">The Goo activity that receives permission results and notification taps.</param>
    /// <param name="options">The channel ID, channel name and installed drawable small-icon resource name.</param>
    /// <returns>An owned service on Success, or an identity or native failure.</returns>
    /// <remarks>
    /// Subscribe to Window.ApplicationActivated before the activity finishes CreateWindow.
    /// The service closes when the activity is destroyed. Existing notifications remain in the system.
    /// Activity launch and task policy remain under application control.
    /// </remarks>
    public static NotificationServiceResult Open(GooActivity owner, NotificationOptions options)
    {
        ArgumentNullException.ThrowIfNull(owner);
        ArgumentNullException.ThrowIfNull(options);
        AndroidNotificationService.CheckThread();
        ObjectDisposedException.ThrowIf(owner.IsDestroyed, owner);
        if (string.IsNullOrWhiteSpace(options.ChannelId) || string.IsNullOrWhiteSpace(options.ChannelName)
            || string.IsNullOrWhiteSpace(options.SmallIconResource))
            return new(NotificationStatus.MissingIdentity, error: "Set the Android channel ID, name and small icon.");

        var icon = owner.Resources!.GetIdentifier(options.SmallIconResource, "drawable", owner.PackageName);
        if (icon == 0)
            return new(NotificationStatus.MissingIdentity, error: "The Android small-icon drawable was not found.");

        try
        {
            var manager = (NotificationManager?)owner.ApplicationContext!.GetSystemService(Context.NotificationService);
            if (manager is null)
                return new(NotificationStatus.Unsupported, error: "Android NotificationManager is unavailable.");

            using var channel = new NotificationChannel(options.ChannelId, options.ChannelName, NotificationImportance.Default);
            manager.CreateNotificationChannel(channel);
            return new(NotificationStatus.Success, new AndroidNotificationService(owner, manager, options.ChannelId, icon));
        }
        catch (Java.Lang.RuntimeException error)
        {
            return new(NotificationStatus.Failed, error: error.Message ?? "Android notification setup failed.");
        }
    }
}

internal sealed class AndroidNotificationService : NotificationService
{
    private const string PermissionName = "android.permission.POST_NOTIFICATIONS";
    private const string PermissionDecision = "permissionDecision";
    private static int nextRequestCode = 23000;
    private readonly NotificationManager manager;
    private readonly string channelId;
    private readonly int icon;
    private readonly int requestCode = Interlocked.Increment(ref nextRequestCode);
    private GooActivity? owner;
    private TaskCompletionSource<NotificationResult>? pending;

    internal AndroidNotificationService(GooActivity owner, NotificationManager manager, string channelId, int icon)
    {
        this.owner = owner;
        this.manager = manager;
        this.channelId = channelId;
        this.icon = icon;
        owner.PermissionsResultReceived += OnPermissionResult;
        owner.Destroyed += Dispose;
    }

    internal static void CheckThread()
    {
        if (Looper.MyLooper() != Looper.MainLooper)
            throw new InvalidOperationException("Android notification operations require the activity UI thread.");
    }

    private GooActivity GetOwner()
    {
        CheckThread();
        return owner ?? throw new ObjectDisposedException(nameof(AndroidNotificationService));
    }

    public Task<NotificationResult> GetPermissionAsync()
    {
        GetOwner();
        try
        {
            return Task.FromResult(QueryPermission());
        }
        catch (Java.Lang.RuntimeException error)
        {
            return Task.FromResult(Result(NotificationStatus.Failed, error: error.Message ?? "Android permission query failed."));
        }
    }

    private NotificationResult QueryPermission()
    {
        var activity = owner!;
        if (OperatingSystem.IsAndroidVersionAtLeast(33) && activity.CheckSelfPermission(PermissionName) != Permission.Granted)
        {
            using var preferences = activity.GetSharedPreferences("Goo.Notifications", FileCreationMode.Private)!;
            var decision = preferences.GetInt(PermissionDecision, -1);
            var permission = activity.ShouldShowRequestPermissionRationale(PermissionName) || decision == 0
                ? NotificationPermission.Denied
                : decision == 1 ? NotificationPermission.Disabled : NotificationPermission.NotDetermined;
            return Result(PermissionStatus(permission), permission);
        }

        if (!manager.AreNotificationsEnabled())
            return Result(NotificationStatus.Disabled, NotificationPermission.Disabled);

        using var channel = manager.GetNotificationChannel(channelId);
        return channel is null || channel.Importance == NotificationImportance.None
            ? Result(NotificationStatus.Disabled, NotificationPermission.Disabled)
            : Result(NotificationStatus.Success, NotificationPermission.Granted);
    }

    public Task<NotificationResult> RequestPermissionAsync()
    {
        var activity = GetOwner();
        if (pending is not null)
            return Task.FromResult(Result(NotificationStatus.Failed, error: "A permission request is already pending."));

        try
        {
            var current = QueryPermission();
            if (!OperatingSystem.IsAndroidVersionAtLeast(33) || activity.CheckSelfPermission(PermissionName) == Permission.Granted)
                return Task.FromResult(current);

            var completion = new TaskCompletionSource<NotificationResult>(TaskCreationOptions.RunContinuationsAsynchronously);
            pending = completion;
            activity.RequestPermissions([PermissionName], requestCode);
            return completion.Task;
        }
        catch (Java.Lang.RuntimeException error)
        {
            pending = null;
            return Task.FromResult(Result(NotificationStatus.Failed, error: error.Message ?? "Android permission request failed."));
        }
    }

    private void OnPermissionResult(int code, string[] permissions, Permission[] grants)
    {
        if (code != requestCode || pending is not { } completion)
            return;

        pending = null;
        try
        {
            for (var i = 0; i < permissions.Length && i < grants.Length; i++)
            {
                if (permissions[i] != PermissionName)
                    continue;

                using var preferences = owner!.GetSharedPreferences("Goo.Notifications", FileCreationMode.Private)!;
                using var edit = preferences.Edit()!;
                edit.PutInt(PermissionDecision, grants[i] == Permission.Granted ? 1 : 0);
                edit.Apply();
                break;
            }
            completion.SetResult(QueryPermission());
        }
        catch (Java.Lang.RuntimeException error)
        {
            completion.SetResult(Result(NotificationStatus.Failed, error: error.Message ?? "Android permission query failed."));
        }
    }

    public Task<NotificationResult> ShowAsync(NotificationMessage message)
    {
        var activity = GetOwner();
        ArgumentNullException.ThrowIfNull(message);
        message.Validate();
        try
        {
            var permission = QueryPermission();
            if (permission.Permission != NotificationPermission.Granted)
                return Task.FromResult(Result(permission.Status, permission.Permission, id: message.Id));

            using var intent = new Intent(activity, activity.Class);
            intent.SetAction("Goo.Android.Notification");
            intent.SetData(global::Android.Net.Uri.Parse($"goo-notification://{activity.PackageName}/{Uri.EscapeDataString(channelId)}/{Uri.EscapeDataString(message.Id)}"));
            intent.PutExtra("Goo.NotificationId", message.Id);
            intent.PutExtra("Goo.ActionId", "");
            intent.PutExtra("Goo.Payload", message.Payload);
            using var click = PendingIntent.GetActivity(activity, 0, intent,
                PendingIntentFlags.UpdateCurrent | PendingIntentFlags.Immutable);
            using var builder = new Notification.Builder(activity, channelId);
            builder.SetSmallIcon(icon);
            builder.SetContentTitle(message.Title);
            builder.SetContentText(message.Body);
            builder.SetContentIntent(click);
            builder.SetAutoCancel(true);
            using var notification = builder.Build();
            manager.Notify(Tag(message.Id), 0, notification);
            return Task.FromResult(Result(NotificationStatus.Accepted, NotificationPermission.Granted,
                NotificationDelivery.Accepted, message.Id));
        }
        catch (Java.Lang.RuntimeException error)
        {
            return Task.FromResult(Result(NotificationStatus.Failed, delivery: NotificationDelivery.Failed,
                id: message.Id, error: error.Message ?? "Android notification submission failed."));
        }
    }

    public Task<NotificationResult> GetStatusAsync(string id)
    {
        GetOwner();
        NotificationMessage.ValidateId(id);
        try
        {
            var delivery = NotificationDelivery.Removed;
            var tag = Tag(id);
            foreach (var entry in manager.GetActiveNotifications()!)
            {
                using (entry)
                {
                    if (entry.Tag == tag && entry.Id == 0)
                        delivery = NotificationDelivery.PresentInCenter;
                }
            }
            return Task.FromResult(Result(NotificationStatus.Success, QueryPermission().Permission, delivery, id));
        }
        catch (Java.Lang.RuntimeException error)
        {
            return Task.FromResult(Result(NotificationStatus.Failed, id: id,
                error: error.Message ?? "Android notification query failed."));
        }
    }

    public Task<NotificationResult> RemoveAsync(string id)
    {
        GetOwner();
        NotificationMessage.ValidateId(id);
        try
        {
            manager.Cancel(Tag(id), 0);
            return Task.FromResult(Result(NotificationStatus.Accepted, QueryPermission().Permission,
                NotificationDelivery.Removed, id));
        }
        catch (Java.Lang.RuntimeException error)
        {
            return Task.FromResult(Result(NotificationStatus.Failed, id: id,
                error: error.Message ?? "Android notification removal failed."));
        }
    }

    public void Dispose()
    {
        CheckThread();
        if (owner is not { } activity)
            return;

        activity.PermissionsResultReceived -= OnPermissionResult;
        activity.Destroyed -= Dispose;
        owner = null;
        pending?.SetResult(Result(NotificationStatus.Failed, error: "The notification service closed during a permission request."));
        pending = null;
    }

    private string Tag(string id) => $"Goo:{channelId.Length}:{channelId}:{id}";

    private static NotificationStatus PermissionStatus(NotificationPermission permission) => permission switch
    {
        NotificationPermission.Denied => NotificationStatus.Denied,
        NotificationPermission.Disabled => NotificationStatus.Disabled,
        _ => NotificationStatus.PermissionRequired
    };

    private static NotificationResult Result(NotificationStatus status,
        NotificationPermission permission = NotificationPermission.Unknown,
        NotificationDelivery delivery = NotificationDelivery.Unknown, string id = "", string error = "")
        => new(status, permission, delivery, NotificationActivationSupport.WarmAndCold, id, error);
}
