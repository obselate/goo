## Changed

- Breaking: `FlexShrink` now defaults to 1. Set `FlexShrink: 0` to keep the previous behavior.
- Automatic minimum sizes are 0 for `Scroll` or `Hidden` overflow. Otherwise, they follow the declared size or content size. Set `MinWidth: 0` or `MinHeight: 0` to allow further shrinking.
