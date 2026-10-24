# Native message boxes

```gsharp
let result = await NativeDialogs.ShowMessageBoxAsync(window, MessageBoxOptions{
    Title: "Save changes?",
    Message: "Save this document before closing?",
    Buttons: []MessageBoxButton{
        MessageBoxButton{ Id: 1, Text: "Save" },
        MessageBoxButton{ Id: 2, Text: "Discard" },
    },
})
if result.Status == MessageBoxStatus.Success {
    SaveOrDiscard(result.ButtonId)
}
```

Reference optional `Goo.NativeDialogs`. Call from the open owner's Goo UI thread. Options are copied before launch.

| Platform | Behavior |
| --- | --- |
| Windows and macOS | `SDL_ShowMessageBox` uses the owner window. Native display blocks Goo rendering, timers and posted actions until dismissal. |
| Wayland | `Unsupported`. SDL's zenity backend does not parent the box to its owner. |
| Android | An owned `AlertDialog`. Up to three buttons. Explicit Return or Escape defaults return `Unsupported`. The main thread does not block. |

- Use one to eight buttons with unique nonnegative IDs. Text must not contain NUL.
- Set at most one `Default` button for Return and one `Cancel` button for Escape on desktop.
- A click on a `Cancel` button returns `Success` with its ID. Dismissal without a selection returns `Cancelled`.
- `ButtonId` is `-1` outside `Success`. `Failed` includes a copied native error.
- The owner stays alive and blocks Goo input and accessibility actions until completion. A conflicting modal operation returns `Busy`.
- Owner close before launch returns `OwnerClosed` without display. A pending desktop close completes after SDL returns, before later queued actions.
- Android owner detach, disposal or Activity destruction closes the box and returns `OwnerClosed`.
- Focus returns only to a mounted target while the owner is visible and focused.

Generate the API reference locally:

```sh
dotnet run --project tools/Goo.ApiDocs/Goo.ApiDocs.gsproj -c Release -- \
  --source Goo.NativeDialogs \
  --xml Goo.NativeDialogs/bin/Release/net10.0/Goo.NativeDialogs.xml \
  --output docs/api-native-dialogs
```

Build the package first. Set `GooBuildAndroid=true` to build both targets. The Android target needs the Android workload.
