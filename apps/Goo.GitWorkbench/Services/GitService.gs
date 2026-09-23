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
            result.Output = process.StandardOutput.ReadToEnd()
            result.Error = process.StandardError.ReadToEnd().Trim()
            process.WaitForExit()
            result.Ok = process.ExitCode == 0
        } finally {
            process.Dispose()
        }
    } catch (error Exception) {
        result.Error = error.Message
    }
    return result
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
                    staged == '?'
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

func gitError(result GitResult) string -> if result.Error != "" {
    result.Error
} else if result.Output != "" {
    result.Output.Trim()
} else {
    "Git command failed."
}
