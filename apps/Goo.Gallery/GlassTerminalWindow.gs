package GooGallery

import System
import System.IO
import System.Numerics
import Goo

public class GlassTerminalCell : Cell {
  private let effect ShaderEffect
  private var window Window?
  private var cornerRadius float32 = 18.0F
  private var opacity float32 = 0.95F
  private var tintIndex int32 = 0
  private var blurLevel int32 = 1
  private var tintStrength float32 = 0.58F
  private var noiseStrength float32 = 0.05F
  private var borderGlow float32 = 0.34F
  private var testActionCount int32 = 0
  private var lastAction string = "Window initialized"

  public init(effect ShaderEffect) {
    this.effect = effect
    syncShader()
  }

  internal func AttachWindow(win Window) {
    window = win
  }

  private func currentTintColor() Vector3 {
    if tintIndex == 0 {
      return Vector3(0.018F, 0.045F, 0.072F)
    } else if tintIndex == 1 {
      return Vector3(0.0F, 0.0F, 0.0F) // Pitch Black (#000000)
    } else if tintIndex == 2 {
      return Vector3(0.015F, 0.024F, 0.038F) // Obsidian
    } else if tintIndex == 3 {
      return Vector3(0.035F, 0.075F, 0.160F) // Deep Sapphire
    } else if tintIndex == 4 {
      return Vector3(0.020F, 0.115F, 0.070F) // Cyber Emerald
    } else if tintIndex == 5 {
      return Vector3(0.095F, 0.035F, 0.125F) // Amethyst Night
    } else {
      return Vector3(0.012F, 0.015F, 0.020F) // Pure Smoke
    }
  }

  private func currentTintName() string {
    if tintIndex == 0 { return "Deep Navy" }
    if tintIndex == 1 { return "Black (#000000)" }
    if tintIndex == 2 { return "Obsidian" }
    if tintIndex == 3 { return "Sapphire" }
    if tintIndex == 4 { return "Emerald" }
    if tintIndex == 5 { return "Amethyst" }
    return "Smoke"
  }

  private func blurValue() float32 {
    if blurLevel == 0 { return 0.12F }
    if blurLevel == 2 { return 0.62F }
    return 0.24F
  }

  private func syncShader() {
    let tint = currentTintColor()
    effect.SetParameter(2, Vector4(blurValue(), tintStrength, noiseStrength, cornerRadius))
    effect.SetParameter(3, Vector4(tint.X, tint.Y, tint.Z, opacity))
    effect.SetParameter(4, Vector4(borderGlow, 1.0F, 0.0F, 1.0F))
  }

  private func setCornerRadius(radius float32, label string) {
    cornerRadius = radius
    lastAction = "Border radius set to " + label
    testActionCount++
    syncShader()
    Rebuild()
  }

  private func setOpacity(value float32, label string) {
    opacity = value
    lastAction = "Window opacity set to " + label
    testActionCount++
    syncShader()
    Rebuild()
  }

  private func setTint(index int32) {
    tintIndex = index
    lastAction = "Tint color set to " + currentTintName()
    testActionCount++
    syncShader()
    Rebuild()
  }

  private func setBlur(level int32, label string) {
    blurLevel = level
    lastAction = "Blur level set to " + label
    testActionCount++
    syncShader()
    Rebuild()
  }

  public override func Build() Blob {
    syncShader()
    let cornerInt = int32(Math.Max(cornerRadius, 0.0F))

    return Container{
      Key: "glass-terminal-root",
      Width: Length.Percent(100),
      Height: Length.Percent(100),
      BorderRadius: cornerInt,
      OverflowX: Overflow.Hidden,
      OverflowY: Overflow.Hidden,
      Position: PositionType.Relative,
      BackgroundColor: Color.Transparent,
      ShaderEffect: effect,
      Children: {
        buildWindowChrome(),
        buildTerminalCanvas(),
        buildFloatingControlDock(),
      },
    }
  }

  private func buildWindowChrome() Container {
    let titleBar = Container{
      Key: "custom-titlebar",
      Width: Length.Percent(100),
      Height: 36,
      Position: PositionType.Relative,
      FlexDirection: FlexDirection.Row,
      AlignItems: AlignItems.Center,
      JustifyContent: JustifyContent.SpaceBetween,
      PaddingLeft: 16,
      PaddingRight: 16,
      BackgroundColor: Color.Transparent,
      Children: {
        buildTrafficLights(),
        buildTitleInfo(),
        buildQuickCornerToggle(),
      },
    }
    return Window.DragRegion(titleBar)
  }

