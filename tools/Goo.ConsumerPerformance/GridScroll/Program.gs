package GridScroll

import Goo
import Goo.Widgets.Data
import System
import System.Collections.Generic
import System.Globalization
import System.IO

class Scene : Cell {
  internal let Viewport ElementHandle = ElementHandle()
  internal let Rows []DataGridRow
  internal let Wrapped bool

  internal init(count int32, wrapped bool) {
    Wrapped = wrapped
    Rows = [count]DataGridRow
    for i in 0 ... count {
      Rows[i] = DataGridRow{Id: "row-${i}", SourceIndex: i}
    }
  }

  private func Content(value DataGridInput, row DataGridRow, column DataGridColumn) Blob -> Text{
    Content: column.Id == "details" ? "Finding ${row.SourceIndex}: verify access control for this service and document the evidence. This wrapped description fills several lines in the narrow details column." : "${column.Id} ${row.SourceIndex}",
    FontFamily: "Vend Sans",
    FontSize: 14,
    TextWrap: Wrapped && column.Id == "details" ? TextWrap.Wrap : TextWrap.NoWrap,
  }

  override func Build() Blob -> Cell.Mount[DataGridInput, DataGrid](nil, DataGridInput{
    Rows: Rows,
    Columns: []DataGridColumn{
      DataGridColumn{Id: "id", Label: "ID", Width: 110},
      DataGridColumn{Id: "status", Label: "Status", Width: 140},
      DataGridColumn{Id: "severity", Label: "Severity", Width: 140},
      DataGridColumn{Id: "title", Label: "Title", Width: 240},
      DataGridColumn{Id: "details", Label: "Details", Width: 350},
      DataGridColumn{Id: "owner", Label: "Owner", Width: 140},
    },
    Width: 1200,
    Height: 800,
    RowHeight: 32,
    AutoRowHeight: Wrapped,
    MaximumRowHeight: 76,
    ViewportHandle: Viewport,
    CreateCellContent: Content,
  })
}

func Main(args []string) {
  CultureInfo.CurrentCulture = CultureInfo.InvariantCulture
  let count = args.Length > 0 ? Int32.Parse(args[0]) : 10000
  let pattern = args.Length > 1 ? args[1] : "wheel"
  let wrapped = args.Length > 2 && args[2] == "wrap"
  let coalesce = args.Length > 3 && args[3] == "coalesce"
  using let font = FontSource("Vend Sans", 400, false, File.ReadAllBytes(Path.Combine(AppContext.BaseDirectory, "VendSans-VariableFont_wght.ttf")))
  font.Register()
  let scene = Scene(count, wrapped)
  let window = Window{Root: scene, Width: 1200, Height: 800, SmoothScrolling: false}
  let jumps = []float64{0.0, 0.7, 0.25, 0.95, 0.5, 0.1, 0.85, 0.35}
  var position = 2000.0
  for frame in 0 ... 1240 {
    let sample = frame >= 240
    if pattern.StartsWith("thumb") {
      position = jumps[(pattern == "thumb-service" ? frame : frame / 7) % jumps.Length] * float64(count * 32 - 800)
    } else {
      position += (frame / 70) % 2 == 0 ? 48.0 : -48.0
      position = Math.Max(0.0, position)
    }
    GridScrollFrames.Step(window, () -> {
      if pattern == "thumb-service" { scene.Viewport.JumpTo(0.0, position) }
      else { scene.Viewport.ScrollTo(0.0, position) }
    }, sample, pattern != "thumb-service" || frame % 7 == 0, coalesce)
  }
}
