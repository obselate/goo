package GooGallery

import Goo
import System
import System.Collections.Generic
import System.IO
import System.Numerics

internal class GlassMaterialBackdropCell : Cell {
    private func refractionLines() Container {
        let lines = List[Blob]()
        for index in 0 ... 7 {
            lines.Add(
                Container{
                    Position: PositionType.Absolute,
                    Left: -100,
                    Top: 250 + index * 28,
                    Width: 1300,
                    Height: index == 3 ? 4: 1,
                    BackgroundColor: Color.Rgba(255, 255, 255, index == 3 ? 170: 78),
                    Transform: PanelTransform{Rotate: -22.0},
                }
            )
        }
        return Container{Position: PositionType.Absolute, Left: 0, Top: 0, Right: 0, Bottom: 0, Children: lines,}
    }

    public override func Build() Blob -> Container{
        Key: "glass-lab-backdrop",
        Position: PositionType.Absolute,
        Left: 0,
        Top: 0,
        Right: 0,
        Bottom: 0,
        OverflowX: Overflow.Hidden,
        OverflowY: Overflow.Hidden,
        BackgroundColor: Color.Rgb(226, 239, 235),
        Container{
            Position: PositionType.Absolute,
            Left: -90,
            Top: 72,
            Width: 390,
            Height: 390,
            BorderRadius: 195,
            BackgroundGradient: LinearGradient(35.0, Color.Rgb(73, 173, 154), Color.Rgb(168, 221, 203)),
        },
        Container{
            Position: PositionType.Absolute,
            Right: -82,
            Top: -96,
            Width: 430,
            Height: 430,
            BorderRadius: 215,
            BackgroundGradient: LinearGradient(140.0, Color.Rgb(112, 129, 204), Color.Rgb(185, 205, 237)),
        },
        Container{
            Position: PositionType.Absolute,
            Right: 118,
            Bottom: -142,
            Width: 430,
            Height: 430,
            BorderRadius: 215,
            BackgroundGradient: LinearGradient(25.0, Color.Rgb(79, 159, 190), Color.Rgb(169, 216, 227)),
        },
        Container{
            Position: PositionType.Absolute,
            Left: 72,
            Right: 72,
            Top: 150,
            Height: 1,
            BackgroundColor: Color.Rgba(38, 78, 91, 72),
        },
        Container{
            Position: PositionType.Absolute,
            Left: 158,
            Top: 68,
            Bottom: 62,
            Width: 1,
            BackgroundColor: Color.Rgba(38, 78, 91, 58),
        },
        Container{
            Position: PositionType.Absolute,
            Right: 188,
            Top: 104,
            Bottom: 88,
            Width: 1,
            BackgroundColor: Color.Rgba(38, 78, 91, 45),
        },
        refractionLines(),
        Text{
            Content: "Material study",
            Position: PositionType.Absolute,
            Left: 72,
            Top: 72,
            FontFamily: GalleryTheme.GalleryFontFamily,
            FontSize: 18,
            FontWeight: 650,
            Color: Color.Rgba(32, 66, 74, 190),
        },
        Text{
            Content: "Liquid glass and terminal glass",
            Position: PositionType.Absolute,
            Left: 72,
            Top: 116,
            FontFamily: "monospace",
            FontSize: 11,
            FontWeight: 600,
            LetterSpacing: 0.0,
            Color: Color.Rgba(32, 66, 74, 126),
        },
        Text{
            Content: "goo",
            Position: PositionType.Absolute,
            Right: 76,
            Bottom: 36,
            FontFamily: GalleryTheme.GalleryFontFamily,
            FontSize: 112,
            FontWeight: 700,
            LetterSpacing: -7,
            Color: Color.Rgba(41, 83, 95, 42),
        },
    }
}

internal class GlassMaterialPanelCell : Cell {
    private let surfaceHandle ElementHandle
    private var liquidEffect ShaderEffect?
    private var terminalEffect ShaderEffect?
    private var terminalMode bool
    private var configured bool

    public init() {
        surfaceHandle = ElementHandle{}
    }

    internal func Configure(liquid ShaderEffect, terminal ShaderEffect, initialTerminal bool) {
        liquidEffect = liquid
        terminalEffect = terminal
        if !configured {
            terminalMode = initialTerminal
            configured = true
        }
    }

    private func selectedEffect() ShaderEffect? -> terminalMode ? terminalEffect: liquidEffect

