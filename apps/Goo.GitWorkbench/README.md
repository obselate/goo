# Git workbench

A small desktop Git workbench built with published Goo 0.6.5. Open a repository with the native folder picker, switch local branches, pull from origin, inspect line-numbered diffs, stage or unstage individual files or all files with the checkboxes, and commit with a summary and optional multiline description. The dark custom title bar uses right-aligned minimize, maximize, and close controls. Git is invoked directly without a shell.

Requires .NET 10, Git, and [Goo's platform requirements](../../README.md#platforms). Run it from a repository or pass one:

```sh
dotnet run --project apps/Goo.GitWorkbench/Goo.GitWorkbench.gsproj -c Release -- /path/to/repo
```

Pull origin fetches and fast-forwards the current branch. It refuses divergent history and does not auto-stash local changes. The button shows its target or why pulling is unavailable. Git errors appear in a separate scrollable, dismissible sidebar area. The app does not discard changes or push to a remote.

Press F5 to refresh local files and history. The summary and description support deletion, navigation, selection, clipboard shortcuts, and undo/redo. Enter adds a line in the description. Tab and Shift+Tab move between controls, with focus outlines shown for keyboard use. Space or Enter activates a focused button or staging checkbox. Escape closes the branch selector. The diff pane caps rendered output at 120,000 characters.

On Linux, the native folder picker uses the desktop's XDG FileChooser portal. If that service is unavailable, the app reports the native dialog error. The title-bar icons use the bundled Material Icons Round font under the Apache 2.0 license in `Assets/MaterialIcons-LICENSE`.

`Models` holds Git data, `Services` runs and parses Git commands, `Components` holds reusable controls and panes, and `Views` coordinates selection and actions. The app uses the published Goo package.
