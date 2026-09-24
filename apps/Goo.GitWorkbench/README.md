# Gituit

A small desktop Git workbench built with published Goo 0.6.5. Open a repository with the native folder picker, switch local branches, pull from origin, inspect line-numbered diffs, stage or unstage individual files or all files with the checkboxes, and commit with a summary and optional multiline description. The dark custom title bar uses right-aligned minimize, maximize, and close controls. Git is invoked directly without a shell.

Requires .NET 10, Git, and [Goo's platform requirements](../../README.md#platforms). Run it from a repository or pass one:

```sh
dotnet run --project apps/Goo.GitWorkbench/Goo.GitWorkbench.gsproj -c Release -- /path/to/repo
```

Pull origin fetches and fast-forwards the current branch. It refuses divergent history and does not auto-stash local changes. The button shows its target or why pulling is unavailable. Git errors appear in a separate scrollable, dismissible sidebar area. The app does not discard changes or push to a remote.

Press F5 to refresh local files and history. The summary and description support deletion, navigation, selection, clipboard shortcuts, and undo/redo. Enter adds a line in the description. Tab and Shift+Tab move between controls, with focus outlines shown for keyboard use. Space or Enter activates a focused button or staging checkbox. Escape closes the branch selector.

The Changes, History, and diff panes have visible draggable scrollbars. Page Up and Page Down move through the diff. Ctrl+Page Up and Ctrl+Page Down select the previous or next changed file or commit. The arrows in the diff header do the same and keep the selected sidebar row visible. These shortcuts leave text editing alone while an editor has focus.

Changes and diff rows use Goo's native virtual lists, so only visible rows and a small overscan are mounted. Diff rows measure their height as long lines wrap, with each source line number shown once. Tracked diffs, untracked text previews, and history patches display the complete output without a character cutoff. Git commands, file reads, and diff parsing run in G# workers. Repository mutations are serialized, and stale detail results cannot replace the current selection. Parsed rows remain in memory, with the most recent history patch cached. History lists the latest 40 commits.

G# and C# source uses TextMateSharp syntax highlighting, including multiline comments and strings. The first 64 diff rows are colored before display. Remaining rows are colored in the worker and update without resetting scrolling. A jump beyond the processed rows can briefly show the original diff colors until highlighting catches up. Added and removed lines have separate lexer states. States reset at each file and hunk because omitted context cannot provide reliable syntax state. Other file types keep their diff colors. The bundled grammar sources and MIT notices are in `Assets/Grammars`.

On Linux, the native folder picker uses the desktop's XDG FileChooser portal. If that service is unavailable, the app reports the native dialog error. The title-bar controls use the bundled Material Icons Round font under the Apache 2.0 license in `Assets/MaterialIcons-LICENSE`. The original generated Gituit logo is in `Assets/Gituit.png`, with a 48-pixel titlebar version. Goo 0.6.5 has no public native window-icon API, so the logo appears in the custom titlebar.

`Models` holds Git data, `Services` runs and parses Git commands, `Components` holds reusable controls and panes, and `Views` coordinates selection and actions. The app uses the published Goo package.
