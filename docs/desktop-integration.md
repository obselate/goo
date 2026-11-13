# Desktop integration

## Single instance and activation

```gsharp
import Goo
import System

func Main() {
    Application.Configure("Example", "1.0", "org.example.App")
    Application.Activated += request -> {
        Console.WriteLine(String.Join(" | ", request.Arguments))
    }
    let arguments = Environment.GetCommandLineArgs()
    let result = Application.AcquireSingleInstance(arguments[1..])
    if result.Status == SingleInstanceStatus.Forwarded { return }
    if result.Status != SingleInstanceStatus.Primary {
        Console.Error.WriteLine(result.Status.ToString() + ": " + result.Error)
        return
    }
    using let lease = result.Lease!!
    let window = Window{Size: LayoutSize(320, 200), Root: Cell{}}
    Application.Run(window)
}
```

Reference `Goo`. Configure identity and acquire on the UI thread before opening a window. `AcquireSingleInstance` parses the startup arguments and starts activation delivery. Keep the primary lease until shutdown.

| Result | Action |
| --- | --- |
| `Primary` | Keep the returned lease and run the app. |
| `Forwarded` | Exit. The primary accepted the request into its queue. Its handler may not have run yet. |
| `TimedOut` | Report the failure. Do not start a second primary or resend the request. |
| `Rejected`, `Unsupported`, `Failed` | Report the status and error. |

