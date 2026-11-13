package GooAndroidSmoke

import Goo
import System
import System.IO
import System.Globalization

/// Creates the same application Window for desktop and Android smoke entry points.
public class SmokeApplication {
  shared {
    /// Creates one retained smoke scene with shared assets and controls.
    public func CreateWindow() Window {
      let scene = SmokeCell{}
      let window = Window{
        Title: "Goo Vulkan Android smoke",
        Width: 420,
        Height: 760,
        Background: Color.Rgb(17, 24, 39),
        Root: scene,
      }
      scene.Input = window.Focus
      return window
    }

    /// Creates a distinct root for native popup presentation checks.
    public func CreatePopupRoot(attached Action[Window]) Cell -> PopupSmokeCell{ Attached: attached }

    /// Creates a sparse logical grid and native role checks.
    public func CreateAccessibilityRoot() Cell -> AccessibilitySmokeCell{}
  }
}

class AccessibilitySmokeCell : Cell {
  private var divider float64 = 40.0
  override func Build() Blob -> Container() {.Gap: 8,
    Container() {.Height: 20,.Focusable: true,
      .Accessibility: Accessibility{
        Role: AccessibilityRole.Separator, Name: "Resize divider",
        Range: AccessibilityValue{ Now: divider, Minimum: 0.0, Maximum: 100.0 },
        Orientation: AccessibilityOrientation.Vertical,
        Actions: []AccessibilityAction{ AccessibilityAction.SetValue },
        OnAction: (request AccessibilityActionRequest) -> {
          if !Double.TryParse(request.Value, NumberStyles.Float, CultureInfo.InvariantCulture, out var value) { return false }
          divider = Math.Clamp(value, 0.0, 100.0)
          return true
        },
      },
    },
    Container() {.Height: 20,.Accessibility: Accessibility{ Role: AccessibilityRole.TabPanel, Name: "Details panel" } },
    Container() {.Height: 20,.Accessibility: Accessibility{ Role: AccessibilityRole.Toolbar, Name: "Document tools" } },
    Text{ Content: "Help text", Accessibility: Accessibility{ Role: AccessibilityRole.Tooltip, Name: "Context help" } },
    Container() {
      .Accessibility: Accessibility{ Role: AccessibilityRole.Grid, Name: "Sparse grid", RowCount: 1000, ColumnCount: 20 },
      Text{ Content: "Heading", Accessibility: Accessibility{
        Role: AccessibilityRole.ColumnHeader, Name: "Column heading", RowIndex: 0, ColumnIndex: 7,
      } },
      Container() {.Accessibility: Accessibility{ Role: AccessibilityRole.Row, RowIndex: 400 },
        Text{ Content: "Record", Accessibility: Accessibility{
          Role: AccessibilityRole.RowHeader, Name: "Row heading", RowIndex: 400, ColumnIndex: 0,
        } },
        Text{ Content: "Value", Accessibility: Accessibility{
          Role: AccessibilityRole.GridCell, Name: "Sparse value", RowIndex: 400, ColumnIndex: 7,
        } },
      },
    },
  }
}

class SmokeCell : Cell, IDisposable {
  internal prop Input WindowFocus? { get; set; }
  private let font FontSource
  private let entryOptions TextInputOptions = TextInputOptions{
    Purpose: InputPurpose.Email, EnterAction: EnterAction.Next,
    AutofillHints: []string{ "emailAddress" },
  }
  private let controller TextEditorController = TextEditorController(TextDocument("Multiline Goo editor\nCompose, select, and scroll."))
  private let picture ImageSource = ImageSource(2, 2, []uint8{
    239, 68, 68, 255, 34, 197, 94, 255,
    59, 130, 246, 255, 250, 204, 21, 255,
  })
  private var count int32
  private var entry string = "Hello Goo"
  private var secret string = "secret"
  private var checkedState AccessibilityChecked = AccessibilityChecked.Mixed
  private var level float64 = 25.0

  init() {
    using let stream = typeof(SmokeApplication).Assembly.GetManifestResourceStream("Goo.AndroidSmoke.Font.ttf")
    if stream == nil { throw InvalidOperationException("Packaged smoke font is missing") }
    using let bytes = MemoryStream()
    stream.CopyTo(bytes)
    font = FontSource("Smoke Vend Sans", 400, false, bytes.ToArray())
    font.Register()
  }

