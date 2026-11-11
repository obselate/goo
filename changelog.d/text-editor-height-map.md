## Fixed

- `TextEditor` keeps its content height and visible text position when cached lines are released or measured.
- `TextEditorController.ScrollTo` and caret reveal reach their target after wrapped lines are measured.
- Caret reveal no longer hangs when the caret is larger than the editor viewport.
