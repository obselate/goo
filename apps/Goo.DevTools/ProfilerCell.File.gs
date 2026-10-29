package GooDevTools

import Goo
import Goo.Widgets
import Goo.Widgets.Actions
import Goo.Widgets.Inputs
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
        FlexShrink: 0.0,
        FlexDirection: FlexDirection.Row,
        AlignItems: AlignItems.Center,
        Gap: 4,
        Padding: Edges{Left: Pad, Right: Pad, Top: 4},
        Container{
            Key: "profiler-file-path",
            Width: 0,
            FlexGrow: 1.0,
            TextField{
                Value: filePath,
                Placeholder: "Chrome trace JSON path",
                AccessibilityName: "Trace file",
                Disabled: fileBusy,
                Width: Percent(100),
                OnChange: (value string) -> {
                    filePath = value
                },
            }.Build()
        },
        FileButton("profiler-file-browse", "Browse…", () -> BrowseFile()),
        FileButton("profiler-file-apply", fileBusy ? "Working…": fileAction, () -> ApplyFile()),
        FileButton(
            "profiler-file-cancel",
            "Cancel",
            () -> {
                fileAction = ""
                Rebuild()
            }
        ),
    }

    private func FileButton(key string, text string, action Action) Blob {
        let button = ActionButton{Content: text, Disabled: fileBusy, OnClick: action}.Build()
        button.Key = key
        return button
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
                                    Select(-1)
                                    selectionStart = 0L
                                    selectionEnd = 0L
                                    filterWindow = ""
                                    follow = false
                                    paths.Clear()
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
