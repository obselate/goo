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
            task.ContinueWith(
                (completed Task[FileDialogResult]) -> {
                    window.TryPost(
                        () -> {
                            fileBusy = false
                            if completed.IsFaulted {
                                fileStatus = completed.Exception?.GetBaseException().Message ?? "File chooser failed"
                            } else {
                                let result = completed.Result
                                if result.Status == FileDialogStatus.Success && result.Paths.Count == 1 {
                                    filePath = result.Paths[0]
                                } else if result.Status != FileDialogStatus.Cancelled {
                                    fileStatus = result.Error == "" ? "File chooser unavailable. Enter a path directly.": result.Error
                                }
                            }
                            Rebuild()
                        }
                    )
                }
            )
        } catch (error Exception) {
            fileBusy = false
            fileStatus = error.Message
            Rebuild()
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
            let worker = Thread(
                () -> {
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
                    window.TryPost(
                        () -> {
                            fileBusy = false
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
                }
            )
            worker.IsBackground = true
            worker.Start()
        } catch (error Exception) {
            fileBusy = false
            fileStatus = error.Message
            Rebuild()
        }
    }
}
