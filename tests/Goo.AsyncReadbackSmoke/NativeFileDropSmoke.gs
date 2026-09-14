package GooAsyncReadbackSmoke

import System
import System.IO
import System.Collections.Generic
import System.Runtime.InteropServices
import System.Threading
import Goo
import Hexa.NET.SDL3

@StructLayout(LayoutKind.Sequential, Size: 128)
struct NativeDropSmokeEvent {
  public var Type uint32
  public var Reserved uint32
  public var Timestamp uint64
  public var WindowId uint32
  public var X float32
  public var Y float32
  public var Source nint
  public var Data nint
}
@DllImport("SDL3", EntryPoint: "SDL_PushEvent", CallingConvention: CallingConvention.Cdecl)
func NativeDropSmokePush(ref event NativeDropSmokeEvent) uint8;

class NativeFileDropSmokeCell : Cell {
  internal let Target ElementHandle = ElementHandle()
  internal var Enters int32
  internal var Leaves int32
  internal var Drops int32
  internal var Hover bool
  internal var Files IReadOnlyList[string] = Array.AsReadOnly[string]([]string{})
  private let target DropTarget
  init() {
    target = DropTarget((event DragEvent) -> if event.Data.Value is NativeFileDrop { DragEffect.Copy } else { DragEffect.None }, (event DragEvent) -> Changed(event))
  }
  private func Changed(event DragEvent) {
    if event.Kind == DragEventKind.Enter { Enters++
      Hover = true }
    else if event.Kind == DragEventKind.Leave { Leaves++
      Hover = false }
    else if event.Kind == DragEventKind.Drop {
      guard let files = event.Data.Value as NativeFileDrop ? else { throw InvalidOperationException("Native file payload is missing") }
      Require(!files.IsPreview && files.Paths.Count > 0 && event.Effect == DragEffect.Copy, "Native drop payload is incomplete")
      Files = files.Paths
      Drops++
      Hover = false
    }
  }
  public override func Build() Blob {
    let content = List[Blob]()
    content.Add(Text{Content: if Hover { "Release to copy files" } else if Files.Count > 0 { "Files received" } else { "Drop files here" }, FontSize: 23})
    content.Add(Text{Content: "Owned paths · no file contents loaded", FontSize: 14, Color: Color.Rgb(152, 176, 199)})
    for i in 0 ... Math.Min(Files.Count, 8) { content.Add(Text{Content: Path.GetFileName(Files[i]), FontFamily: "Noto Sans CJK", FontSize: 17}) }
    return Container{Padding: 24, Gap: 16, BackgroundColor: Color.Rgb(18, 24, 34), Color: Color.Rgb(224, 233, 243), Children: {
      Text{Content: "Native file drop", FontSize: 28},
      Text{Content: "External file manager → retained DropTarget", FontSize: 14, Color: Color.Rgb(144, 167, 190)},
      Container{Handle: Target, DropTarget: target, FlexGrow: 1, Padding: 24, Gap: 14,
        BackgroundColor: if Hover { Color.Rgb(29, 69, 100) } else { Color.Rgb(28, 39, 53) },
        BorderWidth: 2, BorderColor: if Hover { Color.Rgb(106, 194, 237) } else { Color.Rgb(60, 87, 111) },
        BorderRadius: 10, Children: content},
    }}
  }
}

func NativeDropSmokeSend(kind SDLEventType, id uint32, x float32 = 80.0F, y float32 = 160.0F) -> NativeDropSmokeSendData(kind, id, nint(0), x, y)

func NativeDropSmokeSendData(kind SDLEventType, id uint32, data nint, x float32 = 80.0F, y float32 = 160.0F) {
  var event = NativeDropSmokeEvent{Type: uint32(kind), WindowId: id, X: x, Y: y, Data: data}
  Require(NativeDropSmokePush(ref event) != uint8(0), "SDL rejected a native drop test event")
}

