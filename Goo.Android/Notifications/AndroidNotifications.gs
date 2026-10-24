package Goo

import Android.App
import Android.Content
import Android.Content.PM
import Android.OS
import AndroidUri = Android.Net.Uri
import Goo.Android
import System
import System.Threading
import System.Threading.Tasks

@assembly: UsesPermission("android.permission.POST_NOTIFICATIONS")

/// Opens Android notifications. Calls must run on the activity's UI thread.
public class AndroidNotifications {
    private init() {}

    shared {
        /// Creates the channel and a service bound to the activity, without requesting permission.
        /// @param owner The Goo activity that receives permission results and notification taps.
        /// @param options The channel ID, channel name and installed drawable small-icon resource name.
        /// @returns An owned service on Success, or an identity or native failure.
        /// @remarks Subscribe to Window.ApplicationActivated before the activity finishes CreateWindow.
        /// The service closes when the activity is destroyed. Existing notifications remain in the system.
        /// Activity launch and task policy remain under application control.
        public func Open(owner GooActivity, options NotificationOptions) NotificationServiceResult {
            ArgumentNullException.ThrowIfNull(owner)
            ArgumentNullException.ThrowIfNull(options)
            AndroidNotificationService.CheckThread()
            ObjectDisposedException.ThrowIf(owner.IsDestroyed, owner)
            if string.IsNullOrWhiteSpace(options.ChannelId) || string.IsNullOrWhiteSpace(options.ChannelName)
                || string.IsNullOrWhiteSpace(options.SmallIconResource) {
                return NotificationServiceResult(NotificationStatus.MissingIdentity, error: "Set the Android channel ID, name and small icon.")
            }
            let icon = owner.Resources!!.GetIdentifier(options.SmallIconResource, "drawable", owner.PackageName)
            if icon == 0 { return NotificationServiceResult(NotificationStatus.MissingIdentity, error: "The Android small-icon drawable was not found.") }
            try {
                let manager = owner.ApplicationContext!!.GetSystemService(Context.NotificationService) as NotificationManager
                if manager == nil { return NotificationServiceResult(NotificationStatus.Unsupported, error: "Android NotificationManager is unavailable.") }
                using let channel = NotificationChannel(options.ChannelId, options.ChannelName, NotificationImportance.Default)
                manager.CreateNotificationChannel(channel)
                return NotificationServiceResult(NotificationStatus.Success, AndroidNotificationService(owner, manager, options.ChannelId, icon))
            } catch (error Java.Lang.RuntimeException) {
                return NotificationServiceResult(NotificationStatus.Failed, error: error.Message ?? "Android notification setup failed.")
            }
        }
    }
}

internal sealed class AndroidNotificationService : NotificationService {
    private const PermissionName string = "android.permission.POST_NOTIFICATIONS"
    private const PermissionDecision string = "permissionDecision"
    private let manager NotificationManager
    private let channelId string
    private let icon int32
    private let requestCode int32 = Interlocked.Increment(&nextRequestCode)
    private var owner GooActivity?
    private var pending TaskCompletionSource[NotificationResult]?
    internal init(owner GooActivity, manager NotificationManager, channelId string, icon int32) {
        this.owner = owner
        this.manager = manager
        this.channelId = channelId
        this.icon = icon
        owner.PermissionsResultReceived += OnPermissionResult
        owner.Destroyed += Dispose
    }


    private func GetOwner() GooActivity {
        CheckThread()
        return owner ?? throw ObjectDisposedException(nameof(AndroidNotificationService))
    }

    public func GetPermissionAsync() Task[NotificationResult] {
        GetOwner()
        try { return Task.FromResult(QueryPermission()) }
        catch (error Java.Lang.RuntimeException) {
            return Task.FromResult(Result(NotificationStatus.Failed, error: error.Message ?? "Android permission query failed."))
        }
    }

    private func QueryPermission() NotificationResult {
        let activity = owner!!
        if OperatingSystem.IsAndroidVersionAtLeast(33) && activity.CheckSelfPermission(PermissionName) != Permission.Granted {
            using let preferences = activity.GetSharedPreferences("Goo.Notifications", FileCreationMode.Private)!!
            let decision = preferences.GetInt(PermissionDecision, -1)
            let permission = if activity.ShouldShowRequestPermissionRationale(PermissionName) || decision == 0 { NotificationPermission.Denied }
                else if decision == 1 { NotificationPermission.Disabled } else { NotificationPermission.NotDetermined }
            return Result(PermissionStatus(permission), permission)
        }
        if !manager.AreNotificationsEnabled() { return Result(NotificationStatus.Disabled, NotificationPermission.Disabled) }
        using let channel = manager.GetNotificationChannel(channelId)
        return if channel == nil || channel.Importance == NotificationImportance.None {
            Result(NotificationStatus.Disabled, NotificationPermission.Disabled)
        } else { Result(NotificationStatus.Success, NotificationPermission.Granted) }
    }

    public func RequestPermissionAsync() Task[NotificationResult] {
        let activity = GetOwner()
        if pending != nil { return Task.FromResult(Result(NotificationStatus.Failed, error: "A permission request is already pending.")) }
        try {
            let current = QueryPermission()
            if !OperatingSystem.IsAndroidVersionAtLeast(33) || activity.CheckSelfPermission(PermissionName) == Permission.Granted { return Task.FromResult(current) }
            let completion = TaskCompletionSource[NotificationResult](TaskCreationOptions.RunContinuationsAsynchronously)
            pending = completion
            activity.RequestPermissions([]string{PermissionName}, requestCode)
            return completion.Task
        } catch (error Java.Lang.RuntimeException) {
            pending = nil
            return Task.FromResult(Result(NotificationStatus.Failed, error: error.Message ?? "Android permission request failed."))
        }
    }

