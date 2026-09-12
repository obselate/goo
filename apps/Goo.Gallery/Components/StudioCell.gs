package GooGallery

import System
import System.Collections.Generic
import System.Numerics
import Goo

class StudioCell : Cell {
  /// Gets or sets the pre-generated mathematical vector and image assets.
  public var Assets GalleryMathAssets?
  /// Gets or sets the compiled shader program suite.
  public var Programs GalleryShaderPrograms?
  /// Gets or sets whether studio cards use compact single-column sizing.
  public var Compact bool
  /// Gets or sets whether this chapter owns its live shader surface.
  public prop Active bool{
    get -> active
    set {
      if active == value {
        return
      }
      active = value
      if active && playing {
        clock.To(baseTime + 1000000000.0,
          (start float64, target float64, velocity float64) -> {
            return GalleryClockSimulation(baseTime)
          })
      } else if !active {
        baseTime = clock.Value
        clock.Set(baseTime)
      }
      Rebuild()
    }
  }

  private let clock Anim[float64]
  private let Canvas ElementHandle
  private var selected int32
  private var title string
  private var playing bool
  private var c0 float64
  private var active bool
  private var c1 float64
  private var c2 float64
  private var palette int32
  private var pointerX float64
  private var pointerY float64
  private var pointerPressure float64
  private var pointerDown bool
  private var ringX[3]float64
  private var ringY[3]float64
  private var ringStart[3]float64
  private var ringCount int32
  private var baseTime float64

  public init() {
    Assets = nil
    Programs = nil
    Compact = false
    active = false
    clock = Animate(0.0)
    Canvas = ElementHandle{}
    selected = 0
    title = "FORM / FIELD"
    playing = true
    c0 = 72.0
    c1 = 1.0
    c2 = 0.35
    palette = 0
    pointerX = 0.5
    pointerY = 0.5
    pointerPressure = 0.0
    pointerDown = false
    ringCount = 0
    baseTime = 0.0
  }
  private func effectsReady() bool -> Active

  private func activeEffect(effect ShaderEffect) ShaderEffect? {
    if effectsReady() {
      return effect
    }
    return nil
  }

  private func firstLabel() string {
    if selected == 0 {
      return "FOV"
    }
    if selected == 1 {
      return "Orbit"
    }
    if selected == 2 {
      return "Speed"
    }
    if selected == 3 {
      return "Radius"
    }
    if selected == 4 {
      return "Amplitude"
    }
    if selected == 5 {
      return "Blur"
    }
    if selected == 6 {
      return "Density"
    }
    if selected == 7 { return "Matrix" }
    if selected == 8 { return "Scale" }
    if selected == 9 { return "Folds" }
    return "Curvature"
  }

  private func secondLabel() string {
    if selected == 0 {
      return "Contrast"
    }
    if selected == 1 {
      return "Roughness"
    }
    if selected == 2 {
      return "Depth"
    }
    if selected == 3 {
      return "Intensity"
    }
    if selected == 4 {
      return "Frequency"
    }
    if selected == 5 {
      return "Tint"
    }
    if selected == 6 {
      return "Turbulence"
    }
    if selected == 7 { return "Threshold" }
    if selected == 8 { return "Intensity" }
    if selected == 9 { return "Chroma" }
    return "Scanlines"
  }

  private func thirdLabel() string {
    if selected == 0 {
      return "Fog"
    }
    if selected == 1 {
      return "Morph"
    }
    if selected == 2 {
      return "Glow"
    }
    if selected == 3 {
      return "Falloff"
    }
    if selected == 4 {
      return "Decay"
    }
    if selected == 5 {
      return "Grain"
    }
    if selected == 6 {
      return "Drift"
    }
    if selected == 7 { return "Palette" }
    if selected == 8 { return "Drift" }
    if selected == 9 { return "Motion" }
    return "Bloom"
  }

