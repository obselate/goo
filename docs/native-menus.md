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

Reference `Goo.NativeMenus`. Share `Command` objects with widgets.

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
| Windows | Unsupported in this slice | Unsupported in this slice |
| Wayland | Unsupported | Unsupported |
| Android | Unsupported | Unsupported in this slice |

macOS keeps SDL's application and system menus. `Super` means Command.
The default bar is restored only while this package still owns the menu.

See [API reference](api-native-menus/public.md).
