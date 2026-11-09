## Fixed

- With more than one window, growing the shared path atlas no longer destroys the atlas that another window's queued frame still draws from. Growth now waits until that frame is submitted.
