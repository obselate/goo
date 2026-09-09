package Goo

import System

// Describes a cell mount. The retained Cell instance lives on the fiber Node.
internal open class CellElement : Blob {
  internal override func coreBlob() {
  }

  private var cellType Type

  internal prop CellType Type{
    get -> cellType
    init -> cellType = value
  }
  internal prop Factory Func[Cell]? { get; init; }
  internal prop Seed Action[Cell]? { get; init; }
  internal prop Configure Action[Cell]? { get; init; }

  internal open func CreateCell() Cell {
    guard let factory = Factory else {
      throw InvalidOperationException("Cell mount has no factory")
    }
    return factory()
  }

  internal open func ApplyInput(cell Cell) {
  }
}

internal class CellInputElement[TInput any, TCell Cell[TInput]init()] : CellElement {
  internal prop Input TInput{ get; init; }

  internal override func CreateCell() Cell -> TCell()

  internal override func ApplyInput(cell Cell) {
    if cell is Cell[TInput] {
      cell.SetInput(Input)
    }
  }
}
