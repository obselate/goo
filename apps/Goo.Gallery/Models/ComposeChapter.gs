package GooGallery

import Goo

internal data struct ComposeChapter {
    internal var Key string?
    internal var Showcase int32
    internal var Window Window?
}

internal func operator implicit(value ComposeChapter) Blob -> Cell.Mount[ComposeChapter, ComposeChapterCell](value.Key, value)