    private func primaryInk() Color -> terminalMode
    ? Color.Rgb(242, 247, 250): Color.Rgb(24, 53, 62)

    private func secondaryInk() Color -> terminalMode
    ? Color.Rgba(196, 211, 220, 230): Color.Rgba(31, 70, 80, 225)

    private func accentInk() Color -> terminalMode
    ? Color.Rgb(116, 221, 200): Color.Rgb(25, 113, 91)

    private func selectMode(terminal bool) {
        if terminalMode == terminal {
            return
        }
        terminalMode = terminal
        selectedEffect()?.SetParameter(1, Vector4(0.5F, 0.5F, 0.0F, 0.0F))
        Rebuild()
    }

    private func trackPointer(event PointerEvent) {
        let bounds = surfaceHandle.BorderBox
        let x = float32(Math.Clamp(event.Position.X / Math.Max(bounds.Width, 1.0), 0.0, 1.0))
        let y = float32(Math.Clamp(event.Position.Y / Math.Max(bounds.Height, 1.0), 0.0, 1.0))
        selectedEffect()?.SetParameter(1, Vector4(x, y, float32(event.Pressure), 0.0F))
    }

    private func modeButton(label string, terminal bool) Button {
        let active = terminalMode == terminal
        return Button{
            Key: terminal ? "terminal-glass": "liquid-glass",
            Height: 36,
            Padding: Edges{Left: 16, Right: 16,},
            BorderRadius: 18,
            BorderWidth: 1,
            BorderColor: active ? Color.Rgba(39, 72, 82, 62): Color.Rgba(39, 72, 82, 24),
            BackgroundColor: active ? Color.Rgba(249, 253, 252, 218): Color.Rgba(249, 253, 252, 160),
            Hover: Style{BackgroundColor: Color.Rgba(249, 253, 252, 236)},
            OnClick: () -> {
                selectMode(terminal)
            },
            Text{
                Content: label,
                FontFamily: GalleryTheme.GalleryFontFamily,
                FontSize: 13,
                FontWeight: active ? 650: 500,
                Color: active ? Color.Rgb(27, 54, 63): Color.Rgba(27, 54, 63, 220),
            },
        }
    }

    private func terminalLine(text string, color Color, bold bool = false) Text -> Text{
        Content: text,
        FontFamily: "monospace",
        FontSize: 12,
        FontWeight: bold ? 650: 450,
        Color: color,
    }

    private func buildProjectRail() Container -> Container{
        Width: 176,
        Padding: Edges{Left: 18, Top: 18, Right: 14,},
        Gap: 12,
        BorderRightWidth: 1,
        BorderRightColor: terminalMode ? Color.Rgba(226, 238, 242, 24): Color.Rgba(31, 70, 80, 32),
        Text{
            Content: "Workspace",
            FontFamily: "monospace",
            FontSize: 9,
            FontWeight: 700,
            LetterSpacing: 0.0,
            Color: secondaryInk(),
        },
        Text{
            Content: "goo-gsharp",
            FontFamily: GalleryTheme.GalleryFontFamily,
            FontSize: 14,
            FontWeight: 650,
            Color: primaryInk(),
        },
        terminalLine("  Goo", secondaryInk()),
        terminalLine("  Rendering", secondaryInk()),
        Container{
            Padding: Edges{Left: 8, Top: 7, Bottom: 7,},
            BorderRadius: 7,
            BackgroundColor: terminalMode ? Color.Rgba(116, 196, 176, 24): Color.Rgba(25, 113, 91, 20),
            terminalLine("  Vulkan", accentInk(), true),
        },
        terminalLine("  Shaders", secondaryInk()),
        terminalLine("  tests", secondaryInk()),
    }

    private func buildTerminal() Container -> Container{
        FlexGrow: 1,
        MinWidth: 0,
        Padding: Edges{Left: 22, Top: 20, Right: 22,},
        Gap: 10,
        terminalLine("~/Projects/goo-gsharp", secondaryInk()),
        terminalLine("$ goo verify --target gallery", primaryInk(), true),
        Container{
            FlexDirection: FlexDirection.Row,
            AlignItems: AlignItems.Center,
            Gap: 9,
            Container{Width: 7, Height: 7, BorderRadius: 4, BackgroundColor: Color.Rgb(109, 222, 166)},
            terminalLine("checks passed", accentInk(), true),
            terminalLine("  0 warnings  ·  0 errors", secondaryInk()),
        },
        terminalLine("$ git status --short", primaryInk(), true),
        terminalLine(" M  apps/Goo.Gallery", terminalMode ? Color.Rgba(157, 196, 233, 188): Color.Rgb(47, 96, 150)),
        Container{Height: 5},
        terminalLine("$ _", primaryInk(), true),
    }