    private func OnPermissionResult(code int32, permissions[]string, grants[]Permission) {
        if code != requestCode { return }
        guard let completion = pending else { return }
        pending = nil
        try {
            var i = 0
            while i < permissions.Length && i < grants.Length {
                if permissions[i] != PermissionName { i++
continue }
                if grants[i] != Permission.Granted && !owner!!.ShouldShowRequestPermissionRationale(PermissionName) { break }
                using let preferences = owner!!.GetSharedPreferences("Goo.Notifications", FileCreationMode.Private)!!
                using let edit = preferences.Edit()!!
                edit.PutInt(PermissionDecision, if grants[i] == Permission.Granted { 1 } else { 0 })
                edit.Apply()
                break
            }
            completion.SetResult(QueryPermission())
        } catch (error Java.Lang.RuntimeException) {
            completion.SetResult(Result(NotificationStatus.Failed, error: error.Message ?? "Android permission query failed."))
        }
    }

    public func ShowAsync(message NotificationMessage) Task[NotificationResult] {
        let activity = GetOwner()
        ArgumentNullException.ThrowIfNull(message)
        message.Validate()
        try {
            let permission = QueryPermission()
            if permission.Permission != NotificationPermission.Granted { return Task.FromResult(Result(permission.Status, permission.Permission, id: message.Id)) }
            using let intent = Intent(activity, activity.Class)
            intent.SetAction("Goo.Android.Notification")
            intent.SetData(AndroidUri.Parse("goo-notification://${activity.PackageName}/${Uri.EscapeDataString(message.Id)}"))
            intent.PutExtra("Goo.NotificationId", message.Id)
            intent.PutExtra("Goo.ActionId", "")
            intent.PutExtra("Goo.Payload", message.Payload)
            using let click = PendingIntent.GetActivity(activity, 0, intent, PendingIntentFlags.UpdateCurrent | PendingIntentFlags.Immutable)
            using let builder = Notification.Builder(activity, channelId)
            builder.SetSmallIcon(icon)
            builder.SetContentTitle(message.Title)
            builder.SetContentText(message.Body)
            builder.SetContentIntent(click)
            builder.SetAutoCancel(true)
            using let notification = builder.Build()
            manager.Notify(message.Id, 0, notification)
            return Task.FromResult(Result(NotificationStatus.Accepted, NotificationPermission.Granted, NotificationDelivery.Accepted, message.Id))
        } catch (error Java.Lang.RuntimeException) {
            return Task.FromResult(Result(NotificationStatus.Failed, delivery: NotificationDelivery.Failed, id: message.Id,
                error: error.Message ?? "Android notification submission failed."))
        }
    }

    public func GetStatusAsync(id string) Task[NotificationResult] {
        GetOwner()
        NotificationMessage.ValidateId(id)
        try {
            var delivery = NotificationDelivery.Removed
            for entry in manager.GetActiveNotifications()!! {
                using let owned = entry
                if entry.Tag == id && entry.Id == 0 { delivery = NotificationDelivery.PresentInCenter }
            }
            return Task.FromResult(Result(NotificationStatus.Success, QueryPermission().Permission, delivery, id))
        } catch (error Java.Lang.RuntimeException) {
            return Task.FromResult(Result(NotificationStatus.Failed, id: id, error: error.Message ?? "Android notification query failed."))
        }
    }

    public func RemoveAsync(id string) Task[NotificationResult] {
        GetOwner()
        NotificationMessage.ValidateId(id)
        try {
            manager.Cancel(id, 0)
            return Task.FromResult(Result(NotificationStatus.Accepted, QueryPermission().Permission, NotificationDelivery.Removed, id))
        } catch (error Java.Lang.RuntimeException) {
            return Task.FromResult(Result(NotificationStatus.Failed, id: id, error: error.Message ?? "Android notification removal failed."))
        }
    }

    public func Dispose() {
        CheckThread()
        guard let activity = owner else { return }
        activity.PermissionsResultReceived -= OnPermissionResult
        activity.Destroyed -= Dispose
        owner = nil
        pending?.SetResult(Result(NotificationStatus.Failed, error: "The notification service closed during a permission request."))
        pending = nil
    }

    shared {
        private var nextRequestCode int32 = 23000
        internal func CheckThread() {
            if Looper.MyLooper() != Looper.MainLooper { throw InvalidOperationException("Android notification operations require the activity UI thread.") }
        }
        private func PermissionStatus(permission NotificationPermission) NotificationStatus -> switch permission {
            case NotificationPermission.Denied: NotificationStatus.Denied
            case NotificationPermission.Disabled: NotificationStatus.Disabled
            case _: NotificationStatus.PermissionRequired
        }

        private func Result(status NotificationStatus, permission NotificationPermission = NotificationPermission.Unknown,
            delivery NotificationDelivery = NotificationDelivery.Unknown, id string = "", error string = "") NotificationResult ->
            NotificationResult(status, permission, delivery, NotificationActivationSupport.WarmAndCold, id, error)
    }
}
