package GooGallery

import Goo

internal class GalleryStageView {
    shared {
        private func Transient(
            catalog GalleryCatalog,
            currentShowcase int32,
            compact bool,
            assets GalleryMathAssets,
            programs GalleryShaderPrograms,
            window Window?
        ) Blob {
            if currentShowcase == 0 {
                return Cell.Mount[HeroInput, HeroCell](
                    "showcase-hero",
                    HeroInput{Programs: programs, Compact: compact, Active: true}
                )
            }
            let showcase = catalog.Showcases[currentShowcase]
            return switch showcase.Chapter {
                case 0: Cell.Mount[ComposeChapterInput, ComposeChapter](
                    "showcase-compose",
                    ComposeChapterInput{Showcase: showcase.Local, Window: window}
                )
                case 1: Container{Key: "showcase-surfaces-placeholder", Display: Display.None}
                case 2: Cell.Mount[MotionChapterInput, MotionChapter](
                    "showcase-motion",
                    MotionChapterInput{
                        Assets: assets,
                        Programs: programs,
                        Compact: compact,
                        Showcase: showcase.Local,
                        Active: true
                    }
                )
                case 3: Cell.Mount[ShaderLabInput, ShaderLabCell](
                    "showcase-shaders",
                    ShaderLabInput{
                        Assets: assets,
                        Programs: programs,
                        Compact: false,
                        Showcase: showcase.Local,
                        Active: true
                    }
                )
                default: Container{Key: "showcase-empty", Display: Display.None}
            }
        }

        internal func Build(
            catalog GalleryCatalog,
            currentShowcase int32,
            compact bool,
            assets GalleryMathAssets,
            programs GalleryShaderPrograms,
            window Window?
        ) Blob {
            let showcase = catalog.Showcases[currentShowcase]
            let surfacesActive = showcase.Chapter == 1
            let transient = Transient(catalog, currentShowcase, compact, assets, programs, window)
            return Container{
                Key: "gallery-stage",
                Width: Percent(100),
                Height: Percent(100),
                MinWidth: 0,
                MinHeight: 0,
                Position: PositionType.Relative,
                Container{
                    Key: "persistent-surfaces-host",
                    Display: if surfacesActive {
                        Display.Flex
                    } else {
                        Display.None
                    },
                    Position: PositionType.Absolute,
                    Left: 0,
                    Top: 0,
                    Right: 0,
                    Bottom: 0,
                    AlignItems: AlignItems.Center,
                    JustifyContent: JustifyContent.Center,
                    Cell.Mount[StateSurfacesInput, StateSurfacesChapter](
                        "showcase-surfaces",
                        StateSurfacesInput{Compact: compact, Active: surfacesActive}
                    ),
                },
                Container{
                    Key: "transient-showcase-host",
                    Display: if surfacesActive {
                        Display.None
                    } else {
                        Display.Flex
                    },
                    Position: PositionType.Absolute,
                    Left: 0,
                    Top: 0,
                    Right: 0,
                    Bottom: 0,
                    AlignItems: AlignItems.Center,
                    JustifyContent: JustifyContent.Center,
                    transient,
                },
            }
        }
    }
}
