package GooAsyncReadbackSmoke

import Goo
import Hexa.NET.SDL3
import System
import System.Threading

class OwnershipAccessibility : AccessibilityAdapter {
  internal var Root AccessibilityNode?
  public func Update(tree AccessibilityTree) { Root = tree.Root }
}

func OwnershipSettle(windows []Window) {
  for frame in 0 ... 12 {
    for window in windows { if window.IsOpen { WindowReadbackTestFixture.ForceRender(window, 0.016) } }
    Thread.Sleep(5)
  }
}

unsafe func RunWindowOwnershipSmoke() {
  let root = NativeInputAcceptanceCell{}
  let owner = Window{Title: "Goo owner", Width: 340, Height: 200, Root: root}.Open()
  let semantics = OwnershipAccessibility{}
  owner.AccessibilityAdapter = semantics
  let modeless = Window{Title: "Goo modeless", Width: 240, Height: 160, Owner: owner, Root: NativeInputAcceptanceCell{}}.Open()
  let modal = Window{Title: "Goo modal", Width: 320, Height: 200, Owner: owner, Modal: true, Root: NativeInputAcceptanceCell{}}
  let nested = Window{Title: "Goo nested", Width: 260, Height: 160, Owner: modal, Modal: true, Root: NativeInputAcceptanceCell{}}
  try {
    OwnershipSettle([]Window{owner, modeless})
    guard let semanticRoot = semantics.Root else { throw InvalidOperationException("Owner semantics are missing") }
    let button = semanticRoot.Children[0]
    Require(!owner.IsInputBlocked, "Modeless ownership blocked its owner")
    Require(root.Entry.Focus(), "Could not focus the owner's editor")
    modal.Open()
    OwnershipSettle([]Window{owner, modeless, modal})
    let ownerId = WindowReadbackTestFixture.SdlWindowId(owner)
    let modalNative = SDL.GetWindowFromID(WindowReadbackTestFixture.SdlWindowId(modal))
    let modelessNative = SDL.GetWindowFromID(WindowReadbackTestFixture.SdlWindowId(modeless))
    Require(SDL.GetWindowID(SDL.GetWindowParent(modalNative)) == ownerId
        && SDL.GetWindowID(SDL.GetWindowParent(modelessNative)) == ownerId, "SDL native parent differs from Owner")
    Require(owner.IsInputBlocked && !root.Entry.Focus(), "Modal owner focus remained interactive")
    Require(button.Disabled && button.Actions.Count == 0, "Owner semantics remained enabled while modal")
    var blocked = false
    try { owner.PlatformInput.CommitText("blocked") } catch (_ InvalidOperationException) { blocked = true }
    Require(blocked && root.CommittedText == "", "Platform input bypassed modality")
    Require(NativeInputPushPointerPair(ownerId, 40.0F, 40.0F) == 2, "SDL owner injection failed")
    OwnershipSettle([]Window{owner, modeless, modal})
    Require(root.PointerCount == 0, "Native events activated the blocked owner")
    var immutable = false
    try { modal.Owner = nil } catch (_ InvalidOperationException) { immutable = true }
    Require(immutable, "Open ownership could change")
    nested.Open()
    OwnershipSettle([]Window{owner, modeless, modal, nested})
    Require(modal.IsInputBlocked && owner.IsInputBlocked, "Nested modality lost the owner chain")
    nested.RequestClose()
    OwnershipSettle([]Window{owner, modeless, modal, nested})
    Require(!nested.IsOpen && !modal.IsInputBlocked && owner.IsInputBlocked, "Closing nested modal unblocked the wrong owner")
    modal.RequestClose()
    OwnershipSettle([]Window{owner, modeless, modal})
    Require(!modal.IsOpen && !owner.IsInputBlocked && owner.PlatformInput.Editor != nil, "Owner focus was not restored after modal close")
    Require(!button.Disabled && button.Actions.Count > 0, "Owner semantics remained blocked after modal close")
    Require(NativeInputPushPointerPair(ownerId, 40.0F, 40.0F) == 2, "SDL owner reinjection failed")
    OwnershipSettle([]Window{owner, modeless})
    Require(root.PointerCount == 1, "Owner remained blocked after modal close")
    owner.State = WindowState.Minimized
    OwnershipSettle([]Window{owner, modeless})
    owner.State = WindowState.Normal
    OwnershipSettle([]Window{owner, modeless})
    Require(owner.IsOpen && modeless.IsOpen && SDL.GetWindowID(SDL.GetWindowParent(modelessNative)) == ownerId,
      "Owner state changes lost the native relationship")
    modeless.OnClosing = () -> false
    owner.RequestClose()
    OwnershipSettle([]Window{owner, modeless})
    Require(!owner.IsOpen && !modeless.IsOpen, "Owner close left an owned native window alive")
    Console.WriteLine("window-ownership: native_parent/modeless/modal/nested/input_block/focus_restore/minimize/owner_close=pass")
  } finally {
    nested.RequestClose()
    modal.RequestClose()
    owner.RequestClose()
    modeless.RequestClose()
    OwnershipSettle([]Window{nested, modal, owner, modeless})
  }
}