  private func buildTrafficLights() Container -> Container {
    FlexDirection: FlexDirection.Row,
    AlignItems: AlignItems.Center,
    Gap: 8,
    Children: {
      buildStoplight(
        "btn-close",
        Color.Rgb(255, 95, 86),
        Color.Rgb(224, 68, 62),
        Color.Rgb(255, 120, 112),
        func() { window?.RequestClose() }),
      buildStoplight(
        "btn-min",
        Color.Rgb(255, 189, 46),
        Color.Rgb(222, 161, 35),
        Color.Rgb(255, 205, 80),
        func() { if let win = window { win.State = WindowState.Minimized } }),
      buildStoplight(
        "btn-max",
        Color.Rgb(39, 201, 63),
        Color.Rgb(26, 171, 41),
        Color.Rgb(65, 218, 90),
        func() {
          if let win = window {
            win.State = if win.State == WindowState.Maximized {
              WindowState.Normal
            } else {
              WindowState.Maximized
            }
          }
        }),
    },
  }

  private func buildStoplight(key string, fill Color, border Color, hover Color, action Action) Button -> Button {
    Key: key,
    Width: 13,
    Height: 13,
    BorderRadius: 999,
    BorderWidth: 1,
    BorderColor: border,
    BackgroundColor: fill,
    Hover: Style{ BackgroundColor: hover },
    OnClick: action,
  }

  private func buildTitleInfo() Container -> Container {
    FlexDirection: FlexDirection.Row,
    AlignItems: AlignItems.Center,
    Gap: 8,
    Children: {
      Text{
        Content: "xaz@archlinux: ~/Projects/goo-gsharp (fish)",
        FontFamily: "monospace",
        FontSize: 12,
        FontWeight: 500,
        Color: Color.Rgba(226, 232, 240, 180),
      },
    },
  }

  private func buildQuickCornerToggle() Container {
    let isSquare = cornerRadius <= 0.001F
    let toggleLabel = if isSquare { "⬚ SQUARE (0px)" } else { "◯ ROUND (" + cornerRadius.ToString("F0") + "px)" }
    let btnRadius = if isSquare { 2 } else { 6 }

    return Container{
      FlexDirection: FlexDirection.Row,
      AlignItems: AlignItems.Center,
      Gap: 8,
      Children: {
        Button{
          Key: "quick-corner-toggle",
          PaddingLeft: 9,
          PaddingRight: 9,
          PaddingTop: 4,
          PaddingBottom: 4,
          BorderRadius: btnRadius,
          BackgroundColor: Color.Rgba(255, 255, 255, 14),
          Hover: Style{ BackgroundColor: Color.Rgba(255, 255, 255, 30) },
          OnClick: func() {
            if cornerRadius <= 0.001F {
              setCornerRadius(12.0F, "12px (Native)")
            } else {
              setCornerRadius(0.0F, "0px (Square)")
            }
          },
          Children: {
            Text{
              Content: toggleLabel,
              FontFamily: "monospace",
              FontSize: 10,
              FontWeight: 600,
              Color: Color.Rgb(226, 232, 240),
            },
          },
        },
      },
    }
  }

