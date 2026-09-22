package GooGallery

import Goo
import System.Collections.Generic

func GallerySpecimen(name string, hint string, content Blob) Container {
    let frameChildren = List[Blob]()
    frameChildren.Add(
        Container{Key: "spec-name", Width: Percent(100), FlexShrink: 0.0, GalleryTheme.SpecimenName(name),}
    )
    frameChildren.Add(
        Container{
            Key: "spec-content",
            Width: Percent(100),
            FontFamily: GalleryTheme.ElementFontFamily,
            FlexGrow: 1.0,
            FlexShrink: 1.0,
            MinHeight: 0,
            MinWidth: 0,
            OverflowX: Overflow.Hidden,
            OverflowY: Overflow.Hidden,
            content,
        }
    )
    frameChildren.Add(Container{Key: "spec-hint-host", Width: Percent(100), FlexShrink: 0.0, GalleryTheme.Hint(hint),})
    let frame = GalleryTheme.Frame(frameChildren)
    return Container{
        Width: Percent(100),
        Height: Percent(100),
        FlexGrow: 1.0,
        FlexShrink: 1.0,
        MinHeight: 0,
        MinWidth: 0,
        frame,
    }
}
