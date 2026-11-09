## Added

- Add `Window.MeasureText(text, style)`. It returns the laid-out width of a single-line Text without mounting nodes, so virtualized lists can size to their widest label.
- Text, TextEntry, TextEditor and Image boxes round their size up to the pixel grid at every position. A box at a fractional position is no longer one device pixel larger than the same box at a whole pixel.
