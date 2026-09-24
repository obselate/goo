package GooGitWorkbench

import System.Collections.Generic

class GitSnapshot {
    var Directory string = ""
    var Branch string = ""
    var Branches List[string] = List[string]()
    var Changes List[GitChange] = List[GitChange]()
    var History List[GitCommit] = List[GitCommit]()
    var Pull GitPullState = GitPullState{}
}

class GitWork {
    var Directory string = ""
    var Arguments List[string]?
    var ResolveRoot bool
    var Snapshot bool
    var Change GitChange?
    var Commit GitCommit?
}

class GitWorkResult {
    var Error string = ""
    var Snapshot GitSnapshot?
    var Rows List[DiffRow] = List[DiffRow]()
}