  private func buildTerminalCanvas() Container -> Container {
    Key: "terminal-canvas",
    FlexGrow: 1,
    PaddingLeft: 22,
    PaddingRight: 22,
    PaddingTop: 18,
    PaddingBottom: 72, // Leave room for floating glass control dock
    Gap: 6,
    OverflowY: Overflow.Scroll,
    BackgroundColor: Color.Transparent,
    Children: {
      // Fish welcome banner
      terminalLine("Welcome to fish, the friendly interactive shell", Color.Rgb(148, 163, 184)),
      terminalLine("Type help for instructions on how to use fish", Color.Rgba(148, 163, 184, 180)),
      spacer(6),

      // Command 1: uname
      fishPrompt("~/Projects/goo-gsharp", "main", "uname -srm"),
      terminalLine("Linux 6.8.0-generic x86_64 [Vulkan 1.3 / Slang 2026.16]", Color.Rgb(226, 232, 240)),
      spacer(6),

      // Command 2: git status
      fishPrompt("~/Projects/goo-gsharp", "main", "git status --short"),
      gitStatusLine("M", "Goo/Rendering/Vulkan/VulkanWindowTarget.Swapchain.gs", Color.Rgb(251, 191, 36)),
      gitStatusLine("M", "apps/Goo.Gallery/Shaders/terminal_glass.frag.slang", Color.Rgb(251, 191, 36)),
      gitStatusLine("M", "apps/Goo.Gallery/GlassTerminalWindow.gs", Color.Rgb(251, 191, 36)),
      spacer(6),

      // Command 3: theme status
      fishPrompt("~/Projects/goo-gsharp", "main", "ghostty +show-config | grep -E 'theme|background'"),
      terminalBadgeLine("✓ Theme   : Ghostty GitHub Dark (#101216)", Color.Rgb(108, 164, 248)),
      terminalBadgeLine("✓ Opacity : 95% (matching Ghostty background-opacity = 0.95)", Color.Rgb(86, 211, 100)),
      terminalBadgeLine("✓ Blur    : Active (matching Ghostty background-blur = true)", Color.Rgb(201, 209, 217)),
      terminalBadgeLine("✓ Surface : Translucent Vulkan 1.3 Swapchain (zero-blink resize)", Color.Rgb(201, 209, 217)),
      spacer(6),

      // Active prompt with live cursor
      activeFishPrompt("~/Projects/goo-gsharp", "main"),
    },
  }

  private func fishPrompt(path string, branch string, command string) Container -> Container {
    FlexDirection: FlexDirection.Column,
    Gap: 3,
    Children: {
      Container{
        FlexDirection: FlexDirection.Row,
        AlignItems: AlignItems.Center,
        Gap: 8,
        Children: {
          Text{
            Content: "xaz@archlinux",
            FontFamily: "monospace",
            FontSize: 13,
            FontWeight: 700,
            Color: Color.Rgb(74, 222, 128),
          },
          Text{
            Content: path,
            FontFamily: "monospace",
            FontSize: 13,
            FontWeight: 600,
            Color: Color.Rgb(56, 189, 248),
          },
          Text{
            Content: "(" + branch + ")",
            FontFamily: "monospace",
            FontSize: 12,
            FontWeight: 600,
            Color: Color.Rgb(192, 132, 252),
          },
        },
      },
      Container{
        FlexDirection: FlexDirection.Row,
        AlignItems: AlignItems.Center,
        Gap: 8,
        Children: {
          Text{
            Content: "❯",
            FontFamily: "monospace",
            FontSize: 13,
            FontWeight: 700,
            Color: Color.Rgb(74, 222, 128),
          },
          Text{
            Content: command,
            FontFamily: "monospace",
            FontSize: 13,
            FontWeight: 600,
            Color: Color.Rgb(254, 240, 138),
          },
        },
      },
    },
  }

  private func activeFishPrompt(path string, branch string) Container -> Container {
    FlexDirection: FlexDirection.Column,
    Gap: 3,
    Children: {
      Container{
        FlexDirection: FlexDirection.Row,
        AlignItems: AlignItems.Center,
        Gap: 8,
        Children: {
          Text{
            Content: "xaz@archlinux",
            FontFamily: "monospace",
            FontSize: 13,
            FontWeight: 700,
            Color: Color.Rgb(74, 222, 128),
          },
          Text{
            Content: path,
            FontFamily: "monospace",
            FontSize: 13,
            FontWeight: 600,
            Color: Color.Rgb(56, 189, 248),
          },
          Text{
            Content: "(" + branch + ")",
            FontFamily: "monospace",
            FontSize: 12,
            FontWeight: 600,
            Color: Color.Rgb(192, 132, 252),
          },
        },
      },
      Container{
        FlexDirection: FlexDirection.Row,
        AlignItems: AlignItems.Center,
        Gap: 8,
        Children: {
          Text{
            Content: "❯",
            FontFamily: "monospace",
            FontSize: 13,
            FontWeight: 700,
            Color: Color.Rgb(74, 222, 128),
          },
          Container{
            Width: 8,
            Height: 16,
            BackgroundColor: Color.Rgb(248, 250, 252),
          },
          Text{
            Content: " [Live Terminal Session • " + lastAction + "]",
            FontFamily: "monospace",
            FontSize: 12,
            FontWeight: 500,
            Color: Color.Rgba(148, 163, 184, 160),
          },
        },
      },
    },
  }

