package GooGallery

import System
import Goo

internal class GalleryStageView {
  shared {
    private func Transient(
      catalog GalleryCatalog,
      currentShowcase int32,
      compact bool,
      assets GalleryMathAssets,
      programs GalleryShaderPrograms) Blob{
        if Environment.GetEnvironmentVariable("GOO_GALLERY_REVIEW_WORKLOAD") == "image-upload" {
          return Container{
            Key: "review-image-upload-control",
            Width: 640,
            Height: 360,
            Children: {
              Image{
                Key: "review-image-upload-source",
                Width: Length.Percent(100),
                Height: Length.Percent(100),
                Source: assets.Mandelbrot,
                Fit: ImageFit.Fill,
              },
            },
          }
        }
        if currentShowcase == 0 {
          return Cell.Mount[HeroCell]("showcase-hero", (c HeroCell) -> {
            c.Programs = programs
            c.Compact = compact
            c.Active = true
          })
        }
        let showcase = catalog.Showcases[currentShowcase]
        return switch showcase.Chapter {
          case 0: Cell.Mount[ComposeChapterInput, ComposeChapter](
            "showcase-compose",
            ComposeChapterInput{ Showcase: showcase.Local })
          case 1: Container { Key: "showcase-surfaces-placeholder", Display: Display.None }
          case 2: Cell.Mount[MotionChapter]("showcase-motion", (c MotionChapter) -> {
            c.Assets = assets
            c.Programs = programs
            c.Compact = compact
            c.Showcase = showcase.Local
            c.Active = true
          })
          case 3: Cell.Mount[ShaderLabCell]("showcase-shaders", (c ShaderLabCell) -> {
            c.Assets = assets
            c.Programs = programs
            c.Compact = false
            c.Showcase = showcase.Local
            c.Active = true
          })
          default: Container { Key: "showcase-empty", Display: Display.None }
        }
      }

    internal func Build(
      catalog GalleryCatalog,
      currentShowcase int32,
      compact bool,
      assets GalleryMathAssets,
      programs GalleryShaderPrograms) Blob{
        let showcase = catalog.Showcases[currentShowcase]
        let surfacesActive = showcase.Chapter == 1
        let transient = Transient(catalog, currentShowcase, compact, assets, programs)
        return Container{
          Key: "gallery-stage",
          Width: Length.Percent(100),
          Height: Length.Percent(100),
          MinWidth: 0,
          MinHeight: 0,
          Position: PositionType.Relative,
          Children: {
            Container{
              Key: "persistent-surfaces-host",
              Display: if surfacesActive { Display.Flex } else { Display.None },
              Position: PositionType.Absolute,
              Left: 0,
              Top: 0,
              Right: 0,
              Bottom: 0,
              AlignItems: AlignItems.Center,
              JustifyContent: JustifyContent.Center,
              Children: {
                Cell.Mount[StateSurfacesChapter]("showcase-surfaces", (c StateSurfacesChapter) -> {
                  c.Compact = compact
                  c.Active = surfacesActive
                }),
              },
            },
            Container{
              Key: "transient-showcase-host",
              Display: if surfacesActive { Display.None } else { Display.Flex },
              Position: PositionType.Absolute,
              Left: 0,
              Top: 0,
              Right: 0,
              Bottom: 0,
              AlignItems: AlignItems.Center,
              JustifyContent: JustifyContent.Center,
              Children: { transient },
            },
          },
        }
      }
  }
}
