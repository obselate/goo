package GooAndroidSmoke

import System
import System.IO
import Goo

/// Creates the same application Window for desktop and Android smoke entry points.
public class SmokeApplication {
  shared {
    /// Creates one retained smoke scene with shared assets and controls.
    public func CreateWindow() Window -> Window {
      Title: "Goo Vulkan Android smoke",
      Width: 420,
      Height: 760,
      Background: Color.Rgb(17, 24, 39),
      Root: SmokeCell{},
    }
  }
}

class SmokeCell : Cell, IDisposable {
  private let font FontSource
  private let controller TextEditorController = TextEditorController(TextDocument("Multiline Goo editor\nCompose, select, and scroll."))
  private let picture ImageSource = ImageSource(2, 2, []uint8{
    239, 68, 68, 255, 34, 197, 94, 255,
    59, 130, 246, 255, 250, 204, 21, 255,
  })
  private var count int32
  private var entry string = "Hello Goo"
  private var secret string = "secret"

  init() {
    using let stream = typeof(SmokeApplication).Assembly.GetManifestResourceStream("Goo.AndroidSmoke.Font.ttf")
    if stream == nil { throw InvalidOperationException("Packaged smoke font is missing") }
    using let bytes = MemoryStream()
    stream.CopyTo(bytes)
    font = FontSource("Smoke Vend Sans", 400, false, bytes.ToArray())
    font.Register()
  }

  override func Build() Blob -> Container {
    Width: Length.Percent(100),
    Height: Length.Percent(100),
    Overflow: Overflow.Scroll,
    Padding: 20,
    Gap: 14,
    Children: {
      Text{ Content: "Goo Vulkan", FontFamily: "Smoke Vend Sans", FontSize: 30, Color: Color.White },
      Text{ Content: "System fallback: Hello, Android!", FontFamily: "sans-serif", FontSize: 16, Color: Color.White },
      Button{
        Height: 48,
        BackgroundColor: Color.Rgb(37, 99, 235),
        BorderRadius: 10,
        OnClick: () -> { count++ },
        Children: { Text{ Content: "Retained count: " + count.ToString(), Color: Color.White } },
      },
      Image{ Source: picture, Width: 64, Height: 64 },
      TextEntry{
        Value: entry,
        Height: 48,
        Padding: 10,
        FontSize: 18,
        Color: Color.White,
        BackgroundColor: Color.Rgb(31, 41, 55),
        OnChange: (value string) -> { entry = value },
      },
      TextEntry{
        Value: secret,
        Password: true,
        Height: 48,
        Padding: 10,
        FontSize: 18,
        Color: Color.White,
        BackgroundColor: Color.Rgb(31, 41, 55),
        OnChange: (value string) -> { secret = value },
      },
      TextEditor(controller) {
        Height = 150,
        Padding = 10,
        FontSize = 18,
        Color = Color.White,
        BackgroundColor = Color.Rgb(31, 41, 55),
      },
      Container{
        Height: 240,
        BackgroundGradient: LinearGradient(90.0, []GradientStop{
          GradientStop{ Offset: 0.0, Color: Color.Rgb(37, 99, 235) },
          GradientStop{ Offset: 1.0, Color: Color.Rgb(139, 92, 246) },
        }),
        BorderRadius: 16,
        Children: { Text{ Content: "Scroll to this shared Cell", Padding: 20, Color: Color.White } },
      },
    },
  }

  /// Releases the scene's font, image, and document controller.
  public func Dispose() {
    font.Dispose()
    picture.Dispose()
    controller.Dispose()
  }
}