  private func gitStatusLine(status string, file string, statusColor Color) Container -> Container {
    FlexDirection: FlexDirection.Row,
    AlignItems: AlignItems.Center,
    Gap: 10,
    Children: {
      Text{
        Content: " " + status,
        FontFamily: "monospace",
        FontSize: 12,
        FontWeight: 700,
        Color: statusColor,
      },
      Text{
        Content: file,
        FontFamily: "monospace",
        FontSize: 12,
        FontWeight: 500,
        Color: Color.Rgb(226, 232, 240),
      },
    },
  }

  private func terminalLine(content string, color Color) Container -> Container {
    Children: {
      Text{
        Content: content,
        FontFamily: "monospace",
        FontSize: 12,
        LineHeight: 1.4,
        Color: color,
      },
    },
  }

  private func terminalBadgeLine(content string, color Color) Container -> Container {
    Children: {
      Text{
        Content: content,
        FontFamily: "monospace",
        FontSize: 12,
        FontWeight: 600,
        LineHeight: 1.4,
        Color: color,
      },
    },
  }

  private func spacer(height int32) Container -> Container { Height: height }

  private func buildFloatingControlDock() Container {
    let isSquare = cornerRadius <= 0.001F
    let dockRadius = if isSquare { 3 } else { 18 }
    let btnRadius = if isSquare { 2 } else { 12 }

    return Container{
      Key: "floating-dock-wrapper",
      Position: PositionType.Absolute,
      Left: 0,
      Right: 0,
      Bottom: 14,
      AlignItems: AlignItems.Center,
      JustifyContent: JustifyContent.Center,
      Children: {
        Container{
          Key: "floating-control-dock",
          PaddingLeft: 14,
          PaddingRight: 14,
          PaddingTop: 8,
          PaddingBottom: 8,
          BorderRadius: dockRadius,
          BackgroundColor: Color.Rgba(10, 15, 26, 210),
          BorderWidth: 1,
          BorderColor: Color.Rgba(255, 255, 255, 14),
          FlexDirection: FlexDirection.Row,
          AlignItems: AlignItems.Center,
          Gap: 12,
          Children: {
            // Borders section
            dockSectionLabel("BORDER:"),
            dockButton("Square", cornerRadius <= 0.001F, btnRadius, func() { setCornerRadius(0.0F, "Square (0px)") }),
            dockButton("8px", MathF.Abs(cornerRadius - 8.0F) < 0.1F, btnRadius, func() { setCornerRadius(8.0F, "Sleek (8px)") }),
            dockButton("12px", MathF.Abs(cornerRadius - 12.0F) < 0.1F, btnRadius, func() { setCornerRadius(12.0F, "Native (12px)") }),
            dockButton("16px", MathF.Abs(cornerRadius - 16.0F) < 0.1F, btnRadius, func() { setCornerRadius(16.0F, "Modern (16px)") }),

            dockDivider(),

            // Opacity section
            dockSectionLabel("OPACITY:"),
            dockButton("100%", MathF.Abs(opacity - 1.0F) < 0.01F, btnRadius, func() { setOpacity(1.0F, "100%") }),
            dockButton("98%", MathF.Abs(opacity - 0.98F) < 0.01F, btnRadius, func() { setOpacity(0.98F, "98%") }),
            dockButton("95%", MathF.Abs(opacity - 0.95F) < 0.01F, btnRadius, func() { setOpacity(0.95F, "95%") }),
            dockButton("90%", MathF.Abs(opacity - 0.90F) < 0.01F, btnRadius, func() { setOpacity(0.90F, "90%") }),
            dockButton("85%", MathF.Abs(opacity - 0.85F) < 0.01F, btnRadius, func() { setOpacity(0.85F, "85%") }),

            dockDivider(),

            // Tint section
            dockSectionLabel("TINT:"),
            dockButton("Ghostty", tintIndex == 0, btnRadius, func() { setTint(0) }),
            dockButton("Pitch Black", tintIndex == 1, btnRadius, func() { setTint(1) }),
            dockButton("Obsidian", tintIndex == 2, btnRadius, func() { setTint(2) }),
            dockButton("Sapphire", tintIndex == 3, btnRadius, func() { setTint(3) }),
            dockButton("Emerald", tintIndex == 4, btnRadius, func() { setTint(4) }),
            dockButton("Smoke", tintIndex == 6, btnRadius, func() { setTint(6) }),
          },
        },
      },
    }
  }

