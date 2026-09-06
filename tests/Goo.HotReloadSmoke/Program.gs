package HotReloadSmoke

import System
import System.Collections.Generic
import System.IO
import System.Reflection
import System.Runtime.CompilerServices
import System.Threading
import Goo

data struct LeafInput(Label string) {}

open class Leaf : Cell[LeafInput] {
  shared {
    internal let Instances List[Leaf] = List[Leaf]()
  }

  internal let Editor TextEditorController = TextEditorController(TextDocument())
  internal var Counter int32
  internal var LastLabel string = ""
  internal var Builds int32
  private var seeded bool

  public init() { Instances.Add(this) }

  internal func Seed() {
    if seeded { return }
    seeded = true
    Counter = 7
    Editor.Execute(TextCommand(TextCommandKind.Insert, "keep this text", false))
    Editor.Selection = TextSelection(TextPosition(2, TextAffinity.Upstream), TextPosition(6, TextAffinity.Upstream))
    Rebuild()
  }

  protected override func Build(input LeafInput) Blob {
    Builds++
    LastLabel = "Before " + input.Label
    return Container{
      Padding: 20, Gap: 12, Width: Length.Percent(100), Height: Length.Percent(100),
      BackgroundColor: Color.Rgb(20, 27, 39),
      Children: {
        Text{ Content: LastLabel + ": " + Counter.ToString(), FontSize: 24, Color: Color.White },
        TextEditor(Editor) { Height = 80, Width = Length.Percent(100), FontSize = 18, Color = Color.White },
      },
    }
  }
}

open class DirectWrapper : Cell[LeafInput] {
  protected override func Build(input LeafInput) Blob -> Cell.Mount[LeafInput, Leaf]("leaf", input)
}

class Shell : Cell {
  override func Build() Blob -> Container { Children: {
    Cell.Mount[LeafInput, DirectWrapper]("wrapper", LeafInput("stable")),
  } }
}

func NativeHandle(window Window) string {
  let host = typeof(Window).GetField("host", BindingFlags.Instance | BindingFlags.NonPublic)!!.GetValue(window)!!
  return host.GetType().GetProperty("WindowHandle")!!.GetValue(host)!!.ToString()!!
}

func Main() {
  let directory = Environment.GetEnvironmentVariable("GOO_HOTRELOAD_EVIDENCE")!!
  let first = Window{ Title: "Hot reload first", Width: 360, Height: 220, Root: Shell{} }
  let second = Window{ Title: "Hot reload second", Width: 360, Height: 220, Root: Shell{} }
  first.Open()
  second.Open()
  let firstHandle = NativeHandle(first)
  let secondHandle = NativeHandle(second)
  Console.WriteLine("pid=" + Environment.ProcessId.ToString())
  using let timer = Timer(_ -> {
    first.TryPost(() -> {
      if !first.IsOpen || !second.IsOpen { return }
      if Leaf.Instances.Count != 2 { return }
      let lines = List[string]()
      lines.Add(Environment.ProcessId.ToString())
      lines.Add(NativeHandle(first) + ":" + firstHandle)
      lines.Add(NativeHandle(second) + ":" + secondHandle)
      for leaf in Leaf.Instances {
        leaf.Seed()
        lines.Add(RuntimeHelpers.GetHashCode(leaf).ToString() + "|" + leaf.LastLabel + "|"
          +leaf.Counter.ToString() + "|" + leaf.Editor.Document.GetText() + "|"
          +leaf.Editor.Selection.Anchor.Offset.ToString() + "|" + leaf.Editor.Selection.Active.Offset.ToString()
          +"|" + leaf.Builds.ToString())
      }
      File.WriteAllLines(Path.Combine(directory, "state.txt"), lines)
      if File.Exists(Path.Combine(directory, "close")) {
        second.RequestClose()
        first.RequestClose()
      }
    })
  }, nil, 100, 100)
  first.Run()
}
