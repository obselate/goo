package GooGitWorkbench

import Goo
import Gsharp.Extensions.Go
import System
import System.Collections.Generic
import System.IO

class GitWorkbench : Cell, IDisposable {
    private let startDirectory string
    private let logo ImageSource
    private var initialized bool
    private var disposed bool
    private var directory string = ""
    private var branch string = ""
    private var branches List[string] = List[string]()
    private var changes List[GitChange] = List[GitChange]()
    private var history List[GitCommit] = List[GitCommit]()
    private var selectedChange GitChange?
    private var selectedCommit GitCommit?
    private var detailRows List[DiffRow] = List[DiffRow]()
    private var detailLoading bool
    private var detailInFlight bool
    private var detailWork GitWork?
    private var detailVersion int32
    private var historyDetailKey string = ""
    private var historyDetailRows List[DiffRow] = List[DiffRow]()
    private var commitMessage string = ""
    private let commitDescription TextEditorController = TextEditorController(TextDocument())
    private var historyTab bool
    private var notice string = ""
    private var noticeIsError bool
    private var pullState GitPullState = GitPullState{}
    private var busy bool
    private var pulling bool
    private var branchSelectorOpen bool
    private var keyboardFocus bool
    private var attachedWindow Window?
    private let branchHandle ElementHandle = ElementHandle{}

    init(startDirectory string, logo ImageSource) {
        this.startDirectory = startDirectory
        this.logo = logo
    }

    internal func AttachWindow(window Window) {
        attachedWindow = window
        window.MetricsChanged += start
    }

    private func start(metrics WindowMetrics) {
        if initialized {
            return
        }
        initialized = true
        openRepository(startDirectory)
        Rebuild()
    }

    private func openRepository(path string) {
        repositoryWork(nil, "", false, Path.GetFullPath(path))
    }

    private async func chooseRepository() {
        if busy {
            return
        }
        guard let window = attachedWindow else {
            return
        }
        branchSelectorOpen = false
        try {
            let result = await window.ShowFileDialogAsync(
                FileDialogKind.Folder,
                FileDialogOptions{Title: "Open Git repository", InitialPath: directory}
            )
            window.TryPost(
                () -> {
                    if result.Status == FileDialogStatus.Success && result.Paths.Count > 0 {
                        openRepository(result.Paths[0])
                    } else if result.Status != FileDialogStatus.Cancelled {
                        showError(
                            if result.Error == "" {
                                "Could not open the folder picker."
                            } else {
                                result.Error
                            }
                        )
                    }
                    Rebuild()
                }
            )
        } catch (error Exception) {
            window.TryPost(
                () -> {
                    showError(error.Message)
                    Rebuild()
                }
            )
        }
    }

    private func repositoryWork(
        arguments List[string]?,
        message string = "",
        clearCommit bool = false,
        openPath string? = nil
    ) {
        if busy {
            return
        }
        guard let window = attachedWindow else {
            return
        }
        busy = true
        pulling = arguments != nil && arguments.Count > 0 && arguments[0] == "pull"
        branchSelectorOpen = false
        notice = ""
        noticeIsError = false
        let submittedSummary = commitMessage
        let submittedDescription = commitDescription.Document.GetText()
        let work = GitWork{
            Directory: openPath ?? directory,
            Arguments: arguments,
            ResolveRoot: openPath != nil,
            Snapshot: true,
        }
        let completed Action[GitWorkResult] = (result GitWorkResult) -> {
            window.TryPost(
                () -> {
                    if disposed {
                        return
                    }
                    busy = false
                    pulling = false
                    if result.Error != "" {
                        showError(result.Error)
                    } else if let snapshot = result.Snapshot {
                        if openPath != nil {
                            historyTab = false
                            selectedChange = nil
                            selectedCommit = nil
                            commitMessage = ""
                            clearDescription()
                            historyDetailKey = ""
                        } else if clearCommit {
                            if commitMessage == submittedSummary {
                                commitMessage = ""
                            }
                            if commitDescription.Document.GetText() == submittedDescription {
                                clearDescription()
                            }
                        }
                        applySnapshot(snapshot)
                        notice = message
                        noticeIsError = false
                    }
                    Rebuild()
                }
            )
        }
        go executeGitWork(work, completed)
    }

    private func refresh() {
        if directory != "" {
            repositoryWork(nil)
        }
    }

