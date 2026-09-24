package GooGitWorkbench

import System
import System.Collections.Generic

class DiffParser {
    shared {
        func Parse(detail string, untracked bool, fileHeaders bool) List[DiffRow] {
            if detail == "" {
                return List[DiffRow]{
                    DiffRow(
                        0,
                        "",
                        "",
                        "",
                        if untracked {
                            "Empty file."
                        } else {
                            "No diff available."
                        },
                        DiffRowKind.Note
                    )
                }
            }
            let rows = if !untracked && detail.Contains("diff --git ") {
                diffRows(detail, fileHeaders)
            } else {
                plainRows(detail, untracked)
            }
            if rows.Count == 0 {
                rows.Add(DiffRow(rows.Count, "", "", "", "No diff available.", DiffRowKind.Note))
            }
            return rows
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

        private func plainRows(preview string, numbered bool) List[DiffRow] {
            let rows = List[DiffRow]()
            let source = if preview.EndsWith("\n") {
                preview.Substring(0, preview.Length - 1)
            } else {
                preview
            }
            var lineNumber int32 = 1
            for rawLine in source.Split('\n') {
                let line = lineWithoutCarriageReturn(rawLine)
                if numbered {
                    rows.Add(DiffRow(rows.Count, "", lineNumber.ToString(), "", line, DiffRowKind.Context))
                    lineNumber++
                } else {
                    rows.Add(DiffRow(rows.Count, "", "", "", line, DiffRowKind.Context))
                }
            }
            return rows
        }

        private func diffRows(preview string, showFileHeaders bool) List[DiffRow] {
            let rows = List[DiffRow]()
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
                        rows.Add(DiffRow(rows.Count, "", "", "", filePathFromDiff(line), DiffRowKind.File))
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
                        rows.Add(DiffRow(rows.Count, "", "", "", line, DiffRowKind.Hunk))
                    }
                    continue
                }
                if !inHunk {
                    if line.StartsWith("index ") || line.StartsWith("--- ") || line.StartsWith("+++ ") {
                        continue
                    }
                    if line != "" {
                        rows.Add(DiffRow(rows.Count, "", "", "", line, DiffRowKind.Note))
                    }
                    continue
                }
                if line.StartsWith("\\") {
                    rows.Add(DiffRow(rows.Count, "", "", "", line, DiffRowKind.Note))
                } else if line.StartsWith("+") {
                    rows.Add(DiffRow(rows.Count, "", newNumber.ToString(), "+", line.Substring(1), DiffRowKind.Added))
                    newNumber++
                } else if line.StartsWith("-") {
                    rows.Add(DiffRow(rows.Count, oldNumber.ToString(), "", "-", line.Substring(1), DiffRowKind.Removed))
                    oldNumber++
                } else if line.StartsWith(" ") {
                    rows.Add(
                        DiffRow(
                            rows.Count,
                            oldNumber.ToString(),
                            newNumber.ToString(),
                            "",
                            line.Substring(1),
                            DiffRowKind.Context
                        )
                    )
                    oldNumber++
                    newNumber++
                } else if line != "" {
                    rows.Add(DiffRow(rows.Count, "", "", "", line, DiffRowKind.Note))
                }
            }
            return rows
        }
    }
}
