package GooGallery

import Goo
import System
import System.Collections.Generic

class GalleryTheme {
    shared {
        let Background Color = Color.Rgb(10, 10, 11)
        let Surface Color = Color.Rgb(15, 15, 17)
        let SurfaceRaised Color = Color.Rgb(24, 24, 27)
        let Border Color = Color.Rgb(39, 39, 42)
        let BorderStrong Color = Color.Rgb(63, 63, 70)
        let Ink Color = Color.Rgb(250, 250, 250)
        let InkMuted Color = Color.Rgb(161, 161, 170)
        let InkSubtle Color = Color.Rgb(113, 113, 122)

        let Accent Color = Color.Rgb(99, 102, 241)
        let AccentMuted Color = Color.Rgb(30, 27, 75)
        let AccentStrong Color = Color.Rgb(129, 140, 248)
        let SidebarBackground Color = Color.Rgb(13, 13, 15)
        let StageBackground Color = Color.Rgb(8, 8, 9)

        const GalleryFontFamily string = "Space Grotesk"
        const ElementFontFamily string = "Vend Sans"
        const IconFamily string = "Material Symbols Rounded"
        const IconMinimize string = "\uE15B"
        const IconMaximize string = "\uE3C6"
        const IconCheck string = "\uE5CA"
        const IconClose string = "\uE5CD"
        const IconExpandLess string = "\uE5CE"
        const IconExpandMore string = "\uE5CF"
        const IconInfo string = "\uE88E"
        const IconViewList string = "\uE8EF"
        const IconVerticalSplit string = "\uE949"
        const IconGridView string = "\uE9B0"
        const IconBolt string = "\uEA0B"
        const IconRestart string = "\uF053"

        let Breakpoint float64 = 1180.0
        let RailWide float64 = 184.0
        let RailCompact float64 = 72.0
        let PadWide float64 = 56.0
        let PadCompact float64 = 32.0
        let MaxContent float64 = 1120.0

        func SpecimenName(content string) Text -> Text{
            Content: content,
            FontSize: 13,
            FontWeight: 600,
            LetterSpacing: 0.4,
            TextTransform: TextTransform.Uppercase,
            Color: InkMuted,
        }

        func Hint(content string) Text -> Text{
            Key: "spec-hint",
            Content: content,
            Width: Length.Percent(100),
            FontSize: 12,
            Color: InkMuted,
            FlexShrink: 0.0,
            TransitionMs: 100.0,
        }

        func Icon(content string, size float64, color Color) Text -> Text{
            Content: content,
            FontFamily: IconFamily,
            FontSize: size,
            FontWeight: 400,
            Color: color,
            TextAlign: TextAlign.Center,
        }

        func Frame(children List[Blob]) Container -> Container{
            Width: Length.Percent(100),
            Height: Length.Percent(100),
            MinWidth: 0,
            MinHeight: 0,
            FlexGrow: 1.0,
            FlexShrink: 1.0,
            BackgroundColor: Surface,
            BorderWidth: 1,
            BorderColor: Border,
            BorderRadius: 12,
            Padding: 20,
            FlexDirection: FlexDirection.Column,
            Gap: 12,
            Children: children,
        }

        func GhostButton(content string, onClick Action) Button -> Button{
            Padding: 10,
            BackgroundColor: SurfaceRaised,
            BorderWidth: 1,
            BorderColor: Border,
            BorderRadius: 8,
            TransitionMs: 100.0,
            Hover: Style{BackgroundColor: Border, BorderColor: BorderStrong},
            Focus: Style{OutlineWidth: 1, OutlineColor: BorderStrong},
            OnClick: onClick,
            Text{Content: content, FontSize: 13, FontWeight: 600, Color: Ink,},
        }
    }
}
