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
                Name: "surfaces",
                TabLabel: "Surfaces",
                Title: "One State, Many Surfaces",
                Sentence: "One retained phrase travels through a tactile fridge, drawn ink, and a deterministic cipher.",
                RailLabel: "RETAINED SURFACES",
            },
            GalleryChapter{
                Name: "motion",
                TabLabel: "Motion",
                Title: "Motion & Dynamics",
                Sentence: "Closed-form physical simulations and continuous velocity retargeting.",
                RailLabel: "MOTION & DYNAMICS",
            },
            GalleryChapter{
                Name: "shaders",
                TabLabel: "Shaders",
                Title: "Shader Lab",
                Sentence: "Three native fragment programs: procedural raycasting, radial light, and dither.",
                RailLabel: "VULKAN SHADERS",
            },
        }
        Showcases = []GalleryShowcase{
            GalleryShowcase{Chapter: -1, Local: 0, Title: "Goo"},
            GalleryShowcase{Chapter: 0, Local: 0, Title: "Keyed Fibonacci tiles"},
            GalleryShowcase{Chapter: 0, Local: 1, Title: "Live modular poster"},
            GalleryShowcase{Chapter: 1, Local: 0, Title: "One State, Many Surfaces"},
            GalleryShowcase{Chapter: 2, Local: 0, Title: "Kinetic Physics & UI Dynamics"},
            GalleryShowcase{Chapter: 3, Local: 0, Title: "3D World"},
            GalleryShowcase{Chapter: 3, Local: 3, Title: "Radial Light"},
            GalleryShowcase{Chapter: 3, Local: 7, Title: "Dither"},
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
