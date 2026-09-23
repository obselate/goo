package GooGitWorkbench

class GitChange {
    let Path string
    let Code string
    let Staged bool
    let Untracked bool

    init(path string, code string, staged bool, untracked bool) {
        Path = path
        Code = code
        Staged = staged
        Untracked = untracked
    }
}

class GitCommit {
    let Id string
    let Subject string
    let Author string

    init(id string, subject string, author string) {
        Id = id
        Subject = subject
        Author = author
    }
}
