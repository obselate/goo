package GooWindowsDemo

import System
import System.Diagnostics
import System.Globalization
import System.IO
import System.Threading
import Goo

class DemoCell : Cell {
  private var count int32
  private var warm bool

  override func Build() Blob {
    let accent = if warm { Color.Rgb(244, 114, 82) } else { Color.Rgb(104, 132, 255) }
    let accentSoft = if warm { Color.Rgb(126, 54, 40) } else { Color.Rgb(45, 58, 122) }
    let mode = if warm { "EMBER" } else { "COBALT" }
    return Container{
      Width: Length.Percent(100),
      Height: Length.Percent(100),
      Padding: 32,
      Gap: 24,
      Overflow: Overflow.Scroll,
      BackgroundColor: Color.Rgb(8, 11, 18),
      Children: {
        Container{
          Width: Length.Percent(100),
          FlexDirection: FlexDirection.Row,
          AlignItems: AlignItems.Center,
          JustifyContent: JustifyContent.SpaceBetween,
          Children: {
            Container{
              Gap: 4,
              Children: {
                Text{
                  Content: "GOO / WINDOWS",
                  FontSize: 14,
                  FontWeight: 700,
                  LetterSpacing: 2.2,
                  Color: accent,
                },
                Text{
                  Content: "Native desktop proof",
                  FontSize: 13,
                  Color: Color.Rgb(133, 143, 166),
                },
              },
            },
            Container{
              Padding: 8,
              BorderRadius: 999,
              BorderWidth: 1,
              BorderColor: Color.Rgb(42, 51, 70),
              BackgroundColor: Color.Rgb(18, 24, 37),
              Children: {
                Text{
                  Content: "VULKAN ONLINE",
                  FontSize: 11,
                  FontWeight: 700,
                  LetterSpacing: 1.2,
                  Color: Color.Rgb(103, 232, 173),
                },
              },
            },
          },
        },
        Container{
          Width: Length.Percent(100),
          MinHeight: 330,
          Padding: 32,
          Gap: 18,
          BorderRadius: 24,
          BorderWidth: 1,
          BorderColor: Color.Rgb(42, 51, 70),
          BackgroundGradient: LinearGradient(135.0, []GradientStop{
            GradientStop{ Offset: 0.0, Color: Color.Rgb(18, 25, 42) },
            GradientStop{ Offset: 0.55, Color: Color.Rgb(12, 17, 29) },
            GradientStop{ Offset: 1.0, Color: accentSoft },
          }),
          Children: {
            Text{
              Content: "One window system.\nReal Windows pixels.",
              FontSize: 54,
              FontWeight: 700,
              LineHeight: 1.04,
              LetterSpacing: -1.8,
              Color: Color.White,
            },
            Text{
              Content: "SDL3 hosts the window. Vulkan draws every surface. Goo retains the tree.",
              Width: 620,
              FontSize: 17,
              LineHeight: 1.5,
              Color: Color.Rgb(174, 185, 207),
            },
            Container{
              FlexDirection: FlexDirection.Row,
              Gap: 12,
              Children: {
                Button{
                  Padding: 14,
                  BorderRadius: 12,
                  BackgroundColor: accent,
                  Hover: Style{ Opacity: 0.86 },
                  OnClick: func() { count++ },
                  Children: {
                    Text{
                      Content: "CLICK TEST  " + count.ToString(),
                      FontSize: 13,
                      FontWeight: 700,
                      Color: Color.White,
                    },
                  },
                },
                Button{
                  Padding: 14,
                  BorderRadius: 12,
                  BorderWidth: 1,
                  BorderColor: Color.Rgb(74, 85, 108),
                  BackgroundColor: Color.Rgba(18, 24, 37, 200),
                  Hover: Style{ BackgroundColor: Color.Rgb(32, 40, 57) },
                  OnClick: func() { warm = !warm },
                  Children: {
                    Text{
                      Content: "PALETTE  " + mode,
                      FontSize: 13,
                      FontWeight: 700,
                      Color: Color.White,
                    },
                  },
                },
              },
            },
          },
        },
        Container{
          Width: Length.Percent(100),
          FlexDirection: FlexDirection.Row,
          Gap: 16,
          Children: {
            DemoCard("WINDOW", "Resizable", "Native state and DPI metrics", accent),
            DemoCard("TEXT", "Segoe UI", "HarfBuzz shaping on Windows", Color.Rgb(103, 232, 173)),
            DemoCard("RENDER", "Vulkan", "Retained analytic primitives", Color.Rgb(244, 184, 82)),
          },
        },
        Text{
          Content: "Resize this window, click both controls, then close it normally.",
          FontSize: 13,
          Color: Color.Rgb(111, 122, 145),
        },
      },
    }
  }
}