  private func firstMin() float64 {
    if selected == 0 { return 60.0 }
    if selected == 1 { return 0.0 }
    if selected == 2 { return 0.0 }
    if selected == 3 { return 0.1 }
    if selected == 4 { return 0.0 }
    if selected == 5 { return 0.0 }
    if selected == 6 { return 0.0 }
    if selected == 7 { return 0.0 }
    return 0.0
  }

  private func firstMax() float64 {
    if selected == 0 { return 100.0 }
    if selected == 1 { return 360.0 }
    if selected == 2 { return 2.0 }
    if selected == 3 { return 0.9 }
    if selected == 4 { return 1.0 }
    if selected == 5 { return 1.0 }
    if selected == 6 { return 2.0 }
    if selected == 7 { return 1.0 }
    return 1.0
  }

  private func firstStep() float64 {
    if selected == 1 || selected == 7 { return 1.0 }
    return 0.01
  }

  private func secondMin() float64 {
    if selected == 0 { return 0.5 }
    if selected == 1 { return 0.0 }
    if selected == 2 { return 0.0 }
    if selected == 3 { return 0.0 }
    if selected == 4 { return 1.0 }
    if selected == 5 { return 0.0 }
    if selected == 6 { return 0.0 }
    if selected == 7 { return 0.0 }
    return 0.0
  }

  private func secondMax() float64 {
    if selected == 0 { return 1.5 }
    if selected == 1 { return 1.0 }
    if selected == 2 { return 1.0 }
    if selected == 3 { return 2.0 }
    if selected == 4 { return 12.0 }
    if selected == 5 { return 1.0 }
    if selected == 6 { return 1.0 }
    if selected == 7 { return 1.0 }
    return 1.0
  }

  private func secondStep() float64 {
    if selected == 4 { return 0.1 }
    return 0.01
  }

  private func thirdMin() float64 {
    if selected == 0 { return 0.0 }
    if selected == 1 { return 0.0 }
    if selected == 2 { return 0.0 }
    if selected == 3 { return 0.5 }
    if selected == 4 { return 0.5 }
    if selected == 5 { return 0.0 }
    if selected == 6 { return 0.0 }
    if selected == 7 { return 0.0 }
    return 0.0
  }

  private func thirdMax() float64 {
    if selected == 0 { return 1.0 }
    if selected == 1 { return 1.0 }
    if selected == 2 { return 2.0 }
    if selected == 3 { return 4.0 }
    if selected == 4 { return 6.0 }
    if selected == 5 { return 1.0 }
    if selected == 6 { return 1.0 }
    if selected == 7 { return 1.0 }
    return 1.0
  }

  private func thirdStep() float64 {
    if selected == 7 { return 1.0 }
    return 0.01
  }

  private func resetControls(index int32) {
    if index == 0 {
      c0 = 72.0
      c1 = 1.0
      c2 = 0.35
    } else if index == 1 {
      c0 = 35.0
      c1 = 0.25
      c2 = 0.4
    } else if index == 2 {
      c0 = 0.7
      c1 = 0.5
      c2 = 0.8
    } else if index == 3 {
      c0 = 0.45
      c1 = 0.9
      c2 = 2.0
    } else if index == 4 {
      c0 = 0.35
      c1 = 5.0
      c2 = 2.5
    } else if index == 5 {
      c0 = 0.72
      c1 = 0.62
      c2 = 0.32
    } else if index == 6 {
      c0 = 0.9
      c1 = 0.4
      c2 = 0.5
    } else if index == 7 {
      c0 = 0.0
      c1 = 0.5
      c2 = 1.0
    } else if index == 8 {
      c0 = 0.56
      c1 = 0.60
      c2 = 0.58
    } else if index == 9 {
      c0 = 0.58
      c1 = 0.78
      c2 = 0.46
    } else {
      c0 = 0.32
      c1 = 0.52
      c2 = 0.28
    }
  }

  private func SelectProgram(index int32) {
    if selected == index {
      return
    }
    selected = index
    resetControls(index)
    Rebuild()
  }

