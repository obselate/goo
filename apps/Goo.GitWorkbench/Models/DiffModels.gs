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

enum SyntaxKind {
    Plain;
    Comment;
    Keyword;
    String;
    Constant;
    Type;
    Function
}

data struct SyntaxSpan(Start int32, Length int32, Kind SyntaxKind)
data struct DiffRow(Index int32, OldNumber string, NewNumber string, Marker string, Content string, Kind DiffRowKind) {
    var Syntax[]?SyntaxSpan
}

data struct DetailPaneInput(Change GitChange?, Commit GitCommit?, Rows List[DiffRow], Loading bool, Version int32)
data struct DiffLineInput(Row DiffRow, OnWidth Action[float64])
