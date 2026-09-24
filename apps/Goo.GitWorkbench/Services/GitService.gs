package GooGitWorkbench

import System
import System.Collections.Generic
import System.Diagnostics
import System.IO

class GitResult {
    var Ok bool
    var Output string = ""
    var Error string = ""
}

func runGit(directory string, arguments List[string]) GitResult {
    let result = GitResult{}
    try {
        let start = ProcessStartInfo("git")
        start.WorkingDirectory = directory
        start.UseShellExecute = false
        start.CreateNoWindow = true
        start.RedirectStandardOutput = true
        start.RedirectStandardError = true
        start.Environment["GIT_TERMINAL_PROMPT"] = "0"
        start.Environment["GIT_PAGER"] = "cat"
        start.Environment["LC_ALL"] = "C"
        for argument in arguments {
            start.ArgumentList.Add(argument)
        }

        guard let process = Process.Start(start) else {
            result.Error = "Could not start Git."
            return result
        }
        try {
            let errors = process.StandardError.ReadToEndAsync()
            result.Output = process.StandardOutput.ReadToEnd()
            process.WaitForExit()
            result.Error = errors.GetAwaiter().GetResult().Trim()
            result.Ok = process.ExitCode == 0
        } finally {
            process.Dispose()
        }
    } catch (error Exception) {
        result.Error = error.Message
    }
    return result
}

func readPullState(directory string, branch string) GitPullState {
    if branch == "" {
        return GitPullState{Message: "Select a local branch to pull"}
    }
    let origin = runGit(directory, List[string]{"remote", "get-url", "origin"})
    if !origin.Ok {
        return GitPullState{Message: "No origin remote configured"}
    }
    let remote = runGit(directory, List[string]{"config", "--get", "branch." + branch + ".remote"})
    if remote.Ok && remote.Output.Trim() != "origin" {
        return GitPullState{Message: "Branch tracks " + remote.Output.Trim()}
    }
    let merge = runGit(directory, List[string]{"config", "--get", "branch." + branch + ".merge"})
    let branchRef = if merge.Ok && remote.Ok {
        merge.Output.Trim()
    } else {
        "refs/heads/" + branch
    }
    if !branchRef.StartsWith("refs/heads/") || branchRef.Contains('\n') {
        return GitPullState{Message: "Branch has no single pull target"}
    }
    return GitPullState{
        Available: true,
        BranchRef: branchRef,
        Message: "Fast-forward from origin/" + branchRef.Substring(11),
    }
}

func readChanges(output string) List[GitChange] {
    let changes = List[GitChange]()
    let records = output.Split('\0')
    var index = 0
    while index < records.Length - 1 {
        let record = records[index]
        index++
        if record.Length < 4 {
            continue
        }
        let staged = record[0]
        let unstaged = record[1]
        let path = record.Substring(3)
        if staged == 'R' || staged == 'C' || unstaged == 'R' || unstaged == 'C' {
            index++
        }
        if staged != ' ' && staged != '?' {
            changes.Add(GitChange(path, staged.ToString(), true, false))
        }
        if unstaged != ' ' || staged == '?' {
            changes.Add(
                GitChange(
                    path,
                    if staged == '?' {
                        "?"
                    } else {
                        unstaged.ToString()
                    },
                    false,
                    staged == '?',
                    staged != ' ' && staged != '?'
                )
            )
        }
    }
    return changes
}

func readHistory(output string) List[GitCommit] {
    let commits = List[GitCommit]()
    for line in output.Split('\n') {
        let fields = line.Split('\0')
        if fields.Length == 3 {
            commits.Add(GitCommit(fields[0], fields[1], fields[2]))
        }
    }
    return commits
}

func readBranches(output string) List[string] {
    let branches = List[string]()
    for line in output.Split('\n') {
        let name = line.Trim()
        if name != "" {
            branches.Add(name)
        }
    }
    return branches
}

func gitError(result GitResult) string -> if result.Error != "" {
    result.Error
} else if result.Output != "" {
    result.Output.Trim()
} else {
    "Git command failed."
}