  private func selector(label string, index int32) Button {
    let selectedStyle = selected == index
    let background = if selectedStyle { GalleryTheme.Ink } else { GalleryTheme.SurfaceRaised }
    let foreground = if selectedStyle { GalleryTheme.Background } else { GalleryTheme.Ink }
    return Button{
      Key: "program-" + index.ToString(),
      Padding: 9,
      BackgroundColor: background,
      BorderWidth: 1,
      BorderColor: GalleryTheme.Border,
      BorderRadius: 8,
      Focusable: true,
      TransitionMs: 100.0,
      Hover: Style{ BackgroundColor: GalleryTheme.Border },
      Focus: Style{ OutlineWidth: 1, OutlineColor: GalleryTheme.BorderStrong },
      Accessibility: Accessibility{
        Role: AccessibilityRole.Button,
        Name: label,
        Selected: selectedStyle,
      },
      OnClick: func() { SelectProgram(index) },
      Children: {
        Text{
          Content: label,
          FontSize: 12,
          FontWeight: 600,
          Color: foreground,
        },
      },
    }
  }

  private func paletteColor(index int32) Color {
    if palette == 0 {
      if index == 0 { return Color.Rgb(21, 31, 46) }
      if index == 1 { return Color.Rgb(86, 161, 188) }
      return Color.Rgb(170, 195, 208)
    }
    if palette == 1 {
      if index == 0 { return Color.Rgb(52, 27, 18) }
      if index == 1 { return Color.Rgb(213, 131, 56) }
      return Color.Rgb(245, 193, 111)
    }
    if index == 0 { return Color.Rgb(42, 14, 24) }
    if index == 1 { return Color.Rgb(235, 47, 73) }
    return Color.Rgb(255, 177, 61)
  }

  private func paletteButton(label string, index int32) Button {
    let selectedStyle = palette == index
    let background = if selectedStyle { paletteColor(1) } else { GalleryTheme.SurfaceRaised }
    let foreground = if selectedStyle { paletteColor(0) } else { GalleryTheme.Ink }
    return Button{
      Key: "palette-" + index.ToString(),
      Padding: 8,
      BackgroundColor: background,
      BorderWidth: 1,
      BorderColor: GalleryTheme.Border,
      BorderRadius: 8,
      Focusable: true,
      TransitionMs: 100.0,
      Hover: Style{ BackgroundColor: GalleryTheme.Border },
      Focus: Style{ OutlineWidth: 1, OutlineColor: GalleryTheme.BorderStrong },
      Accessibility: Accessibility{
        Role: AccessibilityRole.Radio,
        Name: label,
        Selected: selectedStyle,
      },
      OnClick: func() {
        palette = index
        Rebuild()
      },
      Children: {
        Text{
          Content: label,
          FontSize: 12,
          FontWeight: 600,
          Color: foreground,
        },
      },
    }
  }

  private func addStudioRipple(x float64, y float64) {
    var index int32 = 2
    while index > 0 {
      ringX[index] = ringX[index - 1]
      ringY[index] = ringY[index - 1]
      ringStart[index] = ringStart[index - 1]
      index = index - 1
    }
    ringX[0] = Math.Clamp(x, 0.0, 1.0)
    ringY[0] = Math.Clamp(y, 0.0, 1.0)
    ringStart[0] = clock.Value
    if ringCount < 3 {
      ringCount = ringCount + 1
    }
  }

