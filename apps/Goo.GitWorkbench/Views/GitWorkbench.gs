package GooGitWorkbench

import Goo
import System
import System.Collections.Generic
import System.IO

class GitWorkbench : Cell, IDisposable {
    private var directory string = ""
    private var directoryInput string
    private var branch string = ""
    private var branches List[string] = List[string]()
    private var changes List[GitChange] = List[GitChange]()
    private var history List[GitCommit] = List[GitCommit]()
    private var selectedChange GitChange?
    private var selectedCommit GitCommit?
    private var detail string = ""
    private var commitMessage string = ""
    private let commitDescription TextEditorController = TextEditorController(TextDocument())
    private var historyTab bool
    private var notice string = ""
    private var noticeIsError bool
    private var repositorySelectorOpen bool
    private var branchSelectorOpen bool
    private var attachedWindow Window?
    private let repositoryHandle ElementHandle = ElementHandle{}
    private let branchHandle ElementHandle = ElementHandle{}

    init(startDirectory string) {
        directoryInput = startDirectory
        openRepository(startDirectory)
    }

    internal func AttachWindow(window Window) {
        attachedWindow = window
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
        repositorySelectorOpen = false
        branchSelectorOpen = false
        historyTab = false
        selectedChange = nil
        selectedCommit = nil
        commitMessage = ""
        clearDescription()
        refresh()
    }

    private func clearDescription() {
        let document = commitDescription.Document
        if document.Length > 0 {
            document.Apply(TextChange{Range: TextRange{Start: 0, Length: document.Length}, InsertedText: ""})
        }
    }

    private func refresh() {
        if directory == "" {
            return
        }
        notice = ""
        noticeIsError = false
        let status = runGit(directory, List[string]{"-c", "core.quotepath=false", "status", "--porcelain=v1", "-z"})
        if !status.Ok {
            showError(gitError(status))
            return
        }
        let previousChange = selectedChange
        let previousCommit = selectedCommit
        changes = readChanges(status.Output)
        let currentBranch = runGit(directory, List[string]{"branch", "--show-current"})
        if currentBranch.Ok {
            branch = currentBranch.Output.Trim()
        } else {
            branch = ""
            showError(gitError(currentBranch))
        }
        let branchResult = listLocalBranches(directory)
        if branchResult.Ok {
            branches = readBranches(branchResult.Output)
        } else {
            branches = List[string]()
            showError(gitError(branchResult))
        }
        history = readHistory(runGit(directory, List[string]{"log", "-n", "40", "--format=%H%x00%s%x00%an"}).Output)
        selectedChange = nil
        selectedCommit = nil
        if historyTab {
            if let old = previousCommit {
                for commit in history {
                    if commit.Id == old.Id {
                        selectedCommit = commit
                        break
                    }
                }
            }
            if selectedCommit == nil && history.Count > 0 {
                selectedCommit = history[0]
            }
        } else {
            if let old = previousChange {
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
        }
        loadDetail()
    }

    private func selectBranch(target string) {
        if target == branch {
            branchSelectorOpen = false
            return
        }
        let result = switchGitBranch(directory, target)
        if !result.Ok {
            showError(gitError(result))
            return
        }
        branchSelectorOpen = false
        refresh()
        notice = "Switched to $target."
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

    private func toggleStage(change GitChange) {
        let result = if change.Staged {
            runGit(directory, List[string]{"restore", "--staged", "--", change.Path})
        } else {
            runGit(directory, List[string]{"add", "--", change.Path})
        }
        if !result.Ok {
            showError(gitError(result))
            return
        }
        selectedChange = change
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
        let args = List[string]{"commit", "-m", message}
        let description = commitDescription.Document.GetText().Trim()
        if description != "" {
            args.Add("-m")
            args.Add(description)
        }
        let result = runGit(directory, args)
        if !result.Ok {
            showError(gitError(result))
            return
        }
        commitMessage = ""
        clearDescription()
        refresh()
        notice = "Commit created."
    }

    private func showChanges() {
        if !historyTab {
            return
        }
        historyTab = false
        selectedCommit = nil
        selectedChange = if changes.Count > 0 {
            changes[0]
        } else {
            nil
        }
        notice = ""
        loadDetail()
    }

    private func showHistory() {
        if historyTab {
            return
        }
        historyTab = true
        selectedChange = nil
        selectedCommit = if history.Count > 0 {
            history[0]
        } else {
            nil
        }
        notice = ""
        loadDetail()
    }

    public func Dispose() {
        commitDescription.Dispose()
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

    private func sidebarContent() Blob {
        if historyTab {
            let children = List[Blob]()
            children.Add(
                HistoryPane(
                    history,
                    selectedCommit,
                    (commit GitCommit) -> {
                        selectedCommit = commit
                        loadDetail()
                    }
                ).render()
            )
            if notice != "" {
                children.Add(
                    Text{
                        Content: notice,
                        Height: 28,
                        Padding: 8,
                        FontSize: 11,
                        Color: if noticeIsError {
                            GitTheme.Error
                        } else {
                            GitTheme.Muted
                        }
                    }
                )
            }
            return Container{
                Width: Length.Percent(100),
                Height: 0,
                FlexGrow: 1,
                MinHeight: 0,
                FlexDirection: FlexDirection.Column,
                Children: children,
            }
        }
        return Container{
            Width: Length.Percent(100),
            Height: 0,
            FlexGrow: 1,
            MinHeight: 0,
            FlexDirection: FlexDirection.Column,
            ChangesPane(
                changes,
                selectedChange,
                (change GitChange) -> {
                    selectedChange = change
                    loadDetail()
                },
                (change GitChange) -> {
                    toggleStage(change)
                }
            ).render(),
            CommitPane(
                commitMessage,
                commitDescription,
                branch,
                directory != "" && hasStagedChanges() && commitMessage.Trim() != "",
                notice,
                noticeIsError,
                (value string) -> {
                    commitMessage = value
                },
                () -> {
                    commit()
                }
            ).render(),
        }
    }

    override func Build() Blob -> Container{
        Width: Length.Percent(100),
        Height: Length.Percent(100),
        MinWidth: 0,
        MinHeight: 0,
        FlexDirection: FlexDirection.Column,
        BackgroundColor: GitTheme.Background,
        WorkbenchWindowChrome(attachedWindow!!),
        WorkbenchToolbar(
            directory,
            branch,
            branches,
            directoryInput,
            repositorySelectorOpen,
            branchSelectorOpen,
            repositoryHandle,
            branchHandle,
            (value string) -> {
                directoryInput = value
            },
            () -> {
                openRepository(directoryInput)
            },
            () -> {
                refresh()
            },
            () -> {
                repositorySelectorOpen = !repositorySelectorOpen
                branchSelectorOpen = false
            },
            () -> {
                branchSelectorOpen = !branchSelectorOpen
                repositorySelectorOpen = false
            },
            (target string) -> {
                selectBranch(target)
            }
        ).render(),
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
                MinWidth: 280,
                Height: Length.Percent(100),
                MinHeight: 0,
                FlexDirection: FlexDirection.Column,
                BackgroundColor: GitTheme.Surface,
                SidebarTabs(
                    historyTab,
                    () -> {
                        showChanges()
                    },
                    () -> {
                        showHistory()
                    }
                ).render(),
                sidebarContent(),
            },
            DetailPane(selectedChange, selectedCommit, detail).render(),
        },
    }
}
