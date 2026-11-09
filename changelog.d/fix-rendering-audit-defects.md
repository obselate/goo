## Fixed

- A BackdropBlur panel now updates when an element under it is removed. It no longer keeps the old blurred pixels until other content under it changes.
- An app can keep more than 4,096 drawn image sources alive. The image identity table now grows instead of failing the frame with "capacity reached".
- A scrolling container with a custom `LayoutAlgorithm` no longer counts its padding and border twice in the scroll range. Content that fits no longer scrolls.
