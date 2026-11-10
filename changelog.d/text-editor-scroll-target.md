## Fixed

- `TextEditor` keeps a `TextEditorController.ScrollTo` request or a caret reveal until the lines around the target are measured, so scrolling to the end before the first layout reaches the last line and revealing a caret far down a wrapped document keeps the caret visible.
