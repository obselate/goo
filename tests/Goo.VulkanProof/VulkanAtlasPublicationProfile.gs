package Goo.VulkanProof

import Goo
import System
import System.IO
import System.Numerics

internal sealed class VulkanAtlasPublicationCell : Cell {
  shared {
    private let sizes []float64 = []float64{11, 12, 13, 14, 16, 18, 22, 28}
    private let fractions []TextStyleRange = []TextStyleRange{
      TextStyleRange(TextRange(3, 6), Style{Color: Color.Rgb(64, 224, 128)}),
    }
  }

  private let effect ShaderEffect
  private let values []string = [40]string

  internal init(background ShaderEffect) {
    effect = background
    Change(0)
  }

  internal func Change(frame int32) {
    for index in 0 ... values.Length {
      let digits = ((49850 + frame * 31 + index * 127) % 1000000).ToString("000000")
      values[index] = digits.Substring(0, 3) + "." + digits.Substring(3) + " K"
    }
    effect.ElapsedSeconds = float64(frame) / 60.0
    Rebuild()
  }

  override func Build() Blob {
    let root = Container{Width: 1280, Height: 800, BackgroundColor: Color.Black}
    root.Add(Container{Position: PositionType.Absolute, Left: 0, Top: 0,
      Width: 1280, Height: 800, ShaderEffect: effect})
    for panelIndex in 0 ... 8 {
      let panel = Container{
        Position: PositionType.Absolute,
        Left: 16 + (panelIndex % 4) * 312,
        Top: 16 + (panelIndex / 4) * 384,
        Width: 296,
        Height: 368,
        BackgroundColor: Color.Rgba(12, 20, 32, 184),
        BackdropBlur: 14,
        BorderRadius: 12,
      }
      panel.Add(Text{Position: PositionType.Absolute, Left: 16, Top: 12,
        Content: "Sync height / balance / rate", FontSize: 14, Color: Color.White})
      for row in 0 ... 5 {
        let index = panelIndex * 5 + row
        panel.Add(Text{Position: PositionType.Absolute, Left: 16, Top: 44 + row * 56,
          Content: "STATUS / VALUE / CONFIRMATIONS", FontSize: 10,
          Color: Color.Rgb(144, 160, 176)})
        let value = Text{
          Position: PositionType.Absolute,
          Left: 16,
          Top: 58 + row * 56,
          Content: values[index],
          FontSize: sizes[(panelIndex + row) % sizes.Length],
          FontFamily: if panelIndex % 2 == 0 { "AtlasProfileMono" } else { "" },
          FontWeight: if row % 2 == 0 { 400 } else { 700 },
          TextWrap: TextWrap.NoWrap,
          Color: Color.White,
          StyleRanges: if row % 2 == 0 { fractions } else { Array.Empty[TextStyleRange]() },
        }
        panel.Add(value)
      }
      panel.Add(Text{Position: PositionType.Absolute, Left: 16, Top: 340,
        Content: "69% / connected / encrypted / ready", FontSize: 11,
        Color: Color.Rgb(160, 176, 192)})
      root.Add(panel)
    }
    return root
  }
}

internal func RunVulkanAtlasPublicationProfile() {
  using let regular = FontSource.FromPath("AtlasProfileMono", 400, false,
    Path.Combine(AppContext.BaseDirectory, "JetBrainsMono-Regular.ttf"))
  using let bold = FontSource.FromPath("AtlasProfileMono", 700, false,
    Path.Combine(AppContext.BaseDirectory, "JetBrainsMono-Bold.ttf"))
  regular.Register()
  bold.Register()
  let effect = ShaderEffect(ShaderEffectProgram.Load(
    Path.Combine(AppContext.BaseDirectory, "atlas-background.goo-effect")))
  effect.SetParameter(0, Vector4(2560.0F, 1600.0F, 3.0F, 0.62F))
  effect.SetParameter(2, Vector4(1.2F, 0.55F, 0.0F, 0.0F))
  effect.SetParameter(3, Vector4(1.0F, 6.0F, 0.8F, 0.0F))
  let root = VulkanAtlasPublicationCell(effect)
  let frameCount = if OperatingSystem.IsMacOS() { 180 } else { 660 }
  let window = Window{Title: "Goo atlas publication profile",
    Width: 2560, Height: 1600, MinWidth: 1280, MinHeight: 800,
    UiScale: 2.0F, VSync: false, Root: root}.Open()
  try {
    if !OperatingSystem.IsMacOS() { window.State = WindowState.Fullscreen }
    window.RequestActivation()
    Console.WriteLine("atlas-profile-phase: warmup")
    for frame in 0 ... 60 {
      root.Change(frame)
      WindowReadbackTestFixture.ForceRender(window, 1.0 / 60.0, 10.0)
    }
    let metrics = WindowReadbackTestFixture.Metrics(window)
    Console.WriteLine("atlas-profile-metrics: width=${metrics.FramebufferWidth} height=${metrics.FramebufferHeight} ui_scale=${metrics.UiScale}")
    if metrics.FramebufferWidth != 2560 || metrics.FramebufferHeight != 1600 {
      throw InvalidOperationException("Atlas profile window extent changed")
    }
    Console.WriteLine("atlas-profile-phase: measured")
    for frame in 60 ... frameCount {
      root.Change(frame)
      WindowReadbackTestFixture.ForceRender(window, 1.0 / 60.0, 10.0)
    }
    Console.WriteLine("atlas-profile-complete: mode=window width=2560 height=1600 scale=2 frames=${frameCount} measured=${frameCount - 60} values=40 panels=8 sizes=8")
  } finally {
    window.Close()
  }
}