    private func buildSurface() Container -> Container{
        Width: Percent(100),
        MaxWidth: 700,
        Height: 420,
        Position: PositionType.Relative,
        Handle: surfaceHandle,
        BorderRadius: terminalMode ? 18: 30,
        BoxShadows: []BoxShadow{
            BoxShadow{
                OffsetX: 0.0,
                OffsetY: 30.0,
                Blur: 64.0,
                Spread: -18.0,
                Color: terminalMode ? Color.Rgba(10, 25, 40, 102): Color.Rgba(28, 60, 71, 28),
                Inset: false
            },
            BoxShadow{
                OffsetX: 0.0,
                OffsetY: 1.0,
                Blur: 1.0,
                Spread: 0.0,
                Color: terminalMode ? Color.Rgba(210, 232, 244, 48): Color.Rgba(255, 255, 255, 28),
                Inset: true
            },
        },
        BackgroundColor: Color.Transparent,
        OnPointerMove: (event PointerEvent) -> {
            trackPointer(event)
        },
        Container{
            Position: PositionType.Absolute,
            Left: 0,
            Top: 0,
            Right: 0,
            Bottom: 0,
            BorderRadius: terminalMode ? 18: 30,
            BackgroundColor: Color.Transparent,
            ShaderEffect: selectedEffect(),
        },
        Container{
            Position: PositionType.Absolute,
            Left: 0,
            Top: 0,
            Right: 0,
            Bottom: 0,
            BorderRadius: terminalMode ? 18: 30,
            OverflowX: Overflow.Hidden,
            OverflowY: Overflow.Hidden,
            BorderWidth: 1,
            BorderColor: terminalMode ? Color.Transparent: Color.Rgba(255, 255, 255, 40),
            BackgroundColor: Color.Transparent,
            Container{
                Height: 54,
                Padding: Edges{Left: 20, Right: 20,},
                FlexDirection: FlexDirection.Row,
                AlignItems: AlignItems.Center,
                Gap: 10,
                BorderBottomWidth: 1,
                BorderBottomColor: terminalMode ? Color.Rgba(226, 238, 242, 28): Color.Rgba(31, 70, 80, 34),
                Container{Width: 9, Height: 9, BorderRadius: 5, BackgroundColor: Color.Rgb(112, 213, 174)},
                Text{
                    Content: "Goo",
                    FontFamily: GalleryTheme.GalleryFontFamily,
                    FontSize: 14,
                    FontWeight: 650,
                    Color: primaryInk(),
                },
                Text{
                    Content: "Development workspace",
                    FontFamily: GalleryTheme.GalleryFontFamily,
                    FontSize: 12,
                    Color: secondaryInk(),
                },
                Container{FlexGrow: 1.0},
                Container{
                    Padding: Edges{Left: 10, Right: 10, Top: 5, Bottom: 5,},
                    BorderRadius: 12,
                    BackgroundColor: Color.Rgba(109, 222, 166, 22),
                    terminalLine("ready", accentInk(), true),
                },
            },
            Container{
                FlexGrow: 1.0,
                MinHeight: 0,
                FlexDirection: FlexDirection.Row,
                buildProjectRail(),
                buildTerminal(),
            },
            Container{
                Height: 34,
                Padding: Edges{Left: 18, Right: 18,},
                FlexDirection: FlexDirection.Row,
                AlignItems: AlignItems.Center,
                Gap: 14,
                BorderTopWidth: 1,
                BorderTopColor: terminalMode ? Color.Rgba(226, 238, 242, 22): Color.Rgba(31, 70, 80, 28),
                terminalLine("main", terminalMode ? Color.Rgba(157, 196, 233, 178): Color.Rgb(47, 96, 150)),
                terminalLine("Vulkan", secondaryInk()),
                Container{FlexGrow: 1.0},
                terminalLine("UTF-8", secondaryInk()),
            },
        },
    }

