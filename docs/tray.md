# Native tray icons

```gsharp
let result = TrayIcon.Create(window, TrayOptions{
    Id: "org.example.App", Width: 1, Height: 1,
    Rgba: [4]uint8{255, 255, 255, 255}, Tooltip: "Example",
    Menu: [1]NativeMenuItem{NativeMenuItem{Id: "open", Text: "Open"}}
})
if let icon = result.Icon {
    icon.CommandActivated += id -> { window.RequestActivation() }
}
```

Reference `Goo.Tray`. Keep the icon and its owner alive. Pump the owner on its UI thread.
Call `Update` to replace pixels, tooltip and menu. Call `Dispose` to unregister.
Closing the owner also disposes the icon.

- Windows uses `Shell_NotifyIcon`. macOS uses `NSStatusItem`.
- Linux uses StatusNotifierItem and DBusMenu on the session D-Bus. GNOME needs an SNI extension.
- `Registered` means the native host accepted registration. It does not prove visibility.
- `NoHost` can return a live icon that registers when a host appears.
- Android and embedded owners return `Unsupported`.
- Keep an Open command in the menu. Some hosts consume primary activation.
