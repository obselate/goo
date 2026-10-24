# Native menus

```gsharp
let save = Command(() -> SaveDocument())
let actions = List[NativeMenuItem]()
actions.Add(NativeMenuItem{
    Id: "save", Text: "Save", Enabled: save.CanExecute,
    Shortcut: NativeMenuShortcut{Key: "s", Modifiers: KeyModifiers{Super: true}},
})
let menus = List[NativeMenuItem]()
menus.Add(NativeMenuItem{Id: "file", Text: "File", Items: actions})
let bar = NativeMenuBar(window)
bar.Activated += id -> { if id == "save" { save.Execute() } }
let result = bar.SetItems(menus)
```

Reference `Goo`, or `Goo.Android` on Android. Share `Command` objects with widgets.

- Call on the open owner's UI thread. Dispose the bar when it is no longer needed.
- Publish a complete snapshot. IDs and shortcuts must be unique.
- A separator has an empty ID, no children and no shortcut.
- A shortcut uses one printable logical key. It runs as a native accelerator.
- Bar activation uses the Goo queue after input is restored. Context selection completes only its task.
- Context points use owner-content Goo layout units.
- Desktop tracking blocks the Goo scheduler.
- Check the result status. Cancellation is `Cancelled`. Conflicting work in an owner chain is `Busy`.
- Closing the owner completes a pending menu as `OwnerClosed`, including before native launch.

| Platform | Bar | Context |
| --- | --- | --- |
| macOS | Global bar selected by the key Goo window | NSMenu |
| Windows | Per-window HMENU | TrackPopupMenuEx |
| Wayland | Unsupported | Unsupported |
| Android | Unsupported | Android ContextMenu |

macOS keeps SDL's application and system menus. `Super` means Command.
The default bar is restored only while Goo still owns the menu.
Windows uses the active keyboard layout and rebuilds accelerators when it changes.
`Super` and keys outside that layout return `Unsupported`.
The official SDL binary supplies the pre-TranslateMessage hook. No SDL patch is required.

Android requires `GooActivity`, which forwards native menu closure to the owner.
Other Activity hosts return `Unsupported`. Android shortcuts return `Unsupported`.
Activity teardown completes the menu as `OwnerClosed`.

```sh
dotnet build tests/Goo.AndroidSmoke/Goo.AndroidSmoke.gsproj -c Release -p:GooBuildAndroid=true
adb shell am start -n org.goo.androidsmoke/.MainActivity --ez goo.native_menu_smoke true
adb logcat -s GooNativeMenus
```

On a Vulkan Android device, open `Actions`, then choose `Select`. Press Back on the cancellation menu.
The smoke then checks owner-close completion and prints `passed`.

See [API reference](api/platform.md).