func DemoCard(label string, value string, detail string, accent Color) Container -> Container {
  Width: Length.Percent(33.333),
  MinHeight: 150,
  Padding: 20,
  Gap: 8,
  BorderRadius: 16,
  BorderWidth: 1,
  BorderColor: Color.Rgb(37, 45, 62),
  BackgroundColor: Color.Rgb(14, 19, 30),
  Children: {
    Text{
      Content: label,
      FontSize: 11,
      FontWeight: 700,
      LetterSpacing: 1.5,
      Color: accent,
    },
    Text{
      Content: value,
      FontSize: 24,
      FontWeight: 700,
      Color: Color.White,
    },
    Text{
      Content: detail,
      FontSize: 13,
      Color: Color.Rgb(139, 150, 174),
    },
  },
}

func Main() {
  let processStart = Process.GetCurrentProcess().StartTime.ToUniversalTime()
  let mainEntered = DateTime.UtcNow
  Window.ConfigureApplication("Goo Windows Demo", "0.5.1", "io.github.obselate.goo.windows-demo")
  let window = Window{
    Title: "Goo Windows Demo",
    Width: 1180,
    Height: 760,
    Resizable: true,
    VSync: true,
    Background: Color.Rgb(8, 11, 18),
    Root: DemoCell{},
  }
  let probePath = ArgumentValue("--startup-probe")
  if probePath != "" {
    RunStartupProbe(window, probePath, processStart, mainEntered)
    return
  }
  window.Run()
}

func ArgumentValue(name string) string {
  let arguments = Environment.GetCommandLineArgs()
  var index int32
  while index < arguments.Length {
    if arguments[index] == name && index + 1 < arguments.Length {
      return arguments[index + 1]
    }
    index++
  }
  return ""
}

func RunStartupProbe(window Window, path string, processStart DateTime, mainEntered DateTime) {
  let openStart = Stopwatch.GetTimestamp()
  window.Open()
  let opened = Stopwatch.GetTimestamp()
  window.Pump(0.0)
  let firstFrame = Stopwatch.GetTimestamp()
  let firstFrameTime = DateTime.UtcNow
  let result = "{\"pre_main_ms\":" + FormatMilliseconds((mainEntered - processStart).TotalMilliseconds)
  +",\"open_ms\":" + FormatTicks(openStart, opened)
  +",\"first_frame_ms\":" + FormatTicks(opened, firstFrame)
  +",\"total_ms\":" + FormatMilliseconds((firstFrameTime - processStart).TotalMilliseconds)
  +"}"
  File.WriteAllText(path, result)
  window.RequestClose()
  var pumps int32
  while window.IsOpen && pumps < 4096 {
    window.Pump(0.0)
    if window.IsOpen {
      Thread.Sleep(1)
    }
    pumps++
  }
}

func FormatTicks(start int64, finish int64) string ->
FormatMilliseconds(float64(finish - start) * 1000.0 / float64(Stopwatch.Frequency))

func FormatMilliseconds(value float64) string ->
value.ToString("F3", CultureInfo.InvariantCulture)
