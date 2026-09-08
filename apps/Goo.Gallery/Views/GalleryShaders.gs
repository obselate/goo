package GooGallery

import System
import System.Collections.Generic
import System.Numerics
import Goo

class ShaderLabCell : Cell {
  /// Gets or sets the pre-generated mathematical vector and image assets.
  public var Assets GalleryMathAssets?
  /// Gets or sets the compiled shader program suite.
  public var Programs GalleryShaderPrograms?
  /// Gets or sets whether shader animations are currently playing.
  public var Playing bool
  /// Gets or sets whether shader cards use compact single-column sizing.
  public var Compact bool
  /// Gets or sets whether this chapter owns live shader surfaces.
  public prop Active bool{
    get -> active
    set {
      if active == value {
        return
      }
      active = value
      if active && Playing {
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
  internal prop Showcase int32{
    get -> showcase
    set {
      if showcase == value {
        return
      }
      showcase = value
      Rebuild()
    }
  }

  private let clock Anim[float64]
  private let ChromeCanvas ElementHandle
  private let RadialCanvas ElementHandle
  private let RippleCanvas ElementHandle
  private let GlassCanvas ElementHandle
  private let DitherCanvas ElementHandle
  private let CorridorCanvas ElementHandle
  private let AuroraCanvas ElementHandle
  private let SilkCanvas ElementHandle
  private let CrtCanvas ElementHandle
  private var active bool
  private let VolumeCanvas ElementHandle
  private var showcase int32
  private var baseTime float64
  private var chromeYaw float64
  private var chromePitch float64
  private var chromePointerX float64
  private var chromePointerY float64
  private var chromePointerDown bool
  private var chromePointerPressure float64
  private var radialPointerPressure float64
  private var ripplePointerPressure float64
  private var glassPointerPressure float64
  private var chromeDragging bool
  private var radialPointerX float64
  private var radialPointerY float64
  private var radialPointerDown bool
  private var ripplePointerX float64
  private var ripplePointerY float64
  private var ripplePointerDown bool
  private var glassPointerX float64
  private var glassPointerY float64
  private var glassPointerDown bool
  private var ditherPointerX float64
  private var ditherPointerY float64
  private var ditherPointerDown bool
  private var ditherDragging bool
  private var ditherYaw float64
  private var ditherPitch float64
  private var ditherShape int32
  private var ditherLevels int32
  private let rippleX[3]float64
  private let rippleY[3]float64
  private let rippleStart[3]float64
  private let rippleAmplitude[3]float64
  private var rippleCount int32
  private var roughness float64
  private var morph float64
  private var fov float64
  private var contrast float64
  private var fog float64

  public init() {
    Assets = nil
    Programs = nil
    Playing = true
    showcase = 0
    Compact = false
    active = false
    clock = Animate(0.0, updateClock)
    ChromeCanvas = ElementHandle{}
    RadialCanvas = ElementHandle{}
    RippleCanvas = ElementHandle{}
    CorridorCanvas = ElementHandle{}
    VolumeCanvas = ElementHandle{}
    GlassCanvas = ElementHandle{}
    DitherCanvas = ElementHandle{}
    AuroraCanvas = ElementHandle{}
    SilkCanvas = ElementHandle{}
    CrtCanvas = ElementHandle{}
    rippleY = [3]float64
    rippleStart = [3]float64
    rippleAmplitude = [3]float64
    baseTime = 0.0
    chromeYaw = 0.7
    chromePitch = 0.06
    chromePointerX = 0.5
    chromePointerY = 0.5
    chromePointerPressure = 0.0
    chromePointerDown = false
    chromeDragging = false
    radialPointerX = 0.5
    radialPointerY = 0.5
    radialPointerPressure = 0.0
    radialPointerDown = false
    ripplePointerX = 0.5
    ripplePointerY = 0.5
    ripplePointerPressure = 0.0
    ripplePointerDown = false
    glassPointerX = 0.5
    glassPointerY = 0.5
    glassPointerPressure = 0.0
    glassPointerDown = false
    ditherPointerX = 0.5
    ditherPointerY = 0.5
    ditherPointerDown = false
    ditherDragging = false
    ditherYaw = 0.35
    ditherPitch = 0.0
    ditherShape = 0
    ditherLevels = 4
    rippleCount = 0
    roughness = 0.25
    morph = 0.4
    fov = 1.0
    contrast = 1.0
    fog = 0.35
  }

  private func updateClock(time float64) {
    if Active {
      if let programs = Programs {
        if Showcase == 3 {
          writeFrame(programs.Lab(3), RadialCanvas, time, radialPointerX,
            radialPointerY, radialPointerPressure, radialPointerDown)
          return
        }
        if Showcase == 7 {
          writeFrame(programs.Lab(7), DitherCanvas, time, ditherPointerX,
            ditherPointerY, 0.0, ditherPointerDown)
          return
        }
      }
    }
    Rebuild()
  }

  private func frameValue() float32 -> if Playing { 1.0F } else { 0.0F }

  private func writeFrame(
    effect ShaderEffect,
    handle ElementHandle,
    time float64,
    pointerX float64,
    pointerY float64,
    pointerPressure float64,
    pointerDown bool) {
      let bounds = handle.BorderBox
      let down = if pointerDown { 1.0F } else { 0.0F }
      effect.SetParameter(0, Vector4(
        float32(time),
        960.0F,
        540.0F,
        frameValue()))
      effect.SetParameter(1, Vector4(
        float32(Math.Clamp(pointerX, 0.0, 1.0)),
        float32(Math.Clamp(pointerY, 0.0, 1.0)),
        float32(Math.Clamp(pointerPressure, 0.0, 1.0)),
        down))
    }

  private func frameChildren(name string, hint string, content Blob) Container {
    let children = List[Blob]()
    children.Add(Container{
      Key: "spec-name",
      Children: { GalleryTheme.SpecimenName(name) },
    })
    children.Add(Container{
      Key: "spec-content",
      FontFamily: GalleryTheme.ElementFontFamily,
      Children: { content },
    })
    children.Add(GalleryTheme.Hint(hint))
    let frame = GalleryTheme.Frame(children)
    return Container{
      Key: "spec-" + name,
      Width: Length.Percent(100),
      Children: { frame },
    }
  }

  private func effectsReady() bool -> Active

  private func activeEffect(effect ShaderEffect) ShaderEffect? {
    if effectsReady() {
      return effect
    }
    return nil
  }

  private func addRipple(x float64, y float64) {
    var index int32 = 2
    while index > 0 {
      rippleX[index] = rippleX[index - 1]
      rippleY[index] = rippleY[index - 1]
      rippleStart[index] = rippleStart[index - 1]
      rippleAmplitude[index] = rippleAmplitude[index - 1]
      index = index - 1
    }
    rippleX[0] = Math.Clamp(x, 0.0, 1.0)
    rippleY[0] = Math.Clamp(y, 0.0, 1.0)
    rippleStart[0] = clock.Value
    rippleAmplitude[0] = 1.0
    if rippleCount < 3 {
      rippleCount = rippleCount + 1
    }
  }

  private func buildChrome(programs GalleryShaderPrograms, time float64) Container {
    let effect = programs.Lab(1)
    writeFrame(effect, ChromeCanvas, time, chromePointerX, chromePointerY,
      chromePointerPressure, chromePointerDown)
    effect.SetParameter(2, Vector4(
      float32(chromeYaw),
      float32(chromePitch),
      float32(roughness),
      float32(morph)))
    return Container{
      Key: if effectsReady() { "chrome-live" } else { "chrome-idle" },
      Width: Length.Percent(100),
      AspectRatio: 16.0 / 9.0,
      Handle: ChromeCanvas,
      BackgroundColor: GalleryTheme.SurfaceRaised,
      ShaderEffect: activeEffect(effect),
      Focusable: true,
      OnPointerDown: func(e PointerEvent) {
        e.Capture()
        e.PreventDefault()
        chromeDragging = true
        chromePointerDown = true
        let bounds = ChromeCanvas.BorderBox
        chromePointerX = Math.Clamp(e.Position.X / Math.Max(bounds.Width, 1.0), 0.0, 1.0)
        chromePointerY = Math.Clamp(e.Position.Y / Math.Max(bounds.Height, 1.0), 0.0, 1.0)
        chromePointerPressure = e.Pressure
        Rebuild()
      },
      OnPointerMove: func(e PointerEvent) {
        let bounds = ChromeCanvas.BorderBox
        chromePointerX = Math.Clamp(e.Position.X / Math.Max(bounds.Width, 1.0), 0.0, 1.0)
        chromePointerY = Math.Clamp(e.Position.Y / Math.Max(bounds.Height, 1.0), 0.0, 1.0)
        chromePointerPressure = e.Pressure
        if chromeDragging {
          chromeYaw = chromeYaw + e.Delta.X * 0.008
          chromePitch = Math.Clamp(chromePitch + e.Delta.Y * 0.006, -1.05, 1.05)
        }
        Rebuild()
      },
      OnPointerUp: func(e PointerEvent) {
        chromeDragging = false
        chromePointerDown = false
        chromePointerPressure = 0.0
        e.ReleaseCapture()
        Rebuild()
      },
      OnPointerCancel: func(e PointerEvent) {
        chromeDragging = false
        chromePointerDown = false
        chromePointerPressure = 0.0
        e.ReleaseCapture()
        Rebuild()
      },
    }
  }

  private func buildCorridor(programs GalleryShaderPrograms, time float64) Container {
    let effect = programs.Lab(2)
    writeFrame(effect, CorridorCanvas, time, 0.5, 0.5, 0.0, false)
    effect.SetParameter(2, Vector4(0.7F, 0.5F, 0.8F, 0.0F))
    return Container{
      Key: if effectsReady() { "corridor-live" } else { "corridor-idle" },
      Width: Length.Percent(100),
      AspectRatio: 16.0 / 9.0,
      Handle: CorridorCanvas,
      BackgroundColor: GalleryTheme.SurfaceRaised,
      ShaderEffect: activeEffect(effect),
    }
  }

  private func buildRadial(programs GalleryShaderPrograms, time float64) Container {
    let effect = programs.Lab(3)
    writeFrame(effect, RadialCanvas, time, radialPointerX, radialPointerY,
      radialPointerPressure, radialPointerDown)
    effect.SetParameter(2, Vector4(0.45F, 0.9F, 2.0F, 0.0F))
    return Container{
      Key: if effectsReady() { "radial-live" } else { "radial-idle" },
      Width: Length.Percent(100),
      AspectRatio: 16.0 / 9.0,
      Handle: RadialCanvas,
      BackgroundColor: GalleryTheme.SurfaceRaised,
      ShaderEffect: activeEffect(effect),
      Focusable: true,
      OnPointerDown: func(e PointerEvent) {
        e.Capture()
        e.PreventDefault()
        radialPointerDown = true
        let bounds = RadialCanvas.BorderBox
        radialPointerX = Math.Clamp(e.Position.X / Math.Max(bounds.Width, 1.0), 0.0, 1.0)
        radialPointerY = Math.Clamp(e.Position.Y / Math.Max(bounds.Height, 1.0), 0.0, 1.0)
        radialPointerPressure = e.Pressure
        Rebuild()
      },
      OnPointerMove: func(e PointerEvent) {
        let bounds = RadialCanvas.BorderBox
        radialPointerX = Math.Clamp(e.Position.X / Math.Max(bounds.Width, 1.0), 0.0, 1.0)
        radialPointerY = Math.Clamp(e.Position.Y / Math.Max(bounds.Height, 1.0), 0.0, 1.0)
        radialPointerPressure = e.Pressure
        Rebuild()
      },
      OnPointerUp: func(e PointerEvent) {
        radialPointerDown = false
        radialPointerPressure = 0.0
        e.ReleaseCapture()
        Rebuild()
      },
      OnPointerCancel: func(e PointerEvent) {
        radialPointerDown = false
        radialPointerPressure = 0.0
        e.ReleaseCapture()
        Rebuild()
      },
    }
  }

  private func buildRipple(programs GalleryShaderPrograms, time float64) Container {
    let effect = programs.Lab(4)
    writeFrame(effect, RippleCanvas, time, ripplePointerX, ripplePointerY,
      ripplePointerPressure, ripplePointerDown)
    var index int32 = 0
    while index < 3 {
      let age = if index < rippleCount {
        Math.Max(0.0, time - rippleStart[index])
      } else {
        20.0
      }
      let amplitude = if index < rippleCount {
        rippleAmplitude[index] * Math.Exp(-age * 0.8)
      } else {
        0.0
      }
      effect.SetParameter(2 + index, Vector4(
        float32(rippleX[index]),
        float32(rippleY[index]),
        float32(age),
        float32(amplitude)))
      index = index + 1
    }
    effect.SetParameter(5, Vector4(5.0F, 2.5F, 0.0F, 0.0F))
    let layers = List[Blob]()
    if let assets = Assets {
      layers.Add(Image{
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
    layers.Add(Text{
      Key: "ripple-label",
      Content: "RIPPLE / MEMORY",
      FontSize: 22,
      FontWeight: 700,
      Color: GalleryTheme.Ink,
      Position: PositionType.Absolute,
      Left: 18,
      Top: 20,
    })
    return Container{
      Key: if effectsReady() { "ripple-live" } else { "ripple-idle" },
      Width: Length.Percent(100),
      AspectRatio: 16.0 / 9.0,
      Handle: RippleCanvas,
      Position: PositionType.Relative,
      BackgroundColor: GalleryTheme.SurfaceRaised,
      ShaderEffect: activeEffect(effect),
      Focusable: true,
      OnPointerDown: func(e PointerEvent) {
        e.Capture()
        e.PreventDefault()
        ripplePointerDown = true
        let bounds = RippleCanvas.BorderBox
        ripplePointerX = Math.Clamp(e.Position.X / Math.Max(bounds.Width, 1.0), 0.0, 1.0)
        ripplePointerY = Math.Clamp(e.Position.Y / Math.Max(bounds.Height, 1.0), 0.0, 1.0)
        ripplePointerPressure = e.Pressure
        addRipple(ripplePointerX, ripplePointerY)
        Rebuild()
      },
      OnPointerMove: func(e PointerEvent) {
        let bounds = RippleCanvas.BorderBox
        ripplePointerX = Math.Clamp(e.Position.X / Math.Max(bounds.Width, 1.0), 0.0, 1.0)
        ripplePointerY = Math.Clamp(e.Position.Y / Math.Max(bounds.Height, 1.0), 0.0, 1.0)
        ripplePointerPressure = e.Pressure
        Rebuild()
      },
      OnPointerUp: func(e PointerEvent) {
        ripplePointerDown = false
        ripplePointerPressure = 0.0
        e.ReleaseCapture()
        Rebuild()
      },
      OnPointerCancel: func(e PointerEvent) {
        ripplePointerDown = false
        ripplePointerPressure = 0.0
        e.ReleaseCapture()
        Rebuild()
      },
      Children: layers,
    }
  }

  private func buildGlass(programs GalleryShaderPrograms, time float64) Container {
    let effect = programs.Lab(5)
    writeFrame(effect, GlassCanvas, time, glassPointerX, glassPointerY,
      glassPointerPressure, glassPointerDown)
    effect.SetParameter(2, Vector4(0.72F, 0.62F, 0.32F, 14.0F))
    return Container{
      Key: if effectsReady() { "terminal-glass-live" } else { "terminal-glass-idle" },
      Width: Length.Percent(100),
      AspectRatio: 16.0 / 9.0,
      Position: PositionType.Relative,
      BackgroundColor: Color.Rgb(12, 19, 28),
      BorderRadius: 10,
      OverflowX: Overflow.Hidden,
      OverflowY: Overflow.Hidden,
      Children: {
        Container{
          Position: PositionType.Absolute,
          Right: 18,
          Top: -20,
          Width: 270,
          Height: 176,
          BorderRadius: 88,
          BackgroundColor: Color.Rgba(57, 187, 178, 214),
          Transform: PanelTransform{ Rotate: -8.0 },
        },
        Container{
          Position: PositionType.Absolute,
          Left: -18,
          Bottom: -32,
          Width: 324,
          Height: 138,
          BorderRadius: 69,
          BackgroundColor: Color.Rgba(229, 111, 63, 212),
          Transform: PanelTransform{ Rotate: 6.0 },
        },
        Container{
          Position: PositionType.Absolute,
          Left: 138,
          Top: 94,
          Width: 382,
          Height: 2,
          BackgroundColor: Color.Rgba(150, 224, 218, 74),
          Transform: PanelTransform{ Rotate: -12.0 },
        },
        Text{
          Content: "GLASS / 041",
          Position: PositionType.Absolute,
          Right: 24,
          Bottom: 20,
          FontFamily: "monospace",
          FontSize: 46,
          FontWeight: 700,
          LetterSpacing: -2,
          Color: Color.Rgba(235, 241, 245, 72),
        },
        Container{
          Position: PositionType.Absolute,
          Left: Length.Percent(7),
          Top: Length.Percent(10),
          Right: Length.Percent(7),
          Bottom: Length.Percent(10),
          Handle: GlassCanvas,
          BackgroundColor: Color.Transparent,
          BorderRadius: 14,
          OverflowX: Overflow.Hidden,
          OverflowY: Overflow.Hidden,
          Focusable: true,
          OnPointerDown: func(e PointerEvent) {
            e.Capture()
            e.PreventDefault()
            glassPointerDown = true
            let bounds = GlassCanvas.BorderBox
            glassPointerX = Math.Clamp(e.Position.X / Math.Max(bounds.Width, 1.0), 0.0, 1.0)
            glassPointerY = Math.Clamp(e.Position.Y / Math.Max(bounds.Height, 1.0), 0.0, 1.0)
            glassPointerPressure = e.Pressure
            Rebuild()
          },
          OnPointerMove: func(e PointerEvent) {
            let bounds = GlassCanvas.BorderBox
            glassPointerX = Math.Clamp(e.Position.X / Math.Max(bounds.Width, 1.0), 0.0, 1.0)
            glassPointerY = Math.Clamp(e.Position.Y / Math.Max(bounds.Height, 1.0), 0.0, 1.0)
            glassPointerPressure = e.Pressure
            Rebuild()
          },
          OnPointerUp: func(e PointerEvent) {
            glassPointerDown = false
            glassPointerPressure = 0.0
            e.ReleaseCapture()
            Rebuild()
          },
          OnPointerCancel: func(e PointerEvent) {
            glassPointerDown = false
            glassPointerPressure = 0.0
            e.ReleaseCapture()
            Rebuild()
          },
          Children: {
            Container{
              Position: PositionType.Absolute,
              Left: 0,
              Top: 0,
              Right: 0,
              Bottom: 0,
              BorderRadius: 14,
              OverflowX: Overflow.Hidden,
              OverflowY: Overflow.Hidden,
              ShaderEffect: activeEffect(effect),
            },
            Container{
              Position: PositionType.Absolute,
              Left: 0,
              Top: 0,
              Right: 0,
              Bottom: 0,
              BorderWidth: 1,
              BorderColor: Color.Rgba(226, 238, 247, 62),
              BorderRadius: 14,
              OverflowX: Overflow.Hidden,
              OverflowY: Overflow.Hidden,
              Children: {
                Container{
                  Height: 42,
                  PaddingLeft: 16,
                  PaddingRight: 16,
                  FlexDirection: FlexDirection.Row,
                  AlignItems: AlignItems.Center,
                  Gap: 8,
                  BorderBottomWidth: 1,
                  BorderBottomColor: Color.Rgba(226, 238, 247, 34),
                  Children: {
                    Container{ Width: 8, Height: 8, BorderRadius: 4, BackgroundColor: Color.Rgb(237, 111, 91) },
                    Container{ Width: 8, Height: 8, BorderRadius: 4, BackgroundColor: Color.Rgb(226, 179, 78) },
                    Container{ Width: 8, Height: 8, BorderRadius: 4, BackgroundColor: Color.Rgb(83, 190, 126) },
                    Text{
                      Content: "goo / gallery",
                      MarginLeft: 8,
                      FontFamily: "monospace",
                      FontSize: 11,
                      LetterSpacing: 0.5,
                      Color: Color.Rgba(221, 231, 238, 150),
                    },
                    Container{ FlexGrow: 1.0 },
                    Button{
                      PaddingLeft: 8,
                      PaddingRight: 8,
                      PaddingTop: 3,
                      PaddingBottom: 3,
                      BorderRadius: 4,
                      BackgroundColor: Color.Rgba(56, 189, 248, 38),
                      Hover: Style{ BackgroundColor: Color.Rgba(56, 189, 248, 80) },
                      OnClick: func() {
                        let glassWin = GlassTerminalWindow.CreateWindow()
                        glassWin.Open()
                      },
                      Children: {
                        Text{
                          Content: "LAUNCH WINDOW ↗",
                          FontFamily: "monospace",
                          FontSize: 10,
                          FontWeight: 700,
                          Color: Color.Rgb(56, 189, 248),
                        },
                      },
                    },
                    Text{
                      Content: "native effect",
                      FontFamily: "monospace",
                      FontSize: 10,
                      LetterSpacing: 0.4,
                      Color: Color.Rgba(107, 207, 184, 176),
                    },
                  },
                },
                Container{
                  PaddingLeft: 20,
                  PaddingTop: 18,
                  PaddingRight: 20,
                  FlexDirection: FlexDirection.Column,
                  Gap: 9,
                  Children: {
                    Text{
                      Content: "xaz@goo  ~/Projects/goo-gsharp",
                      FontFamily: "monospace",
                      FontSize: 12,
                      Color: Color.Rgba(168, 190, 202, 220),
                    },
                    Text{
                      Content: "$ dotnet run --project apps/Goo.Gallery",
                      FontFamily: "monospace",
                      FontSize: 13,
                      FontWeight: 600,
                      Color: Color.Rgb(232, 239, 243),
                    },
                    Text{
                      Content: "Goo Gallery  |  Vulkan 1.3  |  native effects ready",
                      FontFamily: "monospace",
                      FontSize: 12,
                      Color: Color.Rgb(107, 207, 184),
                    },
                    Text{
                      Content: "$ _",
                      FontFamily: "monospace",
                      FontSize: 13,
                      FontWeight: 600,
                      Color: Color.Rgb(232, 239, 243),
                    },
                  },
                },
              },
            },
          },
        },
      },
    }
  }

  private func buildVolume(programs GalleryShaderPrograms, time float64) Container {
    let effect = programs.Lab(6)
    writeFrame(effect, VolumeCanvas, time, 0.5, 0.5, 0.0, false)
    effect.SetParameter(2, Vector4(0.9F, 0.4F, 0.5F, 0.0F))
    return Container{
      Key: if effectsReady() { "volume-live" } else { "volume-idle" },
      Width: Length.Percent(100),
      AspectRatio: 16.0 / 9.0,
      Handle: VolumeCanvas,
      BackgroundColor: GalleryTheme.SurfaceRaised,
      ShaderEffect: activeEffect(effect),
    }
  }

  private func buildDither(programs GalleryShaderPrograms, time float64) Container {
    let effect = programs.Lab(7)
    writeFrame(effect, DitherCanvas, time, ditherPointerX, ditherPointerY,
      0.0, ditherPointerDown)
    effect.SetParameter(2, Vector4(
      float32(ditherYaw),
      float32(ditherPitch),
      float32(ditherShape),
      float32(ditherLevels)))
    return Container{
      Key: if effectsReady() { "dither-live" } else { "dither-idle" },
      Width: Length.Percent(100),
      AspectRatio: 16.0 / 9.0,
      Handle: DitherCanvas,
      Position: PositionType.Relative,
      BackgroundColor: Color.Rgb(6, 8, 13),
      ShaderEffect: activeEffect(effect),
      Focusable: true,
      OnPointerDown: func(e PointerEvent) {
        e.Capture()
        e.PreventDefault()
        ditherDragging = true
        ditherPointerDown = true
        let bounds = DitherCanvas.BorderBox
        ditherPointerX = Math.Clamp(e.Position.X / Math.Max(bounds.Width, 1.0), 0.0, 1.0)
        ditherPointerY = Math.Clamp(e.Position.Y / Math.Max(bounds.Height, 1.0), 0.0, 1.0)
        Rebuild()
      },
      OnPointerMove: func(e PointerEvent) {
        let bounds = DitherCanvas.BorderBox
        ditherPointerX = Math.Clamp(e.Position.X / Math.Max(bounds.Width, 1.0), 0.0, 1.0)
        ditherPointerY = Math.Clamp(e.Position.Y / Math.Max(bounds.Height, 1.0), 0.0, 1.0)
        if ditherDragging {
          ditherYaw = ditherYaw + e.Delta.X * 0.008
          ditherPitch = Math.Clamp(ditherPitch + e.Delta.Y * 0.006, -0.9, 0.9)
        }
        Rebuild()
      },
      OnPointerUp: func(e PointerEvent) {
        ditherDragging = false
        ditherPointerDown = false
        e.ReleaseCapture()
        Rebuild()
      },
      OnPointerCancel: func(e PointerEvent) {
        ditherDragging = false
        ditherPointerDown = false
        e.ReleaseCapture()
        Rebuild()
      },
    }
  }

  private func ditherChoice(label string, selected bool, onClick Action) Button -> Button {
    Height: 34,
    MinWidth: 72,
    FlexGrow: 1.0,
    BackgroundColor: if selected { GalleryTheme.Accent } else { GalleryTheme.SurfaceRaised },
    BorderWidth: 1,
    BorderColor: if selected { GalleryTheme.AccentStrong } else { GalleryTheme.Border },
    BorderRadius: 6,
    Cursor: Cursor.Pointer,
    Focusable: true,
    AlignItems: AlignItems.Center,
    JustifyContent: JustifyContent.Center,
    TransitionMs: 100.0,
    Hover: Style{
      BackgroundColor: if selected { GalleryTheme.Accent } else { GalleryTheme.Border },
      BorderColor: if selected { GalleryTheme.AccentStrong } else { GalleryTheme.BorderStrong },
    },
    Focus: Style{ OutlineWidth: 1, OutlineColor: GalleryTheme.AccentStrong },
    OnClick: onClick,
    Children: {
      Text{
        Content: label,
        FontSize: 12,
        FontWeight: if selected { 700 } else { 600 },
        Color: if selected { Color.Rgb(255, 255, 255) } else { GalleryTheme.InkMuted },
      },
    },
  }

  private func ditherShapeControls() Container -> Container {
    Key: "dither-shape-controls",
    MinWidth: 0,
    FlexGrow: 1.0,
    FlexDirection: FlexDirection.Column,
    Gap: 7,
    Children: {
      Text{
        Content: "SHAPE",
        FontSize: 10,
        FontWeight: 700,
        LetterSpacing: 0.8,
        Color: GalleryTheme.InkMuted,
      },
      Container{
        Width: Length.Percent(100),
        FlexDirection: FlexDirection.Row,
        Gap: 6,
        Children: {
          ditherChoice("Sphere", ditherShape == 0, func() {
            ditherShape = 0
            Rebuild()
          }),
          ditherChoice("Cube", ditherShape == 1, func() {
            ditherShape = 1
            Rebuild()
          }),
          ditherChoice("Pyramid", ditherShape == 2, func() {
            ditherShape = 2
            Rebuild()
          }),
        },
      },
    },
  }

  private func ditherLevelControls() Container -> Container {
    Key: "dither-level-controls",
    MinWidth: 0,
    FlexGrow: 1.0,
    FlexDirection: FlexDirection.Column,
    Gap: 7,
    Children: {
      Text{
        Content: "DITHER LEVEL",
        FontSize: 10,
        FontWeight: 700,
        LetterSpacing: 0.8,
        Color: GalleryTheme.InkMuted,
      },
      Container{
        Width: Length.Percent(100),
        FlexDirection: FlexDirection.Row,
        Gap: 6,
        Children: {
          ditherChoice("2", ditherLevels == 2, func() {
            ditherLevels = 2
            Rebuild()
          }),
          ditherChoice("4", ditherLevels == 4, func() {
            ditherLevels = 4
            Rebuild()
          }),
          ditherChoice("8", ditherLevels == 8, func() {
            ditherLevels = 8
            Rebuild()
          }),
        },
      },
    },
  }

  private func buildAurora(programs GalleryShaderPrograms, time float64) Container {
    let effect = programs.Lab(8)
    writeFrame(effect, AuroraCanvas, time, 0.5, 0.5, 0.0, false)
    effect.SetParameter(2, Vector4(0.56F, 0.60F, 0.58F, 0.0F))
    return Container{
      Key: if effectsReady() { "aurora-live" } else { "aurora-idle" },
      Width: Length.Percent(100),
      AspectRatio: 16.0 / 9.0,
      Handle: AuroraCanvas,
      Position: PositionType.Relative,
      BackgroundColor: Color.Rgb(3, 7, 18),
      ShaderEffect: activeEffect(effect),
      Children: {
        Text{
          Content: "NORTH / 67.8",
          Position: PositionType.Absolute,
          Left: 20,
          Top: 18,
          FontFamily: "monospace",
          FontSize: 11,
          FontWeight: 650,
          LetterSpacing: 1.0,
          Color: Color.Rgba(219, 239, 244, 182),
        },
      },
    }
  }

  private func buildMesh(programs GalleryShaderPrograms, time float64) Container {
    let effect = programs.Lab(9)
    writeFrame(effect, SilkCanvas, time, 0.5, 0.5, 0.0, false)
    effect.SetParameter(2, Vector4(0.58F, 0.78F, 0.46F, 0.0F))
    return Container{
      Key: if effectsReady() { "silk-live" } else { "silk-idle" },
      Width: Length.Percent(100),
      AspectRatio: 16.0 / 9.0,
      Handle: SilkCanvas,
      Position: PositionType.Relative,
      BackgroundColor: Color.Rgb(11, 15, 27),
      ShaderEffect: activeEffect(effect),
      Children: {
        Text{
          Content: "MESH / 09",
          Position: PositionType.Absolute,
          Right: 20,
          Bottom: 18,
          FontFamily: "monospace",
          FontSize: 11,
          FontWeight: 650,
          LetterSpacing: 1.0,
          Color: Color.Rgba(244, 239, 230, 186),
        },
      },
    }
  }

  private func buildCrt(programs GalleryShaderPrograms, time float64) Container {
    let effect = programs.Lab(10)
    writeFrame(effect, CrtCanvas, time, 0.5, 0.5, 0.0, false)
    effect.SetParameter(2, Vector4(0.32F, 0.52F, 0.28F, 0.0F))
    return Container{
      Key: if effectsReady() { "crt-live" } else { "crt-idle" },
      Width: Length.Percent(100),
      AspectRatio: 16.0 / 9.0,
      Handle: CrtCanvas,
      Position: PositionType.Relative,
      BackgroundColor: Color.Rgb(5, 13, 10),
      ShaderEffect: activeEffect(effect),
      OverflowX: Overflow.Hidden,
      OverflowY: Overflow.Hidden,
      Children: {
        Container{
          Position: PositionType.Absolute,
          Left: 26,
          Top: 24,
          Right: 26,
          Bottom: 24,
          Padding: 20,
          FlexDirection: FlexDirection.Column,
          Gap: 10,
          BorderWidth: 1,
          BorderColor: Color.Rgba(89, 222, 142, 86),
          Children: {
            Text{
              Content: "GOO SIGNAL MONITOR",
              FontFamily: "monospace",
              FontSize: 20,
              FontWeight: 700,
              LetterSpacing: 1.4,
              Color: Color.Rgb(119, 244, 169),
            },
            Text{
              Content: "> retained scene online",
              FontFamily: "monospace",
              FontSize: 13,
              Color: Color.Rgb(84, 204, 137),
            },
            Text{
              Content: "> vulkan / frame 000041",
              FontFamily: "monospace",
              FontSize: 13,
              Color: Color.Rgb(84, 204, 137),
            },
            Text{
              Content: "> _",
              FontFamily: "monospace",
              FontSize: 13,
              FontWeight: 700,
              Color: Color.Rgb(170, 255, 200),
            },
          },
        },
      },
    }
  }

  private func sliderControl(key string, label string, min float64, max float64,
    value float64, change Action[float64]) Container -> Container{
      Key: "control-" + key,
      Width: Length.Percent(100),
      Children: {
        Cell.Mount[GalleryRange](key, func(slider GalleryRange) {
          slider.Label = label
          slider.MinValue = min
          slider.MaxValue = max
          slider.Value = value
          slider.Step = 0.01
          slider.OnChange = change
        }),
      },
    }

  private func selectedSpecimen(programs GalleryShaderPrograms, time float64, out name string, out hint string) Blob {
    if Showcase == 0 {
      name = "3D World"
      hint = "W/S move; A/D strafe; drag to look; click to fire; R reload"
      var wolf Blob = Container{
        Width: Length.Percent(100),
        AspectRatio: 16.0 / 9.0,
        BackgroundColor: GalleryTheme.SurfaceRaised,
      }
      if effectsReady() {
        wolf = Cell.Mount[World3DCell]("world-3d-live", func(cell World3DCell) {
          cell.Effect = programs.Lab(0)
          cell.Fov = fov
          cell.Contrast = contrast
          cell.Fog = fog
          cell.Playing = true
        })
      }
      return wolf
    }
    if Showcase == 1 {
      name = "Chrome SDF"
      hint = "Drag to orbit the sculpture"
      return buildChrome(programs, time)
    }
    if Showcase == 2 {
      name = "Corridor"
      hint = "Ambient speed, depth, and glow"
      return buildCorridor(programs, time)
    }
    if Showcase == 3 {
      name = "Radial Light"
      hint = "Move the source with the pointer"
      return buildRadial(programs, time)
    }
    if Showcase == 4 {
      name = "Ripple"
      hint = "Click to seed a wave"
      return buildRipple(programs, time)
    }
    if Showcase == 5 {
      name = "Terminal Glass"
      hint = "Move along the optical edge"
      return buildGlass(programs, time)
    }
    if Showcase == 6 {
      name = "Volumetric"
      hint = "Watch the density field drift"
      return buildVolume(programs, time)
    }
    if Showcase == 7 {
      name = "Dither"
      hint = "Drag to orbit the selected form"
      return buildDither(programs, time)
    }
    if Showcase == 8 {
      name = "Aurora"
      hint = "Layered procedural curtains and polar light"
      return buildAurora(programs, time)
    }
    if Showcase == 9 {
      name = "Iridescent Mesh"
      hint = "A flowing spectral mesh without textures"
      return buildMesh(programs, time)
    }
    name = "CRT"
    hint = "Curvature, phosphor mask, scanlines, and bloom"
    return buildCrt(programs, time)
  }

  private func buildContent(programs GalleryShaderPrograms) Container {
    let time = if Active { clock.Value } else { baseTime }
    let controls = List[Blob]()
    if Showcase != 0 && Showcase != 7 {
      controls.Add(Container{
        Key: "lab-play",
        Width: Length.Percent(100),
        Children: {
          GalleryTheme.GhostButton(
            if Playing { "Pause ambient motion" } else { "Play ambient motion" },
            func() { TogglePlaying() }),
        },
      })
    }
    if Showcase == 1 {
      controls.Add(sliderControl("roughness", "Roughness", 0.0, 1.0, roughness, func(value float64) {
        roughness = value
        Rebuild()
      }))
      controls.Add(sliderControl("morph", "Morph", 0.0, 1.0, morph, func(value float64) {
        morph = value
        Rebuild()
      }))
    } else if Showcase == 7 {
      controls.Add(ditherShapeControls())
      controls.Add(ditherLevelControls())
    }

    var name = ""
    var hint = ""
    let specimenCanvas = selectedSpecimen(programs, time, out name, out hint)
    let controlsWidth Length = 260
    let controlsMinWidth Length = 0
    let bodyChildren = List[Blob]()
    bodyChildren.Add(Container{
      Key: "lab-specimen",
      MinWidth: 0,
      MinHeight: 0,
      FlexGrow: 1.0,
      FlexShrink: 1.0,
      AlignItems: AlignItems.Center,
      JustifyContent: JustifyContent.Center,
      Children: { specimenCanvas },
    })
    if controls.Count > 0 {
      bodyChildren.Add(Container{
        Key: "lab-controls",
        Width: if Compact || Showcase == 7 { Length.Percent(100) } else { controlsWidth },
        MinWidth: if Compact || Showcase == 7 { controlsMinWidth } else { controlsWidth },
        FlexShrink: 0.0,
        FlexDirection: if Showcase == 7 && !Compact { FlexDirection.Row } else { FlexDirection.Column },
        Gap: 12,
        Children: controls,
      })
    }

    let body = Container{
      Width: Length.Percent(100),
      FlexGrow: 1.0,
      FlexShrink: 1.0,
      MinHeight: 0,
      FlexDirection: if Compact || Showcase == 7 { FlexDirection.Column } else { FlexDirection.Row },
      Gap: 16,
      AlignItems: AlignItems.Center,
      Children: bodyChildren,
    }
    return GallerySpecimen(name, hint, body)
  }

  private func TogglePlaying() {
    if Playing {
      let pausedAt = clock.Value
      baseTime = pausedAt
      Playing = false
      clock.Set(pausedAt)
    } else {
      Playing = true
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
    return GallerySpecimen("Shader Lab", "Shader programs are loading", Container{
      Width: Length.Percent(100),
      Height: 120,
      BackgroundColor: GalleryTheme.SurfaceRaised,
    })
  }
}
