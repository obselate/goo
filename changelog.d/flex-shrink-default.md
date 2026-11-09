## Changed

- Breaking layout default: `FlexShrink` now defaults to 1, as in CSS. Without `MinWidth` or `MinHeight`, a shrinking item stops at 0 if its overflow is `Scroll` or `Hidden`, else at its `Width` or `Height`, else at its content size. Labels wrap or truncate instead of pushing siblings out, and scroll panes fill the remaining space. Set `MinWidth: 0` or `MinHeight: 0` to let any item shrink further. Set `FlexShrink: 0` to restore the previous behavior.
