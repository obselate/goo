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

    private func ShowFile(action string) {
        fileAction = action
        fileStatus = ""
        if filePath == "" {
            filePath = Path.Combine(Environment.CurrentDirectory, "goo-trace.json")
        }
    }

    private func FilePanel() Blob -> Row{
        Key: "profiler-file-panel",
        Width: Percent(100),
        FlexShrink: 0.0,
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
            }
        },
        FileButton("profiler-file-browse", "Browse…", () -> BrowseFile()),
        FileButton("profiler-file-apply", fileBusy ? "Working…": fileAction, () -> ApplyFile()),
        FileButton(
            "profiler-file-cancel",
            "Cancel",
            () -> {
                fileAction = ""
            }
        ),
    }

    private func FileButton(key string, text string, action Action) Blob {
        let button Blob = ActionButton{Content: text, Disabled: fileBusy, OnClick: action}
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
            let token = Lifetime
            go CompleteBrowse(task, token)
        } catch (error Exception) {
            fileBusy = false
            fileStatus = error.Message
        }
    }

    private func CompleteBrowse(task Task[FileDialogResult], token CancellationToken) {
        try {
            let result = await task.WaitAsync(token)
            Post(
                () -> {
                    fileBusy = false
                    if result.Status == FileDialogStatus.Success && result.Paths.Count == 1 {
                        filePath = result.Paths[0]
                    } else if result.Status != FileDialogStatus.Cancelled {
                        fileStatus = result.Error == "" ? "File chooser unavailable. Enter a path directly.": result.Error
                    }
                }
            )
        } catch (error OperationCanceledException) { } catch (error Exception) {
            let message = error.GetBaseException().Message
            Post(
                () -> {
                    fileBusy = false
                    fileStatus = message
                }
            )
        }
    }

    private func ApplyFile() {
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
            let token = Lifetime
            go CompleteFile(path, importing, trace, token)
        } catch (error Exception) {
            fileBusy = false
            fileStatus = error.Message
        }
    }

    private func CompleteFile(path string, importing bool, trace ProfilerTrace?, token CancellationToken) {
        try {
            token.ThrowIfCancellationRequested()
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
            token.ThrowIfCancellationRequested()
            Post(
                () -> {
                    fileBusy = false
                    if loaded != nil && session.Profiler?.Active == true {
                        fileStatus = "Import ignored because a recording started."
                        fileAction = ""
                    } else if failure != "" {
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
                        fileStatus = importing ? "": "Exported " + Path.GetFileName(path)
                        fileAction = ""
                    }
                }
            )
        } catch (error OperationCanceledException) { } catch (error Exception) {
            let message = error.Message
            Post(
                () -> {
                    fileBusy = false
                    fileStatus = message
                }
            )
        }
    }
}
