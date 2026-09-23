package GooGitWorkbench

import Goo
import System
import System.Collections.Generic
import System.IO

class GitWorkbench : Cell {
    private var directory string = ""
    private var directoryInput string
    private var branch string = ""
    private var changes List[GitChange] = List[GitChange]()
    private var history List[GitCommit] = List[GitCommit]()
    private var selectedChange GitChange?
    private var selectedCommit GitCommit?
    private var detail string = ""
    private var commitMessage string = ""
    private var notice string = ""
    private var noticeIsError bool

    init(startDirectory string) {
        directoryInput = startDirectory
        openRepository(startDirectory)
    }

    private func openRepository(path string) {
        if !Directory.Exists(path) {
            showError("Directory does not exist: $path")
            return
        }
        let result = runGit(Path.GetFullPath(path), List[string]{"rev-parse", "--show-toplevel"})
        if !result.Ok {
            showError(gitError(result))
            return
        }
        directory = result.Output.Trim()
        directoryInput = directory
        refresh()
    }

    private func refresh() {
        if directory == "" {
            return
        }
        let status = runGit(directory, List[string]{"-c", "core.quotepath=false", "status", "--porcelain=v1", "-z"})
        if !status.Ok {
            showError(gitError(status))
            return
        }
        let previous = selectedChange
        changes = readChanges(status.Output)
        branch = runGit(directory, List[string]{"branch", "--show-current"}).Output.Trim()
        history = readHistory(runGit(directory, List[string]{"log", "-n", "40", "--format=%H%x00%s%x00%an"}).Output)
        selectedChange = nil
        if let old = previous {
            for change in changes {
                if change.Path == old.Path && change.Staged == old.Staged {
                    selectedChange = change
                    break
                }
            }
            if selectedChange == nil {
                for change in changes {
                    if change.Path == old.Path {
                        selectedChange = change
                        break
                    }
                }
            }
        }
        if selectedChange == nil && changes.Count > 0 {
            selectedChange = changes[0]
        }
        if selectedChange != nil {
            selectedCommit = nil
        }
        if selectedChange == nil && selectedCommit == nil && history.Count > 0 {
            selectedCommit = history[0]
        }
        loadDetail()
        notice = ""
        noticeIsError = false
    }

    private func loadDetail() {
        if let change = selectedChange {
            if change.Untracked {
                let path = Path.Combine(directory, change.Path)
                try {
                    if FileInfo(path).Length > 100000 {
                        detail = "Untracked file is too large to preview."
                    } else {
                        detail = File.ReadAllText(path)
                    }
                } catch (error Exception) {
                    detail = error.Message
                }
                return
            }
            let args = List[string]{"diff", "--no-ext-diff", "--no-color"}
            if change.Staged {
                args.Add("--cached")
            }
            args.Add("--")
            args.Add(change.Path)
            let result = runGit(directory, args)
            detail = if result.Ok {
                result.Output
            } else {
                gitError(result)
            }
            if detail == "" {
                detail = "No diff available for this file."
            }
            return
        }
        if let commit = selectedCommit {
            let result = runGit(
                directory,
                List[string]{"show", "--stat", "--patch", "--format=fuller", "--no-ext-diff", "--no-color", commit.Id}
            )
            detail = if result.Ok {
                result.Output
            } else {
                gitError(result)
            }
            return
        }
        detail = "No changes or commits to show."
    }

    private func stageSelected() {
        guard let change = selectedChange else {
            return
        }
        if change.Staged {
            return
        }
        let result = runGit(directory, List[string]{"add", "--", change.Path})
        if !result.Ok {
            showError(gitError(result))
            return
        }
        refresh()
    }

    private func unstageSelected() {
        guard let change = selectedChange else {
            return
        }
        if !change.Staged {
            return
        }
        let result = runGit(directory, List[string]{"restore", "--staged", "--", change.Path})
        if !result.Ok {
            showError(gitError(result))
            return
        }
        refresh()
    }

