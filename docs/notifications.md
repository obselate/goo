# Notifications

```gsharp
let opened = Notifications.Open(NotificationOptions {
    ActivationScheme: "example-notification",
})
if opened.Status != NotificationStatus.Success {
    Console.Error.WriteLine(opened.Status)
    return
}
using let notifications = opened.Service!!
```

Reference `Goo` for desktop notifications. Subscribe to `Window.ApplicationActivated` and initialize application activation first. Configure the installed application ID with `Window.ConfigureApplication`.

Call `Open` and `Dispose` on the UI thread. On macOS, open before `SingleInstance.AcquireAsync` and before the first window opens. The service does not keep the application running.

## Permission and submission

Call `RequestPermissionAsync` from an explicit user action. `ShowAsync` never requests permission.

```gsharp
async func Send(service NotificationService) Task[NotificationResult] {
    let permission = await service.RequestPermissionAsync()
    if permission.Permission != NotificationPermission.Granted
        && permission.Permission != NotificationPermission.Unknown {
        return permission
    }
    return await service.ShowAsync(NotificationMessage {
        Id: "download-42",
        Title: "Download complete",
        Body: "The report is ready.",
        Payload: "report-42",
    })
}
```

Await these tasks without blocking the UI thread. Use the application's UI dispatch path for later window changes.

- `Accepted` means the native service accepted submission, not that it displayed a banner.
- `PresentInCenter` comes from a native query. It does not mean the user read the notification.
- `Unknown` means the platform cannot report permission or current presence.
- `Denied`, `Disabled`, `MissingIdentity` and `Unsupported` are explicit outcomes.
- `RemoveAsync` removes an accepted notification where the OS permits it.
- Reusing an ID replaces the application's earlier notification with that ID.

IDs contain 1 to 64 UTF-16 units and no NUL. Other strings fit 64 KiB of UTF-8 and contain no NUL. Native limits can be smaller. Windows toast XML must fit its native payload limit.

## Activation

Clicks use `Window.ApplicationActivated` with `Kind == ApplicationActivationKind.Notification`. Read `NotificationId`, `ActionId` and `Payload`. Default clicks have an empty `ActionId`. Validate opaque payloads before using them.

| Activation support | Meaning |
| --- | --- |
| `None` | No supported default-click route. |
| `WarmOnly` | The running service can receive a click. |
| `WarmAndCold` | The installed native route can also start the application. |

This describes the configured route, not a promise that the user will click or that the OS will run the app. Queue acceptance is not handler completion. On Wayland, call `RequestActivation` on the selected window from the activation handler to use the supplied activation token.

## Platform setup

| Platform | Setup and limits |
| --- | --- |
| Windows | Install a Start-menu shortcut with the configured AUMID and a stub toast-activator CLSID. Register a private protocol with `--goo-notification`, not `--goo-open-uri`. Use `Goo.AppHost` to parse and forward that route. No COM activator server is required. Missing registration returns `MissingIdentity`. Native submission and history are queried. Later asynchronous toast failures may remain `Unknown`. |
| macOS | Use a signed app bundle whose `CFBundleIdentifier` matches the configured ID. Goo owns `UNUserNotificationCenter.delegate`. Open before native launch completes so cold responses reach the shared activation event. An existing delegate is not replaced. Permission uses the OS prompt. Delivery queries inspect Notification Center. |
| Linux Wayland | Requires a session D-Bus notification daemon. Goo uses `org.freedesktop.Notifications`, with no native helper dependency. Permission and current presence are `Unknown`. Default clicks are `WarmOnly` when the daemon supports actions, otherwise `None`. Reopen the service after the daemon owner changes. No cold-start route is claimed. |
| Android | Install `Goo.Android`. Use `AndroidNotifications.Open(GooActivity, options)` on the owner UI thread. Supply `ChannelId`, `ChannelName` and a drawable `SmallIconResource`. The adapter supplies `POST_NOTIFICATIONS`. Android controls channel importance and notification settings. |

Android default clicks target the concrete `GooActivity`. Activity destruction closes the service and ends pending permission work. Accepted notifications and their `PendingIntent` routes survive service disposal.
