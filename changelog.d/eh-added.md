## Added

- Use `ElementHandle.SelectText(start, end)` to focus and select UTF-16 offsets, including one request made before mount.
- Use `IsAtEndX` and `IsAtEndY` on handles or metrics snapshots instead of an application epsilon. Use `ScrollToEnd()` to animate to the range end.
