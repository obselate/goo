package GooAsyncReadbackSmoke

import System
import System.IO
import System.Threading
import System.Threading.Tasks
import Goo
import Hexa.NET.SDL3

unsafe func RunFileDialogSmoke() {
  let mode = Environment.GetEnvironmentVariable("GOO_FILE_DIALOG_SMOKE") ?? ""
  let root = NativeInputAcceptanceCell{}
  let otherRoot = NativeInputAcceptanceCell{}
  let owner = Window{Title: "Goo file chooser owner", Width: 340, Height: 200, Root: root}.Open()
  let other = Window{Title: "Goo independent window", Width: 320, Height: 200, Root: otherRoot}.Open()
  try {
    OwnershipSettle([]Window{owner, other})
    let native = SDL.GetWindowFromID(WindowReadbackTestFixture.SdlWindowId(owner))
    let exported = SDL.GetStringPropertyS(SDL.GetWindowProperties(native), "SDL.window.wayland.xdg_toplevel_export_handle", "") ?? ""
    Console.WriteLine("file-dialog-owner: wayland:" + exported)
    if mode == "unsupported" {
      let result = owner.ShowFileDialogAsync(FileDialogKind.OpenFile).GetAwaiter().GetResult()
      Require(result.Status == FileDialogStatus.Unsupported && !owner.IsInputBlocked, "Missing native chooser must return Unsupported and restore input")
    } else {
      let cases = if mode == "real" { []string{"cancel-api"} } else {
        []string{"open", "save", "folder", "cancel", "failed", "large", "instant", "cancel-api", "open", "owner-close"}
      }
      for testCase in cases {
        Require(root.Entry.Focus(), "Owner editor could not focus before chooser")
        let kind = if testCase == "save" { FileDialogKind.SaveFile } else if testCase == "folder" { FileDialogKind.Folder } else { FileDialogKind.OpenFile }
        let options = FileDialogOptions{
          Title: testCase,
          InitialPath: if testCase == "save" { Path.Combine(Path.GetTempPath(), "goo-dialog-suggested.txt") } else { Path.GetTempPath() },
          Multiple: testCase == "open",
          Filters: if kind == FileDialogKind.Folder { []FileDialogFilter{} } else { []FileDialogFilter{FileDialogFilter("Text", "txt;md"), FileDialogFilter("All files", "*")} }
        }
        let task = owner.ShowFileDialogAsync(kind, options)
        Require(owner.IsInputBlocked && !other.IsInputBlocked, "Chooser blocked the wrong owner")
        Require(!root.Entry.Focus(), "Owner input remained enabled during chooser")
        let previous = otherRoot.PointerCount
        Require(NativeInputPushPointerPair(WindowReadbackTestFixture.SdlWindowId(other), 40.0F, 40.0F) == 2, "Independent window input injection failed")
        let deadline = Environment.TickCount64 + 15000
        var frames = 0
        while (owner.IsInputBlocked || !task.IsCompleted) && Environment.TickCount64 < deadline {
          if frames == 20 && testCase == "cancel-api" { Require(owner.CancelFileDialog(), "Native cancellation request was lost") }
          if frames == 20 && testCase == "owner-close" { owner.RequestClose() }
          if owner.IsOpen { WindowReadbackTestFixture.ForceRender(owner, 0.016) }
          WindowReadbackTestFixture.ForceRender(other, 0.016)
          Thread.Sleep(8)
          frames++
        }
        Require(task.IsCompleted && !owner.IsInputBlocked, "Chooser did not finish within the deadline")
        Require((frames > 3 || testCase == "instant") && otherRoot.PointerCount == previous + 1, "Independent rendering or input stopped while chooser waited")
        let result = task.GetAwaiter().GetResult()
        let expected = if testCase == "failed" { FileDialogStatus.Failed } else if testCase == "large" { FileDialogStatus.TooLarge }
        else if testCase == "cancel" || testCase == "cancel-api" || testCase == "owner-close" { FileDialogStatus.Cancelled } else { FileDialogStatus.Success }
        Require(result.Status == expected, "Unexpected " + testCase + " result: " + result.Status.ToString() + " " + result.Error)
        if expected == FileDialogStatus.Success {
          Require(result.Paths.Count == (if testCase == "open" { 2 } else { 1 }), "Chooser result path count differs")
          Require(result.Paths[0] == "/tmp/one two" && result.FilterIndex == -1, "Chooser did not own decoded absolute paths")
        }
        if testCase == "owner-close" {
          for i in 0 ... 20 { if owner.IsOpen { owner.Pump(0.016) } }
          Require(!owner.IsOpen && other.IsOpen, "Closing chooser owner did not close only its own window")
        } else { Require(owner.PlatformInput.Editor != nil, "Owner focus was not restored") }
        Console.WriteLine("file-dialog-native: " + testCase + "=pass other-frames=" + frames.ToString())
      }
    }
  } finally {
    owner.RequestClose()
    other.RequestClose()
    OwnershipSettle([]Window{owner, other})
  }
  Console.WriteLine("file-dialog-native: complete=pass")
}
