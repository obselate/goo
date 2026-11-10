## Fixed

- A shrinking wrapping `Text` stops at its widest word instead of about one glyph, so it no longer breaks inside words. Set `MinWidth: 0` to let it shrink further and break inside words.
- A row that overflows no longer grows `FlexGrow` items. Shrinking items that reach their minimum no longer push the other items to their minimum too.