func RunNativeFileDropSmoke() {
  let directory = Environment.GetEnvironmentVariable("GOO_NATIVE_DROP_PROOF") ?? ""
  Require(directory != "", "Native drop evidence directory is required")
  Require(Marshal.SizeOf[NativeDropSmokeEvent]() == 128 && Marshal.OffsetOf[NativeDropSmokeEvent]("Data").ToInt32() == 40, "Native drop fixture ABI differs from SDL")
  let root = NativeFileDropSmokeCell()
  let otherRoot = NativeFileDropSmokeCell()
  let window = Window{Title: "Goo Native File Drop Proof", Width: 580, Height: 440, X: 700, Y: 80, NativeFileDropEnabled: true, Root: root}.Open()
  let other = Window{Title: "Goo Native Drop Other", Width: 400, Height: 300, X: 700, Y: 620, NativeFileDropEnabled: true, Root: otherRoot}.Open()
  try {
    OwnershipSettle([]Window{window, other})
    Require(window.NativeTransferCapabilities == (NativeTransferCapabilities.FileDrop | NativeTransferCapabilities.DropPreview), "Unexpected native transfer capabilities")
    let id = WindowReadbackTestFixture.SdlWindowId(window)
    let otherId = WindowReadbackTestFixture.SdlWindowId(other)
    NativeDropSmokeSend(SDLEventType.DropBegin, uint32.MaxValue)
    NativeDropSmokeSend(SDLEventType.DropPosition, uint32.MaxValue)
    NativeDropSmokeSend(SDLEventType.DropComplete, id)
    OwnershipSettle([]Window{window, other})
    Require(root.Enters == 0 && otherRoot.Enters == 0, "Wrong-window events crossed window ownership")
    NativeDropSmokeSend(SDLEventType.DropBegin, id)
    NativeDropSmokeSend(SDLEventType.DropPosition, id)
    OwnershipSettle([]Window{window, other})
    Require(root.Hover && root.Enters == 1 && otherRoot.Enters == 0, "Native preview targeted the wrong window")
    NativeDropSmokeSend(SDLEventType.DropComplete, id)
    OwnershipSettle([]Window{window, other})
    Require(root.Leaves == 1 && !root.Hover && root.Drops == 0, "Native cancel delivered a drop")
    NativeDropSmokeSend(SDLEventType.DropBegin, otherId)
    NativeDropSmokeSend(SDLEventType.DropPosition, otherId)
    let path = Marshal.StringToCoTaskMemUTF8(Path.Combine(directory, "owned.txt"))
    try {
      NativeDropSmokeSendData(SDLEventType.DropFile, otherId, path)
      NativeDropSmokeSend(SDLEventType.DropComplete, otherId)
      OwnershipSettle([]Window{window, other})
    } finally { Marshal.FreeCoTaskMem(path) }
    Require(otherRoot.Drops == 1 && root.Drops == 0, "Native file ownership crossed windows")
    NativeDropSmokeSend(SDLEventType.DropBegin, id)
    NativeDropSmokeSend(SDLEventType.DropPosition, id)
    OwnershipSettle([]Window{window, other})
    window.NativeFileDropEnabled = false
    NativeDropSmokeSend(SDLEventType.DropComplete, id)
    OwnershipSettle([]Window{window, other})
    Require(root.Leaves == 2 && root.Drops == 0, "Disabling did not cancel native ingress")
    window.NativeFileDropEnabled = true
    other.RequestClose()
    OwnershipSettle([]Window{window, other})
    Require(otherRoot.Files.Count == 1 && otherRoot.Files[0].EndsWith("owned.txt", StringComparison.Ordinal), "Owned paths expired after window close")
    let box = root.Target.BorderBox
    File.WriteAllLines(Path.Combine(directory, "target.txt"), []string{window.Width.ToString(), window.Height.ToString(), (box.X + box.Width / 2.0).ToString(), (box.Y + box.Height / 2.0).ToString()})
    File.WriteAllText(Path.Combine(directory, "ready"), Environment.ProcessId.ToString())
    let deadline = Environment.TickCount64 + 120000
    while !File.Exists(Path.Combine(directory, "done")) && Environment.TickCount64 < deadline {
      window.Pump(0.016)
      if root.Hover { File.WriteAllText(Path.Combine(directory, "hover.ready"), "1") }
      if root.Drops > 0 && !File.Exists(Path.Combine(directory, "drop.ready")) {
        File.WriteAllLines(Path.Combine(directory, "paths.txt"), root.Files)
        File.WriteAllText(Path.Combine(directory, "drop.ready"), "1")
      }
      Thread.Sleep(8)
    }
    Require(File.Exists(Path.Combine(directory, "done")) && root.Drops == 1 && root.Files.Count == 2, "External file-manager drop did not complete")
    let retained = root.Files
    NativeDropSmokeSend(SDLEventType.DropBegin, id)
    NativeDropSmokeSend(SDLEventType.DropPosition, id)
    OwnershipSettle([]Window{window})
    let leaves = root.Leaves
    window.RequestClose()
    OwnershipSettle([]Window{window})
    Require(root.Leaves == leaves + 1 && !window.IsOpen && retained.Count == 2, "Owner close left native preview or expired file paths")
  } finally {
    window.RequestClose()
    other.RequestClose()
    OwnershipSettle([]Window{window, other})
  }
  Console.WriteLine("native-file-drop: external-files/preview/cancel/window-routing/disable/owned-paths/close=pass")
}
