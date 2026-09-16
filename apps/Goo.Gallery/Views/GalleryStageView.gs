package GooGallery

import Goo

internal class GalleryStageView {
    shared {
        internal func Build(
            catalog GalleryCatalog,
            currentShowcase int32,
            compact bool
        ) Blob {
            let showcase = catalog.Showcases[currentShowcase]
            return Container{
                Key: "gallery-stage",
                Width: Length.Percent(100),
                Height: Length.Percent(100),
                MinWidth: 0,
                MinHeight: 0,
                Position: PositionType.Relative,
                AlignItems: AlignItems.Center,
                JustifyContent: JustifyContent.Center,
                switch showcase.Chapter {
                    case 0: Cell.Mount[ComposeChapterInput, ComposeChapter](
                        "showcase-compose",
                        ComposeChapterInput{Showcase: showcase.Local}
                    )
                    case 1: Cell.Mount[MotionChapter](
                        "showcase-motion",
                        (chapter MotionChapter) -> {
                            chapter.Compact = compact
                            chapter.Active = true
                        }
                    )
                    default: Container{Key: "showcase-empty", Display: Display.None}
                },
            }
        }
    }
}