    private func commit() {
        let message = commitMessage.Trim()
        if message == "" {
            showError("Enter a commit message.")
            return
        }
        var staged = false
        for change in changes {
            if change.Staged {
                staged = true
                break
            }
        }
        if !staged {
            showError("Stage at least one file first.")
            return
        }
        let result = runGit(directory, List[string]{"commit", "-m", message})
        if !result.Ok {
            showError(gitError(result))
            return
        }
        commitMessage = ""
        refresh()
        notice = "Commit created."
    }

    private func showError(message string) {
        notice = message
        noticeIsError = true
    }

    private func hasStagedChanges() bool {
        for change in changes {
            if change.Staged {
                return true
            }
        }
        return false
    }

    override func Build() Blob -> Container{
        Width: Length.Percent(100),
        Height: Length.Percent(100),
        MinWidth: 0,
        MinHeight: 0,
        FlexDirection: FlexDirection.Column,
        BackgroundColor: GitTheme.Background,
        Container{
            Width: Length.Percent(100),
            Padding: 14,
            FlexDirection: FlexDirection.Row,
            AlignItems: AlignItems.Center,
            Gap: 10,
            BackgroundColor: GitTheme.Surface,
            BorderWidth: 1,
            BorderColor: GitTheme.Border,
            Text{Content: "Git workbench", FontSize: 16, FontWeight: 600, Color: GitTheme.Text},
            Text{
                Content: if directory == "" {
                    ""
                } else {
                    "/ ${DirectoryInfo(directory).Name}"
                },
                FontSize: 14,
                Color: GitTheme.Accent
            },
            Container{FlexGrow: 1},
            Text{Content: branch, FontSize: 12, Color: GitTheme.Muted},
        },
        Container{
            Width: Length.Percent(100),
            Padding: 10,
            FlexDirection: FlexDirection.Row,
            Gap: 8,
            appInput(
                directoryInput,
                "Repository directory",
                (value string) -> {
                    directoryInput = value
                }
            ),
            appButton(
                "Open",
                () -> {
                    openRepository(directoryInput)
                }
            ),
            appButton(
                "Refresh",
                () -> {
                    refresh()
                },
                directory != ""
            ),
        },
        Container{
            Width: Length.Percent(100),
            Height: 0,
            FlexGrow: 1,
            MinHeight: 0,
            FlexDirection: FlexDirection.Row,
            Gap: 1,
            BackgroundColor: GitTheme.Border,
            Container{
                Width: 340,
                MinWidth: 250,
                Height: Length.Percent(100),
                MinHeight: 0,
                FlexDirection: FlexDirection.Column,
                Gap: 1,
                BackgroundColor: GitTheme.Border,
                ChangesPane(
                    changes,
                    selectedChange,
                    (change GitChange) -> {
                        selectedChange = change
                        selectedCommit = nil
                        loadDetail()
                    }
                ).render(),
                HistoryPane(
                    history,
                    selectedCommit,
                    (commit GitCommit) -> {
                        selectedChange = nil
                        selectedCommit = commit
                        loadDetail()
                    }
                ).render(),
            },
            DetailPane(
                selectedChange,
                selectedCommit,
                detail,
                () -> {
                    stageSelected()
                },
                () -> {
                    unstageSelected()
                }
            ).render(),
        },
        Container{
            Width: Length.Percent(100),
            Padding: 10,
            FlexDirection: FlexDirection.Row,
            Gap: 8,
            BackgroundColor: GitTheme.Surface,
            BorderWidth: 1,
            BorderColor: GitTheme.Border,
            appInput(
                commitMessage,
                "Commit message",
                (value string) -> {
                    commitMessage = value
                }
            ),
            appButton(
                "Commit staged",
                () -> {
                    commit()
                },
                directory != "" && hasStagedChanges() && commitMessage.Trim() != "",
                true
            ),
        },
        Text{
            Content: notice,
            Height: 28,
            Padding: 8,
            FontSize: 12,
            Color: if noticeIsError {
                GitTheme.Error
            } else {
                GitTheme.Muted
            }
        },
    }
}
