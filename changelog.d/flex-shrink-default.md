## Changed

- Breaking layout default: `FlexShrink` now defaults to 1, as in CSS. A shrinking item stops at its `Width` or `Height`, or at its content size when that is unset, so labels wrap or truncate instead of pushing siblings out of the container. Set `MinWidth: 0` or `MinHeight: 0` to let an item shrink further. Set `FlexShrink: 0` to restore the previous behavior.