  override func Build() Blob -> Container() {.Width: Percent(100),.Height: Percent(100),.Overflow: Overflow.Scroll,.Padding: 20,.Gap: 14,
    .KeyBindings: []KeyBinding{
      KeyBinding{ Key: Key.Backspace, Repeat: true, OnPress: () -> {
        Input?.Execute(TextCommand{ Kind: TextCommandKind.DeleteBackward })
      } },
    },
    Text{ Content: "Goo Vulkan", FontFamily: "Smoke Vend Sans", FontSize: 30, Color: Color.White,
      Accessibility: Accessibility{ Role: AccessibilityRole.Heading, Level: 1 } },
      Text{ Content: "System fallback: Hello, Android!", FontFamily: "sans-serif", FontSize: 16, Color: Color.White },
      Button() {.Height: 48,.BackgroundColor: Color.Rgb(37, 99, 235),.BorderRadius: 10,.OnClick: () -> { count++ },
      Text{ Content: "Retained count: " + count.ToString(), Color: Color.White},
      },
      Text{ Content: "Count " + count.ToString(), Color: Color.White,
        Accessibility: Accessibility{ Role: AccessibilityRole.Status, Name: "Counter status", Live: AccessibilityLive.Polite, Atomic: true } },
      Text{ Content: "Counter changed", Color: Color.White,
        Accessibility: Accessibility{ Role: AccessibilityRole.Alert, Live: AccessibilityLive.Assertive, Hidden: count == 0 } },
      Image{ Source: picture, Width: 64, Height: 64, Accessibility: Accessibility{ Name: "Four color image" } },
      TextEntry{
        Accessibility: Accessibility{ Name: "Name" },
        Value: entry,
        InputOptions: entryOptions,
        Height: 48,
        Padding: 10,
        FontSize: 18,
        Color: Color.White,
        BackgroundColor: Color.Rgb(31, 41, 55),
        OnChange: (value string) -> { entry = value },
      },
      TextEntry{
        Accessibility: Accessibility{ Name: "Password" },
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
        Accessibility = Accessibility{ Name: "Notes" },
        Height = 150,
        Padding = 10,
        FontSize = 18,
        Color = Color.White,
        BackgroundColor = Color.Rgb(31, 41, 55),
      },
      Button() {.Height: 48,.BackgroundColor: Color.Rgb(31, 41, 55),
        .Accessibility: Accessibility{ Role: AccessibilityRole.Checkbox, Name: "Check item", Checked: checkedState },
        .OnClick: () -> { checkedState = if checkedState == AccessibilityChecked.True { AccessibilityChecked.False } else { AccessibilityChecked.True } },
        Text{ Content: "Check item", Color: Color.White },
      },
      Container() {.Height: 48,.BackgroundColor: Color.Rgb(31, 41, 55),
        .Accessibility: Accessibility{
          Role: AccessibilityRole.Slider, Name: "Level", Orientation: AccessibilityOrientation.Horizontal,
          Range: AccessibilityValue{ Now: level, Minimum: 0.0, Maximum: 100.0, Text: level.ToString(CultureInfo.CurrentCulture) },
          Actions: []AccessibilityAction{ AccessibilityAction.SetValue, AccessibilityAction.Increment, AccessibilityAction.Decrement },
          OnAction: (request AccessibilityActionRequest) -> {
            if request.Action == AccessibilityAction.SetValue {
              if !Double.TryParse(request.Value, NumberStyles.Float, CultureInfo.InvariantCulture, out var value) { return false }
              level = Math.Clamp(value, 0.0, 100.0)
            } else if request.Action == AccessibilityAction.Increment { level = Math.Min(100.0, level + 1.0) }
            else if request.Action == AccessibilityAction.Decrement { level = Math.Max(0.0, level - 1.0) }
            else { return false }
            return true
          },
        },
        Text{ Content: "Level " + level.ToString(CultureInfo.CurrentCulture), Color: Color.White, Accessibility: Accessibility{ Role: AccessibilityRole.None } },
      },
      Button() {.Height: 48,.Disabled: true,.OnClick: () -> { count++ },
        Text{ Content: "Disabled", Color: Color.White },
      },
      Container() {.Height: 240,.BackgroundGradient: LinearGradient(90.0, []GradientStop{
          GradientStop{ Offset: 0.0, Color: Color.Rgb(37, 99, 235) },
          GradientStop{ Offset: 1.0, Color: Color.Rgb(139, 92, 246) },
        }),.BorderRadius: 16,
      Text{ Content: "Scroll to this shared Cell", Padding: 20, Color: Color.White},
    },
  }

  /// Releases the scene's font, image, and document controller.
  public func Dispose() {
    font.Dispose()
    picture.Dispose()
    controller.Dispose()
  }
}

class PopupSmokeCell : Cell {
  internal var Attached Action[Window]?
  private let context Context[bool] = Context[bool]()

  override func Build() Blob {
    let attached = Attached
    Attached = nil
    attached?.Invoke(context.Window)
    return Container{ Width: Percent(100), Height: Percent(100), BackgroundColor: Color.Rgb(40, 160, 80) }
  }
}
