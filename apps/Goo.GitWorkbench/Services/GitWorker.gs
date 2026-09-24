package GooGitWorkbench

import System
import System.Collections.Generic
import System.IO

func executeGitWork(work GitWork, completed Action[GitWorkResult]) {
    let result = GitWorkResult{}
    try {
        var directory = work.Directory
        if work.ResolveRoot {
            directory = checkedGit(directory, List[string]{"rev-parse", "--show-toplevel"}).Trim()
        }
        if let arguments = work.Arguments {
            checkedGit(directory, arguments)
        }
        if work.Snapshot {
            result.Snapshot = readGitSnapshot(directory)
        } else {
            let text = readGitDetail(directory, work.Change, work.Commit)
            result.Rows = DiffParser.Parse(text, work.Change?.Untracked == true, work.Commit != nil)
            let path = work.Change?.Path ?? ""
            if SyntaxHighlighter.CanHighlight(result.Rows, path) {
                SyntaxHighlighter.Apply(
                    result.Rows,
                    path,
                    (rows List[DiffRow]) -> completed(GitWorkResult{Rows: rows, DetailPending: true}),
                    work.IsCancelled
                )
            }
        }
    } catch (error Exception) {
        result.Error = error.Message
    }
    try {
        completed(result)
    } catch (error Exception) {
        Console.Error.WriteLine("Git worker completion failed: " + error.Message)
    }
}

private func checkedGit(directory string, arguments List[string]) string {
    let result = runGit(directory, arguments)
    if !result.Ok {
        throw InvalidOperationException(gitError(result))
    }
    return result.Output
}

private func readGitSnapshot(directory string) GitSnapshot {
    let branch = checkedGit(directory, List[string]{"branch", "--show-current"}).Trim()
    let changes = checkedGit(directory, List[string]{"-c", "core.quotepath=false", "status", "--porcelain=v1", "-z"})
    return GitSnapshot{
        Directory: directory,
        Branch: branch,
        Branches: readBranches(checkedGit(directory, List[string]{"branch", "--format=%(refname:short)"})),
        Changes: readChanges(changes),
        History: readHistory(runGit(directory, List[string]{"log", "-n", "40", "--format=%H%x00%s%x00%an"}).Output),
        Pull: readPullState(directory, branch),
    }
}

private func readGitDetail(directory string, change GitChange?, commit GitCommit?) string {
    if let selected = change {
        if selected.Untracked {
            return File.ReadAllText(Path.Combine(directory, selected.Path))
        }
        let arguments = List[string]{"diff", "--no-ext-diff", "--no-color"}
        if selected.Staged {
            arguments.Add("--cached")
        }
        arguments.Add("--")
        arguments.Add(selected.Path)
        return checkedGit(directory, arguments)
    }
    if let selected = commit {
        return checkedGit(
            directory,
            List[string]{"show", "--patch", "--format=", "--no-ext-diff", "--no-color", selected.Id}
        )
    }
    return ""
}
