package GooAsyncReadbackSmoke

import Goo
import System
import System.Collections.Generic
import System.IO
import System.Threading

data struct MeasuredSmokeRow {
  internal var Id int32
  internal var Content string
}

class VirtualRowsSmokeCell : Cell {
  internal let Items List[MeasuredSmokeRow] = List[MeasuredSmokeRow]()
  internal let ListHandle ElementHandle = ElementHandle()
  internal let Anchor ElementHandle = ElementHandle()
  internal var Builds int32
  private let builder((MeasuredSmokeRow) -> Blob)
  init() {
    builder = (row MeasuredSmokeRow) -> BuildRow(row)
    for i in 0 ... 1000 {
      Items.Add(MeasuredSmokeRow{Id: i, Content: if i % 2 == 0 {
        "Long messages wrap to the available width. This retained list measures the actual content and keeps your place as the window becomes narrower."
      } else { "A short update with a smaller measured height." }})
    }
  }
  public override func Build() Blob -> Container() {.Padding: 24,.Gap: 14,.BackgroundColor: Color.Rgb(16, 23, 33),.Color: Color.Rgb(225, 235, 246),
    Text{Content: "Measured virtual rows", FontSize: 26},
      Text{Content: "1,000 messages · stable keys · actual text heights", FontSize: 13, Color: Color.Rgb(148, 173, 198)},
      VirtualRows(Items, 100.0, (row MeasuredSmokeRow) -> row.Id.ToString(), builder) {
        Handle = ListHandle, FlexGrow = 1, MinHeight = 0, RowGap = 10,
        ScrollbarVisibility = ScrollbarVisibility.Always,
      },
    }

  private func BuildRow(row MeasuredSmokeRow) Blob {
    Builds++
    return Container() {.Handle: if row.Id == 400 { Anchor } else { nil },.Padding: 16,.Gap: 8,.BackgroundColor: if row.Id == 400 { Color.Rgb(27, 65, 95) } else { Color.Rgb(29, 39, 53) },.BorderRadius: 8,.BorderWidth: 1,.BorderColor: Color.Rgb(48, 68, 89),
      Text{Content: "MESSAGE " + row.Id.ToString(), FontSize: 11, Color: Color.Rgb(134, 190, 224)},
        Text{Content: row.Content, FontSize: 17},
    }
  }
}

func RunVirtualRowsSmoke() {
  let directory = Environment.GetEnvironmentVariable("GOO_VIRTUAL_ROWS_PROOF") ?? ""
  Require(directory != "", "Virtual rows proof directory is required")
  let root = VirtualRowsSmokeCell()
  let window = Window{Title: "Goo measured virtual rows", Width: 640, Height: 650, Root: root}.Open()
  try {
    OwnershipSettle([]Window{window})
    Require(root.ListHandle.ScrollToItem("400"), "Stable-key jump was rejected")
    OwnershipSettle([]Window{window})
    let initial = root.Anchor.BorderBox
    Require(Math.Abs(initial.Y - root.ListHandle.ContentBox.Y) < 0.1, "Stable-key jump missed the anchor: row=" + initial.Y.ToString() + " list=" + root.ListHandle.ContentBox.Y.ToString() + " offset=" + root.ListHandle.ScrollOffset.Y.ToString())
    Require(root.Builds < 40, "Measured list realized too much source content")
    File.WriteAllText(Path.Combine(directory, "wide.ready"), Environment.ProcessId.ToString())
    let deadline = Environment.TickCount64 + 90000
    var narrowed = false
    var inserted = false
    while !File.Exists(Path.Combine(directory, "done")) && Environment.TickCount64 < deadline {
      if !narrowed && File.Exists(Path.Combine(directory, "narrow")) {
        window.Width = 390
        OwnershipSettle([]Window{window})
        Require(root.Anchor.BorderBox.Height > initial.Height, "Wrapped virtual row did not grow after resize")
        Require(Math.Abs(root.Anchor.BorderBox.Y - initial.Y) < 0.1, "Resize moved the anchor")
        File.WriteAllText(Path.Combine(directory, "narrow.ready"), Environment.ProcessId.ToString())
        narrowed = true
      }
      if narrowed && !inserted && File.Exists(Path.Combine(directory, "insert")) {
        root.Items.Insert(0, MeasuredSmokeRow{Id: 1001, Content: "Inserted before the viewport"})
        root.Items[400] = MeasuredSmokeRow{Id: 399, Content: "Expanded earlier message. " + root.Items[401].Content + " More details now occupy extra space before the visible anchor."}
        root.Rebuild()
        OwnershipSettle([]Window{window})
        Require(Math.Abs(root.Anchor.BorderBox.Y - initial.Y) < 0.1, "Insert or expanded details moved the anchor")
        File.WriteAllText(Path.Combine(directory, "insert.ready"), Environment.ProcessId.ToString())
        inserted = true
      }
      window.Pump(0.016)
      Thread.Sleep(8)
    }
    Require(inserted && File.Exists(Path.Combine(directory, "done")), "Virtual rows proof did not finish")
  } finally {
    window.RequestClose()
    OwnershipSettle([]Window{window})
  }
  Console.WriteLine("virtual-rows-native: wrapped-text/resize/insert/expanded-details/stable-key-anchor/bounded-realization=pass")
}
