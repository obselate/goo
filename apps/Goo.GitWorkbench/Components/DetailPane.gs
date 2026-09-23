package GooGitWorkbench

import Goo
import System
import System.Collections.Generic

class DetailPane {
    private let selectedChange GitChange?
    private let selectedCommit GitCommit?
    private let detail string

    init(selectedChange GitChange?, selectedCommit GitCommit?, detail string) {
        this.selectedChange = selectedChange
        this.selectedCommit = selectedCommit
        this.detail = detail
    }

    private func numberAt(line string, start int32) int32 {
        var end = start
        while end < line.Length && line[end] >= '0' && line[end] <= '9' {
            end++
        }
        return if end == start {
            -1
        } else {
            Int32.Parse(line.Substring(start, end - start))
        }
    }

    private func lineWithoutCarriageReturn(line string) string -> if line.EndsWith("\r") {
        line.Substring(0, line.Length - 1)
    } else {
        line
    }

    private func filePathFromDiff(line string) string {
        let quotedPath = line.LastIndexOf("\"b/")
        if quotedPath >= 0 {
            let pathStart = quotedPath + 3
            let pathEnd = line.LastIndexOf('"')
            return if pathEnd > pathStart {
                line.Substring(pathStart, pathEnd - pathStart)
            } else {
                line.Substring(pathStart)
            }
        }

        let path = line.LastIndexOf(" b/")
        return if path >= 0 {
            line.Substring(path + 3).Trim()
        } else {
            line.Substring(11).Trim()
        }
    }

    private func diffLine(
        oldNumber string,
        newNumber string,
        marker string,
        content string,
        color Color,
        background Color
    ) Container -> Container{
        Width: Length.Auto,
        FlexDirection: FlexDirection.Row,
        AlignItems: AlignItems.Center,
        BackgroundColor: background,
        Text{
            Width: 48,
            FlexShrink: 0.0,
            PaddingLeft: 4,
            PaddingRight: 8,
            Content: oldNumber,
            FontFamily: GitTheme.Mono,
            FontSize: 12,
            Color: GitTheme.Muted,
            TextAlign: TextAlign.Right,
            TextWrap: TextWrap.NoWrap,
        },
        Text{
            Width: 48,
            FlexShrink: 0.0,
            PaddingLeft: 4,
            PaddingRight: 8,
            BorderRightWidth: 1,
            BorderRightColor: GitTheme.Border,
            Content: newNumber,
            FontFamily: GitTheme.Mono,
            FontSize: 12,
            Color: GitTheme.Muted,
            TextAlign: TextAlign.Right,
            TextWrap: TextWrap.NoWrap,
        },
        Text{
            Width: 22,
            FlexShrink: 0.0,
            PaddingLeft: 6,
            Content: marker,
            FontFamily: GitTheme.Mono,
            FontSize: 12,
            Color: color,
            TextWrap: TextWrap.NoWrap,
        },
        Text{
            Width: Length.Auto,
            FlexShrink: 0.0,
            PaddingLeft: 4,
            PaddingRight: 8,
            Content: content,
            FontFamily: GitTheme.Mono,
            FontSize: 12,
            Color: color,
            TextWrap: TextWrap.NoWrap,
        },
    }

    private func fileHeader(path string) Container -> Container{
        Width: Length.Percent(100),
        Padding: 8,
        FlexDirection: FlexDirection.Row,
        AlignItems: AlignItems.Center,
        BorderBottomWidth: 1,
        BorderBottomColor: GitTheme.Border,
        BackgroundColor: GitTheme.Surface,
        Text{
            Width: 0,
            FlexGrow: 1,
            MinWidth: 0,
            Content: path,
            FontFamily: GitTheme.Mono,
            FontSize: 12,
            FontWeight: 600,
            Color: GitTheme.Text,
            TextWrap: TextWrap.NoWrap,
            TextTrimming: TextTrimming.Ellipsis,
        },
    }

    private func addPlainLines(rows List[Blob], preview string, numbered bool) {
        let source = if preview.EndsWith("\n") {
            preview.Substring(0, preview.Length - 1)
        } else {
            preview
        }
        var lineNumber int32 = 1
        for rawLine in source.Split('\n') {
            let line = lineWithoutCarriageReturn(rawLine)
            if numbered {
                rows.Add(diffLine("", lineNumber.ToString(), "", line, GitTheme.Text, GitTheme.Surface))
                lineNumber++
            } else {
                rows.Add(diffLine("", "", "", line, GitTheme.Text, GitTheme.Surface))
            }
        }
    }

