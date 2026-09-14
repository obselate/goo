package GooAsyncReadbackSmoke

import System
import System.IO
import System.Threading
import Goo

class CustomLayoutSmokePolicy : LayoutAlgorithm {
  public func Measure(context LayoutContext, available LayoutSize) LayoutSize {
    let width = if Double.IsPositiveInfinity(available.Width) { 500.0 } else { available.Width }
    var height = 0.0
    for row in 0 ... context.ChildCount / 2 {
      height += RowHeight(context, row, width) + (if row == 0 { 0.0 } else { 20.0 })
    }
    return LayoutSize{Width: width, Height: height}
  }
  public func Arrange(context LayoutContext, finalSize LayoutSize) {
    var y = 0.0
    for row in 0 ... context.ChildCount / 2 {
      let height = RowHeight(context, row, finalSize.Width)
      context.ArrangeChild(row * 2, ElementRect{Y: y, Width: 100.0, Height: height})
      context.ArrangeChild(row * 2 + 1, ElementRect{X: 116.0, Y: y, Width: Math.Max(0.0, finalSize.Width - 116.0), Height: height})
      y += height + 20.0
    }
  }
  private func RowHeight(context LayoutContext, row int32, width float64) float64 {
    let left = context.MeasureChild(row * 2, LayoutSize{Width: 100.0, Height: Double.PositiveInfinity})
    let right = context.MeasureChild(row * 2 + 1, LayoutSize{Width: Math.Max(0.0, width - 116.0), Height: Double.PositiveInfinity})
    return Math.Max(left.Height, right.Height)
  }
}

class CustomLayoutCounter : Cell {
  internal let Handle ElementHandle = ElementHandle()
  internal var Count int32
  public override func Build() Blob -> Button {
    Handle: Handle, Height: 44, BackgroundColor: Color.Rgb(35, 91, 148), BorderRadius: 6,
    OnClick: () -> { Count++ }, Children: {Text("Retained count: " + Count.ToString())},
  }
}

class CustomLayoutSmokeCell : Cell {
  internal let Details ElementHandle = ElementHandle()
  internal var Counter CustomLayoutCounter?
  internal let Palette ImageSource = CustomPalette()
  private let policy LayoutAlgorithm = CustomLayoutSmokePolicy()
  public override func Build() Blob -> Container {
    BackgroundColor: Color.Rgb(18, 24, 34), Color: Color.Rgb(224, 233, 243), Padding: 24, Gap: 20,
    Children: {
      Text{Content: "Retained custom layout", FontSize: 25},
      Text{Content: "Retained children · real text measurement", Color: Color.Rgb(145, 166, 188), FontSize: 14},
      Container{Layout: policy, Padding: 16, BorderWidth: 1, BorderColor: Color.Rgb(51, 67, 84), BorderRadius: 8,
        Children: {
          Text{Key: "label-description", Content: "Description", FontSize: 14, Color: Color.Rgb(145, 166, 188)},
          Container{Key: "details", Handle: Details, Children: {Text{Content: "This paragraph wraps to the available track width. Resizing preserves the same mounted controls and their state, while the rows below move to fit the measured text.", FontSize: 17}}},
          Text{Key: "label-image", Content: "Image", FontSize: 14, Color: Color.Rgb(145, 166, 188)},
          Image{Key: "image", Source: Palette, Height: 40},
          Text{Key: "label-state", Content: "Local state", FontSize: 14, Color: Color.Rgb(145, 166, 188)},
          Cell.Mount[CustomLayoutCounter]("counter", (counter CustomLayoutCounter) -> { Counter = counter }),
        }},
    },
  }
}

func CustomPalette() ImageSource {
  let pixels = [64 * 32 * 4]uint8
  for y in 0 ... 32 {
    for x in 0 ... 64 {
      let offset = (y * 64 + x) * 4
      pixels[offset] = uint8(50 + x * 3)
      pixels[offset + 1] = uint8(180 - y * 2)
      pixels[offset + 2] = uint8(210)
      pixels[offset + 3] = uint8(255)
    }
  }
  return ImageSource(64, 32, pixels)
}

func RunCustomLayoutSmoke() {
  let directory = Environment.GetEnvironmentVariable("GOO_CUSTOM_LAYOUT_PROOF") ?? ""
  Require(directory != "", "Custom layout proof directory is required")
  let root = CustomLayoutSmokeCell{}
  let window = Window{Title: "Goo custom layout", Width: 640, Height: 520, Root: root}.Open()
  try {
    OwnershipSettle([]Window{window})
    guard let counter = root.Counter else { throw InvalidOperationException("Retained counter is missing") }
    let box = counter.Handle.BorderBox
    window.PlatformInput.PointerPress(1L, PointerDevice.Mouse, float32(box.X + box.Width / 2.0), float32(box.Y + box.Height / 2.0), PointerButton.Primary, KeyModifiers{}, 1.0F)
    window.PlatformInput.PointerRelease(1L, PointerDevice.Mouse, float32(box.X + box.Width / 2.0), float32(box.Y + box.Height / 2.0), PointerButton.Primary, KeyModifiers{}, 1.0F)
    OwnershipSettle([]Window{window})
    Require(counter.Count == 1, "Arranged counter did not receive input")
    let height = root.Details.BorderBox.Height
    File.WriteAllText(Path.Combine(directory, "wide.ready"), Environment.ProcessId.ToString())
    let deadline = Environment.TickCount64 + 90000
    var narrowed = false
    while !File.Exists(Path.Combine(directory, "done")) && Environment.TickCount64 < deadline {
      if !narrowed && File.Exists(Path.Combine(directory, "narrow")) {
        window.Width = 390
        OwnershipSettle([]Window{window})
        Require(root.Details.BorderBox.Height > height, "Native resize did not remeasure wrapped text")
        Require(Object.ReferenceEquals(root.Counter, counter) && counter.Count == 1 && counter.Handle.IsMounted, "Resize remounted the counter")
        File.WriteAllText(Path.Combine(directory, "narrow.ready"), Environment.ProcessId.ToString())
        narrowed = true
      }
      window.Pump(0.016)
      Thread.Sleep(8)
    }
    Require(narrowed && File.Exists(Path.Combine(directory, "done")), "Native proof did not finish")
  } finally {
    window.RequestClose()
    OwnershipSettle([]Window{window})
    root.Palette.Dispose()
  }
  Console.WriteLine("custom-layout-native: wrapped-text/image/resize/retained-state/input=pass")
}
