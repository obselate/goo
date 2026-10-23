package GooPackageSmoke

import Goo
import System

class NativePopupSmokeCell : Cell {
  internal var Host Window?
  private let context Context[bool] = Context[bool]()
  internal var Attached Action[Window]?

  override func Build() Blob {
    Host = context.Window
    let attached = Attached
    Attached = nil
    attached?.Invoke(Host!!)
    return Container{ Width: Percent(100), Height: Percent(100), BackgroundColor: Color.Rgb(40, 160, 80) }
  }
}

func RunNativePopupSmoke(kind PopupKind = PopupKind.Tooltip) {
  let owner = Window{ Title: "Native popup presentation", Width: 320, Height: 200, Root: Cell{} }.Open()
  let root = NativePopupSmokeCell{}
  using let popup = PopupWindow(owner, root, kind)
  var completed = false
  var opened = false
  root.Attached = shown -> {
    shown.PresentationAccepted += _ -> {
      if shown.X + shown.Width <= owner.Width && shown.Y + shown.Height <= owner.Height {
        throw InvalidOperationException("The native popup did not extend outside its owner")
      }
      if kind == PopupKind.Menu && !shown.IsFocused {
        throw InvalidOperationException("The native popup menu did not receive keyboard focus")
      }
      if completed { return }
      completed = true
      popup.Close()
      owner.RequestClose()
    }
  }
  owner.PresentationAccepted += _ -> {
    if opened { return }
    opened = true
    let result = popup.Open(ElementRect{ X: 290.0, Y: 170.0, Width: 20.0, Height: 20.0 }, 120, 80)
    if result.Status != PopupStatus.Opened { throw InvalidOperationException("Native popup failed: " + result.Error) }
  }
  owner.SetTimeout(() -> { throw InvalidOperationException("Native popup presentation timed out") }, 15000.0)
  owner.Run()
  if !completed || popup.IsOpen { throw InvalidOperationException("Native popup did not present and retire") }
  Console.WriteLine("native-popup: owner_presented=passed popup_presented=passed outside_bounds=passed teardown=passed")
}