    public override func Build() Blob -> Container{
        Width: Percent(100),
        MaxWidth: 760,
        Gap: 18,
        AlignItems: AlignItems.Center,
        Container{
            FlexDirection: FlexDirection.Row,
            AlignItems: AlignItems.Center,
            Gap: 8,
            Padding: 4,
            BorderRadius: 23,
            BackgroundColor: Color.Rgba(240, 249, 247, 122),
            BoxShadows: []BoxShadow{
                BoxShadow{
                    OffsetX: 0.0,
                    OffsetY: 10.0,
                    Blur: 30.0,
                    Spread: -14.0,
                    Color: Color.Rgba(34, 70, 80, 58),
                    Inset: false
                },
            },
            modeButton("Liquid glass", false),
            modeButton("Terminal glass", true),
        },
        buildSurface(),
        Text{
            Content: terminalMode ? "Quiet contrast for focused work": "Responsive lensing over the scene beneath",
            FontFamily: GalleryTheme.GalleryFontFamily,
            FontSize: 12,
            FontWeight: 500,
            Color: Color.Rgba(35, 68, 77, 154),
        },
    }
}

internal class GlassMaterialRootCell : Cell {
    private let liquidEffect ShaderEffect
    private let terminalEffect ShaderEffect
    private let initialTerminal bool

    internal init(liquidEffect ShaderEffect, terminalEffect ShaderEffect, initialTerminal bool) {
        this.liquidEffect = liquidEffect
        this.terminalEffect = terminalEffect
        this.initialTerminal = initialTerminal
    }

    public override func Build() Blob -> Container{
        Width: Percent(100),
        Height: Percent(100),
        Position: PositionType.Relative,
        Padding: Edges{Left: 28, Right: 28,},
        AlignItems: AlignItems.Center,
        JustifyContent: JustifyContent.Center,
        BackgroundColor: Color.Rgb(226, 239, 235),
        Cell.Mount[GlassMaterialBackdropCell]("glass-material-backdrop"),
        Cell.Mount[GlassMaterialPanelCell](
            "glass-material-panel",
            (cell GlassMaterialPanelCell) -> {
                cell.Configure(liquidEffect, terminalEffect, initialTerminal)
            }
        ),
    }
}

public class GlassMaterialWindow {
    shared {
        private func configureLiquid(effect ShaderEffect) {
            effect.SetParameter(1, Vector4(0.5F, 0.5F, 0.0F, 0.0F))
            effect.SetParameter(2, Vector4(0.18F, 0.10F, 0.0F, 30.0F))
            effect.SetParameter(3, Vector4(0.94F, 0.97F, 1.0F, 1.0F))
            effect.SetParameter(4, Vector4(1.2F, 1.0F, 0.0F, 1.0F))
        }

        private func configureTerminal(effect ShaderEffect) {
            effect.SetParameter(1, Vector4(0.5F, 0.5F, 0.0F, 0.0F))
            effect.SetParameter(2, Vector4(0.24F, 0.58F, 0.05F, 18.0F))
            effect.SetParameter(3, Vector4(0.018F, 0.045F, 0.072F, 1.0F))
            effect.SetParameter(4, Vector4(0.34F, 1.0F, 0.0F, 1.0F))
        }

        public func CreateWindow() Window {
            let liquidProgram = ShaderEffectProgram.Load(
                Path.Combine(AppContext.BaseDirectory, "Shaders", "liquid_glass.goo-effect")
            )
            let terminalProgram = ShaderEffectProgram.Load(
                Path.Combine(AppContext.BaseDirectory, "Shaders", "terminal_glass.goo-effect")
            )
            let liquidEffect = ShaderEffect(liquidProgram, samplesBackdrop: true, backdropOutset: 24.0F)
            let terminalEffect = ShaderEffect(terminalProgram, samplesBackdrop: true, backdropOutset: 24.0F)
            configureLiquid(liquidEffect)
            configureTerminal(terminalEffect)
            let requested = Environment.GetEnvironmentVariable("GOO_GLASS_MATERIAL")
            if requested != nil && requested != "liquid" && requested != "terminal" {
                throw ArgumentException("GOO_GLASS_MATERIAL must be liquid or terminal")
            }
            let initialTerminal = requested == "terminal"
            return Window{
                Title: "Glass materials",
                Width: 1120,
                Height: 760,
                Resizable: true,
                VSync: true,
                Background: Color.Rgb(226, 239, 235),
                Root: GlassMaterialRootCell(liquidEffect, terminalEffect, initialTerminal),
            }
        }

        public func Run() {
            let window = CreateWindow()
            window.Open()
            window.Run()
        }
    }
}