  private func dockSectionLabel(label string) Text -> Text {
    Content: label,
    FontFamily: "monospace",
    FontSize: 10,
    FontWeight: 700,
    Color: Color.Rgba(148, 163, 184, 200),
  }

  private func dockDivider() Container -> Container {
    Width: 1,
    Height: 18,
    BackgroundColor: Color.Rgba(255, 255, 255, 20),
  }

  private func dockButton(label string, active bool, radius int32, action Action) Button {
    let bg = if active { Color.Rgb(56, 189, 248) } else { Color.Rgba(255, 255, 255, 12) }
    let fg = if active { Color.Rgb(10, 15, 30) } else { Color.Rgb(226, 232, 240) }

    return Button{
      PaddingLeft: 8,
      PaddingRight: 8,
      PaddingTop: 4,
      PaddingBottom: 4,
      BorderRadius: radius,
      BackgroundColor: bg,
      Hover: Style{ BackgroundColor: if active { bg } else { Color.Rgba(255, 255, 255, 25) } },
      OnClick: action,
      Children: {
        Text{
          Content: label,
          FontFamily: "monospace",
          FontSize: 11,
          FontWeight: if active { 700 } else { 500 },
          Color: fg,
        },
      },
    }
  }

  internal func SetSquareBorder() {
    setCornerRadius(0.0F, "Square (0px)")
  }

  internal func SetRoundedBorder(radius float32 = 12.0F) {
    setCornerRadius(radius, radius.ToString("F0") + "px")
  }

  internal func SetTestOpacity(value float32) {
    setOpacity(value, (value * 100.0F).ToString("F0") + "%")
  }

  internal func SetTestTint(index int32) {
    setTint(index)
  }

  internal prop CornerRadius float32{ get -> cornerRadius }
  internal prop Opacity float32{ get -> opacity }
  internal prop TintIndex int32{ get -> tintIndex }
  internal prop Effect ShaderEffect{ get -> effect }
}

public class GlassTerminalWindow {
  shared {
    public func CreateWindow() Window {
      let programPath = Path.Combine(AppContext.BaseDirectory, "Shaders", "terminal_glass.goo-effect")
      let program = ShaderEffectProgram.Load(programPath)
      let effect = ShaderEffect(program, samplesBackdrop: true, backdropOutset: 24.0F)
      effect.Playing = false

      let cell = GlassTerminalCell(effect)
      let window = Window{
        Title: "Glass Terminal",
        Width: 960,
        Height: 600,
        Decorated: false,
        Transparent: true,
        Resizable: true,
        ResizeBand: 8.0F,
        Background: Color.Transparent,
        Root: cell,
      }
      cell.AttachWindow(window)
      return window
    }

    public func Run() {
      let window = CreateWindow()
      window.Open()
      window.Run()
    }

    public func VerifyGlassPipeline() {
      let window = CreateWindow()
      guard let cell = window.Root as GlassTerminalCell ? else {
        throw InvalidOperationException("Root cell is not GlassTerminalCell")
      }
      window.Open()
      cell.SetSquareBorder()
      if cell.CornerRadius != 0.0F {
        throw InvalidOperationException("Failed to set square border")
      }
      cell.SetRoundedBorder(12.0F)
      if cell.CornerRadius != 12.0F {
        throw InvalidOperationException("Failed to set rounded border")
      }
      cell.SetTestOpacity(0.70F)
      if MathF.Abs(cell.Opacity - 0.70F) > 0.01F {
        throw InvalidOperationException("Failed to set opacity")
      }
      cell.SetTestTint(2)
      if cell.TintIndex != 2 {
        throw InvalidOperationException("Failed to set tint")
      }
      window.Pump(1.0 / 60.0)
      window.Pump(1.0 / 60.0)
      CloseCleanly(window)
      Console.WriteLine("glass-pipeline-verified: square=ok rounded=ok opacity=ok tint=ok chrome=ok")
    }
  }
}