  private func writeStudioParameters(effect ShaderEffect, time float64, bounds ElementRect) {
    let playValue = if playing { 1.0F } else { 0.0F }
    effect.SetParameter(0, Vector4(
      float32(time),
      960.0F,
      540.0F,
      playValue))
    effect.SetParameter(1, Vector4(
      float32(pointerX),
      float32(pointerY),
      float32(Math.Clamp(pointerPressure, 0.0, 1.0)),
      if pointerDown { 1.0F } else { 0.0F }))
    if selected == 0 {
      let orbitTime = time * 0.22
      let cameraX = 2.5 + Math.Cos(orbitTime) * 0.28
      let cameraY = 2.5 + Math.Sin(orbitTime) * 0.28
      effect.SetParameter(2, Vector4(
        float32(cameraX),
        float32(cameraY),
        float32(Math.Cos(orbitTime + Math.PI)),
        float32(Math.Sin(orbitTime + Math.PI))))
      effect.SetParameter(3, Vector4(
        float32(Math.Clamp(c0 / 72.0, 0.25, 1.35)),
        float32(c1),
        float32(c2),
        0.0F))
    } else if selected == 1 {
      effect.SetParameter(2, Vector4(
        float32(c0 * Math.PI / 180.0),
        float32((pointerY - 0.5) * 0.35),
        float32(c1),
        float32(c2)))
    } else if selected == 2 {
      effect.SetParameter(2, Vector4(float32(c0), float32(c1), float32(c2), 0.0F))
    } else if selected == 3 {
      effect.SetParameter(2, Vector4(float32(c0), float32(c1), float32(c2), 0.0F))
    } else if selected == 4 {
      effect.SetParameter(5, Vector4(float32(c1), float32(c2), 0.0F, 0.0F))
      var index int32 = 0
      while index < 3 {
        let age = if index < ringCount {
          Math.Max(0.0, time - ringStart[index])
        } else {
          20.0
        }
        let amplitude = if index < ringCount {
          c0
        } else {
          0.0
        }
        effect.SetParameter(2 + index, Vector4(
          float32(ringX[index]),
          float32(ringY[index]),
          float32(age),
          float32(amplitude)))
        index = index + 1
      }
    } else if selected == 5 {
      effect.SetParameter(2, Vector4(float32(c0), float32(c1), float32(c2), 14.0F))
    } else if selected == 6 {
      effect.SetParameter(2, Vector4(float32(c0), float32(c1), float32(c2), 0.0F))
    } else {
      effect.SetParameter(2, Vector4(float32(c0), float32(c1), float32(c2), 0.0F))
    }
  }

  private func compositionCanvas(programs GalleryShaderPrograms, time float64) Container {
    let effect = programs.Studio(selected)
    let bounds = Canvas.BorderBox
    writeStudioParameters(effect, time, bounds)
    let background = paletteColor(0)
    let accent = paletteColor(1)
    let highlight = paletteColor(2)
    let content = List[Blob]()
    if selected == 4 {
      if let assets = Assets {
        content.Add(Image{
          Key: "source",
          Position: PositionType.Absolute,
          Left: 0,
          Top: 0,
          Width: Length.Percent(100),
          Height: Length.Percent(100),
          Source: assets.Mandelbrot,
          Fit: ImageFit.Fill,
        })
      }
    }
    content.Add(Text{
      Key: "title",
      Content: title,
      Position: PositionType.Absolute,
      Left: 30,
      Top: 28,
      FontSize: 48,
      FontWeight: 700,
      LetterSpacing: -1,
      Color: highlight,
    })
    content.Add(Text{
      Key: "program",
      Content: "Goo / " + (selected + 1).ToString("D2"),
      Position: PositionType.Absolute,
      Left: 34,
      Top: 92,
      FontSize: 13,
      FontWeight: 600,
      Color: accent,
    })
    content.Add(Container{
      Key: "accent-block",
      Position: PositionType.Absolute,
      Left: 32,
      Top: 134,
      Width: 120,
      Height: 72,
      BackgroundColor: accent,
    })
    content.Add(Container{
      Key: "highlight-bar",
      Position: PositionType.Absolute,
      Left: 174,
      Top: 134,
      Width: 224,
      Height: 24,
      BackgroundColor: highlight,
    })
    content.Add(Container{
      Key: "accent-bar",
      Position: PositionType.Absolute,
      Left: 174,
      Top: 174,
      Width: 164,
      Height: 32,
      BackgroundColor: accent,
    })
    content.Add(Container{
      Key: "swatch",
      Position: PositionType.Absolute,
      Right: 30,
      Bottom: 30,
      Width: 124,
      Height: 64,
      BorderWidth: 1,
      BorderColor: highlight,
      BackgroundColor: background,
    })
    return Container{
      Key: if effectsReady() { "studio-live" } else { "studio-idle" },
      Width: Length.Percent(100),
      AspectRatio: 16.0 / 9.0,
      Handle: Canvas,
      Position: PositionType.Relative,
      BackgroundColor: background,
      ShaderEffect: activeEffect(effect),
      Focusable: true,
      OnPointerDown: func(e PointerEvent) {
        e.Capture()
        e.PreventDefault()
        pointerDown = true
        let bounds = Canvas.BorderBox
        pointerX = Math.Clamp(e.Position.X / Math.Max(bounds.Width, 1.0), 0.0, 1.0)
        pointerY = Math.Clamp(e.Position.Y / Math.Max(bounds.Height, 1.0), 0.0, 1.0)
        pointerPressure = e.Pressure
        if selected == 4 {
          addStudioRipple(pointerX, pointerY)
        }
        Rebuild()
      },
      OnPointerMove: func(e PointerEvent) {
        let bounds = Canvas.BorderBox
        pointerX = Math.Clamp(e.Position.X / Math.Max(bounds.Width, 1.0), 0.0, 1.0)
        pointerY = Math.Clamp(e.Position.Y / Math.Max(bounds.Height, 1.0), 0.0, 1.0)
        pointerPressure = e.Pressure
        Rebuild()
      },
      OnPointerUp: func(e PointerEvent) {
        pointerDown = false
        pointerPressure = 0.0
        e.ReleaseCapture()
        Rebuild()
      },
      OnPointerCancel: func(e PointerEvent) {
        pointerDown = false
        pointerPressure = 0.0
        e.ReleaseCapture()
        Rebuild()
      },
      Children: content,
    }
  }

