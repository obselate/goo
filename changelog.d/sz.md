## Added

- Add `Sized(build)` and `Blob.Sized(build)` for content that depends on its allotted size. Replace size listeners and whole-Cell rebuilds with a builder that reads `LayoutSize` in layout units. Give the element space through layout. Its content has no effect on its own size. State and context reads refresh only the retained content.
