package GooDevTools

import Goo
import System
import System.IO
import System.Threading
import System.Threading.Tasks

internal partial class ProfilerCell {
    internal var owner Window?
    private var fileAction string = ""
    private var filePath string = ""
    private var fileStatus string = ""
    private var fileBusy bool
    private let fileLifetime CancellationTokenSource = CancellationTokenSource()
    private var fileGeneration int32

    public func Dispose() {
        fileGeneration++
        fileLifetime.Cancel()
        fileLifetime.Dispose()
    }

    private func ShowFile(action string) {
        fileAction = action
        fileStatus = ""
        if filePath == "" {
            filePath = Path.Combine(Environment.CurrentDirectory, "goo-trace.json")
        }
        Rebuild()
    }

    private func FilePanel() Container -> Container{
        Key: "profiler-file-panel",
        Width: Percent(100),
        Height: 36,
        FlexShrink: 0.0,
        FlexDirection: FlexDirection.Row,
        AlignItems: AlignItems.Center,
        Gap: 4,
        Padding: 3,
        TextEntry{
            Key: "profiler-file-path",
            Width: 0,
            FlexGrow: 1.0,
            Height: 28,
            Padding: Edges{Left: 9, Right: 9},
            Value: filePath,
            Placeholder: "Chrome trace JSON path",
            Color: DevToolsTheme.Ink,
            FontSize: 11,
            BackgroundColor: DevToolsTheme.Surface,
            BorderRadius: 4,
            BorderWidth: 1,
            BorderColor: DevToolsTheme.Border,
            SelectionColor: DevToolsTheme.Selection,
            Disabled: fileBusy,
            OnChange: (value string) -> {
                filePath = value
            },
        },
        Control("profiler-file-browse", "Browse…", () -> BrowseFile(), !fileBusy),
        Control("profiler-file-apply", fileBusy ? "Working…": fileAction, () -> ApplyFile(), !fileBusy),
        Control(
            "profiler-file-cancel",
            "Cancel",
            () -> {
                fileAction = ""
                Rebuild()
            },
            !fileBusy
        ),
    }

    private func BrowseFile() {
        guard let window = owner else {
            return
        }
        if fileBusy {
            return
        }
        try {
            let task = window.ShowFileDialogAsync(
                fileAction == "Import" ? FileDialogKind.OpenFile: FileDialogKind.SaveFile,
                FileDialogOptions{
                    Title: fileAction + " profiler trace",
                    InitialPath: Path.GetFullPath(filePath),
                    Filters: []FileDialogFilter{FileDialogFilter("Chrome trace JSON", "json")},
                }
            )
            fileBusy = true
            Rebuild()
            fileGeneration++
            let generation = fileGeneration
            let token = fileLifetime.Token
            go CompleteBrowse(task, window, generation, token)
        } catch (error Exception) {
            fileBusy = false
            fileStatus = error.Message
            Rebuild()
        }
    }

    private func CompleteBrowse(task Task[FileDialogResult], window Window, generation int32, token CancellationToken) {
        try {
            using let cancellation = CancellationTokenSource.CreateLinkedTokenSource(token, window.Closed)
            let result = await task.WaitAsync(cancellation.Token)
            window.TryPost(
                () -> {
                    if generation != fileGeneration {
                        return
                    }
                    fileBusy = false
                    if result.Status == FileDialogStatus.Success && result.Paths.Count == 1 {
                        filePath = result.Paths[0]
                    } else if result.Status != FileDialogStatus.Cancelled {
                        fileStatus = result.Error == "" ? "File chooser unavailable. Enter a path directly.": result.Error
                    }
                    Rebuild()
                }
            )
        } catch (error OperationCanceledException) { } catch (error Exception) {
            let message = error.GetBaseException().Message
            window.TryPost(
                () -> {
                    if generation != fileGeneration {
                        return
                    }
                    fileBusy = false
                    fileStatus = message
                    Rebuild()
                }
            )
        }
    }

    private func ApplyFile() {
        guard let window = owner else {
            return
        }
        if fileBusy || session.Profiler?.Active == true {
            return
        }
        try {
            let path = Path.GetFullPath(filePath)
            let importing = fileAction == "Import"
            let trace = session.Profiler
            if !importing && trace == nil {
                return
            }
            fileBusy = true
            fileStatus = ""
            Rebuild()
            fileGeneration++
            let generation = fileGeneration
            let token = fileLifetime.Token
            go {
                try {
                    using let cancellation = CancellationTokenSource.CreateLinkedTokenSource(token, window.Closed)
                    cancellation.Token.ThrowIfCancellationRequested()
                    var loaded ProfilerTrace? = nil
                    var failure string = ""
                    try {
                        if importing {
                            loaded = ProfilerTrace.LoadFile(path)
                        } else if let current = trace {
                            current.SaveFile(path)
                        }
                    } catch (error Exception) {
                        failure = error.Message
                    }
                    cancellation.Token.ThrowIfCancellationRequested()
                    window.TryPost(
                        () -> {
                            if generation != fileGeneration {
                                return
                            }
                            fileBusy = false
                            if loaded != nil && session.Profiler?.Active == true {
                                fileStatus = "Import ignored because a recording started."
                                fileAction = ""
                                Rebuild()
                                return
                            }
                            if failure != "" {
                                fileStatus = failure
                            } else {
                                if let current = loaded {
                                    session.Profiler = current
                                    selected = -1
                                    selectionStart = 0L
                                    selectionEnd = 0L
                                    filterWindow = ""
                                    windowPicker = false
                                    follow = false
                                    collapsed.Clear()
                                    paths.Clear()
                                    scales.Clear()
                                    tableRows.Clear()
                                    tableKey = ""
                                    revision = current.Revision
                                    start = 0L
                                    end = Math.Max(1L, current.End)
                                }
                                fileStatus = (importing ? "Imported ": "Exported ") + Path.GetFileName(path)
                                fileAction = ""
                            }
                            Rebuild()
                        }
                    )
                } catch (error OperationCanceledException) { } catch (error Exception) {
                    let message = error.Message
                    window.TryPost(
                        () -> {
                            if generation != fileGeneration {
                                return
                            }
                            fileBusy = false
                            fileStatus = message
                            Rebuild()
                        }
                    )
                }
            }
        } catch (error Exception) {
            fileBusy = false
            fileStatus = error.Message
            Rebuild()
        }
    }
}