  private func buildContent(programs GalleryShaderPrograms) Container {
    let selectors = List[Blob]()
    selectors.Add(selector("3D World", 0))
    selectors.Add(selector("Chrome", 1))
    selectors.Add(selector("Corridor", 2))
    selectors.Add(selector("Radial", 3))
    selectors.Add(selector("Ripple", 4))
    selectors.Add(selector("Terminal", 5))
    selectors.Add(selector("Volumetric", 6))
    selectors.Add(selector("Dither", 7))
    selectors.Add(selector("Aurora", 8))
    selectors.Add(selector("Mesh", 9))
    selectors.Add(selector("CRT", 10))

    let palettes = List[Blob]()
    palettes.Add(paletteButton("Mineral", 0))
    palettes.Add(paletteButton("Ember", 1))
    palettes.Add(paletteButton("Signal", 2))

    let controls = List[Blob]()
    controls.Add(Container{
      Key: "studio-c0",
      Width: if Compact { Length.Percent(100) } else { Length.Percent(48) },
      FlexGrow: 0.0,
      FlexShrink: 1.0,
      Children: {
        Cell.Mount[GalleryRange]("studio-c0", func(slider GalleryRange) {
          slider.Label = firstLabel()
          slider.MinValue = firstMin()
          slider.MaxValue = firstMax()
          slider.Value = c0
          slider.Step = firstStep()
          slider.OnChange = func(value float64) {
            c0 = value
            Rebuild()
          }
        }),
      },
    })
    controls.Add(Container{
      Key: "studio-c1",
      Width: if Compact { Length.Percent(100) } else { Length.Percent(48) },
      FlexGrow: 0.0,
      FlexShrink: 1.0,
      Children: {
        Cell.Mount[GalleryRange]("studio-c1", func(slider GalleryRange) {
          slider.Label = secondLabel()
          slider.MinValue = secondMin()
          slider.MaxValue = secondMax()
          slider.Value = c1
          slider.Step = secondStep()
          slider.OnChange = func(value float64) {
            c1 = value
            Rebuild()
          }
        }),
      },
    })
    controls.Add(Container{
      Key: "studio-c2",
      Width: if Compact { Length.Percent(100) } else { Length.Percent(48) },
      FlexGrow: 0.0,
      FlexShrink: 1.0,
      Children: {
        Cell.Mount[GalleryRange]("studio-c2", func(slider GalleryRange) {
          slider.Label = thirdLabel()
          slider.MinValue = thirdMin()
          slider.MaxValue = thirdMax()
          slider.Value = c2
          slider.Step = thirdStep()
          slider.OnChange = func(value float64) {
            c2 = value
            Rebuild()
          }
        }),
      },
    })

    let time = if Active { clock.Value } else { baseTime }
    let panelWidth Length = 380
    let panelMinWidth Length = 0
    let body = Container{
      Width: Length.Percent(100),
      FlexGrow: 1.0,
      FlexShrink: 1.0,
      MinHeight: 0,
      FlexDirection: if Compact { FlexDirection.Column } else { FlexDirection.Row },
      Gap: 18,
      AlignItems: AlignItems.Center,
      Children: {
        Container{
          Key: "studio-panel",
          Width: if Compact { Length.Percent(100) } else { panelWidth },
          MinWidth: if Compact { panelMinWidth } else { panelWidth },
          FlexShrink: 0.0,
          FlexDirection: FlexDirection.Column,
          Gap: 14,
          Children: {
            Container{
              Key: "studio-selectors",
              FlexDirection: FlexDirection.Row,
              FlexWrap: FlexWrap.Wrap,
              Gap: 8,
              Children: selectors,
            },
            Container{
              Key: "studio-editor",
              FlexDirection: FlexDirection.Column,
              Gap: 10,
              Children: {
                TextEntry{
                  Key: "title",
                  Value: title,
                  Width: Length.Percent(100),
                  Placeholder: "Title",
                  Height: 38,
                  PaddingLeft: 10,
                  PaddingRight: 10,
                  Color: GalleryTheme.Ink,
                  FontSize: 13,
                  BackgroundColor: GalleryTheme.SurfaceRaised,
                  BorderRadius: 8,
                  BorderWidth: 1,
                  BorderColor: GalleryTheme.Border,
                  SelectionColor: GalleryTheme.BorderStrong,
                  Focus: Style{
                    OutlineWidth: 1,
                    OutlineColor: GalleryTheme.BorderStrong,
                  },
                  OnChange: func(value string) {
                    title = value
                    Rebuild()
                  },
                },
                Container{
                  Key: "studio-play",
                  Children: {
                    GalleryTheme.GhostButton(
                      if playing { "Pause" } else { "Play" },
                      func() { TogglePlaying() }),
                  },
                },
                Container{
                  Key: "studio-palettes",
                  FlexDirection: FlexDirection.Row,
                  Gap: 8,
                  Children: palettes,
                },
              },
            },
            Container{
              Key: "studio-controls",
              FlexDirection: FlexDirection.Row,
              FlexWrap: FlexWrap.Wrap,
              Gap: 14,
              Children: controls,
            },
          },
        },
        Container{
          Key: "studio-composition",
          MinWidth: 0,
          MinHeight: 0,
          FlexGrow: 1.0,
          FlexShrink: 1.0,
          AlignItems: AlignItems.Center,
          JustifyContent: JustifyContent.Center,
          Children: { compositionCanvas(programs, time) },
        },
      },
    }
    return GallerySpecimen(
      "Final Synthesis",
      "The selected program runs over this retained source with dynamic palette mapping and pointer modulation.",
      body)
  }

  private func TogglePlaying() {
    if playing {
      let pausedAt = clock.Value
      baseTime = pausedAt
      playing = false
      clock.Set(pausedAt)
    } else {
      playing = true
      if Active {
        clock.To(baseTime + 1000000000.0,
          (start float64, target float64, velocity float64) -> {
            return GalleryClockSimulation(baseTime)
          })
      }
    }
    Rebuild()
  }

  override func Build() Blob {
    if let programs = Programs {
      return buildContent(programs)
    }
    return GallerySpecimen("Final Synthesis", "Shader programs are loading", Container{
      Width: Length.Percent(100),
      Height: 120,
      BackgroundColor: GalleryTheme.SurfaceRaised,
    })
  }
}