- Acquisition is scoped to the current user and session. Linux uses the private `XDG_RUNTIME_DIR`.
- Forwarding preserves argument boundaries, empty strings, Unicode and the sender's working directory. It does not change the receiver's current directory.
- A forwarded Launch becomes Arguments with `IsInitial == false`.
- Closing the last window ends `Run`. A lease, tray icon or notification service does not add a background application lifetime.
- See [AppHost](api/apphost.md) for request limits and outcomes. Android uses [Activity activation](android.md#activation), not desktop single-instance acquisition.

## File associations

`ActivationArguments.Read` excludes the executable name. The installer owns the association commands:

| Arguments | Request |
| --- | --- |
| `--goo-open-uri URI` | URI activation. |
| `--goo-open-documents URI...` | Document batch. |
| `--goo-notification URI` | Notification activation. |

The OS can normalize URI text. Route with URI fields, not byte-for-byte input comparisons. The app owns document access and window selection.

### Windows

Quote the executable and each substituted argument. Do not use a command shell. Keep default-handler choices under OS control.

| Per-user registry key under `HKCU\Software\Classes` | Value |
| --- | --- |
| `example` | Default `URL:Example`, plus an empty `URL Protocol` string. |
| `example\shell\open\command` | `"C:\Program Files\Example\Example.exe" --goo-open-uri "%1"` |
| `.example` | Default `Example.Document`. |
| `Example.Document\shell\open\command` | `"C:\Program Files\Example\Example.exe" --goo-open-documents "%1"` |

### macOS

- Declare schemes in `CFBundleURLTypes`.
- Declare document types and UTIs in `CFBundleDocumentTypes` and `UTExportedTypeDeclarations`.
- Use the stable application ID as `CFBundleIdentifier`.
- LaunchServices delivers cold launches and document batches through `Application.Activated`. Do not parse a second copy from CLI arguments.

### Linux Wayland

Install `org.example.App.desktop`:

```ini
[Desktop Entry]
Type=Application
Name=Example
Exec=/opt/example/Example --goo-open-documents %U
Icon=org.example.App
MimeType=application/x-example-document;
Terminal=false
```

Install a separate hidden scheme handler, `org.example.App.Links.desktop`:

```ini
[Desktop Entry]
Type=Application
Name=Example links
Exec=/opt/example/Example --goo-open-uri %u
Icon=org.example.App
MimeType=x-scheme-handler/example;
NoDisplay=true
Terminal=false
```

Both commands use the same application ID for single-instance acquisition. Install MIME definitions and refresh the desktop and MIME databases. Use OS settings for the user's default handler.

Forwarding preserves the launcher's activation token. Call `RequestActivation` on the selected window from the activation handler. The compositor decides whether to grant focus.

## Native dialogs

```gsharp
let result = await NativeDialogs.ShowMessageBoxAsync(window, MessageBoxOptions{
    Title: "Save changes?",
    Message: "Save this document before closing?",
    Buttons: []MessageBoxButton{
        MessageBoxButton{Id: 1, Text: "Save"},
        MessageBoxButton{Id: 2, Text: "Discard"},
    },
})
if result.Status == MessageBoxStatus.Success {
    window.Post(() -> SaveOrDiscard(result.ButtonId))
}
```

Call from the open owner's UI thread. Options are copied before launch. Use the app's UI dispatch path after awaiting a task.

| Platform | Behavior |
| --- | --- |
| Windows and macOS | Owned native dialog. Rendering, timers and posted actions block until dismissal. |
| Wayland | `Unsupported`. SDL's zenity backend does not parent the box. |
| Android | Owned `AlertDialog` through `Goo.Android`. Up to three buttons. No blocking of the main thread. Explicit Return or Escape defaults are unsupported. |

A selected Cancel button returns `Success` with its ID. Dismissal without selection returns `Cancelled`. `ButtonId` is `-1` outside `Success`. Conflicting modal work returns `Busy`. Owner close returns `OwnerClosed`. See [platform API](api/platform.md) for limits and focus restoration.

## Native menus

The view Cell handles activation on the owner's UI queue. It reads one model value for Save availability and republishes the menu after that value changes:

```gsharp
private func PublishMenu() {
    let result = bar.SetItems([]NativeMenuItem{
        NativeMenuItem{Id: "file", Text: "File", Items: []NativeMenuItem{
            NativeMenuItem{
                Id: "save", Text: "Save", Enabled: model.CanSave,
                Shortcut: NativeMenuShortcut{Key: "s", Modifiers: KeyModifiers{Super: true}},
            },
        }},
    })
    status = result.Status.ToString()
}

private func Save() {
    if !model.CanSave { return }
    let document = model.BeginSave()
    PublishMenu()
    go SaveDocument(document, Lifetime)
}

private func SaveDocument(document DocumentSnapshot, token CancellationToken) {
    try {
        await storage.SaveAsync(document, token)
        Post(() -> {
            model.CompleteSave(document)
            PublishMenu()
        })
    } catch (error OperationCanceledException) {
    } catch (error Exception) {
        let message = error.Message
        Post(() -> {
            model.FailSave(message)
            PublishMenu()
        })
    }
}
```

- Create `bar = NativeMenuBar(window)` on the open owner's UI thread. Subscribe once with `bar.Activated += id -> { if id == "save" { Save() } }`.
- `model`, `storage` and `DocumentSnapshot` are app types. Model methods change domain state. The storage service performs I/O.
- `Lifetime` cancels at Cell unmount or window close. `Post` drops results after unmount and applies Goo's callback rebuild rule. Dispose the bar on the UI thread.
- Call `PublishMenu()` after edits or any other change to `model.CanSave`. Goo has no `Command` type.
- Publish a complete snapshot with unique IDs and shortcuts. A separator has an empty ID, no children and no shortcut.
- Bar activation uses the Goo UI queue. Context selection completes its task. Context points use owner-content layout units.
- Desktop menu tracking blocks Goo scheduling. Check `Cancelled`, `Busy`, `OwnerClosed` and other result statuses.

| Platform | Bar | Context |
| --- | --- | --- |
| macOS | Global bar selected by the key Goo window | NSMenu |
| Windows | Per-window HMENU | TrackPopupMenuEx |
| Wayland | Unsupported | Unsupported |
| Android | Unsupported | ContextMenu through GooActivity |

macOS preserves the application and system menus. `Super` means Command. Windows uses the active keyboard layout and does not support `Super`. See [platform API](api/platform.md).

## Tray icons

```gsharp
let result = TrayIcon.Create(window, TrayOptions{
    Id: "org.example.App", Width: 1, Height: 1,
    Rgba: [4]uint8{255, 255, 255, 255}, Tooltip: "Example",
    Menu: [1]NativeMenuItem{NativeMenuItem{Id: "open", Text: "Open"}},
})
if let icon = result.Icon {
    icon.CommandActivated += id -> { window.RequestActivation() }
}
```

Keep the icon and its owner alive. Pump the owner on its UI thread, even while hidden. Dispose the icon to unregister it. Closing the owner disposes it.

| Platform or result | Meaning |
| --- | --- |
| Windows | `Shell_NotifyIcon`. |
| macOS | `NSStatusItem`. |
| Linux | StatusNotifierItem and DBusMenu on session D-Bus. GNOME needs an SNI extension. |
| `Registered` | The host accepted registration. Visibility is not guaranteed. |
| `NoHost` | A live icon may register when a host appears. |
| Android or embedded owner | `Unsupported`. |

Keep an Open command in the menu. Some hosts consume primary activation. See [platform API](api/platform.md) for updates and events.

## Notifications

```gsharp
let opened = Notifications.Open(NotificationOptions{ActivationScheme: "example-notification"})
if opened.Status != NotificationStatus.Success {
    Console.Error.WriteLine(opened.Status)
    return
}
using let notifications = opened.Service!!
```

Configure the installed application ID and subscribe to `Application.Activated` first. Open and dispose on the UI thread. On macOS, open before `Application.AcquireSingleInstance` and before the first window opens.

Request permission from an explicit user action. `ShowAsync` never requests it:

```gsharp
async func Send(service NotificationService) Task[NotificationResult] {
    let permission = await service.RequestPermissionAsync()
    if permission.Permission != NotificationPermission.Granted
        && permission.Permission != NotificationPermission.Unknown {
        return permission
    }
    return await service.ShowAsync(NotificationMessage{
        Id: "download-42", Title: "Download complete",
        Body: "The report is ready.", Payload: "report-42",
    })
}
```

| Result | Meaning |
| --- | --- |
| `Accepted` | The native service accepted submission. It does not prove a banner appeared. |
| `PresentInCenter` | The native query found the notification. It does not prove the user read it. |
| `Unknown` | Permission or presence cannot be reported. |
| `Denied`, `Disabled`, `MissingIdentity`, `Unsupported` | The requested operation is not available. |

Reusing an ID replaces that app notification. `RemoveAsync` removes it where the OS permits. Await without blocking and post later window changes through the UI queue.

Clicks use `Application.Activated` with `Kind == ApplicationActivationKind.Notification`. Read `NotificationId`, `ActionId` and `Payload`. Default clicks have an empty `ActionId`. Validate payloads before use.

- Windows needs a Start-menu shortcut with the configured AUMID, a stub toast-activator CLSID and a private protocol registered with `--goo-notification`. No COM activator server is required.
- The private URI is `example-notification://activate?notificationId=...&actionId=...&payload=...`. Escape each field as URI data. All fields are required and may be empty. Use the [association route](#file-associations), not `--goo-open-uri`.
- macOS needs a signed app bundle with a matching `CFBundleIdentifier`. Goo owns `UNUserNotificationCenter.delegate` and does not replace an existing delegate.
- Linux needs a session D-Bus notification daemon. Permission and presence are `Unknown`. Default clicks are `WarmOnly` with daemon action support, otherwise `None`. Reopen after the daemon owner changes. No cold-start route is supported.
- `WarmAndCold` describes an installed route that can also launch the app. It is not a delivery guarantee. On Wayland, call `RequestActivation` in the activation handler to use its token.
- See [Android notifications](android.md#notifications) for the Activity service and [platform API](api/platform.md) for limits.

## Saved window placement

```gsharp
func RunSaved(saved WindowPlacement) {
    let window = Window{InitiallyVisible: false, Root: Cell{}}.Open()
    let result = Placement.Restore(window, saved)
    if result.Status != WindowOperationResult.Accepted {
        Console.Error.WriteLine(result.Status.ToString() + ": " + result.Error)
        window.RequestClose()
        window.Pump(0.0)
        return
    }
    window.Show()
    Application.Run(window)
}
```

Capture on the open window's UI thread before closing. The app owns serialization and the settings file. Use generated serializer metadata for NativeAOT. Restore selects a current display and clamps normal geometry to its usable bounds. `Accepted` means fields were submitted, not that final placement is known. Capture after native configure to observe it. See [window API](api/window.md) for Wayland position and activation limits.
