# Git workbench

A small desktop Git workbench built with published Goo 0.6.5. Open a repository, review staged and unstaged files, inspect diffs and recent commits, stage or unstage a file, and commit staged changes. Git is invoked directly without a shell.

Requires .NET 10, Git, and [Goo's platform requirements](../../README.md#platforms). Run it from a repository or pass one:

```sh
dotnet run --project apps/Goo.GitWorkbench/Goo.GitWorkbench.gsproj -c Release -- /path/to/repo
```

The app does not discard changes or push to a remote. It reads Git state when a repository is opened, after a write, or when Refresh is clicked. The diff pane caps rendered output at 120,000 characters.

`Models` holds Git data, `Services` runs and parses Git commands, `Components` holds reusable controls and panes, and `Views` coordinates selection and actions. The app uses the published Goo package.