    private func applySnapshot(snapshot GitSnapshot) {
        let previousChange = selectedChange
        let previousCommit = selectedCommit
        directory = snapshot.Directory
        branch = snapshot.Branch
        branches = snapshot.Branches
        changes = snapshot.Changes
        history = snapshot.History
        pullState = snapshot.Pull
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

    private func loadDetail() {
        detailWork?.Cancel()
        detailVersion++
        if selectedChange == nil && selectedCommit == nil {
            detailRows = List[DiffRow]()
            detailLoading = false
            return
        }
        if let commit = selectedCommit {
            if historyDetailKey == directory + "\0" + commit.Id {
                detailRows = historyDetailRows
                detailLoading = false
                return
            }
        }
        detailLoading = true
        if !detailInFlight {
            startDetailRead()
        }
    }

    private func startDetailRead() {
        if !detailLoading || (selectedChange == nil && selectedCommit == nil) {
            return
        }
        guard let window = attachedWindow else {
            return
        }
        detailInFlight = true
        let version = detailVersion
        let work = GitWork{Directory: directory, Change: selectedChange, Commit: selectedCommit}
        detailWork = work
        let completed Action[GitWorkResult] = (result GitWorkResult) -> {
            window.TryPost(
                () -> {
                    if disposed {
                        return
                    }
                    if !result.DetailPending {
                        detailInFlight = false
                    }
                    if version != detailVersion {
                        if !result.DetailPending {
                            startDetailRead()
                        }
                        return
                    }
                    detailRows = if result.Error == "" {
                        result.Rows
                    } else {
                        DiffParser.Parse(result.Error, false, false)
                    }
                    detailLoading = false
                    if let commit = work.Commit {
                        if result.Error == "" && !result.DetailPending {
                            historyDetailKey = work.Directory + "\0" + commit.Id
                            historyDetailRows = detailRows
                        }
                    }
                    Rebuild()
                }
            )
        }
        go executeGitWork(work, completed)
    }

    private func pullOrigin() {
        if !pullState.Available {
            return
        }
        repositoryWork(
            List[string]{
                "pull",
                "--ff-only",
                "--no-rebase",
                "--no-autostash",
                "--no-edit",
                "origin",
                pullState.BranchRef
            },
            "Pulled origin/" + pullState.BranchRef.Substring(11) + "."
        )
    }

    private func selectBranch(target string) {
        branchSelectorOpen = false
        if target != branch {
            repositoryWork(List[string]{"switch", "--", target}, "Switched to $target.")
        }
    }

    private func toggleStage(change GitChange) {
        if busy {
            return
        }
        selectedChange = change
        repositoryWork(
            List[string]{
                if change.Staged {
                    "reset"
                } else {
                    "add"
                },
                "--",
                change.Path
            }
        )
    }

    private func toggleAllStage(stage bool) {
        repositoryWork(
            if stage {
                List[string]{"add", "--all"}
            } else {
                List[string]{"reset", "--", "."}
            }
        )
    }

    private func commit() {
        if busy {
            return
        }
        let message = commitMessage.Trim()
        if message == "" {
            showError("Enter a commit message.")
            return
        }
        if !hasStagedChanges() {
            showError("Stage at least one file first.")
            return
        }
        let arguments = List[string]{"commit", "-m", message}
        let description = commitDescription.Document.GetText().Trim()
        if description != "" {
            arguments.Add("-m")
            arguments.Add(description)
        }
        repositoryWork(arguments, "Commit created.", true)
    }

    private func clearDescription() {
        let document = commitDescription.Document
        if document.Length > 0 {
            document.Apply(TextChange{Range: TextRange{Start: 0, Length: document.Length}, InsertedText: ""})
        }
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

    /// Releases editor and window subscriptions.
    public func Dispose() {
        disposed = true
        detailWork?.Cancel()
        if let window = attachedWindow {
            window.MetricsChanged -= start
        }
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
        let children = List[Blob]()
        if historyTab {
            children.Add(
                HistoryPane(
                    history,
                    selectedCommit,
                    (commit GitCommit) -> {
                        if selectedCommit != commit {
                            selectedCommit = commit
                            loadDetail()
                        }
                    },
                    keyboardFocus
                ).render()
            )
        } else {
            children.Add(
                ChangesPane(
                    changes,
                    selectedChange,
                    (change GitChange) -> {
                        if selectedChange != change {
                            selectedChange = change
                            loadDetail()
                        }
                    },
                    (change GitChange) -> toggleStage(change),
                    (stage bool) -> toggleAllStage(stage),
                    keyboardFocus,
                    !busy
                ).render()
            )
        }
        if notice != "" {
            children.Add(
                WorkbenchNotice(
                    notice,
                    noticeIsError,
                    () -> {
                        notice = ""
                    },
                    keyboardFocus
                )
            )
        }
        if !historyTab {
            children.Add(
                CommitPane(
                    commitMessage,
                    commitDescription,
                    branch,
                    directory != "" && !busy && hasStagedChanges() && commitMessage.Trim() != "",
                    (value string) -> {
                        commitMessage = value
                    },
                    () -> commit(),
                    keyboardFocus
                ).render()
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

    override func Build() Blob {
        guard let window = attachedWindow else {
            throw InvalidOperationException("Attach a window before mounting the workbench.")
        }
        return Container{
            Width: Length.Percent(100),
            Height: Length.Percent(100),
            MinWidth: 0,
            MinHeight: 0,
            FlexDirection: FlexDirection.Column,
            BackgroundColor: GitTheme.Background,
            BorderTopLeftRadius: if window.State == WindowState.Maximized {
                0
            } else {
                9
            },
            BorderTopRightRadius: if window.State == WindowState.Maximized {
                0
            } else {
                9
            },
            Overflow: Overflow.Hidden,
            KeyBindings: WorkbenchEditorBindings(window),
            OnPointerDown: (event PointerEvent) -> {
                keyboardFocus = false
            },
            OnKeyDown: (event KeyEvent) -> {
                keyboardFocus = true
                if event.Key == Key.F5 && !busy {
                    refresh()
                    event.PreventDefault()
                } else if event.Key == Key.Escape && branchSelectorOpen {
                    branchSelectorOpen = false
                    branchHandle.Focus()
                    event.PreventDefault()
                }
            },
            WorkbenchWindowChrome(window, keyboardFocus, logo),
            WorkbenchToolbar(
                directory,
                branch,
                branches,
                pullState,
                busy,
                pulling,
                branchSelectorOpen,
                branchHandle,
                () -> {
                    chooseRepository()
                },
                () -> pullOrigin(),
                () -> {
                    branchSelectorOpen = !branchSelectorOpen
                },
                (target string) -> selectBranch(target),
                keyboardFocus
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
                    Key: "workbench-sidebar",
                    Width: GitTheme.SidebarWidth,
                    FlexShrink: 0,
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
                        },
                        keyboardFocus
                    ).render(),
                    sidebarContent(),
                },
                Cell.Mount[DetailPaneInput, DetailPane](
                    "workbench-detail",
                    DetailPaneInput(selectedChange, selectedCommit, detailRows, detailLoading, detailVersion)
                ),
            },
        }
    }
}
