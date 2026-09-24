package GooGitWorkbench

import System
import System.Collections.Generic

enum DiffRowKind {
    Context;
    Added;
    Removed;
    Hunk;
    File;
    Note
}

data struct DiffRow(Index int32, OldNumber string, NewNumber string, Marker string, Content string, Kind DiffRowKind)
data struct DetailPaneInput(Change GitChange?, Commit GitCommit?, Rows List[DiffRow], Loading bool)
data struct DiffLineInput(Row DiffRow, OnWidth Action[float64])
