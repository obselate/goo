package GooGallery

internal data struct GalleryChapter {
    internal var Name string
    internal var TabLabel string
    internal var Title string
    internal var Sentence string
    internal var RailLabel string
}

internal data struct GalleryShowcase {
    internal var Chapter int32
    internal var Local int32
    internal var Title string
}

internal class GalleryCatalog {
    internal let Chapters[]GalleryChapter
    internal let Showcases[]GalleryShowcase
    internal let OpeningSentence string

    internal init() {
        Chapters = []GalleryChapter{
            GalleryChapter{
                Name: "compose",
                TabLabel: "Compose",
                Title: "Compose and Layout",
                Sentence: "Retained identity through keyed children, flex composition, and a poster stage that answers its constraints.",
                RailLabel: "LAYOUT & FLEX",
            },
            GalleryChapter{
                Name: "motion",
                TabLabel: "Motion",
                Title: "Motion & Dynamics",
                Sentence: "Closed-form physical simulations and continuous velocity retargeting.",
                RailLabel: "MOTION & DYNAMICS",
            },
        }
        Showcases = []GalleryShowcase{
            GalleryShowcase{Chapter: 0, Local: 0, Title: "Keyed Fibonacci tiles"},
            GalleryShowcase{Chapter: 0, Local: 1, Title: "Live modular poster"},
            GalleryShowcase{Chapter: 1, Local: 0, Title: "Kinetic Physics & UI Dynamics"},
        }
        OpeningSentence = "A retained interface rendered as one focused, interactive exhibit at a time."
    }

    internal func ChapterIndex(name string) int32 {
        var index int32 = 0
        while index < Chapters.Length {
            if Chapters[index].Name == name {
                return index
            }
            index = index + 1
        }
        return -1
    }

    internal func FirstShowcase(chapter int32) int32 {
        var index int32 = 0
        while index < Showcases.Length {
            if Showcases[index].Chapter == chapter {
                return index
            }
            index = index + 1
        }
        return -1
    }
}