    private func diffRows(preview string, showFileHeaders bool) List[Blob] {
        let rows = List[Blob]()
        let source = if preview.EndsWith("\n") {
            preview.Substring(0, preview.Length - 1)
        } else {
            preview
        }
        var oldNumber int32 = 0
        var newNumber int32 = 0
        var inFile = false
        var inHunk = false
        for rawLine in source.Split('\n') {
            let line = lineWithoutCarriageReturn(rawLine)
            if line.StartsWith("diff --git ") {
                oldNumber = 0
                newNumber = 0
                inFile = true
                inHunk = false
                if showFileHeaders {
                    rows.Add(fileHeader(filePathFromDiff(line)))
                }
                continue
            }
            if !inFile {
                continue
            }
            if line.StartsWith("@@") {
                let oldMarker = line.IndexOf('-')
                let newMarker = if oldMarker >= 0 {
                    line.IndexOf('+', oldMarker + 1)
                } else {
                    -1
                }
                let oldStart = if oldMarker >= 0 {
                    numberAt(line, oldMarker + 1)
                } else {
                    -1
                }
                let newStart = if newMarker >= 0 {
                    numberAt(line, newMarker + 1)
                } else {
                    -1
                }
                if oldStart >= 0 && newStart >= 0 {
                    oldNumber = oldStart
                    newNumber = newStart
                    inHunk = true
                    rows.Add(diffLine("", "", "", line, GitTheme.DiffHunk, GitTheme.Background))
                }
                continue
            }
            if !inHunk {
                if line.StartsWith("index ") || line.StartsWith("--- ") || line.StartsWith("+++ ") {
                    continue
                }
                if line != "" {
                    rows.Add(diffLine("", "", "", line, GitTheme.Muted, GitTheme.Surface))
                }
                continue
            }
            if line.StartsWith("\\") {
                rows.Add(diffLine("", "", "", line, GitTheme.Muted, GitTheme.Surface))
            } else if line.StartsWith("+") {
                rows.Add(
                    diffLine(
                        "",
                        newNumber.ToString(),
                        "+",
                        line.Substring(1),
                        GitTheme.DiffAdded,
                        GitTheme.DiffAddedBackground
                    )
                )
                newNumber++
            } else if line.StartsWith("-") {
                rows.Add(
                    diffLine(
                        oldNumber.ToString(),
                        "",
                        "-",
                        line.Substring(1),
                        GitTheme.DiffRemoved,
                        GitTheme.DiffRemovedBackground
                    )
                )
                oldNumber++
            } else if line.StartsWith(" ") {
                rows.Add(
                    diffLine(
                        oldNumber.ToString(),
                        newNumber.ToString(),
                        "",
                        line.Substring(1),
                        GitTheme.Text,
                        GitTheme.Surface
                    )
                )
                oldNumber++
                newNumber++
            } else if line != "" {
                rows.Add(diffLine("", "", "", line, GitTheme.Muted, GitTheme.Surface))
            }
        }
        return rows
    }

    func render() Blob {
        let heading = if let change = selectedChange {
            change.Path
        } else if let commit = selectedCommit {
            if commit.Subject == "" {
                "Commit ${commit.Id.Substring(0, 7)}"
            } else {
                commit.Subject
            }
        } else {
            "Diff"
        }
        let rows = List[Blob]()
        if selectedChange == nil && selectedCommit == nil {
            rows.Add(
                Container{
                    Width: Length.Percent(100),
                    Height: Length.Percent(100),
                    AlignItems: AlignItems.Center,
                    JustifyContent: JustifyContent.Center,
                    Text{
                        Content: "Select a file or commit to inspect its changes.",
                        FontSize: 13,
                        Color: GitTheme.Muted,
                    },
                }
            )
        } else {
            let preview = if detail.Length > 120000 {
                detail.Substring(0, 120000) + "\n\nOutput truncated."
            } else {
                detail
            }
            if let change = selectedChange {
                if change.Untracked {
                    if preview == "" {
                        rows.Add(diffLine("", "", "", "Empty file.", GitTheme.Muted, GitTheme.Surface))
                    } else {
                        addPlainLines(rows, preview, true)
                    }
                } else if preview.Contains("diff --git ") {
                    for row in diffRows(preview, false) {
                        rows.Add(row)
                    }
                } else {
                    addPlainLines(rows, preview, false)
                }
            } else if preview.Contains("diff --git ") {
                for row in diffRows(preview, true) {
                    rows.Add(row)
                }
            } else {
                addPlainLines(rows, preview, false)
            }
            if rows.Count == 0 {
                rows.Add(diffLine("", "", "", "No diff available.", GitTheme.Muted, GitTheme.Surface))
            }
        }

        return Container{
            Width: 0,
            FlexGrow: 1,
            MinWidth: 0,
            Height: Length.Percent(100),
            MinHeight: 0,
            FlexDirection: FlexDirection.Column,
            BackgroundColor: GitTheme.Surface,
            Container{
                Width: Length.Percent(100),
                Padding: 12,
                FlexDirection: FlexDirection.Row,
                AlignItems: AlignItems.Center,
                BorderBottomWidth: 1,
                BorderBottomColor: GitTheme.Border,
                BackgroundColor: GitTheme.Surface,
                Text{
                    Width: 0,
                    FlexGrow: 1,
                    MinWidth: 0,
                    Content: heading,
                    FontSize: 14,
                    FontWeight: 600,
                    Color: GitTheme.Text,
                    TextWrap: TextWrap.NoWrap,
                    TextTrimming: TextTrimming.Ellipsis,
                },
            },
            Container{
                Width: Length.Percent(100),
                Height: 0,
                FlexGrow: 1,
                MinWidth: 0,
                MinHeight: 0,
                FlexDirection: FlexDirection.Column,
                OverflowX: Overflow.Scroll,
                OverflowY: Overflow.Scroll,
                Children: rows,
            },
        }
    }
}
